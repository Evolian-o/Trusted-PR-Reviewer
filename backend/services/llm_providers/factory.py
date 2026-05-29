import os
from .base import BaseLLMProvider
from .ollama import OllamaProvider

_providers: dict[str, BaseLLMProvider] = {}


def _register_defaults():
    if "ollama" not in _providers:
        _providers["ollama"] = OllamaProvider()

    if "doubao" not in _providers and os.environ.get("DOUBAO_API_KEY"):
        from .doubao import DoubaoProvider
        _providers["doubao"] = DoubaoProvider()

    if "openai" not in _providers and os.environ.get("OPENAI_API_KEY"):
        from .openai import OpenAIProvider
        _providers["openai"] = OpenAIProvider()

    if "deepseek" not in _providers and os.environ.get("DEEPSEEK_API_KEY"):
        from .deepseek import DeepSeekProvider
        _providers["deepseek"] = DeepSeekProvider()



def get_provider(name: str) -> BaseLLMProvider:
    _register_defaults()
    name = name.lower()
    if name not in _providers:
        available = ", ".join(_providers.keys())
        raise ValueError(f"未知 Provider: {name}，可用: {available}")
    return _providers[name]


def register_provider(name: str, provider: BaseLLMProvider):
    _providers[name.lower()] = provider


def list_providers() -> list[str]:
    _register_defaults()
    return list(_providers.keys())
