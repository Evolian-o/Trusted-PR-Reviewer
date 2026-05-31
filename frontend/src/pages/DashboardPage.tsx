import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import RepoList from '../components/Dashboard/RepoList'
import MonitorPanel from '../components/Dashboard/MonitorPanel'
import RecentReviews from '../components/Dashboard/RecentReviews'
import LanguageSwitcher from '../components/LanguageSwitcher'

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
  const { t } = useTranslation()
  const [repos, setRepos] = useState<Repo[]>([])
  const [monitored, setMonitored] = useState<MonitoredRepo[]>([])
  const [recentReviews, setRecentReviews] = useState<HistoryItem[]>([])
  const [search, setSearch] = useState('')
  const [reposLoading, setReposLoading] = useState(false)
  const [manualRepo, setManualRepo] = useState('')
  const [manualError, setManualError] = useState('')
  const [manualAdding, setManualAdding] = useState(false)
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

  const handleAddManualRepo = async () => {
    const trimmed = manualRepo.trim()
    if (!trimmed) {
      setManualError(t('dashboard.manual_empty'))
      return
    }
    const parts = trimmed.split('/')
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      setManualError(t('dashboard.manual_format_error'))
      return
    }
    const [owner, repo] = parts
    setManualAdding(true)
    setManualError('')
    try {
      const resp = await fetch('/api/monitor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ owner, repo: repo.replace('.git', '') }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: t('dashboard.add_failed') }))
        throw new Error(err.error || t('dashboard.add_failed'))
      }
      setManualRepo('')
      loadData()
    } catch (e) {
      setManualError(e instanceof Error ? e.message : t('dashboard.add_failed'))
    } finally {
      setManualAdding(false)
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
              {t('dashboard.new_review')}
            </button>
            <button
              onClick={() => navigate('/history')}
              className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
            >
              {t('dashboard.review_history')}
            </button>
            <button
              onClick={() => navigate('/settings')}
              className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
            >
              {t('dashboard.settings')}
            </button>
            <LanguageSwitcher />
            <div className="flex items-center gap-2">
              {auth.user?.avatar_url && (
                <img src={auth.user.avatar_url} alt="" className="w-6 h-6 rounded-full" />
              )}
              <span className="text-gray-300 text-sm">{auth.user?.login}</span>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-gray-300 text-sm transition-colors ml-2"
              >
                {t('dashboard.logout')}
              </button>
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex gap-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">{t('dashboard.repo_list')}</h2>
              <span className="text-sm text-gray-400">
                {t('dashboard.monitored_count', { count: monitored.length })}
              </span>
            </div>
            <div className="flex items-center gap-2 mb-3">
              <input
                type="text"
                value={manualRepo}
                onChange={(e) => { setManualRepo(e.target.value); setManualError('') }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddManualRepo() }}
                placeholder={t('dashboard.manual_placeholder')}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleAddManualRepo}
                disabled={manualAdding}
                className="px-4 py-2 bg-green-700 hover:bg-green-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {manualAdding ? '...' : t('dashboard.add_monitor')}
              </button>
            </div>
            {manualError && <p className="text-red-400 text-xs -mt-2 mb-3">{manualError}</p>}
            <RepoList
              repos={repos}
              loading={reposLoading}
              search={search}
              onSearchChange={setSearch}
              monitoredSet={monitoredSet}
              onToggleMonitor={toggleMonitor}
            />

            {/* 手动添加的外部仓库（不在自己 GitHub 仓库列表中） */}
            {monitored.filter((m) => !repos.some((r) => `${r.owner}/${r.repo}` === `${m.owner}/${m.repo}`)).length > 0 && (
              <div className="mt-6">
                <h3 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">
                  {t('dashboard.manual_added')} · <span className="font-normal text-gray-500">{t('dashboard.external')}</span>
                </h3>
                <div className="space-y-1">
                  {monitored
                    .filter((m) => !repos.some((r) => `${r.owner}/${r.repo}` === `${m.owner}/${m.repo}`))
                    .map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg"
                      >
                        <span className="text-white text-sm">{m.owner}/{m.repo}</span>
                        <button
                          onClick={() => toggleMonitor(m.owner, m.repo)}
                          className="px-3 py-1 text-xs rounded bg-red-900/40 text-red-400 hover:bg-red-900/60 transition-colors"
                        >
                          {t('dashboard.cancel_monitor')}
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            )}
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
