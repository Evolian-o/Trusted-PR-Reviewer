import type { ReviewProgress, ReviewResult, FileReview, ProviderInfo, CustomProviderInput, TrendEntry } from '../types/review'

export async function checkAuthStatus(): Promise<{
  authenticated: boolean
  login?: string
  avatar_url?: string
  token_expired?: boolean
}> {
  const resp = await fetch('/api/auth/status', { credentials: 'include' })
  return resp.json()
}

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const resp = await fetch(url, {
    ...options,
    credentials: 'include',
  })
  if (resp.status === 401) {
    window.location.href = '/?expired=1'
    throw new Error('登录已过期')
  }
  return resp
}

export async function fetchProviders(): Promise<ProviderInfo[]> {
  const resp = await apiFetch('/api/providers')
  const data = await resp.json()
  return data.providers || []
}

export async function fetchProviderModels(providerName: string): Promise<string[]> {
  const resp = await fetch(`/api/providers/${providerName}/models`, { credentials: 'include' })
  const data = await resp.json()
  return data.models || []
}

export async function createCustomProvider(input: CustomProviderInput): Promise<void> {
  const resp = await fetch('/api/providers/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    credentials: 'include',
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: '创建失败' }))
    throw new Error(err.error || err.detail || '创建失败')
  }
}

export async function updateCustomProvider(name: string, input: Partial<CustomProviderInput>): Promise<void> {
  const resp = await fetch(`/api/providers/custom/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: '更新失败' }))
    throw new Error(err.error || err.detail || '更新失败')
  }
}

export async function deleteCustomProvider(name: string): Promise<void> {
  const resp = await fetch(`/api/providers/custom/${name}`, { method: 'DELETE', credentials: 'include' })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: '删除失败' }))
    throw new Error(err.error || err.detail || '删除失败')
  }
}

export async function testProviderConnection(name: string, data?: CustomProviderInput): Promise<{ok: boolean, error?: string}> {
  const resp = await fetch(`/api/providers/custom/${name}/test`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
    credentials: 'include',
  })
  return resp.json()
}

export async function fetchCachedReview(reviewId: number): Promise<{ result: ReviewResult; patches: FileInfo[] | null }> {
  const resp = await fetch(`/api/history/${reviewId}`, { credentials: 'include' })
  const data = await resp.json()
  if (data.error) throw new Error(data.error)
  const result = JSON.parse(data.result_json) as ReviewResult
  let patches: FileInfo[] | null = null
  if (data.patches_json) {
    try {
      patches = JSON.parse(data.patches_json) as FileInfo[]
    } catch { /* ignore */ }
  }
  return { result, patches }
}

export function streamReview(
  prUrl: string,
  provider: string,
  model: string | null,
  dims: string | null,
  onStatus: (msg: string) => void,
  onProgress: (p: ReviewProgress) => void,
  onToken: (token: string) => void,
  onDone: (result: ReviewResult) => void,
  onError: (error: string) => void,
  onModelInfo?: (info: { provider: string; model: string }) => void,
  onFileInfo?: (info: { filename: string; language: string; patch: string }) => void,
  onFileDone?: (fr: FileReview, progress: string) => void,
  onCompareDone?: (result: ReviewResult) => void,
  compareModel?: string | null,
): () => void {
  const params = new URLSearchParams({ url: prUrl, provider })
  if (model) params.set('model', model)
  if (dims) params.set('dims', dims)
  if (compareModel) params.set('compare_model', compareModel)

  const url = `/api/review?${params.toString()}`
  console.log('[SSE] 连接:', url)
  const es = new EventSource(url, { withCredentials: true })
  let closed = false

  const close = () => {
    if (!closed) {
      closed = true
      es.close()
    }
  }

  es.addEventListener('status', (e: MessageEvent) => {
    console.log('[SSE] status:', e.data)
    onStatus(e.data)
  })

  es.addEventListener('progress', (e: MessageEvent) => {
    try {
      const p = JSON.parse(e.data) as ReviewProgress
      console.log('[SSE] progress:', p)
      onProgress(p)
    } catch (err) {
      console.warn('[SSE] progress 解析失败:', e.data, err)
    }
  })

  es.addEventListener('model_info', (e: MessageEvent) => {
    try {
      const info = JSON.parse(e.data)
      onModelInfo?.(info)
    } catch { /* ignore */ }
  })

  es.addEventListener('file_info', (e: MessageEvent) => {
    try {
      const info = JSON.parse(e.data)
      onFileInfo?.(info)
    } catch { /* ignore */ }
  })

  es.addEventListener('token', (e: MessageEvent) => {
    onToken(e.data)
  })

  es.addEventListener('file_done', (e: MessageEvent) => {
    console.log('[SSE] file_done:', (e.data || '').slice(0, 80))
    try {
      const data = JSON.parse(e.data)
      if (data.file_review && onFileDone) {
        onFileDone(data.file_review as FileReview, data.progress || '')
      }
    } catch (err) {
      console.warn('[SSE] file_done 解析失败:', e.data, err)
    }
  })

  es.addEventListener('compare_done', (e: MessageEvent) => {
    console.log('[SSE] compare_done:', (e.data || '').slice(0, 100))
    try {
      const result = JSON.parse(e.data) as ReviewResult
      onCompareDone?.(result)
    } catch (err) {
      console.error('[SSE] compare_done 解析失败:', e.data, err)
    }
  })

  es.addEventListener('done', (e: MessageEvent) => {
    console.log('[SSE] done:', e.data)
    try {
      const result = JSON.parse(e.data) as ReviewResult
      onDone(result)
    } catch (err) {
      console.error('[SSE] done 解析失败:', e.data, err)
      onError(`结果解析失败: ${err}`)
    }
    close()
  })

  es.addEventListener('review_error', (e: MessageEvent) => {
    console.error('[SSE] review_error:', e.data)
    onError(e.data)
    close()
  })

  es.addEventListener('error', () => {
    if (closed) return
    console.error('[SSE] 连接错误, readyState:', es.readyState)
    if (es.readyState === EventSource.CLOSED) {
      onError('连接中断，请重试')
      close()
    }
  })

  return () => {
    console.log('[SSE] 关闭连接')
    close()
  }
}

export async function fetchSharedReview(token: string): Promise<ReviewResult> {
  const resp = await fetch(`/api/share/${token}`, { credentials: 'include' })
  if (!resp.ok) throw new Error('分享链接无效或已过期')
  const data = await resp.json()
  if (data.error) throw new Error(data.error)
  return data as ReviewResult
}

export async function fetchRepoStats(owner: string, repo: string): Promise<TrendEntry[]> {
  const resp = await fetch(`/api/history/stats?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`, { credentials: 'include' })
  const data = await resp.json()
  return data.trend || []
}
