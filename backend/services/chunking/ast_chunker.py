"""基于 tree-sitter AST 的智能分片"""

from models.review import FileChange


def extract_function_nodes(
    source_bytes: bytes, parser, node_types: list[str],
) -> list[dict]:
    """遍历 AST 提取所有函数/类节点的名称和行号范围"""
    tree = parser.parse(source_bytes)
    nodes: list[dict] = []

    def walk(node):
        if node.type in node_types:
            name_node = node.child_by_field_name("name")
            name = ""
            if name_node is not None:
                name = source_bytes[name_node.start_byte:name_node.end_byte].decode()
            nodes.append({
                "name": name or "unknown",
                "type": node.type,
                "start_line": node.start_point[0] + 1,
                "end_line": node.end_point[0] + 1,
                "start_byte": node.start_byte,
                "end_byte": node.end_byte,
            })
        for child in node.children:
            walk(child)

    walk(tree.root_node)
    return nodes


def parse_diff_ranges(patch: str) -> list[tuple[int, int]]:
    """从 diff patch 中提取所有变更行号范围 [(start, end), ...]"""
    ranges: list[tuple[int, int]] = []
    for line in patch.split("\n"):
        if line.startswith("@@"):
            parts = line.split()
            if len(parts) < 3:
                continue
            new_info = parts[2].lstrip("+")
            start = int(new_info.split(",")[0])
            count = int(new_info.split(",")[1]) if "," in new_info else 1
            if count > 0:
                ranges.append((start, start + count - 1))
    return ranges


def find_touched_nodes(
    source_bytes: bytes,
    parser,
    node_types: list[str],
    diff_ranges: list[tuple[int, int]],
) -> list[dict]:
    """找出所有被 diff 触及的 AST 节点"""
    all_nodes = extract_function_nodes(source_bytes, parser, node_types)
    if not diff_ranges:
        return all_nodes

    touched: list[dict] = []
    for node in all_nodes:
        for dr_start, dr_end in diff_ranges:
            if node["start_line"] <= dr_end and node["end_line"] >= dr_start:
                touched.append(node)
                break
    return touched


def _find_class_for_node(node: dict, all_nodes: list[dict]) -> dict | None:
    """查找某个函数/方法所属的类节点"""
    for n in all_nodes:
        if n["type"] in ("class_definition", "class_declaration", "type_declaration"):
            if n["start_line"] <= node["start_line"] and n["end_line"] >= node["end_line"]:
                if n is not node:
                    return n
    return None


def _build_chunk(
    file: FileChange,
    group: list[dict],
    source_bytes: bytes,
    all_nodes: list[dict],
) -> FileChange:
    """将一组 AST 节点构建为一个 FileChange chunk"""
    names = [g["name"] for g in group]

    parent_class = _find_class_for_node(group[0], all_nodes)
    if parent_class:
        context_hint = f"class {parent_class['name']} — 方法 " + " + ".join(names[:4])
        if len(names) > 4:
            context_hint += f" (共 {len(names)} 个)"
    elif len(group) == 1:
        node_type = group[0]["type"]
        if "function" in node_type or "declaration" in node_type:
            type_label = "函数"
        elif "class" in node_type:
            type_label = "类"
        else:
            type_label = node_type
        context_hint = f"{type_label} {group[0]['name']}"
    else:
        context_hint = " + ".join(names[:4])
        if len(names) > 4:
            context_hint += f" (共 {len(names)} 个)"

    start_byte = group[0]["start_byte"]
    end_byte = group[-1]["end_byte"]
    source = source_bytes[start_byte:end_byte].decode()

    fn_suffix = f"(fn: {names[0]})"
    if len(names) > 1:
        fn_suffix = f"(fn: {names[0]} +{len(names)-1})"
    if "." in file.filename:
        base, ext = file.filename.rsplit(".", 1)
        chunk_filename = f"{base}_{fn_suffix}.{ext}"
    else:
        chunk_filename = f"{file.filename} {fn_suffix}"

    return FileChange(
        filename=chunk_filename,
        status=file.status,
        patch=source,
        additions=file.additions,
        deletions=file.deletions,
        language=file.language,
        context_hint=context_hint,
    )


def chunk_by_ast(
    file: FileChange,
    full_content: str,
    parser,
    node_types: list[str],
    max_chars: int = 8000,
    merge_max_chars: int = 6000,
) -> list[FileChange]:
    """AST 分片主函数"""
    source_bytes = full_content.encode()
    diff_ranges = parse_diff_ranges(file.patch or "")
    touched = find_touched_nodes(source_bytes, parser, node_types, diff_ranges)

    if not touched:
        return [FileChange(
            filename=file.filename,
            status=file.status,
            patch=file.patch,
            additions=file.additions,
            deletions=file.deletions,
            language=file.language,
            context_hint="",
        )]

    all_nodes = extract_function_nodes(source_bytes, parser, node_types)
    touched.sort(key=lambda n: n["start_line"])

    groups: list[list[dict]] = []
    current: list[dict] = []

    for node in touched:
        node_chars = node["end_byte"] - node["start_byte"]

        if node_chars > max_chars:
            if current:
                groups.append(current)
                current = []
            groups.append([node])
            continue

        if not current:
            current = [node]
            continue

        prev = current[-1]
        prev_class = _find_class_for_node(prev, all_nodes)
        node_class = _find_class_for_node(node, all_nodes)
        same_class = (
            prev_class is not None
            and node_class is not None
            and prev_class["name"] == node_class["name"]
        )
        current_total = sum(n["end_byte"] - n["start_byte"] for n in current)

        if same_class or (current_total + node_chars <= merge_max_chars):
            current.append(node)
        else:
            groups.append(current)
            current = [node]

    if current:
        groups.append(current)

    return [_build_chunk(file, g, source_bytes, all_nodes) for g in groups]
