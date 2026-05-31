import { useTranslation } from 'react-i18next'

const DIMENSIONS = [
  { key: 'bug', i18nKey: 'common.dim_bug' as const },
  { key: 'security', i18nKey: 'common.dim_security' as const },
  { key: 'performance', i18nKey: 'common.dim_performance' as const },
  { key: 'style', i18nKey: 'common.dim_style' as const },
]

interface Props {
  selected: string[]
  onChange: (dims: string[]) => void
}

export default function DimensionChecklist({ selected, onChange }: Props) {
  const { t } = useTranslation()
  const toggle = (key: string) => {
    if (selected.includes(key)) {
      onChange(selected.filter((d) => d !== key))
    } else {
      onChange([...selected, key])
    }
  }

  return (
    <div>
      <label className="block text-sm font-medium mb-2 text-gray-300">{t('common.dim_label')}</label>
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
            {t(d.i18nKey)}
          </label>
        ))}
      </div>
    </div>
  )
}
