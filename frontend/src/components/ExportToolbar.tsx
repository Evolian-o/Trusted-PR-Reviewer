import type { ReviewResult } from '../types/review'

interface Props {
  result: ReviewResult
  /** 用户编辑过的代码（覆盖原始 rewritten code） */
  editedCode?: Record<string, string>
  /** AI 优化后变更的行号（用于标红） */
  changedRanges?: Record<string, Set<number>>
}

const PRIORITY_LABEL: Record<string, string> = {
  must_fix: '必须修复',
  should_fix: '应当修复',
  nice_to_fix: '可选优化',
}

const SEVERITY_LABEL: Record<string, string> = {
  critical: '严重',
  high: '高',
  medium: '中',
  low: '低',
}

function buildExportHtml(
  result: ReviewResult,
  editedCode?: Record<string, string>,
  changedRanges?: Record<string, Set<number>>,
): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const lines: string[] = []

  // ── 头部 ──
  lines.push(`<h1>PR 评审报告: ${e(result.pr_title)}</h1>`)
  lines.push(`<div class="meta">`)
  lines.push(`  <span>仓库: ${e(result.owner)}/${e(result.repo)} #${result.pull_number}</span>`)
  lines.push(`  <span>文件: ${result.files_changed} | +${result.additions} -${result.deletions}</span>`)
  lines.push(`  <span class="risk risk-${result.risk_level}">风险: ${result.risk_level.toUpperCase()}</span>`)
  lines.push(`</div>`)

  // ── 评分 ──
  if (result.scores && Object.keys(result.scores).length > 0) {
    lines.push(`<h2>评审评分</h2>`)
    lines.push(`<table><thead><tr><th>综合</th><th>安全</th><th>Bug</th><th>性能</th><th>规范</th></tr></thead>`)
    lines.push(`<tbody><tr>`)
    lines.push(`<td>${result.scores.overall ?? '-'}</td>`)
    lines.push(`<td>${result.scores.security ?? '-'}</td>`)
    lines.push(`<td>${result.scores.bug ?? '-'}</td>`)
    lines.push(`<td>${result.scores.performance ?? '-'}</td>`)
    lines.push(`<td>${result.scores.style ?? '-'}</td>`)
    lines.push(`</tr></tbody></table>`)
  }

  // ── 总结 ──
  lines.push(`<h2>评审总结</h2>`)
  lines.push(`<p>${e(result.summary)}</p>`)
  lines.push(`<p>发现 <strong>${result.issues.length}</strong> 个问题，提出 <strong>${result.suggestions.length}</strong> 条建议</p>`)

  // ── 代码审查详情 ──
  if (result.file_reviews.length > 0) {
    lines.push(`<h2>代码审查详情 (${result.file_reviews.length} 个文件)</h2>`)
    for (const fr of result.file_reviews) {
      lines.push(`<h3>${e(fr.file)}</h3>`)
      if (fr.summary) {
        lines.push(`<p>${e(fr.summary)}</p>`)
      }
      if (fr.issues.length > 0) {
        for (const issue of fr.issues) {
          lines.push(`<div class="issue issue-${issue.severity}">`)
          lines.push(`  <div class="issue-header">`)
          lines.push(`    <span class="severity severity-${issue.severity}">${SEVERITY_LABEL[issue.severity] || issue.severity}</span>`)
          lines.push(`    <span class="priority">${PRIORITY_LABEL[issue.priority] || issue.priority}</span>`)
          if (issue.line) lines.push(`    <span>L${issue.line}</span>`)
          lines.push(`  </div>`)
          lines.push(`  <p>${e(issue.description)}</p>`)
          if (issue.suggestion) lines.push(`  <p><em>建议: ${e(issue.suggestion)}</em></p>`)
          if (issue.current_code) {
            lines.push(`  <pre class="code code-old">${e(issue.current_code)}</pre>`)
          }
          if (issue.proposed_code) {
            lines.push(`  <pre class="code code-new">${e(issue.proposed_code)}</pre>`)
          }
          lines.push(`</div>`)
        }
      }
      if (fr.suggestions.length > 0) {
        lines.push(`<ul>`)
        for (const s of fr.suggestions) lines.push(`  <li>${e(s)}</li>`)
        lines.push(`</ul>`)
      }
    }
  }

  // ── AI 重写代码 ──
  if (result.rewritten_files && result.rewritten_files.length > 0) {
    lines.push(`<h2>AI 重写代码 (${result.rewritten_files.length} 个文件)</h2>`)
    for (const rf of result.rewritten_files) {
      const code = editedCode?.[rf.filename] ?? rf.content
      const codeLines = code.split('\n')
      const changedSet = changedRanges?.[rf.filename]

      lines.push(`<h3>${e(rf.filename)} <span class="lang-tag">${e(rf.language)}</span></h3>`)
      lines.push(`<div class="code-block">`)
      lines.push(`<table class="code-table">`)
      for (let i = 0; i < codeLines.length; i++) {
        const isChanged = changedSet?.has(i + 1)
        lines.push(`<tr${isChanged ? ' class="line-changed"' : ''}>`)
        lines.push(`  <td class="line-num">${i + 1}</td>`)
        lines.push(`  <td class="line-content"><pre>${e(codeLines[i])}</pre></td>`)
        lines.push(`</tr>`)
      }
      lines.push(`</table>`)
      lines.push(`</div>`)
    }
  }

  // ── 问题汇总 ──
  if (result.issues.length > 0) {
    const grouped = new Map<string, typeof result.issues>()
    for (const issue of result.issues) {
      const p = issue.priority || 'should_fix'
      if (!grouped.has(p)) grouped.set(p, [])
      grouped.get(p)!.push(issue)
    }

    lines.push(`<h2>问题汇总 (${result.issues.length})</h2>`)
    for (const [priority, items] of grouped) {
      lines.push(`<h3>${PRIORITY_LABEL[priority] || priority} (${items.length})</h3>`)
      for (const issue of items) {
        lines.push(`<div class="issue issue-${issue.severity}">`)
        lines.push(`  <div class="issue-header">`)
        lines.push(`    <span class="severity severity-${issue.severity}">${SEVERITY_LABEL[issue.severity] || issue.severity}</span>`)
        lines.push(`    <span>${e(issue.file)}${issue.line ? ':' + issue.line : ''}</span>`)
        lines.push(`  </div>`)
        lines.push(`  <p>${e(issue.description)}</p>`)
        if (issue.suggestion) lines.push(`  <p><em>建议: ${e(issue.suggestion)}</em></p>`)
        lines.push(`</div>`)
      }
    }
  }

  // ── 优化建议 ──
  if (result.suggestions.length > 0) {
    lines.push(`<h2>优化建议</h2>`)
    lines.push(`<ul>`)
    for (const s of result.suggestions) lines.push(`  <li>${e(s)}</li>`)
    lines.push(`</ul>`)
  }

  const body = lines.join('\n')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>PR 评审报告 — ${e(result.owner)}/${e(result.repo)} #${result.pull_number}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, "Microsoft YaHei", "PingFang SC", sans-serif;
    font-size: 13px;
    line-height: 1.7;
    color: #222;
    max-width: 900px;
    margin: 0 auto;
    padding: 2cm 1.5cm;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1 { font-size: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 8px; margin-bottom: 12px; }
  h2 { font-size: 16px; margin: 24px 0 10px; padding-bottom: 4px; border-bottom: 1px solid #d1d5db; }
  h3 { font-size: 14px; margin: 14px 0 6px; }

  .meta { display: flex; gap: 16px; flex-wrap: wrap; color: #555; margin-bottom: 12px; font-size: 12px; }
  .risk { padding: 1px 8px; border-radius: 3px; font-weight: 600; }
  .risk-low { background: #d1fae5; color: #065f46; }
  .risk-medium { background: #fef3c7; color: #92400e; }
  .risk-high { background: #fee2e2; color: #991b1b; }

  table { border-collapse: collapse; width: 100%; margin: 8px 0; }
  th, td { border: 1px solid #d1d5db; padding: 4px 10px; text-align: center; }
  th { background: #f3f4f6; font-weight: 600; }

  .issue {
    border-left: 3px solid #d1d5db;
    padding: 6px 10px;
    margin: 6px 0;
    background: #fafafa;
    border-radius: 0 4px 4px 0;
    page-break-inside: avoid;
  }
  .issue-critical { border-left-color: #dc2626; background: #fef2f2; }
  .issue-high { border-left-color: #ea580c; background: #fff7ed; }
  .issue-medium { border-left-color: #ca8a04; background: #fefce8; }
  .issue-low { border-left-color: #9ca3af; }

  .issue-header { display: flex; gap: 8px; align-items: center; font-size: 11px; margin-bottom: 4px; }
  .severity { padding: 0 5px; border-radius: 2px; font-weight: 700; text-transform: uppercase; font-size: 10px; color: #fff; }
  .severity-critical { background: #dc2626; }
  .severity-high { background: #ea580c; }
  .severity-medium { background: #ca8a04; }
  .severity-low { background: #6b7280; }
  .priority { color: #555; }

  .code, pre {
    background: #f5f5f5;
    border: 1px solid #e5e7eb;
    border-radius: 4px;
    padding: 8px 12px;
    font-family: "Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace;
    font-size: 11px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
    margin: 4px 0;
  }
  .code-old { border-left: 3px solid #ef4444; }
  .code-new { border-left: 3px solid #22c55e; }

  .code-block {
    border: 1px solid #d1d5db;
    border-radius: 6px;
    overflow: hidden;
    margin: 8px 0;
  }
  .code-table { width: 100%; border-collapse: collapse; margin: 0; }
  .code-table tr { page-break-inside: avoid; }
  .code-table td { border: none; padding: 1px 8px; text-align: left; }
  .code-table .line-num {
    width: 48px;
    text-align: right;
    color: #9ca3af;
    background: #f9fafb;
    border-right: 1px solid #e5e7eb;
    font-family: Consolas, monospace;
    font-size: 11px;
    user-select: none;
  }
  .code-table .line-content pre {
    background: transparent;
    border: none;
    padding: 0;
    margin: 0;
    font-size: 11px;
    white-space: pre;
  }
  .code-table .line-changed td {
    background: #fecaca !important;
  }
  .code-table .line-changed .line-num {
    background: #fca5a5 !important;
    color: #991b1b;
  }

  .lang-tag {
    font-size: 10px;
    color: #6b7280;
    background: #f3f4f6;
    padding: 1px 6px;
    border-radius: 3px;
    font-weight: 400;
  }

  ul { padding-left: 20px; }
  li { margin: 2px 0; }

  @page { margin: 1.5cm; }
  @media print {
    body { padding: 0; }
    h2 { page-break-after: avoid; }
    h3 { page-break-after: avoid; }
  }
</style>
</head>
<body>
${body}
</body>
</html>`
}

export default function ExportToolbar({ result, editedCode, changedRanges }: Props) {
  const handleCopyMarkdown = () => {
    const lines = [
      `# PR 评审报告: ${result.pr_title}`,
      '',
      `**仓库**: ${result.owner}/${result.repo} #${result.pull_number}`,
      `**文件数**: ${result.files_changed} | **+${result.additions}** **-${result.deletions}**`,
      `**风险等级**: ${result.risk_level.toUpperCase()}`,
    ]

    if (result.scores && Object.keys(result.scores).length > 0) {
      lines.push(
        '',
        '## 评分',
        `- 综合: ${result.scores.overall || '-'}`,
        `- 安全: ${result.scores.security || '-'}`,
        `- Bug: ${result.scores.bug || '-'}`,
        `- 性能: ${result.scores.performance || '-'}`,
        `- 规范: ${result.scores.style || '-'}`,
      )
    }

    lines.push(
      '',
      '## 总结',
      result.summary,
      '',
      '## 问题列表',
    )

    for (const issue of result.issues) {
      lines.push(
        `- **[${issue.severity.toUpperCase()}] [${issue.priority}] ${issue.category}** — ${issue.file}${issue.line ? `:${issue.line}` : ''}`,
        `  ${issue.description}`,
        issue.suggestion ? `  > 建议: ${issue.suggestion}` : '',
        issue.current_code ? `  \`\`\`\n  ${issue.current_code}\n  \`\`\`` : '',
        issue.proposed_code ? `  → \`\`\`\n  ${issue.proposed_code}\n  \`\`\`` : '',
      )
    }

    if (result.suggestions.length > 0) {
      lines.push('', '## 优化建议')
      result.suggestions.forEach((s) => lines.push(`- ${s}`))
    }

    navigator.clipboard.writeText(lines.join('\n'))
  }

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
  }

  const handlePrintPDF = () => {
    const html = buildExportHtml(result, editedCode, changedRanges)
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) {
      window.alert('弹窗被浏览器拦截，请允许弹窗后重试。')
      return
    }
    w.document.write(html)
    w.document.close()
    // 等新窗口渲染完成后触发打印
    w.onload = () => {
      setTimeout(() => w.print(), 300)
    }
  }

  const handleCopyShareLink = () => {
    if (result.share_token) {
      const url = `${window.location.origin}/share/${result.share_token}`
      navigator.clipboard.writeText(url)
    }
  }

  return (
    <div className="flex gap-3 flex-wrap no-print">
      <button
        onClick={handleCopyMarkdown}
        className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors"
      >
        复制 Markdown
      </button>
      <button
        onClick={handleCopyJSON}
        className="px-4 py-2 bg-gray-700 text-gray-300 text-sm rounded-lg hover:bg-gray-600 transition-colors"
      >
        复制 JSON
      </button>
      <button
        onClick={handlePrintPDF}
        className="px-4 py-2 bg-green-700 text-white text-sm rounded-lg hover:bg-green-600 transition-colors"
      >
        导出 PDF
      </button>
      {result.share_token && (
        <button
          onClick={handleCopyShareLink}
          className="px-4 py-2 bg-purple-700 text-white text-sm rounded-lg hover:bg-purple-600 transition-colors"
        >
          复制分享链接
        </button>
      )}
    </div>
  )
}
