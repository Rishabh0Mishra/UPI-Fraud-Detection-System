import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ text = 'Loading...' }) {
    return (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 size={32} className="animate-spin" style={{ color: 'var(--accent-cyan)' }} />
            <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{text}</span>
        </div>
    )
}
