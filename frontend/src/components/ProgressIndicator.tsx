import type { ReviewProgress } from '../types/review'

interface Props {
  progress: ReviewProgress
  provider?: string
  model?: string
}

const PHASE_CONFIG: Record<string, { label: string; color: string }> = {
  fetching: { label: '拉取 PR', color: '#6366f1' },
  chunking: { label: '智能分片', color: '#8b5cf6' },
  reviewing: { label: '评审中', color: '#2563eb' },
  reviewing_security: { label: '安全检查', color: '#ef4444' },
  reviewing_normal: { label: '常规评审', color: '#2563eb' },
  summarizing: { label: '汇总结果', color: '#10b981' },
}

export default function ProgressIndicator({ progress, provider, model }: Props) {
  const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
  const cfg = PHASE_CONFIG[progress.phase] || PHASE_CONFIG.reviewing

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

      {/* 阶段标识 */}
      <div className="flex items-center gap-3">
        <span
          className="w-2.5 h-2.5 rounded-full animate-pulse flex-shrink-0"
          style={{ backgroundColor: cfg.color }}
        />
        <span className="text-sm font-medium" style={{ color: cfg.color }}>
          {cfg.label}
        </span>
        {progress.file && (
          <span className="text-xs text-gray-500 truncate ml-auto max-w-[50%]" title={progress.file}>
            {progress.file}
          </span>
        )}
      </div>

      {/* 进度条 */}
      <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${cfg.color}, ${cfg.color}88)`,
          }}
        />
      </div>

      {/* 信息行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 tabular-nums">
            {progress.current}/{progress.total}
            <span className="text-gray-600 ml-1">({pct}%)</span>
          </span>
          {progress.language && (
            <span className="text-xs text-gray-500 bg-gray-700/50 px-1.5 py-0.5 rounded">
              {progress.language}
            </span>
          )}
        </div>
        {progress.message && (
          <span className="text-xs text-gray-500 truncate max-w-[40%]">{progress.message}</span>
        )}
      </div>
    </div>
  )
}
