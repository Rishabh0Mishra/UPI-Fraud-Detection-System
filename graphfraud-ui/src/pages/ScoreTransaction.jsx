import { useState, useEffect, useCallback } from 'react'
import { scoreTransaction } from '../api/fraudApi'
import { TEST_CASES } from '../api/mockData'
import { useToast } from '../components/common/ToastNotification'
import DecisionBadge from '../components/common/DecisionBadge'
import FraudScoreBar from '../components/common/FraudScoreBar'
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
            showToast(`Transaction scored: ${res.decision}`, res.decision === 'BLOCK' ? 'error' : res.decision === 'REVIEW' ? 'warning' : 'success')
        } catch (err) {
            showToast(`Scoring failed: ${err.message}`, 'error')
            setShakeError(true)
            setTimeout(() => setShakeError(false), 500)
        }
        setLoading(false)
    }

    const copyJSON = () => {
        navigator.clipboard.writeText(JSON.stringify(result, null, 2))
        showToast('JSON copied to clipboard', 'success')
    }

    const exportReport = () => {
        if (!result) return
        const text = `FRAUD DETECTION REPORT\n${'='.repeat(50)}\nGenerated: ${new Date().toISOString()}\n\nTransaction ID: ${result.transaction_id}\nDecision: ${result.decision}\nFraud Score: ${result.fraud_score}\nLightGBM Score: ${result.lgbm_score}\nGraph Risk Score: ${result.graph_risk_score}\nReason: ${result.reason || 'N/A'}\nLatency: ${result.latency_ms}ms\n\nSender: ${result.sender_user_id}\nReceiver: ${result.receiver_id}\nAmount: ₹${parseFloat(form.amount).toLocaleString('en-IN')}\nType: ${result.transaction_type}\n`
        const blob = new Blob([text], { type: 'text/plain' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `fraud_report_${result.transaction_id}.txt`
        a.click()
        showToast('Report downloaded', 'success')
    }

    const computeSignals = useCallback(() => {
        if (!result) return []
        const signals = []
        const amt = parseFloat(form.amount) || 0
        const avg = parseFloat(form.sender_avg_txn_amount) || 500
        const ratio = amt / (avg + 0.001)
        const acctAge = parseFloat(form.sender_account_age_days) || 365
        const vuln = form.sender_vulnerability_score || 0.3
        const hour = form.sender_preferred_hour || 14
        const hourDev = Math.min(Math.abs(new Date().getHours() - hour), 12)

        if (result.reason === 'sender_is_known_controller') signals.push({ name: 'sender_is_controller', value: 0.42, positive: true })
        if (result.reason === 'intra_ring_transfer') signals.push({ name: 'intra_ring_txn', value: 0.38, positive: true })
        if (ratio > 10) signals.push({ name: `amount_ratio (${ratio.toFixed(0)}×)`, value: Math.min(ratio / 200, 0.4), positive: true })
        if (acctAge < 30) signals.push({ name: 'sender_new_account', value: 0.24, positive: true })
        if (vuln > 0.7) signals.push({ name: `vulnerability (${vuln.toFixed(1)})`, value: vuln * 0.3, positive: true })
        if (hourDev > 6) signals.push({ name: `hour_deviation (${hourDev}h)`, value: 0.18, positive: true })
        if (form.receiver_is_fake_merchant) signals.push({ name: 'fake_merchant', value: 0.35, positive: true })
        if (form.sender_kyc_level === 'full') signals.push({ name: 'sender_kyc_full', value: 0.09, positive: false })
        if (ratio < 2 && ratio > 0.3) signals.push({ name: 'normal_amount_range', value: 0.07, positive: false })
        if (acctAge > 365) signals.push({ name: 'established_account', value: 0.06, positive: false })

        return signals.sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 6)
    }, [result, form])

    const generateExplanation = () => {
        if (!result) return ''
        const amt = parseFloat(form.amount) || 0
        const avg = parseFloat(form.sender_avg_txn_amount) || 500
        const ratio = (amt / (avg + 0.001)).toFixed(0)

        if (result.reason === 'sender_is_known_controller') {
            return `This transaction was BLOCKED because the sender ${form.sender_user_id} is a known fraud ring controller. The amount of ₹${amt.toLocaleString('en-IN')} is ${ratio}× this user's typical transaction. Hard rule triggered — no model score computation was needed.`
        }
        if (result.reason === 'intra_ring_transfer') {
            return `This transaction was BLOCKED because both sender and receiver are members of the same fraud ring. This pattern is characteristic of money mule operations. Hard rule triggered.`
        }
        if (result.reason === 'receiver_is_fake_merchant') {
            return `This transaction was BLOCKED because the receiver has been flagged as a fake merchant in our database. No funds were transferred.`
        }
        if (result.reason === 'extreme_amount_ratio') {
            return `This transaction was BLOCKED because the amount of ₹${amt.toLocaleString('en-IN')} is ${ratio}× the sender's average, which exceeds the extreme ratio threshold (50×). Hard rule triggered.`
        }
        if (result.decision === 'BLOCK') {
            return `This transaction scored ${result.fraud_score.toFixed(4)} which exceeds the BLOCK threshold. The amount of ₹${amt.toLocaleString('en-IN')} (${ratio}× typical) combined with other risk signals triggered the model.`
        }
        if (result.decision === 'REVIEW') {
            return `This transaction scored ${result.fraud_score.toFixed(4)} which is between the REVIEW and BLOCK thresholds. Manual review is recommended before processing.`
        }
        return `This transaction passed all security checks with a low fraud score of ${result.fraud_score.toFixed(6)}. The sender's profile, amount, and behavioral patterns are consistent with legitimate activity.`
    }

    const decisionBg = (d) => {
        if (d === 'BLOCK') return 'linear-gradient(135deg, rgba(255,59,92,0.15), rgba(255,59,92,0.05))'
        if (d === 'REVIEW') return 'linear-gradient(135deg, rgba(255,176,32,0.15), rgba(255,176,32,0.05))'
        return 'linear-gradient(135deg, rgba(0,229,160,0.1), rgba(0,229,160,0.03))'
    }

    const decisionBorder = (d) => d === 'BLOCK' ? 'rgba(255,59,92,0.3)' : d === 'REVIEW' ? 'rgba(255,176,32,0.3)' : 'rgba(0,229,160,0.2)'

    const signals = computeSignals()

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
                                <span>Vulnerability Score</span>
                                <span className="mono" style={{ color: form.sender_vulnerability_score > 0.7 ? 'var(--accent-red)' : form.sender_vulnerability_score > 0.4 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>
                                    {form.sender_vulnerability_score.toFixed(2)}
                                </span>
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
                                <AlertTriangle size={14} className="inline mr-1" /> This will trigger a hard BLOCK rule regardless of model score
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
                        <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Use the test cases to get started →</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Decision Banner */}
                        <div className={`card ${result.decision === 'BLOCK' ? 'block-flash' : ''} fade-in`}
                            style={{ background: decisionBg(result.decision), border: `1px solid ${decisionBorder(result.decision)}`, padding: '20px 24px' }}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <DecisionBadge decision={result.decision} size="lg" />
                                    {result.reason && <div className="text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>{result.reason}</div>}
                                </div>
                                <div className="text-right">
                                    <div className="mono text-3xl font-bold">{result.fraud_score.toFixed(4)}</div>
                                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>fraud score</div>
                                </div>
                            </div>
                        </div>

                        {/* Score Breakdown */}
                        <div className="card fade-in" style={{ animationDelay: '150ms' }}>
                            <div className="section-header">Score Breakdown</div>
                            <div className="space-y-3">
                                {[
                                    ['LightGBM Score', result.lgbm_score],
                                    ['Graph Ring Risk', result.graph_risk_score],
                                ].map(([label, value]) => (
                                    <div key={label}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                                        </div>
                                        <FraudScoreBar score={value} height={8} />
                                    </div>
                                ))}
                                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="font-medium">Final Score (calibrated)</span>
                                    </div>
                                    <FraudScoreBar score={result.fraud_score} height={12} />
                                </div>
                                <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                                    <span>Latency: <span className="mono">{result.latency_ms}ms</span></span>
                                </div>
                            </div>
                        </div>

                        {/* Risk Signals */}
                        {signals.length > 0 && (
                            <div className="card fade-in" style={{ animationDelay: '300ms' }}>
                                <div className="section-header">Key Risk Signals</div>
                                <div className="space-y-2">
                                    {signals.map((sig, i) => (
                                        <div key={i} className="flex items-center gap-3">
                                            <span>{sig.positive ? '🔴' : '🟢'}</span>
                                            <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>{sig.name}</span>
                                            <div style={{ width: 100 }}>
                                                <div className="rounded-full overflow-hidden" style={{ height: 6, background: 'rgba(255,255,255,0.06)' }}>
                                                    <div className="rounded-full" style={{ width: `${Math.min(sig.value * 250, 100)}%`, height: '100%', background: sig.positive ? 'var(--accent-red)' : 'var(--accent-green)', transition: 'width 0.6s ease-out' }} />
                                                </div>
                                            </div>
                                            <span className="mono text-xs" style={{ color: sig.positive ? 'var(--accent-red)' : 'var(--accent-green)', width: 45, textAlign: 'right' }}>
                                                {sig.positive ? '+' : '-'}{sig.value.toFixed(2)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                                <div className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>Red bars push score UP · Green bars push score DOWN</div>
                            </div>
                        )}

                        {/* Explanation */}
                        <div className="card fade-in" style={{ animationDelay: '450ms' }}>
                            <div className="section-header">Why This Decision</div>
                            <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{generateExplanation()}</p>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 flex-wrap fade-in" style={{ animationDelay: '600ms' }}>
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
                        <div className="section-header mb-0">Today's Scores</div>
                        <span className="mono text-xs px-2 py-0.5 rounded-full" style={{ background: 'rgba(0,212,255,0.1)', color: 'var(--accent-cyan)' }}>{history.length}</span>
                    </div>

                    {history.length === 0 ? (
                        <div className="text-center py-8">
                            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No transactions scored yet</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {history.map((h, i) => (
                                <div key={i} className="p-3 rounded-lg cursor-pointer transition-all" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }} onClick={() => setResult(h)}>
                                    <div className="flex items-center gap-2 mb-1">
                                        <DecisionBadge decision={h.decision} size="sm" />
                                        <span className="mono text-xs">{h.transaction_id?.slice(0, 12)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
                                        <span>{h.sender_user_id} → {h.receiver_id?.slice(0, 9)}</span>
                                    </div>
                                    <div className="flex justify-between text-xs mt-1">
                                        <span className="mono">₹{(h.amount || 0).toLocaleString('en-IN')}</span>
                                        <span className="mono" style={{ color: h.fraud_score >= 0.8 ? 'var(--accent-red)' : h.fraud_score >= 0.45 ? 'var(--accent-amber)' : 'var(--accent-green)' }}>{h.fraud_score?.toFixed(4)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {history.length > 0 && (
                        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                            <div className="text-xs font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>Session Summary</div>
                            {[['Scored', history.length, 'var(--text-primary)'], ['Blocked', history.filter((h) => h.decision === 'BLOCK').length, 'var(--accent-red)'], ['Reviewed', history.filter((h) => h.decision === 'REVIEW').length, 'var(--accent-amber)'], ['Allowed', history.filter((h) => h.decision === 'ALLOW').length, 'var(--accent-green)']].map(([label, count, color]) => (
                                <div key={label} className="flex justify-between text-xs mb-1">
                                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                                    <span className="mono font-medium" style={{ color }}>{count}{history.length > 0 && label !== 'Scored' && ` (${((count / history.length) * 100).toFixed(0)}%)`}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
