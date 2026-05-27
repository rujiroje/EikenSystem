import { useState } from 'react'
import { apiUrl } from '../api'
import { Card, Form, Input, Button, Typography, Alert } from 'antd'

type LoginResult = { token: string; user: { username: string; roles: string[] } }

export function Login({ onLoggedIn }: { onLoggedIn: (u: { username: string; roles: string[]; token: string }) => void }) {
  const [username, setUsername] = useState('operator')
  const [password, setPassword] = useState('op123')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setError(null)
    const r = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (r.ok) {
      const data: LoginResult = await r.json()
      localStorage.setItem('token', data.token)
      // เคลียร์สถานะการล็อก/การเลือกกล่องเดิมทุกครั้งที่ล็อกอินใหม่ (บังคับให้กรอก Product/Scale/Lot ทุกครั้ง)
      for (const k of Object.keys(localStorage)) {
        if (k.startsWith('op.lock.') || k.startsWith('op.product.') || k.startsWith('op.scale.') || k.startsWith('op.lot.')) {
          localStorage.removeItem(k)
        }
      }
      onLoggedIn({ username: data.user.username, roles: data.user.roles as any, token: data.token })
    } else {
      setError('เข้าสู่ระบบไม่สำเร็จ')
    }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', marginTop: 48 }}>
      <Card title={<Typography.Title level={4} style={{ margin: 0 }}>เข้าสู่ระบบ</Typography.Title>} style={{ width: 420 }}>
        {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}
        <Form layout="vertical" onFinish={submit}>
          <Form.Item label="Username" required>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </Form.Item>
          <Form.Item label="Password" required>
            <Input.Password value={password} onChange={(e) => setPassword(e.target.value)} />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block>Login</Button>
          </Form.Item>
        </Form>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          ตัวอย่าง: operator/op123, qa/qa123, leader/ld123, dataadmin/da123
        </Typography.Paragraph>
      </Card>
    </div>
  )
}
