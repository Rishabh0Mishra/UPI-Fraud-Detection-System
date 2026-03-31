import { useState, useEffect } from 'react'

/**
 * Binary classification shield — FRAUD or NOT FRAUD.
 * Replaces the old numeric arc gauge.
 * Threshold: score >= 50 → FRAUD, score < 50 → NOT FRAUD.
 */
const THRESHOLD = 50

export default function RiskGauge({ score = 0, size = 120 }) {
    const [visible, setVisible] = useState(false)
    useEffect(() => { const t = setTimeout(() => setVisible(true), 100); return () => clearTimeout(t) }, [])

    const isFraud = score >= THRESHOLD
    const color = isFraud ? '#FF3B5C' : '#00E5A0'
    const label = isFraud ? 'FRAUD' : 'NOT FRAUD'
    const iconPath = isFraud
        ? 'M18 6L6 18M6 6l12 12' // X mark
        : 'M5 13l4 4L19 7'       // Checkmark

    const cx = size / 2
    const cy = size / 2
    const shieldR = size * 0.38

    return (
        <div style={{
            display: 'inline-flex', flexDirection: 'column', alignItems: 'center',
            opacity: visible ? 1 : 0, transform: visible ? 'scale(1)' : 'scale(0.7)',
            transition: 'all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
        }}>
            <svg width={size} height={size} viewBox="0 0 120 120">
                {/* Glow */}
                <defs>
                    <filter id="shieldGlow">
                        <feGaussianBlur stdDeviation="4" result="blur" />
                        <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                    </filter>
                </defs>

                {/* Shield shape */}
                <path
                    d="M60 15 L95 35 L95 65 Q95 95 60 108 Q25 95 25 65 L25 35 Z"
                    fill={`${color}15`}
                    stroke={color}
                    strokeWidth="2.5"
                    filter="url(#shieldGlow)"
                    style={{ transition: 'all 0.5s' }}
                />

                {/* Icon (check or X) */}
                <g transform="translate(36, 38) scale(2)">
                    <path
                        d={iconPath}
                        fill="none"
                        stroke={color}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{
                            strokeDasharray: 50,
                            strokeDashoffset: visible ? 0 : 50,
                            transition: 'stroke-dashoffset 0.8s ease 0.3s',
                        }}
                    />
                </g>

                {/* Label */}
                <text
                    x="60"
                    y="100"
                    textAnchor="middle"
                    style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: isFraud ? 12 : 10,
                        fontWeight: 700,
                        fill: color,
                        letterSpacing: '1.5px',
                    }}
                >
                    {label}
                </text>
            </svg>
        </div>
    )
}
