import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function ErrorBanner({ message, onRetry }) {
    return (
        <div
            className="panel"
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                borderColor: 'rgba(232,82,82,0.3)',
                background: 'rgba(232,82,82,0.06)',
            }}
        >
            <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0 }} />
            <span
                style={{
                    flex: 1,
                    fontFamily: 'var(--font-mono)',
                    fontSize: 11,
                    color: 'var(--danger)',
                    letterSpacing: '0.5px',
                }}
            >
                {message}
            </span>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="btn-secondary"
                    style={{
                        color: 'var(--danger)',
                        borderColor: 'rgba(232,82,82,0.25)',
                        fontSize: 10,
                    }}
                >
                    <RefreshCw size={12} /> Retry
                </button>
            )}
        </div>
    )
}
