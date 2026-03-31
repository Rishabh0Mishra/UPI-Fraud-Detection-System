import { useState, useRef } from 'react'
import { useLiveFeed } from '../context/LiveFeedContext'
import DecisionBadge from '../components/common/DecisionBadge'
import { Play, Pause, Trash2, Search, Radio } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function LiveFeed() {
    // All persistent state comes from the context (survives page navigation)
    const { transactions, stats, isLive, setIsLive, wsConnected, clearFeed } = useLiveFeed()

    // Local-only UI state (filter / search don't need to persist)
    const [filter, setFilter] = useState('ALL')
    const [search, setSearch] = useState('')
    const scrollRef = useRef(null)

    const filtered = transactions.filter((t) => {
        const cls = t.classification || (t.decision === 'ALLOW' ? 'NO_FRAUD' : 'FRAUD')
        if (filter !== 'ALL' && cls !== filter) return false
        if (search) {
            const q = search.toLowerCase()
            const txnId = (t.transaction_id || '').toLowerCase()
            const sender = (t.sender_user_id || t.upi_id_sender || '').toLowerCase()
            const receiver = (t.receiver_id || t.upi_id_receiver || '').toLowerCase()
            if (!txnId.includes(q) && !sender.includes(q) && !receiver.includes(q)) return false
        }
        return true
    })

    const borderColor = (t) => {
        const cls = t.classification || (t.decision === 'ALLOW' ? 'NO_FRAUD' : 'FRAUD')
        return cls === 'FRAUD' ? 'var(--accent-red)' : 'rgba(0,229,160,0.3)'
    }

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="card flex items-center flex-wrap gap-4">
                <button
                    onClick={() => setIsLive(!isLive)}
                    className="btn-secondary"
                    style={{ color: isLive ? 'var(--accent-green)' : 'var(--text-secondary)' }}
                >
                    {isLive ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
                </button>

                <div className="flex gap-1">
                    {['ALL', 'NO_FRAUD', 'FRAUD'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                            style={{
                                background: filter === f ? (f === 'FRAUD' ? 'rgba(255,59,92,0.1)' : f === 'NO_FRAUD' ? 'rgba(0,229,160,0.1)' : 'rgba(0,212,255,0.1)') : 'transparent',
                                color: filter === f ? (f === 'FRAUD' ? 'var(--accent-red)' : f === 'NO_FRAUD' ? 'var(--accent-green)' : 'var(--accent-cyan)') : 'var(--text-secondary)',
                                border: `1px solid ${filter === f ? (f === 'FRAUD' ? 'var(--accent-red)' : f === 'NO_FRAUD' ? 'var(--accent-green)' : 'var(--accent-cyan)') : 'var(--border)'}`,
                            }}
                        >
                            {f === 'NO_FRAUD' ? '✅ NO FRAUD' : f === 'FRAUD' ? '❌ FRAUD' : '📊 ALL'}
                        </button>
                    ))}
                </div>

                <div className="relative flex-1" style={{ minWidth: 200 }}>
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
                    <input
                        type="text"
                        placeholder="Search by ID..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="pl-8"
                        style={{ padding: '8px 12px 8px 32px' }}
                    />
                </div>

                <button onClick={clearFeed} className="btn-secondary text-xs">
                    <Trash2 size={14} /> Clear
                </button>
            </div>

            {/* Stats strip */}
            <div className="flex gap-6 px-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="mono font-medium" style={{ color: 'var(--text-primary)' }}>{stats.scored.toLocaleString('en-IN')}</span> scored
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="mono font-medium" style={{ color: 'var(--accent-green)' }}>{stats.noFraud}</span> safe
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="mono font-medium" style={{ color: 'var(--accent-red)' }}>{stats.fraud}</span> fraud
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Avg latency: <span className="mono font-medium">{stats.avgLatency}ms</span>
                </span>
                {isLive && (
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: wsConnected ? 'var(--accent-green)' : 'var(--accent-amber)' }}>
                        <Radio size={12} className="animate-pulse" />
                        {wsConnected ? 'Live (WS)' : 'Live (Polling)'}
                    </span>
                )}
            </div>

            {/* Transaction Stream */}
            <div className="space-y-2" ref={scrollRef} style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
                {filtered.length === 0 && (
                    <div className="card flex flex-col items-center justify-center py-16">
                        <Radio size={32} className="animate-pulse mb-3" style={{ color: 'var(--text-muted)' }} />
                        <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>Waiting for transactions...</span>
                    </div>
                )}
                {filtered.map((txn, i) => {
                    const cls = txn.classification || (txn.decision === 'ALLOW' ? 'NO_FRAUD' : 'FRAUD')
                    const sender = txn.sender_user_id || txn.upi_id_sender || '—'
                    const receiver = txn.receiver_id || txn.upi_id_receiver || '—'
                    const amount = txn.amount || 0
                    const latency = txn.latency_ms || txn.processing_time_ms || 0
                    const ts = txn.timestamp || new Date().toISOString()
                    const indicators = txn.fraud_indicators || []
                    const trustInds = txn.trust_indicators || []

                    return (
                        <div
                            key={(txn.transaction_id || i) + '-' + i}
                            className={`card slide-in-top ${cls === 'FRAUD' ? 'block-flash' : ''}`}
                            style={{
                                padding: '14px 18px',
                                borderLeft: `3px solid ${borderColor(txn)}`,
                                animationDelay: `${i * 50}ms`,
                            }}
                        >
                            <div className="flex items-center gap-3 flex-wrap">
                                <DecisionBadge decision={cls} size="sm" />
                                <span className="mono text-xs font-medium">{txn.transaction_id || '—'}</span>
                                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                    {sender} → {receiver}
                                </span>
                                <span className="mono text-sm font-medium ml-auto">₹{amount.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="flex items-center gap-4 mt-2 flex-wrap">
                                {/* Show fraud indicators for FRAUD transactions */}
                                {cls === 'FRAUD' && indicators.length > 0 && (
                                    <div className="flex gap-1 flex-wrap">
                                        {indicators.slice(0, 3).map((ind, j) => (
                                            <span key={j} className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)', fontSize: 9 }}>
                                                {ind.replace(/_/g, ' ')}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {/* Show trust indicators for NO_FRAUD transactions */}
                                {cls === 'NO_FRAUD' && trustInds.length > 0 && (
                                    <div className="flex gap-1 flex-wrap">
                                        {trustInds.slice(0, 2).map((ind, j) => (
                                            <span key={j} className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(0,229,160,0.1)', color: 'var(--accent-green)', fontSize: 9 }}>
                                                ✓ {ind.replace(/_/g, ' ')}
                                            </span>
                                        ))}
                                    </div>
                                )}
                                {txn.reason && <span className="text-xs" style={{ color: 'var(--accent-red)' }}>Rule: {txn.reason}</span>}
                                <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{latency}ms</span>
                                <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
                                    {(() => { try { return formatDistanceToNow(new Date(ts), { addSuffix: true }) } catch { return '—' } })()}
                                </span>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
