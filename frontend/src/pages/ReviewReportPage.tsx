import { useParams } from 'react-router-dom'

export default function ReviewReportPage() {
  const { owner, repo, pr } = useParams()
  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold">
        {owner}/{repo} #{pr}
      </h1>
    </div>
  )
}
