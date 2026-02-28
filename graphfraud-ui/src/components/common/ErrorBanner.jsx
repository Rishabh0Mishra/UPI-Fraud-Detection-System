import { AlertTriangle, RefreshCw } from 'lucide-react'

export default function ErrorBanner({ message, onRetry }) {
    return (
        <div className="card flex items-center gap-3" style={{ borderColor: 'var(--accent-red)', background: 'rgba(255,59,92,0.05)' }}>
            <AlertTriangle size={20} style={{ color: 'var(--accent-red)' }} />
            <span className="flex-1 text-sm" style={{ color: 'var(--accent-red)' }}>{message}</span>
            {onRetry && (
                <button onClick={onRetry} className="btn-secondary text-xs" style={{ color: 'var(--accent-red)' }}>
                    <RefreshCw size={14} /> Retry
                </button>
            )}
        </div>
    )
}
