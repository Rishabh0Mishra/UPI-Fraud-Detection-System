import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from './components/common/ToastNotification'
import { LiveFeedProvider } from './context/LiveFeedContext'
import { AdminAuthProvider } from './contexts/AdminAuthContext'
import Layout from './components/layout/Layout'
import Dashboard from './pages/Dashboard'
import LiveFeed from './pages/LiveFeed'
import ScoreTransaction from './pages/ScoreTransaction'
import RingExplorer from './pages/RingExplorer'
import Analytics from './pages/Analytics'
import SystemHealth from './pages/SystemHealth'
import AdminPanel from './pages/AdminPanel'
import UserPortal from './pages/UserPortal'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 10000 },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AdminAuthProvider>
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
                <Route path="/user" element={<UserPortal />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Layout>
          </BrowserRouter>
          </LiveFeedProvider>
        </AdminAuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
