import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDashboardStats, getDashboardChartData, getDashboardRecentAlerts } from '../api/fraudApi'
import { generateMockTransaction } from '../api/mockData'
import { STATS_REFRESH_MS } from '../config'
import StatCard from '../components/common/StatCard'
import DecisionBadge from '../components/common/DecisionBadge'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import FraudTrendChart from '../components/charts/FraudTrendChart'
import DecisionPieChart from '../components/charts/DecisionPieChart'
import { ShieldAlert, ShieldCheck, Activity, X, TrendingUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export default function Dashboard() {
    // DB-backed ALL_TIME stats — the actual 50k entries
    const { data: dashStats, isLoading, error, refetch } = useQuery({
        queryKey: ['dashboardStats'],
        queryFn: () => getDashboardStats('ALL_TIME'),
        refetchInterval: STATS_REFRESH_MS,
    })

    // Live chart data from DB (replaces static mock)
    const { data: chartData } = useQuery({
        queryKey: ['dashboardChartData'],
        queryFn: () => getDashboardChartData(24),
        refetchInterval: STATS_REFRESH_MS,
    })

    const { data: recentAlertsData } = useQuery({
        queryKey: ['recentAlerts'],
        queryFn: () => getDashboardRecentAlerts(10),
        refetchInterval: STATS_REFRESH_MS,
    })

    const [selectedAlert, setSelectedAlert] = useState(null)

    if (isLoading) return <LoadingSpinner text="Loading dashboard..." />
    if (error) return <ErrorBanner message={error.message} onRetry={refetch} />

    // Use DB-backed aggregate stats (not in-memory session counter)
    const totalTransactions = dashStats?.total_transactions || 0
    const totalNoFraud = dashStats?.no_fraud_count || 0
    const totalFraud = dashStats?.fraud_count || 0
    const activeMonitoring = dashStats?.active_monitoring || 0

    // Live hourly trend from DB
    const hourlyTrend = chartData?.hourly_trend || []

    const recentAlerts = recentAlertsData?.alerts || Array.from({ length: 10 }, () => {
        const t = generateMockTransaction()
        t.classification = 'FRAUD'
        t.internal_risk_score = 50 + Math.random() * 50
        return t
    })

    const sparkline = (base) => Array.from({ length: 12 }, () => ({ v: base + Math.floor(Math.random() * base * 0.3) }))

    return (
        <div className="space-y-6">
            {/* Stat Cards — DB-backed Binary Classification */}
            <div className="grid grid-cols-4 gap-4">
                <StatCard title="Total Transactions" value={totalTransactions} subtitle="Analyzed in real-time" color="var(--accent-cyan)" icon={Activity} sparklineData={sparkline(400)} />
                <StatCard title="NO FRAUD" value={totalNoFraud} subtitle="Classified secure" color="var(--accent-green)" icon={ShieldCheck} sparklineData={sparkline(350)} />
                <StatCard title="FRAUD" value={totalFraud} subtitle="Identified threats" color="var(--accent-red)" icon={ShieldAlert} sparklineData={sparkline(8)} />
                <StatCard title="Active Monitoring" value={activeMonitoring} subtitle="Continuous pattern matching" color="var(--accent-amber)" icon={TrendingUp} sparklineData={sparkline(5)} />
            </div>

            {/* Charts Row */}
            <div className="grid gap-4" style={{ gridTemplateColumns: '65% 35%' }}>
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-sm">Classification Trend — Last 24 Hours</h3>
                        <div className="flex items-center gap-2">
                            <div className="live-dot" />
                            <span className="text-xs font-medium" style={{ color: 'var(--accent-cyan)' }}>LIVE</span>
                        </div>
                    </div>
                    <FraudTrendChart data={hourlyTrend} />
                </div>
                <div className="card flex flex-col items-center justify-center">
                    <h3 className="font-semibold text-sm mb-4">Classification Split</h3>
                    <DecisionPieChart fraud={totalFraud} noFraud={totalNoFraud} />
                </div>
            </div>

            {/* Recent Fraud Alerts */}
            <div className="card relative">
                <h3 className="font-semibold text-sm mb-4">Recent Fraud Alerts</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left py-2 px-3 font-medium">Transaction ID</th>
                                <th className="text-left py-2 px-3 font-medium">Sender</th>
                                <th className="text-right py-2 px-3 font-medium">Amount</th>
                                <th className="text-center py-2 px-3 font-medium">Classification</th>
                                <th className="text-left py-2 px-3 font-medium">Indicators</th>
                                <th className="text-right py-2 px-3 font-medium">Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentAlerts.map((alert, i) => {
                                const cls = alert.classification || 'FRAUD'
                                const sender = alert.sender_user_id || alert.upi_id_sender || '—'
                                const amount = alert.amount || 0
                                const ts = alert.timestamp || new Date().toISOString()
                                const indicators = alert.fraud_indicators || []
                                return (
                                    <tr
                                        key={i}
                                        className="cursor-pointer transition-colors"
                                        style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', borderBottom: '1px solid var(--border)' }}
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
                                                    <span key={j} className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)', fontSize: 9 }}>
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

                {/* Detail drawer */}
                {selectedAlert && (
                    <div className="fixed top-0 right-0 h-screen z-40 slide-in-right" style={{ width: 400, background: 'var(--bg-surface)', borderLeft: '1px solid var(--border)', padding: 24, overflowY: 'auto' }}>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold">Transaction Details</h3>
                            <button onClick={() => setSelectedAlert(null)} style={{ background: 'transparent', color: 'var(--text-secondary)' }}><X size={18} /></button>
                        </div>
                        <div className="mono text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>{selectedAlert.transaction_id}</div>
                        <div className="mb-4"><DecisionBadge decision={selectedAlert.classification || 'FRAUD'} size="lg" /></div>

                        {/* Fraud indicators */}
                        {selectedAlert.fraud_indicators && selectedAlert.fraud_indicators.length > 0 && (
                            <div className="mb-4">
                                <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Fraud Indicators</div>
                                <div className="flex flex-wrap gap-1">
                                    {selectedAlert.fraud_indicators.map((ind, j) => (
                                        <span key={j} className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(255,59,92,0.1)', color: 'var(--accent-red)' }}>
                                            {ind.replace(/_/g, ' ')}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Trust indicators */}
                        {selectedAlert.trust_indicators && selectedAlert.trust_indicators.length > 0 && (
                            <div className="mb-4">
                                <div className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Trust Factors</div>
                                <div className="flex flex-wrap gap-1">
                                    {selectedAlert.trust_indicators.map((ind, j) => (
                                        <span key={j} className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(0,229,160,0.1)', color: 'var(--accent-green)' }}>
                                            ✓ {ind.replace(/_/g, ' ')}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {selectedAlert.reason && (
                            <div className="p-3 rounded-lg mb-4" style={{ background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.2)' }}>
                                <div className="text-xs font-medium" style={{ color: 'var(--accent-red)' }}>Hard Rule: {selectedAlert.reason}</div>
                            </div>
                        )}
                        <div className="space-y-3 text-sm">
                            {[
                                ['Sender', selectedAlert.sender_user_id || selectedAlert.upi_id_sender],
                                ['Receiver', selectedAlert.receiver_id || selectedAlert.upi_id_receiver],
                                ['Amount', `₹${(selectedAlert.amount || 0).toLocaleString('en-IN')}`],
                                ['Type', selectedAlert.transaction_type],
                                ['Latency', `${selectedAlert.latency_ms || selectedAlert.processing_time_ms || 0}ms`],
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
