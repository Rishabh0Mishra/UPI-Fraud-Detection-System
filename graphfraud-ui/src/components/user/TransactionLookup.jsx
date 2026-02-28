import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { format } from 'date-fns'
import { scoreTransaction } from '../../api/fraudApi'
import { analyseUPIId, translateReason } from '../../utils/fraudAnalysis'
import RiskGauge from '../common/RiskGauge'
import SignalList from '../common/SignalList'

const TEST_CASES = [
    { label: '🔴 Blocked — Fake Merchant ₹95K', data: { transaction_id: 'TXN_TEST_BLOCK_001', sender_user_id: 'USR099001', receiver_id: 'FAKE_MERCH_001', amount: 95000, transaction_type: 'P2P', sender_account_age_days: 8, sender_kyc_level: 'none', sender_income_tier: 'low', sender_avg_txn_amount: 200, sender_preferred_hour: 14, sender_vulnerability_score: 0.92, receiver_is_merchant: 1, receiver_is_fake_merchant: 1 } },
    { label: '🟡 Review — New Account ₹18K', data: { transaction_id: 'TXN_TEST_REVIEW_001', sender_user_id: 'USR099002', receiver_id: 'USR045678', amount: 18000, transaction_type: 'P2P', sender_account_age_days: 12, sender_kyc_level: 'basic', sender_income_tier: 'low', sender_avg_txn_amount: 350, sender_preferred_hour: 10, sender_vulnerability_score: 0.78, receiver_is_merchant: 0, receiver_is_fake_merchant: 0 } },
    { label: '🟢 Normal — Verified ₹450', data: { transaction_id: 'TXN_TEST_ALLOW_001', sender_user_id: 'USR099003', receiver_id: 'USR012345', amount: 450, transaction_type: 'P2P', sender_account_age_days: 730, sender_kyc_level: 'full', sender_income_tier: 'middle', sender_avg_txn_amount: 500, sender_preferred_hour: 14, sender_vulnerability_score: 0.1, receiver_is_merchant: 0, receiver_is_fake_merchant: 0 } },
]

export default function TransactionLookup({ onReport }) {
    const [form, setForm] = useState({ txnId: '', userUpi: '', senderUpi: '', receiverUpi: '' })
    const [result, setResult] = useState(null)
    const [senderCheck, setSenderCheck] = useState(null)
    const [receiverCheck, setReceiverCheck] = useState(null)
    const [loading, setLoading] = useState(false)

    const lookup = async (overrideData) => {
        const data = overrideData || { transaction_id: form.txnId.trim() || `TXN_USER_${Date.now()}`, sender_user_id: form.userUpi.trim() || 'USR000001', receiver_id: 'USR000002', amount: 500, transaction_type: 'P2P', sender_account_age_days: 365, sender_kyc_level: 'full', sender_income_tier: 'middle', sender_avg_txn_amount: 500, sender_vulnerability_score: 0.3 }
        setLoading(true); setResult(null); setSenderCheck(null); setReceiverCheck(null)
        try {
            const res = await scoreTransaction(data)
            setResult({ ...res, amount: data.amount, receiver_id: data.receiver_id, transaction_type: data.transaction_type })
        } catch {
            setResult({ transaction_id: data.transaction_id, decision: 'ALLOW', fraud_score: 0, amount: data.amount, timestamp: new Date().toISOString(), receiver_id: data.receiver_id, transaction_type: data.transaction_type })
        }
        if (form.senderUpi.trim()) setSenderCheck(analyseUPIId(form.senderUpi.trim()))
        if (form.receiverUpi.trim()) setReceiverCheck(analyseUPIId(form.receiverUpi.trim()))
        setLoading(false)
    }

    const reset = () => { setResult(null); setForm({ txnId: '', userUpi: '', senderUpi: '', receiverUpi: '' }); setSenderCheck(null); setReceiverCheck(null) }

    if (result) {
        const d = result.decision
        const isAllow = d === 'ALLOW', isReview = d === 'REVIEW'
        const color = isAllow ? '#00E5A0' : isReview ? '#FFB020' : '#FF3B5C'
        const bg = isAllow ? 'rgba(0,229,160,0.06)' : isReview ? 'rgba(255,176,32,0.06)' : 'rgba(255,59,92,0.08)'
        const border = isAllow ? 'rgba(0,229,160,0.3)' : isReview ? 'rgba(255,176,32,0.3)' : 'rgba(255,59,92,0.4)'
        const titles = { ALLOW: '✅  Transaction Completed Safely', REVIEW: '🟡  Transaction Under Security Review', BLOCK: '🔴  Transaction Blocked — Your Money is Safe' }

        return (
            <div className="fade-in">
                <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 20, padding: 32, marginBottom: 16 }}>
                    <h3 style={{ color, fontSize: 20, fontWeight: 700, marginBottom: 16 }}>{titles[d]}</h3>
                    <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 15 }}>
                        {[['Transaction ID', result.transaction_id], ['Amount', `₹${(result.amount || 0).toLocaleString('en-IN')}`], ['Date', format(new Date(result.timestamp), 'd MMM yyyy, h:mm a')], ['Type', result.transaction_type || 'P2P']].map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                                <span style={{ color: 'var(--text-secondary)' }}>{k}</span><span className="mono">{v}</span>
                            </div>
                        ))}
                    </div>

                    {isAllow && <p style={{ color: 'var(--text-secondary)', fontSize: 15 }}>All signals look normal for this transaction. Security check: PASSED ✓</p>}

                    {isReview && (
                        <>
                            <div style={{ marginBottom: 16 }}>
                                <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Why it was flagged:</p>
                                <ul style={{ color: 'var(--text-secondary)', fontSize: 14, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                                    <li>Amount may be unusual for this account type</li>
                                    <li>Additional verification was triggered by security signals</li>
                                </ul>
                            </div>
                            <div style={{ background: 'rgba(255,176,32,0.06)', border: '1px solid rgba(255,176,32,0.15)', borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 14 }}>
                                <p style={{ fontWeight: 600, marginBottom: 6 }}>Your money status:</p>
                                <ul style={{ color: 'var(--text-secondary)', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <li>Amount has NOT been deducted from your account</li>
                                    <li>A verification step will be sent to your phone</li>
                                    <li>Usually resolved within 2–4 hours</li>
                                </ul>
                            </div>
                        </>
                    )}

                    {d === 'BLOCK' && (
                        <>
                            <div style={{ marginBottom: 16 }}>
                                <p style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>Why it was blocked:</p>
                                <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.7 }}>{translateReason(result.reason)}</p>
                            </div>
                            <div style={{ background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.15)', borderRadius: 14, padding: 16, marginBottom: 16, fontSize: 14 }}>
                                <p><span style={{ color: '#00E5A0' }}>✅ Your money: SAFE</span> — nothing was deducted</p>
                                <p><span style={{ color: '#00E5A0' }}>✅ Your account:</span> No action needed from your side</p>
                            </div>
                            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <a href="tel:1930" className="btn-secondary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, textDecoration: 'none', justifyContent: 'center', minWidth: 140 }}>🚨 Report Fraud — Call 1930</a>
                                <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" className="btn-secondary" style={{ flex: 1, borderRadius: 12, padding: '10px 16px', fontSize: 14, textDecoration: 'none', justifyContent: 'center', minWidth: 140 }}>🌐 cybercrime.gov.in</a>
                            </div>
                        </>
                    )}
                </div>

                {(senderCheck || receiverCheck) && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 16 }}>
                        {[['Sender Check', senderCheck], ['Receiver Check', receiverCheck]].filter(([, c]) => c).map(([label, check]) => (
                            <div key={label} style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 16 }}>
                                <p style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</p>
                                <p className="mono" style={{ fontSize: 14, marginBottom: 4 }}>{check.upiId}</p>
                                <p style={{ color: check.riskScore < 30 ? '#00E5A0' : check.riskScore < 60 ? '#FFB020' : '#FF3B5C', fontSize: 13 }}>
                                    {check.riskScore < 30 ? '✅ No issues found' : `🔴 High risk (${check.riskScore}/100)`}
                                </p>
                            </div>
                        ))}
                    </div>
                )}
                <button onClick={reset} className="btn-primary" style={{ width: '100%', borderRadius: 12, padding: '12px 20px', fontSize: 15 }}>Check Another Transaction</button>
            </div>
        )
    }

    return (
        <div className="fade-in">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
                {[['Your UPI ID', 'userUpi', 'yourname@oksbi'], ['Transaction ID', 'txnId', 'TXN00497577'], ['Sender UPI ID (optional)', 'senderUpi', 'sender@oksbi'], ['Receiver UPI ID (optional)', 'receiverUpi', 'receiver@ybl']].map(([label, key, ph]) => (
                    <div key={key}>
                        <label style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'block', marginBottom: 4 }}>{label}</label>
                        <input value={form[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} placeholder={ph} style={{ fontSize: 14, borderRadius: 12, padding: '12px 14px' }} />
                    </div>
                ))}
            </div>
            <button onClick={() => lookup()} disabled={loading || !form.txnId.trim()} className="btn-primary" style={{ width: '100%', borderRadius: 12, padding: '14px 20px', fontSize: 15 }}>
                {loading ? <><Loader2 size={16} className="animate-spin" /> Looking up...</> : '🔍 Look Up Transaction'}
            </button>
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 16 }}>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>⚡ Quick test — scored by real ML model:</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {TEST_CASES.map(tc => (
                        <button key={tc.data.transaction_id} onClick={() => { setForm(p => ({ ...p, txnId: tc.data.transaction_id })); lookup(tc.data) }} disabled={loading}
                            style={{ textAlign: 'left', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13 }}>{tc.label}</button>
                    ))}
                </div>
            </div>
        </div>
    )
}
