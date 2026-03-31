const fraudTypes = ['vishing', 'account_takeover', 'social_engineering', 'qr_scam', 'fake_app', 'money_mule']
const hardRules = ['sender_is_known_controller', 'intra_ring_transfer', 'receiver_is_fake_merchant', 'extreme_amount_ratio']
const txnTypes = ['P2P', 'P2M', 'BILL', 'RECHARGE']
const trustFactors = ['verified_merchant', 'repeat_beneficiary', 'normal_amount', 'normal_hour', 'scan_history']
const fraudIndicators = ['name_mismatch_critical', 'name_mismatch_high', 'unverified_reports_few', 'confirmed_fraud_single', 'phishing_pattern', 'amount_anomaly']

export const generateMockTransaction = () => {
    const rand = Math.random()
    const isFraud = rand < 0.05  // ~5% fraud rate

    // Internal risk score (0-100)
    const internalRiskScore = isFraud
        ? 50 + Math.random() * 50  // 50-100
        : Math.random() * 49       // 0-49

    // Binary classification based on threshold 50
    const classification = internalRiskScore >= 50 ? 'FRAUD' : 'NO_FRAUD'

    // Legacy decision mapping
    const decision = internalRiskScore >= 80 ? 'BLOCK' : internalRiskScore >= 50 ? 'REVIEW' : 'ALLOW'

    // Status
    const status = internalRiskScore >= 65 ? 'BLOCKED' : internalRiskScore >= 50 ? 'WARNING' : 'ALLOWED'

    // Legacy 0-1 fraud score
    const fraudScore = parseFloat((internalRiskScore / 100).toFixed(4))

    // Penalties and reductions
    const penalties = {}
    const reductions = {}
    const indicators = []
    const trustInds = []

    if (isFraud) {
        const numPenalties = 1 + Math.floor(Math.random() * 2)
        for (let i = 0; i < numPenalties; i++) {
            const ind = fraudIndicators[Math.floor(Math.random() * fraudIndicators.length)]
            penalties[ind] = 10 + Math.floor(Math.random() * 40)
            indicators.push(ind)
        }
    } else {
        const numReductions = 1 + Math.floor(Math.random() * 3)
        for (let i = 0; i < numReductions; i++) {
            const trust = trustFactors[Math.floor(Math.random() * trustFactors.length)]
            reductions[trust] = -(3 + Math.floor(Math.random() * 12))
            trustInds.push(trust)
        }
    }

    return {
        transaction_id: `TXN${String(Math.floor(Math.random() * 99999999)).padStart(8, '0')}`,
        classification,
        decision,
        status,
        fraud_score: fraudScore,
        internal_risk_score: parseFloat(internalRiskScore.toFixed(2)),
        lgbm_score: parseFloat((fraudScore * (0.9 + Math.random() * 0.1)).toFixed(4)),
        graph_risk_score: parseFloat((fraudScore * (0.7 + Math.random() * 0.3)).toFixed(4)),
        base_score: parseFloat((internalRiskScore * 0.6).toFixed(2)),
        penalty_total: Object.values(penalties).reduce((a, b) => a + b, 0),
        reduction_total: Object.values(reductions).reduce((a, b) => a + b, 0),
        applied_penalties: Object.keys(penalties).length > 0 ? penalties : null,
        applied_reductions: Object.keys(reductions).length > 0 ? reductions : null,
        fraud_indicators: indicators.length > 0 ? indicators : null,
        trust_indicators: trustInds.length > 0 ? trustInds : null,
        reason: isFraud && internalRiskScore >= 80 ? hardRules[Math.floor(Math.random() * hardRules.length)] : null,
        latency_ms: parseFloat((3 + Math.random() * 20).toFixed(1)),
        timestamp: new Date().toISOString(),
        sender_user_id: `USR${String(Math.floor(Math.random() * 49999)).padStart(6, '0')}`,
        receiver_id: `USR${String(Math.floor(Math.random() * 49999)).padStart(6, '0')}`,
        amount: Math.floor(Math.exp(Math.random() * 8 + 3)),
        transaction_type: txnTypes[Math.floor(Math.random() * txnTypes.length)],
        fraud_type: isFraud ? fraudTypes[Math.floor(Math.random() * fraudTypes.length)] : null,
    }
}

export const generateMockHealth = () => ({
    status: 'healthy',
    model_loaded: true,
    n_features: 52,
    block_threshold: 0.000151,
    review_threshold: 0.000075,
    n_ring_members: 154,
    n_ring_controllers: 15,
    n_graph_risk_entries: 55100,
    uptime_seconds: 3600 + Math.floor(Math.random() * 7200),
})

export const generateMockStats = () => {
    const total = 12453 + Math.floor(Math.random() * 100)
    const fraud = 91 + Math.floor(Math.random() * 5)
    const noFraud = total - fraud
    return {
        total_scored: total,
        total_blocked: Math.floor(fraud * 0.8),
        total_reviewed: Math.floor(fraud * 0.2),
        total_allowed: noFraud,
        total_fraud: fraud,
        total_no_fraud: noFraud,
        fraud_rate: parseFloat((fraud / total).toFixed(4)),
        block_rate: parseFloat((Math.floor(fraud * 0.8) / total).toFixed(4)),
        review_rate: parseFloat((Math.floor(fraud * 0.2) / total).toFixed(4)),
        uptime_seconds: 3600 + Math.floor(Math.random() * 7200),
    }
}

// Stable mock counter — only increments, never jumps down
let _mockBaseTotal = 49500 + Math.floor(Math.random() * 500)
let _mockBaseFraud = Math.floor(_mockBaseTotal * 0.015)

export const generateMockDashboardStats = () => {
    // Simulate slow growth each poll
    _mockBaseTotal += Math.floor(Math.random() * 5)
    _mockBaseFraud += Math.random() < 0.15 ? 1 : 0
    const noFraud = _mockBaseTotal - _mockBaseFraud
    const activeMonitoring = Math.floor(_mockBaseFraud * 0.35) + 12
    return {
        time_window: 'ALL_TIME',
        total_transactions: _mockBaseTotal,
        no_fraud_count: noFraud,
        fraud_count: _mockBaseFraud,
        fraud_rate: parseFloat((_mockBaseFraud / _mockBaseTotal).toFixed(4)),
        average_risk_score: parseFloat((18 + Math.random() * 4).toFixed(2)),
        total_amount: Math.floor(_mockBaseTotal * 1200),
        blocked_amount: Math.floor(_mockBaseFraud * 5000),
        top_fraud_indicators: [['name_mismatch_critical', 12], ['unverified_reports_few', 8], ['phishing_pattern', 5]],
        unique_senders: Math.floor(_mockBaseTotal * 0.85),
        unique_receivers: Math.floor(_mockBaseTotal * 0.6),
        active_monitoring: activeMonitoring,
    }
}

export const generateMockHourlyTrend = () => {
    const hours = []
    for (let i = 23; i >= 0; i--) {
        const date = new Date()
        date.setHours(date.getHours() - i)
        const total = 50 + Math.floor(Math.random() * 100)
        const fraud = Math.floor(total * (0.02 + Math.random() * 0.05))
        hours.push({
            hour: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            total,
            fraud,
            no_fraud: total - fraud,
        })
    }
    return hours
}

export const generateDailyAnalytics = () => {
    const days = []
    for (let i = 29; i >= 0; i--) {
        const date = new Date()
        date.setDate(date.getDate() - i)
        const total = 400 + Math.floor(Math.random() * 200)
        const fraud = Math.floor(total * (0.03 + Math.random() * 0.04))
        const noFraud = total - fraud
        days.push({
            date: date.toISOString().split('T')[0],
            total, fraud, no_fraud: noFraud,
            fraud_rate: parseFloat(((fraud / total) * 100).toFixed(2)),
            // Legacy fields
            blocked: Math.floor(fraud * 0.8),
            reviewed: Math.floor(fraud * 0.2),
            allowed: noFraud,
        })
    }
    return days
}

export const generateHourlyData = () => {
    const hours = []
    for (let i = 23; i >= 0; i--) {
        const date = new Date()
        date.setHours(date.getHours() - i)
        const total = 50 + Math.floor(Math.random() * 100)
        const fraud = Math.floor(total * (0.02 + Math.random() * 0.05))
        hours.push({
            hour: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            fraud,
            no_fraud: total - fraud,
            // Legacy fields for backward compat
            blocked: fraud,
            reviewed: 0,
            allowed: total - fraud,
            p50: 5 + Math.random() * 10,
            p95: 20 + Math.random() * 20,
            p99: 35 + Math.random() * 15,
        })
    }
    return hours
}

export const FRAUD_RINGS = {
    MULE_RING_01: { type: 'hub_spoke', controller: 'USR005112', all_members: ['USR005112', 'USR033087', 'USR000024', 'USR018294'] },
    MULE_RING_02: { type: 'hub_spoke', controller: 'USR043189', all_members: ['USR043189', 'USR006851', 'USR010399', 'USR027643', 'USR031094', 'USR008823', 'USR015672', 'USR039145', 'USR044802', 'USR002356', 'USR020918'] },
    MULE_RING_03: { type: 'hub_spoke', controller: 'USR041919', all_members: ['USR041919', 'USR017435', 'USR028106', 'USR003891', 'USR046520', 'USR012783'] },
    MULE_RING_04: { type: 'hub_spoke', controller: 'USR048788', all_members: ['USR048788', 'USR009234', 'USR025617', 'USR037841', 'USR004562', 'USR019873', 'USR042156', 'USR011498', 'USR033627', 'USR007389'] },
    MULE_RING_05: { type: 'hub_spoke', controller: 'USR029826', all_members: ['USR029826', 'USR014573', 'USR038291', 'USR001847', 'USR046138', 'USR023764', 'USR035492'] },
    MULE_RING_06: { type: 'hub_spoke', controller: 'USR016147', all_members: ['USR016147', 'USR041823', 'USR007562', 'USR028934', 'USR003718', 'USR019245', 'USR044678', 'USR012391', 'USR036854', 'USR025167'] },
    MULE_RING_07: { type: 'hub_spoke', controller: 'USR040569', all_members: ['USR040569', 'USR008917', 'USR023456', 'USR031782', 'USR015348', 'USR047291'] },
    MULE_RING_08: { type: 'hub_spoke', controller: 'USR049681', all_members: ['USR049681', 'USR006234', 'USR018567', 'USR034891', 'USR011723', 'USR042578', 'USR027145'] },
    MULE_RING_09: { type: 'hub_spoke', controller: 'USR041367', all_members: ['USR041367', 'USR003489', 'USR016723', 'USR029845', 'USR037162', 'USR008534', 'USR021678', 'USR044913', 'USR012356', 'USR035789', 'USR026412', 'USR048237'] },
    MULE_RING_10: { type: 'hub_spoke', controller: 'USR006351', all_members: ['USR006351', 'USR019587', 'USR032814', 'USR045123', 'USR014678', 'USR027934', 'USR038561'] },
    MULE_RING_11: { type: 'hub_spoke', controller: 'USR004525', all_members: ['USR004525', 'USR017893', 'USR031256', 'USR043578', 'USR009812', 'USR024367', 'USR036741'] },
    MULE_RING_12: { type: 'hub_spoke', controller: 'USR026415', all_members: ['USR026415', 'USR011789', 'USR039234', 'USR003467', 'USR047812', 'USR021345'] },
    MULE_RING_13: { type: 'hub_spoke', controller: 'USR028891', all_members: ['USR028891', 'USR005678', 'USR018923', 'USR032456', 'USR044789', 'USR013234', 'USR037567', 'USR001891', 'USR046234'] },
    MULE_RING_14: { type: 'hub_spoke', controller: 'USR006701', all_members: ['USR006701', 'USR021234', 'USR034567', 'USR047891', 'USR015234', 'USR028567', 'USR041891'] },
    MULE_RING_15: { type: 'hub_spoke', controller: 'USR043557', all_members: ['USR043557', 'USR009891', 'USR022234', 'USR035567', 'USR048891'] },
    COLL_RING_01: { type: 'collusive', controller: null, members: ['USR002345', 'USR015678', 'USR028912', 'USR041234', 'USR007567', 'USR034891'], all_members: ['USR002345', 'USR015678', 'USR028912', 'USR041234', 'USR007567', 'USR034891'] },
    COLL_RING_02: { type: 'collusive', controller: null, members: ['USR010234', 'USR023567', 'USR036891', 'USR049234', 'USR012567'], all_members: ['USR010234', 'USR023567', 'USR036891', 'USR049234', 'USR012567'] },
    COLL_RING_03: { type: 'collusive', controller: null, members: ['USR004789', 'USR018123', 'USR031456'], all_members: ['USR004789', 'USR018123', 'USR031456'] },
    COLL_RING_04: { type: 'collusive', controller: null, members: ['USR008123', 'USR021456', 'USR034789', 'USR048123', 'USR014456', 'USR027789'], all_members: ['USR008123', 'USR021456', 'USR034789', 'USR048123', 'USR014456', 'USR027789'] },
    COLL_RING_05: { type: 'collusive', controller: null, members: ['USR006456', 'USR019789', 'USR033123', 'USR046456', 'USR012789', 'USR026123'], all_members: ['USR006456', 'USR019789', 'USR033123', 'USR046456', 'USR012789', 'USR026123'] },
    COLL_RING_06: { type: 'collusive', controller: null, members: ['USR011234', 'USR024567', 'USR037891'], all_members: ['USR011234', 'USR024567', 'USR037891'] },
    COLL_RING_07: { type: 'collusive', controller: null, members: ['USR003567', 'USR016891', 'USR030234', 'USR043567', 'USR009891', 'USR023234', 'USR036567'], all_members: ['USR003567', 'USR016891', 'USR030234', 'USR043567', 'USR009891', 'USR023234', 'USR036567'] },
    COLL_RING_08: { type: 'collusive', controller: null, members: ['USR007891', 'USR021234', 'USR034567', 'USR047891'], all_members: ['USR007891', 'USR021234', 'USR034567', 'USR047891'] },
}

export const TEST_CASES = {
    ringController: {
        transaction_id: 'TXN_RING_001',
        sender_user_id: 'USR005112',
        receiver_id: 'USR033087',
        amount: 85000,
        transaction_type: 'P2P',
        sender_age: 32,
        sender_account_age_days: 15,
        sender_kyc_level: 'basic',
        sender_income_tier: 'low',
        sender_avg_txn_amount: 500,
        sender_preferred_hour: 14,
        sender_hour_std: 3,
        sender_vulnerability_score: 0.8,
        sender_avg_typing_speed_ms: 350,
        sender_avg_session_duration_s: 20,
        sender_avg_touch_pressure: 0.3,
        sender_typical_swipe_velocity: 600,
        receiver_is_merchant: 0,
        receiver_is_fake_merchant: 0,
        receiver_is_verified_merchant: 0,
    },
    vishingAttack: {
        transaction_id: 'TXN_VISH_001',
        sender_user_id: 'USR024789',
        receiver_id: 'USR048123',
        amount: 45000,
        transaction_type: 'P2P',
        sender_age: 65,
        sender_account_age_days: 730,
        sender_kyc_level: 'full',
        sender_income_tier: 'middle',
        sender_avg_txn_amount: 800,
        sender_preferred_hour: 10,
        sender_hour_std: 2,
        sender_vulnerability_score: 0.9,
        sender_avg_typing_speed_ms: 500,
        sender_avg_session_duration_s: 15,
        sender_avg_touch_pressure: 0.2,
        sender_typical_swipe_velocity: 250,
        receiver_is_merchant: 0,
        receiver_is_fake_merchant: 0,
        receiver_is_verified_merchant: 0,
    },
    normalTxn: {
        transaction_id: 'TXN_NORM_001',
        sender_user_id: 'USR000001',
        receiver_id: 'MER00001',
        amount: 450,
        transaction_type: 'P2M',
        sender_age: 28,
        sender_account_age_days: 730,
        sender_kyc_level: 'full',
        sender_income_tier: 'middle',
        sender_avg_txn_amount: 500,
        sender_preferred_hour: 14,
        sender_hour_std: 4,
        sender_vulnerability_score: 0.2,
        sender_avg_typing_speed_ms: 280,
        sender_avg_session_duration_s: 45,
        sender_avg_touch_pressure: 0.45,
        sender_typical_swipe_velocity: 450,
        receiver_is_merchant: 1,
        receiver_is_fake_merchant: 0,
        receiver_is_verified_merchant: 1,
    },
}
