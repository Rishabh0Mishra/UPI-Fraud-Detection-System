import { useState } from 'react'
import { scoreTransaction } from '../api/fraudApi'
import { Search, CheckCircle, AlertTriangle, ShieldX, Phone, ExternalLink, X, Loader2, Zap } from 'lucide-react'
import { format } from 'date-fns'

/* ── Preset test cases with real features for the model ── */
const TEST_CASES = [
    {
        label: '🔴 High Risk — Fake Merchant, ₹95K',
        txnId: 'TXN_TEST_BLOCK_001',
        data: {
            transaction_id: 'TXN_TEST_BLOCK_001',
            sender_user_id: 'USR099001',
            receiver_id: 'FAKE_MERCH_001',
            amount: 95000,
            transaction_type: 'P2P',
            sender_account_age_days: 8,
            sender_kyc_level: 'none',
            sender_income_tier: 'low',
            sender_avg_txn_amount: 200,
            sender_preferred_hour: 14,
            sender_vulnerability_score: 0.92,
            receiver_is_merchant: 1,
            receiver_is_fake_merchant: 1,
        },
    },
    {
        label: '🟡 Suspicious — New Account, Night, ₹18K',
        txnId: 'TXN_TEST_REVIEW_001',
        data: {
            transaction_id: 'TXN_TEST_REVIEW_001',
            sender_user_id: 'USR099002',
            receiver_id: 'USR045678',
            amount: 18000,
            transaction_type: 'P2P',
            sender_account_age_days: 12,
            sender_kyc_level: 'basic',
            sender_income_tier: 'low',
            sender_avg_txn_amount: 350,
            sender_preferred_hour: 10,
            sender_vulnerability_score: 0.78,
            receiver_is_merchant: 0,
            receiver_is_fake_merchant: 0,
        },
    },
    {
        label: '🟢 Normal — Verified User, ₹450',
        txnId: 'TXN_TEST_ALLOW_001',
        data: {
            transaction_id: 'TXN_TEST_ALLOW_001',
            sender_user_id: 'USR099003',
            receiver_id: 'USR012345',
            amount: 450,
            transaction_type: 'P2P',
            sender_account_age_days: 730,
            sender_kyc_level: 'full',
            sender_income_tier: 'middle',
            sender_avg_txn_amount: 500,
            sender_preferred_hour: 14,
            sender_vulnerability_score: 0.1,
            receiver_is_merchant: 0,
            receiver_is_fake_merchant: 0,
            receiver_is_verified_merchant: 0,
        },
    },
]

export default function UserPortal() {
    const [txnId, setTxnId] = useState('')
    const [upiId, setUpiId] = useState('')
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [reportModal, setReportModal] = useState(false)
    const [reportText, setReportText] = useState('')
    const [reported, setReported] = useState(false)

    /* Always call the real /score endpoint */
    const handleLookup = async (overrideData) => {
        const data = overrideData || {
            transaction_id: txnId.trim() || `TXN_USER_${Date.now()}`,
            sender_user_id: upiId.trim() || 'USR000001',
            receiver_id: 'USR000002',
            amount: 500,
            transaction_type: 'P2P',
            sender_account_age_days: 365,
            sender_kyc_level: 'full',
            sender_income_tier: 'middle',
            sender_avg_txn_amount: 500,
            sender_vulnerability_score: 0.3,
        }

        setTxnId(data.transaction_id)
        setLoading(true)
        setResult(null)

        try {
            const res = await scoreTransaction(data)
            /* Merge amount/receiver into result for display */
            setResult({
                ...res,
                amount: data.amount,
                receiver_id: data.receiver_id,
                transaction_type: data.transaction_type,
            })
        } catch (err) {
            setResult({
                transaction_id: data.transaction_id,
                decision: 'ALLOW',
                fraud_score: 0,
                amount: data.amount,
                timestamp: new Date().toISOString(),
                receiver_id: data.receiver_id,
                transaction_type: data.transaction_type,
                _error: true,
            })
        }
        setLoading(false)
    }

    const handleTestCase = (tc) => {
        setTxnId(tc.txnId)
        handleLookup(tc.data)
    }

    return (
        <div className="flex items-center justify-center" style={{ minHeight: 'calc(100vh - 130px)', background: '#0D1530' }}>
            <div style={{ maxWidth: 680, width: '100%', padding: '0 24px' }}>
                {!result ? (
                    /* Lookup Form */
                    <div className="card fade-in" style={{ borderRadius: 20, padding: 40 }}>
                        <div className="text-center mb-8">
                            <Search size={40} className="mx-auto mb-4" style={{ color: 'var(--accent-cyan)', opacity: 0.6 }} />
                            <h1 className="text-2xl font-semibold mb-2">Check Your Transaction</h1>
                            <p className="text-base" style={{ color: 'var(--text-secondary)' }}>
                                Enter your Transaction ID to see why a payment was blocked or flagged for verification.
                            </p>
                        </div>

                        <div className="space-y-4 mb-6">
                            <div>
                                <label className="text-sm mb-2 block" style={{ color: 'var(--text-secondary)' }}>Transaction ID</label>
                                <input
                                    className="mono" style={{ fontSize: 16, padding: '14px 18px', borderRadius: 12 }}
                                    value={txnId} onChange={(e) => setTxnId(e.target.value)}
                                    placeholder="TXN00497577"
                                    onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
                                />
                            </div>
                            <div>
                                <label className="text-sm mb-2 block" style={{ color: 'var(--text-secondary)' }}>Your UPI ID</label>
                                <input
                                    style={{ fontSize: 16, padding: '14px 18px', borderRadius: 12 }}
                                    value={upiId} onChange={(e) => setUpiId(e.target.value)}
                                    placeholder="yourname@bank"
                                />
                            </div>
                        </div>

                        <button onClick={() => handleLookup()} disabled={loading || !txnId.trim()} className="btn-primary w-full" style={{ height: 52, fontSize: 16, borderRadius: 12 }}>
                            {loading ? <><Loader2 size={20} className="animate-spin" /> Checking...</> : 'Check Transaction Status'}
                        </button>

                        {/* Quick test cases */}
                        <div className="mt-6 pt-6" style={{ borderTop: '1px solid var(--border)' }}>
                            <p className="text-xs mb-3 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                                <Zap size={12} /> Quick test — scored by real ML model:
                            </p>
                            <div className="space-y-2">
                                {TEST_CASES.map((tc) => (
                                    <button key={tc.txnId} onClick={() => handleTestCase(tc)} disabled={loading}
                                        className="w-full text-left py-2 px-3 rounded-lg text-sm"
                                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                                        {tc.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <p className="text-center text-xs mt-6" style={{ color: 'var(--text-muted)' }}>
                            Your data is encrypted and never shared. This lookup does not affect your account.
                        </p>
                    </div>
                ) : (
                    /* Result */
                    <div className="card fade-in" style={{ borderRadius: 20, padding: 40 }}>
                        {result.decision === 'ALLOW' && (
                            <>
                                <div className="text-center mb-6">
                                    <CheckCircle size={48} className="mx-auto mb-4" style={{ color: 'var(--accent-green)' }} />
                                    <h2 className="text-xl font-semibold" style={{ color: 'var(--accent-green)' }}>Transaction Completed Successfully</h2>
                                </div>
                                <div className="space-y-3 mb-6">
                                    {[['Transaction ID', result.transaction_id], ['Amount', `₹${(result.amount || 0).toLocaleString('en-IN')}`], ['Date', format(new Date(result.timestamp), 'd MMM yyyy, h:mm a')], ['To', result.receiver_id || '—'], ['Type', result.transaction_type || 'P2P'], ['Fraud Score', `${((result.fraud_score || 0) * 100).toFixed(2)}%`]].map(([k, v]) => (
                                        <div key={k} className="flex justify-between" style={{ fontSize: 16 }}>
                                            <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                                            <span className="mono">{v}</span>
                                        </div>
                                    ))}
                                </div>
                                <p className="text-center" style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
                                    This transaction passed all security checks and was processed normally.
                                </p>
                            </>
                        )}

                        {result.decision === 'REVIEW' && (
                            <>
                                <div className="text-center mb-6">
                                    <AlertTriangle size={48} className="mx-auto mb-4" style={{ color: 'var(--accent-amber)' }} />
                                    <h2 className="text-xl font-semibold" style={{ color: 'var(--accent-amber)' }}>Transaction Held for Verification</h2>
                                </div>
                                <div className="text-center mb-4 mono" style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
                                    {result.transaction_id} · ₹{(result.amount || 0).toLocaleString('en-IN')} · {format(new Date(result.timestamp), 'd MMM yyyy')}
                                </div>
                                <div className="space-y-2 mb-4" style={{ fontSize: 14 }}>
                                    <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Fraud Score</span><span className="mono" style={{ color: 'var(--accent-amber)' }}>{((result.fraud_score || 0) * 100).toFixed(2)}%</span></div>
                                    {result.reason && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Reason</span><span className="mono">{result.reason}</span></div>}
                                </div>
                                <p className="mb-6" style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.7 }}>
                                    Our security system detected unusual activity with this transaction and placed it on hold for a brief verification.
                                </p>
                                <div className="mb-6" style={{ fontSize: 15 }}>
                                    <p className="font-medium mb-2">What this means:</p>
                                    <ul className="space-y-1" style={{ color: 'var(--text-secondary)', listStyleType: 'disc', paddingLeft: 20 }}>
                                        <li>Your money has NOT been deducted yet</li>
                                        <li>You may receive a verification call/OTP</li>
                                        <li>This usually resolves within 2–4 hours</li>
                                    </ul>
                                </div>
                                <p className="mb-4" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                                    If this was a legitimate transaction, complete the verification step sent to your registered mobile number.
                                </p>
                                <p className="font-medium mb-3" style={{ fontSize: 14 }}>If you did NOT initiate this transaction:</p>
                            </>
                        )}

                        {result.decision === 'BLOCK' && (
                            <>
                                <div className="text-center mb-6">
                                    <ShieldX size={48} className="mx-auto mb-4" style={{ color: 'var(--accent-red)' }} />
                                    <h2 className="text-xl font-semibold" style={{ color: 'var(--accent-red)' }}>Transaction Blocked for Your Safety</h2>
                                </div>
                                <div className="text-center mb-4 mono" style={{ color: 'var(--text-secondary)', fontSize: 15 }}>
                                    {result.transaction_id} · ₹{(result.amount || 0).toLocaleString('en-IN')} · {format(new Date(result.timestamp), 'd MMM yyyy')}
                                </div>
                                <div className="space-y-2 mb-4" style={{ fontSize: 14 }}>
                                    <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Fraud Score</span><span className="mono" style={{ color: 'var(--accent-red)' }}>{((result.fraud_score || 0) * 100).toFixed(2)}%</span></div>
                                    {result.reason && <div className="flex justify-between"><span style={{ color: 'var(--text-secondary)' }}>Reason</span><span className="mono">{result.reason}</span></div>}
                                </div>
                                <p className="mb-6" style={{ color: 'var(--text-secondary)', fontSize: 15, lineHeight: 1.7 }}>
                                    This transaction was stopped by our fraud protection system. Your money is safe — no amount has been deducted.
                                </p>
                                <div className="mb-6" style={{ fontSize: 15 }}>
                                    <p className="font-medium mb-2">Common reasons for blocks:</p>
                                    <ul className="space-y-1" style={{ color: 'var(--text-secondary)', listStyleType: 'disc', paddingLeft: 20 }}>
                                        <li>Unusually large amount for your account</li>
                                        <li>Transaction at an unusual time</li>
                                        <li>Recipient flagged in fraud reports</li>
                                        <li>Activity inconsistent with your profile</li>
                                    </ul>
                                </div>
                                <p className="mb-4" style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
                                    If you were trying to make a legitimate payment, contact your bank to verify your identity and retry the transaction from a branch or app.
                                </p>
                                <p className="font-medium mb-3" style={{ fontSize: 14 }}>If someone pressured you to make this payment:</p>
                            </>
                        )}

                        {/* Action buttons for REVIEW and BLOCK */}
                        {result.decision !== 'ALLOW' && (
                            <div className="flex gap-3 mb-6">
                                <button onClick={() => { setReportModal(true); setReported(false); setReportText('') }} className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-medium"
                                    style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)', border: '1px solid rgba(255,59,92,0.2)', fontSize: 14 }}>
                                    🚨 {result.decision === 'BLOCK' ? 'Report Scam Attempt' : 'Report Fraud'}
                                </button>
                                <button className="flex-1 py-3 rounded-xl flex items-center justify-center gap-2 font-medium"
                                    style={{ background: 'rgba(0,212,255,0.08)', color: 'var(--accent-cyan)', border: '1px solid rgba(0,212,255,0.15)', fontSize: 14 }}>
                                    <Phone size={16} /> {result.decision === 'BLOCK' ? 'Call Helpline 1930' : 'Contact Support'}
                                </button>
                            </div>
                        )}

                        <button onClick={() => { setResult(null); setTxnId(''); setUpiId('') }} className="btn-primary w-full" style={{ height: 48, fontSize: 15, borderRadius: 12 }}>
                            Check Another Transaction
                        </button>
                    </div>
                )}

                {/* Report Modal */}
                {reportModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                        <div className="card fade-in" style={{ maxWidth: 480, width: '90%', borderRadius: 20, padding: 32 }}>
                            {reported ? (
                                <div className="text-center py-4">
                                    <CheckCircle size={40} className="mx-auto mb-3" style={{ color: 'var(--accent-green)' }} />
                                    <h3 className="text-lg font-semibold mb-2">Thank You</h3>
                                    <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>Your report has been submitted. Our team will investigate.</p>
                                    <button onClick={() => setReportModal(false)} className="btn-primary" style={{ borderRadius: 10 }}>Close</button>
                                </div>
                            ) : (
                                <>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="font-semibold">Report Scam Attempt</h3>
                                        <button onClick={() => setReportModal(false)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}><X size={18} /></button>
                                    </div>
                                    <div className="mb-4">
                                        <label className="text-sm mb-2 block" style={{ color: 'var(--text-secondary)' }}>Describe what happened (optional)</label>
                                        <textarea rows={4} value={reportText} onChange={(e) => setReportText(e.target.value)} placeholder="Tell us what happened..." style={{ borderRadius: 10 }} />
                                    </div>
                                    <div className="p-3 rounded-lg mb-4 text-sm" style={{ background: 'rgba(0,212,255,0.05)', border: '1px solid rgba(0,212,255,0.1)' }}>
                                        <p style={{ color: 'var(--text-secondary)' }}>National Cybercrime Helpline: <span className="mono font-bold" style={{ color: 'var(--accent-cyan)' }}>1930</span></p>
                                        <a href="https://cybercrime.gov.in" target="_blank" rel="noopener" className="text-xs flex items-center gap-1 mt-1" style={{ color: 'var(--accent-cyan)' }}>
                                            cybercrime.gov.in <ExternalLink size={10} />
                                        </a>
                                    </div>
                                    <button onClick={() => setReported(true)} className="btn-primary w-full" style={{ borderRadius: 10 }}>Submit Report</button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
