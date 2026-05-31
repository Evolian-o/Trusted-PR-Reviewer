import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { withTranslation, WithTranslation } from 'react-i18next'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundary extends Component<Props & WithTranslation, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error.message, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
          <div className="text-center max-w-md mx-4 p-8 bg-gray-900 rounded-xl border border-gray-800">
            <h2 className="text-xl font-semibold text-white mb-3">{this.props.t('common.error_boundary_title')}</h2>
            <p className="text-gray-400 text-sm mb-6">
              {this.state.error?.message || this.props.t('common.error_boundary_unknown')}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false, error: null })
                window.location.reload()
              }}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
            >
              {this.props.t('common.error_boundary_refresh')}
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export default withTranslation()(ErrorBoundary)
