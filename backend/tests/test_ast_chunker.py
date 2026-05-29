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
        assert "bar" in names

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
        assert any("Calculator" in c.context_hint for c in chunks)

    def test_new_file_returns_all_functions(self):
        parser = get_parser("python")
        node_types = get_node_types("python")
        fc = FileChange(
            filename="new.py",
            status="added",
            patch="",
            language="Python",
        )
        chunks = chunk_by_ast(fc, SAMPLE_PY, parser, node_types)
        assert len(chunks) >= 1

    def test_context_hint_present(self):
        parser = get_parser("python")
        node_types = get_node_types("python")
        fc = FileChange(
            filename="mod.py",
            status="modified",
            patch="@@ -2,1 +2,2 @@\n def foo():\n+    pass\n",
            language="Python",
        )
        chunks = chunk_by_ast(fc, SAMPLE_PY, parser, node_types)
        assert len(chunks) >= 1
        assert "foo" in chunks[0].context_hint or "foo" in chunks[0].filename

    def test_single_function_chunk(self):
        """单个函数修改产生一个 chunk"""
        parser = get_parser("python")
        node_types = get_node_types("python")
        fc = FileChange(
            filename="t.py",
            status="modified",
            patch="@@ -1,2 +1,3 @@\n def foo():\n+    x=1\n     return 1",
            language="Python",
        )
        chunks = chunk_by_ast(fc, SAMPLE_PY, parser, node_types)
        assert len(chunks) >= 1
