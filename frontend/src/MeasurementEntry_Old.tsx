import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Input, Select, Button, Card, Table, Tag, Row, Col, Statistic, message as antdMessage, Modal, InputNumber, Space, Typography, Alert } from 'antd';
import { getAuth, postAuth } from './api';

const { Title, Text } = Typography;

type Product = {
  productCode: string;
  productName?: string;
  innerBoxQuantity?: number; // Capacity
};

type Scale = {
  scaleId: string;
};

type CurrentOuterData = {
  outerBox: string;
  capacity: number;
  packed: number;
  remaining: number;
  items: any[];
};

function StatusTag({ status }: { status: string }) {
  let color = 'default';
  if (status === 'GREEN') color = 'green';
  if (status === 'YELLOW') color = 'gold';
  if (status === 'RED') color = 'red';
  return <Tag color={color}>{status}</Tag>;
}

function MeasurementEntry() {
  const [products, setProducts] = useState<Product[]>([]);
  const [scales, setScales] = useState<Scale[]>([]);
  const [loading, setLoading] = useState(false);

  // Selection State
  const [selProduct, setSelProduct] = useState<string>('');
  const [selScale, setSelScale] = useState<string>('');
  const [lotNo, setLotNo] = useState<string>('');
  const [isLocked, setIsLocked] = useState<boolean>(false);

  // Weighing State
   const [outerBox, setOuterBox] = useState<string>('001');
  const [innerOrder, setInnerOrder] = useState<string>('0001');
  const [weight, setWeight] = useState<number | null>(null);

  // Display State
  const [currentOuter, setCurrentOuter] = useState<CurrentOuterData | null>(null);
  const [lastStatus, setLastStatus] = useState<string | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const activeRequestRef = useRef<string>('');
  const weightInputRef = useRef<any>(null);

  // Load Masters on mount
  useEffect(() => {
    loadMasters();
  }, []);

  async function loadMasters() {
    try {
      const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || undefined;
      const [pr, sr] = await Promise.all([
        getAuth('/api/products', token),
        getAuth('/api/scales', token)
      ]);
      setProducts(pr || []);
      setScales(sr || []);
    } catch (e) {
      antdMessage.error('ไม่สามารถโหลดข้อมูลสินค้า/เครื่องชั่งได้');
    }
  }

  async function refreshContext(requestId?: string) {
    try {
      // ถ้า requestId ไม่ตรงกับปัจจุบัน แสดงว่าเป็น Request เก่า ให้ยกเลิกการทำงาน
      if (requestId && activeRequestRef.current !== requestId) return;

      setLoading(true);
      const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || undefined;
      const cleanLot = lotNo.trim();
      // Add timestamp to prevent caching
      const q = new URLSearchParams({ productCode: selProduct, scaleId: selScale, lotNo: cleanLot, _t: Date.now().toString() });

      // 1. Fetch LAST record (Critical for inputs)
      let lastRes = null;
      try {
        lastRes = await getAuth(`/api/measurements/last?${q.toString()}`, token);
      } catch (e) {
        console.error("getLast failed", e);
        setDebugInfo('Error: Failed to load last record. Check connection.');
        // Do NOT reset inputs on error to prevent "reverting"
      }

      // Check request ID again after await
      if (requestId && activeRequestRef.current !== requestId) return;

      if (lastRes) {
        // Check if history was found (explicit flag OR implied by presence of next numbers)
        const hasHistory = lastRes.foundHistory === true || (lastRes.foundHistory === undefined && !!lastRes.nextOuterBoxNumber);

        if (hasHistory && lastRes.nextOuterBoxNumber) {
          setOuterBox(lastRes.nextOuterBoxNumber);
          setInnerOrder(lastRes.nextInnerBoxOrder || '0001');
          setDebugInfo(`Debug: ${lastRes.debugMessage || '-'} | Next: ${lastRes.nextOuterBoxNumber}/${lastRes.nextInnerBoxOrder}`);
        } else {
          // Only reset if explicitly a new lot (no history found) AND we are not just refreshing an active session
          if (!isLocked) {
             setOuterBox('001');
             setInnerOrder('0001');
          }
          setDebugInfo('Debug: No history found (New Lot).');
        }
      }

      // 2. Fetch others in parallel (Non-critical)
      const [curRes, histRes] = await Promise.all([
        getAuth(`/api/measurements/current-outer?${q.toString()}`, token).catch(() => null),
        getAuth(`/api/measurements/history?${q.toString()}`, token).catch(() => [])
      ]);

      if (requestId && activeRequestRef.current !== requestId) return;

      setCurrentOuter(curRes);
      setHistory(Array.isArray(histRes) ? histRes : []);

    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const handleLock = () => {
    if (!selProduct || !selScale || !lotNo) {
      antdMessage.warning('กรุณาระบุข้อมูลให้ครบถ้วน');
      return;
    }
    const cleanLot = lotNo.trim();
    if (!cleanLot) return;

    setIsLocked(true);
    // สร้าง ID สำหรับ Session การทำงานนี้
    const requestId = `${selProduct}-${selScale}-${cleanLot}-${Date.now()}`;
    activeRequestRef.current = requestId;
    refreshContext(requestId);
  };

  const handleUnlock = () => {
    setIsLocked(false);
    setCurrentOuter(null);
    setHistory([]);
    setDebugInfo('');
    // ไม่ต้องเคลียร์ Lot/Product/Scale เพื่อให้แก้ไขได้ง่าย
  };

  async function handleSubmit() {
    if (!selProduct || !selScale || !lotNo || weight === null) {
      antdMessage.warning('กรุณากรอกข้อมูลให้ครบถ้วน');
      return;
    }

    try {
      setLoading(true);
      const token = sessionStorage.getItem('authToken') || localStorage.getItem('authToken') || undefined;
      const body = {
        productCode: selProduct,
        scaleId: selScale,
        lotNo: lotNo.trim(),
        outerBox,
        innerOrder,
        weight
      };

      const res = await postAuth('/api/measurements', body, token);

      // แจ้งเตือนตามสถานะ
      setLastStatus(res.status);
      if (res.status === 'RED') {
        Modal.error({
          title: 'RED ALERT',
          content: `น้ำหนัก ${weight} ผิดปกติ (RED)! กรุณาแจ้งหัวหน้างาน`,
          okText: 'รับทราบ'
        });
      } else if (res.status === 'YELLOW') {
        antdMessage.warning('ค่าอยู่ในเกณฑ์เฝ้าระวัง (YELLOW)');
      } else {
        antdMessage.success('บันทึกสำเร็จ (GREEN)');
      }

      // เคลียร์น้ำหนัก
      setWeight(null);

      // โหลดข้อมูลใหม่ (จะคำนวณเลขกล่องถัดไปให้อัตโนมัติ)
      await refreshContext(activeRequestRef.current);

      // Focus กลับไปที่ช่องน้ำหนัก
      setTimeout(() => {
        if (weightInputRef.current) {
          weightInputRef.current.focus();
        }
      }, 100);

    } catch (e: any) {
      antdMessage.error(e.message || 'บันทึกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <Title level={2}>บันทึกการชั่ง (Operator)</Title>
      
      {/* ส่วนเลือกข้อมูลหลัก */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={16}>
          <Col span={8}>
            <Text strong>สินค้า</Text>
            <Select
              showSearch
              style={{ width: '100%' }}
              placeholder="เลือกสินค้า"
              value={selProduct || undefined}
              onChange={setSelProduct}
              options={products.map(p => ({ value: p.productCode, label: `${p.productCode} ${p.productName || ''}` }))}
              disabled={isLocked}
            />
          </Col>
          <Col span={8}>
            <Text strong>เครื่องชั่ง</Text>
            <Select
              style={{ width: '100%' }}
              placeholder="เลือกเครื่องชั่ง"
              value={selScale || undefined}
              onChange={setSelScale}
              options={scales.map(s => ({ value: s.scaleId, label: s.scaleId }))}
              disabled={isLocked}
            />
          </Col>
          <Col span={8}>
            <Text strong>Lot No.</Text>
            <Input
              id="lotNoInput"
              placeholder="ระบุ Lot No."
              value={lotNo}
              onChange={e => setLotNo(e.target.value)}
              disabled={isLocked}
            />
          </Col>
        </Row>
        <Row justify="end" style={{ marginTop: 16 }}>
          <Space>
            {!isLocked ? (
              <Button type="primary" onClick={handleLock}>เริ่มงาน (Lock)</Button>
            ) : (
              <Button danger onClick={handleUnlock}>จบงาน / แก้ไข (Unlock)</Button>
            )}
          </Space>
        </Row>
      </Card>

      {isLocked && (
      <Row gutter={24}>
        {/* ฝั่งซ้าย: ฟอร์มบันทึก */}
        <Col xs={24} md={10}>
          <Card title="ข้อมูลการชั่ง" bordered={false} style={{ height: '100%' }}>
            <Space direction="vertical" style={{ width: '100%' }} size="large">
              <Row gutter={16}>
                <Col span={12}>
                  <Text>Outer Box</Text>
                  <Input id="outerBoxInput" value={outerBox} onChange={e => setOuterBox(e.target.value)} />
                </Col>
                <Col span={12}>
                  <Text>Inner Order</Text>
                  <Input id="innerOrderInput" value={innerOrder} onChange={e => setInnerOrder(e.target.value)} />
                </Col>
              </Row>
              
              <div>
                <Text style={{ fontSize: 16 }}>น้ำหนัก (g)</Text>
                <InputNumber
                  id="weightInput"
                  style={{ width: '100%', fontSize: 24, height: 50 }}
                  value={weight}
                  onChange={val => setWeight(val)}
                  onPressEnter={handleSubmit}
                  ref={weightInputRef}
                  autoFocus
                />
              </div>

              <Button type="primary" block size="large" onClick={handleSubmit} loading={loading}>
                บันทึก (Enter)
              </Button>
            </Space>
          </Card>
        </Col>

        {/* ฝั่งขวา: ตารางสถานะกล่องปัจจุบัน */}
        <Col xs={24} md={14}>
          {currentOuter && (
            <Card title={`สถานะกล่องปัจจุบัน (Outer: ${currentOuter.outerBox})`} style={{ height: '100%' }}>
              <Row gutter={16} style={{ marginBottom: 16, textAlign: 'center' }}>
                <Col span={8}><Statistic title="ความจุ (Capacity)" value={currentOuter.capacity} /></Col>
                <Col span={8}><Statistic title="ชั่งแล้ว (Packed)" value={currentOuter.packed} /></Col>
                <Col span={8}><Statistic title="เหลืออีก (Remaining)" value={currentOuter.remaining} valueStyle={{ color: currentOuter.remaining <= 5 ? 'red' : undefined }} /></Col>
              </Row>
              <Table
                dataSource={currentOuter.items}
                rowKey={(r) => r.measurementId || Math.random().toString()}
                size="small"
                pagination={false}
                scroll={{ y: 300 }}
                columns={[
                  { title: 'Outer', dataIndex: 'outerBoxNumber', render: (v: any) => v || currentOuter.outerBox },
                  { title: 'Inner', dataIndex: 'innerBoxOrder' },
                  { title: 'Weight', dataIndex: 'weight' },
                  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag status={v} /> },
                  { title: 'Time', dataIndex: 'timestamp', render: (v) => v ? new Date(v).toLocaleTimeString('th-TH') : '' },
                ]}
              />
            </Card>
          )}
        </Col>
      </Row>
      )}

      {isLocked && (
      <Row gutter={24} style={{ marginTop: 24 }}>
        <Col span={24}>
          {!!debugInfo && <Alert message={debugInfo} type="info" showIcon style={{ marginBottom: 16 }} />}
          <Card title={`ประวัติการชั่งทั้งหมด (History) [${history.length} รายการ]`}>
            <Table
              dataSource={history}
              rowKey={(r) => r.measurementId ? String(r.measurementId) : Math.random().toString()}
              size="small"
              columns={[
                { title: 'Outer', dataIndex: 'outerBoxNumber' },
                { title: 'Inner', dataIndex: 'innerBoxOrder' },
                { title: 'Weight', dataIndex: 'weight' },
                { title: 'Status', dataIndex: 'status', render: (v: any) => <StatusTag status={v} /> },
                { title: 'Time', dataIndex: 'timestamp', render: (v: any) => v ? new Date(v).toLocaleString('th-TH') : '' },
                { title: 'Operator', dataIndex: 'operatorName' },
              ]}
            />
          </Card>
        </Col>
      </Row>
      )}
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<MeasurementEntry />);