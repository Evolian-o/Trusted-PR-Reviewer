import logging
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import aiosmtplib

# Windows 下 SMTP over SSL 需要跳过证书验证
_SSL_CTX = ssl.create_default_context()
_SSL_CTX.check_hostname = False
_SSL_CTX.verify_mode = ssl.CERT_NONE

from services.database import get_email_config
from services.auth import get_user_id

logger = logging.getLogger("email_notifier")

FRONTEND_URL = "http://localhost:5173"

# 主流邮箱 SMTP 配置，按域名自动匹配
SMTP_CONFIGS: dict[str, tuple[str, int]] = {
    "@qq.com":      ("smtp.qq.com",      465),
    "@foxmail.com": ("smtp.qq.com",      465),
    "@gmail.com":   ("smtp.gmail.com",   587),
    "@163.com":     ("smtp.163.com",     465),
    "@126.com":     ("smtp.126.com",     465),
    "@yeah.net":    ("smtp.yeah.net",    465),
    "@outlook.com": ("smtp-mail.outlook.com", 587),
    "@hotmail.com": ("smtp-mail.outlook.com", 587),
    "@live.com":    ("smtp-mail.outlook.com", 587),
    "@aliyun.com":  ("smtp.aliyun.com",  465),
    "@yahoo.com":   ("smtp.mail.yahoo.com",  587),
    "@sina.com":    ("smtp.sina.com",    465),
    "@sohu.com":    ("smtp.sohu.com",    465),
    "@sogou.com":   ("smtp.sogou.com",   465),
}


def _detect_smtp(email: str) -> tuple[str, int, str]:
    """根据邮箱域名自动返回 (host, port, sender)，sender 就是该邮箱本身"""
    lower = email.lower()
    for domain, (host, port) in SMTP_CONFIGS.items():
        if domain in lower:
            return host, port, email
    raise ValueError(
        f"不支持的邮箱域名，请使用主流邮箱: "
        + ", ".join(d for d in SMTP_CONFIGS)
    )


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
    msg["From"] = f"AI PR Reviewer <{to_email}>"
    msg["To"] = to_email
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg


async def send_review_notification(
    owner: str, repo: str, pr_title: str, result, *, user_id: int | None = None,
) -> None:
    """评审完成后发送邮件通知"""
    if user_id is None:
        user_id = get_user_id()
    if user_id is None:
        return

    config = await get_email_config(user_id)
    if not config or not config.get("enabled"):
        return

    to_email = config["to_email"]
    host, port, sender = _detect_smtp(to_email)
    msg = await _build_message(to_email, owner, repo, pr_title, result)

    try:
        await aiosmtplib.send(
            msg,
            hostname=host, port=port,
            username=sender, password=config.get("password", ""),
            use_tls=port == 465, start_tls=port == 587,
            tls_context=_SSL_CTX,
        )
        logger.info(f"邮件已发送: {owner}/{repo} → {to_email}")
    except Exception as e:
        logger.error(f"邮件发送失败: {e}")


async def send_test_email(config: dict) -> None:
    """发送测试邮件，验证 SMTP 配置"""
    to_email = config.get("to_email", "")
    if not to_email:
        raise ValueError("请填写收件邮箱")
    host, port, sender = _detect_smtp(to_email)

    msg = MIMEText("AI PR Reviewer 邮件配置测试成功！", "plain", "utf-8")
    msg["Subject"] = "[AI PR Review] 测试邮件"
    msg["From"] = f"AI PR Reviewer <{to_email}>"
    msg["To"] = to_email

    await aiosmtplib.send(
        msg,
        hostname=host, port=port,
        username=sender, password=config.get("password", ""),
        use_tls=port == 465, start_tls=port == 587,
        tls_context=_SSL_CTX,
    )
