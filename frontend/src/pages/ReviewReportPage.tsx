import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { streamReview, fetchCachedReview, fetchRepoStats } from '../services/api'
import type { ReviewPhase, ReviewProgress, ReviewResult, FileInfo, FileReview, ModelInfo, TrendEntry } from '../types/review'
import PRInfoBar from '../components/PRInfoBar'
import ProgressIndicator from '../components/ProgressIndicator'
import DiffViewer from '../components/DiffViewer'
import SummaryCard from '../components/SummaryCard'
import IssueList from '../components/IssueList'
import ExportToolbar from '../components/ExportToolbar'

const NAV_ITEMS = [
  { id: 'overview', label: '概览' },
  { id: 'code-review', label: '代码审查' },
  { id: 'issues-summary', label: '问题汇总' },
  { id: 'export', label: '导出' },
]

/** 从分片文件名推导原始文件名来匹配 patch
 *  "main_(fn: process_data +1).py" → "main.py"
 *  "utils (fn: validate_email)"   → "utils"
 */
function findPatch(patches: Map<string, FileInfo>, chunkName: string): FileInfo | undefined {
  if (patches.has(chunkName)) return patches.get(chunkName)
  // 尝试匹配 _(fn: ...) 或  (fn: ...) 形式的分片后缀
  const m = chunkName.match(/[ _]\(fn:.*?\)(?=\.[^./]+$|$)/)
  if (!m || m.index === undefined) return undefined
  const base = chunkName.slice(0, m.index) + chunkName.slice(m.index + m[0].length)
  return patches.get(base)
}

export default function ReviewReportPage() {
  const { owner, repo, pr } = useParams()
  const [searchParams] = useSearchParams()

  const [phase, setPhase] = useState<ReviewPhase>('idle')
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [progress, setProgress] = useState<ReviewProgress | null>(null)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null)
  const [currentPatch, setCurrentPatch] = useState<FileInfo | null>(null)
  const [allPatches, setAllPatches] = useState<Map<string, FileInfo>>(new Map())
  const [streamingFileIdx, setStreamingFileIdx] = useState(0)
  const [collapsedFiles, setCollapsedFiles] = useState<Set<string>>(new Set())
  const [showScrollTop, setShowScrollTop] = useState(false)
  const [activeNav, setActiveNav] = useState('overview')
  const [trend, setTrend] = useState<TrendEntry[]>([])
  const [streamedFileReviews, setStreamedFileReviews] = useState<FileReview[]>([])
  const reviewSectionRef = useRef<HTMLDivElement>(null)
  const overviewRef = useRef<HTMLDivElement>(null)
  const codeReviewRef = useRef<HTMLDivElement>(null)
  const exportRef = useRef<HTMLDivElement>(null)

  const prUrl = `https://github.com/${owner}/${repo}/pull/${pr}`
  const provider = searchParams.get('provider') || 'deepseek'
  const model = searchParams.get('model')
  const dims = searchParams.get('dims')
  const reviewId = searchParams.get('reviewId')
  const compareModel = searchParams.get('compare_model')
  const [fromCache, setFromCache] = useState(false)
  const [compareResult, setCompareResult] = useState<ReviewResult | null>(null)
  const [viewMode, setViewMode] = useState<'primary' | 'compare'>('primary')
  const activeResult = viewMode === 'compare' && compareResult ? compareResult : result

  // 监听滚动：FAB 可见性 + 导航高亮
  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 400)
      // 简单的导航高亮：检查哪个区块在视口中
      const sections = [
        { id: 'overview', ref: overviewRef },
        { id: 'code-review', ref: codeReviewRef },
        { id: 'issues-summary', ref: null }, // handled by id in IssueList
        { id: 'export', ref: exportRef },
      ]
      for (const s of sections) {
        const el = s.ref?.current || document.getElementById(s.id)
        if (el) {
          const rect = el.getBoundingClientRect()
          if (rect.top <= 120 && rect.bottom >= 120) {
            setActiveNav(s.id)
            break
          }
        }
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [phase])

  // 从缓存加载已有评审
  const loadCachedReview = useCallback(async (id: number) => {
    setPhase('loading')
    setStatusMsg('正在加载历史评审...')
    try {
      const cached = await fetchCachedReview(id)
      setResult(cached.result)
      if (provider) setModelInfo({ provider, model: model || provider })
      if (cached.patches) {
        const patchMap = new Map<string, FileInfo>()
        for (const p of cached.patches) {
          patchMap.set(p.filename, p)
        }
        setAllPatches(patchMap)
      }
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
    setStreamedFileReviews([])

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
      (fr) => {
        setStreamedFileReviews((prev) => [...prev, fr])
      },
      (compareR) => setCompareResult(compareR),
      compareModel,
    )

    return close
  }, [prUrl, provider, model, reviewId, loadCachedReview])

  const patchList = useMemo(() => Array.from(allPatches.values()), [allPatches])

  // done 后加载该仓库的历史趋势
  useEffect(() => {
    if (phase === 'done' && result) {
      fetchRepoStats(result.owner, result.repo)
        .then(setTrend)
        .catch(() => setTrend([]))
    }
  }, [phase, result])

  const toggleCollapse = (filename: string) => {
    setCollapsedFiles((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

            {/* 已完成的文件评审结果（增量渲染） */}
            {streamedFileReviews.length > 0 && (
              <div className="space-y-4 pt-2">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                  已完成 ({streamedFileReviews.length})
                </h3>
                {streamedFileReviews.map((fr) => {
                  const patch = findPatch(allPatches, fr.file)
                  const isCollapsed = collapsedFiles.has(fr.file)
                  const inlineIssues = new Map<number, typeof fr.issues>()
                  const orphanIssues: typeof fr.issues = []
                  for (const issue of fr.issues) {
                    if (issue.line != null) {
                      const arr = inlineIssues.get(issue.line)
                      if (arr) arr.push(issue)
                      else inlineIssues.set(issue.line, [issue])
                    } else {
                      orphanIssues.push(issue)
                    }
                  }

                  return (
                    <section key={fr.file} className="border border-gray-700 rounded-lg overflow-hidden opacity-90 hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => toggleCollapse(fr.file)}
                        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800 hover:bg-gray-750 transition-colors text-left"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-xs transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                          <span className="text-sm font-mono text-green-400 truncate">{fr.file}</span>
                          {fr.issues.length > 0 && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                              fr.issues.some((i) => i.priority === 'must_fix')
                                ? 'bg-red-700 text-red-100'
                                : fr.issues.some((i) => i.severity === 'high' || i.severity === 'critical')
                                  ? 'bg-orange-700 text-orange-100'
                                  : 'bg-yellow-700 text-yellow-100'
                            }`}>
                              {fr.issues.length} 问题
                            </span>
                          )}
                          {fr.issues.length === 0 && (
                            <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-green-700 text-green-100">通过</span>
                          )}
                        </div>
                      </button>

                      {!isCollapsed && (
                        <div className="p-1">
                          {patch ? (
                            <DiffViewer
                              filename={patch.filename}
                              language={patch.language}
                              patch={patch.patch}
                              inlineIssues={inlineIssues.size > 0 ? inlineIssues : undefined}
                            />
                          ) : (
                            <div className="bg-gray-800 rounded p-4 m-1">
                              <span className="text-green-400 font-mono text-sm">{fr.file}</span>
                            </div>
                          )}
                          {orphanIssues.length > 0 && (
                            <div className="mx-3 mb-2 pl-4 border-l-2 border-gray-700 space-y-2">
                              {orphanIssues.map((issue, i) => {
                                const sevBg: Record<string, string> = {
                                  critical: 'border-red-500 bg-red-900/20',
                                  high: 'border-orange-500 bg-orange-900/20',
                                  medium: 'border-yellow-500 bg-yellow-900/20',
                                  low: 'border-gray-500 bg-gray-800',
                                }
                                return (
                                  <div key={i} className={`border-l-4 ${sevBg[issue.severity] || sevBg.low} rounded p-3`}>
                                    <div className="flex items-center gap-2 mb-1.5">
                                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold text-white ${
                                        issue.severity === 'critical' ? 'bg-red-600' :
                                        issue.severity === 'high' ? 'bg-orange-600' :
                                        issue.severity === 'medium' ? 'bg-yellow-600' : 'bg-gray-600'
                                      }`}>
                                        {issue.severity.toUpperCase()}
                                      </span>
                                      <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                                        {issue.category}
                                      </span>
                                    </div>
                                    <p className="text-gray-300 text-sm">{issue.description}</p>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Done: 完整报告 */}
        {phase === 'done' && result && (
          <>
            {/* 粘性导航栏 */}
            <nav className="sticky top-0 z-30 -mx-4 px-4 bg-gray-900/95 backdrop-blur border-b border-gray-700/50 py-2.5 flex items-center gap-1 overflow-x-auto"
              style={{ borderImage: 'linear-gradient(90deg, #6366f1, #8b5cf6, transparent) 1' }}>
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => scrollTo(item.id)}
                  className={`px-3 py-1.5 rounded text-sm whitespace-nowrap transition-colors ${
                    activeNav === item.id
                      ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-600/25'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="space-y-6">
              {/* 多模型对比 Tab */}
              {compareResult && (
                <>
                  <div className="flex gap-2 bg-gray-800 border border-gray-700 rounded-lg p-1">
                    <button
                      onClick={() => setViewMode('primary')}
                      className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                        viewMode === 'primary'
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {modelInfo?.model || '主模型'} ({result.issues.length} 问题)
                    </button>
                    <button
                      onClick={() => setViewMode('compare')}
                      className={`flex-1 py-2 rounded text-sm font-medium transition-colors ${
                        viewMode === 'compare'
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-400 hover:text-gray-200'
                      }`}
                    >
                      {compareModel || '对比模型'} ({compareResult.issues.length} 问题)
                    </button>
                  </div>

                  {/* 指标对比面板 */}
                  <div className="grid grid-cols-4 gap-3 text-center">
                    {['overall', 'security', 'bug', 'performance'].map((dim) => {
                      const labels: Record<string, string> = { overall: '综合', security: '安全', bug: 'Bug', performance: '性能' }
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
              )}

              <div ref={overviewRef} id="overview" className="scroll-mt-16">
                <PRInfoBar result={result} />
              </div>
              <SummaryCard result={result} />

              {/* 逐文件：代码对比 + 问题 */}
              {activeResult.file_reviews.length > 0 && (
                <div ref={codeReviewRef} id="code-review" className="space-y-4 scroll-mt-16">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    代码审查详情
                    <span className="text-sm font-normal text-gray-400">
                      ({activeResult.file_reviews.length} 个文件)
                    </span>
                  </h2>
                  {fromCache && allPatches.size === 0 && (
                    <p className="text-xs text-gray-500 bg-gray-800 border border-gray-700 rounded px-3 py-2">
                      缓存数据不含 diff 补丁，仅展示评审结果。如需查看完整 diff，请点击「重新评审」。
                    </p>
                  )}

                  {activeResult.file_reviews.map((fr) => {
                    const patch = findPatch(allPatches, fr.file)
                    const isCollapsed = collapsedFiles.has(fr.file)
                    const inlineIssues = new Map<number, typeof fr.issues>()
                    const orphanIssues: typeof fr.issues = []
                    for (const issue of fr.issues) {
                      if (issue.line != null) {
                        const arr = inlineIssues.get(issue.line)
                        if (arr) arr.push(issue)
                        else inlineIssues.set(issue.line, [issue])
                      } else {
                        orphanIssues.push(issue)
                      }
                    }

                    return (
                      <section key={fr.file} className="border border-gray-700 rounded-lg overflow-hidden">
                        {/* 文件头：可折叠 */}
                        <button
                          onClick={() => toggleCollapse(fr.file)}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800 hover:bg-gray-750 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>
                              ▶
                            </span>
                            <span className="text-sm font-mono text-blue-400 truncate">{fr.file}</span>
                            {fr.issues.length > 0 && (
                              <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                                fr.issues.some((i) => i.priority === 'must_fix')
                                  ? 'bg-red-700 text-red-100'
                                  : fr.issues.some((i) => i.severity === 'high' || i.severity === 'critical')
                                    ? 'bg-orange-700 text-orange-100'
                                    : 'bg-yellow-700 text-yellow-100'
                              }`}>
                                {fr.issues.length} 问题
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                            {fr.summary ? fr.summary.slice(0, 50) + (fr.summary.length > 50 ? '…' : '') : ''}
                          </span>
                        </button>

                        {!isCollapsed && (
                          <div className="p-1">
                            {patch ? (
                              <DiffViewer
                                filename={patch.filename}
                                language={patch.language}
                                patch={patch.patch}
                                inlineIssues={inlineIssues.size > 0 ? inlineIssues : undefined}
                              />
                            ) : (
                              <div className="bg-gray-800 rounded p-4 m-1">
                                <span className="text-blue-400 font-mono text-sm">{fr.file}</span>
                                <p className="text-gray-500 text-xs mt-1">（无 diff 数据）</p>
                              </div>
                            )}

                            {orphanIssues.length > 0 && (
                              <div className="mx-3 mb-2 pl-4 border-l-2 border-gray-700 space-y-2">
                                {orphanIssues.map((issue, i) => {
                                  const sevBg: Record<string, string> = {
                                    critical: 'border-red-500 bg-red-900/20',
                                    high: 'border-orange-500 bg-orange-900/20',
                                    medium: 'border-yellow-500 bg-yellow-900/20',
                                    low: 'border-gray-500 bg-gray-800',
                                  }
                                  return (
                                    <div key={i} className={`border-l-4 ${sevBg[issue.severity] || sevBg.low} rounded p-3`}>
                                      <div className="flex items-center gap-2 mb-1.5">
                                        <span className={`px-1.5 py-0.5 rounded text-xs font-bold text-white ${
                                          issue.severity === 'critical' ? 'bg-red-600' :
                                          issue.severity === 'high' ? 'bg-orange-600' :
                                          issue.severity === 'medium' ? 'bg-yellow-600' : 'bg-gray-600'
                                        }`}>
                                          {issue.severity.toUpperCase()}
                                        </span>
                                        <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                                          {issue.category}
                                        </span>
                                      </div>
                                      <p className="text-gray-300 text-sm">{issue.description}</p>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {fr.issues.length === 0 && fr.summary && (
                              <p className="text-gray-500 text-sm mx-3 mb-2 pl-4 border-l-2 border-gray-700 py-1">
                                {fr.summary}
                              </p>
                            )}
                          </div>
                        )}
                      </section>
                    )
                  })}
                </div>
              )}

              {/* 底部：问题汇总 */}
              <IssueList issues={activeResult.issues} />

              {/* 历史趋势对比 */}
              {trend.length > 1 && (
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
                          const isCurrent = t.id === (result as any)?.id || i === 0
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
                                  }`}>
                                    {scoreVal}
                                  </span>
                                ) : (
                                  <span className="text-gray-600">-</span>
                                )}
                              </td>
                              <td className="text-center py-2.5 px-3">
                                {secVal != null ? (
                                  <span className={`font-mono text-xs ${
                                    secVal >= 80 ? 'text-green-400' :
                                    secVal >= 60 ? 'text-yellow-400' : 'text-red-400'
                                  }`}>
                                    {secVal}
                                  </span>
                                ) : (
                                  <span className="text-gray-600">-</span>
                                )}
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
              )}

              <div ref={exportRef} id="export" className="scroll-mt-16">
                <ExportToolbar result={result} />
              </div>
            </div>

            {/* 回到顶部 FAB */}
            {showScrollTop && (
              <button
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                className="fixed bottom-6 right-6 w-11 h-11 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-full shadow-lg shadow-blue-600/30 flex items-center justify-center transition-all z-40"
                title="回到顶部"
              >
                ↑
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
