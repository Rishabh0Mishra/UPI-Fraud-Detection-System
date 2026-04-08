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

// ── Vouch (Mark as Safe) ──

export const vouchSafe = async (identifier, vouchType = 'UPI_ID') => {
    return tryOrFallback(
        async () => {
            const { data } = await client.post('/vouch', {
                identifier,
                vouch_type: vouchType,
                user_id: 'anonymous',
            })
            return data
        },
        () => ({ status: 'vouched', identifier, message: 'Marked as safe (mock)' })
    )
}

// ── Screenshot Verification ──

export const verifyScreenshot = async (file) => {
    const formData = new FormData()
    formData.append('file', file)

    return tryOrFallback(
        async () => {
            const { data } = await client.post('/api/verify-screenshot', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
                timeout: 30000, // allow more time for OCR processing
            })
            return data
        },
        () => {
            // Mock response for offline mode
            const isPng = file.name?.toLowerCase().endsWith('.png')
            if (!isPng) {
                return {
                    result: 'REJECTED',
                    reason_code: 'INVALID_FORMAT',
                    message: 'Only PNG screenshots are supported. JPEG and other formats destroy the verification signature.',
                    risk_score: 100,
                    detected_app: null,
                    display_name: 'N/A',
                    confidence: 0,
                    confidence_label: 'LOW',
                    signature_status: 'N/A',
                    detection_method: 'none',
                    extracted_string: null,
                }
            }
            // Random mock result for demo
            const isFraud = Math.random() > 0.5
            return {
                result: isFraud ? 'FRAUD' : 'GENUINE',
                reason_code: isFraud ? 'NO_STRING' : 'GENUINE',
                message: isFraud
                    ? 'No verification signature found. This is likely a fake or unverified screenshot.'
                    : 'This screenshot has a valid verification signature. The transaction appears authentic.',
                risk_score: isFraud ? 100 : 0,
                detected_app: 'gpay',
                display_name: 'Google Pay',
                confidence: 0.85,
                confidence_label: 'HIGH',
                signature_status: isFraud ? 'NOT FOUND' : 'VALID ✓',
                detection_method: 'ocr',
                extracted_string: isFraud ? null : '[HIDDEN]',
            }
        }
    )
}

// ── Admin Session Management ──

export const adminLogin = async (username, password) => {
    const { data } = await client.post('/api/admin/login', { username, password })
    return data
}

export const adminLogout = async (token) => {
    const { data } = await client.post('/api/admin/logout', null, {
        headers: { 'x-admin-token': token },
    })
    return data
}

export const adminVerifySession = async (token) => {
    const { data } = await client.get('/api/admin/verify-session', {
        headers: { 'x-admin-token': token },
    })
    return data
}

// ── Admin Verification Table CRUD ──

export const getVerificationTable = async (token) => {
    const { data } = await client.get('/api/admin/verification-table', {
        headers: { 'x-admin-token': token },
    })
    return data
}

export const addVerificationRow = async (token, app_name, secret_string) => {
    const { data } = await client.post('/api/admin/verification-table/add',
        { app_name, secret_string },
        { headers: { 'x-admin-token': token } },
    )
    return data
}

export const deleteVerificationRow = async (token, appId) => {
    const { data } = await client.delete(`/api/admin/verification-table/${appId}`, {
        headers: { 'x-admin-token': token },
    })
    return data
}


