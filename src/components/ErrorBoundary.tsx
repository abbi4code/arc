import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error(error) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-sm font-medium">Something broke.</p>
          <p className="mt-1 font-mono text-xs text-muted">{this.state.error.message}</p>
          <button onClick={() => location.reload()} className="mt-4 rounded-md border border-line px-3 py-1.5 text-xs cursor-pointer hover:bg-panel-2">Reload</button>
        </div>
      </div>
    )
  }
}
