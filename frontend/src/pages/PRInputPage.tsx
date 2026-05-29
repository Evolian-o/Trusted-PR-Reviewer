import { useState, useEffect } from 'react'
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
  const [checking, setChecking] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    fetch('/api/auth/status')
      .then((r) => r.json())
      .then((data) => {
        if (!data.authenticated) {
          navigate('/', { replace: true })
        }
      })
      .finally(() => setChecking(false))
  }, [navigate])

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
          <h1 className="text-lg font-bold text-white">AI PR Review</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-gray-400 hover:text-gray-200 text-sm transition-colors"
          >
            返回仪表盘
          </button>
        </div>
      </nav>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-white mb-2">新建评审</h2>
            <p className="text-gray-400">输入 GitHub PR 链接，选择模型后开始智能代码评审</p>
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
              <button
                onClick={() => navigate('/history')}
                className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
              >
                评审历史
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
