import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { TrendEntry } from '../types/review'

interface Props {
  trend: TrendEntry[]
  currentResultId?: number
}

export default function TrendTable({ trend, currentResultId }: Props) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  if (trend.length === 0) return null

  const goToReview = (t: TrendEntry) => {
    const params = new URLSearchParams()
    params.set('reviewId', String(t.id))
    navigate(`/review/${t.owner}/${t.repo}/${t.pull_number}?${params.toString()}`)
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <h3 className="text-lg font-bold text-white mb-4">
        {t('history.trend.title')}
        <span className="text-sm font-normal text-gray-400 ml-2">
          {t('history.trend.recent', { count: trend.length })}
        </span>
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-gray-400 border-b border-gray-700">
              <th className="text-left py-2 pr-3 font-medium">{t('history.trend.author')}</th>
              <th className="text-left py-2 px-3 font-medium">{t('history.trend.pr')}</th>
              <th className="text-center py-2 px-3 font-medium">{t('history.trend.risk')}</th>
              <th className="text-center py-2 px-3 font-medium">{t('history.trend.issues')}</th>
              <th className="text-center py-2 px-3 font-medium">{t('history.trend.overall')}</th>
              <th className="text-center py-2 px-3 font-medium">{t('history.trend.security')}</th>
              <th className="text-right py-2 pl-3 font-medium">{t('history.trend.date')}</th>
            </tr>
          </thead>
          <tbody>
            {trend.map((entry, i) => {
              const isCurrent = entry.id === currentResultId || i === 0
              const riskColor =
                entry.risk_level === 'high' ? 'text-red-400' :
                entry.risk_level === 'medium' ? 'text-yellow-400' : 'text-green-400'
              const scoreVal = entry.scores?.overall
              const secVal = entry.scores?.security
              return (
                <tr
                  key={entry.id}
                  onClick={() => goToReview(entry)}
                  className={`border-b border-gray-700/50 cursor-pointer ${
                    isCurrent ? 'bg-blue-900/20' : 'hover:bg-gray-750'
                  }`}
                >
                  <td className="py-2.5 pr-3">
                    <span className="text-gray-400 text-xs whitespace-nowrap">
                      {entry.owner}/{entry.repo}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <span className="text-gray-200 truncate max-w-[180px] block">
                      #{entry.pull_number} {entry.pr_title}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-3">
                    <span className={`text-xs font-bold ${riskColor}`}>
                      {entry.risk_level === 'high' ? t('history.trend.risk_high') : entry.risk_level === 'medium' ? t('history.trend.risk_medium') : t('history.trend.risk_low')}
                    </span>
                  </td>
                  <td className="text-center py-2.5 px-3">
                    <span className={`font-mono font-bold ${
                      entry.issue_count > 5 ? 'text-red-400' :
                      entry.issue_count > 0 ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      {entry.issue_count}
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
                    {entry.created_at?.slice(0, 10) || '-'}
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
