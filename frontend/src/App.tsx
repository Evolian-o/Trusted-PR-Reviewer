import { Routes, Route } from 'react-router-dom'
import PRInputPage from './pages/PRInputPage'
import ReviewReportPage from './pages/ReviewReportPage'

export default function App() {
  return (
    <div className="min-h-screen">
      <Routes>
        <Route path="/" element={<PRInputPage />} />
        <Route path="/:owner/:repo/:pr" element={<ReviewReportPage />} />
      </Routes>
    </div>
  )
}
