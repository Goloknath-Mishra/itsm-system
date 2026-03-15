import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiFetch, buildApiUrl } from '../api'
import { useAuth } from '../auth/useAuth'
import type { Asset, AssetTransaction } from '../itsmTypes'
import { Badge, Button, Input, Panel, Textarea } from '../components/ui'

type Detector = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue: string }>>
}

type BarcodeDetectorConstructor = new (opts?: { formats?: string[] }) => Detector

function getBarcodeDetector(): BarcodeDetectorConstructor | null {
  const w = window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }
  return w.BarcodeDetector ?? null
}

export function AssetScannerPage() {
  const auth = useAuth()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [manual, setManual] = useState('')
  const [detected, setDetected] = useState<string | null>(null)
  const [asset, setAsset] = useState<Asset | null>(null)
  const [tx, setTx] = useState<AssetTransaction[]>([])
  const [notes, setNotes] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const canScan = useMemo(() => Boolean(getBarcodeDetector()), [])

  const start = useCallback(async () => {
    setError(null)
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      setStream(s)
      if (videoRef.current) {
        videoRef.current.srcObject = s
        await videoRef.current.play()
      }
    } catch {
      setError('Camera permission denied or unavailable')
    }
  }, [])

  const stop = useCallback(() => {
    for (const t of stream?.getTracks() ?? []) t.stop()
    setStream(null)
  }, [stream])

  const lookup = useCallback(
    async (tag: string) => {
      if (!auth.accessToken) return
      setIsBusy(true)
      setError(null)
      try {
        const a = await apiFetch<Asset>(`/api/assets/by-tag/?asset_tag=${encodeURIComponent(tag)}`, { token: auth.accessToken })
        setAsset(a)
        const history = await apiFetch<AssetTransaction[]>(`/api/assets/${a.id}/transactions/`, { token: auth.accessToken })
        setTx(history)
      } catch {
        setAsset(null)
        setTx([])
        setError('Asset not found')
      } finally {
        setIsBusy(false)
      }
    },
    [auth.accessToken],
  )

  useEffect(() => {
    if (!auth.user) return
    return () => stop()
  }, [auth.user, stop])

  useEffect(() => {
    if (!stream || !canScan) return
    let cancelled = false
    const Ctor = getBarcodeDetector()
    if (!Ctor) return
    const detector: Detector = new Ctor({ formats: ['code_39', 'qr_code', 'code_128'] })
    async function loop() {
      if (cancelled) return
      const video = videoRef.current
      if (!video) return
      try {
        const found = await detector.detect(video)
        if (found.length > 0) {
          const raw = String(found[0].rawValue || '').trim()
          if (raw) {
            setDetected(raw)
            void lookup(raw)
          }
        }
      } catch {
        return
      } finally {
        if (!cancelled) window.setTimeout(loop, 700)
      }
    }
    void loop()
    return () => {
      cancelled = true
    }
  }, [canScan, lookup, stream])

  if (!auth.user) {
    return (
      <div className="snPage">
        <Panel title="Asset Scanner">
          <div style={{ color: 'var(--muted)', fontSize: 14 }}>
            Please <Link to="/login">sign in</Link>.
          </div>
        </Panel>
      </div>
    )
  }

  return (
    <div className="snPage" style={{ maxWidth: 1200 }}>
      <div className="snRowWrap" style={{ justifyContent: 'space-between', alignItems: 'end' }}>
        <div style={{ display: 'grid', gap: 4 }}>
          <h1 className="snH1">Asset Scanner</h1>
          <div className="snSubtle">Scan Code39 barcodes or enter a tag manually.</div>
        </div>
        <div className="snRowWrap">
          <Link to="/assets">
            <Button type="button">Back</Button>
          </Link>
          {stream ? (
            <Button type="button" variant="danger" onClick={stop}>
              Stop camera
            </Button>
          ) : (
            <Button type="button" variant="primary" onClick={() => void start()} disabled={!canScan}>
              Start camera
            </Button>
          )}
        </div>
      </div>

      {!canScan ? (
        <Panel title="Scanner Support">
          <div className="snSubtle">Your browser does not support BarcodeDetector. Use manual entry.</div>
        </Panel>
      ) : null}

      {error ? (
        <Panel title="Error">
          <div style={{ color: 'rgba(255,255,255,0.84)' }}>{error}</div>
        </Panel>
      ) : null}

      <div className="snGrid2">
        <Panel title="Camera">
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="snSubtle">Detected: {detected || '—'}</div>
            <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
              <video ref={videoRef} style={{ width: '100%', display: 'block', background: 'rgba(0,0,0,0.2)' }} muted playsInline />
            </div>
          </div>
        </Panel>

        <Panel title="Manual Lookup">
          <div style={{ display: 'grid', gap: 10 }}>
            <Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Asset tag…" />
            <Button type="button" onClick={() => void lookup(manual.trim())} disabled={!manual.trim() || isBusy}>
              Lookup
            </Button>
          </div>
        </Panel>
      </div>

      <Panel title="Asset">
        {!asset ? <div className="snSubtle">Scan or lookup an asset.</div> : null}
        {asset ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <div className="snRowWrap" style={{ justifyContent: 'space-between' }}>
              <div style={{ display: 'grid', gap: 2 }}>
                <div style={{ fontWeight: 820 }}>{asset.asset_tag}</div>
                <div className="snSubtle">{asset.name}</div>
              </div>
              <Badge tone={asset.status === 'IN_USE' ? 'success' : asset.status === 'IN_STOCK' ? 'info' : 'warning'}>{asset.status}</Badge>
            </div>

            <div className="snRowWrap">
              <Button
                type="button"
                onClick={async () => {
                  if (!auth.accessToken) return
                  const url = buildApiUrl(`/api/assets/${asset.id}/barcode.svg/`)
                  const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken}` } })
                  const blob = await resp.blob()
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `${asset.asset_tag}.svg`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
              >
                Download SVG
              </Button>
              <Button
                type="button"
                onClick={async () => {
                  if (!auth.accessToken) return
                  const url = buildApiUrl(`/api/assets/${asset.id}/barcode.pdf/`)
                  const resp = await fetch(url, { headers: { Authorization: `Bearer ${auth.accessToken}` } })
                  const blob = await resp.blob()
                  const a = document.createElement('a')
                  a.href = URL.createObjectURL(blob)
                  a.download = `${asset.asset_tag}.pdf`
                  a.click()
                  URL.revokeObjectURL(a.href)
                }}
              >
                Download PDF
              </Button>
            </div>

            <label style={{ display: 'grid', gap: 6 }}>
              <span className="snSubtle">Transaction notes</span>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
            </label>

            <div className="snRowWrap" style={{ justifyContent: 'flex-end' }}>
              <Button
                type="button"
                onClick={async () => {
                  if (!auth.accessToken) return
                  setIsBusy(true)
                  try {
                    await apiFetch<AssetTransaction>(`/api/assets/${asset.id}/transactions/`, {
                      method: 'POST',
                      token: auth.accessToken,
                      body: JSON.stringify({ action: 'CHECK_OUT', notes }),
                    })
                    await lookup(asset.asset_tag)
                    setNotes('')
                  } finally {
                    setIsBusy(false)
                  }
                }}
                disabled={isBusy}
              >
                Check-out
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={async () => {
                  if (!auth.accessToken) return
                  setIsBusy(true)
                  try {
                    await apiFetch<AssetTransaction>(`/api/assets/${asset.id}/transactions/`, {
                      method: 'POST',
                      token: auth.accessToken,
                      body: JSON.stringify({ action: 'CHECK_IN', notes }),
                    })
                    await lookup(asset.asset_tag)
                    setNotes('')
                  } finally {
                    setIsBusy(false)
                  }
                }}
                disabled={isBusy}
              >
                Check-in
              </Button>
            </div>

            <Panel title="History">
              {tx.length === 0 ? <div className="snSubtle">No transactions yet.</div> : null}
              {tx.length > 0 ? (
                <table className="snTable">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Action</th>
                      <th>By</th>
                      <th>Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tx.map((t) => (
                      <tr key={t.id}>
                        <td className="snSubtle">{new Date(t.performed_at).toLocaleString()}</td>
                        <td>
                          <Badge tone={t.action === 'CHECK_IN' ? 'info' : 'warning'}>{t.action}</Badge>
                        </td>
                        <td className="snSubtle">{t.performed_by.username}</td>
                        <td className="snSubtle">{t.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
            </Panel>
          </div>
        ) : null}
      </Panel>
    </div>
  )
}
