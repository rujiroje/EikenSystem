import React, { useEffect, useState } from 'react'
import {
  Button, Card, DatePicker, Form, Input, InputNumber, Modal, Select,
  Space, Table, Tag, Typography, message, Popconfirm, Tooltip, Switch, Tabs
} from 'antd'
import { PlusOutlined, EditOutlined, CheckCircleOutlined, SyncOutlined, DeleteOutlined } from '@ant-design/icons'
import { apiUrl } from '../api'
import dayjs from 'dayjs'

const { Title } = Typography
const { Option } = Select

// ─── Types ──────────────────────────────────────────────────────────────────

type Product = {
  productCode: string
  productName: string
  weighingMode?: string
  standardWeight?: number
  standardWeight1?: number
  standardWeight2?: number
}

type Scale = {
  scaleId: string
  scaleName?: string
}

type Machine = {
  machineId: string
  machineName: string
  machineType?: string
  isActive?: boolean
  sortOrder?: number
}

type WorkOrder = {
  workOrderId: number
  product: Product
  scale: Scale
  machine?: Machine
  line?: string
  lotNo: string
  startDate?: string
  endDate?: string
  customStd?: number
  customStd1?: number
  customStd2?: number
  status: string
  createdBy: string
  createdAt: string
  operatorNames?: string
  startedBy?: string
  sessionStartedAt?: string
  closedAt?: string
  closedBy?: string
  reworkSourceWo?: { workOrderId: number; lotNo: string; product: Product }
  reworkReason?: string
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'green',
  END: 'default',
  SORTING: 'orange',
}

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Active',
  END: 'End',
  SORTING: 'Sorting',
}

const TYPE_COLOR: Record<string, string> = {
  PRODUCTION: 'blue',
  MANUAL: 'orange',
  PACKING: 'purple',
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function WorkOrderManagement({ token }: Readonly<{ token: string }>) {
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [scales, setScales] = useState<Scale[]>([])
  const [machines, setMachines] = useState<Machine[]>([])
  const [loading, setLoading] = useState(false)
  const [filterStatus, setFilterStatus] = useState<string>('ALL')
  const [modalOpen, setModalOpen] = useState(false)
  const [editingWO, setEditingWO] = useState<WorkOrder | null>(null)
  const [form] = Form.useForm()
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [activeTab, setActiveTab] = useState('wo')
  const [isRework, setIsRework] = useState(false)
  const [busyMachines, setBusyMachines] = useState<Map<string, { conflictWoId: number; conflictLotNo: string; conflictStart?: string; conflictEnd?: string }>>(new Map())
  const [busyScales, setBusyScales]     = useState<Map<string, { conflictWoId: number; conflictLotNo: string; conflictStart?: string; conflictEnd?: string }>>(new Map())
  const [availabilityLoading, setAvailabilityLoading] = useState(false)

  const authHeaders = { Authorization: `Bearer ${token}` }

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadWorkOrders = async () => {
    setLoading(true)
    try {
      const url = filterStatus === 'ALL'
        ? apiUrl('/api/work-orders')
        : apiUrl(`/api/work-orders?status=${filterStatus}`)
      const r = await fetch(url, { headers: authHeaders })
      if (!r.ok) throw new Error('load failed')
      setWorkOrders(await r.json())
    } catch {
      message.error('โหลด Work Order ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  const loadMasterData = async () => {
    try {
      const [pr, sr, mr] = await Promise.all([
        fetch(apiUrl('/api/products'), { headers: authHeaders }),
        fetch(apiUrl('/api/scales'), { headers: authHeaders }),
        fetch(apiUrl('/api/machines'), { headers: authHeaders }),
      ])
      if (pr.ok) setProducts(await pr.json())
      if (sr.ok) setScales(await sr.json())
      if (mr.ok) setMachines(await mr.json())
    } catch {}
  }

  useEffect(() => { loadMasterData() }, [])
  useEffect(() => { loadWorkOrders() }, [filterStatus])

  // ─── Availability check ────────────────────────────────────────────────────

  const checkAvailability = async (startDate: string | undefined, endDate: string | undefined) => {
    if (!startDate || !endDate) {
      setBusyMachines(new Map())
      setBusyScales(new Map())
      return
    }
    setAvailabilityLoading(true)
    try {
      const excludeParam = editingWO ? `&excludeWoId=${editingWO.workOrderId}` : ''
      const r = await fetch(
        apiUrl(`/api/work-orders/availability?startDate=${startDate}&endDate=${endDate}${excludeParam}`),
        { headers: authHeaders }
      )
      if (!r.ok) return
      const data = await r.json()
      const mMap = new Map<string, { conflictWoId: number; conflictLotNo: string; conflictStart?: string; conflictEnd?: string }>()
      const sMap = new Map<string, { conflictWoId: number; conflictLotNo: string; conflictStart?: string; conflictEnd?: string }>()
      for (const m of data.busyMachines ?? []) mMap.set(m.machineId, m)
      for (const s of data.busyScales   ?? []) sMap.set(s.scaleId,   s)
      setBusyMachines(mMap)
      setBusyScales(sMap)
    } catch {} finally {
      setAvailabilityLoading(false)
    }
  }

  // ─── WO form ──────────────────────────────────────────────────────────────

  const openCreateModal = () => {
    setEditingWO(null)
    setSelectedProduct(null)
    setIsRework(false)
    setBusyMachines(new Map())
    setBusyScales(new Map())
    form.resetFields()
    setModalOpen(true)
  }

  const openEditModal = (wo: WorkOrder) => {
    setEditingWO(wo)
    const prod = products.find(p => p.productCode === wo.product?.productCode) ?? null
    setSelectedProduct(prod)
    setIsRework(!!wo.reworkSourceWo)
    form.setFieldsValue({
      productCode: wo.product?.productCode,
      scaleId: wo.scale?.scaleId,
      machineId: wo.machine?.machineId ?? undefined,
      lotNo: wo.lotNo,
      startDate: wo.startDate ? dayjs(wo.startDate) : undefined,
      endDate: wo.endDate ? dayjs(wo.endDate) : undefined,
      customStd: wo.customStd,
      customStd1: wo.customStd1,
      customStd2: wo.customStd2,
      reworkSourceWoId: wo.reworkSourceWo?.workOrderId ?? undefined,
      reworkReason: wo.reworkReason ?? undefined,
    })
    // ตรวจ availability ตามวันที่ปัจจุบันของ WO (exclude ตัวเอง)
    if (wo.startDate && wo.endDate) checkAvailability(wo.startDate, wo.endDate)
    else { setBusyMachines(new Map()); setBusyScales(new Map()) }
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const body = {
        ...values,
        startDate: values.startDate ? values.startDate.format('YYYY-MM-DD') : undefined,
        endDate: values.endDate ? values.endDate.format('YYYY-MM-DD') : undefined,
      }
      const url = editingWO
        ? apiUrl(`/api/work-orders/${editingWO.workOrderId}`)
        : apiUrl('/api/work-orders')
      const method = editingWO ? 'PUT' : 'POST'
      const r = await fetch(url, {
        method,
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        const txt = await r.text()
        message.error(`บันทึกไม่สำเร็จ: ${txt}`)
        return
      }
      message.success(editingWO ? 'แก้ไข WO สำเร็จ' : 'สร้าง WO สำเร็จ')
      setModalOpen(false)
      loadWorkOrders()
    } catch {}
  }

  const changeStatus = async (wo: WorkOrder, newStatus: string) => {
    const r = await fetch(apiUrl(`/api/work-orders/${wo.workOrderId}/status`), {
      method: 'PUT',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })
    if (r.ok) {
      message.success(`เปลี่ยนสถานะ WO #${wo.workOrderId} → ${newStatus}`)
      loadWorkOrders()
    } else {
      message.error('เปลี่ยนสถานะไม่สำเร็จ')
    }
  }

  const deleteWO = async (wo: WorkOrder) => {
    const r = await fetch(apiUrl(`/api/work-orders/${wo.workOrderId}`), {
      method: 'DELETE',
      headers: authHeaders,
    })
    if (r.ok) {
      message.success(`ลบ WO #${wo.workOrderId} (Lot: ${wo.lotNo}) สำเร็จ`)
      loadWorkOrders()
    } else {
      const txt = await r.text()
      message.error(txt || 'ลบ WO ไม่สำเร็จ')
    }
  }

  const isDouble = selectedProduct?.weighingMode === 'DOUBLE'
  const activeMachines = machines.filter(m => m.isActive !== false)

  // ─── WO table columns ─────────────────────────────────────────────────────

  const columns = [
    { title: 'WO #', dataIndex: 'workOrderId', width: 70 },
    {
      title: 'Product',
      render: (_: unknown, wo: WorkOrder) =>
        <span>{wo.product?.productCode}<br /><small style={{ color: '#888' }}>{wo.product?.productName}</small></span>,
    },
    {
      title: 'Scale',
      render: (_: unknown, wo: WorkOrder) => wo.scale?.scaleName ?? wo.scale?.scaleId,
    },
    {
      title: 'M/C',
      render: (_: unknown, wo: WorkOrder) => {
        if (wo.machine) {
          return (
            <span>
              <b>{wo.machine.machineName}</b>
              {wo.machine.machineType && (
                <Tag color={TYPE_COLOR[wo.machine.machineType] ?? 'default'} style={{ marginLeft: 4, fontSize: 10 }}>
                  {wo.machine.machineType}
                </Tag>
              )}
            </span>
          )
        }
        return wo.line ? <span style={{ color: '#aaa' }}>{wo.line}</span> : <span style={{ color: '#ddd' }}>—</span>
      },
    },
    { title: 'Lot No.', dataIndex: 'lotNo' },
    {
      title: 'Rework',
      width: 110,
      render: (_: unknown, wo: WorkOrder) => {
        if (!wo.reworkSourceWo) return <span style={{ color: '#ddd' }}>—</span>
        return (
          <Tooltip title={
            <span>
              ต้นฉบับ: WO #{wo.reworkSourceWo.workOrderId}<br />
              Lot: {wo.reworkSourceWo.lotNo}<br />
              {wo.reworkReason && <>เหตุผล: {wo.reworkReason}</>}
            </span>
          }>
            <Tag color="orange" style={{ cursor: 'default' }}>
              🔄 #{wo.reworkSourceWo.workOrderId}
            </Tag>
          </Tooltip>
        )
      },
    },
    {
      title: 'วันผลิต',
      render: (_: unknown, wo: WorkOrder) =>
        wo.startDate && wo.endDate ? `${wo.startDate} → ${wo.endDate}` : wo.startDate ?? '-',
    },
    {
      title: 'Custom Std',
      render: (_: unknown, wo: WorkOrder) => {
        if (wo.customStd != null) return <span>{wo.customStd}</span>
        if (wo.customStd1 != null || wo.customStd2 != null)
          return <span>{wo.customStd1 ?? '-'} / {wo.customStd2 ?? '-'}</span>
        return <span style={{ color: '#aaa' }}>ใช้จาก Product</span>
      },
    },
    {
      title: 'สถานะ',
      dataIndex: 'status',
      render: (s: string, wo: WorkOrder) => {
        const isExpired = wo.endDate ? dayjs(wo.endDate).isBefore(dayjs().startOf('day')) : false
        return (
          <Space direction="vertical" size={2}>
            <Tag color={STATUS_COLOR[s] ?? 'default'}>{STATUS_LABEL[s] ?? s}</Tag>
            {isExpired && s === 'ACTIVE' && <Tag color="warning" style={{ fontSize: 10 }}>⚠ หมดอายุ</Tag>}
            {isExpired && s === 'END' && <Tag color="default" style={{ fontSize: 10, color: '#999' }}>หมดอายุ (ปิดอัตโนมัติ)</Tag>}
          </Space>
        )
      },
    },
    {
      title: 'สร้างโดย',
      render: (_: unknown, wo: WorkOrder) =>
        <span>{wo.createdBy}<br /><small style={{ color: '#aaa' }}>{wo.createdAt?.substring(0, 10)}</small></span>,
    },
    {
      title: 'Operator',
      render: (_: unknown, wo: WorkOrder) =>
        wo.operatorNames
          ? <Tooltip title={`เริ่มโดย: ${wo.startedBy}`}><span>{wo.operatorNames}</span></Tooltip>
          : <span style={{ color: '#aaa' }}>-</span>,
    },
    {
      title: 'Actions',
      render: (_: unknown, wo: WorkOrder) => (
        <Space size="small" wrap>
          {wo.status === 'ACTIVE' && (
            <Tooltip title="แก้ไข WO">
              <Button size="small" icon={<EditOutlined />} onClick={() => openEditModal(wo)} />
            </Tooltip>
          )}
          {wo.status === 'ACTIVE' && (
            <Popconfirm
              title="ปิด WO นี้ (END)?"
              description="WO จะถูกปิด ไม่สามารถชั่งเพิ่มได้"
              onConfirm={() => changeStatus(wo, 'END')}
              okText="ยืนยัน END" cancelText="ยกเลิก"
              okButtonProps={{ danger: true }}
            >
              <Button size="small" danger>END</Button>
            </Popconfirm>
          )}
          {wo.status === 'ACTIVE' && (
            <Popconfirm
              title="เปลี่ยนสถานะเป็น SORTING?"
              description="WO จะเข้าสู่โหมดคัดแยก"
              onConfirm={() => changeStatus(wo, 'SORTING')}
              okText="ยืนยัน" cancelText="ยกเลิก"
            >
              <Button size="small" icon={<SyncOutlined />} style={{ color: '#d46b08', borderColor: '#d46b08' }}>Sorting</Button>
            </Popconfirm>
          )}
          {wo.status === 'END' && (
            <Popconfirm
              title="เปลี่ยนสถานะเป็น SORTING?"
              onConfirm={() => changeStatus(wo, 'SORTING')}
              okText="ยืนยัน" cancelText="ยกเลิก"
            >
              <Button size="small" icon={<SyncOutlined />}>Sorting</Button>
            </Popconfirm>
          )}
          {wo.status === 'END' && (
            <Popconfirm
              title="เปิด WO กลับมาใช้งาน (ACTIVE)?"
              description="WO จะกลับมาให้ Operator เลือกได้อีกครั้ง"
              onConfirm={() => changeStatus(wo, 'ACTIVE')}
              okText="ยืนยัน ACTIVE" cancelText="ยกเลิก"
            >
              <Button size="small" type="primary" icon={<CheckCircleOutlined />}>Re-Activate</Button>
            </Popconfirm>
          )}
          {wo.status === 'SORTING' && (
            <Popconfirm
              title="เปลี่ยนกลับเป็น ACTIVE?"
              onConfirm={() => changeStatus(wo, 'ACTIVE')}
              okText="ยืนยัน" cancelText="ยกเลิก"
            >
              <Button size="small" icon={<CheckCircleOutlined />}>Re-Activate</Button>
            </Popconfirm>
          )}
          <Popconfirm
            title={`ลบ WO #${wo.workOrderId}?`}
            description={
              <span>
                Lot: <b>{wo.lotNo}</b> จะถูกลบถาวร<br />
                <span style={{ color: '#ff4d4f' }}>ลบได้เฉพาะ WO ที่ยังไม่มีบันทึกการผลิต</span>
              </span>
            }
            onConfirm={() => deleteWO(wo)}
            okText="ลบถาวร"
            cancelText="ยกเลิก"
            okButtonProps={{ danger: true }}
          >
            <Tooltip title="ลบ WO (เฉพาะที่ยังไม่มีการผลิต)">
              <Button size="small" danger icon={<DeleteOutlined />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <Card>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'wo',
            label: 'Work Orders',
            children: (
              <>
                <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%', flexWrap: 'wrap' }}>
                  <Title level={4} style={{ margin: 0 }}>Work Order Management</Title>
                  <Space>
                    <Select value={filterStatus} onChange={setFilterStatus} style={{ width: 140 }}>
                      <Option value="ALL">ทั้งหมด</Option>
                      <Option value="ACTIVE">Active</Option>
                      <Option value="END">End</Option>
                      <Option value="SORTING">Sorting</Option>
                    </Select>
                    <Button type="primary" icon={<PlusOutlined />} onClick={openCreateModal}>
                      สร้าง WO ใหม่
                    </Button>
                    <Button onClick={loadWorkOrders} loading={loading}>Refresh</Button>
                  </Space>
                </Space>

                <Table
                  dataSource={workOrders}
                  rowKey="workOrderId"
                  columns={columns}
                  loading={loading}
                  pagination={{ pageSize: 20 }}
                  size="small"
                  scroll={{ x: true }}
                />
              </>
            ),
          },
          {
            key: 'machines',
            label: `M/C (${machines.length})`,
            children: <MachineManagement token={token} machines={machines} onRefresh={loadMasterData} />,
          },
        ]}
      />

      {/* WO Create / Edit Modal */}
      <Modal
        title={editingWO ? `แก้ไข WO #${editingWO.workOrderId}` : 'สร้าง Work Order ใหม่'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="บันทึก"
        cancelText="ยกเลิก"
        width={640}
        destroyOnClose
      >
        <Form form={form} layout="vertical" size="middle">

          {/* ─── ขั้นที่ 1: Rework หรือ WO ปกติ? ─── */}
          <Card size="small" style={{ marginBottom: 12, background: isRework ? '#fff7e6' : '#fafafa', borderColor: isRework ? '#ffa940' : '#d9d9d9' }}>
            <Space align="center" style={{ marginBottom: isRework ? 12 : 0 }}>
              <Switch
                checked={isRework}
                onChange={(v) => {
                  setIsRework(v)
                  if (!v) {
                    form.setFieldsValue({ reworkSourceWoId: undefined, reworkReason: undefined })
                    // unlock product — ล้างค่าที่ auto-fill มาจาก source WO
                    setSelectedProduct(null)
                    form.setFieldsValue({ productCode: undefined, customStd: undefined, customStd1: undefined, customStd2: undefined })
                  }
                }}
                checkedChildren="🔄 Rework"
                unCheckedChildren="WO ปกติ"
              />
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {isRework ? 'นำ WO เก่ามาทำซ้ำ — Product จะถูกกำหนดจาก WO ต้นฉบับ' : 'WO ผลิตปกติ'}
              </Typography.Text>
            </Space>

            {isRework && (
              <>
                <Form.Item
                  name="reworkSourceWoId"
                  label="WO ต้นฉบับ"
                  style={{ marginBottom: 8 }}
                  rules={[{ required: true, message: 'กรุณาเลือก WO ต้นฉบับ' }]}
                >
                  <Select
                    showSearch
                    placeholder="ค้นหา WO ต้นฉบับ (Lot No. / WO# / Product)"
                    optionFilterProp="label"
                    onChange={(woId: number) => {
                      const src = workOrders.find(w => w.workOrderId === woId)
                      if (src?.product) {
                        const p = products.find(x => x.productCode === src.product.productCode) ?? null
                        setSelectedProduct(p)
                        form.setFieldsValue({
                          productCode: src.product.productCode,
                          customStd: undefined,
                          customStd1: undefined,
                          customStd2: undefined,
                        })
                      }
                    }}
                    options={workOrders
                      .filter(w => !editingWO || w.workOrderId !== editingWO.workOrderId)
                      .map(w => ({
                        value: w.workOrderId,
                        label: `WO #${w.workOrderId} — Lot: ${w.lotNo} [${w.product?.productCode}] (${w.status})`,
                      }))}
                  />
                </Form.Item>
                <Form.Item name="reworkReason" label="เหตุผลที่ Rework" style={{ marginBottom: 0 }}>
                  <Input.TextArea rows={2} placeholder="เช่น ชั่งน้ำหนักไม่ผ่าน / ผลิตใหม่หลัง sorting" />
                </Form.Item>
              </>
            )}
          </Card>

          {/* ─── ขั้นที่ 2: Product (auto-fill + lock เมื่อ Rework) ─── */}
          <Form.Item
            name="productCode"
            label="Product"
            rules={[{ required: true, message: 'กรุณาเลือก Product' }]}
            extra={isRework && form.getFieldValue('reworkSourceWoId')
              ? <span style={{ color: '#fa8c16', fontSize: 12 }}>🔒 กำหนดจาก WO ต้นฉบับ — ปลดล็อกโดยปิด Rework</span>
              : undefined}
          >
            <Select
              showSearch
              placeholder="เลือก Product"
              optionFilterProp="children"
              disabled={isRework && !!form.getFieldValue('reworkSourceWoId')}
              onChange={(code: string) => {
                const p = products.find(x => x.productCode === code) ?? null
                setSelectedProduct(p)
                form.setFieldsValue({ customStd: undefined, customStd1: undefined, customStd2: undefined })
              }}
            >
              {products.map(p => (
                <Option key={p.productCode} value={p.productCode}>
                  {p.productCode} — {p.productName}
                </Option>
              ))}
            </Select>
          </Form.Item>

          {/* ─── ขั้นที่ 3: Lot No. ─── */}
          <Form.Item name="lotNo" label="Lot No." rules={[{ required: true, message: 'กรุณากรอก Lot No.' }]}>
            <Input placeholder="เช่น LOT-2025-001" />
          </Form.Item>

          {/* ─── ขั้นที่ 4: เลือกวันก่อน → ระบบตรวจ Scale + M/C ว่าง ─── */}
          <Space style={{ width: '100%' }}>
            <Form.Item name="startDate" label="วันเริ่มผลิต" style={{ flex: 1 }}>
              <DatePicker
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
                onChange={(val) => {
                  const end = form.getFieldValue('endDate')
                  checkAvailability(
                    val ? val.format('YYYY-MM-DD') : undefined,
                    end ? end.format('YYYY-MM-DD') : undefined
                  )
                }}
              />
            </Form.Item>
            <Form.Item name="endDate" label="วันสุดท้ายผลิต" style={{ flex: 1 }}>
              <DatePicker
                style={{ width: '100%' }}
                format="YYYY-MM-DD"
                onChange={(val) => {
                  const start = form.getFieldValue('startDate')
                  checkAvailability(
                    start ? start.format('YYYY-MM-DD') : undefined,
                    val ? val.format('YYYY-MM-DD') : undefined
                  )
                }}
              />
            </Form.Item>
          </Space>

          {/* ─── ขั้นที่ 5: Scale + M/C ที่ว่างในช่วงวันนั้น ─── */}
          <Space style={{ width: '100%' }}>
            <Form.Item
              name="scaleId"
              label="เครื่องชั่ง (Scale)"
              style={{ flex: 1 }}
              rules={[{ required: true, message: 'กรุณาเลือก Scale' }]}
              extra={availabilityLoading
                ? <span style={{ color: '#1890ff', fontSize: 12 }}>⏳ กำลังตรวจสอบความพร้อม...</span>
                : busyScales.size > 0 || busyMachines.size > 0
                  ? <span style={{ color: '#faad14', fontSize: 12 }}>🔒 = ถูกใช้งานในช่วงวันที่เลือก</span>
                  : undefined}
            >
              <Select showSearch placeholder="เลือก Scale" optionFilterProp="children">
                {scales.map(s => {
                  const conflict = busyScales.get(s.scaleId)
                  const isBusy = !!conflict
                  return (
                    <Option key={s.scaleId} value={s.scaleId} disabled={isBusy}>
                      <Tooltip title={isBusy
                        ? `ถูกใช้งานใน WO #${conflict!.conflictWoId} (${conflict!.conflictLotNo}) ${conflict!.conflictStart ?? ''} → ${conflict!.conflictEnd ?? ''}`
                        : undefined}>
                        <span style={{ color: isBusy ? '#bbb' : undefined }}>
                          {isBusy ? '🔒 ' : ''}{s.scaleName ?? s.scaleId}
                        </span>
                      </Tooltip>
                    </Option>
                  )
                })}
              </Select>
            </Form.Item>

            <Form.Item name="machineId" label="เครื่องจักร (M/C)" style={{ flex: 1 }} rules={[{ required: true, message: 'กรุณาเลือก M/C' }]}>
              <Select showSearch placeholder="เลือก M/C" optionFilterProp="children" allowClear>
                {activeMachines.map(m => {
                  const conflict = busyMachines.get(m.machineId)
                  const isBusy = !!conflict
                  return (
                    <Option key={m.machineId} value={m.machineId} disabled={isBusy}>
                      <Tooltip title={isBusy
                        ? `ถูกใช้งานใน WO #${conflict!.conflictWoId} (${conflict!.conflictLotNo}) ${conflict!.conflictStart ?? ''} → ${conflict!.conflictEnd ?? ''}`
                        : undefined}>
                        <Space size={4} style={{ color: isBusy ? '#bbb' : undefined }}>
                          {isBusy ? '🔒 ' : ''}<b>{m.machineName}</b>
                          {m.machineType && <Tag color={isBusy ? 'default' : (TYPE_COLOR[m.machineType] ?? 'default')} style={{ fontSize: 10 }}>{m.machineType}</Tag>}
                        </Space>
                      </Tooltip>
                    </Option>
                  )
                })}
              </Select>
            </Form.Item>
          </Space>

          <Card size="small" title="ค่า Standard (ถ้าไม่กรอก = ใช้จาก Product)" style={{ marginBottom: 8 }}>
            {!isDouble ? (
              <Form.Item name="customStd" label="Custom Std (SINGLE)">
                <InputNumber
                  style={{ width: '100%' }}
                  precision={4}
                  placeholder={`Product Std: ${selectedProduct?.standardWeight ?? '-'}`}
                />
              </Form.Item>
            ) : (
              <Space style={{ width: '100%' }}>
                <Form.Item name="customStd1" label="Custom Std ครั้งที่ 1" style={{ flex: 1 }}>
                  <InputNumber
                    style={{ width: '100%' }}
                    precision={4}
                    placeholder={`${selectedProduct?.standardWeight1 ?? '-'}`}
                  />
                </Form.Item>
                <Form.Item name="customStd2" label="Custom Std ครั้งที่ 2" style={{ flex: 1 }}>
                  <InputNumber
                    style={{ width: '100%' }}
                    precision={4}
                    placeholder={`${selectedProduct?.standardWeight2 ?? '-'}`}
                  />
                </Form.Item>
              </Space>
            )}
            {selectedProduct && (
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Mode: <b>{selectedProduct.weighingMode ?? 'SINGLE'}</b>
                {selectedProduct.standardWeight != null && ` | Product Std: ${selectedProduct.standardWeight}`}
                {selectedProduct.standardWeight1 != null && ` | Std1: ${selectedProduct.standardWeight1}`}
                {selectedProduct.standardWeight2 != null && ` | Std2: ${selectedProduct.standardWeight2}`}
              </Typography.Text>
            )}
          </Card>
        </Form>
      </Modal>
    </Card>
  )
}

// ─── Machine Management Sub-Component ────────────────────────────────────────

function MachineManagement({
  token,
  machines,
  onRefresh,
}: {
  token: string
  machines: Machine[]
  onRefresh: () => void
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const openCreate = () => {
    setEditingMachine(null)
    form.resetFields()
    setModalOpen(true)
  }

  const openEdit = (m: Machine) => {
    setEditingMachine(m)
    form.setFieldsValue({
      machineName: m.machineName,
      machineType: m.machineType ?? undefined,
      sortOrder: m.sortOrder ?? 99,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)
      if (editingMachine) {
        const r = await fetch(apiUrl(`/api/machines/${editingMachine.machineId}`), {
          method: 'PUT',
          headers: authHeaders,
          body: JSON.stringify(values),
        })
        if (!r.ok) { message.error('แก้ไขไม่สำเร็จ'); return }
        message.success('แก้ไข Machine สำเร็จ')
      } else {
        const r = await fetch(apiUrl('/api/machines'), {
          method: 'POST',
          headers: authHeaders,
          body: JSON.stringify({ ...values, isActive: true }),
        })
        if (!r.ok) { const t = await r.text(); message.error(`เพิ่มไม่สำเร็จ: ${t}`); return }
        message.success('เพิ่ม Machine สำเร็จ')
      }
      setModalOpen(false)
      onRefresh()
    } catch {} finally { setSaving(false) }
  }

  const toggleActive = async (m: Machine) => {
    const r = await fetch(apiUrl(`/api/machines/${m.machineId}`), {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ isActive: !m.isActive }),
    })
    if (r.ok) { message.success(`${m.machineName} ${!m.isActive ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}แล้ว`); onRefresh() }
    else message.error('เปลี่ยนสถานะไม่สำเร็จ')
  }

  const handleDelete = async (m: Machine) => {
    const r = await fetch(apiUrl(`/api/machines/${m.machineId}`), { method: 'DELETE', headers: authHeaders })
    if (r.ok) { message.success(`ลบ ${m.machineName} แล้ว`); onRefresh() }
    else message.error('ลบไม่สำเร็จ')
  }

  const machineColumns = [
    { title: 'Machine ID', dataIndex: 'machineId', width: 140, render: (v: string) => <b>{v}</b> },
    { title: 'ชื่อแสดงผล', dataIndex: 'machineName', width: 160 },
    {
      title: 'ประเภท', dataIndex: 'machineType', width: 120,
      render: (v: string) => v ? <Tag color={TYPE_COLOR[v] ?? 'default'}>{v}</Tag> : <span style={{ color: '#ddd' }}>—</span>
    },
    { title: 'ลำดับ', dataIndex: 'sortOrder', width: 70, align: 'center' as const },
    {
      title: 'ใช้งาน', dataIndex: 'isActive', width: 90, align: 'center' as const,
      render: (v: boolean, m: Machine) => (
        <Switch checked={v !== false} size="small" onChange={() => toggleActive(m)} />
      )
    },
    {
      title: 'Actions', width: 120,
      render: (_: unknown, m: Machine) => (
        <Space size="small">
          <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(m)}>แก้ไข</Button>
          <Popconfirm
            title={`ลบ ${m.machineName}?`}
            description="WO ที่อ้างถึง Machine นี้จะไม่มีข้อมูล M/C แสดง"
            onConfirm={() => handleDelete(m)}
            okText="ลบ" cancelText="ยกเลิก"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger>ลบ</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ]

  return (
    <>
      <Space style={{ marginBottom: 12, justifyContent: 'space-between', width: '100%' }}>
        <Title level={5} style={{ margin: 0 }}>จัดการเครื่องจักร (Machine)</Title>
        <Space>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>เพิ่ม Machine</Button>
          <Button onClick={onRefresh}>Refresh</Button>
        </Space>
      </Space>

      <Table
        dataSource={machines}
        rowKey="machineId"
        columns={machineColumns}
        pagination={false}
        size="small"
        rowClassName={(m: Machine) => m.isActive === false ? 'ant-table-row-disabled' : ''}
      />

      <Modal
        title={editingMachine ? `แก้ไข Machine: ${editingMachine.machineId}` : 'เพิ่ม Machine ใหม่'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => setModalOpen(false)}
        okText="บันทึก"
        cancelText="ยกเลิก"
        confirmLoading={saving}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          {!editingMachine && (
            <Form.Item name="machineId" label="Machine ID" rules={[{ required: true, message: 'กรุณากรอก Machine ID' }]}
              extra="รหัส unique เช่น RLB103, MANUAL-XOC (ไม่สามารถเปลี่ยนได้ภายหลัง)">
              <Input placeholder="เช่น RLB103" style={{ fontFamily: 'monospace' }} />
            </Form.Item>
          )}
          <Form.Item name="machineName" label="ชื่อแสดงผล" rules={[{ required: true, message: 'กรุณากรอกชื่อ' }]}>
            <Input placeholder="เช่น RLB103, Manual X-OC" />
          </Form.Item>
          <Space style={{ width: '100%' }}>
            <Form.Item name="machineType" label="ประเภท" style={{ flex: 1 }}>
              <Select placeholder="เลือกประเภท" allowClear>
                <Option value="PRODUCTION">PRODUCTION</Option>
                <Option value="MANUAL">MANUAL</Option>
                <Option value="PACKING">PACKING</Option>
              </Select>
            </Form.Item>
            <Form.Item name="sortOrder" label="ลำดับแสดงผล" style={{ flex: 1 }}>
              <InputNumber style={{ width: '100%' }} min={0} placeholder="0" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  )
}
