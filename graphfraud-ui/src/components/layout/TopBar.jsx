import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../../api/fraudApi'
import { HEALTH_REFRESH_MS } from '../../config'
import { Bell, Shield } from 'lucide-react'
import { useState, useEffect } from 'react'

export default function TopBar() {
    const { data: health } = useQuery({ queryKey: ['health'], queryFn: getHealth, refetchInterval: HEALTH_REFRESH_MS })
    const [uptime, setUptime] = useState(0)
    const isHealthy = health?.status === 'healthy' || health?.model_loaded

    useEffect(() => {
        if (health?.uptime_seconds) setUptime(Math.floor(health.uptime_seconds))
    }, [health])

    useEffect(() => {
        const t = setInterval(() => setUptime((u) => u + 1), 1000)
        return () => clearInterval(t)
    }, [])

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
                    GraphFraud<span style={{ color: 'var(--accent-cyan)' }}>-UPI</span>
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
                <button className="relative p-2 rounded-lg" style={{ background: 'transparent', color: 'var(--text-secondary)' }}>
                    <Bell size={18} />
                </button>
            </div>
        </header>
    )
}
