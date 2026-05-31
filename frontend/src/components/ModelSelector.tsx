import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { fetchProviders, fetchProviderModels } from '../services/api'
import type { ProviderInfo } from '../types/review'

interface Props {
  provider: string
  model: string
  onProviderChange: (v: string) => void
  onModelChange: (v: string) => void
}

export default function ModelSelector({ provider, model, onProviderChange, onModelChange }: Props) {
  const { t } = useTranslation()
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [models, setModels] = useState<string[]>([])
  const [loadingModels, setLoadingModels] = useState(false)
  const [manualModel, setManualModel] = useState(false)

  useEffect(() => {
    fetchProviders().then(setProviders).catch(() => {})
  }, [])

  useEffect(() => {
    if (!provider) return
    const info = providers.find((p) => p.name === provider)
    if (info?.models?.length) {
      setModels(info.models)
      setManualModel(false)
    } else {
      setModels([])
      // 尝试从 API 加载模型列表
      setLoadingModels(true)
      fetchProviderModels(provider)
        .then((list) => {
          if (list.length > 0) {
            setModels(list)
            setManualModel(false)
          } else {
            setManualModel(true)
          }
        })
        .catch(() => setManualModel(true))
        .finally(() => setLoadingModels(false))
    }
  }, [provider, providers])

  const handleProviderChange = (v: string) => {
    onProviderChange(v)
    const info = providers.find((p) => p.name === v)
    onModelChange(info?.default_model || '')
    setManualModel(false)
  }

  const currentProvider = providers.find((p) => p.name === provider)

  return (
    <div>
      <label className="block text-sm font-medium mb-2">{t('common.model_selector_label')}</label>
      <div className="flex gap-3">
        <select
          value={provider}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {providers.map((p) => (
            <option key={p.name} value={p.name}>
              {p.display_name}
            </option>
          ))}
        </select>

        {loadingModels ? (
          <div className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-gray-500 text-sm flex items-center">
            {t('common.model_selector_loading')}
          </div>
        ) : models.length > 0 && !manualModel ? (
          <select
            value={model}
            onChange={(e) => {
              if (e.target.value === '__manual__') {
                setManualModel(true)
                onModelChange('')
              } else {
                onModelChange(e.target.value)
              }
            }}
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {models.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
            <option value="__manual__">{t('common.model_selector_manual')}</option>
          </select>
        ) : (
          <input
            type="text"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder={currentProvider?.default_model || t('common.model_selector_placeholder')}
            className="flex-1 px-4 py-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        )}
      </div>
    </div>
  )
}
