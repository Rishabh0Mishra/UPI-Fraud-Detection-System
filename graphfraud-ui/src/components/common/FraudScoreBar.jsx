import { useEffect, useState } from 'react'

export default function FraudScoreBar({ score, width = '100%', showLabel = true, animated = true, height = 8, adminOnly = false }) {
    const [fill, setFill] = useState(animated ? 0 : score)

    useEffect(() => {
        if (animated) {
            const t = setTimeout(() => setFill(score), 50)
            return () => clearTimeout(t)
        }
    }, [score, animated])

    // If adminOnly is false (default) and this is a user-facing view, hide the bar
    // Set adminOnly=true explicitly in admin pages to show scores
    if (adminOnly === false) return null

    const displayFill = animated ? fill : score
    const normalizedScore = typeof score === 'number' && score <= 1 ? score : (score / 100)
    const normalizedFill = typeof displayFill === 'number' && displayFill <= 1 ? displayFill : (displayFill / 100)

    const getColor = (s) => {
        const norm = s <= 1 ? s : s / 100
        if (norm >= 0.8) return 'var(--accent-red)'
        if (norm >= 0.45) return 'var(--accent-amber)'
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
                        width: `${normalizedFill * 100}%`,
                        height: '100%',
                        background: getColor(score),
                        transition: animated ? 'width 0.8s ease-out' : 'none',
                        boxShadow: normalizedScore >= 0.8 ? `0 0 8px ${getColor(score)}40` : 'none',
                    }}
                />
            </div>
            {showLabel && (
                <span className="mono text-xs font-medium shrink-0" style={{ color: getColor(score), width: 45, textAlign: 'right' }}>
                    {normalizedScore <= 1 ? normalizedScore.toFixed(4) : score.toFixed(2)}
                </span>
            )}
        </div>
    )
}
