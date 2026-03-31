import { NavLink, useLocation } from 'react-router-dom'

const sectionNav = {
    monitoring: [
        { path: '/', label: 'Dashboard', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg> },
        { path: '/live', label: 'Live Feed', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><circle cx="8" cy="8" r="2"/><path d="M4 8a4 4 0 018 0M2 8a6 6 0 0112 0"/></svg> },
    ],
    analysis: [
        { path: '/score', label: 'Score Transaction', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M2 12L6 8l3 3 5-6"/></svg> },
        { path: '/rings', label: 'Ring Explorer', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><circle cx="5" cy="5" r="2"/><circle cx="11" cy="5" r="2"/><circle cx="8" cy="11" r="2"/><path d="M7 5h2M6.5 7l-1 2.5M9.5 7l1 2.5"/></svg> },
        { path: '/analytics', label: 'Analytics', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M1 12l4-4 3 2 4-6 3 2"/></svg> },
    ],
    system: [
        { path: '/health', label: 'System Health', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M2 8h3l2-4 2 8 2-4h3"/></svg> },
        { path: '/admin', label: 'Admin Panel', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><circle cx="8" cy="8" r="2"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.2 3.2l1.4 1.4M11.4 11.4l1.4 1.4M3.2 12.8l1.4-1.4M11.4 4.6l1.4-1.4"/></svg> },
    ],
    enduser: [
        { path: '/qrcode', label: 'QR Code', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><rect x="1" y="1" width="5" height="5" rx="1"/><rect x="10" y="1" width="5" height="5" rx="1"/><rect x="1" y="10" width="5" height="5" rx="1"/><path d="M10 10h2v2h-2zM12 12h3M12 10h3M10 13v2"/></svg> },
        { path: '/linkcheck', label: 'Link Check', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M6.5 9.5a3.5 3.5 0 005 0l2-2a3.5 3.5 0 00-5-5L7 4"/><path d="M9.5 6.5a3.5 3.5 0 00-5 0l-2 2a3.5 3.5 0 005 5L9 12"/></svg> },
        { path: '/upiid', label: 'UPI ID', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><circle cx="8" cy="5" r="3"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5"/></svg> },
        { path: '/txnlookup', label: 'Txn Lookup', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><circle cx="7" cy="7" r="5"/><path d="M11 11l3 3"/><path d="M5 7h4M7 5v4"/></svg> },
        { path: '/batchupload', label: 'Batch Upload', icon: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor"><path d="M8 2v8M5 5l3-3 3 3"/><path d="M2 11v2a1 1 0 001 1h10a1 1 0 001-1v-2"/></svg> },
    ],
}

export default function Sidebar({ activeSection }) {
    const location = useLocation()
    const items = sectionNav[activeSection] || sectionNav.monitoring

    return (
        <div className="sidebar">
            <div className="sb-brand">
                <div className="sb-brand-name">Forensic Lens</div>
                <div className="sb-brand-sub">Operational Intelligence</div>
            </div>
            <div className="sb-nav">
                {items.map(item => (
                    <NavLink
                        key={item.path}
                        to={item.path}
                        className={`sb-item ${location.pathname === item.path ? 'active' : ''}`}
                    >
                        {item.icon}
                        {item.label}
                    </NavLink>
                ))}
            </div>
            <div className="sb-bottom">
                <button className="new-btn">+ New Investigation</button>
            </div>
        </div>
    )
}
