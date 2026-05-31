import { useTranslation } from 'react-i18next'

interface Props {
  chunk_strategy: string
  chunk_max_chars: string
  chunk_merge_max_chars: string
  chunk_max_lines: string
  onUpdate: (path: string, value: string) => void
}

export default function ChunkSettings({ chunk_strategy, chunk_max_chars, chunk_merge_max_chars, chunk_max_lines, onUpdate }: Props) {
  const { t } = useTranslation()
  return (
    <section>
      <h2 className="text-white font-semibold mb-4">{t('settings.chunk.strategy_title')}</h2>
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <div>
          <label className="text-gray-400 text-sm block mb-1">{t('settings.chunk.strategy_label')}</label>
          <select
            value={chunk_strategy}
            onChange={(e) => onUpdate('chunk_strategy', e.target.value)}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="auto">{t('settings.chunk.strategy_auto')}</option>
            <option value="ast">{t('settings.chunk.strategy_ast')}</option>
            <option value="regex">{t('settings.chunk.strategy_regex')}</option>
            <option value="line">{t('settings.chunk.strategy_line')}</option>
          </select>
          <p className="text-gray-500 text-xs mt-1">{t('settings.chunk.strategy_hint')}</p>
        </div>
        <div>
          <label className="text-gray-400 text-sm block mb-1">{t('settings.chunk.max_chars')}</label>
          <input type="number" value={chunk_max_chars}
            onChange={(e) => onUpdate('chunk_max_chars', e.target.value)}
            min={1000} max={32000}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-gray-400 text-sm block mb-1">{t('settings.chunk.merge_threshold')}</label>
          <input type="number" value={chunk_merge_max_chars}
            onChange={(e) => onUpdate('chunk_merge_max_chars', e.target.value)}
            min={1000} max={32000}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-gray-500 text-xs mt-1">{t('settings.chunk.merge_hint')}</p>
        </div>
        <div>
          <label className="text-gray-400 text-sm block mb-1">{t('settings.chunk.max_lines')}</label>
          <input type="number" value={chunk_max_lines}
            onChange={(e) => onUpdate('chunk_max_lines', e.target.value)}
            min={500} max={10000}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-gray-500 text-xs mt-1">{t('settings.chunk.max_lines_hint')}</p>
        </div>
      </div>
    </section>
  )
}
