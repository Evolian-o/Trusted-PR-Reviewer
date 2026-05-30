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
import FileReviewSection from '../components/FileReviewSection'
import TrendTable from '../components/TrendTable'
import ComparePanel from '../components/ComparePanel'
import ReportHeader from '../components/ReportHeader'
import ReviewSidebar from '../components/ReviewSidebar'

/** 从分片文件名推导原始文件名来匹配 patch */
function findPatch(patches: Map<string, FileInfo>, chunkName: string): FileInfo | undefined {
  if (patches.has(chunkName)) return patches.get(chunkName)
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
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  const isDone = phase === 'done' && result
  const filesForNav = activeResult?.file_reviews || result?.file_reviews || []

  useEffect(() => {
    const onScroll = () => {
      setShowScrollTop(window.scrollY > 400)
      const sections = [
        { id: 'overview', ref: overviewRef },
        { id: 'code-review', ref: codeReviewRef },
        { id: 'issues-summary', ref: null },
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

  const loadCachedReview = useCallback(async (id: number) => {
    setPhase('loading')
    setStatusMsg('正在加载历史评审...')
    try {
      const cached = await fetchCachedReview(id)
      setResult(cached.result)
      if (provider) setModelInfo({ provider, model: model || provider })
      if (cached.patches) {
        const patchMap = new Map<string, FileInfo>()
        for (const p of cached.patches) patchMap.set(p.filename, p)
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
      prUrl, provider, model, dims,
      (msg) => setStatusMsg(msg),
      (p) => {
        setProgress(p)
        setPhase('progress')
        if (p.phase === 'reviewing' && p.current) setStreamingFileIdx(p.current)
      },
      () => setPhase('streaming'),
      (r) => {
        setResult(r)
        setPhase('done')
        reviewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      },
      (err) => { setError(err); setPhase('error') },
      (info) => setModelInfo(info),
      (info) => {
        setCurrentPatch(info)
        setAllPatches((prev) => { const next = new Map(prev); next.set(info.filename, info); return next })
      },
      (fr) => setStreamedFileReviews((prev) => [...prev, fr]),
      (compareR) => setCompareResult(compareR),
      compareModel,
    )

    return close
  }, [prUrl, provider, model, reviewId, loadCachedReview])

  const patchList = useMemo(() => Array.from(allPatches.values()), [allPatches])

  useEffect(() => {
    if (phase === 'done' && result) {
      fetchRepoStats(result.owner, result.repo).then(setTrend).catch(() => setTrend([]))
    }
  }, [phase, result])

  const toggleCollapse = (filename: string) => {
    setCollapsedFiles((prev) => {
      const wasOpen = !prev.has(filename)
      if (wasOpen) {
        const allFiles = filesForNav.map(fr => fr.file)
        const next = new Set(allFiles)
        next.delete(filename)
        return next
      }
      return new Set([...prev, filename])
    })
  }

  const scrollToFile = (filename: string) => {
    setCollapsedFiles((prev) => {
      const allFiles = filesForNav.map(fr => fr.file)
      const next = new Set(allFiles)
      next.delete(filename)
      return next
    })
    setTimeout(() => {
      document.getElementById(`file-${filename}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 60)
  }

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className={`min-h-screen bg-gray-900 ${isDone ? 'md:pl-56' : 'py-8 px-4'}`}>
      {isDone && (
        <ReviewSidebar
          filesForNav={filesForNav}
          activeNav={activeNav}
          sidebarOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          onScrollToFile={scrollToFile}
        />
      )}

      {isDone && (
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="fixed top-3 left-3 z-50 w-8 h-8 bg-gray-800 border border-gray-600 rounded flex items-center justify-center text-gray-400 hover:text-gray-200 md:hidden"
        >
          {sidebarOpen ? '✕' : '☰'}
        </button>
      )}

      <div className={`max-w-5xl mx-auto space-y-6 ${isDone ? 'py-8 px-4' : ''}`}>
        {owner && repo && pr && (
          <ReportHeader
            owner={owner} repo={repo} pr={pr}
            modelInfo={modelInfo} fromCache={fromCache}
            prUrl={prUrl} provider={provider} model={model}
          />
        )}

        {(phase === 'loading' || phase === 'idle') && (
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4" />
            <p className="text-gray-400">{statusMsg || '正在连接...'}</p>
          </div>
        )}

        {phase === 'error' && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-5">
            <h3 className="text-red-400 font-bold mb-2">评审失败</h3>
            <p className="text-red-300">{error}</p>
          </div>
        )}

        {(phase === 'progress' || phase === 'streaming') && progress && (
          <ProgressIndicator progress={progress} provider={modelInfo?.provider} model={modelInfo?.model} />
        )}

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
                <DiffViewer filename={currentPatch.filename} language={currentPatch.language} patch={currentPatch.patch} />
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
                    <span key={i} className={`w-2 h-2 rounded-full ${
                      i < streamingFileIdx ? 'bg-green-500' :
                      i === streamingFileIdx - 1 && phase === 'streaming' ? 'bg-blue-400 animate-pulse' : 'bg-gray-600'
                    }`} />
                  ))}
                </div>
                <span>{streamingFileIdx}/{progress.total}</span>
              </div>
            )}

            {streamedFileReviews.length > 0 && (
              <div className="space-y-4 pt-2">
                <h3 className="text-sm font-medium text-gray-400 uppercase tracking-wide">
                  已完成 ({streamedFileReviews.length})
                </h3>
                <FileReviewSection
                  fileReviews={streamedFileReviews}
                  allPatches={allPatches}
                  collapsedFiles={collapsedFiles}
                  onToggle={toggleCollapse}
                  colorScheme="green"
                  noPatchMessage="（无 diff 数据）"
                  findPatch={findPatch}
                />
              </div>
            )}
          </div>
        )}

        {phase === 'done' && result && (
          <>
            <div className="space-y-6">
              <ComparePanel
                result={result}
                compareResult={compareResult}
                modelInfo={modelInfo}
                compareModel={compareModel || null}
                viewMode={viewMode}
                onViewModeChange={setViewMode}
              />

              <div ref={overviewRef} id="overview" className="scroll-mt-16">
                <PRInfoBar result={result} />
              </div>
              <SummaryCard result={result} />

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

                  <FileReviewSection
                    fileReviews={activeResult.file_reviews}
                    allPatches={allPatches}
                    collapsedFiles={collapsedFiles}
                    onToggle={toggleCollapse}
                    colorScheme="blue"
                    noPatchMessage="（无 diff 数据）"
                    findPatch={findPatch}
                  />
                </div>
              )}

              <IssueList issues={activeResult.issues} />
              <TrendTable trend={trend} currentResultId={(result as any)?.id} />

              <div ref={exportRef} id="export" className="scroll-mt-16">
                <ExportToolbar result={result} />
              </div>
            </div>

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
