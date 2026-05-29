import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchProviders, fetchProviderModels,
  createCustomProvider, updateCustomProvider, deleteCustomProvider,
  testProviderConnection,
} from '../services/api'
import type { ProviderInfo, CustomProviderInput } from '../types/review'

interface Settings {
  poll_interval_seconds: string
  default_provider: string
  default_model: string
  chunk_max_chars: string
  chunk_merge_max_chars: string
  chunk_max_lines: string
  chunk_strategy: string
  email: {
    to_email: string
    password: string
    enabled: boolean
  }
}

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

export default function SettingsPage() {
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [settings, setSettings] = useState<Settings>({
    poll_interval_seconds: '300',
    default_provider: 'deepseek',
    default_model: '',
    chunk_max_chars: '8000',
    chunk_merge_max_chars: '6000',
    chunk_max_lines: '2000',
    chunk_strategy: 'auto',
    email: { to_email: '', password: '', enabled: false },
  })
  const [providerModels, setProviderModels] = useState<string[]>([])
  const [dialog, setDialog] = useState<DialogState>(EMPTY_DIALOG)
  const [dialogError, setDialogError] = useState<string | null>(null)
  const [dialogTesting, setDialogTesting] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated) { navigate('/', { replace: true }); return }
        return Promise.all([fetch('/api/settings'), fetchProviders()])
      })
      .then((results) => {
        if (!results) return
        const [settingsResp, provs] = results as [Response, ProviderInfo[]]
        return Promise.all([settingsResp.json(), provs])
      })
      .then((data) => {
        if (!data) return
        const [settingsData, provs] = data as [Record<string, unknown>, ProviderInfo[]]
        if (settingsData && !settingsData.error) setSettings(settingsData as unknown as Settings)
        setProviders(provs)
      })
      .finally(() => setChecking(false))
  }, [navigate])

  // 加载当前选择提供商的模型列表
  useEffect(() => {
    if (!settings.default_provider) return
    fetchProviderModels(settings.default_provider)
      .then(setProviderModels)
      .catch(() => setProviderModels([]))
  }, [settings.default_provider])

  const update = (path: string, value: string | number | boolean) => {
    setSettings((prev) => {
      const next = { ...prev }
      if (path.startsWith('email.')) {
        const key = path.split('.')[1]
        next.email = { ...next.email, [key]: value }
      } else {
        ;(next as Record<string, unknown>)[path] = value
      }
      return next
    })
    setSaved(false)
    setError(null)
  }

  const handleSave = async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: '保存失败' }))
        throw new Error(err.error || err.detail || '保存失败')
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setLoading(false)
    }
  }

  const handleTestEmail = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const resp = await fetch('/api/settings/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings.email),
      })
      const data = await resp.json()
      setTestResult(resp.ok ? 'success' : (data.error || '发送失败'))
    } catch {
      setTestResult('请求失败')
    } finally {
      setTesting(false)
    }
  }

  // ── 提供商管理 ──

  const reloadProviders = async () => {
    const list = await fetchProviders()
    setProviders(list)
  }

  const openAddDialog = () => setDialog({ ...EMPTY_DIALOG, open: true })

  const openEditDialog = (p: ProviderInfo) => {
    setDialog({ ...EMPTY_DIALOG, open: true, edit: true, name: p.name, display_name: p.display_name, default_model: p.default_model })
  }

  const closeDialog = () => {
    setDialog(EMPTY_DIALOG)
    setDialogError(null)
  }

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
      await reloadProviders()
    } catch (e) {
      setDialogError(e instanceof Error ? e.message : '保存失败')
    }
  }

  const handleProviderDelete = async (name: string) => {
    if (!confirm(`确定要删除提供商 "${name}" 吗？`)) return
    try {
      await deleteCustomProvider(name)
      await reloadProviders()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
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
      if (result.ok) {
        setDialogError('连接成功 ✓')
      } else {
        setDialogError(result.error || '连接失败')
      }
    } catch {
      setDialogError('测试请求失败')
    } finally {
      setDialogTesting(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900">
      <nav className="border-b border-gray-700 bg-gray-850">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-white">设置</h1>
          <button onClick={() => navigate('/dashboard')} className="text-gray-400 hover:text-gray-200 text-sm transition-colors">
            返回仪表盘
          </button>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* 自动评审 */}
        <section>
          <h2 className="text-white font-semibold mb-4">自动评审</h2>
          <div className="bg-gray-800 rounded-lg p-5 space-y-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">默认 LLM 提供商</label>
              <select
                value={settings.default_provider}
                onChange={(e) => update('default_provider', e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {providers.map((p) => (
                  <option key={p.name} value={p.name}>{p.display_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">默认模型</label>
              {providerModels.length > 0 ? (
                <select
                  value={settings.default_model}
                  onChange={(e) => update('default_model', e.target.value)}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {providerModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={settings.default_model}
                  onChange={(e) => update('default_model', e.target.value)}
                  placeholder={providers.find((p) => p.name === settings.default_provider)?.default_model || '输入模型名'}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
              <p className="text-gray-500 text-xs mt-1">自动评审时使用的模型，留空则使用提供商默认</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button onClick={handleSave} disabled={loading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {loading ? '保存中...' : '保存提供商设置'}
              </button>
              {saved && <span className="text-green-400 text-sm">已保存</span>}
              {error && <span className="text-red-400 text-sm">{error}</span>}
            </div>
          </div>
        </section>

        {/* LLM 提供商管理 */}
        <section>
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
                      <button
                        onClick={() => openEditDialog(p)}
                        className="text-gray-400 hover:text-white text-xs transition-colors"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => handleProviderDelete(p.name)}
                        className="text-red-400 hover:text-red-300 text-xs transition-colors"
                      >
                        删除
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {providers.length === 0 && (
              <p className="text-gray-500 text-sm">暂无可用提供商</p>
            )}
          </div>
        </section>

        {/* 轮询 */}
        <section>
          <h2 className="text-white font-semibold mb-4">轮询设置</h2>
          <div className="bg-gray-800 rounded-lg p-5">
            <label className="text-gray-400 text-sm block mb-1">轮询间隔（秒）</label>
            <input
              type="number" value={settings.poll_interval_seconds}
              onChange={(e) => update('poll_interval_seconds', e.target.value)}
              min={60}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">默认 300 秒（5 分钟），最短 60 秒</p>
          </div>
        </section>

        {/* 评审策略 */}
        <section>
          <h2 className="text-white font-semibold mb-4">评审策略</h2>
          <div className="bg-gray-800 rounded-lg p-5 space-y-4">
            <div>
              <label className="text-gray-400 text-sm block mb-1">分片策略</label>
              <select
                value={settings.chunk_strategy}
                onChange={(e) => update('chunk_strategy', e.target.value)}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="auto">自动 (AST → 正则 → 行级)</option>
                <option value="ast">仅 AST (tree-sitter)</option>
                <option value="regex">仅正则</option>
                <option value="line">仅行级</option>
              </select>
              <p className="text-gray-500 text-xs mt-1">推荐使用自动模式，系统会自动选择最优分片方式</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Chunk 最大字符数</label>
              <input type="number" value={settings.chunk_max_chars}
                onChange={(e) => update('chunk_max_chars', e.target.value)}
                min={1000} max={32000}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Chunk 合并阈值（字符数）</label>
              <input type="number" value={settings.chunk_merge_max_chars}
                onChange={(e) => update('chunk_merge_max_chars', e.target.value)}
                min={1000} max={32000}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-gray-500 text-xs mt-1">相邻小函数累计不超过此值时合并到同一 chunk</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">行级兜底最大行数</label>
              <input type="number" value={settings.chunk_max_lines}
                onChange={(e) => update('chunk_max_lines', e.target.value)}
                min={500} max={10000}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-gray-500 text-xs mt-1">当 AST 和正则均不可用时，按此行数切分</p>
            </div>
          </div>
        </section>

        {/* 邮件通知 */}
        <section>
          <h2 className="text-white font-semibold mb-4">邮件通知</h2>
          <div className="bg-gray-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={settings.email.enabled}
                  onChange={(e) => update('email.enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
              <span className="text-gray-300 text-sm">启用邮件通知</span>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">收件邮箱</label>
              <input type="email" value={settings.email.to_email}
                onChange={(e) => update('email.to_email', e.target.value)}
                placeholder="your@email.com"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-gray-500 text-xs mt-1">主机/端口自动匹配，支持 QQ / Gmail / 163 / Outlook 等</p>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">SMTP 授权码</label>
              <input type="password" value={settings.email.password}
                onChange={(e) => update('email.password', e.target.value)}
                placeholder="邮箱平台获取的授权码"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-3">
              <button onClick={handleTestEmail} disabled={testing}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {testing ? '发送中...' : '发送测试邮件'}
              </button>
              {testResult === 'success' && <span className="text-green-400 text-sm">发送成功</span>}
              {testResult && testResult !== 'success' && <span className="text-red-400 text-sm">{testResult}</span>}
            </div>
          </div>
        </section>

        {/* 保存 */}
        <div className="flex items-center gap-4">
          <button onClick={handleSave} disabled={loading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存设置'}
          </button>
          {saved && <span className="text-green-400 text-sm">已保存</span>}
          {error && <span className="text-red-400 text-sm">{error}</span>}
        </div>
      </main>

      {/* 添加/编辑提供商对话框 */}
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
              <p className={`text-sm ${dialogError.includes('✓') ? 'text-green-400' : 'text-red-400'}`}>
                {dialogError}
              </p>
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
    </div>
  )
}
