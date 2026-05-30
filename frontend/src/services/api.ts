import type { ReviewProgress, ReviewResult, ProviderInfo, CustomProviderInput } from '../types/review'

export async function checkAuthStatus(): Promise<{
  authenticated: boolean
  login?: string
  avatar_url?: string
  token_expired?: boolean
}> {
  const resp = await fetch('/api/auth/status')
  return resp.json()
}

export async function apiFetch(url: string, options?: RequestInit): Promise<Response> {
  const resp = await fetch(url, options)
  if (resp.status === 401) {
    // Token 过期或无效，跳转登录页
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
  const resp = await fetch(`/api/providers/${providerName}/models`)
  const data = await resp.json()
  return data.models || []
}

export async function createCustomProvider(input: CustomProviderInput): Promise<void> {
  const resp = await fetch('/api/providers/custom', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
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
  const resp = await fetch(`/api/providers/custom/${name}`, { method: 'DELETE' })
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
  })
  return resp.json()
}

export async function fetchCachedReview(reviewId: number): Promise<ReviewResult> {
  const resp = await fetch(`/api/history/${reviewId}`)
  const data = await resp.json()
  if (data.error) throw new Error(data.error)
  return JSON.parse(data.result_json) as ReviewResult
}

export function streamReview(
  prUrl: string,
  provider: string,
  model: string | null,
  onStatus: (msg: string) => void,
  onProgress: (p: ReviewProgress) => void,
  onToken: (token: string) => void,
  onDone: (result: ReviewResult) => void,
  onError: (error: string) => void,
  onModelInfo?: (info: { provider: string; model: string }) => void,
  onFileInfo?: (info: { filename: string; language: string; patch: string }) => void,
): () => void {
  const params = new URLSearchParams({ url: prUrl, provider })
  if (model) params.set('model', model)

  const url = `/api/review?${params.toString()}`
  console.log('[SSE] 连接:', url)
  const es = new EventSource(url)
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
    console.log('[SSE] file_done:', e.data)
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
