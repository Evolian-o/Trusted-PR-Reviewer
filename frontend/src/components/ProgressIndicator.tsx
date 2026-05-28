import type { ReviewProgress } from '../types/review'

export default function ProgressIndicator({ progress }: { progress: ReviewProgress }) {
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-300">
          {progress.phase === 'fetching' ? '正在获取 PR 信息...' : `正在评审 ${progress.file || ''}`}
        </span>
        <span className="text-sm text-gray-400">{progress.current}/{progress.total}</span>
      </div>
      <div className="w-full bg-gray-700 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress.language && (
        <p className="mt-2 text-xs text-gray-500">{progress.language}</p>
      )}
    </div>
  )
}
