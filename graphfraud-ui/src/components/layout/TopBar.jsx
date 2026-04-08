import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { getHealth } from '../../api/fraudApi'
import { HEALTH_REFRESH_MS } from '../../config'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { Bell, Shield, LogOut } from 'lucide-react'

export default function TopBar() {
    const { data: health } = useQuery({ queryKey: ['health'], queryFn: getHealth, refetchInterval: HEALTH_REFRESH_MS })
    const isHealthy = health?.status === 'healthy' || health?.model_loaded
    const uptime = health?.uptime_seconds ? Math.floor(health.uptime_seconds) : 0
    const location = useLocation()
    const { isLoggedIn, logout } = useAdminAuth()

    const isOnAdmin = location.pathname === '/admin'

    const formatUptime = (s) => {
        const h = Math.floor(s / 3600)
        const m = Math.floor((s % 3600) / 60)
        const sec = s % 60
        return `${h}h ${m}m ${sec}s`
    }

    return (
        <header
            className="h-14 flex items-center justify-between px-6 shrink-0"
            style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border)' }}
        >
            <div className="flex items-center gap-3">
                <span className="text-lg font-bold">
                    UPI <span style={{ color: 'var(--accent-cyan)' }}>Fraud Detection</span> System
                </span>
            </div>

            <div className="flex items-center gap-2">
                <div className={isHealthy ? 'live-dot' : ''} style={!isHealthy ? { width: 8, height: 8, background: 'var(--accent-red)', borderRadius: '50%' } : {}} />
                <span className="text-xs font-medium" style={{ color: isHealthy ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                    {isHealthy ? 'LIVE' : 'OFFLINE'}
                </span>
            </div>

            <div className="flex items-center gap-4">
                <span className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                    Uptime: {formatUptime(uptime)}
                </span>

                {/* Logout button — only on admin page when logged in */}
                {isOnAdmin && isLoggedIn && (
                    <button
                        onClick={logout}
                        className="btn-secondary text-xs"
                        style={{
                            padding: '5px 12px', gap: 5,
                            color: 'var(--accent-red)',
                            borderColor: 'rgba(255,59,92,0.25)',
                        }}
                        id="admin-logout-btn"
                    >
                        <LogOut size={14} />
                        Logout
                    </button>
                )}

                <button className="relative p-2 rounded-lg" style={{ background: 'transparent', color: 'var(--text-secondary)' }}>
                    <Bell size={18} />
                </button>
            </div>
        </header>
    )
}
