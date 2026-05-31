import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { Issue } from '../types/review'

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'border-red-500 bg-red-900/20',
  high: 'border-orange-500 bg-orange-900/20',
  medium: 'border-yellow-500 bg-yellow-900/20',
  low: 'border-gray-500 bg-gray-800',
}

const PRIORITY_COLORS: Record<string, string> = {
  must_fix: 'bg-red-700 text-red-100',
  should_fix: 'bg-yellow-700 text-yellow-100',
  nice_to_fix: 'bg-gray-600 text-gray-300',
}

export default function IssueCard({ issue }: { issue: Issue }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const hasCode = !!(issue.current_code || issue.proposed_code)

  const PRIORITY_LABELS: Record<string, string> = {
    must_fix: t('issues.card.priority_must'),
    should_fix: t('issues.card.priority_should'),
    nice_to_fix: t('issues.card.priority_nice'),
  }

  const CATEGORY_LABELS: Record<string, string> = {
    bug: t('issues.card.type_bug'),
    security: t('issues.card.type_security'),
    performance: t('issues.card.type_performance'),
    style: t('issues.card.type_style'),
  }

  return (
    <div className={`border-l-4 rounded p-4 ${SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.low}`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className={`px-1.5 py-0.5 rounded text-xs font-bold text-white ${
          issue.severity === 'critical' ? 'bg-red-600' :
          issue.severity === 'high' ? 'bg-orange-600' :
          issue.severity === 'medium' ? 'bg-yellow-600' : 'bg-gray-600'
        }`}>
          {issue.severity.toUpperCase()}
        </span>
        <span className={`px-1.5 py-0.5 rounded text-xs ${PRIORITY_COLORS[issue.priority] || PRIORITY_COLORS.should_fix}`}>
          {PRIORITY_LABELS[issue.priority] || issue.priority}
        </span>
        <span className="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-300">
          {CATEGORY_LABELS[issue.category] || issue.category}
        </span>
        <span className="text-xs text-gray-500 font-mono">
          {issue.file}{issue.line ? `:${issue.line}` : ''}
        </span>
        {issue.confidence > 0 && (
          <span className={`ml-auto text-xs font-medium ${
            issue.confidence >= 80 ? 'text-green-400' :
            issue.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'
          }`}>
            {t('issues.card.confidence', { percent: issue.confidence })}
          </span>
        )}
      </div>

      <p className="text-gray-200 text-sm mb-2">{issue.description}</p>

      {issue.suggestion && (
        <p className="text-gray-400 text-sm mb-2">
          <span className="text-green-400 font-medium">{t('issues.card.suggestion')}</span>
          {issue.suggestion}
        </p>
      )}

      {hasCode && (
        <>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-400 hover:text-blue-300 mb-2 inline-block"
          >
            {expanded ? t('issues.card.collapse') : t('issues.card.expand')}
          </button>
          {expanded && (
            <div className="space-y-2 mt-1">
              {issue.current_code && (
                <div>
                  <span className="text-xs text-red-400 font-medium">{t('issues.card.current_code')}</span>
                  <pre className="bg-gray-900 text-red-300 text-xs p-2.5 rounded mt-0.5 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                    {issue.current_code}
                  </pre>
                </div>
              )}
              {issue.proposed_code && (
                <div>
                  <span className="text-xs text-green-400 font-medium">{t('issues.card.proposed_code')}</span>
                  <pre className="bg-gray-900 text-green-300 text-xs p-2.5 rounded mt-0.5 overflow-x-auto whitespace-pre-wrap font-mono leading-relaxed">
                    {issue.proposed_code}
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
