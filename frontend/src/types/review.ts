export interface Issue {
  severity: 'critical' | 'high' | 'medium' | 'low'
  file: string
  line: number | null
  category: 'bug' | 'security' | 'performance' | 'style'
  description: string
  suggestion: string
}

export interface FileReview {
  file: string
  summary: string
  issues: Issue[]
  suggestions: string[]
}

export interface ReviewResult {
  owner: string
  repo: string
  pull_number: number
  pr_title: string
  files_changed: number
  additions: number
  deletions: number
  risk_level: 'high' | 'medium' | 'low'
  summary: string
  file_reviews: FileReview[]
  issues: Issue[]
  suggestions: string[]
}

export interface ReviewProgress {
  phase: 'fetching' | 'reviewing'
  current: number
  total: number
  file?: string
  language?: string
  message?: string
}

export type ReviewPhase = 'idle' | 'loading' | 'progress' | 'streaming' | 'done' | 'error'
