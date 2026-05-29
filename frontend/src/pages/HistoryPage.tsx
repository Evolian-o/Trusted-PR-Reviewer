import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import HistoryCard from '../components/HistoryCard'

interface HistoryItem {
  id: number
  owner: string
  repo: string
  pull_number: number
  pr_title: string
  pr_url: string
  provider: string
  model: string | null
  files_changed: number
  additions: number
  deletions: number
  risk_level: string
  issue_count: number
  suggestion_count: number
  result_json: string
  created_at: string
}

export default function HistoryPage() {
  const navigate = useNavigate()
  const [reviews, setReviews] = useState<HistoryItem[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [ownerFilter, setOwnerFilter] = useState('')
  const [repoFilter, setRepoFilter] = useState('')

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (ownerFilter) params.set('owner', ownerFilter)
      if (repoFilter) params.set('repo', repoFilter)
      const url = `/api/history${params.toString() ? '?' + params.toString() : ''}`
      const resp = await fetch(url)
      const data = await resp.json()
      setReviews(data.reviews || [])
    } catch (err) {
      console.error('获取历史失败:', err)
    } finally {
      setLoading(false)
    }
  }, [ownerFilter, repoFilter])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' })
      setReviews((prev) => prev.filter((r) => r.id !== id))
      if (expandedId === id) setExpandedId(null)
    } catch (err) {
      console.error('删除失败:', err)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">评审历史</h1>
            <p className="text-gray-400 text-sm mt-1">本地持久化的 PR 评审记录</p>
          </div>
          <button
            onClick={() => navigate('/')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
          >
            新评审
          </button>
        </div>

        <div className="flex gap-3 mb-4">
          <input
            type="text"
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            placeholder="Owner 过滤"
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="text"
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            placeholder="Repo 过滤"
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
            加载中...
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            暂无评审记录
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <HistoryCard
                key={review.id}
                review={review}
                expanded={expandedId === review.id}
                onToggle={() => setExpandedId(expandedId === review.id ? null : review.id)}
                onDelete={() => handleDelete(review.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
