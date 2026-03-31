import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { analyseUPIId, getRiskUiConfig, fetchFraudReports, removeReportedItem, addVouchedItem } from '../../utils/fraudAnalysis'
import { vouchSafe } from '../../api/fraudApi'
import RiskGauge from '../common/RiskGauge'
import SignalList from '../common/SignalList'

export default function UPIChecker({ onReport }) {
    const [upiId, setUpiId] = useState('')
    const [result, setResult] = useState(null)
    const [reportData, setReportData] = useState(null)
    const [loading, setLoading] = useState(false)
    const [vouched, setVouched] = useState(false)

    const handleCheck = async () => {
        if (!upiId.trim()) return
        setLoading(true)
        setVouched(false)
        const analysisResult = analyseUPIId(upiId.trim())

        // If format and handle passed, also check fraud reports from backend
        if (!analysisResult.formatError && !analysisResult.handleError) {
            try {
                const reports = await fetchFraudReports(upiId.trim())
                if (reports.found && reports.report_count > 0) {
                    setReportData(reports)
                    analysisResult.signals.push({
                        level: 'danger',
                        text: `⚠️ This UPI ID has been reported ${reports.report_count} time(s) as fraudulent.\nConfirmed fraud: ${reports.confirmed_fraud_count || 0} | Total lost: ₹${(reports.total_amount_lost || 0).toLocaleString('en-IN')}`
                    })
                    analysisResult.riskScore = Math.min(100, analysisResult.riskScore + (reports.risk_adjustment || 0))
                }
            } catch (e) {
                console.warn('Report check failed:', e)
            }
        }

        setResult(analysisResult)
        setLoading(false)
    }

    const reset = () => { setResult(null); setUpiId(''); setReportData(null); setVouched(false) }

    const handleVouch = async () => {
        if (!result?.upiId) return
        removeReportedItem(result.upiId)
        addVouchedItem(result.upiId)
        await vouchSafe(result.upiId, 'UPI_ID')
        // Re-run analysis so score updates immediately
        const updated = analyseUPIId(result.upiId)
        setResult(updated)
        setVouched(true)
    }

    if (result) {
        const rs = result.riskScore
        const ui = getRiskUiConfig(rs)
        const isFormatOrHandleError = result.formatError || result.handleError

        return (
            <div className="fade-in" style={{ background: ui.glowColor, border: `1px solid ${ui.borderColor}`, borderRadius: 20, padding: 32 }}>
                <h3 style={{ color: ui.color, fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{ui.icon}  {ui.level}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 16 }}>{ui.message}</p>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0' }}><RiskGauge score={rs} size={130} /></div>

                {/* Info table */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 15 }}>
                    {[
                        ['UPI ID', result.upiId],
                        ['Bank', result.bankName || 'Unknown'],
                        ['Handle', result.handle ? `@${result.handle}` : '—']
                    ].map(([k, v]) => (
                        <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{k}</span><span className="mono">{v}</span>
                        </div>
                    ))}
                </div>

                {/* Report data from backend */}
                {reportData && reportData.found && (
                    <div style={{ background: 'rgba(255,59,92,0.06)', border: '1px solid rgba(255,59,92,0.15)', borderRadius: 14, padding: 16, marginBottom: 16 }}>
                        <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--accent-red)', marginBottom: 8 }}>⚠️ PREVIOUSLY REPORTED AS FRAUD</p>
                        {[
                            ['Times reported', reportData.report_count],
                            ['Confirmed frauds', reportData.confirmed_fraud_count || 0],
                            ['Total lost', `₹${(reportData.total_amount_lost || 0).toLocaleString('en-IN')}`],
                            ['First reported', reportData.first_reported ? new Date(reportData.first_reported).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—'],
                            ['Last reported', reportData.last_reported ? new Date(reportData.last_reported).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—'],
                        ].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                                <span className="mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{v}</span>
                            </div>
                        ))}
                    </div>
                )}

                <SignalList signals={result.signals} />

                {!ui.isFraud && !isFormatOrHandleError && (
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16, marginTop: 16 }}>
                        <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>✓ VERIFICATION CHECKLIST:</p>
                        <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 8 }}>Before proceeding, confirm:</p>
                        <ul style={{ color: 'var(--text-secondary)', fontSize: 13, paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                            <li>I recognize this payee/merchant</li>
                            <li>The payee name matches the business/person</li>
                            <li>I initiated this transaction</li>
                            <li>The amount is correct</li>
                            <li>I trust this recipient</li>
                        </ul>
                        <p style={{ color: 'var(--accent-cyan)', fontSize: 13, marginTop: 12, fontWeight: 500 }}>
                            ⚠️ Never pay based on phone calls or messages asking you to make "urgent" payments
                        </p>
                    </div>
                )}
                {ui.isFraud && (
                    <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginTop: 16, lineHeight: 1.7 }}>
                        This UPI ID has patterns commonly seen in scam accounts. Do not transfer money to this ID.
                    </p>
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
                    <button onClick={() => onReport?.({ item: result.upiId, type: 'UPI ID', risk: rs })}
                        className="btn-secondary"
                        style={{
                            flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, minWidth: 120,
                            ...(ui.isFraud ? { background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)', border: '1px solid rgba(255,59,92,0.2)' } : {})
                        }}>
                        {ui.isFraud ? '🚨 Report as Fraud' : '⚠️ Report as Suspicious'}
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
