import React, { useEffect, useState, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { Table, Typography, Space, Tag, Divider, Statistic, Row, Col, Alert, Spin, Input, Button, Select, DatePicker, message, ConfigProvider, theme } from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import 'antd/dist/reset.css';
import './global.css';
import { getAuth, buildUrl } from './api';
// XLSX will be lazily loaded on export to keep bundle small

const { Title, Text } = Typography;

type LotSummary = {
  lotNo: string;
  total: number;
  red: number;
  yellow: number;
  green: number;
};

type LotDetailItem = {
  innerOrder?: string;
  outerBox?: string;
  weight: number;
  status: 'RED' | 'YELLOW' | 'GREEN' | 'BARRIER' | 'STD_CHANGE';
  std?: number;
  isBarrier?: boolean;
  timestamp?: string;
};

type LotEvent = {
  time: string;
  type: string;
  message?: string;
  outer?: string;
  inner?: string;
  weight?: number;
  stdUsed?: number;
  leader?: string;
  reweighStatus?: string;
  reweighWeight?: number;
  approvedBy?: string;
  allowedBy?: string;
  locationInner?: string;
  locationOuter?: string;
  reason?: string;
  oldStd?: number;
  newStd?: number;
  prevWeight?: number;
  payloadJson?: string;
};

type CurrentOuterData = {
  outerBox: string;
  capacity: number;
  packed: number;
  remaining: number;
  items: any[];
};

function getStatusColor(status: string) {
  if (status === 'GREEN') return 'green';
  if (status === 'YELLOW') return 'gold';
  if (status === 'RED') return 'red';
  if (status === 'STD_CHANGE') return 'purple';
  if (status === 'PENDING') return 'gold';
  if (status === 'APPROVED') return 'green';
  return 'default';
}

function StatusTag({ status }: Readonly<{ status: LotDetailItem['status'] }>) {
  switch (status) {
    case 'RED':
      return <Tag color="red">RED</Tag>;
    case 'YELLOW':
      return <Tag color="gold">YELLOW</Tag>;
    case 'BARRIER':
      return <Tag color="blue">BARRIER</Tag>;
    case 'STD_CHANGE':
      return <Tag color="purple">STD CHANGE</Tag>;
    default:
      return <Tag color="green">GREEN</Tag>;
  }
}

function ReportApp() {
  const [lotNo, setLotNo] = useState<string | null>(null);
  const [lotInput, setLotInput] = useState<string>('');
  const [summary, setSummary] = useState<LotSummary | null>(null);
  const [details, setDetails] = useState<LotDetailItem[]>([]);
  const [events, setEvents] = useState<LotEvent[]>([]);
  const [products, setProducts] = useState<Array<{ 
    productCode: string; 
    productName?: string;
    weightPerPiece?: number;
    tolerance?: number;
    standardWeight?: number;
    quantityPerMeasurement?: number;
  }>>([]);
  const [scales, setScales] = useState<Array<{ scaleId: string }>>([]);
  const [selProduct, setSelProduct] = useState<string>('');
  const [selScale, setSelScale] = useState<string>('');
  const [lots, setLots] = useState<Array<{ lotNo: string; start?: string; end?: string }>>([]);
  const [lotsLoading, setLotsLoading] = useState<boolean>(false);
  const [range, setRange] = useState<[Dayjs | null, Dayjs | null]>([dayjs().subtract(9, 'day'), dayjs()]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  // Debug UI: token presence/snippet for troubleshooting
  const [tokenPresent, setTokenPresent] = useState<boolean>(false);
  const [tokenSnippet, setTokenSnippet] = useState<string>('');

  useEffect(() => {
    try {
      const t = sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || localStorage.getItem('token') || null;
      if (t) {
        const s = String(t);
        const snippet = s.length > 20 ? `${s.slice(0,8)}...${s.slice(-6)}` : s;
        setTokenPresent(true);
        setTokenSnippet(snippet);
      } else {
        setTokenPresent(false);
        setTokenSnippet('');
      }
    } catch {}
  }, []);

  function processRedUnlocks(redUnlocks: any[], push: (row: LotEvent) => void, leaderMap: Map<string, any>) {
    if (!Array.isArray(redUnlocks)) return;
    for (const r of redUnlocks) {
      const reStatus = r.reweigh?.newStatus || '';
      const reWeight = r.reweigh?.newWeight ?? undefined;
      const msg = `Leader ${r.action_by || r.leader || ''} unlock RED at outer ${r.outer || ''} inner ${r.inner || ''}` +
        (reStatus ? ` reweigh:${reStatus}/${reWeight ?? ''}` : '') + (r.note ? ` (${r.note})` : '');
      push({ time: String(r.time || ''), type: 'LEADER_RED_UNLOCK', message: msg, outer: r.outer, inner: r.inner, leader: r.action_by || r.leader, reweighStatus: reStatus, reweighWeight: reWeight, reason: (r.note || r.reason), prevWeight: r.prevWeight });
      const key = `${r.outer || ''}|${r.inner || ''}`;
      leaderMap.set(key, r);
    }
  }

  function processRedEvents(redEvents: any[], push: (row: LotEvent) => void) {
    if (!Array.isArray(redEvents)) return;
    for (const r of redEvents) {
      const msg = `RED outer ${r.outer || ''} inner ${r.inner || ''} weight=${r.weight ?? ''}` + (r.note ? ` (${r.note})` : '') + (r.operator ? ` by ${r.operator}` : '');
      push({ time: String(r.time || ''), type: 'RED', message: msg, outer: r.outer, inner: r.inner, weight: r.weight, reason: (r.reason || r.note) });
    }
  }

  function processStdChanges(stdChanges: any[], push: (row: LotEvent) => void) {
    if (!Array.isArray(stdChanges)) return;
    for (const s of stdChanges) {
      const outVal = s.locationOuter || s.outer || s.outerBox || s.outerBoxNumber || '';
      const innVal = s.locationInner || s.inner || s.innerOrder || s.innerBoxOrder || '';
      const msg = `QA STD APPROVED ${s.oldStd ?? ''} → ${s.newStd ?? ''} by ${s.approvedBy || ''}` +
        (s.allowedBy ? ` (QA allow by ${s.allowedBy})` : '') +
        (innVal ? ` at inner ${innVal}` : '') +
        (s.reason ? ` reason: ${s.reason}` : '');
      push({
        time: String(s.time || s.approvedAt || ''),
        type: 'QA_STD_CHANGED',
        message: msg,
        approvedBy: s.approvedBy,
        allowedBy: s.allowedBy,
        locationInner: innVal,
        locationOuter: outVal,
        outer: outVal,
        inner: innVal,
        reason: s.reason,
        oldStd: s.oldStd,
        newStd: s.newStd,
        payloadJson: s.payloadJson
      });
    }
  }

  function processYellowEvents(yellowEvents: any[], push: (row: LotEvent) => void) {
    if (!Array.isArray(yellowEvents)) return;
    for (const y of yellowEvents) {
      const msg = `YELLOW outer ${y.outer || ''} inner ${y.inner || ''} weight=${y.weight ?? ''} std=${y.stdUsed ?? ''}` +
        (y.operator ? ` by ${y.operator}` : '') + (y.note ? ` (${y.note})` : '');
      push({ time: String(y.time || ''), type: 'YELLOW', message: msg, outer: y.outer, inner: y.inner, weight: y.weight, stdUsed: y.stdUsed, reason: (y.note || undefined) });
    }
  }

  function processDetailsForRed(detailsForRed: LotDetailItem[] | undefined, push: (row: LotEvent) => void, leaderMap: Map<string, any>) {
    const dArr = Array.isArray(detailsForRed) ? detailsForRed : [];
    for (const d of dArr) {
      const st = String((d as any).status || '').toUpperCase().trim();
      if (st === 'RED') {
        const key = `${d.outerBox || ''}|${d.innerOrder || ''}`;
        const leader = leaderMap.get(key);
        const resp = leader?.leader ? ` responsible=${leader.leader}` : '';
        const reweigh = leader?.reweigh ? ` reweigh=${leader.reweigh.newStatus || ''}/${leader.reweigh.newWeight ?? ''}` : '';
        const msg = `RED outer ${d.outerBox || ''} inner ${d.innerOrder || ''} weight=${d.weight ?? ''} std=${d.std ?? ''}${resp}${reweigh}`;
        push({ time: String((d as any).timestamp || ''), type: 'RED', message: msg, outer: d.outerBox, inner: d.innerOrder, weight: d.weight, stdUsed: d.std, leader: leader?.leader, reweighStatus: leader?.reweigh?.newStatus, reweighWeight: leader?.reweigh?.newWeight, reason: (leader?.note || undefined) });
      } else if (st === 'YELLOW') {
        const msg = `YELLOW outer ${d.outerBox || ''} inner ${d.innerOrder || ''} weight=${d.weight ?? ''} std=${d.std ?? ''}`;
        push({ time: String((d as any).timestamp || ''), type: 'YELLOW', message: msg, outer: d.outerBox, inner: d.innerOrder, weight: d.weight, stdUsed: d.std });
      }
    }
  }

  function flattenEvents(er: any, detailsForRed?: LotDetailItem[]): LotEvent[] {
    const out: LotEvent[] = [];
    const seen = new Set<string>();
    const push = (row: LotEvent) => {
      const k = `${row.type}|${row.outer || ''}|${row.inner || ''}|${row.time || ''}`;
      if (!seen.has(k)) { seen.add(k); out.push(row); }
    };
    const leaderMap = new Map<string, any>();
    try {
      if (!er) return out;
      if (Array.isArray(er)) {
        for (const e of er) push({ time: String(e.time || ''), type: e.type || '', message: e.message || '' });
        return out;
      }
      if (Array.isArray(er.events)) {
        for (const e of er.events) push({ time: String(e.time || ''), type: e.type || '', message: e.message || '' });
      }
      processRedUnlocks(er.redUnlocks, push, leaderMap);
      processRedEvents(er.redEvents, push);
      processStdChanges(er.stdChanges, push);
      processYellowEvents(er.yellowEvents, push);
    } catch {}
    try {
      processDetailsForRed(detailsForRed, push, leaderMap);
    } catch {}
    return out;
  }

  // Load events and ensure QA STD change is present by falling back to std-switch-check
  async function loadEventsWithFallback(q: URLSearchParams, tok: string | undefined, detailsItems: LotDetailItem[]): Promise<LotEvent[]> {
    try {
      const eventsRes = await getAuth(`/api/reports/lot-events?${q.toString()}`, tok);
      let ev = flattenEvents(eventsRes, detailsItems);
      const hasQa = ev.some(e => e.type === 'QA_STD_CHANGED');
      if (!hasQa) {
        try {
          const sc = await getAuth(`/api/reports/std-switch-check?${q.toString()}`, tok);
          const newStd = sc?.newStd;
          if (newStd != null) {
            const switchInner: string | undefined = sc?.switchInner || undefined;
            let time = '';
            if (switchInner) {
              const dd = detailsItems.find(d => d.innerOrder === switchInner);
              time = String((dd as any)?.timestamp || '');
            }
            const msg = `QA STD APPROVED (inferred) newStd=${newStd}${switchInner ? ` at inner ${switchInner}` : ''}`;
            ev = [...ev, { time, type: 'QA_STD_CHANGED', message: msg, approvedBy: '(inferred)', locationInner: switchInner }];
          }
        } catch {}
      }
      // Sort events by inner box number (ascending), then time
      try {
        const toNum = (s: any) => {
          const v = String(s || '').trim();
          if (!v) return Number.MAX_SAFE_INTEGER;
          const m = /\d+/.exec(v);
          return m ? Number.parseInt(m[0], 10) : Number.MAX_SAFE_INTEGER;
        };
        ev = ev.slice().sort((a, b) => {
          const ia = toNum(a.inner);
          const ib = toNum(b.inner);
          if (ia !== ib) return ia - ib;
          const oa = toNum(a.outer);
          const ob = toNum(b.outer);
          if (oa !== ob) return oa - ob;
          const ta = dayjs(a.time).isValid() ? dayjs(a.time).valueOf() : Number.MAX_SAFE_INTEGER;
          const tb = dayjs(b.time).isValid() ? dayjs(b.time).valueOf() : Number.MAX_SAFE_INTEGER;
          return ta - tb;
        });
      } catch {}
      return ev;
    } catch {
      return flattenEvents(null, detailsItems);
    }
  }

  async function loadReportData(p: string, s: string, l: string) {
    setLoading(true);
    setError(null);
    try {
      const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || localStorage.getItem('token') || undefined;
      const q = new URLSearchParams({ productCode: p, scaleId: s, lotNo: l });
      
      const [detailsRes, curOutRes] = await Promise.all([
        getAuth(`/api/reports/lot-details?${q.toString()}`, token),
        getAuth(`/api/measurements/current-outer?${q.toString()}`, token).catch(() => null)
      ]);

      // Normalize history items to ensure outerBox/innerOrder are present
      let historyItems = (detailsRes?.items || []).map((i: any) => ({
        ...i,
        outerBox: i.outerBox || i.outerBoxNumber,
        innerOrder: i.innerOrder || i.innerBoxOrder
      }));

      const ev = await loadEventsWithFallback(q, token, historyItems);
      const summaryRes2 = detailsRes?.summary || { lotNo: l };
      
      setSummary(summaryRes2);
      
      // Merge currentOuter items into details if missing (เพื่อให้รายงานละเอียดแสดงครบทุกกล่อง)
      let allItems = [...historyItems];
      if (curOutRes && Array.isArray(curOutRes.items)) {
         const existing = new Set(allItems.map((i:any) => `${i.outerBox}-${i.innerOrder}`));
         const fromCur = curOutRes.items.filter((i:any) => !existing.has(`${i.outerBoxNumber}-${i.innerBoxOrder}`)).map((i:any) => ({
            innerOrder: i.innerBoxOrder,
            outerBox: i.outerBoxNumber,
            weight: i.weight,
            status: i.status,
            std: i.std || 0, 
            timestamp: i.timestamp,
            operator: i.operatorName
         }));
         allItems = [...allItems, ...fromCur];
      }
      setDetails(allItems);
      setEvents(ev);
    } catch (e: any) {
      const msg = String(e?.message || 'โหลดรายงานล้มเหลว');
      if (msg.startsWith('HTTP 403')) {
        setError('เข้าถึงถูกปฏิเสธ (403): กรุณาเข้าสู่ระบบหรือระบุ token');
      } else {
        setError(msg);
      }
      setSummary(null);
      setDetails([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  // Debug: log token in storage and URL (run once)
  useEffect(() => {
    const url = new URL(globalThis.location.href);
    try {
      const st = sessionStorage.getItem('authToken');
      const lt = localStorage.getItem('authToken');
      const qpToken = url.searchParams.get('token');
      const hash = globalThis.location.hash || '';
      const hashTokenMatch = /[#&](?:token|t)=([^&]+)/.exec('#' + hash.replace(/^#/, ''));
      const hashToken = hashTokenMatch ? decodeURIComponent(hashTokenMatch[1]) : null;
      // eslint-disable-next-line no-console
      console.log('[DEBUG] authToken session:', st, 'local:', lt, 'qp:', qpToken, 'hash:', hashToken);
      // ถ้า sessionStorage ไม่มี token แต่ localStorage มี ให้ copy ไปใส่ sessionStorage ด้วย
      if (!st && lt) {
        sessionStorage.setItem('authToken', lt);
      }
    } catch {}
  }, []);

  // ถ้าไม่มี token เลย ให้แสดง error ชัดเจน (run once)
  useEffect(() => {
    function getToken() {
      try { return localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || localStorage.getItem('token') || undefined; } catch { return undefined }
    }
    const tok = getToken();
    if (!tok) {
      setError('ไม่พบ token สำหรับยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่ หรือเข้าผ่านเมนูหลักของระบบ');
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const paramLot = url.searchParams.get('lot');
    setLotNo(paramLot);
    setLotInput(paramLot || '');
    // Token handling: prefer sessionStorage; accept ?token= or #token=/#t=
    const qpToken = url.searchParams.get('token');
    const hash = globalThis.location.hash || '';
    const hashTokenMatch = /[#&](?:token|t)=([^&]+)/.exec('#' + hash.replace(/^#/, ''));
    const hashToken = hashTokenMatch ? decodeURIComponent(hashTokenMatch[1]) : null;
    // One-time token (OTK) support
    const hashOtkMatch = /[#&](?:otk)=([^&]+)/.exec('#' + hash.replace(/^#/, ''));
    const otk = hashOtkMatch ? decodeURIComponent(hashOtkMatch[1]) : null;
    const token = qpToken || hashToken || null;
    if (token) {
      try { sessionStorage.setItem('authToken', token); } catch {}
      // Clean token from URL for safety
      url.searchParams.delete('token');
      globalThis.history.replaceState({}, '', url.toString().split('#')[0]);
    }
    // Exchange OTK for short-lived JWT
    (async () => {
      if (!token && otk) {
        try {
          const res = await fetch(buildUrl('/api/reports/otk/exchange?otk=' + encodeURIComponent(otk)), { method: 'POST', credentials: 'include' });
          if (res.ok) {
            const js = await res.json();
            const t = js?.token;
            if (t) sessionStorage.setItem('authToken', t);
            // Clean otk from hash
            globalThis.history.replaceState({}, '', globalThis.location.href.split('#')[0]);
            // After token is ready, refetch lots and lot details if provided
            // Load masters first
            await loadMasters();
            await fetchLots(range?.[0] || null, range?.[1] || null);
            if (paramLot && selProduct && selScale) {
              loadReportData(selProduct, selScale, paramLot);
            }
          }
        } catch {}
      }
    })();

    function getToken() {
      try { return sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || localStorage.getItem('token') || undefined; } catch { return undefined }
    }

    // ถ้าไม่มี token เลย ให้แสดง error ชัดเจน (run immediately inside this effect)
    {
      const tok = getToken();
      if (!tok) {
        setError('ไม่พบ token สำหรับยืนยันตัวตน กรุณาเข้าสู่ระบบใหม่ หรือเข้าผ่านเมนูหลักของระบบ');
      }
    }

    // Load masters then lots; defer auto-load until selections ready
    (async () => {
      await loadMasters();
      await fetchLots(range?.[0] || null, range?.[1] || null);
      setLoading(false);
      if (paramLot && selProduct && selScale) {
        loadReportData(selProduct, selScale, paramLot);
      } else {
        setError('โปรดเลือกสินค้า เครื่องชั่ง และ Lot เพื่อแสดงรายงาน');
      }
    })();
  }, []);

  async function loadMasters() {
    try {
      const tok = localStorage.getItem('authToken') || sessionStorage.getItem('authToken') || localStorage.getItem('token') || undefined;
      const [pr, sr] = await Promise.allSettled([
        getAuth('/api/products', tok),
        getAuth('/api/scales', tok)
      ]);
      if (pr.status === 'fulfilled' && Array.isArray(pr.value)) setProducts(pr.value);
      if (sr.status === 'fulfilled' && Array.isArray(sr.value)) setScales(sr.value);
      // Auto-select if only one option
      if (!selProduct && pr.status === 'fulfilled' && Array.isArray(pr.value) && pr.value.length === 1) setSelProduct(pr.value[0].productCode);
      if (!selScale && sr.status === 'fulfilled' && Array.isArray(sr.value) && sr.value.length === 1) setSelScale(sr.value[0].scaleId);
    } catch {}
  }

  async function fetchLots(start?: Dayjs | null, end?: Dayjs | null) {
    try {
      // If product/scale not selected, reset lots and loading state safely
      if (!selProduct || !selScale) { setLots([]); setLotsLoading(false); return; }
      setLotsLoading(true);
      const qs = new URLSearchParams();
      qs.set('productCode', selProduct);
      qs.set('scaleId', selScale);
      const token = ((): string | undefined => {
        try { return sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || localStorage.getItem('token') || undefined } catch { return undefined }
      })();
      // Backend lot-summary requires productCode & scaleId
      const res = await getAuth(`/api/reports/lot-summary?${qs.toString()}`, token);
      const arr = Array.isArray(res) ? res : (res.rows || res.list || []);
      let mapped = arr
        .map((r: any) => ({ lotNo: r.lotNo || r.lot || r.id || '', start: r.start, end: r.end }))
        .filter((x: any) => x.lotNo);
      // Client-side filter by selected date range
      if (start && end) {
        const s = start.toDate().getTime();
        const e = end.toDate().getTime();
        mapped = mapped.filter((x: any) => {
          const t = x.end ? new Date(x.end).getTime() : NaN;
          return isFinite(t) ? (t >= s && t <= e) : true;
        });
      }
      setLots(mapped);
    } catch (e: any) {
      const msg = String(e?.message || 'โหลดรายการ Lot ไม่สำเร็จ');
      setLots([]);
      if (msg.startsWith('HTTP 401') || msg.startsWith('HTTP 403')) {
        setError('ไม่มีสิทธิ์เข้าถึงรายงาน (401/403): โปรดเปิดผ่านปุ่ม Report หรือแนบ #otk= / ?token=');
      } else {
        setError(msg);
      }
    } finally {
      setLotsLoading(false);
    }
  }

  const columns = useMemo(() => [
    { title: 'กล่องนอก', dataIndex: 'outerBox', key: 'outerBox', width: 100, render: (v: any, r: LotDetailItem) => (r.outerBox || '-') },
    { title: 'กล่องใน', dataIndex: 'innerOrder', key: 'innerOrder', width: 100, render: (v: any, r: LotDetailItem) => (r.innerOrder || '-') },
    { title: 'นน. (g)', dataIndex: 'weight', key: 'weight', width: 100 },
    { title: 'STD ใช้', dataIndex: 'std', key: 'std', width: 100 },
    { title: 'สถานะ', dataIndex: 'status', key: 'status', width: 120, render: (_: any, rec: LotDetailItem) => <StatusTag status={rec.status} /> },
  ], []);

  // Compute thresholds and min/max based on selected product and loaded details
  const headerStats = useMemo(() => {
    const p = products.find(x => x.productCode === selProduct);
    const wpp = p?.weightPerPiece || 0;
    const tol = p?.tolerance || 0;
    // Prefer std from details (currentStd captured per item), fallback to product standard or table std
    const stdFromDetails = details.length ? (details[0] as any).std || null : null;
    const baseStd = (stdFromDetails != null)
      ? Number(stdFromDetails)
      : (p?.standardWeight && p.standardWeight > 0
          ? p.standardWeight
          : (wpp * (p?.quantityPerMeasurement || 0)));
    const dmin = baseStd - tol;
    const dmax = baseStd + tol;
    const min = details.length ? Math.min(...details.map(d => (d.weight ?? Number.POSITIVE_INFINITY) as number)) : undefined;
    const max = details.length ? Math.max(...details.map(d => (d.weight ?? Number.NEGATIVE_INFINITY) as number)) : undefined;
    return { baseStd, dmin, dmax, min, max };
  }, [products, selProduct, details]);

  // Deduplicate by inner box and count final status per inner
  const innerSummary = useMemo(() => {
    // Count by unique inner boxes; severity precedence: RED > YELLOW > GREEN
    if (!details.length && !events.length) return { total: 0, red: 0, yellow: 0, green: 0 };
    
    // Map inner -> { final: string, everRed: boolean }
    const uniqueMap = new Map<string, { final: string; everRed: boolean }>();
    
    // 1. Current status from details
    for (const item of details) {
      const inner = String(item.innerOrder || '');
      if (!inner || item.status === 'BARRIER') continue;
      
      const entry = uniqueMap.get(inner) || { final: '', everRed: false };
      entry.final = item.status;
      if (item.status === 'RED') entry.everRed = true;
      uniqueMap.set(inner, entry);
    }

    // 2. Historical status from events (Leader Unlocks = confirmed RED occurrence)
    for (const e of events) {
      if (e.type === 'LEADER_RED_UNLOCK' || e.type === 'RED') {
        const inner = String(e.inner || '');
        if (!inner) continue;
        
        const entry = uniqueMap.get(inner) || { final: '', everRed: false };
        entry.everRed = true;
        uniqueMap.set(inner, entry);
      }
    }

    let red = 0, yellow = 0, green = 0;
    uniqueMap.forEach(v => {
      if (v.final === 'GREEN') green++;
      else if (v.final === 'YELLOW') yellow++;
      
      if (v.everRed) red++;
    });
    
    return { total: uniqueMap.size, red, yellow, green };
  }, [details, events]);

  async function handleExportExcel() {
    try {
      const XLSX = await import('xlsx');
      const lot = lotNo || summary?.lotNo || '';
      const prod = products.find(x => x.productCode === selProduct);
      const headerRows = [
        { Field: 'Product', Value: selProduct + (prod?.productName ? ' - ' + prod.productName : '') },
        { Field: 'Scale', Value: selScale || '' },
        { Field: 'Lot', Value: lot },
        { Field: 'Min', Value: headerStats.min ?? '' },
        { Field: 'dMin', Value: headerStats.dmin ?? '' },
        { Field: 'Std', Value: headerStats.baseStd ?? '' },
        { Field: 'dMax', Value: headerStats.dmax ?? '' },
        { Field: 'Max', Value: headerStats.max ?? '' },
        { Field: 'Total Inners', Value: innerSummary.total },
        { Field: 'Red', Value: innerSummary.red },
        { Field: 'Yellow', Value: innerSummary.yellow },
        { Field: 'Green', Value: innerSummary.green },
      ];
      const detailsArr = Array.isArray(details) ? details : [];
      const timelineRows = detailsArr.map(d => ({
        Outer: d.outerBox || '',
        Inner: d.innerOrder || '',
        Weight_g: d.weight,
        StdUsed: d.std,
        Status: d.status,
      }));
      const eventsArr = Array.isArray(events) ? events : flattenEvents(events, detailsArr);
      const eventRows = eventsArr.map(e => ({
        Time: e.time,
        Type: e.type,
        Outer: e.outer || '',
        Inner: e.inner || '',
        Weight: e.weight ?? '',
        StdUsed: e.stdUsed ?? '',
        Leader: e.leader || '',
        ReweighStatus: e.reweighStatus || '',
        ReweighWeight: e.reweighWeight ?? '',
        QAApprovedBy: e.approvedBy || '',
        QAAllowedBy: e.allowedBy || '',
        QALocationInner: e.locationInner || '',
        Reason: e.reason || '',
        Message: e.message || ''
      }));
      const wb = XLSX.utils.book_new();
      const shSummary = XLSX.utils.json_to_sheet(headerRows);
      const shTimeline = XLSX.utils.json_to_sheet(timelineRows);
      const shEvents = XLSX.utils.json_to_sheet(eventRows);
      XLSX.utils.book_append_sheet(wb, shSummary, 'Summary');
      XLSX.utils.book_append_sheet(wb, shTimeline, 'Timeline');
      XLSX.utils.book_append_sheet(wb, shEvents, 'Events');
      const fname = `Report_${selProduct}_${selScale}_${(lot||'').replaceAll(/[^\w-]+/g, '')}.xlsx`;
      XLSX.writeFile(wb, fname);
      message.success('ส่งออก Excel เรียบร้อย');
    } catch (e) {
      const msg = (e as any)?.message || String(e);
      message.error('Export Excel ล้มเหลว: ' + msg);
    }
  }

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>รายงาน Lot</Title>
      <div style={{ marginBottom: 12 }}>
        <small style={{ color: tokenPresent ? 'green' : 'red' }}>
          Token: {tokenPresent ? tokenSnippet : '(none)'} {tokenPresent ? '' : '- please login or attach #otk= / ?token='}
        </small>
      </div>
      <Space style={{ marginBottom: 12 }} wrap>
        {/* เลือกสินค้า ก่อน */}
        <Select
          showSearch
          placeholder="เลือกสินค้า"
          style={{ minWidth: 220 }}
          value={selProduct || undefined}
          options={products.map(p => ({ value: p.productCode, label: p.productCode + (p.productName ? ' - ' + p.productName : '') }))}
          onChange={(v) => { setSelProduct(v); fetchLots(range?.[0] || null, range?.[1] || null); }}
        />
        {/* แล้วเลือกเครื่องชั่ง */}
        <Select
          showSearch
          placeholder="เลือกเครื่องชั่ง"
          style={{ minWidth: 180 }}
          value={selScale || undefined}
          options={scales.map(s => ({ value: s.scaleId, label: s.scaleId }))}
          onChange={(v) => { setSelScale(v); fetchLots(range?.[0] || null, range?.[1] || null); }}
        />
        {/* จากนั้นเลือกช่วงวันที่ */}
        <DatePicker.RangePicker
          value={range}
          onChange={(vals) => {
            const v = vals as [Dayjs | null, Dayjs | null];
            setRange(v);
            fetchLots(v?.[0] || null, v?.[1] || null);
          }}
          disabled={!selProduct || !selScale}
        />
        <Select
          showSearch
          placeholder="เลือก Lot จากช่วงวันที่"
          style={{ minWidth: 260 }}
          value={lotNo || undefined}
          onChange={(value) => {
            setLotNo(value);
            setLotInput(value);
            const u = new URL(globalThis.location.href);
            u.searchParams.set('lot', value);
            globalThis.history.replaceState({}, '', u.toString());
            // Auto-load smoothly
            if (selProduct && selScale) {
              loadReportData(selProduct, selScale, value);
            }
          }}
          loading={lotsLoading}
          notFoundContent={lotsLoading ? 'กำลังโหลด...' : 'No data'}
          options={lots.map((l) => ({ value: l.lotNo, label: l.lotNo }))}
          disabled={!selProduct || !selScale}
        />
        <Input
          placeholder="ระบุ Lot เช่น 20251210-03"
          style={{ width: 240 }}
          value={lotInput}
          onChange={(e) => setLotInput(e.target.value)}
          onPressEnter={() => {
            if (!lotInput.trim()) return;
            const next = lotInput.trim();
            setLotNo(next);
            const u = new URL(globalThis.location.href);
            u.searchParams.set('lot', next);
            globalThis.history.replaceState({}, '', u.toString());
            // trigger load
            if (selProduct && selScale) {
              loadReportData(selProduct, selScale, next);
            }
          }}
        />
        <Button type="primary" onClick={() => {
          if (!lotInput.trim()) return;
          const next = lotInput.trim();
          setLotNo(next);
          const u = new URL(globalThis.location.href);
          u.searchParams.set('lot', next);
          globalThis.history.replaceState({}, '', u.toString());
          if (selProduct && selScale) {
            loadReportData(selProduct, selScale, next);
          }
        }}>แสดงรายงาน</Button>
        <Button onClick={handleExportExcel} disabled={!details.length}>Export Excel</Button>
      </Space>
      <div style={{ height: 8 }} />
      {loading && <Spin />}
      {error && <Alert type="error" message={error} />}

      {Boolean(summary || details.length) && (
        <>
          <Space direction="vertical" size="small">
            <Text>Lot: <b>{lotNo || summary?.lotNo || '-'}</b></Text>
            <Text>สินค้า: <b>{selProduct}</b> {(() => { const p = products.find(x=>x.productCode===selProduct); return p?.productName?`- ${p.productName}`:'' })()}</Text>
            {selScale && <Text>เครื่องชั่ง: <b>{selScale}</b></Text>}
            <Space wrap>
              {headerStats.min !== undefined && <Tag color="blue">Min: {headerStats.min?.toFixed?.(2)}</Tag>}
              <Tag color="orange">dMin: {headerStats.dmin?.toFixed?.(2)}</Tag>
              <Tag>STD: {headerStats.baseStd?.toFixed?.(2)}</Tag>
              <Tag color="orange">dMax: {headerStats.dmax?.toFixed?.(2)}</Tag>
              {headerStats.max !== undefined && <Tag color="blue">Max: {headerStats.max?.toFixed?.(2)}</Tag>}
            </Space>
          </Space>
          <Divider />
          <Row gutter={16}>
            <Col><Statistic title="ทั้งหมด" value={innerSummary.total} /></Col>
            <Col><Statistic title="แดง" value={innerSummary.red} valueStyle={{ color: 'red' }} /></Col>
            <Col><Statistic title="เหลือง" value={innerSummary.yellow} valueStyle={{ color: 'gold' }} /></Col>
            <Col><Statistic title="เขียว" value={innerSummary.green} valueStyle={{ color: 'green' }} /></Col>
          </Row>
          <Divider />
        </>
      )}

      {!!details.length && (() => {
        const stdChanges = events.filter(e => e.type === 'QA_STD_CHANGED')
        const redUnlocks = events.filter(e => e.type === 'LEADER_RED_UNLOCK')
        
        // จัดกลุ่มตาม Outer และรวมข้อมูล Events
        const groupedByOuter: Record<string, any[]> = {}
        
        // Helper: normalize outer/inner เป็นตัวเลข
        const normalizeNum = (s: any): number => {
          if (!s) return 0
          const v = String(s).trim().replace(/^0+/, '') // ตัด leading zeros
          return Number.parseInt(v, 10) || 0
        }
        
        // สร้าง lookup map สำหรับ events ใช้ตัวเลขบริสุทธิ์
        const eventsMap = new Map<string, any[]>()
        events.forEach(e => {
          if (e.outer || e.inner) {
            const outerNum = normalizeNum(e.outer)
            const innerNum = normalizeNum(e.inner)
            const key = `${outerNum}|${innerNum}`
            if (!eventsMap.has(key)) eventsMap.set(key, [])
            eventsMap.get(key)?.push(e)
          }
        })
        
        console.log('Events Map:', Array.from(eventsMap.keys())) // Debug
        
        details.forEach(item => {
          const outer = item.outerBox || '000'
          if (!groupedByOuter[outer]) groupedByOuter[outer] = []
          
          // ใช้ข้อมูล approval ที่มาจาก backend โดยตรง (ถูกเพิ่มใน row แล้ว)
          const approvalType = (item as any).approvalType || ''
          const approvalReason = (item as any).approvalReason || ''
          const approvalBy = (item as any).approvalBy || ''
          const approvalAt = (item as any).approvalAt || ''
          
          groupedByOuter[outer].push({
            ...item,
            operator: (item as any).operator || 'Operator',
            approvalBy: approvalBy,
            approvalType: approvalType,
            reason: approvalReason,
            weightTime: (item as any).timestamp || '',
            approveTime: approvalAt
          })
        })

        // เพิ่มประวัติ RED (Leader Unlock) เข้าไปในรายการของ Outer นั้นๆ เพื่อให้เห็นประวัติและนับจำนวนได้ถูกต้อง
        events.filter(e => e.type === 'LEADER_RED_UNLOCK').forEach(e => {
          const outer = e.outer || '000'
          if (!groupedByOuter[outer]) groupedByOuter[outer] = []
          
          groupedByOuter[outer].push({
            innerOrder: e.inner,
            outerBox: e.outer,
            weight: e.prevWeight, // น้ำหนักที่แดง
            std: e.stdUsed,       // อาจจะไม่มีใน event แต่ไม่เป็นไร
            status: 'RED',        // บังคับแสดงเป็น RED
            operator: '-',        // ไม่ทราบชื่อ Operator จาก event นี้
            approvalBy: e.leader,
            approvalType: 'Leader Unlock',
            reason: e.reason,
            weightTime: null,     // ไม่ทราบเวลาชั่งที่แน่นอนจาก event นี้ (ทราบแต่เวลา approve)
            approveTime: e.time,
            isHistory: true       // flag สำหรับ styling ถ้าต้องการ
          })
        })

        // เพิ่มประวัติการเปลี่ยน Std (QA STD Change) เข้าไปในรายการของ Outer นั้นๆ
        events.filter(e => e.type === 'QA_STD_CHANGED').forEach(e => {
          let outer = e.outer
          let inner = e.inner

          // 1. Try to extract from payloadJson if available (Most accurate source from Approvals table)
          if (e.payloadJson) {
            try {
              const p = JSON.parse(e.payloadJson);
              if (p.outerBox) outer = p.outerBox;
              if (p.innerOrder) inner = p.innerOrder;
            } catch {}
          }

          // ถ้าไม่มี outer ใน event ให้ลองค้นหาจาก details โดยใช้ inner
          if (!outer && inner) {
            // Use numeric comparison for robustness (e.g. "0010" vs "10")
            const targetInner = Number.parseInt(String(inner), 10);
            const match = details.find(d => Number.parseInt(String(d.innerOrder || '0'), 10) === targetInner)
            if (match) outer = match.outerBox
          }

          // Fallback: Match by time if location is still missing (for legacy data or missing link)
          if (!outer && e.time) {
             const evtTime = new Date(e.time).getTime();
             let closest: LotDetailItem | null = null;
             let minDiff = Number.MAX_VALUE;
             for (const d of details) {
                if (d.timestamp) {
                   const dt = new Date(d.timestamp).getTime();
                   const diff = Math.abs(dt - evtTime);
                   if (diff < 7200000 && diff < minDiff) { // within 2 hours
                      minDiff = diff;
                      closest = d;
                   }
                }
             }
             if (closest) {
                outer = closest.outerBox;
                if (!inner) inner = closest.innerOrder;
             }
          }

          // ถ้ายังหาไม่เจอ ให้ใช้ '000' (หรืออาจจะเป็นกล่องล่าสุดถ้ามี logic อื่น)
          outer = outer || '000'

          if (!groupedByOuter[outer]) groupedByOuter[outer] = []
          
          groupedByOuter[outer].push({
            innerOrder: inner,
            outerBox: outer,
            weight: null as any,  // ไม่มีการชั่งน้ำหนักใน event นี้
            std: e.newStd,        // แสดงค่า Std ใหม่
            status: 'STD_CHANGE', // สถานะใหม่สำหรับแสดงผล
            operator: '-',
            approvalBy: e.approvedBy,
            approvalType: 'QA STD Change',
            reason: e.reason,
            weightTime: null,
            approveTime: e.time,
            isHistory: true
          })
        })
        
        // เรียงลำดับ Inner และเวลา (เพื่อให้ประวัติ RED อยู่ก่อนหรือหลังตามเวลาจริง)
        Object.keys(groupedByOuter).forEach(outer => {
          groupedByOuter[outer].sort((a, b) => {
            const ia = Number.parseInt(a.innerOrder, 10) || 0
            const ib = Number.parseInt(b.innerOrder, 10) || 0
            if (ia !== ib) return ia - ib
            const ta = a.weightTime || a.approveTime || ''
            const tb = b.weightTime || b.approveTime || ''
            return ta.localeCompare(tb)
          })
        })
        
        const outerKeys = Object.keys(groupedByOuter).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10))
        const outerColors = ['#FFE4B5', '#FFD4A3', '#FFC891', '#FFBC7F']
        
        return (
          <>
            {/* แสดง Leader RED Unlocks */}
            {redUnlocks.length > 0 && (
              <>
                <Title level={4}>การปลดล็อค RED (Leader/QA)</Title>
                <Table
                  size="small"
                  dataSource={redUnlocks}
                  rowKey={(_, idx) => `red-${idx}`}
                  pagination={false}
                  bordered
                  style={{ marginBottom: 24 }}
                  columns={[
                    { title: 'ตำแหน่ง', render: (_: any, r: any) => `Outer ${r.outer||'-'} Inner ${r.inner||'-'}` },
                    { title: 'น้ำหนักเดิม', dataIndex: 'prevWeight', width: 100, render: (v: any) => v?.toFixed?.(3) || '-' },
                    { title: 'ผลชั่งซ้ำ', render: (_: any, r: any) => {
                        if (!r.reweighStatus && !r.reweighWeight) return '-'
                        return <span><Tag color={getStatusColor(r.reweighStatus)}>{r.reweighStatus}</Tag> {r.reweighWeight}</span>
                    }},
                    { title: 'Approver', dataIndex: 'leader', width: 120, render: (v: string) => v || '-' },
                    { title: 'เหตุผล', dataIndex: 'reason', render: (v: string) => v || '-' },
                    { title: 'เวลา', dataIndex: 'time', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('th-TH') : '-' }
                  ]}
                />
              </>
            )}

            {/* แสดง QA Std Changes */}
            {stdChanges.length > 0 && (
              <>
                <Title level={4}>การเปลี่ยน Std โดย QA</Title>
                <Table
                  size="small"
                  dataSource={stdChanges}
                  rowKey={(_, idx) => `std-${idx}`}
                  pagination={false}
                  bordered
                  style={{ marginBottom: 24 }}
                  columns={[
                    { title: 'Apply Location', dataIndex: 'locationOuter', width: 120, render: (v: string, record: any) => {
                      const outer = record.locationOuter || record.outer || '-'
                      const inner = record.locationInner || record.inner || '-'
                      return `Outer ${outer}, Inner ${inner}`
                    }},
                    { title: 'Old Std', dataIndex: 'oldStd', width: 100, render: (v: any) => v?.toFixed?.(3) || '-' },
                    { title: 'New Std', dataIndex: 'newStd', width: 100, render: (v: any) => v?.toFixed?.(3) || '-' },
                    { title: 'Approver', dataIndex: 'approvedBy', width: 120, render: (v: string) => v || 'QA' },
                    { title: 'เหตุผล', dataIndex: 'reason', render: (_: any, record: any) => {
                      return record.reason || record.message || '-'
                    }},
                    { title: 'เวลา', dataIndex: 'time', width: 160, render: (v: string) => v ? new Date(v).toLocaleString('th-TH') : '-' }
                  ]}
                />
              </>
            )}
            
            <Title level={4}>รายงานละเอียด (ทุกกล่อง)</Title>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
              {outerKeys.map((outer, idx) => {
                const items = groupedByOuter[outer]
                
                // คำนวณจำนวนกล่องจริง (Unique Inner)
                // Green/Yellow: นับตามสถานะล่าสุด (Final Status) เพื่อดูยอดผลผลิต
                // Red: นับตามประวัติ (Ever Red) เพื่อดูว่าเคยมีปัญหาหรือไม่ (นับซ้อนได้)
                const uniqueMap = new Map<string, { final: string; everRed: boolean }>()
                items.forEach(item => {
                  if (item.status === 'STD_CHANGE' || item.status === 'BARRIER') return
                  const inner = String(item.innerOrder || '').trim()
                  if (!inner) return
                  
                  const entry = uniqueMap.get(inner) || { final: '', everRed: false }
                  // อัปเดตสถานะล่าสุด (รายการเรียงตามเวลาแล้ว)
                  entry.final = item.status
                  if (item.status === 'RED') entry.everRed = true
                  uniqueMap.set(inner, entry)
                })
                
                let greenCount = 0, yellowCount = 0, redCount = 0
                uniqueMap.forEach(v => {
                  // นับตามสถานะสุดท้าย
                  if (v.final === 'GREEN') greenCount++
                  else if (v.final === 'YELLOW') yellowCount++
                  
                  // นับประวัติแดงแยกต่างหาก (ถ้าเคยแดง ให้นับด้วย)
                  if (v.everRed) redCount++
                })
                const totalCount = uniqueMap.size

                const bgColor = outerColors[idx % outerColors.length]
                
                return (
                  <div key={outer} style={{ 
                    width: '100%',
                    padding: 16, 
                    border: '3px solid #333', 
                    borderRadius: 12,
                    backgroundColor: bgColor,
                    boxShadow: '0 4px 8px rgba(0,0,0,0.15)',
                    marginBottom: 16
                  }}>
                    {/* หัวกล่อง Outer */}
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
                        <Tag color="blue" style={{ margin: 0, fontSize: 12 }}>Total: {totalCount}</Tag>
                      </Space>
                    </div>
                    
                    {/* ตารางแบบละเอียด */}
                    <Table 
                      size="small" 
                      dataSource={items} 
                      rowKey={(r, i) => `${r.innerOrder || i}`}
                      pagination={false}
                      bordered
                      scroll={{ x: 1200 }}
                      columns={[
                        { 
                          title:'Inner', 
                          dataIndex:'innerOrder', 
                          width: 70,
                          fixed: 'left' as const,
                          align: 'center' as const,
                          render: (v:any) => <strong>{String(v || '').padStart(4, '0')}</strong>
                        },
                        { 
                          title:'นน.(g)', 
                          dataIndex:'weight', 
                          width: 80,
                          align: 'right' as const,
                          render: (v:any) => (typeof v === 'number' && Number.isFinite(v)) ? v.toFixed(3) : '-'
                        },
                        { 
                          title:'Std', 
                          dataIndex:'std', 
                          width: 80,
                          align: 'right' as const,
                          render: (v:any) => (typeof v === 'number' && Number.isFinite(v)) ? v.toFixed(3) : '-'
                        },
                        { 
                          title:'Operator', 
                          dataIndex:'operator', 
                          width: 90,
                          align: 'center' as const
                        },
                        { 
                          title:'สถานะ', 
                          dataIndex:'status', 
                          width: 80,
                          align: 'center' as const,
                          render: (_:any, rec:any) => <StatusTag status={rec.status} /> 
                        },
                        { 
                          title:'Approval', 
                          dataIndex:'approvalBy', 
                          width: 100,
                          render: (v:string) => v || '-'
                        },
                        { 
                          title:'Type', 
                          dataIndex:'approvalType', 
                          width: 70,
                          render: (v:string) => v || '-'
                        },
                        { 
                          title:'Reason', 
                          dataIndex:'reason', 
                          width: 100,
                          render: (v:string) => v || '-'
                        },
                        { 
                          title:'Weight Time', 
                          dataIndex:'weightTime', 
                          width: 160,
                          render: (v:string) => v ? new Date(v).toLocaleString('th-TH', { 
                            month: '2-digit', 
                            day: '2-digit', 
                            year: 'numeric',
                            hour: '2-digit', 
                            minute: '2-digit' 
                          }) : '-'
                        },
                        { 
                          title:'Approve Time', 
                          dataIndex:'approveTime', 
                          width: 160,
                          render: (v:string) => v ? new Date(v).toLocaleString('th-TH', { 
                            month: '2-digit', 
                            day: '2-digit', 
                            year: 'numeric',
                            hour: '2-digit', 
                            minute: '2-digit' 
                          }) : '-'
                        },
                      ]}
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
            <Divider />
          </>
        )
      })()}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(
  <ConfigProvider theme={{ algorithm: theme.defaultAlgorithm }}>
    <ReportApp />
  </ConfigProvider>
);
