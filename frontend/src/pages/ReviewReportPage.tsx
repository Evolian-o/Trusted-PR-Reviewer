import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useSearchParams, useNavigate } from 'react-router-dom'
import { streamReview, fetchCachedReview } from '../services/api'
import type { ReviewPhase, ReviewProgress, ReviewResult, FileInfo, ModelInfo } from '../types/review'
import PRInfoBar from '../components/PRInfoBar'
import ProgressIndicator from '../components/ProgressIndicator'
import DiffViewer from '../components/DiffViewer'
import SummaryCard from '../components/SummaryCard'
import IssueList from '../components/IssueList'
import ExportToolbar from '../components/ExportToolbar'

export default function ReviewReportPage() {
  const { owner, repo, pr } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()

  const [phase, setPhase] = useState<ReviewPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [progress, setProgress] = useState<ReviewProgress | null>(null)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [currentPatch, setCurrentPatch] = useState<FileInfo | null>(null)
  const [allPatches, setAllPatches] = useState<Map<string, FileInfo>>(new Map())
  const [streamingFileIdx, setStreamingFileIdx] = useState(0)
  const reviewSectionRef = useRef<HTMLDivElement>(null)

  const prUrl = `https://github.com/${owner}/${repo}/pull/${pr}`
  const provider = searchParams.get('provider') || 'deepseek'
  const model = searchParams.get('model')
  const dims = searchParams.get('dims')
  const reviewId = searchParams.get('reviewId')
  const [fromCache, setFromCache] = useState(false)

  // 从缓存加载已有评审
  const loadCachedReview = useCallback(async (id: number) => {
    setPhase('loading')
    setStatusMsg('正在加载历史评审...')
    try {
      const cached = await fetchCachedReview(id)
      setResult(cached)
      if (provider) setModelInfo({ provider, model: model || provider })
      setFromCache(true)
      setPhase('done')
    } catch (err: any) {
      setError(err.message || '加载历史评审失败')
      setPhase('error')
    }
  }, [provider, model])

  useEffect(() => {
    if (reviewId) {
      loadCachedReview(parseInt(reviewId))
      return
    }

    setPhase('loading')

    const close = streamReview(
      prUrl,
      provider,
      model,
      dims,
      (msg) => setStatusMsg(msg),
      (p) => {
        setProgress(p)
        setPhase('progress')
        if (p.phase === 'reviewing' && p.current) {
          setStreamingFileIdx(p.current)
        }
      },
      (_token) => {
        // token 只在后台累积，不展示原始流式输出
        setPhase('streaming')
      },
      (r) => {
        setResult(r)
        setPhase('done')
        reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
      (err) => {
        setError(err)
        setPhase('error')
      },
      (info) => setModelInfo(info),
      (info) => {
        setCurrentPatch(info)
        setAllPatches((prev) => {
          const next = new Map(prev)
          next.set(info.filename, info)
          return next
        })
      },
    )

    return close
  }, [prUrl, provider, model, reviewId, loadCachedReview])

  // 将 allPatches 转为数组（按收集顺序）
  const patchList = useMemo(() => Array.from(allPatches.values()), [allPatches])

  return (
    <div className="min-h-screen bg-gray-900 py-8 px-4">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              {owner}/{repo} #{pr}
            </h1>
            {modelInfo && (
              <p className="text-sm text-gray-500 mt-1">
                评审模型: <span className="text-blue-400">{modelInfo.provider} / {modelInfo.model}</span>
              </p>
            )}
            {fromCache && (
              <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 bg-gray-500 rounded-full" />
                来自缓存 · 无需消耗 Token
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {fromCache && (
              <button
                onClick={() => {
                  const params = new URLSearchParams()
                  if (provider) params.set('provider', provider)
                  if (model) params.set('model', model || '')
                  window.location.href = `/review/${owner}/${repo}/${pr}?${params.toString()}`
                }}
                className="text-sm text-yellow-400 hover:text-yellow-300 px-3 py-1 border border-yellow-600 rounded transition-colors"
              >
                重新评审
              </button>
            )}
            <a
              href={prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              在 GitHub 查看 &rarr;
            </a>
          </div>
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
          <ProgressIndicator
            progress={progress}
            provider={modelInfo?.provider}
            model={modelInfo?.model}
          />
        )}

        {/* 评审中：全宽代码对比 + AI 分析状态 */}
        {(phase === 'progress' || phase === 'streaming') && (
          <div ref={reviewSectionRef} className="space-y-4">
            {/* 代码变更对比 — 全宽 */}
            <div>
              <h3 className="text-sm font-medium text-gray-400 mb-2 uppercase tracking-wide flex items-center gap-2">
                代码变更对比
                {phase === 'streaming' && (
                  <span className="text-xs font-normal text-blue-400 animate-pulse flex items-center gap-1 normal-case">
                    <span className="w-1.5 h-1.5 bg-blue-400 rounded-full" />
                    AI 分析中...
                  </span>
                )}
              </h3>
              {currentPatch ? (
                <DiffViewer
                  filename={currentPatch.filename}
                  language={currentPatch.language}
                  patch={currentPatch.patch}
                />
              ) : (
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6 text-center text-gray-500 text-sm">
                  等待评审数据...
                </div>
              )}
            </div>

            {/* 文件进度指示 */}
            {progress && progress.total > 1 && (
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span>已评审文件:</span>
                <div className="flex gap-1">
                  {patchList.map((_, i) => (
                    <span
                      key={i}
                      className={`w-2 h-2 rounded-full ${
                        i < streamingFileIdx
                          ? 'bg-green-500'
                          : i === streamingFileIdx - 1 && phase === 'streaming'
                            ? 'bg-blue-400 animate-pulse'
                            : 'bg-gray-600'
                      }`}
                    />
                  ))}
                </div>
                <span>{streamingFileIdx}/{progress.total}</span>
              </div>
            )}
          </div>
        )}

        {/* Done: 完整报告 */}
        {phase === 'done' && result && (
          <div className="space-y-6">
            <PRInfoBar result={result} />
            <SummaryCard result={result} />

            {/* 逐文件：代码对比 + 问题 */}
            {result.file_reviews.length > 0 && (
              <div className="space-y-8">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  代码审查详情
                  <span className="text-sm font-normal text-gray-400">
                    ({result.file_reviews.length} 个文件)
                  </span>
                </h2>
                {fromCache && (
                  <p className="text-xs text-gray-500 bg-gray-800 border border-gray-700 rounded px-3 py-2">
                    缓存数据不含 diff 补丁，仅展示评审结果。如需查看完整 diff，请点击「重新评审」。
                  </p>
                )}

                {result.file_reviews.map((fr) => {
                  const patch = allPatches.get(fr.file)
                  return (
                    <section key={fr.file}>
                      {/* 代码 diff（自带文件头：文件名 + 语言 + +/- 统计） */}
                      {patch ? (
                        <DiffViewer
                          filename={patch.filename}
                          language={patch.language}
                          patch={patch.patch}
                        />
                      ) : (
                        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3">
                          <span className="text-blue-400 font-mono text-sm">{fr.file}</span>
                          <p className="text-gray-500 text-xs mt-1">（无 diff 数据）</p>
                        </div>
                      )}

                      {/* 该文件的问题列表 */}
                      {fr.issues.length > 0 && (
                        <div className="ml-2 pl-4 border-l-2 border-gray-700 space-y-2">
                          {fr.issues.map((issue, i) => (
                            <div
                              key={i}
                              className="bg-gray-850 border border-gray-700 rounded-lg p-4"
                            >
                              <div className="flex items-center gap-2 mb-2">
                                <span
                                  className={`px-1.5 py-0.5 rounded text-xs font-bold text-white ${
                                    issue.severity === 'critical'
                                      ? 'bg-red-600'
                                      : issue.severity === 'high'
                                        ? 'bg-orange-600'
                                        : issue.severity === 'medium'
                                          ? 'bg-yellow-600'
                                          : 'bg-gray-600'
                                  }`}
                                >
                                  {issue.severity.toUpperCase()}
                                </span>
                                <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                                  {issue.category}
                                </span>
                                {issue.line && (
                                  <span className="text-xs text-gray-600 font-mono">
                                    :{issue.line}
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-300 text-sm mb-2">{issue.description}</p>
                              {issue.suggestion && (
                                <div className="bg-gray-900 border border-gray-600 rounded p-3">
                                  <span className="text-xs text-green-400 font-medium">
                                    建议修改
                                  </span>
                                  <pre className="text-gray-300 text-sm mt-1.5 whitespace-pre-wrap font-mono leading-relaxed">
                                    {issue.suggestion}
                                  </pre>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {fr.issues.length === 0 && fr.summary && (
                        <p className="text-gray-500 text-sm ml-2 pl-4 border-l-2 border-gray-700 py-1">
                          {fr.summary}
                        </p>
                      )}
                    </section>
                  )
                })}
              </div>
            )}

            {/* 底部：问题汇总 */}
            <IssueList issues={result.issues} />
            <ExportToolbar result={result} />
          </div>
        )}
      </div>
    </div>
  )
}
