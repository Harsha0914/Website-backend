import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          background: '#0f172a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'monospace',
          padding: '2rem',
        }}>
          <div style={{
            background: '#1e293b',
            border: '1px solid #ef4444',
            borderRadius: '12px',
            padding: '2rem',
            maxWidth: '800px',
            width: '100%',
          }}>
            <h1 style={{ color: '#ef4444', fontSize: '1.25rem', marginBottom: '1rem' }}>
              ⚠️ React Error — App Crashed
            </h1>
            <pre style={{
              color: '#fca5a5',
              fontSize: '0.8rem',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              marginBottom: '1rem',
            }}>
              {this.state.error?.toString()}
            </pre>
            {this.state.info && (
              <details>
                <summary style={{ color: '#94a3b8', cursor: 'pointer', marginBottom: '0.5rem' }}>
                  Component Stack
                </summary>
                <pre style={{ color: '#64748b', fontSize: '0.75rem', whiteSpace: 'pre-wrap' }}>
                  {this.state.info.componentStack}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '1rem',
                padding: '0.5rem 1.5rem',
                background: '#a78bfa',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
