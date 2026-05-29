"""API Key 简单混淆 — 防止明文存储和日志泄露。安全级别：防君子不防小人。"""
import os
import base64


def _secret() -> str:
    return os.environ.get("ENCRYPTION_SECRET", "trusted-pr-reviewer-default-secret-2026")


def encrypt(plain: str) -> str:
    """XOR + base64 编码混淆"""
    key = _secret()
    encoded = bytes(ord(c) ^ ord(key[i % len(key)]) for i, c in enumerate(plain))
    return base64.urlsafe_b64encode(encoded).decode()


def decrypt(encoded: str) -> str:
    """base64 解码 + XOR 还原"""
    key = _secret()
    try:
        decoded = base64.urlsafe_b64decode(encoded.encode())
    except Exception:
        return ""
    return "".join(chr(b ^ ord(key[i % len(key)])) for i, b in enumerate(decoded))
