import { useMemo, useState } from 'react'
import type { Issue } from '../types/review'

interface DiffLine {
  type: 'add' | 'del' | 'hunk' | 'ctx'
  content: string
  oldLine?: number
  newLine?: number
}

interface Props {
  filename: string
  language: string
  patch: string
  inlineIssues?: Map<number, Issue[]>
}

const SEVERITY_BG: Record<string, string> = {
  critical: 'border-l-red-500 bg-red-900/20',
  high: 'border-l-orange-500 bg-orange-900/20',
  medium: 'border-l-yellow-500 bg-yellow-900/20',
  low: 'border-l-gray-500 bg-gray-800/50',
}

const PRIORITY_LABEL: Record<string, string> = {
  must_fix: '必须修复',
  should_fix: '应当修复',
  nice_to_fix: '可选',
}

const PRIORITY_COLOR: Record<string, string> = {
  must_fix: 'bg-red-700 text-red-100',
  should_fix: 'bg-yellow-700 text-yellow-100',
  nice_to_fix: 'bg-gray-600 text-gray-300',
}

function parseDiff(patch: string): DiffLine[] {
  if (!patch) return []
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const raw of patch.split('\n')) {
    if (raw.startsWith('@@')) {
      const match = raw.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/)
      if (match) {
        oldLine = parseInt(match[1]) || 0
        newLine = parseInt(match[3]) || 0
      }
      lines.push({ type: 'hunk', content: raw })
    } else if (raw.startsWith('+')) {
      lines.push({ type: 'add', content: raw, newLine: newLine++ })
    } else if (raw.startsWith('-')) {
      lines.push({ type: 'del', content: raw, oldLine: oldLine++ })
    } else {
      lines.push({ type: 'ctx', content: raw, oldLine: oldLine++, newLine: newLine++ })
    }
  }
  return lines
}

function InlineIssue({ issue }: { issue: Issue }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={`border-l-4 ${SEVERITY_BG[issue.severity] || SEVERITY_BG.low} px-2.5 py-1.5 my-0.5 rounded-r text-xs`}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`px-1 py-0.5 rounded text-[10px] font-bold uppercase ${
          issue.severity === 'critical' ? 'bg-red-700 text-red-100' :
          issue.severity === 'high' ? 'bg-orange-700 text-orange-100' :
          issue.severity === 'medium' ? 'bg-yellow-700 text-yellow-100' :
          'bg-gray-600 text-gray-300'
        }`}>
          {issue.severity}
        </span>
        <span className={`px-1 py-0.5 rounded text-[10px] ${PRIORITY_COLOR[issue.priority] || PRIORITY_COLOR.should_fix}`}>
          {PRIORITY_LABEL[issue.priority] || issue.priority}
        </span>
        {issue.confidence > 0 && (
          <span className={`text-[10px] ${issue.confidence >= 80 ? 'text-green-400' : issue.confidence >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            置信度 {issue.confidence}%
          </span>
        )}
        {(issue.current_code || issue.proposed_code) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-blue-400 hover:text-blue-300 ml-auto"
          >
            {expanded ? '收起' : '查看代码'}
          </button>
        )}
      </div>
      <p className="text-gray-300 mt-1 leading-relaxed">{issue.description}</p>
      {issue.suggestion && (
        <p className="text-gray-400 mt-0.5 text-[11px]">
          <span className="text-green-400">建议: </span>
          {issue.suggestion}
        </p>
      )}
      {expanded && (issue.current_code || issue.proposed_code) && (
        <div className="mt-2 space-y-1.5">
          {issue.current_code && (
            <div>
              <span className="text-[10px] text-red-400 font-medium">当前代码</span>
              <pre className="bg-gray-900/70 text-red-300 text-[11px] p-2 rounded mt-0.5 overflow-x-auto whitespace-pre-wrap font-mono">
                {issue.current_code}
              </pre>
            </div>
          )}
          {issue.proposed_code && (
            <div>
              <span className="text-[10px] text-green-400 font-medium">建议修改</span>
              <pre className="bg-gray-900/70 text-green-300 text-[11px] p-2 rounded mt-0.5 overflow-x-auto whitespace-pre-wrap font-mono">
                {issue.proposed_code}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function DiffViewer({ filename, language, patch, inlineIssues }: Props) {
  const lines = useMemo(() => parseDiff(patch), [patch])

  if (!patch) {
    return (
      <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 mb-3">
        <div className="text-sm text-gray-400">（无 diff 数据）</div>
      </div>
    )
  }

  const stats = useMemo(() => {
    const adds = lines.filter((l) => l.type === 'add').length
    const dels = lines.filter((l) => l.type === 'del').length
    return { adds, dels }
  }, [lines])

  return (
    <div className="bg-gray-850 border border-gray-700 rounded-lg overflow-hidden mb-3">
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-200">{filename}</span>
          {language && (
            <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
              {language}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-green-400">+{stats.adds}</span>
          <span className="text-red-400">-{stats.dels}</span>
        </div>
      </div>

      <div className="overflow-x-auto max-h-96 overflow-y-auto">
        <pre className="text-xs leading-relaxed font-mono">
          {lines.map((line, i) => {
            const bg =
              line.type === 'add'
                ? 'bg-green-900/30'
                : line.type === 'del'
                  ? 'bg-red-900/30'
                  : line.type === 'hunk'
                    ? 'bg-blue-900/20 text-blue-300'
                    : ''

            const prefix =
              line.type === 'add' ? '+' : line.type === 'del' ? '-' : ' '

            const numColor =
              line.type === 'add'
                ? 'text-green-600'
                : line.type === 'del'
                  ? 'text-red-600'
                  : 'text-gray-600'

            const issuesHere = line.newLine != null ? inlineIssues?.get(line.newLine) : undefined

            return (
              <div key={i}>
                <div className={`flex ${bg}`}>
                  {line.type !== 'hunk' ? (
                    <>
                      <span className={`w-10 text-right pr-2 select-none ${numColor} flex-shrink-0`}>
                        {line.oldLine ?? ''}
                      </span>
                      <span className={`w-10 text-right pr-2 select-none ${numColor} flex-shrink-0`}>
                        {line.newLine ?? ''}
                      </span>
                    </>
                  ) : (
                    <span className="w-20 flex-shrink-0" />
                  )}
                  <span
                    className={
                      line.type === 'add'
                        ? 'text-green-300'
                        : line.type === 'del'
                          ? 'text-red-300'
                          : line.type === 'hunk'
                            ? 'text-blue-300'
                            : 'text-gray-400'
                    }
                  >
                    {line.type === 'hunk' ? line.content : prefix + line.content.slice(1)}
                  </span>
                </div>
                {issuesHere && issuesHere.length > 0 && (
                  <div className="ml-20 mr-2">
                    {issuesHere.map((issue, j) => (
                      <InlineIssue key={j} issue={issue} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </pre>
      </div>
    </div>
  )
}
