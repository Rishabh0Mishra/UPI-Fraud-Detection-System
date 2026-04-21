import { useQuery } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { getHealth } from '../../api/fraudApi'
import { HEALTH_REFRESH_MS } from '../../config'
import { useAdminAuth } from '../../contexts/AdminAuthContext'
import { Bell, LogOut } from 'lucide-react'

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
        return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
    }

    return (
        <header
            style={{
                height: 52,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0 24px',
                background: 'var(--bg2)',
                borderBottom: '1px solid var(--border)',
                flexShrink: 0,
                position: 'relative',
                zIndex: 100,
            }}
        >
            {/* Left — live status */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Live chip */}
                <div className="live-chip">
                    <div className="ldot" />
                    {isHealthy ? 'Live System' : 'Offline'}
                </div>

                {/* Uptime */}
                <span
                    style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: 'var(--text3)',
                        letterSpacing: '1px',
                    }}
                >
                    UP {formatUptime(uptime)}
                </span>
            </div>

            {/* Center — logo (absolutely centred) */}
            <div
                style={{
                    position: 'absolute',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontFamily: 'var(--font-brand)',
                    fontStyle: 'italic',
                    fontSize: 22,
                    fontWeight: 700,
                    color: 'var(--accent)',
                    cursor: 'default',
                    userSelect: 'none',
                    whiteSpace: 'nowrap',
                }}
            >
                GraphFraud
            </div>

            {/* Right — actions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* Admin logout */}
                {isOnAdmin && isLoggedIn && (
                    <button
                        id="admin-logout-btn"
                        onClick={logout}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '5px 12px',
                            background: 'var(--bg3)',
                            border: '1px solid rgba(232,82,82,0.25)',
                            borderRadius: 6,
                            color: 'var(--danger)',
                            fontFamily: 'var(--font-ui)',
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: '1.5px',
                            textTransform: 'uppercase',
                            cursor: 'pointer',
                            transition: 'all 0.12s',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg4)')}
                        onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--bg3)')}
                    >
                        <LogOut size={13} />
                        Logout
                    </button>
                )}

                {/* Bell icon */}
                <div className="icon-btn">
                    <Bell size={13} color="var(--text2)" strokeWidth={1.5} />
                </div>

                {/* Avatar */}
                <div className="avatar">G</div>
            </div>
        </header>
    )
}
