interface Props {
  files: { filename: string; patch: string; language: string }[]
  highlightLine?: { file: string; line: number } | null
}

export default function DiffViewer({ files, highlightLine }: Props) {
  if (files.length === 0) return null

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <h3 className="text-lg font-bold text-white mb-4">变更详情</h3>
      <div className="space-y-4">
        {files.map((f) => (
          <div key={f.filename}>
            <h4 className="text-sm font-medium text-blue-400 mb-2">{f.filename}</h4>
            <pre className="bg-gray-900 rounded p-4 text-xs overflow-x-auto">
              <code className="text-gray-300">
                {f.patch.split('\n').map((line, i) => {
                  const lineNum = i + 1
                  const isHighlighted =
                    highlightLine?.file === f.filename && highlightLine?.line === lineNum
                  let color = 'text-gray-400'
                  if (line.startsWith('+')) color = 'text-green-400'
                  else if (line.startsWith('-')) color = 'text-red-400'
                  else if (line.startsWith('@@')) color = 'text-blue-400'

                  return (
                    <span
                      key={i}
                      className={`block ${color} ${isHighlighted ? 'bg-yellow-900/50' : ''}`}
                    >
                      {line}
                    </span>
                  )
                })}
              </code>
            </pre>
          </div>
        ))}
      </div>
    </div>
  )
}
