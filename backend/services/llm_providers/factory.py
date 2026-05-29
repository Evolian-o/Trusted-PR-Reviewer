import os
from .base import BaseLLMProvider
from .ollama import OllamaProvider
from .openai_compatible import OpenAICompatibleProvider

_providers: dict[str, BaseLLMProvider] = {}       # 内置供应商
_custom_providers: dict[str, OpenAICompatibleProvider] = {}  # 用户自定义
_builtin_names: set[str] = {"ollama", "deepseek", "doubao", "openai"}

_custom_loaded_for_user: int | None = None  # 已加载自定义提供商的用户 ID


def _register_defaults():
    """注册有 API Key 的内置供应商（同步，只用环境变量）"""
    if "ollama" not in _providers:
        _providers["ollama"] = OllamaProvider()

    if "deepseek" not in _providers and os.environ.get("DEEPSEEK_API_KEY"):
        from .deepseek import DeepSeekProvider
        _providers["deepseek"] = DeepSeekProvider()

    if "doubao" not in _providers and os.environ.get("DOUBAO_API_KEY"):
        from .doubao import DoubaoProvider
        _providers["doubao"] = DoubaoProvider()

    if "openai" not in _providers and os.environ.get("OPENAI_API_KEY"):
        from .openai import OpenAIProvider
        _providers["openai"] = OpenAIProvider()


async def load_custom_providers(user_id: int):
    """从 DB 加载用户的自定义供应商"""
    global _custom_providers, _custom_loaded_for_user

    # 如果已是同一用户，跳过重复加载
    if _custom_loaded_for_user == user_id:
        return

    # 清除旧用户的自定义供应商
    _custom_providers.clear()
    _custom_loaded_for_user = user_id

    from services.database import list_custom_providers as db_list
    from .crypto import decrypt

    rows = await db_list(user_id)
    for row in rows:
        if not row.get("is_enabled"):
            continue
        api_key = decrypt(row["api_key_enc"])
        provider = OpenAICompatibleProvider(
            name=row["name"],
            base_url=row["base_url"],
            api_key=api_key,
            default_model=row.get("default_model", ""),
            timeout=row.get("timeout", 120),
            is_builtin=False,
        )
        _custom_providers[row["name"]] = provider


def register_custom_provider(name: str, provider: OpenAICompatibleProvider):
    """注册自定义供应商到内存"""
    _custom_providers[name] = provider


def unregister_custom_provider(name: str) -> bool:
    """从内存移除自定义供应商"""
    if name in _custom_providers:
        del _custom_providers[name]
        return True
    return False


def get_provider(name: str) -> BaseLLMProvider:
    """获取供应商 — 先查内置，再查自定义"""
    _register_defaults()
    name = name.lower()
    if name in _providers:
        return _providers[name]
    if name in _custom_providers:
        return _custom_providers[name]
    available = list(_providers.keys()) + list(_custom_providers.keys())
    raise ValueError(f"未知 Provider: {name}，可用: {', '.join(available) if available else '(无)'}")


def get_provider_info(name: str) -> dict | None:
    """获取单个供应商的元数据"""
    try:
        p = get_provider(name)
    except ValueError:
        return None

    is_builtin = name in _builtin_names
    info: dict = {
        "name": p.name,
        "display_name": _display_name(p.name, is_builtin),
        "is_builtin": is_builtin,
        "is_enabled": True,
        "default_model": getattr(p, "default_model", ""),
        "needs_config": name == "ollama" or any(
            name == n and not getattr(p, "has_api_key", True)
            for n in _providers
        ) if is_builtin else False,
        "models": [],
    }
    return info


def list_providers() -> list[str]:
    """返回所有供应商名称列表（兼容旧接口）"""
    _register_defaults()
    return list(_providers.keys()) + list(_custom_providers.keys())


def list_providers_with_meta() -> list[dict]:
    """返回所有供应商的元数据列表"""
    _register_defaults()
    result = []

    for name, p in {**_providers, **_custom_providers}.items():
        result.append({
            "name": p.name,
            "display_name": _display_name(p.name, name in _builtin_names),
            "is_builtin": name in _builtin_names,
            "is_enabled": True,
            "default_model": getattr(p, "default_model", ""),
            "needs_config": not getattr(p, "has_api_key", True) if name in _builtin_names else False,
            "models": [],
        })

    return result


def is_builtin(name: str) -> bool:
    return name.lower() in _builtin_names


def _display_name(name: str, is_builtin: bool) -> str:
    names = {
        "ollama": "Ollama (本地)",
        "deepseek": "DeepSeek (在线)",
        "doubao": "豆包 (在线)",
        "openai": "OpenAI (在线)",
    }
    if name in names:
        return names[name]
    return name if not is_builtin else name
