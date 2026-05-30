import type { ReviewResult } from '../types/review'

interface Props {
  result: ReviewResult
}

export default function ExportToolbar({ result }: Props) {
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
    window.print()
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
