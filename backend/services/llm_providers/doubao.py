import os
from .openai_compatible import OpenAICompatibleProvider

DOUBAO_API_URL = "https://ark.cn-beijing.volces.com/api/v3"


class DoubaoProvider(OpenAICompatibleProvider):
    def __init__(self):
        super().__init__(
            name="doubao",
            base_url=DOUBAO_API_URL,
            api_key=os.environ.get("DOUBAO_API_KEY", ""),
            default_model="doubao-seed-2-0-pro-260215",
            timeout=120,
            is_builtin=True,
        )
