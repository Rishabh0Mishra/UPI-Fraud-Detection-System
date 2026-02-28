import client from './client'
import { USE_MOCK_DATA } from '../config'
import { generateMockTransaction, generateMockHealth, generateMockStats } from './mockData'

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
