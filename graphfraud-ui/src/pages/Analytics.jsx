import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getDashboardChartData, getDashboardStats } from '../api/fraudApi'
import { generateDailyAnalytics } from '../api/mockData'
import { STATS_REFRESH_MS } from '../config'
import FraudTrendChart from '../components/charts/FraudTrendChart'
import FraudTypeChart from '../components/charts/FraudTypeChart'
import LatencyChart from '../components/charts/LatencyChart'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

export default function Analytics() {
    // Live hourly trend from DB (same source as Dashboard)
    const { data: chartData } = useQuery({
        queryKey: ['analyticsChartData'],
        queryFn: () => getDashboardChartData(24),
        refetchInterval: STATS_REFRESH_MS,
    })

    // DB-backed stats for threat vector breakdown
    const { data: dashStats } = useQuery({
        queryKey: ['analyticsDashStats'],
        queryFn: () => getDashboardStats('ALL_TIME'),
        refetchInterval: STATS_REFRESH_MS,
    })

    // 30-day mock data — regenerated each time the component mounts
    const dailyData = useMemo(() => generateDailyAnalytics(), [])

    // Live hourly trend (falls back to generated data from dailyData shape)
    const hourlyTrend = chartData?.hourly_trend || []

    // Build threat vector data from stats or generate realistic defaults
    const threatVectors = useMemo(() => {
        const indicators = dashStats?.top_fraud_indicators
        if (indicators && Array.isArray(indicators) && indicators.length > 0) {
            const COLORS_MAP = {
                'name_mismatch_critical': 'Payee Name Mismatch',
                'name_mismatch_high': 'Name Similarity Low',
                'unverified_reports_few': 'Community Reports',
                'confirmed_fraud_single': 'Confirmed Fraud',
                'phishing_pattern': 'Phishing Pattern',
                'amount_anomaly': 'Amount Anomaly',
                'invalid_upi_handle': 'Invalid UPI Handle',
                'extreme_amount_ratio': 'Extreme Amount',
                'sender_is_known_controller': 'Ring Controller',
                'intra_ring_transfer': 'Intra-Ring Transfer',
            }
            return indicators.map(([key, count]) => ({
                type: COLORS_MAP[key] || key.replace(/_/g, ' '),
                count: count,
            }))
        }
        // Fallback: realistic mock
        const totalFraud = dashStats?.fraud_count || 650
        return [
            { type: 'Vishing', count: Math.floor(totalFraud * 0.32) },
            { type: 'Account Takeover', count: Math.floor(totalFraud * 0.22) },
            { type: 'Social Engineering', count: Math.floor(totalFraud * 0.18) },
            { type: 'QR Scam', count: Math.floor(totalFraud * 0.13) },
            { type: 'Fake App', count: Math.floor(totalFraud * 0.09) },
            { type: 'Money Mule', count: Math.floor(totalFraud * 0.06) },
        ]
    }, [dashStats])

    // Latency data — use hourly trend timestamps with simulated latency
    const latencyData = useMemo(() => {
        const source = hourlyTrend.length > 0 ? hourlyTrend : dailyData.slice(-24)
        return source.map((item, i) => ({
            hour: item.hour || item.date || `${i}h`,
            p50: 4 + Math.random() * 8,
            p95: 15 + Math.random() * 15,
            p99: 30 + Math.random() * 18,
        }))
    }, [hourlyTrend, dailyData])

    return (
        <div className="space-y-6">
            {/* Charts Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="card">
                    <h3 className="font-semibold text-sm mb-4">Classified Fraud Rate Trend — 30 Days</h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval={4} />
                            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                            <Bar dataKey="fraud_rate" fill="var(--accent-red)" radius={[2, 2, 0, 0]} barSize={12} name="Fraud Classification Rate" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="card">
                    <h3 className="font-semibold text-sm mb-4">Identified Threat Vectors</h3>
                    <FraudTypeChart data={threatVectors} />
                </div>

                <div className="card">
                    <h3 className="font-semibold text-sm mb-4">Binary Distribution Over Time</h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                            <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={{ stroke: 'var(--border)' }} tickLine={false} interval={4} />
                            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)' }} />
                            <Bar dataKey="fraud" stackId="a" fill="var(--accent-red)" name="FRAUD" />
                            <Bar dataKey="no_fraud" stackId="a" fill="var(--accent-green)" radius={[2, 2, 0, 0]} name="NO FRAUD" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="card">
                    <h3 className="font-semibold text-sm mb-4">API Response Latency</h3>
                    <LatencyChart data={latencyData} />
                </div>
            </div>
        </div>
    )
}
