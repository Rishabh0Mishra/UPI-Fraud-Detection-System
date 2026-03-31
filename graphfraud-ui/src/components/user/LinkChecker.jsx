import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { analyseLink, getRiskUiConfig, removeReportedItem, addVouchedItem } from '../../utils/fraudAnalysis'
import { vouchSafe } from '../../api/fraudApi'
import RiskGauge from '../common/RiskGauge'
import SignalList from '../common/SignalList'

export default function LinkChecker({ onReport }) {
    const [url, setUrl] = useState('')
    const [result, setResult] = useState(null)
    const [vouched, setVouched] = useState(false)

    const handleCheck = () => { if (!url.trim()) return; setResult(analyseLink(url.trim())); setVouched(false) }
    const reset = () => { setResult(null); setUrl(''); setVouched(false) }

    const handleVouch = async () => {
        if (!result?.url) return
        removeReportedItem(result.url)
        addVouchedItem(result.url)
        await vouchSafe(result.url, 'URL')
        // Re-run analysis so score updates immediately
        const updated = analyseLink(result.url)
        setResult(updated)
        setVouched(true)
    }

    if (result) {
        const rs = result.riskScore
        const isPreviouslyReported = result._previouslyReported
        const ui = getRiskUiConfig(rs)

        return (
            <div className="fade-in" style={{ background: ui.glowColor, border: `1px solid ${ui.borderColor}`, borderRadius: 20, padding: 32 }}>
                <h3 style={{ color: ui.color, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
                    {isPreviouslyReported ? '🚫 KNOWN FRAUD' : `${ui.icon} ${ui.level}`}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>
                    {isPreviouslyReported ? 'PREVIOUSLY REPORTED SCAM' : ui.message}
                </p>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}><RiskGauge score={rs} size={130} /></div>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 14 }}>
                    {[['Domain', result.domain], ['Protocol', result.isHTTPS ? 'HTTPS (secure) ✓' : 'HTTP (not secure) ⚠'], ['Subdomains', String((result.domain || '').split('.').length - 2)]].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{k}</span><span className="mono" style={{ wordBreak: 'break-all' }}>{v}</span>
                        </div>
                    ))}
                </div>
                <SignalList signals={result.signals} />
                {!ui.isFraud && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16, marginTop: 16 }}>
                        <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>✓ VERIFICATION CHECKLIST:</p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>Before proceeding, confirm:</p>
                        <ul style={{ color: 'var(--text-secondary)', fontSize: 13, paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <li>I recognize this website</li>
                            <li>The URL matches the expected domain</li>
                            <li>I wasn't sent this link unsolicited</li>
                            <li>I won't enter sensitive information</li>
                        </ul>
                        <p style={{ color: 'var(--accent-cyan)', fontSize: 13, marginTop: 12, fontWeight: 500 }}>
                            ⚠️ Never enter OTP, PIN, or passwords on unfamiliar websites
                        </p>
                    </div>
                )}
                {ui.isFraud && (
                    <button disabled style={{ width: '100%', marginTop: 16, padding: '14px 20px', background: 'rgba(255,59,92,0.15)', color: 'var(--accent-red)', border: '1px solid rgba(255,59,92,0.3)', borderRadius: 12, fontSize: 15, fontWeight: 600, cursor: 'not-allowed', opacity: 0.9 }} title="We recommend not visiting this link">
                        🚫 DO NOT VISIT THIS LINK
                    </button>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
                    <button onClick={() => onReport?.({ item: result.url, type: 'Link / URL', risk: rs })} className="btn-secondary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 120 }}>
                        {ui.isFraud ? '🚨 Report to confirm' : '⚠️ Report as Suspicious'}
                    </button>
                    {vouched ? (
                        <button disabled className="btn-secondary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 120, background: 'rgba(0,229,160,0.1)', color: '#00E5A0', border: '1px solid rgba(0,229,160,0.3)' }}>
                            ✅ Marked as Safe
                        </button>
                    ) : (
                        <button onClick={handleVouch} className="btn-secondary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 120, color: '#00E5A0' }}>
                            <ShieldCheck size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Mark as Safe
                        </button>
                    )}
                    <button onClick={reset} className="btn-primary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 120 }}>Check Another</button>
                </div>
            </div>
        )
    }

    return (
        <div className="fade-in">
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 12 }}>Paste a suspicious link you received via WhatsApp, SMS, or email:</p>
            <div style={{ display: 'flex', gap: 10 }}>
                <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://sbi-refund-helpdesk.in/claim?ref=abc" style={{ flex: 1, fontSize: 14, borderRadius: 12, padding: '12px 14px' }}
                    onKeyDown={e => e.key === 'Enter' && handleCheck()} />
                <button onClick={handleCheck} className="btn-primary" style={{ borderRadius: 12, padding: '12px 20px', whiteSpace: 'nowrap' }} disabled={!url.trim()}>🔍 Check This Link</button>
            </div>
        </div>
    )
}
