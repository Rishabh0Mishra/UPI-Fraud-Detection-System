import { useState } from 'react'
import { X, ExternalLink, CheckCircle } from 'lucide-react'
import { addReportedItem } from '../../utils/fraudAnalysis'

export default function ReportModal({ item, onClose }) {
    const [description, setDescription] = useState('')
    const [phone, setPhone] = useState('')
    const [email, setEmail] = useState('')
    const [submitted, setSubmitted] = useState(false)
    const [refCode, setRefCode] = useState('')

    const handleSubmit = () => {
        const code = `RPT-${Date.now().toString(36).toUpperCase()}`
        const report = { id: Date.now(), item: item?.item || '', type: item?.type || '', risk: item?.risk || 0, description, timestamp: new Date().toISOString(), refCode: code }
        const existing = JSON.parse(localStorage.getItem('fraud_reports') || '[]')
        existing.push(report)
        localStorage.setItem('fraud_reports', JSON.stringify(existing))
        // Add to blacklist so re-scanning immediately flags it
        if (item?.item) addReportedItem(item.item, item.type || 'Unknown')
        setRefCode(code)
        setSubmitted(true)
    }

    return (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.65)', padding: 16 }}>
            <div onClick={e => e.stopPropagation()} className="card fade-in" style={{ maxWidth: 480, width: '100%', borderRadius: 20, padding: 28, maxHeight: '90vh', overflowY: 'auto' }}>
                {submitted ? (
                    <div style={{ textAlign: 'center', padding: 16 }}>
                        <CheckCircle size={44} style={{ color: 'var(--accent-green)', marginBottom: 12 }} />
                        <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Report Submitted</h3>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 4 }}>Our team will investigate this item.</p>
                        <p className="mono" style={{ color: 'var(--accent-cyan)', fontSize: 13, marginBottom: 20 }}>Reference: {refCode}</p>
                        <a href="tel:1930" className="btn-primary" style={{ display: 'inline-flex', borderRadius: 12, padding: '12px 24px', textDecoration: 'none', fontSize: 15, marginBottom: 12 }}>📞 Call 1930 Now</a>
                        <br />
                        <button onClick={onClose} className="btn-secondary" style={{ borderRadius: 10, marginTop: 8 }}>Close</button>
                    </div>
                ) : (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                            <h3 style={{ fontWeight: 600, fontSize: 16 }}>🚨 Report Fraud</h3>
                            <button onClick={onClose} style={{ background: 'transparent', color: 'var(--text-secondary)', padding: 4 }}><X size={18} /></button>
                        </div>
                        {item && (
                            <div style={{ background: 'rgba(255,59,92,0.06)', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
                                <p style={{ color: 'var(--text-secondary)' }}>Item: <span className="mono" style={{ color: 'var(--text-primary)' }}>{item.item}</span></p>
                                <p style={{ color: 'var(--text-secondary)' }}>Type: {item.type} — Risk: {item.risk}/100</p>
                            </div>
                        )}
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>What happened? (optional)</label>
                            <textarea rows={3} value={description} onChange={e => setDescription(e.target.value)} placeholder="Tell us what happened..." style={{ borderRadius: 10, fontSize: 14 }} />
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Phone (optional)</label>
                                <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+91" style={{ fontSize: 13, borderRadius: 8, padding: '8px 10px' }} />
                            </div>
                            <div>
                                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Email (optional)</label>
                                <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@email.com" style={{ fontSize: 13, borderRadius: 8, padding: '8px 10px' }} />
                            </div>
                        </div>
                        <div style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.1)', borderRadius: 10, padding: 12, marginBottom: 16, fontSize: 13 }}>
                            <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 12, color: 'var(--text-muted)' }}>IMMEDIATE HELP</p>
                            <p style={{ color: 'var(--text-secondary)' }}>📞 Cybercrime Helpline: <span className="mono" style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>1930</span> (24×7, free)</p>
                            <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>🌐 <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" style={{ color: 'var(--accent-cyan)' }}>cybercrime.gov.in <ExternalLink size={10} style={{ display: 'inline' }} /></a></p>
                            <p style={{ color: 'var(--text-secondary)', marginTop: 4 }}>📱 <a href="https://www.npci.org.in/report-fraud" target="_blank" rel="noopener" style={{ color: 'var(--accent-cyan)' }}>NPCI Report Fraud <ExternalLink size={10} style={{ display: 'inline' }} /></a></p>
                        </div>
                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={onClose} className="btn-secondary" style={{ flex: 1, borderRadius: 10 }}>Cancel</button>
                            <button onClick={handleSubmit} className="btn-primary" style={{ flex: 2, borderRadius: 10 }}>Submit Report + Call 1930</button>
                        </div>
                    </>
                )}
            </div>
        </div>
    )
}
