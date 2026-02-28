import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout({ children }) {
    return (
        <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <div className="flex flex-col flex-1 overflow-hidden">
                <TopBar />
                <main className="flex-1 overflow-y-auto p-6" style={{ background: 'var(--bg-base)' }}>
                    {children}
                </main>
            </div>
        </div>
    )
}
