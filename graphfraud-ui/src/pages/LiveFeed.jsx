import { useState, useEffect, useRef } from 'react'
import { generateMockTransaction } from '../api/mockData'
import { LIVE_FEED_INTERVAL_MS } from '../config'
import DecisionBadge from '../components/common/DecisionBadge'
import FraudScoreBar from '../components/common/FraudScoreBar'
import { Play, Pause, Trash2, Search, Radio } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function LiveFeed() {
    const [transactions, setTransactions] = useState([])
    const [isLive, setIsLive] = useState(true)
    const [filter, setFilter] = useState('ALL')
    const [search, setSearch] = useState('')
    const [stats, setStats] = useState({ scored: 0, blocked: 0, avgLatency: 0 })
    const scrollRef = useRef(null)

    useEffect(() => {
        if (!isLive) return
        const interval = setInterval(() => {
            const txn = generateMockTransaction()
            setTransactions((prev) => [txn, ...prev.slice(0, 199)])
            setStats((prev) => ({
                scored: prev.scored + 1,
                blocked: prev.blocked + (txn.decision === 'BLOCK' ? 1 : 0),
                avgLatency: parseFloat(((prev.avgLatency * prev.scored + txn.latency_ms) / (prev.scored + 1)).toFixed(1)),
            }))
        }, LIVE_FEED_INTERVAL_MS + Math.random() * 1000)
        return () => clearInterval(interval)
    }, [isLive])

    const filtered = transactions.filter((t) => {
        if (filter !== 'ALL' && t.decision !== filter) return false
        if (search && !t.transaction_id.toLowerCase().includes(search.toLowerCase()) && !t.sender_user_id.toLowerCase().includes(search.toLowerCase())) return false
        return true
    })

    const borderColor = (d) => d === 'BLOCK' ? 'var(--accent-red)' : d === 'REVIEW' ? 'var(--accent-amber)' : 'rgba(0,229,160,0.3)'

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
                    {['ALL', 'BLOCK', 'REVIEW', 'ALLOW'].map((f) => (
                        <button
                            key={f}
                            onClick={() => setFilter(f)}
                            className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                            style={{
                                background: filter === f ? 'rgba(0,212,255,0.1)' : 'transparent',
                                color: filter === f ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                                border: `1px solid ${filter === f ? 'var(--accent-cyan)' : 'var(--border)'}`,
                            }}
                        >
                            {f}
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

                <button onClick={() => { setTransactions([]); setStats({ scored: 0, blocked: 0, avgLatency: 0 }) }} className="btn-secondary text-xs">
                    <Trash2 size={14} /> Clear
                </button>
            </div>

            {/* Stats strip */}
            <div className="flex gap-6 px-2">
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="mono font-medium" style={{ color: 'var(--text-primary)' }}>{stats.scored.toLocaleString('en-IN')}</span> scored
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <span className="mono font-medium" style={{ color: 'var(--accent-red)' }}>{stats.blocked}</span> blocked ({stats.scored ? ((stats.blocked / stats.scored) * 100).toFixed(1) : 0}%)
                </span>
                <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Avg latency: <span className="mono font-medium">{stats.avgLatency}ms</span>
                </span>
                {isLive && (
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--accent-green)' }}>
                        <Radio size={12} className="animate-pulse" /> Live
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
                {filtered.map((txn, i) => (
                    <div
                        key={txn.transaction_id + i}
                        className={`card slide-in-top ${txn.decision === 'BLOCK' ? 'block-flash' : ''}`}
                        style={{
                            padding: '14px 18px',
                            borderLeft: `3px solid ${borderColor(txn.decision)}`,
                            animationDelay: `${i * 50}ms`,
                        }}
                    >
                        <div className="flex items-center gap-3 flex-wrap">
                            <DecisionBadge decision={txn.decision} size="sm" />
                            <span className="mono text-xs font-medium">{txn.transaction_id}</span>
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                                {txn.sender_user_id} → {txn.receiver_id}
                            </span>
                            <span className="mono text-sm font-medium ml-auto">₹{txn.amount.toLocaleString('en-IN')}</span>
                            {txn.fraud_type && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>{txn.fraud_type}</span>}
                        </div>
                        <div className="flex items-center gap-4 mt-2">
                            <div style={{ width: 200 }}>
                                <FraudScoreBar score={txn.fraud_score} height={4} animated={false} />
                            </div>
                            <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>{txn.latency_ms}ms</span>
                            {txn.reason && <span className="text-xs" style={{ color: 'var(--accent-red)' }}>Rule: {txn.reason}</span>}
                            <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>{formatDistanceToNow(new Date(txn.timestamp), { addSuffix: true })}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
