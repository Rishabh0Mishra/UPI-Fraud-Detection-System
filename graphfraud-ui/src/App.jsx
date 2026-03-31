import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from './components/common/ToastNotification'
import { LiveFeedProvider } from './context/LiveFeedContext'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import LiveFeed from './pages/LiveFeed'
import ScoreTransaction from './pages/ScoreTransaction'
import RingExplorer from './pages/RingExplorer'
import Analytics from './pages/Analytics'
import SystemHealth from './pages/SystemHealth'
import AdminPanel from './pages/AdminPanel'
import QRCodeCheck from './pages/user/QRCodeCheck'
import LinkCheck from './pages/user/LinkCheck'
import UPIIDCheck from './pages/user/UPIIDCheck'
import TxnLookup from './pages/user/TxnLookup'
import BatchUpload from './pages/user/BatchUpload'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 10000 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <LiveFeedProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/live" element={<LiveFeed />} />
              <Route path="/score" element={<ScoreTransaction />} />
              <Route path="/rings" element={<RingExplorer />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/health" element={<SystemHealth />} />
              <Route path="/admin" element={<AdminPanel />} />
              <Route path="/qrcode" element={<QRCodeCheck />} />
              <Route path="/linkcheck" element={<LinkCheck />} />
              <Route path="/upiid" element={<UPIIDCheck />} />
              <Route path="/txnlookup" element={<TxnLookup />} />
              <Route path="/batchupload" element={<BatchUpload />} />
              <Route path="/user" element={<Navigate to="/qrcode" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </BrowserRouter>
        </LiveFeedProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
