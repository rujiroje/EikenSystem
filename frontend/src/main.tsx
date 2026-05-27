import * as React from 'react'
import { Component, ReactNode } from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './ui/App'
import 'antd/dist/reset.css'
import './global.css'
import { ConfigProvider, theme } from 'antd'

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  constructor(props: { children: ReactNode }) {
    super(props)
    this.state = { error: undefined }
  }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, errorInfo: unknown) {
    console.error('UI error:', error, errorInfo)
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
          <h2>เกิดข้อผิดพลาดในหน้าเว็บ</h2>
          <p style={{ color: '#c00' }}>{String(this.state.error.message || this.state.error)}</p>
          <button onClick={() => this.setState({ error: undefined })}>ลองโหลดใหม่</button>
        </div>
      )
    }
    return this.props.children
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
        <App />
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
