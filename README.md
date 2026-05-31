# Trusted PR Reviewer · AI 代码评审助手

AI 驱动的 GitHub Pull Request 智能评审工具 —— 输入 PR 链接或自动监控仓库，多 LLM 模型协作分析，生成结构化评审报告。让代码审查效率提升 10 倍。

## 项目亮点

- **多 LLM 模型协作评审**：支持 OpenAI / DeepSeek / 豆包 / Ollama 多模型，可双模型同屏横向对比，一键切换
- **智能代码分片引擎**：tree-sitter AST → 正则 → 行级三级退化策略，按函数/类边界精准切分 diff，覆盖 10 种编程语言
- **全链路流式评审体验**：SSE 流式实时反馈，PR 拉取 → 分片 → 并行评审 → 汇总报告，端到端可见进度
- **零配置离线可用**：默认 Ollama 本地模型，无需任何 API Key 即可完成代码评审
- **仓库自动监控**：定时轮询检测新 PR，自动触发评审 + 邮件通知，全流程无人值守
- **AI 一键修复**：评审发现的问题可由 AI 生成修复代码，直接提交到 PR 分支
- **国际化双语言**：中英文双语切换，顶栏 + 设置页双入口，~250 键完整覆盖
- **纯手写 UI**：所有组件自主开发，未引入 shadcn/ui、antd 等任何 UI 组件库

## ✨ 核心功能

| 模块 | 能力 |
|------|------|
| GitHub OAuth 登录 | 一键授权，自动读取仓库列表，Session 隔离 |
| PR 链接评审 | 粘贴 URL 即可启动 AI 评审，SSE 流式实时反馈 |
| 仓库监控 | 手动/自动添加仓库，定时检测新 PR 并自动评审 |
| 智能分片 | tree-sitter AST → 正则 → 行级三级退化，10 种语言 |
| 多模型评审 | OpenAI / DeepSeek / 豆包 / Ollama / 任意兼容 API |
| 多维度审查 | 安全漏洞 / Bug 风险 / 性能问题 / 代码规范，按需勾选 |
| 评审报告 | Issue 内联 + 代码对比 + 置信度 + 评分可视化 |
| AI 修复 | 一键 AI 优化代码 + 润色评审意见 + 提交修复到 PR |
| 多模型对比 | 两个 LLM 同屏横向比较评审结果 |
| 一键合并 | 评审通过后直接在页面内合并 PR |
| 分享链接 | 匿名分享评审报告，无需登录即可查看 |
| PDF 导出 | 评审报告导出为 PDF |
| 历史趋势 | 仓库多次评审的分数变化趋势图 |
| 邮件通知 | 自动评审完成后邮件通知，SMTP 域名智能匹配 |
| 国际化 | 中英文双语切换，顶栏 + 设置页双入口 |

## 🏗️ 技术架构

```
Trusted PR Reviewer
├── frontend/   React 19 + TypeScript 6 + Vite 8 + TailwindCSS 4
│   ├── SSE EventSource   评审进度流式渲染
│   ├── React Context     GitHub OAuth 登录态管理
│   └── i18next           中英双语国际化 (~250 键)
└── backend/    Python 3.11 + FastAPI + SQLite
    ├── 评审编排   review_orchestrator   PR → 分片 → 并行评审 → 汇总
    ├── 分片引擎   tree-sitter AST / 正则 / 行级三级退化
    ├── LLM 插件   7 个可插拔 Provider（OpenAI 兼容基类 + 工厂注册）
    ├── 调度器     APScheduler  每用户独立定时轮询
    ├── GitHub 适配 REST + GraphQL 双通道，含速率限制感知
    └── 邮件通知   aiosmtplib  SMTP 域名智能匹配
```

## 🚀 快速开始

```bash
# 1. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 GitHub OAuth App 凭据
# 至少配一个 LLM API Key（DeepSeek/豆包/OpenAI），或用 Ollama 零配置启动

# 2. 一键启动
cd backend
pip install -r requirements.txt
python main.py              # http://localhost:8000
```

打开 `http://localhost:8000` → GitHub 登录 → 添加仓库 → 开始评审。

> **开发模式**：如需修改前端代码，`cd frontend && npm install && npm run dev` 启动 `localhost:5173`，API 自动代理到后端 8000 端口。

### 环境变量（backend/.env）

| 变量 | 说明 | 示例 |
|------|------|------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App Client ID | `your_github_client_id` |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App Client Secret | `your_github_client_secret` |
| `GITHUB_REDIRECT_URI` | OAuth 回调地址 | `http://localhost:8000/api/auth/callback` |
| `FRONTEND_URL` | 前端地址 | `http://localhost:5173` |
| `ENCRYPTION_SECRET` | Fernet AES 加密密钥 | `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | `sk-your-deepseek-key` |
| `DOUBAO_API_KEY` | 豆包 API Key | `your-doubao-key` |
| `OPENAI_API_KEY` | OpenAI API Key | `sk-your-openai-key` |

> **Ollama 用户**：无需配置任何 LLM API Key，安装 [Ollama](https://ollama.com) 后在设置页添加 Ollama Provider 即可离线评审。

## 📦 第三方库与框架

### 后端

| 库 | 版本 | 用途 |
|------|------|------|
| FastAPI | 0.115 | Web 框架 + SSE 流式响应 |
| uvicorn | 0.34 | ASGI 服务器 |
| aiohttp | 3.11 | 异步 HTTP 客户端（GitHub API 调用） |
| httpx | 0.28 | HTTP 客户端（LLM API 调用） |
| pydantic | 2.10 | 数据校验 / 请求模型 |
| sse-starlette | 2.2 | SSE 服务端推送 |
| aiosqlite | 0.22 | SQLite 异步驱动 |
| aiofiles | 24.1 | 异步文件 IO（托管前端静态文件） |
| aiosmtplib | 3.0 | SMTP 邮件发送 |
| APScheduler | 3.10 | 定时任务调度 |
| cryptography | ≥44.0 | Fernet AES 加密（API Key） |
| tree-sitter + 8 语言包 | ≥0.23 | AST 代码语法解析 |

### 前端

| 库 | 版本 | 用途 |
|------|------|------|
| React | 19 | 核心 UI 框架 |
| TypeScript | 6.0 | 静态类型 |
| Vite | 8 | 构建工具 |
| TailwindCSS | 4 | 原子化样式 |
| react-router-dom | 7 | 前端路由 |
| react-i18next | 15 | 国际化 |
| i18next + browser-languagedetector | 24 | 翻译引擎 + 语言检测 |

无引入任何 UI 组件库（shadcn/ui、antd、arco、element-plus 等），所有 UI 组件均手写。

## 🛠️ 原创功能说明

以下功能为本项目自主设计与实现，未直接使用第三方 SDK 或模板：

### 后端原创模块

| 模块 | 文件 | 说明 |
|------|------|------|
| 评审主流程编排 | `services/review_orchestrator.py` | 拉取 PR → 分片 → 并行评审 → 汇总的全流程编排逻辑 |
| AST 智能分片器 | `services/chunking/ast_chunker.py` | tree-sitter 解析语法树，按函数/类边界精准切分 diff hunk |
| 正则分片器 | `services/chunking/regex_chunker.py` | 按语言特定正则模式识别函数声明边界，AST 退化方案的兜底 |
| 分片策略注册表 | `services/chunking/registry.py` | 10 语言的 AST 节点类型 + 正则模式 + 注释语法统一注册 |
| LLM Provider 插件系统 | `services/llm_providers/` (7 文件) | OpenAI 兼容基类抽象 + 动态工厂注册 + DeepSeek/豆包/Ollama 差异化适配 |
| 动态 Prompt 构造 | `services/prompt_builder.py` | 按评审维度 + 文件语言 + 上下文信息动态组装 System Prompt |
| 评审结果格式化 | `services/result_formatter.py` | LLM 原始输出 → 结构化 JSON 报告，含容错解析和缺失字段补全 |
| 定时调度器 | `services/scheduler.py` | 每用户独立调度器，启动自动恢复，整合 8 路由的状态查询/启停接口 |
| GitHub 适配层 | `services/github_client.py` | REST + GraphQL 双通道封装，含 Token 速率限制感知和错误分类 |
| AI 自动修复 | `services/pr_fixer.py` | AI 重写代码 → 生成 commit → 推送 PR 分支 |
| Session 认证中间件 | `services/auth_middleware.py` | FastAPI middleware 拦截 + Session 校验 + 用户隔离 |
| 8 个路由模块 | `routers/` (8 文件) | RESTful API 端点全部自主设计 |
| Pydantic 数据模型 | `schemas.py` | 请求/响应 Schema 自主设计 |

### 前端原创模块

| 模块 | 文件 | 说明 |
|------|------|------|
| 评审报告页 | `pages/ReviewReportPage.tsx` | SSE 流式渲染 + 分阶段状态机 + 缓存回退 |
| 仪表盘 | `pages/DashboardPage.tsx` | 仓库搜索 + 手动添加监控 + 调度器状态卡片 |
| 设置页 | `pages/SettingsPage.tsx` | Provider CRUD + 通知配置 + 分片策略 + 语言切换 |
| PR 输入页 | `pages/PRInputPage.tsx` | URL 解析 + 模型选择 + 维度勾选 → 发起评审 |
| 评审历史页 | `pages/HistoryPage.tsx` | 关键词搜索 + 日期范围筛选 + 趋势分析表 |
| 分享页 | `pages/SharePage.tsx` | 无需登录的匿名报告查看 |
| 20+ UI 组件 | `components/` | ReportHeader / IssueCard / DiffViewer / RewrittenCodeSection / ExportToolbar / ComparePanel 等全部自主开发 |
| 国际化 | `i18n/` | ~250 键中英双语翻译内容 |
| Auth Context | `contexts/AuthContext.tsx` | React Context 封装 GitHub OAuth 登录态管理 |

### 数据库设计

SQLite 表结构（users / user_sessions / repos / monitored_repos / reviews / review_files / review_issues / llm_providers / user_settings）全部自主设计，包含完整的索引和迁移逻辑。

---

## 项目结构

```
backend/
├── main.py                     # FastAPI 入口 + lifespan + 前端托管
├── schemas.py                  # Pydantic 请求/响应模型
├── routers/                    # 8 个路由模块
│   ├── auth.py                 #   GitHub OAuth 登录
│   ├── repos.py                #   仓库列表 + 监控管理
│   ├── review.py               #   SSE 流式评审
│   ├── history.py              #   评审历史
│   ├── providers.py            #   LLM 提供商管理
│   ├── scheduler.py            #   定时调度器
│   ├── settings.py             #   用户配置 (轮询/邮件/分片)
│   └── health.py               #   健康检查
├── services/
│   ├── review_orchestrator.py  #   评审主流程编排
│   ├── chunking/               #   智能分片 (AST / 正则 / 行级)
│   ├── llm_providers/          #   7 个可插拔 LLM Provider
│   ├── scheduler.py            #   定时轮询自动评审
│   ├── github_client.py        #   GitHub REST + GraphQL API
│   ├── email_notifier.py       #   邮件通知
│   ├── prompt_builder.py       #   动态 Prompt 构造
│   ├── result_formatter.py     #   LLM 输出解析
│   └── pr_fixer.py             #   AI 自动修复代码
└── tests/                      # pytest (50+ 测试用例)

frontend/
├── src/
│   ├── pages/                  # 7 个页面
│   ├── components/             # 20+ 子组件
│   ├── i18n/                   # 国际化翻译 (zh.json / en.json)
│   ├── services/api.ts         # HTTP 请求层
│   ├── contexts/               # Auth React Context
│   └── utils/                  # 工具函数
└── vite.config.ts
```

## 开发约定

- 从 `main` 开 feature 分支开发，PR 合并
- 提交前：`backend/` 跑 `pytest tests/ -v` 全绿，`frontend/` 跑 `npx tsc --noEmit` 零错误
- commit 格式: `type: description` (feat / fix / refactor / docs / test)
- main 分支保持可部署状态
