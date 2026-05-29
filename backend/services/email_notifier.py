import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import aiosmtplib

from services.database import get_email_config
from services.auth import get_user_id

logger = logging.getLogger("email_notifier")

FRONTEND_URL = "http://localhost:5173"


async def _build_message(
    to_email: str, owner: str, repo: str, pr_title: str, result,
) -> MIMEMultipart:
    pr_number = result.pull_number
    detail_url = f"{FRONTEND_URL}/review/{owner}/{repo}/{pr_number}"

    risk_cn = {"high": "高", "medium": "中", "low": "低"}.get(result.risk_level, result.risk_level)

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

    msg = MIMEMultipart("alternative")
    msg["Subject"] = f"[AI PR Review] {owner}/{repo}#{pr_number} — {pr_title[:50]}"
    msg["From"] = "AI PR Reviewer <noreply@pr-reviewer.local>"
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg


async def send_review_notification(
    owner: str, repo: str, pr_title: str, result,
) -> None:
    """评审完成后发送邮件通知"""
    user_id = get_user_id()
    if user_id is None:
        return

    config = await get_email_config(user_id)
    if not config or not config.get("enabled"):
        return

    msg = await _build_message(config["to_email"], owner, repo, pr_title, result)

    try:
        await aiosmtplib.send(
            msg,
            hostname=config["smtp_host"],
            port=config["smtp_port"],
            username=config["username"],
            password=config["password"],
            use_tls=config["smtp_port"] == 465,
            start_tls=config["smtp_port"] == 587,
        )
        logger.info(f"邮件已发送: {owner}/{repo} → {config['to_email']}")
    except Exception as e:
        logger.error(f"邮件发送失败: {e}")
        raise


async def send_test_email(config: dict) -> None:
    """发送测试邮件，验证 SMTP 配置"""
    msg = MIMEText("AI PR Reviewer 邮件配置测试成功！", "plain", "utf-8")
    msg["Subject"] = "[AI PR Review] 测试邮件"
    msg["From"] = "AI PR Reviewer <noreply@pr-reviewer.local>"
    msg["To"] = config.get("to_email", config.get("username", ""))

    await aiosmtplib.send(
        msg,
        hostname=config["smtp_host"],
        port=int(config.get("smtp_port", 465)),
        username=config.get("username", ""),
        password=config.get("password", ""),
        use_tls=int(config.get("smtp_port", 465)) == 465,
        start_tls=int(config.get("smtp_port", 465)) == 587,
    )
