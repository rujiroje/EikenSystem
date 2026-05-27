import { useState } from 'react'
import { Card, Form, Input, Button, message, Divider, Typography } from 'antd'
import { UserOutlined, LockOutlined, ScanOutlined, MobileOutlined } from '@ant-design/icons'
import { apiUrl } from '../api'

// ── WebAuthn utility functions ────────────────────────────────────────────────

function b64urlToBuffer(b64url: string): ArrayBuffer {
  const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(base64.length + (4 - (base64.length % 4)) % 4, '=')
  const binary = atob(padded)
  const buf = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i)
  return buf.buffer
}

function bufferToB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let binary = ''
  bytes.forEach(b => { binary += String.fromCharCode(b) })
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function parseCreationOptions(json: string): PublicKeyCredentialCreationOptions {
  const o = JSON.parse(json)
  o.challenge = b64urlToBuffer(o.challenge)
  o.user.id = b64urlToBuffer(o.user.id)
  if (o.excludeCredentials) {
    o.excludeCredentials = o.excludeCredentials.map((c: any) => ({ ...c, id: b64urlToBuffer(c.id) }))
  }
  return o
}

function parseRequestOptions(json: string): PublicKeyCredentialRequestOptions {
  const o = JSON.parse(json)
  o.challenge = b64urlToBuffer(o.challenge)
  if (o.allowCredentials) {
    o.allowCredentials = o.allowCredentials.map((c: any) => ({ ...c, id: b64urlToBuffer(c.id) }))
  }
  return o
}

function encodeAssertionCredential(cred: PublicKeyCredential): string {
  const resp = cred.response as AuthenticatorAssertionResponse
  return JSON.stringify({
    id: cred.id,
    rawId: bufferToB64url(cred.rawId),
    type: cred.type,
    response: {
      authenticatorData: bufferToB64url(resp.authenticatorData),
      clientDataJSON: bufferToB64url(resp.clientDataJSON),
      signature: bufferToB64url(resp.signature),
      userHandle: resp.userHandle ? bufferToB64url(resp.userHandle) : null,
    },
  })
}

const webAuthnSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential

// ── Component ─────────────────────────────────────────────────────────────────

export function LoginWithKiosk({ onLoggedIn }: { onLoggedIn: (user: any) => void }) {
  const [loading, setLoading] = useState(false)

  const handleLogin = async (values: any) => {
    setLoading(true)
    try {
      const r = await fetch(apiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
      if (r.ok) {
        const data = await r.json()
        localStorage.setItem('token', data.token)
        onLoggedIn({ ...data.user, token: data.token })
        message.success('เข้าสู่ระบบสำเร็จ')
      } else {
        message.error('ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง')
      }
    } catch { message.error('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์') }
    finally { setLoading(false) }
  }

  // ── KiosBioAgent login (PC + DigitalPersona reader) ───────────────────────
  const handleKioskLogin = async () => {
    setLoading(true)
    try {
      const usersRes = await fetch(apiUrl('/api/auth/fingerprint-users'))
      if (!usersRes.ok) throw new Error('Failed to load users')
      const users = await usersRes.json()
      if (!users || users.length === 0) throw new Error('No fingerprint users found')

      message.loading({ content: 'กำลังรอการสแกนนิ้วมือ...', key: 'fp' })

      const agentRes = await fetch('https://localhost:5001/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: 'login-' + Date.now(), candidates: users }),
      }).catch(() => { throw new Error('CONNECTION_REFUSED') })

      if (!agentRes.ok) {
        const err = await agentRes.json().catch(() => ({}))
        throw new Error(err.error || 'Scan failed')
      }
      const agentResult = await agentRes.json()
      if (!agentResult.ok || !agentResult.matchId) throw new Error('Fingerprint not recognized')

      message.success({ content: `พบผู้ใช้: ${agentResult.matchId}`, key: 'fp' })

      const challengeRes = await fetch(apiUrl('/api/auth/biometric-challenge'))
      if (!challengeRes.ok) throw new Error('ไม่สามารถขอ challenge ได้')
      const { nonce } = await challengeRes.json()

      const loginRes = await fetch(apiUrl('/api/auth/login-biometric-verified'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: agentResult.matchId, nonce }),
      })
      if (!loginRes.ok) throw new Error('Login failed')
      const loginData = await loginRes.json()
      localStorage.setItem('token', loginData.token)
      onLoggedIn({ ...loginData.user, token: loginData.token })
      message.success(`ยินดีต้อนรับ ${loginData.user.username}`)
    } catch (e: any) {
      if (e.message === 'CONNECTION_REFUSED') {
        message.error({ content: 'ไม่พบเครื่องสแกน — ตรวจสอบว่า KiosBioAgent กำลังทำงานอยู่', key: 'fp' })
      } else {
        message.error({ content: e.message || 'Login failed', key: 'fp' })
      }
    } finally { setLoading(false) }
  }

  // ── WebAuthn login (Android Tablet — built-in fingerprint sensor) ──────────
  const handleWebAuthnLogin = async () => {
    setLoading(true)
    message.loading({ content: 'กำลังรอการยืนยันตัวตน...', key: 'wa' })
    try {
      // 1. ขอ challenge จาก server (discoverable — ไม่ต้องระบุ username)
      const beginRes = await fetch(apiUrl('/api/auth/webauthn/login/begin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!beginRes.ok) throw new Error('ไม่สามารถเริ่มการยืนยันตัวตนได้')
      const { requestId, options } = await beginRes.json()

      // 2. เรียก WebAuthn API — browser แสดง biometric prompt
      const credential = await navigator.credentials.get({
        publicKey: parseRequestOptions(options),
      }) as PublicKeyCredential | null
      if (!credential) throw new Error('ยกเลิกการสแกนนิ้ว')

      // 3. ส่งผลการยืนยันตัวตนไป server
      const finishRes = await fetch(apiUrl('/api/auth/webauthn/login/finish'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, credential: encodeAssertionCredential(credential) }),
      })
      if (!finishRes.ok) {
        const err = await finishRes.json().catch(() => ({}))
        throw new Error(err.error || 'ยืนยันตัวตนไม่สำเร็จ')
      }
      const data = await finishRes.json()
      localStorage.setItem('token', data.token)
      onLoggedIn({ ...data.user, token: data.token })
      message.success({ content: `ยินดีต้อนรับ ${data.user.username}`, key: 'wa' })
    } catch (e: any) {
      if (e.name === 'NotAllowedError') {
        message.error({ content: 'ยกเลิกการสแกนนิ้วมือ', key: 'wa' })
      } else {
        message.error({ content: e.message || 'Login failed', key: 'wa' })
      }
    } finally { setLoading(false) }
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#f0f2f5' }}>
      <Card title="Eikensystem Login" style={{ width: 360 }} extra={<Typography.Text type="secondary">v2.0</Typography.Text>}>
        <Form onFinish={handleLogin}>
          <Form.Item name="username" rules={[{ required: true, message: 'กรุณากรอก Username' }]}>
            <Input prefix={<UserOutlined />} placeholder="Username" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: 'กรุณากรอก Password' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" block loading={loading}>เข้าสู่ระบบ</Button>
          </Form.Item>
        </Form>

        <Divider plain>หรือสแกนนิ้วมือ</Divider>

        <Button
          block
          icon={<ScanOutlined />}
          onClick={handleKioskLogin}
          loading={loading}
          style={{ height: 44, marginBottom: 8 }}
        >
          สแกนนิ้ว — เครื่อง PC (KiosBioAgent)
        </Button>

        {webAuthnSupported && (
          <Button
            block
            icon={<MobileOutlined />}
            onClick={handleWebAuthnLogin}
            loading={loading}
            style={{ height: 44 }}
            type="dashed"
          >
            สแกนนิ้ว — Tablet (อุปกรณ์นี้)
          </Button>
        )}
      </Card>
    </div>
  )
}
