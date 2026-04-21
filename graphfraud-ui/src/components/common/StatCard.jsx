import { useEffect, useState, useRef } from 'react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

export default function StatCard({ title, value, subtitle, color = 'var(--accent)', icon: Icon, sparklineData }) {
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
        <div
            className="panel"
            style={{
                position: 'relative',
                overflow: 'hidden',
                borderLeft: `2px solid ${color}`,
                padding: '14px 16px',
            }}
        >
            {/* Eyebrow label */}
            <div
                style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 8,
                    letterSpacing: '2.5px',
                    textTransform: 'uppercase',
                    color: 'var(--text3)',
                    marginBottom: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <span>{title}</span>
                {Icon && <Icon size={14} strokeWidth={1.5} style={{ color, opacity: 0.5 }} />}
            </div>

            {/* Value — Bebas Neue display font */}
            <div
                style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 38,
                    letterSpacing: '-0.5px',
                    color: 'var(--text)',
                    lineHeight: 1,
                    marginBottom: 4,
                }}
            >
                {isNumeric ? formatNum(displayVal) : value}
            </div>

            {/* Subtitle */}
            {subtitle && (
                <div
                    style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 9,
                        color: 'var(--text3)',
                        letterSpacing: '0.5px',
                    }}
                >
                    {subtitle}
                </div>
            )}

            {/* Sparkline */}
            {sparklineData && sparklineData.length > 0 && (
                <div style={{ position: 'absolute', bottom: 8, right: 8, width: 60, height: 28, opacity: 0.35 }}>
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
