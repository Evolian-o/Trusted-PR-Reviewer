import type { FileReview } from '../types/review'

const NAV_ITEMS = [
  { id: 'overview', label: '概览' },
  { id: 'code-review', label: '代码审查' },
  { id: 'issues-summary', label: '问题汇总' },
  { id: 'export', label: '导出' },
]

interface Props {
  filesForNav: FileReview[]
  activeNav: string
  sidebarOpen: boolean
  onClose: () => void
  onScrollToFile: (filename: string) => void
}

export default function ReviewSidebar({ filesForNav, activeNav, sidebarOpen, onClose, onScrollToFile }: Props) {
  const scrollTo = (id: string) => {
    const el = document.getElementById(id)
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <>
      <aside className={`no-print fixed left-0 top-0 h-full w-56 bg-gray-900 border-r border-gray-700/50 z-40 flex flex-col shadow-xl shadow-black/30 transition-transform duration-200 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0`}>
        <div className="p-4 border-b border-gray-700/50">
          <h2 className="text-sm font-bold text-gray-200 flex items-center gap-2">
            <span className="w-2 h-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full" />
            审查导航
          </h2>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const isCodeReview = item.id === 'code-review'
            return (
              <div key={item.id}>
                <button
                  onClick={() => {
                    if (item.id === 'code-review') {
                      document.getElementById('code-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    } else {
                      scrollTo(item.id)
                    }
                  }}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors flex items-center gap-2 border-l-2 ${
                    activeNav === item.id
                      ? 'bg-gradient-to-r from-blue-600/30 to-indigo-600/30 text-blue-300 border-blue-400'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 border-transparent'
                  }`}
                >
                  <span className="text-[10px] opacity-50">●</span>
                  {item.label}
                </button>

                {isCodeReview && filesForNav.length > 0 && (
                  <div className="ml-5 mt-0.5 space-y-0.5 max-h-72 overflow-y-auto">
                    {filesForNav.map((fr) => (
                      <button
                        key={fr.file}
                        onClick={() => onScrollToFile(fr.file)}
                        className="w-full text-left px-2 py-1 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 truncate flex items-center gap-1.5"
                        title={fr.file}
                      >
                        <span className={`w-1 h-1 rounded-full flex-shrink-0 ${
                          fr.issues.length === 0 ? 'bg-green-500' :
                          fr.issues.some(i => i.priority === 'must_fix') ? 'bg-red-500' :
                          fr.issues.some(i => i.severity === 'high' || i.severity === 'critical') ? 'bg-orange-500' :
                          'bg-yellow-500'
                        }`} />
                        <span className="truncate">{fr.file.split('/').pop() || fr.file}</span>
                        {fr.issues.length > 0 && (
                          <span className="text-gray-600 flex-shrink-0 ml-auto">{fr.issues.length}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="p-3 border-t border-gray-700/50">
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="w-full text-left px-3 py-1.5 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-800/50 transition-colors"
          >
            ↑ 回到顶部
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={onClose} />
      )}
    </>
  )
}
