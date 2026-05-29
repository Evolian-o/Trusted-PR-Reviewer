import os
from collections.abc import AsyncIterator
from openai import AsyncOpenAI
from .base import BaseLLMProvider, ReviewPrompt

DOUBAO_API_URL = "https://ark.cn-beijing.volces.com/api/v3"


class DoubaoProvider(BaseLLMProvider):
    """豆包 Seed 模型 — 通过 openai SDK 调用火山引擎 /responses 端点"""

    def __init__(self):
        self._name = "doubao"
        self._base_url = DOUBAO_API_URL
        self._api_key = os.environ.get("DOUBAO_API_KEY", "")
        self._default_model = "doubao-seed-2-0-pro-260215"
        self._timeout = 120.0
        self.is_builtin = True

    @property
    def name(self) -> str:
        return self._name

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
            raise RuntimeError("未配置 doubao 的 API Key")

        actual_model = model or self._default_model
        print(
            f"[doubao] 发送 API 请求 → URL={self._base_url}/responses  model={actual_model}",
            flush=True,
        )

        client = AsyncOpenAI(
            base_url=self._base_url,
            api_key=self._api_key,
            timeout=self._timeout,
            max_retries=0,
        )

        try:
            stream = await client.responses.create(
                model=actual_model,
                instructions=prompt.system,
                input=prompt.user,
                stream=True,
            )
            async for event in stream:
                if hasattr(event, "type") and event.type == "response.output_text.delta":
                    if hasattr(event, "delta") and event.delta:
                        yield event.delta
        except Exception as e:
            msg = str(e).strip() or type(e).__name__
            raise RuntimeError(f"doubao 调用失败: {msg}") from e

    async def health_check(self) -> bool:
        if not self._api_key:
            return False
        try:
            client = AsyncOpenAI(
                base_url=self._base_url,
                api_key=self._api_key,
                timeout=10.0,
                max_retries=0,
            )
            await client.models.list()
            return True
        except Exception:
            return False

    async def list_models(self) -> list[str]:
        if not self._api_key:
            return [self._default_model]
        try:
            client = AsyncOpenAI(
                base_url=self._base_url,
                api_key=self._api_key,
                timeout=10.0,
                max_retries=0,
            )
            models = await client.models.list()
            return [m.id for m in models.data]
        except Exception:
            return [self._default_model]

    def __repr__(self) -> str:
        masked = ""
        if self._api_key:
            k = self._api_key
            masked = k[:4] + "••••" + k[-4:] if len(k) > 8 else "••••"
        return f"<{self._name} base={self._base_url} key={masked}>"
