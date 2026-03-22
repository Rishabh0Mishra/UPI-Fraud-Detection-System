"""
scan_history.py
===============
UPI scan history tracking and reduction factor calculations.

Tracks when users scan/check UPI IDs and uses the scan history
to calculate trust-based score reductions for the fraud detection system.

Reduction factors (all capped at -25 total):
  - Verified merchant:    -15
  - Repeat beneficiary:   -5 to -15
  - Scan history:         -3 to -10
  - Normal amount:        -5
  - Normal hour:          -5
"""

import os
import sqlite3
import logging
import threading
from pathlib import Path
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("upi_fraud_api")

BASE_DIR = Path(__file__).resolve().parent.parent
SCAN_DB_PATH = BASE_DIR / "data" / "scan_history.db"

_local = threading.local()

MAX_TOTAL_REDUCTION = -25
SCAN_REDUCTION_FLOOR = 30  # Score never reduced below this via scan reduction


def _get_conn() -> sqlite3.Connection:
    """Get a thread-local SQLite connection."""
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(SCAN_DB_PATH.parent, exist_ok=True)
        _local.conn = sqlite3.connect(str(SCAN_DB_PATH), check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA synchronous=NORMAL")
    return _local.conn


def init_scan_db():
    """Create scan history table."""
    conn = _get_conn()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS upi_scan_history (
            scan_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            upi_id       VARCHAR(255) NOT NULL,
            user_id      VARCHAR(255),
            reported     BOOLEAN DEFAULT 0,
            scan_result_score DECIMAL(5,2),
            action_taken VARCHAR(50),
            timestamp    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_scan_upi ON upi_scan_history(upi_id, timestamp DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_scan_reported ON upi_scan_history(upi_id, reported)")
    conn.commit()
    logger.info(f"Scan history DB initialised at {SCAN_DB_PATH}")


# ────────────────────────────────────────────────────────────────────
# RECORD SCANS
# ────────────────────────────────────────────────────────────────────

def record_scan(
    upi_id: str,
    user_id: str = "anonymous",
    score: float = 0,
    action: str = "VIEWED",
    reported: bool = False,
) -> dict:
    """Record a UPI scan event."""
    conn = _get_conn()
    c = conn.cursor()
    norm = upi_id.lower().strip()
    now = datetime.now(timezone.utc).isoformat()

    c.execute("""
        INSERT INTO upi_scan_history (upi_id, user_id, reported, scan_result_score, action_taken, timestamp)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (norm, user_id, int(reported), score, action, now))
    conn.commit()

    return {"status": "recorded", "upi_id": norm, "scan_id": c.lastrowid}


# ────────────────────────────────────────────────────────────────────
# SCAN-BASED REDUCTION
# ────────────────────────────────────────────────────────────────────

def calculate_scan_reduction(upi_id: str) -> float:
    """
    Calculate score reduction based on scan history.
    Returns 0 to -10 (always negative or zero).

    Logic:
      - Need minimum 3 unreported scans for any confidence
      - If ANY fraud reports exist for this UPI: return 0
      - 3-5 scans without reports: -3
      - 6-10 scans: -5
      - 11-20 scans: -8
      - 20+ scans: -10
    """
    conn = _get_conn()
    c = conn.cursor()
    norm = upi_id.lower().strip()

    # Check if any reports exist (from scan history)
    c.execute("""
        SELECT COUNT(*) as cnt FROM upi_scan_history
        WHERE upi_id = ? AND reported = 1
    """, (norm,))
    report_count = c.fetchone()["cnt"]
    if report_count > 0:
        return 0  # Any reports = no reduction

    # Also check fraud_reports table (from fraud_enhancements)
    try:
        from fraud_enhancements import check_fraud_reports
        fr = check_fraud_reports(upi_id)
        if fr.get("found") and fr.get("report_count", 0) > 0:
            return 0
    except Exception:
        pass

    # Count unique users who scanned without reporting (last 7 days)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    c.execute("""
        SELECT COUNT(DISTINCT user_id) as scan_count
        FROM upi_scan_history
        WHERE upi_id = ? AND reported = 0 AND timestamp >= ?
    """, (norm, cutoff))
    scan_count = c.fetchone()["scan_count"]

    if scan_count < 3:
        return 0
    elif scan_count >= 20:
        return -10
    elif scan_count >= 11:
        return -8
    elif scan_count >= 6:
        return -5
    else:  # 3-5
        return -3


# ────────────────────────────────────────────────────────────────────
# ALL REDUCTION FACTORS
# ────────────────────────────────────────────────────────────────────

def calculate_all_reductions(
    upi_id_receiver: str,
    upi_id_sender: str = None,
    amount: float = 0,
    hour: int = 12,
    sender_avg_amount: float = 500,
    receiver_is_verified_merchant: bool = False,
    current_score: float = 50,
    has_any_fraud_reports: bool = False,
    has_invalid_handle: bool = False,
) -> dict:
    """
    Calculate all reduction factors and return breakdown.

    Safety caps:
      - Total reduction cannot exceed -25
      - No reductions if verified fraud reports exist
      - No reductions if invalid handle detected
      - If current score > 70: max -10 total
      - Scan reduction never brings score below 30

    Returns:
        dict with individual reductions, total, and capped_total.
    """
    reductions = {}

    # Safety: no reductions for known-bad identifiers
    if has_any_fraud_reports or has_invalid_handle:
        return {
            "reductions": {},
            "total": 0,
            "capped_total": 0,
            "reason": "no_reductions_fraud_detected" if has_any_fraud_reports else "no_reductions_invalid_handle",
        }

    # 1. Verified merchant reduction
    if receiver_is_verified_merchant:
        reductions["verified_merchant"] = -15

    # 2. Repeat beneficiary reduction
    if upi_id_sender and upi_id_receiver:
        try:
            from circular_buffer import get_transaction_count_between
            prev_txns = get_transaction_count_between(upi_id_sender, upi_id_receiver)
            if prev_txns >= 10:
                reductions["repeat_beneficiary"] = -15
            elif prev_txns >= 6:
                reductions["repeat_beneficiary"] = -10
            elif prev_txns >= 3:
                reductions["repeat_beneficiary"] = -5
        except Exception:
            pass

    # 3. Scan history reduction
    scan_red = calculate_scan_reduction(upi_id_receiver)
    if scan_red < 0:
        # Safety: never reduce below floor via scans
        if (current_score + scan_red) < SCAN_REDUCTION_FLOOR:
            scan_red = min(0, -(current_score - SCAN_REDUCTION_FLOOR))
        if scan_red < 0:
            reductions["scan_history"] = scan_red

    # 4. Normal amount reduction
    if sender_avg_amount > 0:
        lower = 0.5 * sender_avg_amount
        upper = 2.0 * sender_avg_amount
        if lower <= amount <= upper:
            reductions["normal_amount"] = -5

    # 5. Normal hour reduction (8 AM - 10 PM)
    if 8 <= hour <= 22:
        reductions["normal_hour"] = -5

    # Sum and cap
    total = sum(reductions.values())

    # High-risk cap: if score > 70, max -10
    if current_score > 70:
        cap = -10
    else:
        cap = MAX_TOTAL_REDUCTION

    capped_total = max(total, cap)

    return {
        "reductions": reductions,
        "total": total,
        "capped_total": capped_total,
    }


# Initialise DB on import
init_scan_db()
