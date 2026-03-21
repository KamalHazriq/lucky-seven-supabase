import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { logClientError } from '../lib/errorLogger'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  errorMessage: string | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message || 'Unexpected error' }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logClientError(error, `ErrorBoundary${info.componentStack ? ` @ ${info.componentStack.slice(0, 300)}` : ''}`)
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, errorMessage: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6">
          <div className="text-center max-w-sm space-y-4 rounded-2xl border border-border-subtle bg-surface-panel/80 backdrop-blur-sm p-6 shadow-xl">
            <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
            <p className="text-muted-foreground text-sm">
              The app hit an unexpected error. You can try recovering in place, reload the page, or head back home.
            </p>
            {this.state.errorMessage && (
              <p className="text-xs text-muted-foreground/80 rounded-xl bg-background/50 px-3 py-2">
                {this.state.errorMessage}
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button
                onClick={this.handleTryAgain}
                className="px-6 py-2.5 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-opacity"
              >
                Try Again
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-6 py-2.5 rounded-xl font-medium border border-border-subtle hover:bg-surface-overlay transition-colors"
              >
                Reload Page
              </button>
              <button
                onClick={() => window.location.assign('/')}
                className="px-6 py-2.5 rounded-xl font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
