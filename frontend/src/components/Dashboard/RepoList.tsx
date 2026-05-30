interface Repo {
  id: number
  owner: string
  repo: string
  full_name: string
  description: string
  private: boolean
}

interface Props {
  repos: Repo[]
  loading: boolean
  search: string
  onSearchChange: (v: string) => void
  monitoredSet: Set<string>
  onToggleMonitor: (owner: string, repo: string) => void
}

export default function RepoList({ repos, loading, search, onSearchChange, monitoredSet, onToggleMonitor }: Props) {
  const filtered = repos.filter((r) =>
    r.full_name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="flex-1 min-w-0">
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="搜索仓库..."
        className="w-full px-3 py-2 mb-3 bg-gray-800 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {loading ? (
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
                onClick={() => onToggleMonitor(r.owner, r.repo)}
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
  )
}
