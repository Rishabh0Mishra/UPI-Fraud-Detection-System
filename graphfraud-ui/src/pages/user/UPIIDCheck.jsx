import { useState } from 'react'
import { analyseUPIId, getRiskUiConfig, removeReportedItem, addVouchedItem, fetchFraudReports } from '../../utils/fraudAnalysis'
import { vouchSafe, recordScan } from '../../api/fraudApi'
import ReportModal from '../../components/user/ReportModal'

export default function UPIIDCheck() {
    const [upiId, setUpiId] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [history, setHistory] = useState([])
    const [vouched, setVouched] = useState(false)
    const [reportModal, setReportModal] = useState(null)

    const verify = async () => {
        if (!upiId.trim()) return
        setLoading(true)
        setResult(null)
        setVouched(false)
        try {
            // Client-side analysis (10+ checks from fraudAnalysis.js)
            const analysis = analyseUPIId(upiId.trim())
            const ui = getRiskUiConfig(analysis.riskScore)

            // Check backend reports
            const reportData = await fetchFraudReports(upiId.trim()).catch(() => ({ found: false }))
            if (reportData.found && !analysis._previouslyReported) {
                analysis.signals.push({ level: 'danger', text: `Community reported ${reportData.report_count} time(s)` })
                analysis.riskScore = Math.min(100, analysis.riskScore + (reportData.risk_adjustment || 20))
            }

            const resultData = {
                ...analysis,
                ui,
                timestamp: new Date().toLocaleTimeString('en-IN', { hour12: false }),
            }
            setResult(resultData)
            setHistory(prev => [resultData, ...prev.slice(0, 9)])
            await recordScan(upiId.trim(), 'anonymous', analysis.riskScore, ui.isFraud ? 'BLOCKED' : 'VIEWED', false).catch(() => {})
        } catch (err) {
            setResult({ error: true, message: err.message || 'Verification failed' })
        }
        setLoading(false)
    }

    const handleVouch = async () => {
        if (!result || result.error) return
        removeReportedItem(result.upiId)
        addVouchedItem(result.upiId)
        await vouchSafe(result.upiId, 'UPI_ID').catch(() => {})
        const updated = analyseUPIId(result.upiId)
        setResult(prev => ({ ...prev, ...updated, ui: getRiskUiConfig(updated.riskScore) }))
        setVouched(true)
    }

    return (
        <>
            <div className="vh">
                <div className="vh-eyebrow">End User · Identity Verification</div>
                <div className="vh-title">UPI ID Check</div>
                <div className="vh-row"><div className="vh-sub">Verify a UPI ID before sending money. {history.length} checks performed.</div></div>
            </div>
            <div className="portal-body">
                <div className="portal-card">
                    <div className="portal-card-header">
                        <div className="portal-card-title">Verify UPI ID</div>
                        <div className="portal-card-desc">Enter any UPI handle to check its risk profile, registered bank, and community reports.</div>
                    </div>
                    <div className="portal-card-body">
                        <div className="p-input-wrap" style={{ marginBottom: 16 }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text3)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                                <circle cx="8" cy="5" r="3" /><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5" />
                            </svg>
                            <input placeholder="name@upi or merchant@okaxis" value={upiId}
                                onChange={e => setUpiId(e.target.value)} onKeyDown={e => e.key === 'Enter' && verify()} />
                            <button className="p-btn" onClick={verify} disabled={loading}>{loading ? 'Checking...' : 'Verify →'}</button>
                        </div>

                        {/* ── Result ── */}
                        {result && !result.error && (() => {
                            const ui = result.ui || getRiskUiConfig(result.riskScore)
                            return (
                                <div style={{ background: ui.glowColor, border: `1px solid ${ui.borderColor}`, borderRadius: 14, padding: 20, marginBottom: 12 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                                        <div>
                                            <div style={{ fontSize: 15, fontWeight: 700, color: ui.color, fontFamily: 'var(--fb)' }}>
                                                {result._previouslyReported ? '🚫 KNOWN FRAUD' : `${ui.icon} ${ui.level}`}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--fm)', marginTop: 2 }}>{ui.message}</div>
                                        </div>
                                        <div style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${ui.color}`, fontFamily: 'var(--fd)', fontSize: 17, color: ui.color, background: `${ui.color}10` }}>{result.riskScore}</div>
                                    </div>

                                    {/* UPI ID info grid */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                                        {[
                                            ['UPI ID', result.upiId, 'var(--text)'],
                                            ['Bank', result.bank || '—', 'var(--text)'],
                                            ['Handle', result.handle || '—', 'var(--text)'],
                                            ['Format', result.validFormat ? 'Valid NPCI ✓' : 'Invalid ✕', result.validFormat ? 'var(--safe)' : 'var(--danger)'],
                                        ].map(([k, v, c]) => (
                                            <div key={k} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '10px 12px' }}>
                                                <div style={{ fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>{k}</div>
                                                <div style={{ fontFamily: 'var(--fm)', fontSize: 12, color: c, wordBreak: 'break-all' }}>{v}</div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Signals */}
                                    {result.signals && result.signals.length > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            {result.signals.map((s, i) => {
                                                const colors = { danger: 'var(--danger)', warning: 'var(--warn)', safe: 'var(--safe)', info: 'var(--accent)' }
                                                const icons = { danger: '🔴', warning: '🟡', safe: '🟢', info: 'ℹ️' }
                                                return (
                                                    <div key={i} style={{ padding: '5px 0', fontSize: 11, color: colors[s.level] || 'var(--text2)', fontFamily: 'var(--fm)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        {icons[s.level] || '•'} {s.text}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}

                                    {/* Verification checklist (safe) */}
                                    {!ui.isFraud && (
                                        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 14, marginBottom: 12 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, fontFamily: 'var(--fb)' }}>✓ Before paying, confirm:</div>
                                            <ul style={{ color: 'var(--text2)', fontSize: 11, paddingLeft: 16, margin: 0, fontFamily: 'var(--fm)', display: 'flex', flexDirection: 'column', gap: 3 }}>
                                                <li>I recognize this UPI ID</li><li>The name matches the person/business</li>
                                                <li>I initiated this payment</li><li>The amount is correct</li>
                                            </ul>
                                        </div>
                                    )}

                                    {/* Fraud guidance */}
                                    {ui.isFraud && (
                                        <div style={{ background: `${ui.color}08`, border: `1px solid ${ui.color}20`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, fontFamily: 'var(--fb)' }}>⚠ Do NOT send money</div>
                                            <ol style={{ color: 'var(--text2)', fontSize: 11, paddingLeft: 16, fontFamily: 'var(--fm)', display: 'flex', flexDirection: 'column', gap: 3, margin: 0 }}>
                                                <li>Cancel the payment immediately</li>
                                                <li>Block this UPI ID in your app</li>
                                                <li>Report: <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>cybercrime.gov.in</a> | <span style={{ color: 'var(--accent)', fontFamily: 'var(--fd)' }}>1930</span></li>
                                            </ol>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="p-btn" style={{ flex: 1, background: ui.isFraud ? '#e8525215' : 'var(--bg3)', color: ui.isFraud ? 'var(--danger)' : 'var(--text)' }}
                                            onClick={() => setReportModal({ item: result.upiId, type: 'UPI ID', risk: result.riskScore })}>
                                            {ui.isFraud ? '🚨 Report' : '⚠️ Report'}
                                        </button>
                                        {vouched ? (
                                            <button disabled className="p-btn" style={{ flex: 1, background: '#5cba8a15', color: 'var(--safe)', border: '1px solid #5cba8a30' }}>✅ Marked Safe</button>
                                        ) : (
                                            <button onClick={handleVouch} className="p-btn" style={{ flex: 1, color: 'var(--safe)' }}>🛡 Mark Safe</button>
                                        )}
                                        <button onClick={() => { setResult(null); setUpiId(''); setVouched(false) }} className="p-btn" style={{ flex: 1 }}>Check Another</button>
                                    </div>
                                </div>
                            )
                        })()}

                        {result && result.error && (
                            <div className="result-danger">
                                <div className="result-icon" style={{ background: '#e8525215', border: '1px solid #e8525230', color: 'var(--danger)' }}>✕</div>
                                <div><div className="result-title" style={{ color: 'var(--danger)' }}>Verification Failed</div><div className="result-sub" style={{ color: 'var(--text3)' }}>{result.message}</div></div>
                            </div>
                        )}

                        {/* History */}
                        {history.length > 0 && (
                            <div style={{ marginTop: 18 }}>
                                <div style={{ fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: 2, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 8 }}>Recent Checks</div>
                                {history.map((h, i) => {
                                    const hu = h.ui || getRiskUiConfig(h.riskScore)
                                    return (
                                        <div key={i} className="history-row" onClick={() => { setResult(h); setVouched(false) }} style={{ cursor: 'pointer' }}>
                                            <div className="hist-id">{h.upiId}</div>
                                            <div className="hist-type" style={{ color: hu.color }}>{hu.isFraud ? 'FRAUD' : 'SAFE'}</div>
                                            <div><div className="sbw"><div className="sbv" style={{ width: h.riskScore + '%', background: hu.color }} /></div></div>
                                            <div className="hist-time">{h.timestamp}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    <div className="p-footer">Analysis uses client-side checks + community reports · Report fraud at cybercrime.gov.in or call 1930</div>
                </div>
            </div>

            {reportModal && <ReportModal item={reportModal} onClose={() => setReportModal(null)} />}
        </>
    )
}
