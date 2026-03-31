import { useState, useRef, useEffect, useCallback } from 'react'
import { analyseQRContent, getRiskUiConfig, removeReportedItem, addVouchedItem, fetchFraudReports } from '../../utils/fraudAnalysis'
import { vouchSafe, recordScan } from '../../api/fraudApi'
import ReportModal from '../../components/user/ReportModal'

export default function QRCodeCheck() {
    const [qrContent, setQrContent] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [history, setHistory] = useState([])
    const [cameraOpen, setCameraOpen] = useState(false)
    const [cameraError, setCameraError] = useState(null)
    const [dragOver, setDragOver] = useState(false)
    const [vouched, setVouched] = useState(false)
    const [reportModal, setReportModal] = useState(null)
    const videoRef = useRef(null)
    const streamRef = useRef(null)
    const animFrameRef = useRef(null)
    const imageInputRef = useRef(null)

    // ── Process QR text with client-side fraudAnalysis ──
    const processQR = (text) => {
        if (!text.trim()) return
        setQrContent(text)
        setVouched(false)

        // Stop camera if running
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
        if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
        setCameraOpen(false)

        // Client-side analysis (15+ checks)
        const analysis = analyseQRContent(text)
        const ui = getRiskUiConfig(analysis.riskScore)

        const resultData = {
            ...analysis,
            ui,
            timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
        }
        setResult(resultData)
        setHistory(prev => [resultData, ...prev.slice(0, 9)])

        // Fire-and-forget: check backend reports to enrich
        const identifier = analysis.pa || text
        fetchFraudReports(identifier).then(reportData => {
            if (reportData?.found) {
                setResult(prev => {
                    if (!prev || prev.error) return prev
                    const updated = { ...prev }
                    updated.signals = [...(updated.signals || []), { level: 'danger', text: `Community reported ${reportData.report_count} time(s)` }]
                    updated.riskScore = Math.min(100, updated.riskScore + (reportData.risk_adjustment || 20))
                    updated.ui = getRiskUiConfig(updated.riskScore)
                    return updated
                })
            }
        }).catch(() => {})
        recordScan(identifier, 'anonymous', analysis.riskScore, ui.isFraud ? 'BLOCKED' : 'VIEWED', false).catch(() => {})
    }

    // ── Camera — proven approach from original QRChecker ──
    const stopCamera = useCallback(() => {
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null }
        if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null }
        setCameraOpen(false)
    }, [])

    useEffect(() => () => stopCamera(), [stopCamera])

    const startCamera = async () => {
        setCameraError(null); setResult(null)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
            streamRef.current = stream
            setCameraOpen(true)
            // Use setTimeout to let React render the video element first
            setTimeout(() => {
                if (videoRef.current) {
                    videoRef.current.srcObject = stream
                    videoRef.current.play()
                    scanFrame()
                }
            }, 150)
        } catch (err) {
            setCameraError(err.name === 'NotAllowedError' ? 'Camera access denied. Allow permission in browser settings.' : err.name === 'NotFoundError' ? 'No camera found.' : `Camera error: ${err.message}`)
        }
    }

    // Plain function scanFrame — creates a fresh off-screen canvas each call
    // Uses window.jsQR (loaded via CDN in index.html)
    function scanFrame() {
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
            if (code && code.data) {
                processQR(code.data)
                return
            }
        }
        animFrameRef.current = requestAnimationFrame(scanFrame)
    }

    // ── Image upload — uses window.jsQR too ──
    const handleImageUpload = (file) => {
        if (!file) return
        setResult(null); setCameraError(null)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        const img = new Image()
        img.onload = () => {
            canvas.width = img.width; canvas.height = img.height
            ctx.drawImage(img, 0, 0)
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
            if (typeof window.jsQR === 'function') {
                const code = window.jsQR(imageData.data, imageData.width, imageData.height)
                if (code && code.data) processQR(code.data)
                else setResult({ error: true, message: 'No QR code found — try a clearer image.' })
            } else {
                setResult({ error: true, message: 'QR scanner library not loaded. Please refresh.' })
            }
        }
        img.src = URL.createObjectURL(file)
    }

    const handleDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files[0]) handleImageUpload(e.dataTransfer.files[0]) }

    // ── Vouch (mark as safe) ──
    const handleVouch = async () => {
        if (!result || result.error) return
        const identifier = result.pa || result.rawText
        if (!identifier) return
        removeReportedItem(identifier)
        addVouchedItem(identifier)
        await vouchSafe(identifier, 'QR_CODE').catch(() => {})
        const updated = analyseQRContent(result.rawText || `upi://pay?pa=${result.pa}&pn=${result.pn || ''}&am=${result.am || 0}`)
        setResult(prev => ({ ...prev, ...updated, ui: getRiskUiConfig(updated.riskScore) }))
        setVouched(true)
    }

    const reset = () => { setResult(null); setQrContent(''); setVouched(false); stopCamera() }

    return (
        <>
            <div className="vh">
                <div className="vh-eyebrow">End User · QR Code Safety</div>
                <div className="vh-title">QR Code Check</div>
                <div className="vh-row"><div className="vh-sub">Scan, upload, or paste a QR code to verify it's safe. {history.length} checks performed.</div></div>
            </div>
            <div className="portal-body">
                <div className="portal-card">
                    <div className="portal-card-header">
                        <div className="portal-card-title">Scan or Upload QR Code</div>
                        <div className="portal-card-desc">Use your camera, drag & drop an image, or paste the UPI deep link directly.</div>
                    </div>
                    <div className="portal-card-body">

                        {/* ── Result View ── */}
                        {result && !result.error && (() => {
                            const ui = result.ui || getRiskUiConfig(result.riskScore)
                            return (
                                <div style={{ background: ui.glowColor, border: `1px solid ${ui.borderColor}`, borderRadius: 14, padding: 20, marginBottom: 14, ...(ui.isFraud ? { animation: 'blockFlash 2s ease-in-out infinite' } : {}) }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 16, fontWeight: 700, color: ui.color, fontFamily: 'var(--fb)' }}>
                                                {result._previouslyReported ? '🚫 KNOWN FRAUD' : `${ui.icon} ${ui.level}`}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--fm)', marginTop: 2 }}>
                                                {result._previouslyReported ? 'PREVIOUSLY REPORTED SCAM' : ui.message}
                                            </div>
                                        </div>
                                        {/* Risk score circle */}
                                        <div style={{
                                            width: 56, height: 56, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            border: `3px solid ${ui.color}`, fontFamily: 'var(--fd)', fontSize: 18, color: ui.color,
                                            background: `${ui.color}10`,
                                        }}>{result.riskScore}</div>
                                    </div>

                                    {/* Payee Info */}
                                    {result.pa && (
                                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                                            {[['Payee', result.pn || '—'], ['UPI ID', result.pa], ['Amount', result.am > 0 ? `₹${result.am.toLocaleString('en-IN')}` : 'Not specified'], ['Bank', result.pa.split('@')[1] ? `@${result.pa.split('@')[1]}` : '—']].map(([k, v]) => (
                                                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 12, borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'var(--fm)' }}>
                                                    <span style={{ color: 'var(--text3)' }}>{k}</span><span style={{ color: 'var(--text)' }}>{v}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Signals */}
                                    {result.signals && result.signals.length > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            {result.signals.map((s, i) => {
                                                const colors = { danger: 'var(--danger)', warning: 'var(--warn)', safe: 'var(--safe)', info: 'var(--accent)' }
                                                const icons = { danger: '🔴', warning: '🟡', safe: '🟢', info: 'ℹ️' }
                                                return (
                                                    <div key={i} style={{ padding: '6px 0', fontSize: 11, color: colors[s.level] || 'var(--text2)', fontFamily: 'var(--fm)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        {icons[s.level] || '•'} {s.text}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* Verification Checklist (safe result) */}
                                    {!ui.isFraud && (
                                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, fontFamily: 'var(--fb)' }}>✓ VERIFICATION CHECKLIST</div>
                                            <ul style={{ color: 'var(--text2)', fontSize: 11, paddingLeft: 16, margin: 0, fontFamily: 'var(--fm)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                <li>I recognize this payee/merchant</li><li>The payee name matches the business</li>
                                                <li>I initiated this transaction</li><li>The amount is correct</li>
                                            </ul>
                                            <div style={{ color: 'var(--accent)', fontSize: 11, marginTop: 8, fontFamily: 'var(--fm)' }}>⚠️ Never pay based on "urgent" phone calls or messages</div>
                                        </div>
                                    )}

                                    {/* Fraud guidance */}
                                    {ui.isFraud && (
                                        <div style={{ background: `${ui.color}08`, border: `1px solid ${ui.color}20`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, fontFamily: 'var(--fb)' }}>What to do next:</div>
                                            <ol style={{ color: 'var(--text2)', fontSize: 11, paddingLeft: 16, fontFamily: 'var(--fm)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                <li>Do not proceed with payment</li><li>Block the person who sent this QR</li>
                                                <li>Report to Cybercrime Helpline: <span style={{ color: 'var(--accent)', fontFamily: 'var(--fd)' }}>1930</span></li>
                                                <li>File online: <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>cybercrime.gov.in</a></li>
                                            </ol>
                                        </div>
                                    )}

                                    {/* Action buttons */}
                                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                                        <button className="p-btn" style={{ flex: 1, background: ui.isFraud ? '#e8525215' : 'var(--bg3)', color: ui.isFraud ? 'var(--danger)' : 'var(--text)' }}
                                            onClick={() => setReportModal({ item: result.pa || result.rawText, type: 'QR Code', risk: result.riskScore })}>
                                            {ui.isFraud ? '🚨 Report' : '⚠️ Report Suspicious'}
                                        </button>
                                        {vouched ? (
                                            <button disabled className="p-btn" style={{ flex: 1, background: '#5cba8a15', color: 'var(--safe)', border: '1px solid #5cba8a30' }}>✅ Marked Safe</button>
                                        ) : (
                                            <button onClick={handleVouch} className="p-btn" style={{ flex: 1, color: 'var(--safe)' }}>🛡 Mark as Safe</button>
                                        )}
                                        <button onClick={reset} className="p-btn" style={{ flex: 1 }}>Check Another</button>
                                    </div>
                                </div>
                            )
                        })()}

                        {result && result.error && (
                            <div style={{ marginBottom: 14 }} className="result-danger">
                                <div className="result-icon" style={{ background: '#e8525215', border: '1px solid #e8525230', color: 'var(--danger)' }}>✕</div>
                                <div><div className="result-title" style={{ color: 'var(--danger)' }}>Check Failed</div><div className="result-sub" style={{ color: 'var(--text3)' }}>{result.message}</div></div>
                            </div>
                        )}

                        {/* ── Input View (shown when no result) ── */}
                        {!result && (
                            <>
                                {/* Camera view */}
                                {cameraOpen && (
                                    <div style={{ position: 'relative', marginBottom: 14, borderRadius: 10, overflow: 'hidden', border: '2px solid var(--accent)', background: '#000' }}>
                                        <video ref={videoRef} style={{ width: '100%', height: 300, objectFit: 'cover', display: 'block' }} playsInline muted />
                                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                                            <div style={{ width: 180, height: 180, border: '2px solid var(--accent)', borderRadius: 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)', animation: 'pulse 2s ease-in-out infinite' }} />
                                        </div>
                                        <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, textAlign: 'center', fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--accent)', letterSpacing: 1, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                                            🔍 Point camera at QR code — it will auto-detect
                                        </div>
                                        <button onClick={stopCamera} style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                                    </div>
                                )}

                                {!cameraOpen && (
                                    <>
                                        {/* Drag & drop zone */}
                                        <div
                                            onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                                            onDragLeave={() => setDragOver(false)}
                                            onDrop={handleDrop}
                                            onClick={() => imageInputRef.current?.click()}
                                            style={{
                                                border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border2)'}`,
                                                borderRadius: 12, padding: '32px 16px', textAlign: 'center', cursor: 'pointer',
                                                background: dragOver ? 'rgba(212,175,55,0.04)' : 'var(--bg3)', transition: 'all 0.2s', marginBottom: 10,
                                            }}
                                        >
                                            <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
                                            <div style={{ fontFamily: 'var(--fm)', fontSize: 12, color: 'var(--text2)', marginBottom: 4 }}>Drag & drop your QR code image here</div>
                                            <div style={{ fontFamily: 'var(--fm)', fontSize: 10, color: 'var(--text3)' }}>or click to browse · Supports JPG, PNG, WebP</div>
                                            <input ref={imageInputRef} type="file" accept="image/*" capture="environment" style={{ display: 'none' }}
                                                onChange={e => { handleImageUpload(e.target.files?.[0]); e.target.value = '' }} />
                                        </div>

                                        {/* Camera button */}
                                        <button className="p-btn p-btn-full" onClick={startCamera} style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="3" width="14" height="10" rx="2" /><circle cx="8" cy="8" r="2.5" /><path d="M11 5h1" /></svg>
                                            Open Camera
                                        </button>
                                    </>
                                )}

                                {cameraError && (
                                    <div style={{ marginBottom: 12 }} className="result-danger">
                                        <div className="result-icon" style={{ background: '#e8525215', border: '1px solid #e8525230', color: 'var(--danger)' }}>!</div>
                                        <div><div className="result-title" style={{ color: 'var(--danger)' }}>Camera Error</div><div className="result-sub" style={{ color: 'var(--text3)' }}>{cameraError}</div></div>
                                    </div>
                                )}

                                <div style={{ fontFamily: 'var(--fm)', fontSize: 9, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Or paste QR content / UPI link</div>
                                <div className="p-input-wrap">
                                    <input placeholder="upi://pay?pa=someone@ybl&pn=Name&am=500" value={qrContent}
                                        onChange={e => setQrContent(e.target.value)} onKeyDown={e => e.key === 'Enter' && processQR(qrContent)} />
                                    <button className="p-btn" onClick={() => processQR(qrContent)} disabled={loading}>{loading ? 'Checking...' : 'Check →'}</button>
                                </div>
                            </>
                        )}

                        {/* History */}
                        {history.length > 0 && (
                            <div style={{ marginTop: 18 }}>
                                <div style={{ fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: 2, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>Recent Checks</div>
                                {history.map((h, i) => {
                                    const hu = h.ui || getRiskUiConfig(h.riskScore)
                                    return (
                                        <div key={i} className="history-row" onClick={() => { setResult(h); setVouched(false) }} style={{ cursor: 'pointer' }}>
                                            <div className="hist-id">{h.pa || (h.rawText || '').slice(0, 30)}</div>
                                            <div className="hist-type" style={{ color: hu.color }}>{hu.isFraud ? 'FRAUD' : 'SAFE'}</div>
                                            <div><div className="sbw"><div className="sbv" style={{ width: h.riskScore + '%', background: hu.color }} /></div></div>
                                            <div className="hist-time">{h.timestamp}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    <div className="p-footer">Analysis uses 15+ client-side fraud checks · Report fraud at cybercrime.gov.in or call 1930</div>
                </div>
            </div>

            {/* Report Modal */}
            {reportModal && <ReportModal item={reportModal} onClose={() => setReportModal(null)} />}
        </>
    )
}
