import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../api/fraudApi'
import { useToast } from '../components/common/ToastNotification'
import { AlertTriangle, Save, RotateCcw, Lock, Unlock } from 'lucide-react'

const DEFAULT_THRESHOLDS = { block: 0.82, review: 0.45 }
const DEFAULT_WEIGHTS = { lgbm: 75, graph: 25 }
const DEFAULT_RULES = [
    { id: 'sender_is_known_controller', label: 'Sender is known controller', active: true, triggered: 12 },
    { id: 'intra_ring_transfer', label: 'Intra-ring transfer', active: true, triggered: 8 },
    { id: 'receiver_is_fake_merchant', label: 'Receiver is fake merchant', active: true, triggered: 3 },
    { id: 'extreme_amount_ratio', label: 'Extreme amount ratio (>50×)', active: true, triggered: 1 },
]

export default function AdminPanel() {
    const { data: health } = useQuery({ queryKey: ['health'], queryFn: getHealth })
    const { showToast } = useToast()

    const [thresholds, setThresholds] = useState(() => {
        try { return JSON.parse(localStorage.getItem('admin_thresholds')) || DEFAULT_THRESHOLDS } catch { return DEFAULT_THRESHOLDS }
    })
    const [weights, setWeights] = useState(() => {
        try { return JSON.parse(localStorage.getItem('admin_weights')) || DEFAULT_WEIGHTS } catch { return DEFAULT_WEIGHTS }
    })
    const [rules, setRules] = useState(() => {
        try { return JSON.parse(localStorage.getItem('admin_rules')) || DEFAULT_RULES } catch { return DEFAULT_RULES }
    })
    const [auditLog, setAuditLog] = useState(() => {
        try { return JSON.parse(localStorage.getItem('admin_audit')) || [] } catch { return [] }
    })
    const [confirmModal, setConfirmModal] = useState(null)

    const persist = (key, value) => localStorage.setItem(key, JSON.stringify(value))
    const addAudit = (action) => {
        const entry = { timestamp: new Date().toISOString(), action, admin: 'admin@bank.com' }
        const updated = [entry, ...auditLog.slice(0, 9)]
        setAuditLog(updated)
        persist('admin_audit', updated)
    }

    const saveThresholds = () => {
        setConfirmModal({
            title: 'Confirm Threshold Change',
            body: `REVIEW: ${DEFAULT_THRESHOLDS.review} → ${thresholds.review.toFixed(2)}\nBLOCK: ${DEFAULT_THRESHOLDS.block} → ${thresholds.block.toFixed(2)}`,
            onConfirm: () => {
                persist('admin_thresholds', thresholds)
                addAudit(`Threshold saved (${thresholds.review.toFixed(2)}/${thresholds.block.toFixed(2)})`)
                showToast('Thresholds updated successfully', 'success')
                setConfirmModal(null)
            },
        })
    }

    const saveWeights = () => {
        persist('admin_weights', weights)
        addAudit(`Weights updated (${weights.lgbm}/${weights.graph})`)
        showToast('Weights saved successfully', 'success')
    }

    const toggleRule = (id) => {
        const rule = rules.find((r) => r.id === id)
        const newState = !rule.active
        setConfirmModal({
            title: `${newState ? 'Enable' : 'Disable'} Hard Rule`,
            body: `${rule.label}\n\n${newState ? 'This rule will immediate start blocking matching transactions.' : '⚠ Matched transactions will NO LONGER be blocked automatically.'}`,
            onConfirm: () => {
                const updated = rules.map((r) => r.id === id ? { ...r, active: newState } : r)
                setRules(updated)
                persist('admin_rules', updated)
                addAudit(`Hard rule ${newState ? 'enabled' : 'disabled'} (${rule.label})`)
                showToast(`Rule ${newState ? 'enabled' : 'disabled'}`, newState ? 'success' : 'warning')
                setConfirmModal(null)
            },
        })
    }

    // Compute impact preview
    const blockRate = Math.max(0, 0.73 + (thresholds.block - 0.82) * -5).toFixed(2)
    const reviewRate = Math.max(0, 2.74 + (thresholds.review - 0.45) * -8).toFixed(2)
    const allowRate = (100 - parseFloat(blockRate) - parseFloat(reviewRate)).toFixed(1)

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Warning */}
            <div className="card flex items-center gap-3" style={{ background: 'rgba(255,176,32,0.05)', borderColor: 'rgba(255,176,32,0.2)' }}>
                <AlertTriangle size={20} style={{ color: 'var(--accent-amber)' }} />
                <span className="text-sm" style={{ color: 'var(--accent-amber)' }}>Changes to thresholds affect all live decisions. Adjust carefully and monitor the Live Feed after saving.</span>
            </div>

            {/* Section 1: Thresholds */}
            <div className="card">
                <div className="section-header">Decision Thresholds</div>

                {/* Visual threshold bar */}
                <div className="my-6 relative" style={{ height: 32, borderRadius: 16, background: 'linear-gradient(90deg, #00E5A0 0%, #FFB020 50%, #FF3B5C 100%)', opacity: 0.3 }}>
                    <div className="absolute top-0 bottom-0" style={{ left: `${thresholds.review * 100}%`, width: 2, background: '#FFB020', boxShadow: '0 0 8px #FFB020' }}>
                        <span className="absolute -top-5 -translate-x-1/2 mono text-xs" style={{ color: 'var(--accent-amber)' }}>{thresholds.review.toFixed(2)}</span>
                    </div>
                    <div className="absolute top-0 bottom-0" style={{ left: `${thresholds.block * 100}%`, width: 2, background: '#FF3B5C', boxShadow: '0 0 8px #FF3B5C' }}>
                        <span className="absolute -top-5 -translate-x-1/2 mono text-xs" style={{ color: 'var(--accent-red)' }}>{thresholds.block.toFixed(2)}</span>
                    </div>
                </div>
                <div className="flex justify-between text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
                    <span>0.0 — ALLOW</span>
                    <span>REVIEW</span>
                    <span>BLOCK — 1.0</span>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-4">
                    <div>
                        <label className="text-xs flex justify-between mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <span>REVIEW Threshold</span>
                            <span className="mono" style={{ color: 'var(--accent-amber)' }}>{thresholds.review.toFixed(2)}</span>
                        </label>
                        <input type="range" min="0.1" max={thresholds.block - 0.05} step="0.01" value={thresholds.review}
                            onChange={(e) => setThresholds((p) => ({ ...p, review: parseFloat(e.target.value) }))}
                            className="w-full" style={{ accentColor: '#FFB020' }}
                        />
                    </div>
                    <div>
                        <label className="text-xs flex justify-between mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <span>BLOCK Threshold</span>
                            <span className="mono" style={{ color: 'var(--accent-red)' }}>{thresholds.block.toFixed(2)}</span>
                        </label>
                        <input type="range" min={thresholds.review + 0.05} max="0.99" step="0.01" value={thresholds.block}
                            onChange={(e) => setThresholds((p) => ({ ...p, block: parseFloat(e.target.value) }))}
                            className="w-full" style={{ accentColor: '#FF3B5C' }}
                        />
                    </div>
                </div>

                <div className="p-3 rounded-lg text-xs mb-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Impact preview: </span>
                    <span style={{ color: 'var(--accent-red)' }}>Blocked: {blockRate}%</span>
                    <span style={{ color: 'var(--text-muted)' }}> | </span>
                    <span style={{ color: 'var(--accent-amber)' }}>Reviewed: {reviewRate}%</span>
                    <span style={{ color: 'var(--text-muted)' }}> | </span>
                    <span style={{ color: 'var(--accent-green)' }}>Allowed: {allowRate}%</span>
                </div>

                <div className="flex gap-2 justify-end">
                    <button onClick={() => setThresholds(DEFAULT_THRESHOLDS)} className="btn-secondary text-xs"><RotateCcw size={14} /> Reset</button>
                    <button onClick={saveThresholds} className="btn-primary text-xs"><Save size={14} /> Save Thresholds</button>
                </div>
            </div>

            {/* Section 2: Hard Rules */}
            <div className="card">
                <div className="section-header">Hard Block Rules</div>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>These rules trigger BEFORE the model. Matched transactions are immediately blocked.</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left py-2 px-3 font-medium">Rule</th>
                                <th className="text-center py-2 px-3 font-medium">Status</th>
                                <th className="text-right py-2 px-3 font-medium">Triggered</th>
                                <th className="text-right py-2 px-3 font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map((rule) => (
                                <tr key={rule.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td className="py-2.5 px-3 text-xs">{rule.label}</td>
                                    <td className="py-2.5 px-3 text-center">
                                        <span className="text-xs flex items-center justify-center gap-1" style={{ color: rule.active ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: rule.active ? 'var(--accent-green)' : 'var(--accent-red)' }} />
                                            {rule.active ? 'Active' : 'Disabled'}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right mono text-xs">{rule.triggered}</td>
                                    <td className="py-2.5 px-3 text-right">
                                        <button onClick={() => toggleRule(rule.id)} className="btn-secondary text-xs" style={{ padding: '4px 10px' }}>
                                            {rule.active ? <><Lock size={12} /> Disable</> : <><Unlock size={12} /> Enable</>}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Section 3: Weights */}
            <div className="card">
                <div className="section-header">Model Ensemble Weights</div>
                <div className="grid grid-cols-2 gap-6 mb-4">
                    <div>
                        <label className="text-xs flex justify-between mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <span>LightGBM</span><span className="mono">{weights.lgbm}%</span>
                        </label>
                        <input type="range" min="10" max="90" value={weights.lgbm}
                            onChange={(e) => { const v = parseInt(e.target.value); setWeights({ lgbm: v, graph: 100 - v }) }}
                            className="w-full" style={{ accentColor: 'var(--accent-cyan)' }}
                        />
                    </div>
                    <div>
                        <label className="text-xs flex justify-between mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <span>Graph Risk</span><span className="mono">{weights.graph}%</span>
                        </label>
                        <input type="range" min="10" max="90" value={weights.graph}
                            onChange={(e) => { const v = parseInt(e.target.value); setWeights({ graph: v, lgbm: 100 - v }) }}
                            className="w-full" style={{ accentColor: 'var(--accent-cyan)' }}
                        />
                    </div>
                </div>
                <div className="flex gap-2 justify-end">
                    <button onClick={() => setWeights(DEFAULT_WEIGHTS)} className="btn-secondary text-xs"><RotateCcw size={14} /> Reset 75/25</button>
                    <button onClick={saveWeights} className="btn-primary text-xs"><Save size={14} /> Save Weights</button>
                </div>
            </div>

            {/* Section 4: Audit */}
            <div className="card">
                <div className="section-header">Recent Admin Actions</div>
                {auditLog.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No actions yet</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left py-2 px-3 font-medium">Timestamp</th>
                                <th className="text-left py-2 px-3 font-medium">Action</th>
                                <th className="text-left py-2 px-3 font-medium">Admin</th>
                            </tr>
                        </thead>
                        <tbody>
                            {auditLog.map((entry, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td className="py-2 px-3 mono text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(entry.timestamp).toLocaleString()}</td>
                                    <td className="py-2 px-3 text-xs">{entry.action}</td>
                                    <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{entry.admin}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Confirm Modal */}
            {confirmModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="card fade-in" style={{ maxWidth: 460, width: '90%' }}>
                        <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle size={18} style={{ color: 'var(--accent-amber)' }} />
                            <h3 className="font-semibold text-sm">{confirmModal.title}</h3>
                        </div>
                        <pre className="text-xs whitespace-pre-wrap mb-4" style={{ color: 'var(--text-secondary)' }}>{confirmModal.body}</pre>
                        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>This will affect all future transactions. Monitor the Live Feed after saving.</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirmModal(null)} className="btn-secondary text-xs">Cancel</button>
                            <button onClick={confirmModal.onConfirm} className="btn-primary text-xs"><Save size={14} /> Confirm & Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
