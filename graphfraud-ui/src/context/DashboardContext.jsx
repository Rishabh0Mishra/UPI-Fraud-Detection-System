/**
 * DashboardContext — persistent background cache for dashboard data.
 *
 * Architecture:
 *   Live Feed → Live Feed DB (50k FIFO cap) → backend API → here → Dashboard UI
 *
 * This context does ONE thing: poll the three backend dashboard endpoints
 * every 5s and keep the results in memory so navigating away and back
 * to the Dashboard page shows data instantly (no loading spinner).
 *
 * It does NOT merge live feed transactions — the DB is the single source
 * of truth for all counts and chart data.
 */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { getDashboardStats, getDashboardChartData, getDashboardRecentAlerts } from '../api/fraudApi'
import { DASHBOARD_REFRESH_MS } from '../config'

const DashboardContext = createContext(null)

export function useDashboard() {
    const ctx = useContext(DashboardContext)
    if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
    return ctx
}

export function DashboardProvider({ children }) {
    const [stats, setStats]               = useState(null)
    const [chartData, setChartData]       = useState(null)
    const [recentAlerts, setRecentAlerts] = useState([])
    const [loading, setLoading]           = useState(true)
    const [error, setError]               = useState(null)
    const [lastUpdated, setLastUpdated]   = useState(null)

    const mountedRef     = useRef(true)
    const loadedOnce     = useRef(false)

    const fetchAll = useCallback(async () => {
        try {
            const [newStats, newChartData, alertsData] = await Promise.all([
                getDashboardStats('ALL_TIME'),
                getDashboardChartData(24),
                getDashboardRecentAlerts(15),
            ])

            if (!mountedRef.current) return

            // Always trust the DB response — it is the source of truth
            // Only skip if the response is clearly empty AND we already have good data
            // (prevents a transient bad response from wiping real data)
            if (newStats != null) setStats(newStats)
            if (newChartData != null) setChartData(newChartData)
            if (alertsData?.alerts != null) setRecentAlerts(alertsData.alerts)

            loadedOnce.current = true
            setLoading(false)
            setError(null)
            setLastUpdated(new Date())
        } catch (err) {
            if (!mountedRef.current) return
            // On error: keep showing whatever data we already have
            // Only show the error state if we have nothing yet
            if (!loadedOnce.current) {
                setError(err?.message || 'Failed to load dashboard data')
            }
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        mountedRef.current = true
        fetchAll()
        const interval = setInterval(fetchAll, DASHBOARD_REFRESH_MS)
        return () => {
            mountedRef.current = false
            clearInterval(interval)
        }
    }, [fetchAll])

    const refetch = useCallback(() => {
        setLoading(true)
        fetchAll()
    }, [fetchAll])

    return (
        <DashboardContext.Provider value={{
            stats,
            chartData,
            recentAlerts,
            loading,
            error,
            lastUpdated,
            refetch,
        }}>
            {children}
        </DashboardContext.Provider>
    )
}
