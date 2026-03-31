/**
 * Auto-detect what type of input a string is and return the appropriate check tab.
 * Used by the universal search bar and batch checker.
 */
export const detectInputType = (input) => {
    const trimmed = input.trim()
    if (!trimmed) return 'unknown'
    if (trimmed.startsWith('upi://')) return 'qr'
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return 'link'
    if (/^TXN[\d_A-Z]+$/i.test(trimmed)) return 'transaction'
    if (trimmed.includes('@') && !trimmed.includes(' ')) return 'upi'
    return 'unknown'
}

export const TYPE_LABELS = {
    qr: 'QR Content',
    link: 'Link / URL',
    upi: 'UPI ID',
    transaction: 'Transaction ID',
    unknown: 'Unrecognised',
}
