import { useState, useRef, useCallback, useEffect } from 'react'
import { Camera, Upload, X, StopCircle } from 'lucide-react'
import { analyseQRContent } from '../../utils/fraudAnalysis'
import RiskGauge from '../common/RiskGauge'
import SignalList from '../common/SignalList'

export default function QRChecker({ onReport }) {
    const [result, setResult] = useState(null)
    const [error, setError] = useState('')
    const [preview, setPreview] = useState(null)
    const [manualText, setManualText] = useState('')
    const [cameraActive, setCameraActive] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const fileRef = useRef(null)
    const videoRef = useRef(null)
    const streamRef = useRef(null)
    const animFrameRef = useRef(null)

    const stopCamera = useCallback(() => {
        if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop())
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
        streamRef.current = null
        setCameraActive(false)
    }, [])

    useEffect(() => () => stopCamera(), [stopCamera])

    const processQR = (text) => {
        setError('')
        const res = analyseQRContent(text)
        setResult(res)
        stopCamera()
    }

    const decodeImage = (file) => {
        setError('')
        setPreview(URL.createObjectURL(file))
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const img = new Image()
        img.onload = () => {
            canvas.width = img.width
            canvas.height = img.height
            ctx.drawImage(img, 0, 0)
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            if (typeof window.jsQR === 'function') {
                const code = window.jsQR(imageData.data, imageData.width, imageData.height)
                if (code) processQR(code.data)
                else setError('Could not read QR code — try a clearer image')
            } else {
                setError('QR scanner not loaded. Please refresh the page.')
            }
        }
        img.src = URL.createObjectURL(file)
    }

    const handleDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) decodeImage(e.dataTransfer.files[0]) }
    const handleFile = (e) => { if (e.target.files[0]) decodeImage(e.target.files[0]) }

    const startCamera = async () => {
        setError('')
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            streamRef.current = stream
            setCameraActive(true)
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    videoRef.current.play()
                    scanFrame()
                }
            }, 100)
        } catch { setError('Camera access was denied. Please use the image upload option instead.') }
    }

    const scanFrame = () => {
        const video = videoRef.current
        if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
            animFrameRef.current = requestAnimationFrame(scanFrame)
            return
        }
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        if (typeof window.jsQR === 'function') {
            const code = window.jsQR(imageData.data, imageData.width, imageData.height)
            if (code) { processQR(code.data); return }
        }
        animFrameRef.current = requestAnimationFrame(scanFrame)
    }

    const reset = () => { setResult(null); setError(''); setPreview(null); setManualText(''); stopCamera() }

    if (result) {
        const rs = result.riskScore
        const isPreviouslyReported = result._previouslyReported
        const isSafe = rs < 30, isWarn = rs >= 30 && rs < 60
        const borderColor = isSafe ? 'rgba(0,229,160,0.3)' : isWarn ? 'rgba(255,176,32,0.3)' : 'rgba(255,59,92,0.4)'
        const glowColor = isSafe ? 'rgba(0,229,160,0.06)' : isWarn ? 'rgba(255,176,32,0.06)' : 'rgba(255,59,92,0.08)'
        const headerColor = isSafe ? '#00E5A0' : isWarn ? '#FFB020' : '#FF3B5C'
        const headerText = isPreviouslyReported ? '🚫  KNOWN FRAUD — PREVIOUSLY REPORTED' : isSafe ? '✅  QR Code Looks Safe' : isWarn ? '⚠️  Proceed With Caution' : '🚨  HIGH FRAUD RISK — DO NOT PAY'

        return (
            <div className="fade-in" style={{ background: glowColor, border: `1px solid ${borderColor}`, borderRadius: 20, padding: 32, ...(rs > 60 ? { animation: 'blockFlash 2s ease-in-out infinite' } : {}) }}>
                <h3 style={{ color: headerColor, fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{headerText}</h3>
                {rs >= 30 && <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>Risk Score: {rs}/100</p>}
                <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}><RiskGauge score={rs} size={130} /></div>
                {result.pa && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                        {[['Payee', result.pn || '—'], ['UPI ID', result.pa], ['Amount', result.am > 0 ? `₹${result.am.toLocaleString('en-IN')}` : 'Not specified'], ['Bank Handle', result.pa.split('@')[1] ? `@${result.pa.split('@')[1]}` : '—']].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 15, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{k}</span><span className="mono">{v}</span>
                            </div>
                        ))}
                    </div>
                )}
                <SignalList signals={result.signals} />
                {rs > 60 && (
                    <div style={{ background: 'rgba(255,59,92,0.06)', border: '1px solid rgba(255,59,92,0.15)', borderRadius: 14, padding: 16, marginTop: 16 }}>
                        <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>What to do next:</p>
                        <ol style={{ color: 'var(--text-secondary)', fontSize: 14, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <li>Do not proceed with payment</li><li>Block the person who sent this QR</li>
                            <li>Report to Cybercrime Helpline: <span className="mono" style={{ color: 'var(--accent-cyan)' }}>1930</span></li>
                            <li>File online: <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" style={{ color: 'var(--accent-cyan)' }}>cybercrime.gov.in</a></li>
                        </ol>
                    </div>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                    {rs > 30 && <button onClick={() => onReport?.({ item: result.pa || result.rawText, type: 'QR Code', risk: rs })} className="btn-secondary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 140 }}>🚨 Report This QR</button>}
                    <button onClick={reset} className="btn-primary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 140 }}>Check Another</button>
                </div>
            </div>
        )
    }

    return (
        <div className="fade-in">
            {cameraActive ? (
                <div style={{ borderRadius: 16, overflow: 'hidden', position: 'relative', marginBottom: 16 }}>
                    <video ref={videoRef} style={{ width: '100%', borderRadius: 16 }} playsInline muted />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                        <div style={{ width: 200, height: 200, border: '2px solid var(--accent-green)', borderRadius: 16, animation: 'pulse-live 2s ease-in-out infinite' }} />
                    </div>
                    <button onClick={stopCamera} style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 20, padding: '6px 14px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}><StopCircle size={14} /> Stop</button>
                    <p style={{ textAlign: 'center', padding: 10, color: 'var(--text-secondary)', fontSize: 13 }}>Point camera at QR code — it will auto-detect</p>
                </div>
            ) : (
                <>
                    <div onDragOver={(e) => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop}
                        onClick={() => fileRef.current?.click()}
                        style={{ border: `2px dashed ${dragOver ? 'var(--accent-cyan)' : 'var(--border)'}`, borderRadius: 16, padding: 48, textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(0,212,255,0.04)' : 'rgba(255,255,255,0.02)', transition: 'all 0.2s', marginBottom: 16 }}>
                        {preview ? <img src={preview} alt="QR Preview" style={{ maxHeight: 160, borderRadius: 10, margin: '0 auto 12px' }} />
                            : <Upload size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />}
                        <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 4 }}>Drag & drop your QR code image here</p>
                        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>or click to browse · Supports JPG, PNG, WebP</p>
                        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
                    </div>
                    <button onClick={startCamera} className="btn-secondary" style={{ width: '100%', borderRadius: 12, padding: '12px 16px', justifyContent: 'center', fontSize: 14, marginBottom: 20 }}>
                        <Camera size={16} /> Use Camera
                    </button>
                </>
            )}
            {error && <p style={{ color: 'var(--accent-red)', fontSize: 14, textAlign: 'center', marginBottom: 12 }}>{error}</p>}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16 }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8 }}>Or paste the QR code content directly:</p>
                <div style={{ display: 'flex', gap: 10 }}>
                    <input value={manualText} onChange={e => setManualText(e.target.value)} placeholder="upi://pay?pa=someone@ybl&pn=Name&am=500" style={{ flex: 1, fontSize: 14, borderRadius: 12, padding: '12px 14px' }}
                        onKeyDown={e => e.key === 'Enter' && manualText.trim() && processQR(manualText.trim())} />
                    <button onClick={() => manualText.trim() && processQR(manualText.trim())} className="btn-primary" style={{ borderRadius: 12, padding: '12px 20px', whiteSpace: 'nowrap' }} disabled={!manualText.trim()}>Check →</button>
                </div>
            </div>
        </div>
    )
}
