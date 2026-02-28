import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Activity, Zap, Share2, BarChart2, Server, Settings, User, ChevronLeft, ChevronRight, Lock, Shield } from 'lucide-react'

const navGroups = [
    {
        label: 'Monitoring',
        items: [
            { path: '/', icon: LayoutDashboard, label: 'Dashboard' },
            { path: '/live', icon: Activity, label: 'Live Feed' },
        ],
    },
    {
        label: 'Analysis',
        items: [
            { path: '/score', icon: Zap, label: 'Score Transaction', primary: true },
            { path: '/rings', icon: Share2, label: 'Ring Explorer' },
            { path: '/analytics', icon: BarChart2, label: 'Analytics' },
        ],
    },
    {
        label: 'System',
        items: [
            { path: '/health', icon: Server, label: 'System Health' },
            { path: '/admin', icon: Settings, label: 'Admin Panel', locked: true },
        ],
    },
]

const userNav = { path: '/user', icon: User, label: 'User Portal' }

export default function Sidebar() {
    const [expanded, setExpanded] = useState(true)
    const location = useLocation()
    const w = expanded ? 220 : 64

    return (
        <aside
            style={{ width: w, minWidth: w }}
            className="h-screen flex flex-col border-r transition-all duration-300 overflow-hidden"
            style={{ width: w, minWidth: w, background: 'var(--bg-surface)', borderColor: 'var(--border)' }}
        >
            {/* Logo */}
            <div className="flex items-center gap-2 px-4 h-16 shrink-0" style={{ borderBottom: '1px solid var(--border)' }}>
                <Shield size={24} style={{ color: 'var(--accent-cyan)' }} />
                {expanded && (
                    <span className="font-bold text-base whitespace-nowrap">
                        Graph<span style={{ color: 'var(--accent-cyan)' }}>Fraud</span>
                    </span>
                )}
            </div>

            {/* Nav groups */}
            <nav className="flex-1 overflow-y-auto py-4">
                {navGroups.map((group) => (
                    <div key={group.label} className="mb-4">
                        {expanded && (
                            <div className="px-4 mb-2 text-xs font-semibold tracking-wider uppercase" style={{ color: 'var(--text-muted)' }}>
                                {group.label}
                            </div>
                        )}
                        {group.items.map((item) => {
                            const Icon = item.icon
                            const active = location.pathname === item.path
                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className="flex items-center gap-3 mx-2 mb-1 rounded-lg px-3 py-2.5 transition-all duration-200 relative group"
                                    style={{
                                        background: active ? 'rgba(0,212,255,0.08)' : 'transparent',
                                        color: active ? 'var(--accent-cyan)' : item.primary ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                                        borderLeft: active ? '3px solid var(--accent-cyan)' : '3px solid transparent',
                                        fontSize: item.primary ? '14px' : '13px',
                                        fontWeight: item.primary || active ? 600 : 400,
                                    }}
                                >
                                    <div className="relative">
                                        <Icon size={item.primary ? 20 : 18} />
                                        {item.locked && <Lock size={10} className="absolute -top-1 -right-1" style={{ color: 'var(--accent-amber)' }} />}
                                    </div>
                                    {expanded && <span className="whitespace-nowrap">{item.label}</span>}
                                </NavLink>
                            )
                        })}
                    </div>
                ))}

                {/* Separator */}
                <div className="mx-4 my-3" style={{ borderTop: '1px solid var(--border)' }} />

                {/* User Portal */}
                <NavLink
                    to={userNav.path}
                    className="flex items-center gap-3 mx-2 rounded-lg px-3 py-2.5 transition-all duration-200"
                    style={{
                        color: location.pathname === userNav.path ? 'var(--text-primary)' : 'var(--text-muted)',
                        background: location.pathname === userNav.path ? 'rgba(0,212,255,0.05)' : 'transparent',
                        borderLeft: location.pathname === userNav.path ? '3px solid var(--accent-cyan)' : '3px solid transparent',
                    }}
                >
                    <User size={18} />
                    {expanded && (
                        <div>
                            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>End User View</div>
                            <div className="text-sm">User Portal</div>
                        </div>
                    )}
                </NavLink>
            </nav>

            {/* Toggle */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center justify-center h-12 shrink-0 transition-colors"
                style={{ borderTop: '1px solid var(--border)', color: 'var(--text-secondary)', background: 'transparent' }}
            >
                {expanded ? <ChevronLeft size={18} /> : <ChevronRight size={18} />}
            </button>
        </aside>
    )
}
