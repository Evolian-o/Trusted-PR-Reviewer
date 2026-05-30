import type { ReviewResult } from '../types/review'

const RISK_COLORS: Record<string, string> = {
  high: 'bg-red-600',
  medium: 'bg-yellow-600',
  low: 'bg-green-600',
}

const DIM_LABELS: Record<string, string> = {
  overall: '综合',
  security: '安全',
  bug: 'Bug',
  performance: '性能',
  style: '规范',
}

const DIM_ORDER = ['security', 'bug', 'performance', 'style']

function scoreColor(v: number): string {
  if (v >= 80) return 'text-green-400'
  if (v >= 60) return 'text-yellow-400'
  return 'text-red-400'
}

function barColor(v: number): string {
  if (v >= 80) return 'bg-green-500'
  if (v >= 60) return 'bg-yellow-500'
  return 'bg-red-500'
}

function ScoreRing({ value, size = 80 }: { value: number; size?: number }) {
  const strokeW = 6
  const r = (size - strokeW) / 2
  const circ = 2 * Math.PI * r
  const offset = circ - (value / 100) * circ

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={strokeW}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={value >= 80 ? '#22c55e' : value >= 60 ? '#eab308' : '#ef4444'}
          strokeWidth={strokeW}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-700"
        />
      </svg>
      <span className={`absolute text-lg font-bold ${scoreColor(value)}`}>
        {value}
      </span>
    </div>
  )
}

export default function PRInfoBar({ result }: { result: ReviewResult }) {
  const hasScores = result.scores && Object.keys(result.scores).length > 0

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-white truncate">{result.pr_title}</h2>
          <p className="text-sm text-gray-400 mt-1">
            {result.owner}/{result.repo} #{result.pull_number}
          </p>
          <div className="flex items-center gap-4 text-sm mt-2 flex-wrap">
            <span className="text-gray-300">{result.files_changed} 个文件</span>
            <span className="text-green-400">+{result.additions}</span>
            <span className="text-red-400">-{result.deletions}</span>
            <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${RISK_COLORS[result.risk_level] || 'bg-gray-600'}`}>
              {result.risk_level === 'high' ? '高风险' :
               result.risk_level === 'medium' ? '中风险' : '低风险'}
            </span>
          </div>
        </div>

        {/* 评分可视化 */}
        {hasScores && (
          <div className="flex items-start gap-5">
            <div className="flex flex-col items-center">
              <ScoreRing value={result.scores.overall || 0} size={80} />
              <span className="text-xs text-gray-500 mt-1">综合评分</span>
            </div>
            <div className="space-y-1.5 min-w-[140px]">
              {DIM_ORDER.map((dim) => {
                const val = result.scores[dim] || 0
                return (
                  <div key={dim} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-9">{DIM_LABELS[dim]}</span>
                    <div className="flex-1 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${barColor(val)}`}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                    <span className={`text-xs font-mono w-7 text-right ${scoreColor(val)}`}>
                      {val}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
