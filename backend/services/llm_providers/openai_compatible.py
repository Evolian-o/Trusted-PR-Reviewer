import json
import asyncio
import logging
import ssl
import aiohttp
from collections.abc import AsyncIterator
from .base import BaseLLMProvider, ReviewPrompt, TokenUsage

logger = logging.getLogger(__name__)


class OpenAICompatibleProvider(BaseLLMProvider):
    """通用 OpenAI 兼容提供商 — 一套代码适配所有 /v1/chat/completions 接口"""

    def __init__(
        self,
        name: str,
        base_url: str,
        api_key: str,
        default_model: str,
        timeout: int = 120,
        is_builtin: bool = False,
    ):
        self._name = name
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._default_model = default_model
        self._timeout = timeout
        self.is_builtin = is_builtin

    @property
    def name(self) -> str:
        return self._name

    @property
    def base_url(self) -> str:
        return self._base_url

    @property
    def default_model(self) -> str:
        return self._default_model

    @property
    def has_api_key(self) -> bool:
        return bool(self._api_key)

    async def review(
        self, prompt: ReviewPrompt, *, model: str | None = None
    ) -> AsyncIterator[str]:
        if not self._api_key:
            raise RuntimeError(f"未配置 {self._name} 的 API Key")

        actual_model = model or self._default_model
        logger.info(f"[{self._name}] API 请求 → model={actual_model}")
        payload = {
            "model": actual_model,
            "messages": [
                {"role": "system", "content": prompt.system},
                {"role": "user", "content": prompt.user},
            ],
            "stream": True,
        }
        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }
        output_chars = 0
        api_usage: dict | None = None
        rate_limit_remaining: int | None = None
        timeout = aiohttp.ClientTimeout(total=self._timeout, sock_read=self._timeout)
        try:
            connector = aiohttp.TCPConnector(ssl=False)
            async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
                async with session.post(
                    f"{self._base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                ) as resp:
                    resp.raise_for_status()
                    # 检查速率限制响应头
                    rl_remaining = resp.headers.get("x-ratelimit-remaining-requests") or resp.headers.get("x-ratelimit-remaining-tokens")
                    if rl_remaining is not None:
                        try:
                            rate_limit_remaining = int(rl_remaining)
                        except ValueError:
                            pass
                    async for line in resp.content:
                        line = line.decode("utf-8").strip()
                        if not line or not line.startswith("data:"):
                            continue
                        data_str = line[5:].strip()
                        if data_str == "[DONE]":
                            break
                        try:
                            chunk = json.loads(data_str)
                            choices = chunk.get("choices", [])
                            if choices:
                                delta = choices[0].get("delta", {})
                                content = delta.get("content")
                                if content:
                                    output_chars += len(content)
                                    yield content
                            # 最后一个 chunk 可能包含 usage 信息
                            if "usage" in chunk:
                                api_usage = chunk["usage"]
                        except json.JSONDecodeError:
                            continue
        except asyncio.TimeoutError:
            raise RuntimeError(f"{self._name} API 超时（{self._timeout}秒）") from None
        except aiohttp.ClientError as e:
            msg = str(e).strip() or f"{type(e).__name__}"
            raise RuntimeError(f"{self._name} 网络错误: {msg}") from e
        except Exception as e:
            msg = str(e).strip() or f"{type(e).__name__}"
            raise RuntimeError(f"{self._name} 调用异常: {msg}") from e
        finally:
            input_chars = len(prompt.system) + len(prompt.user)
            input_tokens = max(1, round(input_chars / 3.5))
            output_tokens = max(1, round(output_chars / 3.5)) if output_chars > 0 else 0
            if api_usage and "prompt_tokens" in api_usage and "completion_tokens" in api_usage:
                input_tokens = api_usage["prompt_tokens"]
                output_tokens = api_usage["completion_tokens"]
            prompt.usage = TokenUsage(
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                rate_limit_remaining=rate_limit_remaining,
            )
            if rate_limit_remaining is not None and rate_limit_remaining < 10:
                logger.warning(f"[{self._name}] 速率限制余量不足: 剩余 {rate_limit_remaining}")

    async def health_check(self) -> bool:
        if not self._api_key:
            return False
        try:
            headers = {"Authorization": f"Bearer {self._api_key}"}
            timeout = aiohttp.ClientTimeout(total=10)
            connector = aiohttp.TCPConnector(ssl=False)
            async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
                async with session.get(
                    f"{self._base_url}/models", headers=headers
                ) as resp:
                    return resp.status == 200
        except aiohttp.ClientError:
            return False

    async def list_models(self) -> list[str]:
        """从 /models 端点获取可用模型列表"""
        if not self._api_key:
            return [self._default_model]
        try:
            headers = {"Authorization": f"Bearer {self._api_key}"}
            timeout = aiohttp.ClientTimeout(total=10)
            connector = aiohttp.TCPConnector(ssl=False)
            async with aiohttp.ClientSession(timeout=timeout, connector=connector) as session:
                async with session.get(
                    f"{self._base_url}/models", headers=headers
                ) as resp:
                    if resp.status != 200:
                        return [self._default_model]
                    data = await resp.json()
                    models = data.get("data", [])
                    return [m["id"] for m in models if "id" in m]
        except Exception:
            return [self._default_model]

    def __repr__(self) -> str:
        masked = ""
        if self._api_key:
            k = self._api_key
            masked = k[:4] + "••••" + k[-4:] if len(k) > 8 else "••••"
        return f"<{self._name} base={self._base_url} key={masked}>"
