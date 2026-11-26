import { Component, type ReactNode } from 'react'

/**
 * Fängt Fehler in einem Teilbereich ab (z. B. der Infocard), damit nicht die ganze App ausfällt.
 * onError darf den Bereich schließen; danach wird beim nächsten Öffnen neu gerendert.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; onError?: () => void; resetKey?: unknown }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('[Lurk] Bereich abgestürzt:', error)
    this.props.onError?.()
  }

  componentDidUpdate(prev: { resetKey?: unknown }): void {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}
