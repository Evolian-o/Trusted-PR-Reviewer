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
      <label className="block text-sm font-medium mb-2 text-gray-300">评审维度</label>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
        {DIMENSIONS.map((d) => (
          <label
            key={d.key}
            className="flex items-center gap-1.5 text-sm text-gray-400 cursor-pointer hover:text-gray-200 transition-colors select-none"
          >
            <input
              type="checkbox"
              checked={selected.includes(d.key)}
              onChange={() => toggle(d.key)}
              className="accent-blue-500"
            />
            {d.label}
          </label>
        ))}
      </div>
    </div>
  )
}
