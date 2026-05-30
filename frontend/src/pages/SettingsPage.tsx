import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { fetchProviders, fetchProviderModels } from '../services/api'
import type { ProviderInfo } from '../types/review'
import ProviderManager from '../components/Settings/ProviderManager'
import ChunkSettings from '../components/Settings/ChunkSettings'
import NotificationSettings from '../components/Settings/NotificationSettings'

interface Settings {
  poll_interval_seconds: string
  default_provider: string
  default_model: string
  chunk_max_chars: string
  chunk_merge_max_chars: string
  chunk_max_lines: string
  chunk_strategy: string
  email: { to_email: string; password: string; enabled: boolean }
}

export default function SettingsPage() {
  const { auth } = useAuth()
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

  // ── 初始加载 ──
  useEffect(() => {
    if (auth.loading) return
    Promise.all([fetch('/api/settings'), fetchProviders()])
      .then(async ([settingsResp, provs]) => {
        const settingsData = await settingsResp.json()
        if (settingsData && !settingsData.error) setSettings(settingsData as Settings)
        setProviders(provs)
      })
  }, [auth.loading])

  // ── 当前提供商的模型列表 ──
  useEffect(() => {
    if (!settings.default_provider) return
    fetchProviderModels(settings.default_provider)
      .then(setProviderModels)
      .catch(() => setProviderModels([]))
  }, [settings.default_provider])

  // ── 通用状态更新 ──
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

  const reloadProviders = async () => {
    setProviders(await fetchProviders())
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

  // ── 加载中 ──
  if (auth.loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  // ── 渲染 ──
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
          <ProviderManager providers={providers} onProvidersChanged={reloadProviders} />
        </section>

        {/* 轮询 + 邮件 */}
        <NotificationSettings
          pollInterval={settings.poll_interval_seconds}
          email={settings.email}
          testing={testing}
          testResult={testResult}
          onUpdate={update}
          onTestEmail={handleTestEmail}
        />

        {/* 评审策略 */}
        <ChunkSettings
          chunk_strategy={settings.chunk_strategy}
          chunk_max_chars={settings.chunk_max_chars}
          chunk_merge_max_chars={settings.chunk_merge_max_chars}
          chunk_max_lines={settings.chunk_max_lines}
          onUpdate={update}
        />

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
    </div>
  )
}
