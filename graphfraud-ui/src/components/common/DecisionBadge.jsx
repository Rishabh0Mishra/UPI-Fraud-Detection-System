export default function DecisionBadge({ decision, size = 'md' }) {
    // Visual map — using new design system tokens
    const styles = {
        // Binary classification (primary)
        FRAUD: {
            bg: 'rgba(232,82,82,0.13)',
            color: 'var(--danger)',
            border: 'rgba(232,82,82,0.25)',
            label: 'FRAUD',
        },
        NO_FRAUD: {
            bg: 'rgba(92,186,138,0.13)',
            color: 'var(--safe)',
            border: 'rgba(92,186,138,0.25)',
            label: 'NO FRAUD',
        },
        // Legacy decision support
        BLOCK: {
            bg: 'rgba(232,82,82,0.13)',
            color: 'var(--danger)',
            border: 'rgba(232,82,82,0.25)',
            label: 'BLOCK',
        },
        REVIEW: {
            bg: 'rgba(212,168,67,0.10)',
            color: 'var(--warn)',
            border: 'rgba(212,168,67,0.22)',
            label: 'REVIEW',
        },
        ALLOW: {
            bg: 'rgba(92,186,138,0.13)',
            color: 'var(--safe)',
            border: 'rgba(92,186,138,0.25)',
            label: 'ALLOW',
        },
    }

    const s = styles[decision] || styles.NO_FRAUD

    const sizes = {
        sm: { fontSize: 9,  padding: '2px 7px',   letterSpacing: '1.2px' },
        md: { fontSize: 10, padding: '3px 9px',   letterSpacing: '1.5px' },
        lg: { fontSize: 12, padding: '5px 14px',  letterSpacing: '1.8px' },
    }

    const sz = sizes[size] || sizes.md

    return (
        <span
            style={{
                fontFamily: 'var(--font-ui)',
                fontWeight: 700,
                textTransform: 'uppercase',
                borderRadius: 4,
                display: 'inline-block',
                background: s.bg,
                color: s.color,
                border: `1px solid ${s.border}`,
                whiteSpace: 'nowrap',
                ...sz,
            }}
        >
            {s.label || decision}
        </span>
    )
}
