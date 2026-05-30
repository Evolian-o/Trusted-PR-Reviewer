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


CATEGORY_NAMES = {"security": "安全漏洞", "bug": "逻辑缺陷", "performance": "性能问题", "style": "代码风格"}
SEVERITY_COLORS = {"critical": "#e53e3e", "high": "#ed8936", "medium": "#d69e2e", "low": "#718096"}


def _group_issues_by_category(issues) -> dict[str, list]:
    groups: dict[str, list] = {}
    sev_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    for issue in issues:
        groups.setdefault(issue.category, []).append(issue)
    for items in groups.values():
        items.sort(key=lambda i: sev_order.get(i.severity, 9))
    return groups


async def _build_message(
    to_email: str, owner: str, repo: str, pr_title: str, result,
) -> MIMEMultipart:
    pr_number = result.pull_number
    detail_url = f"{FRONTEND_URL}/review/{owner}/{repo}/{pr_number}"
    risk_cn = {"high": "高风险", "medium": "中风险", "low": "低风险"}.get(result.risk_level, result.risk_level)
    risk_color = {"high": "#e53e3e", "medium": "#d69e2e", "low": "#38a169"}.get(result.risk_level, "#38a169")

    groups = _group_issues_by_category(result.issues)
    cat_order = ["security", "bug", "performance", "style"]

    # ── 纯文本版本 ──
    text_lines = [
        f"AI 代码评审 — {owner}/{repo}#{pr_number}",
        f"PR: {pr_title}",
        f"────────────────────",
        f"文件: {result.files_changed}  |  +{result.additions}/-{result.deletions}",
        f"问题: {len(result.issues)} 个  |  建议: {len(result.suggestions)} 条  |  风险: {risk_cn}",
        "",
    ]

    for cat in cat_order:
        if cat not in groups:
            continue
        items = groups[cat]
        text_lines.append(f"▎{CATEGORY_NAMES.get(cat, cat)}（{len(items)}个）")
        for item in items:
            loc = f"{item.file}" + (f":{item.line}" if item.line else "")
            text_lines.append(f"  [{item.severity.upper()}] {loc}")
            text_lines.append(f"  {item.description}")
            if item.suggestion:
                text_lines.append(f"  → {item.suggestion}")
        text_lines.append("")

    if result.suggestions:
        text_lines.append("── 整改优先级 ──")
        for i, s in enumerate(result.suggestions[:5], 1):
            text_lines.append(f"  {i}. {s}")
        text_lines.append("")

    text_lines.append(f"查看详情: {detail_url}")
    text_body = "\n".join(text_lines)

    # ── HTML 版本 ──
    html_parts = [
        f"<div style='font-family:-apple-system,BlinkMacSystemFont,sans-serif;max-width:600px;margin:0 auto;background:#1a1a2e;color:#e0e0e0;border-radius:8px;overflow:hidden'>",
        # 头部
        f"<div style='background:#16213e;padding:20px 24px'>",
        f"<h2 style='margin:0;color:#fff;font-size:18px'>AI 代码评审 — {owner}/{repo}#{pr_number}</h2>",
        f"<p style='margin:6px 0 0;color:#8892b0;font-size:14px'>{pr_title}</p>",
        f"</div>",
        # 概览
        f"<div style='padding:20px 24px;border-bottom:1px solid #2a2a4a'>",
        f"<table style='width:100%;font-size:14px'>",
        f"<tr>",
        f"<td style='color:#8892b0'>文件变更</td><td style='color:#fff'>{result.files_changed} 个文件 <span style='color:#38a169'>+{result.additions}</span> <span style='color:#e53e3e'>-{result.deletions}</span></td>",
        f"<td style='color:#8892b0'>问题数</td><td style='color:#e53e3e;font-weight:bold'>{len(result.issues)} 个</td>",
        f"</tr><tr>",
        f"<td style='color:#8892b0'>建议数</td><td style='color:#63b3ed'>{len(result.suggestions)} 条</td>",
        f"<td style='color:#8892b0'>风险等级</td><td><span style='display:inline-block;padding:2px 10px;border-radius:10px;font-size:12px;font-weight:bold;color:#fff;background:{risk_color}'>{risk_cn}</span></td>",
        f"</tr></table></div>",
    ]

    # 分类问题
    for cat in cat_order:
        if cat not in groups:
            continue
        items = groups[cat]
        cat_icons = {"security": "🔒", "bug": "🐛", "performance": "⚡", "style": "🎨"}
        html_parts.append(
            f"<div style='padding:16px 24px;border-bottom:1px solid #2a2a4a'>"
            f"<h3 style='margin:0 0 12px;font-size:15px;color:#fff'>{cat_icons.get(cat, '')} {CATEGORY_NAMES.get(cat, cat)} <span style='font-weight:normal;color:#8892b0'>({len(items)}个)</span></h3>"
        )
        for item in items:
            sev_color = SEVERITY_COLORS.get(item.severity, "#718096")
            loc = f"{item.file}" + (f":{item.line}" if item.line else "")
            html_parts.append(
                f"<div style='margin-bottom:10px;padding:10px 14px;background:#0f0f23;border-left:3px solid {sev_color};border-radius:4px'>"
                f"<div style='margin-bottom:4px'>"
                f"<span style='display:inline-block;padding:1px 6px;border-radius:3px;font-size:11px;font-weight:bold;color:#fff;background:{sev_color};margin-right:8px'>{item.severity.upper()}</span>"
                f"<code style='color:#63b3ed;font-size:12px'>{loc}</code>"
                f"</div>"
                f"<p style='margin:4px 0;font-size:13px;color:#cbd5e0'>{item.description}</p>"
                + (f"<p style='margin:4px 0;font-size:12px;color:#68d391'>→ {item.suggestion}</p>" if item.suggestion else "") +
                f"</div>"
            )
        html_parts.append("</div>")

    # 整改建议 + 链接
    html_parts.append(
        f"<div style='padding:16px 24px 12px'>"
        f"<h3 style='margin:0 0 8px;font-size:14px;color:#fff'>📋 整改优先级</h3>"
    )
    if result.suggestions:
        html_parts.append(
            f"<ol style='margin:0;padding-left:20px;font-size:13px;color:#cbd5e0'>"
            + "".join(f"<li style='margin-bottom:4px'>{s}</li>" for s in result.suggestions[:5])
            + "</ol>"
        )
    html_parts.append("</div>")

    # 底部链接
    html_parts.append(
        f"<div style='padding:20px 24px;background:#16213e;text-align:center'>"
        f"<a href='{detail_url}' style='display:inline-block;padding:8px 24px;background:#3182ce;color:#fff;text-decoration:none;border-radius:6px;font-size:14px'>查看完整评审报告 →</a>"
        f"<p style='margin:10px 0 0;font-size:11px;color:#718096'>Trusted PR Reviewer · 自动代码评审</p>"
        f"</div>"
    )

    html_parts.append("</div>")
    html_body = "\n".join(html_parts)

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
