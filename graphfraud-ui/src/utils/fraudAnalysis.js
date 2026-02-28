/**
 * Client-side fraud analysis utilities for QR codes, links, and UPI IDs.
 * All checks run entirely in the browser — no backend calls needed.
 */
import { FRAUD_RINGS } from '../api/mockData'

/* ── Bank handle registry ── */
const VERIFIED_HANDLES = {
    oksbi: 'State Bank of India',
    okhdfcbank: 'HDFC Bank',
    okaxis: 'Axis Bank',
    okicici: 'ICICI Bank',
    ybl: 'Yes Bank (PhonePe)',
    paytm: 'Paytm Payments Bank',
    upi: 'BHIM UPI',
    apl: 'Amazon Pay',
    ibl: 'IndusInd Bank',
    axl: 'Axis Bank (Lite)',
    waaxis: 'WhatsApp Pay (Axis)',
    wahdfcbank: 'WhatsApp Pay (HDFC)',
    jupiteraxis: 'Jupiter (Axis Bank)',
    fam: 'FamPay',
    navifinserv: 'Navi',
    ikwik: 'iKwik',
    aubank: 'AU Small Finance Bank',
    kotak: 'Kotak Mahindra Bank',
    pockets: 'ICICI Pockets',
    dbs: 'DBS Bank',
    ratp: 'RatnakarBank',
}

/* ── Known-fraud UPI ID stubs (derived from fraud ring user IDs) ── */
const KNOWN_RING_UPI_MAP = {
    USR005112: 'controller5112@ybl',
    USR033087: 'mule33087@ybl',
    USR043189: 'controller43189@paytm',
    USR041919: 'controller41919@ybl',
    USR048788: 'controller48788@oksbi',
}

const getRingMemberUPIIds = () => {
    const ids = []
    Object.values(FRAUD_RINGS).forEach((ring) => {
        ring.all_members.forEach((m) => {
            ids.push(m.toLowerCase())
        })
    })
    return ids
}

/**
 * Check if a UPI ID is associated with a fraud ring.
 */
export const checkRingMembership = (upiId) => {
    const upiLower = upiId.toLowerCase().trim()
    const username = upiLower.split('@')[0]

    for (const [ringId, ring] of Object.entries(FRAUD_RINGS)) {
        for (const member of ring.all_members) {
            const memberLower = member.toLowerCase()
            if (username.includes(memberLower) || upiLower.includes(memberLower)) {
                return {
                    inRing: true,
                    ringId,
                    isController: ring.controller === member,
                }
            }
        }
    }
    // Also check mapped UPI IDs
    for (const [userId, mappedUpi] of Object.entries(KNOWN_RING_UPI_MAP)) {
        if (upiLower === mappedUpi.toLowerCase() || upiLower.includes(userId.toLowerCase())) {
            const ringEntry = Object.entries(FRAUD_RINGS).find(([, r]) =>
                r.all_members.includes(userId)
            )
            if (ringEntry) {
                return {
                    inRing: true,
                    ringId: ringEntry[0],
                    isController: ringEntry[1].controller === userId,
                }
            }
        }
    }
    return { inRing: false, ringId: null, isController: false }
}

/* ═══════════════════════════════════════════════════════════════
   UPI ID ANALYSIS
   ═══════════════════════════════════════════════════════════════ */
export const analyseUPIId = (upiId) => {
    const signals = []
    let riskScore = 0
    const upiLower = upiId.toLowerCase().trim()
    const parts = upiLower.split('@')
    const username = parts[0] || ''
    const handle = parts[1] || ''

    // CHECK 1: Format validation
    if (!upiId.includes('@') || !handle) {
        return {
            upiId, username, handle, bankName: 'Unknown',
            riskScore: 100,
            signals: [{ level: 'danger', text: 'Invalid UPI ID format — must contain @' }],
        }
    }

    // CHECK 2: Known fraud ring membership
    const ringCheck = checkRingMembership(upiId)
    if (ringCheck.inRing) {
        signals.push({
            level: 'danger',
            text: `This UPI ID is linked to a known fraud ring (${ringCheck.ringId})`,
        })
        riskScore += 90
        if (ringCheck.isController) {
            signals.push({
                level: 'danger',
                text: 'This account is a fraud ring CONTROLLER — it orchestrates money laundering',
            })
            riskScore += 10
        }
    }

    // CHECK 3: Suspicious username patterns
    const suspiciousNames = [
        'refund', 'prize', 'reward', 'helpdesk', 'support',
        'kyc', 'verify', 'bank', 'rbi', 'npci', 'pm', 'govt', 'police',
        'income', 'tax', 'uidai', 'aadhar', 'lottery', 'winner', 'free',
        'cashback', 'offer', 'covid', 'pmcares', 'relief',
    ]
    suspiciousNames.forEach((kw) => {
        if (username.includes(kw)) {
            signals.push({
                level: 'danger',
                text: `UPI ID contains "${kw}" — scammers impersonate official bodies to trick you`,
            })
            riskScore += 40
        }
    })

    // CHECK 4: Legitimate bank handles
    if (VERIFIED_HANDLES[handle]) {
        signals.push({
            level: 'safe',
            text: `Bank handle "@${handle}" is verified — issued by ${VERIFIED_HANDLES[handle]}`,
        })
        riskScore -= 10
    } else {
        signals.push({
            level: 'warning',
            text: `Unknown bank handle "@${handle}" — could not verify the issuing bank`,
        })
        riskScore += 20
    }

    // CHECK 5: Purely numeric username (possible mule)
    if (/^\d{8,}$/.test(username)) {
        signals.push({
            level: 'warning',
            text: 'UPI ID is purely numeric — sometimes associated with temporary mule accounts',
        })
        riskScore += 15
    }

    return {
        upiId,
        username,
        handle,
        bankName: VERIFIED_HANDLES[handle] || 'Unknown',
        riskScore: Math.min(Math.max(riskScore, 0), 100),
        signals,
    }
}

/* ═══════════════════════════════════════════════════════════════
   QR CODE CONTENT ANALYSIS
   ═══════════════════════════════════════════════════════════════ */
export const analyseQRContent = (rawText) => {
    const signals = []
    let riskScore = 0

    const isUPILink = rawText.startsWith('upi://')
    const isHTTPLink = rawText.startsWith('http')

    if (isHTTPLink) {
        // Route to link analysis instead
        return { ...analyseLink(rawText), _isLink: true }
    }

    if (!isUPILink) {
        signals.push({ level: 'danger', text: 'Not a valid UPI QR code format' })
        riskScore += 60
    }

    // Extract UPI parameters
    const params = new URLSearchParams(rawText.split('?')[1] || '')
    const pa = params.get('pa') || ''
    const pn = params.get('pn') || ''
    const am = parseFloat(params.get('am') || '0')

    // CHECK 1: UPI ID format validation
    const upiPattern = /^[\w.\-_]+@[\w]+$/
    if (pa && !upiPattern.test(pa)) {
        signals.push({ level: 'danger', text: `Invalid UPI ID format: "${pa}"` })
        riskScore += 40
    }

    // CHECK 2: Suspicious keywords
    const suspiciousKeywords = [
        'refund', 'prize', 'reward', 'cashback', 'lottery',
        'winner', 'helpdesk', 'support', 'verify', 'kyc',
        'block', 'suspend', 'urgent', 'lucky', 'free',
    ]
    const paLower = pa.toLowerCase()
    const pnLower = pn.toLowerCase()
    suspiciousKeywords.forEach((kw) => {
        if (paLower.includes(kw) || pnLower.includes(kw)) {
            signals.push({
                level: 'danger',
                text: `Suspicious keyword in QR: "${kw}" — scammers use this to appear official`,
            })
            riskScore += 35
        }
    })

    // CHECK 3: Known fake bank/gov UPI handle patterns
    const fakeOrgPatterns = [
        /npci/i, /rbi/i, /sbi\.?official/i, /hdfc\.?bank\.?helpline/i,
        /income\.?tax/i, /police/i, /cbi/i, /uidai/i, /aadhar/i,
        /pm\.?cares/i, /covid/i,
    ]
    fakeOrgPatterns.forEach((pattern) => {
        if (pattern.test(pa) || pattern.test(pn)) {
            signals.push({
                level: 'danger',
                text: `QR claims to be from "${pn || pa}" — government & RBI never collect payments via QR`,
            })
            riskScore += 70
        }
    })

    // CHECK 4: Pre-filled amount
    if (am > 0) {
        if (am > 10000) {
            signals.push({
                level: 'warning',
                text: `QR has pre-filled amount of ₹${am.toLocaleString('en-IN')} — verify this is correct before paying`,
            })
            riskScore += 15
        } else {
            signals.push({
                level: 'info',
                text: `QR requests ₹${am.toLocaleString('en-IN')} — confirm with the merchant before proceeding`,
            })
        }
    }

    // CHECK 5: Check against known fraud ring members
    const knownMembers = getRingMemberUPIIds()
    if (pa && knownMembers.some((id) => pa.toLowerCase().includes(id.split('@')[0]))) {
        signals.push({
            level: 'danger',
            text: 'This UPI ID is associated with a known fraud network in our records',
        })
        riskScore += 80
    }

    // CHECK 6: Collect request QR
    if (rawText.includes('mc=') || rawText.toLowerCase().includes('collect')) {
        signals.push({
            level: 'danger',
            text: 'This QR initiates a payment COLLECTION request — scammers use this to steal money. You should NOT scan this unless you initiated a refund.',
        })
        riskScore += 50
    }

    // CHECK 7: UPI handle bank legitimacy
    const handle = pa.split('@')[1] || ''
    if (handle && !VERIFIED_HANDLES[handle.toLowerCase()]) {
        signals.push({
            level: 'warning',
            text: `Unknown UPI bank handle "@${handle}" — verify this is a legitimate payment receiver`,
        })
        riskScore += 20
    } else if (handle && VERIFIED_HANDLES[handle.toLowerCase()]) {
        signals.push({
            level: 'safe',
            text: `Bank handle "@${handle}" is verified — ${VERIFIED_HANDLES[handle.toLowerCase()]}`,
        })
    }

    return {
        pa,
        pn,
        am,
        riskScore: Math.min(Math.max(riskScore, 0), 100),
        signals,
        rawText,
    }
}

/* ═══════════════════════════════════════════════════════════════
   LINK / URL ANALYSIS
   ═══════════════════════════════════════════════════════════════ */
export const analyseLink = (url) => {
    const signals = []
    let riskScore = 0

    let parsedURL
    try {
        parsedURL = new URL(url)
    } catch {
        return {
            url, domain: '', riskScore: 80, signals: [{ level: 'danger', text: 'Invalid URL format' }], isHTTPS: false,
        }
    }

    const domain = parsedURL.hostname
    const path = parsedURL.pathname + parsedURL.search

    // CHECK 1: Known legitimate UPI domains
    const legitimateDomains = [
        'phonepe.com', 'gpay.app', 'paytm.com', 'bhimupi.org.in',
        'npci.org.in', 'upi.npci.org.in', 'amazon.in', 'flipkart.com',
        'hdfcbank.com', 'onlinesbi.sbi', 'axisbank.com', 'icicibank.com',
    ]
    if (legitimateDomains.some((d) => domain.endsWith(d))) {
        signals.push({ level: 'safe', text: `Domain "${domain}" is a verified legitimate service` })
        riskScore -= 20
    }

    // CHECK 2: Phishing keyword patterns in domain
    const phishingDomainPatterns = [
        /sbi.*(refund|helpdesk|support|verify|kyc|block|claim)/i,
        /hdfc.*(refund|helpdesk|reward|prize)/i,
        /npci.*(helpdesk|support|claim|refund)/i,
        /upi.*(refund|block|verify|update|expired)/i,
        /rbi.*(refund|penalty|fine|block|verify)/i,
        /(prize|reward|cashback|lottery|winner|lucky).*(upi|pay|claim)/i,
        /paytm.*(helpdesk|refund).*/i,
    ]
    phishingDomainPatterns.forEach((pattern) => {
        if (pattern.test(domain + path)) {
            signals.push({
                level: 'danger',
                text: `Domain pattern matches known phishing format: "${domain}"`,
            })
            riskScore += 60
        }
    })

    // CHECK 3: Domain mimicking (typosquatting)
    const mimikedBrands = {
        phonepe: ['ph0nepe', 'phon3pe', 'phonpe', 'phone-pe', 'phonepe-app'],
        paytm: ['pay-tm', 'paytm-refund', 'p4ytm', 'payytm'],
        gpay: ['g-pay', 'googlepay-india', 'gpay-reward'],
        npci: ['npci-helpdesk', 'npc1', 'npci.in.net'],
    }
    Object.entries(mimikedBrands).forEach(([brand, fakes]) => {
        if (fakes.some((f) => domain.includes(f))) {
            signals.push({
                level: 'danger',
                text: `This link mimics "${brand}" but is a fake domain — a common trick to steal your credentials`,
            })
            riskScore += 75
        }
    })

    // CHECK 4: Suspicious TLDs
    const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.click', '.link', '.info']
    if (suspiciousTLDs.some((tld) => domain.endsWith(tld))) {
        signals.push({
            level: 'warning',
            text: `Domain uses a high-risk extension ".${domain.split('.').pop()}" — commonly used in scam sites`,
        })
        riskScore += 30
    }

    // CHECK 5: UPI parameters in URL
    if (path.includes('pa=') || path.includes('upi=')) {
        const extractedPA = new URLSearchParams(parsedURL.search).get('pa') || ''
        signals.push({
            level: 'warning',
            text: `Link contains a UPI payment request to: ${extractedPA || 'unknown'} — verify before proceeding`,
        })
        riskScore += 25
        if (extractedPA) {
            const upiResult = analyseUPIId(extractedPA)
            signals.push(...upiResult.signals)
            riskScore += Math.round(upiResult.riskScore * 0.5)
        }
    }

    // CHECK 6: URL shorteners
    const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'rb.gy', 'shorturl.at', 'is.gd', 'ow.ly']
    if (shorteners.some((s) => domain.includes(s))) {
        signals.push({
            level: 'warning',
            text: 'Shortened URL — the actual destination is hidden. Scammers use these to disguise fraud links.',
        })
        riskScore += 20
    }

    // CHECK 7: HTTP (not HTTPS)
    if (parsedURL.protocol === 'http:') {
        signals.push({
            level: 'warning',
            text: 'This link is NOT secure (HTTP, not HTTPS). Any payment information entered here could be stolen.',
        })
        riskScore += 15
    }

    // CHECK 8: Excessive subdomains
    const subdomainCount = domain.split('.').length - 2
    if (subdomainCount > 2) {
        signals.push({
            level: 'warning',
            text: `Complex domain with ${subdomainCount} subdomains — often used to appear official while hiding the real domain`,
        })
        riskScore += 25
    }

    return {
        url,
        domain,
        riskScore: Math.min(Math.max(riskScore, 0), 100),
        signals,
        isHTTPS: parsedURL.protocol === 'https:',
    }
}

/* ═══════════════════════════════════════════════════════════════
   REASON CODE TRANSLATION (for transaction results)
   ═══════════════════════════════════════════════════════════════ */
export const translateReason = (reason) => {
    const map = {
        sender_is_known_controller:
            'The sender account is linked to a known fraud network that launders money through multiple accounts.',
        intra_ring_transfer:
            'Both sender and receiver are in the same fraud network — this looks like money being moved between fraud accounts.',
        receiver_is_fake_merchant:
            'The receiver is a merchant account flagged as fake in our database.',
        extreme_amount_ratio:
            'The transaction amount is extremely large compared to typical transactions for this account.',
    }
    return map[reason] || reason || 'Multiple risk signals were detected for this transaction.'
}

/* ═══════════════════════════════════════════════════════════════
   REPORT GENERATION (text report for download)
   ═══════════════════════════════════════════════════════════════ */
export const generateTextReport = (results) => {
    const lines = [
        'GraphFraud-UPI Batch Check Report',
        `Generated: ${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'medium' })}`,
        'Checked by: Anonymous User',
        '',
        '━'.repeat(40),
    ]

    results.forEach((r, i) => {
        lines.push(`\nItem ${i + 1}: ${r.item} (${r.type})`)
        lines.push(`Status: ${r.riskScore < 30 ? 'SAFE' : r.riskScore < 60 ? 'CAUTION' : 'DANGEROUS'}`)
        lines.push(`Risk Score: ${r.riskScore}/100`)
        lines.push('Signals:')
            ; (r.signals || []).forEach((s) => {
                const icon = s.level === 'danger' ? '✗' : s.level === 'warning' ? '⚠' : s.level === 'safe' ? '✓' : 'ℹ'
                lines.push(`  ${icon} ${s.text}`)
            })
        lines.push('━'.repeat(40))
    })

    lines.push('\nIMPORTANT: This report is generated automatically.')
    lines.push('Report fraud at: cybercrime.gov.in | Helpline: 1930')

    return lines.join('\n')
}
