import os
from .openai_compatible import OpenAICompatibleProvider

OPENAI_API_URL = "https://api.openai.com/v1"


class OpenAIProvider(OpenAICompatibleProvider):
    def __init__(self):
        super().__init__(
            name="openai",
            base_url=OPENAI_API_URL,
            api_key=os.environ.get("OPENAI_API_KEY", ""),
            default_model="gpt-4o-mini",
            timeout=120,
            is_builtin=True,
        )
