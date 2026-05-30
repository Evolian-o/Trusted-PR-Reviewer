import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { fetchSharedReview } from '../services/api'
import type { ReviewResult } from '../types/review'
import PRInfoBar from '../components/PRInfoBar'
import IssueList from '../components/IssueList'

export default function SharePage() {
  const { token } = useParams<{ token: string }>()
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    fetchSharedReview(token)
      .then(setResult)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error || !result) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="bg-red-900/30 border border-red-500 rounded-lg p-6 max-w-md text-center">
          <h2 className="text-red-400 font-bold text-lg mb-2">无法加载</h2>
          <p className="text-red-300 text-sm">{error || '数据不存在'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="text-center mb-2">
          <p className="text-xs text-gray-600">通过 Trusted PR Reviewer 分享的评审报告</p>
        </div>

        <PRInfoBar result={result} />

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
          <h3 className="text-lg font-bold text-white mb-3">评审总结</h3>
          <pre className="text-gray-300 leading-relaxed whitespace-pre-wrap font-sans text-sm">
            {result.summary}
          </pre>
        </div>

        {result.file_reviews.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-bold text-white">
              审查文件 ({result.file_reviews.length})
            </h2>
            {result.file_reviews.map((fr) => (
              <div key={fr.file} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
                <h4 className="text-sm font-mono text-blue-400 mb-2">{fr.file}</h4>
                {fr.summary && (
                  <p className="text-gray-400 text-sm mb-2">{fr.summary}</p>
                )}
                {fr.issues.length > 0 && (
                  <div className="space-y-2">
                    {fr.issues.map((issue, i) => (
                      <div key={i} className={`border-l-4 ${
                        issue.severity === 'critical' ? 'border-red-500 bg-red-900/20' :
                        issue.severity === 'high' ? 'border-orange-500 bg-orange-900/20' :
                        issue.severity === 'medium' ? 'border-yellow-500 bg-yellow-900/20' :
                        'border-gray-500 bg-gray-800'
                      } rounded p-3`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold text-white ${
                            issue.severity === 'critical' ? 'bg-red-600' :
                            issue.severity === 'high' ? 'bg-orange-600' :
                            issue.severity === 'medium' ? 'bg-yellow-600' : 'bg-gray-600'
                          }`}>
                            {issue.severity.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500">
                            {issue.category} {issue.line ? `:${issue.line}` : ''}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm">{issue.description}</p>
                        {issue.suggestion && (
                          <p className="text-gray-400 text-xs mt-1">
                            <span className="text-green-400">建议: </span>{issue.suggestion}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <IssueList issues={result.issues} />

        <div className="text-center pt-4 pb-8">
          <a
            href={`https://github.com/${result.owner}/${result.repo}/pull/${result.pull_number}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            在 GitHub 查看 PR #{result.pull_number} &rarr;
          </a>
        </div>
      </div>
    </div>
  )
}
