import json
import asyncio
import aiohttp
from collections.abc import AsyncIterator
from .base import BaseLLMProvider, ReviewPrompt

OLLAMA_BASE = "http://localhost:11434"
OLLAMA_API = f"{OLLAMA_BASE}/api"


class OllamaProvider(BaseLLMProvider):
    def __init__(self, default_model: str = "qwen3.5:latest"):
        self._default_model = default_model

    @property
    def name(self) -> str:
        return "ollama"

    async def review(
        self, prompt: ReviewPrompt, *, model: str | None = None
    ) -> AsyncIterator[str]:
        model_name = model or self._default_model
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": prompt.system},
                {"role": "user", "content": prompt.user},
            ],
            "stream": True,
        }
        timeout = aiohttp.ClientTimeout(total=600)  # 10 分钟，首次请求需要模型加载时间
        try:
            async with aiohttp.ClientSession(timeout=timeout, connector=aiohttp.TCPConnector(ssl=False)) as session:
                async with session.post(f"{OLLAMA_API}/chat", json=payload) as resp:
                    resp.raise_for_status()
                    async for line in resp.content:
                        line = line.decode("utf-8").strip()
                        if not line:
                            continue
                        try:
                            chunk = json.loads(line)
                            if "message" in chunk:
                                token = chunk["message"].get("content", "")
                                if token:  # 跳过空 token，避免输出污染
                                    yield token
                        except json.JSONDecodeError:
                            continue
        except asyncio.TimeoutError:
            raise RuntimeError("Ollama API 超时（600秒），模型冷启动可能未完成") from None
        except aiohttp.ClientError as e:
            msg = str(e).strip() or f"{type(e).__name__}(无详细错误信息)"
            raise RuntimeError(f"Ollama 网络错误: {msg}") from e
        except Exception as e:
            msg = str(e).strip() or f"{type(e).__name__}(无详细错误信息)"
            raise RuntimeError(f"Ollama 调用异常: {msg}") from e

    async def health_check(self) -> bool:
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout, connector=aiohttp.TCPConnector(ssl=False)) as session:
                async with session.get(f"{OLLAMA_BASE}/api/tags") as resp:
                    return resp.status == 200
        except aiohttp.ClientError:
            return False
