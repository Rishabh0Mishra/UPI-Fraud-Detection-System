import { useEffect, useState, useRef } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function StatCard({ title, value, subtitle, color = 'var(--accent-cyan)', icon: Icon, sparklineData }) {
    const [displayVal, setDisplayVal] = useState(0)
    const isNumeric = typeof value === 'number' && !isNaN(value)
    const prevValue = useRef(0)

    useEffect(() => {
        if (!isNumeric) return
        const target = value
        const from = prevValue.current
        if (target === from) return
        const duration = 1200
        const start = performance.now()
        const tick = (now) => {
            const elapsed = now - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = 1 - Math.pow(1 - progress, 3)
            setDisplayVal(Math.floor(from + (target - from) * eased))
            if (progress < 1) requestAnimationFrame(tick)
            else {
                setDisplayVal(target)
                prevValue.current = target
            }
        }
        requestAnimationFrame(tick)
    }, [value, isNumeric])

    const formatNum = (n) => {
        if (typeof n === 'number') return n.toLocaleString('en-IN')
        return n
    }

    return (
        <div className="card relative overflow-hidden" style={{ borderLeft: `3px solid ${color}` }}>
            <div className="flex items-start justify-between">
                <div>
                    <div className="text-xs font-medium uppercase tracking-wide mb-1" style={{ color: 'var(--text-secondary)' }}>{title}</div>
                    <div className="mono text-2xl font-bold" style={{ color }}>{isNumeric ? formatNum(displayVal) : value}</div>
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
