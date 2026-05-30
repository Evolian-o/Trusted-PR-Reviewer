import json
import asyncio
import logging
import aiohttp
from collections.abc import AsyncIterator
from .base import BaseLLMProvider, ReviewPrompt

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
        timeout = aiohttp.ClientTimeout(total=self._timeout, sock_read=self._timeout)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{self._base_url}/chat/completions",
                    json=payload,
                    headers=headers,
                ) as resp:
                    resp.raise_for_status()
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
                                    yield content
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

    async def health_check(self) -> bool:
        if not self._api_key:
            return False
        try:
            headers = {"Authorization": f"Bearer {self._api_key}"}
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
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
            async with aiohttp.ClientSession(timeout=timeout) as session:
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
