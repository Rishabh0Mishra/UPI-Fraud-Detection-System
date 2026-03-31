import { useState, useEffect, useCallback } from 'react'
import { scoreTransaction } from '../api/fraudApi'
import { TEST_CASES } from '../api/mockData'
import { useToast } from '../components/common/ToastNotification'
import DecisionBadge from '../components/common/DecisionBadge'
import { Zap, RefreshCw, Copy, Download, Flag, ChevronDown, ChevronUp, Loader2, AlertTriangle, Clock } from 'lucide-react'


const INITIAL_FORM = {
    transaction_id: '', sender_user_id: '', receiver_id: '', amount: '',
    transaction_type: 'P2P', timestamp: '',
    sender_account_age_days: '', sender_kyc_level: 'full', sender_income_tier: 'middle',
    sender_avg_txn_amount: '500', sender_preferred_hour: 14, sender_vulnerability_score: 0.3,
    sender_avg_typing_speed_ms: '280', sender_avg_session_duration_s: '45',
    sender_avg_touch_pressure: '0.45', sender_typical_swipe_velocity: '450',
    receiver_is_merchant: 0, receiver_is_fake_merchant: 0, receiver_is_verified_merchant: 0,
}

export default function ScoreTransaction() {
    const [form, setForm] = useState({ ...INITIAL_FORM })
    const [result, setResult] = useState(null)
    const [loading, setLoading] = useState(false)
    const [shakeError, setShakeError] = useState(false)
    const [biometricsOpen, setBiometricsOpen] = useState(false)
    const [history, setHistory] = useState(() => {
        try { return JSON.parse(sessionStorage.getItem('score_history') || '[]') } catch { return [] }
    })
    const [selectedTestCase, setSelectedTestCase] = useState(null)
    const { showToast } = useToast()

    useEffect(() => { sessionStorage.setItem('score_history', JSON.stringify(history)) }, [history])

    const set = (field, val) => setForm((p) => ({ ...p, [field]: val }))

    const generateId = () => set('transaction_id', `TXN_${Math.random().toString(16).slice(2, 10).toUpperCase()}`)
    const setNow = () => set('timestamp', new Date().toISOString().slice(0, 16))

    const fillTestCase = (key) => {
        const tc = TEST_CASES[key]
        setForm({ ...INITIAL_FORM, ...tc, amount: String(tc.amount), sender_account_age_days: String(tc.sender_account_age_days), sender_avg_txn_amount: String(tc.sender_avg_txn_amount), sender_avg_typing_speed_ms: String(tc.sender_avg_typing_speed_ms), sender_avg_session_duration_s: String(tc.sender_avg_session_duration_s), sender_avg_touch_pressure: String(tc.sender_avg_touch_pressure), sender_typical_swipe_velocity: String(tc.sender_typical_swipe_velocity) })
        setSelectedTestCase(key)
        setResult(null)
        setTimeout(() => setSelectedTestCase(null), 1500)
    }

    const handleScore = async () => {
        if (!form.transaction_id || !form.sender_user_id || !form.receiver_id || !form.amount) {
            showToast('Please fill in all required fields', 'error')
            setShakeError(true)
            setTimeout(() => setShakeError(false), 500)
            return
        }
        setLoading(true)
        try {
            const payload = {
                transaction_id: form.transaction_id,
                sender_user_id: form.sender_user_id,
                receiver_id: form.receiver_id,
                amount: parseFloat(form.amount),
                transaction_type: form.transaction_type,
                timestamp: form.timestamp || undefined,
                sender_account_age_days: form.sender_account_age_days ? parseFloat(form.sender_account_age_days) : undefined,
                sender_kyc_level: form.sender_kyc_level,
                sender_income_tier: form.sender_income_tier,
                sender_avg_txn_amount: form.sender_avg_txn_amount ? parseFloat(form.sender_avg_txn_amount) : undefined,
                sender_preferred_hour: form.sender_preferred_hour,
                sender_vulnerability_score: form.sender_vulnerability_score,
                sender_avg_typing_speed_ms: form.sender_avg_typing_speed_ms ? parseFloat(form.sender_avg_typing_speed_ms) : undefined,
                sender_avg_session_duration_s: form.sender_avg_session_duration_s ? parseFloat(form.sender_avg_session_duration_s) : undefined,
                sender_avg_touch_pressure: form.sender_avg_touch_pressure ? parseFloat(form.sender_avg_touch_pressure) : undefined,
                sender_typical_swipe_velocity: form.sender_typical_swipe_velocity ? parseFloat(form.sender_typical_swipe_velocity) : undefined,
                receiver_is_merchant: form.receiver_is_merchant,
                receiver_is_fake_merchant: form.receiver_is_fake_merchant,
                receiver_is_verified_merchant: form.receiver_is_verified_merchant,
            }
            const res = await scoreTransaction(payload)
            const enriched = { ...res, amount: parseFloat(form.amount), sender_user_id: form.sender_user_id, receiver_id: form.receiver_id, transaction_type: form.transaction_type, _formSnapshot: { ...form } }
            setResult(enriched)
            setHistory((prev) => [enriched, ...prev.slice(0, 9)])
            const isFraud = res.classification === 'FRAUD' || res.decision === 'BLOCK'
            showToast(`Transaction classified: ${isFraud ? 'FRAUD' : 'NO FRAUD'}`, isFraud ? 'error' : 'success')
        } catch (err) {
            showToast(`Scoring failed: ${err.message}`, 'error')
            setShakeError(true)
            setTimeout(() => setShakeError(false), 500)
        }
        setLoading(false)
    }

    const copyJSON = () => {
        // Create a copy without internal scores to match UI representation
        const toCopy = { ...result }
        delete toCopy.fraud_score
        delete toCopy.internal_risk_score
        delete toCopy.lgbm_score
        delete toCopy.graph_risk_score
        delete toCopy.base_score
        delete toCopy.penalty_total
        delete toCopy.reduction_total

        navigator.clipboard.writeText(JSON.stringify(toCopy, null, 2))
        showToast('JSON copied to clipboard', 'success')
    }

    const exportReport = () => {
        if (!result) return
        const isFraud = result.classification === 'FRAUD' || result.decision === 'BLOCK'
        const text = `FRAUD DETECTION REPORT\n${'='.repeat(50)}\nGenerated: ${new Date().toISOString()}\n\nTransaction ID: ${result.transaction_id}\nClassification: ${isFraud ? 'FRAUD' : 'NO FRAUD'}\nReason: ${result.reason || 'N/A'}\nLatency: ${result.latency_ms}ms\n\nSender: ${result.sender_user_id}\nReceiver: ${result.receiver_id}\nAmount: ₹${parseFloat(form.amount).toLocaleString('en-IN')}\nType: ${result.transaction_type}\n`
        const blob = new Blob([text], { type: 'text/plain' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `fraud_report_${result.transaction_id}.txt`
        a.click()
        showToast('Report downloaded', 'success')
    }

    const generateExplanation = () => {
        if (!result) return ''
        const amt = parseFloat(form.amount) || 0
        const isFraud = result.classification === 'FRAUD' || result.decision === 'BLOCK'
        
        if (result.reason === 'sender_is_known_controller') {
            return `This transaction was classified as FRAUD because the sender ${form.sender_user_id} is a known fraud ring controller. Hard rule triggered.`
        }
        if (result.reason === 'intra_ring_transfer') {
            return `This transaction was classified as FRAUD because both sender and receiver are members of the same fraud ring. This pattern is characteristic of money mule operations. Hard rule triggered.`
        }
        if (result.reason === 'receiver_is_fake_merchant') {
            return `This transaction was classified as FRAUD because the receiver has been flagged as a fake merchant in our database. No funds were transferred.`
        }
        if (result.reason === 'extreme_amount_ratio') {
            return `This transaction was classified as FRAUD due to an extreme amount anomaly. Hard rule triggered.`
        }
        if (isFraud) {
            return `This transaction was classified as FRAUD due to matching known risk patterns and indicators. It has been flagged and action will be taken based on current policies.`
        }
        return `This transaction was classified as NO FRAUD. The sender's profile, amount, and behavioral patterns are consistent with legitimate activity.`
    }

    return (
        <div className="grid gap-4 h-full" style={{ gridTemplateColumns: '38% 40% 22%', minHeight: 'calc(100vh - 130px)' }}>
            {/* LEFT — Input Form */}
            <div className="space-y-4 overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 130px)' }}>
                {/* Transaction */}
                <div className="card">
                    <div className="section-header">Transaction</div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Transaction ID</label>
                            <div className="flex gap-2">
                                <input className="mono" value={form.transaction_id} onChange={(e) => set('transaction_id', e.target.value)} placeholder="TXN_XXXXXXXX" />
                                <button onClick={generateId} className="btn-secondary shrink-0 text-xs" title="Generate ID"><RefreshCw size={14} /></button>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Amount (₹)</label>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--text-muted)' }}>₹</span>
                                <input className="mono pl-7" type="number" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="85000" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Type</label>
                            <select value={form.transaction_type} onChange={(e) => set('transaction_type', e.target.value)}>
                                <option value="P2P">P2P</option>
                                <option value="P2M">P2M</option>
                                <option value="BILL">BILL</option>
                                <option value="RECHARGE">RECHARGE</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Timestamp</label>
                            <div className="flex gap-2">
                                <input type="datetime-local" value={form.timestamp} onChange={(e) => set('timestamp', e.target.value)} />
                                <button onClick={setNow} className="btn-secondary shrink-0 text-xs"><Clock size={14} /> Now</button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Sender */}
                <div className="card">
                    <div className="section-header">Sender</div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>User ID</label>
                            <input className="mono" value={form.sender_user_id} onChange={(e) => set('sender_user_id', e.target.value)} placeholder="USR005112" />
                        </div>
                        <div>
                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Account Age (days)</label>
                            <div className="relative">
                                <input type="number" value={form.sender_account_age_days} onChange={(e) => set('sender_account_age_days', e.target.value)} placeholder="365" />
                                {form.sender_account_age_days && parseFloat(form.sender_account_age_days) < 30 && (
                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,176,32,0.15)', color: 'var(--accent-amber)' }}>⚠ NEW</span>
                                )}
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>KYC Level</label>
                                <select value={form.sender_kyc_level} onChange={(e) => set('sender_kyc_level', e.target.value)}>
                                    <option value="none">None</option>
                                    <option value="basic">Basic</option>
                                    <option value="partial">Partial</option>
                                    <option value="full">Full</option>
                                </select>
                            </div>
                            <div>
                                <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Income Tier</label>
                                <select value={form.sender_income_tier} onChange={(e) => set('sender_income_tier', e.target.value)}>
                                    <option value="low">Low</option>
                                    <option value="lower_middle">Lower Middle</option>
                                    <option value="middle">Middle</option>
                                    <option value="upper_middle">Upper Middle</option>
                                    <option value="high">High</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Avg Transaction Amount (₹)</label>
                            <input className="mono" type="number" value={form.sender_avg_txn_amount} onChange={(e) => set('sender_avg_txn_amount', e.target.value)} />
                        </div>
                        <div>
                            <label className="text-xs mb-1 flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                                <span>Preferred Hour</span><span className="mono">{form.sender_preferred_hour}:00</span>
                            </label>
                            <input type="range" min="0" max="23" value={form.sender_preferred_hour} onChange={(e) => set('sender_preferred_hour', parseInt(e.target.value))} className="w-full" style={{ accentColor: 'var(--accent-cyan)' }} />
                        </div>
                        <div>
                            <label className="text-xs mb-1 flex justify-between" style={{ color: 'var(--text-secondary)' }}>
                                <span>Vulnerability Index Indicator</span>
                            </label>
                            <input type="range" min="0" max="1" step="0.05" value={form.sender_vulnerability_score} onChange={(e) => set('sender_vulnerability_score', parseFloat(e.target.value))}
                                className="w-full" style={{ accentColor: form.sender_vulnerability_score > 0.7 ? '#FF3B5C' : form.sender_vulnerability_score > 0.4 ? '#FFB020' : '#00E5A0' }}
                            />
                        </div>

                        {/* Biometrics */}
                        <button onClick={() => setBiometricsOpen(!biometricsOpen)} className="flex items-center gap-2 text-xs w-full py-1" style={{ background: 'transparent', color: 'var(--text-muted)' }}>
                            {biometricsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Biometrics (optional)
                        </button>
                        {biometricsOpen && (
                            <div className="grid grid-cols-2 gap-3 fade-in">
                                {[['Typing Speed (ms)', 'sender_avg_typing_speed_ms'], ['Touch Pressure', 'sender_avg_touch_pressure'], ['Swipe Velocity', 'sender_typical_swipe_velocity'], ['Session Time (s)', 'sender_avg_session_duration_s']].map(([label, key]) => (
                                    <div key={key}>
                                        <label className="text-xs mb-1 block" style={{ color: 'var(--text-muted)' }}>{label}</label>
                                        <input type="number" value={form[key]} onChange={(e) => set(key, e.target.value)} step="0.01" />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Receiver */}
                <div className="card">
                    <div className="section-header">Receiver</div>
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs mb-1 block" style={{ color: 'var(--text-secondary)' }}>Receiver ID</label>
                            <input className="mono" value={form.receiver_id} onChange={(e) => set('receiver_id', e.target.value)} placeholder="USR/MER" />
                        </div>
                        <div className="flex gap-4">
                            {[['Merchant?', 'receiver_is_merchant'], ['Verified?', 'receiver_is_verified_merchant']].map(([label, key]) => (
                                <label key={key} className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                                    <input type="checkbox" checked={!!form[key]} onChange={(e) => set(key, e.target.checked ? 1 : 0)} style={{ accentColor: 'var(--accent-cyan)' }} />
                                    {label}
                                </label>
                            ))}
                        </div>
                        <label className="flex items-center gap-2 text-xs cursor-pointer" style={{ color: 'var(--accent-red)' }}>
                            <input type="checkbox" checked={!!form.receiver_is_fake_merchant} onChange={(e) => set('receiver_is_fake_merchant', e.target.checked ? 1 : 0)} style={{ accentColor: '#FF3B5C' }} />
                            Fake Merchant?
                        </label>
                        {form.receiver_is_fake_merchant === 1 && (
                            <div className="p-3 rounded-lg text-xs fade-in" style={{ background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.2)', color: 'var(--accent-red)' }}>
                                <AlertTriangle size={14} className="inline mr-1" /> This will trigger a hard FRAUD rule
                            </div>
                        )}
                    </div>
                </div>

                {/* Test Cases */}
                <div className="grid grid-cols-3 gap-2">
                    {[
                        { key: 'ringController', icon: '🔴', title: 'Ring Controller', sub: 'USR005112 → USR033087', detail: '₹85,000 P2P' },
                        { key: 'vishingAttack', icon: '🟡', title: 'Vishing Attack', sub: 'High vuln, off-hours', detail: '₹45,000 P2P' },
                        { key: 'normalTxn', icon: '🟢', title: 'Normal Txn', sub: '₹450, P2M, verified', detail: 'Regular user' },
                    ].map((tc) => (
                        <button
                            key={tc.key}
                            onClick={() => fillTestCase(tc.key)}
                            className="card text-left transition-all"
                            style={{
                                padding: '10px 12px',
                                cursor: 'pointer',
                                border: selectedTestCase === tc.key ? '1px solid var(--accent-cyan)' : undefined,
                                boxShadow: selectedTestCase === tc.key ? '0 0 12px rgba(0,212,255,0.15)' : 'none',
                            }}
                        >
                            <div className="text-lg mb-1">{tc.icon}</div>
                            <div className="text-xs font-medium">{tc.title}</div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{tc.sub}</div>
                        </button>
                    ))}
                </div>

                {/* Analyse Button */}
                <button
                    onClick={handleScore}
                    disabled={loading}
                    className={`btn-primary w-full ${shakeError ? 'shake' : ''}`}
                    style={{ height: 52, fontSize: 15, borderRadius: 'var(--radius)' }}
                >
                    {loading ? <><Loader2 size={20} className="animate-spin" /> Analysing...</> : <><Zap size={20} /> ANALYSE TRANSACTION</>}
                </button>
            </div>

            {/* CENTRE — Result Panel */}
            <div className="overflow-y-auto pr-2" style={{ maxHeight: 'calc(100vh - 130px)' }}>
                {!result ? (
                    <div className="card flex flex-col items-center justify-center h-full" style={{ minHeight: 400 }}>
                        <Zap size={48} style={{ color: 'var(--text-muted)', opacity: 0.3 }} />
                        <p className="mt-4 text-sm" style={{ color: 'var(--text-secondary)' }}>Submit a transaction to see results</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Decision Banner */}
                        <div className={`card fade-in flex items-center justify-center`}
                            style={{ padding: '30px 24px', textAlign: 'center' }}
                        >
                            <div>
                                <div className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>Classification Result</div>
                                <DecisionBadge decision={result.classification || (result.decision === 'ALLOW' ? 'NO_FRAUD' : 'FRAUD')} size="lg" />
                                {result.reason && <div className="text-xs mt-4 font-medium" style={{ color: 'var(--text-secondary)' }}>Trigger: {result.reason}</div>}
                            </div>
                        </div>

                        {/* Indicators Breakdown */}
                        <div className="card fade-in" style={{ animationDelay: '150ms' }}>
                            <div className="section-header">Identified Indicators</div>
                            <div className="space-y-3">
                                {(!result.fraud_indicators?.length && !result.trust_indicators?.length) && (
                                    <div className="text-xs px-2" style={{ color: 'var(--text-muted)' }}>No strong indicators found</div>
                                )}
                                
                                {result.fraud_indicators && result.fraud_indicators.length > 0 && (
                                    <div className="space-y-2">
                                        <div className="text-xs font-medium" style={{ color: 'var(--accent-red)' }}>Risk Flags</div>
                                        {result.fraud_indicators.map((ind, i) => (
                                            <div key={`f_${i}`} className="flex items-center gap-2 text-xs p-2 rounded" style={{ background: 'rgba(255,59,92,0.1)'}}>
                                                <span>🔴</span>
                                                <span style={{ color: 'var(--text-primary)' }}>{ind.replace(/_/g, ' ')}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                {result.trust_indicators && result.trust_indicators.length > 0 && (
                                    <div className="space-y-2 mt-3">
                                        <div className="text-xs font-medium" style={{ color: 'var(--accent-green)' }}>Trust Factors</div>
                                        {result.trust_indicators.map((ind, i) => (
                                            <div key={`t_${i}`} className="flex items-center gap-2 text-xs p-2 rounded" style={{ background: 'rgba(0,229,160,0.1)'}}>
                                                <span>🟢</span>
                                                <span style={{ color: 'var(--text-primary)' }}>{ind.replace(/_/g, ' ')}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                
                                <div className="flex justify-between text-xs mt-4 pt-4" style={{ color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
                                    <span>Processing Time: <span className="mono font-medium">{result.latency_ms}ms</span></span>
                                </div>
                            </div>
                        </div>

                        {/* Explanation */}
                        <div className="card fade-in" style={{ animationDelay: '300ms' }}>
                            <div className="section-header">Why This Decision</div>
                            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{generateExplanation()}</p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-wrap fade-in" style={{ animationDelay: '450ms' }}>
                            <button onClick={copyJSON} className="btn-secondary text-xs"><Copy size={14} /> Copy JSON</button>
                            <button onClick={() => { setResult(null) }} className="btn-secondary text-xs"><RefreshCw size={14} /> Score Again</button>
                            <button onClick={exportReport} className="btn-secondary text-xs"><Download size={14} /> Export</button>
                            <button onClick={() => { showToast('Transaction flagged for review', 'warning') }} className="btn-secondary text-xs"><Flag size={14} /> Flag</button>
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT — History */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 130px)' }}>
                <div className="card h-full">
                    <div className="flex items-center justify-between mb-4">
                        <div className="section-header mb-0">Recent Queries</div>
                        <span className="mono text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--accent-cyan)' }}>{history.length}</span>
                    </div>

                    {history.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No transactions processed yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {history.map((h, i) => (
                                <div key={i} className="p-3 rounded-lg cursor-pointer transition-all" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} onClick={() => setResult(h)}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <DecisionBadge decision={h.classification || (h.decision === 'ALLOW' ? 'NO_FRAUD' : 'FRAUD')} size="sm" />
                                    </div>
                                    <div className="mono text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{h.transaction_id?.slice(0, 12)}</div>
                                    <div className="flex justify-between text-xs mt-1">
                                        <span style={{ color: 'var(--text-muted)' }}>{h.sender_user_id} → {h.receiver_id?.slice(0, 9)}</span>
                                        <span className="mono font-medium">₹{(h.amount || 0).toLocaleString('en-IN')}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    
                    {history.length > 0 && (
                        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <div className="text-xs font-medium mb-3" style={{ color: 'var(--text-secondary)' }}>Session Summary</div>
                            {[['Processed', history.length, 'var(--text-primary)'], ['Classified Fraud', history.filter((h) => h.classification === 'FRAUD' || h.decision === 'BLOCK').length, 'var(--accent-red)'], ['Classified No Fraud', history.filter((h) => h.classification === 'NO_FRAUD' || h.decision === 'ALLOW').length, 'var(--accent-green)']].map(([label, count, color]) => (
                                <div key={label} className="flex justify-between text-xs mb-2">
                                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                                    <span className="font-medium" style={{ color }}>{count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
