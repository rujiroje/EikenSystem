import { useCallback, useEffect, useMemo, useState } from 'react'
import { MeasurementEntry } from './MeasurementEntry'
import { LoginWithKiosk as Login } from './LoginWithKiosk'
import { AdminData } from './AdminData'
import { Layout, Menu, Button, Typography, Space, Tag, Badge, Modal, notification, Form, Input, Tabs, Alert, Spin } from 'antd'
import { DashboardOutlined, DeploymentUnitOutlined, LogoutOutlined, SettingOutlined, WechatWorkOutlined, OrderedListOutlined, SyncOutlined, FileTextOutlined, KeyOutlined, ScanOutlined, CheckCircleOutlined, WarningOutlined, MobileOutlined } from '@ant-design/icons'
import { QADashboard } from './QADashboard'
import { LeaderDashboard } from './LeaderDashboard'
import { WorkOrderManagement } from './WorkOrderManagement'
import { SortingPage } from './SortingPage'
import { WOReportPage } from './WOReportPage'
import { ErrorBoundary } from './ErrorBoundary'
import { apiUrl } from '../api'

function decodeJwt(token: string): { exp?: number } | null {
  try { return JSON.parse(atob(token.split('.')[1])) } catch { return null }
}
function fmtCountdown(secs: number): string {
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function App() {
  const [user, setUser] = useState<{ username: string; roles: string[]; token: string } | null>(null)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return
    fetch(apiUrl('/api/auth/me'), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((me) => {
        if (me && me.username) setUser({ username: me.username, roles: me.roles || [], token })
      })
      .catch(() => setUser(null))
  }, [])

  const { Header, Content, Footer } = Layout
  const [active, setActive] = useState<string>('home')
  const [leaderPending, setLeaderPending] = useState<number>(0)
  const [qaCounts, setQaCounts] = useState<{readyForApplyCount:number;outerInspectionCount:number;redEventsCount:number;total:number}>({readyForApplyCount:0,outerInspectionCount:0,redEventsCount:0,total:0})
  const qaTotal = qaCounts.total

  // ─── Account management modal ─────────────────────────────────────────────
  const [acctOpen, setAcctOpen] = useState(false)
  const [acctTab, setAcctTab] = useState('fingerprint')

  // Password tab
  const [pwLoading, setPwLoading] = useState(false)
  const [pwForm] = Form.useForm()

  const submitPwChange = async () => {
    const vals = await pwForm.validateFields()
    if (vals.newPassword !== vals.confirmPassword) {
      pwForm.setFields([{ name: 'confirmPassword', errors: ['รหัสผ่านใหม่ไม่ตรงกัน'] }])
      return
    }
    setPwLoading(true)
    try {
      const r = await fetch(apiUrl('/api/auth/password'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: JSON.stringify({ oldPassword: vals.oldPassword, newPassword: vals.newPassword, confirmPassword: vals.confirmPassword }),
      })
      const data = await r.json()
      if (!r.ok) { notification.error({ message: data.error ?? 'เกิดข้อผิดพลาด' }); return }
      notification.success({ message: 'เปลี่ยนรหัสผ่านสำเร็จ' })
      setAcctOpen(false)
      pwForm.resetFields()
    } finally { setPwLoading(false) }
  }

  // Fingerprint tab — PC (KiosBioAgent)
  const [fpDeviceOk, setFpDeviceOk] = useState<boolean | null>(null)
  const [fpEnrolling, setFpEnrolling] = useState(false)
  const [fpStatus, setFpStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [fpMessage, setFpMessage] = useState('')

  const checkFpDevice = useCallback(async () => {
    try {
      const r = await fetch('https://localhost:5001/health')
      setFpDeviceOk(r.ok)
    } catch {
      setFpDeviceOk(false)
    }
  }, [])

  useEffect(() => {
    if (acctOpen && acctTab === 'fingerprint') checkFpDevice()
  }, [acctOpen, acctTab, checkFpDevice])

  const enrollFingerprint = async () => {
    setFpEnrolling(true)
    setFpStatus('idle')
    setFpMessage('')
    try {
      const agentRes = await fetch('https://localhost:5001/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: 'enroll-' + Date.now() }),
      })
      if (!agentRes.ok) { setFpStatus('error'); setFpMessage('เครื่องอ่านลายนิ้วมือไม่ตอบสนอง'); return }
      const agentData = await agentRes.json()
      if (!agentData.ok || !agentData.signedData) { setFpStatus('error'); setFpMessage('ไม่สามารถอ่านลายนิ้วมือได้ กรุณาลองใหม่'); return }
      const backendRes = await fetch(apiUrl('/api/auth/register-fingerprint'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
        body: JSON.stringify({ template: agentData.signedData }),
      })
      const backendData = await backendRes.json()
      if (!backendRes.ok) { setFpStatus('error'); setFpMessage(backendData.error ?? 'บันทึกลายนิ้วมือไม่สำเร็จ'); return }
      setFpStatus('success')
      setFpMessage('ลงทะเบียนลายนิ้วมือ (PC) สำเร็จแล้ว')
    } catch {
      setFpStatus('error')
      setFpMessage('ไม่สามารถเชื่อมต่อกับเครื่องอ่านลายนิ้วมือ — ตรวจสอบว่า KiosBioAgent กำลังทำงานอยู่')
    } finally {
      setFpEnrolling(false)
    }
  }

  // Fingerprint tab — Tablet (WebAuthn)
  const webAuthnSupported = typeof window !== 'undefined' && !!window.PublicKeyCredential
  const [waEnrolling, setWaEnrolling] = useState(false)
  const [waStatus, setWaStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [waMessage, setWaMessage] = useState('')

  const enrollWebAuthn = async () => {
    setWaEnrolling(true)
    setWaStatus('idle')
    setWaMessage('')
    try {
      const token = localStorage.getItem('token') || ''
      // 1. ขอ registration options จาก server
      const beginRes = await fetch(apiUrl('/api/auth/webauthn/register/begin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      })
      if (!beginRes.ok) throw new Error('ไม่สามารถเริ่มการลงทะเบียนได้')
      const { requestId, options } = await beginRes.json()

      // 2. แปลง options และเรียก WebAuthn API
      const parsed = JSON.parse(options)
      const b64urlToBuffer = (s: string) => {
        const b = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + (4 - s.length % 4) % 4, '='))
        const buf = new Uint8Array(b.length)
        for (let i = 0; i < b.length; i++) buf[i] = b.charCodeAt(i)
        return buf.buffer
      }
      parsed.challenge = b64urlToBuffer(parsed.challenge)
      parsed.user.id = b64urlToBuffer(parsed.user.id)
      if (parsed.excludeCredentials) {
        parsed.excludeCredentials = parsed.excludeCredentials.map((c: any) => ({ ...c, id: b64urlToBuffer(c.id) }))
      }
      const credential = await navigator.credentials.create({ publicKey: parsed }) as PublicKeyCredential | null
      if (!credential) throw new Error('ยกเลิกการลงทะเบียน')

      // 3. เข้ารหัสและส่งกลับ server
      const resp = credential.response as AuthenticatorAttestationResponse
      const toB64url = (buf: ArrayBuffer) => {
        const bytes = new Uint8Array(buf)
        let binary = ''; bytes.forEach(b => { binary += String.fromCharCode(b) })
        return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
      }
      const credJson = JSON.stringify({
        id: credential.id, rawId: toB64url(credential.rawId), type: credential.type,
        response: { attestationObject: toB64url(resp.attestationObject), clientDataJSON: toB64url(resp.clientDataJSON) },
      })
      const finishRes = await fetch(apiUrl('/api/auth/webauthn/register/finish'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requestId, credential: credJson }),
      })
      if (!finishRes.ok) {
        const err = await finishRes.json().catch(() => ({}))
        throw new Error(err.error ?? 'ลงทะเบียนไม่สำเร็จ')
      }
      setWaStatus('success')
      setWaMessage('ลงทะเบียนลายนิ้วมือ Tablet สำเร็จแล้ว')
    } catch (e: any) {
      setWaStatus('error')
      setWaMessage(e.name === 'NotAllowedError' ? 'ยกเลิกการสแกนนิ้วมือ' : (e.message || 'เกิดข้อผิดพลาด'))
    } finally { setWaEnrolling(false) }
  }

  // ─── Token expiry warning ────────────────────────────────────────────────
  const doLogout = useCallback(() => {
    localStorage.removeItem('token')
    setUser(null)
    notification.destroy('session-warn')
  }, [])

  const refreshToken = useCallback(async () => {
    try {
      const token = localStorage.getItem('token') || ''
      const r = await fetch(apiUrl('/api/auth/refresh'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!r.ok) throw new Error('failed')
      const data = await r.json()
      localStorage.setItem('token', data.token)
      setUser(u => u ? { ...u, token: data.token } : null)
      notification.destroy('session-warn')
      notification.success({ message: 'ต่อ Session สำเร็จ', duration: 3 })
    } catch {
      notification.error({ message: 'ไม่สามารถต่อ Session ได้', description: 'กรุณาเข้าสู่ระบบใหม่', duration: 5 })
    }
  }, [])

  useEffect(() => {
    if (!user) {
      notification.destroy('session-warn')
      return
    }
    const payload = decodeJwt(user.token)
    if (!payload?.exp) return
    const expMs = payload.exp * 1000

    const check = () => {
      const left = Math.floor((expMs - Date.now()) / 1000)
      if (left <= 0) {
        doLogout()
        Modal.warning({
          title: 'Session หมดอายุ',
          content: 'Session ของคุณหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่อีกครั้ง',
          okText: 'รับทราบ',
        })
        return
      }
      if (left <= 300) {
        notification.warning({
          key: 'session-warn',
          message: 'Session กำลังจะหมดอายุ',
          description: `เหลืออีก ${fmtCountdown(left)} — คลิก "ต่อ Session" เพื่อขยายเวลา`,
          duration: 0,
          btn: (
            <Button size="small" type="primary" onClick={refreshToken}>
              ต่อ Session
            </Button>
          ),
        })
      }
    }

    check()
    const t = setInterval(check, 10000)
    return () => { clearInterval(t); notification.destroy('session-warn') }
  }, [user, doLogout, refreshToken])

  // ─── Menu items ───────────────────────────────────────────────────────────
  const menuItems = useMemo(() => {
    const items: any[] = []
    if (user?.roles?.includes('OPERATOR')) items.push({ key: 'weigh', icon: <DeploymentUnitOutlined />, label: 'ชั่งน้ำหนัก' })
    if (user?.roles?.includes('OPERATOR')) items.push({ key: 'sorting', icon: <SyncOutlined />, label: 'Sorting' })
    if (user?.roles?.includes('QA')) items.push({ key: 'qa', icon: <DashboardOutlined />, label: (
      <span>QA Dashboard{qaTotal>0 && <Badge count={qaTotal} style={{ marginLeft: 8, backgroundColor: '#d4380d' }} />}</span>
    ) })
    if (user?.roles?.includes('LEADER')) items.push({ key: 'leader', icon: <DashboardOutlined />, label: (
      <span>Leader{leaderPending>0 && <Badge count={leaderPending} style={{ marginLeft: 8 }} />}</span>
    ) })
    if (user?.roles?.includes('LEADER')) items.push({ key: 'wo', icon: <OrderedListOutlined />, label: 'Work Order' })
    if (user?.roles?.includes('LEADER') || user?.roles?.includes('QA')) items.push({ key: 'report', icon: <FileTextOutlined />, label: 'รายงาน WO' })
    if (user?.roles?.includes('DATA_ADMIN') || user?.roles?.includes('ADMIN')) items.push({ key: 'admin', icon: <SettingOutlined />, label: 'Admin: Master Data' })
    return items
  }, [user, leaderPending, qaTotal])

  // Default active to the first available item after login
  useEffect(() => {
    if (!user) return
    const keys = menuItems.map((m: any) => m.key)
    if (keys.length > 0 && !keys.includes(active)) {
      setActive(keys[0])
    }
  }, [user, menuItems])

  // Leader pending approvals polling
  useEffect(() => {
    if (!user?.roles?.includes('LEADER')) return
    const fetchCount = async () => {
      try {
        const r = await fetch(apiUrl('/api/approvals/leader-pending/count?withPayloadOnly=true'), { headers: { Authorization: `Bearer ${localStorage.getItem('token')||''}` } })
        if (!r.ok) return
        let data = await r.json()
        if (!data || data.count === 0) {
          const r2 = await fetch(apiUrl('/api/approvals/leader-pending/count?withPayloadOnly=false'), { headers: { Authorization: `Bearer ${localStorage.getItem('token')||''}` } })
          if (r2.ok) data = await r2.json()
        }
        setLeaderPending(data?.count ?? 0)
      } catch {}
    }
    fetchCount()
    const t = setInterval(fetchCount, 20000)
    return () => clearInterval(t)
  }, [user])

  useEffect(() => {
    if (!user?.roles?.includes('QA')) return
    const fetchQa = async () => {
      try {
        const token = localStorage.getItem('token')||''
        const r = await fetch(apiUrl('/api/approvals/qa-pending-count'), { headers: { Authorization: `Bearer ${token}` } })
        if (!r.ok) return
        const data = await r.json()
        setQaCounts({
          readyForApplyCount: data.readyForApplyCount||0,
          outerInspectionCount: data.outerInspectionCount||0,
          redEventsCount: data.redEventsCount||0,
          total: data.total||0
        })
      } catch {}
    }
    fetchQa()
    const t = setInterval(fetchQa, 15000)
    return () => clearInterval(t)
  }, [user])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Space align="center">
          <WechatWorkOutlined style={{ color: '#fff', fontSize: 18 }} />
          <Typography.Title level={4} style={{ color: '#fff', margin: 0 }}>Eikensystem</Typography.Title>
        </Space>
        <Space>
          {user && (
            <>
              <Tag color="blue">{user.username}</Tag>
              <Button type="text" icon={<KeyOutlined />} onClick={() => { setAcctOpen(true); setAcctTab('fingerprint'); setFpStatus('idle'); setFpMessage('') }} style={{ color: '#fff' }} title="จัดการบัญชี" />
              <Button type="text" icon={<LogoutOutlined />} onClick={doLogout} style={{ color: '#fff' }}>Logout</Button>
            </>
          )}
        </Space>
      </Header>
      <Content style={{ padding: 16 }}>
        <ErrorBoundary>
          {!user ? (
            <Login onLoggedIn={setUser} />
          ) : (
            <div style={{ display: 'grid', gap: 16 }}>
              {menuItems.length > 0 && (
                <Menu mode="horizontal" selectedKeys={[active]} onClick={(e) => setActive(e.key)} items={menuItems} />
              )}
              {user.roles?.includes('OPERATOR') && (active === 'weigh' || (menuItems.length === 1 && !user.roles?.includes('LEADER'))) && (
                <ErrorBoundary pageName="ชั่งน้ำหนัก">
                  <MeasurementEntry currentUser={{ username: user.username, role: 'OPERATOR', token: user.token }} />
                </ErrorBoundary>
              )}
              {user.roles?.includes('OPERATOR') && active === 'sorting' && (
                <ErrorBoundary pageName="Sorting">
                  <SortingPage token={user.token} username={user.username} />
                </ErrorBoundary>
              )}
              {user.roles?.includes('QA') && active === 'qa' && (
                <ErrorBoundary pageName="QA Dashboard">
                  <QADashboard token={user.token} username={user.username} />
                </ErrorBoundary>
              )}
              {user.roles?.includes('LEADER') && active === 'leader' && (
                <ErrorBoundary pageName="Leader Dashboard">
                  <LeaderDashboard token={user.token} username={user.username} onHandled={() => setLeaderPending(c => Math.max(0, c-1))} />
                </ErrorBoundary>
              )}
              {user.roles?.includes('LEADER') && active === 'wo' && (
                <ErrorBoundary pageName="Work Order">
                  <WorkOrderManagement token={user.token} />
                </ErrorBoundary>
              )}
              {(user.roles?.includes('LEADER') || user.roles?.includes('QA')) && active === 'report' && (
                <ErrorBoundary pageName="รายงาน WO">
                  <WOReportPage token={user.token} />
                </ErrorBoundary>
              )}
              {(user.roles?.includes('DATA_ADMIN') || user.roles?.includes('ADMIN')) && active === 'admin' && (
                <ErrorBoundary pageName="Admin">
                  <AdminData token={user.token} />
                </ErrorBoundary>
              )}
            </div>
          )}
        </ErrorBoundary>
      </Content>
      <Footer style={{ textAlign: 'center', color: '#999' }}>© {new Date().getFullYear()} Eikensystem v2.0</Footer>

      <Modal
        title={<span><KeyOutlined style={{ marginRight: 8 }} />จัดการบัญชี</span>}
        open={acctOpen}
        onCancel={() => { setAcctOpen(false); pwForm.resetFields(); setFpStatus('idle'); setFpMessage('') }}
        footer={acctTab === 'password' ? undefined : null}
        onOk={acctTab === 'password' ? submitPwChange : undefined}
        confirmLoading={acctTab === 'password' ? pwLoading : false}
        okText="บันทึก"
        cancelText="ยกเลิก"
        destroyOnClose
        width={480}
      >
        <Tabs activeKey={acctTab} onChange={k => { setAcctTab(k); setFpStatus('idle'); setFpMessage('') }} items={[
          {
            key: 'fingerprint',
            label: <span><ScanOutlined />ลายนิ้วมือ</span>,
            children: (
              <div style={{ padding: '8px 0' }}>
                {/* ── PC: KiosBioAgent ─────────────────────────────── */}
                <div style={{ background: '#fafafa', border: '1px solid #f0f0f0', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, marginBottom: 8 }}><ScanOutlined /> เครื่อง PC (DigitalPersona Reader)</div>
                  <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: '#888' }}>สถานะเครื่องอ่าน:</span>
                    {fpDeviceOk === null ? <Spin size="small" /> :
                      fpDeviceOk
                        ? <span style={{ color: '#52c41a', fontSize: 12 }}><CheckCircleOutlined /> พร้อมใช้งาน</span>
                        : <span style={{ color: '#ff4d4f', fontSize: 12 }}><WarningOutlined /> ไม่พบเครื่องอ่าน</span>}
                    <Button size="small" onClick={checkFpDevice}>ตรวจสอบ</Button>
                  </div>
                  <Button type="primary" icon={<ScanOutlined />} loading={fpEnrolling} disabled={!fpDeviceOk} onClick={enrollFingerprint} block>
                    {fpEnrolling ? 'กำลังสแกนลายนิ้วมือ...' : 'วางนิ้วเพื่อลงทะเบียนใหม่ (PC)'}
                  </Button>
                  {fpStatus !== 'idle' && <Alert style={{ marginTop: 8 }} type={fpStatus === 'success' ? 'success' : 'error'} message={fpMessage} showIcon />}
                </div>

                {/* ── Tablet: WebAuthn ──────────────────────────────── */}
                {webAuthnSupported && (
                  <div style={{ background: '#f6ffed', border: '1px solid #b7eb8f', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8 }}><MobileOutlined /> Tablet (อุปกรณ์นี้)</div>
                    <p style={{ color: '#666', fontSize: 12, marginBottom: 8 }}>ใช้ fingerprint sensor ที่ฝังในตัว tablet — ลายนิ้วไม่ออกจากอุปกรณ์</p>
                    <Button type="primary" icon={<MobileOutlined />} loading={waEnrolling} onClick={enrollWebAuthn} block style={{ background: '#52c41a', borderColor: '#52c41a' }}>
                      {waEnrolling ? 'กำลังลงทะเบียน...' : 'ลงทะเบียนนิ้วมือ Tablet (อุปกรณ์นี้)'}
                    </Button>
                    {waStatus !== 'idle' && <Alert style={{ marginTop: 8 }} type={waStatus === 'success' ? 'success' : 'error'} message={waMessage} showIcon />}
                  </div>
                )}
              </div>
            ),
          },
          {
            key: 'password',
            label: <span><KeyOutlined />รหัสผ่าน</span>,
            children: (
              <Form form={pwForm} layout="vertical" style={{ marginTop: 8 }}>
                <Form.Item name="oldPassword" label="รหัสผ่านเดิม" rules={[{ required: true, message: 'กรุณากรอกรหัสผ่านเดิม' }]}>
                  <Input.Password placeholder="รหัสผ่านเดิม" />
                </Form.Item>
                <Form.Item name="newPassword" label="รหัสผ่านใหม่" rules={[{ required: true, min: 6, message: 'รหัสผ่านใหม่อย่างน้อย 6 ตัวอักษร' }]}>
                  <Input.Password placeholder="รหัสผ่านใหม่ (อย่างน้อย 6 ตัว)" />
                </Form.Item>
                <Form.Item name="confirmPassword" label="ยืนยันรหัสผ่านใหม่" rules={[{ required: true, message: 'กรุณายืนยันรหัสผ่านใหม่' }]}>
                  <Input.Password placeholder="ยืนยันรหัสผ่านใหม่" />
                </Form.Item>
              </Form>
            ),
          },
        ]} />
      </Modal>
    </Layout>
  )
}
