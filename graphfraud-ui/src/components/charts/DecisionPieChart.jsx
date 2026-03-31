import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

export default function DecisionPieChart({ blocked = 0, reviewed = 0, allowed = 0, fraud = 0, noFraud = 0 }) {
    // Use binary classification if provided, otherwise fallback to legacy
    const useBinary = fraud > 0 || noFraud > 0
    const data = useBinary
        ? [
            { name: 'FRAUD', value: fraud, color: '#FF3B5C' },
            { name: 'NO FRAUD', value: noFraud, color: '#00E5A0' },
        ]
        : [
            { name: 'FRAUD', value: blocked + reviewed, color: '#FF3B5C' },
            { name: 'NO FRAUD', value: allowed, color: '#00E5A0' },
        ]

    const total = data.reduce((sum, d) => sum + d.value, 0) || 1

    return (
        <div className="flex flex-col items-center">
            <div style={{ width: 200, height: 200, position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                        <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" strokeWidth={0}>
                            {data.map((entry, i) => (
                                <Cell key={i} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{ background: '#0F1629', border: '1px solid #1E2D4A', borderRadius: 8, fontSize: 12 }}
                        />
                    </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <div className="mono text-xl font-bold">{total.toLocaleString('en-IN')}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total</div>
                </div>
            </div>
            <div className="flex gap-6 mt-3">
                {data.map((d) => (
                    <div key={d.name} className="text-center">
                        <div className="flex items-center gap-1.5">
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: d.color }} />
                            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
                        </div>
                        <div className="mono text-sm font-medium">{d.value.toLocaleString('en-IN')}</div>
                        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{((d.value / total) * 100).toFixed(1)}%</div>
                    </div>
                ))}
            </div>
        </div>
    )
}
