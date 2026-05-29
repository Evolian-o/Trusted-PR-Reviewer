from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass


@dataclass
class ReviewPrompt:
    system: str
    user: str


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
