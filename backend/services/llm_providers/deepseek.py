import os
import json
import aiohttp
from collections.abc import AsyncIterator
from .base import BaseLLMProvider, ReviewPrompt

DEEPSEEK_API_URL = "https://api.deepseek.com/v1"


class DeepSeekProvider(BaseLLMProvider):
    def __init__(self, default_model: str = "deepseek-chat"):
        self._default_model = default_model
        self._api_key = os.environ.get("DEEPSEEK_API_KEY", "")

    @property
    def name(self) -> str:
        return "deepseek"

    async def review(
        self, prompt: ReviewPrompt, *, model: str | None = None
    ) -> AsyncIterator[str]:
        if not self._api_key:
            raise RuntimeError("未配置 DEEPSEEK_API_KEY 环境变量")

        payload = {
            "model": model or self._default_model,
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
        timeout = aiohttp.ClientTimeout(total=120)
        try:
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.post(
                    f"{DEEPSEEK_API_URL}/chat/completions",
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
                                if "content" in delta:
                                    yield delta["content"]
                        except json.JSONDecodeError:
                            continue
        except aiohttp.ClientError as e:
            raise RuntimeError(f"DeepSeek 网络错误: {e}") from e
        except Exception as e:
            raise RuntimeError(f"DeepSeek 调用异常: {type(e).__name__}: {e}") from e

    async def health_check(self) -> bool:
        if not self._api_key:
            return False
        try:
            headers = {"Authorization": f"Bearer {self._api_key}"}
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.get(
                    f"{DEEPSEEK_API_URL}/models", headers=headers
                ) as resp:
                    return resp.status == 200
        except aiohttp.ClientError:
            return False
