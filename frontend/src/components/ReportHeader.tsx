import { useState, useEffect } from 'react'
import type { ModelInfo } from '../types/review'

type MergeState = 'idle' | 'merging' | 'merged' | 'failed'

interface Props {
  owner: string
  repo: string
  pr: string
  modelInfo: ModelInfo | null
  fromCache: boolean
  prUrl: string
  provider: string
  model: string | null
}

const LS_KEY = (owner: string, repo: string, pr: string) => `merge-state:${owner}/${repo}/${pr}`

export default function ReportHeader({ owner, repo, pr, modelInfo, fromCache, prUrl, provider, model }: Props) {
  const [mergeState, setMergeState] = useState<MergeState>(() => {
    const saved = localStorage.getItem(LS_KEY(owner, repo, pr))
    return (saved === 'merged') ? 'merged' : 'idle'
  })
  const [mergeResult, setMergeResult] = useState<{ ok: boolean; message: string } | null>(null)

  // 组件挂载时用 GitHub API 验证真实合并状态
  useEffect(() => {
    const lsKey = LS_KEY(owner, repo, pr)
    // localStorage 已有合并记录则跳过 API 调用
    if (localStorage.getItem(lsKey) === 'merged') return

    fetch(`/api/repos/${owner}/${repo}/pulls/${pr}`, { credentials: 'include' })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (data.merged) {
          setMergeState('merged')
          localStorage.setItem(lsKey, 'merged')
        }
      })
      .catch(err => {
        console.warn('[merge-state] GitHub API 检查失败:', err.message)
      })
  }, [owner, repo, pr])

  const handleMerge = async () => {
    if (mergeState === 'failed') {
      setMergeState('idle')
      setMergeResult(null)
      return
    }
    if (!window.confirm(`确定要合并 ${owner}/${repo}#${pr} 吗？`)) return
    setMergeState('merging')
    setMergeResult(null)
    try {
      const resp = await fetch(`/api/repos/${owner}/${repo}/pulls/${pr}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ merge_method: 'merge' }),
      })
      const data = await resp.json()
      if (resp.ok) {
        setMergeResult({ ok: true, message: data.message || '合并成功' })
        setMergeState('merged')
        localStorage.setItem(LS_KEY(owner, repo, pr), 'merged')
      } else {
        setMergeResult({ ok: false, message: data.error || '合并失败' })
        setMergeState('failed')
      }
    } catch {
      setMergeResult({ ok: false, message: '网络错误，请重试' })
      setMergeState('failed')
    }
  }

  return (
    <>
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
          <button
            onClick={handleMerge}
            disabled={mergeState === 'merging' || mergeState === 'merged'}
            className={`text-sm px-4 py-1.5 rounded-lg transition-colors disabled:opacity-60 ${
              mergeState === 'failed'
                ? 'border border-red-500 text-red-400 hover:bg-red-900/30'
                : mergeState === 'merged'
                  ? 'bg-green-700 text-white'
                  : 'bg-green-700 hover:bg-green-600 text-white'
            }`}
          >
            {mergeState === 'merging' ? '合并中...' :
             mergeState === 'merged' ? '已合并' :
             mergeState === 'failed' ? '合并失败 · 重试' :
             '合并 PR'}
          </button>
        </div>
      </div>
      {mergeResult && (
        <div className={`mt-3 px-4 py-2 rounded-lg text-sm ${
          mergeResult.ok ? 'bg-green-900/40 text-green-300 border border-green-700' : 'bg-red-900/40 text-red-300 border border-red-700'
        }`}>
          {mergeResult.message}
        </div>
      )}
    </>
  )
}
