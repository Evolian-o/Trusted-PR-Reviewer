import { useState, useRef, useEffect } from 'react'
import i18next from 'i18next'
import { useTranslation } from 'react-i18next'
import type { RewrittenFile, FileReview } from '../types/review'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  rewrittenFiles: RewrittenFile[]
  fileReviews: FileReview[]
  owner: string
  repo: string
  pullNumber: number
  provider: string
  model: string | null
  editedCode: Record<string, string>
  onEditedCodeChange: React.Dispatch<React.SetStateAction<Record<string, string>>>
  changedRanges: Record<string, Set<number>>
  onChangedRangesChange: React.Dispatch<React.SetStateAction<Record<string, Set<number>>>>
  aiSuggestion: Record<string, string>
  onAiSuggestionChange: React.Dispatch<React.SetStateAction<Record<string, string>>>
}

/** 简单行级 diff：返回新代码中与原代码不同的行号 (1-indexed) */
function computeChangedLines(oldCode: string, newCode: string): Set<number> {
  const oldLines = oldCode.split('\n')
  const newLines = newCode.split('\n')
  const changed = new Set<number>()
  const maxLen = Math.max(oldLines.length, newLines.length)
  for (let i = 0; i < maxLen; i++) {
    if (i >= oldLines.length || i >= newLines.length || oldLines[i] !== newLines[i]) {
      changed.add(i + 1)
    }
  }
  return changed
}

/** 从 fileReviews 构建初始评审意见 */
function buildDefaultReview(rf: RewrittenFile, fileReviews: FileReview[]): string {
  const fr = fileReviews.find(f => f.file === rf.filename)
  if (!fr) return ''
  const parts: string[] = []
  for (const issue of fr.issues) {
    if (issue.suggestion) {
      parts.push(`[${issue.severity}] L${issue.line ?? '?'}: ${issue.description}\n  ${i18next.t('review.diff.suggestion')} ${issue.suggestion}`)
    }
  }
  if (fr.suggestions.length > 0) {
    parts.push(...fr.suggestions.map(s => `- ${s}`))
  }
  return parts.join('\n\n')
}

export default function RewrittenCodeSection({ rewrittenFiles, fileReviews, owner, repo, pullNumber, provider, model, editedCode, onEditedCodeChange, changedRanges, onChangedRangesChange, aiSuggestion, onAiSuggestionChange }: Props) {
  const { t } = useTranslation()
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set(rewrittenFiles.map(f => f.filename)))
  const [copiedFile, setCopiedFile] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)
  const [fixResult, setFixResult] = useState<{ ok: boolean; message: string; commit_url?: string } | null>(null)
  const [submittingReview, setSubmittingReview] = useState(false)
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string; html_url?: string } | null>(null)
  const { auth } = useAuth()

  // --- 源代码面板 ---
  const [optimizing, setOptimizing] = useState<Set<string>>(new Set())

  // --- 评审意见面板 ---
  const [reviewComment, setReviewComment] = useState<Record<string, string>>(() => {
    const defaults: Record<string, string> = {}
    for (const rf of rewrittenFiles) {
      const comment = buildDefaultReview(rf, fileReviews)
      if (comment) defaults[rf.filename] = comment
    }
    return defaults
  })
  const [polishing, setPolishing] = useState<Set<string>>(new Set())

  // --- 全局错误 ---
  const [errors, setErrors] = useState<Record<string, string>>({})

  // --- 自动调整 textarea 高度 ---
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({})
  const autoResizeTextarea = (el: HTMLTextAreaElement) => {
    el.style.height = '0'
    el.style.height = el.scrollHeight + 'px'
  }
  // 外部代码变更（AI 优化）时同步 textarea 高度
  useEffect(() => {
    requestAnimationFrame(() => {
      for (const [filename] of Object.entries(editedCode)) {
        const el = textareaRefs.current[filename]
        if (el) autoResizeTextarea(el)
      }
    })
  }, [editedCode])

  if (rewrittenFiles.length === 0) return null

  const getContent = (rf: RewrittenFile) => editedCode[rf.filename] ?? rf.content
  const setContent = (filename: string, value: string) => {
    onEditedCodeChange(prev => ({ ...prev, [filename]: value }))
  }

  const toggle = (filename: string) => {
    setExpandedFiles(prev => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  const handleCopy = async (filename: string, content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopiedFile(filename)
      setTimeout(() => setCopiedFile(null), 2000)
    } catch { /* fallback */ }
  }

  // --- Enter 自动缩进 ---
  const handleCodeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, rf: RewrittenFile) => {
    if (e.key !== 'Enter') return
    const textarea = e.currentTarget
    const code = textarea.value
    const pos = textarea.selectionStart
    const beforeCursor = code.slice(0, pos)
    const currentLine = beforeCursor.split('\n').pop() || ''

    const indentTrigger = currentLine.match(/[{:([\]]\s*$/)
    if (!indentTrigger) return

    e.preventDefault()
    const leadingWs = currentLine.match(/^(\s*)/)?.[1] || ''
    const indent = '  '
    const insertion = `\n${leadingWs}${indent}`
    const newCode = code.slice(0, pos) + insertion + code.slice(textarea.selectionEnd)
    setContent(rf.filename, newCode)

    requestAnimationFrame(() => {
      textarea.value = newCode
      textarea.selectionStart = textarea.selectionEnd = pos + insertion.length
    })
  }

  // --- AI 优化代码 ---
  const handleOptimize = async (rf: RewrittenFile) => {
    setOptimizing(prev => new Set([...prev, rf.filename]))
    setErrors(prev => { const next = { ...prev }; delete next[rf.filename]; return next })
    const oldCode = getContent(rf)

    try {
      const resp = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/optimize-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          filename: rf.filename,
          language: rf.language,
          current_code: oldCode,
          provider,
          model,
        }),
      })
      const data = await resp.json()
      if (resp.ok && data.optimized_code) {
        setContent(rf.filename, data.optimized_code)
        onChangedRangesChange(prev => ({ ...prev, [rf.filename]: computeChangedLines(oldCode, data.optimized_code) }))
        if (data.suggestion) {
          onAiSuggestionChange(prev => ({ ...prev, [rf.filename]: data.suggestion }))
        }
      } else {
        setErrors(prev => ({ ...prev, [rf.filename]: data.error || i18next.t('review.rewritten.optimize_failed') }))
      }
    } catch {
      setErrors(prev => ({ ...prev, [rf.filename]: i18next.t('common.network_error') }))
    } finally {
      setOptimizing(prev => {
        const next = new Set(prev)
        next.delete(rf.filename)
        return next
      })
    }
  }

  // --- AI 润色评审意见 ---
  const handlePolish = async (rf: RewrittenFile) => {
    const draft = reviewComment[rf.filename] || ''
    if (!draft.trim()) return
    setPolishing(prev => new Set([...prev, rf.filename]))
    setErrors(prev => { const next = { ...prev }; delete next[rf.filename]; return next })

    try {
      const resp = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/polish-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          draft_text: draft,
          provider,
          model,
        }),
      })
      const data = await resp.json()
      if (resp.ok && data.polished_text) {
        setReviewComment(prev => ({ ...prev, [rf.filename]: data.polished_text }))
      } else {
        setErrors(prev => ({ ...prev, [rf.filename]: data.error || i18next.t('review.rewritten.polish_failed') }))
      }
    } catch {
      setErrors(prev => ({ ...prev, [rf.filename]: i18next.t('common.network_error') }))
    } finally {
      setPolishing(prev => {
        const next = new Set(prev)
        next.delete(rf.filename)
        return next
      })
    }
  }

  // --- 提交修复到 PR ---
  const handleFixPR = async () => {
    if (!window.confirm(i18next.t('review.rewritten.confirm_fix', { count: rewrittenFiles.length, number: pullNumber }))) return
    setFixing(true)
    setFixResult(null)
    try {
      const resp = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          rewritten_files: rewrittenFiles.map(f => ({
            filename: f.filename,
            content: getContent(f),
          })),
        }),
      })
      const data = await resp.json()
      if (resp.ok && data.ok) {
        setFixResult({ ok: true, message: data.message, commit_url: data.commit_url })
      } else {
        setFixResult({ ok: false, message: data.error || data.message || i18next.t('review.rewritten.submit_failed') })
      }
    } catch {
      setFixResult({ ok: false, message: i18next.t('common.network_error') })
    } finally {
      setFixing(false)
    }
  }

  // --- 提交评审意见到 PR ---
  const handleSubmitReview = async () => {
    const parts: string[] = []
    let hasContent = false
    for (const rf of rewrittenFiles) {
      const comment = (reviewComment[rf.filename] || '').trim()
      if (comment) {
        hasContent = true
        parts.push(`## ${rf.filename}\n\n${comment}`)
      }
    }
    if (!hasContent) {
      setSubmitResult({ ok: false, message: i18next.t('review.rewritten.review_empty') })
      return
    }
    const reviewText = `## ${i18next.t('review.rewritten.report_title')}\n\n${i18next.t('review.rewritten.body_intro', { count: rewrittenFiles.length })}\n\n${parts.join('\n\n---\n\n')}`

    setSubmittingReview(true)
    setSubmitResult(null)
    try {
      const resp = await fetch(`/api/repos/${owner}/${repo}/pulls/${pullNumber}/submit-review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ review_text: reviewText }),
      })
      const data = await resp.json()
      if (resp.ok && data.ok) {
        setSubmitResult({ ok: true, message: data.message, html_url: data.html_url })
      } else {
        setSubmitResult({ ok: false, message: data.error || data.message || i18next.t('review.rewritten.submit_failed') })
      }
    } catch {
      setSubmitResult({ ok: false, message: i18next.t('common.network_error') })
    } finally {
      setSubmittingReview(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          {t('review.rewritten.title')}
          <span className="text-sm font-normal text-gray-400">
            {t('review.rewritten.files_count', { count: rewrittenFiles.length })}
          </span>
        </h2>
        {auth.authenticated && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubmitReview}
              disabled={submittingReview}
              className="text-sm px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {submittingReview ? t('review.rewritten.submitting') : t('review.rewritten.submit_review')}
            </button>
            <button
              onClick={handleFixPR}
              disabled={fixing}
              className="text-sm px-3 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {fixing ? t('review.rewritten.submitting') : t('review.rewritten.submit_fix')}
            </button>
          </div>
        )}
      </div>

      {submitResult && (
        <div className={`px-4 py-2 rounded-lg text-sm ${
          submitResult.ok ? 'bg-green-900/40 text-green-300 border border-green-700' : 'bg-red-900/40 text-red-300 border border-red-700'
        }`}>
          {submitResult.message}
          {submitResult.html_url && (
            <a href={submitResult.html_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-400 hover:text-blue-300 underline">
              {t('review.rewritten.view_pr')} &rarr;
            </a>
          )}
        </div>
      )}

      {fixResult && (
        <div className={`px-4 py-2 rounded-lg text-sm ${
          fixResult.ok ? 'bg-green-900/40 text-green-300 border border-green-700' : 'bg-red-900/40 text-red-300 border border-red-700'
        }`}>
          {fixResult.message}
          {fixResult.commit_url && (
            <a href={fixResult.commit_url} target="_blank" rel="noopener noreferrer" className="ml-2 text-blue-400 hover:text-blue-300 underline">
              {t('review.rewritten.view_commit')} &rarr;
            </a>
          )}
        </div>
      )}

      {rewrittenFiles.map((rf) => {
        const code = getContent(rf)
        const codeLines = code.split('\n')
        const hasEdit = editedCode[rf.filename] !== undefined && editedCode[rf.filename] !== rf.content
        const changedSet = changedRanges[rf.filename]
        const hasChanges = changedSet && changedSet.size > 0
        const showError = errors[rf.filename]

        return (
          <div key={rf.filename} className="bg-gray-800 border border-gray-700 rounded-lg overflow-hidden">
            {/* 文件头 */}
            <div
              className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-750"
              onClick={() => toggle(rf.filename)}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-gray-400 text-sm shrink-0">{expandedFiles.has(rf.filename) ? '▼' : '▶'}</span>
                <span className="text-white font-mono text-sm truncate">{rf.filename}</span>
                <span className="text-xs text-gray-500 shrink-0">{rf.language}</span>
                <span className="text-xs bg-blue-900/50 text-blue-300 px-2 py-0.5 rounded shrink-0">
                  {t('review.rewritten.fixes_count', { count: rf.issues_fixed })}
                </span>
                {hasEdit && (
                  <span className="text-xs bg-yellow-900/50 text-yellow-300 px-2 py-0.5 rounded shrink-0">{t('review.rewritten.edited')}</span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleCopy(rf.filename, code) }}
                className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors shrink-0 ml-2"
              >
                {copiedFile === rf.filename ? t('review.rewritten.copied') : t('review.rewritten.copy_code')}
              </button>
            </div>

            {expandedFiles.has(rf.filename) && (
              <div className="border-t border-gray-700">
                {/* AI 优化建议说明 */}
                {aiSuggestion[rf.filename] && (
                  <div className="px-4 py-2.5 bg-blue-900/20 border-b border-blue-800/30">
                    <div className="flex items-start gap-2">
                      <span className="text-xs text-blue-400 mt-0.5 shrink-0">{t('review.rewritten.ai_label')}</span>
                      <p className="text-sm text-blue-200/80 leading-relaxed">{aiSuggestion[rf.filename]}</p>
                    </div>
                  </div>
                )}

                {/* ====== 面板1: 源代码编辑器 ====== */}
                <div className="border-b border-gray-700/50">
                  <div className="px-4 pt-3 pb-1.5 flex items-center justify-between">
                    <label className="text-xs text-gray-400 font-medium">{t('review.rewritten.source_label')}</label>
                    {hasChanges && (
                      <span className="text-xs text-red-400">{t('review.rewritten.changes_red')}</span>
                    )}
                  </div>
                  <div className="px-4 pb-3">
                    {/* 外层容器统一滚动，textarea 自适应高度始终不内部滚动 */}
                    <div className="overflow-auto max-h-[500px] border border-gray-600 rounded-lg bg-gray-900">
                      <div className="flex">
                        {/* 行号 */}
                        <div
                          className="shrink-0 bg-gray-850 border-r border-gray-700/50"
                          style={{
                            width: codeLines.length >= 100 ? '3.5rem' : codeLines.length >= 10 ? '2.75rem' : '2.25rem',
                          }}
                        >
                          <div className="text-right pr-2 pl-1.5 py-3 text-sm font-mono leading-relaxed text-gray-500 select-none">
                            {codeLines.map((_, i) => (
                              <div key={i} className={changedSet?.has(i + 1) ? 'text-red-400' : ''}>
                                {i + 1}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* 编辑器主体 */}
                        <div className="relative flex-1 min-w-0">
                          {/* 改动标红 overlay */}
                          <div
                            className="absolute inset-0 pointer-events-none"
                            aria-hidden="true"
                          >
                            <div className="py-3 text-sm font-mono leading-relaxed whitespace-pre">
                              {codeLines.map((_, i) => (
                                <div
                                  key={i}
                                  className={changedSet?.has(i + 1) ? 'bg-red-900/30' : ''}
                                >
                                  {' '}
                                </div>
                              ))}
                            </div>
                          </div>

                          <textarea
                            ref={(el) => { textareaRefs.current[rf.filename] = el; if (el) autoResizeTextarea(el) }}
                            value={code}
                            onChange={(e) => setContent(rf.filename, e.target.value)}
                            onInput={(e) => autoResizeTextarea(e.currentTarget)}
                            onKeyDown={(e) => handleCodeKeyDown(e, rf)}
                            className="relative w-full px-3 py-3 text-sm font-mono text-gray-300 leading-relaxed bg-transparent resize-none overflow-hidden outline-none border-0 focus:ring-1 focus:ring-blue-500/50 min-h-[120px]"
                            spellCheck={false}
                          />
                        </div>
                      </div>
                    </div>

                    {/* AI 优化按钮 */}
                    <button
                      onClick={() => handleOptimize(rf)}
                      disabled={optimizing.has(rf.filename)}
                      className="mt-2 text-xs px-3 py-1.5 bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white rounded transition-colors"
                    >
                      {optimizing.has(rf.filename) ? t('review.rewritten.ai_optimizing') : t('review.rewritten.ai_optimize')}
                    </button>
                  </div>
                </div>

                {/* ====== 面板2: 评审意见编辑器 ====== */}
                <div className="px-4 py-3">
                  <label className="text-xs text-gray-400 font-medium mb-1.5 block">{t('review.rewritten.review_label')}</label>
                  <textarea
                    value={reviewComment[rf.filename] || ''}
                    onChange={(e) => setReviewComment(prev => ({ ...prev, [rf.filename]: e.target.value }))}
                    className="w-full p-3 text-sm text-gray-300 bg-gray-900 border border-gray-600 rounded-lg resize-y min-h-[120px] max-h-[400px] outline-none focus:border-blue-500 font-sans leading-relaxed"
                    placeholder={t('review.rewritten.review_placeholder')}
                    spellCheck
                    rows={6}
                  />
                  <button
                    onClick={() => handlePolish(rf)}
                    disabled={polishing.has(rf.filename) || !(reviewComment[rf.filename] || '').trim()}
                    className="mt-2 text-xs px-3 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white rounded transition-colors"
                  >
                    {polishing.has(rf.filename) ? t('review.rewritten.ai_polishing') : t('review.rewritten.ai_polish')}
                  </button>
                </div>

                {/* 全局错误 */}
                {showError && (
                  <div className="px-4 pb-3">
                    <p className="text-xs text-red-400">{showError}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
