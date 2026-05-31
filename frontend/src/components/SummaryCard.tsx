import { useTranslation } from 'react-i18next'
import type { ReviewResult } from '../types/review'

export default function SummaryCard({ result }: { result: ReviewResult }) {
  const { t } = useTranslation()

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <h3 className="text-lg font-bold text-white mb-3">{t('review.summary_title')}</h3>
      <pre className="text-gray-300 leading-relaxed whitespace-pre-wrap font-sans text-sm">
        {result.summary}
      </pre>
      <div className="mt-4 flex gap-4 text-sm border-t border-gray-700 pt-3">
        <span className="text-gray-400">
          {t('review.issues_found', { count: result.issues.length })}
        </span>
        <span className="text-gray-400">
          {t('review.suggestions_found', { count: result.suggestions.length })}
        </span>
      </div>
    </div>
  )
}
