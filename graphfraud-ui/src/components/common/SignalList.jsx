import { useState, useEffect } from 'react'
import { XCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react'

const LEVEL_CONFIG = {
    danger: {
        icon: XCircle,
        color: '#FF3B5C',
        bg: 'rgba(255,59,92,0.08)',
        border: 'rgba(255,59,92,0.25)',
    },
    warning: {
        icon: AlertTriangle,
        color: '#FFB020',
        bg: 'rgba(255,176,32,0.08)',
        border: 'rgba(255,176,32,0.25)',
    },
    safe: {
        icon: CheckCircle,
        color: '#00E5A0',
        bg: 'rgba(0,229,160,0.08)',
        border: 'rgba(0,229,160,0.25)',
    },
    info: {
        icon: Info,
        color: '#00D4FF',
        bg: 'rgba(0,212,255,0.08)',
        border: 'rgba(0,212,255,0.25)',
    },
}

/**
 * Reusable component to display a list of risk signals.
 * Each signal animates in with a staggered fade.
 */
export default function SignalList({ signals = [] }) {
    const [visibleCount, setVisibleCount] = useState(0)

    useEffect(() => {
        setVisibleCount(0)
        if (signals.length === 0) return
        let i = 0
        const interval = setInterval(() => {
            i++
            setVisibleCount(i)
            if (i >= signals.length) clearInterval(interval)
        }, 50)
        return () => clearInterval(interval)
    }, [signals])

    if (!signals.length) return null

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {signals.map((signal, idx) => {
                const config = LEVEL_CONFIG[signal.level] || LEVEL_CONFIG.info
                const Icon = config.icon
                const visible = idx < visibleCount

                return (
                    <div
                        key={idx}
                        style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 10,
                            padding: '10px 14px',
                            borderRadius: 12,
                            background: config.bg,
                            borderLeft: `3px solid ${config.border}`,
                            opacity: visible ? 1 : 0,
                            transform: visible ? 'translateY(0)' : 'translateY(8px)',
                            transition: 'opacity 0.3s ease, transform 0.3s ease',
                            fontSize: 14,
                            lineHeight: 1.5,
                        }}
                    >
                        <Icon
                            size={16}
                            style={{
                                color: config.color,
                                flexShrink: 0,
                                marginTop: 2,
                            }}
                        />
                        <span style={{ color: 'var(--text-primary)' }}>{signal.text}</span>
                    </div>
                )
            })}
        </div>
    )
}
