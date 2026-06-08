import { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Table, Tag, Space, Button, Modal, Input, message, Alert, Tooltip, Statistic, Select, Switch, Typography, InputNumber } from 'antd'
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, ResponsiveContainer, Legend, ReferenceLine } from 'recharts'
import { apiUrl } from '../api'

interface Approval {
  id: number
  type: string
  status: string
  approverRole: string
  note?: string
  stage?: string
  requestedBy?: string
  requestedAt?: string
  actionAt?: string
  actionBy?: string
  payloadJson?: string
}

type MachineStatus = {
  machineId: string
  machineName?: string
  machineType?: string
  workOrderId?: number
  scaleId?: string
  scaleName?: string
  active?: boolean
  lastProductCode?: string
  lastLotNo?: string
  lastOuterBox?: string
  lastInnerOrder?: string
  lastStatus?: string
  lastTimestamp?: string
  consecutiveYellow: number
  pendingRed: number
  pendingCleaning: number
  pendingOuter: number
  pendingStd: number
  pendingStdLeader: number
  needsQa: boolean
  needsLeader: boolean
}

function getStatusColor(status: string) {
  if (status === 'GREEN') return 'green';
  if (status === 'YELLOW') return 'gold';
  if (status === 'RED') return 'red';
  if (status === 'STD_CHANGE') return 'purple';
  if (status === 'PENDING') return 'gold';
  if (status === 'APPROVED') return 'green';
  return 'default';
}

export function LeaderDashboard({ token, username, onHandled }: Readonly<{ token: string; username: string; onHandled: () => void }>) {
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [error, setError] = useState<string>('')
  const [selected, setSelected] = useState<Approval | null>(null)
  const [note, setNote] = useState('')
  const [refreshTick, setRefreshTick] = useState(0)
  // Fixed table height to avoid page jitter
  const [tableH, setTableH] = useState<number>(420)
  // Series for value-vs-standards chart
  const [products, setProducts] = useState<any[]>([])
  const [scales, setScales] = useState<any[]>([])
  const [selProduct, setSelProduct] = useState<string>('')
  const [selScale, setSelScale] = useState<string>('')
  const [selLot, setSelLot] = useState<string>('')
  // Auto refresh controls
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true)
  const [refreshSec, setRefreshSec] = useState<number>(10)
  // Report modal
  const [reportOpen, setReportOpen] = useState(false)
  const [reportRows, setReportRows] = useState<any[]>([])
  const [reportLoading, setReportLoading] = useState(false)
  const [lotSummary, setLotSummary] = useState<{ lotNo?: string; total: number; green: number; yellow: number; red: number }|null>(null)
  const [lotItems, setLotItems] = useState<any[]>([])
  const [lotEvents, setLotEvents] = useState<{ redUnlocks: any[]; stdChanges: any[] }|null>(null)
  // Polite refresh controls
  const [pauseRefresh, setPauseRefresh] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([])
  const [machineStatuses, setMachineStatuses] = useState<MachineStatus[]>([])

  // LD แก้ไข Inner/น้ำหนัก ตาม WO
  const [ldWoList, setLdWoList] = useState<any[]>([])
  const [ldSelectedWo, setLdSelectedWo] = useState<any | null>(null)
  const [ldOuterList, setLdOuterList] = useState<string[]>([])
  const [ldSelectedOuter, setLdSelectedOuter] = useState<string>('')
  const [ldMeasurements, setLdMeasurements] = useState<any[]>([])
  const [ldLoading, setLdLoading] = useState(false)
  const [ldEditRow, setLdEditRow] = useState<any | null>(null)
  const [ldEditForm, setLdEditForm] = useState<{ newInner: string; changeWeightToo: boolean; newWeight: number | null; newWeight1: number | null; newWeight2: number | null; reason: string }>({ newInner: '', changeWeightToo: false, newWeight: null, newWeight1: null, newWeight2: null, reason: '' })
  const [ldEditSaving, setLdEditSaving] = useState(false)
  const [ldEditError, setLdEditError] = useState<string | null>(null)
  const [ldMsg, setLdMsg] = useState<string | null>(null)
  // Scale capture state (LD weight modal)
  const [ldScaleBuf, setLdScaleBuf] = useState('')
  const [ldScaleLines, setLdScaleLines] = useState<string[]>([])
  const [ldScaleMsg, setLdScaleMsg] = useState('')
  const [ldScaleFocused, setLdScaleFocused] = useState(false)
  const [ldScaleStep, setLdScaleStep] = useState(0) // DOUBLE: 0=W1 1=W2
  const ldScaleRef = useRef<any>(null)

  const processApprovalsData = (data: Approval[]) => {
    // กันรายการซ้ำ: กล่องเดียวกันอาจถูกสร้าง approval ซ้ำในอดีต ให้เหลือ 1 ต่อ (product,scale,lot,outer,inner)
    const byKey = new Map<string, Approval>()
    for (const a of data) {
      let p: any = {}
      try { p = a.payloadJson ? JSON.parse(a.payloadJson) : {} } catch {}
      if (p.productCode || p.scaleId || p.lotNo || p.outerBox || p.innerOrder) {
        const key = [p.productCode||'', p.scaleId||'', p.lotNo||'', p.outerBox||'', p.innerOrder||''].join('|')
        const prev = byKey.get(key)
        if (!prev || (a.id > prev.id)) byKey.set(key, a)
      } else {
        // ไม่มี payload → แสดงได้ตามปกติ (ใช้ id เป็น key เดี่ยว) เพื่อไม่ให้ข้อมูลหาย
        byKey.set(`legacy-${a.id}`, a)
      }
    }
    const next = Array.from(byKey.values())
    // Stable sort to reduce row reordering flicker
    next.sort((a,b) => (a.id - b.id))
    // Only update when changed to avoid unnecessary re-render
    const curIds = approvals.map(a=>a.id).join(',')
    const nextIds = next.map(a=>a.id).join(',')
    if (curIds !== nextIds) setApprovals(next)
    // Try infer default selection from a pending item with payload
    const firstWithPayload = data.map(d => safePayload(d)).find(p => p.productCode && p.scaleId)
    if (firstWithPayload) {
      if (!selProduct) setSelProduct(firstWithPayload.productCode)
      if (!selScale) setSelScale(firstWithPayload.scaleId)
      if (!selLot && firstWithPayload.lotNo) setSelLot(firstWithPayload.lotNo)
    }
  }

  const fetchApprovals = async () => {
    // ใช้ soft refresh ไม่แสดง spinner เพื่อหลีกเลี่ยงอาการหน้าจอสั่น
    setError('')
    try {
  const r = await fetch(apiUrl('/api/approvals/leader-pending?withPayloadOnly=true'), { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) {
        const data: Approval[] = await r.json()
        if (data && data.length > 0) {
          processApprovalsData(data)
        } else {
          const r2 = await fetch(apiUrl('/api/approvals/leader-pending?withPayloadOnly=false'), { headers: { Authorization: `Bearer ${token}` } })
          if (r2.ok) {
            const allData: Approval[] = await r2.json()
            setApprovals(allData)
          }
        }
      } else {
        setError('ไม่สามารถโหลดรายการอนุมัติ')
        setApprovals([])
      }
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ')
      setApprovals([])
    } finally {
      // no hard loading toggle
    }
  }

  const fetchMachineStatus = async () => {
    try {
      const r = await fetch(apiUrl('/api/reports/machine-status'), { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) setMachineStatuses((await r.json()) || [])
    } catch {}
  }

  // LD WO-based edit functions
  const ldSelectWo = async (woId: number) => {
    const wo = ldWoList.find((w: any) => w.workOrderId === woId) || null
    setLdSelectedWo(wo)
    setLdSelectedOuter('')
    setLdMeasurements([])
    setLdOuterList([])
    setLdMsg(null)
    if (!wo) return
    const pc = wo.product?.productCode || ''
    const sc = wo.scale?.scaleId || ''
    const ln = wo.lotNo || ''
    if (!pc || !ln) return
    setLdLoading(true)
    try {
      const qs = new URLSearchParams({ productCode: pc, scaleId: sc, lotNo: ln })
      const r = await fetch(apiUrl('/api/measurements/history?' + qs.toString()), { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) {
        const data: any[] = await r.json()
        const outers = [...new Set<string>(
          data.filter(d => d.outerBoxNumber && d.outerBoxNumber !== '000').map(d => d.outerBoxNumber)
        )].sort((a, b) => parseInt(a) - parseInt(b))
        setLdOuterList(outers)
      }
    } finally { setLdLoading(false) }
  }

  const ldSelectOuter = async (outer: string) => {
    setLdSelectedOuter(outer)
    setLdMeasurements([])
    if (!ldSelectedWo || !outer) return
    setLdLoading(true)
    try {
      const pc = ldSelectedWo.product?.productCode || ''
      const sc = ldSelectedWo.scale?.scaleId || ''
      const ln = ldSelectedWo.lotNo || ''
      const qs = new URLSearchParams({ productCode: pc, scaleId: sc, lotNo: ln, outerBox: outer })
      const r = await fetch(apiUrl('/api/measurements/by-outer?' + qs.toString()), { headers: { Authorization: `Bearer ${token}` } })
      if (r.ok) setLdMeasurements(await r.json())
    } finally { setLdLoading(false) }
  }

  const ldOpenEdit = (row: any) => {
    setLdEditRow(row)
    setLdEditForm({ newInner: row.innerOrder || '', changeWeightToo: false, newWeight: row.weight ?? null, newWeight1: row.weight1 ?? null, newWeight2: row.weight2 ?? null, reason: '' })
    setLdEditError(null)
  }

  const ldSaveEdit = async () => {
    if (!ldEditRow) return
    if (!ldEditForm.newInner.trim()) { setLdEditError('กรุณาระบุ Inner ใหม่'); return }
    if (!ldEditForm.reason.trim()) { setLdEditError('กรุณาระบุเหตุผล'); return }
    // ป้องกันบันทึกน้ำหนักที่ได้ผล RED
    if (ldEditForm.changeWeightToo) {
      const ldIsDouble = (ldSelectedWo?.product?.weighingMode || 'SINGLE') === 'DOUBLE'
      const isRed = ldIsDouble
        ? ldCalcStatusDouble(ldEditForm.newWeight1, ldEditForm.newWeight2, ldEditRow.std1, ldEditRow.std2, ldEditRow.tolerance1, ldEditRow.tolerance2, ldEditRow.weightPerPiece) === 'RED'
        : ldCalcStatus(ldEditForm.newWeight, ldEditRow.std, ldEditRow.tolerance, ldEditRow.weightPerPiece) === 'RED'
      if (isRed) { setLdEditError('⛔ ไม่สามารถบันทึกได้ — น้ำหนักที่ระบุอยู่นอกเกณฑ์ (สถานะ RED)'); return }
    }
    setLdEditSaving(true)
    setLdEditError(null)
    try {
      const weighMode = ldSelectedWo?.product?.weighingMode || 'SINGLE'
      const body: any = {
        newOuter: ldEditRow.outerBox,
        newInner: ldEditForm.newInner.trim(),
        changeWeightToo: ldEditForm.changeWeightToo,
        reason: ldEditForm.reason,
        changedBy: username,
      }
      if (ldEditForm.changeWeightToo) {
        if (weighMode === 'DOUBLE') {
          body.newWeight1 = ldEditForm.newWeight1
          body.newWeight2 = ldEditForm.newWeight2
        } else {
          body.newWeight = ldEditForm.newWeight
        }
      }
      const r = await fetch(apiUrl(`/api/measurements/${ldEditRow.measurementId}/relocate`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      if (r.ok) {
        setLdMsg('แก้ไขสำเร็จ')
        setLdEditRow(null)
        await ldSelectOuter(ldSelectedOuter)
      } else {
        const txt = await r.text().catch(() => '')
        if (r.status === 403) {
          setLdEditError('⛔ ไม่มีสิทธิ์ กรุณา Logout แล้ว Login ใหม่')
        } else if (r.status === 409 && txt.startsWith('DUPLICATE_INNER:')) {
          setLdEditError(`⚠️ ${txt.replace('DUPLICATE_INNER:', '')}`)
        } else {
          setLdEditError(`❌ แก้ไขไม่สำเร็จ (${r.status}): ${txt}`)
        }
      }
    } catch { setLdEditError('เกิดข้อผิดพลาดในการเชื่อมต่อ') }
    finally { setLdEditSaving(false) }
  }

  useEffect(() => { fetchApprovals(); fetchMachineStatus(); }, [refreshTick])

  // Persist auth token for other pages (e.g., report.html)
  useEffect(() => {
    try {
      if (token && typeof token === 'string' && token.length > 0) {
        localStorage.setItem('authToken', token)
      }
    } catch {}
  }, [token])
  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => setRefreshTick(tk => tk + 1), refreshSec * 1000)
    return () => clearInterval(t)
  }, [autoRefresh, refreshSec])

  // Pause auto-refresh when user interacts or modal is open or page is hidden
  useEffect(() => {
    if (!autoRefresh) return
    const tick = setInterval(() => {
      if (pauseRefresh || reportOpen || selected || document.hidden) return
      setRefreshTick(tk => tk + 1)
    }, refreshSec * 1000)
    return () => clearInterval(tick)
  }, [autoRefresh, refreshSec, pauseRefresh, reportOpen, selected])

  // Calculate responsive table height that fits screen
  useEffect(() => {
    const calc = () => {
      const h = Math.max(280, window.innerHeight - 360)
      setTableH(h)
    }
    calc()
    window.addEventListener('resize', calc)
    return () => window.removeEventListener('resize', calc)
  }, [])

  // Auto-focus scale input เมื่อ toggle เปิด "เปลี่ยนน้ำหนักด้วย"
  useEffect(() => {
    if (ldEditForm.changeWeightToo && ldEditRow) {
      setLdScaleBuf(''); setLdScaleLines([]); setLdScaleMsg(''); setLdScaleFocused(false); setLdScaleStep(0)
      setTimeout(() => ldScaleRef.current?.focus(), 150)
    }
  }, [ldEditForm.changeWeightToo])

  // Load master lists
  useEffect(() => {
    (async () => {
      try {
        const headers = { Authorization: `Bearer ${token}` }
        const [pr, sr, wor] = await Promise.all([
          fetch(apiUrl('/api/products'), { headers }),
          fetch(apiUrl('/api/scales'), { headers }),
          fetch(apiUrl('/api/work-orders'), { headers }),
        ])
        if (pr.ok) setProducts(await pr.json());
        if (sr.ok) setScales(await sr.json());
        if (wor.ok) setLdWoList(await wor.json());
      } catch {}
    })()
  }, [token])

  const openApprove = (a: Approval) => {
    setSelected(a)
    setNote('')
  }

  const doApprove = async () => {
    if (!selected) return
    if (!note.trim()) {
      message.warning('กรุณาใส่เหตุผล/หมายเหตุ')
      return
    }
    try {
      const r = await fetch(apiUrl(`/api/approvals/${selected.id}/approve-with-note`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ actionBy: username, note })
      })
      if (r.ok) {
        message.success('อนุมัติ RED สำเร็จ')
        setSelected(null)
        onHandled()
        fetchApprovals()
      } else {
        message.error('อนุมัติไม่สำเร็จ')
      }
    } catch {
      message.error('เกิดข้อผิดพลาดในการอนุมัติ')
    }
  }

  const doApproveCleaning = async (a: Approval) => {
    try {
      const r = await fetch(apiUrl(`/api/approvals/${a.id}/approve-with-note`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ actionBy: username, note: 'ตรวจสอบและอนุมัติการทำความสะอาดเครื่องชั่ง' })
      })
      if (r.ok) {
        message.success('อนุมัติการทำความสะอาดสำเร็จ — Operator สามารถชั่งต่อได้')
        onHandled()
        fetchApprovals()
      } else {
        message.error('อนุมัติไม่สำเร็จ')
      }
    } catch {
      message.error('เกิดข้อผิดพลาด')
    }
  }

  const safePayload = (a: Approval): any => {
    if (!a.payloadJson) return {}
    try { return JSON.parse(a.payloadJson) } catch { return {} }
  }
  const columns = [
    { title: 'ID', dataIndex: 'id', width: 56 },
    { title: 'ประเภท', dataIndex: 'type', width: 110, ellipsis: true, render: (t: string) => {
      if (t === 'RED_EVENT') return <Tag color="red">🔴 RED</Tag>
      if (t === 'CLEANING_CHECK') return <Tag color="cyan">🧹 ทำความสะอาด</Tag>
      return <Tag color="blue">{t}</Tag>
    }},
    { title: 'สถานะ', dataIndex: 'status', width: 84, ellipsis: true, render: (s: string) => <Tag color={getStatusColor(s)}>{s}</Tag> },
    { title: 'Product', ellipsis: true, render: (_: any, row: Approval) => { const p = safePayload(row).productCode; return p ? <Tag color="blue">{p}</Tag> : '-' } },
    { title: 'Scale', ellipsis: true, render: (_: any, row: Approval) => { const sc = safePayload(row).scaleId; return sc ? <Tag>{sc}</Tag> : '-' } },
    { title: 'Lot', ellipsis: true, render: (_: any, row: Approval) => { const lot = safePayload(row).lotNo; return lot ? <Tooltip title={lot}><span style={{ maxWidth: 140, display:'inline-block', overflow:'hidden', textOverflow:'ellipsis', verticalAlign:'middle' }}>{lot}</span></Tooltip> : '-' } },
    { title: 'Outer', width: 72, render: (_: any, row: Approval) => { const o = safePayload(row).outerBox; return o ? <Tag color="purple">{o}</Tag> : '-' } },
    { title: 'Inner', width: 72, render: (_: any, row: Approval) => { const i = safePayload(row).innerOrder; return i ? <Tag color="cyan">{i}</Tag> : '-' } },
    { title: 'น้ำหนัก', width: 110, render: (_: any, row: Approval) => {
      const p = safePayload(row)
      if (p.weight1 != null) return <span style={{ fontFamily:'monospace', fontSize:12 }}>{Number(p.weight1).toFixed(3)} / {Number(p.weight2).toFixed(3)}</span>
      return p.weight != null ? <span style={{ fontFamily:'monospace', fontSize:12 }}>{Number(p.weight).toFixed(3)}</span> : '-'
    }},
    { title: 'Std', width: 84, render: (_: any, row: Approval) => {
      const p = safePayload(row)
      if (row.type !== 'RED_EVENT') return '-'
      if (p.std1 != null) return <span style={{ fontFamily:'monospace', fontSize:12, color:'#888' }}>{Number(p.std1).toFixed(3)}/{Number(p.std2).toFixed(3)}</span>
      return p.std != null ? <span style={{ fontFamily:'monospace', fontSize:12, color:'#888' }}>{Number(p.std).toFixed(3)}</span> : '-'
    }},
    { title: 'Stage', dataIndex: 'stage', ellipsis: true, render: (v: string) => v || '-' },
    { title: 'แจ้งโดย', dataIndex: 'requestedBy', ellipsis: true, render: (v: string) => v || '-' },
    { title: 'เวลาแจ้ง', dataIndex: 'requestedAt', ellipsis: true, render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
    { title: 'อนุมัติโดย', dataIndex: 'actionBy', ellipsis: true, render: (v: string, row: Approval) => {
      if (!v) return '-'
      return (
        <span>
          <span style={{ fontWeight: 600 }}>{v}</span>
          {row.actionAt && <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>{new Date(row.actionAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}</span>}
        </span>
      )
    }},
    { title: 'ดำเนินการ', width: 130, render: (_: any, row: Approval) => {
      if (row.status !== 'PENDING' || row.approverRole !== 'LEADER') return null
      if (row.type === 'CLEANING_CHECK') {
        const p = safePayload(row)
        return (
          <Tooltip title={`Scale: ${p.scaleId} | ${p.hourLabel || ''}`}>
            <Button type="primary" size="small" style={{ background: '#0ea5e9', borderColor: '#0ea5e9' }}
              onClick={() => doApproveCleaning(row)}>
              🧹 อนุมัติ Clean
            </Button>
          </Tooltip>
        )
      }
      return <Button type="primary" size="small" onClick={() => openApprove(row)}>อนุมัติ</Button>
    }}
  ]

  return (
    <Card title={
      <Space>
        <Typography.Text strong>Leader Dashboard</Typography.Text>
      </Space>
    } size="small" styles={{ body: { overflowX: 'hidden' } }}>
      {/* Toolbar: Auto refresh + Report + manual refresh */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:8, width:'100%', maxWidth:'100%', overflow:'hidden' }}>
        <Space size={8} wrap>
          <Button type="primary" onClick={async () => {
            try {
              // request one-time token for report page (5 minutes)
              const r = await fetch(apiUrl('/api/reports/otk'), { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
              if (!r.ok) throw new Error('create otk failed')
              const js = await r.json()
              const otk = js?.otk
              const url = selLot ? `/report.html#otk=${encodeURIComponent(otk)}&lot=${encodeURIComponent(selLot)}` : `/report.html#otk=${encodeURIComponent(otk)}`
              window.open(url, '_blank', 'noopener,noreferrer')
            } catch {
              const url = selLot ? `/report.html?lot=${encodeURIComponent(selLot)}` : '/report.html'
              window.open(url, '_blank', 'noopener,noreferrer')
            }
          }}>Report</Button>
          <Button onClick={() => fetchApprovals()}>รีเฟรช</Button>
        </Space>
        <Space size={8} wrap style={{ marginLeft:'auto' }}>
          <Switch checked={autoRefresh} onChange={setAutoRefresh} checkedChildren="Auto" unCheckedChildren="Manual" />
          <Select size="small" style={{ width: 80 }} value={refreshSec} onChange={setRefreshSec} disabled={!autoRefresh}
                  options={[{value:5,label:'5s'},{value:10,label:'10s'},{value:30,label:'30s'}]} />
        </Space>
      </div>

      {/* Summary widgets */}
      <Space wrap style={{ marginBottom: 12 }}>
        <Card size="small"><Statistic title="Pending" value={approvals.filter(a => a.status === 'PENDING').length} /></Card>
        <Card size="small"><Statistic title="Approved (Today)" value={approvals.filter(a => a.status === 'APPROVED' && isToday(a.actionAt)).length} /></Card>
        <Card size="small"><Statistic title="Total Items" value={approvals.length} /></Card>
      </Space>

      {/* Machine Status Table */}
      <Card size="small" title={
        <Space>
          <Typography.Text strong>สถานะเครื่องจักร (Machine Status)</Typography.Text>
          <Tag>{machineStatuses.length} machines</Tag>
          {machineStatuses.filter(x => x.needsLeader).length > 0 && (
            <Tag color="red">ต้องการ LD: {machineStatuses.filter(x => x.needsLeader).length}</Tag>
          )}
        </Space>
      } style={{ marginBottom: 12 }}>
        <Table
          dataSource={machineStatuses.map(x => ({ key: x.machineId, ...x }))}
          pagination={false}
          size="small"
          columns={[
            {
              title: 'Machine', key: 'machine',
              render: (_: any, r: MachineStatus) => {
                const todayStr = new Date().toISOString().substring(0, 10)
                const scheduledWos = ldWoList.filter((wo: any) =>
                  wo.status === 'ACTIVE' &&
                  wo.machine?.machineId === r.machineId &&
                  (wo.startDate == null || wo.startDate <= todayStr) &&
                  (wo.endDate == null || wo.endDate >= todayStr)
                )
                const notStarted = scheduledWos.length > 0 && !r.active
                return (
                  <span>
                    <b>{r.machineId}</b>{r.machineName && r.machineName !== r.machineId ? ` - ${r.machineName}` : ''}
                    {notStarted
                      ? <Tag color="warning" style={{ marginLeft: 6, fontSize: 11 }}>⚠ มี WO แต่ยังไม่เริ่ม</Tag>
                      : !r.active && <Tag color="default" style={{ marginLeft: 6, fontSize: 11 }}>ไม่มีการทำงาน</Tag>
                    }
                  </span>
                )
              }
            },
            {
              title: 'Scale', key: 'scale',
              render: (_: any, r: MachineStatus) => r.scaleId
                ? <Tag>{r.scaleId}{r.scaleName ? ` - ${r.scaleName}` : ''}</Tag>
                : <span style={{ color: '#bbb' }}>—</span>
            },
            {
              title: 'WO วันนี้', key: 'scheduledWo',
              render: (_: any, r: MachineStatus) => {
                const todayStr = new Date().toISOString().substring(0, 10)
                const scheduledWos = ldWoList.filter((wo: any) =>
                  wo.status === 'ACTIVE' &&
                  wo.machine?.machineId === r.machineId &&
                  (wo.startDate == null || wo.startDate <= todayStr) &&
                  (wo.endDate == null || wo.endDate >= todayStr)
                )
                if (scheduledWos.length === 0) return <span style={{ color: '#bbb' }}>—</span>
                return (
                  <Space direction="vertical" size={2}>
                    {scheduledWos.map((wo: any) => {
                      const isRunning = r.active && (r.workOrderId === wo.workOrderId || r.lastLotNo === wo.lotNo)
                      return (
                        <Tooltip
                          key={wo.workOrderId}
                          title={
                            <span>
                              Product: {wo.product?.productCode} — {wo.product?.productName}<br />
                              Scale: {wo.scale?.scaleId}<br />
                              วันผลิต: {wo.startDate ?? '∞'} → {wo.endDate ?? '∞'}<br />
                              สร้างโดย: {wo.createdBy}<br />
                              {wo.operatorNames && <>Operator: {wo.operatorNames}</>}
                            </span>
                          }
                        >
                          <Tag
                            color={isRunning ? 'green' : 'orange'}
                            style={{ cursor: 'default', fontSize: 11 }}
                          >
                            {isRunning ? '▶ ' : '⏸ '}WO #{wo.workOrderId} · {wo.lotNo}
                            <span style={{ marginLeft: 4, opacity: 0.8 }}>[{wo.product?.productCode}]</span>
                          </Tag>
                        </Tooltip>
                      )
                    })}
                  </Space>
                )
              }
            },
            {
              title: 'Product / Lot', key: 'product',
              render: (_: any, r: MachineStatus) => r.active ? (
                <span>
                  <b>{r.lastProductCode || '-'}</b>
                  {r.lastLotNo && <span style={{ marginLeft: 6, fontSize: 11, color: '#888' }}>Lot: {r.lastLotNo}</span>}
                </span>
              ) : <span style={{ color: '#bbb' }}>—</span>
            },
            {
              title: 'ตำแหน่งปัจจุบัน', key: 'pos',
              render: (_: any, r: MachineStatus) => r.active ? (
                <span style={{ fontFamily: 'monospace' }}>
                  Outer <b>{r.lastOuterBox || '-'}</b> / Inner <b>{r.lastInnerOrder || '-'}</b>
                </span>
              ) : <span style={{ color: '#bbb' }}>—</span>
            },
            {
              title: 'สถานะล่าสุด', key: 'lastStatus',
              render: (_: any, r: MachineStatus) => {
                if (!r.active) return <span style={{ color: '#bbb' }}>—</span>
                const v = r.lastStatus
                return v ? <Tag color={v === 'GREEN' ? 'green' : v === 'YELLOW' ? 'gold' : 'red'} style={{ fontSize: 12 }}>{v}</Tag> : '-'
              }
            },
            {
              title: 'รายการรออนุมัติ', key: 'pending',
              render: (_: any, r: MachineStatus) => {
                const tags: any[] = []
                if (r.pendingRed > 0)       tags.push(<Tag key="red"   color="red"       style={{ fontSize: 11 }}>🔴 RED ×{r.pendingRed}</Tag>)
                if (r.pendingCleaning > 0)  tags.push(<Tag key="clean" color="orange"    style={{ fontSize: 11 }}>🧹 ทำความสะอาด ×{r.pendingCleaning}</Tag>)
                if (r.pendingStdLeader > 0) tags.push(<Tag key="stdl"  color="purple"    style={{ fontSize: 11 }}>⚖️ Std รออนุมัติ ×{r.pendingStdLeader}</Tag>)
                if (r.pendingOuter > 0)     tags.push(<Tag key="outer" color="blue"      style={{ fontSize: 11 }}>📦 Outer ×{r.pendingOuter}</Tag>)
                if (r.pendingStd > 0)       tags.push(<Tag key="std"   color="geekblue"  style={{ fontSize: 11 }}>⚖️ Std รอ QA ×{r.pendingStd}</Tag>)
                return tags.length > 0 ? <Space size={4} wrap>{tags}</Space> : <span style={{ color: '#bbb', fontSize: 11 }}>—</span>
              }
            },
            {
              title: 'YELLOW ต่อเนื่อง', dataIndex: 'consecutiveYellow',
              render: (v: number, r: MachineStatus) => {
                if (!r.active) return <span style={{ color: '#bbb' }}>—</span>
                return (
                  <span>
                    <b style={{ color: v >= 5 ? '#fa8c16' : v >= 3 ? '#d4a72c' : undefined }}>{v}</b>
                    {v >= 5 && <Tag color="orange" style={{ marginLeft: 6, fontSize: 11 }}>ครบ 5 — รอ Std ใหม่</Tag>}
                    {v >= 3 && v < 5 && <Tag color="gold" style={{ marginLeft: 6, fontSize: 11 }}>เตือน {v}/5</Tag>}
                  </span>
                )
              }
            },
            {
              title: 'ต้องการดำเนินการ', key: 'needsAction',
              render: (_: any, r: MachineStatus) => {
                const todayStr = new Date().toISOString().substring(0, 10)
                const scheduledWos = ldWoList.filter((wo: any) =>
                  wo.status === 'ACTIVE' &&
                  wo.machine?.machineId === r.machineId &&
                  (wo.startDate == null || wo.startDate <= todayStr) &&
                  (wo.endDate == null || wo.endDate >= todayStr)
                )
                const notStarted = scheduledWos.length > 0 && !r.active
                if (r.needsLeader) return <Tag color="red" style={{ fontWeight: 600 }}>ต้องการดำเนินการ</Tag>
                if (r.needsQa)     return <Tag color="orange" style={{ fontWeight: 600 }}>รอ QA ดำเนินการ</Tag>
                if (notStarted)    return <Tag color="warning" style={{ fontWeight: 600 }}>⚠ ควรเริ่มทำงาน</Tag>
                if (!r.active)     return <span style={{ color: '#bbb', fontSize: 11 }}>—</span>
                return <Tag color="green">ปกติ</Tag>
              }
            }
          ] as any}
        />
      </Card>

      {/* Action bar removed (merged into toolbar above) */}
      {/* Removed value vs standards graph from Leader as requested */}


      <Modal
        open={reportOpen}
        onCancel={() => setReportOpen(false)}
        title="รายงานย้อนหลังแบบสรุปตาม Lot"
        width={900}
        style={{ maxWidth: '90vw' }}
        footer={null}
      >
        <Space wrap style={{ marginBottom: 8 }}>
          <Select showSearch style={{ minWidth: 220 }} placeholder="Product" value={selProduct || undefined}
                  onChange={setSelProduct} options={products.map((p:any)=>({ value:p.productCode, label:`${p.productCode} - ${p.productName||''}` }))} />
          <Select showSearch style={{ minWidth: 180 }} placeholder="Scale" value={selScale || undefined}
                  onChange={setSelScale} options={scales.map((s:any)=>({ value:s.scaleId, label:s.scaleId }))} />
          <Button type="primary" loading={reportLoading} onClick={async ()=>{
            if (!selProduct || !selScale) { message.info('โปรดเลือก Product และ Scale'); return }
            setReportLoading(true)
            try {
              const qs = new URLSearchParams({ productCode: selProduct, scaleId: selScale })
              const r = await fetch(apiUrl('/api/reports/lot-summary?' + qs.toString()), { headers: { Authorization: `Bearer ${token}` } })
              setReportRows(r.ok ? await r.json() : [])
              // reset lot details when reloading summary
              setLotSummary(null); setLotItems([])
            } finally { setReportLoading(false) }
          }}>โหลดรายงาน</Button>
        </Space>
        <Space wrap style={{ marginBottom: 8 }}>
          <Select showSearch style={{ minWidth: 240 }} placeholder="เลือก Lot เพื่อดูรายงาน"
                  value={selLot || undefined}
                  onChange={async (lot)=>{
                    setSelLot(lot)
                    if (!selProduct || !selScale || !lot) return
                    try {
                      const qs = new URLSearchParams({ productCode: selProduct, scaleId: selScale, lotNo: lot })
                      const r = await fetch(apiUrl('/api/reports/lot-details?' + qs.toString()), { headers: { Authorization: `Bearer ${token}` } })
                      if (r.ok) {
                        const js = await r.json()
                        setLotSummary(js.summary || null)
                        setLotItems(js.items || [])
                      } else { setLotSummary(null); setLotItems([]) }
                      const ev = await fetch(apiUrl('/api/reports/lot-events?' + qs.toString()), { headers: { Authorization: `Bearer ${token}` } })
                      setLotEvents(ev.ok ? await ev.json() : null)
                    } catch { setLotSummary(null); setLotItems([]) }
                  }}
                  options={reportRows.map((r:any)=>({ value:r.lotNo, label:`${r.lotNo} (${Number.isFinite(r.avg)?Number(r.avg).toFixed(2):'-'})` }))}
          />
          <Button onClick={()=>{ if (!selLot) { message.info('โปรดเลือก Lot'); return } }}>แสดงรายละเอียด Lot</Button>
        </Space>
        {lotSummary && (
          <Space wrap style={{ marginBottom: 8 }}>
            <Card size="small"><Statistic title="Total" value={lotSummary.total} /></Card>
            <Card size="small"><Statistic title="GREEN" value={lotSummary.green} /></Card>
            <Card size="small"><Statistic title="YELLOW" value={lotSummary.yellow} /></Card>
            <Card size="small"><Statistic title="RED" value={lotSummary.red} /></Card>
          </Space>
        )}
        {(lotItems.length > 0 || (lotEvents?.stdChanges?.length || 0) > 0) && (() => {
          // จัดกลุ่มตาม Outer
          const groupedByOuter: Record<string, any[]> = {}
          lotItems.forEach(item => {
            const outer = item.outerBox || '000'
            if (!groupedByOuter[outer]) groupedByOuter[outer] = []
            groupedByOuter[outer].push(item)
          })
          
          // แทรกเหตุการณ์ STD Change ลงใน Timeline
          if (lotEvents && lotEvents.stdChanges) {
            lotEvents.stdChanges.forEach((e: any) => {
              let outer = e.locationOuter || e.outer
              let inner = e.locationInner || e.inner

              // Try to extract from payloadJson if available (Most accurate)
              if (e.payloadJson) {
                try {
                  const p = JSON.parse(e.payloadJson);
                  if (p.outerBox) outer = p.outerBox;
                  if (p.innerOrder) inner = p.innerOrder;
                } catch {}
              }

              if (!outer && e.locationInner) {
                 const match = lotItems.find(i => i.innerOrder === e.locationInner)
                 if (match) outer = match.outerBox
              }
              outer = outer || '000'
              if (!groupedByOuter[outer]) groupedByOuter[outer] = []
              
              groupedByOuter[outer].push({
                innerOrder: inner || '',
                outerBox: outer,
                weight: null,
                weight1: null,
                weight2: null,
                std: e.newStd,
                status: 'STD_CHANGE',
                timestamp: e.time || e.approvedAt,
                approvedBy: e.approvedBy,
                reason: e.reason
              })
            })
          }
          
          // เรียงลำดับ Outer แบบตัวเลข (1, 2, 10) แทนตัวอักษร (1, 10, 2)
          const outerKeys = Object.keys(groupedByOuter).sort((a, b) => parseInt(a) - parseInt(b))
          
          // สีพื้นหลัง Outer สลับกันแบบชัดเจน
          const outerColors = ['#FFE4B5', '#FFD4A3', '#FFC891', '#FFBC7F']
          
          return (
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {outerKeys.map((outer, idx) => {
                const items = groupedByOuter[outer]
                // เรียงลำดับ Inner และเวลาภายใน Outer
                items.sort((a, b) => {
                   const ia = Number.parseInt(a.innerOrder, 10) || 0
                   const ib = Number.parseInt(b.innerOrder, 10) || 0
                   if (ia !== ib) return ia - ib
                   return (new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                })

                const greenCount = items.filter(i => i.status === 'GREEN').length
                const yellowCount = items.filter(i => i.status === 'YELLOW').length
                const redCount = items.filter(i => i.status === 'RED').length
                
                const bgColor = outerColors[idx % outerColors.length]
                
                return (
                  <div key={outer} style={{ 
                    width: 'calc(50% - 8px)',
                    minWidth: 400,
                    padding: 16, 
                    border: '3px solid #333', 
                    borderRadius: 12,
                    backgroundColor: bgColor,
                    boxShadow: '0 4px 8px rgba(0,0,0,0.15)'
                  }}>
                    {/* หัวกล่อง Outer ใหญ่ */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: 12
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          fontSize: 48,
                          fontWeight: 'bold',
                          color: '#333',
                          lineHeight: 1,
                          minWidth: 60,
                          textAlign: 'center'
                        }}>
                          {Number.parseInt(outer, 10)}
                        </div>
                        <div style={{ fontSize: 20, fontWeight: 600, color: '#555' }}>
                          Outer {outer}
                        </div>
                      </div>
                      <Space direction="vertical" size={4}>
                        <div style={{ display: 'flex', gap: 8 }}>
                          <Tag color="green" style={{ margin: 0, fontSize: 12 }}>✓ {greenCount}</Tag>
                          <Tag color="gold" style={{ margin: 0, fontSize: 12 }}>⚠ {yellowCount}</Tag>
                          <Tag color="red" style={{ margin: 0, fontSize: 12 }}>✗ {redCount}</Tag>
                        </div>
                        <Tag color="blue" style={{ margin: 0, fontSize: 12 }}>Total: {items.length}</Tag>
                      </Space>
                    </div>
                    
                    {/* ตาราง Inner boxes */}
                    <Table 
                      size="small" 
                      dataSource={items} 
                      rowKey={(r:any)=>`${r.timestamp}-${r.outerBox}-${r.innerOrder}`}
                      pagination={false}
                      bordered
                      columns={[
                        { 
                          title:'Inner', 
                          dataIndex:'innerOrder', 
                          width: 70,
                          align: 'center' as const,
                          render: (v:any) => <strong>{String(v).padStart(4, '0')}</strong>
                        },
                        { 
                          title:'น้ำหนักรวม', 
                          dataIndex:'weight', 
                          width: 90,
                          align: 'right' as const,
                          render:(v:number|null)=> (v !== null && Number.isFinite(v)) ? v.toFixed(3) : '-' 
                        },
                        ...(items.some((i: any) => i.weight1 != null || i.weight2 != null) ? [
                          {
                            title:'นน. 1', 
                            dataIndex:'weight1', 
                            width: 80,
                            align: 'right' as const,
                            render:(v:number|null)=> (v !== null && Number.isFinite(v)) ? v.toFixed(3) : '-'
                          },
                          {
                            title:'นน. 2', 
                            dataIndex:'weight2', 
                            width: 80,
                            align: 'right' as const,
                            render:(v:number|null)=> (v !== null && Number.isFinite(v)) ? v.toFixed(3) : '-'
                          }
                        ] : []),
                        { 
                          title:'STD', 
                          dataIndex:'std', 
                          width: 80,
                          align: 'right' as const,
                          render:(v:number|null)=> (v !== null && Number.isFinite(v)) ? v.toFixed(3) : '-' 
                        },
                        { 
                          title:'สถานะ', 
                          dataIndex:'status', 
                          width: 80,
                          align: 'center' as const,
                          render:(s:string)=><Tag color={getStatusColor(s)}>{s}</Tag> 
                        },
                        { 
                          title:'เวลา', 
                          dataIndex:'timestamp', 
                          width: 140,
                          render:(v:string)=>new Date(v).toLocaleString('th-TH', { 
                            hour: '2-digit', 
                            minute: '2-digit',
                            second: '2-digit'
                          }) 
                        },
                      ] as any}
                      rowClassName={(record: any) => {
                        if (record.status === 'RED') return 'row-red'
                        if (record.status === 'YELLOW') return 'row-yellow'
                        if (record.status === 'GREEN') return 'row-green'
                        if (record.status === 'STD_CHANGE') return 'row-std-change'
                        return ''
                      }}
                      style={{ backgroundColor: '#fff', borderRadius: 8 }}
                    />
                  </div>
                )
              })}
              <style>{`
                .row-green { background-color: #f6ffed !important; }
                .row-yellow { background-color: #fffbe6 !important; }
                .row-red { background-color: #fff1f0 !important; }
                .row-std-change { background-color: #d3adf7 !important; font-weight: bold; }
              `}</style>
            </div>
          )
        })()}
        {lotEvents && (
          <>
            <Typography.Title level={5} style={{ marginTop: 12 }}>เหตุการณ์ใน Lot</Typography.Title>
            <Typography.Text type="secondary">Leader ปลดล็อค RED</Typography.Text>
            <Table size="small" style={{ marginTop: 6, marginBottom: 12 }} dataSource={lotEvents.redUnlocks||[]} rowKey={(r: any) => `red-${r.approvalId || r.time}`}
                   pagination={false}
                   columns={[
                     { title:'เวลา', dataIndex:'time', render:(v:any)=>v?new Date(v).toLocaleString():'-' },
                     { title:'Outer', dataIndex:'outer' },
                     { title:'Inner', dataIndex:'inner' },
                     { title:'Leader', render: (_: any, row: any) => row.action_by || row.leader || '-' },
                     { title:'เหตุผล', dataIndex: 'reason', render: (text: any) => text || '-' },
                     { title:'น้ำหนักเดิม', dataIndex:'prevWeight', render:(v:number)=> Number.isFinite(v)?Number(v).toFixed(3): '-' },
                     { title:'ชั่งซ้ำเมื่อ', dataIndex:['reweigh','at'], render:(_:any,row:any)=> { const dt = row?.reweigh?.at; return dt ? new Date(dt).toLocaleString() : '-' } },
                     { title:'ผลชั่งซ้ำ', dataIndex:['reweigh','newStatus'], render:(s:string)=> s ? <Tag color={getStatusColor(s)}>{s}</Tag> : '-' },
                     { title:'น้ำหนักใหม่', dataIndex:['reweigh','newWeight'], render:(v:number)=> Number.isFinite(v)?Number(v).toFixed(3): '-' },
                   ] as any}
            />
            <Typography.Text type="secondary">QA เปลี่ยนค่า STD</Typography.Text>
            <Table size="small" style={{ marginTop: 6 }} dataSource={lotEvents.stdChanges||[]} rowKey={(r: any) => `std-${r.approvedAt}`}
                   pagination={false}
                   columns={[
                     { title:'เวลา', dataIndex:'time', render:(v:any)=> v? new Date(v).toLocaleString():'-' },
                     { title:'ค่าเดิม', dataIndex:'oldStd', render:(v:number)=> Number.isFinite(v)?v.toFixed(3):'-' },
                     { title:'ค่าใหม่', dataIndex:'newStd', render:(v:number)=> Number.isFinite(v)?v.toFixed(3):'-' },
                     { title:'Sample Weights', dataIndex:'sampleWeights', width: 150, render: (v: any) => {
                        if (!v) return '-';
                        try {
                            const arr = JSON.parse(v);
                            if (Array.isArray(arr)) return arr.map(n => Number(n).toFixed(1)).join(', ');
                        } catch {}
                        return v;
                     }},
                     { title:'QA', dataIndex:'approvedBy' },
                     { title:'อนุญาตชั่ง 4-5 โดย', dataIndex:'allowedBy' },
                     { title:'เวลาอนุญาต', dataIndex:'allowedAt', render:(v:any)=> v? new Date(v).toLocaleString():'-' },
                     { title:'ตำแหน่งกล่อง (โดยประมาณ)', dataIndex:'locationInner' },
                     { title:'เหตุผล', dataIndex:'reason' },
                   ] as any}
            />
          </>
        )}
        <div style={{ display:'flex', justifyContent:'flex-end', marginTop: 8 }}>
          <Button onClick={async ()=>{
            if (!selProduct || !selScale || !selLot) { message.info('โปรดเลือก Product, Scale และ Lot'); return }
            try {
              const qs = new URLSearchParams({ productCode: selProduct, scaleId: selScale, lotNo: selLot })
              const r = await fetch(apiUrl('/api/reports/lot-details.csv?' + qs.toString()), { headers: { Authorization: `Bearer ${token}` } })
              if (!r.ok) { message.error('ดาวน์โหลดไม่สำเร็จ'); return }
              const blob = await r.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `lot-${selProduct}-${selScale}-${selLot}.csv`
              document.body.appendChild(a)
              a.click()
              a.remove()
              URL.revokeObjectURL(url)
            } catch {
              message.error('เกิดข้อผิดพลาดในการดาวน์โหลด')
            }
          }}>Export Excel</Button>
        </div>
        <Table size="small" dataSource={reportRows} rowKey={(r:any)=>`${r.lotNo}`}
               loading={reportLoading}
               pagination={{ pageSize: 8 }}
               columns={[
                 { title:'Lot', dataIndex:'lotNo' },
                 { title:'Count', dataIndex:'count' },
                 { title:'Min', dataIndex:'min', render:(v:number)=>Number.isFinite(v)?v.toFixed(3):'-' },
                 { title:'Avg', dataIndex:'avg', render:(v:number)=>Number.isFinite(v)?v.toFixed(3):'-' },
                 { title:'Max', dataIndex:'max', render:(v:number)=>Number.isFinite(v)?v.toFixed(3):'-' },
                 { title:'Last Status', dataIndex:'lastStatus', render:(s:string)=><Tag color={getStatusColor(s)}>{s}</Tag> },
                 { title:'ช่วงเวลา', render:(_:any,row:any)=>`${new Date(row.start).toLocaleString()} - ${new Date(row.end).toLocaleString()}` }
               ] as any}
        />
      </Modal>
      {/* LD แก้ไข Inner/น้ำหนัก ตาม WO */}
      <Card size="small" title="Leader แก้ไข Inner / น้ำหนัก (เลือกจาก WO)" style={{ marginBottom: 12 }}>
        <Space wrap style={{ marginBottom: 8 }}>
          <Select
            showSearch style={{ minWidth: 300 }} placeholder="เลือก Work Order"
            value={ldSelectedWo?.workOrderId ?? undefined}
            loading={ldLoading}
            onChange={ldSelectWo}
            filterOption={(input, opt) => String(opt?.label ?? '').toLowerCase().includes(input.toLowerCase())}
            options={ldWoList
              .filter((w: any) => w.status === 'ACTIVE')
              .map((w: any) => ({
                value: w.workOrderId,
                label: `WO#${w.workOrderId} — ${w.product?.productCode || '?'} | Lot: ${w.lotNo || '?'} | Scale: ${w.scale?.scaleId || '?'}`,
              }))}
          />
          {ldSelectedWo && (
            <Select style={{ minWidth: 140 }} placeholder="เลือก Outer"
              value={ldSelectedOuter || undefined}
              loading={ldLoading}
              onChange={ldSelectOuter}
              options={ldOuterList.map(o => ({ value: o, label: `Outer ${o}` }))}
            />
          )}
        </Space>
        {ldSelectedWo && (
          <div style={{ fontSize: 12, color: '#555', marginBottom: 8 }}>
            Product: <b>{ldSelectedWo.product?.productCode}</b>
            &nbsp;|&nbsp;Scale: <b>{ldSelectedWo.scale?.scaleId || '-'}</b>
            &nbsp;|&nbsp;Lot: <b>{ldSelectedWo.lotNo}</b>
            &nbsp;|&nbsp;Mode: <b>{ldSelectedWo.product?.weighingMode || 'SINGLE'}</b>
          </div>
        )}
        {ldMsg && <Alert type="success" message={ldMsg} closable onClose={() => setLdMsg(null)} style={{ marginBottom: 8 }} />}
        {ldMeasurements.length > 0 && (
          <Table
            size="small"
            dataSource={ldMeasurements}
            rowKey={(r: any) => String(r.measurementId)}
            loading={ldLoading}
            pagination={{ pageSize: 10, hideOnSinglePage: true }}
            scroll={{ x: 560 }}
            columns={[
              { title: 'Outer', dataIndex: 'outerBox', width: 70, render: (v: string) => <Tag color="purple">{v}</Tag> },
              { title: 'Inner', dataIndex: 'innerOrder', width: 70, render: (v: string) => <Tag color="cyan">{v}</Tag> },
              {
                title: 'น้ำหนัก', width: 110,
                render: (_: any, r: any) => r.weight1 != null
                  ? `${Number(r.weight1).toFixed(3)} / ${Number(r.weight2).toFixed(3)}`
                  : (r.weight != null ? Number(r.weight).toFixed(3) : '-')
              },
              { title: 'Status', dataIndex: 'status', width: 80, render: (s: string) => <Tag color={getStatusColor(s)}>{s}</Tag> },
              { title: 'เวลา', dataIndex: 'timestamp', ellipsis: true, render: (v: string) => v ? new Date(v).toLocaleString() : '-' },
              { title: 'Operator', dataIndex: 'operatorName', ellipsis: true },
              {
                title: 'แก้ไข', width: 70,
                render: (_: any, row: any) => (
                  <Button size="small" type="default" onClick={() => ldOpenEdit(row)}>แก้ไข</Button>
                )
              },
            ] as any}
          />
        )}
      </Card>

      {/* LD Edit Modal */}
      <Modal
        open={!!ldEditRow}
        onCancel={() => setLdEditRow(null)}
        onOk={ldSaveEdit}
        okText="บันทึก"
        cancelText="ยกเลิก"
        confirmLoading={ldEditSaving}
        title={ldEditRow ? `Leader แก้ไข: Outer ${ldEditRow.outerBox} / Inner ${ldEditRow.innerOrder}` : ''}
      >
        {ldEditRow && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <b>ข้อมูลเดิม:</b>&nbsp;
              Outer <Tag color="purple">{ldEditRow.outerBox}</Tag>
              Inner <Tag color="cyan">{ldEditRow.innerOrder}</Tag>
              นน.&nbsp;{ldEditRow.weight != null ? Number(ldEditRow.weight).toFixed(3) : '-'}
              &nbsp;<Tag color={getStatusColor(ldEditRow.status)}>{ldEditRow.status}</Tag>
            </div>
            <div>
              <div style={{ marginBottom: 4 }}>Inner ใหม่ <span style={{ color: '#888', fontSize: 12 }}>(Outer คงเดิม)</span></div>
              <Input
                value={ldEditForm.newInner}
                onChange={e => { setLdEditForm(f => ({ ...f, newInner: e.target.value })); setLdEditError(null) }}
                style={{ width: 100 }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Switch checked={ldEditForm.changeWeightToo} onChange={v => setLdEditForm(f => ({ ...f, changeWeightToo: v }))} />
              <span>เปลี่ยนน้ำหนักด้วย</span>
            </div>
            {ldEditForm.changeWeightToo && (() => {
              const ldIsDouble = (ldSelectedWo?.product?.weighingMode || 'SINGLE') === 'DOUBLE'
              const liveStatus = ldIsDouble
                ? ldCalcStatusDouble(ldEditForm.newWeight1, ldEditForm.newWeight2, ldEditRow?.std1, ldEditRow?.std2, ldEditRow?.tolerance1, ldEditRow?.tolerance2, ldEditRow?.weightPerPiece)
                : ldCalcStatus(ldEditForm.newWeight, ldEditRow?.std, ldEditRow?.tolerance, ldEditRow?.weightPerPiece)
              const scaleCapture = (w: number) => {
                if (ldIsDouble) {
                  if (ldScaleStep === 0) { setLdEditForm(f => ({ ...f, newWeight1: w })); setLdScaleStep(1); setLdScaleMsg(`✅ W1 = ${w.toFixed(3)} — รอ W2`) }
                  else { setLdEditForm(f => ({ ...f, newWeight2: w })); setLdScaleStep(0); setLdScaleMsg(`✅ W2 = ${w.toFixed(3)} — ครบแล้ว`) }
                } else {
                  setLdEditForm(f => ({ ...f, newWeight: w }))
                  setLdScaleMsg(`✅ รับค่า: ${w.toFixed(3)} g`)
                }
                setLdScaleBuf(''); setLdScaleLines([])
              }
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Std info */}
                  {ldEditRow && (ldEditRow.std != null || ldEditRow.std1 != null) && (
                    <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 4, padding: '6px 10px', fontSize: 12 }}>
                      <b>Std ปัจจุบัน:</b>{' '}
                      {ldIsDouble
                        ? <>W1: {ldEditRow.std1 != null ? Number(ldEditRow.std1).toFixed(3) : '-'}{ldEditRow.tolerance1 != null && ` (±${Number(ldEditRow.tolerance1).toFixed(3)})`} | W2: {ldEditRow.std2 != null ? Number(ldEditRow.std2).toFixed(3) : '-'}{ldEditRow.tolerance2 != null && ` (±${Number(ldEditRow.tolerance2).toFixed(3)})`}</>
                        : <>{ldEditRow.std != null ? Number(ldEditRow.std).toFixed(3) : '-'}{ldEditRow.tolerance != null && ` ±${Number(ldEditRow.tolerance).toFixed(3)}`}{ldEditRow.weightPerPiece != null && ` (RED ถ้า ±${(Number(ldEditRow.weightPerPiece) / 2).toFixed(3)})`}</>
                      }
                    </div>
                  )}
                  {/* Scale capture */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <b style={{ fontSize: 12 }}>รับค่าจากเครื่องชั่ง</b>
                      {ldIsDouble && <span style={{ fontSize: 12, color: '#1677ff' }}>— กำลังรับ: <b>น้ำหนัก {ldScaleStep === 0 ? '1' : '2'}</b></span>}
                      <span style={{ fontSize: 11, fontWeight: 'bold', padding: '1px 8px', borderRadius: 10, background: ldScaleFocused ? '#f6ffed' : '#fff1f0', color: ldScaleFocused ? '#52c41a' : '#ff4d4f', border: `1px solid ${ldScaleFocused ? '#b7eb8f' : '#ffa39e'}` }}>
                        {ldScaleFocused ? '● พร้อมรับค่า' : '○ ยังไม่ได้ focus'}
                      </span>
                      {!ldScaleFocused && <Button size="small" type="primary" ghost style={{ fontSize: 11, height: 22, padding: '0 8px' }} onClick={() => ldScaleRef.current?.focus()}>คลิกเพื่อรับค่า</Button>}
                    </div>
                    <Input
                      ref={ldScaleRef}
                      value={ldScaleBuf}
                      onChange={e => setLdScaleBuf(e.target.value)}
                      onFocus={() => setLdScaleFocused(true)}
                      onBlur={() => setLdScaleFocused(false)}
                      onPaste={e => { e.preventDefault(); const w = parseScaleWeight(e.clipboardData.getData('text')); if (w != null) scaleCapture(w); else setLdScaleMsg('⚠️ ไม่สามารถอ่านค่า') }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          const newLines = [...ldScaleLines, ldScaleBuf]
                          if (newLines.length >= 3) { const w = parseScaleWeight(newLines[0]); if (w != null) scaleCapture(w); else setLdScaleMsg('⚠️ ไม่สามารถอ่านค่า'); setLdScaleLines([]); setLdScaleBuf('') }
                          else { setLdScaleLines(newLines); setLdScaleBuf('') }
                        }
                      }}
                      placeholder="วางเคอร์เซอร์ที่นี่ แล้วส่งข้อมูลจากเครื่องชั่ง..."
                      style={{ width: '100%' }}
                    />
                    {ldScaleMsg && <div style={{ fontSize: 12, marginTop: 4, color: ldScaleMsg.startsWith('✅') ? '#52c41a' : '#faad14' }}>{ldScaleMsg}</div>}
                  </div>
                  {/* Manual fallback + live status */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    {ldIsDouble ? (
                      <>
                        <div><div style={{ marginBottom: 4 }}>น้ำหนัก 1</div><InputNumber value={ldEditForm.newWeight1} onChange={v => setLdEditForm(f => ({ ...f, newWeight1: v }))} style={{ width: 120 }} step={0.001} /></div>
                        <div><div style={{ marginBottom: 4 }}>น้ำหนัก 2</div><InputNumber value={ldEditForm.newWeight2} onChange={v => setLdEditForm(f => ({ ...f, newWeight2: v }))} style={{ width: 120 }} step={0.001} /></div>
                      </>
                    ) : (
                      <div><div style={{ marginBottom: 4 }}>น้ำหนักใหม่</div><InputNumber value={ldEditForm.newWeight} onChange={v => setLdEditForm(f => ({ ...f, newWeight: v }))} style={{ width: 140 }} step={0.001} /></div>
                    )}
                    {liveStatus && (
                      <div style={{ marginBottom: 2 }}>
                        <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>สถานะที่จะได้</div>
                        <Tag color={liveStatus === 'GREEN' ? 'green' : liveStatus === 'YELLOW' ? 'gold' : 'red'} style={{ fontSize: 13, padding: '2px 10px' }}>{liveStatus}</Tag>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}
            <div>
              <div style={{ marginBottom: 4 }}>เหตุผล <span style={{ color: 'red' }}>*</span></div>
              <Input.TextArea
                rows={3} value={ldEditForm.reason}
                onChange={e => { setLdEditForm(f => ({ ...f, reason: e.target.value })); setLdEditError(null) }}
                placeholder="ระบุเหตุผล เช่น ใส่ Inner ผิด, ชั่งซ้ำ..."
              />
            </div>
            {ldEditError && <Alert type="error" message={ldEditError} showIcon />}
          </div>
        )}
      </Modal>

      {error && <Alert type="error" message={error} style={{ marginBottom: 8 }} />}
      {!error && approvals.length>0 && (
        <Alert type="warning" showIcon style={{ marginBottom: 8 }}
               message={`มีรายการรออนุมัติ ${approvals.length} รายการ`}/>
      )}
      <div onMouseEnter={() => setPauseRefresh(true)} onMouseLeave={() => setPauseRefresh(false)}>
      <Table
        size="small"
        loading={loading}
        dataSource={approvals}
        columns={columns as any}
        rowKey="id"
        pagination={{ pageSize: 8, hideOnSinglePage: true, position: ['bottomCenter'] }}
        scroll={{ y: tableH }}
        tableLayout="fixed"
        expandable={{
          expandRowByClick: true,
          expandedRowKeys: expandedKeys,
          expandedRowRender: (row: Approval) => {
            const p = safePayload(row)
            return (
              <div style={{ padding: 8 }}>
                <b>Lot:</b> {p.lotNo || '-'} &nbsp; <b>Product:</b> {p.productCode || '-'} &nbsp; <b>Scale:</b> {p.scaleId || '-'}
                <div style={{ marginTop: 8 }}>
                  <LotSeriesChart productCode={p.productCode} scaleId={p.scaleId} lotNo={p.lotNo} products={products} token={token} />
                </div>
              </div>
            )
          },
          rowExpandable: (row: Approval) => !!safePayload(row).lotNo && !!safePayload(row).productCode && !!safePayload(row).scaleId,
          onExpand: (expanded, record) => {
            setExpandedKeys(keys => {
              const id = record.id
              const has = keys.includes(id)
              if (expanded && !has) return [...keys, id]
              if (!expanded && has) return keys.filter(k => k !== id)
              return keys
            })
          }
        }}
      />
      </div>
      {/* bottom refresh removed to keep layout compact */}
      <Modal
        open={!!selected}
        onCancel={() => setSelected(null)}
        onOk={doApprove}
        okText="อนุมัติ"
        cancelText="ยกเลิก"
        title={selected ? `อนุมัติ RED ID ${selected.id}` : ''}
      >
        <p>ระบุเหตุผล / หมายเหตุเพิ่มเติม:</p>
        <Input.TextArea rows={4} value={note} onChange={e => setNote(e.target.value)} />
      </Modal>
    </Card>
  )
}

// ─── Scale / Std helpers (shared by LD & QA modals) ─────────────────────────
function parseScaleWeight(raw: string): number | null {
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
  for (const line of lines) {
    const m = line.match(/([0-9]+[.,][0-9]+)\s*g?\s*$/)
    if (m) { const v = parseFloat(m[1].replace(',', '.')); if (!isNaN(v) && v > 0) return v }
  }
  for (const line of lines) {
    const v = parseFloat(line.replace(',', '.'))
    if (!isNaN(v) && v > 0) return v
  }
  return null
}
function ldCalcStatus(w: number | null, std?: number, tol?: number, wpp?: number): 'GREEN' | 'YELLOW' | 'RED' | null {
  if (w == null || std == null || std === 0) return null
  const half = (wpp ?? 0) / 2
  if (half > 0 && (w < std - half || w > std + half)) return 'RED'
  if (tol != null && (w < std - tol || w > std + tol)) return 'YELLOW'
  return 'GREEN'
}
function ldCalcStatusDouble(w1: number | null, w2: number | null, std1?: number, std2?: number, tol1?: number, tol2?: number, wpp?: number): 'GREEN' | 'YELLOW' | 'RED' | null {
  if (w1 == null || w2 == null) return null
  const s1 = ldCalcStatus(w1, std1, tol1, wpp)
  const s2 = ldCalcStatus(w2, std2, tol2, wpp)
  if (s1 === 'RED' || s2 === 'RED') return 'RED'
  if (s1 === 'YELLOW' || s2 === 'YELLOW') return 'YELLOW'
  if (s1 === 'GREEN' && s2 === 'GREEN') return 'GREEN'
  return null
}

function isToday(iso?: string): boolean {
  if (!iso) return false
  try {
    const d = new Date(iso)
    const now = new Date()
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
  } catch { return false }
}

function LotSeriesChart({ productCode, scaleId, lotNo, products, token }: Readonly<{ productCode: string, scaleId: string, lotNo?: string, products: any[], token: string }>) {
  const [data, setData] = useState<Array<{ timestamp: string; weight: number; status: string }>>([])
  const [stdVal, setStdVal] = useState<number | null>(null)
  const p = products.find((x: any) => x.productCode === productCode)
  
  const thresholds = useMemo(() => {
    if (!p) return null
    const wpp = p?.weightPerPiece ?? 0
    const tol = p?.tolerance ?? 0
    const baseStd: number = (stdVal != null) ? stdVal :
      (p.standardWeight && p.standardWeight > 0) ? p.standardWeight : (wpp * (p.quantityPerMeasurement ?? 0));
    const min = baseStd - wpp / 2
    const max = baseStd + wpp / 2
    const dmin = baseStd - tol
    const dmax = baseStd + tol
    return { baseStd, min, max, dmin, dmax }
  }, [p, stdVal])

  useEffect(() => {
    (async () => {
      try {
        const qs = new URLSearchParams({ productCode, scaleId })
        if (lotNo) qs.set('lotNo', lotNo)
        const r = await fetch(apiUrl('/api/measurements/series?' + qs.toString()), { headers: { Authorization: `Bearer ${token}` } })
        if (r.ok) setData(await r.json()); else setData([])
      } catch { setData([]) }
      try {
        if (lotNo) {
          const qs2 = new URLSearchParams({ productCode, scaleId, lotNo })
          const s = await fetch(apiUrl('/api/measurements/std-source?' + qs2.toString()), { headers: { Authorization: `Bearer ${token}` } })
          if (s.ok) { const js = await s.json(); setStdVal(typeof js.std === 'number' ? js.std : null) }
        } else { setStdVal(null) }
      } catch { setStdVal(null) }
    })()
  }, [productCode, scaleId, lotNo, token])

  if (!lotNo) return <Alert type="info" message="ไม่มี Lot" />
  if (!data.length) return <Alert type="warning" message="ยังไม่มีข้อมูลการชั่งใน Lot นี้" />
  return (
    <div style={{ width: '100%', height: 260 }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="timestamp" tickFormatter={(v) => new Date(v).toLocaleTimeString()} />
          <YAxis />
          <RTooltip labelFormatter={(v) => new Date(v as string).toLocaleString()} />
          <Legend />
          {thresholds && (
            <>
              <ReferenceLine y={thresholds.baseStd} stroke="#000" strokeDasharray="4 2" label="STD" />
              <ReferenceLine y={thresholds.min} stroke="#1890ff" strokeDasharray="3 3" label="MIN" />
              <ReferenceLine y={thresholds.max} stroke="#1890ff" strokeDasharray="3 3" label="MAX" />
              <ReferenceLine y={thresholds.dmin} stroke="#fa8c16" strokeDasharray="3 3" label="dMIN" />
              <ReferenceLine y={thresholds.dmax} stroke="#fa8c16" strokeDasharray="3 3" label="dMAX" />
            </>
          )}
          <Line type="monotone" dataKey="weight" stroke="#722ed1" name="Weight" dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
