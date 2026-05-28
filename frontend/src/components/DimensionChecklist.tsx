const DIMENSIONS = [
  { key: 'bug', label: 'Bug 风险' },
  { key: 'security', label: '安全漏洞' },
  { key: 'performance', label: '性能问题' },
  { key: 'style', label: '代码规范' },
]

interface Props {
  selected: string[]
  onChange: (dims: string[]) => void
}

export default function DimensionChecklist({ selected, onChange }: Props) {
  const toggle = (key: string) => {
    if (selected.includes(key)) {
      onChange(selected.filter((d) => d !== key))
    } else {
      onChange([...selected, key])
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2">评审维度</label>
      <div className="flex flex-wrap gap-2">
        {DIMENSIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => toggle(d.key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selected.includes(d.key)
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-300 border border-gray-600 hover:border-gray-500'
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  )
}
