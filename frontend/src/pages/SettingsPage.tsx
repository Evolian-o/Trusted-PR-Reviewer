import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface Settings {
  poll_interval_seconds: string
  default_provider: string
  default_model: string
  chunk_max_chars: string
  chunk_merge_max_chars: string
  chunk_max_lines: string
  chunk_strategy: string
  email: {
    smtp_host: string
    smtp_port: number
    username: string
    password: string
    to_email: string
    enabled: boolean
  }
}

const PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama (本地)',
  deepseek: 'DeepSeek (在线)',
  doubao: '豆包 (在线)',
  openai: 'OpenAI (在线)',
}

export default function SettingsPage() {
  const [checking, setChecking] = useState(true)
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings>({
    poll_interval_seconds: '300',
    default_provider: 'ollama',
    default_model: '',
    chunk_max_chars: '8000',
    chunk_merge_max_chars: '6000',
    chunk_max_lines: '2000',
    chunk_strategy: 'auto',
    email: {
      smtp_host: '',
      smtp_port: 465,
      username: '',
      password: '',
      to_email: '',
      enabled: false,
    },
  })
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated) {
          navigate('/', { replace: true })
          return
        }
        return fetch('/api/settings')
      })
      .then((r) => r?.json())
      .then((data) => {
        if (data) setSettings(data)
      })
      .finally(() => setChecking(false))
  }, [navigate])

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
  }

  const handleSave = async () => {
    setLoading(true)
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
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
      if (resp.ok) {
        setTestResult('success')
      } else {
        setTestResult(data.error || '发送失败')
      }
    } catch {
      setTestResult('请求失败')
    } finally {
      setTesting(false)
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
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
          >
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
                {Object.entries(PROVIDER_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">默认模型</label>
              <input
                type="text"
                value={settings.default_model}
                onChange={(e) => update('default_model', e.target.value)}
                placeholder="留空使用提供商默认模型"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </section>

        {/* 轮询 */}
        <section>
          <h2 className="text-white font-semibold mb-4">轮询设置</h2>
          <div className="bg-gray-800 rounded-lg p-5">
            <label className="text-gray-400 text-sm block mb-1">轮询间隔（秒）</label>
            <input
              type="number"
              value={settings.poll_interval_seconds}
              onChange={(e) => update('poll_interval_seconds', e.target.value)}
              min={60}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">
              默认 300 秒（5 分钟），最短 60 秒
            </p>
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
              <p className="text-gray-500 text-xs mt-1">
                推荐使用自动模式，系统会自动选择最优分片方式
              </p>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Chunk 最大字符数</label>
              <input
                type="number"
                value={settings.chunk_max_chars}
                onChange={(e) => update('chunk_max_chars', e.target.value)}
                min={1000}
                max={32000}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">Chunk 合并阈值（字符数）</label>
              <input
                type="number"
                value={settings.chunk_merge_max_chars}
                onChange={(e) => update('chunk_merge_max_chars', e.target.value)}
                min={1000}
                max={32000}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-gray-500 text-xs mt-1">
                相邻小函数累计不超过此值时合并到同一 chunk
              </p>
            </div>
            <div>
              <label className="text-gray-400 text-sm block mb-1">行级兜底最大行数</label>
              <input
                type="number"
                value={settings.chunk_max_lines}
                onChange={(e) => update('chunk_max_lines', e.target.value)}
                min={500}
                max={10000}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-gray-500 text-xs mt-1">
                当 AST 和正则均不可用时，按此行数切分
              </p>
            </div>
          </div>
        </section>

        {/* 邮件通知 */}
        <section>
          <h2 className="text-white font-semibold mb-4">邮件通知</h2>
          <div className="bg-gray-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center gap-3">
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.email.enabled}
                  onChange={(e) => update('email.enabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
              </label>
              <span className="text-gray-300 text-sm">启用邮件通知</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-gray-400 text-xs block mb-1">SMTP 主机</label>
                <input
                  type="text"
                  value={settings.email.smtp_host}
                  onChange={(e) => update('email.smtp_host', e.target.value)}
                  placeholder="smtp.qq.com"
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-gray-400 text-xs block mb-1">端口</label>
                <input
                  type="number"
                  value={settings.email.smtp_port}
                  onChange={(e) => update('email.smtp_port', Number(e.target.value))}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-1">发件账号</label>
              <input
                type="text"
                value={settings.email.username}
                onChange={(e) => update('email.username', e.target.value)}
                placeholder="your@qq.com"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-1">SMTP 授权码</label>
              <input
                type="password"
                value={settings.email.password}
                onChange={(e) => update('email.password', e.target.value)}
                placeholder="SMTP 授权码"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="text-gray-400 text-xs block mb-1">收件邮箱</label>
              <input
                type="email"
                value={settings.email.to_email}
                onChange={(e) => update('email.to_email', e.target.value)}
                placeholder="接收通知的邮箱"
                className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleTestEmail}
                disabled={testing}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
              >
                {testing ? '发送中...' : '发送测试邮件'}
              </button>
              {testResult === 'success' && (
                <span className="text-green-400 text-sm">发送成功</span>
              )}
              {testResult && testResult !== 'success' && (
                <span className="text-red-400 text-sm">{testResult}</span>
              )}
            </div>
          </div>
        </section>

        {/* 保存 */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleSave}
            disabled={loading}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {loading ? '保存中...' : '保存设置'}
          </button>
          {saved && <span className="text-green-400 text-sm">已保存</span>}
        </div>
      </main>
    </div>
  )
}
