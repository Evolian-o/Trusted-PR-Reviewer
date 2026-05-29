# 智能分片 (Smart Chunking)

> 将 PR diff 从粗粒度行数切分升级为基于 AST（tree-sitter）的按函数/类边界切分，辅以正则兜底和行级保底的三级退化策略。

## 动机

当前 `diff_parser.chunk_pr()` 按文件 + 2000 行的硬阈值切分，LLM 常收到截断代码——开头和结尾是随机的中间行，缺乏函数签名、类定义等上下文，导致误判（把正常代码标记为 Bug，或漏掉真正的问题）。

## 目标

- **Python / JavaScript / TypeScript / Go**：tree-sitter 解析完整 AST，按函数/类边界切分，每个 chunk 包含完整逻辑单元
- **其他语言**：正则启发式识别函数定义边界（`def`/`function`/`func`/`class`）
- **无法识别的文件**：回退现有行级切分
- 新增 chunk 可配置参数，用户可在前端调整阈值

## 架构

```
backend/services/chunking/
├── __init__.py          # 统一入口 chunk_pr(pr, token, settings) → list[FileChange]
├── ast_chunker.py       # tree-sitter 解析完整文件 → 按函数/类边界切分
├── regex_chunker.py     # 正则兜底 → 按 def/function/func/class 边界切分
└── registry.py          # 语言 → grammar 注册表
```

### 数据流

```
fetch_pr() → PRInfo
     │
     ▼
chunk_pr(pr, token, settings)
     │
     ├─ 语言在 tree-sitter 注册表中？
     │   ├─ Yes → fetch_file_content(owner, repo, ref, path)
     │   │        └─ tree-sitter 解析 AST → diff → AST 节点映射 → chunk_by_ast()
     │   ├─ 解析失败 → 跳到正则
     │   └─ No → 跳到正则
     │
     ├─ 语言有正则规则？
     │   ├─ Yes → chunk_by_regex()
     │   └─ No → 跳到行级
     │
     └─ 行级切分（现有逻辑，MAX_DIFF_LINES）
```

## 分片算法

### AST 节点映射

```
1. tree-sitter 解析完整文件 → AST
2. 遍历 AST 提取函数/类节点的 (name, start_line, end_line)
3. 解析 diff hunk header → 变更行号范围列表
4. 每个变更行号范围向上查找包含它的最小 AST 节点
5. 去重：同一函数内多个 diff 范围合并为一个 chunk
```

### Chunk 归组规则

1. 单函数超过 `chunk_max_chars`（默认 8000）→ 独占一个 chunk，标记 `[large function]`
2. 同一类的成员函数 → 合并到同一 chunk（保有类上下文）
3. 相邻小函数累加 ≤ `chunk_merge_max_chars`（默认 6000）→ 合并
4. 累加超过阈值 → 新开 chunk

### 完整文件获取

```python
# github_adapter.py 新增
async def fetch_file_content(owner, repo, ref, path, token=None):
    """GET /repos/{owner}/{repo}/contents/{path}?ref={ref}"""
```

仅 AST 路径触发此请求。支持语言：Python (`tree-sitter-python`)、JavaScript (`tree-sitter-javascript`)、TypeScript (`tree-sitter-typescript`)、Go (`tree-sitter-go`)。

### 正则兜底

```python
FUNCTION_PATTERNS = {
    "python": r"^(    |\t)?(def |class )",
    "javascript": r"^(function |class |(async )?[\w.]+\s*=\s*(async )?function)",
    "go": r"^func ",
    "rust": r"^fn ",
    "java": r"^\s*(public|private|protected)?\s*(static)?\s*\w+\s+\w+\(",
    # ... 按需扩展
}
```

## 接口设计

```python
# __init__.py
async def chunk_pr(
    pr: PRInfo,
    token: str | None = None,
    settings: dict | None = None,
) -> list[FileChange]:
    """智能分片：AST → 正则 → 行级逐级退化"""
    ...

# ast_chunker.py
def chunk_by_ast(
    file: FileChange,
    full_content: str,
    max_chars: int = 8000,
    merge_max_chars: int = 6000,
) -> list[FileChange]:
    """解析 AST → 映射 diff → 按函数边界切分"""
    ...

# registry.py
SUPPORTED_LANGUAGES: dict[str, str]  # language → grammar package name
def get_parser(language: str) -> Parser | None: ...
```

## Prompt 适配

`build_user_prompt()` 新增可选的 `context_hint` 字段：

```
## 文件信息
- 文件: {filename}
- 语言: {language}
- 分片上下文: {context_hint}     ← 新增

## 变更内容 (完整函数/方法/类上下文)
```{language}
{diff_content}
```

`context_hint` 示例：
- `"class UserService — 方法 create_user() + validate_email()"`
- `"function process_batch() [large function]"`
- `""`（正则/行级兜底时为空）

拆分后的文件名标记从 `"(part N)"` 改为 `"(fn: func_name)"`。

## 可配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `chunk_max_chars` | 8000 | 单个 chunk diff 最大字符数 |
| `chunk_max_lines` | 2000 | 行级兜底最大行数 |
| `chunk_merge_max_chars` | 6000 | 相邻小函数合并阈值 |
| `chunk_strategy` | `auto` | `auto` / `ast` / `regex` / `line` |

存入 `settings` 表，通过 `get_setting()` 读取。

## 文件变更清单

### 新增

| 文件 | 职责 |
|------|------|
| `backend/services/chunking/__init__.py` | 统一入口 + 三级退化调度 |
| `backend/services/chunking/ast_chunker.py` | tree-sitter AST 分片 |
| `backend/services/chunking/regex_chunker.py` | 正则启发式分片 |
| `backend/services/chunking/registry.py` | 语言注册表 |

### 修改

| 文件 | 变更 |
|------|------|
| `backend/services/diff_parser.py` | `chunk_pr()` 改为调用新模块；保留 `filter_patch()` 工具函数 |
| `backend/services/github_adapter.py` | 新增 `fetch_file_content()` |
| `backend/services/prompt_builder.py` | `build_user_prompt()` 新增 `context_hint` 参数 |
| `backend/main.py` | 调用 `chunk_pr()` 时传入 `token` 和 settings |
| `backend/services/scheduler.py` | 同上 |
| `backend/requirements.txt` | 添加 `tree-sitter` |
| `frontend/src/pages/SettingsPage.tsx` | 新增「评审策略」配置 section |

## 不做

- 跨文件上下文注入（独立扩展）
- SYSTEM_PROMPT 评审维度变更
- 增量评审/缓存
- 函数调用关系图谱

## 验证

```bash
# 1. pip install tree-sitter tree-sitter-python tree-sitter-javascript tree-sitter-typescript tree-sitter-go
# 2. 后端启动，确认无 import 错误
# 3. 提交一个 Python PR，观察 chunk 切分结果（SSE progress 中文件标记变为 "fn: xxx"）
# 4. 提交一个非支持语言的 PR，确认回退到行级切分
# 5. 前端设置页调整 chunk_max_chars，确认生效
```
