import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import RepoList from '../components/Dashboard/RepoList'
import MonitorPanel from '../components/Dashboard/MonitorPanel'
import RecentReviews from '../components/Dashboard/RecentReviews'

interface Repo {
  id: number
  owner: string
  repo: string
  full_name: string
  description: string
  private: boolean
}

interface MonitoredRepo {
  id: number
  user_id: number
  owner: string
  repo: string
  active: boolean
  created_at: string
}

interface HistoryItem {
  id: number
  owner: string
  repo: string
  pull_number: number
  pr_title: string
  pr_url: string
  provider: string
  model: string | null
  risk_level: string
  issue_count: number
  created_at: string
}

export default function DashboardPage() {
  const { auth, logout } = useAuth()
  const [repos, setRepos] = useState<Repo[]>([])
  const [monitored, setMonitored] = useState<MonitoredRepo[]>([])
  const [recentReviews, setRecentReviews] = useState<HistoryItem[]>([])
  const [search, setSearch] = useState('')
  const [reposLoading, setReposLoading] = useState(false)
  const [schedulerStatus, setSchedulerStatus] = useState<{
    running: boolean
    monitored_repos: number
    interval_seconds: number
  } | null>(null)
  const navigate = useNavigate()

  // ── 加载仓库 & 监控 & 最近评审 ──
  const loadData = useCallback(async () => {
    setReposLoading(true)
    const [reposResp, monitorResp, historyResp] = await Promise.all([
      fetch('/api/repos'),
      fetch('/api/monitor'),
      fetch('/api/history'),
    ])
    const reposData = await reposResp.json()
    const monitorData = await monitorResp.json()
    const historyData = await historyResp.json()
    setRepos(reposData.repos || [])
    setMonitored(monitorData.repos || [])
    setRecentReviews((historyData.reviews || []).slice(0, 10))
    setReposLoading(false)
  }, [])

  useEffect(() => {
    if (!auth.loading) loadData()
  }, [auth.loading, loadData])

  // ── 调度器状态（轮询） ──
  const fetchSchedulerStatus = useCallback(async () => {
    try {
      const resp = await fetch('/api/scheduler/status')
      if (resp.ok) {
        setSchedulerStatus(await resp.json())
      }
    } catch { /* ignore */ }
  }, [])

  useEffect(() => {
    if (!auth.loading) {
      fetchSchedulerStatus()
      const i = setInterval(fetchSchedulerStatus, 30000)
      return () => clearInterval(i)
    }
  }, [auth.loading, fetchSchedulerStatus])

  const toggleScheduler = async () => {
    const endpoint = schedulerStatus?.running
      ? '/api/scheduler/stop'
      : '/api/scheduler/start'
    await fetch(endpoint, { method: 'POST' })
    await fetchSchedulerStatus()
  }

  const monitoredSet = new Set(monitored.map((m) => `${m.owner}/${m.repo}`))

  const toggleMonitor = async (owner: string, repo: string) => {
    const existing = monitored.find((m) => m.owner === owner && m.repo === repo)
    if (existing) {
      await fetch(`/api/monitor/${existing.id}`, { method: 'DELETE' })
      setMonitored((prev) => prev.filter((m) => m.id !== existing.id))
    } else {
      await fetch('/api/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo }),
      })
      loadData()
    }
  }

  const handleLogout = async () => {
    await logout()
    navigate('/', { replace: true })
  }

  // ── 加载中 ──
  if (auth.loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  // ── 渲染 ──
  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="border-b border-gray-700 bg-gray-850">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">AI PR Review</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/review')}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded-lg transition-colors"
            >
              + 新建评审
            </button>
            <button
              onClick={() => navigate('/history')}
              className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
            >
              评审历史
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
            >
              设置
            </button>
            <div className="flex items-center gap-2">
              {auth.user?.avatar_url && (
                <img src={auth.user.avatar_url} alt="" className="w-6 h-6 rounded-full" />
              )}
              <span className="text-gray-300 text-sm">{auth.user?.login}</span>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-300 text-sm transition-colors ml-2"
              >
                退出
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">仓库列表</h2>
              <span className="text-sm text-gray-400">
                已监控 {monitored.length} 个仓库
              </span>
            </div>
            <RepoList
              repos={repos}
              loading={reposLoading}
              search={search}
              onSearchChange={setSearch}
              monitoredSet={monitoredSet}
              onToggleMonitor={toggleMonitor}
            />
          </div>

          <div className="w-80 flex-shrink-0">
            <MonitorPanel status={schedulerStatus} onToggle={toggleScheduler} />
            <RecentReviews reviews={recentReviews} />
          </div>
        </div>
      </main>
    </div>
  )
}
