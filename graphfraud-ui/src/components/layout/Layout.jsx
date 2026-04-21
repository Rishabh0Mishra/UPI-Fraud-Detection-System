import Sidebar from './Sidebar'
import TopBar from './TopBar'

export default function Layout({ children }) {
    return (
        <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>
            <Sidebar />
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
                <TopBar />
                <main
                    style={{
                        flex: 1,
                        overflowY: 'auto',
                        padding: '20px 28px',
                        background: 'var(--bg)',
                    }}
                >
                    {children}
                </main>
            </div>
        </div>
    )
}
