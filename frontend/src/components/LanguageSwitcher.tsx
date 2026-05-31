import { useTranslation } from 'react-i18next'

export default function LanguageSwitcher({ className }: { className?: string }) {
  const { i18n } = useTranslation()
  const current = i18n.language?.startsWith('en') ? 'en' : 'zh'

  const switchTo = (lang: 'zh' | 'en') => {
    i18n.changeLanguage(lang)
  }

  return (
    <div className={`flex items-center rounded-lg bg-gray-800 border border-gray-700 overflow-hidden ${className || ''}`}>
      <button
        onClick={() => switchTo('zh')}
        className={`px-2 py-1 text-xs font-medium transition-colors ${
          current === 'zh'
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:text-gray-200'
        }`}
      >
        中文
      </button>
      <button
        onClick={() => switchTo('en')}
        className={`px-2 py-1 text-xs font-medium transition-colors ${
          current === 'en'
            ? 'bg-blue-600 text-white'
            : 'text-gray-400 hover:text-gray-200'
        }`}
      >
        EN
      </button>
    </div>
  )
}
