import { useState, useRef } from 'react'
import { Upload, Shield, AlertTriangle, CheckCircle, XCircle, Loader, ImageIcon, FileWarning } from 'lucide-react'
import { verifyScreenshot } from '../../api/fraudApi'

const ANALYSIS_STEPS = [
    { key: 'detect', label: 'Detecting UPI App' },
    { key: 'extract', label: 'Extracting verification signature' },
    { key: 'match', label: 'Matching against database' },
]

export default function ScreenshotChecker({ onReport }) {
    const [state, setState] = useState('upload') // upload | analyzing | result
    const [result, setResult] = useState(null)
    const [error, setError] = useState('')
    const [preview, setPreview] = useState(null)
    const [fileName, setFileName] = useState('')
    const [dragOver, setDragOver] = useState(false)
    const [activeStep, setActiveStep] = useState(0)
    const fileRef = useRef(null)

    const processFile = async (file) => {
        setError('')

        // Client-side format check
        const ext = file.name.split('.').pop()?.toLowerCase()
        if (ext !== 'png') {
            setError(`Only PNG screenshots are supported. You uploaded a .${ext} file. JPEG and other formats destroy the LSB verification signature.`)
            return
        }

        if (file.size > 20 * 1024 * 1024) {
            setError('File too large. Maximum size is 20MB.')
            return
        }

        setPreview(URL.createObjectURL(file))
        setFileName(file.name)
        setState('analyzing')
        setActiveStep(0)

        // Animate through steps
        const stepDelay = (step, ms) => new Promise(r => {
            setTimeout(() => { setActiveStep(step); r() }, ms)
        })

        try {
            await stepDelay(0, 0)
            await stepDelay(1, 900)

            const data = await verifyScreenshot(file)

            await stepDelay(2, 800)
            await new Promise(r => setTimeout(r, 600))

            setResult(data)
            setState('result')
        } catch (err) {
            setError('Verification failed. Please try again.')
            setState('upload')
        }
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0])
    }

    const handleFile = (e) => {
        if (e.target.files[0]) processFile(e.target.files[0])
    }

    const reset = () => {
        setState('upload')
        setResult(null)
        setError('')
        setPreview(null)
        setFileName('')
        setActiveStep(0)
        if (fileRef.current) fileRef.current.value = ''
    }

    // ── ANALYZING STATE ──
    if (state === 'analyzing') {
        return (
            <div className="fade-in" style={{ textAlign: 'center', padding: '40px 20px' }}>
                <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: 'rgba(0,212,255,0.08)', border: '2px solid rgba(0,212,255,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 20px',
                    animation: 'pulse-live 2s ease-in-out infinite',
                }}>
                    <Shield size={28} style={{ color: 'var(--accent-cyan)' }} />
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>Analyzing Screenshot...</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 28 }}>
                    Verifying authenticity of your transaction screenshot
                </p>

                {preview && (
                    <div style={{ marginBottom: 24 }}>
                        <img src={preview} alt="Uploaded" style={{
                            maxHeight: 120, borderRadius: 12, border: '1px solid var(--border)',
                            opacity: 0.6
                        }} />
                    </div>
                )}

                <div style={{ maxWidth: 320, margin: '0 auto', textAlign: 'left' }}>
                    {ANALYSIS_STEPS.map((step, i) => {
                        const isDone = i < activeStep
                        const isActive = i === activeStep
                        const isPending = i > activeStep
                        return (
                            <div key={step.key} style={{
                                display: 'flex', alignItems: 'center', gap: 12,
                                padding: '10px 0',
                                opacity: isPending ? 0.3 : 1,
                                transition: 'opacity 0.3s',
                            }}>
                                {isDone && <CheckCircle size={18} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />}
                                {isActive && <Loader size={18} style={{ color: 'var(--accent-cyan)', flexShrink: 0, animation: 'spin 1s linear infinite' }} />}
                                {isPending && <div style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--border)', flexShrink: 0 }} />}
                                <span style={{
                                    fontSize: 14,
                                    fontWeight: isActive ? 600 : 400,
                                    color: isDone ? 'var(--accent-green)' : isActive ? 'var(--text-primary)' : 'var(--text-muted)',
                                }}>{step.label}</span>
                            </div>
                        )
                    })}
                </div>

                <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
        )
    }

    // ── RESULT STATE ──
    if (state === 'result' && result) {
        const isGenuine = result.result === 'GENUINE'
        const isRejected = result.result === 'REJECTED'

        const glowColor = isGenuine
            ? 'rgba(0,229,160,0.04)'
            : 'rgba(255,59,92,0.04)'
        const borderColor = isGenuine
            ? 'rgba(0,229,160,0.2)'
            : 'rgba(255,59,92,0.2)'
        const accentColor = isGenuine ? '#00E5A0' : '#FF3B5C'

        return (
            <div className="fade-in" style={{
                background: glowColor,
                border: `1px solid ${borderColor}`,
                borderRadius: 20, padding: 32,
                ...(isGenuine ? {} : { animation: 'blockFlash 2s ease-in-out infinite' }),
            }}>
                {/* Verdict Header */}
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                    <div style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: isGenuine ? 'rgba(0,229,160,0.12)' : 'rgba(255,59,92,0.12)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        margin: '0 auto 12px',
                    }}>
                        {isGenuine
                            ? <CheckCircle size={28} style={{ color: '#00E5A0' }} />
                            : <XCircle size={28} style={{ color: '#FF3B5C' }} />
                        }
                    </div>
                    <h3 style={{ color: accentColor, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
                        {isGenuine ? '✅ GENUINE TRANSACTION' : isRejected ? '⚠️ FORMAT REJECTED' : '❌ FRAUD DETECTED'}
                    </h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 400, margin: '0 auto' }}>
                        {result.message}
                    </p>
                </div>

                {/* Details Card */}
                <div style={{
                    background: 'rgba(255,255,255,0.03)', borderRadius: 14,
                    padding: 16, marginBottom: 16,
                }}>
                    {[
                        ['App Detected', result.display_name || 'Unknown'],
                        ['Confidence', result.confidence_label || 'N/A'],
                        ['Detection Method', result.detection_method === 'ocr' ? 'Text Recognition (OCR)' : result.detection_method === 'color' ? 'Color Analysis' : 'N/A'],
                        ['Signature', result.signature_status || 'N/A'],
                        ['Risk Score', `${result.risk_score}/100`],
                    ].map(([k, v]) => (
                        <div key={k} style={{
                            display: 'flex', justifyContent: 'space-between',
                            padding: '8px 0', fontSize: 14,
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                            <span className="mono" style={{
                                color: k === 'Signature'
                                    ? (result.signature_status?.includes('VALID') ? '#00E5A0' : '#FF3B5C')
                                    : 'var(--text-primary)',
                                fontWeight: k === 'Signature' ? 600 : 400,
                            }}>{v}</span>
                        </div>
                    ))}
                </div>

                {/* Preview */}
                {preview && (
                    <div style={{ textAlign: 'center', marginBottom: 16 }}>
                        <img src={preview} alt="Verified Screenshot" style={{
                            maxHeight: 160, borderRadius: 12,
                            border: `2px solid ${borderColor}`,
                            opacity: 0.8,
                        }} />
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{fileName}</p>
                    </div>
                )}

                {/* Genuine — Checklist */}
                {isGenuine && (
                    <div style={{
                        background: 'rgba(0,229,160,0.06)',
                        border: '1px solid rgba(0,229,160,0.15)',
                        borderRadius: 14, padding: 16, marginBottom: 16,
                    }}>
                        <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14, color: '#00E5A0' }}>✓ VERIFICATION PASSED</p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
                            This screenshot contains a valid cryptographic signature matching
                            <strong style={{ color: 'var(--text-primary)' }}> {result.display_name}</strong>.
                            The transaction screenshot appears to be authentic and unmodified.
                        </p>
                    </div>
                )}

                {/* Fraud — Warning */}
                {!isGenuine && !isRejected && (
                    <div style={{
                        background: 'rgba(255,59,92,0.06)',
                        border: '1px solid rgba(255,59,92,0.15)',
                        borderRadius: 14, padding: 16, marginBottom: 16,
                    }}>
                        <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>⚠️ What to do next:</p>
                        <ol style={{
                            color: 'var(--text-secondary)', fontSize: 13, paddingLeft: 18,
                            display: 'flex', flexDirection: 'column', gap: 4,
                        }}>
                            <li>Do not trust this screenshot as proof of payment</li>
                            <li>Ask the sender to show the official app with transaction details</li>
                            <li>Report to Cybercrime Helpline: <span className="mono" style={{ color: 'var(--accent-cyan)' }}>1930</span></li>
                            <li>File online: <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" style={{ color: 'var(--accent-cyan)' }}>cybercrime.gov.in</a></li>
                        </ol>
                    </div>
                )}

                {/* POC Disclaimer */}
                <div style={{
                    background: 'rgba(255,176,32,0.06)',
                    border: '1px solid rgba(255,176,32,0.15)',
                    borderRadius: 12, padding: 12, marginBottom: 16,
                }}>
                    <p style={{ fontSize: 12, color: 'var(--accent-amber)', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <FileWarning size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span>
                            <strong>POC Feature:</strong> This demonstration uses LSB steganography for screenshot verification.
                            In a production system, this would be replaced by server-side payment gateway verification.
                        </span>
                    </p>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {!isGenuine && (
                        <button
                            onClick={() => onReport?.({
                                item: `Screenshot: ${fileName}`,
                                type: 'Screenshot',
                                risk: result.risk_score,
                            })}
                            className="btn-secondary"
                            style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 120 }}
                        >
                            🚨 Report This Screenshot
                        </button>
                    )}
                    <button onClick={reset} className="btn-primary" style={{
                        flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 120,
                    }}>
                        Check Another
                    </button>
                </div>
            </div>
        )
    }

    // ── UPLOAD STATE ──
    return (
        <div className="fade-in">
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
                <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'rgba(0,212,255,0.08)', border: '2px solid rgba(0,212,255,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 12px',
                }}>
                    <ImageIcon size={24} style={{ color: 'var(--accent-cyan)' }} />
                </div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Transaction Screenshot Verification</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, maxWidth: 420, margin: '0 auto', lineHeight: 1.6 }}>
                    Upload a UPI transaction screenshot to verify its authenticity using embedded cryptographic signatures.
                </p>
            </div>

            {/* Drop Zone */}
            <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                    border: `2px dashed ${dragOver ? 'var(--accent-cyan)' : 'var(--border)'}`,
                    borderRadius: 16, padding: 48, textAlign: 'center', cursor: 'pointer',
                    background: dragOver ? 'rgba(0,212,255,0.04)' : 'rgba(255,255,255,0.02)',
                    transition: 'all 0.2s', marginBottom: 16,
                }}
            >
                {preview ? (
                    <img src={preview} alt="Preview" style={{ maxHeight: 160, borderRadius: 10, margin: '0 auto 12px' }} />
                ) : (
                    <Upload size={36} style={{ color: 'var(--text-muted)', marginBottom: 12 }} />
                )}
                <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 4 }}>
                    Drag & drop your transaction screenshot here
                </p>
                <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                    or click to browse · <strong style={{ color: 'var(--accent-amber)' }}>PNG only</strong>
                </p>
                <input
                    ref={fileRef} type="file" accept="image/png"
                    onChange={handleFile} style={{ display: 'none' }}
                />
            </div>

            {/* Format Notice */}
            <div style={{
                background: 'rgba(255,176,32,0.06)',
                border: '1px solid rgba(255,176,32,0.12)',
                borderRadius: 12, padding: 14, marginBottom: 20,
                display: 'flex', alignItems: 'flex-start', gap: 10,
            }}>
                <AlertTriangle size={16} style={{ color: 'var(--accent-amber)', flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--accent-amber)' }}>PNG format required.</strong>{' '}
                    JPEG and other lossy formats destroy the cryptographic signature embedded in the image pixels.
                    Take a screenshot and save as PNG for best results.
                </div>
            </div>

            {/* How It Works */}
            <div style={{
                background: 'rgba(0,212,255,0.04)',
                border: '1px solid rgba(0,212,255,0.1)',
                borderRadius: 14, padding: 16,
            }}>
                <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: 'var(--accent-cyan)' }}>
                    🔬 How it works
                </p>
                <div style={{ display: 'grid', gap: 8 }}>
                    {[
                        ['1', 'App Detection', 'OCR + color analysis identifies GPay, PhonePe, Paytm, or BHIM'],
                        ['2', 'Signature Extraction', 'Hidden LSB steganography string is extracted from pixel data'],
                        ['3', 'Database Verification', 'Extracted signature is cross-checked against our lookup table'],
                    ].map(([num, title, desc]) => (
                        <div key={num} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                            <div style={{
                                width: 22, height: 22, borderRadius: '50%',
                                background: 'rgba(0,212,255,0.12)', color: 'var(--accent-cyan)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 11, fontWeight: 700, flexShrink: 0,
                            }}>{num}</div>
                            <div>
                                <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{title}</p>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>{desc}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="shake" style={{
                    background: 'rgba(255,59,92,0.08)',
                    border: '1px solid rgba(255,59,92,0.2)',
                    borderRadius: 12, padding: 14, marginTop: 16,
                    display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                    <XCircle size={16} style={{ color: 'var(--accent-red)', flexShrink: 0, marginTop: 1 }} />
                    <p style={{ color: 'var(--accent-red)', fontSize: 13 }}>{error}</p>
                </div>
            )}
        </div>
    )
}
