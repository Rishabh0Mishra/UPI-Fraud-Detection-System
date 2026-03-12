import { useEffect, useState } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function StatCard({ title, value, subtitle, color = 'var(--accent-cyan)', icon: Icon, sparklineData }) {
    const [displayVal, setDisplayVal] = useState(0)

    useEffect(() => {
        const target = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.]/g, '')) || 0
        if (target === 0) return
        const duration = 1500
        const start = performance.now()
        const tick = (now) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setDisplayVal(Math.floor(target * eased))
            if (progress < 1) requestAnimationFrame(tick)
            else setDisplayVal(target)
        }
        requestAnimationFrame(tick)
    }, [value])

    const formatNum = (n) => {
        if (typeof n === 'number') return n.toLocaleString('en-IN')
        return n
    }

    return (
        <div className="card relative overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>{title}</div>
                    <div className="mono text-2xl font-bold" style={{ color }}>{formatNum(displayVal)}</div>
                    {subtitle && <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>}
                </div>
                {Icon && <Icon size={20} style={{ color, opacity: 0.5 }} />}
            </div>
            {sparklineData && sparklineData.length > 0 && (
                <div className="absolute bottom-2 right-2" style={{ width: 60, height: 28, opacity: 0.4 }}>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={sparklineData}>
                            <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}
