import { useTranslation } from 'react-i18next'

interface SchedulerStatus {
  running: boolean
  monitored_repos: number
  interval_seconds: number
}

interface Props {
  status: SchedulerStatus | null
  onToggle: () => void
}

export default function MonitorPanel({ status, onToggle }: Props) {
  const { t } = useTranslation()

  if (!status) return null

  return (
    <div className="mb-4 p-3 bg-gray-800 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-300">{t('dashboard.auto_monitor')}</span>
        <span className={`flex items-center gap-1.5 text-xs font-medium ${
          status.running ? 'text-green-400' : 'text-gray-500'
        }`}>
          <span className={`w-2 h-2 rounded-full ${
            status.running ? 'bg-green-400 animate-pulse' : 'bg-gray-600'
          }`} />
          {status.running ? t('dashboard.monitor_running') : t('dashboard.monitor_stopped')}
        </span>
      </div>
      <div className="text-xs text-gray-500 space-y-1">
        <div className="flex justify-between">
          <span>{t('dashboard.monitored_repos')}</span>
          <span>{status.monitored_repos} 个</span>
        </div>
        <div className="flex justify-between">
          <span>{t('dashboard.polling_interval')}</span>
          <span>{status.interval_seconds}s</span>
        </div>
      </div>
      <button
        onClick={onToggle}
        className={`mt-2 w-full py-1 text-xs rounded transition-colors ${
          status.running
            ? 'bg-red-900/40 text-red-400 hover:bg-red-900/60'
            : 'bg-green-900/40 text-green-400 hover:bg-green-900/60'
        }`}
      >
        {status.running ? t('dashboard.stop_monitor') : t('dashboard.start_monitor')}
      </button>
    </div>
  )
}
