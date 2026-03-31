import { useState } from 'react'
import { Shield, Camera, Link2, UserCheck, Receipt, ListChecks, Search, FileText } from 'lucide-react'
import { detectInputType } from '../utils/checkTypeDetector'
import QRChecker from '../components/user/QRChecker'
import LinkChecker from '../components/user/LinkChecker'
import UPIChecker from '../components/user/UPIChecker'
import TransactionLookup from '../components/user/TransactionLookup'
import BatchChecker from '../components/user/BatchChecker'
import ReportModal from '../components/user/ReportModal'

const TABS = [
    { id: 'qr', label: 'QR Code', icon: Camera },
    { id: 'link', label: 'Link Check', icon: Link2 },
    { id: 'upi', label: 'UPI ID', icon: UserCheck },
    { id: 'txn', label: 'Txn Lookup', icon: Receipt },
    { id: 'batch', label: 'Batch Upload', icon: ListChecks },
]

export default function UserPortal() {
    const [activeTab, setActiveTab] = useState('qr')
    const [searchText, setSearchText] = useState('')
    const [reportModal, setReportModal] = useState(null)
    const [showPastReports, setShowPastReports] = useState(false)
    const getStoredReports = () => JSON.parse(localStorage.getItem('fraud_reports') || '[]')
    const [pastReports, setPastReports] = useState(getStoredReports)
    const pastReportCount = pastReports.length

    const handleUniversalSearch = () => {
        const v = searchText.trim()
        if (!v) return
        const type = detectInputType(v)
        if (type === 'qr') setActiveTab('qr')
        else if (type === 'link') setActiveTab('link')
        else if (type === 'upi') setActiveTab('upi')
        else if (type === 'transaction') setActiveTab('txn')
        else setActiveTab('upi') // default to UPI for unknown
        // Slight delay so the tab renders before we'd need to pre-fill
        setSearchText('')
    }

    const openReport = (item) => setReportModal(item)
    const closeReport = () => {
        setReportModal(null)
        // Refresh past reports after modal closes (new report may have been saved)
        setPastReports(getStoredReports())
    }

    return (
        <div style={{ minHeight: 'calc(100vh - 80px)', display: 'flex', justifyContent: 'center', paddingTop: 24, paddingBottom: 60 }}>
            <div style={{ maxWidth: 780, width: '100%', padding: '0 20px' }}>

                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: 28 }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                        <Shield size={28} style={{ color: 'var(--accent-cyan)' }} />
                        <h1 style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.3px' }}>UPI Safety Portal</h1>
                    </div>
                    <p style={{ color: 'var(--text-secondary)', fontSize: 15, maxWidth: 540, margin: '0 auto', lineHeight: 1.6 }}>
                        Check if a UPI ID, QR code, link, or transaction is safe before you pay — or if something already went wrong.
                    </p>
                </div>

                {/* Universal Search */}
                <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 16, marginBottom: 24 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Search size={13} /> Paste anything to check — UPI ID, link, QR text, or TXN ID
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="e.g. name@oksbi or https://suspicious-link.com..."
                            style={{ flex: 1, fontSize: 14, borderRadius: 12, padding: '11px 14px' }}
                            onKeyDown={e => e.key === 'Enter' && handleUniversalSearch()} />
                        <button onClick={handleUniversalSearch} className="btn-primary" style={{ borderRadius: 12, padding: '11px 18px', whiteSpace: 'nowrap', fontSize: 14 }} disabled={!searchText.trim()}>Check →</button>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>We'll automatically detect what it is and check it for you</p>
                </div>

                {/* Tab Bar */}
                <div style={{ display: 'flex', gap: 4, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
                    {TABS.map(tab => {
                        const Icon = tab.icon
                        const isActive = activeTab === tab.id
                        return (
                            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                                style={{
                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                    padding: '12px 14px', borderRadius: 14, fontSize: 13, fontWeight: isActive ? 600 : 400,
                                    background: isActive ? 'rgba(0,212,255,0.08)' : 'transparent',
                                    color: isActive ? '#fff' : 'var(--text-muted)',
                                    borderBottom: isActive ? '3px solid var(--accent-cyan)' : '3px solid transparent',
                                    transition: 'all 0.2s', whiteSpace: 'nowrap', minWidth: 0,
                                }}>
                                <Icon size={16} />
                                <span className="tab-label">{tab.label}</span>
                            </button>
                        )
                    })}
                </div>

                {/* Tab Content */}
                <div className="card" style={{ borderRadius: 20, padding: '28px 24px' }}>
                    {activeTab === 'qr' && <QRChecker onReport={openReport} />}
                    {activeTab === 'link' && <LinkChecker onReport={openReport} />}
                    {activeTab === 'upi' && <UPIChecker onReport={openReport} />}
                    {activeTab === 'txn' && <TransactionLookup onReport={openReport} />}
                    {activeTab === 'batch' && <BatchChecker onReport={openReport} />}
                </div>

                {/* Past Reports Link */}
                <div style={{ textAlign: 'center', marginTop: 20 }}>
                    {pastReportCount > 0 && (
                        <button onClick={() => setShowPastReports(!showPastReports)} style={{ background: 'transparent', color: 'var(--accent-cyan)', fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <FileText size={14} /> View my past reports ({pastReportCount})
                        </button>
                    )}
                </div>

                {/* Past Reports Panel */}
                {showPastReports && pastReports.length > 0 && (
                    <div className="card fade-in" style={{ borderRadius: 16, padding: 20, marginTop: 12 }}>
                        <h4 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Past Reports</h4>
                        {pastReports.slice().reverse().map((r, i) => (
                            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                                <div>
                                    <span className="mono" style={{ color: 'var(--accent-cyan)', marginRight: 8 }}>{r.refCode}</span>
                                    <span style={{ color: 'var(--text-secondary)' }}>{r.item}</span>
                                </div>
                                <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{new Date(r.timestamp).toLocaleDateString()}</span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Privacy */}
                <p style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', marginTop: 20 }}>
                    🔒 Your data is processed locally and never shared. Checks run in your browser.
                </p>
            </div>

            {/* Report Modal */}
            {reportModal && <ReportModal item={reportModal} onClose={closeReport} />}

            {/* Mobile responsive style */}
            <style>{`
        @media (max-width: 640px) {
          .tab-label { display: none; }
        }
      `}</style>
        </div>
    )
}
