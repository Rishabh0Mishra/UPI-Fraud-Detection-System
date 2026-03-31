import { useState } from 'react'
import { analyseLink, getRiskUiConfig, removeReportedItem, addVouchedItem, fetchFraudReports } from '../../utils/fraudAnalysis'
import { vouchSafe, recordScan } from '../../api/fraudApi'
import ReportModal from '../../components/user/ReportModal'

export default function LinkCheck() {
    const [url, setUrl] = useState('')
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [history, setHistory] = useState([])
    const [vouched, setVouched] = useState(false)
    const [reportModal, setReportModal] = useState(null)

    const checkLink = async () => {
        if (!url.trim()) return
        setLoading(true)
        setResult(null)
        setVouched(false)
        try {
            // Client-side analysis (12+ checks from fraudAnalysis.js)
            const analysis = analyseLink(url.trim())
            const ui = getRiskUiConfig(analysis.riskScore)

            // Also check backend reports
            const reportData = await fetchFraudReports(url.trim()).catch(() => ({ found: false }))
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
            await recordScan(url.trim(), 'anonymous', analysis.riskScore, ui.isFraud ? 'BLOCKED' : 'VIEWED', false).catch(() => {})
        } catch (err) {
            setResult({ error: true, message: err.message || 'Analysis failed' })
        }
        setLoading(false)
    }

    const handleVouch = async () => {
        if (!result || result.error) return
        removeReportedItem(result.url)
        addVouchedItem(result.url)
        await vouchSafe(result.url, 'URL').catch(() => {})
        const updated = analyseLink(result.url)
        setResult(prev => ({ ...prev, ...updated, ui: getRiskUiConfig(updated.riskScore) }))
        setVouched(true)
    }

    return (
        <>
            <div className="vh">
                <div className="vh-eyebrow">End User · Link Safety</div>
                <div className="vh-title">Link Check</div>
                <div className="vh-row"><div className="vh-sub">Paste any suspicious URL or payment link to verify before clicking. {history.length} links checked.</div></div>
            </div>
            <div className="portal-body">
                <div className="portal-card">
                    <div className="portal-card-header">
                        <div className="portal-card-title">Verify a Link</div>
                        <div className="portal-card-desc">Paste a URL from an SMS, WhatsApp message, or email to check if it's a phishing or fraud link.</div>
                    </div>
                    <div className="portal-card-body">
                        <div className="p-input-wrap" style={{ marginBottom: 14 }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text3)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                                <path d="M6.5 9.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5L7 4" />
                                <path d="M9.5 6.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5L9 12" />
                            </svg>
                            <input placeholder="https://suspicious-link.com/pay?ref=..." value={url}
                                onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && checkLink()} />
                            <button className="p-btn" onClick={checkLink} disabled={loading}>{loading ? 'Checking...' : 'Check →'}</button>
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

                                    {/* URL details */}
                                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
                                        {[['Domain', result.domain || '—'], ['Protocol', result.isHTTPS ? 'HTTPS ✓' : 'HTTP ⚠️'], ['Full URL', result.url]].map(([k, v]) => (
                                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, borderBottom: '1px solid rgba(255,255,255,0.04)', fontFamily: 'var(--fm)' }}>
                                                <span style={{ color: 'var(--text3)' }}>{k}</span>
                                                <span style={{ color: 'var(--text)', wordBreak: 'break-all', textAlign: 'right', maxWidth: '70%' }}>{v}</span>
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

                                    {/* Fraud guidance */}
                                    {ui.isFraud && (
                                        <div style={{ background: `${ui.color}08`, border: `1px solid ${ui.color}20`, borderRadius: 10, padding: 14, marginBottom: 12 }}>
                                            <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 11, fontFamily: 'var(--fb)' }}>⚠ Do NOT visit this link</div>
                                            <ol style={{ color: 'var(--text2)', fontSize: 11, paddingLeft: 16, fontFamily: 'var(--fm)', display: 'flex', flexDirection: 'column', gap: 3, margin: 0 }}>
                                                <li>Do not enter any personal or payment details</li>
                                                <li>Block the sender who shared this link</li>
                                                <li>Report: <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" style={{ color: 'var(--accent)' }}>cybercrime.gov.in</a> | Helpline: <span style={{ color: 'var(--accent)', fontFamily: 'var(--fd)' }}>1930</span></li>
                                            </ol>
                                        </div>
                                    )}

                                    {/* Actions */}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className="p-btn" style={{ flex: 1, background: ui.isFraud ? '#e8525215' : 'var(--bg3)', color: ui.isFraud ? 'var(--danger)' : 'var(--text)' }}
                                            onClick={() => setReportModal({ item: result.url, type: 'Link / URL', risk: result.riskScore })}>
                                            {ui.isFraud ? '🚨 Report' : '⚠️ Report'}
                                        </button>
                                        {vouched ? (
                                            <button disabled className="p-btn" style={{ flex: 1, background: '#5cba8a15', color: 'var(--safe)', border: '1px solid #5cba8a30' }}>✅ Marked Safe</button>
                                        ) : (
                                            <button onClick={handleVouch} className="p-btn" style={{ flex: 1, color: 'var(--safe)' }}>🛡 Mark Safe</button>
                                        )}
                                        <button onClick={() => { setResult(null); setUrl(''); setVouched(false) }} className="p-btn" style={{ flex: 1 }}>Check Another</button>
                                    </div>
                                </div>
                            )
                        })()}

                        {result && result.error && (
                            <div className="result-danger">
                                <div className="result-icon" style={{ background: '#e8525215', border: '1px solid #e8525230', color: 'var(--danger)' }}>✕</div>
                                <div><div className="result-title" style={{ color: 'var(--danger)' }}>Check Failed</div><div className="result-sub" style={{ color: 'var(--text3)' }}>{result.message}</div></div>
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
                                            <div className="hist-id" style={{ fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.domain || h.url}</div>
                                            <div className="hist-type" style={{ color: hu.color }}>{hu.isFraud ? 'FRAUD' : 'SAFE'}</div>
                                            <div><div className="sbw"><div className="sbv" style={{ width: h.riskScore + '%', background: hu.color }} /></div></div>
                                            <div className="hist-time">{h.timestamp}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    <div className="p-footer">Analysis uses client-side fraud checks including 293K+ known fraud domains · Report fraud: 1930</div>
                </div>
            </div>

            {reportModal && <ReportModal item={reportModal} onClose={() => setReportModal(null)} />}
        </>
    )
}
