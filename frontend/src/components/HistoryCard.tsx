import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { ReviewResult } from '../types/review'
import { formatLocalTime } from '../utils/time'
import { cleanPrTitle } from '../utils/text'

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

export default function HistoryCard({ review, expanded, onToggle, onDelete }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const RISK_LABELS: Record<string, string> = {
    high: t('history.risk_high'),
    medium: t('history.risk_medium'),
    low: t('history.risk_low'),
  }
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
          {formatLocalTime(review.created_at)}
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
          {t('history.issues_count', { count: review.issue_count })}
        </span>
        <span className="text-gray-500 flex-shrink-0">{expanded ? t('history.collapse') : t('history.expand')}</span>
      </div>

      {expanded && result && (
        <div className="px-4 pb-4 border-t border-gray-700">
          {result.pr_description ? (
            <p className="text-gray-200 text-sm mt-3 mb-1 leading-relaxed">
              {result.pr_description}
            </p>
          ) : (
            <p className="text-gray-500 text-sm mt-3 mb-1 leading-relaxed">
              {t('history.pr_description', { title: cleanPrTitle(review.pr_title) })}
            </p>
          )}
          {result.summary && (
            <p className="text-gray-500 text-xs mt-2 mb-3 whitespace-pre-wrap line-clamp-2">{result.summary}</p>
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
              {t('history.view_full')}
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete() }}
              className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
            >
              {t('history.delete_record')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
