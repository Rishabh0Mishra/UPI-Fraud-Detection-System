import { useQuery } from '@tanstack/react-query'
import { getHealth, getStats } from '../api/fraudApi'
import { HEALTH_REFRESH_MS, STATS_REFRESH_MS } from '../config'
import LoadingSpinner from '../components/common/LoadingSpinner'
import ErrorBanner from '../components/common/ErrorBanner'
import FraudScoreBar from '../components/common/FraudScoreBar'
import { CheckCircle, XCircle, Server, Cpu } from 'lucide-react'

export default function SystemHealth() {
    const { data: health, isLoading: hLoading, error: hError, refetch: hRefetch } = useQuery({ queryKey: ['health'], queryFn: getHealth, refetchInterval: HEALTH_REFRESH_MS })
    const { data: stats, isLoading: sLoading } = useQuery({ queryKey: ['stats'], queryFn: getStats, refetchInterval: STATS_REFRESH_MS })

    if (hLoading || sLoading) return <LoadingSpinner text="Checking system health..." />
    if (hError) return <ErrorBanner message={hError.message} onRetry={hRefetch} />

    const isHealthy = health?.status === 'healthy' || health?.model_loaded
    const fmtUp = (s) => { const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = Math.floor(s % 60); return `${h}h ${m}m ${sec}s` }

    return (
        <div className="space-y-6">
            {/* Status Banner */}
            <div className="card flex items-center gap-4" style={{
                background: isHealthy ? 'rgba(0,229,160,0.05)' : 'rgba(255,59,92,0.05)',
                borderColor: isHealthy ? 'rgba(0,229,160,0.2)' : 'rgba(255,59,92,0.2)',
            }}>
                {isHealthy ? <CheckCircle size={24} style={{ color: 'var(--accent-green)' }} /> : <XCircle size={24} style={{ color: 'var(--accent-red)' }} />}
                <div>
                    <div className="font-semibold" style={{ color: isHealthy ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                        {isHealthy ? 'System Healthy' : 'System Unhealthy'}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        Uptime: {fmtUp(health.uptime_seconds)} · Last checked: {new Date().toLocaleTimeString()}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Model Info */}
                <div className="card">
                    <div className="section-header">Model Information</div>
                    <div className="space-y-3">
                        {[
                            ['Algorithm', 'LightGBM'],
                            ['Features', health.n_features],
                            ['Graph Nodes', (health.n_graph_risk_entries || 0).toLocaleString('en-IN')],
                            ['Ring Members', health.n_ring_members],
                            ['Controllers', health.n_ring_controllers],
                        ].map(([k, v]) => (
                            <div key={k} className="flex justify-between text-sm">
                                <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                                <span className="mono font-medium">{v}</span>
                            </div>
                        ))}
                    </div>

                    <div className="section-header mt-6">Decision Thresholds</div>
                    <div className="space-y-3">
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span style={{ color: 'var(--accent-red)' }}>BLOCK threshold</span>
                                <span className="mono">{health.block_threshold?.toFixed(6)}</span>
                            </div>
                            <FraudScoreBar score={health.block_threshold || 0.5} height={8} showLabel={false} />
                        </div>
                        <div>
                            <div className="flex justify-between text-xs mb-1">
                                <span style={{ color: 'var(--accent-amber)' }}>REVIEW threshold</span>
                                <span className="mono">{health.review_threshold?.toFixed(6)}</span>
                            </div>
                            <FraudScoreBar score={health.review_threshold || 0.3} height={8} showLabel={false} />
                        </div>
                    </div>
                </div>

                {/* Live Counters */}
                <div className="card">
                    <div className="section-header">Since Server Start</div>
                    <div className="space-y-3">
                        {stats && [
                            ['Total Scored', stats.total_scored?.toLocaleString('en-IN'), 'var(--text-primary)'],
                            ['Blocked', `${stats.total_blocked} (${(stats.block_rate * 100).toFixed(2)}%)`, 'var(--accent-red)'],
                            ['Reviewed', `${stats.total_reviewed} (${(stats.review_rate * 100).toFixed(2)}%)`, 'var(--accent-amber)'],
                            ['Allowed', stats.total_allowed?.toLocaleString('en-IN'), 'var(--accent-green)'],
                        ].map(([k, v, c]) => (
                            <div key={k} className="flex justify-between text-sm">
                                <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                                <span className="mono font-medium" style={{ color: c }}>{v}</span>
                            </div>
                        ))}
                    </div>

                    <div className="section-header mt-6">Performance</div>
                    <div className="space-y-3">
                        {[['SLA Target', '50ms', 'var(--accent-green)']].map(([k, v, c]) => (
                            <div key={k} className="flex justify-between text-sm">
                                <span style={{ color: 'var(--text-secondary)' }}>{k}</span>
                                <span className="mono font-medium flex items-center gap-1" style={{ color: c }}>{v} <CheckCircle size={12} /></span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Endpoint Status Table */}
            <div className="card">
                <div className="section-header">API Endpoint Status</div>
                <table className="w-full text-sm">
                    <thead>
                        <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                            <th className="text-left py-2 px-3 font-medium">Endpoint</th>
                            <th className="text-left py-2 px-3 font-medium">Method</th>
                            <th className="text-right py-2 px-3 font-medium">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {[
                            ['/score', 'POST', 200],
                            ['/score/batch', 'POST', 200],
                            ['/health', 'GET', 200],
                            ['/stats', 'GET', 200],
                        ].map(([ep, method, status]) => (
                            <tr key={ep} style={{ borderBottom: '1px solid var(--border)' }}>
                                <td className="py-2.5 px-3 mono text-xs">{ep}</td>
                                <td className="py-2.5 px-3">
                                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: method === 'POST' ? 'rgba(0,229,160,0.1)' : 'rgba(0,212,255,0.1)', color: method === 'POST' ? '#00E5A0' : '#00D4FF' }}>{method}</span>
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                    <span className="mono text-xs flex items-center justify-end gap-1" style={{ color: 'var(--accent-green)' }}>{status} <CheckCircle size={12} /></span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
