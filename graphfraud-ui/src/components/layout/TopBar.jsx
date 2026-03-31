import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../../api/fraudApi'
import { HEALTH_REFRESH_MS } from '../../config'

const sections = [
    { id: 'monitoring', label: 'Monitoring', defaultPath: '/' },
    { id: 'analysis', label: 'Analysis', defaultPath: '/score' },
    { id: 'system', label: 'System', defaultPath: '/health' },
    { id: 'enduser', label: 'End User View', defaultPath: '/qrcode' },
]

export default function TopBar({ activeSection }) {
    const navigate = useNavigate()
    const { data: health } = useQuery({ queryKey: ['health'], queryFn: getHealth, refetchInterval: HEALTH_REFRESH_MS })
    const isHealthy = health?.status === 'healthy' || health?.model_loaded

    return (
        <div className="topnav">
            <div className="tn-links">
                {sections.slice(0, 2).map(s => (
                    <div
                        key={s.id}
                        className={`tn-link ${activeSection === s.id ? 'active' : ''}`}
                        onClick={() => navigate(s.defaultPath)}
                    >
                        {s.label}
                    </div>
                ))}
            </div>
            <div className="logo-wrap">GraphFraud</div>
            <div className="tn-links">
                {sections.slice(2).map(s => (
                    <div
                        key={s.id}
                        className={`tn-link ${activeSection === s.id ? 'active' : ''}`}
                        onClick={() => navigate(s.defaultPath)}
                    >
                        {s.label}
                    </div>
                ))}
            </div>
            <div className="tn-right">
                <div className="live-chip">
                    <div className="ldot" />
                    {isHealthy ? 'Live System Alpha' : 'Offline'}
                </div>
                <div className="icon-btn">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--text2)" strokeWidth="1.5">
                        <path d="M8 2a5 5 0 015 5c0 3 1 4 1 4H2s1-1 1-4a5 5 0 015-5z"/>
                        <path d="M9.7 13a2 2 0 01-3.4 0"/>
                    </svg>
                </div>
                <div className="icon-btn">
                    <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="var(--text2)" strokeWidth="1.5">
                        <rect x="2" y="2" width="5" height="5" rx="1"/>
                        <rect x="9" y="2" width="5" height="5" rx="1"/>
                        <rect x="2" y="9" width="5" height="5" rx="1"/>
                        <rect x="9" y="9" width="5" height="5" rx="1"/>
                    </svg>
                </div>
                <div className="avatar">S</div>
            </div>
        </div>
    )
}
