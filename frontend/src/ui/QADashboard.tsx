import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Card, Table, Tag, Button, Space, Typography, Alert, Switch, Select, Modal, Input as AntInput, Tooltip } from 'antd'
import { apiUrl } from '../api'

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
  lastStatus?: 'GREEN' | 'YELLOW' | 'RED' | string
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

export function QADashboard({ token, username }: { token: string; username: string }) {
  const [items, setItems] = useState<MachineStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const headers = useMemo(() => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }), [token])
  // Auto-refresh controls
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true)
  const [refreshSec, setRefreshSec] = useState<number>(5)

  // QA approvals lists
  const [pendingApply, setPendingApply] = useState<any[]>([])
  const [pendingRedEvents, setPendingRedEvents] = useState<any[]>([])  // เพิ่ม state สำหรับ RED events
  const [pendingOuterInspections, setPendingOuterInspections] = useState<any[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  // เก็บค่า input ต่อรายการ (แก้ปัญหาใช้ hook ใน map)
  const [applyInputs, setApplyInputs] = useState<Record<string, { newStd: string; newStd1: string; newStd2: string; newMin: string; newMax: string; newDMin: string; newDMax: string; reason: string; productCode?: string }>>({})
  const [productDataCache, setProductDataCache] = useState<Record<string, any>>({})
  // Outer Inspection modal
  const [outerModalOpen, setOuterModalOpen] = useState(false)
  const [outerModalApproval, setOuterModalApproval] = useState<any | null>(null)
  const [outerMeasurements, setOuterMeasurements] = useState<any[]>([])
  const [outerMeasLoading, setOuterMeasLoading] = useState(false)
  const [outerNote, setOuterNote] = useState('')
  // Re-weigh / Relocate state per measurement row
  const [editingRowId, setEditingRowId] = useState<number | null>(null)
  const [editWeight, setEditWeight] = useState<string>('')
  const [editWeight1, setEditWeight1] = useState<string>('')
  const [editWeight2, setEditWeight2] = useState<string>('')
  const [editInner, setEditInner] = useState<string>('')
  const [editReason, setEditReason] = useState<string>('')
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editingRecord, setEditingRecord] = useState<any | null>(null)
  // Scale capture state (QA inline editor)
  const [qaScaleBuf, setQaScaleBuf] = useState('')
  const [qaScaleLines, setQaScaleLines] = useState<string[]>([])
  const [qaScaleMsg, setQaScaleMsg] = useState('')
  const [qaScaleFocused, setQaScaleFocused] = useState(false)
  const [qaScaleStep, setQaScaleStep] = useState(0) // DOUBLE: 0=W1 1=W2
  const qaScaleRef = useRef<any>(null)
  const [woList, setWoList] = useState<any[]>([])

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(apiUrl('/api/reports/machine-status'), { headers })
      if (r.status === 403) {
        setAutoRefresh(false)
        setError('⛔ ไม่มีสิทธิ์เข้าถึง (403 Forbidden) - กรุณาตรวจสอบสิทธิ์ของ User QA ที่ Backend')
        return
      }
      if (!r.ok) throw new Error('ไม่สามารถดึงข้อมูลสถานะได้')
      const data = await r.json()
      setItems(data || [])
    } catch (e: any) {
      setError(e?.message || 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }, [headers])

  useEffect(() => {
    fetchStatus()
    if (!autoRefresh) return
    const t = setInterval(fetchStatus, refreshSec * 1000)
    return () => clearInterval(t)
  }, [autoRefresh, refreshSec, fetchStatus])

  useEffect(() => {
    fetch(apiUrl('/api/work-orders'), { headers })
      .then(r => r.ok ? r.json() : [])
      .then(setWoList)
      .catch(() => {})
  }, [headers])

  const reloadQaLists = useCallback(async () => {
    try {
      const r2 = await fetch(apiUrl('/api/approvals/qa-pending?stage=READY_FOR_APPLY'), { headers })
      if (r2.status === 403) {
        setAutoRefresh(false)
        setError('⛔ ไม่มีสิทธิ์เข้าถึงข้อมูลการอนุมัติ (403 Forbidden)')
        return
      }
      const r3 = await fetch(apiUrl('/api/approvals/qa-red-pending'), { headers })  // ดึง RED events
      if (r3.status === 403) {
        setAutoRefresh(false)
        setError('⛔ ไม่มีสิทธิ์เข้าถึงข้อมูล RED (403 Forbidden)')
        return
      }
      const r4 = await fetch(apiUrl('/api/approvals/outer-inspection/pending'), { headers })
      setPendingApply(r2.ok ? (await r2.json()) : [])
      setPendingRedEvents(r3.ok ? (await r3.json()) : [])
      setPendingOuterInspections(r4.ok ? (await r4.json()) : [])
    } catch {
      // ignore
    }
  }, [headers])

  const ensureProductData = useCallback(async (codes: string[]) => {
    const missing = codes.filter(c => c && !productDataCache[c])
    if (missing.length === 0) return
    const results = await Promise.all(missing.map(async (code) => {
      try {
        const r = await fetch(apiUrl(`/api/products/${code}`), { headers })
        if (r.ok) return { code, data: await r.json() }
      } catch {}
      return null
    }))
    const updates: Record<string, any> = {}
    results.forEach(r => { if (r) updates[r.code] = r.data })
    if (Object.keys(updates).length > 0) setProductDataCache(prev => ({ ...prev, ...updates }))
  }, [headers, productDataCache])

  const loadOuterMeasurements = async (approval: any) => {
    let payload: any = {}
    try { payload = approval.payloadJson ? JSON.parse(approval.payloadJson) : {} } catch {}
    setOuterMeasLoading(true)
    try {
      const params = new URLSearchParams({
        productCode: payload.productCode || '',
        scaleId: payload.scaleId || '',
        lotNo: payload.lotNo || '',
        outerBox: payload.outerBox || '',
      })
      const r = await fetch(apiUrl(`/api/measurements/by-outer?${params}`), { headers })
      if (r.ok) setOuterMeasurements(await r.json())
    } catch {}
    setOuterMeasLoading(false)
  }

  const openOuterModal = async (approval: any) => {
    setOuterModalApproval(approval)
    setOuterNote('')
    setOuterMeasurements([])
    setEditingRowId(null)
    setOuterModalOpen(true)
    await loadOuterMeasurements(approval)
  }

  const openEditRow = (m: any) => {
    setEditingRowId(m.measurementId)
    setEditingRecord(m)
    setEditWeight(m.weight != null ? String(m.weight) : '')
    setEditWeight1(m.weight1 != null ? String(m.weight1) : '')
    setEditWeight2(m.weight2 != null ? String(m.weight2) : '')
    setEditInner(m.innerOrder || '')
    setEditReason('')
    setEditError(null)
    setQaScaleBuf(''); setQaScaleLines([]); setQaScaleMsg(''); setQaScaleFocused(false); setQaScaleStep(0)
    setTimeout(() => qaScaleRef.current?.focus(), 200)
  }

  // Helpers: scale + status calc
  const qaParseScaleWeight = (raw: string): number | null => {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
    for (const line of lines) { const m = line.match(/([0-9]+[.,][0-9]+)\s*g?\s*$/); if (m) { const v = parseFloat(m[1].replace(',', '.')); if (!isNaN(v) && v > 0) return v } }
    for (const line of lines) { const v = parseFloat(line.replace(',', '.')); if (!isNaN(v) && v > 0) return v }
    return null
  }
  const qaCalcStatus = (w: number | null, std?: number, tol?: number, wpp?: number): 'GREEN' | 'YELLOW' | 'RED' | null => {
    if (w == null || std == null || std === 0) return null
    const half = (wpp ?? 0) / 2
    if (half > 0 && (w < std - half || w > std + half)) return 'RED'
    if (tol != null && (w < std - tol || w > std + tol)) return 'YELLOW'
    return 'GREEN'
  }
  const qaScaleCapture = (w: number, isDouble: boolean) => {
    if (isDouble) {
      if (qaScaleStep === 0) { setEditWeight1(String(w)); setQaScaleStep(1); setQaScaleMsg(`✅ W1 = ${w.toFixed(3)} — รอ W2`) }
      else { setEditWeight2(String(w)); setQaScaleStep(0); setQaScaleMsg(`✅ W2 = ${w.toFixed(3)} — ครบแล้ว`) }
    } else {
      setEditWeight(String(w))
      setQaScaleMsg(`✅ รับค่า: ${w.toFixed(3)} g`)
    }
    setQaScaleBuf(''); setQaScaleLines([])
  }

  const saveEditRow = async (measurementId: number) => {
    // ป้องกันบันทึกน้ำหนักที่ได้ผล RED
    if (editingRecord) {
      const isDouble = editingRecord.weight1 != null
      const w = parseFloat(editWeight)
      const w1 = parseFloat(editWeight1)
      const w2 = parseFloat(editWeight2)
      let isRed = false
      if (isDouble && !isNaN(w1) && !isNaN(w2)) {
        const s1 = qaCalcStatus(w1, editingRecord.std1, editingRecord.tolerance1, editingRecord.weightPerPiece)
        const s2 = qaCalcStatus(w2, editingRecord.std2, editingRecord.tolerance2, editingRecord.weightPerPiece)
        isRed = s1 === 'RED' || s2 === 'RED'
      } else if (!isDouble && !isNaN(w)) {
        isRed = qaCalcStatus(w, editingRecord.std, editingRecord.tolerance, editingRecord.weightPerPiece) === 'RED'
      }
      if (isRed) { setEditError('⛔ ไม่สามารถบันทึกได้ — น้ำหนักที่ระบุอยู่นอกเกณฑ์ (สถานะ RED)'); return }
    }
    setEditSaving(true)
    setEditError(null)
    try {
      const body: any = {
        qaUsername: username,
        reason: editReason || 'QA แก้ไขระหว่าง Outer Inspection',
        approvalId: outerModalApproval?.id ?? null,
        newInner: editInner,  // ส่ง inner เสมอ — backend ตรวจว่าเปลี่ยนหรือไม่
      }
      if (editWeight !== '') body.weight = parseFloat(editWeight)
      if (editWeight1 !== '') body.weight1 = parseFloat(editWeight1)
      if (editWeight2 !== '') body.weight2 = parseFloat(editWeight2)

      const r = await fetch(apiUrl(`/api/measurements/${measurementId}/qa-reweigh`), {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      })
      if (r.ok) {
        setMsg(`✅ แก้ไข measurement #${measurementId} สำเร็จ`)
        setEditingRowId(null)
        setEditError(null)
        await loadOuterMeasurements(outerModalApproval)
      } else {
        const txt = await r.text().catch(() => '')
        if (r.status === 409 && txt.startsWith('DUPLICATE_INNER:')) {
          // แสดง error ชัดเจนพร้อมคำแนะนำให้ operator
          const detail = txt.replace('DUPLICATE_INNER:', '')
          setEditError(`⚠️ ${detail}`)
        } else {
          setEditError(`❌ แก้ไขไม่สำเร็จ: ${txt}`)
        }
      }
    } catch {
      setEditError('❌ เกิดข้อผิดพลาดในการเชื่อมต่อ')
    }
    setEditSaving(false)
  }

  useEffect(() => {
    reloadQaLists()
    if (!autoRefresh) return
    const t = setInterval(reloadQaLists, Math.max(8, refreshSec * 2) * 1000)
    return () => clearInterval(t)
  }, [autoRefresh, refreshSec, reloadQaLists])

  // เตรียมค่าเริ่มต้นสำหรับ input ของแต่ละ pendingApply เมื่อรายการเปลี่ยน
  useEffect(() => {
    setApplyInputs(prev => {
      const next: Record<string, { newStd: string; newStd1: string; newStd2: string; newMin: string; newMax: string; newDMin: string; newDMax: string; reason: string; productCode?: string }> = { ...prev }
      // เติมค่าใหม่สำหรับ id ที่ยังไม่มี
      for (const it of pendingApply) {
        const id = String(it.id)
        if (!next[id]) {
          let payload: any = {}
          try { payload = it.payloadJson ? JSON.parse(it.payloadJson) : {} } catch {}
          next[id] = {
            newStd: payload.proposedStd != null ? String(payload.proposedStd) : '',
            newStd1: payload.proposedStd1 != null ? String(payload.proposedStd1) : (payload.avgWeight1 != null ? String(payload.avgWeight1) : ''),
            newStd2: payload.proposedStd2 != null ? String(payload.proposedStd2) : (payload.avgWeight2 != null ? String(payload.avgWeight2) : ''),
            newMin: '', newMax: '', newDMin: '', newDMax: '',
            reason: '',
            productCode: payload.productCode || extractFromNote(it?.note, 'product') || ''
          }
        }
      }
      // ลบ id ที่หายไป
      for (const k of Object.keys(next)) {
        if (!pendingApply.find((it:any) => String(it.id) === k)) delete next[k]
      }
      return next
    })
    // fetch product data for formula suggestions
    const codes = pendingApply.map((it: any) => {
      try { return JSON.parse(it.payloadJson || '{}').productCode || '' } catch { return '' }
    }).filter(Boolean)
    ensureProductData(codes)
  }, [pendingApply, ensureProductData])

  const criticalCount = items.filter(x => x.needsQa).length
  const activeCount = items.filter(x => x.active).length

  const columns = [
    {
      title: 'Machine', key: 'machine',
      render: (_: any, r: MachineStatus) => {
        const todayStr = new Date().toISOString().substring(0, 10)
        const scheduledWos = woList.filter((wo: any) =>
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
        const scheduledWos = woList.filter((wo: any) =>
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
                  <Tag color={isRunning ? 'green' : 'orange'} style={{ cursor: 'default', fontSize: 11 }}>
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
        return v ? <Tag color={v==='GREEN'?'green':v==='YELLOW'?'gold':'red'} style={{ fontSize: 12 }}>{v}</Tag> : '-'
      }
    },
    {
      title: 'รายการรออนุมัติ', key: 'pending',
      render: (_: any, r: MachineStatus) => {
        const tags: React.ReactNode[] = []
        if (r.pendingRed > 0)        tags.push(<Tag key="red"   color="red"      style={{ fontSize: 11 }}>🔴 RED ×{r.pendingRed}</Tag>)
        if (r.pendingCleaning > 0)   tags.push(<Tag key="clean" color="orange"   style={{ fontSize: 11 }}>🧹 ทำความสะอาด ×{r.pendingCleaning}</Tag>)
        if (r.pendingOuter > 0)      tags.push(<Tag key="outer" color="blue"     style={{ fontSize: 11 }}>📦 Outer ×{r.pendingOuter}</Tag>)
        if (r.pendingStd > 0)        tags.push(<Tag key="std"   color="purple"   style={{ fontSize: 11 }}>⚖️ Std ×{r.pendingStd}</Tag>)
        if (r.pendingStdLeader > 0)  tags.push(<Tag key="stdl"  color="default"  style={{ fontSize: 11 }}>⚖️ Std รอ LD ×{r.pendingStdLeader}</Tag>)
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
        const scheduledWos = woList.filter((wo: any) =>
          wo.status === 'ACTIVE' &&
          wo.machine?.machineId === r.machineId &&
          (wo.startDate == null || wo.startDate <= todayStr) &&
          (wo.endDate == null || wo.endDate >= todayStr)
        )
        const notStarted = scheduledWos.length > 0 && !r.active
        if (r.needsQa)     return <Tag color="red"    style={{ fontWeight: 600 }}>ต้องการดำเนินการ</Tag>
        if (r.needsLeader) return <Tag color="orange" style={{ fontWeight: 600 }}>รอ LD อนุมัติ</Tag>
        if (notStarted)    return <Tag color="warning" style={{ fontWeight: 600 }}>⚠ ควรเริ่มทำงาน</Tag>
        if (!r.active)     return <span style={{ color: '#bbb', fontSize: 11 }}>—</span>
        return <Tag color="green">ปกติ</Tag>
      }
    }
  ]

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={12}>
      <Card
        title={
          <Space>
            <Typography.Text strong>QA Dashboard</Typography.Text>
            <Tag>{items.length} machines</Tag>
            <Tag color={criticalCount>0?'red':undefined}>ต้องการ QA: {criticalCount}</Tag>
          </Space>
        }
        extra={
          <Space>
            <Switch checked={autoRefresh} onChange={setAutoRefresh} checkedChildren="Auto" unCheckedChildren="Manual" />
            <Select
              size="small"
              value={refreshSec}
              onChange={(v)=>setRefreshSec(v)}
              style={{ width: 90 }}
              disabled={!autoRefresh}
              options={[
                { value: 3, label: '3s' },
                { value: 5, label: '5s' },
                { value: 10, label: '10s' }
              ]}
            />
            <Button onClick={() => { fetchStatus(); reloadQaLists(); }} loading={loading}>รีเฟรช</Button>
          </Space>
        }
      >
        <Table dataSource={items.map((x) => ({ key: x.machineId, ...x }))} columns={columns as any} pagination={false} />
      </Card>

      <Card title={<Space><Typography.Text strong>รอ Apply Std ใหม่</Typography.Text><Tag color={pendingApply.length>0?'gold':undefined}>{pendingApply.length}</Tag></Space>}>
        {pendingApply.length === 0 ? <Alert type="success" message="ยังไม่มีรายการรอ Apply Std" /> : (
          <div style={{ display:'grid', gap:12 }}>
            {pendingApply.map((it:any) => {
              let payload:any={}; try{payload = it.payloadJson?JSON.parse(it.payloadJson):{}}catch{}
              const id = String(it.id)
              const isDouble = payload.proposedStd1 != null || payload.proposedStd2 != null
              const emptyInput = { newStd:'', newStd1:'', newStd2:'', newMin:'', newMax:'', newDMin:'', newDMax:'', reason:'', productCode:'' }
              const inputVal = applyInputs[id] || {
                ...emptyInput,
                newStd: payload.proposedStd != null ? String(payload.proposedStd) : '',
                newStd1: payload.proposedStd1 != null ? String(payload.proposedStd1) : (payload.avgWeight1 != null ? String(payload.avgWeight1) : ''),
                newStd2: payload.proposedStd2 != null ? String(payload.proposedStd2) : (payload.avgWeight2 != null ? String(payload.avgWeight2) : ''),
                productCode: payload.productCode || extractFromNote(it?.note, 'product') || ''
              }
              const fallbackProduct = extractFromNote(it?.note, 'product') || ''
              const productDisplay = payload.productCode || inputVal.productCode || fallbackProduct || '-'
              const modeLabel = isDouble ? 'DOUBLE' : 'SINGLE'

              // Formula suggestions (live — recompute when Std or product data changes)
              const productCode = payload.productCode || inputVal.productCode || fallbackProduct || ''
              const product = productDataCache[productCode]
              const wpp: number | undefined = product?.weightPerPiece
              const proposedStdNum = parseFloat(inputVal.newStd || String(payload.proposedStd ?? ''))
              const canSuggest = wpp != null && !isNaN(proposedStdNum)
              const sugMin  = canSuggest ? proposedStdNum - wpp! / 2 + 1 : null
              const sugMax  = canSuggest ? proposedStdNum + wpp! / 2 + 1 : null
              const sugDMin = canSuggest ? proposedStdNum - wpp! / 4   : null
              const sugDMax = canSuggest ? proposedStdNum + wpp! / 4   : null

              const setInput = (key: string, val: string) =>
                setApplyInputs(v => ({ ...v, [id]: { ...emptyInput, ...(v[id] || {}), [key]: val } }))
              const fillSuggested = () => {
                if (sugMin == null) return
                setApplyInputs(v => ({ ...v, [id]: { ...emptyInput, ...(v[id] || {}), newMin: sugMin.toFixed(3), newMax: sugMax!.toFixed(3), newDMin: sugDMin!.toFixed(3), newDMax: sugDMax!.toFixed(3) } }))
              }

              // Weights display
              const weights5    = payload.weights5    || []
              const weights5_1  = payload.weights5_1  || []
              const weights5_2  = payload.weights5_2  || []
              const allWeights  = payload.allWeights  || payload.weightsAll || []
              const allWeights1 = payload.allWeights1 || []
              const allWeights2 = payload.allWeights2 || []
              const isInitialStd = allWeights.length > 0 || allWeights1.length > 0
              // SINGLE: prefer allWeights (initial) → weights5 (yellow)
              const displayWeights = isDouble
                ? [] // DOUBLE แสดงแยก W1/W2 ข้างล่าง
                : (allWeights.length > 0 ? allWeights : weights5)
              // DOUBLE
              const displayW1 = allWeights1.length > 0 ? allWeights1 : weights5_1
              const displayW2 = allWeights2.length > 0 ? allWeights2 : weights5_2
              const typeLabel = isInitialStd
                ? `Initial Std — Inner กล่องแรก`
                : `YELLOW ×5 — ค่าที่ใช้คำนวณ Std ใหม่`
              const avgW  = displayWeights.length > 0 ? displayWeights.reduce((s: number, w: any) => s + Number(w), 0) / displayWeights.length : null
              const avgW1 = displayW1.length > 0 ? displayW1.reduce((s: number, w: any) => s + Number(w), 0) / displayW1.length : null
              const avgW2 = displayW2.length > 0 ? displayW2.reduce((s: number, w: any) => s + Number(w), 0) / displayW2.length : null
              const hasWeights = displayWeights.length > 0 || displayW1.length > 0 || displayW2.length > 0

              return (
                <div key={it.id} style={{ border:'1px solid #e8e8e8', padding:12, borderRadius:6 }}>
                  {/* Header */}
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center', marginBottom:8 }}>
                    <b>ID:</b> {it.id}
                    <span>Product: <b>{productDisplay}</b></span>
                    <span style={{ background: isDouble ? '#e6f4ff' : '#f6ffed', padding:'1px 8px', borderRadius:4, fontSize:12, border:`1px solid ${isDouble?'#91caff':'#b7eb8f'}` }}>{modeLabel}</span>
                    {isDouble ? (
                      <>
                        <span>Proposed Std1: <b>{payload.proposedStd1 ?? payload.avgWeight1 ?? '-'}</b></span>
                        <span>Proposed Std2: <b>{payload.proposedStd2 ?? payload.avgWeight2 ?? '-'}</b></span>
                      </>
                    ) : (
                      <span>Proposed Std: <b>{payload.proposedStd ?? '-'}</b></span>
                    )}
                    {wpp != null && <span style={{ fontSize:11, color:'#888' }}>wpp = {wpp}</span>}
                  </div>

                  {/* Weights list */}
                  {hasWeights && (
                    <div style={{ marginBottom:10, padding:'8px 10px', background:'#fafafa', border:'1px solid #e8e8e8', borderRadius:4 }}>
                      <div style={{ fontSize:12, color:'#555', marginBottom:6 }}>
                        <b>{typeLabel}</b>
                        <span style={{ marginLeft:8, fontWeight:400, color:'#888' }}>
                          ({isDouble ? `${Math.max(displayW1.length, displayW2.length)} ค่า` : `${displayWeights.length} ค่า`})
                        </span>
                      </div>
                      {/* SINGLE mode */}
                      {!isDouble && displayWeights.length > 0 && (
                        <>
                          <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                            {displayWeights.map((w: any, i: number) => (
                              <Tag key={i} color="blue" style={{ fontFamily:'monospace', fontSize:12 }}>
                                {typeof w === 'number' ? w.toFixed(3) : String(w)}
                              </Tag>
                            ))}
                          </div>
                          {avgW != null && (
                            <div style={{ marginTop:4, fontSize:11, color:'#888' }}>
                              ค่าเฉลี่ย: <b style={{ color:'#1677ff' }}>{avgW.toFixed(3)}</b>
                            </div>
                          )}
                        </>
                      )}
                      {/* DOUBLE mode */}
                      {isDouble && (displayW1.length > 0 || displayW2.length > 0) && (
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                          {[{ label:'W1', vals: displayW1, avg: avgW1 }, { label:'W2', vals: displayW2, avg: avgW2 }].map(({ label, vals, avg }) => (
                            <div key={label}>
                              <div style={{ fontSize:11, fontWeight:600, color:'#555', marginBottom:3 }}>{label}</div>
                              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                                {vals.map((w: any, i: number) => (
                                  <Tag key={i} color="blue" style={{ fontFamily:'monospace', fontSize:12 }}>
                                    {typeof w === 'number' ? w.toFixed(3) : String(w)}
                                  </Tag>
                                ))}
                              </div>
                              {avg != null && (
                                <div style={{ marginTop:3, fontSize:11, color:'#888' }}>
                                  ค่าเฉลี่ย: <b style={{ color:'#1677ff' }}>{avg.toFixed(3)}</b>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Std inputs */}
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end', marginBottom:8 }}>
                    {!payload.productCode && (
                      <div>
                        <div style={{ fontSize:11, color:'#888', marginBottom:2 }}>Product Code</div>
                        <input placeholder="ProductCode" value={inputVal.productCode || ''}
                          onChange={e => setInput('productCode', e.target.value)}
                          style={{ width:160 }} />
                      </div>
                    )}
                    {!isDouble ? (
                      <div>
                        <div style={{ fontSize:11, color:'#888', marginBottom:2 }}>Std ใหม่</div>
                        <input placeholder="เช่น 375.000" value={inputVal.newStd}
                          onChange={e => setInput('newStd', e.target.value)}
                          style={{ width:120 }} />
                      </div>
                    ) : (
                      <>
                        <div>
                          <div style={{ fontSize:11, color:'#888', marginBottom:2 }}>Std 1 ใหม่</div>
                          <input placeholder="Std 1" value={inputVal.newStd1}
                            onChange={e => setInput('newStd1', e.target.value)}
                            style={{ width:110 }} />
                        </div>
                        <div>
                          <div style={{ fontSize:11, color:'#888', marginBottom:2 }}>Std 2 ใหม่</div>
                          <input placeholder="Std 2" value={inputVal.newStd2}
                            onChange={e => setInput('newStd2', e.target.value)}
                            style={{ width:110 }} />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Min/Max/DMin/DMax — SINGLE mode only */}
                  {!isDouble && (
                    <div style={{ marginBottom:10, padding:'8px 10px', background:'#f6ffed', border:'1px solid #d9f7be', borderRadius:4 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <span style={{ fontSize:12, fontWeight:'bold', color:'#389e0d' }}>ตรวจสอบช่วงน้ำหนัก</span>
                        <Space size={4}>
                          {sugMin != null && (
                            <Button size="small" type="dashed" onClick={fillSuggested} style={{ fontSize:11 }}>
                              ↑ ใช้ค่าแนะนำทั้งหมด
                            </Button>
                          )}
                          {wpp == null && productCode && (
                            <span style={{ fontSize:11, color:'#aaa' }}>กำลังโหลดข้อมูลสินค้า...</span>
                          )}
                        </Space>
                      </div>
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                        {([
                          { key:'newMin',  label:'Min',  formula:'Std - wpp/2 + 1', sug:sugMin },
                          { key:'newMax',  label:'Max',  formula:'Std + wpp/2 + 1', sug:sugMax },
                          { key:'newDMin', label:'DMin', formula:'Std - wpp/4',     sug:sugDMin },
                          { key:'newDMax', label:'DMax', formula:'Std + wpp/4',     sug:sugDMax },
                        ] as { key: string; label: string; formula: string; sug: number | null }[]).map(({ key, label, formula, sug }) => (
                          <div key={key}>
                            <div style={{ fontSize:11, marginBottom:3 }}>
                              <b>{label}</b>
                              {sug != null ? (
                                <span style={{ marginLeft:6, color:'#52c41a' }}>
                                  แนะนำ: {sug.toFixed(3)}
                                  <span style={{ color:'#aaa', marginLeft:4 }}>({formula})</span>
                                </span>
                              ) : (
                                <span style={{ color:'#aaa', marginLeft:6 }}>{formula}</span>
                              )}
                            </div>
                            <div style={{ display:'flex', gap:4 }}>
                              <input
                                style={{ width:100 }}
                                placeholder={sug != null ? sug.toFixed(3) : '---'}
                                value={(inputVal as any)[key]}
                                onChange={e => setInput(key, e.target.value)}
                              />
                              {sug != null && (inputVal as any)[key] === '' && (
                                <Button size="small" onClick={() => setInput(key, sug.toFixed(3))} style={{ fontSize:11, padding:'0 6px' }}>↑</Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reason + Apply */}
                  <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                    <input placeholder="เหตุผล" value={inputVal.reason}
                      onChange={e => setInput('reason', e.target.value)}
                      style={{ flex:1, minWidth:200 }} />
                    <Button type="primary" onClick={async () => {
                      const ns = parseFloat(inputVal.newStd)
                      const ns1 = parseFloat(inputVal.newStd1)
                      const ns2 = parseFloat(inputVal.newStd2)
                      if (!isDouble && !isFinite(ns)) { setMsg('กรุณากรอกค่า Std ให้ถูกต้อง'); return }
                      if (isDouble && !isFinite(ns1) && !isFinite(ns2)) { setMsg('กรุณากรอกค่า Std 1 หรือ Std 2 ให้ถูกต้องอย่างน้อย 1 ช่อง'); return }
                      const pCode = payload.productCode || inputVal.productCode || extractFromNote(it?.note, 'product') || ''
                      if (!pCode) { setMsg('ไม่พบรหัสสินค้าใน payload'); return }
                      const newMin = parseFloat(inputVal.newMin)
                      const newMax = parseFloat(inputVal.newMax)
                      const newDMin = parseFloat(inputVal.newDMin)
                      const newDMax = parseFloat(inputVal.newDMax)
                      const r = await fetch(apiUrl(`/api/approvals/${it.id}/apply-std`), {
                        method:'POST', headers: { ...headers, 'Content-Type':'application/json' },
                        body: JSON.stringify({
                          productCode: pCode,
                          lotNo: payload.lotNo || '',
                          scaleId: payload.scaleId || '',
                          outerBox: payload.outerBox || '',
                          innerOrder: payload.innerOrder || '',
                          newStd: isFinite(ns) ? ns : null,
                          newStd1: isFinite(ns1) ? ns1 : null,
                          newStd2: isFinite(ns2) ? ns2 : null,
                          newMin: isFinite(newMin) ? newMin : null,
                          newMax: isFinite(newMax) ? newMax : null,
                          newDMin: isFinite(newDMin) ? newDMin : null,
                          newDMax: isFinite(newDMax) ? newDMax : null,
                          sampleWeightsJson: JSON.stringify(payload.weights5||[]),
                          approvedBy: username,
                          reason: inputVal.reason,
                          note: inputVal.reason || 'Apply Std by QA'
                        })
                      })
                      if (r.ok) { setMsg('บันทึกค่า Std ใหม่เรียบร้อย'); reloadQaLists(); fetchStatus(); }
                      else { setMsg('บันทึก Std ใหม่ไม่สำเร็จ'); }
                    }}>Apply Std</Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {msg && <div style={{ marginTop:8 }}><Alert message={msg} type="info" /></div>}
      </Card>

      {/* OUTER INSPECTION */}
      <Card title={<Space><Typography.Text strong>📦 QA ตรวจสอบ Outer</Typography.Text><Tag color={pendingOuterInspections.length > 0 ? 'blue' : undefined}>{pendingOuterInspections.length}</Tag></Space>} size="small">
        {pendingOuterInspections.length === 0 ? (
          <Typography.Text type="secondary">ไม่มีรายการรอตรวจสอบ Outer</Typography.Text>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingOuterInspections.map((it: any) => {
              let payload: any = {}
              try { payload = it.payloadJson ? JSON.parse(it.payloadJson) : {} } catch {}
              return (
                <div key={it.id} style={{ border: '1px solid #91caff', padding: 8, borderRadius: 4, background: '#e6f4ff' }}>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                    <b>ID:</b> {it.id}
                    <span>Product: {payload.productCode || '-'}</span>
                    <span>Scale: {payload.scaleId || '-'}</span>
                    <span>Lot: {payload.lotNo || '-'}</span>
                    <Tag color="blue">Outer: {payload.outerBox || '-'}</Tag>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>{it.requestedBy} · {it.requestedAt ? new Date(it.requestedAt).toLocaleString('th-TH') : ''}</Typography.Text>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <Button type="primary" size="small" onClick={() => openOuterModal(it)}>
                      ดูและอนุมัติ
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Modal: Outer Inspection Detail */}
      <Modal
        title={`📦 ตรวจสอบ Outer ${(() => { try { return JSON.parse(outerModalApproval?.payloadJson || '{}').outerBox || '' } catch { return '' } })()} — Approval #${outerModalApproval?.id || ''}`}
        open={outerModalOpen}
        onCancel={() => setOuterModalOpen(false)}
        width={800}
        footer={[
          <Button key="cancel" onClick={() => setOuterModalOpen(false)}>ปิด</Button>,
          <Button key="approve" type="primary" onClick={async () => {
            if (!outerModalApproval) return
            const r = await fetch(apiUrl(`/api/approvals/${outerModalApproval.id}/approve-outer`), {
              method: 'POST',
              headers,
              body: JSON.stringify({ actionBy: username, note: outerNote || 'QA ตรวจสอบ Outer ผ่าน' }),
            })
            if (r.ok) {
              setMsg(`✅ อนุมัติ Outer Inspection #${outerModalApproval.id} สำเร็จ`)
              setOuterModalOpen(false)
              reloadQaLists()
            } else {
              setMsg('❌ อนุมัติ Outer Inspection ไม่สำเร็จ')
            }
          }}>
            อนุมัติผ่าน (QA)
          </Button>
        ]}
      >
        {outerMeasLoading ? (
          <Typography.Text type="secondary">กำลังโหลดข้อมูล...</Typography.Text>
        ) : outerMeasurements.length === 0 ? (
          <Alert type="warning" message="ไม่พบข้อมูลการชั่งในกล่องนี้" />
        ) : (
          <>
            <Table
              size="small"
              pagination={false}
              dataSource={outerMeasurements.map((m: any) => ({ key: m.measurementId, ...m }))}
              expandable={{
                expandedRowKeys: editingRowId != null ? [editingRowId] : [],
                onExpand: (expanded, record) => {
                  if (expanded) openEditRow(record)
                  else setEditingRowId(null)
                },
                expandedRowRender: () => {
                  const isDouble = editingRecord?.weight1 != null
                  return (
                    <div style={{ background: '#fffbe6', padding: 12, borderRadius: 6 }}>
                      {/* Std info */}
                      {editingRecord && (editingRecord.std != null || editingRecord.std1 != null) && (
                        <div style={{ background: '#f0f5ff', border: '1px solid #adc6ff', borderRadius: 4, padding: '5px 10px', fontSize: 12, marginBottom: 8 }}>
                          <b>Std:</b>{' '}
                          {isDouble
                            ? <>W1: {editingRecord.std1 != null ? Number(editingRecord.std1).toFixed(3) : '-'}{editingRecord.tolerance1 != null && ` (±${Number(editingRecord.tolerance1).toFixed(3)})`} | W2: {editingRecord.std2 != null ? Number(editingRecord.std2).toFixed(3) : '-'}{editingRecord.tolerance2 != null && ` (±${Number(editingRecord.tolerance2).toFixed(3)})`}</>
                            : <>{editingRecord.std != null ? Number(editingRecord.std).toFixed(3) : '-'}{editingRecord.tolerance != null && ` ±${Number(editingRecord.tolerance).toFixed(3)}`}{editingRecord.weightPerPiece != null && ` (RED ถ้า ±${(Number(editingRecord.weightPerPiece) / 2).toFixed(3)})`}</>
                          }
                        </div>
                      )}
                      {/* Scale capture */}
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <b style={{ fontSize: 12 }}>รับค่าจากเครื่องชั่ง</b>
                          {isDouble && <span style={{ fontSize: 12, color: '#1677ff' }}>— กำลังรับ: <b>W{qaScaleStep === 0 ? '1' : '2'}</b></span>}
                          <span style={{ fontSize: 11, fontWeight: 'bold', padding: '1px 8px', borderRadius: 10, background: qaScaleFocused ? '#f6ffed' : '#fff1f0', color: qaScaleFocused ? '#52c41a' : '#ff4d4f', border: `1px solid ${qaScaleFocused ? '#b7eb8f' : '#ffa39e'}` }}>
                            {qaScaleFocused ? '● พร้อมรับค่า' : '○ คลิกที่ช่องก่อน'}
                          </span>
                        </div>
                        <AntInput
                          ref={qaScaleRef}
                          value={qaScaleBuf}
                          onChange={e => setQaScaleBuf(e.target.value)}
                          onFocus={() => setQaScaleFocused(true)}
                          onBlur={() => setQaScaleFocused(false)}
                          onPaste={e => { e.preventDefault(); const w = qaParseScaleWeight(e.clipboardData.getData('text')); if (w != null) qaScaleCapture(w, isDouble); else setQaScaleMsg('⚠️ ไม่สามารถอ่านค่า') }}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              const nl = [...qaScaleLines, qaScaleBuf]
                              if (nl.length >= 3) { const w = qaParseScaleWeight(nl[0]); if (w != null) qaScaleCapture(w, isDouble); else setQaScaleMsg('⚠️ ไม่สามารถอ่านค่า'); setQaScaleLines([]); setQaScaleBuf('') }
                              else { setQaScaleLines(nl); setQaScaleBuf('') }
                            }
                          }}
                          placeholder="วางเคอร์เซอร์ที่นี่ แล้วส่งจากเครื่องชั่ง..."
                          size="small"
                        />
                        {qaScaleMsg && <div style={{ fontSize: 11, marginTop: 3, color: qaScaleMsg.startsWith('✅') ? '#52c41a' : '#faad14' }}>{qaScaleMsg}</div>}
                      </div>
                      {/* Manual inputs */}
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                        <div>
                          <div style={{ fontSize: 11, color: '#888' }}>Inner (เปลี่ยนได้)</div>
                          <input style={{ width: 80 }} value={editInner} onChange={e => { setEditInner(e.target.value); setEditError(null) }} />
                        </div>
                        {!isDouble && (
                          <div>
                            <div style={{ fontSize: 11, color: '#888' }}>น้ำหนัก</div>
                            <input style={{ width: 100 }} value={editWeight} onChange={e => setEditWeight(e.target.value)} placeholder="เช่น 375.000" />
                          </div>
                        )}
                        {isDouble && (
                          <>
                            <div>
                              <div style={{ fontSize: 11, color: '#888' }}>W1</div>
                              <input style={{ width: 100 }} value={editWeight1} onChange={e => setEditWeight1(e.target.value)} placeholder="185.000" />
                            </div>
                            <div>
                              <div style={{ fontSize: 11, color: '#888' }}>W2</div>
                              <input style={{ width: 100 }} value={editWeight2} onChange={e => setEditWeight2(e.target.value)} placeholder="190.000" />
                            </div>
                          </>
                        )}
                        {/* Live status preview */}
                        {(() => {
                          const w = parseFloat(editWeight), w1 = parseFloat(editWeight1), w2 = parseFloat(editWeight2)
                          const preview = isDouble
                            ? ((!isNaN(w1) && !isNaN(w2)) ? (() => { const s1 = qaCalcStatus(w1, editingRecord?.std1, editingRecord?.tolerance1, editingRecord?.weightPerPiece); const s2 = qaCalcStatus(w2, editingRecord?.std2, editingRecord?.tolerance2, editingRecord?.weightPerPiece); return s1 === 'RED' || s2 === 'RED' ? 'RED' : s1 === 'YELLOW' || s2 === 'YELLOW' ? 'YELLOW' : 'GREEN' })() : null)
                            : (!isNaN(w) ? qaCalcStatus(w, editingRecord?.std, editingRecord?.tolerance, editingRecord?.weightPerPiece) : null)
                          if (!preview) return null
                          return <Tag color={preview === 'GREEN' ? 'green' : preview === 'YELLOW' ? 'gold' : 'red'} style={{ marginBottom: 2, fontSize: 13 }}>{preview}</Tag>
                        })()}
                        <div style={{ flex: 1, minWidth: 150 }}>
                          <div style={{ fontSize: 11, color: '#888' }}>เหตุผล</div>
                          <input style={{ width: '100%' }} value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="เหตุผลการแก้ไข" />
                        </div>
                        <Button type="primary" size="small" loading={editSaving} onClick={() => editingRowId != null && saveEditRow(editingRowId)}>บันทึก</Button>
                        <Button size="small" onClick={() => { setEditingRowId(null); setEditError(null) }}>ยกเลิก</Button>
                      </div>
                      {editError && (
                        <div style={{ marginTop: 8, padding: '6px 10px', background: '#fff2f0', border: '1px solid #ffccc7', borderRadius: 4, color: '#cf1322', fontSize: 13 }}>
                          {editError}
                        </div>
                      )}
                      <div style={{ marginTop: 6, fontSize: 11, color: '#888' }}>
                        * Outer ไม่สามารถเปลี่ยนได้ · เวลาชั่งเดิมคงเดิม — yellow streak ไม่ได้รับผลกระทบ
                      </div>
                    </div>
                  )
                },
              }}
              columns={[
                { title: 'Outer', dataIndex: 'outerBox', width: 70 },
                { title: 'Inner', dataIndex: 'innerOrder', width: 70 },
                { title: 'น้ำหนัก', dataIndex: 'weight', render: (v: number, r: any) =>
                  r.weight1 != null ? `${r.weight1} / ${r.weight2}` : (v != null ? v.toFixed(3) : '-') },
                { title: 'สถานะ', dataIndex: 'status', render: (v: string) =>
                  <Tag color={v === 'GREEN' ? 'green' : v === 'YELLOW' ? 'gold' : 'red'}>{v}</Tag> },
                { title: 'เวลา (เดิม)', dataIndex: 'timestamp', render: (v: string) =>
                  v ? new Date(v).toLocaleTimeString('th-TH') : '-' },
                { title: 'ผู้ชั่ง', dataIndex: 'operatorName' },
                { title: 'แก้ไข', key: 'action', width: 80, render: (_: any, record: any) => (
                  <Button
                    size="small"
                    onClick={() => {
                      if (editingRowId === record.measurementId) setEditingRowId(null)
                      else openEditRow(record)
                    }}
                  >
                    {editingRowId === record.measurementId ? 'ยกเลิก' : 'แก้ไข'}
                  </Button>
                )},
              ]}
            />
            <div style={{ marginTop: 12 }}>
              <Typography.Text>หมายเหตุ Outer Inspection (ไม่บังคับ):</Typography.Text>
              <input
                style={{ display: 'block', width: '100%', marginTop: 4 }}
                placeholder="บันทึกผลการตรวจสอบ..."
                value={outerNote}
                onChange={e => setOuterNote(e.target.value)}
              />
            </div>
          </>
        )}
      </Modal>

      {/* แสดงรายการ RED events ที่รอการอนุมัติ */}
      <Card title={`🔴 RED Events ที่รอการอนุมัติ (${pendingRedEvents.length})`} size="small">
        {pendingRedEvents.length === 0 ? (
          <Typography.Text type="secondary">ไม่มีรายการ RED ที่รอการอนุมัติ</Typography.Text>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {pendingRedEvents.map((it:any) => {
              let payload: any = {}
              try { payload = it.payloadJson ? JSON.parse(it.payloadJson) : {} } catch {}
              return (
                <div key={it.id} style={{ border:'2px solid #d73a49', padding:8, borderRadius:4 }}>
                  <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
                    <b>#{it.id}</b>
                    <span>Product: <b>{payload.productCode || '-'}</b></span>
                    <span style={{ fontSize:11, color:'#888' }}>Scale: {payload.scaleId || '-'} | Lot: {payload.lotNo || '-'}</span>
                    <Tag color="purple">Outer: {payload.outerBox || '-'}</Tag>
                    <Tag color="cyan">Inner: {payload.innerOrder || '-'}</Tag>
                    {/* Weight */}
                    <Tag color="red" style={{ fontFamily:'monospace', fontWeight:700 }}>
                      {payload.weight1 != null
                        ? `W1=${Number(payload.weight1).toFixed(3)} / W2=${Number(payload.weight2).toFixed(3)}`
                        : payload.weight != null ? `น้ำหนัก: ${Number(payload.weight).toFixed(3)}` : '-'}
                    </Tag>
                    {/* Std */}
                    {(payload.std != null || payload.std1 != null) && (
                      <Tag color="default" style={{ fontFamily:'monospace' }}>
                        {payload.std1 != null
                          ? `Std1=${Number(payload.std1).toFixed(3)} / Std2=${Number(payload.std2).toFixed(3)}`
                          : `Std: ${Number(payload.std).toFixed(3)}`}
                      </Tag>
                    )}
                  </div>
                  <div style={{ display:'flex', gap:8, marginTop:6, alignItems:'center', flexWrap:'wrap' }}>
                    <Typography.Text type="secondary" style={{ fontSize:11 }}>
                      แจ้งโดย: <b>{it.requestedBy || '-'}</b>
                      {it.requestedAt && <> · {new Date(it.requestedAt).toLocaleString('th-TH', { dateStyle:'short', timeStyle:'short' })}</>}
                    </Typography.Text>
                  </div>
                  <div style={{ display:'flex', gap:8, marginTop:8 }}>
                    <input
                      placeholder="เหตุผลในการอนุมัติ (บังคับ)"
                      id={`red-note-${it.id}`}
                      style={{ flex:1, minWidth:300 }}
                    />
                    <Button
                      type="primary"
                      danger
                      onClick={async ()=>{
                        const noteInput = document.getElementById(`red-note-${it.id}`) as HTMLInputElement
                        const note = noteInput?.value?.trim() || ''
                        if (!note) { setMsg('❌ กรุณากรอกเหตุผลในการอนุมัติ RED event'); return }
                        const r = await fetch(apiUrl(`/api/approvals/${it.id}/approve-with-note`), {
                          method:'POST', headers: { ...headers, 'Content-Type':'application/json' },
                          body: JSON.stringify({ actionBy: username, note })
                        })
                        if (r.ok) {
                          setMsg('✅ อนุมัติ RED event สำเร็จ — Operator สามารถชั่งซ้ำได้แล้ว')
                          reloadQaLists(); fetchStatus()
                        } else { setMsg('❌ อนุมัติ RED ไม่สำเร็จ') }
                      }}
                    >
                      อนุมัติ (QA)
                    </Button>
                    <Tooltip title="อนุมัติ RED + เริ่มเก็บตัวอย่าง Std ใหม่ 10 กล่อง&#13;&#10;• ชั่งซ้ำกล่องเดิมเป็น Sample #1&#13;&#10;• ชั่งต่อ 9 กล่อง = ครบ 10&#13;&#10;• Std ใหม่ = ค่าเฉลี่ยวิ่งของทั้ง 10 กล่อง">
                      <Button
                        style={{ background:'#722ed1', borderColor:'#722ed1', color:'#fff' }}
                        onClick={async ()=>{
                          const noteInput = document.getElementById(`red-note-${it.id}`) as HTMLInputElement
                          const note = noteInput?.value?.trim() || ''
                          if (!note) { setMsg('❌ กรุณากรอกเหตุผลก่อนกด "คำนวณ Std ใหม่"'); return }
                          const r = await fetch(apiUrl(`/api/approvals/${it.id}/approve-recalc-std`), {
                            method:'POST', headers: { ...headers, 'Content-Type':'application/json' },
                            body: JSON.stringify({ actionBy: username, note })
                          })
                          if (r.ok) {
                            setMsg('⚗️ เริ่มโหมดเก็บตัวอย่าง Std ใหม่ — Operator ชั่งซ้ำกล่องเดิมได้เลย (1/10)')
                            reloadQaLists(); fetchStatus()
                          } else {
                            const txt = await r.text()
                            setMsg(`❌ ไม่สำเร็จ: ${txt}`)
                          }
                        }}
                      >
                        ⚗️ คำนวณ Std ใหม่
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Card>
    </Space>
  )
}

function colorOfStatus(s?: string) {
  if (!s) return '#24292f'
  if (s === 'GREEN') return '#2ea043'
  if (s === 'YELLOW') return '#d4a72c'
  if (s === 'RED') return '#d73a49'
  return '#24292f'
}

// Fallback: extract key=value from approval note, e.g., "product=ABCD, scale=s001, lot=..."
function extractFromNote(note?: string, key?: string): string | undefined {
  if (!note || !key) return undefined
  try {
    const re = new RegExp(`${key}\\s*=\\s*([^,\n]+)`)
    const m = note.match(re)
    return m && m[1] ? m[1].trim() : undefined
  } catch { return undefined }
}
