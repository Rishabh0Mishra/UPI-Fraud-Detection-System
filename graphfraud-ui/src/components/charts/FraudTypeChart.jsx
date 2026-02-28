import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell } from 'recharts'

const COLORS = ['#FF3B5C', '#FFB020', '#00D4FF', '#00E5A0', '#A78BFA', '#F472B6']

const defaultData = [
    { type: 'Vishing', count: 34, pct: 37.4 },
    { type: 'Account Takeover', count: 22, pct: 24.2 },
    { type: 'Social Engineering', count: 15, pct: 16.5 },
    { type: 'QR Scam', count: 10, pct: 11.0 },
    { type: 'Fake App', count: 6, pct: 6.6 },
    { type: 'Money Mule', count: 4, pct: 4.4 },
]

export default function FraudTypeChart({ data = defaultData }) {
    return (
        <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} layout="vertical" margin={{ top: 5, right: 40, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1E2D4A" horizontal={false} />
                <XAxis type="number" tick={{ fill: '#6B7FA3', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis dataKey="type" type="category" tick={{ fill: '#E8F0FE', fontSize: 11 }} axisLine={false} tickLine={false} width={130} />
                <Tooltip contentStyle={{ background: '#0F1629', border: '1px solid #1E2D4A', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]} barSize={20}>
                    {data.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                </Bar>
            </BarChart>
        </ResponsiveContainer>
    )
}
