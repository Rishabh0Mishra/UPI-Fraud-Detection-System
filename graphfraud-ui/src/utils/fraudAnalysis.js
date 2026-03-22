/**
 * Client-side fraud analysis utilities for QR codes, links, and UPI IDs.
 * All checks run entirely in the browser — no backend calls needed.
 */
import { FRAUD_RINGS } from '../api/mockData'
import { KNOWN_FRAUD_DOMAINS } from '../data/knownFraudDomains'
import { API_BASE_URL } from '../config'

/* ── Reported Items Blacklist (persisted in localStorage) ── */
const REPORTED_ITEMS_KEY = 'reported_fraud_items'

export const getReportedItems = () => {
    try {
        return JSON.parse(localStorage.getItem(REPORTED_ITEMS_KEY) || '[]')
    } catch {
        return []
    }
}

export const addReportedItem = (item, type) => {
    const items = getReportedItems()
    const normalised = item.toLowerCase().trim()
    if (!items.some((r) => r.item === normalised)) {
        items.push({ item: normalised, type, reportedAt: new Date().toISOString() })
        localStorage.setItem(REPORTED_ITEMS_KEY, JSON.stringify(items))
    }
}

export const isItemReported = (item) => {
    const normalised = item.toLowerCase().trim()
    return getReportedItems().find((r) => r.item === normalised) || null
}

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
   STRICT UPI FORMAT VALIDATION (client-side mirror of backend)
   ═══════════════════════════════════════════════════════════════ */

export const validateUPIFormat = (upiId) => {
    const result = { isValid: false, username: null, handle: null, errorType: null, errorMessage: null }

    if (!upiId || typeof upiId !== 'string') {
        result.errorType = 'EMPTY_INPUT'
        result.errorMessage = '❌ Invalid UPI ID Format\n\nNo UPI ID provided.'
        return result
    }

    if (upiId !== upiId.trim()) {
        result.errorType = 'WHITESPACE'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nThe UPI ID "${upiId}" contains leading or trailing spaces.\n\nValid format: username@handle\nExample: merchant@paytm`
        return result
    }

    if (upiId.includes(' ')) {
        result.errorType = 'SPACE_IN_MIDDLE'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nThe UPI ID "${upiId}" contains spaces.\n\nValid format: username@handle\nExample: merchant@paytm`
        return result
    }

    const atCount = (upiId.match(/@/g) || []).length
    if (atCount === 0) {
        result.errorType = 'NO_AT_SYMBOL'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nThe UPI ID "${upiId}" is missing the @ symbol.\n\nValid format: username@handle\nExample: merchant@paytm`
        return result
    }

    if (atCount > 1) {
        result.errorType = 'MULTIPLE_AT_SYMBOLS'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nThe UPI ID "${upiId}" contains multiple @ symbols.\n\nValid format: username@handle\nExample: merchant@paytm\n\nThis appears to be a fraudulent or malformed UPI ID.`
        return result
    }

    const [username, handle] = upiId.split('@')

    if (!username) {
        result.errorType = 'MISSING_USERNAME'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nThe UPI ID "${upiId}" is missing the username.\n\nValid format: username@handle\nYour input only has: @${handle}\n\nPlease verify the correct UPI ID.`
        return result
    }

    if (!handle) {
        result.errorType = 'MISSING_HANDLE'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nThe UPI ID "${upiId}" is missing the handle.\n\nValid format: username@handle\nYour input only has: ${username}@\n\nPlease verify the correct UPI ID.`
        return result
    }

    if (username.length < 3) {
        result.errorType = 'USERNAME_TOO_SHORT'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nUsername must be at least 3 characters long.\n\nYour input: "${username}" (only ${username.length} characters)\n\nPlease verify the correct UPI ID.`
        return result
    }

    if (!/^[a-zA-Z0-9._\-]+$/.test(username)) {
        result.errorType = 'INVALID_USERNAME_CHARS'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nUsername "${username}" contains invalid characters.\n\nAllowed: letters, numbers, dots (.), underscores (_), hyphens (-)`
        return result
    }

    if (/^[._\-]/.test(username) || /[._\-]$/.test(username)) {
        result.errorType = 'USERNAME_SPECIAL_BOUNDARY'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nUsername "${username}" cannot start or end with special characters (., _, -).`
        return result
    }

    if (handle.length < 2) {
        result.errorType = 'HANDLE_TOO_SHORT'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nHandle must be at least 2 characters long.\n\nYour input: "@${handle}" (only ${handle.length} character)`
        return result
    }

    if (!/^[a-zA-Z0-9]+$/.test(handle)) {
        result.errorType = 'INVALID_HANDLE_CHARS'
        result.errorMessage = `❌ Invalid UPI ID Format\n\nHandle "@${handle}" contains invalid characters. Handle must be alphanumeric only.`
        return result
    }

    result.isValid = true
    result.username = username
    result.handle = handle.toLowerCase()
    return result
}


/* ═══════════════════════════════════════════════════════════════
   FRAUD REPORT LOOKUP (calls backend API)
   ═══════════════════════════════════════════════════════════════ */

export const fetchFraudReports = async (identifier) => {
    try {
        const res = await fetch(`${API_BASE_URL}/check-reports/${encodeURIComponent(identifier)}`)
        if (res.ok) return await res.json()
    } catch (e) {
        console.warn('Could not fetch fraud reports:', e)
    }
    return { found: false, report_count: 0, risk_adjustment: 0 }
}


/* ═══════════════════════════════════════════════════════════════
   UPI ID ANALYSIS (with strict 3-step validation)
   ═══════════════════════════════════════════════════════════════ */
export const analyseUPIId = (upiId) => {
    const signals = []
    let riskScore = 0

    // ── STEP 1: Strict format validation ──
    const fmt = validateUPIFormat(upiId)
    if (!fmt.isValid) {
        return {
            upiId,
            username: '',
            handle: '',
            bankName: 'Unknown',
            riskScore: 100,
            formatError: fmt.errorType,
            signals: [{ level: 'danger', text: fmt.errorMessage }],
        }
    }

    const username = fmt.username
    const handle = fmt.handle
    const upiLower = upiId.toLowerCase().trim()

    // ── STEP 2: Handle validation ──
    if (!VERIFIED_HANDLES[handle]) {
        signals.push({
            level: 'danger',
            text: `🚨 UPI handle "@${handle}" is NOT recognized by any known bank.\n\n✓ Valid handles: @paytm, @ybl, @oksbi, @okaxis, @okicici\n✗ Detected: @${handle}\n\nThis is likely a fraudulent UPI ID.`,
        })
        // Don't proceed to further checks — invalid handle = critical risk
        return {
            upiId,
            username,
            handle,
            bankName: 'Unknown (INVALID)',
            riskScore: 100,
            handleError: true,
            signals,
        }
    }

    // Handle is valid — add safe signal
    signals.push({
        level: 'safe',
        text: `Bank handle "@${handle}" is verified — issued by ${VERIFIED_HANDLES[handle]}`,
    })

    // ── STEP 3: Fraud report check (local blacklist) ──
    const reportMatch = isItemReported(upiLower)
    if (reportMatch) {
        signals.push({
            level: 'danger',
            text: `🚫 This UPI ID was previously reported as FRAUDULENT (${new Date(reportMatch.reportedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })})`,
        })
        riskScore += 80
    }

    // CHECK: Known fraud ring membership
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

    // CHECK: Suspicious username patterns
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

    // CHECK: Purely numeric username (possible mule)
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

    // CHECK 0: Previously reported QR code — immediate block
    const reportMatch = isItemReported(rawText)
    if (reportMatch) {
        return {
            pa: '', pn: '', am: 0,
            riskScore: 100,
            signals: [
                { level: 'danger', text: '🚫 This QR code was previously reported as FRAUDULENT' },
                { level: 'danger', text: `Reported on: ${new Date(reportMatch.reportedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}` },
                { level: 'danger', text: 'Do NOT proceed — this is a confirmed scam QR code in our records' },
            ],
            rawText,
            _previouslyReported: true,
        }
    }

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

    // CHECK 1: UPI ID format validation (uses strict validator)
    if (pa) {
        const fmtCheck = validateUPIFormat(pa)
        if (!fmtCheck.isValid) {
            signals.push({ level: 'danger', text: `Invalid UPI ID format in QR: "${pa}" — ${fmtCheck.errorType}` })
            riskScore += 40
        }
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
    let isLegitimate = false

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
    const fullUrl = domain + path

    // CHECK 0: Previously reported link — immediate block
    const reportMatch = isItemReported(url)
    if (reportMatch) {
        return {
            url, domain,
            riskScore: 100,
            signals: [
                { level: 'danger', text: '🚫 This link was previously reported as FRAUDULENT' },
                { level: 'danger', text: `Reported on: ${new Date(reportMatch.reportedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}` },
                { level: 'danger', text: 'Do NOT visit this link — it is a confirmed scam in our records' },
            ],
            isHTTPS: parsedURL.protocol === 'https:',
            _previouslyReported: true,
        }
    }

    // CHECK 0b: Known fraud domain from dataset (293K records)
    const domainNorm = domain.toLowerCase()
    if (KNOWN_FRAUD_DOMAINS.has(domainNorm)) {
        signals.push({
            level: 'danger',
            text: `Domain "${domain}" found in known fraud database (trained from 293K+ records)`,
        })
        riskScore += 85
    }

    // CHECK 1: Known legitimate UPI domains
    const legitimateDomains = [
        'phonepe.com', 'gpay.app', 'paytm.com', 'bhimupi.org.in',
        'npci.org.in', 'upi.npci.org.in', 'amazon.in', 'flipkart.com',
        'hdfcbank.com', 'onlinesbi.sbi', 'axisbank.com', 'icicibank.com',
        'google.com', 'google.co.in', 'facebook.com', 'youtube.com',
        'github.com', 'wikipedia.org', 'microsoft.com', 'apple.com',
    ]
    if (legitimateDomains.some((d) => domain.endsWith(d))) {
        signals.push({ level: 'safe', text: `Domain "${domain}" is a verified legitimate service` })
        isLegitimate = true
        riskScore -= 20
    }

    // CHECK 2: Phishing keyword patterns in domain + path
    const phishingDomainPatterns = [
        /sbi.*(refund|helpdesk|support|verify|kyc|block|claim)/i,
        /hdfc.*(refund|helpdesk|reward|prize)/i,
        /npci.*(helpdesk|support|claim|refund)/i,
        /upi.*(refund|block|verify|update|expired)/i,
        /rbi.*(refund|penalty|fine|block|verify)/i,
        /(prize|reward|cashback|lottery|winner|lucky).*(upi|pay|claim)/i,
        /paytm.*(helpdesk|refund).*/i,
        /(bank|payment).*(verify|update|suspend|block|expire)/i,
        /(verify|update|suspend|block|expire).*(bank|payment|account|upi)/i,
    ]
    phishingDomainPatterns.forEach((pattern) => {
        if (pattern.test(fullUrl)) {
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
        sbi: ['sbi-online', 'sbi-refund', 'onlinesbi-in', 'sbicard-helpdesk'],
        hdfc: ['hdfc-helpdesk', 'hdfcbank-refund', 'hdfc-online'],
        icici: ['icici-helpdesk', 'icicibank-refund'],
        axis: ['axis-helpdesk', 'axisbank-refund'],
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
    const suspiciousTLDs = ['.tk', '.ml', '.ga', '.cf', '.gq', '.xyz', '.top', '.click', '.link', '.info', '.buzz', '.pro', '.work', '.site', '.online', '.live', '.icu', '.club']
    if (suspiciousTLDs.some((tld) => domain.endsWith(tld))) {
        signals.push({
            level: 'warning',
            text: `Domain uses a high-risk extension ".${domain.split('.').pop()}" — commonly used in scam sites`,
        })
        riskScore += 30
    }

    // CHECK 5: Generic phishing keywords in domain
    const domainPhishingKeywords = [
        'refund', 'helpdesk', 'support', 'verify', 'kyc', 'claim',
        'reward', 'prize', 'cashback', 'lottery', 'winner', 'lucky',
        'free', 'offer', 'urgent', 'update', 'suspend', 'block',
        'expire', 'secure', 'authenticate', 'confirm', 'validate',
        'login', 'signin', 'password', 'otp', 'pin',
    ]
    const domainLower = domain.toLowerCase()
    const matchedDomainKeywords = domainPhishingKeywords.filter((kw) => domainLower.includes(kw))
    if (!isLegitimate && matchedDomainKeywords.length > 0) {
        signals.push({
            level: 'danger',
            text: `Domain contains suspicious keyword${matchedDomainKeywords.length > 1 ? 's' : ''}: "${matchedDomainKeywords.join('", "')}" — this is a common phishing tactic`,
        })
        riskScore += Math.min(matchedDomainKeywords.length * 25, 70)
    }

    // CHECK 6: Suspicious keywords in URL path
    const pathPhishingKeywords = [
        'login', 'signin', 'verify', 'kyc', 'update', 'confirm',
        'secure', 'otp', 'pin', 'password', 'claim', 'refund',
        'reward', 'prize', 'winner', 'cashback',
    ]
    const pathLower = path.toLowerCase()
    const matchedPathKeywords = pathPhishingKeywords.filter((kw) => pathLower.includes(kw))
    if (!isLegitimate && matchedPathKeywords.length > 0) {
        signals.push({
            level: 'warning',
            text: `URL path contains suspicious keyword${matchedPathKeywords.length > 1 ? 's' : ''}: "${matchedPathKeywords.join('", "')}"`,
        })
        riskScore += Math.min(matchedPathKeywords.length * 15, 45)
    }

    // CHECK 7: Brand name + suspicious word combination in domain
    const brandNames = ['sbi', 'hdfc', 'icici', 'axis', 'kotak', 'paytm', 'phonepe', 'gpay', 'npci', 'rbi', 'uidai', 'aadhar']
    const suspiciousModifiers = ['refund', 'helpdesk', 'support', 'verify', 'claim', 'update', 'secure', 'login', 'kyc']
    const hasBrand = brandNames.some((b) => domainLower.includes(b))
    const hasModifier = suspiciousModifiers.some((m) => domainLower.includes(m))
    if (!isLegitimate && hasBrand && hasModifier) {
        signals.push({
            level: 'danger',
            text: `Domain combines a bank/payment brand name with suspicious words — this is a classic phishing URL`,
        })
        riskScore += 50
    }

    // CHECK 8: UPI parameters in URL
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

    // CHECK 9: URL shorteners
    const shorteners = ['bit.ly', 'tinyurl.com', 't.co', 'goo.gl', 'cutt.ly', 'rb.gy', 'shorturl.at', 'is.gd', 'ow.ly']
    if (shorteners.some((s) => domain.includes(s))) {
        signals.push({
            level: 'warning',
            text: 'Shortened URL — the actual destination is hidden. Scammers use these to disguise fraud links.',
        })
        riskScore += 20
    }

    // CHECK 10: HTTP (not HTTPS)
    if (parsedURL.protocol === 'http:') {
        signals.push({
            level: 'warning',
            text: 'This link is NOT secure (HTTP, not HTTPS). Any payment information entered here could be stolen.',
        })
        riskScore += 15
    }

    // CHECK 11: Excessive subdomains
    const subdomainCount = domain.split('.').length - 2
    if (subdomainCount > 2) {
        signals.push({
            level: 'warning',
            text: `Complex domain with ${subdomainCount} subdomains — often used to appear official while hiding the real domain`,
        })
        riskScore += 25
    }

    // CHECK 12: Non-legitimate domain baseline — unknown domains start with some suspicion
    if (!isLegitimate && riskScore < 15) {
        signals.push({
            level: 'info',
            text: `Domain "${domain}" is not in our verified list — exercise caution before entering any information`,
        })
        riskScore += 15
    }

    // If no signals at all and not legitimate, flag as unknown
    if (signals.length === 0) {
        signals.push({ level: 'info', text: 'No specific threats detected, but always verify links before clicking' })
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
   NEW RISK UI CONFIG (TIERED SCALE)
   ═══════════════════════════════════════════════════════════════ */
export const getRiskUiConfig = (score) => {
    if (score <= 25) {
        return {
            level: 'MINIMAL RISK',
            color: '#4CAF50',
            glowColor: 'rgba(76,175,80,0.06)',
            borderColor: 'rgba(76,175,80,0.3)',
            icon: 'ℹ️',
            message: 'Minimal fraud indicators detected. Lower risk, but always verify.'
        }
    } else if (score <= 40) {
        return {
            level: 'LOW RISK',
            color: '#2196F3',
            glowColor: 'rgba(33,150,243,0.06)',
            borderColor: 'rgba(33,150,243,0.3)',
            icon: 'ℹ️',
            message: 'Few warning signs, stay vigilant. Verify receiver details before paying.'
        }
    } else if (score <= 60) {
        return {
            level: 'MEDIUM RISK',
            color: '#FF9800',
            glowColor: 'rgba(255,152,0,0.06)',
            borderColor: 'rgba(255,152,0,0.3)',
            icon: '⚠️',
            message: 'Appears legitimate, but confirm details. Proceed with caution.'
        }
    } else if (score <= 80) {
        return {
            level: 'HIGH RISK',
            color: '#FF5722',
            glowColor: 'rgba(255,87,34,0.08)',
            borderColor: 'rgba(255,87,34,0.4)',
            icon: '🚨',
            message: 'STRONG FRAUD INDICATORS DETECTED! We strongly recommend NOT proceeding.'
        }
    } else {
        return {
            level: 'CRITICAL RISK',
            color: '#D32F2F',
            glowColor: 'rgba(211,47,47,0.1)',
            borderColor: 'rgba(211,47,47,0.5)',
            icon: '🛑',
            message: 'CONFIRMED FRAUD DETECTED! Do NOT proceed. This is a confirmed scam.'
        }
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
        'UPI Fraud Detection System — Batch Check Report',
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
