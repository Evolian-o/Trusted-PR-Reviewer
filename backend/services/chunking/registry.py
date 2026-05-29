"""语言注册表：tree-sitter parser + AST 节点类型 + 正则兜底模式"""

from tree_sitter import Language, Parser

# ── tree-sitter parser 缓存 ────────────────────────────────

_parsers: dict[str, Parser] = {}

try:
    import tree_sitter_python
    _py_lang = Language(tree_sitter_python.language())
    _parsers["python"] = Parser(_py_lang)
except Exception:
    pass

try:
    import tree_sitter_javascript
    _js_lang = Language(tree_sitter_javascript.language())
    _parsers["javascript"] = Parser(_js_lang)
except Exception:
    pass

try:
    import tree_sitter_typescript
    _ts_lang = Language(tree_sitter_typescript.language_typescript())
    _parsers["typescript"] = Parser(_ts_lang)
    _tsx_lang = Language(tree_sitter_typescript.language_tsx())
    _parsers["tsx"] = Parser(_tsx_lang)
except Exception:
    pass

try:
    import tree_sitter_go
    _go_lang = Language(tree_sitter_go.language())
    _parsers["go"] = Parser(_go_lang)
except Exception:
    pass

# ── AST 节点类型 ── 每种语言需要提取的函数/类节点 ──────────

FUNCTION_NODE_TYPES: dict[str, list[str]] = {
    "python": ["function_definition", "class_definition"],
    "javascript": [
        "function_declaration", "class_declaration",
        "method_definition", "arrow_function",
    ],
    "typescript": [
        "function_declaration", "class_declaration",
        "method_definition", "arrow_function",
    ],
    "tsx": [
        "function_declaration", "class_declaration",
        "method_definition", "arrow_function",
    ],
    "go": ["function_declaration", "method_declaration", "type_declaration"],
}

# ── 正则兜底 ── 每种语言识别函数定义行的模式 ──────────────

REGEX_PATTERNS: dict[str, str] = {
    "python": r"^(?:    |\t)?(?:def |class )",
    "javascript": r"^(?:function |class |(?:async )?[\w.]+\s*=\s*(?:async )?function)",
    "typescript": r"^(?:function |class |(?:async )?[\w.]+\s*=\s*(?:async )?function)",
    "tsx": r"^(?:function |class |(?:async )?[\w.]+\s*=\s*(?:async )?function)",
    "go": r"^func ",
    "rust": r"^fn ",
    "java": r"^\s*(?:public|private|protected)?\s*(?:static)?\s*[\w<>\[\]]+\s+\w+\(",
    "c": r"^\w+\s+\w+\(",
    "ruby": r"^\s*(?:def |class )",
}

# ── 语言名规范化 ── github_adapter 中的显示名映射到 registry 键 ──

_LANGUAGE_ALIASES = {
    "javascript/react": "javascript",
    "typescript/react": "tsx",
}


def normalize_language(display_name: str) -> str:
    """将 github_adapter 返回的显示语言名映射为 registry 键"""
    lower = display_name.lower()
    if lower in _LANGUAGE_ALIASES:
        return _LANGUAGE_ALIASES[lower]
    return lower.split("/")[0]


def get_parser(language: str) -> Parser | None:
    """获取指定语言的 tree-sitter parser，不支持则返回 None"""
    return _parsers.get(language.lower())


def get_node_types(language: str) -> list[str]:
    """获取指定语言的 AST 函数/类节点类型列表"""
    return FUNCTION_NODE_TYPES.get(language.lower(), [])


def get_regex(language: str) -> str | None:
    """获取指定语言的正则兜底模式，不支持则返回 None"""
    return REGEX_PATTERNS.get(language.lower())


def supported_ast_languages() -> list[str]:
    """返回已加载 tree-sitter parser 的语言列表"""
    return list(_parsers.keys())
