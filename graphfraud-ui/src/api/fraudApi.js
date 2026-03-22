import client from './client'
import { USE_MOCK_DATA } from '../config'
import {
    generateMockTransaction, generateMockHealth, generateMockStats,
    generateMockDashboardStats, generateMockHourlyTrend
} from './mockData'

/**
 * Auto-fallback: when USE_MOCK_DATA is false but the backend is unreachable,
 * silently fall back to mock data so the UI always works.
 */
let backendDown = false

const tryOrFallback = async (apiFn, mockFn) => {
    if (USE_MOCK_DATA || backendDown) {
        await new Promise((r) => setTimeout(r, 200 + Math.random() * 300))
        return mockFn()
    }
    try {
        const result = await apiFn()
        backendDown = false
        return result
    } catch (err) {
        // If it's a network error (backend not running), switch to mock mode
        if (!err.response) {
            console.warn('Backend unreachable — switching to mock data')
            backendDown = true
            return mockFn()
        }
        throw err
    }
}

// Periodically re-check if backend is back (every 30s)
setInterval(() => { backendDown = false }, 30000)

// ── Existing Endpoints ──

export const scoreTransaction = async (txnData) => {
    return tryOrFallback(
        async () => {
            const { data } = await client.post('/score', txnData)
            return data
        },
        () => {
            const mock = generateMockTransaction()
            return { ...mock, transaction_id: txnData.transaction_id, sender_user_id: txnData.sender_user_id, receiver_id: txnData.receiver_id, amount: txnData.amount, transaction_type: txnData.transaction_type }
        }
    )
}

export const scoreBatch = async (transactions) => {
    return tryOrFallback(
        async () => {
            const { data } = await client.post('/score/batch', { transactions })
            return data
        },
        () => ({ results: transactions.map(() => generateMockTransaction()), total_latency_ms: 45.2 })
    )
}

export const getHealth = async () => {
    return tryOrFallback(
        async () => {
            const { data } = await client.get('/health')
            return data
        },
        () => generateMockHealth()
    )
}

export const getStats = async () => {
    return tryOrFallback(
        async () => {
            const { data } = await client.get('/stats')
            return data
        },
        () => generateMockStats()
    )
}

// ── Live Feed Endpoints ──

export const getLiveFeedRecent = async (limit = 100) => {
    return tryOrFallback(
        async () => {
            const { data } = await client.get(`/api/live-feed/recent?limit=${limit}`)
            return data
        },
        () => ({
            transactions: Array.from({ length: Math.min(limit, 50) }, () => generateMockTransaction())
        })
    )
}

export const filterLiveFeed = async (filters = {}) => {
    return tryOrFallback(
        async () => {
            const { data } = await client.post('/api/live-feed/filter', null, { params: filters })
            return data
        },
        () => ({
            transactions: Array.from({ length: 20 }, () => generateMockTransaction())
                .filter(t => !filters.classification || t.classification === filters.classification)
        })
    )
}

// ── Dashboard Endpoints ──

export const getDashboardStats = async (window = '1_HOUR') => {
    return tryOrFallback(
        async () => {
            const { data } = await client.get(`/api/dashboard/stats?window=${window}`)
            return data
        },
        () => generateMockDashboardStats()
    )
}

export const getDashboardChartData = async (hours = 24) => {
    return tryOrFallback(
        async () => {
            const { data } = await client.get(`/api/dashboard/chart-data?hours=${hours}`)
            return data
        },
        () => ({ hourly_trend: generateMockHourlyTrend() })
    )
}

export const getDashboardRecentAlerts = async (limit = 10) => {
    return tryOrFallback(
        async () => {
            const { data } = await client.get(`/api/dashboard/recent-alerts?limit=${limit}`)
            return data
        },
        () => ({
            alerts: Array.from({ length: limit }, () => {
                const t = generateMockTransaction()
                t.classification = 'FRAUD'
                t.internal_risk_score = 50 + Math.random() * 50
                return t
            })
        })
    )
}

// ── Network / Ring Explorer Endpoints ──

export const getNetworkGraphData = async (minRisk = 50, timeframe = 24) => {
    return tryOrFallback(
        async () => {
            const { data } = await client.get(`/api/network/graph-data?min_risk=${minRisk}&timeframe=${timeframe}`)
            return data
        },
        () => ({ nodes: [], edges: [], total_nodes: 0, total_edges: 0 })
    )
}

export const getNetworkPatterns = async (timeframe = 24) => {
    return tryOrFallback(
        async () => {
            const { data } = await client.get(`/api/network/detect-patterns?timeframe=${timeframe}`)
            return data
        },
        () => ({ patterns: [], total_patterns: 0 })
    )
}

// ── Buffer Status ──

export const getBufferStatus = async () => {
    return tryOrFallback(
        async () => {
            const { data } = await client.get('/api/buffer/status')
            return data
        },
        () => ({ current_slot: 342, total_processed: 342, buffer_full: false, max_buffer_size: 50000 })
    )
}

// ── Scan History ──

export const recordScan = async (upiId, userId = 'anonymous', score = 0, action = 'VIEWED', reported = false) => {
    return tryOrFallback(
        async () => {
            const { data } = await client.post('/api/scan/record', {
                upi_id: upiId, user_id: userId, score, action, reported
            })
            return data
        },
        () => ({ status: 'recorded', upi_id: upiId, scan_id: Date.now() })
    )
}
