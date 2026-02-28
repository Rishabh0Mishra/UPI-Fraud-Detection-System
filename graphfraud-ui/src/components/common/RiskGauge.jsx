import { useState, useEffect } from 'react'

/**
 * Animated SVG arc gauge for risk scores (0–100).
 * Arc spans from 7 o'clock to 5 o'clock (220° sweep around bottom).
 */
export default function RiskGauge({ score = 0, size = 120 }) {
    const [animatedScore, setAnimatedScore] = useState(0)

    useEffect(() => {
        let frame
        const start = performance.now()
        const duration = 1000
        const animate = (now) => {
            const progress = Math.min((now - start) / duration, 1)
            // Ease out cubic
            const eased = 1 - Math.pow(1 - progress, 3)
            setAnimatedScore(Math.round(eased * score))
            if (progress < 1) frame = requestAnimationFrame(animate)
        }
        frame = requestAnimationFrame(animate)
        return () => cancelAnimationFrame(frame)
    }, [score])

    const cx = size / 2
    const cy = size / 2
    const r = (size / 2) - 12
    const startAngle = -130
    const endAngle = 130
    const totalSweep = endAngle - startAngle // 260°
    const filledAngle = startAngle + (animatedScore / 100) * totalSweep

    const polarToCartesian = (angle) => {
        const rad = (angle - 90) * Math.PI / 180
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) }
    }

    const describeArc = (sAngle, eAngle) => {
        const s = polarToCartesian(sAngle)
        const e = polarToCartesian(eAngle)
        const lg = (eAngle - sAngle) > 180 ? 1 : 0
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${lg} 1 ${e.x} ${e.y}`
    }

    // Colour interpolation: green (0-30), amber (30-60), red (60-100)
    const getColor = (s) => {
        if (s < 30) return '#00E5A0'
        if (s < 60) return '#FFB020'
        return '#FF3B5C'
    }

    const getLabel = (s) => {
        if (s < 20) return 'SAFE'
        if (s < 40) return 'LOW'
        if (s < 60) return 'CAUTION'
        if (s < 80) return 'HIGH'
        return 'CRITICAL'
    }

    const color = getColor(animatedScore)
    const label = getLabel(animatedScore)

    return (
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
                {/* Background arc */}
                <path
                    d={describeArc(startAngle, endAngle)}
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth={10}
                    strokeLinecap="round"
                />
                {/* Filled arc */}
                {animatedScore > 0 && (
                    <path
                        d={describeArc(startAngle, filledAngle)}
                        fill="none"
                        stroke={color}
                        strokeWidth={10}
                        strokeLinecap="round"
                        style={{
                            filter: `drop-shadow(0 0 6px ${color}40)`,
                            transition: 'stroke 0.3s',
                        }}
                    />
                )}
                {/* Score number */}
                <text
                    x={cx}
                    y={cy - 4}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                        fontFamily: "'JetBrains Mono', monospace",
                        fontSize: size * 0.28,
                        fontWeight: 700,
                        fill: color,
                    }}
                >
                    {animatedScore}
                </text>
                {/* Label */}
                <text
                    x={cx}
                    y={cy + size * 0.17}
                    textAnchor="middle"
                    dominantBaseline="central"
                    style={{
                        fontFamily: "'Inter', sans-serif",
                        fontSize: size * 0.1,
                        fontWeight: 600,
                        fill: 'rgba(255,255,255,0.5)',
                        letterSpacing: '1.5px',
                    }}
                >
                    {label}
                </text>
            </svg>
        </div>
    )
}
