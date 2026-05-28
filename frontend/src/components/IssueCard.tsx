import type { Issue } from '../types/review'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-red-500 bg-red-900/20',
  high: 'border-orange-500 bg-orange-900/20',
  medium: 'border-yellow-500 bg-yellow-900/20',
  low: 'border-gray-500 bg-gray-800',
}

const CATEGORY_LABELS: Record<string, string> = {
  bug: 'Bug',
  security: '安全',
  performance: '性能',
  style: '规范',
}

export default function IssueCard({ issue }: { issue: Issue }) {
  return (
    <div className={`border-l-4 rounded p-4 ${SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.low}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold uppercase text-gray-300">
          [{issue.severity}]
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
          {CATEGORY_LABELS[issue.category] || issue.category}
        </span>
        <span className="text-xs text-gray-500">
          {issue.file}{issue.line ? `:${issue.line}` : ''}
        </span>
      </div>
      <p className="text-gray-200 text-sm mb-2">{issue.description}</p>
      {issue.suggestion && (
        <p className="text-gray-400 text-sm">
          <span className="text-blue-400">建议: </span>
          {issue.suggestion}
        </p>
      )}
    </div>
  )
}
