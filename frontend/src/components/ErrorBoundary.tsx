import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { t } from '@/i18n';

interface Props {
  children: ReactNode;
  /** Remounts the boundary when it changes — e.g. the pathname, so navigating away clears a crash. */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches a render crash in the routed page and shows a recoverable message
 * instead of a blank screen. Scoped inside the shell on purpose: the nav stays
 * usable, so a broken page never strands you.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Nothing swallows this — the stack still reaches the console for triage.
    console.error('Page crashed:', error, info.componentStack);
  }

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="grid flex-1 place-items-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold tracking-tight">{t('error.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('error.body')}</p>
          <p className="mt-3 break-words rounded-md bg-muted px-3 py-2 text-left font-mono text-xs text-muted-foreground">
            {error.message}
          </p>
          <Button className="mt-4" onClick={() => this.setState({ error: null })}>
            {t('common.retry')}
          </Button>
        </div>
      </div>
    );
  }
}
