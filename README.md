# Trusted PR Reviewer

AI 驱动的 GitHub Pull Request 代码评审工具。配置仓库后**后台全自动监控**，发现新 PR 即刻触发多 LLM 并行评审 + 邮件通知；评审结果推送**人工决策**——合并、修复或驳回，让 AI 处理重复劳动，人专注关键判断。

## Demo 视频

[![Demo 视频](https://img.shields.io/badge/bilibili-00a1d6?style=for-the-badge&logo=bilibili&logoColor=white)](https://www.bilibili.com/video/BV1QGVQ6AECZ/)

## 功能

| 模块 | 说明 |
|------|------|
| GitHub OAuth 登录 | 一键授权，自动读取仓库列表 |
| PR 链接评审 | 粘贴 PR URL，SSE 流式实时反馈评审进度 |
| 仓库自动监控 | 添加仓库后定时检测新 PR，自动触发评审 |
| 智能代码分片 | tree-sitter AST → 正则 → 行级三级退化，覆盖 10 种语言 |
| 多模型支持 | OpenAI / DeepSeek / 豆包 / Ollama / 兼容 OpenAI 接口的任意模型 |
| 多维度审查 | 安全漏洞 / Bug 风险 / 性能问题 / 代码规范，按需勾选 |
| 评审报告 | Issue 内联评论 + 代码对比 + 置信度 + 评分可视化 |
| AI 修复 | 一键生成修复代码并提交到 PR 分支 |
| 多模型对比 | 两个 LLM 同屏横向比较评审结果 |
| 一键合并 | 评审通过后在页面内直接 Merge PR |
| 分享链接 | 匿名分享报告，无需登录查看 |
| PDF 导出 | 评审报告导出为 PDF |
| 历史趋势 | 仓库多次评审的分数变化趋势图 |
| 邮件通知 | 评审完成后自动发送邮件通知 |
| 中英文切换 | 顶栏 + 设置页双入口，~250 键完整覆盖 |

## 快速开始

### 1. 配置环境变量

```bash
cp backend/.env.example backend/.env
```

编辑 `backend/.env`：

```
GITHUB_CLIENT_ID=你的_Client_ID
GITHUB_CLIENT_SECRET=你的_Client_Secret
GITHUB_REDIRECT_URI=http://localhost:8000/api/auth/callback
ENCRYPTION_SECRET=运行 python -c "from cryptography.fernet import Fernet;print(Fernet.generate_key().decode())" 生成

# 至少配置一个 LLM API Key（使用 Ollama 可跳过）
DEEPSEEK_API_KEY=sk-xxxx
DOUBAO_API_KEY=your-key
OPENAI_API_KEY=sk-xxxx
```

### 2. 启动

```bash
cd backend
pip install -r requirements.txt
python main.py
```

浏览器访问 `http://localhost:8000` → GitHub 登录 → 粘贴 PR 链接或添加仓库 → 开始评审。

> 如果使用 [Ollama](https://ollama.com) 本地模型，无需配置任何 API Key，在设置页添加 Ollama Provider 即可。

> 前端开发模式：`cd frontend && npm install && npm run dev`，访问 `http://localhost:5173`。

## 技术栈

**后端**
- FastAPI + uvicorn
- aiosqlite (SQLite 异步驱动)
- APScheduler (定时任务调度)
- tree-sitter (AST 语法解析，8 个语言包)
- cryptography (Fernet AES 加密)
- aiosmtplib (邮件通知)

**前端**
- React 19 + TypeScript
- Vite + TailwindCSS
- react-router-dom (前端路由)
- react-i18next (国际化)
- SSE EventSource (流式数据)

## 项目结构

```
backend/
├── main.py                    # FastAPI 入口 + 前端静态文件托管
├── schemas.py                 # Pydantic 数据模型
├── routers/                   # 8 个路由模块
│   ├── auth.py                # GitHub OAuth 登录
│   ├── repos.py               # 仓库列表 + 监控管理
│   ├── review.py              # SSE 流式评审
│   ├── history.py             # 评审历史
│   ├── providers.py           # LLM 提供商管理
│   ├── scheduler.py           # 定时调度器
│   ├── settings.py            # 用户配置
│   └── health.py              # 健康检查
├── services/
│   ├── review_orchestrator.py # 评审主流程编排
│   ├── chunking/              # 代码分片引擎 (AST / 正则 / 行级)
│   ├── llm_providers/         # LLM Provider 插件系统 (7 文件)
│   ├── scheduler.py           # 定时轮询自动评审
│   ├── github_client.py       # GitHub REST + GraphQL API
│   ├── email_notifier.py      # 邮件通知
│   ├── prompt_builder.py      # 动态 Prompt 构造
│   ├── result_formatter.py    # 评审结果格式化
│   └── pr_fixer.py            # AI 自动修复
└── tests/                     # pytest (50+ 测试用例)

frontend/
├── src/
│   ├── pages/                 # 7 个页面
│   ├── components/            # 20+ UI 组件
│   ├── i18n/                  # 中英双语翻译
│   ├── services/api.ts        # HTTP 请求层
│   ├── contexts/              # Auth Context
│   └── utils/                 # 工具函数
└── vite.config.ts
```

## 开发约定

- 从 `main` 开 feature 分支，通过 PR 合并
- 提交前：`pytest tests/ -v` 全绿，`npx tsc --noEmit` 零错误
- Commit 格式：`feat:` / `fix:` / `refactor:` / `docs:` / `test:`
- `main` 分支始终保持可部署状态

## 许可证

[MIT](LICENSE)
