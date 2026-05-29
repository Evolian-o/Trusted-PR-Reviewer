import type { ReviewProgress, ReviewResult } from '../types/review'

export function streamReview(
  prUrl: string,
  provider: string,
  model: string | null,
  onStatus: (msg: string) => void,
  onProgress: (p: ReviewProgress) => void,
  onToken: (token: string) => void,
  onDone: (result: ReviewResult) => void,
  onError: (error: string) => void,
): () => void {
  const params = new URLSearchParams({ url: prUrl, provider })
  if (model) params.set('model', model)

  const url = `/api/review?${params.toString()}`
  console.log('[SSE] 连接:', url)
  const es = new EventSource(url)

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

  es.addEventListener('token', (e: MessageEvent) => {
    console.log('[SSE] token:', JSON.stringify(e.data))
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
      es.close()
    } catch (err) {
      console.error('[SSE] done 解析失败:', e.data, err)
      onError(`结果解析失败: ${err}`)
      es.close()
    }
  })

  es.addEventListener('review_error', (e: MessageEvent) => {
    console.error('[SSE] review_error:', e.data)
    onError(e.data)
    es.close()
  })

  es.addEventListener('error', () => {
    console.error('[SSE] 连接错误, readyState:', es.readyState)
    if (es.readyState === EventSource.CLOSED) {
      onError('连接中断，请重试')
      es.close()
    }
  })

  return () => {
    console.log('[SSE] 关闭连接')
    es.close()
  }
}
