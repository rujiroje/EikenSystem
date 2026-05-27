import { useRef, useState } from 'react'
import { Button, Space, Alert, Typography, Tooltip } from 'antd'
import { UploadOutlined, DownloadOutlined } from '@ant-design/icons'
import { apiUrl } from '../../api'

interface CsvImportProps {
  token: string
  importUrl: string
  sampleFilename: string
  sampleContent: string
  onSuccess: () => void
}

interface ImportResult {
  imported: number
  skipped: number
  errors: string[]
}

export function CsvImport({ token, importUrl, sampleFilename, sampleContent, onSuccess }: CsvImportProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const downloadSample = () => {
    const bom = '﻿'
    const blob = new Blob([bom + sampleContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = sampleFilename
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    setLoading(true)
    setResult(null)
    setUploadError(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const r = await fetch(apiUrl(importUrl), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      })
      const data = await r.json()
      if (!r.ok) {
        setUploadError(data?.error ?? `HTTP ${r.status}`)
      } else {
        setResult(data as ImportResult)
        if (data.imported > 0) onSuccess()
      }
    } catch (err: any) {
      setUploadError(err?.message ?? 'เกิดข้อผิดพลาด')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <Space wrap>
        <Tooltip title="Download ไฟล์ตัวอย่าง CSV เพื่อดู format แล้วแก้ไขข้อมูล">
          <Button icon={<DownloadOutlined />} onClick={downloadSample}>
            ดาวน์โหลด Template CSV
          </Button>
        </Tooltip>

        <Tooltip title="นำเข้าข้อมูลจากไฟล์ CSV (ถ้า ID ซ้ำจะ update ข้อมูลเดิม)">
          <Button
            icon={<UploadOutlined />}
            type="primary"
            loading={loading}
            onClick={() => fileRef.current?.click()}
          >
            Import CSV
          </Button>
        </Tooltip>

        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </Space>

      {uploadError && (
        <Alert type="error" showIcon message="Import ไม่สำเร็จ" description={uploadError} style={{ marginTop: 8 }} closable onClose={() => setUploadError(null)} />
      )}

      {result && (
        <Alert
          type={result.errors.length > 0 ? 'warning' : 'success'}
          showIcon
          style={{ marginTop: 8 }}
          closable
          onClose={() => setResult(null)}
          message={`Import เสร็จ: นำเข้า ${result.imported} รายการ, ข้าม ${result.skipped} รายการ`}
          description={
            result.errors.length > 0 ? (
              <div>
                <Typography.Text type="warning" strong>พบข้อผิดพลาด {result.errors.length} รายการ:</Typography.Text>
                <ul style={{ margin: '4px 0 0', paddingLeft: 20, maxHeight: 120, overflowY: 'auto' }}>
                  {result.errors.map((e, i) => <li key={i} style={{ fontSize: 12 }}>{e}</li>)}
                </ul>
              </div>
            ) : undefined
          }
        />
      )}
    </div>
  )
}
