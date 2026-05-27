import { useEffect, useRef, useState } from 'react'
import { Card, Select, Table, Tag, Button, Modal, Input, InputNumber, Alert, Space, Typography, Tooltip } from 'antd'
import { apiUrl } from '../api'

type WorkOrder = {
  workOrderId: number
  product: { productCode: string; productName: string; weighingMode?: string }
  scale: { scaleId: string }
  lotNo: string
  status: string
}

type Measurement = {
  measurementId: number
  outerBox: string
  innerOrder: string
  weight: number | null
  weight1: number | null
  weight2: number | null
  status: string
  timestamp: string
  operatorName: string
  std?: number
  std1?: number
  std2?: number
  tolerance?: number
  tolerance1?: number
  tolerance2?: number
  weightPerPiece?: number
}

type HistoryEntry = {
  id: number
  createdBy: string
  createdAt: string
  description: string
}

// Case 1: ย้าย Outer เท่านั้น (Inner + Weight ตามไป)
// Case 2: ย้าย Outer + เปลี่ยน Weight (Inner ตามไป)
// Case 3: ย้าย Outer + เปลี่ยน Inner + เปลี่ยน Weight
const CASES = [
  { key: '1', label: 'Case 1 — ย้าย Outer (Inner & Weight ตามเดิม)' },
  { key: '2', label: 'Case 2 — ย้าย Outer + เปลี่ยน Weight (Inner ตามเดิม)' },
  { key: '3', label: 'Case 3 — ย้าย Outer + เปลี่ยน Inner + เปลี่ยน Weight' },
]

function getStatusColor(s: string) {
  if (s === 'GREEN') return 'green'
  if (s === 'YELLOW') return 'gold'
  if (s === 'RED') return 'red'
  return 'default'
}

// คำนวณ status จากน้ำหนักและ std (SINGLE mode)
function calcStatus(weight: number | null, std: number | undefined, tol: number | undefined, wpp: number | undefined): 'GREEN' | 'YELLOW' | 'RED' | null {
  if (weight == null || std == null || std === 0) return null
  const halfWpp = (wpp ?? 0) / 2
  const min = halfWpp > 0 ? std - halfWpp : 0
  const max = halfWpp > 0 ? std + halfWpp : Infinity
  const dmin = std - (tol ?? 0)
  const dmax = std + (tol ?? 0)
  if (weight < min || weight > max) return 'RED'
  if (weight < dmin || weight > dmax) return 'YELLOW'
  return 'GREEN'
}

function calcStatusDouble(w1: number | null, w2: number | null, std1: number | undefined, std2: number | undefined, tol1: number | undefined, tol2: number | undefined, wpp: number | undefined): 'GREEN' | 'YELLOW' | 'RED' | null {
  if (w1 == null || w2 == null) return null
  const s1 = calcStatus(w1, std1, tol1, wpp)
  const s2 = calcStatus(w2, std2, tol2, wpp)
  if (s1 === 'RED' || s2 === 'RED') return 'RED'
  if (s1 === 'YELLOW' || s2 === 'YELLOW') return 'YELLOW'
  if (s1 === 'GREEN' && s2 === 'GREEN') return 'GREEN'
  return null
}

// แสดงช่วง Std ± tolerance
function stdRangeText(std: number | undefined, tol: number | undefined, wpp: number | undefined): string {
  if (std == null || std === 0) return '-'
  const halfWpp = (wpp ?? 0) / 2
  const green1 = std - (tol ?? 0)
  const green2 = std + (tol ?? 0)
  const red1 = halfWpp > 0 ? std - halfWpp : null
  const red2 = halfWpp > 0 ? std + halfWpp : null
  let txt = `Std: ${std.toFixed(3)} | YELLOW: ${green1.toFixed(3)}–${green2.toFixed(3)}`
  if (red1 != null && red2 != null) txt += ` | RED: <${red1.toFixed(3)} หรือ >${red2.toFixed(3)}`
  return txt
}

function parseDesc(desc: string): Record<string, string> {
  try { return JSON.parse(desc) } catch { return {} }
}

// แปลง raw text จากเครื่องชั่ง → ตัวเลข (รองรับทั้ง paste และ line-by-line Enter)
function parseScaleWeight(raw: string): number | null {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    // รูปแบบ "0.500g", "0,500 g", "500.000g" ฯลฯ
    const m = line.match(/([0-9]+[.,][0-9]+)\s*g?\s*$/)
    if (m) {
      const v = parseFloat(m[1].replace(',', '.'))
      if (!isNaN(v) && v > 0) return v
    }
  }
  // fallback: บรรทัดแรกที่เป็นตัวเลขล้วน
  for (const line of lines) {
    const v = parseFloat(line.replace(',', '.'))
    if (!isNaN(v) && v > 0) return v
  }
  return null
}

export function SortingPage({ token, username }: Readonly<{ token: string; username: string }>) {
  const headers = { Authorization: `Bearer ${token}` }
  const authJson = { ...headers, 'Content-Type': 'application/json' }

  const [woList, setWoList] = useState<WorkOrder[]>([])
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null)
  const [selectedCase, setSelectedCase] = useState<string>('')
  const [outerList, setOuterList] = useState<string[]>([])
  const [selectedOuter, setSelectedOuter] = useState<string>('')
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [loading, setLoading] = useState(false)

  // Edit modal
  const [editRow, setEditRow] = useState<Measurement | null>(null)
  const [newOuter, setNewOuter] = useState<string>('')
  const [newInner, setNewInner] = useState<string>('')
  const [newWeight, setNewWeight] = useState<number | null>(null)
  const [newWeight1, setNewWeight1] = useState<number | null>(null)
  const [newWeight2, setNewWeight2] = useState<number | null>(null)
  const [reason, setReason] = useState<string>('')
  const [editError, setEditError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // History
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [histLoading, setHistLoading] = useState(false)

  // Bulk move state (Case 1 ย้ายทั้ง Outer พร้อมกัน)
  const [bulkNewOuter, setBulkNewOuter] = useState<string>('')
  const [bulkReason, setBulkReason] = useState<string>('')
  const [bulkSaving, setBulkSaving] = useState(false)

  // Scale capture state (modal Case 2 & 3)
  const [scaleBuffer, setScaleBuffer] = useState('')
  const [scaleLines, setScaleLines] = useState<string[]>([])
  const [scaleCaptureMsg, setScaleCaptureMsg] = useState('')
  const [scaleStep, setScaleStep] = useState(0) // DOUBLE: 0 = W1, 1 = W2
  const [scaleFocused, setScaleFocused] = useState(false)
  const scaleInputRef = useRef<any>(null)

  // Load SORTING WOs
  useEffect(() => {
    fetch(apiUrl('/api/work-orders?status=SORTING'), { headers })
      .then(r => r.ok ? r.json() : [])
      .then(setWoList)
      .catch(() => setWoList([]))
  }, [token])

  // Auto-focus scale input เมื่อ modal เปิด (Case 2 & 3)
  useEffect(() => {
    if (editRow && (selectedCase === '2' || selectedCase === '3')) {
      setScaleBuffer('')
      setScaleLines([])
      setScaleCaptureMsg('')
      setScaleStep(0)
      setScaleFocused(false)
      setTimeout(() => scaleInputRef.current?.focus(), 150)
    }
  }, [editRow])

  const selectWo = async (woId: number) => {
    const wo = woList.find(w => w.workOrderId === woId) ?? null
    setSelectedWo(wo)
    setSelectedOuter('')
    setMeasurements([])
    setOuterList([])
    setSelectedCase('')
    setSuccessMsg(null)
    if (!wo) return
    // โหลด outer list
    setLoading(true)
    try {
      const qs = new URLSearchParams({ productCode: wo.product.productCode, scaleId: wo.scale.scaleId, lotNo: wo.lotNo })
      const r = await fetch(apiUrl('/api/measurements/history?' + qs), { headers })
      if (r.ok) {
        const data: any[] = await r.json()
        const outers = [...new Set<string>(
          data.filter(d => d.outerBoxNumber && d.outerBoxNumber !== '000').map(d => d.outerBoxNumber)
        )].sort((a, b) => parseInt(a) - parseInt(b))
        setOuterList(outers)
      }
    } finally { setLoading(false) }
    // โหลด history
    loadHistory(wo.lotNo)
  }

  const loadHistory = async (lotNo: string) => {
    setHistLoading(true)
    try {
      const r = await fetch(apiUrl('/api/logs/sorting-history?lotNo=' + encodeURIComponent(lotNo)), { headers })
      if (r.ok) setHistory(await r.json())
    } finally { setHistLoading(false) }
  }

  const selectOuter = async (outer: string) => {
    setSelectedOuter(outer)
    setMeasurements([])
    if (!selectedWo) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({ productCode: selectedWo.product.productCode, scaleId: selectedWo.scale.scaleId, lotNo: selectedWo.lotNo, outerBox: outer })
      const r = await fetch(apiUrl('/api/measurements/by-outer?' + qs), { headers })
      if (r.ok) setMeasurements(await r.json())
    } finally { setLoading(false) }
  }

  const openEdit = (row: Measurement) => {
    setEditRow(row)
    setNewOuter('')
    setNewInner(row.innerOrder)
    setNewWeight(row.weight)
    setNewWeight1(row.weight1)
    setNewWeight2(row.weight2)
    setReason('')
    setEditError(null)
  }

  const isDouble = selectedWo?.product?.weighingMode === 'DOUBLE'

  // โหลด outer list ใหม่จาก server (เรียกหลังแก้ไขสำเร็จ)
  const reloadOuterList = async (wo: WorkOrder) => {
    const qs = new URLSearchParams({ productCode: wo.product.productCode, scaleId: wo.scale.scaleId, lotNo: wo.lotNo })
    const r = await fetch(apiUrl('/api/measurements/history?' + qs), { headers })
    if (r.ok) {
      const data: any[] = await r.json()
      const outers = [...new Set<string>(
        data.filter(d => d.outerBoxNumber && d.outerBoxNumber !== '000').map(d => d.outerBoxNumber)
      )].sort((a, b) => parseInt(a) - parseInt(b))
      setOuterList(outers)
    }
  }

  const saveEdit = async () => {
    if (!editRow || !selectedWo) return
    if (!newOuter.trim()) { setEditError('กรุณาระบุ Outer ใหม่'); return }
    if (!reason.trim()) { setEditError('กรุณาระบุเหตุผล'); return }
    if (selectedCase === '3' && !newInner.trim()) { setEditError('กรุณาระบุ Inner ใหม่'); return }

    // ตรวจสอบ: ถ้า Case 2 หรือ 3 และน้ำหนักใหม่ได้ผลสถานะ RED → ไม่อนุญาตบันทึก
    if (selectedCase === '2' || selectedCase === '3') {
      const redStatus = isDouble
        ? calcStatusDouble(newWeight1, newWeight2, editRow.std1, editRow.std2, editRow.tolerance1, editRow.tolerance2, editRow.weightPerPiece) === 'RED'
        : calcStatus(newWeight, editRow.std, editRow.tolerance, editRow.weightPerPiece) === 'RED'
      if (redStatus) {
        setEditError('⛔ ไม่สามารถบันทึกได้ — น้ำหนักที่ระบุอยู่นอกเกณฑ์ (สถานะ RED) กรุณาตรวจสอบค่าน้ำหนักใหม่อีกครั้ง')
        return
      }
    }

    setSaving(true)
    setEditError(null)
    try {
      const body: any = {
        newOuter: newOuter.trim(),
        newInner: selectedCase === '3' ? newInner.trim() : editRow.innerOrder,
        changeWeightToo: selectedCase === '2' || selectedCase === '3',
        reason,
        changedBy: username,
      }
      if (body.changeWeightToo) {
        if (isDouble) { body.newWeight1 = newWeight1; body.newWeight2 = newWeight2 }
        else { body.newWeight = newWeight }
      }
      const r = await fetch(apiUrl(`/api/measurements/${editRow.measurementId}/relocate`), {
        method: 'PUT', headers: authJson, body: JSON.stringify(body),
      })
      const txt = await r.text().catch(() => '')
      if (r.ok) {
        const outerChanged = newOuter.trim() !== editRow.outerBox
        setSuccessMsg(`✅ แก้ไขสำเร็จ: Outer ${editRow.outerBox}→${newOuter.trim()} | Inner ${editRow.innerOrder}${selectedCase === '3' ? `→${newInner.trim()}` : ''}`)
        setEditRow(null)
        // reload outer list เพื่ออัปเดต dropdown (อาจมี outer ใหม่เกิดขึ้น)
        await reloadOuterList(selectedWo)
        // ถ้า outer เปลี่ยน ให้โหลด outer เดิม (จะเหลือน้อยลง หรือว่างถ้าย้ายหมด)
        await selectOuter(outerChanged ? editRow.outerBox : selectedOuter)
        loadHistory(selectedWo.lotNo)
      } else if (r.status === 409 && txt.startsWith('DUPLICATE_INNER:')) {
        setEditError(`⚠️ ${txt.replace('DUPLICATE_INNER:', '')}`)
      } else if (r.status === 403) {
        setEditError('⛔ ไม่มีสิทธิ์ดำเนินการ (403)')
      } else {
        setEditError(`❌ แก้ไขไม่สำเร็จ (${r.status}): ${txt}`)
      }
    } catch { setEditError('เกิดข้อผิดพลาดในการเชื่อมต่อ') }
    finally { setSaving(false) }
  }

  // Case 1: ย้ายทั้ง Outer พร้อมกัน (bulk)
  const saveBulk = async () => {
    if (!selectedWo || !selectedOuter || measurements.length === 0) return
    if (!bulkNewOuter.trim()) { setEditError('กรุณาระบุ Outer ใหม่'); return }
    if (!bulkReason.trim()) { setEditError('กรุณาระบุเหตุผล'); return }
    setBulkSaving(true)
    setEditError(null)
    let successCount = 0
    let errorMsg = ''
    const total = measurements.length
    for (const m of measurements) {
      try {
        const body = { newOuter: bulkNewOuter.trim(), newInner: m.innerOrder, changeWeightToo: false, reason: bulkReason, changedBy: username }
        const r = await fetch(apiUrl(`/api/measurements/${m.measurementId}/relocate`), {
          method: 'PUT', headers: authJson, body: JSON.stringify(body),
        })
        if (r.ok) successCount++
        else {
          const t = await r.text().catch(() => '')
          if (r.status === 403) errorMsg = '⛔ ไม่มีสิทธิ์ดำเนินการ (403)'
          else if (r.status === 409 && t.startsWith('DUPLICATE_INNER:')) errorMsg = `⚠️ ${t.replace('DUPLICATE_INNER:', '')}`
          else errorMsg = `เกิดข้อผิดพลาด (${r.status})${t && t.length < 200 ? ': ' + t : ''}`
          break
        }
      } catch { errorMsg = 'เกิดข้อผิดพลาด'; break }
    }
    setBulkSaving(false)
    if (!errorMsg) {
      setSuccessMsg(`✅ ย้ายสำเร็จ ${successCount}/${total} รายการ: Outer ${selectedOuter} → ${bulkNewOuter.trim()}`)
      const oldOuter = selectedOuter
      setBulkNewOuter('')
      setBulkReason('')
      // reload outer list และสลับมาดู outer เดิม (จะว่างเปล่า แสดงว่าย้ายหมดแล้ว)
      await reloadOuterList(selectedWo)
      await selectOuter(oldOuter)
      loadHistory(selectedWo.lotNo)
    } else {
      setEditError(`❌ ล้มเหลวหลังจาก ${successCount}/${total} รายการ: ${errorMsg}`)
    }
  }

  const modalTitle = editRow
    ? `Case ${selectedCase} — แก้ไข Outer ${editRow.outerBox} / Inner ${editRow.innerOrder}`
    : ''

  return (
    <Card title="Sorting" size="small">
      {/* Step 1: เลือก WO */}
      <Space wrap style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Work Order (SORTING)</div>
          <Select
            showSearch style={{ minWidth: 340 }} placeholder="เลือก WO ที่ต้องการ Sorting"
            value={selectedWo?.workOrderId ?? undefined}
            loading={loading}
            onChange={selectWo}
            filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
            options={woList.map(w => ({
              value: w.workOrderId,
              label: `WO#${w.workOrderId} — ${w.product?.productCode} | Lot: ${w.lotNo} | Scale: ${w.scale?.scaleId}`,
            }))}
          />
        </div>
        {selectedWo && (
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Case</div>
            <Select style={{ minWidth: 360 }} placeholder="เลือก Case การแก้ไข"
              value={selectedCase || undefined}
              onChange={v => { setSelectedCase(v); setSuccessMsg(null); setEditError(null) }}
              options={CASES.map(c => ({ value: c.key, label: c.label }))}
            />
          </div>
        )}
        {selectedWo && selectedCase && (
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>Outer เดิม</div>
            <Select style={{ minWidth: 140 }} placeholder="เลือก Outer"
              value={selectedOuter || undefined}
              loading={loading}
              onChange={selectOuter}
              options={outerList.map(o => ({ value: o, label: `Outer ${o}` }))}
            />
          </div>
        )}
      </Space>

      {/* WO Info */}
      {selectedWo && (
        <div style={{ fontSize: 12, color: '#555', marginBottom: 8, background: '#f5f5f5', padding: '4px 8px', borderRadius: 4 }}>
          Product: <b>{selectedWo.product?.productCode}</b>
          &nbsp;|&nbsp;Scale: <b>{selectedWo.scale?.scaleId}</b>
          &nbsp;|&nbsp;Lot: <b>{selectedWo.lotNo}</b>
          &nbsp;|&nbsp;Mode: <b>{selectedWo.product?.weighingMode ?? 'SINGLE'}</b>
          &nbsp;|&nbsp;Status: <Tag color="orange">SORTING</Tag>
        </div>
      )}

      {successMsg && <Alert type="success" message={successMsg} closable onClose={() => setSuccessMsg(null)} style={{ marginBottom: 8 }} />}
      {editError && !editRow && <Alert type="error" message={editError} closable onClose={() => setEditError(null)} style={{ marginBottom: 8 }} />}

      {/* Case 1 Bulk Action */}
      {selectedCase === '1' && selectedOuter && measurements.length > 0 && (
        <Card size="small" style={{ marginBottom: 12, background: '#fffbe6', border: '1px solid #ffe58f' }}
          title={`Case 1: ย้าย Outer ${selectedOuter} ทั้งหมด (${measurements.length} รายการ) ไป Outer ใหม่`}>
          <Space wrap>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>Outer ใหม่</div>
              <Input value={bulkNewOuter} onChange={e => setBulkNewOuter(e.target.value)} style={{ width: 100 }} placeholder="เช่น 005" />
            </div>
            <div>
              <div style={{ fontSize: 12, marginBottom: 4 }}>เหตุผล <span style={{ color: 'red' }}>*</span></div>
              <Input value={bulkReason} onChange={e => setBulkReason(e.target.value)} style={{ width: 280 }} placeholder="เหตุผลที่ย้าย Outer" />
            </div>
            <div style={{ marginTop: 20 }}>
              <Button type="primary" loading={bulkSaving} onClick={saveBulk} disabled={!bulkNewOuter.trim() || !bulkReason.trim()}>
                ย้ายทั้ง Outer
              </Button>
            </div>
          </Space>
        </Card>
      )}

      {/* Measurements table */}
      {measurements.length > 0 && (
        <Table
          size="small"
          dataSource={measurements}
          rowKey={(r: any) => String(r.measurementId)}
          loading={loading}
          pagination={{ pageSize: 15, hideOnSinglePage: true }}
          scroll={{ x: 580 }}
          style={{ marginBottom: 12 }}
          columns={[
            { title: 'Outer', dataIndex: 'outerBox', width: 70, render: (v: string) => <Tag color="purple">{v}</Tag> },
            { title: 'Inner', dataIndex: 'innerOrder', width: 70, render: (v: string) => <Tag color="cyan">{v}</Tag> },
            {
              title: 'น้ำหนัก', width: 120,
              render: (_: any, r: Measurement) => r.weight1 != null
                ? `${Number(r.weight1).toFixed(3)} / ${Number(r.weight2).toFixed(3)}`
                : (r.weight != null ? Number(r.weight).toFixed(3) : '-'),
            },
            { title: 'Status', dataIndex: 'status', width: 80, render: (s: string) => <Tag color={getStatusColor(s)}>{s}</Tag> },
            { title: 'เวลา', dataIndex: 'timestamp', ellipsis: true, render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
            { title: 'Operator', dataIndex: 'operatorName', ellipsis: true },
            {
              title: 'แก้ไข', width: 70,
              render: (_: any, row: Measurement) =>
                selectedCase && selectedCase !== '1'
                  ? <Button size="small" onClick={() => openEdit(row)}>แก้ไข</Button>
                  : null,
            },
          ] as any}
        />
      )}

      {/* Sorting History */}
      {selectedWo && (
        <Card size="small" title="History การแก้ไข (Sorting)" loading={histLoading} style={{ marginTop: 8 }}>
          {history.length === 0
            ? <Typography.Text type="secondary">ยังไม่มีประวัติการแก้ไข</Typography.Text>
            : (
              <Table
                size="small"
                dataSource={history}
                rowKey={(r: any) => String(r.id)}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                scroll={{ x: 700 }}
                columns={[
                  { title: 'เวลา', dataIndex: 'createdAt', width: 160, render: (v: string) => new Date(v).toLocaleString() },
                  { title: 'โดย', dataIndex: 'createdBy', width: 100 },
                  { title: 'Outer เดิม→ใหม่', width: 130, render: (_: any, r: HistoryEntry) => { const d = parseDesc(r.description); return `${d.oldOuter ?? '-'} → ${d.newOuter ?? '-'}` } },
                  { title: 'Inner เดิม→ใหม่', width: 130, render: (_: any, r: HistoryEntry) => { const d = parseDesc(r.description); return d.oldInner === d.newInner ? d.oldInner ?? '-' : `${d.oldInner ?? '-'} → ${d.newInner ?? '-'}` } },
                  { title: 'Weight เดิม→ใหม่', width: 160, render: (_: any, r: HistoryEntry) => { const d = parseDesc(r.description); if (String(d.changeWeightToo) === 'true') { return d.newWeight1 ? `(${d.oldWeight1}/${d.oldWeight2}) → (${d.newWeight1}/${d.newWeight2})` : `${d.oldWeight} → ${d.newWeight}` } return '-' } },
                  { title: 'เหตุผล', dataIndex: 'description', ellipsis: true, render: (v: string) => { const d = parseDesc(v); return d.reason ?? '-' } },
                ] as any}
              />
            )
          }
        </Card>
      )}

      {/* Edit Modal (Case 2 & 3) */}
      <Modal
        open={!!editRow}
        onCancel={() => setEditRow(null)}
        onOk={saveEdit}
        okText="บันทึก"
        cancelText="ยกเลิก"
        confirmLoading={saving}
        title={modalTitle}
        width={480}
      >
        {editRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <b>ข้อมูลเดิม:</b>&nbsp;
              Outer <Tag color="purple">{editRow.outerBox}</Tag>
              Inner <Tag color="cyan">{editRow.innerOrder}</Tag>
              น้ำหนัก {editRow.weight1 != null ? `${editRow.weight1}/${editRow.weight2}` : (editRow.weight ?? '-')}
              &nbsp;<Tag color={getStatusColor(editRow.status)}>{editRow.status}</Tag>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <div>
                <div style={{ marginBottom: 4 }}>Outer ใหม่ <span style={{ color: 'red' }}>*</span></div>
                <Input value={newOuter} onChange={e => { setNewOuter(e.target.value); setEditError(null) }} style={{ width: 100 }} placeholder="เช่น 005" />
              </div>
              {selectedCase === '3' && (
                <div>
                  <div style={{ marginBottom: 4 }}>Inner ใหม่ <span style={{ color: 'red' }}>*</span></div>
                  <Input value={newInner} onChange={e => { setNewInner(e.target.value); setEditError(null) }} style={{ width: 100 }} />
                </div>
              )}
            </div>

            {/* Weight (Case 2 & 3) */}
            {(selectedCase === '2' || selectedCase === '3') && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Std range info */}
                {editRow && (
                  <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 4, padding: '6px 10px', fontSize: 12 }}>
                    <b>Std ปัจจุบัน:</b>{' '}
                    {isDouble ? (
                      <>
                        W1: {editRow.std1 != null ? editRow.std1.toFixed(3) : '-'}
                        {editRow.tolerance1 != null && ` (±${editRow.tolerance1.toFixed(3)})`}
                        &nbsp;|&nbsp;
                        W2: {editRow.std2 != null ? editRow.std2.toFixed(3) : '-'}
                        {editRow.tolerance2 != null && ` (±${editRow.tolerance2.toFixed(3)})`}
                      </>
                    ) : (
                      <Tooltip title={stdRangeText(editRow.std, editRow.tolerance, editRow.weightPerPiece)}>
                        <span style={{ cursor: 'help', textDecoration: 'underline dotted' }}>
                          {editRow.std != null ? editRow.std.toFixed(3) : '-'}
                          {editRow.tolerance != null && ` ±${editRow.tolerance.toFixed(3)}`}
                          {editRow.weightPerPiece != null && ` (RED ถ้า ±${(editRow.weightPerPiece / 2).toFixed(3)})`}
                        </span>
                      </Tooltip>
                    )}
                  </div>
                )}
                {/* Scale Capture Input */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <b style={{ fontSize: 12 }}>รับค่าจากเครื่องชั่ง</b>
                    {isDouble && (
                      <span style={{ fontSize: 12, color: '#1677ff' }}>
                        — กำลังรับ: <b>น้ำหนัก {scaleStep === 0 ? '1' : '2'}</b>
                      </span>
                    )}
                    <span style={{
                      fontSize: 11, fontWeight: 'bold', padding: '1px 8px', borderRadius: 10,
                      background: scaleFocused ? '#f6ffed' : '#fff1f0',
                      color: scaleFocused ? '#52c41a' : '#ff4d4f',
                      border: `1px solid ${scaleFocused ? '#b7eb8f' : '#ffa39e'}`,
                    }}>
                      {scaleFocused ? '● พร้อมรับค่า' : '○ ยังไม่ได้ focus'}
                    </span>
                    {!scaleFocused && (
                      <Button size="small" type="primary" ghost
                        onClick={() => { scaleInputRef.current?.focus() }}
                        style={{ fontSize: 11, height: 22, padding: '0 8px' }}>
                        คลิกเพื่อรับค่า
                      </Button>
                    )}
                  </div>
                  <Input
                    ref={scaleInputRef}
                    value={scaleBuffer}
                    onChange={e => setScaleBuffer(e.target.value)}
                    onFocus={() => setScaleFocused(true)}
                    onBlur={() => setScaleFocused(false)}
                    onPaste={e => {
                      e.preventDefault()
                      const raw = e.clipboardData.getData('text')
                      const w = parseScaleWeight(raw)
                      if (w != null) {
                        if (isDouble) {
                          if (scaleStep === 0) { setNewWeight1(w); setScaleStep(1); setScaleCaptureMsg(`✅ W1 = ${w.toFixed(3)} — รอ W2`) }
                          else { setNewWeight2(w); setScaleStep(0); setScaleCaptureMsg(`✅ W2 = ${w.toFixed(3)} — ครบแล้ว`) }
                        } else {
                          setNewWeight(w)
                          setScaleCaptureMsg(`✅ รับค่า: ${w.toFixed(3)} g`)
                        }
                        setScaleBuffer('')
                        setScaleLines([])
                      } else {
                        setScaleCaptureMsg('⚠️ ไม่สามารถอ่านค่าจากเครื่องชั่ง')
                      }
                    }}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        const newLines = [...scaleLines, scaleBuffer]
                        if (newLines.length >= 3) {
                          // บรรทัดแรก = น้ำหนัก
                          const w = parseScaleWeight(newLines[0])
                          if (w != null) {
                            if (isDouble) {
                              if (scaleStep === 0) { setNewWeight1(w); setScaleStep(1); setScaleCaptureMsg(`✅ W1 = ${w.toFixed(3)} — รอ W2`) }
                              else { setNewWeight2(w); setScaleStep(0); setScaleCaptureMsg(`✅ W2 = ${w.toFixed(3)} — ครบแล้ว`) }
                            } else {
                              setNewWeight(w)
                              setScaleCaptureMsg(`✅ รับค่า: ${w.toFixed(3)} g`)
                            }
                          } else {
                            setScaleCaptureMsg('⚠️ ไม่สามารถอ่านค่าจากเครื่องชั่ง')
                          }
                          setScaleLines([])
                          setScaleBuffer('')
                        } else {
                          setScaleLines(newLines)
                          setScaleBuffer('')
                        }
                      }
                    }}
                    placeholder="วางเคอร์เซอร์ที่นี่ แล้วส่งข้อมูลจากเครื่องชั่ง..."
                    style={{ width: '100%' }}
                  />
                  {scaleCaptureMsg && (
                    <div style={{ fontSize: 12, marginTop: 4, color: scaleCaptureMsg.startsWith('✅') ? '#52c41a' : '#faad14' }}>
                      {scaleCaptureMsg}
                    </div>
                  )}
                </div>

                {/* Manual weight input (fallback / ปรับแก้ได้) */}
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                  {isDouble ? (
                    <>
                      <div>
                        <div style={{ marginBottom: 4 }}>น้ำหนัก 1</div>
                        <InputNumber value={newWeight1} onChange={v => setNewWeight1(v)} style={{ width: 120 }} step={0.001} />
                      </div>
                      <div>
                        <div style={{ marginBottom: 4 }}>น้ำหนัก 2</div>
                        <InputNumber value={newWeight2} onChange={v => setNewWeight2(v)} style={{ width: 120 }} step={0.001} />
                      </div>
                    </>
                  ) : (
                    <div>
                      <div style={{ marginBottom: 4 }}>น้ำหนักใหม่</div>
                      <InputNumber value={newWeight} onChange={v => setNewWeight(v)} style={{ width: 140 }} step={0.001} />
                    </div>
                  )}
                  {/* Live status preview */}
                  {editRow && (() => {
                    const preview = isDouble
                      ? calcStatusDouble(newWeight1, newWeight2, editRow.std1, editRow.std2, editRow.tolerance1, editRow.tolerance2, editRow.weightPerPiece)
                      : calcStatus(newWeight, editRow.std, editRow.tolerance, editRow.weightPerPiece)
                    if (!preview) return null
                    return (
                      <div style={{ marginBottom: 2 }}>
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>สถานะที่จะได้</div>
                        <Tag color={getStatusColor(preview)} style={{ fontSize: 13, padding: '2px 10px' }}>{preview}</Tag>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )}

            <div>
              <div style={{ marginBottom: 4 }}>เหตุผล <span style={{ color: 'red' }}>*</span></div>
              <Input.TextArea rows={2} value={reason}
                onChange={e => { setReason(e.target.value); setEditError(null) }}
                placeholder="ระบุเหตุผลในการแก้ไข..." />
            </div>
            {editError && <Alert type="error" message={editError} showIcon />}
          </div>
        )}
      </Modal>
    </Card>
  )
}
