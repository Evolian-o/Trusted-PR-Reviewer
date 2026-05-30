import { useNavigate } from 'react-router-dom'
import { formatLocalTime } from '../../utils/time'

interface ReviewItem {
  id: number
  owner: string
  repo: string
  pull_number: number
  pr_title: string
  provider: string
  model: string | null
  risk_level: string
  issue_count: number
  created_at: string
}

interface Props {
  reviews: ReviewItem[]
}

const RISK_CLASS: Record<string, string> = {
  high: 'bg-red-600',
  medium: 'bg-yellow-600',
  low: 'bg-green-600',
}

const RISK_TEXT: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

export default function RecentReviews({ reviews }: Props) {
  const navigate = useNavigate()

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-4">最近评审</h2>
      {reviews.length === 0 ? (
        <p className="text-gray-500 text-sm">暂无评审记录</p>
      ) : (
        <div className="space-y-2">
          {reviews.map((r) => (
            <div
              key={r.id}
              onClick={() => {
                const params = new URLSearchParams()
                if (r.provider) params.set('provider', r.provider)
                if (r.model) params.set('model', r.model)
                params.set('reviewId', String(r.id))
                navigate(`/review/${r.owner}/${r.repo}/${r.pull_number}?${params.toString()}`)
              }}
              className="bg-gray-800 rounded p-3 cursor-pointer hover:bg-gray-750 transition-colors"
            >
              <div className="text-white text-sm font-medium truncate">
                {r.owner}/{r.repo}#{r.pull_number}
              </div>
              <div className="text-gray-400 text-xs mt-1 truncate">{r.pr_title}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`px-1.5 py-0.5 rounded text-xs text-white ${RISK_CLASS[r.risk_level] || 'bg-gray-600'}`}>
                  {RISK_TEXT[r.risk_level] || r.risk_level}
                </span>
                <span className="text-gray-500 text-xs">{r.issue_count} 问题</span>
                <span className="text-gray-600 text-xs">{formatLocalTime(r.created_at)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
