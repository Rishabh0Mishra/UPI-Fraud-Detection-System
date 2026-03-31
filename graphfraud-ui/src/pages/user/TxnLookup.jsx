import { useState } from 'react'
import { getLiveFeedRecent, scoreTransaction } from '../../api/fraudApi'
import { getRiskUiConfig, translateReason } from '../../utils/fraudAnalysis'
import ReportModal from '../../components/user/ReportModal'

export default function TxnLookup() {
    const [txnId, setTxnId] = useState('')
    const [loading, setLoading] = useState(false)
    const [result, setResult] = useState(null)
    const [history, setHistory] = useState([])
    const [reportModal, setReportModal] = useState(null)

    const lookup = async () => {
        if (!txnId.trim()) return
        setLoading(true)
        setResult(null)
        try {
            // First try to find the transaction in recent feed
            const feed = await getLiveFeedRecent(200)
            const txns = feed?.transactions || []
            const found = txns.find(t =>
                (t.transaction_id || '').includes(txnId.trim()) ||
                txnId.trim().includes((t.transaction_id || '').slice(-8))
            )

            if (found) {
                const isFraud = found.classification === 'FRAUD' || found.decision === 'BLOCK'
                const score = (found.internal_risk_score || found.fraud_probability || 0) * 100
                const ui = getRiskUiConfig(score)
                const resultData = {
                    txnId: found.transaction_id,
                    sender: found.sender_user_id || found.upi_id_sender || '—',
                    receiver: found.receiver_id || found.upi_id_receiver || '—',
                    amount: found.amount || 0,
                    decision: found.decision || (isFraud ? 'BLOCK' : 'ALLOW'),
                    score,
                    isFraud,
                    reason: translateReason(found.reason) || found.reason || '—',
                    rawReason: found.reason,
                    timestamp: found.timestamp ? new Date(found.timestamp).toLocaleString('en-IN') : '—',
                    type: found.transaction_type || 'P2P',
                    indicators: found.fraud_indicators || [],
                    trustIndicators: found.trust_indicators || [],
                    source: 'live_feed',
                    ui,
                }
                setResult(resultData)
                setHistory(prev => [resultData, ...prev.slice(0, 9)])
            } else {
                // If not found in feed, score a synthetic lookup
                const res = await scoreTransaction({
                    transaction_id: txnId.trim(),
                    sender_user_id: 'LOOKUP_USER',
                    receiver_id: 'LOOKUP_TARGET',
                    amount: 1000,
                    transaction_type: 'P2P',
                    timestamp: new Date().toISOString().slice(0, 16),
                    sender_account_age_days: 365,
                    sender_kyc_level: 'full',
                    sender_income_tier: 'middle',
                    sender_avg_txn_amount: 500,
                })
                const isFraud = res.classification === 'FRAUD' || res.decision === 'BLOCK'
                const score = ((res.fraud_probability || res.internal_risk_score || 0) * 100)
                const ui = getRiskUiConfig(score)
                const resultData = {
                    txnId: txnId.trim(),
                    sender: '—',
                    receiver: '—',
                    amount: 0,
                    decision: res.decision || (isFraud ? 'BLOCK' : 'ALLOW'),
                    score,
                    isFraud,
                    reason: translateReason(res.reason) || res.reason || 'Scored via model',
                    rawReason: res.reason,
                    timestamp: new Date().toLocaleString('en-IN'),
                    type: 'P2P',
                    indicators: res.fraud_indicators || [],
                    trustIndicators: res.trust_indicators || [],
                    source: 'model_score',
                    ui,
                }
                setResult(resultData)
                setHistory(prev => [resultData, ...prev.slice(0, 9)])
            }
        } catch (err) {
            setResult({ error: true, message: err.message || 'Lookup failed' })
        }
        setLoading(false)
    }

    return (
        <>
            <div className="vh">
                <div className="vh-eyebrow">End User · Transaction History</div>
                <div className="vh-title">Transaction Lookup</div>
                <div className="vh-row"><div className="vh-sub">Look up any transaction ID to check its risk assessment. {history.length} lookups performed.</div></div>
            </div>
            <div className="portal-body">
                <div className="portal-card">
                    <div className="portal-card-header">
                        <div className="portal-card-title">Look Up a Transaction</div>
                        <div className="portal-card-desc">Enter your transaction ID from your UPI app to check its risk assessment and current status.</div>
                    </div>
                    <div className="portal-card-body">
                        <div className="p-input-wrap" style={{ marginBottom: 16 }}>
                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--text3)" strokeWidth="1.5" style={{ flexShrink: 0 }}>
                                <circle cx="7" cy="7" r="5" /><path d="M11 11l3 3" />
                            </svg>
                            <input placeholder="Transaction ID — e.g. TXN_A1B2C3D4" value={txnId}
                                onChange={e => setTxnId(e.target.value)} onKeyDown={e => e.key === 'Enter' && lookup()} />
                            <button className="p-btn" onClick={lookup} disabled={loading}>{loading ? 'Looking...' : 'Look Up →'}</button>
                        </div>

                        {/* ── Result ── */}
                        {result && !result.error && (() => {
                            const ui = result.ui || getRiskUiConfig(result.score)
                            return (
                                <div style={{ marginTop: 4 }}>
                                    <div style={{ background: ui.glowColor, border: `1px solid ${ui.borderColor}`, borderRadius: 14, padding: 20, marginBottom: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                            <div>
                                                <div style={{ fontSize: 15, fontWeight: 700, color: ui.color, fontFamily: 'var(--fb)' }}>
                                                    {ui.icon} {result.isFraud ? 'Transaction Blocked' : 'Transaction Allowed'}
                                                </div>
                                                <div style={{ fontSize: 11, color: 'var(--text2)', fontFamily: 'var(--fm)', marginTop: 2 }}>{result.reason}</div>
                                            </div>
                                            <div style={{ width: 52, height: 52, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `3px solid ${ui.color}`, fontFamily: 'var(--fd)', fontSize: 17, color: ui.color, background: `${ui.color}10` }}>{Math.round(result.score)}</div>
                                        </div>

                                        {/* Details grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 12 }}>
                                            {[
                                                ['Transaction ID', result.txnId],
                                                ['Timestamp', result.timestamp],
                                                ['Sender', result.sender],
                                                ['Receiver', result.receiver],
                                                ['Amount', result.amount ? `₹${result.amount.toLocaleString('en-IN')}` : '—'],
                                                ['Type', result.type],
                                                ['Source', result.source === 'live_feed' ? 'Found in live feed' : 'Scored by model'],
                                                ['Risk Score', `${result.score.toFixed(1)}%`],
                                            ].map(([k, v]) => (
                                                <div key={k} style={{ background: 'var(--bg3)', padding: '8px 12px' }}>
                                                    <div style={{ fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 3 }}>{k}</div>
                                                    <div style={{ fontFamily: 'var(--fm)', fontSize: 11, color: 'var(--text)', wordBreak: 'break-all' }}>{v}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Indicators */}
                                        {result.indicators.length > 0 && (
                                            <div style={{ marginBottom: 8 }}>
                                                <div style={{ fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--danger)', marginBottom: 6 }}>Risk Flags</div>
                                                {result.indicators.map((f, i) => (
                                                    <div key={i} style={{ padding: '4px 0', fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--fm)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        🔴 {f.replace(/_/g, ' ')}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        {result.trustIndicators && result.trustIndicators.length > 0 && (
                                            <div>
                                                <div style={{ fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--safe)', marginBottom: 6 }}>Trust Factors</div>
                                                {result.trustIndicators.map((f, i) => (
                                                    <div key={i} style={{ padding: '4px 0', fontSize: 11, color: 'var(--safe)', fontFamily: 'var(--fm)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                                        🟢 {f.replace(/_/g, ' ')}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Action buttons */}
                                        <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                                            {result.isFraud && (
                                                <button className="p-btn" style={{ flex: 1, background: '#e8525215', color: 'var(--danger)' }}
                                                    onClick={() => setReportModal({ item: result.txnId, type: 'Transaction', risk: result.score })}>
                                                    🚨 Report
                                                </button>
                                            )}
                                            <button className="p-btn" onClick={() => { setResult(null); setTxnId('') }} style={{ flex: 1 }}>Look Up Another</button>
                                        </div>
                                    </div>
                                </div>
                            )
                        })()}

                        {result && result.error && (
                            <div className="result-danger">
                                <div className="result-icon" style={{ background: '#e8525215', border: '1px solid #e8525230', color: 'var(--danger)' }}>✕</div>
                                <div><div className="result-title" style={{ color: 'var(--danger)' }}>Lookup Failed</div><div className="result-sub" style={{ color: 'var(--text3)' }}>{result.message}</div></div>
                            </div>
                        )}

                        {/* History */}
                        {history.length > 0 && (
                            <div style={{ marginTop: 18 }}>
                                <div style={{ fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 8 }}>Recent Lookups</div>
                                {history.map((h, i) => {
                                    const hu = h.ui || getRiskUiConfig(h.score)
                                    return (
                                        <div key={i} className="history-row" onClick={() => setResult(h)} style={{ cursor: 'pointer' }}>
                                            <div className="hist-id">TXN · {(h.txnId || '').slice(-8)}</div>
                                            <div className="hist-type" style={{ color: hu.color }}>{h.decision}</div>
                                            <div><div className="sbw"><div className="sbv" style={{ width: Math.min(h.score, 100) + '%', background: hu.color }} /></div></div>
                                            <div className="hist-time">{h.timestamp?.split(',')[1]?.trim() || '—'}</div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                    <div className="p-footer">Lookups first search the live feed, then fall back to model scoring</div>
                </div>
            </div>

            {reportModal && <ReportModal item={reportModal} onClose={() => setReportModal(null)} />}
        </>
    )
}
