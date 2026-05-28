import type { ReviewResult } from '../types/review'

const RISK_COLORS: Record<string, string> = {
  high: 'bg-red-600',
  medium: 'bg-yellow-600',
  low: 'bg-green-600',
}

export default function PRInfoBar({ result }: { result: ReviewResult }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">{result.pr_title}</h2>
          <p className="text-sm text-gray-400 mt-1">
            {result.owner}/{result.repo} #{result.pull_number}
          </p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="text-gray-300">{result.files_changed} 个文件</span>
          <span className="text-green-400">+{result.additions}</span>
          <span className="text-red-400">-{result.deletions}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${RISK_COLORS[result.risk_level] || 'bg-gray-600'}`}>
            {result.risk_level.toUpperCase()}
          </span>
        </div>
      </div>
    </div>
  )
}
