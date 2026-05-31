import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  createCustomProvider, updateCustomProvider, deleteCustomProvider,
  testProviderConnection,
} from '../../services/api'
import type { ProviderInfo, CustomProviderInput } from '../../types/review'

interface DialogState {
  open: boolean
  edit: boolean
  name: string
  display_name: string
  base_url: string
  api_key: string
  default_model: string
  timeout: number
}

const EMPTY_DIALOG: DialogState = {
  open: false, edit: false, name: '', display_name: '', base_url: '',
  api_key: '', default_model: '', timeout: 120,
}

interface Props {
  providers: ProviderInfo[]
  onProvidersChanged: () => void
}

export default function ProviderManager({ providers, onProvidersChanged }: Props) {
  const { t } = useTranslation()
  const [dialog, setDialog] = useState<DialogState>(EMPTY_DIALOG)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [dialogTesting, setDialogTesting] = useState(false)

  const openAddDialog = () => setDialog({ ...EMPTY_DIALOG, open: true })
  const openEditDialog = (p: ProviderInfo) => {
    setDialog({ ...EMPTY_DIALOG, open: true, edit: true, name: p.name, display_name: p.display_name, base_url: p.base_url || '', default_model: p.default_model })
  }
  const closeDialog = () => { setDialog(EMPTY_DIALOG); setDialogError(null) }

  const handleProviderSave = async () => {
    setDialogError(null)
    try {
      const input: CustomProviderInput = {
        name: dialog.name.trim().toLowerCase(),
        display_name: dialog.display_name.trim(),
        base_url: dialog.base_url.trim(),
        api_key: dialog.api_key.trim(),
        default_model: dialog.default_model.trim(),
        timeout: dialog.timeout,
      }
      if (!input.name || !input.display_name || !input.base_url || !input.api_key) {
        setDialogError(t('settings.provider.required'))
        return
      }
      if (dialog.edit) {
        await updateCustomProvider(dialog.name, input)
      } else {
        await createCustomProvider(input)
      }
      closeDialog()
      onProvidersChanged()
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : t('settings.provider.save_failed'))
    }
  }

  const handleProviderDelete = async (name: string) => {
    if (!confirm(t('settings.provider.delete_confirm', { name }))) return
    try {
      await deleteCustomProvider(name)
      onProvidersChanged()
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : t('settings.provider.delete_failed'))
    }
  }

  const handleTestProvider = async () => {
    setDialogTesting(true)
    setDialogError(null)
    try {
      const result = await testProviderConnection(dialog.name || 'test', {
        name: dialog.name, display_name: dialog.display_name,
        base_url: dialog.base_url, api_key: dialog.api_key,
        default_model: dialog.default_model,
      })
      setDialogError(result.ok ? t('settings.provider.connection_ok') : (result.error || t('settings.provider.connection_fail')))
    } catch {
      setDialogError(t('settings.provider.test_failed'))
    } finally {
      setDialogTesting(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold">{t('settings.provider.title')}</h2>
        <button
          onClick={openAddDialog}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          {t('settings.provider.add')}
        </button>
      </div>
      <div className="space-y-2">
        {providers.map((p) => (
          <div key={p.name} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white text-sm font-medium">{p.display_name}</span>
                {p.is_builtin ? (
                  <span className="text-xs text-gray-500 border border-gray-600 px-1.5 py-0.5 rounded">{t('settings.provider.builtin')}</span>
                ) : (
                  <span className="text-xs text-blue-400 border border-blue-600 px-1.5 py-0.5 rounded">{t('settings.provider.custom')}</span>
                )}
                {p.needs_config ? (
                  <span className="text-xs text-yellow-500">{t('settings.provider.not_configured')}</span>
                ) : (
                  <span className="text-xs text-green-500">{t('settings.provider.configured')}</span>
                )}
              </div>
              <p className="text-gray-500 text-xs mt-1">
                {t('settings.provider.default_model', { model: p.default_model || '—' })}
                {p.models.length > 0 && t('settings.provider.model_count', { count: p.models.length })}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!p.is_builtin && (
                <>
                  <button onClick={() => openEditDialog(p)} className="text-gray-400 hover:text-white text-xs transition-colors">{t('settings.provider.edit')}</button>
                  <button onClick={() => handleProviderDelete(p.name)} className="text-red-400 hover:text-red-300 text-xs transition-colors">{t('settings.provider.delete')}</button>
                </>
              )}
            </div>
          </div>
        ))}
        {providers.length === 0 && <p className="text-gray-500 text-sm">{t('settings.provider.no_providers')}</p>}
      </div>

      {/* 添加/编辑对话框 */}
      {dialog.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-white font-semibold text-lg">
              {dialog.edit ? t('settings.provider.edit_title') : t('settings.provider.add_title')}
            </h3>
            <div>
              <label className="text-gray-400 text-sm block mb-1">{t('settings.provider.slug_label')}</label>
              <input type="text" value={dialog.name} disabled={dialog.edit}
                onChange={(e) => setDialog({ ...dialog, name: e.target.value })}
                placeholder={t('settings.provider.slug_placeholder')}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">{t('settings.provider.display_name')}</label>
              <input type="text" value={dialog.display_name}
                onChange={(e) => setDialog({ ...dialog, display_name: e.target.value })}
                placeholder={t('settings.provider.display_name_placeholder')}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Base URL</label>
              <input type="text" value={dialog.base_url}
                onChange={(e) => setDialog({ ...dialog, base_url: e.target.value })}
                placeholder="https://api.groq.com/openai/v1"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">API Key</label>
              <input type="password" value={dialog.api_key}
                onChange={(e) => setDialog({ ...dialog, api_key: e.target.value })}
                placeholder={dialog.edit ? t('settings.provider.api_key_edit_hint') : t('settings.provider.api_key_placeholder')}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">{t('settings.provider.default_model_field')}</label>
              <input type="text" value={dialog.default_model}
                onChange={(e) => setDialog({ ...dialog, default_model: e.target.value })}
                placeholder={t('settings.provider.default_model_placeholder')}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">{t('settings.provider.timeout')}</label>
              <input type="number" value={dialog.timeout}
                onChange={(e) => setDialog({ ...dialog, timeout: parseInt(e.target.value) || 120 })}
                min={30} max={600}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            {dialogError && (
              <p className={`text-sm ${dialogError.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>{dialogError}</p>
            )}
            <div className="flex items-center gap-3 pt-2">
              <button onClick={handleProviderSave}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
              >
                {dialog.edit ? t('settings.provider.update') : t('settings.provider.add_btn')}
              </button>
              <button onClick={handleTestProvider} disabled={dialogTesting}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {dialogTesting ? t('settings.provider.testing') : t('settings.provider.test')}
              </button>
              <button onClick={closeDialog}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
              >
                {t('settings.provider.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
