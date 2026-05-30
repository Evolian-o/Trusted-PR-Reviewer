"""智能分片模块 — AST(per_function/merge) → 正则 → 行级逐级退化"""

from models.review import PRInfo, FileChange
from services.chunking.registry import (
    get_parser, get_node_types, get_regex, normalize_language,
)
from services.chunking.ast_chunker import chunk_by_ast, chunk_per_function
from services.chunking.regex_chunker import chunk_by_regex
from services.github_adapter import fetch_file_content
from services.diff_parser import filter_patch, split_large_file


async def chunk_pr(
    pr: PRInfo,
    token: str | None = None,
    max_chars: int = 8000,
    merge_max_chars: int = 6000,
    fallback_max_lines: int = 2000,
    strategy: str = "auto",
) -> list[FileChange]:
    """智能分片入口：对 PR 中每个文件按策略逐级退化切分"""
    chunks: list[FileChange] = []

    for fc in pr.files:
        if fc.status == "removed":
            continue

        filtered = filter_patch(fc.patch)
        if not filtered and fc.status != "added":
            continue

        base_fc = FileChange(
            filename=fc.filename,
            status=fc.status,
            patch=filtered,
            additions=fc.additions,
            deletions=fc.deletions,
            language=fc.language,
        )

        sub_chunks = await _chunk_one_file(
            base_fc, pr, token,
            max_chars=max_chars,
            merge_max_chars=merge_max_chars,
            fallback_max_lines=fallback_max_lines,
            strategy=strategy,
        )
        chunks.extend(sub_chunks)

    return chunks


async def _chunk_one_file(
    fc: FileChange,
    pr: PRInfo,
    token: str | None,
    max_chars: int,
    merge_max_chars: int,
    fallback_max_lines: int,
    strategy: str,
) -> list[FileChange]:
    """单个文件的三级退化分片"""
    lang = normalize_language(fc.language)

    # Level 1: AST 逐函数（per_function 策略 — 每个函数/方法独立评审）
    if strategy == "per_function":
        parser = get_parser(lang)
        if parser is not None and pr.head_sha:
            full_content = await fetch_file_content(
                pr.owner, pr.repo, pr.head_sha, fc.filename, token=token,
            )
            if full_content:
                node_types = get_node_types(lang)
                if node_types:
                    result = chunk_per_function(fc, full_content, parser, node_types)
                    if result:
                        return _apply_line_fallback(result, fallback_max_lines)
        # 用户强制 per_function 但 AST 不可用 — 回退到不拆分，保留原始文件

    # Level 2: AST 合并模式（auto/ast — 同属一个类的函数合并为一个 chunk）
    if strategy in ("auto", "ast"):
        parser = get_parser(lang)
        if parser is not None and pr.head_sha:
            full_content = await fetch_file_content(
                pr.owner, pr.repo, pr.head_sha, fc.filename, token=token,
            )
            if full_content:
                node_types = get_node_types(lang)
                if node_types:
                    result = chunk_by_ast(
                        fc, full_content, parser, node_types,
                        max_chars=max_chars,
                        merge_max_chars=merge_max_chars,
                    )
                    return _apply_line_fallback(result, fallback_max_lines)

        if strategy == "ast":
            pass  # 用户强制 AST 但失败了 — 回退到不拆分

    # Level 3: 正则
    if strategy in ("auto", "regex"):
        pattern = get_regex(lang)
        if pattern:
            return chunk_by_regex(
                fc, pattern,
                max_chars=max_chars,
                fallback_max_lines=fallback_max_lines,
            )

    # Level 3: 行级
    return split_large_file(fc)


def _apply_line_fallback(
    chunks: list[FileChange], max_lines: int,
) -> list[FileChange]:
    """对 AST 分片结果再做行数兜底检查"""
    result: list[FileChange] = []
    for c in chunks:
        if c.patch:
            lines = c.patch.split("\n")
            if len(lines) > max_lines:
                result.extend(split_large_file(c))
            else:
                result.append(c)
        else:
            result.append(c)
    return result
