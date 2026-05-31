# Trusted PR Reviewer

AI 驱动的 GitHub Pull Request 代码评审工具。输入 PR 链接或自动监控仓库，通过多 LLM 模型分析，生成结构化评审报告。

## 功能

| 模块 | 能力 |
|------|------|
| GitHub OAuth | 登录即授权，自动读取仓库列表 |
| PR 链接评审 | 粘贴 URL 即可启动 AI 评审，SSE 流式实时反馈 |
| 仓库监控 | 手动/自动添加仓库，调度器定时检测新 PR 并自动评审 |
| 智能分片 | tree-sitter AST -> 正则 -> 行级三级退化，10 种语言 |
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

---

## 第三方依赖

### 后端 (Python)

| 依赖 | 许可证 | 用途 |
|------|--------|------|
| FastAPI | MIT | Web 框架 |
| uvicorn | BSD | ASGI 服务器 |
| aiohttp | Apache 2.0 | 异步 HTTP 客户端 (GitHub API 调用) |
| httpx | BSD | HTTP 客户端 (LLM API 调用) |
| pydantic | MIT | 数据校验 / 请求模型 |
| sse-starlette | BSD | SSE 服务端推送 |
| aiosqlite | MIT | SQLite 异步驱动 |
| aiosmtplib | MIT | SMTP 邮件发送 |
| APScheduler | MIT | 定时任务调度 |
| cryptography | Apache 2.0 / BSD | Fernet AES 加密 (API Key) |
| tree-sitter + 8 语言包 | MIT | AST 代码语法解析 |

### 前端 (Node.js)

| 依赖 | 许可证 | 用途 |
|------|--------|------|
| React + ReactDOM | MIT | UI 框架 |
| react-router-dom | MIT | 前端路由 |
| react-i18next | MIT | 国际化 (i18next 生态) |
| i18next + i18next-browser-languagedetector | MIT | 翻译引擎 + 语言检测 |
| Vite | MIT | 构建工具 |
| TypeScript | Apache 2.0 | 类型系统 |
| Tailwind CSS | MIT | CSS 工具类框架 |
| PostCSS + autoprefixer | MIT | CSS 后处理 |

---

## 原创功能说明

本项目在上述第三方库/框架基础之上，独立设计开发了以下核心功能模块：

### 后端原创模块

| 模块 | 文件 | 性质 |
|------|------|------|
| 评审主流程编排 | `services/review_orchestrator.py` | **原创** — 拉取 PR → 分片 → 并行评审 → 汇总的全流程编排逻辑 |
| AST 智能分片器 | `services/chunking/ast_chunker.py` | **原创** — 利用 tree-sitter 解析语法树，将 diff hunk 按函数/类边界精准切分 |
| 正则分片器 | `services/chunking/regex_chunker.py` | **原创** — 按语言特定正则模式识别函数声明边界，作为 AST 退化方案的兜底 |
| 分片策略注册表 | `services/chunking/registry.py` | **原创** — 10 语言的 AST 节点类型 + 正则模式 + 注释语法统一注册 |
| LLM 提供商插件系统 | `services/llm_providers/` (7 文件) | **原创** — OpenAI 兼容基类抽象 + 动态工厂注册 + DeepSeek/豆包/Ollama 差异化适配 |
| 动态 Prompt 构造 | `services/prompt_builder.py` | **原创** — 按用户选择的评审维度 + 文件语言 + 上下文信息动态组装 System Prompt |
| 评审结果格式化 | `services/result_formatter.py` | **原创** — LLM 原始输出 → 结构化 JSON 报告，含容错解析和缺失字段补全 |
| 定时调度器 | `services/scheduler.py` | **原创** — 每用户独立调度器，启动时自动恢复，整合 8 路由的状态查询/启停接口 |
| GitHub 适配层 | `services/github_client.py` | **原创** — REST + GraphQL 双通道封装，含 Token 速率限制感知和错误分类 |
| AI 自动修复 | `services/pr_fixer.py` | **原创** — 将 AI 重写代码生成 commit → 推送到 PR 分支 |
| Session 认证中间件 | `services/auth_middleware.py` | **原创** — FastAPI middleware 拦截 + Session 校验 + 用户隔离 |
| 8 路由模块 | `routers/` (8 文件) | **原创** — RESTful API 端点全部自主设计 |
| Pydantic 数据模型 | `schemas.py` | **原创** — 请求/响应 Schema 自主设计 |

### 前端原创模块

| 模块 | 文件 | 性质 |
|------|------|------|
| 评审报告页 | `pages/ReviewReportPage.tsx` | **原创** — SSE 流式渲染 + 分阶段状态机 + 缓存回退 |
| 仪表盘 | `pages/DashboardPage.tsx` | **原创** — 仓库搜索 + 手动添加监控 + 调度器状态卡片 |
| 设置页 | `pages/SettingsPage.tsx` | **原创** — Provider CRUD + 通知配置 + 分片策略 + 语言切换 |
| PR 输入页 | `pages/PRInputPage.tsx` | **原创** — URL 解析 + 模型选择 + 维度勾选 → 发起评审 |
| 评审历史页 | `pages/HistoryPage.tsx` | **原创** — 关键词搜索 + 日期范围筛选 + 趋势分析表 |
| 分享页 | `pages/SharePage.tsx` | **原创** — 无需登录的匿名报告查看 |
| 20+ UI 组件 | `components/` | **原创** — ReportHeader / IssueCard / DiffViewer / RewrittenCodeSection / ExportToolbar / ComparePanel 等全部自主开发 |
| i18n 国际化 | `i18n/` | **原创翻译内容** (~250 键中英双语，翻译引擎基于 i18next) |
| Auth Context | `contexts/AuthContext.tsx` | **原创** — React Context 封装 GitHub OAuth 登录态管理 |

### 数据库设计

SQLite 表结构（users / user_sessions / repos / monitored_repos / reviews / review_files / review_issues / llm_providers / user_settings）全部自主设计，包含完整的索引和迁移逻辑。

---

## 快速启动

```bash
# 1. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 GitHub OAuth App 凭据 + LLM API Key

# 2. 后端
cd backend
pip install -r requirements.txt
python main.py              # http://localhost:8000

# 3. 前端
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

打开 http://localhost:5173 -> GitHub 登录 -> 添加仓库 -> 开始评审。

---

## 项目结构

```
backend/
├── main.py                  # FastAPI 入口 + lifespan
├── schemas.py               # Pydantic 请求/响应模型
├── routers/                 # 8 个路由模块
│   ├── auth.py              #   GitHub OAuth 登录
│   ├── repos.py             #   仓库列表 + 监控管理
│   ├── review.py            #   SSE 流式评审
│   ├── history.py           #   评审历史
│   ├── providers.py         #   LLM 提供商管理
│   ├── scheduler.py         #   定时调度器
│   ├── settings.py          #   用户配置 (轮询/邮件/分片)
│   └── health.py            #   健康检查
├── services/
│   ├── review_orchestrator.py  # 评审主流程编排
│   ├── chunking/               # 智能分片 (AST / 正则 / 行级)
│   ├── llm_providers/          # 7 个可插拔 LLM Provider
│   ├── scheduler.py            # 定时轮询自动评审
│   ├── github_client.py        # GitHub REST + GraphQL API
│   ├── email_notifier.py       # 邮件通知
│   ├── prompt_builder.py       # 动态 Prompt 构造
│   ├── result_formatter.py     # LLM 输出解析
│   └── pr_fixer.py             # AI 自动修复代码
└── tests/                  # pytest (50+ 测试用例)

frontend/
├── src/
│   ├── pages/              # 7 个页面 (Login / Dashboard / PRInput / Review / History / Settings / Share)
│   ├── components/         # 20+ 子组件
│   ├── i18n/               # 国际化翻译文件 (zh.json / en.json)
│   ├── services/api.ts     # HTTP 请求层
│   ├── contexts/           # Auth React Context
│   └── utils/              # 工具函数
└── vite.config.ts
```

## 开发约定

- 从 main 开 feature 分支开发，PR 合并
- 提交前：`backend/` 跑 `pytest tests/ -v` 全绿，`frontend/` 跑 `npx tsc --noEmit` 零错误
- commit 格式: `type: description` (feat / fix / refactor / docs / test)
- main 分支保持可部署状态
