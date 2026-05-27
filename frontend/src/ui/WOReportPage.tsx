import { useEffect, useMemo, useState } from 'react'
import {
  Button, Card, Col, DatePicker, Progress, Radio, Row, Select, Space, Statistic, Table, Tag, Tabs, Typography, Tooltip,
} from 'antd'
import {
  CheckCircleOutlined, ClockCircleOutlined, DownloadOutlined, EditOutlined, SwapOutlined,
  WarningOutlined, ThunderboltOutlined, UserOutlined, BarChartOutlined, GlobalOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import * as XLSX from 'xlsx'
import { apiUrl } from '../api'

const { Title, Text } = Typography

// ─── types ────────────────────────────────────────────────────────────────────
type WorkOrder = {
  workOrderId: number
  product: { productCode: string; productName: string; weighingMode?: string }
  scale: { scaleId: string; scaleName?: string }
  line?: string; lotNo: string
  startDate?: string; endDate?: string; status: string
  createdBy: string; createdAt: string
  operatorNames?: string; startedBy?: string; sessionStartedAt?: string
  closedAt?: string; closedBy?: string
}

type Measurement = {
  measurementId: number
  outerBoxNumber: string; innerBoxOrder: string
  weight?: number; weight1?: number; weight2?: number
  status: string; timestamp: string; operatorName: string; std?: number
}

type ChangeLogEntry = {
  id: number; productCode: string; changeType: string
  description: string; createdBy: string; createdAt: string
}

type Approval = {
  id: number; type: string; status: string; approverRole: string
  requestedBy: string; requestedAt: string
  actionAt?: string; actionBy?: string; note?: string; payloadJson?: string
}

// Mixed row type for the inner timeline table
type MixedRow =
  | { rowKind: 'measurement'; m: Measurement }
  | { rowKind: 'std_change'; barrier: Measurement; stdFrom?: number; stdTo: number }
  | { rowKind: 'relocate_from'; log: ChangeLogEntry }  // moved OUT of this outer
  | { rowKind: 'relocate_to'; log: ChangeLogEntry }    // moved INTO this outer

// ─── helpers ──────────────────────────────────────────────────────────────────
function getShift(ts: string): { shift: 'day' | 'night'; shiftDate: string } {
  const d = dayjs(ts); const h = d.hour()
  if (h >= 3 && h < 15) return { shift: 'day', shiftDate: d.format('YYYY-MM-DD') }
  if (h >= 15) return { shift: 'night', shiftDate: d.format('YYYY-MM-DD') }
  return { shift: 'night', shiftDate: d.subtract(1, 'day').format('YYYY-MM-DD') }
}
function shiftTag(ts: string) {
  const { shift } = getShift(ts)
  return shift === 'day'
    ? <Tag color="gold" style={{ fontSize: 11 }}>กลางวัน</Tag>
    : <Tag color="blue" style={{ fontSize: 11 }}>กลางคืน</Tag>
}
function statusColor(s: string) {
  if (s === 'GREEN') return 'green'
  if (s === 'YELLOW') return 'gold'
  if (s === 'RED') return 'red'
  return 'default'
}
function safeJson(str?: string): Record<string, string> {
  try { return str ? JSON.parse(str) : {} } catch { return {} }
}
function fmtW(m: Measurement) {
  if (m.weight1 != null) return `${Number(m.weight1).toFixed(3)} / ${Number(m.weight2).toFixed(3)}`
  return m.weight != null ? Number(m.weight).toFixed(3) : '-'
}
function rowTimestamp(r: MixedRow): number {
  if (r.rowKind === 'measurement') return new Date(r.m.timestamp).getTime()
  if (r.rowKind === 'std_change') return new Date(r.barrier.timestamp).getTime()
  return new Date(r.log.createdAt).getTime()
}

// ─── component ────────────────────────────────────────────────────────────────
type CrossWoRow = {
  workOrderId: number
  productCode: string; productName: string
  scaleId: string; scaleName?: string
  lotNo: string; line?: string; woStatus: string
  startDate?: string; createdAt: string; createdBy: string; closedAt?: string
  green: number; yellow: number; red: number; total: number; passRate: number
}

export function WOReportPage({ token }: Readonly<{ token: string }>) {
  const headers = { Authorization: `Bearer ${token}` }

  // ─── view mode: overview (cross-WO) vs detail (single WO) ────────────────
  const [viewMode, setViewMode] = useState<'overview' | 'detail'>('detail')

  // ─── cross-WO overview state ──────────────────────────────────────────────
  const [ovFrom, setOvFrom] = useState<string>(dayjs().subtract(30, 'day').format('YYYY-MM-DD'))
  const [ovTo,   setOvTo]   = useState<string>(dayjs().format('YYYY-MM-DD'))
  const [ovRows, setOvRows] = useState<CrossWoRow[]>([])
  const [ovLoading, setOvLoading] = useState(false)

  const fetchOverview = async () => {
    setOvLoading(true)
    try {
      const r = await fetch(apiUrl(`/api/reports/wo-performance?from=${ovFrom}&to=${ovTo}`), { headers })
      if (r.ok) setOvRows(await r.json())
    } finally { setOvLoading(false) }
  }
  useEffect(() => { if (viewMode === 'overview') fetchOverview() }, [viewMode])

  // ─── WO selector status filter ────────────────────────────────────────────
  const [woStatusFilter, setWoStatusFilter] = useState<string>('ALL')

  const [woList, setWoList] = useState<WorkOrder[]>([])
  const [selectedWo, setSelectedWo] = useState<WorkOrder | null>(null)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [changeLogs, setChangeLogs] = useState<ChangeLogEntry[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [loading, setLoading] = useState(false)

  const filteredWoList = useMemo(() =>
    woStatusFilter === 'ALL' ? woList : woList.filter(w => w.status === woStatusFilter),
    [woList, woStatusFilter]
  )

  useEffect(() => {
    fetch(apiUrl('/api/work-orders'), { headers })
      .then(r => r.ok ? r.json() : []).then(setWoList).catch(() => {})
  }, [token])

  const selectWo = async (woId: number) => {
    const wo = woList.find(w => w.workOrderId === woId) ?? null
    setSelectedWo(wo); setMeasurements([]); setChangeLogs([]); setApprovals([])
    if (!wo) return
    setLoading(true)
    try {
      const qs = new URLSearchParams({ productCode: wo.product.productCode, scaleId: wo.scale.scaleId, lotNo: wo.lotNo })
      const [mR, cR, aR] = await Promise.all([
        fetch(apiUrl('/api/measurements/history?' + qs), { headers }),
        fetch(apiUrl('/api/logs/changes/by-lot?lotNo=' + encodeURIComponent(wo.lotNo)), { headers }),
        fetch(apiUrl('/api/approvals'), { headers }),
      ])
      if (mR.ok) setMeasurements(await mR.json())
      if (cR.ok) {
        const logs = await cR.json()
        console.log('[WOReport] changeLogs for lot', wo.lotNo, ':', logs)
        setChangeLogs(logs)
      }
      if (aR.ok) {
        const all: Approval[] = await aR.json()
        setApprovals(all.filter(a => { try { return a.payloadJson ? JSON.parse(a.payloadJson).lotNo === wo.lotNo : false } catch { return false } }))
      }
    } finally { setLoading(false) }
  }

  // ─── derived: barriers (outer=000) vs real measurements ──────────────────
  // Outer "000" = barrier/Std-adjustment records — excluded from outer grouping
  const barrierMeasurements = useMemo(
    () => measurements.filter(m => m.outerBoxNumber === '000' || m.status === 'BARRIER'),
    [measurements]
  )
  const realMeasurements = useMemo(
    () => measurements.filter(m => m.outerBoxNumber !== '000' && m.status !== 'BARRIER'),
    [measurements]
  )

  const greenCount = realMeasurements.filter(m => m.status === 'GREEN').length
  const yellowCount = realMeasurements.filter(m => m.status === 'YELLOW').length
  const redCount = realMeasurements.filter(m => m.status === 'RED').length

  // Filter exact lotNo match (prevent substring cross-lot contamination e.g. "20260411" matching "20260411-01")
  // Fallback: if JSON parse fails (legacy malformed records), try raw string search for `"lotNo":"<lot>"`
  const relocateLogs = useMemo(() => {
    if (!selectedWo?.lotNo) return []
    const lotNo = selectedWo.lotNo
    return changeLogs.filter(c => {
      if (c.changeType !== 'BOX_RELOCATE') return false
      const d = safeJson(c.description)
      if (d.lotNo) return d.lotNo === lotNo
      return c.description.includes(`"lotNo":"${lotNo}"`) || c.description.includes(`"lotNo": "${lotNo}"`)
    })
  }, [changeLogs, selectedWo])

  // QA Outer Inspection logs (Inner change / reweigh by QA)
  const qaReweighLogs = useMemo(() => {
    if (!selectedWo?.lotNo) return []
    const lotNo = selectedWo.lotNo
    return changeLogs.filter(c => {
      if (c.changeType !== 'QA_OUTER_REWEIGH') return false
      const d = safeJson(c.description)
      if (d.lotNo) return d.lotNo === lotNo
      return c.description.includes(`"lotNo":"${lotNo}"`) || c.description.includes(`"lotNo": "${lotNo}"`)
    })
  }, [changeLogs, selectedWo])
  const reweighCount = changeLogs.filter(c => c.changeType === 'MEASUREMENT_REWEIGH').length

  // ─── Outer rows ──────────────────────────────────────────────────────────
  const outerRows = useMemo(() => {
    const map = new Map<string, Measurement[]>()
    for (const m of realMeasurements) {
      if (!map.has(m.outerBoxNumber)) map.set(m.outerBoxNumber, [])
      map.get(m.outerBoxNumber)!.push(m)
    }
    return [...map.entries()]
      .map(([outer, ms]) => {
        const sorted = [...ms].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
        const firstTime = sorted[0].timestamp
        const lastTime = sorted[sorted.length - 1].timestamp

        // ── Build mixed timeline rows ──────────────────────────────────────
        const mixed: MixedRow[] = sorted.map(m => ({ rowKind: 'measurement' as const, m }))

        // Barrier (Std change) records that happened within this outer's time range
        const relevantBarriers = barrierMeasurements.filter(b =>
          b.timestamp >= firstTime && b.timestamp <= lastTime
        )
        for (const b of relevantBarriers) {
          // Find std before this barrier: last real measurement before barrier time
          const before = sorted.filter(m => m.timestamp < b.timestamp).pop()
          mixed.push({ rowKind: 'std_change', barrier: b, stdFrom: before?.std, stdTo: b.weight ?? b.std ?? 0 })
        }

        // Relocate logs involving this outer (as source: oldOuter)
        for (const log of relocateLogs) {
          const d = safeJson(log.description)
          if (d.oldOuter === outer) mixed.push({ rowKind: 'relocate_from', log })
          else if (d.newOuter === outer) mixed.push({ rowKind: 'relocate_to', log })
        }

        mixed.sort((a, b) => rowTimestamp(a) - rowTimestamp(b))

        return {
          outer,
          total: ms.length,
          green: ms.filter(m => m.status === 'GREEN').length,
          yellow: ms.filter(m => m.status === 'YELLOW').length,
          red: ms.filter(m => m.status === 'RED').length,
          firstTime, lastTime, mixed,
          hasEvents: relevantBarriers.length > 0 || relocateLogs.some(l => { const d = safeJson(l.description); return d.oldOuter === outer || d.newOuter === outer }),
        }
      })
      .sort((a, b) => parseInt(a.outer) - parseInt(b.outer))
  }, [realMeasurements, barrierMeasurements, relocateLogs])

  // ─── Shift efficiency ─────────────────────────────────────────────────────
  const shiftRows = useMemo(() => {
    type ShiftEntry = { shiftDate: string; shift: 'day' | 'night'; green: number; yellow: number; red: number; total: number; operators: Set<string>; leaders: Set<string>; qaPersonnel: Set<string>; relocates: number }
    const map = new Map<string, ShiftEntry>()
    const mkEntry = (shiftDate: string, shift: 'day' | 'night'): ShiftEntry =>
      ({ shiftDate, shift, green: 0, yellow: 0, red: 0, total: 0, operators: new Set(), leaders: new Set(), qaPersonnel: new Set(), relocates: 0 })
    for (const m of realMeasurements) {
      const { shift, shiftDate } = getShift(m.timestamp)
      const key = `${shiftDate}__${shift}`
      if (!map.has(key)) map.set(key, mkEntry(shiftDate, shift))
      const s = map.get(key)!; s.total++
      if (m.status === 'GREEN') s.green++; else if (m.status === 'YELLOW') s.yellow++; else if (m.status === 'RED') s.red++
      if (m.operatorName) s.operators.add(m.operatorName)
    }
    for (const c of relocateLogs) {
      const { shift, shiftDate } = getShift(c.createdAt)
      const key = `${shiftDate}__${shift}`
      if (map.has(key)) map.get(key)!.relocates++
    }
    for (const a of approvals) {
      if (!a.actionAt || !a.actionBy) continue
      const { shift, shiftDate } = getShift(a.actionAt)
      const key = `${shiftDate}__${shift}`
      if (!map.has(key)) continue
      if (a.approverRole === 'LEADER') map.get(key)!.leaders.add(a.actionBy)
      if (a.approverRole === 'QA') map.get(key)!.qaPersonnel.add(a.actionBy)
    }
    for (const c of qaReweighLogs) {
      if (!c.createdBy) continue
      const { shift, shiftDate } = getShift(c.createdAt)
      const key = `${shiftDate}__${shift}`
      if (map.has(key)) map.get(key)!.qaPersonnel.add(c.createdBy)
    }
    return [...map.entries()].map(([, v]) => v)
      .sort((a, b) => { const dc = b.shiftDate.localeCompare(a.shiftDate); return dc !== 0 ? dc : (a.shift === 'day' ? 1 : -1) })
  }, [realMeasurements, relocateLogs, approvals, qaReweighLogs])

  // ─── Daily performance (รายวัน) ───────────────────────────────────────────
  type DailyPerfRow = {
    date: string
    dayShift: { total: number; green: number; yellow: number; red: number; operators: string[]; relocates: number; qaActions: number } | null
    nightShift: { total: number; green: number; yellow: number; red: number; operators: string[]; relocates: number; qaActions: number } | null
    totalDay: number; greenDay: number; yellowDay: number; redDay: number
  }
  const dailyPerfRows = useMemo((): DailyPerfRow[] => {
    type ShiftAcc = { total: number; green: number; yellow: number; red: number; operators: Set<string>; relocates: number; qaActions: number }
    const map = new Map<string, { day: ShiftAcc | null; night: ShiftAcc | null }>()
    const mk = (): ShiftAcc => ({ total: 0, green: 0, yellow: 0, red: 0, operators: new Set(), relocates: 0, qaActions: 0 })
    for (const m of realMeasurements) {
      const { shift, shiftDate } = getShift(m.timestamp)
      if (!map.has(shiftDate)) map.set(shiftDate, { day: null, night: null })
      const entry = map.get(shiftDate)!
      if (!entry[shift]) entry[shift] = mk()
      const s = entry[shift]!; s.total++
      if (m.status === 'GREEN') s.green++; else if (m.status === 'YELLOW') s.yellow++; else if (m.status === 'RED') s.red++
      if (m.operatorName) s.operators.add(m.operatorName)
    }
    for (const c of relocateLogs) {
      const { shift, shiftDate } = getShift(c.createdAt)
      if (!map.has(shiftDate)) map.set(shiftDate, { day: null, night: null })
      const entry = map.get(shiftDate)!
      if (!entry[shift]) entry[shift] = mk()
      entry[shift]!.relocates++
    }
    for (const c of qaReweighLogs) {
      const { shift, shiftDate } = getShift(c.createdAt)
      if (!map.has(shiftDate)) map.set(shiftDate, { day: null, night: null })
      const entry = map.get(shiftDate)!
      if (!entry[shift]) entry[shift] = mk()
      entry[shift]!.qaActions++
    }
    return [...map.entries()]
      .map(([date, { day, night }]) => {
        const totalDay = (day?.total ?? 0) + (night?.total ?? 0)
        const greenDay = (day?.green ?? 0) + (night?.green ?? 0)
        const yellowDay = (day?.yellow ?? 0) + (night?.yellow ?? 0)
        const redDay = (day?.red ?? 0) + (night?.red ?? 0)
        return {
          date,
          dayShift: day ? { ...day, operators: [...day.operators] } : null,
          nightShift: night ? { ...night, operators: [...night.operators] } : null,
          totalDay, greenDay, yellowDay, redDay,
        }
      })
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [realMeasurements, relocateLogs, qaReweighLogs])

  // ─── Operator performance (ประสิทธิภาพรายคน) ─────────────────────────────
  type OperatorPerfRow = {
    operator: string
    total: number; green: number; yellow: number; red: number
    passRate: number
    shiftDayCount: number; shiftNightCount: number
    relocates: number; qaActions: number
  }
  const operatorPerfRows = useMemo((): OperatorPerfRow[] => {
    const map = new Map<string, { total: number; green: number; yellow: number; red: number; shiftDays: Set<string>; shiftNights: Set<string>; relocates: number; qaActions: number }>()
    const mk = () => ({ total: 0, green: 0, yellow: 0, red: 0, shiftDays: new Set<string>(), shiftNights: new Set<string>(), relocates: 0, qaActions: 0 })
    for (const m of realMeasurements) {
      const op = m.operatorName || '(ไม่ระบุ)'
      if (!map.has(op)) map.set(op, mk())
      const s = map.get(op)!; s.total++
      if (m.status === 'GREEN') s.green++; else if (m.status === 'YELLOW') s.yellow++; else if (m.status === 'RED') s.red++
      const { shift, shiftDate } = getShift(m.timestamp)
      if (shift === 'day') s.shiftDays.add(shiftDate); else s.shiftNights.add(shiftDate)
    }
    for (const c of relocateLogs) {
      const op = c.createdBy || '(ไม่ระบุ)'
      if (!map.has(op)) map.set(op, mk())
      map.get(op)!.relocates++
    }
    for (const c of qaReweighLogs) {
      const op = c.createdBy || '(ไม่ระบุ)'
      if (!map.has(op)) map.set(op, mk())
      map.get(op)!.qaActions++
    }
    return [...map.entries()]
      .map(([operator, v]) => ({
        operator,
        total: v.total, green: v.green, yellow: v.yellow, red: v.red,
        passRate: v.total > 0 ? (v.green / v.total) * 100 : 0,
        shiftDayCount: v.shiftDays.size, shiftNightCount: v.shiftNights.size,
        relocates: v.relocates, qaActions: v.qaActions,
      }))
      .sort((a, b) => b.total - a.total)
  }, [realMeasurements, relocateLogs, qaReweighLogs])

  // ─── WO Personnel summary (by role) ──────────────────────────────────────
  const personnelSummary = useMemo(() => {
    if (!selectedWo) return { op1: '', op2Names: [] as string[], ldNames: [] as string[], qaNames: [] as string[] }
    const op1 = selectedWo.startedBy ?? ''
    const op2Names = (selectedWo.operatorNames ?? '').split(',').map(s => s.trim()).filter(Boolean)
    const ldSet = new Set<string>()
    if (selectedWo.createdBy) ldSet.add(selectedWo.createdBy)
    if (selectedWo.closedBy && selectedWo.closedBy !== selectedWo.createdBy) ldSet.add(selectedWo.closedBy)
    const qaSet = new Set<string>()
    for (const a of approvals) {
      if (!a.actionBy) continue
      if (a.approverRole === 'LEADER' && a.actionBy) ldSet.add(a.actionBy)
      if (a.approverRole === 'QA' && a.actionBy) qaSet.add(a.actionBy)
    }
    for (const c of qaReweighLogs) {
      if (c.createdBy) qaSet.add(c.createdBy)
    }
    return { op1, op2Names, ldNames: [...ldSet], qaNames: [...qaSet] }
  }, [selectedWo, approvals, qaReweighLogs])

  // ─── Activity timeline ────────────────────────────────────────────────────
  const activityRows = useMemo(() => {
    const rows: Array<{ key: string; time: string; actor: string; type: string; detail: string; category: string }> = []
    for (const m of realMeasurements) {
      rows.push({ key: 'M' + m.measurementId, time: m.timestamp, actor: m.operatorName, type: 'ชั่งน้ำหนัก', detail: `Outer ${m.outerBoxNumber} / Inner ${m.innerBoxOrder} | ${fmtW(m)}`, category: 'weigh' })
    }
    for (const b of barrierMeasurements) {
      rows.push({ key: 'B' + b.measurementId, time: b.timestamp, actor: b.operatorName, type: 'STD_CHANGE', detail: `เปลี่ยน Std → ${b.weight != null ? Number(b.weight).toFixed(3) : '-'}`, category: 'barrier' })
    }
    // Only show change logs that exactly match this lot
    for (const c of changeLogs) {
      const d = safeJson(c.description)
      const lotNo = selectedWo?.lotNo ?? ''
      // Skip logs belonging to a different lot (substring match issue)
      if (d.lotNo && d.lotNo !== lotNo) continue
      // If JSON has no lotNo field at all, fall back to raw string check to exclude cross-lot records
      if (!d.lotNo && lotNo && !c.description.includes(`"lotNo":"${lotNo}"`) && !c.description.includes(`"lotNo": "${lotNo}"`) && c.description.includes('"lotNo"')) continue
      let detail = ''
      let displayType = c.changeType
      if (c.changeType === 'BOX_RELOCATE') {
        const outerChg = d.oldOuter !== d.newOuter ? `Outer ${d.oldOuter}→${d.newOuter}` : `Outer ${d.oldOuter}`
        const innerChg = d.oldInner !== d.newInner ? `Inner ${d.oldInner}→${d.newInner}` : `Inner ${d.oldInner}`
        const wOld = d.oldWeight1 ? `${d.oldWeight1}/${d.oldWeight2}` : d.oldWeight
        const wNew = d.newWeight1 ? `${d.newWeight1}/${d.newWeight2}` : d.newWeight
        const weightPart = String(d.changeWeightToo) === 'true' ? ` | น้ำหนัก ${wOld}→${wNew} (${d.oldStatus}→${d.newStatus})` : ` | น้ำหนัก ${wOld} (${d.oldStatus})`
        detail = `${outerChg} / ${innerChg}${weightPart}${d.reason ? ` | เหตุผล: "${d.reason}"` : ''}`
      } else if (c.changeType === 'MEASUREMENT_REWEIGH') {
        const prevW = d.prevWeight ?? d.oldWeight
        detail = `Inner ${d.innerOrder ?? '-'} | น้ำหนักเดิม: ${prevW != null ? Number(prevW).toFixed(3) : '-'} → ใหม่: ${d.newWeight != null ? Number(d.newWeight).toFixed(3) : '-'}`
      } else if (c.changeType === 'QA_OUTER_REWEIGH') {
        const innerChg = d.oldInner !== d.newInner ? `Inner ${d.oldInner}→${d.newInner}` : `Inner ${d.oldInner}`
        const wOld = d.oldWeight1 ? `${d.oldWeight1}/${d.oldWeight2}` : d.oldWeight
        const wNew = d.newWeight1 ? `${d.newWeight1}/${d.newWeight2}` : d.newWeight
        detail = `Outer ${d.oldOuter} / ${innerChg} | น้ำหนัก ${wOld}→${wNew} (${d.oldStatus}→${d.newStatus})${d.reason ? ` | เหตุผล: "${d.reason}"` : ''}`
      } else if (c.changeType === 'STD_CHANGE_REQUEST') {
        // Human-readable: avoid showing raw JSON
        const status = d.status ?? c.description.split('|')[0]?.trim() ?? c.changeType
        const stdPart = d.proposedStd ? ` | Std → ${d.proposedStd}` : ''
        detail = `${status}${stdPart}`
        displayType = 'STD_CHANGE_REQUEST'
      } else {
        // Generic fallback — cap length
        detail = c.description.length > 100 ? c.description.substring(0, 100) + '…' : c.description
      }
      rows.push({ key: 'C' + c.id, time: c.createdAt, actor: c.createdBy, type: displayType, detail, category: 'change' })
    }
    for (const a of approvals) {
      const p = safeJson(a.payloadJson ?? '')
      let detail = ''
      if (a.type === 'RED_EVENT') {
        const boxStr = (p.outerBox || p.innerOrder)
          ? `Outer ${p.outerBox || '-'} / Inner ${p.innerOrder || '-'}`
          : ''
        // Weight: prefer DOUBLE (w1/w2) then SINGLE
        const wStr = p.weight1 != null
          ? `W1=${Number(p.weight1).toFixed(3)} / W2=${Number(p.weight2).toFixed(3)}`
          : (p.weight != null ? `น้ำหนัก: ${Number(p.weight).toFixed(3)}` : '')
        // Std: from payload (new records) → fallback: find from realMeasurements by outer+inner
        let stdNum: number | undefined
        if (p.std != null) { stdNum = Number(p.std) }
        else if (p.std1 != null) { stdNum = Number(p.std1) }
        else {
          const mMatch = realMeasurements.find(m => m.outerBoxNumber === p.outerBox && m.innerBoxOrder === p.innerOrder)
          if (mMatch?.std != null) stdNum = mMatch.std
        }
        const stdStr = stdNum != null ? `Std: ${stdNum.toFixed(3)}` : ''
        const approverStr = a.actionBy ? `อนุมัติโดย: ${a.actionBy}` : ''
        const noteStr = a.note ? ` | "${a.note}"` : ''
        const parts = [boxStr, wStr, stdStr, approverStr].filter(Boolean).join(' | ')
        detail = `RED_EVENT | ${a.status}${parts ? ` | ${parts}` : ''}${noteStr}`
      } else {
        const stdPart = p.proposedStd ? ` | Std → ${p.proposedStd}` : ''
        detail = `${a.type} | ${a.status}${stdPart}${a.note ? ` | "${a.note}"` : ''}`
      }
      rows.push({ key: 'A' + a.id, time: a.requestedAt, actor: a.requestedBy, type: 'APPROVAL_' + a.type, detail, category: 'approval' })
    }
    return rows.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
  }, [realMeasurements, barrierMeasurements, changeLogs, approvals, selectedWo])

  // ─── Expanded inner timeline columns ─────────────────────────────────────
  type MixedRowKeyed = MixedRow & { _key: number }
  function buildInnerTableData(mixed: MixedRow[]): MixedRowKeyed[] {
    return mixed.map((r, idx) => ({ ...r, _key: idx } as MixedRowKeyed))
  }

  const innerTimelineCols = [
    {
      title: '', width: 28,
      render: (_: any, r: MixedRow & { _key: number }) => {
        if (r.rowKind === 'std_change') return <ThunderboltOutlined style={{ color: '#d4380d' }} />
        if (r.rowKind === 'relocate_from') return <SwapOutlined style={{ color: '#d46b08' }} />
        if (r.rowKind === 'relocate_to') return <SwapOutlined style={{ color: '#389e0d' }} />
        return null
      },
    },
    {
      title: 'Inner / เหตุการณ์', width: 130,
      render: (_: any, r: MixedRow) => {
        if (r.rowKind === 'measurement') return <Tag color="cyan">{r.m.innerBoxOrder}</Tag>
        if (r.rowKind === 'std_change') return <Tag color="volcano">⚡ เปลี่ยน Std</Tag>
        if (r.rowKind === 'relocate_from') {
          const d = safeJson(r.log.description)
          return (
            <span>
              <Tag color="cyan">{d.oldInner}</Tag>
              {d.oldInner !== d.newInner && <><span style={{ fontSize: 11, color: '#aaa' }}> → </span><Tag color="orange">{d.newInner}</Tag></>}
            </span>
          )
        }
        if (r.rowKind === 'relocate_to') {
          const d = safeJson(r.log.description)
          return (
            <span>
              <Tag color="cyan" style={{ opacity: 0.5, textDecoration: 'line-through' }}>{d.oldInner}</Tag>
              <span style={{ fontSize: 11, color: '#aaa' }}> → </span>
              <Tag color="green">{d.newInner}</Tag>
            </span>
          )
        }
      },
    },
    {
      title: 'เวลา', width: 145,
      render: (_: any, r: MixedRow) => {
        const ts = r.rowKind === 'measurement' ? r.m.timestamp : r.rowKind === 'std_change' ? r.barrier.timestamp : r.log.createdAt
        return dayjs(ts).format('DD/MM/YY HH:mm:ss')
      },
    },
    {
      title: 'กะ', width: 88,
      render: (_: any, r: MixedRow) => {
        const ts = r.rowKind === 'measurement' ? r.m.timestamp : r.rowKind === 'std_change' ? r.barrier.timestamp : r.log.createdAt
        return shiftTag(ts)
      },
    },
    {
      title: 'น้ำหนัก (g)', width: 190,
      render: (_: any, r: MixedRow) => {
        if (r.rowKind === 'measurement') return fmtW(r.m)
        if (r.rowKind === 'std_change') return <Text type="secondary">-</Text>
        if (r.rowKind === 'relocate_from' || r.rowKind === 'relocate_to') {
          const d = safeJson(r.log.description)
          const wOld = d.oldWeight1 ? `${Number(d.oldWeight1).toFixed(3)}/${Number(d.oldWeight2).toFixed(3)}` : (d.oldWeight ? Number(d.oldWeight).toFixed(3) : '-')
          if (String(d.changeWeightToo) === 'true') {
            const wNew = d.newWeight1 ? `${Number(d.newWeight1).toFixed(3)}/${Number(d.newWeight2).toFixed(3)}` : (d.newWeight ? Number(d.newWeight).toFixed(3) : '-')
            return <span style={{ color: '#d46b08', fontSize: 12 }}>{wOld} → {wNew}</span>
          }
          return <span style={{ fontSize: 12 }}>{wOld} <Text type="secondary">(ไม่เปลี่ยน)</Text></span>
        }
      },
    },
    {
      title: 'Std / เหตุผล', width: 220,
      render: (_: any, r: MixedRow) => {
        if (r.rowKind === 'measurement')
          return r.m.std != null ? Number(r.m.std).toFixed(3) : '-'
        if (r.rowKind === 'std_change')
          return (
            <span style={{ fontWeight: 'bold', color: '#d4380d' }}>
              {r.stdFrom != null ? `${Number(r.stdFrom).toFixed(3)} → ` : ''}{Number(r.stdTo).toFixed(3)}
              <Tag color="volcano" style={{ marginLeft: 4, fontSize: 10 }}>Std ใหม่</Tag>
            </span>
          )
        if (r.rowKind === 'relocate_from' || r.rowKind === 'relocate_to') {
          const d = safeJson(r.log.description)
          return <span style={{ fontSize: 11, color: '#888' }}>{d.reason ? `"${d.reason}"` : '-'}</span>
        }
        return <Text type="secondary">-</Text>
      },
    },
    {
      title: 'Status', width: 120,
      render: (_: any, r: MixedRow) => {
        if (r.rowKind === 'measurement') return <Tag color={statusColor(r.m.status)}>{r.m.status}</Tag>
        if (r.rowKind === 'relocate_from' || r.rowKind === 'relocate_to') {
          const d = safeJson(r.log.description)
          if (d.oldStatus && d.newStatus && d.oldStatus !== d.newStatus)
            return <span><Tag color={statusColor(d.oldStatus)}>{d.oldStatus}</Tag><span style={{ fontSize: 10 }}> → </span><Tag color={statusColor(d.newStatus)}>{d.newStatus}</Tag></span>
          if (d.oldStatus) return <Tag color={statusColor(d.oldStatus)}>{d.oldStatus}</Tag>
        }
        return null
      },
    },
    {
      title: 'ดำเนินการโดย', width: 110,
      render: (_: any, r: MixedRow) => {
        if (r.rowKind === 'measurement') return r.m.operatorName
        if (r.rowKind === 'std_change') return r.barrier.operatorName
        return safeJson(r.log.description).changedBy ?? r.log.createdBy
      },
    },
  ] as any

  // ─── Outer top-level columns ──────────────────────────────────────────────
  const outerColumns = [
    { title: 'Outer', dataIndex: 'outer', width: 90, render: (v: string) => <Tag color="purple" style={{ fontSize: 13, padding: '2px 8px' }}>{v}</Tag> },
    { title: 'Inner ทั้งหมด', dataIndex: 'total', width: 100, align: 'center' as const },
    { title: 'GREEN', dataIndex: 'green', width: 80, align: 'center' as const, render: (v: number, r: typeof outerRows[0]) => <span style={{ color: '#52c41a', fontWeight: v > 0 ? 'bold' : undefined }}>{v} <small style={{ color: '#aaa' }}>({r.total > 0 ? ((v / r.total) * 100).toFixed(0) : 0}%)</small></span> },
    { title: 'YELLOW', dataIndex: 'yellow', width: 80, align: 'center' as const, render: (v: number) => v > 0 ? <span style={{ color: '#faad14', fontWeight: 'bold' }}>{v}</span> : <span style={{ color: '#ccc' }}>0</span> },
    { title: 'RED', dataIndex: 'red', width: 70, align: 'center' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{v}</span> : <span style={{ color: '#ccc' }}>0</span> },
    { title: 'ช่วงเวลา', width: 200, render: (_: any, r: typeof outerRows[0]) => <span style={{ fontSize: 12 }}>{dayjs(r.firstTime).format('DD/MM HH:mm')} – {dayjs(r.lastTime).format('DD/MM HH:mm')}</span> },
    { title: 'กะ', width: 88, render: (_: any, r: typeof outerRows[0]) => shiftTag(r.firstTime) },
    {
      title: 'Events', width: 100, align: 'center' as const,
      render: (_: any, r: typeof outerRows[0]) => {
        const stdCount = r.mixed.filter(x => x.rowKind === 'std_change').length
        const relCount = r.mixed.filter(x => x.rowKind === 'relocate_from' || x.rowKind === 'relocate_to').length
        if (!r.hasEvents) return <Text type="secondary" style={{ fontSize: 11 }}>-</Text>
        return (
          <Space size={4}>
            {stdCount > 0 && <Tag color="volcano" style={{ fontSize: 10 }}>Std×{stdCount}</Tag>}
            {relCount > 0 && <Tag color="orange" style={{ fontSize: 10 }}>Move×{relCount}</Tag>}
          </Space>
        )
      },
    },
  ] as any

  // ─── Excel Export ─────────────────────────────────────────────────────────
  const exportExcel = () => {
    if (!selectedWo) return
    const wb = XLSX.utils.book_new()

    // Sheet 1: สรุป WO
    const summaryRows = [
      { ข้อมูล: 'WO#', ค่า: String(selectedWo.workOrderId) },
      { ข้อมูล: 'Product Code', ค่า: selectedWo.product?.productCode ?? '' },
      { ข้อมูล: 'Product Name', ค่า: selectedWo.product?.productName ?? '' },
      { ข้อมูล: 'Lot No', ค่า: selectedWo.lotNo },
      { ข้อมูล: 'Scale', ค่า: selectedWo.scale?.scaleName ?? selectedWo.scale?.scaleId ?? '' },
      { ข้อมูล: 'Mode', ค่า: selectedWo.product?.weighingMode ?? 'SINGLE' },
      { ข้อมูล: 'Status', ค่า: selectedWo.status },
      { ข้อมูล: 'วันผลิต', ค่า: selectedWo.startDate ?? '' },
      { ข้อมูล: 'สร้างโดย', ค่า: selectedWo.createdBy },
      { ข้อมูล: 'วันที่สร้าง', ค่า: dayjs(selectedWo.createdAt).format('DD/MM/YYYY HH:mm') },
      { ข้อมูล: '', ค่า: '' },
      { ข้อมูล: 'ชั่งทั้งหมด', ค่า: realMeasurements.length },
      { ข้อมูล: 'GREEN', ค่า: greenCount },
      { ข้อมูล: 'YELLOW', ค่า: yellowCount },
      { ข้อมูล: 'RED', ค่า: redCount },
      { ข้อมูล: '% GREEN', ค่า: realMeasurements.length > 0 ? `${((greenCount / realMeasurements.length) * 100).toFixed(1)}%` : '0%' },
      { ข้อมูล: 'จำนวน Outer', ค่า: outerRows.length },
      { ข้อมูล: 'Std เปลี่ยน', ค่า: barrierMeasurements.length },
      { ข้อมูล: 'Sorting/Relocate', ค่า: relocateLogs.length },
      { ข้อมูล: 'QA Reweigh', ค่า: qaReweighLogs.length },
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'สรุป WO')

    // Sheet 2: รายการชั่งทั้งหมด
    const measRows = [...realMeasurements]
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
      .map(m => ({
        Outer: m.outerBoxNumber,
        Inner: m.innerBoxOrder,
        'น้ำหนัก (g)': m.weight != null ? Number(m.weight) : '',
        'W1 (g)': m.weight1 != null ? Number(m.weight1) : '',
        'W2 (g)': m.weight2 != null ? Number(m.weight2) : '',
        Status: m.status,
        Std: m.std != null ? Number(m.std) : '',
        เวลา: dayjs(m.timestamp).format('DD/MM/YYYY HH:mm:ss'),
        กะ: getShift(m.timestamp).shift === 'day' ? 'กลางวัน' : 'กลางคืน',
        Operator: m.operatorName,
      }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(measRows.length > 0 ? measRows : [{ หมายเหตุ: 'ไม่มีข้อมูล' }]), 'รายการชั่ง')

    // Sheet 3: Sorting / Relocate
    const relocRows = relocateLogs.map(c => {
      const d = safeJson(c.description)
      return {
        เวลา: dayjs(c.createdAt).format('DD/MM/YYYY HH:mm:ss'),
        กะ: getShift(c.createdAt).shift === 'day' ? 'กลางวัน' : 'กลางคืน',
        ดำเนินการโดย: c.createdBy,
        'Outer เดิม': d.oldOuter ?? '',
        'Outer ใหม่': d.newOuter ?? '',
        'Inner เดิม': d.oldInner ?? '',
        'Inner ใหม่': d.newInner ?? '',
        'น้ำหนักเดิม': d.oldWeight1 ? `${d.oldWeight1}/${d.oldWeight2}` : (d.oldWeight ?? ''),
        'น้ำหนักใหม่': String(d.changeWeightToo) === 'true' ? (d.newWeight1 ? `${d.newWeight1}/${d.newWeight2}` : (d.newWeight ?? '')) : 'ไม่เปลี่ยน',
        'Status เดิม': d.oldStatus ?? '',
        'Status ใหม่': String(d.changeWeightToo) === 'true' ? (d.newStatus ?? '') : '',
        เหตุผล: d.reason ?? '',
      }
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(relocRows.length > 0 ? relocRows : [{ หมายเหตุ: 'ไม่มีข้อมูล' }]), 'Sorting-Relocate')

    // Sheet 4: QA Outer Inspect
    const qaRows = qaReweighLogs.map(c => {
      const d = safeJson(c.description)
      return {
        เวลา: dayjs(c.createdAt).format('DD/MM/YYYY HH:mm:ss'),
        กะ: getShift(c.createdAt).shift === 'day' ? 'กลางวัน' : 'กลางคืน',
        QA: c.createdBy,
        Outer: d.oldOuter ?? '',
        'Inner เดิม': d.oldInner ?? '',
        'Inner ใหม่': d.newInner ?? '',
        'น้ำหนักเดิม': d.oldWeight1 ? `${d.oldWeight1}/${d.oldWeight2}` : (d.oldWeight ?? ''),
        'น้ำหนักใหม่': d.newWeight1 ? `${d.newWeight1}/${d.newWeight2}` : (d.newWeight ?? ''),
        'Status เดิม': d.oldStatus ?? '',
        'Status ใหม่': d.newStatus ?? '',
        เหตุผล: d.reason ?? '',
      }
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qaRows.length > 0 ? qaRows : [{ หมายเหตุ: 'ไม่มีข้อมูล' }]), 'QA-Outer-Inspect')

    // Sheet 5: ประสิทธิภาพตามกะ
    const shiftExportRows = shiftRows.map(r => ({
      วันที่: dayjs(r.shiftDate).format('DD/MM/YYYY'),
      กะ: r.shift === 'day' ? 'กลางวัน 03:00-15:00' : 'กลางคืน 15:00-03:00',
      ชั่งทั้งหมด: r.total,
      GREEN: r.green,
      YELLOW: r.yellow,
      RED: r.red,
      '% GREEN': r.total > 0 ? `${((r.green / r.total) * 100).toFixed(1)}%` : '0%',
      'Relocate': r.relocates,
      'OP (ผู้ปฏิบัติงาน)': [...r.operators].join(', '),
      'LD (ผู้ดูแล)': [...r.leaders].join(', '),
      'QA (ผู้ตรวจสอบ)': [...r.qaPersonnel].join(', '),
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(shiftExportRows.length > 0 ? shiftExportRows : [{ หมายเหตุ: 'ไม่มีข้อมูล' }]), 'ประสิทธิภาพกะ')

    // Sheet: บุคลากร WO
    const personnelRows = [
      { บทบาท: 'OP (ผู้เปิดงาน - Login)', ชื่อ: personnelSummary.op1 },
      ...personnelSummary.op2Names.map(n => ({ บทบาท: 'OP (ผู้ชั่ง)', ชื่อ: n })),
      ...personnelSummary.ldNames.map(n => ({ บทบาท: 'LD (ผู้ดูแล)', ชื่อ: n })),
      ...personnelSummary.qaNames.map(n => ({ บทบาท: 'QA (ผู้ตรวจสอบ)', ชื่อ: n })),
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(personnelRows.length > 0 ? personnelRows : [{ หมายเหตุ: 'ไม่มีข้อมูล' }]), 'บุคลากร')

    // Sheet 6: บันทึกกิจกรรมทั้งหมด
    const actExportRows = activityRows.map(r => ({
      เวลา: dayjs(r.time).format('DD/MM/YYYY HH:mm:ss'),
      กะ: getShift(r.time).shift === 'day' ? 'กลางวัน' : 'กลางคืน',
      ดำเนินการโดย: r.actor,
      ประเภท: r.type,
      รายละเอียด: r.detail,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(actExportRows.length > 0 ? actExportRows : [{ หมายเหตุ: 'ไม่มีข้อมูล' }]), 'บันทึกกิจกรรม')

    // Sheet 7: ประสิทธิภาพรายคน
    const opExportRows = operatorPerfRows.map(r => ({
      Operator: r.operator,
      ชั่งทั้งหมด: r.total,
      GREEN: r.green,
      YELLOW: r.yellow,
      RED: r.red,
      '% GREEN': r.total > 0 ? `${r.passRate.toFixed(1)}%` : '0%',
      'กะกลางวัน (วัน)': r.shiftDayCount,
      'กะกลางคืน (วัน)': r.shiftNightCount,
      'รวมกะ': r.shiftDayCount + r.shiftNightCount,
      Relocate: r.relocates,
      'QA Inspect': r.qaActions,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(opExportRows.length > 0 ? opExportRows : [{ หมายเหตุ: 'ไม่มีข้อมูล' }]), 'ประสิทธิภาพรายคน')

    // Sheet 8: สรุปรายวัน-รายกะ
    const dailyExportRows: Record<string, any>[] = []
    for (const r of [...dailyPerfRows].reverse()) {
      const dayS = r.dayShift
      const nightS = r.nightShift
      if (dayS) {
        dailyExportRows.push({
          วันที่: dayjs(r.date).format('DD/MM/YYYY'),
          กะ: 'กลางวัน 03:00-15:00',
          ชั่งทั้งหมด: dayS.total,
          GREEN: dayS.green,
          YELLOW: dayS.yellow,
          RED: dayS.red,
          '% GREEN': dayS.total > 0 ? `${((dayS.green / dayS.total) * 100).toFixed(1)}%` : '0%',
          Operators: dayS.operators.join(', '),
          Relocate: dayS.relocates,
          'QA Inspect': dayS.qaActions,
        })
      }
      if (nightS) {
        dailyExportRows.push({
          วันที่: dayjs(r.date).format('DD/MM/YYYY'),
          กะ: 'กลางคืน 15:00-03:00',
          ชั่งทั้งหมด: nightS.total,
          GREEN: nightS.green,
          YELLOW: nightS.yellow,
          RED: nightS.red,
          '% GREEN': nightS.total > 0 ? `${((nightS.green / nightS.total) * 100).toFixed(1)}%` : '0%',
          Operators: nightS.operators.join(', '),
          Relocate: nightS.relocates,
          'QA Inspect': nightS.qaActions,
        })
      }
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dailyExportRows.length > 0 ? dailyExportRows : [{ หมายเหตุ: 'ไม่มีข้อมูล' }]), 'สรุปรายวัน-รายกะ')

    const filename = `WO${selectedWo.workOrderId}_${selectedWo.product?.productCode}_${selectedWo.lotNo}_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`
    XLSX.writeFile(wb, filename)
  }

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <Card>
      <Space style={{ marginBottom: 16, justifyContent: 'space-between', width: '100%', flexWrap: 'wrap' }}>
        <Title level={4} style={{ margin: 0 }}>รายงานกิจกรรม Work Order</Title>
        <Radio.Group
          value={viewMode}
          onChange={e => setViewMode(e.target.value)}
          optionType="button"
          buttonStyle="solid"
        >
          <Radio.Button value="overview"><GlobalOutlined /> ภาพรวมทุก WO</Radio.Button>
          <Radio.Button value="detail"><BarChartOutlined /> รายละเอียด WO</Radio.Button>
        </Radio.Group>
      </Space>

      {/* ── OVERVIEW mode ─────────────────────────────────────────────────── */}
      {viewMode === 'overview' && (
        <div>
          <Space style={{ marginBottom: 16, flexWrap: 'wrap' }} size={8}>
            <Text strong>ช่วงวันที่:</Text>
            <DatePicker
              value={dayjs(ovFrom)} format="DD/MM/YYYY"
              onChange={d => d && setOvFrom(d.format('YYYY-MM-DD'))}
            />
            <Text>ถึง</Text>
            <DatePicker
              value={dayjs(ovTo)} format="DD/MM/YYYY"
              onChange={d => d && setOvTo(d.format('YYYY-MM-DD'))}
            />
            <Button type="primary" loading={ovLoading} onClick={fetchOverview}>ดึงข้อมูล</Button>
            <Button
              icon={<DownloadOutlined />}
              disabled={ovRows.length === 0}
              onClick={() => {
                const wb = XLSX.utils.book_new()
                const rows = ovRows.map(r => ({
                  'WO#': r.workOrderId, 'Product Code': r.productCode, 'Product Name': r.productName,
                  'Lot No': r.lotNo, 'Line': r.line ?? '', 'Status': r.woStatus,
                  'วันที่สร้าง': dayjs(r.createdAt).format('DD/MM/YYYY HH:mm'),
                  'วันปิด': r.closedAt ? dayjs(r.closedAt).format('DD/MM/YYYY HH:mm') : '',
                  'ชั่งทั้งหมด': r.total, GREEN: r.green, YELLOW: r.yellow, RED: r.red,
                  '% GREEN': `${r.passRate}%`,
                }))
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length > 0 ? rows : [{ หมายเหตุ: 'ไม่มีข้อมูล' }]), 'ภาพรวม WO')
                XLSX.writeFile(wb, `WO_Overview_${ovFrom}_${ovTo}.xlsx`)
              }}
            >Export Excel</Button>
          </Space>

          {/* Summary cards */}
          {ovRows.length > 0 && (() => {
            const tT = ovRows.reduce((s, r) => s + r.total, 0)
            const tG = ovRows.reduce((s, r) => s + r.green, 0)
            const tY = ovRows.reduce((s, r) => s + r.yellow, 0)
            const tR = ovRows.reduce((s, r) => s + r.red, 0)
            const pr = tT > 0 ? (tG / tT) * 100 : 0
            return (
              <Row gutter={12} style={{ marginBottom: 16 }}>
                <Col><Card size="small"><Statistic title="WO ทั้งหมด" value={ovRows.length} /></Card></Col>
                <Col><Card size="small"><Statistic title="ชั่งรวมทั้งหมด" value={tT} /></Card></Col>
                <Col><Card size="small"><Statistic title="GREEN รวม" value={tG} valueStyle={{ color: '#52c41a' }} /></Card></Col>
                <Col><Card size="small"><Statistic title="YELLOW รวม" value={tY} valueStyle={{ color: '#faad14' }} /></Card></Col>
                <Col><Card size="small"><Statistic title="RED รวม" value={tR} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
                <Col>
                  <Card size="small">
                    <Statistic title="Pass Rate รวม" value={pr.toFixed(1)} suffix="%" valueStyle={{ color: pr >= 95 ? '#52c41a' : pr >= 80 ? '#faad14' : '#ff4d4f' }} />
                  </Card>
                </Col>
              </Row>
            )
          })()}

          <Table
            size="small"
            loading={ovLoading}
            dataSource={ovRows}
            rowKey="workOrderId"
            pagination={{ pageSize: 30, showSizeChanger: true }}
            scroll={{ x: 900 }}
            columns={[
              { title: 'WO#', dataIndex: 'workOrderId', width: 70, sorter: (a: CrossWoRow, b: CrossWoRow) => a.workOrderId - b.workOrderId },
              { title: 'Product', dataIndex: 'productCode', width: 110, render: (v: string, r: CrossWoRow) => <Tooltip title={r.productName}><span>{v}</span></Tooltip> },
              { title: 'Lot No', dataIndex: 'lotNo', width: 130 },
              { title: 'Status', dataIndex: 'woStatus', width: 90, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : v === 'SORTING' ? 'orange' : 'default'}>{v}</Tag>, filters: [{ text: 'ACTIVE', value: 'ACTIVE' }, { text: 'SORTING', value: 'SORTING' }, { text: 'END', value: 'END' }], onFilter: (v: any, r: CrossWoRow) => r.woStatus === v },
              { title: 'วันที่สร้าง', dataIndex: 'createdAt', width: 130, render: (v: string) => dayjs(v).format('DD/MM/YY HH:mm'), sorter: (a: CrossWoRow, b: CrossWoRow) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() },
              { title: 'ชั่งทั้งหมด', dataIndex: 'total', width: 90, align: 'center' as const, sorter: (a: CrossWoRow, b: CrossWoRow) => a.total - b.total },
              { title: 'GREEN', dataIndex: 'green', width: 75, align: 'center' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: v > 0 ? 'bold' : undefined }}>{v}</span> },
              { title: 'YELLOW', dataIndex: 'yellow', width: 75, align: 'center' as const, render: (v: number) => v > 0 ? <span style={{ color: '#faad14', fontWeight: 'bold' }}>{v}</span> : <span style={{ color: '#ccc' }}>0</span> },
              { title: 'RED', dataIndex: 'red', width: 65, align: 'center' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{v}</span> : <span style={{ color: '#ccc' }}>0</span> },
              {
                title: 'Pass Rate', width: 160, sorter: (a: CrossWoRow, b: CrossWoRow) => a.passRate - b.passRate,
                render: (_: any, r: CrossWoRow) => r.total > 0
                  ? <Progress percent={r.passRate} size="small" strokeColor={r.passRate >= 95 ? '#52c41a' : r.passRate >= 80 ? '#faad14' : '#ff4d4f'} style={{ minWidth: 100 }} />
                  : <Text type="secondary" style={{ fontSize: 11 }}>ไม่มีข้อมูล</Text>,
              },
              { title: 'Line', dataIndex: 'line', width: 80, render: (v: string) => v ?? '-' },
            ] as any}
          />
        </div>
      )}

      {/* ── DETAIL mode ───────────────────────────────────────────────────── */}
      {viewMode === 'detail' && (
      <>
      <Space style={{ marginBottom: 12, flexWrap: 'wrap' }} size={8}>
        <Radio.Group
          value={woStatusFilter}
          onChange={e => setWoStatusFilter(e.target.value)}
          optionType="button" size="small"
        >
          <Radio.Button value="ALL">ทั้งหมด ({woList.length})</Radio.Button>
          <Radio.Button value="ACTIVE">ACTIVE ({woList.filter(w => w.status === 'ACTIVE').length})</Radio.Button>
          <Radio.Button value="SORTING">SORTING ({woList.filter(w => w.status === 'SORTING').length})</Radio.Button>
          <Radio.Button value="END">END ({woList.filter(w => w.status === 'END').length})</Radio.Button>
        </Radio.Group>
        <Select
          showSearch style={{ minWidth: 360 }} placeholder="เลือก Work Order"
          onChange={selectWo} value={selectedWo?.workOrderId ?? undefined} loading={loading}
          filterOption={(inp, opt) => String(opt?.label ?? '').toLowerCase().includes(inp.toLowerCase())}
          options={filteredWoList.map(w => ({ value: w.workOrderId, label: `WO#${w.workOrderId} — ${w.product?.productCode} | Lot: ${w.lotNo} | ${w.status}` }))}
        />
        <Button icon={<DownloadOutlined />} type="primary" disabled={!selectedWo} onClick={exportExcel}>
          Export Excel
        </Button>
      </Space>

      {!selectedWo && (
        <div style={{ textAlign: 'center', color: '#aaa', padding: 40 }}>
          <ClockCircleOutlined style={{ fontSize: 32 }} /><div style={{ marginTop: 8 }}>เลือก WO เพื่อดูรายงาน</div>
        </div>
      )}
      </>
      )}

      {viewMode === 'detail' && selectedWo && (
        <>
          {/* WO Info */}
          <Card size="small" style={{ background: '#fafafa', marginBottom: 8 }}>
            <Row gutter={[16, 6]}>
              <Col><Text strong>WO#</Text> {selectedWo.workOrderId}</Col>
              <Col><Text strong>Product:</Text> {selectedWo.product?.productCode} — {selectedWo.product?.productName}</Col>
              <Col><Text strong>Scale:</Text> {selectedWo.scale?.scaleName ?? selectedWo.scale?.scaleId}</Col>
              <Col><Text strong>Line:</Text> {selectedWo.line ?? '-'}</Col>
              <Col><Text strong>Lot:</Text> {selectedWo.lotNo}</Col>
              <Col><Text strong>วันผลิต:</Text> {selectedWo.startDate ?? '-'}{selectedWo.endDate ? ` → ${selectedWo.endDate}` : ''}</Col>
              <Col><Text strong>Mode:</Text> {selectedWo.product?.weighingMode ?? 'SINGLE'}</Col>
              <Col><Text strong>Status:</Text> <Tag color={selectedWo.status === 'ACTIVE' ? 'green' : selectedWo.status === 'SORTING' ? 'orange' : 'default'}>{selectedWo.status}</Tag></Col>
            </Row>
            <Row gutter={[16, 4]} style={{ marginTop: 6 }}>
              <Col><Tag color="blue" style={{ fontSize: 11 }}>LD</Tag><Text strong> ผู้ดูแล:</Text> {selectedWo.createdBy} ({dayjs(selectedWo.createdAt).format('DD/MM/YY HH:mm')})</Col>
              {selectedWo.startedBy && <Col><Tag color="green" style={{ fontSize: 11 }}>OP1</Tag><Text strong> ผู้เปิดงาน:</Text> {selectedWo.startedBy} ({dayjs(selectedWo.sessionStartedAt).format('DD/MM/YY HH:mm')})</Col>}
              {selectedWo.operatorNames && <Col><Tag color="cyan" style={{ fontSize: 11 }}>OP2</Tag><Text strong> ผู้ชั่ง:</Text> {selectedWo.operatorNames}</Col>}
              {selectedWo.closedBy && <Col><Text strong>ปิดโดย:</Text> {selectedWo.closedBy} ({dayjs(selectedWo.closedAt).format('DD/MM/YY HH:mm')})</Col>}
            </Row>
          </Card>

          {/* Personnel Summary */}
          <Card size="small" style={{ marginBottom: 16, background: '#f0f5ff', borderColor: '#adc6ff' }}>
            <Row gutter={[24, 4]} align="middle">
              <Col>
                <Space size={4}>
                  <Tag color="green" style={{ fontWeight: 600 }}>👷 OP</Tag>
                  <Text style={{ fontSize: 13 }}>
                    {personnelSummary.op1 && <span style={{ fontWeight: 500 }}>{personnelSummary.op1}</span>}
                    {personnelSummary.op1 && <Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>(Login)</Text>}
                    {personnelSummary.op2Names.length > 0 && (
                      <>
                        {personnelSummary.op1 && <span style={{ color: '#bbb', margin: '0 6px' }}>·</span>}
                        {personnelSummary.op2Names.map(n => (
                          <span key={n}><span style={{ fontWeight: 500 }}>{n}</span><Text type="secondary" style={{ fontSize: 11, marginLeft: 4 }}>(ผู้ชั่ง)</Text><span style={{ color: '#bbb', margin: '0 6px' }}>·</span></span>
                        ))}
                      </>
                    )}
                    {!personnelSummary.op1 && personnelSummary.op2Names.length === 0 && <Text type="secondary">-</Text>}
                  </Text>
                </Space>
              </Col>
              <Col>
                <Space size={4}>
                  <Tag color="blue" style={{ fontWeight: 600 }}>👔 LD</Tag>
                  <Text style={{ fontSize: 13 }}>
                    {personnelSummary.ldNames.length > 0
                      ? personnelSummary.ldNames.map((n, i) => <span key={n}>{i > 0 && <span style={{ color: '#bbb', margin: '0 6px' }}>·</span>}<span style={{ fontWeight: 500 }}>{n}</span></span>)
                      : <Text type="secondary">-</Text>}
                  </Text>
                </Space>
              </Col>
              <Col>
                <Space size={4}>
                  <Tag color="purple" style={{ fontWeight: 600 }}>🔬 QA</Tag>
                  <Text style={{ fontSize: 13 }}>
                    {personnelSummary.qaNames.length > 0
                      ? personnelSummary.qaNames.map((n, i) => <span key={n}>{i > 0 && <span style={{ color: '#bbb', margin: '0 6px' }}>·</span>}<span style={{ fontWeight: 500 }}>{n}</span></span>)
                      : <Text type="secondary">-</Text>}
                  </Text>
                </Space>
              </Col>
            </Row>
          </Card>

          {/* Stats */}
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col><Card size="small"><Statistic title="ชั่งทั้งหมด" value={realMeasurements.length} /></Card></Col>
            <Col><Card size="small"><Statistic title="GREEN" value={greenCount} valueStyle={{ color: '#52c41a' }} suffix={<small style={{ fontSize: 11, color: '#999' }}>({realMeasurements.length > 0 ? ((greenCount / realMeasurements.length) * 100).toFixed(1) : 0}%)</small>} /></Card></Col>
            <Col><Card size="small"><Statistic title="YELLOW" value={yellowCount} valueStyle={{ color: '#faad14' }} /></Card></Col>
            <Col><Card size="small"><Statistic title="RED" value={redCount} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
            <Col><Card size="small"><Statistic title="Outer" value={outerRows.length} /></Card></Col>
            <Col><Card size="small"><Statistic title="Std เปลี่ยน" value={barrierMeasurements.length} valueStyle={{ color: '#d4380d' }} /></Card></Col>
            <Col><Card size="small"><Statistic title="Relocate" value={relocateLogs.length} valueStyle={{ color: '#d46b08' }} /></Card></Col>
            <Col><Card size="small"><Statistic title="QA Reweigh" value={qaReweighLogs.length} valueStyle={{ color: '#722ed1' }} /></Card></Col>
            <Col><Card size="small"><Statistic title="Re-weigh" value={reweighCount} valueStyle={{ color: '#1677ff' }} /></Card></Col>
            <Col><Card size="small"><Statistic title="Approvals" value={approvals.length} /></Card></Col>
          </Row>

          <Tabs items={[
            // ─── Tab 1: แยกตาม Outer ─────────────────────────────────────
            {
              key: 'outer',
              label: `แยกตาม Outer (${outerRows.length})`,
              children: (
                <Table
                  size="small" loading={loading}
                  dataSource={outerRows} rowKey="outer"
                  pagination={false}
                  expandable={{
                    expandRowByClick: true,
                    expandedRowRender: (row) => (
                      <div style={{ padding: '8px 0 8px 28px' }}>
                        <Table
                          size="small"
                          dataSource={buildInnerTableData(row.mixed)}
                          rowKey={(r: any) => String(r._key)}
                          pagination={{ pageSize: 30, hideOnSinglePage: true }}
                          scroll={{ x: 900 }}
                          rowClassName={(r: MixedRow) => {
                            if (r.rowKind === 'std_change') return 'ant-table-row-std-change'
                            if (r.rowKind === 'relocate_from' || r.rowKind === 'relocate_to') return 'ant-table-row-relocate'
                            return ''
                          }}
                          style={{ '--std-change-bg': '#fff7e6', '--relocate-bg': '#f6ffed' } as any}
                          columns={innerTimelineCols}
                          onRow={(r: MixedRow) => ({
                            style: {
                              background: r.rowKind === 'std_change' ? '#fff7e6'
                                : r.rowKind === 'relocate_from' ? '#fff7e6'
                                : r.rowKind === 'relocate_to' ? '#f6ffed'
                                : undefined,
                            },
                          })}
                        />
                      </div>
                    ),
                  }}
                  columns={outerColumns}
                  scroll={{ x: 700 }}
                />
              ),
            },
            // ─── Tab 2: ประสิทธิภาพตามกะ ─────────────────────────────────
            {
              key: 'shifts', label: 'ประสิทธิภาพตามกะ',
              children: (
                <Table size="small" loading={loading} dataSource={shiftRows}
                  rowKey={r => `${r.shiftDate}_${r.shift}`} pagination={{ pageSize: 20 }}
                  scroll={{ x: 700 }}
                  summary={rows => {
                    const tT = rows.reduce((s, r) => s + r.total, 0)
                    const tG = rows.reduce((s, r) => s + r.green, 0)
                    const tY = rows.reduce((s, r) => s + r.yellow, 0)
                    const tR = rows.reduce((s, r) => s + r.red, 0)
                    return (
                      <Table.Summary.Row style={{ fontWeight: 'bold', background: '#fafafa' }}>
                        <Table.Summary.Cell index={0} colSpan={2}>รวมทั้งหมด</Table.Summary.Cell>
                        <Table.Summary.Cell index={2}>{tT}</Table.Summary.Cell>
                        <Table.Summary.Cell index={3}><span style={{ color: '#52c41a' }}>{tG}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={4}><span style={{ color: '#faad14' }}>{tY}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={5}><span style={{ color: '#ff4d4f' }}>{tR}</span></Table.Summary.Cell>
                        <Table.Summary.Cell index={6}>{tT > 0 ? ((tG / tT) * 100).toFixed(1) : 0}%</Table.Summary.Cell>
                        <Table.Summary.Cell index={7} /><Table.Summary.Cell index={8} /><Table.Summary.Cell index={9} /><Table.Summary.Cell index={10} />
                      </Table.Summary.Row>
                    )
                  }}
                  columns={[
                    { title: 'วันที่', dataIndex: 'shiftDate', width: 110, render: (v: string) => dayjs(v).format('DD/MM/YYYY') },
                    { title: 'กะ', dataIndex: 'shift', width: 200, render: (v: 'day' | 'night') => v === 'day' ? <Tag color="gold">กะกลางวัน 03:00–15:00</Tag> : <Tag color="blue">กะกลางคืน 15:00–03:00</Tag> },
                    { title: 'ชั่งทั้งหมด', dataIndex: 'total', width: 90, align: 'center' as const },
                    { title: 'GREEN', dataIndex: 'green', width: 80, align: 'center' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{v}</span> },
                    { title: 'YELLOW', dataIndex: 'yellow', width: 80, align: 'center' as const, render: (v: number) => v > 0 ? <span style={{ color: '#faad14', fontWeight: 'bold' }}>{v}</span> : <span style={{ color: '#ccc' }}>0</span> },
                    { title: 'RED', dataIndex: 'red', width: 70, align: 'center' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{v}</span> : <span style={{ color: '#ccc' }}>0</span> },
                    { title: 'อัตรา GREEN', width: 100, align: 'center' as const, render: (_: any, r: typeof shiftRows[0]) => { const p = r.total > 0 ? (r.green / r.total) * 100 : 0; return <span style={{ color: p >= 95 ? '#52c41a' : p >= 80 ? '#faad14' : '#ff4d4f', fontWeight: 'bold' }}>{p.toFixed(1)}%</span> } },
                    { title: 'Relocate', dataIndex: 'relocates', width: 80, align: 'center' as const, render: (v: number) => v > 0 ? <Tag color="orange">{v}</Tag> : <span style={{ color: '#ccc' }}>0</span> },
                    { title: <><Tag color="green" style={{ fontSize: 10, margin: 0 }}>OP</Tag> ผู้ปฏิบัติงาน</>, render: (_: any, r: typeof shiftRows[0]) => {
                      const ops = [...r.operators]
                      return ops.length > 0 ? <Tooltip title={ops.join(', ')}><span style={{ fontSize: 12 }}>{ops.join(', ')}</span></Tooltip> : <Text type="secondary" style={{ fontSize: 11 }}>-</Text>
                    }},
                    { title: <><Tag color="blue" style={{ fontSize: 10, margin: 0 }}>LD</Tag> ผู้ดูแล</>, render: (_: any, r: typeof shiftRows[0]) => {
                      const lds = [...r.leaders]
                      return lds.length > 0 ? <Tooltip title={lds.join(', ')}><span style={{ fontSize: 12 }}>{lds.join(', ')}</span></Tooltip> : <Text type="secondary" style={{ fontSize: 11 }}>-</Text>
                    }},
                    { title: <><Tag color="purple" style={{ fontSize: 10, margin: 0 }}>QA</Tag> ผู้ตรวจสอบ</>, render: (_: any, r: typeof shiftRows[0]) => {
                      const qas = [...r.qaPersonnel]
                      return qas.length > 0 ? <Tooltip title={qas.join(', ')}><span style={{ fontSize: 12 }}>{qas.join(', ')}</span></Tooltip> : <Text type="secondary" style={{ fontSize: 11 }}>-</Text>
                    }},
                  ] as any}
                />
              ),
            },
            // ─── Tab 3: บันทึกกิจกรรมทั้งหมด ─────────────────────────────
            {
              key: 'activity', label: `บันทึกกิจกรรม (${activityRows.length})`,
              children: (
                <Table size="small" loading={loading} dataSource={activityRows}
                  rowKey={r => r.key} pagination={{ pageSize: 25 }} scroll={{ x: 800 }}
                  onRow={r => ({ style: { background: r.category === 'barrier' ? '#fff7e6' : r.category === 'change' ? '#e6f4ff' : undefined } })}
                  columns={[
                    { title: 'เวลา', dataIndex: 'time', width: 145, render: (v: string) => dayjs(v).format('DD/MM/YY HH:mm:ss') },
                    { title: 'กะ', width: 88, render: (_: any, r: typeof activityRows[0]) => shiftTag(r.time) },
                    { title: 'ดำเนินการโดย', dataIndex: 'actor', width: 120 },
                    {
                      title: 'ประเภท', dataIndex: 'type', width: 170,
                      render: (t: string) => {
                        if (t === 'ชั่งน้ำหนัก') return <Tag icon={<CheckCircleOutlined />}>ชั่งน้ำหนัก</Tag>
                        if (t === 'STD_CHANGE') return <Tag icon={<ThunderboltOutlined />} color="volcano">เปลี่ยน Std</Tag>
                        if (t === 'BOX_RELOCATE') return <Tag icon={<SwapOutlined />} color="orange">Sorting/Relocate</Tag>
                        if (t === 'QA_OUTER_REWEIGH') return <Tag icon={<EditOutlined />} color="purple">QA Outer Inspect</Tag>
                        if (t === 'MEASUREMENT_REWEIGH') return <Tag icon={<EditOutlined />} color="blue">Re-weigh</Tag>
                        if (t.startsWith('APPROVAL')) return <Tag icon={<WarningOutlined />} color="purple">{t.replace('APPROVAL_', '')}</Tag>
                        return <Tag>{t}</Tag>
                      },
                    },
                    { title: 'รายละเอียด', dataIndex: 'detail', ellipsis: true, render: (v: string, r: typeof activityRows[0]) => {
                      if (r.category === 'weigh') {
                        const m = realMeasurements.find(x => 'M' + x.measurementId === r.key)
                        return <span>{v} <Tag color={statusColor(m?.status ?? '')}>{m?.status}</Tag></span>
                      }
                      return v
                    } },
                  ] as any}
                />
              ),
            },
            // ─── Tab 4: Sorting/Relocate detail ──────────────────────────
            {
              key: 'sorting', label: `Sorting / Relocate (${relocateLogs.length})`,
              children: relocateLogs.length === 0
                ? <Text type="secondary">ไม่มีการ Sorting/Relocate ใน WO นี้</Text>
                : (
                  <Table size="small" loading={loading} dataSource={relocateLogs}
                    rowKey={r => String(r.id)} pagination={{ pageSize: 20 }} scroll={{ x: 800 }}
                    columns={[
                      { title: 'เวลา', dataIndex: 'createdAt', width: 145, render: (v: string) => dayjs(v).format('DD/MM/YY HH:mm:ss') },
                      { title: 'กะ', width: 88, render: (_: any, r: ChangeLogEntry) => shiftTag(r.createdAt) },
                      { title: 'ดำเนินการโดย', dataIndex: 'createdBy', width: 120 },
                      { title: 'Outer เดิม→ใหม่', width: 130, render: (_: any, r: ChangeLogEntry) => { const d = safeJson(r.description); return `${d.oldOuter ?? '-'} → ${d.newOuter ?? '-'}` } },
                      { title: 'Inner เดิม→ใหม่', width: 130, render: (_: any, r: ChangeLogEntry) => { const d = safeJson(r.description); return d.oldInner === d.newInner ? (d.oldInner ?? '-') : `${d.oldInner ?? '-'} → ${d.newInner ?? '-'}` } },
                      { title: 'Weight', width: 170, render: (_: any, r: ChangeLogEntry) => { const d = safeJson(r.description); if (String(d.changeWeightToo) === 'true') return d.newWeight1 ? `(${d.oldWeight1}/${d.oldWeight2}) → (${d.newWeight1}/${d.newWeight2})` : `${d.oldWeight} → ${d.newWeight}`; return <Text type="secondary">ไม่เปลี่ยน</Text> } },
                      { title: 'เหตุผล', ellipsis: true, render: (_: any, r: ChangeLogEntry) => { const d = safeJson(r.description); return d.reason ?? '-' } },
                    ] as any}
                  />
                ),
            },
            // ─── Tab 5: QA Outer Inspection detail ───────────────────────
            {
              key: 'qa-reweigh', label: `QA Outer Inspect (${qaReweighLogs.length})`,
              children: qaReweighLogs.length === 0
                ? <Text type="secondary">ไม่มีการแก้ไขโดย QA ใน WO นี้</Text>
                : (
                  <Table size="small" loading={loading} dataSource={qaReweighLogs}
                    rowKey={r => String(r.id)} pagination={{ pageSize: 20 }} scroll={{ x: 900 }}
                    onRow={() => ({ style: { background: '#f9f0ff' } })}
                    columns={[
                      { title: 'เวลา', dataIndex: 'createdAt', width: 145, render: (v: string) => dayjs(v).format('DD/MM/YY HH:mm:ss') },
                      { title: 'กะ', width: 88, render: (_: any, r: ChangeLogEntry) => shiftTag(r.createdAt) },
                      { title: 'QA', dataIndex: 'createdBy', width: 110 },
                      {
                        title: 'Outer', width: 90,
                        render: (_: any, r: ChangeLogEntry) => {
                          const d = safeJson(r.description)
                          return <Tag color="purple">{d.oldOuter ?? '-'}</Tag>
                        },
                      },
                      {
                        title: 'Inner เดิม→ใหม่', width: 150,
                        render: (_: any, r: ChangeLogEntry) => {
                          const d = safeJson(r.description)
                          if (d.oldInner === d.newInner) return <Tag color="cyan">{d.oldInner ?? '-'}</Tag>
                          return <span><Tag color="cyan" style={{ opacity: 0.6, textDecoration: 'line-through' }}>{d.oldInner ?? '-'}</Tag><span style={{ fontSize: 11, color: '#aaa' }}> → </span><Tag color="green">{d.newInner ?? '-'}</Tag></span>
                        },
                      },
                      {
                        title: 'น้ำหนัก เดิม→ใหม่', width: 190,
                        render: (_: any, r: ChangeLogEntry) => {
                          const d = safeJson(r.description)
                          const wOld = d.oldWeight1 ? `${Number(d.oldWeight1).toFixed(3)}/${Number(d.oldWeight2).toFixed(3)}` : (d.oldWeight ? Number(d.oldWeight).toFixed(3) : '-')
                          const wNew = d.newWeight1 ? `${Number(d.newWeight1).toFixed(3)}/${Number(d.newWeight2).toFixed(3)}` : (d.newWeight ? Number(d.newWeight).toFixed(3) : '-')
                          return <span style={{ fontSize: 12 }}>{wOld} → {wNew}</span>
                        },
                      },
                      {
                        title: 'Status เดิม→ใหม่', width: 150,
                        render: (_: any, r: ChangeLogEntry) => {
                          const d = safeJson(r.description)
                          if (!d.oldStatus) return null
                          if (d.oldStatus === d.newStatus) return <Tag color={statusColor(d.oldStatus)}>{d.oldStatus}</Tag>
                          return <span><Tag color={statusColor(d.oldStatus)}>{d.oldStatus}</Tag><span style={{ fontSize: 10 }}> → </span><Tag color={statusColor(d.newStatus ?? '')}>{d.newStatus}</Tag></span>
                        },
                      },
                      { title: 'เหตุผล', ellipsis: true, render: (_: any, r: ChangeLogEntry) => { const d = safeJson(r.description); return d.reason ?? '-' } },
                    ] as any}
                  />
                ),
            },
            // ─── Tab 6: รายงานประสิทธิภาพ (Daily + Operator) ────────────────
            {
              key: 'perf',
              label: <span><BarChartOutlined /> รายงานประสิทธิภาพ</span>,
              children: !selectedWo ? null : (
                <Space direction="vertical" style={{ width: '100%' }} size={20}>

                  {/* Operator Performance Table */}
                  <Card
                    size="small"
                    title={<span><UserOutlined style={{ marginRight: 6, color: '#1677ff' }} />ประสิทธิภาพรายคน</span>}
                  >
                    <Table
                      size="small"
                      loading={loading}
                      dataSource={operatorPerfRows}
                      rowKey="operator"
                      pagination={false}
                      scroll={{ x: 700 }}
                      summary={rows => {
                        const tT = rows.reduce((s, r) => s + r.total, 0)
                        const tG = rows.reduce((s, r) => s + r.green, 0)
                        const tY = rows.reduce((s, r) => s + r.yellow, 0)
                        const tR = rows.reduce((s, r) => s + r.red, 0)
                        const pr = tT > 0 ? (tG / tT) * 100 : 0
                        return (
                          <Table.Summary.Row style={{ fontWeight: 'bold', background: '#fafafa' }}>
                            <Table.Summary.Cell index={0}>รวม</Table.Summary.Cell>
                            <Table.Summary.Cell index={1} align="center">{tT}</Table.Summary.Cell>
                            <Table.Summary.Cell index={2} align="center"><span style={{ color: '#52c41a' }}>{tG}</span></Table.Summary.Cell>
                            <Table.Summary.Cell index={3} align="center"><span style={{ color: '#faad14' }}>{tY}</span></Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="center"><span style={{ color: '#ff4d4f' }}>{tR}</span></Table.Summary.Cell>
                            <Table.Summary.Cell index={5}>
                              <Progress percent={parseFloat(pr.toFixed(1))} size="small"
                                strokeColor={pr >= 95 ? '#52c41a' : pr >= 80 ? '#faad14' : '#ff4d4f'}
                                style={{ minWidth: 120 }} />
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={6} /><Table.Summary.Cell index={7} />
                            <Table.Summary.Cell index={8} align="center">{rows.reduce((s, r) => s + r.relocates, 0)}</Table.Summary.Cell>
                            <Table.Summary.Cell index={9} align="center">{rows.reduce((s, r) => s + r.qaActions, 0)}</Table.Summary.Cell>
                          </Table.Summary.Row>
                        )
                      }}
                      columns={[
                        {
                          title: 'Operator', dataIndex: 'operator', width: 130,
                          render: (v: string) => <span><UserOutlined style={{ marginRight: 4, color: '#1677ff' }} />{v}</span>,
                        },
                        { title: 'ชั่งทั้งหมด', dataIndex: 'total', width: 90, align: 'center' as const, sorter: (a: OperatorPerfRow, b: OperatorPerfRow) => a.total - b.total },
                        { title: 'GREEN', dataIndex: 'green', width: 75, align: 'center' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{v}</span> },
                        { title: 'YELLOW', dataIndex: 'yellow', width: 75, align: 'center' as const, render: (v: number) => v > 0 ? <span style={{ color: '#faad14', fontWeight: 'bold' }}>{v}</span> : <span style={{ color: '#ccc' }}>0</span> },
                        { title: 'RED', dataIndex: 'red', width: 65, align: 'center' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{v}</span> : <span style={{ color: '#ccc' }}>0</span> },
                        {
                          title: 'อัตราผ่าน (% GREEN)', width: 200,
                          sorter: (a: OperatorPerfRow, b: OperatorPerfRow) => a.passRate - b.passRate,
                          render: (_: any, r: OperatorPerfRow) => (
                            <Progress
                              percent={parseFloat(r.passRate.toFixed(1))}
                              size="small"
                              strokeColor={r.passRate >= 95 ? '#52c41a' : r.passRate >= 80 ? '#faad14' : '#ff4d4f'}
                              style={{ minWidth: 120 }}
                            />
                          ),
                        },
                        {
                          title: 'กะที่ทำงาน', width: 130,
                          render: (_: any, r: OperatorPerfRow) => (
                            <Space size={4}>
                              {r.shiftDayCount > 0 && <Tag color="gold" style={{ fontSize: 11 }}>กลางวัน×{r.shiftDayCount}</Tag>}
                              {r.shiftNightCount > 0 && <Tag color="blue" style={{ fontSize: 11 }}>กลางคืน×{r.shiftNightCount}</Tag>}
                            </Space>
                          ),
                        },
                        {
                          title: 'รวมกะ', width: 75, align: 'center' as const,
                          sorter: (a: OperatorPerfRow, b: OperatorPerfRow) => (a.shiftDayCount + a.shiftNightCount) - (b.shiftDayCount + b.shiftNightCount),
                          render: (_: any, r: OperatorPerfRow) => r.shiftDayCount + r.shiftNightCount,
                        },
                        { title: 'Relocate', dataIndex: 'relocates', width: 80, align: 'center' as const, render: (v: number) => v > 0 ? <Tag color="orange">{v}</Tag> : <span style={{ color: '#ccc' }}>0</span> },
                        { title: 'QA Inspect', dataIndex: 'qaActions', width: 90, align: 'center' as const, render: (v: number) => v > 0 ? <Tag color="purple">{v}</Tag> : <span style={{ color: '#ccc' }}>0</span> },
                      ] as any}
                    />
                  </Card>

                  {/* Daily + Shift Breakdown */}
                  <Card
                    size="small"
                    title={<span><BarChartOutlined style={{ marginRight: 6, color: '#722ed1' }} />สรุปรายวัน / รายกะ</span>}
                  >
                    <Table
                      size="small"
                      loading={loading}
                      dataSource={dailyPerfRows}
                      rowKey="date"
                      pagination={false}
                      scroll={{ x: 900 }}
                      expandable={{
                        expandRowByClick: true,
                        expandedRowRender: (row: DailyPerfRow) => {
                          const shiftItems = [
                            row.dayShift ? { label: 'กะกลางวัน 03:00–15:00', color: 'gold', data: row.dayShift } : null,
                            row.nightShift ? { label: 'กะกลางคืน 15:00–03:00', color: 'blue', data: row.nightShift } : null,
                          ].filter(Boolean) as Array<{ label: string; color: string; data: typeof row.dayShift & {} }>
                          return (
                            <div style={{ padding: '8px 0 8px 28px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                              {shiftItems.map(item => {
                                const pr = item.data.total > 0 ? (item.data.green / item.data.total) * 100 : 0
                                return (
                                  <Card key={item.label} size="small" style={{ minWidth: 260, borderColor: item.color === 'gold' ? '#faad14' : '#1677ff' }}>
                                    <Tag color={item.color} style={{ marginBottom: 8, fontWeight: 'bold' }}>{item.label}</Tag>
                                    <Row gutter={8}>
                                      <Col><Statistic title="ชั่ง" value={item.data.total} valueStyle={{ fontSize: 18 }} /></Col>
                                      <Col><Statistic title="GREEN" value={item.data.green} valueStyle={{ fontSize: 18, color: '#52c41a' }} /></Col>
                                      <Col><Statistic title="YELLOW" value={item.data.yellow} valueStyle={{ fontSize: 18, color: '#faad14' }} /></Col>
                                      <Col><Statistic title="RED" value={item.data.red} valueStyle={{ fontSize: 18, color: '#ff4d4f' }} /></Col>
                                    </Row>
                                    <Progress percent={parseFloat(pr.toFixed(1))} size="small"
                                      strokeColor={pr >= 95 ? '#52c41a' : pr >= 80 ? '#faad14' : '#ff4d4f'}
                                      style={{ marginTop: 8 }} />
                                    <div style={{ marginTop: 6, fontSize: 12 }}>
                                      <span style={{ color: '#888' }}>Operator: </span>
                                      {item.data.operators.map((op: string) => <Tag key={op} style={{ fontSize: 11 }}>{op}</Tag>)}
                                    </div>
                                    {(item.data.relocates > 0 || item.data.qaActions > 0) && (
                                      <div style={{ marginTop: 4, fontSize: 12 }}>
                                        {item.data.relocates > 0 && <Tag color="orange" style={{ fontSize: 11 }}>Relocate×{item.data.relocates}</Tag>}
                                        {item.data.qaActions > 0 && <Tag color="purple" style={{ fontSize: 11 }}>QA×{item.data.qaActions}</Tag>}
                                      </div>
                                    )}
                                  </Card>
                                )
                              })}
                            </div>
                          )
                        },
                      }}
                      summary={rows => {
                        const tT = rows.reduce((s, r) => s + r.totalDay, 0)
                        const tG = rows.reduce((s, r) => s + r.greenDay, 0)
                        const tY = rows.reduce((s, r) => s + r.yellowDay, 0)
                        const tR = rows.reduce((s, r) => s + r.redDay, 0)
                        const pr = tT > 0 ? (tG / tT) * 100 : 0
                        return (
                          <Table.Summary.Row style={{ fontWeight: 'bold', background: '#fafafa' }}>
                            <Table.Summary.Cell index={0} colSpan={2}>รวมทั้งหมด</Table.Summary.Cell>
                            <Table.Summary.Cell index={2} align="center">{tT}</Table.Summary.Cell>
                            <Table.Summary.Cell index={3} align="center"><span style={{ color: '#52c41a' }}>{tG}</span></Table.Summary.Cell>
                            <Table.Summary.Cell index={4} align="center"><span style={{ color: '#faad14' }}>{tY}</span></Table.Summary.Cell>
                            <Table.Summary.Cell index={5} align="center"><span style={{ color: '#ff4d4f' }}>{tR}</span></Table.Summary.Cell>
                            <Table.Summary.Cell index={6}>
                              <Progress percent={parseFloat(pr.toFixed(1))} size="small"
                                strokeColor={pr >= 95 ? '#52c41a' : pr >= 80 ? '#faad14' : '#ff4d4f'}
                                style={{ minWidth: 100 }} />
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={7} /><Table.Summary.Cell index={8} />
                          </Table.Summary.Row>
                        )
                      }}
                      columns={[
                        { title: 'วันที่', dataIndex: 'date', width: 115, render: (v: string) => dayjs(v).format('DD/MM/YYYY (ddd)') },
                        {
                          title: 'กะ', width: 130,
                          render: (_: any, r: DailyPerfRow) => (
                            <Space size={4}>
                              {r.dayShift && <Tag color="gold" style={{ fontSize: 11 }}>กลางวัน</Tag>}
                              {r.nightShift && <Tag color="blue" style={{ fontSize: 11 }}>กลางคืน</Tag>}
                            </Space>
                          ),
                        },
                        { title: 'ชั่งทั้งหมด', dataIndex: 'totalDay', width: 95, align: 'center' as const, sorter: (a: DailyPerfRow, b: DailyPerfRow) => a.totalDay - b.totalDay },
                        { title: 'GREEN', dataIndex: 'greenDay', width: 75, align: 'center' as const, render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 'bold' }}>{v}</span> },
                        { title: 'YELLOW', dataIndex: 'yellowDay', width: 75, align: 'center' as const, render: (v: number) => v > 0 ? <span style={{ color: '#faad14', fontWeight: 'bold' }}>{v}</span> : <span style={{ color: '#ccc' }}>0</span> },
                        { title: 'RED', dataIndex: 'redDay', width: 65, align: 'center' as const, render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{v}</span> : <span style={{ color: '#ccc' }}>0</span> },
                        {
                          title: 'อัตราผ่าน', width: 160,
                          sorter: (a: DailyPerfRow, b: DailyPerfRow) => (a.totalDay > 0 ? a.greenDay / a.totalDay : 0) - (b.totalDay > 0 ? b.greenDay / b.totalDay : 0),
                          render: (_: any, r: DailyPerfRow) => {
                            const pr = r.totalDay > 0 ? (r.greenDay / r.totalDay) * 100 : 0
                            return <Progress percent={parseFloat(pr.toFixed(1))} size="small"
                              strokeColor={pr >= 95 ? '#52c41a' : pr >= 80 ? '#faad14' : '#ff4d4f'}
                              style={{ minWidth: 100 }} />
                          },
                        },
                        {
                          title: 'Operators', width: 180,
                          render: (_: any, r: DailyPerfRow) => {
                            const ops = new Set([...(r.dayShift?.operators ?? []), ...(r.nightShift?.operators ?? [])])
                            return <Tooltip title={[...ops].join(', ')}><span style={{ fontSize: 12 }}>{[...ops].join(', ')}</span></Tooltip>
                          },
                        },
                        {
                          title: 'Events', width: 130,
                          render: (_: any, r: DailyPerfRow) => {
                            const rel = (r.dayShift?.relocates ?? 0) + (r.nightShift?.relocates ?? 0)
                            const qa = (r.dayShift?.qaActions ?? 0) + (r.nightShift?.qaActions ?? 0)
                            return (
                              <Space size={4}>
                                {rel > 0 && <Tag color="orange" style={{ fontSize: 10 }}>Move×{rel}</Tag>}
                                {qa > 0 && <Tag color="purple" style={{ fontSize: 10 }}>QA×{qa}</Tag>}
                                {rel === 0 && qa === 0 && <Text type="secondary" style={{ fontSize: 11 }}>-</Text>}
                              </Space>
                            )
                          },
                        },
                      ] as any}
                    />
                  </Card>
                </Space>
              ),
            },
          ]} />
        </>
      )}
    </Card>
  )
}
