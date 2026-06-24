import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag, message } from 'antd'
import { EditOutlined, PlusOutlined } from '@ant-design/icons'

type SortingReason = {
  id?: number
  code: string
  labelTh: string
  labelEn?: string
  description?: string
  scope: string
  sortOrder: number
  isActive: boolean
  requiresNote: boolean
}

const EMPTY: SortingReason = { code: '', labelTh: '', scope: 'BOTH', sortOrder: 100, isActive: true, requiresNote: false }

const SCOPE_OPTIONS = [
  { value: 'BOTH',   label: 'ทั้งหมด (BULK + SINGLE)' },
  { value: 'BULK',   label: 'BULK เท่านั้น' },
  { value: 'SINGLE', label: 'SINGLE เท่านั้น' },
]

export function SortingReasonsAdmin({ token }: { token: string }) {
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }), [token])
  const auth    = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])

  const [items, setItems] = useState<SortingReason[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [draft, setDraft] = useState<SortingReason>(EMPTY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(apiUrl('/api/admin/sorting-reasons'), { headers: auth })
      setItems(r.ok ? await r.json() : [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const openAdd = () => { setDraft({ ...EMPTY }); setIsNew(true); setModalOpen(true) }
  const openEdit = (r: SortingReason) => { setDraft({ ...r }); setIsNew(false); setModalOpen(true) }

  const set = (field: keyof SortingReason, value: any) => setDraft(d => ({ ...d, [field]: value }))

  const handleSave = async () => {
    if (!draft.code.trim()) { message.warning('กรอก Code'); return }
    if (!draft.labelTh.trim()) { message.warning('กรอกชื่อภาษาไทย'); return }
    setSaving(true)
    try {
      const url = isNew ? apiUrl('/api/admin/sorting-reasons') : apiUrl(`/api/admin/sorting-reasons/${draft.id}`)
      const method = isNew ? 'POST' : 'PUT'
      const r = await fetch(url, { method, headers, body: JSON.stringify(draft) })
      if (!r.ok) { const t = await r.text(); throw new Error(t || 'บันทึกไม่สำเร็จ') }
      message.success(isNew ? 'เพิ่มเหตุผลแล้ว' : 'บันทึกแล้ว')
      setModalOpen(false)
      load()
    } catch (e: any) { message.error(e?.message || 'เกิดข้อผิดพลาด') } finally { setSaving(false) }
  }

  const handleToggle = async (item: SortingReason) => {
    const r = await fetch(apiUrl(`/api/admin/sorting-reasons/${item.id}`), {
      method: 'PUT', headers, body: JSON.stringify({ ...item, isActive: !item.isActive })
    })
    if (r.ok) { message.success('อัปเดตแล้ว'); load() }
    else message.error('อัปเดตไม่สำเร็จ')
  }

  const columns = [
    { title: 'Code',    dataIndex: 'code',    width: 140, render: (v: string) => <b style={{ fontFamily: 'monospace' }}>{v}</b> },
    { title: 'ชื่อ (TH)', dataIndex: 'labelTh', render: (v: string) => v },
    { title: 'EN',       dataIndex: 'labelEn',  width: 180, render: (v: string) => <span style={{ color: '#666' }}>{v || '-'}</span> },
    { title: 'Scope',   dataIndex: 'scope',   width: 100, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'Order',   dataIndex: 'sortOrder', width: 70 },
    { title: 'Note?',   dataIndex: 'requiresNote', width: 80, render: (v: boolean) => v ? <Tag color="orange">ต้องกรอก</Tag> : '-' },
    {
      title: 'Active', dataIndex: 'isActive', width: 80,
      render: (_: any, r: SortingReason) => <Switch size="small" checked={r.isActive} onChange={() => handleToggle(r)} />
    },
    {
      title: '', key: 'actions', width: 80,
      render: (_: any, r: SortingReason) => (
        <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>แก้ไข</Button>
      )
    },
  ]

  return (
    <>
      <Card title="เหตุผลการแก้ไข Sorting" extra={
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>เพิ่ม</Button>
          <Button onClick={load} loading={loading}>Refresh</Button>
        </Space>
      }>
        <Table
          dataSource={items.map(i => ({ key: i.id, ...i }))}
          columns={columns as any}
          size="small"
          pagination={{ pageSize: 20 }}
          loading={loading}
        />
      </Card>

      <Modal
        title={isNew ? 'เพิ่มเหตุผลใหม่' : `แก้ไข: ${draft.code}`}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={isNew ? 'เพิ่ม' : 'บันทึก'}
        cancelText="ยกเลิก"
        confirmLoading={saving}
        width={520}
        style={{ maxWidth: '95vw' }}
      >
        <Form layout="vertical" size="small">
          <Form.Item label="Code" required tooltip="ตัวพิมพ์ใหญ่, ไม่มีช่องว่าง เช่น WRONG_WEIGHT">
            <Input value={draft.code} onChange={e => set('code', e.target.value.toUpperCase())} disabled={!isNew} placeholder="เช่น WRONG_WEIGHT" />
          </Form.Item>
          <Form.Item label="ชื่อ (ภาษาไทย)" required>
            <Input value={draft.labelTh} onChange={e => set('labelTh', e.target.value)} placeholder="เช่น น้ำหนักผิดปกติ" />
          </Form.Item>
          <Form.Item label="ชื่อ (ภาษาอังกฤษ)">
            <Input value={draft.labelEn || ''} onChange={e => set('labelEn', e.target.value)} placeholder="เช่น Wrong Weight" />
          </Form.Item>
          <Form.Item label="คำอธิบาย">
            <Input value={draft.description || ''} onChange={e => set('description', e.target.value)} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item label="Scope (ใช้กับ)">
              <Select style={{ width: '100%' }} value={draft.scope} onChange={v => set('scope', v)} options={SCOPE_OPTIONS} />
            </Form.Item>
            <Form.Item label="ลำดับ">
              <InputNumber style={{ width: '100%' }} value={draft.sortOrder} onChange={v => set('sortOrder', v ?? 100)} min={1} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item label="เปิดใช้งาน">
              <Switch checked={draft.isActive} onChange={v => set('isActive', v)} />
            </Form.Item>
            <Form.Item label="บังคับกรอกหมายเหตุ">
              <Switch checked={draft.requiresNote} onChange={v => set('requiresNote', v)} />
            </Form.Item>
          </div>
        </Form>
      </Modal>
    </>
  )
}
