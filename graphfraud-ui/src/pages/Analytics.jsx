import { generateDailyAnalytics, generateHourlyData } from '../api/mockData'
import FraudTrendChart from '../components/charts/FraudTrendChart'
import FraudTypeChart from '../components/charts/FraudTypeChart'
import LatencyChart from '../components/charts/LatencyChart'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'

const dailyData = generateDailyAnalytics()
const hourlyData = generateHourlyData()

export default function Analytics() {
    return (
        <div className="space-y-6">
            {/* Summary Stats */}
            <div className="card">
                <div className="flex gap-8 justify-center flex-wrap">
                    {[
                        ['Avg PR-AUC', '0.9989', 'var(--accent-cyan)'],
                        ['Avg F1', '0.9852', 'var(--accent-cyan)'],
                        ['Fraud Caught', '99.1%', 'var(--accent-green)'],
                        ['False Alarm Rate', '0.015%', 'var(--accent-amber)'],
                    ].map(([label, value, color]) => (
                        <div key={label} className="text-center">
                            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</div>
                            <div className="mono text-xl font-bold" style={{ color }}>{value}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-2 gap-4">
                <div className="card">
                    <h3 className="font-semibold text-sm mb-4">Fraud Rate Trend — 30 Days</h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1E2D4A" />
                            <XAxis dataKey="date" tick={{ fill: '#6B7FA3', fontSize: 9 }} axisLine={{ stroke: '#1E2D4A' }} tickLine={false} interval={4} />
                            <YAxis tick={{ fill: '#6B7FA3', fontSize: 10 }} axisLine={false} tickLine={false} unit="%" />
                            <Tooltip contentStyle={{ background: '#0F1629', border: '1px solid #1E2D4A', borderRadius: 8, fontSize: 12 }} />
                            <Bar dataKey="fraud_rate" fill="#FF3B5C" radius={[2, 2, 0, 0]} barSize={12} name="Fraud Rate %" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="card">
                    <h3 className="font-semibold text-sm mb-4">Fraud Type Breakdown</h3>
                    <FraudTypeChart />
                </div>

                <div className="card">
                    <h3 className="font-semibold text-sm mb-4">Decision Distribution Over Time</h3>
                    <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={dailyData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#1E2D4A" />
                            <XAxis dataKey="date" tick={{ fill: '#6B7FA3', fontSize: 9 }} axisLine={{ stroke: '#1E2D4A' }} tickLine={false} interval={4} />
                            <YAxis tick={{ fill: '#6B7FA3', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ background: '#0F1629', border: '1px solid #1E2D4A', borderRadius: 8, fontSize: 12 }} />
                            <Legend wrapperStyle={{ fontSize: 11, color: '#6B7FA3' }} />
                            <Bar dataKey="blocked" stackId="a" fill="#FF3B5C" name="Blocked" />
                            <Bar dataKey="reviewed" stackId="a" fill="#FFB020" name="Reviewed" />
                            <Bar dataKey="allowed" stackId="a" fill="#00E5A0" radius={[2, 2, 0, 0]} name="Allowed" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                <div className="card">
                    <h3 className="font-semibold text-sm mb-4">API Latency — Last 24 Hours</h3>
                    <LatencyChart data={hourlyData} />
                </div>
            </div>
        </div>
    )
}
