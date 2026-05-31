# Trusted PR Reviewer · AI 代码评审助手

粘贴 GitHub PR 链接或自动监控仓库 → 多 LLM 模型协作分析 → 生成结构化评审报告。开源、离线可用、一行命令启动。

## 项目亮点

- **多 LLM 协作评审** — OpenAI / DeepSeek / 豆包 / Ollama 多模型同时工作，支持双模型同屏横向对比，一键切换
- **智能代码分片** — tree-sitter AST → 正则 → 行级三级退化策略，按函数/类边界精准切分 diff，覆盖 Python / JS / TS / Go / Rust / Java / C# / Ruby 等 10 种语言
- **全链路流式体验** — SSE 流式推送评审进度，PR 拉取 → 分片 → 并行评审 → 汇总报告，端到端实时可见
- **离线可用** — 默认接入 Ollama 本地模型，无需任何云服务 API Key 即可完成代码评审
- **仓库自动监控** — 定时轮询检测新 PR → 自动触发评审 → 邮件通知，全流程无人值守
- **AI 一键修复** — 评审发现的问题由 AI 生成修复代码，自动提交到 PR 分支
- **纯手写 UI** — 所有组件自主开发，零 UI 组件库依赖

## ✨ 核心功能

| 模块 | 能力 |
|------|------|
| GitHub OAuth | 一键授权登录，自动读取仓库列表，Session 隔离 |
| PR 链接评审 | 粘贴 URL 即刻启动，SSE 流式实时反馈 |
| 仓库监控 | 手动/自动添加仓库，定时调度器检测新 PR |
| 智能分片 | tree-sitter AST → 正则 → 行级三级退化，10 种语言 |
| 多模型评审 | OpenAI / DeepSeek / 豆包 / Ollama / 任意兼容 API |
| 多维度审查 | 安全漏洞 / Bug 风险 / 性能问题 / 代码规范，按需勾选 |
| 评审报告 | Issue 内联注释 + 代码对比 + 置信度 + 评分可视化 |
| AI 修复 | 一键 AI 优化代码 + 提交修复 commit 到 PR 分支 |
| 多模型对比 | 两个 LLM 同屏横向比较评审结果 |
| 一键合并 | 评审通过后页面内直接 Merge PR |
| 分享链接 | 匿名分享报告，无需登录即可查看 |
| PDF 导出 | 评审报告一键导出 PDF |
| 历史趋势 | 仓库多次评审的分数变化趋势图 |
| 邮件通知 | 自动评审完成后 SMTP 邮件通知 |
| 国际化 | 中英文双语切换，~250 键完整覆盖 |

## 🏗️ 技术架构

```
Trusted PR Reviewer
├── frontend/    React 19 + TypeScript + Vite + TailwindCSS
│   ├── SSE EventSource   评审流式渲染 + 分阶段状态机
│   ├── React Context     GitHub OAuth 登录态管理
│   └── i18next           中英双语国际化
└── backend/     Python 3.11 + FastAPI + SQLite
    ├── 评审编排   拉取 PR → 分片 → 并行评审 → 汇总报告
    ├── 分片引擎   tree-sitter AST / 正则 / 行级三级退化
    ├── LLM 插件   7 个可插拔 Provider（OpenAI 兼容基类抽象）
    ├── 调度器     每用户独立定时轮询 + 启动自动恢复
    ├── GitHub 适配 REST + GraphQL 双通道，含速率限制感知
    └── 邮件通知   aiosmtplib，SMTP 域名智能匹配
```

## 🚀 快速开始

```bash
# 1. 环境变量
cp backend/.env.example backend/.env
# 编辑 .env，填入 GitHub OAuth App 凭据；用 Ollama 可跳过 LLM Key

# 2. 一键启动
cd backend
pip install -r requirements.txt
python main.py              # http://localhost:8000
```

打开 `http://localhost:8000` → GitHub 登录 → 粘贴 PR 链接或添加仓库 → 开始评审。

> 前端开发模式：`cd frontend && npm install && npm run dev`，`localhost:5173` 自动代理 API 到后端。

### 环境变量（backend/.env）

| 变量 | 说明 |
|------|------|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth App 凭据 |
| `GITHUB_REDIRECT_URI` | OAuth 回调地址（`http://localhost:8000/api/auth/callback`） |
| `ENCRYPTION_SECRET` | Fernet AES 密钥：`python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())"` |
| `DEEPSEEK_API_KEY` / `DOUBAO_API_KEY` / `OPENAI_API_KEY` | LLM API Key（至少配一个，或用 Ollama 跳过） |

> Ollama 用户：安装 [Ollama](https://ollama.com) 后，在设置页添加 Ollama Provider 即可离线评审，无需任何 API Key。

## 📦 第三方依赖

### 后端

| 依赖 | 版本 | 用途 |
|------|------|------|
| FastAPI | 0.115 | Web 框架 |
| uvicorn | 0.34 | ASGI 服务器 |
| aiohttp | 3.11 | 异步 HTTP（GitHub API） |
| httpx | 0.28 | HTTP 客户端（LLM API） |
| pydantic | 2.10 | 数据校验 |
| sse-starlette | 2.2 | SSE 流式推送 |
| aiosqlite | 0.22 | SQLite 异步驱动 |
| aiofiles | 24.1 | 异步文件 IO |
| aiosmtplib | 3.0 | SMTP 邮件 |
| APScheduler | 3.10 | 定时调度 |
| cryptography | ≥44.0 | Fernet 加密 |
| tree-sitter + 8 语言包 | ≥0.23 | AST 语法解析 |

### 前端

| 依赖 | 版本 | 用途 |
|------|------|------|
| React | 19 | UI 框架 |
| TypeScript | 6.0 | 类型系统 |
| Vite | 8 | 构建工具 |
| TailwindCSS | 4 | 原子化 CSS |
| react-router-dom | 7 | 前端路由 |
| react-i18next | 15 | 国际化 |
| i18next | 24 | 翻译引擎 |

所有 UI 组件手写，零组件库依赖。

## 🛠️ 原创功能

### 后端

| 模块 | 文件 | 说明 |
|------|------|------|
| 评审编排 | `services/review_orchestrator.py` | 拉取 PR → 分片 → 并行评审 → 汇总全流程 |
| AST 分片器 | `services/chunking/ast_chunker.py` | tree-sitter 按函数/类边界切分 diff |
| 正则分片器 | `services/chunking/regex_chunker.py` | 正则识别函数声明，AST 退化兜底 |
| 分片注册表 | `services/chunking/registry.py` | 10 语言 AST 节点 + 正则 + 注释语法注册 |
| LLM Provider 插件 | `services/llm_providers/` (7 文件) | OpenAI 兼容基类 + 工厂注册 + 各厂商适配 |
| Prompt 构造 | `services/prompt_builder.py` | 评审维度 + 语言 + 上下文动态组装 |
| 结果格式化 | `services/result_formatter.py` | LLM 输出 → 结构化 JSON，含容错解析 |
| 定时调度器 | `services/scheduler.py` | 每用户独立调度器 + 启动自动恢复 |
| GitHub 适配层 | `services/github_client.py` | REST + GraphQL 双通道 + 速率限制感知 |
| AI 修复 | `services/pr_fixer.py` | AI 生成修复 → commit → 推送 PR 分支 |
| 认证中间件 | `services/auth_middleware.py` | Session 校验 + 用户隔离 |
| 路由系统 | `routers/` (8 文件) | RESTful API 自主设计 |
| 数据模型 | `schemas.py` | 请求/响应 Schema 自主设计 |

### 前端

| 模块 | 文件 | 说明 |
|------|------|------|
| 评审报告页 | `pages/ReviewReportPage.tsx` | SSE 流式渲染 + 状态机 + 缓存回退 |
| 仪表盘 | `pages/DashboardPage.tsx` | 仓库搜索 + 监控管理 + 调度器卡片 |
| 设置页 | `pages/SettingsPage.tsx` | Provider CRUD + 通知 + 分片策略 + 语言 |
| PR 输入页 | `pages/PRInputPage.tsx` | URL 解析 + 模型选择 + 维度勾选 |
| 历史页 | `pages/HistoryPage.tsx` | 搜索 + 日期筛选 + 趋势分析 |
| 分享页 | `pages/SharePage.tsx` | 匿名报告查看 |
| UI 组件 | `components/` (20+) | ReportHeader / IssueCard / DiffViewer / ComparePanel 等 |
| 国际化 | `i18n/` | ~250 键中英双语 |
| Auth Context | `contexts/AuthContext.tsx` | GitHub OAuth 登录态管理 |

### 数据库

SQLite 9 表（users / user_sessions / repos / monitored_repos / reviews / review_files / review_issues / llm_providers / user_settings）自主设计，含完整索引与迁移。

---

## 项目结构

```
backend/
├── main.py                    # FastAPI 入口 + lifespan + 前端托管
├── schemas.py                 # Pydantic 模型
├── routers/                   # 8 个路由模块
│   ├── auth.py                #   GitHub OAuth
│   ├── repos.py               #   仓库 + 监控
│   ├── review.py              #   SSE 流式评审
│   ├── history.py             #   评审历史
│   ├── providers.py           #   LLM Provider
│   ├── scheduler.py           #   调度器
│   ├── settings.py            #   用户配置
│   └── health.py              #   健康检查
├── services/
│   ├── review_orchestrator.py #   主流程编排
│   ├── chunking/              #   分片引擎 (AST/正则/行级)
│   ├── llm_providers/         #   7 个 LLM Provider
│   ├── scheduler.py           #   定时轮询
│   ├── github_client.py       #   GitHub API
│   ├── email_notifier.py      #   邮件通知
│   ├── prompt_builder.py      #   Prompt 构造
│   ├── result_formatter.py    #   结果格式化
│   └── pr_fixer.py            #   AI 修复
└── tests/                     # pytest 50+ 用例

frontend/
├── src/
│   ├── pages/                 # 7 页面
│   ├── components/            # 20+ 组件
│   ├── i18n/                  # zh.json / en.json
│   ├── services/api.ts        # HTTP 层
│   ├── contexts/              # Auth Context
│   └── utils/                 # 工具函数
└── vite.config.ts
```

## 开发约定

- Feature 分支 → PR → `main`
- 提交前：`pytest tests/ -v` 全绿 + `npx tsc --noEmit` 零错误
- commit: `type: description`（feat / fix / refactor / docs / test）
- main 保持可部署
