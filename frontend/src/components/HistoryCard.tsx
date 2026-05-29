import { useNavigate } from 'react-router-dom'
import type { ReviewResult } from '../types/review'

interface Props {
  review: {
    id: number
    owner: string
    repo: string
    pull_number: number
    pr_title: string
    pr_url: string
    provider: string
    model: string | null
    files_changed: number
    additions: number
    deletions: number
    risk_level: string
    issue_count: number
    suggestion_count: number
    result_json?: string
    created_at: string
  }
  expanded: boolean
  onToggle: () => void
  onDelete: () => void
}

const RISK_COLORS: Record<string, string> = {
  high: 'bg-red-600',
  medium: 'bg-yellow-600',
  low: 'bg-green-600',
}
const RISK_LABELS: Record<string, string> = {
  high: '高风险',
  medium: '中风险',
  low: '低风险',
}

export default function HistoryCard({ review, expanded, onToggle, onDelete }: Props) {
  const navigate = useNavigate()
  let result: ReviewResult | null = null
  if (review.result_json) {
    try {
      result = JSON.parse(review.result_json)
    } catch { /* ignore */ }
  }

  return (
    <div className="bg-gray-800 rounded-lg overflow-hidden">
      <div
        className="p-4 cursor-pointer hover:bg-gray-750 flex items-center gap-4"
        onClick={onToggle}
      >
        <span className="text-gray-400 text-sm flex-shrink-0">
          {review.created_at.replace('T', ' ')}
        </span>
        <span className="text-white font-medium truncate flex-1">
          {review.pr_title}
        </span>
        <span className="text-gray-400 text-sm flex-shrink-0">
          {review.owner}/{review.repo}#{review.pull_number}
        </span>
        <span className="text-xs text-gray-500 flex-shrink-0">
          {review.provider}{review.model ? ` / ${review.model}` : ''}
        </span>
        <span
          className={`px-2 py-0.5 rounded text-xs text-white flex-shrink-0 ${RISK_COLORS[review.risk_level] || 'bg-gray-600'}`}
        >
          {RISK_LABELS[review.risk_level] || review.risk_level}
        </span>
        <span className="text-red-400 text-sm flex-shrink-0">
          {review.issue_count} 问题
        </span>
        <span className="text-gray-500 flex-shrink-0">{expanded ? '收起' : '展开'}</span>
      </div>

      {expanded && result && (
        <div className="px-4 pb-4 border-t border-gray-700">
          <div className="mt-3 flex items-center gap-4 text-sm text-gray-400 mb-3">
            <span>文件 {result.files_changed}</span>
            <span className="text-green-400">+{result.additions}</span>
            <span className="text-red-400">-{result.deletions}</span>
          </div>

          {result.summary && (
            <p className="text-gray-300 text-sm mb-3 whitespace-pre-wrap">{result.summary}</p>
          )}

          {result.issues.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-medium text-red-400 mb-2">
                问题 ({result.issues.length})
              </h4>
              <div className="space-y-2">
                {result.issues.map((issue, i) => (
                  <div key={i} className="bg-gray-900 rounded p-2 text-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-red-300 font-medium">{issue.severity}</span>
                      <span className="text-gray-500">[{issue.category}]</span>
                      <span className="text-blue-400">{issue.file}{issue.line ? `:${issue.line}` : ''}</span>
                    </div>
                    <p className="text-gray-300">{issue.description}</p>
                    {issue.suggestion && (
                      <p className="text-blue-400 mt-1">建议: {issue.suggestion}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.suggestions.length > 0 && (
            <div className="mb-3">
              <h4 className="text-sm font-medium text-blue-400 mb-2">
                建议 ({result.suggestions.length})
              </h4>
              <ul className="list-disc list-inside text-sm text-gray-300 space-y-1">
                {result.suggestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-2 mt-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                const params = new URLSearchParams()
                if (review.provider) params.set('provider', review.provider)
                if (review.model) params.set('model', review.model)
                params.set('reviewId', String(review.id))
                navigate(`/review/${review.owner}/${review.repo}/${review.pull_number}?${params.toString()}`)
              }}
              className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
            >
              查看完整报告
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
            >
              删除记录
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
