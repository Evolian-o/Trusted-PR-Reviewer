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

  const es = new EventSource(`/api/review?${params.toString()}`)

  es.addEventListener('status', (e: MessageEvent) => {
    onStatus(e.data)
  })

  es.addEventListener('progress', (e: MessageEvent) => {
    onProgress(JSON.parse(e.data))
  })

  es.addEventListener('token', (e: MessageEvent) => {
    onToken(e.data)
  })

  es.addEventListener('done', (e: MessageEvent) => {
    onDone(JSON.parse(e.data))
    es.close()
  })

  es.addEventListener('error', () => {
    onError('连接中断，请重试')
    es.close()
  })

  es.addEventListener('review_error', (e: MessageEvent) => {
    onError(e.data)
    es.close()
  })

  return () => es.close()
}
