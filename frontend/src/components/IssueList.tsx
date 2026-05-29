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

function groupByCategory(issues: Issue[]): Map<string, Issue[]> {
  const groups = new Map<string, Issue[]>()
  for (const issue of issues) {
    const cat = issue.category || 'style'
    if (!groups.has(cat)) groups.set(cat, [])
    groups.get(cat)!.push(issue)
  }
  for (const items of groups.values()) {
    items.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9))
  }
  return groups
}

export default function IssueList({ issues }: Props) {
  if (issues.length === 0) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
        <h3 className="text-lg font-bold text-white mb-3">发现的问题</h3>
        <p className="text-green-400 text-sm">未发现问题</p>
      </div>
    )
  }

  const groups = groupByCategory(issues)
  const sortedCats = CATEGORY_ORDER.filter((c) => groups.has(c))

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <h3 className="text-lg font-bold text-white mb-4">
        发现的问题 ({issues.length})
      </h3>
      <div className="space-y-5">
        {sortedCats.map((cat) => {
          const items = groups.get(cat)!
          return (
            <div key={cat}>
              <h4 className="text-sm font-medium text-gray-300 mb-2 border-b border-gray-700 pb-1">
                {CATEGORY_LABELS[cat] || cat} ({items.length})
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
    </div>
  )
}
