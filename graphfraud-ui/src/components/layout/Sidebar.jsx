import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { LayoutDashboard, Activity, Zap, Share2, BarChart2, Server, Settings, User, Lock } from 'lucide-react'

const navGroups = [
    {
        label: 'Monitoring',
        items: [
            { path: '/',     icon: LayoutDashboard, label: 'Dashboard' },
            { path: '/live', icon: Activity,         label: 'Live Feed' },
        ],
    },
    {
        label: 'Analysis',
        items: [
            { path: '/score',     icon: Zap,      label: 'Score Transaction', primary: true },
            { path: '/rings',     icon: Share2,    label: 'Ring Explorer' },
            { path: '/analytics', icon: BarChart2, label: 'Analytics' },
        ],
    },
    {
        label: 'System',
        items: [
            { path: '/health', icon: Server,   label: 'System Health' },
            { path: '/admin',  icon: Settings, label: 'Admin Panel', locked: true },
        ],
    },
]

const userNav = { path: '/user', icon: User, label: 'User Portal' }

export default function Sidebar() {
    const location = useLocation()

    return (
        <aside
            style={{
                width: 230,
                minWidth: 230,
                height: '100vh',
                background: 'var(--bg2)',
                borderRight: '1px solid var(--border)',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                flexShrink: 0,
            }}
        >
            {/* Brand block */}
            <div
                style={{
                    padding: '18px 20px 14px',
                    borderBottom: '1px solid var(--border)',
                    flexShrink: 0,
                }}
            >
                <div
                    style={{
                        fontFamily: 'var(--font-brand)',
                        fontStyle: 'italic',
                        fontSize: 20,
                        fontWeight: 700,
                        color: 'var(--accent)',
                        letterSpacing: 0,
                        lineHeight: 1,
                        marginBottom: 4,
                    }}
                >
                    GraphFraud
                </div>
                <div
                    style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: 8,
                        letterSpacing: '2px',
                        textTransform: 'uppercase',
                        color: 'var(--text3)',
                    }}
                >
                    Fraud Detection System
                </div>
            </div>

            {/* Nav items */}
            <nav
                style={{
                    flex: 1,
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    overflowY: 'auto',
                    overflowX: 'hidden',
                }}
            >
                {navGroups.map((group) => (
                    <div key={group.label} style={{ marginBottom: 8 }}>
                        {/* Group label */}
                        <div
                            style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: 8,
                                letterSpacing: '2px',
                                textTransform: 'uppercase',
                                color: 'var(--text3)',
                                padding: '6px 10px 4px',
                            }}
                        >
                            {group.label}
                        </div>

                        {group.items.map((item) => {
                            const Icon = item.icon
                            const active = location.pathname === item.path
                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 12,
                                        padding: '10px 10px',
                                        borderRadius: 6,
                                        cursor: 'pointer',
                                        textDecoration: 'none',
                                        transition: 'background 0.12s, color 0.12s',
                                        color: active ? 'var(--accent)' : 'var(--text3)',
                                        background: active ? 'var(--bg4)' : 'transparent',
                                        fontFamily: 'var(--font-ui)',
                                        fontSize: 12,
                                        fontWeight: 600,
                                        letterSpacing: '2px',
                                        textTransform: 'uppercase',
                                        borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                                        position: 'relative',
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!active) {
                                            e.currentTarget.style.background = 'var(--bg3)'
                                            e.currentTarget.style.color = 'var(--text2)'
                                        }
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!active) {
                                            e.currentTarget.style.background = 'transparent'
                                            e.currentTarget.style.color = 'var(--text3)'
                                        }
                                    }}
                                >
                                    <div style={{ position: 'relative', flexShrink: 0 }}>
                                        <Icon
                                            size={15}
                                            strokeWidth={1.5}
                                            style={{ opacity: active ? 1 : 0.5 }}
                                        />
                                        {item.locked && (
                                            <Lock
                                                size={9}
                                                style={{
                                                    position: 'absolute',
                                                    top: -3,
                                                    right: -4,
                                                    color: 'var(--warn)',
                                                }}
                                            />
                                        )}
                                    </div>
                                    <span style={{ whiteSpace: 'nowrap' }}>{item.label}</span>
                                </NavLink>
                            )
                        })}
                    </div>
                ))}

                {/* Divider */}
                <div style={{ borderTop: '1px solid var(--border)', margin: '4px 0 8px' }} />

                {/* User Portal */}
                {(() => {
                    const active = location.pathname === userNav.path
                    const Icon = userNav.icon
                    return (
                        <NavLink
                            to={userNav.path}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 12,
                                padding: '10px 10px',
                                borderRadius: 6,
                                cursor: 'pointer',
                                textDecoration: 'none',
                                transition: 'background 0.12s, color 0.12s',
                                color: active ? 'var(--accent)' : 'var(--text3)',
                                background: active ? 'var(--bg4)' : 'transparent',
                                fontFamily: 'var(--font-ui)',
                                fontSize: 12,
                                fontWeight: 600,
                                letterSpacing: '2px',
                                textTransform: 'uppercase',
                                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
                            }}
                            onMouseEnter={(e) => {
                                if (!active) {
                                    e.currentTarget.style.background = 'var(--bg3)'
                                    e.currentTarget.style.color = 'var(--text2)'
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!active) {
                                    e.currentTarget.style.background = 'transparent'
                                    e.currentTarget.style.color = 'var(--text3)'
                                }
                            }}
                        >
                            <Icon size={15} strokeWidth={1.5} style={{ opacity: active ? 1 : 0.5, flexShrink: 0 }} />
                            <span style={{ whiteSpace: 'nowrap' }}>User Portal</span>
                        </NavLink>
                    )
                })()}
            </nav>

            {/* Bottom CTA */}
            <div
                style={{
                    padding: '16px 14px',
                    borderTop: '1px solid var(--border)',
                    flexShrink: 0,
                }}
            >
                <button
                    style={{
                        width: '100%',
                        padding: '11px 14px',
                        borderRadius: 8,
                        background: 'var(--accent)',
                        color: 'var(--bg)',
                        border: 'none',
                        fontFamily: 'var(--font-ui)',
                        fontSize: 13,
                        fontWeight: 700,
                        letterSpacing: '2px',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--accent2)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--accent)')}
                >
                    + New Investigation
                </button>
            </div>
        </aside>
    )
}
