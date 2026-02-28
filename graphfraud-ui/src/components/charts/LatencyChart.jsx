import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'

export default function LatencyChart({ data }) {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <LineChart data={data} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2D4A" />
                <XAxis dataKey="hour" tick={{ fill: '#6B7FA3', fontSize: 10 }} axisLine={{ stroke: '#1E2D4A' }} tickLine={false} />
                <YAxis tick={{ fill: '#6B7FA3', fontSize: 10 }} axisLine={false} tickLine={false} unit="ms" />
                <Tooltip
                    contentStyle={{ background: '#0F1629', border: '1px solid #1E2D4A', borderRadius: 8, fontSize: 12 }}
                    formatter={(val) => `${val.toFixed(1)}ms`}
                />
                <ReferenceLine y={50} stroke="#FF3B5C" strokeDasharray="5 5" label={{ value: 'SLA 50ms', fill: '#FF3B5C', fontSize: 10, position: 'right' }} />
                <Line type="monotone" dataKey="p50" stroke="#00D4FF" strokeWidth={2} dot={false} name="p50" />
                <Line type="monotone" dataKey="p95" stroke="#FFB020" strokeWidth={1.5} dot={false} name="p95" />
                <Line type="monotone" dataKey="p99" stroke="#FF3B5C" strokeWidth={1} dot={false} name="p99" />
            </LineChart>
        </ResponsiveContainer>
    )
}
