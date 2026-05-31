export interface Issue {
  severity: 'critical' | 'high' | 'medium' | 'low'
  file: string
  line: number | null
  category: 'bug' | 'security' | 'performance' | 'style'
  description: string
  suggestion: string
  current_code: string
  proposed_code: string
  confidence: number
  priority: 'must_fix' | 'should_fix' | 'nice_to_fix'
}

export interface FileReview {
  file: string
  summary: string
  issues: Issue[]
  suggestions: string[]
}

export interface RewrittenFile {
  filename: string
  language: string
  content: string
  issues_fixed: number
}

export interface UsageMetrics {
  total_time_s: number
  llm_time_s: number
  input_tokens: number
  output_tokens: number
  rate_limit_remaining: number | null
}

export interface ReviewResult {
  owner: string
  repo: string
  pull_number: number
  pr_title: string
  pr_description: string
  pr_merged: boolean
  files_changed: number
  additions: number
  deletions: number
  risk_level: 'high' | 'medium' | 'low'
  summary: string
  file_reviews: FileReview[]
  issues: Issue[]
  suggestions: string[]
  scores: Record<string, number>
  share_token: string
  github_review_id: number | null
  rewritten_files: RewrittenFile[]
  usage: UsageMetrics | null
}

export interface ReviewProgress {
  phase: 'fetching' | 'chunking' | 'reviewing' | 'reviewing_security' | 'reviewing_normal' | 'summarizing'
  current: number
  total: number
  file?: string
  language?: string
  message?: string
}

export interface TrendEntry {
  id: number
  owner: string
  repo: string
  pr_title: string
  pull_number: number
  risk_level: string
  issue_count: number
  suggestion_count: number
  files_changed: number
  additions: number
  deletions: number
  scores: Record<string, number>
  created_at: string
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
  base_url?: string
}

export interface CustomProviderInput {
  name: string
  display_name: string
  base_url: string
  api_key: string
  default_model: string
  timeout?: number
}
