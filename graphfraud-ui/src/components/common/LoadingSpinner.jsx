import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ text = 'Loading...' }) {
    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '48px 0',
                gap: 12,
            }}
        >
            <Loader2
                size={28}
                style={{
                    color: 'var(--accent)',
                    animation: 'spin 1s linear infinite',
                }}
            />
            <span
                style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    letterSpacing: '2px',
                    textTransform: 'uppercase',
                    color: 'var(--text3)',
                }}
            >
                {text}
            </span>
            <style>{`@keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }`}</style>
        </div>
    )
}
