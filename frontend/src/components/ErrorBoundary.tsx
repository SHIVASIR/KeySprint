import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'An unexpected UI error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto my-16 max-w-lg rounded-lg border border-ks-border bg-ks-card p-6 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-ks-error" />
          <h1 className="text-lg font-semibold text-ks-text">Something went wrong</h1>
          <p className="mt-2 text-sm text-ks-muted">{this.state.message}</p>
          <button
            type="button"
            onClick={() => window.location.assign('/')}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-ks-accent px-4 py-2 text-sm font-semibold text-ks-accent-fg hover:opacity-90"
          >
            <RotateCcw className="h-4 w-4" />
            Return to Home
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
