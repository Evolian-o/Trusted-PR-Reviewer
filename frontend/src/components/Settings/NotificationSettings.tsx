import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation()
  return (
    <>
      <section>
        <h2 className="text-white font-semibold mb-4">{t('settings.notification.poll_title')}</h2>
        <div className="bg-gray-800 rounded-lg p-5">
          <label className="text-gray-400 text-sm block mb-1">{t('settings.notification.poll_interval')}</label>
          <input
            type="number" value={pollInterval}
            onChange={(e) => onUpdate('poll_interval_seconds', e.target.value)}
            min={60}
            className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-gray-500 text-xs mt-1">{t('settings.notification.poll_hint')}</p>
        </div>
      </section>

      <section>
        <h2 className="text-white font-semibold mb-4">{t('settings.notification.email_title')}</h2>
        <div className="bg-gray-800 rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" checked={email.enabled}
                onChange={(e) => onUpdate('email.enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600" />
            </label>
            <span className="text-gray-300 text-sm">{t('settings.notification.enable')}</span>
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">{t('settings.notification.recipient')}</label>
            <input type="email" value={email.to_email}
              onChange={(e) => onUpdate('email.to_email', e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-gray-500 text-xs mt-1">{t('settings.notification.email_hint')}</p>
          </div>
          <div>
            <label className="text-gray-400 text-sm block mb-1">{t('settings.notification.smtp_label')}</label>
            <input type="password" value={email.password}
              onChange={(e) => onUpdate('email.password', e.target.value)}
              placeholder={t('settings.notification.smtp_placeholder')}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onTestEmail} disabled={testing}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
            >
              {testing ? t('settings.notification.sending') : t('settings.notification.send_test')}
            </button>
            {testResult === 'success' && <span className="text-green-400 text-sm">{t('settings.notification.send_ok')}</span>}
            {testResult && testResult !== 'success' && <span className="text-red-400 text-sm">{testResult}</span>}
          </div>
        </div>
      </section>
    </>
  )
}
