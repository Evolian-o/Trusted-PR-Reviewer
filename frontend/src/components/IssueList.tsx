import { useState, useMemo } from 'react'
import type { Issue } from '../types/review'
import IssueCard from './IssueCard'

interface Props {
  issues: Issue[]
}

const CATEGORY_LABELS: Record<string, string> = {
  security: '安全漏洞',
  bug: '逻辑缺陷',
  performance: '性能问题',
  style: '代码风格',
}
const CATEGORY_ORDER = ['security', 'bug', 'performance', 'style']
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const PRIORITY_LABELS: Record<string, string> = {
  must_fix: '必须修复',
  should_fix: '应当修复',
  nice_to_fix: '可选优化',
}
const PRIORITY_ORDER = ['must_fix', 'should_fix', 'nice_to_fix']

type PriorityFilter = 'all' | 'must_fix' | 'should_fix' | 'nice_to_fix'

function groupByPriority(issues: Issue[]): Map<string, Issue[]> {
  const groups = new Map<string, Issue[]>()
  for (const issue of issues) {
    const p = issue.priority || 'should_fix'
    if (!groups.has(p)) groups.set(p, [])
    groups.get(p)!.push(issue)
  }
  for (const items of groups.values()) {
    items.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
  }
  return groups
}

export default function IssueList({ issues }: Props) {
  const [filter, setFilter] = useState<PriorityFilter>('all')

  const filtered = useMemo(() => {
    if (filter === 'all') return issues
    return issues.filter((i) => (i.priority || 'should_fix') === filter)
  }, [issues, filter])

  const priorityGroups = useMemo(() => groupByPriority(filtered), [filtered])

  if (issues.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <h3 className="text-lg font-bold text-white mb-3">发现的问题</h3>
        <p className="text-green-400 text-sm">未发现问题，代码质量良好。</p>
      </div>
    )
  }

  const counts = {
    must_fix: issues.filter((i) => i.priority === 'must_fix').length,
    should_fix: issues.filter((i) => i.priority === 'should_fix').length,
    nice_to_fix: issues.filter((i) => i.priority === 'nice_to_fix').length,
  }

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5" id="issues-summary">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-lg font-bold text-white">
          发现的问题 ({issues.length})
        </h3>
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'must_fix', 'should_fix', 'nice_to_fix'] as PriorityFilter[]).map((f) => {
            const count = f === 'all' ? issues.length : counts[f]
            if (f !== 'all' && count === 0) return null
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-2.5 py-1 rounded text-xs transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:text-gray-200'
                }`}
              >
                {f === 'all' ? '全部' : PRIORITY_LABELS[f]} ({count})
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">该优先级下没有问题。</p>
      ) : (
        <div className="space-y-5">
          {PRIORITY_ORDER.map((priority) => {
            const items = priorityGroups.get(priority)
            if (!items || items.length === 0) return null
            return (
              <div key={priority}>
                <h4 className="text-sm font-medium text-gray-300 mb-3 border-b border-gray-700 pb-1.5 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    priority === 'must_fix' ? 'bg-red-500' :
                    priority === 'should_fix' ? 'bg-yellow-500' : 'bg-gray-500'
                  }`} />
                  {PRIORITY_LABELS[priority] || priority}
                  <span className="text-gray-500">({items.length})</span>
                </h4>
                <div className="space-y-3">
                  {items.map((issue, i) => (
                    <IssueCard key={i} issue={issue} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
