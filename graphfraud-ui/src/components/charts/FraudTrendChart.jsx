import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

export default function FraudTrendChart({ data }) {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <defs>
                    <linearGradient id="redGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#FF3B5C" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#FF3B5C" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="greenGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00E5A0" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#00E5A0" stopOpacity={0} />
                    </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2D4A" />
                <XAxis dataKey="hour" tick={{ fill: '#6B7FA3', fontSize: 10 }} axisLine={{ stroke: '#1E2D4A' }} tickLine={false} />
                <YAxis tick={{ fill: '#6B7FA3', fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip
                    contentStyle={{ background: '#0F1629', border: '1px solid #1E2D4A', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#E8F0FE' }}
                />
                <Area type="monotone" dataKey="fraud" name="Fraud" stroke="#FF3B5C" fill="url(#redGrad)" strokeWidth={2} />
                <Area type="monotone" dataKey="no_fraud" name="No Fraud" stroke="#00E5A0" fill="url(#greenGrad)" strokeWidth={1} />
            </AreaChart>
        </ResponsiveContainer>
    )
}
