import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Card, Space, Select, Input, InputNumber, Button, Tag, Alert, Typography, Checkbox, Tooltip, Modal } from 'antd'
import { apiUrl } from './api'

type User = { username: string; role: string }

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
}

type Scale = {
  scaleId: string
  scaleName?: string
}

type SavedMeasurement = {
  measurementId: number
  status: string
}

export function MeasurementEntry({ currentUser }: { currentUser: User }) {
  const [products, setProducts] = useState<Product[]>([])
  const [selected, setSelected] = useState<Product | null>(null) // ต้องให้ผู้ใช้เลือกเองทุกครั้ง ไม่ auto-select
  const [weight, setWeight] = useState<number>(0)
  const [status, setStatus] = useState<string>('')
  const [outerBox, setOuterBox] = useState<string>('001')
  const [innerOrder, setInnerOrder] = useState<string>('0001')
  const [yellowCount, setYellowCount] = useState<number>(0)
  const [locked, setLocked] = useState<boolean>(false)
  const [scales, setScales] = useState<Scale[]>([])
  const [scaleId, setScaleId] = useState<string>('')
  const [lotNo, setLotNo] = useState<string>('')
  const [masterErr, setMasterErr] = useState<string>('')
  // เก็บข้อมูลเพื่อคุมค่า Std ตามกติกาใหม่
  const [currentStd, setCurrentStd] = useState<number>(0) // Std ที่ใช้งานจริง (เริ่มจากตาราง)
  const [yellowStreak, setYellowStreak] = useState<number>(0)
  const [yellowSeqWeights, setYellowSeqWeights] = useState<number[]>([]) // เก็บ 5 ค่าน้ำหนักเหลืองล่าสุดติดกัน
  const [collectingForStd, setCollectingForStd] = useState<boolean>(false) // เริ่มเก็บเพิ่มอีก 2 กล่องหรือยัง
  const [proposalWeights, setProposalWeights] = useState<number[]>([]) // น้ำหนัก 5 กล่องที่จะเอามาเฉลี่ยเป็น Std ใหม่
  const [proposedStd, setProposedStd] = useState<number | null>(null)
  const [qaApprovalId, setQaApprovalId] = useState<number | null>(null)
  const [yellowLockedAwaitQA, setYellowLockedAwaitQA] = useState<boolean>(false) // ล็อกรอ QA อนุญาตให้ชั่งต่อ 4-5
  const [waitingForApply, setWaitingForApply] = useState<boolean>(false) // รอ QA ยืนยัน apply Std ใหม่
  // เก็บคำขอ QA ที่ยังส่งไม่สำเร็จ (เช่น server ล่มชั่วคราว) เพื่อ retry อัตโนมัติ
  const queuedQaDraftRef = useRef<{ productCode:string; scaleId:string; lotNo:string; stdOld:number; weights3:number[]; weights5:number[]; proposedStd:number }|null>(null)
  // คุม auto-save สำหรับ RED ให้บันทึกครั้งเดียวต่อชิ้นงาน (outer/inner ปัจจุบัน)
  const redAutoSavedRef = useRef<boolean>(false)
  // ป้องกันการสร้างคำขอ RED ซ้ำในรอบเดียวกัน
  const redApprovalRequestedRef = useRef<boolean>(false)
  const [redAutoSaved, setRedAutoSaved] = useState<boolean>(false)
  // Lock ข้อมูลขั้นตอนที่ 1 (Product/Scale/Lot) หลังเริ่มชั่ง
  const [step1Locked, setStep1Locked] = useState<boolean>(false)

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
  // ประสิทธิภาพ: แคชข้อมูลกล่องล่าสุด และชุดกล่องที่บันทึกแล้วใน session นี้
  const lastKeyCacheRef = useRef<Map<string, { inner: number; status?: string; ts: number }>>(new Map())
  const savedBoxesRef = useRef<Set<string>>(new Set())
  const lastLockKeyRef = useRef<string | null>(null)
  // ตัวเลือก: บันทึก GREEN/YELLOW อัตโนมัติ ลดการคลิก
  const [autoSaveGY, setAutoSaveGY] = useState<boolean>(true)
  const submittingRef = useRef<boolean>(false)
  // ป้องกัน classify ซ้ำจาก onChange/auto calls ในช่วงเวลาใกล้กัน
  const lastClassifyRef = useRef<{ key: string; ts: number } | null>(null)
  // ป้องกันการสร้าง QA request ซ้ำก่อน state อัปเดต
  const qaRequestInFlightRef = useRef<boolean>(false)
  // ป้องกันการเพิ่ม Inner ซ้ำหลัง QA อนุมัติ
  const qaInnerIncrementedRef = useRef<boolean>(false)
  // Modal สำหรับแก้ไขหมายเลขกล่อง
  const [editBoxModalVisible, setEditBoxModalVisible] = useState<boolean>(false)
  const [editInnerValue, setEditInnerValue] = useState<string>('')
  const [editOuterValue, setEditOuterValue] = useState<string>('')
  const [modalErrorMessage, setModalErrorMessage] = useState<string>('')
  // ป้องกัน auto-calculate หลังจาก Operator แก้ไขหมายเลขด้วยตนเอง
  const manualEditTimestampRef = useRef<number>(0)
  
  // State สำหรับตารางแสดงข้อมูลการชั่ง
  const [measurementHistory, setMeasurementHistory] = useState<Array<{outer: string; inner: string; weight: number; std: number; status: string}>>([])
  
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
        std: m.std || 0,
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
    const currentInnerNum = parseInt(innerOrder, 10)
    const currentOuterNum = parseInt(outerBox, 10)
    const newInnerNum = parseInt(newInner, 10)
    const newOuterNum = parseInt(newOuter, 10)
    
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
    const t = setInterval(async () => {
      try {
        const r = await fetch(apiUrl(`/api/approvals/${qaApprovalId}`), { headers: getAuthHeaders() })
        if (!r.ok) return
        const a = await r.json()
        if (a?.stage === 'APPLIED') {
          setWaitingForApply(false)
          setLocked(false)
          setYellowLockedAwaitQA(false) // ปลดล็อกทั้งหมด
          if (proposedStd != null) {
            setCurrentStd(proposedStd)
            // embed new standard into selected product for immediate recalculation
            setSelected(prev => prev ? { ...prev, standardWeight: proposedStd, minWeight: proposedStd - (prev.weightPerPiece/2), maxWeight: proposedStd + (prev.weightPerPiece/2) } as any : prev)
          } else {
            // fallback: refetch product list to get updated standard from backend
            fetch(apiUrl('/api/products'), { headers: getAuthHeaders() })
              .then(r => r.ok ? r.json() : [])
              .then((plist: Product[]) => {
                setProducts(plist)
                if (selected) {
                  const updated = plist.find(p => p.productCode === selected.productCode)
                  if (updated && updated.standardWeight && isFinite(updated.standardWeight)) {
                    setCurrentStd(updated.standardWeight)
                    setSelected(updated)
                  }
                }
              })
              .catch(()=>{})
          }
          // reset counters for next round
          setYellowCount(0)
          setYellowStreak(0)
          setYellowSeqWeights([])
          setProposalWeights([])
          setProposedStd(null)            // สำคัญ: ต้องล้าง ไม่งั้นรอบหน้าจะไม่ล็อคเมื่อเหลืองครบ 5
          setQaApprovalId(null)           // ปลดผูก approval เดิม ให้สร้างคำขอใหม่ได้
          setYellowLockedAwaitQA(false)
          setCollectingForStd(false)
          // ตัด key classify เดิม ป้องกันการทับซ้อน state รอบก่อน
          lastClassifyRef.current = null
          qaRequestInFlightRef.current = false
          
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
    }, 5000)
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
    if (!leaderApprovalId || status !== 'RED' || !locked) return
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
          setLocked(false)
          redAutoSavedRef.current = false
          redApprovalRequestedRef.current = false
          setRedAutoSaved(false)
          setStatus('')
          setWeight(0)
          setCapTime('')
          setCapDate('')
          setInfoMessage(`Leader/QA อนุมัติแล้ว: ปลดล็อกและพร้อมชั่งซ้ำที่กล่อง Outer ${redOuter} Inner ${redInner}`)
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
    if (typeof sw === 'number' && isFinite(sw) && sw > 0) return +sw
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
    if (selected && scaleId && lotNo && outerBox && innerOrder && isFinite(w) && w > 0) {
      const key = `${selected.productCode}|${scaleId}|${lotNo}|${outerBox}|${innerOrder}|${w.toFixed(3)}`
      const now = Date.now()
      const last = lastClassifyRef.current
      if (last && last.key === key && (now - last.ts) < 300) {
        return
      }
      lastClassifyRef.current = { key, ts: now }
    }
    // ป้องกันสถานะผิดพลาดตอนโหลดข้อมูลไม่ครบ (เช่น currentStd ยังเป็น 0)
    if (!selected || !isFinite(w) || w <= 0 || !isFinite(currentStd) || currentStd <= 0) {
      return
    }
    if (!selected || !isFinite(w) || w <= 0) return
    // ล็อค Step 1 อัตโนมัติเมื่อเริ่มชั่งครั้งแรก
    if (!step1Locked && selected && scaleId && lotNo) {
      lockStep1()
    }
    // ถ้าถูกล็อกรอ QA ห้ามชั่ง
    if (yellowLockedAwaitQA || waitingForApply) {
      return
    }
    if (w < minVal || w > maxVal) {
      setStatus('RED')
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
            
          if (saved && saved.measurementId) {
            redAutoSavedRef.current = true
            setRedAutoSaved(true)
            try {
              const r = await fetch(apiUrl(`/api/approvals/red-for-measurement/${saved.measurementId}`), {
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
    if (w < dMinVal || w > dMaxVal) {
      setStatus('YELLOW')
      setYellowCount((c) => c + 1)
      setYellowStreak((s) => {
        const ns = s + 1
        const nws = [...yellowSeqWeights, w].slice(-5) // เก็บ 5 ค่าน้ำหนักล่าสุด
        setYellowSeqWeights(nws)
        // ครบ 5 ครั้งติดกัน → คำนวณ Std ใหม่ทันที และส่งให้ QA อนุมัติ
        if (ns >= 5 && proposedStd == null && !yellowLockedAwaitQA && !qaRequestInFlightRef.current) {
          // คำนวณค่าเฉลี่ย 5 กล่อง
          const avg = +(nws.reduce((a, b) => a + b, 0) / nws.length).toFixed(3)
          setProposedStd(avg)
          setLocked(true)
          setYellowLockedAwaitQA(true)
          setWaitingForApply(true)
          setProposalWeights(nws)
          qaInnerIncrementedRef.current = false // Reset flag เตรียมรอ QA approve
          // สร้างคำขอ QA พร้อมค่า Std ใหม่
          const draft = { 
            productCode: selected.productCode, 
            scaleId, 
            lotNo, 
            stdOld: currentStd, 
            weights3: nws.slice(0, 3),
            weights5: nws, 
            proposedStd: avg 
          }
          queuedQaDraftRef.current = draft
          qaRequestInFlightRef.current = true
          setInfoMessage(`⏳ กำลังส่งคำขอ Std ใหม่ = ${avg} ไปยัง QA...`)
          requestQaApprovalWithStd(draft, currentUser.username).then((id) => {
            if (id) { 
              setQaApprovalId(id)
              setInfoMessage(`✅ เหลืองครบ 5 ครั้ง: คำนวณ Std ใหม่ = ${avg} และส่งคำขอ QA แล้ว (ID: ${id})`)
            } else {
              setErrorMessage(`❌ ไม่สามารถส่งคำขอ QA ได้ กรุณาลองใหม่`)
            }
            qaRequestInFlightRef.current = false
          })
        }
        return ns
      })
    } else {
      setStatus('GREEN')
      setYellowCount(0)
      setYellowStreak(0)
      setYellowSeqWeights([])
    }

    // ไม่ต้องมีโหมดรวบรวมเพิ่มเติมอีกแล้ว เพราะคำนวณทันทีเมื่อครบ 5 ครั้ง
  }

  // คำนวณสถานะจากน้ำหนักและค่า Std ปัจจุบัน โดยไม่พึ่งการอัปเดต state แบบ async
  const computeStatus = (w: number): 'RED' | 'YELLOW' | 'GREEN' | '' => {
    if (!isFinite(w) || w <= 0 || !isFinite(currentStd) || currentStd <= 0) return ''
    if (w < minVal || w > maxVal) return 'RED'
    if (w < dMinVal || w > dMaxVal) return 'YELLOW'
    return 'GREEN'
  }

  const submit = async () => {
    // ยืนยันบันทึกด้วยมือ (GREEN / YELLOW) หรือกรณี RED (ถ้ายังไม่ได้บันทึกอัตโนมัติและยังไม่สร้าง approval)
    if (submittingRef.current) return
    submittingRef.current = true
    const prevStatus = status
    const saved = allowRepeatAfterRedRef.current ? await reweighMeasurement(weight) : await saveMeasurement(weight)
    if (saved) {
      if (allowRepeatAfterRedRef.current) {
        // เคส reweigh หลัง Leader อนุมัติ
        const newStatus = saved.status
        if (newStatus === 'RED') {
          try {
            const r = await fetch(apiUrl(`/api/approvals/red-for-measurement/${saved.measurementId}`), {
              method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
            })
            if (r.ok) { const a = await r.json(); if (a?.id) setLeaderApprovalId(a.id) }
          } catch {}
          setLocked(true)
          setInfoMessage('ยังเป็น RED: สร้างคำขอ Leader ใหม่แล้ว กรุณารออนุมัติ')
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
        if (prevStatus === 'GREEN') {
          setInfoMessage('GREEN: บันทึกแล้ว')
        } else if (prevStatus === 'YELLOW') {
          setInfoMessage('YELLOW: บันทึกแล้ว')
        } else if (prevStatus === 'RED') {
          if (!leaderApprovalId && !redApprovalRequestedRef.current) {
            redApprovalRequestedRef.current = true
            try {
              const r = await fetch(apiUrl(`/api/approvals/red-for-measurement/${saved.measurementId}`), {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
              })
              if (r.ok) { const a = await r.json(); if (a?.id) setLeaderApprovalId(a.id) }
            } catch {}
          }
          setInfoMessage('RED: บันทึกแล้วและผูกกับ Approval')
        }
        allowRepeatAfterRedRef.current = false
        if (prevStatus !== 'RED') autoAdvanceBox()
      }
      setWeight(0)
      setStatus('')
      setCapTime('')
      setCapDate('')
      if (inputRef.current) inputRef.current.focus()
    }
    submittingRef.current = false
  }

  // บันทึกทันทีด้วยค่าน้ำหนักที่ส่งเข้ามาโดยตรง (เลี่ยงปัญหา state ยังไม่ทันอัปเดต)
  const submitWithWeight = async (w: number, statusNow: string) => {
    if (submittingRef.current) return
    submittingRef.current = true
    const saved = allowRepeatAfterRedRef.current ? await reweighMeasurement(w) : await saveMeasurement(w)
    if (saved) {
      if (allowRepeatAfterRedRef.current) {
        const newStatus = saved.status
        if (newStatus === 'RED') {
          try {
            const r = await fetch(apiUrl(`/api/approvals/red-for-measurement/${saved.measurementId}`), {
              method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
            })
            if (r.ok) { const a = await r.json(); if (a?.id) setLeaderApprovalId(a.id) }
          } catch {}
          setLocked(true)
          setInfoMessage('ยังเป็น RED: สร้างคำขอ Leader ใหม่แล้ว กรุณารออนุมัติ')
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
        if (statusNow === 'GREEN') {
          setInfoMessage('GREEN: บันทึกแล้ว')
        } else if (statusNow === 'YELLOW') {
          setInfoMessage('YELLOW: บันทึกแล้ว')
        } else if (statusNow === 'RED') {
          if (!leaderApprovalId && !redApprovalRequestedRef.current) {
            redApprovalRequestedRef.current = true
            try {
              const r = await fetch(apiUrl(`/api/approvals/red-for-measurement/${saved.measurementId}`), {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
              })
              if (r.ok) { const a = await r.json(); if (a?.id) setLeaderApprovalId(a.id) }
            } catch {}
          }
          setInfoMessage('RED: บันทึกแล้วและผูกกับ Approval')
        }
        allowRepeatAfterRedRef.current = false
        if (statusNow !== 'RED') autoAdvanceBox()
      }
      setWeight(0)
      setStatus('')
      setCapTime('')
      setCapDate('')
      // ล้าง manual edit timestamp เพื่อให้ระบบคำนวณอัตโนมัติได้อีกครั้ง
      manualEditTimestampRef.current = 0
      // รีเฟรชตารางหลังบันทึกสำเร็จ
      loadMeasurementHistory()
      if (inputRef.current) inputRef.current.focus()
    }
    submittingRef.current = false
  }

  const autoSaveCurrentMeasurement = async (w: number) => {
    const saved = await saveMeasurement(w)
    if (saved) {
      redAutoSavedRef.current = true
      setRedAutoSaved(true)
    }
  }

  const reweighMeasurement = async (w: number): Promise<SavedMeasurement | null> => {
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
          timestamp: ts.toISOString(),
          operatorName: currentUser.username,
        })
      })
      if (!resp.ok) {
        const msg = await resp.text()
        setInfoMessage(`ไม่สามารถชั่งซ้ำได้: ${msg}`)
        return null
      }
      const saved = await resp.json()
      return { measurementId: saved?.measurementId, status: saved?.status }
    } catch {
      return null
    }
  }

  const saveMeasurement = async (w: number): Promise<SavedMeasurement | null> => {
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
          timestamp: ts.toISOString(),
          operatorName: currentUser.username,
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
      // บันทึกลง session cache เพื่อป้องกันการย้อนกลับไปยังกล่องที่บันทึกแล้วโดยไม่ต้องเรียก exists ซ้ำ
      if (selected && scaleId && lotNo) {
        const key = `${selected.productCode}|${scaleId}|${lotNo}|${outerBox}|${innerOrder}`
        savedBoxesRef.current.add(key)
      }
      return { measurementId: saved?.measurementId, status: saved?.status }
    } catch {
      return null
    }
  }

  // ----- Lock/Unlock Step 1 -----
  const lockStep1 = () => {
    if (!selected || !scaleId || !lotNo) return
  setStep1Locked(true)
  setInfoMessage('กำลังตรวจสอบข้อมูลเดิมบนเครื่องชั่ง...')
    // ตรวจ Last ทันทีตาม Flow: ถ้ามีให้ตั้งไปที่กล่องถัดไป, ถ้าไม่มีตั้งเป็น 0001
    const pc = selected.productCode
    const sc = scaleId
    const lot = lotNo
    
    // 1. ตรวจสอบ Yellow Streak (Sync)
    ;(async () => {
      try {
        const rSt = await fetch(apiUrl(`/api/measurements/yellow-streak?productCode=${encodeURIComponent(pc)}&scaleId=${encodeURIComponent(sc)}&lotNo=${encodeURIComponent(lot)}`), { headers: getAuthHeaders() })
        if (rSt.ok) {
          const stObj = await rSt.json().catch(()=>null)
          if (stObj && stObj.count >= 5 && !yellowLockedAwaitQA && !qaApprovalId) {
            const rawWeights = Array.isArray(stObj.weights5) ? stObj.weights5 : (Array.isArray(stObj.weights) ? stObj.weights : stObj.weights3)
            const weights = Array.isArray(rawWeights) ? rawWeights.slice(0, 5).reverse() : []
            setYellowSeqWeights(weights)
            setYellowStreak(stObj.count)
            setLocked(true)
            setYellowLockedAwaitQA(true)
            setProposalWeights(weights)
            const proposedStdVal = weights.length > 0 ? +(weights.reduce((a: number, b: number) => a + b, 0) / weights.length).toFixed(3) : 0
            const draft = { productCode: pc, scaleId: sc, lotNo: lot, stdOld: currentStd, weights3: weights.slice(0, 3), weights5: weights, proposedStd: proposedStdVal }
            queuedQaDraftRef.current = draft
            const id = await requestQaApprovalWithStd(draft, currentUser.username)
            if (id) { setQaApprovalId(id); setInfoMessage(`เหลืองครบ 5 (Sync): ล็อกและสร้างคำขอ QA (ID: ${id})`) }
          }
        }
      } catch {}
    })()

    ;(async () => {
      try {
        const r = await fetch(apiUrl(`/api/measurements/last?productCode=${encodeURIComponent(pc)}&scaleId=${encodeURIComponent(sc)}&lotNo=${encodeURIComponent(lot)}`), { headers: getAuthHeaders() })
        if (!r.ok) { setInnerOrder('0001'); setInfoMessage('ไม่พบประวัติหรือสิทธิ์ไม่พอ: เริ่มต้นที่กล่อง 0001'); return }
        const data = await r.json().catch(()=>null)

        // ใช้ค่าที่ Backend คำนวณมาให้ (nextOuterBoxNumber, nextInnerBoxOrder)
        if (data && data.nextOuterBoxNumber && data.nextInnerBoxOrder) {
          const lastStatus = (data.status || '').toUpperCase()
          if (lastStatus === 'RED') {
            setOuterBox(data.outerBoxNumber || '001')
            setInnerOrder(data.innerBoxOrder || '0001')
            setStatus('RED')
            setLocked(true)
            setInfoMessage('พบ RED กล่องล่าสุด: ระบบจะล็อกและรอ Leader หรือ QA อนุมัติ')
            
            // Auto-create leader approval if missing
            if (!data.approvalId && data.id) {
               try {
                  const rr = await fetch(apiUrl(`/api/approvals/red-for-measurement/${data.id}`), {
                    method: 'POST', headers: { 'Content-Type': 'application/json', ...getAuthHeaders() }
                  })
                  if (rr.ok) {
                    const a = await rr.json().catch(()=>null)
                    if (a && a.id) setLeaderApprovalId(a.id)
                  }
               } catch {}
            } else if (data.approvalId) {
               setLeaderApprovalId(data.approvalId)
            }
          } else {
            setOuterBox(data.nextOuterBoxNumber)
            setInnerOrder(data.nextInnerBoxOrder)
            setInfoMessage(`พบข้อมูลก่อนหน้า: เดินหน้าชั่งกล่องถัดไป (Outer ${data.nextOuterBoxNumber}, Inner ${data.nextInnerBoxOrder})`)
          }
        } else 
        if (data && data.innerBoxOrder != null) {
          const innerStr = String(data.innerBoxOrder).trim().padStart(4, '0')
          const isNumeric = /^\d{4}$/.test(innerStr)
          const lastInner = isNumeric ? parseInt(innerStr, 10) : 0
          const lastStatus = (data.status || '').toUpperCase()
          if (!isNumeric) {
            // ข้าม barrier → เริ่มต้นที่ 0001 ใหม่ (หรือใช้ useEffect เพื่อคำนวณเพิ่มภายหลัง)
            setInnerOrder('0001')
            setInfoMessage('พบ barrier reset: เริ่มรอบใหม่กล่อง 0001')
            return
          }
          if (lastStatus !== 'RED') {
            const nextInner = Math.max(1, lastInner + 1)
            setInnerOrder(nextInner.toString().padStart(4, '0'))
            setInfoMessage('พบข้อมูลก่อนหน้า: เดินหน้าชั่งกล่องถัดไป')
          } else {
            setInnerOrder(String(lastInner).padStart(4, '0'))
            setInfoMessage('พบ RED กล่องล่าสุด: ระบบจะล็อกและรอ Leader หรือ QA อนุมัติ')
          }
        } else {
          setInnerOrder('0001')
          setInfoMessage('ไม่พบประวัติ: เริ่มต้นที่กล่อง 0001')
        }
      } catch {
        setInnerOrder('0001')
        setInfoMessage('ไม่สามารถดึงข้อมูลล่าสุด: เริ่มต้นที่กล่อง 0001')
      }
    })()

    // ตัดสินใจค่า Std สำหรับรอบนี้ตาม Flow (per-lot):
    // - ถ้ามีการ Apply Std ใน lot นี้ (barrier) → ใช้ค่านั้น
    // - มิฉะนั้น → ใช้ค่าตาราง (piece*qty)
    ;(async () => {
      try {
        const r = await fetch(apiUrl(`/api/measurements/std-source?productCode=${encodeURIComponent(pc)}&scaleId=${encodeURIComponent(sc)}&lotNo=${encodeURIComponent(lot)}`), { headers: getAuthHeaders() })
        if (r.ok) {
          const obj = await r.json().catch(()=>null)
          if (obj && typeof obj.std === 'number' && isFinite(obj.std)) {
            setCurrentStd(+obj.std)
          }
        }
      } catch {}
    })()
  }

  const unlockStep1 = () => {
    setStep1Locked(false)
    // รีเซ็ตค่าเพื่อบังคับให้ผู้ใช้ตรวจสอบใหม่
    setInnerOrder('0001')
  }

  const incInner = () => {
    const cur = parseInt(innerOrder, 10)
    const max = (selected?.innerBoxQuantity && selected.innerBoxQuantity > 0) ? selected.innerBoxQuantity : 9999
    
    // เพิ่มเลข Inner แบบต่อเนื่อง
    const nextInner = cur + 1
    setInnerOrder(String(nextInner).padStart(4, '0'))

    // ตรวจสอบว่าต้องขึ้น Outer ใหม่หรือไม่ (ถ้าเลขปัจจุบันหารลงตัวด้วย max แสดงว่าเต็มกล่องแล้ว)
    if (cur % max === 0) {
      setOuterBox(prev => String((parseInt(prev, 10) || 0) + 1).padStart(3, '0'))
      setInfoMessage(`ครบจำนวน ${max} ชิ้น: เริ่มกล่องนอกใหม่`)
    }
    // reset auto-save flag สำหรับชิ้นถัดไป
    redAutoSavedRef.current = false
    setRedAutoSaved(false)
  }
  const decInner = () => {
    const candidate = Math.max(1, parseInt(innerOrder, 10) - 1)
    // ตรวจว่ากล่องเป้าหมายมีบันทึกแล้วหรือยัง ถ้ามีแล้ว ห้ามย้อนกลับไปชั่ง
    const k = selected?.innerBoxQuantity && selected.innerBoxQuantity > 0 ? selected.innerBoxQuantity : 10
    const outerNum = Math.floor((candidate - 1) / k) + 1
    const outerStr = outerNum.toString().padStart(3, '0')
    const innerStr = candidate.toString().padStart(4, '0')
    if (!selected || !scaleId || !lotNo) {
      setInnerOrder(innerStr)
      return
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
          setInfoMessage('ย้อนกลับไปกล่องที่ยังไม่ถูกบันทึก')
        }
      })
      .catch(() => setInnerOrder(innerStr))
  }

  // เดินหน้า Outer/Inner อัตโนมัติหลังบันทึก (เฉพาะเมื่อไม่ RED และไม่ locked)
  const autoAdvanceBox = () => {
    if (locked) return
    // ใช้ Logic จาก Backend (refreshContext -> last?) เพื่อความถูกต้องแม่นยำตามจำนวนที่ชั่งจริง
    refreshLastBox()
  }

  const applyTriple = (wStr: string, tStr: string, dStr: string) => {
    if (yellowLockedAwaitQA || waitingForApply) {
      setCaptureInfo('ระบบถูกล็อก: รอ QA อนุญาต หรือรอ QA ยืนยันค่า Std ใหม่')
      return false
    }
    const w = parseFloat((wStr || '').replace(',', '.'))
    const nt = normalizeTime(tStr || '')
    const nd = normalizeDate(dStr || '')
    const errors: string[] = []
    if (!isFinite(w) || w <= 0) errors.push('น้ำหนักไม่ถูกต้อง')
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
        if ((autoSaveGY || collectingForStd) && (sNow === 'GREEN' || sNow === 'YELLOW') && isFinite(w) && w > 0) {
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
        if (selected && scaleId && lotNo && isFinite(weight) && weight > 0 && status && !(status === 'RED' && redAutoSaved)) {
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
    try {
      const r = await fetch(apiUrl(`/api/measurements/last?productCode=${encodeURIComponent(selected.productCode)}&scaleId=${encodeURIComponent(scaleId)}&lotNo=${encodeURIComponent(lotNo)}`), { headers: getAuthHeaders() })
      if (r.ok) {
        const data = await r.json().catch(()=>null)
        if (data && data.nextOuterBoxNumber && data.nextInnerBoxOrder) {
          setOuterBox(data.nextOuterBoxNumber)
          setInnerOrder(data.nextInnerBoxOrder)
          setInfoMessage(`รีเฟรชข้อมูลล่าสุดสำเร็จ (Outer ${data.nextOuterBoxNumber}, Inner ${data.nextInnerBoxOrder})`)
        } else if (data && data.innerBoxOrder) {
          // Fallback กรณี Backend รุ่นเก่า
          const lastInner = parseInt(data.innerBoxOrder, 10) || 0
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
    { label: 'ชั่งปกติ', active: !yellowLockedAwaitQA && !collectingForStd && !waitingForApply && status !== 'RED', color: '#1677ff' },
    { label: 'Yellow x5', active: yellowLockedAwaitQA, color: '#faad14' },
    { label: 'เก็บ 4-5', active: collectingForStd, color: '#d4b106' },
    { label: 'รอ Apply Std', active: waitingForApply, color: '#7cb305' },
    { label: 'RED รอ Leader', active: locked && status === 'RED', color: '#ff4d4f' }
  ]

  return (
    <Space direction="vertical" size={12} style={{ width: '100%', maxWidth: 980 }}>
      {/* Header: ชั่งน้ำหนัก + สถานะ workflow ด้านขวา */}
      <Card size="small" bodyStyle={{ padding: 10 }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12 }}>
          <Typography.Title level={5} style={{ margin:0 }}>ชั่งน้ำหนัก</Typography.Title>
          <Space wrap>
            {ribbonItems.filter(it => it.active).map(it => (
              <Tag key={it.label} color={it.color} style={{ padding: '6px 14px', fontWeight:700 }}>
                {it.label}
              </Tag>
            ))}
          </Space>
        </div>
      </Card>
      {/* 1) Product / Scale / Lot */}
      <Card size="small" title={<Space>1) Product / Scale / Lot <Tag color="geekblue">{currentUser.username}</Tag><Tag>{currentUser.role}</Tag></Space>}>
        <Space wrap>
          <Select
            style={{ minWidth: 320 }}
            value={selected?.productCode || ''}
            onChange={(v) => setSelected(products.find(p => p.productCode === v) || null)}
            disabled={step1Locked}
            options={products.map(p => ({ value: p.productCode, label: `${p.productCode} - ${p.productName}` }))}
          />
          <Select
            style={{ minWidth: 220 }}
            value={scaleId}
            onChange={(v) => setScaleId(v)}
            disabled={step1Locked}
            options={scales.map(s => ({ value: s.scaleId, label: `${s.scaleId}${s.scaleName ? ' - ' + s.scaleName : ''}` }))}
          />
          <Input placeholder="Lot No. (เช่น 20251103-A)" value={lotNo} onChange={e => setLotNo(e.target.value)} disabled={step1Locked} style={{ width: 220 }} />
          {!step1Locked ? (
            <Button type="primary" onClick={lockStep1} disabled={!selected || !scaleId || !lotNo}>ล็อค</Button>
          ) : (
            <Button onClick={unlockStep1}>แก้ไข</Button>
          )}
        </Space>
        {(products.length === 0 || scales.length === 0) && (
          <div style={{ marginTop: 8 }}>
            <Alert
              type="warning"
              showIcon
              message={masterErr || 'ยังไม่พบรายการสินค้า/เครื่องชั่ง — กรุณาเปิด backend แล้วกดรีเฟรช'}
              action={<Space><Button size="small" onClick={() => { setMasterErr(''); loadProducts(); loadScales(); }}>รีเฟรช</Button></Space>}
            />
          </div>
        )}
      </Card>

      {/* หมายเหตุ: ยุบหัวข้อ 2 และ 3 มาแสดงใน StickySummary แล้ว เพื่อลดความซ้ำซ้อน */}

      {/* ตารางแสดงประวัติการชั่ง */}
      {step1Locked && selected && scaleId && lotNo && (
        <Card size="small" title="ประวัติการชั่ง" extra={<Button size="small" onClick={loadMeasurementHistory}>รีเฟรช</Button>}>
          {measurementHistory.length > 0 ? (
            <MeasurementHistoryTable 
              data={measurementHistory} 
              currentOuter={outerBox} 
              currentInner={innerOrder} 
              innerBoxQuantity={selected.innerBoxQuantity || 10}
            />
          ) : (
            <Typography.Text type="secondary">ยังไม่มีข้อมูลการชั่ง</Typography.Text>
          )}
        </Card>
      )}

      {/* 2) สเปค */}
      <Card size="small" title="2) สเปค (ตรวจสอบให้ถูกต้อง)">
        {selected ? (
          <Space wrap style={{ fontSize:16 }}>
            {/* แสดงตามลำดับใหม่: Min, Dmin, Std, Dmax, Max */}
            <Tooltip title="น้ำหนักต่ำสุดที่ยังถือว่า GREEN">
              <Tag color="red" style={{ fontSize:15, padding:'4px 10px', fontWeight:600 }}>Min: {minVal}</Tag>
            </Tooltip>
            <Tooltip title="ขอบเขตเหลืองด้านล่าง">
              <Tag color="gold" style={{ fontSize:15, padding:'4px 10px', fontWeight:600 }}>Dmin: {dMinVal}</Tag>
            </Tooltip>
            <Tooltip title="ค่าเป้าหมาย (Std ปัจจุบัน)">
              <Tag color="green" style={{ fontSize:15, padding:'4px 10px', fontWeight:600 }}>Std: {currentStd}</Tag>
            </Tooltip>
            <Tooltip title="ขอบเขตเหลืองด้านบน">
              <Tag color="gold" style={{ fontSize:15, padding:'4px 10px', fontWeight:600 }}>Dmax: {dMaxVal}</Tag>
            </Tooltip>
            <Tooltip title="น้ำหนักสูงสุดที่ยังถือว่า GREEN">
              <Tag color="red" style={{ fontSize:15, padding:'4px 10px', fontWeight:600 }}>Max: {maxVal}</Tag>
            </Tooltip>
          </Space>
        ) : (
          <Typography.Text type="secondary">เลือกรายการผลิตก่อน</Typography.Text>
        )}
      </Card>

      {/* Modal สำหรับแก้ไขหมายเลขกล่อง */}
      <Modal
        title="แก้ไขหมายเลขกล่อง"
        open={editBoxModalVisible}
        onOk={handleConfirmEditBox}
        onCancel={() => { setEditBoxModalVisible(false); setModalErrorMessage(''); }}
        okText="ยืนยัน"
        cancelText="ยกเลิก"
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          {modalErrorMessage && (
            <Alert type="error" message={modalErrorMessage} showIcon style={{ marginBottom: 12 }} />
          )}
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Outer Box:</label>
            <Input
              value={editOuterValue}
              onChange={(e) => setEditOuterValue(e.target.value)}
              placeholder="เช่น 001"
              maxLength={3}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 600 }}>Inner Box:</label>
            <Input
              value={editInnerValue}
              onChange={(e) => setEditInnerValue(e.target.value)}
              placeholder="เช่น 0010"
              maxLength={4}
            />
          </div>
        </Space>
      </Modal>

      {/* Sticky summary: แสดงรายละเอียดข้อ 1 และ 2 ใกล้หัวข้อชั่งน้ำหนัก */}
      <StickySummary
        selected={selected}
        scaleId={scaleId}
        scales={scales}
        lotNo={lotNo}
        status={status}
        outerBox={outerBox}
        innerOrder={innerOrder}
        activeChips={ribbonItems.filter(it => it.active)}
        onEditBox={handleOpenEditBoxModal}
      />

      {/* 3) Scale Capture (ย้ายขึ้นมาก่อนเพื่อเตรียมยกเลิกกรอกเอง) */}
      <Card size="small" title="3) Scale Capture (ค่าจากเครื่องชั่ง)">
        <Space wrap align="start">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={captureEnabled} onChange={(e) => setCaptureEnabled(e.target.checked)} /> Enable
          </label>
          <Button onClick={() => { setBuffer(''); setLines([]); setCaptureInfo(''); setCapTime(''); setCapDate(''); setYellowCount(0); setLocked(false); setYellowStreak(0); setYellowSeqWeights([]); setCollectingForStd(false); setProposalWeights([]); setProposedStd(null); redAutoSavedRef.current=false; redApprovalRequestedRef.current=false; setRedAutoSaved(false); setLeaderApprovalId(null); }}>Clear</Button>
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
                  // ถ้าได้ครบ 3 บรรทัด ใช้ตามปกติ หากยังไม่ครบลองตรวจ single-line รวม
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
            style={{ width: 420 }}
          />
        </Space>
        <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
          รับค่า 3 บรรทัด: 1) น้ำหนัก 2) เวลา (เช่น 08:12 หรือ 08:12:31) 3) วันที่ (รูปแบบ MM-DD-YYYY เช่น 11-03-2025)
        </Typography.Paragraph>
        {(capTime || capDate) && (
          <Typography.Text type="secondary">Time: {capTime || '-'} | Date: {capDate || '-'} {captureInfo && `| ${captureInfo}`}</Typography.Text>
        )}
        {!capTime && !capDate && captureInfo && (
          <Typography.Text type="secondary">{captureInfo}</Typography.Text>
        )}
      </Card>

      {/* 4) น้ำหนัก (Manual override / จะยกเลิกในอนาคต) */}
      <Card size="small" title="4) Manual Override (กรณีพิมพ์เอง)" extra={<Typography.Text type="secondary">จะยกเลิกการใช้งานจริง</Typography.Text>}>
        <Space wrap>
          <InputNumber
            value={isFinite(weight) ? weight : undefined}
            onChange={(v) => {
              const nv = Number(v)
              setWeight(nv)
              if (isFinite(nv) && nv > 0) {
                setTimeout(() => classifyWeight(nv), 50)
              }
            }}
            placeholder="Manual weight"
            disabled={!step1Locked || !selected || !scaleId || !lotNo}
          />
          <Button type="primary" onClick={submit} disabled={!status || !selected || !scaleId || !lotNo || !isFinite(weight) || weight <= 0 || (status === 'RED' && redAutoSaved)}>
            บันทึก Manual
          </Button>
          <Checkbox checked={autoSaveGY} onChange={e => setAutoSaveGY(e.target.checked)}>Auto save GREEN/YELLOW</Checkbox>
          <Tag color={status === 'GREEN' ? 'green' : status === 'YELLOW' ? 'gold' : status === 'RED' ? 'red' : 'default'}>
            สถานะ: {status || '-'}
          </Tag>
        </Space>
        {infoMessage && <div style={{ marginTop: 8 }}><Alert type="success" message={infoMessage} showIcon /></div>}
        {errorMessage && <div style={{ marginTop: 8 }}><Alert type="error" message={errorMessage} showIcon /></div>}
      </Card>

      {/* ตำแหน่งกล่องถูกย้ายขึ้นไปด้านบนแล้ว */}
      {/* สรุปคำแนะนำแบบรวม (ลดความสับสน) */}
      {(() => {
        // คำแนะนำถัดไปสำหรับ OP แสดงทีละข้อความสำคัญเท่านั้น
        if (locked && status === 'RED') {
          const msg = leaderApprovalId
            ? `พบ RED: ระบบบันทึกอัตโนมัติแล้ว กรุณาแจ้ง Leader หรือ QA เพื่อปลดล็อก (Approval ID: ${leaderApprovalId})`
            : 'พบ RED: ระบบล็อก กรุณาแจ้ง Leader หรือ QA เพื่ออนุมัติและชั่งซ้ำที่กล่องเดิม'
          return <Alert type="error" showIcon message={msg} />
        }
        if (!locked && allowRepeatAfterRedRef.current && status === '') {
          return <Alert type="info" showIcon message="พร้อมชั่งซ้ำกล่องเดิมหลัง RED ได้รับการอนุมัติ กรุณากรอกน้ำหนักใหม่" />
        }
        if (proposedStd && waitingForApply) {
          return <Alert type="warning" showIcon message={`เหลืองครบ 5 ครั้ง: คำนวณ Std ใหม่ = ${proposedStd} | รอ QA ตรวจสอบและอนุมัติ (Approval ID: ${qaApprovalId ?? '-'})`} />
        }
        return null
      })()}
    </Space>
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
async function requestQaApprovalWithStd(ctx: { productCode: string, scaleId: string, lotNo: string, stdOld: number, weights5: number[], proposedStd: number }, requestedBy: string): Promise<number | null> {
  try {
    const payload = {
      productCode: ctx.productCode,
      scaleId: ctx.scaleId,
      lotNo: ctx.lotNo,
      stdOld: ctx.stdOld,
      weights5: ctx.weights5,
      proposedStd: ctx.proposedStd
    }
    
    console.log('🟡 Requesting QA approval with std:', payload) // Debug
    
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
        note: `YELLOW x5: product=${ctx.productCode}, scale=${ctx.scaleId}, lot=${ctx.lotNo}, stdOld=${ctx.stdOld} → proposedStd=${ctx.proposedStd}, จาก 5 กล่อง: ${JSON.stringify(ctx.weights5)}`,
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
  const mm = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (mm) {
    const hh = mm[1].padStart(2, '0')
    const mi = mm[2]
    const ss = (mm[3] ?? '00').padStart(2, '0')
    const H = parseInt(hh, 10)
    const M = parseInt(mi, 10)
    const S = parseInt(ss, 10)
    if (H >= 0 && H < 24 && M >= 0 && M < 60 && S >= 0 && S < 60) return `${hh}:${mi}:${ss}`
    return null
  }
  const mm2 = t.match(/^(\d{2})(\d{2})(\d{2})$/)
  if (mm2) {
    const [_, h, m, s2] = mm2
    const H = parseInt(h, 10), M = parseInt(m, 10), S = parseInt(s2, 10)
    if (H >= 0 && H < 24 && M >= 0 && M < 60 && S >= 0 && S < 60) return `${h}:${m}:${s2}`
  }
  return null
}

function normalizeDate(s: string): string | null {
  const t = s.trim()
  // Accept ISO yyyy-MM-dd (pass-through)
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) {
    const y = parseInt(iso[1], 10), m = parseInt(iso[2], 10), d = parseInt(iso[3], 10)
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return `${iso[1]}-${iso[2]}-${iso[3]}`
    return null
  }
  // Enforce MM-DD-YYYY (dash) from the scale input
  const mmddyyyy = t.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (mmddyyyy) {
    const mm = parseInt(mmddyyyy[1], 10)
    const dd = parseInt(mmddyyyy[2], 10)
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
  const timeMatch = txt.match(timeRe)
  if (!timeMatch || timeMatch.index == null) return null
  const t = timeMatch[1]
  const before = txt.slice(0, timeMatch.index).trim()
  const after = txt.slice(timeMatch.index + t.length).trim()
  // find date in 'after'
  // allow date anywhere after time: yyyy-MM-dd or MM-DD-YYYY
  const dateRe = /(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4})/
  const dMatch = after.match(dateRe)
  if (!dMatch || dMatch.index == null) return null
  const d = dMatch[1]
  const w = before
  return { w, t, d }
}

// Component สำหรับแสดงตารางประวัติการชั่ง
function MeasurementHistoryTable({ data, currentOuter, currentInner, innerBoxQuantity }: { 
  data: Array<{outer: string; inner: string; weight: number; std: number; status: string}>;
  currentOuter: string;
  currentInner: string;
  innerBoxQuantity: number;
}) {
  // จัดกลุ่มข้อมูลตาม Outer
  const groupedByOuter: Record<string, Array<{inner: string; weight: number; std: number; status: string}>> = {}
  data.forEach(item => {
    if (!groupedByOuter[item.outer]) {
      groupedByOuter[item.outer] = []
    }
    groupedByOuter[item.outer].push(item)
  })
  
  // เรียงลำดับ items ในแต่ละ Outer ตามหมายเลข Inner (เพื่อให้ 1, 2, 3, 5 เรียงต่อกัน)
  Object.keys(groupedByOuter).forEach(outer => {
    groupedByOuter[outer].sort((a, b) => parseInt(a.inner, 10) - parseInt(b.inner, 10))
  })
  
  // เรียงลำดับ Outer และกรองเฉพาะที่มีข้อมูลหรือเป็น Outer ปัจจุบัน
  const outerKeys = Object.keys(groupedByOuter)
    .filter(outer => outer !== '000') // ไม่แสดง Outer 000
    .sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  
  // เพิ่ม currentOuter ถ้ายังไม่มีในรายการ
  if (!outerKeys.includes(currentOuter) && currentOuter !== '000') {
    outerKeys.push(currentOuter)
    outerKeys.sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  }
  
  // แสดงทุก Outer ที่มีข้อมูล (รวมถึงที่ครบแล้ว) เพื่อให้เห็นประวัติการทำงาน
  const filteredOuters = outerKeys
  
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
                        <React.Fragment key={rowIdx}>
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
                              if (slotIndex >= displayCapacity) return <td key={colIdx} style={{ border: '1px solid #d9d9d9', backgroundColor: '#f0f0f0' }}></td>
                              
                              const item = items[slotIndex]
                              const isCurrent = (outer === currentOuter && item && item.inner === currentInner)
                              
                              return (
                                <td key={colIdx} style={{ 
                                  padding: '4px 8px', 
                                  border: '1px solid #d9d9d9', 
                                  textAlign: 'center',
                                  backgroundColor: item ? (item.status === 'GREEN' ? '#d9f7be' : item.status === 'YELLOW' ? '#fff7cd' : item.status === 'RED' ? '#ffccc7' : '#fff') : '#fff',
                                  fontWeight: isCurrent ? 700 : 400,
                                  borderWidth: isCurrent ? 2 : 1,
                                  borderColor: isCurrent ? '#1677ff' : '#d9d9d9',
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
                            }}>Weight</td>
                            {Array.from({ length: 10 }).map((_, colIdx) => {
                              const slotIndex = rowIdx * 10 + colIdx
                              if (slotIndex >= displayCapacity) return <td key={colIdx} style={{ border: '1px solid #d9d9d9', backgroundColor: '#f0f0f0' }}></td>
                              
                              const item = items[slotIndex]
                              
                              return (
                                <td key={colIdx} style={{ 
                                  padding: '4px 8px', 
                                  border: '1px solid #d9d9d9', 
                                  textAlign: 'center',
                                  backgroundColor: '#f9f9f9',
                                  fontVariantNumeric: 'tabular-nums',
                                  minWidth: 60,
                                  color: item ? 'inherit' : '#ccc'
                                }}>
                                  {item ? item.weight.toFixed(3) : '-'}
                                </td>
                              )
                            })}
                          </tr>
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
                              if (slotIndex >= displayCapacity) return <td key={colIdx} style={{ border: '1px solid #d9d9d9', backgroundColor: '#f0f0f0' }}></td>
                              const item = items[slotIndex]
                              return (
                                <td key={colIdx} style={{ padding: '4px 8px', border: '1px solid #d9d9d9', textAlign: 'center', backgroundColor: '#fff', fontSize: 11, color: '#888' }}>
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
