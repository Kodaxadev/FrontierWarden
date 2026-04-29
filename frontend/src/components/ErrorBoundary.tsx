import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[FrontierWarden] render failure', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{
          minHeight: '100%',
          background: '#020b12',
          color: '#C8D8E4',
          fontFamily: 'JetBrains Mono, monospace',
          padding: 24,
        }}>
          <div style={{ color: '#F59E0B', fontSize: 12, letterSpacing: '0.12em' }}>
            FRONTIERWARDEN RENDER FAULT
          </div>
          <pre style={{
            marginTop: 16,
            color: '#EF4444',
            whiteSpace: 'pre-wrap',
            fontSize: 12,
          }}>
            {this.state.error.message}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}
