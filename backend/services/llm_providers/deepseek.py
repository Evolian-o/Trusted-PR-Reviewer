import os
from .openai_compatible import OpenAICompatibleProvider

DEEPSEEK_API_URL = "https://api.deepseek.com/v1"


class DeepSeekProvider(OpenAICompatibleProvider):
    def __init__(self):
        super().__init__(
            name="deepseek",
            base_url=DEEPSEEK_API_URL,
            api_key=os.environ.get("DEEPSEEK_API_KEY", ""),
            default_model="deepseek-chat",
            timeout=300,
            is_builtin=True,
        )
