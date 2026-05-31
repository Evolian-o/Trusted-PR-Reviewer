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

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS |
| 国际化 | react-i18next (中英文 ~250 翻译键) |
| 后端 | FastAPI + SSE 流式响应 |
| 数据库 | SQLite (aiosqlite) |
| 认证 | GitHub OAuth + Session |
| 分片 | tree-sitter AST (Python / JS / TS / Go / Rust / Java / C# / Ruby / C / C++) |
| 加密 | Fernet AES (API Key) |
| 邮件 | aiosmtplib |
| 调度 | APScheduler (每用户独立实例) |
| 测试 | pytest (50+ 用例) |

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
