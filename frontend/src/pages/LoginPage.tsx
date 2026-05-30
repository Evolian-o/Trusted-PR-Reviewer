import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { auth, refresh } = useAuth()
  const [searchParams] = useSearchParams()
  const expired = searchParams.get('expired') === '1'
  const navigate = useNavigate()

  useEffect(() => {
    if (auth.authenticated && !auth.tokenExpired) {
      navigate('/dashboard', { replace: true })
    }
  }, [auth.authenticated, auth.tokenExpired, navigate])

  // 页面加载时刷新一次 auth 状态（处理 callback 后 cookie 已设置但 context 未更新）
  useEffect(() => {
    refresh()
  }, [refresh])

  const handleLogin = async () => {
    try {
      const resp = await fetch('/api/auth/login')
      const { url } = await resp.json()
      window.location.href = url
    } catch {
      // ignore
    }
  }

  if (auth.loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-3">AI PR Review</h1>
        <p className="text-gray-400 mb-4">登录 GitHub 自动监控仓库 PR</p>
        {expired && (
          <p className="text-yellow-400 text-sm mb-4 bg-yellow-400/10 rounded-lg py-2 px-4 inline-block">
            登录已过期，请重新授权
          </p>
        )}
        <button
          onClick={handleLogin}
          className="inline-flex items-center gap-3 px-8 py-3 bg-[#238636] hover:bg-[#2ea043] text-white font-medium rounded-lg transition-colors text-lg"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 16 16">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          Sign in with GitHub
        </button>
      </div>
    </div>
  )
}
