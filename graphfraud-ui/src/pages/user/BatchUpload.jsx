import { useState, useRef } from 'react'
import { scoreBatch } from '../../api/fraudApi'
import { generateTextReport, getRiskUiConfig } from '../../utils/fraudAnalysis'

function parseCSV(text) {
    const lines = text.trim().split('\n')
    if (lines.length < 2) return []
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

    return lines.slice(1).map(line => {
        const vals = line.split(',').map(v => v.trim())
        const row = {}
        headers.forEach((h, i) => { row[h] = vals[i] || '' })
        return row
    }).filter(r => r.upi_id || r.txn_id || r.transaction_id || r.sender_user_id)
}

function csvRowToTransaction(row, index) {
    return {
        transaction_id: row.txn_id || row.transaction_id || `BATCH_${Date.now().toString(16)}_${index}`,
        sender_user_id: row.sender_user_id || row.upi_id || row.sender || 'BATCH_USER',
        receiver_id: row.receiver_id || row.receiver || 'BATCH_TARGET',
        amount: parseFloat(row.amount) || 1000,
        transaction_type: row.transaction_type || row.type || 'P2P',
        timestamp: row.timestamp || new Date().toISOString().slice(0, 16),
        sender_account_age_days: parseFloat(row.account_age) || 365,
        sender_kyc_level: row.kyc_level || 'full',
        sender_income_tier: row.income_tier || 'middle',
        sender_avg_txn_amount: parseFloat(row.avg_txn_amount) || 500,
    }
}

export default function BatchUpload() {
    const [file, setFile] = useState(null)
    const [rows, setRows] = useState([])
    const [results, setResults] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const fileRef = useRef(null)

    const handleFile = (f) => {
        if (!f) return
        setFile(f)
        setResults(null)
        setError(null)
        const reader = new FileReader()
        reader.onload = () => {
            try {
                const parsed = parseCSV(reader.result)
                if (parsed.length === 0) {
                    setError('No valid rows found. Ensure CSV has headers: upi_id or txn_id')
                    return
                }
                if (parsed.length > 500) {
                    setError('Maximum 500 rows allowed')
                    return
                }
                setRows(parsed)
            } catch (err) {
                setError('Failed to parse CSV: ' + err.message)
            }
        }
        reader.readAsText(f)
    }

    const handleDrop = (e) => {
        e.preventDefault()
        const f = e.dataTransfer.files[0]
        if (f && f.name.endsWith('.csv')) handleFile(f)
    }

    const processAll = async () => {
        if (rows.length === 0) return
        setLoading(true)
        setError(null)
        try {
            const transactions = rows.map((r, i) => csvRowToTransaction(r, i))
            const res = await scoreBatch(transactions)
            setResults(res)
        } catch (err) {
            setError('Batch scoring failed: ' + err.message)
        }
        setLoading(false)
    }

    const downloadCSV = () => {
        if (!results?.results) return
        let csv = 'Transaction ID,Sender,Receiver,Amount,Decision,Score,Reason\n'
        results.results.forEach(r => {
            const isFraud = r.classification === 'FRAUD' || r.decision === 'BLOCK'
            csv += `${r.transaction_id},${r.sender_user_id || ''},${r.receiver_id || ''},${r.amount || ''},${r.decision || (isFraud ? 'BLOCK' : 'ALLOW')},${(r.fraud_probability || r.internal_risk_score || 0).toFixed(4)},${r.reason || ''}\n`
        })
        const blob = new Blob([csv], { type: 'text/csv' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `batch_results_${Date.now()}.csv`
        a.click()
    }

    const downloadTextReport = () => {
        if (!results?.results) return
        // Convert batch results to the format expected by generateTextReport
        const formatted = results.results.map(r => {
            const isFraud = r.classification === 'FRAUD' || r.decision === 'BLOCK'
            const score = ((r.fraud_probability || r.internal_risk_score || 0) * 100)
            return {
                item: r.transaction_id || r.sender_user_id || '—',
                type: 'Transaction',
                riskScore: score,
                signals: [
                    ...(r.fraud_indicators || []).map(f => ({ level: 'danger', text: f.replace(/_/g, ' ') })),
                    ...(r.trust_indicators || []).map(f => ({ level: 'safe', text: f.replace(/_/g, ' ') })),
                    ...(r.reason ? [{ level: isFraud ? 'danger' : 'info', text: r.reason }] : []),
                ],
            }
        })
        const text = generateTextReport(formatted)
        const blob = new Blob([text], { type: 'text/plain' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob)
        a.download = `batch_report_${Date.now()}.txt`
        a.click()
    }

    const batchStats = results?.results ? {
        total: results.results.length,
        blocked: results.results.filter(r => r.classification === 'FRAUD' || r.decision === 'BLOCK').length,
        reviewed: results.results.filter(r => r.decision === 'REVIEW').length,
        allowed: results.results.filter(r => r.classification !== 'FRAUD' && r.decision !== 'BLOCK' && r.decision !== 'REVIEW').length,
    } : null

    return (
        <>
            <div className="vh">
                <div className="vh-eyebrow">End User · Bulk Verification</div>
                <div className="vh-title">Batch Upload</div>
                <div className="vh-row"><div className="vh-sub">Upload a CSV for bulk risk screening. {rows.length > 0 ? `${rows.length} rows loaded.` : ''} {batchStats ? `${batchStats.total} scored.` : ''}</div></div>
            </div>
            <div className="portal-body">
                <div className="portal-card" style={{ width: results ? 700 : 540 }}>
                    <div className="portal-card-header">
                        <div className="portal-card-title">Bulk Risk Screening</div>
                        <div className="portal-card-desc">Upload a CSV with headers like upi_id, txn_id, sender_user_id, receiver_id, amount. Max 500 rows.</div>
                    </div>
                    <div className="portal-card-body">
                        {!results && (
                            <>
                                <div
                                    className="uzone"
                                    onDragOver={e => e.preventDefault()}
                                    onDrop={handleDrop}
                                    onClick={() => fileRef.current?.click()}
                                >
                                    <div className="uzone-icon">↑</div>
                                    {file ? (
                                        <>{file.name} · {rows.length} rows parsed</>
                                    ) : (
                                        <>Drop your CSV file here<br /><span style={{ fontSize: 11, color: 'var(--text3)' }}>Or click to browse</span></>
                                    )}
                                </div>
                                <input
                                    ref={fileRef}
                                    type="file"
                                    accept=".csv"
                                    style={{ display: 'none' }}
                                    onChange={e => handleFile(e.target.files[0])}
                                />
                                <button
                                    className="p-btn p-btn-full"
                                    onClick={processAll}
                                    disabled={rows.length === 0 || loading}
                                    style={{ opacity: rows.length === 0 ? 0.5 : 1 }}
                                >
                                    {loading ? `Scoring ${rows.length} transactions...` : `Score ${rows.length} Transactions`}
                                </button>
                            </>
                        )}

                        {error && (
                            <div style={{ marginTop: 12 }} className="result-danger">
                                <div className="result-icon" style={{ background: '#e8525215', border: '1px solid #e8525230', color: 'var(--danger)' }}>✕</div>
                                <div><div className="result-title" style={{ color: 'var(--danger)' }}>Error</div><div className="result-sub" style={{ color: 'var(--text3)' }}>{error}</div></div>
                            </div>
                        )}

                        {results?.results && (
                            <div>
                                {/* Summary */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
                                    {[
                                        ['Total', batchStats.total, 'var(--text)'],
                                        ['Blocked', batchStats.blocked, 'var(--danger)'],
                                        ['Review', batchStats.reviewed, 'var(--warn)'],
                                        ['Allowed', batchStats.allowed, 'var(--safe)'],
                                    ].map(([label, count, color]) => (
                                        <div key={label} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                                            <div style={{ fontFamily: 'var(--fd)', fontSize: 22, color }}>{count}</div>
                                            <div style={{ fontFamily: 'var(--fm)', fontSize: 8, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--text3)', marginTop: 2 }}>{label}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Results table */}
                                <div style={{ maxHeight: 300, overflowY: 'auto' }}>
                                    <div className="batch-table">
                                        <div className="bt-head"><span>ID / UPI</span><span>Score</span><span>Decision</span><span>Flag</span></div>
                                        {results.results.map((r, i) => {
                                            const isFraud = r.classification === 'FRAUD' || r.decision === 'BLOCK'
                                            const isReview = r.decision === 'REVIEW'
                                            const score = r.fraud_probability || r.internal_risk_score || 0
                                            return (
                                                <div key={i} className="bt-row">
                                                    <span style={{ color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {r.sender_user_id || r.transaction_id || '—'}
                                                    </span>
                                                    <span style={{ color: isFraud ? 'var(--danger)' : isReview ? 'var(--warn)' : 'var(--safe)' }}>
                                                        {score.toFixed(2)}
                                                    </span>
                                                    <span>
                                                        <span className={`db ${isFraud ? 'block' : isReview ? 'rv' : 'allow'}`} style={{ fontSize: 8 }}>
                                                            {r.decision || (isFraud ? 'Block' : 'Allow')}
                                                        </span>
                                                    </span>
                                                    <span style={{ color: isFraud ? 'var(--danger)' : 'var(--text3)', fontSize: 9 }}>
                                                        {r.reason || '—'}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                                    <button className="p-btn" onClick={downloadCSV} style={{ flex: 1 }}>📊 Download CSV</button>
                                    <button className="p-btn" onClick={downloadTextReport} style={{ flex: 1 }}>📄 Download Report</button>
                                    <button className="p-btn" onClick={() => { setResults(null); setRows([]); setFile(null); setError(null) }}
                                        style={{ background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border2)' }}>
                                        New Batch
                                    </button>
                                </div>

                                {results.total_latency_ms && (
                                    <div style={{ fontFamily: 'var(--fm)', fontSize: 9, color: 'var(--text3)', textAlign: 'center', marginTop: 8 }}>
                                        Scored in {results.total_latency_ms.toFixed(1)}ms
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                    <div className="p-footer">CSV files are parsed locally · Transactions are scored via the fraud model API</div>
                </div>
            </div>
        </>
    )
}
