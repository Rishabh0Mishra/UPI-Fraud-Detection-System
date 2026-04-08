import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getHealth, getVerificationTable, addVerificationRow, deleteVerificationRow } from '../api/fraudApi'
import { useToast } from '../components/common/ToastNotification'
import { useAdminAuth } from '../contexts/AdminAuthContext'
import AdminLogin from './AdminLogin'
import { AlertTriangle, Save, RotateCcw, Lock, Unlock, Upload, Download, Plus, Trash2, Image, CheckCircle, XCircle, Eye, EyeOff } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────
// StegEngine — EXACT port of steg.js from emmebeeding folder
// ─────────────────────────────────────────────────────────────────
const StegEngine = (() => {
    const DELIMITER = '###END###'
    const DEFAULT_SEED = 42
    const CHANNELS = 3

    function mulberry32(seed) {
        return function () {
            seed |= 0
            seed = (seed + 0x6D2B79F5) | 0
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296
        }
    }

    function shuffledIndices(totalPixels, seed) {
        const rng = mulberry32(seed)
        const n = totalPixels * CHANNELS
        const idx = []
        for (let i = 0; i < totalPixels; i++) {
            const b = i * 4
            idx.push(b, b + 1, b + 2)
        }
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [idx[i], idx[j]] = [idx[j], idx[i]]
        }
        return idx
    }

    function strToBits(str) {
        const bits = []
        for (let i = 0; i < str.length; i++) {
            const c = str.charCodeAt(i)
            for (let b = 7; b >= 0; b--) bits.push((c >> b) & 1)
        }
        return bits
    }

    function getCapacity(totalPixels) {
        return Math.floor((totalPixels * CHANNELS - DELIMITER.length * 8) / 8)
    }

    function encode(imageData, message, seed) {
        seed = seed || DEFAULT_SEED
        const data = imageData.data
        const tp = imageData.width * imageData.height
        const cap = getCapacity(tp)
        if (!message) return { success: false, error: 'Message cannot be empty.' }
        if (message.length > cap) return { success: false, error: 'Message exceeds capacity (' + cap + ' chars max).' }

        const bits = strToBits(message + DELIMITER)
        const idx = shuffledIndices(tp, seed)

        for (let i = 0; i < bits.length; i++) {
            const p = idx[i]
            data[p] = (data[p] & 0xFE) | bits[i]
        }

        return { success: true, messageChars: message.length }
    }

    return { encode, getCapacity, DELIMITER, DEFAULT_SEED }
})()

// ─────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────
const DEFAULT_THRESHOLDS = { block: 0.82, review: 0.45 }
const DEFAULT_WEIGHTS = { lgbm: 75, graph: 25 }
const DEFAULT_RULES = [
    { id: 'sender_is_known_controller', label: 'Sender is known controller', active: true, triggered: 12 },
    { id: 'intra_ring_transfer', label: 'Intra-ring transfer', active: true, triggered: 8 },
    { id: 'receiver_is_fake_merchant', label: 'Receiver is fake merchant', active: true, triggered: 3 },
    { id: 'extreme_amount_ratio', label: 'Extreme amount ratio (>50×)', active: true, triggered: 1 },
]

const APP_COLORS = {
    gpay: '#34a853', phonepe: '#5f259f', paytm: '#00b9f1',
    bhim: '#f37021', default: 'var(--accent-cyan)',
}

// ─────────────────────────────────────────────────────────────────
// Screenshot Verification Manager Component (Admin Only)
// ─────────────────────────────────────────────────────────────────
function ScreenshotVerificationManager({ token }) {
    const { showToast } = useToast()
    const canvasRef = useRef(null)
    const fileInputRef = useRef(null)

    // Embed state
    const [selectedApp, setSelectedApp] = useState('')
    const [uploadedFile, setUploadedFile] = useState(null)
    const [uploadedPreview, setUploadedPreview] = useState(null)
    const [embedStatus, setEmbedStatus] = useState(null) // { type: 'success'|'error', message }
    const [isEmbedding, setIsEmbedding] = useState(false)

    // Table state
    const [tableRows, setTableRows] = useState([])
    const [tableLoading, setTableLoading] = useState(true)
    const [showSecrets, setShowSecrets] = useState({})

    // Add new row form
    const [showAddForm, setShowAddForm] = useState(false)
    const [newAppName, setNewAppName] = useState('')
    const [newSecret, setNewSecret] = useState('')
    const [addLoading, setAddLoading] = useState(false)

    // Load verification table
    const loadTable = useCallback(async () => {
        setTableLoading(true)
        try {
            const res = await getVerificationTable(token)
            setTableRows(res.rows || [])
        } catch (e) {
            console.error('Failed to load verification table:', e)
        } finally {
            setTableLoading(false)
        }
    }, [token])

    useEffect(() => { loadTable() }, [loadTable])

    // Handle file selection
    const handleFileSelect = (e) => {
        const file = e.target.files?.[0]
        if (!file) return

        // PNG only check
        if (!file.type.includes('png')) {
            setEmbedStatus({ type: 'error', message: '❌ Only PNG files are supported. JPEG and other formats destroy the LSB steganography data.' })
            setUploadedFile(null)
            setUploadedPreview(null)
            return
        }

        setUploadedFile(file)
        setEmbedStatus(null)
        const reader = new FileReader()
        reader.onload = (ev) => setUploadedPreview(ev.target.result)
        reader.readAsDataURL(file)
    }

    // Download link state
    const [downloadUrl, setDownloadUrl] = useState(null)
    const [downloadName, setDownloadName] = useState('')

    // Embed & Download
    const handleEmbed = async () => {
        if (!uploadedFile || !selectedApp) return

        // Find the secret for this app
        const row = tableRows.find(r => r.app_name === selectedApp)
        if (!row) {
            setEmbedStatus({ type: 'error', message: 'Selected app not found in verification table.' })
            return
        }

        setIsEmbedding(true)
        setEmbedStatus(null)
        // Clean up old download URL
        if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null) }

        try {
            // Load image into canvas
            const img = new window.Image()
            img.src = uploadedPreview

            await new Promise((resolve, reject) => {
                img.onload = resolve
                img.onerror = reject
            })

            const canvas = canvasRef.current
            const ctx = canvas.getContext('2d', { willReadFrequently: true })
            canvas.width = img.naturalWidth
            canvas.height = img.naturalHeight
            ctx.drawImage(img, 0, 0)

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

            // Encode using StegEngine (exact same algorithm as steg.js)
            const result = StegEngine.encode(imageData, row.secret_string, StegEngine.DEFAULT_SEED)

            if (!result.success) {
                setEmbedStatus({ type: 'error', message: result.error })
                setIsEmbedding(false)
                return
            }

            // Write back and generate blob
            ctx.putImageData(imageData, 0, 0)
            const blob = await new Promise(res => canvas.toBlob(res, 'image/png'))

            // Create persistent download URL (user clicks manually)
            const url = URL.createObjectURL(blob)
            const fname = `verified_${selectedApp}_${Date.now()}.png`
            setDownloadUrl(url)
            setDownloadName(fname)

            const displayName = row.app_name.charAt(0).toUpperCase() + row.app_name.slice(1)
            setEmbedStatus({
                type: 'success',
                message: `✓ Signature embedded for ${displayName}. Click the download button below to save.`,
            })
            showToast(`Signature embedded for ${displayName}`, 'success')
        } catch (err) {
            setEmbedStatus({ type: 'error', message: `Embedding failed: ${err.message}` })
        } finally {
            setIsEmbedding(false)
        }
    }

    // Add new app row
    const handleAddRow = async () => {
        if (!newAppName.trim() || !newSecret.trim()) return
        setAddLoading(true)
        try {
            await addVerificationRow(token, newAppName, newSecret)
            showToast(`Added ${newAppName} to verification table`, 'success')
            setNewAppName('')
            setNewSecret('')
            setShowAddForm(false)
            await loadTable()
        } catch (err) {
            const msg = err.response?.data?.detail || err.message
            showToast(msg, 'danger')
        } finally {
            setAddLoading(false)
        }
    }

    // Delete a row
    const handleDeleteRow = async (appId, appName) => {
        if (!window.confirm(`Delete "${appName}" from the verification table?`)) return
        try {
            await deleteVerificationRow(token, appId)
            showToast(`Removed ${appName}`, 'warning')
            await loadTable()
        } catch (err) {
            showToast('Failed to delete row', 'danger')
        }
    }

    // Mask secret string
    const maskSecret = (s) => s.length <= 6 ? '••••••' : s.slice(0, 4) + '••••••••'

    return (
        <div className="card">
            <div className="section-header">Screenshot Verification Manager</div>
            <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
                Embed verification signatures into UPI screenshots. Only the admin can create verified screenshots.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
                {/* ─── Left: Embed Signature ─── */}
                <div style={{
                    padding: 20, borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                }}>
                    <div style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--accent-cyan)',
                        marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                        <Image size={14} /> Embed Signature
                    </div>

                    {/* App Selector */}
                    <div style={{ marginBottom: 14 }}>
                        <label style={{
                            display: 'block', fontSize: 11, fontWeight: 600,
                            color: 'var(--text-secondary)', marginBottom: 6,
                        }}>
                            Select UPI App
                        </label>
                        <select
                            value={selectedApp}
                            onChange={(e) => setSelectedApp(e.target.value)}
                            style={{ cursor: 'pointer' }}
                        >
                            <option value="">— Select app —</option>
                            {tableRows.map((row) => (
                                <option key={row.app_id} value={row.app_name}>
                                    {row.app_name.charAt(0).toUpperCase() + row.app_name.slice(1)}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* File Upload */}
                    <div style={{ marginBottom: 14 }}>
                        <label style={{
                            display: 'block', fontSize: 11, fontWeight: 600,
                            color: 'var(--text-secondary)', marginBottom: 6,
                        }}>
                            Upload Screenshot (PNG only)
                        </label>

                        {!uploadedPreview ? (
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                style={{
                                    padding: '24px 16px', borderRadius: 8,
                                    border: '2px dashed var(--border-bright)',
                                    display: 'flex', flexDirection: 'column',
                                    alignItems: 'center', gap: 8, cursor: 'pointer',
                                    transition: 'border-color 0.2s',
                                    background: 'rgba(0,0,0,0.15)',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--accent-cyan)'}
                                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--border-bright)'}
                            >
                                <Upload size={20} style={{ color: 'var(--text-muted)' }} />
                                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                    Click to upload PNG screenshot
                                </span>
                            </div>
                        ) : (
                            <div style={{ position: 'relative' }}>
                                <img
                                    src={uploadedPreview}
                                    alt="Preview"
                                    style={{
                                        width: '100%', maxHeight: 160, objectFit: 'contain',
                                        borderRadius: 8, border: '1px solid var(--border)',
                                        background: '#000',
                                    }}
                                />
                                <button
                                    onClick={() => {
                                        setUploadedFile(null)
                                        setUploadedPreview(null)
                                        setEmbedStatus(null)
                                        if (fileInputRef.current) fileInputRef.current.value = ''
                                    }}
                                    style={{
                                        position: 'absolute', top: 6, right: 6,
                                        background: 'rgba(255,59,92,0.8)', color: '#fff',
                                        border: 'none', borderRadius: 6,
                                        width: 24, height: 24, fontSize: 12,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer',
                                    }}
                                >
                                    ×
                                </button>
                            </div>
                        )}

                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/png"
                            onChange={handleFileSelect}
                            style={{ display: 'none' }}
                        />
                    </div>

                    {/* Embed & Download Button */}
                    <button
                        className="btn-primary text-xs"
                        onClick={handleEmbed}
                        disabled={!selectedApp || !uploadedFile || isEmbedding}
                        style={{ width: '100%', padding: '10px 16px', gap: 6 }}
                    >
                        {isEmbedding ? (
                            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div style={{
                                    width: 14, height: 14, border: '2px solid rgba(10,14,26,0.3)',
                                    borderTopColor: '#0A0E1A', borderRadius: '50%',
                                    animation: 'spin 0.6s linear infinite',
                                }} />
                                Embedding...
                            </span>
                        ) : (
                            <><Download size={14} /> Embed &amp; Download</>
                        )}
                    </button>

                    {/* Status message */}
                    {embedStatus && (
                        <div style={{
                            marginTop: 12, padding: '10px 12px', borderRadius: 8,
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: embedStatus.type === 'success'
                                ? 'rgba(0,229,160,0.08)'
                                : 'rgba(255,59,92,0.08)',
                            border: `1px solid ${embedStatus.type === 'success'
                                ? 'rgba(0,229,160,0.2)'
                                : 'rgba(255,59,92,0.2)'}`,
                        }}>
                            {embedStatus.type === 'success'
                                ? <CheckCircle size={14} style={{ color: 'var(--accent-green)', flexShrink: 0 }} />
                                : <XCircle size={14} style={{ color: 'var(--accent-red)', flexShrink: 0 }} />}
                            <span style={{
                                fontSize: 12,
                                color: embedStatus.type === 'success' ? 'var(--accent-green)' : 'var(--accent-red)',
                            }}>
                                {embedStatus.message}
                            </span>
                        </div>
                    )}

                    {/* Visible Download Button */}
                    {downloadUrl && (
                        <a
                            href={downloadUrl}
                            download={downloadName}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                marginTop: 10, padding: '12px 16px', borderRadius: 8,
                                background: 'linear-gradient(135deg, #00E5A0, #00B880)',
                                color: '#0A0E1A', textDecoration: 'none',
                                fontWeight: 700, fontSize: 13,
                                transition: 'all 0.2s',
                                boxShadow: '0 0 20px rgba(0,229,160,0.15)',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(1.1)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
                            onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; e.currentTarget.style.transform = 'none' }}
                        >
                            <Download size={16} />
                            ⬇ Download Watermarked PNG
                        </a>
                    )}
                    {downloadUrl && (
                        <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
                            File: <span className="mono" style={{ color: 'var(--text-secondary)' }}>{downloadName}</span>
                            <br/>Saves to your browser's default Downloads folder
                        </div>
                    )}
                </div>

                {/* ─── Right: Verification Table ─── */}
                <div style={{
                    padding: 20, borderRadius: 'var(--radius-sm)',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                }}>
                    <div style={{
                        fontSize: 12, fontWeight: 600, color: 'var(--accent-cyan)',
                        marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        textTransform: 'uppercase', letterSpacing: '0.5px',
                    }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Lock size={14} /> Verification Table
                        </span>
                        <span className="mono" style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'none' }}>
                            {tableRows.length} entries
                        </span>
                    </div>

                    {tableLoading ? (
                        <div style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)', fontSize: 12 }}>
                            Loading...
                        </div>
                    ) : (
                        <>
                            <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                                        <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>App</th>
                                        <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 600 }}>Secret String</th>
                                        <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 600, width: 40 }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {tableRows.map((row) => (
                                        <tr key={row.app_id} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '8px 8px' }}>
                                                <span style={{
                                                    display: 'inline-flex', alignItems: 'center', gap: 6,
                                                    fontWeight: 600, color: APP_COLORS[row.app_name] || APP_COLORS.default,
                                                }}>
                                                    <div style={{
                                                        width: 8, height: 8, borderRadius: '50%',
                                                        background: APP_COLORS[row.app_name] || APP_COLORS.default,
                                                    }} />
                                                    {row.app_name.charAt(0).toUpperCase() + row.app_name.slice(1)}
                                                </span>
                                            </td>
                                            <td style={{ padding: '8px 8px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                    <code className="mono" style={{
                                                        fontSize: 11, color: 'var(--text-secondary)',
                                                        background: 'rgba(0,0,0,0.2)', padding: '2px 6px',
                                                        borderRadius: 4,
                                                    }}>
                                                        {showSecrets[row.app_id]
                                                            ? row.secret_string
                                                            : maskSecret(row.secret_string)}
                                                    </code>
                                                    <button
                                                        onClick={() => setShowSecrets(prev => ({
                                                            ...prev,
                                                            [row.app_id]: !prev[row.app_id],
                                                        }))}
                                                        style={{
                                                            background: 'transparent', border: 'none',
                                                            cursor: 'pointer', color: 'var(--text-muted)',
                                                            padding: 2,
                                                        }}
                                                    >
                                                        {showSecrets[row.app_id]
                                                            ? <EyeOff size={12} />
                                                            : <Eye size={12} />}
                                                    </button>
                                                </div>
                                            </td>
                                            <td style={{ padding: '8px 8px', textAlign: 'right' }}>
                                                <button
                                                    onClick={() => handleDeleteRow(row.app_id, row.app_name)}
                                                    style={{
                                                        background: 'transparent', border: 'none',
                                                        cursor: 'pointer', color: 'var(--accent-red)',
                                                        padding: 4, borderRadius: 4,
                                                        transition: 'background 0.2s',
                                                    }}
                                                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,59,92,0.1)'}
                                                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                                    title="Delete"
                                                >
                                                    <Trash2 size={14} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Add new row */}
                            {!showAddForm ? (
                                <button
                                    onClick={() => setShowAddForm(true)}
                                    className="btn-secondary text-xs"
                                    style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}
                                >
                                    <Plus size={14} /> Add New App
                                </button>
                            ) : (
                                <div style={{
                                    marginTop: 12, padding: 12, borderRadius: 8,
                                    background: 'rgba(0,212,255,0.04)',
                                    border: '1px solid rgba(0,212,255,0.15)',
                                }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                                        <input
                                            value={newAppName}
                                            onChange={(e) => setNewAppName(e.target.value)}
                                            placeholder="App name"
                                            style={{ fontSize: 12, padding: '8px 10px' }}
                                        />
                                        <input
                                            value={newSecret}
                                            onChange={(e) => setNewSecret(e.target.value)}
                                            placeholder="Secret string"
                                            className="mono"
                                            style={{ fontSize: 11, padding: '8px 10px' }}
                                        />
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button
                                            onClick={handleAddRow}
                                            disabled={!newAppName.trim() || !newSecret.trim() || addLoading}
                                            className="btn-primary text-xs"
                                            style={{ flex: 1, padding: '8px 12px' }}
                                        >
                                            {addLoading ? 'Adding...' : <><Plus size={12} /> Add</>}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowAddForm(false)
                                                setNewAppName('')
                                                setNewSecret('')
                                            }}
                                            className="btn-secondary text-xs"
                                            style={{ padding: '8px 12px' }}
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Hidden canvas for image processing */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {/* Spin keyframe */}
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
    )
}

// ─────────────────────────────────────────────────────────────────
// Main AdminPanel Component (with Login Gate)
// ─────────────────────────────────────────────────────────────────
export default function AdminPanel() {
    const { isLoggedIn, isLoading, token } = useAdminAuth()

    useQuery({ queryKey: ['health'], queryFn: getHealth })
    const { showToast } = useToast()

    const [thresholds, setThresholds] = useState(() => {
        try { return JSON.parse(localStorage.getItem('admin_thresholds')) || DEFAULT_THRESHOLDS } catch { return DEFAULT_THRESHOLDS }
    })
    const [weights, setWeights] = useState(() => {
        try { return JSON.parse(localStorage.getItem('admin_weights')) || DEFAULT_WEIGHTS } catch { return DEFAULT_WEIGHTS }
    })
    const [rules, setRules] = useState(() => {
        try { return JSON.parse(localStorage.getItem('admin_rules')) || DEFAULT_RULES } catch { return DEFAULT_RULES }
    })
    const [auditLog, setAuditLog] = useState(() => {
        try { return JSON.parse(localStorage.getItem('admin_audit')) || [] } catch { return [] }
    })
    const [confirmModal, setConfirmModal] = useState(null)

    const persist = (key, value) => localStorage.setItem(key, JSON.stringify(value))
    const addAudit = (action) => {
        const entry = { timestamp: new Date().toISOString(), action, admin: 'admin@bank.com' }
        const updated = [entry, ...auditLog.slice(0, 9)]
        setAuditLog(updated)
        persist('admin_audit', updated)
    }

    const saveThresholds = () => {
        setConfirmModal({
            title: 'Confirm Threshold Change',
            body: `REVIEW: ${DEFAULT_THRESHOLDS.review} → ${thresholds.review.toFixed(2)}\nBLOCK: ${DEFAULT_THRESHOLDS.block} → ${thresholds.block.toFixed(2)}`,
            onConfirm: () => {
                persist('admin_thresholds', thresholds)
                addAudit(`Threshold saved (${thresholds.review.toFixed(2)}/${thresholds.block.toFixed(2)})`)
                showToast('Thresholds updated successfully', 'success')
                setConfirmModal(null)
            },
        })
    }

    const saveWeights = () => {
        persist('admin_weights', weights)
        addAudit(`Weights updated (${weights.lgbm}/${weights.graph})`)
        showToast('Weights saved successfully', 'success')
    }

    const toggleRule = (id) => {
        const rule = rules.find((r) => r.id === id)
        const newState = !rule.active
        setConfirmModal({
            title: `${newState ? 'Enable' : 'Disable'} Hard Rule`,
            body: `${rule.label}\n\n${newState ? 'This rule will immediate start blocking matching transactions.' : '⚠ Matched transactions will NO LONGER be blocked automatically.'}`,
            onConfirm: () => {
                const updated = rules.map((r) => r.id === id ? { ...r, active: newState } : r)
                setRules(updated)
                persist('admin_rules', updated)
                addAudit(`Hard rule ${newState ? 'enabled' : 'disabled'} (${rule.label})`)
                showToast(`Rule ${newState ? 'enabled' : 'disabled'}`, newState ? 'success' : 'warning')
                setConfirmModal(null)
            },
        })
    }

    // ── Loading state ──
    if (isLoading) {
        return (
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: '60vh', color: 'var(--text-muted)',
            }}>
                <div style={{
                    width: 24, height: 24, border: '2px solid var(--border)',
                    borderTopColor: 'var(--accent-cyan)', borderRadius: '50%',
                    animation: 'spin 0.6s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
        )
    }

    // ── Login Gate ──
    if (!isLoggedIn) {
        return <AdminLogin />
    }

    // ── Compute impact preview ──
    const blockRate = Math.max(0, 0.73 + (thresholds.block - 0.82) * -5).toFixed(2)
    const reviewRate = Math.max(0, 2.74 + (thresholds.review - 0.45) * -8).toFixed(2)
    const allowRate = (100 - parseFloat(blockRate) - parseFloat(reviewRate)).toFixed(1)

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Warning */}
            <div className="card flex items-center gap-3" style={{ background: 'rgba(255,176,32,0.05)', borderColor: 'rgba(255,176,32,0.2)' }}>
                <AlertTriangle size={20} style={{ color: 'var(--accent-amber)' }} />
                <span className="text-sm" style={{ color: 'var(--accent-amber)' }}>Changes to thresholds affect all live decisions. Adjust carefully and monitor the Live Feed after saving.</span>
            </div>

            {/* Section 1: Thresholds */}
            <div className="card">
                <div className="section-header">Decision Thresholds</div>

                {/* Visual threshold bar */}
                <div className="my-6 relative" style={{ height: 32, borderRadius: 16, background: 'linear-gradient(90deg, #00E5A0 0%, #FFB020 50%, #FF3B5C 100%)', opacity: 0.3 }}>
                    <div className="absolute top-0 bottom-0" style={{ left: `${thresholds.review * 100}%`, width: 2, background: '#FFB020', boxShadow: '0 0 8px #FFB020' }}>
                        <span className="absolute -top-5 -translate-x-1/2 mono text-xs" style={{ color: 'var(--accent-amber)' }}>{thresholds.review.toFixed(2)}</span>
                    </div>
                    <div className="absolute top-0 bottom-0" style={{ left: `${thresholds.block * 100}%`, width: 2, background: '#FF3B5C', boxShadow: '0 0 8px #FF3B5C' }}>
                        <span className="absolute -top-5 -translate-x-1/2 mono text-xs" style={{ color: 'var(--accent-red)' }}>{thresholds.block.toFixed(2)}</span>
                    </div>
                </div>
                <div className="flex justify-between text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
                    <span>0.0 — ALLOW</span>
                    <span>REVIEW</span>
                    <span>BLOCK — 1.0</span>
                </div>

                <div className="grid grid-cols-2 gap-6 mb-4">
                    <div>
                        <label className="text-xs flex justify-between mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <span>REVIEW Threshold</span>
                            <span className="mono" style={{ color: 'var(--accent-amber)' }}>{thresholds.review.toFixed(2)}</span>
                        </label>
                        <input type="range" min="0.1" max={thresholds.block - 0.05} step="0.01" value={thresholds.review}
                            onChange={(e) => setThresholds((p) => ({ ...p, review: parseFloat(e.target.value) }))}
                            className="w-full" style={{ accentColor: '#FFB020' }}
                        />
                    </div>
                    <div>
                        <label className="text-xs flex justify-between mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <span>BLOCK Threshold</span>
                            <span className="mono" style={{ color: 'var(--accent-red)' }}>{thresholds.block.toFixed(2)}</span>
                        </label>
                        <input type="range" min={thresholds.review + 0.05} max="0.99" step="0.01" value={thresholds.block}
                            onChange={(e) => setThresholds((p) => ({ ...p, block: parseFloat(e.target.value) }))}
                            className="w-full" style={{ accentColor: '#FF3B5C' }}
                        />
                    </div>
                </div>

                <div className="p-3 rounded-lg text-xs mb-4" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Impact preview: </span>
                    <span style={{ color: 'var(--accent-red)' }}>Blocked: {blockRate}%</span>
                    <span style={{ color: 'var(--text-muted)' }}> | </span>
                    <span style={{ color: 'var(--accent-amber)' }}>Reviewed: {reviewRate}%</span>
                    <span style={{ color: 'var(--text-muted)' }}> | </span>
                    <span style={{ color: 'var(--accent-green)' }}>Allowed: {allowRate}%</span>
                </div>

                <div className="flex gap-2 justify-end">
                    <button onClick={() => setThresholds(DEFAULT_THRESHOLDS)} className="btn-secondary text-xs"><RotateCcw size={14} /> Reset</button>
                    <button onClick={saveThresholds} className="btn-primary text-xs"><Save size={14} /> Save Thresholds</button>
                </div>
            </div>

            {/* Section 2: Hard Rules */}
            <div className="card">
                <div className="section-header">Hard Block Rules</div>
                <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>These rules trigger BEFORE the model. Matched transactions are immediately blocked.</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left py-2 px-3 font-medium">Rule</th>
                                <th className="text-center py-2 px-3 font-medium">Status</th>
                                <th className="text-right py-2 px-3 font-medium">Triggered</th>
                                <th className="text-right py-2 px-3 font-medium">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rules.map((rule) => (
                                <tr key={rule.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td className="py-2.5 px-3 text-xs">{rule.label}</td>
                                    <td className="py-2.5 px-3 text-center">
                                        <span className="text-xs flex items-center justify-center gap-1" style={{ color: rule.active ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                                            <div style={{ width: 6, height: 6, borderRadius: '50%', background: rule.active ? 'var(--accent-green)' : 'var(--accent-red)' }} />
                                            {rule.active ? 'Active' : 'Disabled'}
                                        </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right mono text-xs">{rule.triggered}</td>
                                    <td className="py-2.5 px-3 text-right">
                                        <button onClick={() => toggleRule(rule.id)} className="btn-secondary text-xs" style={{ padding: '4px 10px' }}>
                                            {rule.active ? <><Lock size={12} /> Disable</> : <><Unlock size={12} /> Enable</>}
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Section 3: Weights */}
            <div className="card">
                <div className="section-header">Model Ensemble Weights</div>
                <div className="grid grid-cols-2 gap-6 mb-4">
                    <div>
                        <label className="text-xs flex justify-between mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <span>LightGBM</span><span className="mono">{weights.lgbm}%</span>
                        </label>
                        <input type="range" min="10" max="90" value={weights.lgbm}
                            onChange={(e) => { const v = parseInt(e.target.value); setWeights({ lgbm: v, graph: 100 - v }) }}
                            className="w-full" style={{ accentColor: 'var(--accent-cyan)' }}
                        />
                    </div>
                    <div>
                        <label className="text-xs flex justify-between mb-2" style={{ color: 'var(--text-secondary)' }}>
                            <span>Graph Risk</span><span className="mono">{weights.graph}%</span>
                        </label>
                        <input type="range" min="10" max="90" value={weights.graph}
                            onChange={(e) => { const v = parseInt(e.target.value); setWeights({ graph: v, lgbm: 100 - v }) }}
                            className="w-full" style={{ accentColor: 'var(--accent-cyan)' }}
                        />
                    </div>
                </div>
                <div className="flex gap-2 justify-end">
                    <button onClick={() => setWeights(DEFAULT_WEIGHTS)} className="btn-secondary text-xs"><RotateCcw size={14} /> Reset 75/25</button>
                    <button onClick={saveWeights} className="btn-primary text-xs"><Save size={14} /> Save Weights</button>
                </div>
            </div>

            {/* Section 4: Audit */}
            <div className="card">
                <div className="section-header">Recent Admin Actions</div>
                {auditLog.length === 0 ? (
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>No actions yet</p>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)' }}>
                                <th className="text-left py-2 px-3 font-medium">Timestamp</th>
                                <th className="text-left py-2 px-3 font-medium">Action</th>
                                <th className="text-left py-2 px-3 font-medium">Admin</th>
                            </tr>
                        </thead>
                        <tbody>
                            {auditLog.map((entry, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                    <td className="py-2 px-3 mono text-xs" style={{ color: 'var(--text-muted)' }}>{new Date(entry.timestamp).toLocaleString()}</td>
                                    <td className="py-2 px-3 text-xs">{entry.action}</td>
                                    <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-secondary)' }}>{entry.admin}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Section 5: Screenshot Verification Manager (NEW) */}
            <ScreenshotVerificationManager token={token} />

            {/* Confirm Modal */}
            {confirmModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
                    <div className="card fade-in" style={{ maxWidth: 460, width: '90%' }}>
                        <div className="flex items-center gap-2 mb-4">
                            <AlertTriangle size={18} style={{ color: 'var(--accent-amber)' }} />
                            <h3 className="font-semibold text-sm">{confirmModal.title}</h3>
                        </div>
                        <pre className="text-xs whitespace-pre-wrap mb-4" style={{ color: 'var(--text-secondary)' }}>{confirmModal.body}</pre>
                        <p className="text-xs mb-6" style={{ color: 'var(--text-muted)' }}>This will affect all future transactions. Monitor the Live Feed after saving.</p>
                        <div className="flex gap-2 justify-end">
                            <button onClick={() => setConfirmModal(null)} className="btn-secondary text-xs">Cancel</button>
                            <button onClick={confirmModal.onConfirm} className="btn-primary text-xs"><Save size={14} /> Confirm & Save</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
