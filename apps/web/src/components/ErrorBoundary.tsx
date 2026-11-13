import { Button } from '@dcos/ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** What failed, in the user's words: "this document", "this page". */
  what: string;
  children: ReactNode;
}

/**
 * Contains a crash to the part of the screen that failed and says so, instead of blanking the whole app.
 * Saved work is not affected: nothing is written while a component is failing.
 */
export class ErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[Classroom OS] ${this.props.what} failed to display`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto flex max-w-md flex-col items-center gap-3 px-6 py-16 text-center">
        <h2 className="text-lg font-semibold">Something went wrong showing {this.props.what}</h2>
        <p className="text-sm text-muted">Your saved work is safe on this device. Reloading usually fixes this.</p>
        <p className="break-all font-mono text-xs text-muted">{this.state.error.message}</p>
        <div className="flex gap-2">
          <Button variant="primary" onClick={() => location.reload()}>
            Reload
          </Button>
          <Button onClick={() => (location.hash = '#/')}>Go to Dashboard</Button>
        </div>
      </div>
    );
  }
}
