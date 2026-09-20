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
    console.error('Unhandled UI error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, maxWidth: 640, margin: '40px auto' }}>
          <div className="error-box">
            <strong>Algo deu errado ao renderizar esta tela.</strong>
            <br />
            {this.state.error.message}
          </div>
          <button onClick={() => this.setState({ error: null })}>Tentar de novo</button>
        </div>
      );
    }
    return this.props.children;
  }
}
