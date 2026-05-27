import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import { Card, Table, Input, Space, Button, Switch, Popconfirm, message, Select } from 'antd'
import { CsvImport } from './CsvImport'

const SCALES_SAMPLE = `scaleId,scaleName,weightUnit,description,isActive
S001,เครื่องชั่งหลัก,g,Line 1,true
S002,เครื่องชั่งสำรอง,kg,Line 2,true
`

type Scale = { scaleId: string; scaleName?: string; weightUnit?: string; isActive?: boolean; description?: string }

const UNIT_OPTIONS = [
  { value: 'g',  label: 'g (กรัม)' },
  { value: 'kg', label: 'kg (กิโลกรัม)' },
]

export function ScalesAdmin({ token }: { token: string }) {
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...auth }), [auth])
  const [items, setItems] = useState<Scale[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [draft, setDraft] = useState<Scale>({ scaleId: '', weightUnit: 'g' })

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(apiUrl('/api/admin/scales'), { headers: auth })
      if (!r.ok) throw new Error('โหลด Scales ไม่สำเร็จ')
      const data = await r.json()
      setItems(data || [])
    } catch (e: any) { setError(e?.message || 'เกิดข้อผิดพลาด') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!draft.scaleId) { setError('กรอกรหัสเครื่องชั่ง'); return }
    const r = await fetch(apiUrl('/api/admin/scales'), { method: 'POST', headers, body: JSON.stringify(draft) })
    if (r.ok) { setDraft({ scaleId: '', weightUnit: 'g' }); message.success('เพิ่มเครื่องชั่งแล้ว'); load() } else { setError('สร้างไม่สำเร็จ'); message.error('เพิ่มเครื่องชั่งไม่สำเร็จ') }
  }

  const save = async (s: Scale) => {
    const r = await fetch(apiUrl(`/api/admin/scales/${encodeURIComponent(s.scaleId)}`), { method: 'PUT', headers, body: JSON.stringify(s) })
    if (r.ok) { message.success('บันทึกเครื่องชั่งแล้ว'); load() } else { setError('บันทึกไม่สำเร็จ'); message.error('บันทึกเครื่องชั่งไม่สำเร็จ') }
  }

  const remove = async (id: string) => {
    if (!confirm(`ลบเครื่องชั่ง ${id}?`)) return
    const r = await fetch(apiUrl(`/api/admin/scales/${encodeURIComponent(id)}`), { method: 'DELETE', headers: auth })
    if (r.ok || r.status === 204) { message.success('ลบเครื่องชั่งแล้ว'); load() } else { setError('ลบไม่สำเร็จ'); message.error('ลบเครื่องชั่งไม่สำเร็จ') }
  }

  const patch = (scaleId: string, field: keyof Scale, value: any) =>
    setItems(arr => arr.map(x => x.scaleId === scaleId ? { ...x, [field]: value } : x))

  const columns = [
    { title: 'Scale ID', dataIndex: 'scaleId', width: 110, render: (v: string) => <b style={{ fontFamily: 'monospace' }}>{v}</b> },
    {
      title: 'ชื่อแสดงผล', dataIndex: 'scaleName', width: 160,
      render: (_: any, r: Scale) => (
        <Input value={r.scaleName || ''} onChange={e => patch(r.scaleId, 'scaleName', e.target.value)} style={{ width: 150 }} />
      ),
    },
    {
      title: 'หน่วยชั่ง', dataIndex: 'weightUnit', width: 140,
      render: (_: any, r: Scale) => (
        <Select
          value={r.weightUnit || undefined}
          onChange={v => patch(r.scaleId, 'weightUnit', v)}
          placeholder="เลือกหน่วย"
          style={{ width: 130 }}
          options={UNIT_OPTIONS}
        />
      ),
    },
    {
      title: 'หมายเหตุ', dataIndex: 'description',
      render: (_: any, r: Scale) => (
        <Input value={r.description || ''} onChange={e => patch(r.scaleId, 'description', e.target.value)} placeholder="คำอธิบาย (ถ้ามี)" />
      ),
    },
    {
      title: 'ใช้งาน', dataIndex: 'isActive', width: 80,
      render: (_: any, r: Scale) => <Switch checked={!!r.isActive} onChange={v => patch(r.scaleId, 'isActive', v)} />,
    },
    {
      title: 'Actions', key: 'actions', width: 160,
      render: (_: any, r: Scale) => (
        <Space>
          <Button type="primary" size="small" onClick={() => save(r)}>Save</Button>
          <Popconfirm title={`ลบเครื่องชั่ง ${r.scaleId}?`} onConfirm={() => remove(r.scaleId)} okText="ลบ" cancelText="ยกเลิก" okButtonProps={{ danger: true }}>
            <Button danger size="small">Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card title="Scales (เครื่องชั่ง)" extra={<Button onClick={load} loading={loading}>Refresh</Button>}>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <CsvImport
        token={token}
        importUrl="/api/admin/scales/import"
        sampleFilename="scales_template.csv"
        sampleContent={SCALES_SAMPLE}
        onSuccess={load}
      />

      <Card size="small" style={{ marginBottom: 12 }} title="เพิ่มเครื่องชั่ง">
        <Space wrap>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Scale ID *</div>
            <Input placeholder="เช่น S001" value={draft.scaleId} onChange={e => setDraft(v => ({ ...v, scaleId: e.target.value }))} style={{ width: 100, fontFamily: 'monospace' }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>ชื่อแสดงผล</div>
            <Input placeholder="เช่น เครื่องชั่ง 1" value={draft.scaleName || ''} onChange={e => setDraft(v => ({ ...v, scaleName: e.target.value }))} style={{ width: 150 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>หน่วยชั่ง</div>
            <Select
              value={draft.weightUnit || 'g'}
              onChange={v => setDraft(d => ({ ...d, weightUnit: v }))}
              style={{ width: 130 }}
              options={UNIT_OPTIONS}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>หมายเหตุ</div>
            <Input placeholder="คำอธิบาย (ถ้ามี)" value={draft.description || ''} onChange={e => setDraft(v => ({ ...v, description: e.target.value }))} style={{ width: 150 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>ใช้งาน</div>
            <Switch checked={!!draft.isActive} onChange={v => setDraft(d => ({ ...d, isActive: v }))} />
          </div>
          <div style={{ marginTop: 20 }}>
            <Button type="primary" onClick={create}>เพิ่ม Scale</Button>
          </div>
        </Space>
      </Card>

      <Table
        dataSource={items.map(it => ({ key: it.scaleId, ...it }))}
        columns={columns as any}
        pagination={false}
        loading={loading}
        size="small"
      />

      <div style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
        <b>หมายเหตุ:</b> Scale ID ไม่สามารถเปลี่ยนได้หลังสร้าง
      </div>
    </Card>
  )
}

