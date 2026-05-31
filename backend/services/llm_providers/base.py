from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field


@dataclass
class TokenUsage:
    input_tokens: int = 0
    output_tokens: int = 0
    rate_limit_remaining: int | None = None


@dataclass
class ReviewPrompt:
    system: str
    user: str
    usage: TokenUsage | None = field(default=None)


class BaseLLMProvider(ABC):
    @property
    @abstractmethod
    def name(self) -> str: ...

    @property
    def default_model(self) -> str:
        return getattr(self, "_default_model", "")

    @property
    def has_api_key(self) -> bool:
        return True

    @abstractmethod
    async def review(
        self, prompt: ReviewPrompt, *, model: str | None = None
    ) -> AsyncIterator[str]: ...

    @abstractmethod
    async def health_check(self) -> bool: ...

    async def list_models(self) -> list[str]:
        return [self.default_model] if self.default_model else []
