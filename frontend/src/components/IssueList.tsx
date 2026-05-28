import type { Issue } from '../types/review'
import IssueCard from './IssueCard'

interface Props {
  issues: Issue[]
}

export default function IssueList({ issues }: Props) {
  if (issues.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <h3 className="text-lg font-bold text-white mb-3">发现的问题</h3>
        <p className="text-green-400 text-sm">未发现问题</p>
      </div>
    )
  }

  // 按严重程度排序
  const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
  const sorted = [...issues].sort(
    (a, b) => (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9)
  )

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <h3 className="text-lg font-bold text-white mb-4">
        发现的问题 ({issues.length})
      </h3>
      <div className="space-y-3">
        {sorted.map((issue, i) => (
          <IssueCard key={i} issue={issue} />
        ))}
      </div>
    </div>
  )
}
