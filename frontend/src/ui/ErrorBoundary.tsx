import { Component, ErrorInfo, ReactNode } from 'react'
import { Button, Result } from 'antd'

interface Props {
  children: ReactNode
  pageName?: string
}
interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', this.props.pageName ?? 'unknown page', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title={`เกิดข้อผิดพลาด${this.props.pageName ? ` ในหน้า ${this.props.pageName}` : ''}`}
          subTitle={this.state.error?.message ?? 'Unknown error occurred'}
          extra={
            <Button type="primary" onClick={() => this.setState({ hasError: false })}>
              ลองใหม่อีกครั้ง
            </Button>
          }
        />
      )
    }
    return this.props.children
  }
}
