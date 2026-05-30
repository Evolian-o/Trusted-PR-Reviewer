import { useState } from 'react'
import type { ModelInfo } from '../types/review'

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

export default function ReportHeader({ owner, repo, pr, modelInfo, fromCache, prUrl, provider, model }: Props) {
  const [merging, setMerging] = useState(false)
  const [mergeResult, setMergeResult] = useState<{ ok: boolean; message: string } | null>(null)

  const handleMerge = async () => {
    if (!window.confirm(`确定要合并 ${owner}/${repo}#${pr} 吗？`)) return
    setMerging(true)
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
      } else {
        setMergeResult({ ok: false, message: data.error || '合并失败' })
      }
    } catch {
      setMergeResult({ ok: false, message: '网络错误，请重试' })
    } finally {
      setMerging(false)
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
            disabled={merging}
            className="text-sm px-4 py-1.5 bg-green-700 hover:bg-green-600 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            {merging ? '合并中...' : '合并 PR'}
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
