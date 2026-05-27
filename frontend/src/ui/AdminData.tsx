import { useState } from 'react'
import { Tabs, Button, Alert, Space } from 'antd'
import { ToolOutlined } from '@ant-design/icons'
import { UsersAdmin } from './admin/UsersAdmin'
import { ProductsAdmin } from './admin/ProductsAdmin'
import { ScalesAdmin } from './admin/ScalesAdmin'
import { MachinesAdmin } from './admin/MachinesAdmin'
import { apiUrl } from '../api'

export function AdminData({ token }: Readonly<{ token: string }>) {
  const [schemaLoading, setSchemaLoading] = useState(false)
  const [schemaResult, setSchemaResult] = useState<{ applied?: string[]; errors?: string[]; message?: string; error?: string } | null>(null)

  const ensureSchema = async () => {
    setSchemaLoading(true)
    setSchemaResult(null)
    try {
      const r = await fetch(apiUrl('/api/admin/schema/ensure-columns'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      setSchemaResult(await r.json())
    } catch (e: any) {
      setSchemaResult({ error: e?.message ?? 'เกิดข้อผิดพลาด' })
    } finally {
      setSchemaLoading(false)
    }
  }

  return (
    <div style={{ background: '#fff', padding: 24, borderRadius: 8 }}>
      {/* Schema health check — กดครั้งเดียวหลัง deploy เพื่อให้แน่ใจว่า DB columns ครบ */}
      <div style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<ToolOutlined />} onClick={ensureSchema} loading={schemaLoading} size="small">
            ตรวจสอบ/แก้ไข DB Schema
          </Button>
          <span style={{ fontSize: 12, color: '#999' }}>กดเมื่อ field ใหม่ไม่แสดงค่าหลัง import (เช่น cleanerTime)</span>
        </Space>
        {schemaResult && (
          <Alert
            style={{ marginTop: 8 }}
            type={
              schemaResult.error || (schemaResult.errors?.length ?? 0) > 0
                ? 'error'
                : schemaResult.applied?.length
                  ? 'success'
                  : 'info'
            }
            showIcon
            closable
            onClose={() => setSchemaResult(null)}
            message={schemaResult.error ?? schemaResult.message ?? 'เสร็จแล้ว'}
            description={
              schemaResult.applied?.length ? (
                <div>
                  <b>เพิ่มคอลัมน์แล้ว ({schemaResult.applied.length}):</b>
                  <ul style={{ margin: '4px 0 0', paddingLeft: 20 }}>
                    {schemaResult.applied.map(s => <li key={s} style={{ fontFamily: 'monospace', fontSize: 12 }}>{s}</li>)}
                  </ul>
                  <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>Import ข้อมูลใหม่อีกครั้งเพื่อให้ข้อมูลเข้าคอลัมน์ที่เพิ่งสร้าง</div>
                </div>
              ) : schemaResult.errors?.length ? (
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {schemaResult.errors.map(e => <li key={e} style={{ fontSize: 12 }}>{e}</li>)}
                </ul>
              ) : undefined
            }
          />
        )}
      </div>

      <Tabs
        defaultActiveKey="users"
        items={[
          { key: 'users',    label: 'จัดการผู้ใช้ (Users)',       children: <UsersAdmin token={token} /> },
          { key: 'products', label: 'จัดการสินค้า (Products)',     children: <ProductsAdmin token={token} /> },
          { key: 'scales',   label: 'จัดการเครื่องชั่ง (Scales)', children: <ScalesAdmin token={token} /> },
          { key: 'machines', label: 'จัดการเครื่องจักร (M/C)',    children: <MachinesAdmin token={token} /> },
        ]}
        type="card"
      />
    </div>
  )
}
