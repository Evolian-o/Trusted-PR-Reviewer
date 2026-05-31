"""API Key 加密 — Fernet AES-128-CBC + HMAC (cryptography 库)"""
import os
import base64
import logging

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_FALLBACK_XOR_KEY = os.environ.get("ENCRYPTION_LEGACY_KEY", "")


def _get_fernet() -> Fernet:
    secret = os.environ.get("ENCRYPTION_SECRET", "")
    if not secret:
        raise RuntimeError("ENCRYPTION_SECRET 环境变量未设置")
    return Fernet(secret.encode())


def encrypt(plain: str) -> str:
    if not plain:
        return ""
    return _get_fernet().encrypt(plain.encode()).decode()


def decrypt(encoded: str) -> str:
    if not encoded:
        return ""
    try:
        return _get_fernet().decrypt(encoded.encode()).decode()
    except (InvalidToken, RuntimeError):
        pass
    # 兼容升级前的旧 XOR 加密数据（需要设置 ENCRYPTION_LEGACY_KEY）
    if not _FALLBACK_XOR_KEY:
        logger.warning("检测到旧版 XOR 加密数据但未设置 ENCRYPTION_LEGACY_KEY，请重新保存自定义提供商以迁移到 Fernet 加密")
        return ""
    try:
        decoded = base64.urlsafe_b64decode(encoded.encode())
        logger.warning("使用旧版 XOR 解密，建议重新保存自定义提供商")
        return "".join(
            chr(b ^ ord(_FALLBACK_XOR_KEY[i % len(_FALLBACK_XOR_KEY)]))
            for i, b in enumerate(decoded)
        )
    except Exception:
        return ""
