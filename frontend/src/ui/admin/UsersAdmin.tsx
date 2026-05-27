import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import { Card, Table, Tag, Space, Button, Checkbox, Input, Typography, message } from 'antd'
import { CsvImport } from './CsvImport'

const USERS_SAMPLE = `username,password,roles
operator01,op123,OPERATOR
leader01,ld123,LEADER
qa01,qa123,QA
admin01,admin123,ADMIN|LEADER
dataadmin01,da123,DATA_ADMIN
`

type AdminUser = { username: string; roles: string[]; hasFingerprint: boolean }

const ALL_ROLES = ['OPERATOR', 'LEADER', 'QA', 'ADMIN', 'DATA_ADMIN'] as const

export function UsersAdmin({ token }: { token: string }) {
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dbInfo, setDbInfo] = useState<{ product?: string, url?: string } | null>(null)
  const [search, setSearch] = useState('')

  const [newUser, setNewUser] = useState<{ username: string; password: string; roles: string[] }>({ username: '', password: '', roles: [] })

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(apiUrl('/api/admin/users'), { headers: { Authorization: headers.Authorization! } })
      if (!r.ok) throw new Error('โหลดผู้ใช้ไม่สำเร็จ')
      const data = await r.json()
      setUsers(data || [])
      // fetch db-info in parallel (non-blocking)
      fetch(apiUrl('/api/admin/db-info'), { headers: { Authorization: headers.Authorization! } })
        .then(x => x.ok ? x.json() : null)
        .then(setDbInfo)
        .catch(() => {})
    } catch (e: any) {
      setError(e?.message || 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleRole = (arr: string[], role: string) => arr.includes(role) ? arr.filter(r => r !== role) : [...arr, role]

  const create = async () => {
    if (!newUser.username || !newUser.password) { setError('กรอก username และ password'); return }
    const r = await fetch(apiUrl('/api/admin/users'), { method: 'POST', headers, body: JSON.stringify(newUser) })
    if (r.ok) { setNewUser({ username: '', password: '', roles: [] }); message.success('สร้างผู้ใช้แล้ว'); load() } else { const t = await r.text().catch(()=>null); setError(t||'สร้างผู้ใช้ไม่สำเร็จ'); message.error('สร้างผู้ใช้ไม่สำเร็จ') }
  }

  const save = async (u: AdminUser, password?: string) => {
    const body: any = { roles: u.roles }
    if (password && password.trim().length > 0) body.password = password
    const r = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(u.username)}`), { method: 'PUT', headers, body: JSON.stringify(body) })
    if (r.ok) { message.success('บันทึกผู้ใช้แล้ว'); load() }
    else {
      try {
        const t = await r.text(); setError(t || 'บันทึกผู้ใช้ไม่สำเร็จ'); message.error('บันทึกผู้ใช้ไม่สำเร็จ')
      } catch { setError('บันทึกผู้ใช้ไม่สำเร็จ') }
    }
  }

  const remove = async (username: string) => {
    if (!confirm(`ลบผู้ใช้ ${username}?`)) return
    const r = await fetch(apiUrl(`/api/admin/users/${encodeURIComponent(username)}`), { method: 'DELETE', headers: { Authorization: headers.Authorization! } })
    if (r.ok || r.status === 204) { message.success('ลบผู้ใช้แล้ว'); load() } else { setError('ลบผู้ใช้ไม่สำเร็จ'); message.error('ลบผู้ใช้ไม่สำเร็จ') }
  }

  const enrollFingerprint = async (username: string) => {
    message.loading({ content: 'กำลังรอการสแกนลายนิ้วมือ...', key: 'fp' })
    try {
      const agentRes = await fetch('https://localhost:5001/authenticate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge: 'enroll-' + username })
      }).catch(() => null)

      if (!agentRes || !agentRes.ok) {
        message.error({ content: 'ไม่พบเครื่องสแกน — ตรวจสอบว่า KiosBioAgent กำลังทำงานอยู่', key: 'fp' })
        return
      }
      const data = await agentRes.json()
      if (!data.ok || !data.signedData) {
        message.error({ content: 'ไม่สามารถอ่านลายนิ้วมือได้ กรุณาลองใหม่', key: 'fp' })
        return
      }
      await saveFingerprint(username, data.signedData)
    } catch { message.error({ content: 'เกิดข้อผิดพลาดในการลงทะเบียนลายนิ้วมือ', key: 'fp' }) }
  }

  const saveFingerprint = async (username: string, template: string) => {
    const r = await fetch(apiUrl(`/api/admin/users/${username}/fingerprint`), {
      method: 'POST', headers, body: JSON.stringify({ template })
    })
    if (r.ok) { message.success({ content: 'บันทึกลายนิ้วมือสำเร็จ', key: 'fp' }); load(); } // Reload เพื่ออัปเดตสถานะ
    else message.error({ content: 'บันทึกไม่สำเร็จ', key: 'fp' })
  }

  const columns = [
    { title: 'Username', dataIndex: 'username', key: 'username', render: (v: string) => <b>{v}</b> },
    { title: 'Roles', dataIndex: 'roles', key: 'roles', render: (_: any, u: AdminUser) => (
      <Space wrap>
        {ALL_ROLES.map(r => (
          <Checkbox key={r} checked={u.roles?.includes(r)} onChange={(e) => {
            const next = e.target.checked ? [...(u.roles||[]), r] : (u.roles||[]).filter(x => x!==r)
            setUsers(prev => prev.map(x => x.username===u.username ? { ...x, roles: next } : x))
          }}>{r}</Checkbox>
        ))}
      </Space>
    ) },
    { title: 'Reset Password', key: 'pwd', render: (_: any, u: AdminUser) => <UserPwd username={u.username} onSave={(pwd) => save(u, pwd)} /> },
    { title: 'Fingerprint', key: 'fp', render: (_: any, u: AdminUser) => (
      <Space>
        {u.hasFingerprint && <Tag color="green">มีแล้ว</Tag>}
        <Button size="small" onClick={() => enrollFingerprint(u.username)}>{u.hasFingerprint ? 'เปลี่ยน' : 'ลงทะเบียน'}</Button>
      </Space>
    ) },
    { title: 'Actions', key: 'actions', render: (_: any, u: AdminUser) => (
      <Space>
        <Button type="primary" onClick={() => save(u)}>Save</Button>
        <Button danger onClick={() => remove(u.username)}>Delete</Button>
      </Space>
    )}
  ]

  const filtered = users.filter(u => u.username.toLowerCase().includes(search.toLowerCase()))

  return (
    <Card title={<Space>
      Users
      {dbInfo?.product && <Tag color="blue">DB: {dbInfo.product}</Tag>}
      {error && <Tag color="red">{error}</Tag>}
    </Space>} extra={<Space>
      <Input placeholder="ค้นหา username" value={search} onChange={e => setSearch(e.target.value)} style={{ width: 220 }} />
      <Button onClick={load} loading={loading}>Refresh</Button>
    </Space>}>
      <CsvImport
        token={token}
        importUrl="/api/admin/users/import"
        sampleFilename="users_template.csv"
        sampleContent={USERS_SAMPLE}
        onSuccess={load}
      />
      <Card size="small" style={{ marginBottom: 12 }} title="สร้างผู้ใช้ใหม่">
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space wrap>
            <Input placeholder="username" value={newUser.username} onChange={e => setNewUser(v => ({ ...v, username: e.target.value }))} style={{ width: 200 }} />
            <Input.Password placeholder="password" value={newUser.password} onChange={e => setNewUser(v => ({ ...v, password: e.target.value }))} style={{ width: 200 }} />
            <Space wrap>
              {ALL_ROLES.map(r => (
                <Checkbox key={r} checked={newUser.roles.includes(r)} onChange={() => setNewUser(v => ({ ...v, roles: toggleRole(v.roles, r) }))}>{r}</Checkbox>
              ))}
            </Space>
            <Button type="primary" onClick={create}>สร้าง</Button>
          </Space>
          <Typography.Text type="secondary">แนะนำให้ตั้งรหัสผ่านแล้วค่อยกำหนด Roles</Typography.Text>
        </Space>
      </Card>
      <Table dataSource={filtered.map(u => ({ key: u.username, ...u }))} columns={columns as any} pagination={{ pageSizeOptions: ['10', '20', '50', '100'], showSizeChanger: true, defaultPageSize: 10 }} />
    </Card>
  )
}

function UserPwd({ username, onSave }: { username: string, onSave: (pwd?: string) => void }) {
  const [pwd, setPwd] = useState('')
  return (
    <Space>
      <Input.Password placeholder="new password (optional)" value={pwd} onChange={e => setPwd(e.target.value)} style={{ width: 220 }} />
      <Button onClick={() => onSave(pwd)} disabled={!pwd}>Apply</Button>
    </Space>
  )
}
