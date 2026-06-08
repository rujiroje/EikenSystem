import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Space, Select, Input, Button, Tag, Alert, Typography, Tooltip, Modal } from 'antd'
import { apiUrl } from '../api'

type User = { username: string; role: string; token?: string }

type Product = {
  productCode: string
  productName: string
  weightPerPiece: number
  quantityPerMeasurement: number
  tolerance: number
  innerBoxQuantity?: number
  unit: string
  description?: string
  standardWeight?: number
  minWeight?: number
  maxWeight?: number
  weighingMode?: string
  standardWeight1?: number
  standardWeight2?: number
  innerNumberingMode?: string
  tolerance1?: number
  tolerance2?: number
  cleanerTime?: number | null
}

type Scale = {
  scaleId: string
  scaleName?: string
}

type WorkOrder = {
  workOrderId: number
  product: Product
  scale: Scale
  line?: string
  lotNo: string
  startDate?: string
  endDate?: string
  customStd?: number
  customStd1?: number
  customStd2?: number
  status: string
  createdBy: string
  createdAt?: string
  operatorNames?: string
}

type SavedMeasurement = {
  measurementId: number
  status: string
}

export function MeasurementEntry({ currentUser }: Readonly<{ currentUser: User }>) {
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<Product | null>(null) // ต้องให้ผู้ใช้เลือกเองทุกครั้ง ไม่ auto-select
  const [weight, setWeight] = useState<number>(0)
  const [weight1, setWeight1] = useState<number | null>(null)
  const [weight2, setWeight2] = useState<number | null>(null)
  const [status, setStatus] = useState<string>('')
  const [outerBox, setOuterBox] = useState<string>('001')
  const [innerOrder, setInnerOrder] = useState<string>('0001')
  const [locked, setLocked] = useState<boolean>(false)
  const [scales, setScales] = useState<Scale[]>([])
  const [scaleId, setScaleId] = useState<string>('')
  const [lotNo, setLotNo] = useState<string>('')
  const [masterErr, setMasterErr] = useState<string>('')
  // เก็บข้อมูลเพื่อคุมค่า Std ตามกติกาใหม่
  const [currentStd, setCurrentStd] = useState<number>(0) // Std ที่ใช้งานจริง (เริ่มจากตาราง)
  const [consecutiveYellow, setConsecutiveYellow] = useState<number>(0)
  const [consecutiveYellow1, setConsecutiveYellow1] = useState<number>(0) // DOUBLE: ชั่ง #1 เหลือง
  const [consecutiveYellow2, setConsecutiveYellow2] = useState<number>(0) // DOUBLE: ชั่ง #2 เหลือง
  const [remainingYellow, setRemainingYellow] = useState<number>(5)
  const [yellowSeqWeights, setYellowSeqWeights] = useState<number[]>([]) // เก็บ 5 ค่าน้ำหนักเหลืองล่าสุดติดกัน
  const [collectingForStd, setCollectingForStd] = useState<boolean>(false) // เริ่มเก็บเพิ่มอีก 2 กล่องหรือยัง
  const [proposedStd, setProposedStd] = useState<number | null>(null)
  const [proposedStd1Display, setProposedStd1Display] = useState<number | null>(null) // DOUBLE: proposed std #1
  const [proposedStd2Display, setProposedStd2Display] = useState<number | null>(null) // DOUBLE: proposed std #2
  const [qaApprovalId, setQaApprovalId] = useState<number | null>(null)
  const [yellowLockedAwaitQA, setYellowLockedAwaitQA] = useState<boolean>(false) // ล็อกรอ QA อนุญาตให้ชั่งต่อ 4-5
  const [lockedForInitialStd, setLockedForInitialStd] = useState<boolean>(false) // ล็อกเพราะครบ Initial Std threshold
  const [initialStdThreshold, setInitialStdThreshold] = useState<number>(10) // จำนวน Inner ต่อ Outer (จาก product)
  const [waitingForApply, setWaitingForApply] = useState<boolean>(false) // รอ QA ยืนยัน apply Std ใหม่
  // เก็บคำขอ QA ที่ยังส่งไม่สำเร็จ (เช่น server ล่มชั่วคราว) เพื่อ retry อัตโนมัติ
  const queuedQaDraftRef = useRef<{ productCode:string; scaleId:string; lotNo:string; outerBox?:string; innerOrder?:string; stdOld:number; weights3:number[]; weights5:number[]; proposedStd:number, proposedStd1?:number, proposedStd2?:number, initialStdThreshold?:number }|null>(null)
  // Hard lock ref: set synchronously เมื่อระบบต้องรอ QA (ป้องกัน race condition ระหว่าง async state update)
  const hardLockRef = useRef<boolean>(false)
  // คุม auto-save สำหรับ RED ให้บันทึกครั้งเดียวต่อชิ้นงาน (outer/inner ปัจจุบัน)
  const redAutoSavedRef = useRef<boolean>(false)
  // ป้องกันการสร้างคำขอ RED ซ้ำในรอบเดียวกัน
  const redApprovalRequestedRef = useRef<boolean>(false)
  const [redAutoSaved, setRedAutoSaved] = useState<boolean>(false)
  // Lock ข้อมูลขั้นตอนที่ 1 (Product/Scale/Lot) หลังเริ่มชั่ง
  const [step1Locked, setStep1Locked] = useState<boolean>(false)

  // Cleaning Reminder
  const [cleaningRequired, setCleaningRequired] = useState<boolean>(false)
  const [cleaningApprovalId, setCleaningApprovalId] = useState<number | null>(null)
  const [cleaningHourLabel, setCleaningHourLabel] = useState<string>('')
  const [lastCleanedHour, setLastCleanedHour] = useState<string>('')
  const sessionStartRef = useRef<Date | null>(null)
  // Countdown to next cleaning (seconds remaining, null = inactive)
  const [cleanerSecondsLeft, setCleanerSecondsLeft] = useState<number | null>(null)

  // Work Order
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([])
  const [workOrder, setWorkOrder] = useState<WorkOrder | null>(null)
  const [operatorNamesInput, setOperatorNamesInput] = useState<string>('')
  const [woSelectModalOpen, setWoSelectModalOpen] = useState<boolean>(false)

  // Scale capture states
  const [captureEnabled, setCaptureEnabled] = useState<boolean>(true)
  const [buffer, setBuffer] = useState<string>('')
  const [lines, setLines] = useState<string[]>([])
  const [captureInfo, setCaptureInfo] = useState<string>('')
  const [capTime, setCapTime] = useState<string>('')
  const [capDate, setCapDate] = useState<string>('')
  const inputRef = useRef<HTMLInputElement>(null)
  const [infoMessage, setInfoMessage] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [leaderApprovalId, setLeaderApprovalId] = useState<number | null>(null)
  // อนุญาตให้ชั่งซ้ำหลัง RED ได้รับการอนุมัติ (ไม่ล็อกอัตโนมัติเมื่อดึง last ที่สถานะยังเป็น RED เดิม)
  const allowRepeatAfterRedRef = useRef<boolean>(false)
  const savedBoxesRef = useRef<Set<string>>(new Set())
  // ตัวเลือก: บันทึก GREEN/YELLOW อัตโนมัติ ลดการคลิก
  const [autoSaveGY, setAutoSaveGY] = useState<boolean>(true)
  const submittingRef = useRef<boolean>(false)
  // ป้องกัน classify ซ้ำจาก onChange/auto calls ในช่วงเวลาใกล้กัน
  const lastClassifyRef = useRef<{ key: string; ts: number } | null>(null)
  // ป้องกันการสร้าง QA request ซ้ำก่อน state อัปเดต
  const qaRequestInFlightRef = useRef<boolean>(false)
  // ป้องกันการเพิ่ม Inner ซ้ำหลัง QA อนุมัติ
  const qaInnerIncrementedRef = useRef<boolean>(false)
  const refreshLastBoxSeqRef = useRef<number>(0)  // ป้องกัน race condition: response ล้าสมัยจาก refreshLastBox
  // Modal สำหรับแก้ไขหมายเลขกล่อง
  const [editBoxModalVisible, setEditBoxModalVisible] = useState<boolean>(false)
  const [editInnerValue, setEditInnerValue] = useState<string>('')
  const [editOuterValue, setEditOuterValue] = useState<string>('')
  const [modalErrorMessage, setModalErrorMessage] = useState<string>('')
  // ป้องกัน auto-calculate หลังจาก Operator แก้ไขหมายเลขด้วยตนเอง
  const manualEditTimestampRef = useRef<number>(0)
  // ป้องกัน submit ในขณะที่ lockStep1 กำลัง fetch ข้อมูลล่าสุดจาก backend (ป้องกัน race condition)
  const step1LoadingRef = useRef<boolean>(false)
  
  // Recalc Std mode — เก็บตัวอย่าง 10 กล่อง หลัง QA อนุมัติ RED ด้วย "คำนวณ Std ใหม่"
  const [recalcStdMode, setRecalcStdMode] = useState<boolean>(false)
  const [recalcSampleCount, setRecalcSampleCount] = useState<number>(0)
  const [recalcCurrentAvg, setRecalcCurrentAvg] = useState<number>(0)

  // State สำหรับตารางแสดงข้อมูลการชั่ง
  const [measurementHistory, setMeasurementHistory] = useState<Array<{outer: string; inner: string; weight: number; weight1?: number; weight2?: number; std: number; std1?: number; std2?: number; status: string}>>([])

  // ใช้ token สดทุกครั้ง (ป้องกันกรณี token เปลี่ยนหลัง re-login)
  const getAuthHeaders = (): Record<string, string> => {
    const t = localStorage.getItem('token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  // Handler สำหรับเปิด Modal แก้ไขหมายเลข
  const handleOpenEditBoxModal = () => {
    setEditInnerValue(innerOrder)
    setEditOuterValue(outerBox)
    setModalErrorMessage('') // ล้าง error message
    setEditBoxModalVisible(true)
  }
  
  
  // Function สำหรับอัปเดต Yellow Count และบันทึก Log
  const updateYellowCounters = (newConsecYellow: number, newRemaining: number) => {
    setConsecutiveYellow(newConsecYellow)
    setRemainingYellow(newRemaining)
  }
  
  // Function สำหรับดึงข้อมูลตารางการชั่ง
  const loadMeasurementHistory = async () => {
    if (!selected || !scaleId || !lotNo) return
    try {
      const params = new URLSearchParams({
        productCode: selected.productCode,
        scaleId: scaleId,
        lotNo: lotNo
      })
      const r = await fetch(apiUrl(`/api/measurements/history?${params}`), { headers: getAuthHeaders() })
      if (!r.ok) return
      const data = await r.json()
      // จัดรูปแบบข้อมูลเป็น array ของ {outer, inner, weight, status}
      const history = Array.isArray(data) ? data.map((m: any) => ({
        outer: String(m.outerBoxNumber || m.outerBox || '').padStart(3, '0'),
        inner: String(m.innerBoxOrder || m.innerOrder || '').padStart(4, '0'),
        weight: m.weight || 0,
        weight1: m.weight1,
        weight2: m.weight2,
        std: m.std || 0,
        std1: m.std1,
        std2: m.std2,
        status: (m.status || '').toUpperCase()
      })) : []
      setMeasurementHistory(history)
    } catch {}
  }
  
  // Handler สำหรับยืนยันการแก้ไขหมายเลข
  const handleConfirmEditBox = () => {
    const newInner = editInnerValue.trim().padStart(4, '0')
    const newOuter = editOuterValue.trim().padStart(3, '0')
    
    // ตรวจสอบไม่ให้แก้ไขเลขย้อนหลัง
    const currentInnerNum = Number.parseInt(innerOrder, 10)
    const currentOuterNum = Number.parseInt(outerBox, 10)
    const newInnerNum = Number.parseInt(newInner, 10)
    const newOuterNum = Number.parseInt(newOuter, 10)
    
    // ตรวจสอบ Outer ก่อน
    if (newOuterNum < currentOuterNum) {
      setModalErrorMessage(`❌ ไม่สามารถแก้ไขเป็น Outer ${newOuter} ได้ เนื่องจากน้อยกว่า Outer ปัจจุบัน (${outerBox})`)
      return
    }
    
    // ถ้า Outer เท่ากัน ให้ตรวจสอบ Inner
    if (newOuterNum === currentOuterNum && newInnerNum < currentInnerNum) {
      setModalErrorMessage(`❌ ไม่สามารถแก้ไขเป็น Inner ${newInner} ได้ เนื่องจากน้อยกว่า Inner ปัจจุบัน (${innerOrder})`)
      return
    }
    
    // ผ่านการตรวจสอบแล้ว ดำเนินการแก้ไข
    setInnerOrder(newInner)
    setOuterBox(newOuter)
    // บันทึก timestamp เพื่อป้องกัน auto-calculate ใน 2 นาทีข้างหน้า
    manualEditTimestampRef.current = Date.now()
    setEditBoxModalVisible(false)
    setModalErrorMessage('') // ล้าง error message
    setInfoMessage(`แก้ไขหมายเลขกล่องเป็น Outer: ${newOuter}, Inner: ${newInner} (ระบบจะไม่ auto-calculate ใน 2 นาที)`)
  }
  
  const loadProducts = async () => {
    try {
      const r = await fetch(apiUrl('/api/products'), { headers: getAuthHeaders() })
      if (!r.ok) throw new Error('products')
      const data: Product[] = await r.json()
      setProducts(Array.isArray(data) ? data : [])
    } catch {
      setProducts([])
      setMasterErr('โหลดสินค้า/เครื่องชั่งไม่สำเร็จ — ตรวจสอบ backend ที่พอร์ต 8090')
    }
  }
  useEffect(() => { loadProducts() }, [])

  const loadScales = async () => {
    try {
      const r = await fetch(apiUrl('/api/scales'), { headers: getAuthHeaders() })
      if (!r.ok) throw new Error('scales')
      const data: Scale[] = await r.json()
      setScales(Array.isArray(data) ? data : [])
    } catch {
      setScales([])
      setMasterErr('โหลดสินค้า/เครื่องชั่งไม่สำเร็จ — ตรวจสอบ backend ที่พอร์ต 8090')
    }
  }
  useEffect(() => { loadScales() }, [])

  const loadWorkOrders = async () => {
    try {
      const r = await fetch(apiUrl('/api/work-orders?status=ACTIVE&availableForOperator=true'), { headers: getAuthHeaders() })
      if (!r.ok) return
      const data: WorkOrder[] = await r.json()
      setWorkOrders(Array.isArray(data) ? data : [])
    } catch {}
  }
  useEffect(() => { loadWorkOrders() }, [])

  const startWOSession = async (wo: WorkOrder) => {
    try {
      await fetch(apiUrl(`/api/work-orders/${wo.workOrderId}/start`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ operatorNames: operatorNamesInput }),
      })
    } catch {}
  }

  const requestCleaningCheck = async (slotLabel: string): Promise<number | null> => {
    try {
      const r = await fetch(apiUrl('/api/approvals/cleaning-check'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          scaleId,
          productCode: selected?.productCode,
          lotNo,
          workOrderId: workOrder?.workOrderId ?? null,
          hourLabel: slotLabel,
        }),
      })
      if (!r.ok) return null
      const data = await r.json()
      return data.id ?? null
    } catch { return null }
  }

  const pollCleaningStatus = async (hourLabel: string): Promise<string> => {
    try {
      const params = new URLSearchParams({ scaleId, hourLabel })
      const r = await fetch(apiUrl(`/api/approvals/cleaning-check/status?${params}`), { headers: getAuthHeaders() })
      if (!r.ok) return 'NONE'
      const data = await r.json()
      return data.status ?? 'NONE'
    } catch { return 'NONE' }
  }

  // Cleaning timer: ตรวจสอบทุก 30 วินาที ว่าผ่านชั่วโมงทำความสะอาดครบแล้วหรือยัง
  useEffect(() => {
    if (!step1Locked) return
    const cleanerTime = selected?.cleanerTime
    if (!cleanerTime || cleanerTime <= 0) return  // ไม่ตั้งค่า cleanerTime → ปิดการแจ้งเตือน
    const interval = setInterval(async () => {
      if (cleaningRequired) return  // กำลังรอ LD อยู่แล้ว
      if (!sessionStartRef.current) return
      const elapsedHours = (Date.now() - sessionStartRef.current.getTime()) / 3600000
      const currentSlot = Math.floor(elapsedHours / cleanerTime)
      if (currentSlot <= 0) return  // ยังไม่ครบรอบแรก
      const slotLabel = `slot${currentSlot}`
      if (slotLabel === lastCleanedHour) return  // slot นี้ทำความสะอาดแล้ว
      // slot ใหม่ → ตรวจสอบว่า approved ล่วงหน้าแล้วหรือยัง
      const status = await pollCleaningStatus(slotLabel)
      if (status === 'APPROVED') {
        setLastCleanedHour(slotLabel)
        return
      }
      // ยังไม่ได้ทำความสะอาด → lock และส่ง request
      setCleaningHourLabel(slotLabel)
      setCleaningRequired(true)
      setLocked(true)
      setInfoMessage(`🧹 ถึงเวลาทำความสะอาดเครื่องชั่ง (ครั้งที่ ${currentSlot}, ทุก ${cleanerTime} ชั่วโมง) — รอ Leader อนุมัติ`)
      const id = await requestCleaningCheck(slotLabel)
      if (id) setCleaningApprovalId(id)
    }, 30000) // ตรวจทุก 30 วินาที
    return () => clearInterval(interval)
  }, [step1Locked, lastCleanedHour, cleaningRequired, scaleId, selected, lotNo, workOrder])

  // Poll: รอ LD approve cleaning
  useEffect(() => {
    if (!cleaningRequired || !cleaningHourLabel) return
    const interval = setInterval(async () => {
      const status = await pollCleaningStatus(cleaningHourLabel)
      if (status === 'APPROVED') {
        setCleaningRequired(false)
        setCleaningApprovalId(null)
        setLastCleanedHour(cleaningHourLabel)
        setLocked(false)
        setInfoMessage(`✅ LD อนุมัติการทำความสะอาดแล้ว ชั่งต่อได้เลย`)
      }
    }, 5000)
    return () => clearInterval(interval)
  }, [cleaningRequired, cleaningHourLabel, scaleId])

  // Countdown ticker: อัปเดตทุก 1 วินาที
  useEffect(() => {
    const ct = selected?.cleanerTime
    if (!step1Locked || !ct || ct <= 0) { setCleanerSecondsLeft(null); return }
    const tick = () => {
      const start = sessionStartRef.current
      if (!start) return
      const elapsed = (Date.now() - start.getTime()) / 1000
      const slotSec = ct * 3600
      const remaining = Math.ceil(slotSec - (elapsed % slotSec))
      setCleanerSecondsLeft(remaining > 0 ? remaining : 0)
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [step1Locked, selected?.cleanerTime])

  const closeWorkOrder = async () => {
    if (!workOrder) return
    const r = await fetch(apiUrl(`/api/work-orders/${workOrder.workOrderId}/close`), {
      method: 'POST',
      headers: getAuthHeaders(),
    })
    if (r.ok) {
      setInfoMessage(`ปิด WO #${workOrder.workOrderId} เรียบร้อยแล้ว (สถานะ: END)`)
      unlockStep1()
      setWorkOrder(null)
      setOperatorNamesInput('')
      loadWorkOrders()
    } else {
      setErrorMessage('ปิด WO ไม่สำเร็จ')
    }
  }

  useEffect(() => {
    if (captureEnabled && inputRef.current) {
      inputRef.current.focus()
    }
  }, [captureEnabled])

  // ดึงข้อมูลตารางเมื่อมีการเปลี่ยนแปลง Product/Scale/Lot หรือ outer/inner
  useEffect(() => {
    if (step1Locked && selected && scaleId && lotNo) {
      loadMeasurementHistory()
      // Auto refresh ทุก 30 วินาที (backup สำหรับกรณีมีคนอื่นชั่งพร้อมกัน)
      const interval = setInterval(() => {
        loadMeasurementHistory()
      }, 30000)
      return () => clearInterval(interval)
    }
  }, [step1Locked, selected, scaleId, lotNo])

  // Poll approval when waiting for QA to allow 4-5
  useEffect(() => {
    if (!qaApprovalId || !yellowLockedAwaitQA) return
    const t = setInterval(async () => {
      try {
  const r = await fetch(apiUrl(`/api/approvals/${qaApprovalId}`), { headers: getAuthHeaders() })
        if (!r.ok) return
        const a = await r.json()
        if (a?.stage === 'ALLOW_4_5') {
          setYellowLockedAwaitQA(false)
          setLocked(false)
          setCollectingForStd(true)
        }
        if (a?.stage === 'READY_FOR_APPLY') {
          setYellowLockedAwaitQA(false)
          setCollectingForStd(false)
          setWaitingForApply(true)
          setLocked(true)
        }
      } catch {}
    }, 5000)
    return () => clearInterval(t)
  }, [qaApprovalId, yellowLockedAwaitQA])

  // Poll approval when waiting for QA to apply new std
  useEffect(() => {
    if (!qaApprovalId || !waitingForApply) return
    const checkApproval = async () => {
      try {
        const r = await fetch(apiUrl(`/api/approvals/${qaApprovalId}`), { headers: getAuthHeaders() })
        if (r.ok === false) return
        const a = await r.json()
        if (a?.stage === 'APPLIED') {
          setWaitingForApply(false)
          setLocked(false)
          setYellowLockedAwaitQA(false) // ปลดล็อกทั้งหมด

          // ดึง proposedStd จาก payload ของ Approval (ครอบคลุม initial weighing ที่ไม่ได้ set proposedStd state)
          let effectiveStd: number | null = proposedStd
          let effectiveStd1: number | null = null
          let effectiveStd2: number | null = null
          try {
            const payload = a.payloadJson ? JSON.parse(a.payloadJson) : {}
            if (payload.proposedStd && Number.isFinite(Number(payload.proposedStd))) effectiveStd = Number(payload.proposedStd)
            if (payload.proposedStd1 && Number.isFinite(Number(payload.proposedStd1))) effectiveStd1 = Number(payload.proposedStd1)
            if (payload.proposedStd2 && Number.isFinite(Number(payload.proposedStd2))) effectiveStd2 = Number(payload.proposedStd2)
          } catch {}

          if (effectiveStd != null && effectiveStd > 0) {
            setCurrentStd(effectiveStd)
            setSelected(prev => {
              if (!prev) return prev
              return {
                ...prev,
                standardWeight: effectiveStd!,
                standardWeight1: effectiveStd1 ?? prev.standardWeight1,
                standardWeight2: effectiveStd2 ?? prev.standardWeight2,
              } as Product
            })
          } else {
            // last-resort fallback: fetch effective std from backend StandardWeightLog
            try {
              const r2 = await fetch(apiUrl(`/api/products/${selected?.productCode}/effective-std`), { headers: getAuthHeaders() })
              if (r2.ok) {
                const d = await r2.json()
                if (d?.std && Number.isFinite(d.std)) {
                  setCurrentStd(d.std)
                  setSelected(prev => prev ? { ...prev, standardWeight: d.std } as Product : prev)
                }
              }
            } catch {}
          }
          // reset counters for next round
          setConsecutiveYellow(0)
          setRemainingYellow(5)

          setYellowSeqWeights([])
          setProposedStd(null)            // สำคัญ: ต้องล้าง ไม่งั้นรอบหน้าจะไม่ล็อคเมื่อเหลืองครบ 5
          setQaApprovalId(null)           // ปลดผูก approval เดิม ให้สร้างคำขอใหม่ได้
          setYellowLockedAwaitQA(false)
          setCollectingForStd(false)
          // ตัด key classify เดิม ป้องกันการทับซ้อน state รอบก่อน
          lastClassifyRef.current = null
          qaRequestInFlightRef.current = false
          hardLockRef.current = false  // ปลด hard lock หลัง QA อนุมัติ
          
          // **สำคัญ: เพิ่มหมายเลข Inner ไปข้างหน้า เพราะเหลือง 5 กล่องแล้ว ต้องเริ่มกล่องใหม่**
          // ใช้ flag ป้องกันการเพิ่มซ้ำ (polling interval ทำซ้ำทุก 5 วินาที)
          if (!qaInnerIncrementedRef.current && selected) {
            qaInnerIncrementedRef.current = true
            // เรียก refreshLastBox เพื่อดึงเลขกล่องถัดไปจาก Backend (ป้องกันการบวกซ้ำซ้อน)
            refreshLastBox()
            setInfoMessage(`✅ QA อนุมัติ Std ใหม่ = ${proposedStd?.toFixed(3)} และเริ่มกล่องถัดไปแล้ว`)
          }
        }
      } catch {}
    }

    const t = setInterval(checkApproval, 5000)
    return () => clearInterval(t)
  }, [qaApprovalId, waitingForApply, proposedStd])

  // Auto-retry การส่งคำขอ QA สำหรับ Yellow x5 ถ้ายังไม่มี approvalId (เช่น server ล่ม/เชื่อมต่อไม่ได้)
  useEffect(() => {
    if (!yellowLockedAwaitQA || qaApprovalId) return
    const t = setInterval(async () => {
      try {
        const draft = queuedQaDraftRef.current
        if (!draft) return
        let id = null
        if (draft.proposedStd != null) {
          id = await requestQaApprovalWithStd(draft, currentUser.username)
        } else {
          id = await requestQaApprovalDraft(draft, currentUser.username)
        }
        if (id) {
          setQaApprovalId(id)
          setInfoMessage(`สร้างคำขอ QA สำเร็จ (ID: ${id})`)
        }
      } catch {}
    }, 5000)
    return () => clearInterval(t)
  }, [yellowLockedAwaitQA, qaApprovalId, currentUser.username])

  // Poll leader approval for RED unlock
  useEffect(() => {
    if (!leaderApprovalId || !locked) return
    const t = setInterval(async () => {
      try {
  const r = await fetch(apiUrl(`/api/approvals/${leaderApprovalId}`), { headers: getAuthHeaders() })
        if (!r.ok) return
        const a = await r.json()
        if (a?.status === 'APPROVED') {
          // ดึงข้อมูล Outer/Inner จาก payload เพื่อย้อนกลับไปชั่งซ้ำที่กล่องเดิม
          let redOuter = outerBox
          let redInner = innerOrder
          try {
            const payload = a.payloadJson ? JSON.parse(a.payloadJson) : {}
            if (payload.outerBox) redOuter = String(payload.outerBox).padStart(3, '0')
            if (payload.innerOrder) redInner = String(payload.innerOrder).padStart(4, '0')
          } catch {}
          
          // ปลดล็อกและเตรียมชั่งซ้ำที่หมายเลขกล่องเดิม
          setOuterBox(redOuter)
          setInnerOrder(redInner)
          hardLockRef.current = false  // ← reset ref lock ก่อน setLocked เพื่อให้ submit() ทำงานได้
          setLocked(false)
          redAutoSavedRef.current = false
          redApprovalRequestedRef.current = false
          setRedAutoSaved(false)
          setStatus('')
          setWeight(0)
          setCapTime('')
          setCapDate('')
          setInfoMessage(`🟢 Leader/QA อนุมัติแล้ว: ปลดล็อกและพร้อมชั่งซ้ำที่กล่อง Outer ${redOuter} Inner ${redInner}`)
          allowRepeatAfterRedRef.current = true
          if (inputRef.current) inputRef.current.focus()
          setLeaderApprovalId(null)
        }
      } catch {}
    }, 5000)
    return () => clearInterval(t)
  }, [leaderApprovalId, status, locked])

  const standard = useMemo(() => {
    if (!selected) return 0
    const sw = selected.standardWeight
    if (typeof sw === 'number' && Number.isFinite(sw) && sw > 0) return +sw
    return (selected.weightPerPiece || 0) * (selected.quantityPerMeasurement || 0)
  }, [selected])

  // Std เริ่มต้นจากตาราง และจะคงอยู่จนกว่าจะมีการอนุมัติจาก QA
  useEffect(() => {
    setCurrentStd(standard)
  }, [standard])

  // Thresholds per requirement
  // DevW มาจากตาราง (ค่า tolerance)
  const devW = useMemo(() => (selected ? (selected.tolerance ?? 0) : 0), [selected])
  const halfPiece = useMemo(() => (selected ? selected.weightPerPiece / 2 : 0), [selected])
  const minVal = useMemo(() => +(currentStd - halfPiece).toFixed(3), [currentStd, halfPiece])
  const maxVal = useMemo(() => +(currentStd + halfPiece).toFixed(3), [currentStd, halfPiece])
  const dMinVal = useMemo(() => +(currentStd - devW).toFixed(3), [currentStd, devW])
  const dMaxVal = useMemo(() => +(currentStd + devW).toFixed(3), [currentStd, devW])

  // Local classify logic per requirement + workflow
  const classifyWeight = (w: number) => {
    // guard: skip duplicate classify for same box and weight within short window
    if (selected && scaleId && lotNo && outerBox && innerOrder && Number.isFinite(w) && w > 0) {
      const key = `${selected.productCode}|${scaleId}|${lotNo}|${outerBox}|${innerOrder}|${w.toFixed(3)}`
      const now = Date.now()
      const last = lastClassifyRef.current
      if (last && last.key === key && (now - last.ts) < 300) {
        return
      }
      lastClassifyRef.current = { key, ts: now }
    }
    // ป้องกันสถานะผิดพลาดตอนโหลดข้อมูลไม่ครบ (เช่น currentStd ยังเป็น 0)
    if (!selected || !Number.isFinite(w) || w <= 0) return
    // ล็อค Step 1 อัตโนมัติเมื่อเริ่มชั่งครั้งแรก
    if (!step1Locked && selected && scaleId && lotNo) lockStep1()
    // ถ้าถูกล็อกรอ QA ห้ามชั่ง
    if (yellowLockedAwaitQA || waitingForApply) return

    // ─── Recalc Std mode: ข้ามการตรวจ Std เดิมทั้งหมด ───────────────────────
    if (recalcStdMode && recalcSampleCount < 10) {
      const expectedAvg = recalcSampleCount > 0
        ? +((recalcCurrentAvg * recalcSampleCount + w) / (recalcSampleCount + 1)).toFixed(3)
        : +w.toFixed(3)
      setStatus('RECALC_SAMPLE')
      setInfoMessage(`⚗️ เก็บตัวอย่าง #${recalcSampleCount + 1}/10 | Std ≈ ${expectedAvg}`)
      return
    }
    // ─── end recalc check ────────────────────────────────────────────────────

    if (!Number.isFinite(currentStd) || currentStd <= 0) return
    // หลีกเลี่ยงการตัดสินใจ RED/YELLOW ในโหมด DOUBLE ด้วย Local state ปล่อยให้ Backend จัดการเป็นหลัก
    if (selected.weighingMode !== 'DOUBLE' && (w < minVal || w > maxVal)) {
      setStatus('RED')
      hardLockRef.current = true  // ← ref: ป้องกัน submit() race condition ทันที (ก่อน React re-render)
      setLocked(true) // Lock when out of Min/Max
      // RED event: ไม่ reset yellow streak count (ให้คงค่าเดิมไว้)
      // เพราะ RED เป็นเหตุการณ์ร้ายแรงกว่า YELLOW และไม่ควรตัดความต่อเนื่องของ YELLOW
      // ตัวอย่าง: YELLOW-YELLOW-YELLOW-RED-YELLOW-YELLOW → ยังคง count = 5 ต่อเนื่อง (ไม่ reset)
      // setYellowCount(0)    // ❌ ลบออก - ไม่ reset เมื่อเจอ RED
      // setYellowStreak(0)   // ❌ ลบออก - ไม่ reset เมื่อเจอ RED
      // บันทึก measurement และสร้าง approval ผูก measurement ให้เป็นแหล่งข้อมูลเดียวกัน
      if (!redApprovalRequestedRef.current && !leaderApprovalId) {
        redApprovalRequestedRef.current = true
        ;(async () => {
          // FIX: ถ้าเป็นการชั่งซ้ำ (allowRepeatAfterRedRef) ให้ใช้ reweighMeasurement แทน saveMeasurement
          const saved = allowRepeatAfterRedRef.current 
            ? await reweighMeasurement(w) 
            : await saveMeasurement(w)
            
          const mId = saved?.measurementId ?? saved?.measurement?.measurementId
          if (saved && mId) {
            redAutoSavedRef.current = true
            setRedAutoSaved(true)
            loadMeasurementHistory()
            try {
              const r = await fetch(apiUrl(`/api/approvals/red-for-measurement/${mId}`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
              })
              if (r.ok) {
                const a = await r.json()
                if (a?.id) {
                  setLeaderApprovalId(a.id)
                  setInfoMessage('🔴 น้ำหนักเกินขอบเขต Min/Max — แจ้งเตือนไปยัง Leader และ QA แล้ว (รอการอนุมัติจากใครก็ได้)')
                }
              }
              else { try { const t = await r.text(); setInfoMessage(`สร้างคำขอไม่สำเร็จ: ${t}`) } catch { setInfoMessage('สร้างคำขอไม่สำเร็จ') } }
            } catch {}
          } else {
            setInfoMessage('ไม่สามารถบันทึก RED หรือสร้างคำขอได้ (ตรวจสอบสิทธิ์ผู้ใช้)')
          }
        })()
      }
      return
    }
    if (selected.weighingMode !== 'DOUBLE' && (w < dMinVal || w > dMaxVal)) {
      setStatus('YELLOW')
      setConsecutiveYellow((c) => {
        const ns = c + 1
        const nws = [...yellowSeqWeights, w].slice(-5) // เก็บ 5 ค่าน้ำหนักล่าสุด
        setYellowSeqWeights(nws)
        // ครบ 5 ครั้งติดกัน → แค่แจ้งเตือน ไม่ lock ที่นี่
        // การล็อคและสร้างคำขอ QA จะเกิดขึ้นใน submit() หลังจากที่ measurement ถูก save แล้ว
        // (เพื่อให้กล่องที่ 5 ถูกบันทึกใน DB ก่อนที่จะล็อก ป้องกันข้อมูลหาย)
        if (ns >= 5) {
          setInfoMessage(`⚠️ เหลืองครบ ${ns} ครั้ง: กำลังบันทึกและส่งคำขอ QA...`)
        }
        return ns
      })
    } else {
      if (selected.weighingMode !== 'DOUBLE') setStatus('GREEN')
      setConsecutiveYellow(0)
      setYellowSeqWeights([])
    }
  }

  // คำนวณสถานะจากน้ำหนักและค่า Std ปัจจุบัน โดยไม่พึ่งการอัปเดต state แบบ async
  const computeStatus = (w: number): 'RED' | 'YELLOW' | 'GREEN' | '' => {
    if (!Number.isFinite(w) || w <= 0 || !Number.isFinite(currentStd) || currentStd <= 0) return ''
    if (selected?.weighingMode === 'DOUBLE') {
      // ถ้าเป็น DOUBLE ข้ามการ classify local ไปก่อน เพราะใช้ค่า w1/w2 ไม่ครบในฟังก์ชันนี้
      return ''
    }
    if (w < minVal || w > maxVal) return 'RED'
    if (w < dMinVal || w > dMaxVal) return 'YELLOW'
    return 'GREEN'
  }

  const submit = async (wParam?: number, w1Param?: number | null, w2Param?: number | null) => {
    // ยืนยันบันทึกด้วยมือ (GREEN / YELLOW) หรือกรณี RED (ถ้ายังไม่ได้บันทึกอัตโนมัติและยังไม่สร้าง approval)
    if (submittingRef.current || hardLockRef.current || step1LoadingRef.current) return
    submittingRef.current = true
    const prevStatus = status
    const w = wParam ?? weight
    const w1 = (w1Param !== undefined ? w1Param : weight1) ?? undefined;
    const w2 = (w2Param !== undefined ? w2Param : weight2) ?? undefined;
    const saved = allowRepeatAfterRedRef.current ? await reweighMeasurement(w, w1, w2) : await saveMeasurement(w, w1, w2)
    if (saved) {
      // ─── Recalc Std mode: อัปเดต progress และล็อกเมื่อครบ 10 กล่อง ──────────
      if (saved.recalcStdMode) {
        const cnt = saved.recalcSampleCount ?? (recalcSampleCount + 1)
        const avg = saved.recalcCurrentAvg ?? recalcCurrentAvg
        setRecalcSampleCount(cnt)
        setRecalcCurrentAvg(avg)
        setStatus('')
        setWeight(0); setWeight1(null); setWeight2(null)
        if (saved.recalcComplete) {
          // ครบ 10 กล่อง → ล็อกรอ QA อนุมัติ Std ใหม่
          hardLockRef.current = true
          setLocked(true)
          setWaitingForApply(true)
          setLockedForInitialStd(true)
          setRecalcStdMode(false) // จบ recalc mode หลัง lock
          setInfoMessage(`⚗️ ครบ 10 กล่อง! Std ใหม่ที่เสนอ = ${avg.toFixed(3)} — รอ QA อนุมัติ`)
          if (saved.stdChangeApprovalId) setQaApprovalId(saved.stdChangeApprovalId)
        } else {
          setInfoMessage(`⚗️ เก็บตัวอย่าง ${cnt}/10 | Std ≈ ${avg.toFixed(3)}`)
          autoAdvanceBox()
        }
        submittingRef.current = false
        return
      }
      // ─── end recalc handling ─────────────────────────────────────────────────

      // ตรวจสอบจาก Backend ว่าครบจำนวน Inner/Outer และต้องการอนุมัติ Initial Std หรือไม่
      if (saved.requiresInitialStdApproval && !yellowLockedAwaitQA) {
        hardLockRef.current = true   // set synchronously ก่อน setState เพื่อป้องกัน race condition
        setLocked(true)
        setYellowLockedAwaitQA(true)
        setLockedForInitialStd(true)
        setWaitingForApply(true)
        qaInnerIncrementedRef.current = false
        const thr = saved.initialStdThreshold ?? initialStdThreshold
        setInitialStdThreshold(thr)
        const draft = {
            productCode: selected!.productCode, scaleId, lotNo, outerBox, innerOrder,
            stdOld: currentStd, weights3: [], weights5: [],
            allWeights: (saved.allWeights as number[] | undefined) || [],
            allWeights1: saved.allWeights1 as number[] | undefined,
            allWeights2: saved.allWeights2 as number[] | undefined,
            proposedStd: saved.avgWeight || weight,
            proposedStd1: saved.avgWeight1,
            proposedStd2: saved.avgWeight2,
            initialStdThreshold: thr
        }
        queuedQaDraftRef.current = draft
        // set proposedStd state เพื่อให้ polling effect ใช้อัปเดต currentStd ได้ทันทีหลัง QA approve
        setProposedStd(draft.proposedStd)
        qaRequestInFlightRef.current = true
        setInfoMessage(`⏳ กำลังส่งคำขอ Initial Std (${thr} กล่องแรก) ไปยัง QA...`)
        requestQaApprovalWithStd(draft, currentUser.username).then(id => {
            if (id) { setQaApprovalId(id); setInfoMessage(`✅ ครบ ${thr} กล่องแรก: รออนุมัติ Initial Std (ID: ${id})`) }
            qaRequestInFlightRef.current = false
        })
        submittingRef.current = false
        return;
      }

      // ตรวจสอบว่า Backend แจ้งว่าเหลืองครบ 5 และต้องการ QA approve (สำคัญสำหรับ DOUBLE mode)
      if (saved.requiresApproval && !yellowLockedAwaitQA && !hardLockRef.current) {
        hardLockRef.current = true
        setLocked(true)
        setYellowLockedAwaitQA(true)
        setWaitingForApply(true)
        qaInnerIncrementedRef.current = false
        qaRequestInFlightRef.current = true
        setInfoMessage('⏳ เหลืองครบ 5 ครั้ง: กำลังดึงข้อมูลและส่งคำขอ QA...')
        ;(async () => {
          try {
            const pc = selected!.productCode
            const streakResp = await fetch(
              apiUrl(`/api/measurements/yellow-streak?productCode=${encodeURIComponent(pc)}&scaleId=${encodeURIComponent(scaleId)}&lotNo=${encodeURIComponent(lotNo)}`),
              { headers: getAuthHeaders() }
            )
            const stObj = streakResp.ok ? await streakResp.json().catch(() => null) : null
            const w5: number[] = Array.isArray(stObj?.weights5) ? stObj.weights5.slice(0, 5).reverse() : []
            const w5_1: number[] = Array.isArray(stObj?.weights5_1) ? stObj.weights5_1.slice(0, 5).reverse() : []
            const w5_2: number[] = Array.isArray(stObj?.weights5_2) ? stObj.weights5_2.slice(0, 5).reverse() : []
            setYellowSeqWeights(w5)
            setConsecutiveYellow1(stObj?.consec1 || 0)
            setConsecutiveYellow2(stObj?.consec2 || 0)
            const avgStd = w5.length > 0 ? +(w5.reduce((a: number, b: number) => a + b, 0) / w5.length).toFixed(3) : 0
            const avgStd1 = w5_1.length > 0 ? +(w5_1.reduce((a: number, b: number) => a + b, 0) / w5_1.length).toFixed(3) : undefined
            const avgStd2 = w5_2.length > 0 ? +(w5_2.reduce((a: number, b: number) => a + b, 0) / w5_2.length).toFixed(3) : undefined
            setProposedStd(avgStd)
            if (avgStd1 !== undefined) setProposedStd1Display(avgStd1)
            if (avgStd2 !== undefined) setProposedStd2Display(avgStd2)
            const draft = {
              productCode: pc, scaleId, lotNo, outerBox, innerOrder,
              stdOld: currentStd, weights3: w5.slice(0, 3), weights5: w5,
              weights5_1: w5_1.length > 0 ? w5_1 : undefined,
              weights5_2: w5_2.length > 0 ? w5_2 : undefined,
              proposedStd: avgStd, proposedStd1: avgStd1, proposedStd2: avgStd2
            }
            queuedQaDraftRef.current = draft
            const id = await requestQaApprovalWithStd(draft, currentUser.username)
            if (id) {
              setQaApprovalId(id)
              setInfoMessage(`✅ เหลืองครบ 5 ครั้ง: ล็อกระบบและส่งคำขอ QA (ID: ${id})`)
            } else {
              setInfoMessage('⚠️ เหลืองครบ 5 ครั้ง: ระบบล็อคแล้ว (กำลังพยายามส่งคำขอ QA)')
            }
          } catch {
            setInfoMessage('⚠️ เหลืองครบ 5 ครั้ง: ระบบล็อคแล้ว')
          }
          qaRequestInFlightRef.current = false
        })()
        submittingRef.current = false
        return
      }

      // redLocked: true เมื่อชั่งได้ RED → ต้องไม่ reset status เพื่อให้ polling effect เห็น
      let redLocked = false

      if (allowRepeatAfterRedRef.current) {
        // เคส reweigh หลัง Leader อนุมัติ
        const newStatus = saved.measurement?.status || saved.status || ''
        setStatus(newStatus)
        if (newStatus === 'RED') {
          redLocked = true
          try {
            const mId2 = saved?.measurementId ?? saved?.measurement?.measurementId
            if (mId2) {
              const r = await fetch(apiUrl(`/api/approvals/red-for-measurement/${mId2}`), {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
              })
              if (r.ok) { const a = await r.json(); if (a?.id) setLeaderApprovalId(a.id) }
            }
          } catch {}
          setLocked(true)
          setInfoMessage('🔴 ยังเป็น RED: สร้างคำขอ Leader ใหม่แล้ว ระบบล็อกรอ Leader อนุมัติ')
        } else if (newStatus === 'GREEN') {
          setInfoMessage('ชั่งซ้ำแล้ว: GREEN เดินต่อกล่องถัดไป')
          allowRepeatAfterRedRef.current = false
          autoAdvanceBox()
        } else if (newStatus === 'YELLOW') {
          setInfoMessage('ชั่งซ้ำแล้ว: YELLOW เดินต่อกล่องถัดไป')
          allowRepeatAfterRedRef.current = false
          autoAdvanceBox()
        } else {
          setInfoMessage('ชั่งซ้ำแล้ว: บันทึกแล้ว')
          allowRepeatAfterRedRef.current = false
        }
      } else {
        const currStat = saved.measurement?.status || saved.status || prevStatus;
        setStatus(currStat)
        if (currStat === 'GREEN') {
          setInfoMessage('GREEN: บันทึกแล้ว')
        } else if (currStat === 'YELLOW') {
          setInfoMessage('YELLOW: บันทึกแล้ว')
        } else if (currStat === 'RED') {
          redLocked = true
          setLocked(true)
          if (!leaderApprovalId && !redApprovalRequestedRef.current) {
            redApprovalRequestedRef.current = true
            try {
              const mId3 = saved?.measurementId ?? saved?.measurement?.measurementId
              if (mId3) {
                const r = await fetch(apiUrl(`/api/approvals/red-for-measurement/${mId3}`), {
                  method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
                })
                if (r.ok) { const a = await r.json(); if (a?.id) setLeaderApprovalId(a.id) }
              }
            } catch {}
          }
          setInfoMessage('🔴 RED: บันทึกแล้ว ระบบล็อกรอ Leader อนุมัติก่อนดำเนินการต่อ')
        }
        allowRepeatAfterRedRef.current = false
        if (currStat !== 'RED') autoAdvanceBox()
      }
      setWeight(0)
      setWeight1(null)
      setWeight2(null)
      if (!redLocked) setStatus('')   // ← ไม่ reset ถ้า redLocked เพื่อให้ status='RED' คงอยู่ใน UI
      setCapTime('')
      setCapDate('')
      loadMeasurementHistory()
      if (inputRef.current) inputRef.current.focus()
    }
    submittingRef.current = false
  }

  const submitWithWeight = (w: number, _statusHint: string, w1?: number | null, w2?: number | null) => submit(w, w1, w2)

  const reweighMeasurement = async (w: number, w1?: number, w2?: number): Promise<any | null> => {
    try {
      const ts = (capDate && capTime) ? new Date(`${capDate}T${capTime}`) : new Date()
      const resp = await fetch(apiUrl('/api/measurements/reweigh'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          productCode: selected?.productCode,
          scaleId,
          lotNo,
          outerBox: outerBox,
          innerOrder: innerOrder,
          weight: w,
          weight1: w1,
          weight2: w2,
          timestamp: ts.toISOString(),
          operatorName: currentUser.username,
          workOrderId: workOrder?.workOrderId ?? null,
        })
      })
      if (!resp.ok) {
        const msg = await resp.text()
        setInfoMessage(`ไม่สามารถชั่งซ้ำได้: ${msg}`)
        return null
      }
      const saved = await resp.json()

      // อัปเดต yellow count จากการ response (reweigh)
      if (saved && saved.consecutiveYellow !== undefined) {
        const remaining = saved.remainingYellow !== undefined ? saved.remainingYellow : 5
        updateYellowCounters(saved.consecutiveYellow, remaining)
        if (saved.consecutiveYellow1 !== undefined) setConsecutiveYellow1(saved.consecutiveYellow1)
        if (saved.consecutiveYellow2 !== undefined) setConsecutiveYellow2(saved.consecutiveYellow2)
      }

      return saved
    } catch {
      return null
    }
  }

  const saveMeasurement = async (w: number, w1?: number, w2?: number): Promise<any | null> => {
    try {
      const ts = (capDate && capTime) ? new Date(`${capDate}T${capTime}`) : new Date()
      const resp = await fetch(apiUrl('/api/measurements'), {
        method: 'POST',
  headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          productCode: selected?.productCode,
          scaleId,
          lotNo,
          outerBox: outerBox,
          innerOrder: innerOrder,
          weight: w,
          weight1: w1,
          weight2: w2,
          timestamp: ts.toISOString(),
          operatorName: currentUser.username,
          workOrderId: workOrder?.workOrderId ?? null,
        })
      })
      if (resp.status === 409) {
        setInfoMessage('กล่องนี้ถูกบันทึกไปแล้ว ไม่สามารถบันทึกซ้ำได้')
        return null
      }
      if (!resp.ok) {
        try { const msg = await resp.text(); setInfoMessage(`บันทึกไม่สำเร็จ: ${msg}`) } catch { setInfoMessage('บันทึกไม่สำเร็จ') }
        return null
      }
      const saved = await resp.json()
      
      // อัปเดต yellow count จากการ response (save)
      if (saved && saved.consecutiveYellow !== undefined) {
        const remaining = saved.remainingYellow !== undefined ? saved.remainingYellow : 5
        updateYellowCounters(saved.consecutiveYellow, remaining)
        if (saved.consecutiveYellow1 !== undefined) setConsecutiveYellow1(saved.consecutiveYellow1)
        if (saved.consecutiveYellow2 !== undefined) setConsecutiveYellow2(saved.consecutiveYellow2)
      }

      // บันทึกลง session cache เพื่อป้องกันการย้อนกลับไปยังกล่องที่บันทึกแล้วโดยไม่ต้องเรียก exists ซ้ำ
      if (selected && scaleId && lotNo) {
        const key = `${selected.productCode}|${scaleId}|${lotNo}|${outerBox}|${innerOrder}`
        savedBoxesRef.current.add(key)
      }
      return saved
    } catch {
      return null
    }
  }

  // ----- Lock/Unlock Step 1 -----
  const lockStep1 = async () => {
    if (!selected || !scaleId || !lotNo) return
    setStep1Locked(true)
    step1LoadingRef.current = true
    setConsecutiveYellow(0)
    setRemainingYellow(5)
    setYellowSeqWeights([])
    // บันทึกเวลาเริ่ม session เพื่อนับชั่วโมง cleanerTime
    sessionStartRef.current = new Date()
    setLastCleanedHour('')
    setCleaningRequired(false)
    setCleaningApprovalId(null)
    setInfoMessage('กำลังตรวจสอบประวัติการชั่งบนเครื่องนี้...')

    const pc = selected.productCode
    const sc = scaleId
    const lot = lotNo

    try {
      // ── STEP A: ดึง Std ที่ใช้งานจริงก่อน (ต้องการก่อนสร้าง draft) ─────────
      // ใช้ local variable เพื่อหลีกเลี่ยง stale React state closure ใน STEP B
      let effectiveStd = currentStd
      try {
        const rStd = await fetch(apiUrl(`/api/measurements/std-source?productCode=${encodeURIComponent(pc)}&scaleId=${encodeURIComponent(sc)}&lotNo=${encodeURIComponent(lot)}`), { headers: getAuthHeaders() })
        if (rStd.ok) {
          const obj = await rStd.json().catch(() => null)
          if (obj && typeof obj.std === 'number' && isFinite(obj.std)) {
            effectiveStd = +obj.std
            setCurrentStd(effectiveStd)
          }
        }
      } catch {}

      // ── STEP B: ตรวจ Yellow Streak (authoritative lock source) ──────────────
      let yellowLocked = false
      try {
        const rSt = await fetch(apiUrl(`/api/measurements/yellow-streak?productCode=${encodeURIComponent(pc)}&scaleId=${encodeURIComponent(sc)}&lotNo=${encodeURIComponent(lot)}`), { headers: getAuthHeaders() })
        if (rSt.ok) {
          const stObj = await rSt.json().catch(() => null)
          if (stObj) {
            const count: number = stObj.count || 0
            const remaining: number = stObj.remainingYellow !== undefined ? stObj.remainingYellow : Math.max(0, 5 - count)
            const rawWeights = Array.isArray(stObj.weights5) ? stObj.weights5 : (Array.isArray(stObj.weights3) ? stObj.weights3 : [])
            const weights: number[] = Array.isArray(rawWeights) ? rawWeights.slice(0, 5).reverse() : []

            // restore counters เสมอ
            setConsecutiveYellow(count)
            setRemainingYellow(remaining)
            setYellowSeqWeights(weights)
            setConsecutiveYellow1(stObj.consec1 || 0)
            setConsecutiveYellow2(stObj.consec2 || 0)

            if (stObj.pendingApprovalId && stObj.pendingApprovalId > 0) {
              // มี Approval ค้างอยู่แล้ว → restore lock
              yellowLocked = true
              hardLockRef.current = true
              setLocked(true)
              setYellowLockedAwaitQA(true)
              setWaitingForApply(true)
              setQaApprovalId(stObj.pendingApprovalId)
              const rawW1r: number[] = Array.isArray(stObj.weights5_1) ? stObj.weights5_1.slice(0, 5).reverse() : []
              const rawW2r: number[] = Array.isArray(stObj.weights5_2) ? stObj.weights5_2.slice(0, 5).reverse() : []
              if (weights.length > 0) setProposedStd(+(weights.reduce((a: number, b: number) => a + b, 0) / weights.length).toFixed(3))
              if (rawW1r.length > 0) setProposedStd1Display(+(rawW1r.reduce((a: number, b: number) => a + b, 0) / rawW1r.length).toFixed(3))
              if (rawW2r.length > 0) setProposedStd2Display(+(rawW2r.reduce((a: number, b: number) => a + b, 0) / rawW2r.length).toFixed(3))
              setInfoMessage(`✅ เหลืองครบ ${count} ครั้ง: พบคำขอ QA เดิม (ID: ${stObj.pendingApprovalId}) — ระบบล็อคและรอ QA อนุมัติ`)
            } else if (count >= 5 && stObj.requiresApproval) {
              // เหลืองครบ 5 แต่ยังไม่มี Approval → สร้างใหม่
              yellowLocked = true
              hardLockRef.current = true
              setLocked(true)
              setYellowLockedAwaitQA(true)
              setWaitingForApply(true)
              qaInnerIncrementedRef.current = false
              const proposedStdVal = weights.length > 0 ? +(weights.reduce((a: number, b: number) => a + b, 0) / weights.length).toFixed(3) : 0
              const rawW1: number[] = Array.isArray(stObj.weights5_1) ? stObj.weights5_1.slice(0, 5).reverse() : []
              const rawW2: number[] = Array.isArray(stObj.weights5_2) ? stObj.weights5_2.slice(0, 5).reverse() : []
              const avgStd1 = rawW1.length > 0 ? +(rawW1.reduce((a: number, b: number) => a + b, 0) / rawW1.length).toFixed(3) : undefined
              const avgStd2 = rawW2.length > 0 ? +(rawW2.reduce((a: number, b: number) => a + b, 0) / rawW2.length).toFixed(3) : undefined
              setProposedStd(proposedStdVal)
              if (avgStd1 !== undefined) setProposedStd1Display(avgStd1)
              if (avgStd2 !== undefined) setProposedStd2Display(avgStd2)
              const draft = { productCode: pc, scaleId: sc, lotNo: lot, outerBox: outerBox, innerOrder: innerOrder, stdOld: effectiveStd, weights3: weights.slice(0, 3), weights5: weights, weights5_1: rawW1.length > 0 ? rawW1 : undefined, weights5_2: rawW2.length > 0 ? rawW2 : undefined, proposedStd: proposedStdVal, proposedStd1: avgStd1, proposedStd2: avgStd2 }
              queuedQaDraftRef.current = draft
              qaRequestInFlightRef.current = true
              setInfoMessage(`⏳ เหลืองครบ ${count} ครั้ง: กำลังสร้างคำขอ QA...`)
              try {
                const id = await requestQaApprovalWithStd(draft, currentUser.username)
                if (id) {
                  setQaApprovalId(id)
                  setInfoMessage(`✅ เหลืองครบ ${count} ครั้ง: ล็อกระบบและสร้างคำขอ QA ใหม่ (ID: ${id})`)
                } else {
                  setInfoMessage(`⚠️ เหลืองครบ ${count} ครั้ง: ระบบล็อคแล้ว (กำลังพยายามส่งคำขอ QA)`)
                }
              } catch {
                setInfoMessage(`⚠️ เหลืองครบ ${count} ครั้ง: ระบบล็อคแล้ว (พบปัญหาในการส่งคำขอ QA)`)
              }
              qaRequestInFlightRef.current = false
            }
            // count < 5: ไม่ล็อก แต่ restore counter เพื่อนับต่อจากเดิม
            // classifyWeight() จะนับเพิ่มทีละ 1 ต่อจาก count นี้
            // submit() จะตรวจ requiresApproval จาก backend เมื่อชั่งถึงครั้งที่ 5
            else if (count > 0) {
              setInfoMessage(`⚠️ พบประวัติเหลือง ${count} ครั้งติดต่อกัน: ต้องชั่งอีก ${remaining} ครั้งจะถึง 5 — ระบบจะล็อคอัตโนมัติเมื่อครบ`)
            }
          }
        }
      } catch (err) {
        console.error('[lockStep1] yellow-streak error:', err)
      }

      // ── STEP C: ดึงกล่องล่าสุด (หมายเลขกล่องถัดไป + fallback lock check) ───
      try {
        const r = await fetch(apiUrl(`/api/measurements/last?productCode=${encodeURIComponent(pc)}&scaleId=${encodeURIComponent(sc)}&lotNo=${encodeURIComponent(lot)}`), { headers: getAuthHeaders() })
        if (!r.ok) {
          if (!yellowLocked) setInfoMessage('⚠️ ไม่พบประวัติ กรุณาตรวจสอบหมายเลขกล่อง')
          return
        }
        const data = await r.json().catch(() => null)

        // ─── Recalc Std mode restore ─────────────────────────────────────────
        if (data && data.recalcStdMode) {
          const cnt = data.recalcSampleCount ?? 0
          const avg = data.recalcCurrentAvg ?? 0
          if (cnt < 10) {
            // ยังเก็บตัวอย่างไม่ครบ → unlock ให้ชั่งต่อ
            setRecalcStdMode(true)
            setRecalcSampleCount(cnt)
            setRecalcCurrentAvg(avg)
            hardLockRef.current = false
            setLocked(false)
            allowRepeatAfterRedRef.current = true // ชั่งซ้ำกล่องเดิมได้
            if (data.nextOuterBoxNumber) setOuterBox(data.nextOuterBoxNumber)
            if (data.nextInnerBoxOrder)  setInnerOrder(data.nextInnerBoxOrder)
            setInfoMessage(`⚗️ โหมดเก็บตัวอย่าง Std ใหม่: ${cnt}/10 กล่อง | Std ≈ ${avg > 0 ? avg.toFixed(3) : '?'}`)
            return
          } else {
            // ครบ 10 แล้ว แต่ QA ยังไม่ได้ apply → lock รอ QA
            hardLockRef.current = true
            setLocked(true)
            setWaitingForApply(true)
            setLockedForInitialStd(true)
            setRecalcSampleCount(cnt)
            setRecalcCurrentAvg(avg)
            setInfoMessage(`⚗️ ครบ 10 กล่องแล้ว | Std เสนอ = ${avg.toFixed(3)} — รอ QA อนุมัติ`)
            if (data.pendingApprovalId) setQaApprovalId(data.pendingApprovalId)
            return
          }
        }
        // ─── end recalc restore ──────────────────────────────────────────────

        // Initial Std (ครบจำนวน Inner ต่อ Outer)
        if (data && data.requiresInitialStdApproval && !yellowLocked) {
          hardLockRef.current = true
          setLocked(true)
          setYellowLockedAwaitQA(true)
          setLockedForInitialStd(true)
          setWaitingForApply(true)
          const thr = data.initialStdThreshold ?? initialStdThreshold
          setInitialStdThreshold(thr)
          const proposedStdVal = data.avgWeight || 0
          const draft = { productCode: pc, scaleId: sc, lotNo: lot, outerBox: data.nextOuterBoxNumber || outerBox, innerOrder: data.nextInnerBoxOrder || innerOrder, stdOld: effectiveStd, weights3: [], weights5: [], allWeights: (data.allWeights as number[] | undefined) || [], allWeights1: data.allWeights1 as number[] | undefined, allWeights2: data.allWeights2 as number[] | undefined, proposedStd: proposedStdVal, proposedStd1: data.avgWeight1, proposedStd2: data.avgWeight2, initialStdThreshold: thr }
          queuedQaDraftRef.current = draft
          if (data.pendingApprovalId && data.pendingApprovalId > 0) {
            setQaApprovalId(data.pendingApprovalId)
            setInfoMessage(`✅ ครบ ${thr} กล่องแรก: พบคำขอ Initial Std ค้างอยู่ (ID: ${data.pendingApprovalId})`)
          } else {
            setInfoMessage(`⏳ กำลังสร้างคำขอ Initial Std (${thr} กล่องแรก)...`)
            requestQaApprovalWithStd(draft, currentUser.username).then(id => {
              if (id) { setQaApprovalId(id); setInfoMessage(`✅ ครบ ${thr} กล่องแรก: ส่งคำขอ Initial Std แล้ว (ID: ${id})`) }
            })
          }
          return
        }

        // ตั้งหมายเลขกล่องถัดไป
        if (data && data.nextOuterBoxNumber && data.nextInnerBoxOrder) {
          const lastStatus = (data.status || '').toUpperCase()
          if (lastStatus === 'RED') {
            setOuterBox(data.outerBoxNumber || '001')
            setInnerOrder(data.innerBoxOrder || '0001')
            setStatus('RED')
            hardLockRef.current = true
            setLocked(true)
            updateYellowCounters(data.consecutiveYellow || 0, data.remainingYellow ?? 5)
            setInfoMessage('🔴 พบ RED กล่องล่าสุด: ระบบล็อกรอ Leader หรือ QA อนุมัติ')
            if (!data.approvalId && data.id) {
              try {
                const rr = await fetch(apiUrl(`/api/approvals/red-for-measurement/${data.id}`), { method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() } })
                if (rr.ok) { const a = await rr.json().catch(() => null); if (a?.id) setLeaderApprovalId(a.id) }
              } catch {}
            } else if (data.approvalId) {
              setLeaderApprovalId(data.approvalId)
            }
          } else {
            setOuterBox(data.nextOuterBoxNumber)
            setInnerOrder(data.nextInnerBoxOrder)
            updateYellowCounters(data.consecutiveYellow || 0, data.remainingYellow ?? 5)

            if (!yellowLocked && data.consecutiveYellow >= 5 && data.requiresApproval) {
              // Fallback lock: yellow-streak API มีปัญหา แต่ /last บอกว่าต้อง lock
              hardLockRef.current = true
              setLocked(true)
              setYellowLockedAwaitQA(true)
              setWaitingForApply(true)
              qaInnerIncrementedRef.current = false
              if (data.pendingApprovalId && data.pendingApprovalId > 0) {
                setQaApprovalId(data.pendingApprovalId)
                setInfoMessage(`⚠️ เหลืองครบ 5 (fallback): ระบบล็อคแล้ว รอ QA อนุมัติ (ID: ${data.pendingApprovalId})`)
              } else {
                setInfoMessage(`⚠️ เหลืองครบ 5 (fallback): ระบบล็อคแล้ว (กำลังสร้างคำขอ QA...)`)
              }
            } else if (!yellowLocked) {
              setInfoMessage(`พบข้อมูลก่อนหน้า: เดินหน้าชั่งกล่องถัดไป (Outer ${data.nextOuterBoxNumber}, Inner ${data.nextInnerBoxOrder})`)
            }
          }
        } else if (data && data.innerBoxOrder != null) {
          const innerStr = String(data.innerBoxOrder).trim().padStart(4, '0')
          const lastInner = /^\d{4}$/.test(innerStr) ? parseInt(innerStr, 10) : 0
          if (!/^\d{4}$/.test(innerStr)) {
            setInnerOrder('0001')
            if (!yellowLocked) setInfoMessage('พบ barrier reset: เริ่มรอบใหม่กล่อง 0001')
            return
          }
          const lastStatus = (data.status || '').toUpperCase()
          if (lastStatus !== 'RED') {
            setInnerOrder(String(Math.max(1, lastInner + 1)).padStart(4, '0'))
            if (!yellowLocked) setInfoMessage('พบข้อมูลก่อนหน้า: เดินหน้าชั่งกล่องถัดไป')
          } else {
            // RED fallback: กล่องสุดท้ายเป็น RED แต่ไม่มี nextOuter/nextInner — ให้กลับไปที่กล่อง RED นั้น
            if (data.outerBoxNumber) setOuterBox(data.outerBoxNumber)
            setInnerOrder(innerStr)
            setStatus('RED')
            hardLockRef.current = true
            setLocked(true)
            updateYellowCounters(data.consecutiveYellow || 0, data.remainingYellow ?? 5)
            setInfoMessage('🔴 พบ RED กล่องล่าสุด: ระบบล็อกรอ Leader หรือ QA อนุมัติ')
            // Restore approval ID
            if (data.approvalId) {
              setLeaderApprovalId(data.approvalId)
            } else if (data.id) {
              try {
                const rr = await fetch(apiUrl(`/api/approvals/red-for-measurement/${data.id}`), {
                  method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
                })
                if (rr.ok) { const aa = await rr.json().catch(() => null); if (aa?.id) setLeaderApprovalId(aa.id) }
              } catch {}
            }
          }
        } else {
          setInnerOrder('0001')
          if (!yellowLocked) setInfoMessage('ไม่พบประวัติ: เริ่มต้นที่กล่อง 0001')
        }
      } catch {
        if (!yellowLocked) setInfoMessage('⚠️ ไม่สามารถดึงข้อมูลล่าสุด กรุณาตรวจสอบหมายเลขกล่องด้วยตัวเอง')
      }
    } finally {
      step1LoadingRef.current = false
    }
  }

  const unlockStep1 = () => {
    setStep1Locked(false)
    setInnerOrder('0001')
    setWorkOrder(null)
    setOperatorNamesInput('')
    // รีเซ็ต lock/yellow state ทั้งหมด เพื่อให้ lockStep1 ครั้งถัดไปเริ่มใหม่สะอาด
    setLocked(false)
    setYellowLockedAwaitQA(false)
    setLockedForInitialStd(false)
    setCleaningRequired(false)
    setCleaningApprovalId(null)
    setCleaningHourLabel('')
    setLastCleanedHour('')
    setWaitingForApply(false)
    setCollectingForStd(false)
    setQaApprovalId(null)
    setProposedStd(null)
    setProposedStd1Display(null)
    setProposedStd2Display(null)
    setConsecutiveYellow(0)
    setConsecutiveYellow1(0)
    setConsecutiveYellow2(0)
    setRemainingYellow(5)
    setYellowSeqWeights([])
    setLeaderApprovalId(null)
    setStatus('')
    hardLockRef.current = false
    step1LoadingRef.current = false
    qaRequestInFlightRef.current = false
    qaInnerIncrementedRef.current = false
    redApprovalRequestedRef.current = false
    allowRepeatAfterRedRef.current = false
  }

  const incInner = () => {
    const cur = parseInt(innerOrder, 10)
    const max = (selected?.innerBoxQuantity && selected.innerBoxQuantity > 0) ? selected.innerBoxQuantity : 9999
    
    // ตรวจสอบว่าเต็มกล่อง (ครบจำนวน max) หรือไม่
    let isFull = false
    if (selected?.innerNumberingMode === 'RESET_PER_OUTER') {
      isFull = cur >= max
    } else {
      isFull = cur % max === 0
    }

    if (isFull) {
      // Trigger QA Outer Inspection for the completed outer box
      const completedOuter = outerBox
      if (selected && scaleId && lotNo) {
        fetch(apiUrl('/api/approvals/outer-inspection'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
          body: JSON.stringify({
            productCode: selected.productCode,
            scaleId,
            lotNo,
            outerBox: completedOuter,
            workOrderId: workOrder?.workOrderId ?? null,
          }),
        }).catch(() => { /* ignore network errors */ })
      }
      setOuterBox(prev => String((parseInt(prev, 10) || 0) + 1).padStart(3, '0'))
      if (selected?.innerNumberingMode === 'RESET_PER_OUTER') {
        setInnerOrder('0001')
      } else {
        setInnerOrder(String(cur + 1).padStart(4, '0'))
      }
      setInfoMessage(`ครบจำนวน ${max} ชิ้น: เริ่มกล่องนอกใหม่ — ส่งคำขอ QA ตรวจสอบ Outer ${completedOuter} แล้ว`)
    } else {
      setInnerOrder(String(cur + 1).padStart(4, '0'))
    }
    // reset auto-save flag สำหรับชิ้นถัดไป
    redAutoSavedRef.current = false
    setRedAutoSaved(false)
  }
  const decInner = () => {
    const curInner = parseInt(innerOrder, 10) || 1
    const candidate = Math.max(1, curInner - 1)

    if (!selected || !scaleId || !lotNo) {
      setInnerOrder(candidate.toString().padStart(4, '0'))
      return
    }

    let outerStr: string
    let innerStr: string

    if (selected.innerNumberingMode === 'RESET_PER_OUTER') {
      // RESET_PER_OUTER: inner รีเซ็ตต่อ outer → ย้อนกลับอยู่ใน outer เดิมเสมอ
      if (curInner <= 1) {
        setInfoMessage('อยู่ที่กล่องแรกของ Outer นี้แล้ว ไม่สามารถย้อนกลับได้')
        return
      }
      outerStr = outerBox
      innerStr = candidate.toString().padStart(4, '0')
    } else {
      // CONTINUOUS: inner รันข้าม outer → คำนวณ outer จาก inner number
      const k = selected.innerBoxQuantity && selected.innerBoxQuantity > 0 ? selected.innerBoxQuantity : 10
      const outerNum = Math.floor((candidate - 1) / k) + 1
      outerStr = outerNum.toString().padStart(3, '0')
      innerStr = candidate.toString().padStart(4, '0')
    }

    // เช็คจาก cache ก่อน ลดการเรียก exists
    const sessKey = `${selected.productCode}|${scaleId}|${lotNo}|${outerStr}|${innerStr}`
    if (savedBoxesRef.current.has(sessKey)) {
      setInfoMessage('ไม่สามารถย้อนกลับไปชั่งกล่องที่บันทึกแล้วได้ (session)')
      return
    }
    fetch(apiUrl(`/api/measurements/exists?productCode=${encodeURIComponent(selected.productCode)}&scaleId=${encodeURIComponent(scaleId)}&lotNo=${encodeURIComponent(lotNo)}&outerBox=${encodeURIComponent(outerStr)}&innerOrder=${encodeURIComponent(innerStr)}`), { headers: getAuthHeaders() })
      .then(r => r.ok ? r.json() : false)
      .then((exists: boolean) => {
        if (exists) {
          setInfoMessage('ไม่สามารถย้อนกลับไปชั่งกล่องที่บันทึกแล้วได้')
        } else {
          setInnerOrder(innerStr)
          if (outerStr !== outerBox) setOuterBox(outerStr)
          setInfoMessage('ย้อนกลับไปกล่องที่ยังไม่ถูกบันทึก')
        }
      })
      .catch(() => {
        setInnerOrder(innerStr)
        if (outerStr !== outerBox) setOuterBox(outerStr)
      })
  }

  // เดินหน้า Outer/Inner อัตโนมัติหลังบันทึก (เฉพาะเมื่อไม่ RED และไม่ locked)
  const autoAdvanceBox = () => {
    if (locked) return
    // Optimistic update: เพิ่ม innerOrder ทันทีเพื่อป้องกัน race condition
    // (scale ส่งค่าใหม่ก่อน refreshLastBox เสร็จ → ป้องกันบันทึกกล่องซ้ำ)
    const curInner = parseInt(innerOrder, 10) || 0
    const max = (selected?.innerBoxQuantity && selected.innerBoxQuantity > 0) ? selected.innerBoxQuantity : 9999
    const isAtCapacity = selected?.innerNumberingMode === 'RESET_PER_OUTER'
      ? curInner >= max
      : curInner % max === 0

    if (isAtCapacity && selected?.innerNumberingMode === 'RESET_PER_OUTER') {
      // RESET_PER_OUTER: เมื่อครบ outer → optimistic ตั้ง inner เป็น 0001 (ไม่ใช่ +1)
      // เพื่อป้องกัน race: scale ส่งค่ามาในช่วงรอ refreshLastBox → บันทึกถูก outer ใหม่
      setInnerOrder('0001')
    } else {
      setInnerOrder(String(curInner + 1).padStart(4, '0'))
    }
    // refreshLastBox จะ confirm/correct ค่าจาก backend (outer เปลี่ยน, หรือ CONTINUOUS)
    refreshLastBox()
  }

  const applyTriple = (wStr: string, tStr: string, dStr: string) => {
    if (hardLockRef.current || yellowLockedAwaitQA || waitingForApply) {
      setCaptureInfo('ระบบถูกล็อก: รอ QA อนุญาต หรือรอ QA ยืนยันค่า Std ใหม่')
      return false
    }
    const w = parseFloat((wStr || '').replace(',', '.'))
    const nt = normalizeTime(tStr || '')
    const nd = normalizeDate(dStr || '')
    const errors: string[] = []
    if (!Number.isFinite(w) || w <= 0) errors.push('น้ำหนักไม่ถูกต้อง')
    // เวลา/วันที่ไม่ครบ: อนุญาตให้ใช้เวลาปัจจุบันเป็นค่าเริ่มต้น เพื่อไม่ต้องรับ 2 รอบ
    const now = new Date()
    const fallbackTime = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`
    const fallbackDate = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`
    const useTime = nt || fallbackTime
    const useDate = nd || fallbackDate
    if (errors.length === 0) {
      setWeight(w)
      setCapTime(useTime!)
      setCapDate(useDate!)
      setCaptureInfo(nt && nd ? 'รับค่าจากเครื่องชั่งครบถ้วน (OK)' : 'เวลา/วันที่ไม่ครบ: ใช้เวลาปัจจุบันเป็นค่าเริ่มต้น')
      // อัตโนมัติ: ตรวจสอบสถานะทันทีเมื่อได้รับน้ำหนัก และบันทึกทันทีโดยอ้างอิงสถานะที่คำนวณได้ (ไม่รอ state)
      if (!locked) {
        classifyWeight(w)
        const sNow = computeStatus(w)
        if ((autoSaveGY || collectingForStd) && (sNow === 'GREEN' || sNow === 'YELLOW') && Number.isFinite(w) && w > 0) {
          // บันทึกทันทีด้วยค่าน้ำหนักที่อ่านได้ (หลีกเลี่ยง state ยังเป็น 0)
          submitWithWeight(w, sNow)
        }
      }
      // โฟกัสปุ่มประมวลผลเล็กน้อยให้ทำงานต่อได้ไว (ถ้าต้องการสามารถกด Enter ต่อได้)
      return true
    } else {
      setCaptureInfo(errors.join(' / '))
      return false
    }
  }

  // คีย์ลัด: ซ้าย/ขวา เดินกล่อง, Enter = Submit (เมื่อไม่ locked)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!step1Locked || locked) return
      if (e.key === 'ArrowRight') { e.preventDefault(); if (status !== 'RED') incInner() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); if (status !== 'RED') decInner() }
      if (e.key === 'Enter') {
        if (selected && scaleId && lotNo && Number.isFinite(weight) && weight > 0 && status && !(status === 'RED' && redAutoSaved)) {
          e.preventDefault(); submit()
        }
      }
    }
    window.addEventListener('keydown', onKey)
    const onRefresh = () => { refreshLastBox() }
    window.addEventListener('refresh-last-box', onRefresh as any)
    return () => window.removeEventListener('keydown', onKey)
  }, [step1Locked, locked, status, weight, selected, scaleId, lotNo, redAutoSaved])

  const refreshLastBox = async () => {
    if (!selected || !scaleId || !lotNo) return
    const seq = ++refreshLastBoxSeqRef.current  // increment ก่อน fetch
    // จำ outer ปัจจุบันก่อน fetch เพื่อตรวจว่า outer เปลี่ยนหรือไม่
    const outerBeforeRefresh = outerBox
    try {
      const r = await fetch(apiUrl(`/api/measurements/last?productCode=${encodeURIComponent(selected.productCode)}&scaleId=${encodeURIComponent(scaleId)}&lotNo=${encodeURIComponent(lotNo)}`), { headers: getAuthHeaders() })
      if (seq !== refreshLastBoxSeqRef.current) return  // มีการเรียก refreshLastBox ใหม่กว่านี้ → ละเว้น response นี้
      if (r.ok) {
        const data = await r.json().catch(()=>null)
        if (seq !== refreshLastBoxSeqRef.current) return  // เช็คอีกครั้งหลัง await json()
        if (data && data.nextOuterBoxNumber && data.nextInnerBoxOrder) {
          // ตรวจว่า outer เปลี่ยน → outer เดิมครบแล้ว → ส่งคำขอ QA ตรวจสอบ Outer
          if (data.nextOuterBoxNumber !== outerBeforeRefresh) {
            fetch(apiUrl('/api/approvals/outer-inspection'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
              body: JSON.stringify({
                productCode: selected.productCode,
                scaleId,
                lotNo,
                outerBox: outerBeforeRefresh,
                workOrderId: workOrder?.workOrderId ?? null,
              }),
            }).catch(() => {})
            setInfoMessage(`ครบ Outer ${outerBeforeRefresh}: เริ่ม Outer ${data.nextOuterBoxNumber} — ส่งคำขอ QA ตรวจสอบแล้ว`)
          } else {
            setInfoMessage(`รีเฟรชข้อมูลล่าสุดสำเร็จ (Outer ${data.nextOuterBoxNumber}, Inner ${data.nextInnerBoxOrder})`)
          }
          setOuterBox(data.nextOuterBoxNumber)
          setInnerOrder(data.nextInnerBoxOrder)
        } else if (data && data.innerBoxOrder) {
          const lastInner = Number.parseInt(data.innerBoxOrder, 10) || 0
          setInnerOrder(String(Math.max(1, lastInner + 1)).padStart(4, '0'))
          setInfoMessage('รีเฟรชข้อมูลล่าสุดสำเร็จ (Fallback)')
        } else {
          setInnerOrder('0001')
          setErrorMessage('ไม่พบข้อมูลล่าสุดหลังรีเฟรช')
        }
      } else {
        setErrorMessage('รีเฟรชไม่สำเร็จ')
      }
    } catch { setErrorMessage('รีเฟรชไม่สำเร็จ: เครือข่ายมีปัญหา') }
  }

  const ribbonItems: { label: string; active: boolean; color: string }[] = [
    { label: 'ชั่งปกติ', active: !yellowLockedAwaitQA && !collectingForStd && !waitingForApply && status !== 'RED' && !cleaningRequired, color: '#1677ff' },
    { label: '🧹 รอ Clean', active: cleaningRequired, color: '#0ea5e9' },
    { label: `Initial Std (${initialStdThreshold} กล่อง)`, active: yellowLockedAwaitQA && lockedForInitialStd, color: '#9254de' },
    { label: 'Yellow x5', active: yellowLockedAwaitQA && !lockedForInitialStd, color: '#faad14' },
    { label: 'เก็บ 4-5', active: collectingForStd, color: '#d4b106' },
    { label: 'รอ Apply Std', active: waitingForApply, color: '#7cb305' },
    { label: 'RED รอ Leader', active: locked && status === 'RED', color: '#ff4d4f' }
  ]

  // ── Reusable: Scale Capture card (ใช้ร่วมทั้ง 2 column) ──────────────────
  const scaleCaptureCard = (
    <Card size="small" title="Scale Capture (ค่าจากเครื่องชั่ง)">
      <Space wrap align="start">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={captureEnabled} onChange={(e) => setCaptureEnabled(e.target.checked)} /> Enable
        </label>
        <Button onClick={() => { setBuffer(''); setLines([]); setCaptureInfo(''); setCapTime(''); setCapDate(''); setConsecutiveYellow(0); setLocked(false); setYellowSeqWeights([]); setCollectingForStd(false); setProposedStd(null); redAutoSavedRef.current=false; redApprovalRequestedRef.current=false; setRedAutoSaved(false); setLeaderApprovalId(null); }}>Clear</Button>
        <Input
          ref={inputRef as any}
          placeholder={captureEnabled ? 'วาง/พิมพ์จากเครื่องชั่ง: น้ำหนัก [Enter] เวลา [Enter] วันที่ [Enter]' : 'Scale capture disabled'}
          disabled={!captureEnabled}
          value={buffer}
          onChange={(e) => setBuffer(e.target.value)}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (text) {
              const parsed = parseScaleCapture(text)
              if (parsed) {
                e.preventDefault()
                if (currentStd > 0) { applyTriple(parsed.w, parsed.t, parsed.d) }
                else { setCaptureInfo('ยังโหลดสเปคไม่ครบ กรุณา Lock ขั้นตอนที่ 1 ก่อน') }
              }
            }
          }}
          onKeyDown={(e) => {
            if ((e as any).key === 'Enter') {
              e.preventDefault()
              const v = buffer.trim()
              if (v.length > 0) {
                const next = [...lines, v]
                setLines(next)
                setBuffer('')
                if (next.length >= 3) {
                  if (currentStd > 0) { applyTriple(next[0], next[1], next[2]) }
                  else { setCaptureInfo('ยังโหลดสเปคไม่ครบ กรุณา Lock ขั้นตอนที่ 1 ก่อน') }
                  setLines([])
                } else {
                  const joined = next.join('\n')
                  const parsed = parseScaleCapture(joined)
                  if (parsed) {
                    if (currentStd > 0) { applyTriple(parsed.w, parsed.t, parsed.d) }
                    else { setCaptureInfo('ยังโหลดสเปคไม่ครบ กรุณา Lock ขั้นตอนที่ 1 ก่อน') }
                    setLines([])
                  } else {
                    setCaptureInfo(`รับค่า ${next.length}/3`)
                  }
                }
              }
            }
          }}
          style={{ width: '100%', minWidth: 260 }}
        />
      </Space>
      <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
        รับค่า 3 บรรทัด: น้ำหนัก → เวลา → วันที่ (MM-DD-YYYY)
      </Typography.Paragraph>
      {(capTime || capDate) && (
        <Typography.Text type="secondary">Time: {capTime || '-'} | Date: {capDate || '-'} {captureInfo && `| ${captureInfo}`}</Typography.Text>
      )}
      {!capTime && !capDate && captureInfo && (
        <Typography.Text type="secondary">{captureInfo}</Typography.Text>
      )}
    </Card>
  )

  // ── Reusable: Alert section ───────────────────────────────────────────────
  const alertSection = (
    <Space direction="vertical" size={6} style={{ width: '100%' }}>
      {recalcStdMode && recalcSampleCount < 10 && (
        <Alert
          type="info"
          showIcon
          style={{ background: '#f9f0ff', borderColor: '#b37feb' }}
          message={
            <span style={{ color: '#531dab', fontWeight: 600 }}>
              ⚗️ โหมดเก็บตัวอย่าง Std ใหม่
            </span>
          }
          description={
            <span>
              เก็บแล้ว <b>{recalcSampleCount}/10</b> กล่อง
              {recalcCurrentAvg > 0 && <> | Std ≈ <b>{recalcCurrentAvg.toFixed(3)}</b></>}
              <br />
              <span style={{ fontSize: 11, color: '#722ed1' }}>ไม่มีการตรวจ RED/YELLOW ระหว่างโหมดนี้ — ชั่งปกติได้เลย</span>
            </span>
          }
        />
      )}
      {infoMessage && <Alert type="success" message={infoMessage} showIcon />}
      {errorMessage && <Alert type="error" message={errorMessage} showIcon />}
      {locked && status === 'RED' && (
        <Alert type="error" showIcon message={
          leaderApprovalId
            ? `พบ RED: ระบบบันทึกอัตโนมัติแล้ว กรุณาแจ้ง Leader หรือ QA เพื่อปลดล็อก (Approval ID: ${leaderApprovalId})`
            : 'พบ RED: ระบบล็อก กรุณาแจ้ง Leader หรือ QA เพื่ออนุมัติและชั่งซ้ำที่กล่องเดิม'
        } />
      )}
      {!locked && allowRepeatAfterRedRef.current && status === '' && (
        <Alert type="info" showIcon message="พร้อมชั่งซ้ำกล่องเดิมหลัง RED ได้รับการอนุมัติ กรุณากรอกน้ำหนักใหม่" />
      )}
      {cleaningRequired && (
        <Alert
          type="info"
          showIcon
          message={
            <Space>
              <span>🧹 ถึงเวลาทำความสะอาดเครื่องชั่ง (ครั้งที่ {cleaningHourLabel.replace('slot', '')}, ทุก {selected?.cleanerTime ?? '?'} ชั่วโมง) — กรุณาทำความสะอาดแล้วรอ Leader อนุมัติ</span>
              {cleaningApprovalId && <Tag color="orange">Approval ID: {cleaningApprovalId}</Tag>}
            </Space>
          }
          style={{ borderColor: '#0ea5e9', background: '#e0f2fe' }}
        />
      )}
      {proposedStd && waitingForApply && (
        <Alert
          type="warning"
          showIcon
          message={
            lockedForInitialStd ? (
              selected?.weighingMode === 'DOUBLE' && (proposedStd1Display || proposedStd2Display)
                ? `ชั่งครบ ${initialStdThreshold} กล่องแรก: Initial Std ใหม่ — ชั่ง #1 = ${proposedStd1Display ?? '-'} / ชั่ง #2 = ${proposedStd2Display ?? '-'} | รอ QA อนุมัติ (ID: ${qaApprovalId ?? '-'})`
                : `ชั่งครบ ${initialStdThreshold} กล่องแรก: คำนวณ Initial Std ใหม่ = ${proposedStd} | รอ QA อนุมัติ (Approval ID: ${qaApprovalId ?? '-'})`
            ) : (
              selected?.weighingMode === 'DOUBLE' && (proposedStd1Display || proposedStd2Display)
                ? `เหลืองครบ 5 ครั้ง: Std ใหม่ — ชั่ง #1 = ${proposedStd1Display ?? '-'} / ชั่ง #2 = ${proposedStd2Display ?? '-'} | รอ QA อนุมัติ (ID: ${qaApprovalId ?? '-'})`
                : `เหลืองครบ 5 ครั้ง: คำนวณ Std ใหม่ = ${proposedStd} | รอ QA ตรวจสอบและอนุมัติ (Approval ID: ${qaApprovalId ?? '-'})`
            )
          }
        />
      )}
    </Space>
  )

  return (
    <div style={{ width: '100%' }}>

      {/* Modal แก้ไขหมายเลขกล่อง */}
      <Modal
        title="แก้ไขหมายเลขกล่อง"
        open={editBoxModalVisible}
        onOk={handleConfirmEditBox}
        onCancel={() => { setEditBoxModalVisible(false); setModalErrorMessage(''); }}
        okText="ยืนยัน"
        cancelText="ยกเลิก"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {modalErrorMessage && <Alert type="error" message={modalErrorMessage} showIcon style={{ marginBottom: 12 }} />}
          <div>
            <label htmlFor="editOuterValue" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Outer Box:</label>
            <Input id="editOuterValue" value={editOuterValue} onChange={(e) => setEditOuterValue(e.target.value)} placeholder="เช่น 001" maxLength={3} />
          </div>
          <div>
            <label htmlFor="editInnerValue" style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Inner Box:</label>
            <Input id="editInnerValue" value={editInnerValue} onChange={(e) => setEditInnerValue(e.target.value)} placeholder="เช่น 0010" maxLength={4} />
          </div>
        </Space>
      </Modal>

      {/* ── Work Order Card (เลือก WO ก่อนชั่ง / แสดง WO info ระหว่างชั่ง) ── */}
      <Card
        size="small"
        style={{ marginBottom: 10 }}
        title={
          <Space>
            <Tag color="blue">WO</Tag>
            {!step1Locked ? 'เลือก Work Order' : (
              <Space size={4}>
                <Tag color="blue">WO#{workOrder?.workOrderId}</Tag>
                <Tag color="geekblue">{currentUser.username}</Tag>
                <Tag>{currentUser.role}</Tag>
              </Space>
            )}
          </Space>
        }
        extra={
          <Space>
            {!step1Locked && (
              <Button size="small" onClick={loadWorkOrders}>รีเฟรช</Button>
            )}
            {step1Locked && (
              <>
                {ribbonItems.filter(it => it.active).map(it => (
                  <Tag key={it.label} color={it.color} style={{ padding: '5px 12px', fontWeight: 700 }}>{it.label}</Tag>
                ))}
                <Button size="small" onClick={unlockStep1}>เปลี่ยน WO</Button>
                <Tooltip title={`ปิด WO #${workOrder?.workOrderId} และจบการชั่ง`}>
                  <Button
                    size="small"
                    danger
                    onClick={() => {
                      Modal.confirm({
                        title: `ปิด WO #${workOrder?.workOrderId}?`,
                        content: `Lot: ${workOrder?.lotNo} — สถานะจะเปลี่ยนเป็น END`,
                        okText: 'ปิด WO',
                        cancelText: 'ยกเลิก',
                        okType: 'danger',
                        onOk: closeWorkOrder,
                      })
                    }}
                  >
                    ปิด WO
                  </Button>
                </Tooltip>
              </>
            )}
          </Space>
        }
      >
        {/* ── โหมดเลือก WO (ก่อนเริ่มชั่ง) ── */}
        {!step1Locked && (
          <>
            <Space wrap>
              <Select
                style={{ minWidth: 380 }}
                placeholder="เลือก Work Order (ACTIVE)"
                value={workOrder?.workOrderId ?? undefined}
                onChange={(id: number) => {
                  const wo = workOrders.find(w => w.workOrderId === id) ?? null
                  setWorkOrder(wo)
                  if (wo) {
                    const prod = products.find(p => p.productCode === wo.product?.productCode) ?? null
                    setSelected(prod)
                    setScaleId(wo.scale?.scaleId ?? '')
                    setLotNo(wo.lotNo ?? '')
                  }
                }}
                allowClear
                onClear={() => { setWorkOrder(null); setSelected(null); setScaleId(''); setLotNo('') }}
                options={workOrders.map(wo => ({
                  value: wo.workOrderId,
                  label: `WO#${wo.workOrderId} — ${wo.product?.productCode} | Lot: ${wo.lotNo}${wo.line ? ' | ' + wo.line : ''}`,
                }))}
              />
              {workOrder && (
                <>
                  <Input
                    style={{ width: 260 }}
                    placeholder="ชื่อผู้ร่วมทำงาน (เช่น สมชาย, สมหญิง)"
                    value={operatorNamesInput}
                    onChange={e => setOperatorNamesInput(e.target.value)}
                  />
                  <Button
                    type="primary"
                    onClick={async () => {
                      await startWOSession(workOrder)
                      lockStep1()
                    }}
                    disabled={!selected || !scaleId || !lotNo}
                  >
                    เริ่มชั่ง
                  </Button>
                </>
              )}
            </Space>
            {workOrders.length === 0 && (
              <div style={{ marginTop: 8 }}>
                <Alert type="warning" showIcon message="ไม่พบ Work Order ที่ Active — กรุณาให้ Leader สร้าง WO ก่อน" />
              </div>
            )}
            {workOrder && (
              <div style={{ marginTop: 10, padding: '8px 12px', background: '#f6ffed', borderRadius: 6, border: '1px solid #b7eb8f' }}>
                <Space wrap size={6}>
                  <Tag color="green" style={{ fontWeight: 600 }}>{workOrder.product?.productCode}</Tag>
                  <Tag color="default">{workOrder.product?.productName}</Tag>
                  <Tag>{workOrder.scale?.scaleName ?? workOrder.scale?.scaleId}</Tag>
                  <Tag color="blue">Lot: {workOrder.lotNo}</Tag>
                  {workOrder.line && <Tag>Line: {workOrder.line}</Tag>}
                  {workOrder.startDate && <Tag color="default">{workOrder.startDate} → {workOrder.endDate}</Tag>}
                  {workOrder.customStd != null && <Tag color="purple">Custom Std: {workOrder.customStd}</Tag>}
                  <span style={{ color: '#888', fontSize: 12 }}>สร้างโดย: {workOrder.createdBy}</span>
                </Space>
              </div>
            )}
          </>
        )}

        {/* ── โหมด WO Info (ระหว่างชั่ง หลัง lock) ── */}
        {step1Locked && workOrder && (
          <div style={{ padding: '6px 4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <Space wrap size={6}>
              <Tag color="green" style={{ fontWeight: 600, fontSize: 13 }}>{workOrder.product?.productCode}</Tag>
              <Tag color="default" style={{ fontSize: 13 }}>{workOrder.product?.productName}</Tag>
              <Tag style={{ fontSize: 13 }}>{workOrder.scale?.scaleName ?? workOrder.scale?.scaleId}</Tag>
              <Tag color="blue" style={{ fontSize: 13 }}>Lot: {workOrder.lotNo}</Tag>
              {workOrder.line && <Tag>Line: {workOrder.line}</Tag>}
              {workOrder.startDate && <Tag color="default">{workOrder.startDate} → {workOrder.endDate}</Tag>}
              {workOrder.customStd != null && <Tag color="purple">Custom Std: {workOrder.customStd}</Tag>}
              {operatorNamesInput && <Tag color="geekblue">ทีม: {operatorNamesInput}</Tag>}
            </Space>
            {/* Cleaner countdown — ขวามือแนวเดียวกับ tag row */}
            {cleanerSecondsLeft !== null && (
              <div style={{ textAlign: 'right', lineHeight: 1.2, flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: '#888' }}>
                  {cleaningRequired ? '🧹 รอ Leader อนุมัติ' : 'ทำความสะอาดใน'}
                </div>
                {!cleaningRequired && (
                  <div style={{
                    fontFamily: 'monospace',
                    fontWeight: 700,
                    fontSize: 20,
                    color: cleanerSecondsLeft < 300 ? '#ff4d4f' : cleanerSecondsLeft < 900 ? '#fa8c16' : '#1677ff',
                    letterSpacing: 1,
                  }}>
                    {`${String(Math.floor(cleanerSecondsLeft / 3600)).padStart(2, '0')}:${String(Math.floor((cleanerSecondsLeft % 3600) / 60)).padStart(2, '0')}:${String(cleanerSecondsLeft % 60).padStart(2, '0')}`}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── ก่อน lock: แสดงแค่ Scale Capture ── */}
      {!step1Locked && scaleCaptureCard}

      {/* ── หลัง lock: control band + history full-width ── */}
      {step1Locked && (
        <>
          {/* ── History table: เต็มความกว้าง (บนสุด) ── */}
          <Card size="small" style={{ marginBottom: 10 }} title="ประวัติการชั่ง" extra={<Button size="small" onClick={loadMeasurementHistory}>รีเฟรช</Button>}>
            {measurementHistory.length > 0 && selected ? (
              <MeasurementHistoryTable
                data={measurementHistory}
                currentOuter={outerBox}
                currentInner={innerOrder}
                innerBoxQuantity={selected.innerBoxQuantity || 10}
                weighingMode={selected.weighingMode}
                weightPerPiece={selected.weightPerPiece}
                tolerance={selected.tolerance}
              />
            ) : (
              <Typography.Text type="secondary">ยังไม่มีข้อมูลการชั่ง</Typography.Text>
            )}
          </Card>

          {/* ── Control band: Spec + Box + Status + Capture (แนวนอน) ── */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch', marginBottom: 10, flexWrap: 'wrap' }}>

            {/* Spec + Outer/Inner */}
            {selected && (
              <div style={{
                background: '#fff', border: '1px solid #d9d9d9', borderRadius: 8,
                padding: '10px 14px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, flexShrink: 0
              }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>สเปค</div>
                <Space wrap size={4}>
                  <Tooltip title="น้ำหนักต่ำสุดที่ยังถือว่า OK">
                    <Tag color="red" style={{ fontSize: 13, padding: '2px 8px', fontWeight: 700 }}>Min: {minVal}</Tag>
                  </Tooltip>
                  <Tooltip title="ขอบเขตเหลืองด้านล่าง">
                    <Tag color="gold" style={{ fontSize: 13, padding: '2px 8px', fontWeight: 700 }}>Dmin: {dMinVal}</Tag>
                  </Tooltip>
                  <Tooltip title="ค่าเป้าหมาย (Std ปัจจุบัน)">
                    <Tag color="green" style={{ fontSize: 13, padding: '2px 8px', fontWeight: 700 }}>Std: {currentStd}</Tag>
                  </Tooltip>
                  <Tooltip title="ขอบเขตเหลืองด้านบน">
                    <Tag color="gold" style={{ fontSize: 13, padding: '2px 8px', fontWeight: 700 }}>Dmax: {dMaxVal}</Tag>
                  </Tooltip>
                  <Tooltip title="น้ำหนักสูงสุดที่ยังถือว่า OK">
                    <Tag color="red" style={{ fontSize: 13, padding: '2px 8px', fontWeight: 700 }}>Max: {maxVal}</Tag>
                  </Tooltip>
                </Space>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '4px 16px', borderRadius: 8, background: '#eff6ff',
                    border: '2px solid #1d4ed8', minWidth: 90
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#1d4ed8' }}>Outer</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#1d4ed8', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{outerBox}</div>
                  </div>
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    padding: '4px 16px', borderRadius: 8, background: '#f5f3ff',
                    border: '2px solid #6d28d9', minWidth: 90
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: '#6d28d9' }}>Inner</div>
                    <div style={{ fontSize: 28, fontWeight: 800, color: '#6d28d9', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>{innerOrder}</div>
                  </div>
                  <Button type="primary" size="small" onClick={handleOpenEditBoxModal} disabled={status === 'RED'}>แก้ไข</Button>
                </div>
                {/* Yellow streak progress */}
                {consecutiveYellow > 0 && !yellowLockedAwaitQA && (
                  selected?.weighingMode === 'DOUBLE' ? (
                    // DOUBLE mode: แสดง 2 แถว แยก #1 / #2
                    <div style={{ marginTop: 4, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600, minWidth: 60 }}>ชั่ง #1:</span>
                        {[1,2,3,4,5].map(i => (
                          <div key={i} style={{
                            width: 16, height: 16, borderRadius: 3,
                            background: i <= consecutiveYellow1 ? '#facc15' : '#e5e7eb',
                            border: `1px solid ${i <= consecutiveYellow1 ? '#d97706' : '#d1d5db'}`
                          }} />
                        ))}
                        <span style={{ fontSize: 11, color: '#92400e' }}>{consecutiveYellow1}/5</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600, minWidth: 60 }}>ชั่ง #2:</span>
                        {[1,2,3,4,5].map(i => (
                          <div key={i} style={{
                            width: 16, height: 16, borderRadius: 3,
                            background: i <= consecutiveYellow2 ? '#facc15' : '#e5e7eb',
                            border: `1px solid ${i <= consecutiveYellow2 ? '#d97706' : '#d1d5db'}`
                          }} />
                        ))}
                        <span style={{ fontSize: 11, color: '#92400e' }}>{consecutiveYellow2}/5</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#b45309' }}>
                        รวม {consecutiveYellow}/5 {remainingYellow > 0 ? `(เหลือ ${remainingYellow} ครั้ง)` : ''}
                      </div>
                    </div>
                  ) : (
                    // SINGLE mode: แสดงแถวเดียว
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: '#92400e', fontWeight: 600 }}>เหลือง:</span>
                      {[1,2,3,4,5].map(i => (
                        <div key={i} style={{
                          width: 18, height: 18, borderRadius: 4,
                          background: i <= consecutiveYellow ? '#facc15' : '#e5e7eb',
                          border: `1px solid ${i <= consecutiveYellow ? '#d97706' : '#d1d5db'}`
                        }} />
                      ))}
                      <span style={{ fontSize: 11, color: '#92400e' }}>
                        {consecutiveYellow}/5 {remainingYellow > 0 ? `(เหลือ ${remainingYellow})` : ''}
                      </span>
                    </div>
                  )
                )}
                {yellowLockedAwaitQA && (
                  <div style={{ marginTop: 4, fontSize: 12, fontWeight: 700, color: lockedForInitialStd ? '#6d28d9' : '#b45309' }}>
                    {lockedForInitialStd
                      ? `📋 ชั่งครบ ${initialStdThreshold} กล่องแรก — รอ QA อนุมัติ Initial Std (ID: ${qaApprovalId ?? '-'})`
                      : `⚠️ เหลืองครบ 5 — รอ QA อนุมัติ Std ใหม่ (ID: ${qaApprovalId ?? '-'})`
                    }
                    {/* DOUBLE: แสดงสรุปครั้งที่ lock */}
                    {selected?.weighingMode === 'DOUBLE' && !lockedForInitialStd && (
                      <div style={{ fontSize: 11, fontWeight: 400, marginTop: 2 }}>
                        ชั่ง #1 เหลือง {consecutiveYellow1} ครั้ง / ชั่ง #2 เหลือง {consecutiveYellow2} ครั้ง
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Scale Capture */}
            <div style={{ flexShrink: 0, width: 360 }}>
              {scaleCaptureCard}
            </div>

            {/* Status bar — ขยายเต็มพื้นที่ที่เหลือ */}
            <div style={{ flex: 1, minWidth: 160 }}>
              <StatusBar status={status} />
            </div>

          </div>

          {/* ── Alerts ── */}
          {alertSection && (
            <div style={{ marginBottom: 10 }}>{alertSection}</div>
          )}
        </>
      )}
    </div>
  )
}

// ----- Status Bar Component -----
function StatusBar({ status }: { status: string }) {
  // ใช้สีที่ contrast ดีขึ้นและเพิ่มขนาด
  const palette: Record<string, { bg: string; fg: string }> = {
    GREEN: { bg: '#14532d', fg: '#ffffff' },
    YELLOW: { bg: '#facc15', fg: '#000000' },
    RED: { bg: '#b91c1c', fg: '#ffffff' },
    DEFAULT: { bg: '#64748b', fg: '#ffffff' }
  }
  const p = palette[status] || palette.DEFAULT
  const label = status ? `สถานะ: ${status}` : 'สถานะ: -'
  const pulse = status === 'RED' ? '0 0 0 0 rgba(185,28,28,0.7)' : status === 'YELLOW' ? '0 0 0 0 rgba(250,204,21,0.6)' : '0 0 0 0 rgba(0,0,0,0.3)'
  return (
    <div style={{
      minHeight: 90,
      borderRadius: 10,
      background: p.bg,
      color: p.fg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontWeight: 800,
      fontSize: 40,
      letterSpacing: 1.5,
      boxShadow: `inset 0 0 14px rgba(0,0,0,0.35), 0 0 18px ${pulse}`,
      transition: 'background 0.3s'
    }}>
      {label}
    </div>
  )
}

function BigBoxIndicator({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div style={{
      display:'flex', flexDirection:'column', alignItems:'center',
      padding:'8px 16px', borderRadius:12, background:bg, minWidth:160,
      boxShadow:'0 2px 6px rgba(0,0,0,0.15)', border:`2px solid ${color}`
    }}>
      <div style={{ fontSize:14, fontWeight:600, color }}>{label}</div>
      <div style={{ fontSize:48, fontWeight:700, color, fontVariantNumeric:'tabular-nums' }}>{value}</div>
    </div>
  )
}

function StickySummary({ selected, scaleId, scales, lotNo, status, outerBox, innerOrder, activeChips, onEditBox }: any) {
  if (!selected || !scaleId || !lotNo) return null
  const scaleName = (scales || []).find((s: any) => s.scaleId === scaleId)?.scaleName || ''
  const palette: Record<string, { bg: string; fg: string }> = {
    GREEN: { bg: '#14532d', fg: '#ffffff' },
    YELLOW: { bg: '#facc15', fg: '#000000' },
    RED: { bg: '#b91c1c', fg: '#ffffff' },
    DEFAULT: { bg: '#64748b', fg: '#ffffff' }
  }
  const p = palette[status] || palette.DEFAULT
  return (
    <div style={{ position:'sticky', top:8, zIndex:20 }}>
      <div style={{
        display:'grid',
        gridTemplateColumns:'1fr auto auto',
        alignItems:'center',
        gap:16,
        background:'#fff', border:'1px solid #e5e7eb', borderRadius:10, padding:'8px 12px',
        boxShadow:'0 4px 12px rgba(0,0,0,0.08)'
      }}>
        <Space wrap>
          <Tag color="geekblue">{selected.productCode}</Tag>
          <Tag>{selected.productName}</Tag>
          <Tag color="blue">{scaleId}{scaleName?` - ${scaleName}`:''}</Tag>
          <Tag color="purple">Lot: {lotNo}</Tag>
        </Space>
        {/* กลาง: Outer/Inner + ปุ่มแก้ไข (ใต้ตัวเลข) */}
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{
              display:'flex', flexDirection:'column', alignItems:'center',
              padding:'6px 12px', borderRadius:10, background:'#e6f4ff', minWidth:120,
              boxShadow:'0 2px 4px rgba(0,0,0,0.12)', border:'2px solid #003a8c'
            }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#003a8c' }}>Outer</div>
              <div style={{ fontSize:28, fontWeight:700, color:'#003a8c', fontVariantNumeric:'tabular-nums' }}>{outerBox}</div>
            </div>
            <div style={{
              display:'flex', flexDirection:'column', alignItems:'center',
              padding:'6px 12px', borderRadius:10, background:'#f9f0ff', minWidth:120,
              boxShadow:'0 2px 4px rgba(0,0,0,0.12)', border:'2px solid #531dab'
            }}>
              <div style={{ fontSize:12, fontWeight:600, color:'#531dab' }}>Inner</div>
              <div style={{ fontSize:28, fontWeight:700, color:'#531dab', fontVariantNumeric:'tabular-nums' }}>{innerOrder}</div>
            </div>
          </div>
          <div style={{ marginTop:6, display:'flex', gap:8 }}>
            <Button type="primary" onClick={onEditBox} disabled={status==='RED'}>แก้ไข</Button>
          </div>
        </div>
        {/* ขวา: Refresh + แท็กสถานะชั่งปกติ/อื่นๆ */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8 }}>
          <Button onClick={() => window.dispatchEvent(new CustomEvent('refresh-last-box'))}>Refresh Last Box</Button>
          {activeChips?.map((it: any) => (
            <Tag key={it.label} color={it.color} style={{ padding:'6px 12px', fontWeight:700 }}>{it.label}</Tag>
          ))}
        </div>
      </div>
      <div style={{ marginTop:8, borderRadius:10, background:p.bg, color:p.fg, display:'flex', alignItems:'center', justifyContent:'center', minHeight:56, fontSize:26, fontWeight:800 }}>
        สถานะ: {status || '-'}
      </div>
    </div>
  )
}

// ----- Helper calls: แจ้งขออนุมัติ -----
async function requestQaApprovalDraft(ctx: { productCode: string, scaleId: string, lotNo: string, stdOld: number, weights3: number[] }, requestedBy: string): Promise<number | null> {
  try {
    const payload = {
      productCode: ctx.productCode,
      scaleId: ctx.scaleId,
      lotNo: ctx.lotNo,
      stdOld: ctx.stdOld,
      weights3: ctx.weights3
    }
    const r = await fetch(apiUrl('/api/approvals'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      body: JSON.stringify({
        type: 'STD_CHANGE_REQUEST',
        approverRole: 'QA',
        requestedBy,
        status: 'PENDING',
        stage: 'REQUESTED',
        note: `YELLOW x5: product=${ctx.productCode}, scale=${ctx.scaleId}, lot=${ctx.lotNo}, stdOld=${ctx.stdOld}, weights5=${JSON.stringify(ctx.weights3)}`,
        payloadJson: JSON.stringify(payload)
      })
    })
    if (!r.ok) return null
    const a = await r.json()
    return a?.id ?? null
  } catch {
    return null
  }
}

// ฟังก์ชันใหม่: ส่งคำขอ QA พร้อมค่า Std ที่คำนวณแล้ว (จาก 5 กล่องเหลือง)
async function requestQaApprovalWithStd(ctx: { productCode: string, scaleId: string, lotNo: string, outerBox?: string, innerOrder?: string, stdOld: number, weights5: number[], weights5_1?: number[], weights5_2?: number[], allWeights?: number[], allWeights1?: number[], allWeights2?: number[], proposedStd: number, proposedStd1?: number, proposedStd2?: number, initialStdThreshold?: number }, requestedBy: string): Promise<number | null> {
  try {
    const payload = {
      productCode: ctx.productCode,
      scaleId: ctx.scaleId,
      lotNo: ctx.lotNo,
      outerBox: ctx.outerBox,
      innerOrder: ctx.innerOrder,
      stdOld: ctx.stdOld,
      weights5: ctx.weights5,
      weights5_1: ctx.weights5_1,
      weights5_2: ctx.weights5_2,
      allWeights: ctx.allWeights || [],
      allWeights1: ctx.allWeights1,
      allWeights2: ctx.allWeights2,
      proposedStd: ctx.proposedStd,
      proposedStd1: ctx.proposedStd1,
      proposedStd2: ctx.proposedStd2
    }
    
    console.log('🟡 Requesting QA approval with std:', payload) // Debug
    
    let noteMsg = `YELLOW x5: product=${ctx.productCode}, scale=${ctx.scaleId}, lot=${ctx.lotNo}, stdOld=${ctx.stdOld} → proposedStd=${ctx.proposedStd}`
    if (ctx.proposedStd1 != null && ctx.proposedStd2 != null) {
      noteMsg += ` (Std1=${ctx.proposedStd1}, Std2=${ctx.proposedStd2})`
    }
    if (ctx.weights5 && ctx.weights5.length > 0) {
      noteMsg += `, จาก 5 กล่อง: ${JSON.stringify(ctx.weights5)}`
    } else {
      noteMsg = `INITIAL STD: product=${ctx.productCode}, scale=${ctx.scaleId}, lot=${ctx.lotNo} → proposedStd=${ctx.proposedStd}`
      if (ctx.proposedStd1 != null && ctx.proposedStd2 != null) {
        noteMsg += ` (Std1=${ctx.proposedStd1}, Std2=${ctx.proposedStd2})`
      }
      noteMsg += ` จาก ${ctx.initialStdThreshold ?? 10} กล่องแรก`
    }

    const r = await fetch(apiUrl('/api/approvals'), {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json', 
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify({
        type: 'STD_CHANGE_REQUEST',
        approverRole: 'QA',
        requestedBy,
        status: 'PENDING',
        stage: 'READY_FOR_APPLY',
        note: noteMsg,
        payloadJson: JSON.stringify(payload)
      })
    })
    
    if (!r.ok) {
      const errorText = await r.text()
      console.error('❌ QA approval request failed:', r.status, errorText)
      return null
    }
    
    const a = await r.json()
    console.log('✅ QA approval created:', a)
    return a?.id ?? null
  } catch (err) {
    console.error('❌ Exception in requestQaApprovalWithStd:', err)
    return null
  }
}

async function updateQaApprovalWithProposal(
  id: number,
  newStd: number,
  all5: number[],
  ctx?: { productCode: string; scaleId: string; lotNo: string; stdOld: number }
) {
  try {
    const payload: any = { proposedStd: newStd, weights5: all5 }
    if (ctx) {
      payload.productCode = ctx.productCode
      payload.scaleId = ctx.scaleId
      payload.lotNo = ctx.lotNo
      payload.stdOld = ctx.stdOld
    }
    await fetch(apiUrl(`/api/approvals/${id}/update-proposal`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') || ''}` },
      body: JSON.stringify({ payloadJson: JSON.stringify(payload), note: `เสนอ Std ใหม่=${newStd}, จาก 5 กล่อง: ${JSON.stringify(all5)}` })
    })
  } catch { return null }
}

// Legacy helper no longer used for new RED logic (approval now created via measurement link). Kept for fallback if needed.
async function requestLeaderApproval(_ctx: any): Promise<number | null> { return null }

function normalizeTime(s: string): string | null {
  const t = s.trim()
  // Accept HH:mm or HH:mm:ss or HHmmss
  const mm = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(t)
  if (mm) {
    const hh = mm[1].padStart(2, '0')
    const mi = mm[2]
    const ss = (mm[3] ?? '00').padStart(2, '0')
    const H = Number.parseInt(hh, 10)
    const M = Number.parseInt(mi, 10)
    const S = Number.parseInt(ss, 10)
    if (H >= 0 && H < 24 && M >= 0 && M < 60 && S >= 0 && S < 60) return `${hh}:${mi}:${ss}`
    return null
  }
  const mm2 = /^(\d{2})(\d{2})(\d{2})$/.exec(t)
  if (mm2) {
    const [_, h, m, s2] = mm2
    const H = Number.parseInt(h, 10), M = Number.parseInt(m, 10), S = Number.parseInt(s2, 10)
    if (H >= 0 && H < 24 && M >= 0 && M < 60 && S >= 0 && S < 60) return `${h}:${m}:${s2}`
  }
  return null
}

function normalizeDate(s: string): string | null {
  const t = s.trim()
  // Accept ISO yyyy-MM-dd (pass-through)
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
  if (iso) {
    const y = Number.parseInt(iso[1], 10), m = Number.parseInt(iso[2], 10), d = Number.parseInt(iso[3], 10)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`
    return null
  }
  // Enforce MM-DD-YYYY (dash) from the scale input
  const mmddyyyy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t)
  if (mmddyyyy) {
    const mm = Number.parseInt(mmddyyyy[1], 10)
    const dd = Number.parseInt(mmddyyyy[2], 10)
    const y = mmddyyyy[3]
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${y}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`
    }
    return null
  }
  return null
}


// Parse scale capture that might be either 3 lines (weight, time, date) or a single line concatenated
function parseScaleCapture(raw: string): { w: string; t: string; d: string } | null {
  const txt = (raw || '').trim()
  if (!txt) return null
  // 3-line mode
  const lines = txt.split(/\r?\n/).filter(Boolean)
  if (lines.length >= 3) {
    return { w: lines[0], t: lines[1], d: lines[2] }
  }
  // Single-line: try to locate time first, then take weight before time and date after
  // time pattern HH:mm or HH:mm:ss
  // match time anywhere (no word boundaries) so it works with concatenated weight e.g. "+000226.916:59:04..."
  const timeRe = /(\d{1,2}:\d{2}(?::\d{2})?)/
  const timeMatch = timeRe.exec(txt)
  if (!timeMatch || timeMatch.index == null) return null
  const t = timeMatch[1]
  const before = txt.slice(0, timeMatch.index).trim()
  const after = txt.slice(timeMatch.index + t.length).trim()
  // find date in 'after'
  // allow date anywhere after time: yyyy-MM-dd or MM-DD-YYYY
  const dateRe = /(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})/
  const dMatch = dateRe.exec(after)
  if (!dMatch || dMatch.index == null) return null
  const d = dMatch[1]
  const w = before
  return { w, t, d }
}

// คำนวณสถานะจากน้ำหนัก + std ของ measurement ใน history grid
// — แก้ไขกรณี DB status ผิดพลาดจาก backend formula เคยมี +1.0 offset ทำให้เก็บเป็น YELLOW แทน RED
function getDisplayStatus(
  item: { weight: number; std: number; status: string },
  weighingMode?: string,
  weightPerPiece?: number,
  tolerance?: number
): string {
  if (weighingMode !== 'DOUBLE' && item.std > 0 && (weightPerPiece ?? 0) > 0) {
    const wpp = weightPerPiece!
    const min = item.std - wpp / 2
    const max = item.std + wpp / 2
    const tol = (tolerance ?? 0) > 0 ? tolerance! : wpp / 4
    const dmin = item.std - tol
    const dmax = item.std + tol
    if (item.weight < min || item.weight > max) return 'RED'
    if (item.weight < dmin || item.weight > dmax) return 'YELLOW'
    return 'GREEN'
  }
  return item.status // DOUBLE mode หรือ ไม่มี std → ใช้ค่าจาก DB
}

// Component สำหรับแสดงตารางประวัติการชั่ง
function MeasurementHistoryTable({ data, currentOuter, currentInner, innerBoxQuantity, weighingMode, weightPerPiece, tolerance }: {
  data: Array<{outer: string; inner: string; weight: number; weight1?: number; weight2?: number; std: number; std1?: number; std2?: number; status: string}>;
  currentOuter: string;
  currentInner: string;
  innerBoxQuantity: number;
  weighingMode?: string;
  weightPerPiece?: number;
  tolerance?: number;
}) {
  // จัดกลุ่มข้อมูลตาม Outer
  const groupedByOuter: Record<string, Array<{inner: string; weight: number; weight1?: number; weight2?: number; std: number; std1?: number; std2?: number; status: string}>> = {}
  data.forEach(item => {
    if (!groupedByOuter[item.outer]) {
      groupedByOuter[item.outer] = []
    }
    groupedByOuter[item.outer].push(item)
  })
  
  // เรียงลำดับ items ในแต่ละ Outer ตามหมายเลข Inner (เพื่อให้ 1, 2, 3, 5 เรียงต่อกัน)
  Object.keys(groupedByOuter).forEach(outer => {
    groupedByOuter[outer].sort((a, b) => Number.parseInt(a.inner, 10) - Number.parseInt(b.inner, 10))
  })
  
  // เรียงลำดับ Outer และกรองเฉพาะที่มีข้อมูลหรือเป็น Outer ปัจจุบัน
  const outerKeys = Object.keys(groupedByOuter)
    .filter(outer => outer !== '000') // ไม่แสดง Outer 000
    .sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
  
  // เพิ่ม currentOuter ถ้ายังไม่มีในรายการ
  if (!outerKeys.includes(currentOuter) && currentOuter !== '000') {
    outerKeys.push(currentOuter)
    outerKeys.sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
  }
  
  // แสดงทุก Outer ที่มีข้อมูล (รวมถึงที่ครบแล้ว) เพื่อให้เห็นประวัติการทำงาน
  const filteredOuters = outerKeys
  
  const isDouble = data.some(item => item.weight1 != null || item.weight2 != null)
  
  return (
    <div style={{ overflowX: 'auto' }}>
      {filteredOuters.length === 0 ? (
        <div style={{ padding: 16, textAlign: 'center', color: '#999' }}>
          ยังไม่มีข้อมูลการชั่ง
        </div>
      ) : (
        <>
          {filteredOuters.map(outer => {
            const items = groupedByOuter[outer] || []
            // คำนวณขนาดตาราง (อย่างน้อยเท่ากับ innerBoxQuantity แต่ขยายได้ถ้ามีข้อมูลเกิน)
            const count = items.length
            const yellowCountForOuter = items.filter(i => i.status === 'YELLOW').length
            const displayCapacity = Math.max(innerBoxQuantity, count)
            const rowsCount = Math.ceil(displayCapacity / 10)
            
            const remaining = Math.max(0, innerBoxQuantity - count)
            
            return (
              <div key={outer} style={{ marginBottom: 20, border: '1px solid #d9d9d9', borderRadius: 4 }}>
                {/* Outer Header */}
                <div style={{ 
                  padding: '8px 12px',
                  backgroundColor: '#fafafa',
                  borderBottom: '1px solid #d9d9d9',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12
                }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>Outer: {outer}</span>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {count}/{innerBoxQuantity}
                    {remaining > 0 && <span style={{ color: '#ff4d4f', marginLeft: 4 }}>(ขาด {remaining})</span>}
                  </span>
                  <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: '#b97b00' }}>YELLOW: {yellowCountForOuter}</span>
                </div>
                
                {/* Inner/Weight Table */}
                <table style={{ 
                  width: '100%', 
                  borderCollapse: 'collapse', 
                  fontSize: 12
                }}>
                  <tbody>
                    {Array.from({ length: rowsCount }).map((_, rowIdx) => {
                      return (
                        <React.Fragment key={`row-${rowIdx}`}>
                          {/* แถว Inner */}
                          <tr>
                            <td style={{ 
                              padding: '4px 8px', 
                              border: '1px solid #d9d9d9', 
                              fontWeight: 600,
                              backgroundColor: '#f5f5f5',
                              width: 70,
                              textAlign: 'center'
                            }}>Inner</td>
                            {Array.from({ length: 10 }).map((_, colIdx) => {
                              const slotIndex = rowIdx * 10 + colIdx
                              if (slotIndex >= displayCapacity) return <td key={`col-${rowIdx}-${colIdx}`} style={{ border: '1px solid #d9d9d9', backgroundColor: '#f0f0f0' }}></td>
                              
                              const item = items[slotIndex]
                              const isCurrent = (outer === currentOuter && item && item.inner === currentInner)
                              const ds = item ? getDisplayStatus(item, weighingMode, weightPerPiece, tolerance) : ''

                              return (
                                <td key={`col-${rowIdx}-${colIdx}`} style={{
                                  padding: '4px 8px',
                                  border: '1px solid #d9d9d9',
                                  textAlign: 'center',
                                  backgroundColor: item ? (ds === 'GREEN' ? '#d9f7be' : ds === 'YELLOW' ? '#fff7cd' : ds === 'RED' ? '#ff4d4f' : '#fff') : '#fff',
                                  color: ds === 'RED' ? '#fff' : 'inherit',
                                  fontWeight: isCurrent ? 700 : (ds === 'RED' ? 700 : 400),
                                  borderWidth: isCurrent ? 2 : 1,
                                  borderColor: isCurrent ? '#1677ff' : (ds === 'RED' ? '#cf1322' : '#d9d9d9'),
                                  minWidth: 60
                                }}>
                                  {item ? item.inner : '-'}
                                </td>
                              )
                            })}
                          </tr>
                          {/* แถว Weight */}
                          <tr>
                            <td style={{ 
                              padding: '4px 8px', 
                              border: '1px solid #d9d9d9', 
                              fontWeight: 600,
                              backgroundColor: '#f5f5f5',
                              width: 70,
                              textAlign: 'center'
                            }}>{isDouble ? 'นน.รวม' : 'Weight'}</td>
                            {Array.from({ length: 10 }).map((_, colIdx) => {
                              const slotIndex = rowIdx * 10 + colIdx
                              if (slotIndex >= displayCapacity) return <td key={`col-${rowIdx}-${colIdx}`} style={{ border: '1px solid #d9d9d9', backgroundColor: '#f0f0f0' }}></td>
                              
                              const item = items[slotIndex]
                              const dsW = item ? getDisplayStatus(item, weighingMode, weightPerPiece, tolerance) : ''

                              return (
                                <td key={`col-${rowIdx}-${colIdx}`} style={{
                                  padding: '4px 8px',
                                  border: `1px solid ${dsW === 'RED' ? '#cf1322' : '#d9d9d9'}`,
                                  textAlign: 'center',
                                  backgroundColor: item ? (dsW === 'GREEN' ? '#d9f7be' : dsW === 'YELLOW' ? '#fff7cd' : dsW === 'RED' ? '#ff4d4f' : '#f9f9f9') : '#f9f9f9',
                                  fontVariantNumeric: 'tabular-nums',
                                  fontWeight: dsW === 'RED' ? 700 : 400,
                                  minWidth: 60,
                                  color: dsW === 'RED' ? '#fff' : (item ? 'inherit' : '#ccc')
                                }}>
                                  {item ? item.weight.toFixed(3) : '-'}
                                </td>
                              )
                            })}
                          </tr>
                          {isDouble && (
                            <>
                              <tr>
                                <td style={{ padding: '4px 8px', border: '1px solid #d9d9d9', fontWeight: 600, backgroundColor: '#f5f5f5', width: 70, textAlign: 'center', fontSize: 11, color: '#666' }}>นน. 1</td>
                                {Array.from({ length: 10 }).map((_, colIdx) => {
                                  const slotIndex = rowIdx * 10 + colIdx
                                  if (slotIndex >= displayCapacity) return <td key={`col-${rowIdx}-${colIdx}`} style={{ border: '1px solid #d9d9d9', backgroundColor: '#f0f0f0' }}></td>
                                  const item = items[slotIndex]
                                  const dsW1 = item ? getDisplayStatus(item, weighingMode, weightPerPiece, tolerance) : ''
                                  return (
                                    <td key={`col-${rowIdx}-${colIdx}`} style={{ padding: '4px 8px', border: `1px solid ${dsW1 === 'RED' ? '#cf1322' : '#d9d9d9'}`, textAlign: 'center', backgroundColor: dsW1 === 'RED' ? '#ff7875' : '#fff', fontSize: 11, color: dsW1 === 'RED' ? '#fff' : '#888', fontWeight: dsW1 === 'RED' ? 700 : 400 }}>{item && item.weight1 != null ? item.weight1.toFixed(3) : '-'}</td>
                                  )
                                })}
                              </tr>
                              <tr>
                                <td style={{ padding: '4px 8px', border: '1px solid #d9d9d9', fontWeight: 600, backgroundColor: '#f5f5f5', width: 70, textAlign: 'center', fontSize: 11, color: '#666' }}>นน. 2</td>
                                {Array.from({ length: 10 }).map((_, colIdx) => {
                                  const slotIndex = rowIdx * 10 + colIdx
                                  if (slotIndex >= displayCapacity) return <td key={`col-${rowIdx}-${colIdx}`} style={{ border: '1px solid #d9d9d9', backgroundColor: '#f0f0f0' }}></td>
                                  const item = items[slotIndex]
                                  const dsW2 = item ? getDisplayStatus(item, weighingMode, weightPerPiece, tolerance) : ''
                                  return (
                                    <td key={`col-${rowIdx}-${colIdx}`} style={{ padding: '4px 8px', border: `1px solid ${dsW2 === 'RED' ? '#cf1322' : '#d9d9d9'}`, textAlign: 'center', backgroundColor: dsW2 === 'RED' ? '#ff7875' : '#fff', fontSize: 11, color: dsW2 === 'RED' ? '#fff' : '#888', fontWeight: dsW2 === 'RED' ? 700 : 400 }}>{item && item.weight2 != null ? item.weight2.toFixed(3) : '-'}</td>
                                  )
                                })}
                              </tr>
                            </>
                          )}
                          {/* แถว Std */}
                          <tr>
                            <td style={{ 
                              padding: '4px 8px', 
                              border: '1px solid #d9d9d9', 
                              fontWeight: 600,
                              backgroundColor: '#f5f5f5',
                              width: 70,
                              textAlign: 'center',
                              fontSize: 11,
                              color: '#666'
                            }}>Std</td>
                            {Array.from({ length: 10 }).map((_, colIdx) => {
                              const slotIndex = rowIdx * 10 + colIdx
                              if (slotIndex >= displayCapacity) return <td key={`col-${rowIdx}-${colIdx}`} style={{ border: '1px solid #d9d9d9', backgroundColor: '#f0f0f0' }}></td>
                              const item = items[slotIndex]
                              return (
                                <td key={`col-${rowIdx}-${colIdx}`} style={{ padding: '4px 8px', border: '1px solid #d9d9d9', textAlign: 'center', backgroundColor: '#fff', fontSize: 11, color: '#888' }}>
                                  {item ? item.std.toFixed(3) : '-'}
                                </td>
                              )
                            })}
                          </tr>
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
