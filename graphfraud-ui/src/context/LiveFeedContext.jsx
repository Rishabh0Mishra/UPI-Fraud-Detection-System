import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
import { generateMockTransaction } from '../api/mockData'
import { getLiveFeedRecent } from '../api/fraudApi'
import { WS_URL, LIVE_FEED_INTERVAL_MS } from '../config'

const LiveFeedContext = createContext(null)

export function useLiveFeed() {
    const ctx = useContext(LiveFeedContext)
    if (!ctx) throw new Error('useLiveFeed must be used within LiveFeedProvider')
    return ctx
}

export function LiveFeedProvider({ children }) {
    const [transactions, setTransactions] = useState([])
    const [isLive, setIsLive] = useState(true)
    const [stats, setStats] = useState({ scored: 0, fraud: 0, noFraud: 0, avgLatency: 0 })
    const [wsConnected, setWsConnected] = useState(false)
    const wsRef = useRef(null)
    const initialLoadDone = useRef(false)

    // Load initial data from DB (only once on app start)
    useEffect(() => {
        if (initialLoadDone.current) return
        initialLoadDone.current = true

        getLiveFeedRecent(100).then(data => {
            if (data?.transactions?.length > 0) {
                setTransactions(data.transactions)
                const fraud = data.transactions.filter(t => t.classification === 'FRAUD').length
                setStats({
                    scored: data.transactions.length,
                    fraud,
                    noFraud: data.transactions.length - fraud,
                    avgLatency: 0,
                })
            }
        }).catch(() => {})
    }, [])

    // WebSocket / polling — stays alive across page navigations
    useEffect(() => {
        if (!isLive) {
            if (wsRef.current) { wsRef.current.close(); wsRef.current = null }
            setWsConnected(false)
            return
        }

        let ws
        let fallbackInterval

        try {
            ws = new WebSocket(WS_URL)
            wsRef.current = ws

            ws.onopen = () => {
                setWsConnected(true)
                console.log('WebSocket connected')
            }

            ws.onmessage = (event) => {
                try {
                    const txn = JSON.parse(event.data)
                    setTransactions(prev => [txn, ...prev.slice(0, 199)])
                    setStats(prev => ({
                        scored: prev.scored + 1,
                        fraud: prev.fraud + (txn.classification === 'FRAUD' ? 1 : 0),
                        noFraud: prev.noFraud + (txn.classification !== 'FRAUD' ? 1 : 0),
                        avgLatency: parseFloat(((prev.avgLatency * prev.scored + (txn.processing_time_ms || txn.latency_ms || 0)) / (prev.scored + 1)).toFixed(1)),
                    }))
                } catch (e) { console.error('WS parse error:', e) }
            }

            ws.onclose = () => {
                setWsConnected(false)
                // Fallback to polling with mock data
                fallbackInterval = setInterval(() => {
                    const txn = generateMockTransaction()
                    setTransactions(prev => [txn, ...prev.slice(0, 199)])
                    setStats(prev => ({
                        scored: prev.scored + 1,
                        fraud: prev.fraud + (txn.classification === 'FRAUD' ? 1 : 0),
                        noFraud: prev.noFraud + (txn.classification !== 'FRAUD' ? 1 : 0),
                        avgLatency: parseFloat(((prev.avgLatency * prev.scored + txn.latency_ms) / (prev.scored + 1)).toFixed(1)),
                    }))
                }, LIVE_FEED_INTERVAL_MS + Math.random() * 1000)
            }

            ws.onerror = () => { ws.close() }
        } catch (e) {
            // WebSocket not available, use polling
            fallbackInterval = setInterval(() => {
                const txn = generateMockTransaction()
                setTransactions(prev => [txn, ...prev.slice(0, 199)])
                setStats(prev => ({
                    scored: prev.scored + 1,
                    fraud: prev.fraud + (txn.classification === 'FRAUD' ? 1 : 0),
                    noFraud: prev.noFraud + (txn.classification !== 'FRAUD' ? 1 : 0),
                    avgLatency: parseFloat(((prev.avgLatency * prev.scored + txn.latency_ms) / (prev.scored + 1)).toFixed(1)),
                }))
            }, LIVE_FEED_INTERVAL_MS + Math.random() * 1000)
        }

        return () => {
            if (ws) ws.close()
            if (fallbackInterval) clearInterval(fallbackInterval)
        }
    }, [isLive])

    const clearFeed = useCallback(() => {
        setTransactions([])
        setStats({ scored: 0, fraud: 0, noFraud: 0, avgLatency: 0 })
    }, [])

    const value = {
        transactions,
        stats,
        isLive,
        setIsLive,
        wsConnected,
        clearFeed,
    }

    return (
        <LiveFeedContext.Provider value={value}>
            {children}
        </LiveFeedContext.Provider>
    )
}
