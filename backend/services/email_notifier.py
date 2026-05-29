import os
import logging

import httpx

from services.database import get_email_config
from services.auth import get_user_id

logger = logging.getLogger("email_notifier")

FRONTEND_URL = "http://localhost:5173"
RESEND_API = "https://api.resend.com/emails"


async def _call_resend(to_email: str, subject: str, html: str, text: str) -> None:
    """调用 Resend HTTP API 发送邮件"""
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        raise RuntimeError("RESEND_API_KEY 未在 .env 中配置")

    async with httpx.AsyncClient(verify=False, timeout=15.0) as client:
        resp = await client.post(
            RESEND_API,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": "Trusted PR Reviewer <onboarding@resend.dev>",
                "to": [to_email],
                "subject": subject,
                "html": html,
                "text": text,
            },
        )
        if resp.status_code >= 400:
            data = resp.json() if resp.text else {}
            raise RuntimeError(data.get("message", f"HTTP {resp.status_code}"))


def _build_content(owner: str, repo: str, pr_title: str, result) -> tuple[str, str, str]:
    """构建邮件主题、纯文本、HTML（返回三元组以便 Resend 使用）"""
    pr_number = result.pull_number
    detail_url = f"{FRONTEND_URL}/review/{owner}/{repo}/{pr_number}"
    risk_cn = {"high": "高", "medium": "中", "low": "低"}.get(result.risk_level, result.risk_level)

    subject = f"[AI PR Review] {owner}/{repo}#{pr_number} — {pr_title[:50]}"

    text_body = (
        f"AI PR Review — {owner}/{repo}#{pr_number}\n"
        f"PR: {pr_title}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"风险等级: {risk_cn}\n"
        f"问题: {len(result.issues)} 个  |  建议: {len(result.suggestions)} 条\n"
        f"文件变更: {result.files_changed}  |  +{result.additions} / -{result.deletions}\n"
        f"━━━━━━━━━━━━━━━━\n"
        f"查看详情: {detail_url}\n"
    )

    html_body = (
        f"<div style='font-family:sans-serif;max-width:600px;margin:0 auto'>"
        f"<h2>AI PR Review — {owner}/{repo}#{pr_number}</h2>"
        f"<p style='color:#555'>{pr_title}</p>"
        f"<hr style='border:1px solid #eee'>"
        f"<p><b>风险等级：</b>"
        f"<span style='color:{'#e53e3e' if result.risk_level == 'high' else '#d69e2e' if result.risk_level == 'medium' else '#38a169'}'>{risk_cn}</span></p>"
        f"<p>问题：{len(result.issues)} 个  |  建议：{len(result.suggestions)} 条</p>"
        f"<p>文件变更：{result.files_changed}  |  +{result.additions} / -{result.deletions}</p>"
        f"<hr style='border:1px solid #eee'>"
        f"<p><a href='{detail_url}' style='color:#3182ce'>查看详情</a></p>"
        f"</div>"
    )

    return subject, text_body, html_body


async def send_review_notification(
    owner: str, repo: str, pr_title: str, result,
) -> None:
    """评审完成后通过 Resend 发送邮件通知"""
    user_id = get_user_id()
    if user_id is None:
        return

    config = await get_email_config(user_id)
    if not config or not config.get("enabled"):
        return

    subject, text_body, html_body = _build_content(owner, repo, pr_title, result)

    try:
        await _call_resend(config["to_email"], subject, html_body, text_body)
        logger.info(f"邮件已发送: {owner}/{repo} → {config['to_email']}")
    except Exception as e:
        logger.error(f"邮件发送失败: {e}")


async def send_test_email(config: dict) -> None:
    """发送测试邮件，验证 Resend 配置"""
    await _call_resend(
        to_email=config.get("to_email", ""),
        subject="[AI PR Review] 测试邮件",
        html="<p>AI PR Reviewer 邮件配置测试成功！</p>",
        text="AI PR Reviewer 邮件配置测试成功！",
    )
