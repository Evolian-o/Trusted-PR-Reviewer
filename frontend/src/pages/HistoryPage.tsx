import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [reviews, setReviews] = useState<HistoryItem[]>([])
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (search) params.set('keyword', search)
      if (fromDate) params.set('from_date', fromDate)
      if (toDate) params.set('to_date', toDate)
      const url = `/api/history${params.toString() ? '?' + params.toString() : ''}`
      const resp = await fetch(url)
      const data = await resp.json()
      setReviews(data.reviews || [])
    } catch (err) {
      console.error(t('history.fetch_failed'), err)
    } finally {
      setLoading(false)
    }
  }, [search, fromDate, toDate])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const handleDelete = async (id: number) => {
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE' })
      setReviews((prev) => prev.filter((r) => r.id !== id))
      if (expandedId === id) setExpandedId(null)
    } catch (err) {
      console.error(t('history.delete_failed'), err)
    }
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">{t('history.title')}</h1>
            <p className="text-gray-400 text-sm mt-1">{t('history.description')}</p>
          </div>
          <button
            onClick={() => navigate('/review')}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
          >
            {t('history.new_review')}
          </button>
        </div>

        <div className="flex gap-3 mb-4 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('history.search_placeholder')}
            className="flex-1 min-w-60 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            title={t('history.start_date')}
          />
          <span className="text-gray-500 self-center">—</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            title={t('history.end_date')}
          />
        </div>

        {loading ? (
          <div className="text-center text-gray-400 py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-3" />
            {t('history.loading')}
          </div>
        ) : reviews.length === 0 ? (
          <div className="text-center text-gray-400 py-12">
            {t('history.empty')}
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
