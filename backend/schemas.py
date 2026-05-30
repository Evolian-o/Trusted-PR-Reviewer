"""Pydantic 请求模型 — shared by main.py and routers"""

from pydantic import BaseModel


class MergeBody(BaseModel):
    merge_method: str = "merge"


class MonitorBody(BaseModel):
    owner: str
    repo: str


class CreatePRBody(BaseModel):
    title: str
    head: str
    base: str = "main"


class CustomProviderBody(BaseModel):
    name: str
    display_name: str
    base_url: str
    api_key: str
    default_model: str = ""
    timeout: int = 120


class CustomProviderUpdateBody(BaseModel):
    display_name: str | None = None
    base_url: str | None = None
    api_key: str | None = None
    default_model: str | None = None
    timeout: int | None = None
    is_enabled: bool | None = None


class ProviderTestBody(BaseModel):
    base_url: str | None = None
    api_key: str | None = None
    default_model: str | None = None


class SettingsBody(BaseModel):
    poll_interval_seconds: int | None = None
    default_provider: str | None = None
    default_model: str | None = None
    chunk_max_chars: int | None = None
    chunk_merge_max_chars: int | None = None
    chunk_max_lines: int | None = None
    chunk_strategy: str | None = None
    email: dict | None = None


class EmailTestBody(BaseModel):
    to_email: str
    password: str
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
