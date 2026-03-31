import { useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout({ children }) {
    const location = useLocation()

    // Determine which top-nav section is active based on route
    const getSection = () => {
        const p = location.pathname
        if (p === '/' || p === '/live') return 'monitoring'
        if (p === '/score' || p === '/rings' || p === '/analytics') return 'analysis'
        if (p === '/health' || p === '/admin') return 'system'
        if (['/qrcode', '/linkcheck', '/upiid', '/txnlookup', '/batchupload', '/user'].includes(p)) return 'enduser'
        return 'monitoring'
    }

    return (
        <div className="app-shell">
            <TopBar activeSection={getSection()} />
            <Sidebar activeSection={getSection()} />
            <div className="main-content">
                {children}
            </div>
        </div>
    )
}
