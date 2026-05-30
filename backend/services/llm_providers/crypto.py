"""API Key 加密 — Fernet AES-128-CBC + HMAC (cryptography 库)"""
import os
import base64

from cryptography.fernet import Fernet, InvalidToken


_FALLBACK_XOR_KEY = "trusted-pr-reviewer-default-secret-2026"


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
    # 兼容升级前的旧 XOR 加密数据
    try:
        decoded = base64.urlsafe_b64decode(encoded.encode())
        return "".join(
            chr(b ^ ord(_FALLBACK_XOR_KEY[i % len(_FALLBACK_XOR_KEY)]))
            for i, b in enumerate(decoded)
        )
    except Exception:
        return ""
