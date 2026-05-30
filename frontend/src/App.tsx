import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './contexts/AuthContext'
import type { ReactNode } from 'react'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PRInputPage from './pages/PRInputPage'
import ReviewReportPage from './pages/ReviewReportPage'
import SharePage from './pages/SharePage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'

function RequireAuth({ children }: { children: ReactNode }) {
  const { auth } = useAuth()
  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }
  if (!auth.authenticated) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        <Route path="/review" element={<RequireAuth><PRInputPage /></RequireAuth>} />
        <Route path="/review/:owner/:repo/:pr" element={<ReviewReportPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/history" element={<RequireAuth><HistoryPage /></RequireAuth>} />
        <Route path="/settings" element={<RequireAuth><SettingsPage /></RequireAuth>} />
      </Routes>
    </div>
  )
}
