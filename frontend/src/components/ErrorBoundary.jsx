import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('React error boundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, system-ui, sans-serif', background: '#f9fafb' }}>
          <div style={{ textAlign: 'center', maxWidth: 480, padding: 24 }}>
            <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1e3a8a', marginBottom: 8 }}>Something went wrong</h1>
            <p style={{ color: '#6b7280', marginBottom: 16 }}>The application encountered an unexpected error.</p>
            <button
              onClick={() => window.location.reload()}
              style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '10px 24px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 }}
            >
              Reload Page
            </button>
            {this.state.error && (
              <pre style={{ marginTop: 16, padding: 12, background: '#fee2e2', borderRadius: 8, fontSize: 12, color: '#991b1b', textAlign: 'left', overflow: 'auto', maxHeight: 120 }}>
                {this.state.error.message}
              </pre>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
