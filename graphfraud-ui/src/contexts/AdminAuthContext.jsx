import { createContext, useContext, useState, useEffect } from 'react'
import { adminLogin as apiLogin, adminLogout as apiLogout, adminVerifySession } from '../api/fraudApi'

const AdminAuthContext = createContext(null)

const TOKEN_KEY = 'admin_session_token'

export function AdminAuthProvider({ children }) {
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [token, setToken] = useState(null)

    // On mount, check if stored token is still valid
    useEffect(() => {
        const stored = localStorage.getItem(TOKEN_KEY)
        if (!stored) {
            setIsLoading(false)
            return
        }
        adminVerifySession(stored)
            .then(() => {
                setToken(stored)
                setIsLoggedIn(true)
            })
            .catch(() => {
                localStorage.removeItem(TOKEN_KEY)
            })
            .finally(() => setIsLoading(false))
    }, [])

    const login = async (username, password) => {
        const res = await apiLogin(username, password)
        if (res.success && res.session_token) {
            localStorage.setItem(TOKEN_KEY, res.session_token)
            setToken(res.session_token)
            setIsLoggedIn(true)
            return { success: true }
        }
        return { success: false }
    }

    const logout = async () => {
        const stored = localStorage.getItem(TOKEN_KEY)
        if (stored) {
            try { await apiLogout(stored) } catch { /* ignore */ }
        }
        localStorage.removeItem(TOKEN_KEY)
        setToken(null)
        setIsLoggedIn(false)
    }

    return (
        <AdminAuthContext.Provider value={{ isLoggedIn, isLoading, token, login, logout }}>
            {children}
        </AdminAuthContext.Provider>
    )
}

export function useAdminAuth() {
    const ctx = useContext(AdminAuthContext)
    if (!ctx) throw new Error('useAdminAuth must be inside AdminAuthProvider')
    return ctx
}
