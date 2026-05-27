import { useEffect, useMemo, useState } from 'react'
import { apiUrl } from '../../api'
import { Card, Table, Input, InputNumber, Space, Button, Switch, Popconfirm, message, Select, Tag } from 'antd'
import { CsvImport } from './CsvImport'

const MACHINES_SAMPLE = `machineId,machineName,machineType,sortOrder,isActive
MC001,Machine A,PRODUCTION,1,true
MC002,Machine B,PRODUCTION,2,true
MANUAL-01,Manual Line,MANUAL,10,true
PKG-01,Packing Line,PACKING,20,true
`

type Machine = {
  machineId: string
  machineName: string
  machineType?: string
  isActive?: boolean
  sortOrder?: number
}

const TYPE_COLOR: Record<string, string> = {
  PRODUCTION: 'blue',
  MANUAL: 'orange',
  PACKING: 'purple',
}

const MACHINE_TYPES = ['PRODUCTION', 'MANUAL', 'PACKING']

export function MachinesAdmin({ token }: { token: string }) {
  const auth = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token])
  const headers = useMemo(() => ({ 'Content-Type': 'application/json', ...auth }), [auth])

  const [items, setItems] = useState<Machine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Draft สำหรับเพิ่มใหม่
  const emptyDraft: Machine = { machineId: '', machineName: '', machineType: 'PRODUCTION', isActive: true, sortOrder: 99 }
  const [draft, setDraft] = useState<Machine>(emptyDraft)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(apiUrl('/api/admin/machines'), { headers: auth })
      if (!r.ok) throw new Error('โหลด Machine ไม่สำเร็จ')
      setItems(await r.json())
    } catch (e: any) {
      setError(e?.message || 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const create = async () => {
    if (!draft.machineId.trim()) { message.warning('กรอก Machine ID'); return }
    if (!draft.machineName.trim()) { message.warning('กรอกชื่อแสดงผล'); return }
    const r = await fetch(apiUrl('/api/admin/machines'), {
      method: 'POST', headers,
      body: JSON.stringify({ ...draft, machineId: draft.machineId.trim(), machineName: draft.machineName.trim() }),
    })
    if (r.ok) {
      setDraft(emptyDraft)
      message.success('เพิ่ม Machine แล้ว')
      load()
    } else {
      const txt = await r.text()
      message.error(`เพิ่มไม่สำเร็จ: ${txt}`)
    }
  }

  const save = async (m: Machine) => {
    const r = await fetch(apiUrl(`/api/admin/machines/${encodeURIComponent(m.machineId)}`), {
      method: 'PUT', headers, body: JSON.stringify(m),
    })
    if (r.ok) { message.success('บันทึก Machine แล้ว'); load() }
    else { message.error('บันทึกไม่สำเร็จ') }
  }

  const remove = async (id: string, name: string) => {
    const r = await fetch(apiUrl(`/api/admin/machines/${encodeURIComponent(id)}`), { method: 'DELETE', headers: auth })
    if (r.ok || r.status === 204) { message.success(`ลบ ${name} แล้ว`); load() }
    else { message.error('ลบไม่สำเร็จ (อาจมี WO อ้างอิงอยู่)') }
  }

  // Inline edit helpers
  const patch = (machineId: string, field: keyof Machine, value: any) =>
    setItems(arr => arr.map(x => x.machineId === machineId ? { ...x, [field]: value } : x))

  const columns = [
    {
      title: 'Machine ID', dataIndex: 'machineId', width: 140,
      render: (v: string) => <b style={{ fontFamily: 'monospace' }}>{v}</b>,
    },
    {
      title: 'ชื่อแสดงผล', dataIndex: 'machineName', width: 160,
      render: (_: any, r: Machine) => (
        <Input
          value={r.machineName}
          onChange={e => patch(r.machineId, 'machineName', e.target.value)}
          style={{ width: 150 }}
        />
      ),
    },
    {
      title: 'ประเภท', dataIndex: 'machineType', width: 150,
      render: (_: any, r: Machine) => (
        <Select
          value={r.machineType ?? undefined}
          onChange={v => patch(r.machineId, 'machineType', v)}
          allowClear
          style={{ width: 140 }}
          placeholder="เลือกประเภท"
        >
          {MACHINE_TYPES.map(t => (
            <Select.Option key={t} value={t}>
              <Tag color={TYPE_COLOR[t]}>{t}</Tag>
            </Select.Option>
          ))}
        </Select>
      ),
    },
    {
      title: 'ลำดับ', dataIndex: 'sortOrder', width: 90,
      render: (_: any, r: Machine) => (
        <InputNumber
          value={r.sortOrder ?? 99}
          onChange={v => patch(r.machineId, 'sortOrder', v)}
          min={0} max={999}
          style={{ width: 70 }}
        />
      ),
    },
    {
      title: 'ใช้งาน', dataIndex: 'isActive', width: 80,
      render: (_: any, r: Machine) => (
        <Switch checked={r.isActive !== false} onChange={v => patch(r.machineId, 'isActive', v)} />
      ),
    },
    {
      title: 'Actions', key: 'actions', width: 160,
      render: (_: any, r: Machine) => (
        <Space>
          <Button type="primary" size="small" onClick={() => save(r)}>Save</Button>
          <Popconfirm
            title={`ลบ ${r.machineName}?`}
            description="WO ที่ใช้ Machine นี้จะไม่มีข้อมูล M/C แสดง"
            onConfirm={() => remove(r.machineId, r.machineName)}
            okText="ลบ" cancelText="ยกเลิก"
            okButtonProps={{ danger: true }}
          >
            <Button danger size="small">Delete</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card
      title="Machines (เครื่องจักร)"
      extra={<Button onClick={load} loading={loading}>Refresh</Button>}
    >
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <CsvImport
        token={token}
        importUrl="/api/admin/machines/import"
        sampleFilename="machines_template.csv"
        sampleContent={MACHINES_SAMPLE}
        onSuccess={load}
      />

      {/* Add form */}
      <Card size="small" style={{ marginBottom: 12 }} title="เพิ่ม Machine ใหม่">
        <Space wrap>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>Machine ID *</div>
            <Input
              placeholder="เช่น RLB110"
              value={draft.machineId}
              onChange={e => setDraft(v => ({ ...v, machineId: e.target.value }))}
              style={{ width: 130, fontFamily: 'monospace' }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>ชื่อแสดงผล *</div>
            <Input
              placeholder="เช่น RLB110"
              value={draft.machineName}
              onChange={e => setDraft(v => ({ ...v, machineName: e.target.value }))}
              style={{ width: 140 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>ประเภท</div>
            <Select
              value={draft.machineType}
              onChange={v => setDraft(d => ({ ...d, machineType: v }))}
              style={{ width: 140 }}
            >
              {MACHINE_TYPES.map(t => (
                <Select.Option key={t} value={t}><Tag color={TYPE_COLOR[t]}>{t}</Tag></Select.Option>
              ))}
            </Select>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>ลำดับ</div>
            <InputNumber
              value={draft.sortOrder}
              onChange={v => setDraft(d => ({ ...d, sortOrder: v ?? 99 }))}
              min={0} style={{ width: 70 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>ใช้งาน</div>
            <Switch checked={draft.isActive} onChange={v => setDraft(d => ({ ...d, isActive: v }))} />
          </div>
          <div style={{ marginTop: 20 }}>
            <Button type="primary" onClick={create}>เพิ่ม Machine</Button>
          </div>
        </Space>
      </Card>

      <Table
        dataSource={items.map(it => ({ key: it.machineId, ...it }))}
        columns={columns as any}
        pagination={false}
        loading={loading}
        size="small"
        rowClassName={(r: Machine) => r.isActive === false ? 'ant-table-row-disabled' : ''}
      />

      <div style={{ marginTop: 16, fontSize: 12, color: '#999' }}>
        <b>หมายเหตุ:</b> Machine ID ไม่สามารถเปลี่ยนได้หลังสร้าง | ลำดับน้อย = แสดงก่อนใน Dropdown
      </div>
    </Card>
  )
}
