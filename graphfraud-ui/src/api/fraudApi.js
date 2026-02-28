import client from './client'
import { USE_MOCK_DATA } from '../config'
import { generateMockTransaction, generateMockHealth, generateMockStats } from './mockData'

export const scoreTransaction = async (txnData) => {
    if (USE_MOCK_DATA) {
        await new Promise((r) => setTimeout(r, 300 + Math.random() * 500))
        const mock = generateMockTransaction()
        return { ...mock, ...{ transaction_id: txnData.transaction_id, sender_user_id: txnData.sender_user_id, receiver_id: txnData.receiver_id, amount: txnData.amount, transaction_type: txnData.transaction_type } }
    }
    const { data } = await client.post('/score', txnData)
    return data
}

export const scoreBatch = async (transactions) => {
    if (USE_MOCK_DATA) {
        await new Promise((r) => setTimeout(r, 500))
        return { results: transactions.map(() => generateMockTransaction()), total_latency_ms: 45.2 }
    }
    const { data } = await client.post('/score/batch', { transactions })
    return data
}

export const getHealth = async () => {
    if (USE_MOCK_DATA) {
        return generateMockHealth()
    }
    const { data } = await client.get('/health')
    return data
}

export const getStats = async () => {
    if (USE_MOCK_DATA) {
        return generateMockStats()
    }
    const { data } = await client.get('/stats')
    return data
}
