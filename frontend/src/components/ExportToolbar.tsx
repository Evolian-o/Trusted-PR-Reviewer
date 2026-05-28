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
      '',
      '## 总结',
      result.summary,
      '',
      '## 问题列表',
    ]

    for (const issue of result.issues) {
      lines.push(
        `- **[${issue.severity.toUpperCase()}] ${issue.category}** — ${issue.file}${issue.line ? `:${issue.line}` : ''}`,
        `  ${issue.description}`,
        issue.suggestion ? `  > ${issue.suggestion}` : ''
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

  return (
    <div className="flex gap-3">
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
    </div>
  )
}
