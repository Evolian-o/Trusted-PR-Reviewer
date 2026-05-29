import { useMemo } from 'react'

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

export default function DiffViewer({ filename, language, patch }: Props) {
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

      <div className="overflow-x-auto max-h-80 overflow-y-auto">
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

            return (
              <div key={i} className={`flex ${bg}`}>
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
            )
          })}
        </pre>
      </div>
    </div>
  )
}
