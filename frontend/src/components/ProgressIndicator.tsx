import type { ReviewProgress } from '../types/review'

interface Props {
  progress: ReviewProgress
  provider?: string
  model?: string
}

export default function ProgressIndicator({ progress, provider, model }: Props) {
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0

  return (
    <div className="bg-gray-850 border border-gray-700 rounded-xl p-5 space-y-3">
      {/* 模型标签 */}
      {provider && model && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">当前模型</span>
          <span className="text-xs font-mono bg-blue-900/40 text-blue-300 border border-blue-800 px-2 py-0.5 rounded">
            {provider} / {model}
          </span>
        </div>
      )}

      {/* 进度信息 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-300 truncate max-w-[70%]">
          {progress.phase === 'fetching'
            ? '正在获取 PR 信息...'
            : progress.file
              ? `正在评审 ${progress.file}`
              : '评审中...'}
        </span>
        <span className="text-sm text-gray-400 tabular-nums">
          {progress.current}/{progress.total}
          <span className="text-gray-600 ml-1">({pct}%)</span>
        </span>
      </div>

      {/* 进度条 */}
      <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: progress.phase === 'fetching'
              ? 'linear-gradient(90deg, #6366f1, #818cf8)'
              : 'linear-gradient(90deg, #2563eb, #60a5fa)',
          }}
        />
      </div>

      {/* 底部标签 */}
      <div className="flex items-center gap-2">
        {progress.language && (
          <span className="text-xs text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
            {progress.language}
          </span>
        )}
        {progress.phase === 'fetching' && (
          <span className="text-xs text-indigo-400">阶段: 拉取代码</span>
        )}
        {progress.phase === 'reviewing' && (
          <span className="text-xs text-blue-400">阶段: LLM 评审</span>
        )}
      </div>
    </div>
  )
}
