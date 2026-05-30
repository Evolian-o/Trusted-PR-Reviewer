import { useState } from 'react'
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
  const [dialog, setDialog] = useState<DialogState>(EMPTY_DIALOG)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [dialogTesting, setDialogTesting] = useState(false)

  const openAddDialog = () => setDialog({ ...EMPTY_DIALOG, open: true })
  const openEditDialog = (p: ProviderInfo) => {
    setDialog({ ...EMPTY_DIALOG, open: true, edit: true, name: p.name, display_name: p.display_name, default_model: p.default_model })
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
        setDialogError('name / display_name / base_url / api_key 为必填')
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
      setDialogError(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleProviderDelete = async (name: string) => {
    if (!confirm(`确定要删除提供商 "${name}" 吗？`)) return
    try {
      await deleteCustomProvider(name)
      onProvidersChanged()
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : '删除失败')
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
      setDialogError(result.ok ? '连接成功 ✓' : (result.error || '连接失败'))
    } catch {
      setDialogError('测试请求失败')
    } finally {
      setDialogTesting(false)
    }
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold">LLM 提供商管理</h2>
        <button
          onClick={openAddDialog}
          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors"
        >
          + 添加自定义提供商
        </button>
      </div>
      <div className="space-y-2">
        {providers.map((p) => (
          <div key={p.name} className="bg-gray-800 rounded-lg p-4 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white text-sm font-medium">{p.display_name}</span>
                {p.is_builtin ? (
                  <span className="text-xs text-gray-500 border border-gray-600 px-1.5 py-0.5 rounded">内置</span>
                ) : (
                  <span className="text-xs text-blue-400 border border-blue-600 px-1.5 py-0.5 rounded">自定义</span>
                )}
                {p.needs_config ? (
                  <span className="text-xs text-yellow-500">未配置 API Key</span>
                ) : (
                  <span className="text-xs text-green-500">已配置</span>
                )}
              </div>
              <p className="text-gray-500 text-xs mt-1">
                默认模型: {p.default_model || '—'}
                {p.models.length > 0 && ` · 模型数: ${p.models.length}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {!p.is_builtin && (
                <>
                  <button onClick={() => openEditDialog(p)} className="text-gray-400 hover:text-white text-xs transition-colors">编辑</button>
                  <button onClick={() => handleProviderDelete(p.name)} className="text-red-400 hover:text-red-300 text-xs transition-colors">删除</button>
                </>
              )}
            </div>
          </div>
        ))}
        {providers.length === 0 && <p className="text-gray-500 text-sm">暂无可用提供商</p>}
      </div>

      {/* 添加/编辑对话框 */}
      {dialog.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4">
            <h3 className="text-white font-semibold text-lg">
              {dialog.edit ? '编辑提供商' : '添加自定义提供商'}
            </h3>
            <div>
              <label className="text-gray-400 text-sm block mb-1">标识名 (slug)</label>
              <input type="text" value={dialog.name} disabled={dialog.edit}
                onChange={(e) => setDialog({ ...dialog, name: e.target.value })}
                placeholder="如 groq, together"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">显示名称</label>
              <input type="text" value={dialog.display_name}
                onChange={(e) => setDialog({ ...dialog, display_name: e.target.value })}
                placeholder="如 Groq Cloud"
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
                placeholder={dialog.edit ? '留空则不修改' : '输入 API Key'}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">默认模型</label>
              <input type="text" value={dialog.default_model}
                onChange={(e) => setDialog({ ...dialog, default_model: e.target.value })}
                placeholder="如 llama-3.3-70b-versatile"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">超时（秒）</label>
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
                {dialog.edit ? '更新' : '添加'}
              </button>
              <button onClick={handleTestProvider} disabled={dialogTesting}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {dialogTesting ? '测试中...' : '测试连接'}
              </button>
              <button onClick={closeDialog}
                className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
