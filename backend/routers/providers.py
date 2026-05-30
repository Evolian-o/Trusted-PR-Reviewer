"""LLM 提供商管理端点 — 列表/模型/CURD/测试"""

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from schemas import CustomProviderBody, CustomProviderUpdateBody, ProviderTestBody
from services.auth_middleware import require_auth, optional_auth
from services.auth import AuthInfo
from services.llm_providers.factory import (
    get_provider, list_providers_with_meta, load_custom_providers,
    register_custom_provider, unregister_custom_provider, is_builtin,
)
from services.llm_providers.crypto import encrypt, decrypt
from services.database import (
    get_custom_provider as db_get_custom_provider,
    create_custom_provider as db_create_custom_provider,
    update_custom_provider as db_update_custom_provider,
    delete_custom_provider as db_delete_custom_provider,
)

router = APIRouter()


@router.get("/api/providers")
async def providers(auth: AuthInfo | None = Depends(optional_auth)):
    user_id = auth.user_id if auth else 0
    if user_id:
        await load_custom_providers(user_id)
    return {"providers": list_providers_with_meta()}


@router.get("/api/providers/{name}/models")
async def provider_models(name: str, auth: AuthInfo | None = Depends(optional_auth)):
    user_id = auth.user_id if auth else 0
    if user_id:
        await load_custom_providers(user_id)
    try:
        provider = get_provider(name, user_id=user_id)
    except ValueError:
        return JSONResponse(content={"error": f"未知提供商: {name}"}, status_code=404)

    if hasattr(provider, "list_models"):
        models = await provider.list_models()
        return {"models": models}
    return {"models": []}


@router.post("/api/providers/custom")
async def provider_create(body: CustomProviderBody, auth: AuthInfo = Depends(require_auth)):
    name = body.name.strip().lower()
    if not name:
        return JSONResponse(content={"error": "name 不能为空"}, status_code=400)
    if is_builtin(name):
        return JSONResponse(content={"error": f"'{name}' 是内置提供商，不能覆盖"}, status_code=409)

    display_name = body.display_name.strip()
    base_url = body.base_url.strip()
    api_key = body.api_key.strip()
    default_model = body.default_model.strip()

    if not display_name or not base_url or not api_key:
        return JSONResponse(content={"error": "display_name / base_url / api_key 为必填"}, status_code=400)

    existing = await db_get_custom_provider(auth.user_id, name)
    if existing:
        return JSONResponse(content={"error": f"'{name}' 已存在"}, status_code=409)

    api_key_enc = encrypt(api_key)
    row_data = {
        "name": name,
        "display_name": display_name,
        "base_url": base_url,
        "api_key_enc": api_key_enc,
        "default_model": default_model,
        "timeout": body.timeout,
    }
    await db_create_custom_provider(auth.user_id, row_data)

    from services.llm_providers.openai_compatible import OpenAICompatibleProvider
    provider = OpenAICompatibleProvider(
        name=name, base_url=base_url, api_key=api_key,
        default_model=default_model,
        timeout=body.timeout,
        is_builtin=False,
    )
    register_custom_provider(auth.user_id, name, provider)
    return {"status": "ok", "name": name}


@router.put("/api/providers/custom/{name}")
async def provider_update(name: str, body: CustomProviderUpdateBody, auth: AuthInfo = Depends(require_auth)):
    if is_builtin(name):
        return JSONResponse(content={"error": f"'{name}' 是内置提供商，不可修改"}, status_code=403)

    existing = await db_get_custom_provider(auth.user_id, name)
    if not existing:
        return JSONResponse(content={"error": f"'{name}' 不存在"}, status_code=404)

    data = body.model_dump(exclude_none=True)
    if "api_key" in data:
        data["api_key_enc"] = encrypt(data.pop("api_key"))

    updates = {k: v for k, v in data.items() if k in ("display_name", "base_url", "default_model", "timeout", "is_enabled", "api_key_enc")}
    if updates:
        await db_update_custom_provider(auth.user_id, name, updates)

    unregister_custom_provider(name, user_id=auth.user_id)
    from services.llm_providers.openai_compatible import OpenAICompatibleProvider
    row = await db_get_custom_provider(auth.user_id, name)
    if row and row.get("is_enabled"):
        api_key = decrypt(row["api_key_enc"])
        provider = OpenAICompatibleProvider(
            name=name, base_url=row["base_url"], api_key=api_key,
            default_model=row.get("default_model", ""),
            timeout=row.get("timeout", 120),
            is_builtin=False,
        )
        register_custom_provider(auth.user_id, name, provider)

    return {"status": "ok"}


@router.delete("/api/providers/custom/{name}")
async def provider_delete(name: str, auth: AuthInfo = Depends(require_auth)):
    if is_builtin(name):
        return JSONResponse(content={"error": f"'{name}' 是内置提供商，不可删除"}, status_code=403)

    deleted = await db_delete_custom_provider(auth.user_id, name)
    if not deleted:
        return JSONResponse(content={"error": f"'{name}' 不存在"}, status_code=404)

    unregister_custom_provider(name, user_id=auth.user_id)
    return {"status": "ok"}


@router.post("/api/providers/custom/{name}/test")
async def provider_test(name: str, body: ProviderTestBody | None = None, auth: AuthInfo = Depends(require_auth)):
    from services.llm_providers.openai_compatible import OpenAICompatibleProvider

    if is_builtin(name):
        try:
            provider = get_provider(name)
        except ValueError:
            return {"ok": False, "error": f"'{name}' 未配置 API Key"}
    else:
        if body and (body.api_key or body.base_url):
            api_key = body.api_key or ""
            base_url = body.base_url or ""
        else:
            row = await db_get_custom_provider(auth.user_id, name)
            if not row:
                return {"ok": False, "error": f"'{name}' 不存在"}
            api_key = decrypt(row["api_key_enc"])
            base_url = row["base_url"]

        provider = OpenAICompatibleProvider(
            name=name, base_url=base_url, api_key=api_key,
            default_model="", is_builtin=False,
        )

    ok = await provider.health_check()
    return {"ok": ok} if ok else {"ok": False, "error": "连接失败"}
