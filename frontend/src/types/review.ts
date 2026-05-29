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

export interface FileInfo {
  filename: string
  language: string
  patch: string
}

export interface ModelInfo {
  provider: string
  model: string
}

export type ReviewPhase = 'idle' | 'loading' | 'progress' | 'streaming' | 'done' | 'error'

export interface ProviderInfo {
  name: string
  display_name: string
  is_builtin: boolean
  is_enabled: boolean
  default_model: string
  models: string[]
  needs_config: boolean
}

export interface CustomProviderInput {
  name: string
  display_name: string
  base_url: string
  api_key: string
  default_model: string
  timeout?: number
}
