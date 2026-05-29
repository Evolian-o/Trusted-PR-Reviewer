import type { ReviewResult } from '../types/review'

export default function SummaryCard({ result }: { result: ReviewResult }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-5">
      <h3 className="text-lg font-bold text-white mb-3">评审总结</h3>
      <pre className="text-gray-300 leading-relaxed whitespace-pre-wrap font-sans text-sm">
        {result.summary}
      </pre>
      <div className="mt-4 flex gap-4 text-sm border-t border-gray-700 pt-3">
        <span className="text-gray-400">
          发现 <span className="text-red-400 font-bold">{result.issues.length}</span> 个问题
        </span>
        <span className="text-gray-400">
          提出 <span className="text-blue-400 font-bold">{result.suggestions.length}</span> 条建议
        </span>
      </div>
    </div>
  )
}
