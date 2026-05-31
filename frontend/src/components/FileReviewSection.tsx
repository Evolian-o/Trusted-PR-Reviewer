import { useTranslation } from 'react-i18next'
import type { FileReview, FileInfo } from '../types/review'
import DiffViewer from './DiffViewer'

interface Props {
  fileReviews: FileReview[]
  allPatches: Map<string, FileInfo>
  collapsedFiles: Set<string>
  onToggle: (filename: string) => void
  colorScheme: 'green' | 'blue'
  noPatchMessage: string
  findPatch: (patches: Map<string, FileInfo>, chunkName: string) => FileInfo | undefined
}

const sevBg: Record<string, string> = {
  critical: 'border-red-500 bg-red-900/20',
  high: 'border-orange-500 bg-orange-900/20',
  medium: 'border-yellow-500 bg-yellow-900/20',
  low: 'border-gray-500 bg-gray-800',
}

export default function FileReviewSection({
  fileReviews, allPatches, collapsedFiles, onToggle, colorScheme, noPatchMessage, findPatch,
}: Props) {
  const { t } = useTranslation()

  return (
    <div className="space-y-4">
      {fileReviews.map((fr) => {
        const patch = findPatch(allPatches, fr.file)
        const isCollapsed = collapsedFiles.has(fr.file)
        const inlineIssues = new Map<number, typeof fr.issues>()
        const orphanIssues: typeof fr.issues = []
        for (const issue of fr.issues) {
          if (issue.line != null) {
            const arr = inlineIssues.get(issue.line)
            if (arr) arr.push(issue)
            else inlineIssues.set(issue.line, [issue])
          } else {
            orphanIssues.push(issue)
          }
        }

        return (
          <section key={fr.file} id={`file-${fr.file}`} className="border border-gray-700 rounded-lg overflow-hidden scroll-mt-20">
            <button
              onClick={() => onToggle(fr.file)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-800 hover:bg-gray-750 transition-colors text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`text-xs transition-transform ${isCollapsed ? '' : 'rotate-90'}`}>▶</span>
                <span className={`text-sm font-mono truncate ${
                  colorScheme === 'green' ? 'text-green-400' : 'text-blue-400'
                }`}>{fr.file}</span>
                {fr.issues.length > 0 && (
                  <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                    fr.issues.some((i) => i.priority === 'must_fix')
                      ? 'bg-red-700 text-red-100'
                      : fr.issues.some((i) => i.severity === 'high' || i.severity === 'critical')
                        ? 'bg-orange-700 text-orange-100'
                        : 'bg-yellow-700 text-yellow-100'
                  }`}>
                    {t('issues.file.issues_count', { count: fr.issues.length })}
                  </span>
                )}
                {fr.issues.length === 0 && (
                  <span className="px-1.5 py-0.5 rounded text-xs font-bold bg-green-700 text-green-100">{t('issues.file.passed')}</span>
                )}
              </div>
            </button>

            {!isCollapsed && (
              <div className="p-1">
                {patch ? (
                  <DiffViewer
                    filename={patch.filename}
                    language={patch.language}
                    patch={patch.patch}
                    inlineIssues={inlineIssues.size > 0 ? inlineIssues : undefined}
                  />
                ) : (
                  <div className="bg-gray-800 rounded p-4 m-1">
                    <span className={`font-mono text-sm ${
                      colorScheme === 'green' ? 'text-green-400' : 'text-blue-400'
                    }`}>{fr.file}</span>
                    <p className="text-gray-500 text-xs mt-1">{noPatchMessage}</p>
                  </div>
                )}
                {orphanIssues.length > 0 && (
                  <div className="mx-3 mb-2 pl-4 border-l-2 border-gray-700 space-y-2">
                    {orphanIssues.map((issue, i) => (
                      <div key={i} className={`border-l-4 ${sevBg[issue.severity] || sevBg.low} rounded p-3`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-bold text-white ${
                            issue.severity === 'critical' ? 'bg-red-600' :
                            issue.severity === 'high' ? 'bg-orange-600' :
                            issue.severity === 'medium' ? 'bg-yellow-600' : 'bg-gray-600'
                          }`}>
                            {issue.severity.toUpperCase()}
                          </span>
                          <span className="text-xs text-gray-500 bg-gray-700 px-1.5 py-0.5 rounded">
                            {issue.category}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm">{issue.description}</p>
                      </div>
                    ))}
                  </div>
                )}
                {fr.issues.length === 0 && fr.summary && (
                  <p className="text-gray-500 text-sm mx-3 mb-2 pl-4 border-l-2 border-gray-700 py-1">
                    {fr.summary}
                  </p>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
