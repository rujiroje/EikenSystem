import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import { Card, Table, Input, InputNumber, Space, Button, message, Select, Modal, Form, Tag, Typography } from 'antd'
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons'
import { CsvImport } from './CsvImport'

const PRODUCTS_SAMPLE = `productCode,productName,weightPerPiece,quantityPerMeasurement,innerBoxQuantity,unit,weighingMode,innerNumberingMode,tolerance,cleanerTime,doubleWeighingTolerance,standardWeight1,standardWeight2,tolerance1,tolerance2,description
P001,ผลิตภัณฑ์ตัวอย่าง A (SINGLE),10.0,5,10,g,SINGLE,CONTINUOUS,2.5,4,,,,,,คำอธิบายสินค้า A
P002,ผลิตภัณฑ์ตัวอย่าง B (DOUBLE),15.0,2,5,g,DOUBLE,RESET_PER_OUTER,3.75,,1.0,15.0,15.0,1.5,1.5,ชั่ง 2 ครั้ง
`

type Product = {
  productCode: string
  productName?: string
  weightPerPiece?: number
  quantityPerMeasurement?: number
  tolerance?: number
  innerBoxQuantity?: number
  unit?: string
  description?: string
  standardWeight?: number
  minWeight?: number
  maxWeight?: number
  weighingMode?: string
  doubleWeighingTolerance?: number
  innerNumberingMode?: string
  standardWeight1?: number
  standardWeight2?: number
  tolerance1?: number
  tolerance2?: number
  cleanerTime?: number | null
}

const emptyProduct: Product = {
  productCode: '',
  productName: '',
  weighingMode: 'SINGLE',
  innerNumberingMode: 'CONTINUOUS',
}

export function ProductsAdmin({ token }: { token: string }) {
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...auth }), [auth])
  const [items, setItems] = useState<Product[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [isNew, setIsNew] = useState(false)
  const [draft, setDraft] = useState<Product>(emptyProduct)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(apiUrl('/api/admin/products'), { headers: auth })
      if (!r.ok) throw new Error('โหลด Products ไม่สำเร็จ')
      setItems((await r.json()) || [])
    } catch (e: any) { setError(e?.message || 'เกิดข้อผิดพลาด') } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const computeStd = (p: Product): Product => {
    const wpp = p.weightPerPiece || 0
    const qpm = p.quantityPerMeasurement || 0
    const std = +(wpp * qpm).toFixed(3)
    return { ...p, standardWeight: std, minWeight: +(std - wpp / 2).toFixed(3), maxWeight: +(std + wpp / 2).toFixed(3) }
  }

  const openAdd = () => { setDraft(emptyProduct); setIsNew(true); setModalOpen(true) }
  const openEdit = (p: Product) => { setDraft({ ...p }); setIsNew(false); setModalOpen(true) }

  const handleSave = async () => {
    if (!draft.productCode) { message.warning('กรอกรหัสสินค้า'); return }
    setSaving(true)
    try {
      const body = JSON.stringify(computeStd(draft))
      const r = isNew
        ? await fetch(apiUrl('/api/admin/products'), { method: 'POST', headers, body })
        : await fetch(apiUrl(`/api/admin/products/${encodeURIComponent(draft.productCode)}`), { method: 'PUT', headers, body })
      if (!r.ok) throw new Error(isNew ? 'เพิ่มสินค้าไม่สำเร็จ' : 'บันทึกไม่สำเร็จ')
      message.success(isNew ? 'เพิ่มสินค้าแล้ว' : 'บันทึกสินค้าแล้ว')
      setModalOpen(false)
      load()
    } catch (e: any) { message.error(e?.message || 'เกิดข้อผิดพลาด') } finally { setSaving(false) }
  }

  const handleDelete = async (code: string) => {
    if (!confirm(`ลบสินค้า ${code}?`)) return
    const r = await fetch(apiUrl(`/api/admin/products/${encodeURIComponent(code)}`), { method: 'DELETE', headers: auth })
    if (r.ok || r.status === 204) { message.success('ลบสินค้าแล้ว'); load() }
    else message.error('ลบไม่สำเร็จ')
  }

  const set = (field: keyof Product, value: any) => setDraft(d => ({ ...d, [field]: value }))

  const isDouble = draft.weighingMode === 'DOUBLE'

  const columns = [
    { title: 'Code', dataIndex: 'productCode', width: 120, render: (v: string) => <b>{v}</b> },
    {
      title: 'ชื่อสินค้า', dataIndex: 'productName', render: (v: string, r: Product) => (
        <Typography.Link onClick={() => openEdit(r)}>{v || '-'}</Typography.Link>
      )
    },
    { title: 'W/Pc', dataIndex: 'weightPerPiece', width: 80, render: (v: number) => v?.toFixed(3) ?? '-' },
    { title: 'Qty/Meas', dataIndex: 'quantityPerMeasurement', width: 90 },
    { title: 'Std', dataIndex: 'standardWeight', width: 90, render: (v: number) => v?.toFixed(3) ?? '-' },
    { title: 'Tol', dataIndex: 'tolerance', width: 70, render: (v: number) => v ?? '-' },
    { title: 'InnerQty', dataIndex: 'innerBoxQuantity', width: 80 },
    { title: 'Unit', dataIndex: 'unit', width: 60 },
    {
      title: 'Mode', dataIndex: 'weighingMode', width: 80,
      render: (v: string) => <Tag color={v === 'DOUBLE' ? 'purple' : 'blue'}>{v || 'SINGLE'}</Tag>
    },
    {
      title: 'InnerRun', dataIndex: 'innerNumberingMode', width: 90,
      render: (v: string) => <Tag>{v === 'RESET_PER_OUTER' ? 'RESET' : 'CONT'}</Tag>
    },
    {
      title: 'Clean (ชม.)', dataIndex: 'cleanerTime', width: 90,
      render: (v: number) => v ? <Tag color="cyan">{v} ชม.</Tag> : <span style={{ color: '#bbb' }}>-</span>
    },
    {
      title: 'Actions', key: 'actions', width: 110, render: (_: any, r: Product) => (
        <Space>
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)}>แก้ไข</Button>
          <Button size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(r.productCode)} />
        </Space>
      )
    },
  ]

  return (
    <>
      <Card
        title="Products"
        extra={
          <Space>
            <Button type="primary" icon={<PlusOutlined />} onClick={openAdd}>เพิ่มสินค้า</Button>
            <Button onClick={load} loading={loading}>Refresh</Button>
          </Space>
        }
      >
        {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
        <CsvImport
          token={token}
          importUrl="/api/admin/products/import"
          sampleFilename="products_template.csv"
          sampleContent={PRODUCTS_SAMPLE}
          onSuccess={load}
        />
        <Table
          dataSource={items.map(it => ({ key: it.productCode, ...it }))}
          columns={columns as any}
          pagination={{ pageSize: 20 }}
          size="small"
          loading={loading}
        />
      </Card>

      {/* Modal แก้ไข / เพิ่มสินค้า */}
      <Modal
        title={isNew ? 'เพิ่มสินค้าใหม่' : `แก้ไขสินค้า: ${draft.productCode}`}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText={isNew ? 'เพิ่ม' : 'บันทึก'}
        cancelText="ยกเลิก"
        confirmLoading={saving}
        width={600}
      >
        <Form layout="vertical" size="small">
          <Form.Item label="Product Code" required>
            <Input value={draft.productCode} onChange={e => set('productCode', e.target.value)} disabled={!isNew} placeholder="เช่น P001" />
          </Form.Item>
          <Form.Item label="Product Name">
            <Input value={draft.productName || ''} onChange={e => set('productName', e.target.value)} placeholder="ชื่อสินค้า" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Form.Item label="Weight/Piece">
              <InputNumber style={{ width: '100%' }} value={draft.weightPerPiece ?? undefined} onChange={v => set('weightPerPiece', v ?? undefined)} placeholder="เช่น 7.5" />
            </Form.Item>
            <Form.Item label="Qty/Measurement">
              <InputNumber style={{ width: '100%' }} value={draft.quantityPerMeasurement ?? undefined} onChange={v => set('quantityPerMeasurement', v ?? undefined)} placeholder="เช่น 50" />
            </Form.Item>
            <Form.Item label="Tolerance">
              <InputNumber style={{ width: '100%' }} value={draft.tolerance ?? undefined} onChange={v => set('tolerance', v ?? undefined)} placeholder="เช่น 1.875" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item label="Inner Box Quantity">
              <InputNumber style={{ width: '100%' }} value={draft.innerBoxQuantity ?? undefined} onChange={v => set('innerBoxQuantity', v ?? undefined)} placeholder="เช่น 20" />
            </Form.Item>
            <Form.Item label="Unit">
              <Input value={draft.unit || ''} onChange={e => set('unit', e.target.value)} placeholder="เช่น pcs, g, kg" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item label="Description">
              <Input value={draft.description || ''} onChange={e => set('description', e.target.value)} placeholder="คำอธิบาย (ถ้ามี)" />
            </Form.Item>
            <Form.Item label="ทำความสะอาดทุก (ชั่วโมง)" tooltip="จำนวนชั่วโมงที่นับจากเวลาเริ่มงาน ก่อนแจ้งทำความสะอาด — ปล่อยว่างหรือ 0 = ปิดแจ้งเตือน">
              <InputNumber style={{ width: '100%' }} value={draft.cleanerTime ?? undefined} onChange={v => set('cleanerTime', v ?? null)} min={0} max={24} placeholder="เช่น 2" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Form.Item label="Weighing Mode">
              <Select
                style={{ width: '100%' }}
                value={draft.weighingMode || 'SINGLE'}
                onChange={v => set('weighingMode', v)}
                options={[{ value: 'SINGLE', label: 'SINGLE — ชั่ง 1 ครั้ง' }, { value: 'DOUBLE', label: 'DOUBLE — ชั่ง 2 ครั้ง' }]}
              />
            </Form.Item>
            <Form.Item label="Inner Numbering Mode">
              <Select
                style={{ width: '100%' }}
                value={draft.innerNumberingMode || 'CONTINUOUS'}
                onChange={v => set('innerNumberingMode', v)}
                options={[{ value: 'CONTINUOUS', label: 'CONTINUOUS — รันต่อเนื่อง' }, { value: 'RESET_PER_OUTER', label: 'RESET — รีเซ็ตทุก Outer' }]}
              />
            </Form.Item>
          </div>

          {isDouble && (
            <>
              <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8, fontSize: 12 }}>
                ⚙ การตั้งค่าสำหรับ DOUBLE mode
              </Typography.Text>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <Form.Item label="Double Weighing Tolerance">
                  <InputNumber style={{ width: '100%' }} value={draft.doubleWeighingTolerance ?? undefined} onChange={v => set('doubleWeighingTolerance', v ?? undefined)} placeholder="ความต่างที่ยอมรับ" />
                </Form.Item>
                <Form.Item label="Standard Weight 1">
                  <InputNumber style={{ width: '100%' }} value={draft.standardWeight1 ?? undefined} onChange={v => set('standardWeight1', v ?? undefined)} />
                </Form.Item>
                <Form.Item label="Standard Weight 2">
                  <InputNumber style={{ width: '100%' }} value={draft.standardWeight2 ?? undefined} onChange={v => set('standardWeight2', v ?? undefined)} />
                </Form.Item>
                <Form.Item label="Tolerance 1">
                  <InputNumber style={{ width: '100%' }} value={draft.tolerance1 ?? undefined} onChange={v => set('tolerance1', v ?? undefined)} />
                </Form.Item>
                <Form.Item label="Tolerance 2">
                  <InputNumber style={{ width: '100%' }} value={draft.tolerance2 ?? undefined} onChange={v => set('tolerance2', v ?? undefined)} />
                </Form.Item>
              </div>
            </>
          )}
        </Form>
      </Modal>
    </>
  )
}
