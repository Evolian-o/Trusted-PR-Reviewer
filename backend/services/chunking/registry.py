"""语言注册表：tree-sitter parser + AST 节点类型 + 正则兜底模式"""

import logging
from tree_sitter import Language, Parser

logger = logging.getLogger(__name__)

# ── tree-sitter parser 缓存 ────────────────────────────────

_parsers: dict[str, Parser] = {}

_PARSER_IMPORTS = [
    ("python", "tree_sitter_python", "language"),
    ("javascript", "tree_sitter_javascript", "language"),
    ("typescript", "tree_sitter_typescript", "language_typescript"),
    ("go", "tree_sitter_go", "language"),
    ("rust", "tree_sitter_rust", "language"),
    ("java", "tree_sitter_java", "language"),
    ("c_sharp", "tree_sitter_c_sharp", "language"),
    ("ruby", "tree_sitter_ruby", "language"),
]

for _lang, _mod, _attr in _PARSER_IMPORTS:
    try:
        _m = __import__(_mod)
        _lang_fn = getattr(_m, _attr)
        _parsers[_lang] = Parser(Language(_lang_fn()))
    except Exception:
        logger.warning("tree-sitter parser 加载失败: %s（%s 未安装）", _lang, _mod)

# typescript 特殊：额外注册 tsx parser
if "typescript" in _parsers:
    try:
        import tree_sitter_typescript as _ts
        _parsers["tsx"] = Parser(Language(_ts.language_tsx()))
    except Exception:
        logger.warning("tree-sitter tsx parser 加载失败")

# c_sharp 别名
if "c_sharp" in _parsers:
    _parsers["c#"] = _parsers["c_sharp"]

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
    "rust": ["function_item", "impl_item", "trait_item", "struct_item", "enum_item"],
    "java": ["method_declaration", "class_declaration", "interface_declaration", "constructor_declaration"],
    "c_sharp": ["method_declaration", "class_declaration", "interface_declaration", "struct_declaration", "constructor_declaration"],
    "c#": ["method_declaration", "class_declaration", "interface_declaration", "struct_declaration", "constructor_declaration"],
    "ruby": ["method", "class", "module", "singleton_method"],
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
    "c_sharp": r"^\s*(?:public|private|protected|internal)?\s*(?:static|virtual|override|abstract|async)?\s*[\w<>\[\],\s]+\s+\w+\(",
    "c#": r"^\s*(?:public|private|protected|internal)?\s*(?:static|virtual|override|abstract|async)?\s*[\w<>\[\],\s]+\s+\w+\(",
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
