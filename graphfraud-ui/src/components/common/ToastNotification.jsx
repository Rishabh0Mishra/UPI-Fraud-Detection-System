import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { Check, X, AlertTriangle } from 'lucide-react'

const ToastContext = createContext()
export const useToast = () => useContext(ToastContext)

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([])

    const showToast = useCallback((message, type = 'success', duration = 3000) => {
        const id = Date.now()
        setToasts((prev) => [...prev, { id, message, type }])
        setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration)
    }, [])

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2" style={{ maxWidth: 360 }}>
                {toasts.map((toast) => (
                    <ToastItem key={toast.id} {...toast} onDismiss={() => setToasts((prev) => prev.filter((t) => t.id !== toast.id))} />
                ))}
            </div>
        </ToastContext.Provider>
    )
}

function ToastItem({ message, type, onDismiss }) {
    const config = {
        success: { bg: 'rgba(0,229,160,0.15)', border: 'rgba(0,229,160,0.3)', color: '#00E5A0', Icon: Check },
        error: { bg: 'rgba(255,59,92,0.15)', border: 'rgba(255,59,92,0.3)', color: '#FF3B5C', Icon: X },
        warning: { bg: 'rgba(255,176,32,0.15)', border: 'rgba(255,176,32,0.3)', color: '#FFB020', Icon: AlertTriangle },
    }
    const c = config[type] || config.success
    const Icon = c.Icon

    return (
        <div
            className="slide-in-bottom flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer"
            style={{ background: c.bg, border: `1px solid ${c.border}` }}
            onClick={onDismiss}
        >
            <Icon size={16} style={{ color: c.color }} />
            <span className="text-sm" style={{ color: c.color }}>{message}</span>
        </div>
    )
}
