import json
import aiohttp
from collections.abc import AsyncIterator
from .base import BaseLLMProvider, ReviewPrompt

OLLAMA_API = "http://localhost:11434/api"


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
        async with aiohttp.ClientSession() as session:
            async with session.post(f"{OLLAMA_API}/chat", json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.content:
                    line = line.decode("utf-8").strip()
                    if not line:
                        continue
                    try:
                        chunk = json.loads(line)
                        if "message" in chunk and "content" in chunk["message"]:
                            yield chunk["message"]["content"]
                    except json.JSONDecodeError:
                        continue

    async def health_check(self) -> bool:
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get("http://localhost:11434/api/tags") as resp:
                    return resp.status == 200
        except Exception:
            return False
