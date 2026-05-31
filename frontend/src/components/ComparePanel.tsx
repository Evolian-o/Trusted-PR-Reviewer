import { useTranslation } from 'react-i18next'
import type { ReviewResult, ModelInfo } from '../types/review'

interface Props {
  result: ReviewResult
  compareResult: ReviewResult | null
  modelInfo: ModelInfo | null
  compareModel: string | null
  viewMode: 'primary' | 'compare'
  onViewModeChange: (mode: 'primary' | 'compare') => void
}

export default function ComparePanel({
  result, compareResult, modelInfo, compareModel, viewMode, onViewModeChange,
}: Props) {
  const { t } = useTranslation()

  if (!compareResult) return null

  return (
    <>
      <div className="flex gap-2 bg-gray-800 border border-gray-700 rounded-lg p-1">
        <button
          onClick={() => onViewModeChange('primary')}
          className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
            viewMode === 'primary'
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {modelInfo?.model || t('review.compare.primary')} ({result.issues.length} {t('review.compare.issue_suffix')})
        </button>
        <button
          onClick={() => onViewModeChange('compare')}
          className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
            viewMode === 'compare'
              ? 'bg-indigo-600 text-white'
              : 'text-gray-400 hover:text-gray-200'
          }`}
        >
          {compareModel || t('review.compare.compare')} ({compareResult.issues.length} {t('review.compare.issue_suffix')})
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3 text-center">
        {['overall', 'security', 'bug', 'performance'].map((dim) => {
          const labels: Record<string, string> = {
            overall: t('review.info.dim_overall'),
            security: t('review.info.dim_security'),
            bug: t('review.info.dim_bug'),
            performance: t('review.info.dim_performance'),
          }
          const pVal = result.scores[dim] || 0
          const cVal = compareResult.scores[dim] || 0
          const diff = cVal - pVal
          return (
            <div key={dim} className="bg-gray-800 border border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">{labels[dim]}</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-bold text-blue-400">{pVal}</span>
                <span className="text-gray-600 text-xs">vs</span>
                <span className="text-lg font-bold text-indigo-400">{cVal}</span>
              </div>
              <p className={`text-xs mt-1 ${diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                {diff > 0 ? `+${diff}` : diff}
              </p>
            </div>
          )
        })}
      </div>
    </>
  )
}
