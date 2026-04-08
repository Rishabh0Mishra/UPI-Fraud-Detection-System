import { useState, useEffect, useRef } from 'react'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import { Lock, LogIn, AlertTriangle, Shield, Eye, EyeOff } from 'lucide-react'

const MAX_ATTEMPTS = 3
const LOCKOUT_SECONDS = 60

export default function AdminLogin() {
    const { login } = useAdminAuth()
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const [failedAttempts, setFailedAttempts] = useState(0)
    const [lockoutTimer, setLockoutTimer] = useState(0)
    const usernameRef = useRef(null)

    // Auto-focus username on mount
    useEffect(() => {
        usernameRef.current?.focus()
    }, [])

    // Lockout countdown
    useEffect(() => {
        if (lockoutTimer <= 0) return
        const interval = setInterval(() => {
            setLockoutTimer((t) => {
                if (t <= 1) {
                    setFailedAttempts(0)
                    setError('')
                    return 0
                }
                return t - 1
            })
        }, 1000)
        return () => clearInterval(interval)
    }, [lockoutTimer])

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (lockoutTimer > 0) return
        if (!username.trim() || !password.trim()) {
            setError('Please enter both username and password')
            return
        }

        setLoading(true)
        setError('')
        try {
            const res = await login(username, password)
            if (!res.success) {
                throw new Error('Invalid credentials')
            }
        } catch (err) {
            const next = failedAttempts + 1
            setFailedAttempts(next)
            if (next >= MAX_ATTEMPTS) {
                setLockoutTimer(LOCKOUT_SECONDS)
                setError(`Too many failed attempts. Locked for ${LOCKOUT_SECONDS} seconds.`)
            } else {
                setError(`Invalid credentials. ${MAX_ATTEMPTS - next} attempt${MAX_ATTEMPTS - next > 1 ? 's' : ''} remaining.`)
            }
        } finally {
            setLoading(false)
        }
    }

    const isLocked = lockoutTimer > 0

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'var(--bg-base)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            {/* Subtle grid background */}
            <div style={{
                position: 'absolute', inset: 0, opacity: 0.03,
                backgroundImage: 'linear-gradient(rgba(0,212,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,255,0.3) 1px, transparent 1px)',
                backgroundSize: '40px 40px',
            }} />

            <div className="fade-in" style={{
                width: '100%', maxWidth: 420, padding: '0 20px',
                position: 'relative', zIndex: 1,
            }}>
                <div className="card" style={{
                    padding: '40px 36px',
                    borderColor: 'rgba(0,212,255,0.15)',
                    boxShadow: '0 0 60px rgba(0,212,255,0.05), 0 20px 60px rgba(0,0,0,0.5)',
                }}>
                    {/* Header */}
                    <div style={{ textAlign: 'center', marginBottom: 32 }}>
                        <div style={{
                            width: 56, height: 56, borderRadius: 16,
                            background: 'rgba(0,212,255,0.08)',
                            border: '1px solid rgba(0,212,255,0.2)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            margin: '0 auto 16px',
                        }}>
                            <Shield size={28} style={{ color: 'var(--accent-cyan)' }} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 4 }}>
                            <Lock size={16} style={{ color: 'var(--accent-amber)' }} />
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent-amber)', letterSpacing: '1px', textTransform: 'uppercase' }}>
                                Admin Access Only
                            </span>
                        </div>
                        <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                            UPI <span style={{ color: 'var(--accent-cyan)' }}>Fraud Detection</span> System
                        </h1>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: 16 }}>
                            <label style={{
                                display: 'block', fontSize: 11, fontWeight: 600,
                                color: 'var(--text-secondary)', marginBottom: 6,
                                letterSpacing: '0.5px', textTransform: 'uppercase',
                            }}>
                                Username
                            </label>
                            <input
                                ref={usernameRef}
                                type="text"
                                id="admin-username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter admin username"
                                disabled={isLocked || loading}
                                autoComplete="username"
                                style={{
                                    borderColor: error ? 'rgba(255,59,92,0.4)' : 'var(--border)',
                                }}
                            />
                        </div>

                        <div style={{ marginBottom: 24 }}>
                            <label style={{
                                display: 'block', fontSize: 11, fontWeight: 600,
                                color: 'var(--text-secondary)', marginBottom: 6,
                                letterSpacing: '0.5px', textTransform: 'uppercase',
                            }}>
                                Password
                            </label>
                            <div style={{ position: 'relative' }}>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    id="admin-password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter admin password"
                                    disabled={isLocked || loading}
                                    autoComplete="current-password"
                                    style={{
                                        borderColor: error ? 'rgba(255,59,92,0.4)' : 'var(--border)',
                                        paddingRight: 44,
                                    }}
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    style={{
                                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                        background: 'transparent', border: 'none', cursor: 'pointer',
                                        color: 'var(--text-muted)', padding: 4,
                                    }}
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>

                        {/* Error message */}
                        {error && (
                            <div className="shake" style={{
                                display: 'flex', alignItems: 'center', gap: 8,
                                padding: '10px 14px', borderRadius: 8, marginBottom: 16,
                                background: 'rgba(255,59,92,0.08)',
                                border: '1px solid rgba(255,59,92,0.2)',
                            }}>
                                <AlertTriangle size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: 'var(--accent-red)' }}>{error}</span>
                            </div>
                        )}

                        {/* Lockout timer */}
                        {isLocked && (
                            <div style={{
                                textAlign: 'center', marginBottom: 16,
                                fontSize: 13, color: 'var(--accent-red)', fontWeight: 600,
                            }}>
                                <span className="mono" style={{ fontSize: 20 }}>
                                    {String(Math.floor(lockoutTimer / 60)).padStart(2, '0')}:{String(lockoutTimer % 60).padStart(2, '0')}
                                </span>
                                <div style={{ fontSize: 11, marginTop: 4, color: 'var(--text-muted)' }}>
                                    Account temporarily locked
                                </div>
                            </div>
                        )}

                        {/* Submit */}
                        <button
                            type="submit"
                            className="btn-primary"
                            disabled={isLocked || loading}
                            id="admin-login-btn"
                            style={{ width: '100%', padding: '12px 24px', fontSize: 14 }}
                        >
                            {loading ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{
                                        width: 16, height: 16, border: '2px solid rgba(10,14,26,0.3)',
                                        borderTopColor: '#0A0E1A', borderRadius: '50%',
                                        animation: 'spin 0.6s linear infinite',
                                    }} />
                                    Authenticating...
                                </span>
                            ) : (
                                <>
                                    <LogIn size={16} />
                                    Sign In
                                </>
                            )}
                        </button>
                    </form>

                    {/* Footer warning */}
                    <div style={{
                        textAlign: 'center', marginTop: 24,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                        <AlertTriangle size={12} style={{ color: 'var(--text-muted)' }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                            Unauthorized access is monitored
                        </span>
                    </div>
                </div>
            </div>

            {/* Spin keyframe for loading */}
            <style>{`
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    )
}
