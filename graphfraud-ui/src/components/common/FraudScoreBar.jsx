import { useEffect, useState } from 'react'

export default function FraudScoreBar({ score, width = '100%', showLabel = true, animated = true, height = 8 }) {
    const [fill, setFill] = useState(0)

    useEffect(() => {
        if (animated) {
            const t = setTimeout(() => setFill(score), 50)
            return () => clearTimeout(t)
        } else {
            setFill(score)
        }
    }, [score, animated])

    const getColor = (s) => {
        if (s >= 0.8) return 'var(--accent-red)'
        if (s >= 0.45) return 'var(--accent-amber)'
        return 'var(--accent-green)'
    }

    return (
        <div className="flex items-center gap-2" style={{ width }}>
            <div
                className="flex-1 rounded-full overflow-hidden"
                style={{ height, background: 'rgba(255,255,255,0.06)' }}
            >
                <div
                    className="rounded-full"
                    style={{
                        width: `${fill * 100}%`,
                        height: '100%',
                        background: getColor(score),
                        transition: animated ? 'width 0.8s ease-out' : 'none',
                        boxShadow: score >= 0.8 ? `0 0 8px ${getColor(score)}40` : 'none',
                    }}
                />
            </div>
            {showLabel && (
                <span className="mono text-xs font-medium shrink-0" style={{ color: getColor(score), width: 45, textAlign: 'right' }}>
                    {score.toFixed(4)}
                </span>
            )}
        </div>
    )
}
