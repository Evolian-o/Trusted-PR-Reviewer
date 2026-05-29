import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

interface Repo {
  id: number
  owner: string
  repo: string
  full_name: string
  description: string
  private: boolean
  updated_at: string
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
  risk_level: string
  issue_count: number
  created_at: string
}

interface AuthUser {
  login: string
  avatar_url: string
}

export default function DashboardPage() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [checking, setChecking] = useState(true)
  const [repos, setRepos] = useState<Repo[]>([])
  const [monitored, setMonitored] = useState<MonitoredRepo[]>([])
  const [recentReviews, setRecentReviews] = useState<HistoryItem[]>([])
  const [search, setSearch] = useState('')
  const [reposLoading, setReposLoading] = useState(false)
  const navigate = useNavigate()

  // 认证检查
  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated) {
          navigate('/', { replace: true })
        } else {
          setUser({ login: data.login, avatar_url: data.avatar_url })
        }
      })
      .finally(() => setChecking(false))
  }, [navigate])

  // 加载仓库和监控
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
    if (!checking) loadData()
  }, [checking, loadData])

  const monitoredSet = new Set(monitored.map((m) => `${m.owner}/${m.repo}`))

  const toggleMonitor = async (owner: string, repo: string) => {
    const key = `${owner}/${repo}`
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
    await fetch('/api/auth/logout', { method: 'POST' })
    navigate('/', { replace: true })
  }

  const filtered = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  )

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="border-b border-gray-700 bg-gray-850">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">AI PR Review</h1>
          <div className="flex items-center gap-4">
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
              {user?.avatar_url && (
                <img src={user.avatar_url} alt="" className="w-6 h-6 rounded-full" />
              )}
              <span className="text-gray-300 text-sm">{user?.login}</span>
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
          {/* 仓库列表 */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">仓库列表</h2>
              <span className="text-sm text-gray-400">
                已监控 {monitored.length} 个仓库
              </span>
            </div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索仓库..."
              className="w-full px-3 py-2 mb-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {reposLoading ? (
              <div className="text-center text-gray-400 py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mx-auto mb-2" />
                加载仓库...
              </div>
            ) : (
              <div className="space-y-1 max-h-[calc(100vh-260px)] overflow-y-auto">
                {filtered.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded hover:bg-gray-750"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-white text-sm truncate">{r.full_name}</span>
                        {r.private && (
                          <span className="text-xs text-gray-500 border border-gray-600 px-1 rounded">Private</span>
                        )}
                      </div>
                      {r.description && (
                        <p className="text-gray-500 text-xs truncate mt-0.5">{r.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() => toggleMonitor(r.owner, r.repo)}
                      className={`flex-shrink-0 px-3 py-1 text-xs rounded transition-colors ml-3 ${
                        monitoredSet.has(`${r.owner}/${r.repo}`)
                          ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60'
                          : 'bg-green-900/40 text-green-400 hover:bg-green-900/60'
                      }`}
                    >
                      {monitoredSet.has(`${r.owner}/${r.repo}`) ? '取消监控' : '添加监控'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 最近评审 */}
          <div className="w-80 flex-shrink-0">
            <h2 className="text-lg font-semibold text-white mb-4">最近评审</h2>
            {recentReviews.length === 0 ? (
              <p className="text-gray-500 text-sm">暂无评审记录</p>
            ) : (
              <div className="space-y-2">
                {recentReviews.map((r) => (
                  <div
                    key={r.id}
                    onClick={() => navigate(`/review/${r.owner}/${r.repo}/${r.pull_number}`)}
                    className="bg-gray-800 rounded p-3 cursor-pointer hover:bg-gray-750 transition-colors"
                  >
                    <div className="text-white text-sm font-medium truncate">
                      {r.owner}/{r.repo}#{r.pull_number}
                    </div>
                    <div className="text-gray-400 text-xs mt-1 truncate">{r.pr_title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`px-1.5 py-0.5 rounded text-xs text-white ${
                        r.risk_level === 'high' ? 'bg-red-600'
                          : r.risk_level === 'medium' ? 'bg-yellow-600'
                          : 'bg-green-600'
                      }`}>
                        {r.risk_level === 'high' ? '高' : r.risk_level === 'medium' ? '中' : '低'}
                      </span>
                      <span className="text-gray-500 text-xs">{r.issue_count} 问题</span>
                      <span className="text-gray-600 text-xs">{r.created_at?.replace('T', ' ')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
