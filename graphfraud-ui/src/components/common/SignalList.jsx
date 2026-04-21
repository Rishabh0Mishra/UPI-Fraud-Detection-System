import { useState, useEffect } from 'react'
import { XCircle, AlertTriangle, CheckCircle, Info } from 'lucide-react'

// Updated to use new design system tokens
const LEVEL_CONFIG = {
    danger: {
        icon: XCircle,
        color: 'var(--danger)',
        bg: 'rgba(232,82,82,0.08)',
        border: 'rgba(232,82,82,0.25)',
    },
    warning: {
        icon: AlertTriangle,
        color: 'var(--warn)',
        bg: 'rgba(212,168,67,0.08)',
        border: 'rgba(212,168,67,0.25)',
    },
    safe: {
        icon: CheckCircle,
        color: 'var(--safe)',
        bg: 'rgba(92,186,138,0.08)',
        border: 'rgba(92,186,138,0.25)',
    },
    info: {
        icon: Info,
        color: 'var(--accent)',
        bg: 'rgba(232,184,109,0.08)',
        border: 'rgba(232,184,109,0.20)',
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                            padding: '9px 12px',
                            borderRadius: 6,
                            background: config.bg,
                            borderLeft: `2px solid ${config.border}`,
                            opacity: visible ? 1 : 0,
                            transform: visible ? 'translateY(0)' : 'translateY(8px)',
                            transition: 'opacity 0.3s ease, transform 0.3s ease',
                            lineHeight: 1.5,
                        }}
                    >
                        <Icon
                            size={14}
                            style={{
                                color: config.color,
                                flexShrink: 0,
                                marginTop: 2,
                            }}
                            strokeWidth={1.5}
                        />
                        <span
                            style={{
                                fontFamily: 'var(--font-body)',
                                fontSize: 12,
                                color: 'var(--text)',
                            }}
                        >
                            {signal.text}
                        </span>
                    </div>
                )
            })}
        </div>
    )
}
