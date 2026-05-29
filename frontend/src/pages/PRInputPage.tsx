import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UrlInput from '../components/UrlInput'
import ModelSelector from '../components/ModelSelector'
import DimensionChecklist from '../components/DimensionChecklist'

const URL_PATTERN = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/

export default function PRInputPage() {
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState('')
  const [provider, setProvider] = useState('deepseek')
  const [model, setModel] = useState('deepseek-chat')
  const [dims, setDims] = useState(['bug', 'security', 'performance', 'style'])
  const navigate = useNavigate()

  const handleUrlChange = (v: string) => {
    setUrl(v)
    if (urlError && URL_PATTERN.test(v)) {
      setUrlError('')
    }
  }

  const handleStart = () => {
    if (!url.trim()) {
      setUrlError('请输入 PR URL')
      return
    }
    const match = URL_PATTERN.exec(url.trim())
    if (!match) {
      setUrlError('URL 格式不正确，示例: https://github.com/owner/repo/pull/123')
      return
    }

    const [, owner, repo, pr] = match
    const params = new URLSearchParams({ provider })
    if (model) params.set('model', model)
    if (dims.length) params.set('dims', dims.join(','))

    navigate(`/review/${owner}/${repo.replace('.git', '')}/${pr}?${params.toString()}`)
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-3">AI PR Review</h1>
          <p className="text-gray-400">输入 GitHub PR 链接，智能代码评审</p>
        </div>

        <div className="bg-gray-850 border border-gray-700 rounded-xl p-8 space-y-6">
          <UrlInput value={url} onChange={handleUrlChange} error={urlError} />
          <ModelSelector
            provider={provider}
            model={model}
            onProviderChange={setProvider}
            onModelChange={setModel}
          />
          <DimensionChecklist selected={dims} onChange={setDims} />

          <button
            onClick={handleStart}
            className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 transition-colors text-lg"
          >
            开始评审
          </button>

          <div className="text-center">
            <a
              href="/history"
              onClick={(e) => { e.preventDefault(); navigate('/history') }}
              className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
            >
              评审历史
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
