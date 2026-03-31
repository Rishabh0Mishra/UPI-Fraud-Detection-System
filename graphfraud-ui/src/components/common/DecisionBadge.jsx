export default function DecisionBadge({ decision, size = 'md' }) {
    // Map legacy decisions AND binary classifications
    const styles = {
        // Binary classification (primary)
        FRAUD: { bg: 'rgba(255,59,92,0.15)', color: '#FF3B5C', border: 'rgba(255,59,92,0.3)', label: '❌ FRAUD' },
        NO_FRAUD: { bg: 'rgba(0,229,160,0.15)', color: '#00E5A0', border: 'rgba(0,229,160,0.3)', label: '✅ NO FRAUD' },
        // Legacy decision support (maps to binary)
        BLOCK: { bg: 'rgba(255,59,92,0.15)', color: '#FF3B5C', border: 'rgba(255,59,92,0.3)', label: '❌ FRAUD' },
        REVIEW: { bg: 'rgba(255,176,32,0.15)', color: '#FFB020', border: 'rgba(255,176,32,0.3)', label: '⚠️ FRAUD' },
        ALLOW: { bg: 'rgba(0,229,160,0.15)', color: '#00E5A0', border: 'rgba(0,229,160,0.3)', label: '✅ NO FRAUD' },
    }
    const s = styles[decision] || styles.NO_FRAUD
    const sizes = { sm: { fontSize: 10, padding: '2px 8px' }, md: { fontSize: 11, padding: '4px 12px' }, lg: { fontSize: 14, padding: '6px 18px' } }

    return (
        <span
            className="mono font-bold rounded-full inline-block"
            style={{
                background: s.bg,
                color: s.color,
                border: `1px solid ${s.border}`,
                ...sizes[size],
                letterSpacing: '0.5px',
            }}
        >
            {s.label || decision}
        </span>
    )
}
