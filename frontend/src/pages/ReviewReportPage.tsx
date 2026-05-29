import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { streamReview } from '../services/api'
import type { ReviewPhase, ReviewProgress, ReviewResult } from '../types/review'
import PRInfoBar from '../components/PRInfoBar'
import ProgressIndicator from '../components/ProgressIndicator'
import SummaryCard from '../components/SummaryCard'
import IssueList from '../components/IssueList'
import ExportToolbar from '../components/ExportToolbar'

export default function ReviewReportPage() {
  const { owner, repo, pr } = useParams()
  const [searchParams] = useSearchParams()

  const [phase, setPhase] = useState<ReviewPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [progress, setProgress] = useState<ReviewProgress | null>(null)
  const [streamingText, setStreamingText] = useState('')
  const [result, setResult] = useState<ReviewResult | null>(null)
  const streamingRef = useRef<HTMLDivElement>(null)

  const prUrl = `https://github.com/${owner}/${repo}/pull/${pr}`
  const provider = searchParams.get('provider') || 'deepseek'
  const model = searchParams.get('model')

  useEffect(() => {
    setPhase('loading')

    const close = streamReview(
      prUrl,
      provider,
      model,
      (msg) => setStatusMsg(msg),
      (p) => {
        setProgress(p)
        setPhase('progress')
      },
      (token) => {
        setStreamingText((prev) => prev + token)
        setPhase('streaming')
        streamingRef.current?.scrollTo({ top: streamingRef.current.scrollHeight })
      },
      (r) => {
        setResult(r)
        setPhase('done')
      },
      (err) => {
        setError(err)
        setPhase('error')
      },
    )

    return close
  }, [prUrl, provider, model])

  return (
    <div className="min-h-screen bg-gray-900 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">
            {owner}/{repo} #{pr}
          </h1>
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            在 GitHub 查看 →
          </a>
        </div>

        {/* Loading */}
        {(phase === 'loading' || phase === 'idle') && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">{statusMsg || '正在连接...'}</p>
          </div>
        )}

        {/* Error */}
        {phase === 'error' && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-5">
            <h3 className="text-red-400 font-bold mb-2">评审失败</h3>
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {/* Progress */}
        {(phase === 'progress' || phase === 'streaming') && progress && (
          <ProgressIndicator progress={progress} />
        )}

        {/* Streaming content */}
        {phase === 'streaming' && (
          <div
            ref={streamingRef}
            className="bg-gray-800 border border-gray-700 rounded-lg p-5 max-h-96 overflow-y-auto"
          >
            <pre className="text-sm text-gray-300 whitespace-pre-wrap font-mono">
              {streamingText}
            </pre>
          </div>
        )}

        {/* Done: Full report */}
        {phase === 'done' && result && (
          <>
            <PRInfoBar result={result} />
            <SummaryCard result={result} />
            <IssueList issues={result.issues} />
            <ExportToolbar result={result} />
            {result.file_reviews.length > 0 && (
              <details className="bg-gray-800 border border-gray-700 rounded-lg p-5">
                <summary className="text-lg font-bold text-white cursor-pointer mb-3">
                  各文件评审详情
                </summary>
                <div className="space-y-4 mt-3">
                  {result.file_reviews.map((fr) => (
                    <div key={fr.file} className="border-t border-gray-700 pt-4 first:border-t-0 first:pt-0">
                      <h4 className="text-blue-400 font-medium mb-2">{fr.file}</h4>
                      <p className="text-gray-400 text-sm mb-2">{fr.summary}</p>
                      {fr.suggestions.length > 0 && (
                        <ul className="list-disc list-inside text-sm text-gray-300">
                          {fr.suggestions.map((s, i) => (
                            <li key={i}>{s}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </div>
  )
}
