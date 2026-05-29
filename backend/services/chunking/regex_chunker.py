"""正则启发式分片：用各语言函数定义模式识别边界"""

import re
from models.review import FileChange


def _split_diff_by_line_pattern(
    diff: str, pattern: str, fallback_max_lines: int = 2000,
) -> list[tuple[int, int]]:
    """在 diff 中查找匹配 pattern 的行作为切分边界"""
    lines = diff.split("\n")
    boundaries = [0]
    regex = re.compile(pattern)

    for i, line in enumerate(lines):
        stripped = line
        if line.startswith(("+", "-")):
            stripped = line[1:]
        if regex.search(stripped):
            if i > 0:
                boundaries.append(i)

    if len(boundaries) == 1:
        return _split_by_lines(len(lines), fallback_max_lines)

    ranges = []
    for i, start in enumerate(boundaries):
        end = boundaries[i + 1] if i + 1 < len(boundaries) else len(lines)
        ranges.append((start, end))

    merged = []
    for r in ranges:
        if merged and (r[1] - r[0]) < 10:
            prev = merged[-1]
            merged[-1] = (prev[0], r[1])
        else:
            merged.append(r)
    return merged


def _split_by_lines(total: int, max_lines: int) -> list[tuple[int, int]]:
    """按行数均分"""
    ranges = []
    for i in range(0, total, max_lines):
        end = min(i + max_lines, total)
        ranges.append((i, end))
    return ranges


def chunk_by_regex(
    file: FileChange,
    pattern: str,
    max_chars: int = 8000,
    fallback_max_lines: int = 2000,
) -> list[FileChange]:
    """正则分片主函数"""
    diff = file.patch or ""
    if not diff.strip():
        return [FileChange(
            filename=file.filename,
            status=file.status,
            patch="",
            additions=file.additions,
            deletions=file.deletions,
            language=file.language,
            context_hint="",
        )]

    lines = diff.split("\n")
    ranges = _split_diff_by_line_pattern(diff, pattern, fallback_max_lines)

    chunks: list[FileChange] = []
    for part_no, (start, end) in enumerate(ranges, start=1):
        chunk_lines = lines[start:end]
        chunk_diff = "\n".join(chunk_lines)

        name_tag = ""
        for line in chunk_lines:
            stripped = line.lstrip("+- ")
            if re.match(pattern, stripped):
                name_tag = stripped.split("(")[0].strip().split()[-1][:40]
                break

        is_parts = len(ranges) > 1
        if is_parts and name_tag:
            chunk_filename = f"{file.filename} (fn: {name_tag})"
        elif is_parts:
            chunk_filename = f"{file.filename} (part {part_no})"
        else:
            chunk_filename = file.filename

        if len(chunk_diff) > max_chars:
            chunk_diff = chunk_diff[:max_chars] + "\n... (diff 已截断)"

        chunks.append(FileChange(
            filename=chunk_filename,
            status=file.status,
            patch=chunk_diff,
            additions=file.additions,
            deletions=file.deletions,
            language=file.language,
            context_hint=f"正则分片: {name_tag}" if name_tag else "",
        ))

    return chunks
