import React, { Component, ReactNode } from 'react';

export interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode | ((error: Error, errorInfo?: any) => ReactNode);
}

export interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo?: any;
}

export default class ErrorBoundary extends (Component as {
  new (props: ErrorBoundaryProps): {
    props: ErrorBoundaryProps;
    state: ErrorBoundaryState;
    setState(state: Partial<ErrorBoundaryState> | ((prevState: ErrorBoundaryState) => Partial<ErrorBoundaryState>)): void;
    render(): ReactNode;
  };
}) {
  override state: ErrorBoundaryState;

  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    this.setState({ errorInfo });
    console.error('[VariantHandler] Uncaught error in component tree:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error || new Error('Unknown error'), this.state.errorInfo ?? undefined);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage = this.state.error?.message || 'An unexpected error occurred in Variant Handler.';
      const errorDetails = this.state.error?.stack || this.state.error?.toString() || errorMessage;

      return (
        <div
          id="error-boundary-card"
          role="alert"
          aria-live="assertive"
          className="min-h-[200px] w-full flex items-center justify-center p-4 bg-slate-50 text-slate-800 dark:bg-slate-900 dark:text-slate-100 font-sans"
        >
          <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-md dark:border-slate-800 dark:bg-slate-950 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-red-500 font-bold text-sm" aria-hidden="true">⚠</span>
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-100 font-display">
                Something went wrong
              </h2>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {errorMessage}
            </p>

            <button
              type="button"
              id="btn-error-reload"
              onClick={this.handleReload}
              className="w-full py-1.5 px-3 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 transition-all cursor-pointer"
            >
              Reload panel
            </button>

            <details className="text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
              <summary className="cursor-pointer hover:underline select-none font-medium">
                Error details
              </summary>
              <pre className="mt-2 max-h-36 overflow-auto rounded bg-slate-100 p-2 font-mono text-[10px] text-slate-700 dark:bg-slate-900 dark:text-slate-300 whitespace-pre-wrap break-all">
                {errorDetails}
              </pre>
            </details>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export { ErrorBoundary };
