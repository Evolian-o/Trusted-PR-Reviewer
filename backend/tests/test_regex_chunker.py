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
        assert len(ranges) >= 1

    def test_empty_diff(self):
        pattern = r"^(?:    |\t)?(?:def |class )"
        ranges = _split_diff_by_line_pattern("", pattern, fallback_max_lines=10)
        assert isinstance(ranges, list)


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

    def test_empty_patch(self):
        fc = FileChange(
            filename="empty.py",
            status="added",
            patch="",
            language="Python",
        )
        pattern = r"^(?:    |\t)?(?:def |class )"
        chunks = chunk_by_regex(fc, pattern)
        assert len(chunks) == 1
        assert chunks[0].filename == "empty.py"

    def test_context_hint_contains_fn_name(self):
        fc = FileChange(
            filename="b.py",
            status="modified",
            patch="@@ -1,3 +1,4 @@\n def foo():\n+    pass\n     return 1",
            language="Python",
        )
        pattern = r"^(?:    |\t)?(?:def |class )"
        chunks = chunk_by_regex(fc, pattern)
        assert len(chunks) == 1
        assert "foo" in chunks[0].context_hint
