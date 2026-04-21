import { useState } from 'react'
import { useDashboard } from '../context/DashboardContext'
import StatCard from '../components/common/StatCard'
import DecisionBadge from '../components/common/DecisionBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import FraudTrendChart from '../components/charts/FraudTrendChart'
import DecisionPieChart from '../components/charts/DecisionPieChart'
import { ShieldAlert, ShieldCheck, Activity, X, TrendingUp, RefreshCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function Dashboard() {
    // All data comes from DashboardContext — which polls the Live Feed DB
    // every 5s in the background regardless of which page is active.
    const { stats, chartData, recentAlerts, loading, error, refetch, lastUpdated } = useDashboard()
    const [selectedAlert, setSelectedAlert] = useState(null)

    // Show spinner only on the very first load (no data yet)
    if (loading && !stats) return <LoadingSpinner text="Loading dashboard..." />
    if (error && !stats)   return <ErrorBanner message={error} onRetry={refetch} />

    // Stats directly from DB — these reflect the 50k FIFO live feed DB
    const totalTransactions = stats?.total_transactions || 0
    const totalNoFraud      = stats?.no_fraud_count     || 0
    const totalFraud        = stats?.fraud_count        || 0
    const activeMonitoring  = stats?.active_monitoring  || 0

    // Hourly trend from DB
    const hourlyTrend = chartData?.hourly_trend || []

    const sparkline = (base) =>
        Array.from({ length: 12 }, () => ({ v: base + Math.floor(Math.random() * Math.max(base * 0.3, 1)) }))

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* View Header */}
            <div style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '3px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 4 }}>
                        Real-time · Live Feed DB
                    </div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 34, letterSpacing: '0.5px', color: 'var(--text)', lineHeight: 1 }}>
                        Dashboard
                    </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {lastUpdated && (
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px' }}>
                            {formatDistanceToNow(lastUpdated, { addSuffix: true })}
                        </span>
                    )}
                    <button
                        onClick={refetch}
                        style={{
                            display: 'flex', alignItems: 'center', gap: 6,
                            fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
                            letterSpacing: '1.5px', textTransform: 'uppercase',
                            color: 'var(--accent)',
                            background: 'rgba(232,184,109,0.08)',
                            border: '1px solid rgba(232,184,109,0.18)',
                            borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
                            transition: 'background 0.12s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(232,184,109,0.14)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(232,184,109,0.08)')}
                    >
                        <RefreshCw size={11} /> Refresh
                    </button>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-4">
                <StatCard title="Total Transactions" value={totalTransactions} subtitle="In live feed DB"             color="var(--accent)"  icon={Activity}    sparklineData={sparkline(400)} />
                <StatCard title="NO FRAUD"           value={totalNoFraud}      subtitle="Classified secure"           color="var(--safe)"    icon={ShieldCheck} sparklineData={sparkline(350)} />
                <StatCard title="FRAUD"              value={totalFraud}        subtitle="Identified threats"          color="var(--danger)"  icon={ShieldAlert} sparklineData={sparkline(8)}   />
                <StatCard title="Active Monitoring"  value={activeMonitoring}  subtitle="High-risk · Continuous"     color="var(--warn)"    icon={TrendingUp}  sparklineData={sparkline(5)}  />
            </div>

            {/* Charts Row */}
            <div className="grid gap-4" style={{ gridTemplateColumns: '65% 35%' }}>
                <div className="panel">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'var(--text3)' }}>
                            Classification Trend — Last 24 Hours
                        </div>
                        <div className="live-chip" style={{ padding: '3px 10px' }}>
                            <div className="ldot" />
                            Live
                        </div>
                    </div>
                    <FraudTrendChart data={hourlyTrend} />
                </div>
                <div className="panel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 14, width: '100%' }}>
                        Classification Split
                    </div>
                    <DecisionPieChart fraud={totalFraud} noFraud={totalNoFraud} />
                </div>
            </div>

            {/* Recent Fraud Alerts */}
            <div className="panel" style={{ position: 'relative' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '2.5px', textTransform: 'uppercase', color: 'var(--text3)' }}>
                        Recent Fraud Alerts
                    </div>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text3)', letterSpacing: '1px' }}>
                        {recentAlerts.length} alert{recentAlerts.length !== 1 ? 's' : ''}
                    </span>
                </div>

                {recentAlerts.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text3)', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '1px', textTransform: 'uppercase' }}>
                        No fraud alerts yet
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ color: 'var(--text3)', borderBottom: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 8, letterSpacing: '2px', textTransform: 'uppercase' }}>
                                    <th style={{ textAlign: 'left',   padding: '6px 10px', fontWeight: 400 }}>Transaction ID</th>
                                    <th style={{ textAlign: 'left',   padding: '6px 10px', fontWeight: 400 }}>Sender</th>
                                    <th style={{ textAlign: 'right',  padding: '6px 10px', fontWeight: 400 }}>Amount</th>
                                    <th style={{ textAlign: 'center', padding: '6px 10px', fontWeight: 400 }}>Classification</th>
                                    <th style={{ textAlign: 'left',   padding: '6px 10px', fontWeight: 400 }}>Indicators</th>
                                    <th style={{ textAlign: 'right',  padding: '6px 10px', fontWeight: 400 }}>Time</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentAlerts.map((alert, i) => {
                                    const cls        = alert.classification || 'FRAUD'
                                    const sender     = alert.sender_user_id || alert.upi_id_sender || '—'
                                    const amount     = alert.amount || 0
                                    const ts         = alert.timestamp || new Date().toISOString()
                                    const indicators = alert.fraud_indicators || []
                                    return (
                                        <tr
                                            key={alert.transaction_id || i}
                                            className="cursor-pointer transition-colors"
                                            style={{
                                                background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)',
                                                borderBottom: '1px solid var(--border)',
                                            }}
                                            onClick={() => setSelectedAlert(alert)}
                                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,212,255,0.03)')}
                                            onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}
                                        >
                                            <td className="py-2.5 px-3 mono text-xs">{(alert.transaction_id || '—').slice(-8)}</td>
                                            <td className="py-2.5 px-3 mono text-xs" style={{ color: 'var(--text-secondary)' }}>{sender}</td>
                                            <td className="py-2.5 px-3 mono text-xs text-right">₹{amount.toLocaleString('en-IN')}</td>
                                            <td className="py-2.5 px-3 text-center"><DecisionBadge decision={cls} size="sm" /></td>
                                            <td className="py-2.5 px-3">
                                                <div className="flex gap-1">
                                                    {indicators.slice(0, 2).map((ind, j) => (
                                                        <span key={j} className="text-xs px-1.5 py-0.5 rounded"
                                                            style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)', fontSize: 9 }}>
                                                            {ind.replace(/_/g, ' ')}
                                                        </span>
                                                    ))}
                                                    {!indicators.length && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>}
                                                </div>
                                            </td>
                                            <td className="py-2.5 px-3 text-xs text-right" style={{ color: 'var(--text-muted)' }}>
                                                {(() => { try { return formatDistanceToNow(new Date(ts), { addSuffix: true }) } catch { return '—' } })()}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Detail drawer */}
                {selectedAlert && (
                    <div className="fixed top-0 right-0 h-screen z-40 slide-in-right"
                        style={{ width: 400, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', padding: 24, overflowY: 'auto' }}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold">Transaction Details</h3>
                            <button onClick={() => setSelectedAlert(null)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}>
                                <X size={18} />
                            </button>
                        </div>
                        <div className="mono text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>{selectedAlert.transaction_id}</div>
                        <div className="mb-4"><DecisionBadge decision={selectedAlert.classification || 'FRAUD'} size="lg" /></div>

                        {selectedAlert.fraud_indicators?.length > 0 && (
                            <div className="mb-4">
                                <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Fraud Indicators</div>
                                <div className="flex flex-wrap gap-1">
                                    {selectedAlert.fraud_indicators.map((ind, j) => (
                                        <span key={j} className="text-xs px-2 py-1 rounded"
                                            style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)' }}>
                                            {ind.replace(/_/g, ' ')}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedAlert.trust_indicators?.length > 0 && (
                            <div className="mb-4">
                                <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Trust Factors</div>
                                <div className="flex flex-wrap gap-1">
                                    {selectedAlert.trust_indicators.map((ind, j) => (
                                        <span key={j} className="text-xs px-2 py-1 rounded"
                                            style={{ background: 'rgba(0,229,160,0.1)', color: 'var(--accent-green)' }}>
                                            ✓ {ind.replace(/_/g, ' ')}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedAlert.reason && (
                            <div className="p-3 rounded-lg mb-4"
                                style={{ background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.2)' }}>
                                <div className="text-xs font-medium" style={{ color: 'var(--accent-red)' }}>
                                    Hard Rule: {selectedAlert.reason}
                                </div>
                            </div>
                        )}

                        <div className="space-y-3 text-sm">
                            {[
                                ['Sender',   selectedAlert.sender_user_id || selectedAlert.upi_id_sender],
                                ['Receiver', selectedAlert.receiver_id    || selectedAlert.upi_id_receiver],
                                ['Amount',   `₹${(selectedAlert.amount || 0).toLocaleString('en-IN')}`],
                                ['Type',     selectedAlert.transaction_type],
                                ['Latency',  `${selectedAlert.latency_ms || selectedAlert.processing_time_ms || 0}ms`],
                            ].map(([k, v]) => (
                                <div key={k} className="flex justify-between">
                                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                                    <span className="mono">{v || '—'}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
