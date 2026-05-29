# 智能分片 (Smart Chunking) 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 PR diff 分片从粗粒度行数切分升级为基于 tree-sitter AST 的按函数/类边界切分，支持 Python/JS/TS/Go 四门语言，正则兜底，行级保底。

**Architecture:** 新建 `backend/services/chunking/` 模块（registry → ast_chunker → regex_chunker → __init__ 统一入口），通过 `chunk_pr()` 三级退化调度；新增 `fetch_file_content()` 获取完整文件内容供 AST 解析；`FileChange` 模型增加 `context_hint` 字段；`prompt_builder` 适配新的分片上下文输出。

**Tech Stack:** tree-sitter (Python bindings), tree-sitter-python, tree-sitter-javascript, tree-sitter-typescript, tree-sitter-go

---

### Task 1: 数据模型扩展 — PRInfo.head_sha + FileChange.context_hint

**Files:**
- Modify: `backend/models/review.py:13-21` (PRInfo), `:4-10` (FileChange)
- Modify: `backend/services/github_adapter.py:32-87` (fetch_pr — 捕获 head_sha)

- [ ] **Step 1: 给 FileChange 添加 context_hint 字段**

```python
# backend/models/review.py — FileChange 类
class FileChange(BaseModel):
    filename: str
    status: str  # added | modified | removed | renamed
    patch: str = ""
    additions: int = 0
    deletions: int = 0
    language: str = ""
    context_hint: str = ""  # 新增：分片上下文描述
```

- [ ] **Step 2: 给 PRInfo 添加 head_sha 字段**

```python
# backend/models/review.py — PRInfo 类
class PRInfo(BaseModel):
    owner: str
    repo: str
    pull_number: int
    title: str = ""
    description: str = ""
    files: list[FileChange] = []
    additions: int = 0
    deletions: int = 0
    head_sha: str = ""  # 新增：PR head commit SHA，用于获取完整文件内容
```

- [ ] **Step 3: fetch_pr() 捕获 head.sha**

```python
# backend/services/github_adapter.py — fetch_pr() 返回值
return PRInfo(
    owner=owner,
    repo=repo,
    pull_number=pull_number,
    title=pr_data.get("title", ""),
    description=(pr_data.get("body") or ""),
    files=files,
    additions=pr_data.get("additions", 0),
    deletions=pr_data.get("deletions", 0),
    head_sha=pr_data.get("head", {}).get("sha", ""),  # 新增
)
```

- [ ] **Step 4: 验证模型导入**

Run: `cd backend && python -c "from models.review import PRInfo, FileChange; fc = FileChange(filename='a.py', status='modified', context_hint='test'); pr = PRInfo(owner='x', repo='y', pull_number=1, head_sha='abc'); print(fc); print(pr.head_sha)"`
Expected: 输出包含 context_hint='test' 和 head_sha='abc'

- [ ] **Step 5: Commit**

```bash
git add backend/models/review.py backend/services/github_adapter.py
git commit -m "feat: PRInfo 添加 head_sha + FileChange 添加 context_hint 字段"
```

---

### Task 2: 安装 tree-sitter 依赖

**Files:**
- Modify: `backend/requirements.txt`

- [ ] **Step 1: 添加依赖**

```
# backend/requirements.txt 追加
tree-sitter==0.24.0
tree-sitter-python==0.23.6
tree-sitter-javascript==0.23.1
tree-sitter-typescript==0.23.2
tree-sitter-go==0.23.4
```

- [ ] **Step 2: 安装依赖**

Run: `cd backend && pip install tree-sitter tree-sitter-python tree-sitter-javascript tree-sitter-typescript tree-sitter-go`
Expected: 无报错安装成功

- [ ] **Step 3: 验证导入**

Run: `cd backend && python -c "import tree_sitter_python; import tree_sitter_javascript; import tree_sitter_typescript; import tree_sitter_go; from tree_sitter import Language, Parser; print('OK')"`
Expected: 输出 OK

- [ ] **Step 4: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: 添加 tree-sitter + 四门语言 grammar 依赖"
```

---

### Task 3: registry.py — 语言注册表

**Files:**
- Create: `backend/services/chunking/__init__.py` (空文件，占位)
- Create: `backend/services/chunking/registry.py`

- [ ] **Step 1: 创建 chunking 包目录**

```bash
mkdir -p backend/services/chunking
```

- [ ] **Step 2: 写 registry.py**

```python
# backend/services/chunking/registry.py
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
    _ts_lang = Language(tree_sitter_typescript.language())
    _parsers["typescript"] = Parser(_ts_lang)
except Exception:
    pass

try:
    import tree_sitter_go
    _go_lang = Language(tree_sitter_go.language())
    _parsers["go"] = Parser(_go_lang)
except Exception:
    pass

# ── AST 节点类型 — 每种语言需要提取的函数/类节点 ──────────

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
    "go": ["function_declaration", "method_declaration", "type_declaration"],
}

# ── 正则兜底 — 每种语言识别函数定义行的模式 ──────────────

REGEX_PATTERNS: dict[str, str] = {
    "python": r"^(?:    |\t)?(?:def |class )",
    "javascript": r"^(?:function |class |(?:async )?[\w.]+\\s*=\\s*(?:async )?function)",
    "typescript": r"^(?:function |class |(?:async )?[\w.]+\\s*=\\s*(?:async )?function)",
    "go": r"^func ",
    "rust": r"^fn ",
    "java": r"^\\s*(?:public|private|protected)?\\s*(?:static)?\\s*[\\w<>\\[\\]]+\\s+\\w+\\(",
    "c": r"^\\w+\\s+\\w+\\(",
    "cpp": r"^(?:\\w+\\s+)?\\w+\\s*::\\s*~?\\w+\\(",
    "ruby": r"^\\s*(?:def |class )",
}


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
```

- [ ] **Step 3: 写 __init__.py 占位**

```python
# backend/services/chunking/__init__.py
"""智能分片模块 — AST → 正则 → 行级逐级退化"""

from services.chunking.registry import supported_ast_languages
```

- [ ] **Step 4: 验证 registry 导入**

Run: `cd backend && python -c "from services.chunking.registry import get_parser, get_node_types, get_regex, supported_ast_languages; print('AST:', supported_ast_languages()); print('Python nodes:', get_node_types('python')); print('Python regex:', get_regex('python')[:30]); print('Parser:', get_parser('python'))"`
Expected: 输出 AST 语言列表、Python 节点类型、正则模式、Parser 对象地址（非 None）

- [ ] **Step 5: Commit**

```bash
git add backend/services/chunking/__init__.py backend/services/chunking/registry.py
git commit -m "feat: 语言注册表 — tree-sitter parser + AST 节点类型 + 正则兜底模式"
```

---

### Task 4: github_adapter.py — fetch_file_content()

**Files:**
- Modify: `backend/services/github_adapter.py` (新增函数)

- [ ] **Step 1: 添加 fetch_file_content() 函数**

在 `fetch_pr()` 函数之后，`LANGUAGE_MAP` 定义之前插入：

```python
async def fetch_file_content(
    owner: str, repo: str, ref: str, path: str, token: str | None = None
) -> str:
    """获取仓库中指定 ref 下单个文件的完整内容（base64 解码）
    
    Args:
        ref: git commit SHA 或分支名（来自 PRInfo.head_sha）
    """
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"

    timeout = aiohttp.ClientTimeout(total=15)
    async with aiohttp.ClientSession(headers=headers, timeout=timeout) as session:
        url = f"{GITHUB_API}/repos/{owner}/{repo}/contents/{path}"
        async with session.get(url, params={"ref": ref}) as resp:
            if resp.status == 404:
                return ""  # 文件在 head ref 可能已不存在（如删除/重命名）
            resp.raise_for_status()
            import base64
            data = await resp.json()
            content = data.get("content", "")
            if data.get("encoding") == "base64" and content:
                return base64.b64decode(content).decode("utf-8", errors="replace")
            return ""
```

- [ ] **Step 2: 验证函数存在**

Run: `cd backend && python -c "from services.github_adapter import fetch_file_content; print('OK')"`
Expected: 输出 OK

- [ ] **Step 3: Commit**

```bash
git add backend/services/github_adapter.py
git commit -m "feat: fetch_file_content() — 从 GitHub 获取完整文件内容"
```

---

### Task 5: ast_chunker.py — tree-sitter AST 分片

**Files:**
- Create: `backend/services/chunking/ast_chunker.py`

- [ ] **Step 1: 写 ast_chunker.py**

```python
# backend/services/chunking/ast_chunker.py
"""基于 tree-sitter AST 的智能分片：解析完整文件 → 映射 diff → 按函数边界切分"""

import re
from models.review import FileChange
from services.chunking.registry import get_node_types


def extract_function_nodes(
    source_bytes: bytes, parser, node_types: list[str]
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
            # @@ -old_start,old_count +new_start,new_count @@
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
    source_bytes: bytes, parser, node_types: list[str], diff_ranges: list[tuple[int, int]]
) -> list[dict]:
    """找出所有被 diff 触及的 AST 节点"""
    all_nodes = extract_function_nodes(source_bytes, parser, node_types)
    if not diff_ranges:
        return all_nodes  # 新增文件：所有函数都算"被触及"

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
                if n != node:
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

    # 检查是否属于同一个类
    parent_class = _find_class_for_node(group[0], all_nodes)
    if parent_class:
        context_hint = f"class {parent_class['name']} — 方法 " + " + ".join(names[:4])
        if len(names) > 4:
            context_hint += f" (共 {len(names)} 个)"
    elif len(group) == 1:
        type_label = "函数" if "function" in group[0]["type"] or "declaration" in group[0]["type"] else group[0]["type"]
        context_hint = f"{type_label} {group[0]['name']}"
    else:
        context_hint = " + ".join(names[:4])
        if len(names) > 4:
            context_hint += f" (共 {len(names)} 个)"

    # 提取对应源代码
    start_byte = group[0]["start_byte"]
    end_byte = group[-1]["end_byte"]
    source = source_bytes[start_byte:end_byte].decode()

    # 文件名标记
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
    """AST 分片主函数：解析文件 → 找变更节点 → 按阈值合并 → 返回 chunks"""
    source_bytes = full_content.encode()
    diff_ranges = parse_diff_ranges(file.patch or "")
    touched = find_touched_nodes(source_bytes, parser, node_types, diff_ranges)

    if not touched:
        # 无 AST 节点匹配 → 返回原始文件作为单个 chunk（不做拆分）
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

    # 按起始行排序
    touched.sort(key=lambda n: n["start_line"])

    # 归组：同类的成员函数合并，相邻小函数累加
    groups: list[list[dict]] = []
    current: list[dict] = []

    for node in touched:
        node_chars = node["end_byte"] - node["start_byte"]

        # 超大函数独占一个 chunk
        if node_chars > max_chars:
            if current:
                groups.append(current)
                current = []
            groups.append([node])
            continue

        if not current:
            current = [node]
            continue

        prev = current[-1] if current else None
        prev_class = _find_class_for_node(prev, all_nodes) if prev else None
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

    chunks = [_build_chunk(file, g, source_bytes, all_nodes) for g in groups]
    return chunks
```

- [ ] **Step 2: 创建 tests 目录和测试文件**

```bash
mkdir -p backend/tests
```

创建 `backend/tests/__init__.py` (空文件)，然后创建 `backend/tests/test_ast_chunker.py`:

```python
# backend/tests/test_ast_chunker.py
import pytest
from models.review import FileChange
from services.chunking.registry import get_parser, get_node_types
from services.chunking.ast_chunker import (
    parse_diff_ranges,
    extract_function_nodes,
    find_touched_nodes,
    chunk_by_ast,
)

SAMPLE_PY = '''\
def foo():
    return 1


class Calculator:
    def add(self, a, b):
        return a + b

    def sub(self, a, b):
        return a - b


def bar():
    return 2
'''


class TestParseDiffRanges:
    def test_single_hunk(self):
        patch = "@@ -1,3 +1,5 @@\n+new line\n context\n-old"
        ranges = parse_diff_ranges(patch)
        assert ranges == [(1, 5)]

    def test_multiple_hunks(self):
        patch = "@@ -1,3 +1,4 @@\n x\n@@ -10,2 +12,3 @@\n y"
        ranges = parse_diff_ranges(patch)
        assert len(ranges) == 2
        assert ranges[0] == (1, 4)
        assert ranges[1] == (12, 14)

    def test_no_range_on_zero_count(self):
        patch = "@@ -1,0 +0,0 @@"
        ranges = parse_diff_ranges(patch)
        assert ranges == []


class TestASTChunker:
    def test_extract_nodes(self):
        parser = get_parser("python")
        assert parser is not None
        node_types = get_node_types("python")
        nodes = extract_function_nodes(SAMPLE_PY.encode(), parser, node_types)
        names = [n["name"] for n in nodes]
        assert "foo" in names
        assert "Calculator" in names

    def test_chunk_by_ast_python(self):
        parser = get_parser("python")
        node_types = get_node_types("python")
        fc = FileChange(
            filename="calc.py",
            status="modified",
            patch="@@ -5,2 +5,3 @@\n     def add(self, a, b):\n+        print(a)\n         return a + b",
            language="Python",
        )
        chunks = chunk_by_ast(fc, SAMPLE_PY, parser, node_types)
        assert len(chunks) >= 1
        # 修改涉及 add 方法，应属于 Calculator 类上下文
        assert any("Calculator" in c.context_hint for c in chunks)

    def test_new_file_returns_all_functions(self):
        parser = get_parser("python")
        node_types = get_node_types("python")
        fc = FileChange(
            filename="new.py",
            status="added",
            patch="",  # 新增文件无 diff
            language="Python",
        )
        chunks = chunk_by_ast(fc, SAMPLE_PY, parser, node_types)
        assert len(chunks) >= 1
```

- [ ] **Step 3: 运行测试**

Run: `cd backend && python -m pytest tests/test_ast_chunker.py -v`
Expected: 5 tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/services/chunking/ast_chunker.py backend/tests/test_ast_chunker.py
git commit -m "feat: AST 分片器 — tree-sitter 解析 + diff 映射 + 按函数/类边界切分"
```

---

### Task 6: regex_chunker.py — 正则兜底分片

**Files:**
- Create: `backend/services/chunking/regex_chunker.py`

- [ ] **Step 1: 写 regex_chunker.py**

```python
# backend/services/chunking/regex_chunker.py
"""正则启发式分片：用各语言函数定义模式识别边界"""

import re
from models.review import FileChange


def _split_diff_by_line_pattern(
    diff: str, pattern: str, fallback_max_lines: int = 2000
) -> list[tuple[int, int]]:
    """在 diff 中查找匹配 pattern 的行作为切分边界
    
    返回每个 chunk 对应的行号范围 [(start, end), ...]
    """
    lines = diff.split("\n")
    # 找出所有函数定义行的索引
    boundaries = [0]  # 从开头开始
    regex = re.compile(pattern)
    for i, line in enumerate(lines):
        # 只匹配不以 +/- 开头的上下文行（或者是新代码行）
        stripped = line
        if line.startswith(("+", "-")):
            stripped = line[1:]
        if regex.search(stripped):
            if i > 0:
                boundaries.append(i)

    if len(boundaries) == 1:
        # 没找到边界 → 回退行级切分
        return _split_by_lines(len(lines), fallback_max_lines)

    # 构建范围
    ranges = []
    for i, start in enumerate(boundaries):
        end = boundaries[i + 1] if i + 1 < len(boundaries) else len(lines)
        ranges.append((start, end))

    # 合并过小的 chunk（< 10 行合并到前一个）
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
    """正则分片：用语言特定模式识别函数定义行，按边界切分 diff"""
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

        # 尝试提取第一个函数名作为标记
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
```

- [ ] **Step 2: 写测试**

```python
# backend/tests/test_regex_chunker.py
from models.review import FileChange
from services.chunking.regex_chunker import chunk_by_regex, _split_diff_by_line_pattern

PY_DIFF = """\
@@ -1,5 +1,6 @@
 def foo():
-    return 1
+    return 2
 
 def bar():
     pass
@@ -10,3 +11,4 @@
 class Baz:
     def meth(self):
+        print("new")
         pass
"""


class TestSplitDiffByLinePattern:
    def test_python_pattern_finds_boundaries(self):
        pattern = r"^(?:    |\t)?(?:def |class )"
        ranges = _split_diff_by_line_pattern(PY_DIFF, pattern)
        assert len(ranges) >= 1  # 至少有 1 个范围


class TestRegexChunker:
    def test_chunk_by_regex_python(self):
        fc = FileChange(
            filename="mod.py",
            status="modified",
            patch=PY_DIFF,
            language="Python",
        )
        pattern = r"^(?:    |\t)?(?:def |class )"
        chunks = chunk_by_regex(fc, pattern)
        assert len(chunks) >= 1
        for c in chunks:
            assert c.filename
            assert isinstance(c.context_hint, str)
```

- [ ] **Step 3: 运行测试**

Run: `cd backend && python -m pytest tests/test_regex_chunker.py -v`
Expected: 2+ tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/services/chunking/regex_chunker.py backend/tests/test_regex_chunker.py
git commit -m "feat: 正则分片器 — 按语言特定模式识别函数边界"
```

---

### Task 7: chunking/__init__.py — 统一入口 + 三级退化

**Files:**
- Modify: `backend/services/chunking/__init__.py` (重写)

- [ ] **Step 1: 重写 __init__.py**

```python
# backend/services/chunking/__init__.py
"""智能分片模块 — AST → 正则 → 行级逐级退化"""

from models.review import PRInfo, FileChange
from services.chunking.registry import (
    get_parser, get_node_types, get_regex, supported_ast_languages,
)
from services.chunking.ast_chunker import chunk_by_ast
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
    """智能分片入口：对 PR 中每个文件按策略切分"""
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
    lang = fc.language.lower()

    # Level 1: AST (tree-sitter)
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
            # 用户强制 AST 模式但失败了 → 不退化，直接返回原始
            pass

    # Level 2: 正则
    if strategy in ("auto", "regex"):
        pattern = get_regex(lang)
        if pattern:
            return chunk_by_regex(
                fc, pattern,
                max_chars=max_chars,
                fallback_max_lines=fallback_max_lines,
            )

    # Level 3: 行级
    return split_large_file(fc) if fallback_max_lines else [fc]


def _apply_line_fallback(
    chunks: list[FileChange], max_lines: int
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
```

- [ ] **Step 2: 确保 diff_parser.py 的函数可被导入**

`filter_patch` 和 `split_large_file` 目前在 `diff_parser.py` 中，确认它们可以被外部导入（已有）。

- [ ] **Step 3: 验证模块导入**

Run: `cd backend && python -c "from services.chunking import chunk_pr; print('chunk_pr imported OK')"`
Expected: 输出 "chunk_pr imported OK"

- [ ] **Step 4: Commit**

```bash
git add backend/services/chunking/__init__.py
git commit -m "feat: 智能分片统一入口 — AST → 正则 → 行级三级退化"
```

---

### Task 8: diff_parser.py 重构 + prompt_builder.py 适配

**Files:**
- Modify: `backend/services/diff_parser.py` (chunk_pr 改为 delegate)
- Modify: `backend/services/prompt_builder.py` (新增 context_hint 输出)

- [ ] **Step 1: 重构 diff_parser.py 的 chunk_pr()**

```python
# backend/services/diff_parser.py — 将 chunk_pr 改为兼容包装
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
    """大文件按行数二次拆分（行级兜底）"""
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


# 保留旧的同步签名用于 scheduler.py 等不需要智能分片的场景
def chunk_pr_simple(pr: PRInfo) -> list[FileChange]:
    """简单行级分片（向后兼容）"""
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
```

- [ ] **Step 2: 修改 prompt_builder.py — 新增 context_hint**

```python
# backend/services/prompt_builder.py — build_user_prompt() 修改
def build_user_prompt(pr: PRInfo, fc: FileChange) -> str:
    diff = fc.patch or ""
    if len(diff) > MAX_DIFF_CHARS:
        diff = diff[:MAX_DIFF_CHARS] + "\n... (diff 已截断)"

    parts = [
        f"## PR 信息",
        f"标题: {pr.title}",
    ]
    if pr.description:
        parts.append(f"描述: {pr.description[:500]}")

    parts += [
        f"",
        f"## 当前文件",
        f"文件名: {fc.filename}",
        f"状态: {fc.status}",
        f"语言: {fc.language}",
    ]

    # 新增：分片上下文
    if fc.context_hint:
        parts.append(f"分片上下文: {fc.context_hint}")

    parts += [
        f"",
        f"## 变更内容 (完整函数/方法/类上下文)",
        f"```{fc.language.lower() if fc.language else ''}",
        f"{diff}",
        f"```",
    ]

    return "\n".join(parts)
```

- [ ] **Step 3: 验证 prompt_builder**

Run: `cd backend && python -c "
from models.review import PRInfo, FileChange
from services.prompt_builder import build_user_prompt
pr = PRInfo(owner='x', repo='y', pull_number=1, title='Test')
fc = FileChange(filename='a.py', status='modified', patch='+x=1', language='Python', context_hint='function foo')
result = build_user_prompt(pr, fc)
print(result)
assert '分片上下文: function foo' in result
print('OK')
"`

- [ ] **Step 4: Commit**

```bash
git add backend/services/diff_parser.py backend/services/prompt_builder.py
git commit -m "refactor: diff_parser 重命名 chunk_pr_simple + prompt_builder 新增 context_hint"
```

---

### Task 9: main.py + scheduler.py — 调用方适配

**Files:**
- Modify: `backend/main.py:227-277` (event_stream)
- Modify: `backend/services/scheduler.py:25-74` (auto_review_pr)

- [ ] **Step 1: 修改 main.py event_stream() 中的 chunk_pr 调用**

```python
# backend/main.py — 替换以下行：
#   from services.diff_parser import chunk_pr
#   chunks = chunk_pr(pr)
# 改为：
from services.chunking import chunk_pr as smart_chunk_pr
from services.database import get_setting

# 在 event_stream() 中：
user_id = get_user_id() or 0
max_chars = int(await get_setting(user_id, "chunk_max_chars", "8000"))
merge_max_chars = int(await get_setting(user_id, "chunk_merge_max_chars", "6000"))
max_lines = int(await get_setting(user_id, "chunk_max_lines", "2000"))
strategy = await get_setting(user_id, "chunk_strategy", "auto")

chunks = await smart_chunk_pr(
    pr, token=get_token(),
    max_chars=max_chars,
    merge_max_chars=merge_max_chars,
    fallback_max_lines=max_lines,
    strategy=strategy,
)
```

- [ ] **Step 2: 修改 scheduler.py auto_review_pr() 中的 chunk_pr 调用**

```python
# backend/services/scheduler.py — 替换以下行：
#   from services.diff_parser import chunk_pr
#   chunks = chunk_pr(pr)
# 改为：
from services.chunking import chunk_pr as smart_chunk_pr
from services.database import get_setting

# 在 auto_review_pr() 中，chunk_pr 调用前：
user_id = _user_id or 0
max_chars = int(await get_setting(user_id, "chunk_max_chars", "8000"))
merge_max_chars = int(await get_setting(user_id, "chunk_merge_max_chars", "6000"))
max_lines = int(await get_setting(user_id, "chunk_max_lines", "2000"))
strategy = await get_setting(user_id, "chunk_strategy", "auto")

chunks = await smart_chunk_pr(
    pr, token=get_token(),
    max_chars=max_chars,
    merge_max_chars=merge_max_chars,
    fallback_max_lines=max_lines,
    strategy=strategy,
)
```

- [ ] **Step 3: 验证后端启动**

Run: `cd backend && python -c "from main import app; print('FastAPI app loaded OK')"`
Expected: 无 import 错误，输出 "FastAPI app loaded OK"

- [ ] **Step 4: Commit**

```bash
git add backend/main.py backend/services/scheduler.py
git commit -m "feat: main.py + scheduler.py 适配智能分片，从 settings 读取策略参数"
```

---

### Task 10: 后端 settings 端点 — 确保 chunk 参数可读写

**Files:**
- Modify: `backend/main.py:364-406` (settings_get + settings_update)

- [ ] **Step 1: settings_get() 添加 chunk 参数的默认返回**

```python
# backend/main.py — settings_get() 修改返回值
return {
    "poll_interval_seconds": kv.get("poll_interval_seconds", "300"),
    "default_provider": kv.get("default_provider", "ollama"),
    "default_model": kv.get("default_model", ""),
    "chunk_max_chars": kv.get("chunk_max_chars", "8000"),       # 新增
    "chunk_merge_max_chars": kv.get("chunk_merge_max_chars", "6000"),  # 新增
    "chunk_max_lines": kv.get("chunk_max_lines", "2000"),       # 新增
    "chunk_strategy": kv.get("chunk_strategy", "auto"),         # 新增
    "email": {
        "smtp_host": email.get("smtp_host", "") if email else "",
        "smtp_port": email.get("smtp_port", 465) if email else 465,
        "username": email.get("username", "") if email else "",
        "password": email.get("password", "") if email else "",
        "to_email": email.get("to_email", "") if email else "",
        "enabled": bool(email.get("enabled")) if email else False,
    },
}
```

- [ ] **Step 2: settings_update() 添加 chunk 参数的保存**

```python
# backend/main.py — settings_update() 中 for key in 列表追加 chunk 键
for key in (
    "poll_interval_seconds", "default_provider", "default_model",
    "chunk_max_chars", "chunk_merge_max_chars", "chunk_max_lines", "chunk_strategy",  # 新增
):
    if key in data:
        await set_setting(user_id, key, str(data[key]))
```

- [ ] **Step 3: Commit**

```bash
git add backend/main.py
git commit -m "feat: settings API 支持 chunk 参数的读/写"
```

---

### Task 11: SettingsPage.tsx — 前端评审策略配置 UI

**Files:**
- Modify: `frontend/src/pages/SettingsPage.tsx`

- [ ] **Step 1: 扩展 Settings 接口**

在 `SettingsPage.tsx` 的 `interface Settings` 中追加：

```typescript
interface Settings {
  poll_interval_seconds: string
  default_provider: string
  default_model: string
  chunk_max_chars: string      // 新增
  chunk_merge_max_chars: string // 新增
  chunk_max_lines: string       // 新增
  chunk_strategy: string        // 新增
  email: {
    smtp_host: string
    smtp_port: number
    username: string
    password: string
    to_email: string
    enabled: boolean
  }
}
```

- [ ] **Step 2: 初始化默认值**

在 `useState<Settings>` 中添加：

```typescript
chunk_max_chars: '8000',
chunk_merge_max_chars: '6000',
chunk_max_lines: '2000',
chunk_strategy: 'auto',
```

- [ ] **Step 3: 在 JSX 中添加「评审策略」section**

在「轮询设置」section 之后、「邮件通知」section 之前插入：

```tsx
{/* 评审策略 */}
<section>
  <h2 className="text-white font-semibold mb-4">评审策略</h2>
  <div className="bg-gray-800 rounded-lg p-5 space-y-4">
    <div>
      <label className="text-gray-400 text-sm block mb-1">分片策略</label>
      <select
        value={settings.chunk_strategy}
        onChange={(e) => update('chunk_strategy', e.target.value)}
        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="auto">自动 (AST → 正则 → 行级)</option>
        <option value="ast">仅 AST (tree-sitter)</option>
        <option value="regex">仅正则</option>
        <option value="line">仅行级</option>
      </select>
      <p className="text-gray-500 text-xs mt-1">
        推荐使用自动模式，系统会自动选择最优分片方式
      </p>
    </div>
    <div>
      <label className="text-gray-400 text-sm block mb-1">Chunk 最大字符数</label>
      <input
        type="number"
        value={settings.chunk_max_chars}
        onChange={(e) => update('chunk_max_chars', e.target.value)}
        min={1000}
        max={32000}
        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
    <div>
      <label className="text-gray-400 text-sm block mb-1">Chunk 合并阈值（字符数）</label>
      <input
        type="number"
        value={settings.chunk_merge_max_chars}
        onChange={(e) => update('chunk_merge_max_chars', e.target.value)}
        min={1000}
        max={32000}
        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p className="text-gray-500 text-xs mt-1">
        相邻小函数累计不超过此值时合并到同一 chunk
      </p>
    </div>
    <div>
      <label className="text-gray-400 text-sm block mb-1">行级兜底最大行数</label>
      <input
        type="number"
        value={settings.chunk_max_lines}
        onChange={(e) => update('chunk_max_lines', e.target.value)}
        min={500}
        max={10000}
        className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <p className="text-gray-500 text-xs mt-1">
        当 AST 和正则均不可用时，按此行数切分
      </p>
    </div>
  </div>
</section>
```

- [ ] **Step 4: 构建前端验证**

Run: `cd frontend && npx tsc --noEmit 2>&1 | head -20`
Expected: 无 TS 类型错误

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/SettingsPage.tsx
git commit -m "feat: 设置页新增评审策略配置 — 分片策略/阈值可调"
```

---

### Task 12: 端到端验证 + 收尾

**Files:** 无新增

- [ ] **Step 1: 安装所有依赖并启动后端**

Run: `cd backend && pip install -r requirements.txt && timeout 5 python -c "from main import app; print('Backend OK')" || true`

- [ ] **Step 2: 运行全部测试**

Run: `cd backend && python -m pytest tests/ -v`
Expected: 所有测试 PASS

- [ ] **Step 3: Commit 最终调整（如有）**

```bash
git add -A
git diff --cached --stat
git commit -m "chore: 智能分片收尾 — 测试通过 + 依赖确认"
```

---

## 实施顺序

```
Task 1 (模型) → Task 2 (依赖) → Task 3 (registry)
                                    ├──→ Task 4 (fetch_file_content)
                                    ├──→ Task 5 (ast_chunker)
                                    ├──→ Task 6 (regex_chunker)
                                    └──→ Task 7 (__init__ 入口)
                                              ↓
                                         Task 8 (diff_parser + prompt)
                                              ↓
                                         Task 9 (main + scheduler)
                                              ↓
                                    ┌── Task 10 (settings API)
                                    └── Task 11 (SettingsPage UI)
                                              ↓
                                         Task 12 (验证)
```
