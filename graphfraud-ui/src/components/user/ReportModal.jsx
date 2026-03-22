import { useState } from 'react'
import { X, ExternalLink, CheckCircle, Phone, ArrowLeft, AlertTriangle } from 'lucide-react'
import { addReportedItem } from '../../utils/fraudAnalysis'
import { API_BASE_URL } from '../../config'

const REPORT_REASONS = [
    'Suspicious request',
    'Unknown payee',
    'Phishing attempt',
    'Impersonation / Fake ID',
    'Received money request from unknown',
    'Fake QR code',
    'Malicious link',
    'Other'
]

export default function ReportModal({ item, onClose }) {
    // 3-screen flow: 'form' → 'submitting' → 'confirmation'
    const [screen, setScreen] = useState('form')
    const [reportReason, setReportReason] = useState('Suspicious request')
    const [fraudOccurred, setFraudOccurred] = useState(false)
    const [amountLost, setAmountLost] = useState('')
    const [description, setDescription] = useState('')
    const [refCode, setRefCode] = useState('')
    const [reportId, setReportId] = useState('')
    const [submitError, setSubmitError] = useState('')

    const handleSubmit = async () => {
        setSubmitError('')
        setScreen('submitting')
        const code = `RPT-${Date.now().toString(36).toUpperCase()}`

        try {
            // Send report to backend
            const payload = {
                fraud_identifier: item?.item || 'unknown',
                report_type: item?.type === 'QR Code' ? 'QR_CODE'
                    : item?.type === 'Link / URL' ? 'URL'
                    : 'UPI_ID',
                reporter_user_id: 'user_frontend',
                report_reason: reportReason,
                fraud_occurred: fraudOccurred,
                amount_lost: Number(amountLost) || 0,
                additional_notes: description
            }

            const res = await fetch(`${API_BASE_URL}/report`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            })

            if (!res.ok) {
                throw new Error('Server returned error')
            }

            const data = await res.json()
            setReportId(data.report_id || '')
        } catch (e) {
            console.error('API error:', e)
            // Still save locally
        }

        // Save to localStorage
        const report = {
            id: Date.now(),
            item: item?.item || '',
            type: item?.type || '',
            risk: item?.risk || 0,
            description,
            timestamp: new Date().toISOString(),
            refCode: code,
            reason: reportReason,
            amountLost: Number(amountLost) || 0,
            fraudOccurred
        }
        const existing = JSON.parse(localStorage.getItem('fraud_reports') || '[]')
        existing.push(report)
        localStorage.setItem('fraud_reports', JSON.stringify(existing))

        // Add to blacklist so re-scanning immediately flags it
        if (item?.item) addReportedItem(item.item, item.type || 'Unknown')

        setRefCode(code)
        setScreen('confirmation')
    }

    const goHome = () => {
        onClose()
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} className="card fade-in" style={{ maxWidth: 480, width: '100%', borderRadius: 20, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>

                {/* ═══ SCREEN 3: CONFIRMATION ═══ */}
                {screen === 'confirmation' && (
                    <div style={{ textAlign: 'center', padding: 16 }}>
                        <CheckCircle size={48} style={{ color: 'var(--accent-green)', marginBottom: 16 }} />
                        <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>✓ Report Submitted Successfully!</h3>

                        {reportId && (
                            <p className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 14, marginBottom: 4 }}>
                                Report ID: #{reportId}
                            </p>
                        )}
                        <p className="mono" style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 16 }}>
                            Reference: {refCode}
                        </p>

                        <div style={{ background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)', borderRadius: 14, padding: 16, marginBottom: 20, textAlign: 'left' }}>
                            <p style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, marginBottom: 8 }}>
                                Your report has been recorded.
                            </p>
                            <p style={{ color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
                                This {item?.type || 'item'} will be monitored for suspicious activity.
                                Thank you for helping protect the community!
                            </p>
                        </div>

                        {/* Two separate action buttons */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <button
                                onClick={goHome}
                                className="btn-primary"
                                style={{ width: '100%', borderRadius: 12, padding: '14px 24px', fontSize: 15 }}
                            >
                                <ArrowLeft size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
                                Back to Home
                            </button>
                            <a
                                href="tel:1930"
                                className="btn-secondary"
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                    width: '100%', borderRadius: 12, padding: '14px 24px',
                                    textDecoration: 'none', fontSize: 15, fontWeight: 600,
                                    background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)',
                                    border: '1px solid rgba(255,59,92,0.2)'
                                }}
                            >
                                <Phone size={16} />
                                Call Cyber Crime: 1930
                            </a>
                        </div>

                        <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 16, lineHeight: 1.5 }}>
                            Note: To report to authorities, call <strong>1930</strong> (National Cyber Crime Helpline — 24×7, free)
                        </p>
                    </div>
                )}

                {/* ═══ SCREEN: SUBMITTING (loading) ═══ */}
                {screen === 'submitting' && (
                    <div style={{ textAlign: 'center', padding: 32 }}>
                        <div style={{ width: 40, height: 40, border: '3px solid var(--border)', borderTopColor: 'var(--accent-cyan)', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
                        <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>Submitting your report...</p>
                        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    </div>
                )}

                {/* ═══ SCREEN 2: REPORT FORM ═══ */}
                {screen === 'form' && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h3 style={{ fontWeight: 700, fontSize: 17 }}>Report Fraudulent {item?.type || 'Item'}</h3>
                            <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-secondary)', padding: 4 }}><X size={18} /></button>
                        </div>

                        {/* Item being reported */}
                        {item && (
                            <div style={{ background: 'rgba(255,59,92,0.06)', borderRadius: 12, padding: 14, marginBottom: 16, fontSize: 13 }}>
                                <p style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>Reporting</p>
                                <p className="mono" style={{ color: 'var(--text-primary)', fontSize: 14, fontWeight: 600, wordBreak: 'break-all' }}>{item.item}</p>
                                <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>Type: {item.type} — Current Risk: {item.risk}/100</p>
                            </div>
                        )}

                        {/* Reason dropdown */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                                Why are you reporting this?
                            </label>
                            <select
                                value={reportReason}
                                onChange={e => setReportReason(e.target.value)}
                                style={{
                                    width: '100%', borderRadius: 12, fontSize: 14, padding: '12px 14px',
                                    background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
                                    border: '1px solid rgba(255,255,255,0.1)'
                                }}
                            >
                                {REPORT_REASONS.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>

                        {/* Did you lose money? — Radio buttons */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 8, fontWeight: 500 }}>
                                Did you lose money?
                            </label>
                            <div style={{ display: 'flex', gap: 16 }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>
                                    <input type="radio" name="fraudOccurred" checked={fraudOccurred === true}
                                        onChange={() => setFraudOccurred(true)}
                                        style={{ width: 18, height: 18, accentColor: 'var(--accent-red)' }} />
                                    Yes
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 14, color: 'var(--text-primary)' }}>
                                    <input type="radio" name="fraudOccurred" checked={fraudOccurred === false}
                                        onChange={() => setFraudOccurred(false)}
                                        style={{ width: 18, height: 18, accentColor: 'var(--accent-cyan)' }} />
                                    No
                                </label>
                            </div>
                        </div>

                        {/* Amount lost — conditional */}
                        {fraudOccurred && (
                            <div style={{ marginBottom: 16 }}>
                                <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                                    Amount lost (₹)
                                </label>
                                <input
                                    type="number"
                                    value={amountLost}
                                    onChange={e => setAmountLost(e.target.value)}
                                    placeholder="0.00"
                                    style={{
                                        width: '100%', fontSize: 14, borderRadius: 12, padding: '12px 14px',
                                        background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
                                        border: '1px solid rgba(255,255,255,0.1)'
                                    }}
                                />
                            </div>
                        )}

                        {/* Additional details */}
                        <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 6, fontWeight: 500 }}>
                                Additional details (optional)
                            </label>
                            <textarea
                                rows={3}
                                value={description}
                                onChange={e => setDescription(e.target.value)}
                                placeholder="Tell us what happened..."
                                style={{
                                    width: '100%', borderRadius: 12, fontSize: 14, padding: '12px 14px',
                                    background: 'rgba(255,255,255,0.05)', color: 'var(--text-primary)',
                                    border: '1px solid rgba(255,255,255,0.1)', resize: 'vertical'
                                }}
                            />
                        </div>

                        {/* Helpline info box */}
                        <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 12, padding: 12, marginBottom: 16, fontSize: 13 }}>
                            <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Immediate Help</p>
                            <p style={{ color: 'var(--text-secondary)' }}>📞 Cybercrime Helpline: <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>1930</span> (24×7, free)</p>
                            <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>🌐 <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" style={{ color: 'var(--accent-cyan)' }}>cybercrime.gov.in <ExternalLink size={10} style={{ display: 'inline' }} /></a></p>
                            <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>📱 <a href="https://www.npci.org.in/report-fraud" target="_blank" rel="noopener" style={{ color: 'var(--accent-cyan)' }}>NPCI Report Fraud <ExternalLink size={10} style={{ display: 'inline' }} /></a></p>
                        </div>

                        {submitError && (
                            <p style={{ color: 'var(--accent-red)', fontSize: 13, marginBottom: 12 }}>
                                <AlertTriangle size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                                {submitError}
                            </p>
                        )}

                        {/* Action buttons — SEPARATE submit and cancel */}
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={onClose} className="btn-secondary" style={{ flex: 1, borderRadius: 12 }}>Cancel</button>
                            <button onClick={handleSubmit} className="btn-primary" style={{ flex: 2, borderRadius: 12, fontWeight: 600 }}>
                                Submit Report
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
