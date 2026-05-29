from models.review import PRInfo, FileChange

MAX_DIFF_LINES = 2000


def filter_patch(patch: str) -> str:
    """过滤纯格式变更行"""
    if not patch:
        return ""
    lines = patch.split("\n")
    meaningful = []
    for line in lines:
        if not line.strip():
            continue
        if line.startswith(("+", "-")) and line[1:].strip() == "":
            continue
        meaningful.append(line)
    return "\n".join(meaningful)


def split_large_file(fc: FileChange) -> list[FileChange]:
    """大文件按行数二次拆分"""
    if not fc.patch:
        return [fc]

    lines = fc.patch.split("\n")
    if len(lines) <= MAX_DIFF_LINES:
        return [fc]

    chunks = []
    for i in range(0, len(lines), MAX_DIFF_LINES):
        chunk_lines = lines[i:i + MAX_DIFF_LINES]
        chunk = FileChange(
            filename=f"{fc.filename} (part {i // MAX_DIFF_LINES + 1})",
            status=fc.status,
            patch="\n".join(chunk_lines),
            additions=fc.additions,
            deletions=fc.deletions,
            language=fc.language,
        )
        chunks.append(chunk)
    return chunks


def chunk_pr_simple(pr: PRInfo) -> list[FileChange]:
    """将 PR 按文件拆分为评审用的 Chunk 列表（行级分片，向后兼容）"""
    chunks = []
    for fc in pr.files:
        if fc.status == "removed":
            continue
        filtered = filter_patch(fc.patch)
        if not filtered and fc.status != "added":
            continue
        chunk_fc = FileChange(
            filename=fc.filename,
            status=fc.status,
            patch=filtered,
            additions=fc.additions,
            deletions=fc.deletions,
            language=fc.language,
        )
        chunks.extend(split_large_file(chunk_fc))
    return chunks
