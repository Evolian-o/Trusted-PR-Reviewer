# Trusted-PR-Reviewer

AI 驱动的 PR 智能评审工具。输入 GitHub PR 链接，自动获取代码变更并通过本地 Ollama 模型分析，生成结构化评审报告。

## 技术栈

- 前端：React + Vite + TypeScript + Tailwind CSS
- 后端：FastAPI + Python 3.11+
- LLM：Ollama (qwen3.5:latest)

## 快速启动

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn main:app --reload

# 前端
cd frontend
npm install
npm run dev
```
