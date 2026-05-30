import type { TrendEntry } from '../types/review'

interface Props {
  trend: TrendEntry[]
  currentResultId?: number
}

export default function TrendTable({ trend, currentResultId }: Props) {
  if (trend.length <= 1) return null

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <h3 className="text-lg font-bold text-white mb-4">
        历史趋势
        <span className="text-sm font-normal text-gray-400 ml-2">
          最近 {trend.length} 次评审
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left py-2 pr-4 font-medium">PR</th>
              <th className="text-center py-2 px-3 font-medium">风险</th>
              <th className="text-center py-2 px-3 font-medium">问题</th>
              <th className="text-center py-2 px-3 font-medium">综合</th>
              <th className="text-center py-2 px-3 font-medium">安全</th>
              <th className="text-right py-2 pl-3 font-medium">日期</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((t, i) => {
              const isCurrent = t.id === currentResultId || i === 0
              const riskColor =
                t.risk_level === 'high' ? 'text-red-400' :
                t.risk_level === 'medium' ? 'text-yellow-400' : 'text-green-400'
              const scoreVal = t.scores?.overall
              const secVal = t.scores?.security
              return (
                <tr
                  key={t.id}
                  className={`border-b border-gray-700/50 ${
                    isCurrent ? 'bg-blue-900/20' : 'hover:bg-gray-750'
                  }`}
                >
                  <td className="py-2.5 pr-4">
                    <span className="text-gray-200 truncate max-w-[200px] block">
                      #{t.pull_number} {t.pr_title}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-3">
                    <span className={`text-xs font-bold ${riskColor}`}>
                      {t.risk_level === 'high' ? '高' : t.risk_level === 'medium' ? '中' : '低'}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-3">
                    <span className={`font-mono font-bold ${
                      t.issue_count > 5 ? 'text-red-400' :
                      t.issue_count > 0 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {t.issue_count}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-3">
                    {scoreVal != null ? (
                      <span className={`font-mono text-xs ${
                        scoreVal >= 80 ? 'text-green-400' :
                        scoreVal >= 60 ? 'text-yellow-400' : 'text-red-400'
                      }`}>{scoreVal}</span>
                    ) : <span className="text-gray-600">-</span>}
                  </td>
                  <td className="text-center py-2.5 px-3">
                    {secVal != null ? (
                      <span className={`font-mono text-xs ${
                        secVal >= 80 ? 'text-green-400' :
                        secVal >= 60 ? 'text-yellow-400' : 'text-red-400'
                      }`}>{secVal}</span>
                    ) : <span className="text-gray-600">-</span>}
                  </td>
                  <td className="text-right py-2.5 pl-3 text-gray-500 text-xs whitespace-nowrap">
                    {t.created_at?.slice(0, 10) || '-'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
