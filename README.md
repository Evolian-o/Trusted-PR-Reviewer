# Trusted-PR-Reviewer

AI 驱动的 PR 智能评审工具。输入 GitHub PR 链接，自动获取代码变更并通过多种 LLM 模型分析，生成结构化评审报告。支持主动监控仓库、自动评审新 PR、多模型对比和邮件通知。

## 功能

- **GitHub OAuth 登录** — 安全认证，无需手动管理 Token
- **PR 链接评审** — 粘贴 PR URL 即可启动 AI 评审，SSE 流式实时反馈
- **多维度过滤** — 安全漏洞 / Bug 风险 / 性能问题 / 代码规范，按需勾选
- **自动监控评审** — 添加仓库后，调度器定时检测新 PR 并自动评审
- **多模型对比** — 同时用两个 LLM 评审同一 PR，横向比较结果
- **一键合并 PR** — 评审通过后直接在页面内合并
- **报告分享** — 生成分享链接，团队成员无需登录即可查看
- **PDF 导出** — 评审报告导出为 PDF
- **历史趋势分析** — 查看仓库多次评审的分数变化趋势
- **邮件通知** — 自动评审完成后发送邮件通知

## 技术栈

- **前端**: React 18 + Vite + TypeScript + Tailwind CSS
- **后端**: FastAPI + Python 3.11+ + SQLite
- **LLM**: DeepSeek / 豆包 (Doubao) / Ollama / OpenAI / 任意 OpenAI-compatible 供应商
- **调度**: APScheduler（每用户独立调度器）
- **代码分析**: tree-sitter（10 语言 AST 分片）

## 快速启动

```bash
# 1. 配置环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env，填入 GitHub OAuth App 凭据 + LLM API Key

# 2. 后端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload --port 8000

# 3. 前端
cd frontend
npm install
npm run dev
```

打开 http://localhost:5173 使用。

## 项目结构

```
backend/
├── main.py              # FastAPI 入口 + App 配置
├── schemas.py           # Pydantic 请求模型
├── models/              # 领域模型
├── routers/             # API 路由（按领域拆分）
├── services/            # 业务逻辑
│   ├── auth.py          # GitHub OAuth 认证
│   ├── scheduler.py     # 自动监控调度器
│   ├── review_orchestrator.py  # 评审流水线
│   ├── result_formatter.py     # LLM 输出解析
│   ├── prompt_builder.py       # Prompt 构造
│   ├── chunking/        # AST/正则代码分片
│   └── llm_providers/   # LLM 供应商适配层
└── tests/               # 测试
frontend/
├── src/
│   ├── pages/           # 页面组件
│   ├── components/      # 共享组件
│   ├── services/        # API 调用层
│   ├── contexts/        # React Context
│   └── types/           # TypeScript 类型定义
└── dist/                # 构建输出
```

## 开发约定

- 从 main 切 feature 分支开发，不直接在 main 上提交
- 提交前运行 `cd backend && python -m pytest tests/ -v`（全绿）和 `cd frontend && npx tsc --noEmit`（零错误）
- 合并前建 PR 审查
- main 分支保持可部署状态
