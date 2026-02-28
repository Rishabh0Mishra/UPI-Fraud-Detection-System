import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getStats } from '../api/fraudApi'
import { generateHourlyData, generateMockTransaction } from '../api/mockData'
import { STATS_REFRESH_MS } from '../config'
import StatCard from '../components/common/StatCard'
import DecisionBadge from '../components/common/DecisionBadge'
import FraudScoreBar from '../components/common/FraudScoreBar'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import FraudTrendChart from '../components/charts/FraudTrendChart'
import DecisionPieChart from '../components/charts/DecisionPieChart'
import { ShieldAlert, ShieldCheck, AlertTriangle, Activity, X } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

const hourlyData = generateHourlyData()
const recentAlerts = Array.from({ length: 10 }, () => {
    const t = generateMockTransaction()
    t.decision = Math.random() < 0.6 ? 'BLOCK' : 'REVIEW'
    t.fraud_score = t.decision === 'BLOCK' ? 0.82 + Math.random() * 0.18 : 0.45 + Math.random() * 0.37
    return t
})

export default function Dashboard() {
    const { data: stats, isLoading, error, refetch } = useQuery({
        queryKey: ['stats'],
        queryFn: getStats,
        refetchInterval: STATS_REFRESH_MS,
    })
    const [selectedAlert, setSelectedAlert] = useState(null)

    if (isLoading) return <LoadingSpinner text="Loading dashboard..." />
    if (error) return <ErrorBanner message={error.message} onRetry={refetch} />

    const sparkline = (base) => Array.from({ length: 12 }, (_, i) => ({ v: base + Math.floor(Math.random() * base * 0.3) }))

    return (
        <div className="space-y-6">
            {/* Stat Cards */}
            <div className="grid grid-cols-4 gap-4">
                <StatCard title="Total Scored" value={stats.total_scored} subtitle="+234 last hour" color="var(--accent-cyan)" icon={Activity} sparklineData={sparkline(400)} />
                <StatCard title="Blocked" value={stats.total_blocked} subtitle={`${(stats.block_rate * 100).toFixed(2)}% rate`} color="var(--accent-red)" icon={ShieldAlert} sparklineData={sparkline(8)} />
                <StatCard title="Under Review" value={stats.total_reviewed} subtitle={`${(stats.review_rate * 100).toFixed(2)}% rate`} color="var(--accent-amber)" icon={AlertTriangle} sparklineData={sparkline(20)} />
                <StatCard title="Allowed" value={stats.total_allowed} subtitle={`${((1 - stats.block_rate - stats.review_rate) * 100).toFixed(1)}% rate`} color="var(--accent-green)" icon={ShieldCheck} sparklineData={sparkline(350)} />
            </div>

            {/* Charts Row */}
            <div className="grid gap-4" style={{ gridTemplateColumns: '65% 35%' }}>
                <div className="card">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="font-semibold text-sm">Fraud Trend — Last 24 Hours</h3>
                        <div className="flex items-center gap-2">
                            <div className="live-dot" />
                            <span className="text-xs font-medium" style={{ color: 'var(--accent-cyan)' }}>LIVE</span>
                        </div>
                    </div>
                    <FraudTrendChart data={hourlyData} />
                </div>
                <div className="card flex flex-col items-center justify-center">
                    <h3 className="font-semibold text-sm mb-4">Decision Distribution</h3>
                    <DecisionPieChart blocked={stats.total_blocked} reviewed={stats.total_reviewed} allowed={stats.total_allowed} />
                </div>
            </div>

            {/* Recent Alerts */}
            <div className="card relative">
                <h3 className="font-semibold text-sm mb-4">Recent Alerts</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left py-2 px-3 font-medium">Transaction ID</th>
                                <th className="text-left py-2 px-3 font-medium">Sender</th>
                                <th className="text-right py-2 px-3 font-medium">Amount</th>
                                <th className="text-center py-2 px-3 font-medium">Decision</th>
                                <th className="text-left py-2 px-3 font-medium" style={{ width: 120 }}>Fraud Score</th>
                                <th className="text-left py-2 px-3 font-medium">Reason</th>
                                <th className="text-right py-2 px-3 font-medium">Time</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recentAlerts.map((alert, i) => (
                                <tr
                                    key={i}
                                    className="cursor-pointer transition-colors"
                                    style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)', borderBottom: '1px solid var(--border)' }}
                                    onClick={() => setSelectedAlert(alert)}
                                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,212,255,0.03)')}
                                    onMouseLeave={(e) => (e.currentTarget.style.background = i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)')}
                                >
                                    <td className="py-2.5 px-3 mono text-xs">{alert.transaction_id.slice(-8)}</td>
                                    <td className="py-2.5 px-3 mono text-xs" style={{ color: 'var(--text-secondary)' }}>{alert.sender_user_id}</td>
                                    <td className="py-2.5 px-3 mono text-xs text-right">₹{alert.amount.toLocaleString('en-IN')}</td>
                                    <td className="py-2.5 px-3 text-center"><DecisionBadge decision={alert.decision} size="sm" /></td>
                                    <td className="py-2.5 px-3"><FraudScoreBar score={alert.fraud_score} width={80} height={4} showLabel={false} animated={false} /></td>
                                    <td className="py-2.5 px-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{alert.reason || alert.fraud_type || '—'}</td>
                                    <td className="py-2.5 px-3 text-xs text-right" style={{ color: 'var(--text-muted)' }}>{formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}</td>
                                </tr>
                            ))}
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
                        <div className="mb-4"><DecisionBadge decision={selectedAlert.decision} size="lg" /></div>
                        <div className="mb-6">
                            <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Fraud Score</div>
                            <div className="mono text-3xl font-bold mb-2">{selectedAlert.fraud_score.toFixed(4)}</div>
                            <FraudScoreBar score={selectedAlert.fraud_score} height={10} />
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>LightGBM</div>
                                <FraudScoreBar score={selectedAlert.lgbm_score} height={6} />
                            </div>
                            <div>
                                <div className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Graph Risk</div>
                                <FraudScoreBar score={selectedAlert.graph_risk_score} height={6} />
                            </div>
                        </div>
                        {selectedAlert.reason && (
                            <div className="p-3 rounded-lg mb-4" style={{ background: 'rgba(255,59,92,0.1)', border: '1px solid rgba(255,59,92,0.2)' }}>
                                <div className="text-xs font-medium" style={{ color: 'var(--accent-red)' }}>Hard Rule: {selectedAlert.reason}</div>
                            </div>
                        )}
                        <div className="space-y-3 text-sm">
                            {[['Sender', selectedAlert.sender_user_id], ['Receiver', selectedAlert.receiver_id], ['Amount', `₹${selectedAlert.amount.toLocaleString('en-IN')}`], ['Type', selectedAlert.transaction_type], ['Latency', `${selectedAlert.latency_ms}ms`]].map(([k, v]) => (
                                <div key={k} className="flex justify-between">
                                    <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                                    <span className="mono">{v}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
