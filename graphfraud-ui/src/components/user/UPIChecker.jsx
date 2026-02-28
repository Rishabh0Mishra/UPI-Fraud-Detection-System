import { useState } from 'react'
import { analyseUPIId } from '../../utils/fraudAnalysis'
import RiskGauge from '../common/RiskGauge'
import SignalList from '../common/SignalList'

export default function UPIChecker({ onReport }) {
    const [upiId, setUpiId] = useState('')
    const [result, setResult] = useState(null)

    const handleCheck = () => { if (!upiId.trim()) return; setResult(analyseUPIId(upiId.trim())) }
    const reset = () => { setResult(null); setUpiId('') }

    if (result) {
        const rs = result.riskScore
        const isSafe = rs < 30, isWarn = rs >= 30 && rs < 60
        const borderColor = isSafe ? 'rgba(0,229,160,0.3)' : isWarn ? 'rgba(255,176,32,0.3)' : 'rgba(255,59,92,0.4)'
        const glowColor = isSafe ? 'rgba(0,229,160,0.06)' : isWarn ? 'rgba(255,176,32,0.06)' : 'rgba(255,59,92,0.08)'
        const headerColor = isSafe ? '#00E5A0' : isWarn ? '#FFB020' : '#FF3B5C'
        const headerText = isSafe ? '✅  UPI ID Looks Safe' : isWarn ? '⚠️  Suspicious UPI ID — Be Careful' : '🔴  CAUTION — DO NOT SEND MONEY'

        return (
            <div className="fade-in" style={{ background: glowColor, border: `1px solid ${borderColor}`, borderRadius: 20, padding: 32 }}>
                <h3 style={{ color: headerColor, fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{headerText}</h3>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}><RiskGauge score={rs} size={130} /></div>
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 15 }}>
                    {[['UPI ID', result.upiId], ['Bank', result.bankName], ['Handle', `@${result.handle}`]].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{k}</span><span className="mono">{v}</span>
                        </div>
                    ))}
                </div>
                <SignalList signals={result.signals} />
                {rs > 60 && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 16, lineHeight: 1.7 }}>
                        This UPI ID has patterns commonly seen in scam accounts. Do not transfer money to this ID.
                    </p>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                    {rs > 30 && <button onClick={() => onReport?.({ item: result.upiId, type: 'UPI ID', risk: rs })} className="btn-secondary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 140 }}>🚨 Report This ID</button>}
                    <button onClick={reset} className="btn-primary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 140 }}>Check Another</button>
                </div>
            </div>
        )
    }

    return (
        <div className="fade-in">
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, marginBottom: 12 }}>Enter a UPI ID to check before sending money:</p>
            <div style={{ display: 'flex', gap: 10 }}>
                <input value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="name@oksbi" style={{ flex: 1, fontSize: 14, borderRadius: 12, padding: '12px 14px' }}
                    onKeyDown={e => e.key === 'Enter' && handleCheck()} />
                <button onClick={handleCheck} className="btn-primary" style={{ borderRadius: 12, padding: '12px 20px', whiteSpace: 'nowrap' }} disabled={!upiId.trim()}>🔍 Check</button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 10 }}>Examples: name@oksbi, merchant@paytm, id@ybl</p>
        </div>
    )
}
