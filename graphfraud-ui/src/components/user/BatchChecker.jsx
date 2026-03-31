import { useState, useCallback } from 'react'
import { Loader2, ChevronDown, ChevronUp, Download } from 'lucide-react'
import { detectInputType, TYPE_LABELS } from '../../utils/checkTypeDetector'
import { analyseQRContent, analyseLink, analyseUPIId, generateTextReport } from '../../utils/fraudAnalysis'
import { scoreTransaction } from '../../api/fraudApi'
import SignalList from '../common/SignalList'

export default function BatchChecker({ onReport }) {
    const [text, setText] = useState('')
    const [results, setResults] = useState([])
    const [processing, setProcessing] = useState(false)
    const [progress, setProgress] = useState(0)
    const [expanded, setExpanded] = useState({})

    const processItems = useCallback(async () => {
        const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean).slice(0, 20)
        if (!lines.length) return
        setProcessing(true); setResults([]); setProgress(0)
        const out = []
        for (let i = 0; i < lines.length; i++) {
            await new Promise(r => setTimeout(r, 150))
            const line = lines[i]
            const type = detectInputType(line)
            let r = { item: line, type: TYPE_LABELS[type], riskScore: 0, signals: [], status: '' }
            if (type === 'qr') {
                const a = analyseQRContent(line); r.riskScore = a.riskScore; r.signals = a.signals
            } else if (type === 'link') {
                const a = analyseLink(line); r.riskScore = a.riskScore; r.signals = a.signals
            } else if (type === 'upi') {
                const a = analyseUPIId(line); r.riskScore = a.riskScore; r.signals = a.signals
            } else if (type === 'transaction') {
                try {
                    const res = await scoreTransaction({ transaction_id: line, sender_user_id: 'USR000001', receiver_id: 'USR000002', amount: 500, transaction_type: 'P2P', sender_account_age_days: 365, sender_kyc_level: 'full', sender_income_tier: 'middle', sender_avg_txn_amount: 500, sender_vulnerability_score: 0.3 })
                    r.riskScore = res.decision === 'BLOCK' ? 90 : res.decision === 'REVIEW' ? 55 : 10
                    r.status = res.decision
                    r.signals = [{ level: res.decision === 'BLOCK' ? 'danger' : res.decision === 'REVIEW' ? 'warning' : 'safe', text: `Decision: ${res.decision}` }]
                } catch { r.riskScore = 0; r.signals = [{ level: 'info', text: 'Could not look up transaction' }] }
            } else {
                r.riskScore = 0; r.signals = [{ level: 'warning', text: 'Unrecognised format — could not check this item' }]
            }
            r.status = r.status || (r.riskScore >= 50 ? 'FRAUD' : 'NOT FRAUD')
            out.push(r)
            setResults([...out]); setProgress(((i + 1) / lines.length) * 100)
        }
        setProcessing(false)
    }, [text])

    const toggleRow = (i) => setExpanded(p => ({ ...p, [i]: !p[i] }))

    const downloadReport = () => {
        const report = generateTextReport(results)
        const blob = new Blob([report], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href = url; a.download = `fraud-check-report-${Date.now()}.txt`; a.click()
        URL.revokeObjectURL(url)
    }

    const safeCount = results.filter(r => r.riskScore < 50).length
    const fraudCount = results.filter(r => r.riskScore >= 50).length
    const lineCount = text.trim().split('\n').filter(l => l.trim()).length

    return (
        <div className="fade-in">
            {results.length === 0 ? (
                <>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 12 }}>Paste one item per line (UPI IDs, transaction IDs, or links). Maximum 20 items.</p>
                    <textarea rows={8} value={text} onChange={e => setText(e.target.value)} placeholder={'ramesh@oksbi\nsbirefund2024@ybl\nTXN00497577\nhttps://sbi-refund-claim.tk/verify\nupi://pay?pa=scammer@xyz&am=50000'}
                        style={{ width: '100%', fontSize: 14, borderRadius: 12, padding: 14, fontFamily: 'var(--font-mono)', lineHeight: 1.8 }} />
                    <button onClick={processItems} disabled={processing || !text.trim()} className="btn-primary" style={{ width: '100%', borderRadius: 12, padding: '14px 20px', fontSize: 15, marginTop: 12 }}>
                        {processing ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : `🔍 Check All (${Math.min(lineCount, 20)} items)`}
                    </button>
                </>
            ) : (
                <>
                    {processing && (
                        <div style={{ background: 'var(--bg-elevated)', borderRadius: 8, height: 6, marginBottom: 16, overflow: 'hidden' }}>
                            <div style={{ height: '100%', width: `${progress}%`, background: 'linear-gradient(90deg, #00D4FF, #00E5A0)', transition: 'width 0.2s', borderRadius: 8 }} />
                        </div>
                    )}
                    <div style={{ borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', marginBottom: 16 }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 140px', padding: '10px 14px', background: 'var(--bg-elevated)', fontSize: 11, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
                            <span>Item</span><span>Type</span><span>Classification</span>
                        </div>
                        {results.map((r, i) => (
                            <div key={i}>
                                <div onClick={() => toggleRow(i)} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 140px', padding: '10px 14px', borderTop: '1px solid var(--border)', cursor: 'pointer', alignItems: 'center', fontSize: 13, background: expanded[i] ? 'rgba(0,212,255,0.03)' : 'transparent', transition: 'background 0.15s' }}>
                                    <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        {expanded[i] ? <ChevronUp size={12} /> : <ChevronDown size={12} />}{r.item}
                                    </span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{r.type}</span>
                                    <span style={{ color: r.riskScore >= 50 ? '#FF3B5C' : '#00E5A0', fontSize: 12, fontWeight: 600 }}>
                                        {r.riskScore >= 50 ? '🚨 FRAUD' : '✅ NOT FRAUD'}
                                    </span>
                                </div>
                                {expanded[i] && <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', background: 'rgba(0,0,0,0.15)' }}><SignalList signals={r.signals} /></div>}
                            </div>
                        ))}
                    </div>
                    {!processing && (
                        <>
                            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                                Summary: <span style={{ color: '#00E5A0' }}>{safeCount} Not Fraud ✅</span> &nbsp; <span style={{ color: '#FF3B5C' }}>{fraudCount} Fraud 🚨</span>
                            </p>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <button onClick={downloadReport} className="btn-secondary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 160 }}><Download size={14} /> Download Full Report</button>
                                {fraudCount > 0 && <button onClick={() => results.filter(r => r.riskScore >= 50).forEach(r => onReport?.({ item: r.item, type: r.type, risk: r.riskScore }))} className="btn-secondary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, color: 'var(--accent-red)', minWidth: 160 }}>🚨 Report All Fraud</button>}
                                <button onClick={() => { setResults([]); setText('') }} className="btn-primary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 120 }}>Check More</button>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    )
}
