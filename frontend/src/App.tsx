import { Routes, Route } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import PRInputPage from './pages/PRInputPage'
import ReviewReportPage from './pages/ReviewReportPage'
import SharePage from './pages/SharePage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<LoginPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/review" element={<PRInputPage />} />
        <Route path="/review/:owner/:repo/:pr" element={<ReviewReportPage />} />
        <Route path="/share/:token" element={<SharePage />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </div>
  )
}
