import { useState, useRef, useEffect, useCallback } from 'react'
import { FRAUD_RINGS } from '../api/mockData'
import DecisionBadge from '../components/common/DecisionBadge'
import { Download, Share2 } from 'lucide-react'
import { useToast } from '../components/common/ToastNotification'

const rings = Object.entries(FRAUD_RINGS).map(([id, data]) => ({ id, ...data }))

export default function RingExplorer() {
    const [selectedRing, setSelectedRing] = useState(null)
    const canvasRef = useRef(null)
    const nodesRef = useRef([])
    const edgesRef = useRef([])
    const animRef = useRef(null)
    const dragRef = useRef(null)
    const { showToast } = useToast()

    const initGraph = useCallback(() => {
        const nodes = []
        const nodeMap = {}
        const edges = []

        rings.forEach((ring) => {
            ring.all_members.forEach((m) => {
                if (!nodeMap[m]) {
                    const isController = ring.controller === m
                    nodeMap[m] = {
                        id: m, x: 100 + Math.random() * 600, y: 100 + Math.random() * 400,
                        vx: 0, vy: 0,
                        ring: ring.id, type: ring.type,
                        isController,
                        radius: isController ? 14 : 8,
                        color: isController ? '#FF3B5C' : ring.type === 'hub_spoke' ? '#FFB020' : '#00D4FF',
                    }
                    nodes.push(nodeMap[m])
                }
            })
            ring.all_members.forEach((m, i) => {
                if (ring.controller && m !== ring.controller) {
                    edges.push({ source: nodeMap[ring.controller], target: nodeMap[m] })
                } else if (!ring.controller && i > 0) {
                    edges.push({ source: nodeMap[ring.all_members[i - 1]], target: nodeMap[m] })
                }
            })
        })
        nodesRef.current = nodes
        edgesRef.current = edges
    }, [])

    useEffect(() => { initGraph() }, [initGraph])

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        const W = canvas.width = canvas.parentElement.clientWidth
        const H = canvas.height = canvas.parentElement.clientHeight

        const tick = () => {
            const nodes = nodesRef.current
            const edges = edgesRef.current

            // Spring forces
            edges.forEach((e) => {
                const dx = e.target.x - e.source.x
                const dy = e.target.y - e.source.y
                const dist = Math.sqrt(dx * dx + dy * dy) || 1
                const force = (dist - 60) * 0.005
                const fx = (dx / dist) * force
                const fy = (dy / dist) * force
                e.source.vx += fx; e.source.vy += fy
                e.target.vx -= fx; e.target.vy -= fy
            })

            // Repulsion
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[j].x - nodes[i].x
                    const dy = nodes[j].y - nodes[i].y
                    const dist = Math.sqrt(dx * dx + dy * dy) || 1
                    if (dist < 120) {
                        const force = 2 / (dist * dist)
                        const fx = (dx / dist) * force
                        const fy = (dy / dist) * force
                        nodes[i].vx -= fx; nodes[i].vy -= fy
                        nodes[j].vx += fx; nodes[j].vy += fy
                    }
                }
            }

            // Center gravity
            nodes.forEach((n) => {
                n.vx += (W / 2 - n.x) * 0.0002
                n.vy += (H / 2 - n.y) * 0.0002
                n.vx *= 0.9; n.vy *= 0.9
                if (!n.dragging) { n.x += n.vx; n.y += n.vy }
                n.x = Math.max(20, Math.min(W - 20, n.x))
                n.y = Math.max(20, Math.min(H - 20, n.y))
            })

            // Draw
            ctx.fillStyle = '#0A0E1A'
            ctx.fillRect(0, 0, W, H)

            edges.forEach((e) => {
                const dimmed = selectedRing && e.source.ring !== selectedRing && e.target.ring !== selectedRing
                ctx.strokeStyle = dimmed ? 'rgba(30,45,74,0.2)' : '#1E2D4A'
                ctx.lineWidth = 1
                ctx.beginPath()
                ctx.moveTo(e.source.x, e.source.y)
                ctx.lineTo(e.target.x, e.target.y)
                ctx.stroke()
            })

            nodes.forEach((n) => {
                const dimmed = selectedRing && n.ring !== selectedRing
                const alpha = dimmed ? 0.2 : 1
                ctx.globalAlpha = alpha

                if (!dimmed && selectedRing === n.ring) {
                    ctx.beginPath()
                    ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI * 2)
                    ctx.fillStyle = n.color + '30'
                    ctx.fill()
                }

                ctx.beginPath()
                ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2)
                ctx.fillStyle = n.color
                ctx.fill()
                ctx.globalAlpha = 1
            })

            animRef.current = requestAnimationFrame(tick)
        }
        tick()
        return () => cancelAnimationFrame(animRef.current)
    }, [selectedRing])

    const handleMouseDown = (e) => {
        const rect = canvasRef.current.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        const node = nodesRef.current.find((n) => Math.hypot(n.x - mx, n.y - my) < n.radius + 4)
        if (node) { node.dragging = true; dragRef.current = node }
    }

    const handleMouseMove = (e) => {
        if (!dragRef.current) return
        const rect = canvasRef.current.getBoundingClientRect()
        dragRef.current.x = e.clientX - rect.left
        dragRef.current.y = e.clientY - rect.top
    }

    const handleMouseUp = () => {
        if (dragRef.current) { dragRef.current.dragging = false; dragRef.current = null }
    }

    const selectedRingData = selectedRing ? rings.find((r) => r.id === selectedRing) : null

    const exportCSV = () => {
        if (!selectedRingData) return
        const csv = 'User ID,Role,Ring ID\n' + selectedRingData.all_members.map((m) => `${m},${m === selectedRingData.controller ? 'Controller' : 'Member'},${selectedRing}`).join('\n')
        const blob = new Blob([csv], { type: 'text/csv' })
        const a = document.createElement('a')
        a.href = URL.createObjectURL(blob); a.download = `${selectedRing}_members.csv`; a.click()
        showToast('Ring members exported', 'success')
    }

    return (
        <div className="grid gap-4 h-full" style={{ gridTemplateColumns: selectedRingData ? '260px 1fr 280px' : '260px 1fr', minHeight: 'calc(100vh - 130px)' }}>
            {/* Ring List */}
            <div className="card overflow-y-auto" style={{ maxHeight: 'calc(100vh - 130px)' }}>
                <div className="section-header">Fraud Rings ({rings.length})</div>
                <div className="space-y-1">
                    {rings.map((r) => (
                        <div
                            key={r.id}
                            onClick={() => setSelectedRing(selectedRing === r.id ? null : r.id)}
                            className="p-3 rounded-lg cursor-pointer transition-all"
                            style={{
                                background: selectedRing === r.id ? 'rgba(0,212,255,0.08)' : 'transparent',
                                border: `1px solid ${selectedRing === r.id ? 'var(--accent-cyan)' : 'transparent'}`,
                            }}
                        >
                            <div className="mono text-xs font-medium">{r.id}</div>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-xs px-1.5 py-0.5 rounded" style={{
                                    background: r.type === 'hub_spoke' ? 'rgba(255,176,32,0.15)' : 'rgba(0,212,255,0.15)',
                                    color: r.type === 'hub_spoke' ? '#FFB020' : '#00D4FF',
                                }}>{r.type === 'hub_spoke' ? 'MULE' : 'COLLUSIVE'}</span>
                                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{r.all_members.length} members</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Graph Canvas */}
            <div className="card relative" style={{ padding: 0, overflow: 'hidden' }}>
                <canvas ref={canvasRef} onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp} className="w-full h-full cursor-grab active:cursor-grabbing" />
                <div className="absolute top-4 left-4 flex gap-3 text-xs">
                    {[['Controller', '#FF3B5C'], ['Mule', '#FFB020'], ['Collusive', '#00D4FF']].map(([label, color]) => (
                        <div key={label} className="flex items-center gap-1.5">
                            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color }} />
                            <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Ring Details */}
            {selectedRingData && (
                <div className="card overflow-y-auto slide-in-right" style={{ maxHeight: 'calc(100vh - 130px)' }}>
                    <div className="mono text-sm font-bold mb-3">{selectedRing}</div>
                    <div className="space-y-2 mb-4">
                        <div className="flex justify-between text-xs">
                            <span style={{ color: 'var(--text-secondary)' }}>Type</span>
                            <span className="capitalize">{selectedRingData.type.replace('_', '-')}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span style={{ color: 'var(--text-secondary)' }}>Members</span>
                            <span>{selectedRingData.all_members.length}</span>
                        </div>
                        {selectedRingData.controller && (
                            <div className="flex justify-between text-xs">
                                <span style={{ color: 'var(--text-secondary)' }}>Controller</span>
                                <span className="mono" style={{ color: 'var(--accent-red)' }}>{selectedRingData.controller}</span>
                            </div>
                        )}
                    </div>

                    <div className="section-header">Members</div>
                    {(() => {
                        // Pre-compute deterministic risk scores based on member ID
                        const memberRisks = selectedRingData.all_members.map((m) => {
                            const isCtrl = m === selectedRingData.controller
                            // Use a hash-like score from the member ID for determinism
                            const hash = m.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
                            const risk = isCtrl ? 0.92 : 0.4 + (hash % 35) / 100
                            return { m, isCtrl, risk }
                        })
                        return memberRisks.map(({ m, isCtrl, risk }) => (
                            <div key={m} className="flex items-center gap-2 p-2 rounded" style={{ background: 'var(--bg-elevated)' }}>
                                {isCtrl && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,59,92,0.15)', color: '#FF3B5C', fontSize: 9 }}>CTRL</span>}
                                <span className="mono text-xs flex-1">{m}</span>
                                <div style={{ width: 50 }}>
                                    <div className="rounded-full overflow-hidden" style={{ height: 4, background: 'rgba(255,255,255,0.06)' }}>
                                        <div className="rounded-full" style={{ width: `${risk * 100}%`, height: '100%', background: risk > 0.7 ? '#FF3B5C' : '#FFB020' }} />
                                    </div>
                                </div>
                                <span className="mono text-xs" style={{ color: 'var(--text-muted)', width: 28 }}>{risk.toFixed(2)}</span>
                            </div>
                        ))
                    })()}

                    <button onClick={exportCSV} className="btn-secondary text-xs w-full mt-4"><Download size={14} /> Export Ring Members</button>
                </div>
            )}
        </div>
    )
}
