interface EmailConfig {
  to_email: string
  password: string
  enabled: boolean
}

interface Props {
  pollInterval: string
  email: EmailConfig
  testing: boolean
  testResult: string | null
  onUpdate: (path: string, value: string | number | boolean) => void
  onTestEmail: () => void
}

export default function NotificationSettings({ pollInterval, email, testing, testResult, onUpdate, onTestEmail }: Props) {
  return (
    <>
      <section>
        <h2 className="text-white font-semibold mb-4">轮询设置</h2>
        <div className="bg-gray-800 rounded-lg p-5">
          <label className="text-gray-400 text-sm block mb-1">轮询间隔（秒）</label>
          <input
            type="number" value={pollInterval}
            onChange={(e) => onUpdate('poll_interval_seconds', e.target.value)}
            min={60}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-gray-500 text-xs mt-1">默认 300 秒（5 分钟），最短 60 秒</p>
        </div>
      </section>

      <section>
        <h2 className="text-white font-semibold mb-4">邮件通知</h2>
        <div className="bg-gray-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={email.enabled}
                onChange={(e) => onUpdate('email.enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
            <span className="text-gray-300 text-sm">启用邮件通知</span>
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">收件邮箱</label>
            <input type="email" value={email.to_email}
              onChange={(e) => onUpdate('email.to_email', e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">主机/端口自动匹配，支持 QQ / Gmail / 163 / Outlook 等</p>
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">SMTP 授权码</label>
            <input type="password" value={email.password}
              onChange={(e) => onUpdate('email.password', e.target.value)}
              placeholder="邮箱平台获取的授权码"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onTestEmail} disabled={testing}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {testing ? '发送中...' : '发送测试邮件'}
            </button>
            {testResult === 'success' && <span className="text-green-400 text-sm">发送成功</span>}
            {testResult && testResult !== 'success' && <span className="text-red-400 text-sm">{testResult}</span>}
          </div>
        </div>
      </section>
    </>
  )
}
