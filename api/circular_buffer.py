"""
circular_buffer.py
==================
Circular FIFO buffer database for live transaction storage.

Maintains a fixed-size buffer of 50,000 transaction entries in SQLite.
When full, new entries overwrite the oldest (slot 1 → 50000 → wrap to 1).

Tables:
  - live_transactions: 50k-slot circular buffer
  - circular_buffer_state: single-row tracker (current slot, total processed)
  - dashboard_aggregates: pre-computed stats for dashboard performance
"""

import os
import json
import sqlite3
import logging
import threading
from pathlib import Path
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("upi_fraud_api")

BASE_DIR = Path(__file__).resolve().parent.parent
LIVE_DB_PATH = BASE_DIR / "data" / "live_transactions.db"

MAX_BUFFER_SIZE = 50_000

# Thread-local connections for safety
_local = threading.local()


def _get_conn() -> sqlite3.Connection:
    """Get a thread-local SQLite connection."""
    if not hasattr(_local, "conn") or _local.conn is None:
        os.makedirs(LIVE_DB_PATH.parent, exist_ok=True)
        _local.conn = sqlite3.connect(str(LIVE_DB_PATH), check_same_thread=False)
        _local.conn.row_factory = sqlite3.Row
        _local.conn.execute("PRAGMA journal_mode=WAL")
        _local.conn.execute("PRAGMA synchronous=NORMAL")
    return _local.conn


def init_live_db():
    """Create all tables and indexes for the live transaction system."""
    conn = _get_conn()
    c = conn.cursor()

    # ── Circular buffer: live_transactions ──
    c.execute("""
        CREATE TABLE IF NOT EXISTS live_transactions (
            slot_id          INTEGER PRIMARY KEY,
            transaction_id   VARCHAR(255),
            timestamp        TIMESTAMP,
            upi_id_sender    VARCHAR(255),
            upi_id_receiver  VARCHAR(255),
            payee_name       VARCHAR(255),
            amount           DECIMAL(15,2),
            transaction_type VARCHAR(50),

            -- Background scoring (not shown to users)
            internal_risk_score     DECIMAL(5,2),
            risk_level              VARCHAR(50),

            -- User-facing binary classification
            classification          VARCHAR(20),
            status                  VARCHAR(20),
            confidence              DECIMAL(4,3),

            -- Scoring breakdown
            base_score              DECIMAL(5,2),
            penalty_total           DECIMAL(5,2),
            reduction_total         DECIMAL(5,2),
            applied_penalties       TEXT,
            applied_reductions      TEXT,
            fraud_indicators        TEXT,
            trust_indicators        TEXT,

            -- Enhancement check results
            name_similarity_score   DECIMAL(4,3),
            handle_valid            BOOLEAN,
            report_count            INTEGER DEFAULT 0,

            -- Metadata
            lgbm_score              DECIMAL(8,6),
            graph_risk_score        DECIMAL(8,6),
            processing_time_ms      DECIMAL(8,2),
            reason                  VARCHAR(255),

            created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # ── Buffer state tracker ──
    c.execute("""
        CREATE TABLE IF NOT EXISTS circular_buffer_state (
            id                 INTEGER PRIMARY KEY CHECK (id = 1),
            current_slot       INTEGER DEFAULT 0,
            total_processed    INTEGER DEFAULT 0,
            last_wrap_timestamp TIMESTAMP,
            updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Insert initial state row if not exists
    c.execute("""
        INSERT OR IGNORE INTO circular_buffer_state (id, current_slot, total_processed)
        VALUES (1, 0, 0)
    """)

    # ── Dashboard aggregates ──
    c.execute("""
        CREATE TABLE IF NOT EXISTS dashboard_aggregates (
            id                     INTEGER PRIMARY KEY AUTOINCREMENT,
            calculation_timestamp  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            time_window            VARCHAR(20),

            total_transactions     INTEGER DEFAULT 0,
            no_fraud_count         INTEGER DEFAULT 0,
            fraud_count            INTEGER DEFAULT 0,

            fraud_rate             DECIMAL(6,4),
            average_risk_score     DECIMAL(5,2),

            total_amount           DECIMAL(15,2) DEFAULT 0,
            blocked_amount         DECIMAL(15,2) DEFAULT 0,

            top_fraud_indicators   TEXT,
            top_risky_handles      TEXT,

            unique_senders         INTEGER DEFAULT 0,
            unique_receivers       INTEGER DEFAULT 0
        )
    """)

    # ── Indexes ──
    c.execute("CREATE INDEX IF NOT EXISTS idx_lt_timestamp ON live_transactions(timestamp DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_lt_classification ON live_transactions(classification)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_lt_status ON live_transactions(status)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_lt_risk_score ON live_transactions(internal_risk_score DESC)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_lt_sender ON live_transactions(upi_id_sender)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_lt_receiver ON live_transactions(upi_id_receiver)")
    c.execute("CREATE INDEX IF NOT EXISTS idx_da_window ON dashboard_aggregates(time_window, calculation_timestamp DESC)")

    conn.commit()
    logger.info(f"Live transaction DB initialised at {LIVE_DB_PATH}")


# ────────────────────────────────────────────────────────────────────
# CIRCULAR BUFFER INSERT
# ────────────────────────────────────────────────────────────────────

def insert_transaction(data: dict) -> dict:
    """
    Insert a transaction into the circular buffer.

    Args:
        data: dict with keys matching live_transactions columns.

    Returns:
        dict with slot_id, total_processed, wrapped (bool).
    """
    conn = _get_conn()
    c = conn.cursor()

    # 1. Get current slot
    c.execute("SELECT current_slot, total_processed FROM circular_buffer_state WHERE id = 1")
    row = c.fetchone()
    current_slot = row["current_slot"]
    total_processed = row["total_processed"]

    # 2. Calculate next slot
    next_slot = current_slot + 1 if current_slot < MAX_BUFFER_SIZE else 1
    wrapped = next_slot == 1 and current_slot == MAX_BUFFER_SIZE

    now = datetime.now(timezone.utc).isoformat()

    # 3. Upsert into live_transactions
    c.execute("""
        INSERT OR REPLACE INTO live_transactions (
            slot_id, transaction_id, timestamp, upi_id_sender, upi_id_receiver,
            payee_name, amount, transaction_type,
            internal_risk_score, risk_level, classification, status, confidence,
            base_score, penalty_total, reduction_total,
            applied_penalties, applied_reductions, fraud_indicators, trust_indicators,
            name_similarity_score, handle_valid, report_count,
            lgbm_score, graph_risk_score, processing_time_ms, reason,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        next_slot,
        data.get("transaction_id"),
        data.get("timestamp", now),
        data.get("upi_id_sender"),
        data.get("upi_id_receiver"),
        data.get("payee_name"),
        data.get("amount"),
        data.get("transaction_type"),
        data.get("internal_risk_score", 0),
        data.get("risk_level", ""),
        data.get("classification", "NO_FRAUD"),
        data.get("status", "ALLOWED"),
        data.get("confidence", 0.5),
        data.get("base_score", 0),
        data.get("penalty_total", 0),
        data.get("reduction_total", 0),
        json.dumps(data.get("applied_penalties", {})),
        json.dumps(data.get("applied_reductions", {})),
        json.dumps(data.get("fraud_indicators", [])),
        json.dumps(data.get("trust_indicators", [])),
        data.get("name_similarity_score"),
        data.get("handle_valid"),
        data.get("report_count", 0),
        data.get("lgbm_score", 0),
        data.get("graph_risk_score", 0),
        data.get("processing_time_ms", 0),
        data.get("reason"),
        now,
        now,
    ))

    # 4. Update buffer state
    if wrapped:
        c.execute("""
            UPDATE circular_buffer_state SET
                current_slot = ?, total_processed = total_processed + 1,
                last_wrap_timestamp = ?, updated_at = ?
            WHERE id = 1
        """, (next_slot, now, now))
    else:
        c.execute("""
            UPDATE circular_buffer_state SET
                current_slot = ?, total_processed = total_processed + 1,
                updated_at = ?
            WHERE id = 1
        """, (next_slot, now))

    conn.commit()

    return {
        "slot_id": next_slot,
        "total_processed": total_processed + 1,
        "wrapped": wrapped,
    }


# ────────────────────────────────────────────────────────────────────
# QUERY FUNCTIONS
# ────────────────────────────────────────────────────────────────────

def _row_to_dict(row) -> dict:
    """Convert sqlite3.Row to dict, parsing JSON fields."""
    d = dict(row)
    for json_field in ("applied_penalties", "applied_reductions", "fraud_indicators", "trust_indicators"):
        if d.get(json_field):
            try:
                d[json_field] = json.loads(d[json_field])
            except (json.JSONDecodeError, TypeError):
                pass
    return d


def get_recent_transactions(limit: int = 100) -> list:
    """Get the most recent N transactions ordered by timestamp DESC."""
    conn = _get_conn()
    c = conn.cursor()
    c.execute("""
        SELECT * FROM live_transactions
        WHERE transaction_id IS NOT NULL
        ORDER BY timestamp DESC
        LIMIT ?
    """, (limit,))
    return [_row_to_dict(r) for r in c.fetchall()]


def get_filtered_transactions(
    classification: str = None,
    status: str = None,
    min_score: float = None,
    limit: int = 100,
) -> list:
    """Get transactions with optional filters."""
    conn = _get_conn()
    c = conn.cursor()

    where_clauses = ["transaction_id IS NOT NULL"]
    params = []

    if classification:
        where_clauses.append("classification = ?")
        params.append(classification)
    if status:
        where_clauses.append("status = ?")
        params.append(status)
    if min_score is not None:
        where_clauses.append("internal_risk_score >= ?")
        params.append(min_score)

    params.append(limit)
    query = f"""
        SELECT * FROM live_transactions
        WHERE {' AND '.join(where_clauses)}
        ORDER BY timestamp DESC
        LIMIT ?
    """
    c.execute(query, params)
    return [_row_to_dict(r) for r in c.fetchall()]


def get_buffer_status() -> dict:
    """Get current circular buffer state."""
    conn = _get_conn()
    c = conn.cursor()
    c.execute("SELECT * FROM circular_buffer_state WHERE id = 1")
    row = c.fetchone()
    if not row:
        return {"current_slot": 0, "total_processed": 0, "buffer_full": False}

    total = row["total_processed"]
    return {
        "current_slot": row["current_slot"],
        "total_processed": total,
        "buffer_full": total >= MAX_BUFFER_SIZE,
        "last_wrap_timestamp": row["last_wrap_timestamp"],
        "updated_at": row["updated_at"],
        "max_buffer_size": MAX_BUFFER_SIZE,
    }


def get_graph_data(min_score: float = 50, timeframe_hours: int = 24) -> dict:
    """
    Get high-risk transaction data for Ring Explorer graph construction.
    Returns nodes (unique UPIs) and edges (transactions between them).
    """
    conn = _get_conn()
    c = conn.cursor()

    cutoff = (datetime.now(timezone.utc) - timedelta(hours=timeframe_hours)).isoformat()

    c.execute("""
        SELECT upi_id_sender, upi_id_receiver, internal_risk_score, amount,
               classification, fraud_indicators, transaction_id, timestamp
        FROM live_transactions
        WHERE transaction_id IS NOT NULL
          AND internal_risk_score >= ?
          AND timestamp >= ?
        ORDER BY timestamp DESC
        LIMIT 1000
    """, (min_score, cutoff))

    rows = c.fetchall()
    nodes = {}
    edges = []

    for r in rows:
        sender = r["upi_id_sender"]
        receiver = r["upi_id_receiver"]
        score = r["internal_risk_score"] or 0

        if sender and sender not in nodes:
            nodes[sender] = {"id": sender, "type": "sender", "risk": score, "txn_count": 0}
        if receiver and receiver not in nodes:
            nodes[receiver] = {"id": receiver, "type": "receiver", "risk": score, "txn_count": 0}

        if sender and sender in nodes:
            nodes[sender]["txn_count"] += 1
            nodes[sender]["risk"] = max(nodes[sender]["risk"], score)
        if receiver and receiver in nodes:
            nodes[receiver]["txn_count"] += 1
            nodes[receiver]["risk"] = max(nodes[receiver]["risk"], score)

        indicators = []
        try:
            indicators = json.loads(r["fraud_indicators"]) if r["fraud_indicators"] else []
        except (json.JSONDecodeError, TypeError):
            pass

        edges.append({
            "source": sender,
            "target": receiver,
            "risk_score": score,
            "amount": r["amount"],
            "classification": r["classification"],
            "fraud_indicators": indicators,
            "transaction_id": r["transaction_id"],
            "timestamp": r["timestamp"],
        })

    return {
        "nodes": list(nodes.values()),
        "edges": edges,
        "total_nodes": len(nodes),
        "total_edges": len(edges),
    }


def get_transaction_count_between(sender: str, receiver: str) -> int:
    """Count previous transactions from sender to receiver (for repeat beneficiary reduction)."""
    conn = _get_conn()
    c = conn.cursor()
    c.execute("""
        SELECT COUNT(*) as cnt FROM live_transactions
        WHERE upi_id_sender = ? AND upi_id_receiver = ?
          AND transaction_id IS NOT NULL
    """, (sender, receiver))
    row = c.fetchone()
    return row["cnt"] if row else 0


# ────────────────────────────────────────────────────────────────────
# DASHBOARD AGGREGATES
# ────────────────────────────────────────────────────────────────────

def compute_and_store_aggregates():
    """Compute dashboard statistics from live_transactions and store them."""
    conn = _get_conn()
    c = conn.cursor()
    now = datetime.now(timezone.utc)

    for window, delta in [("1_HOUR", timedelta(hours=1)), ("24_HOUR", timedelta(hours=24)), ("ALL_TIME", None)]:
        where = "transaction_id IS NOT NULL"
        params = []
        if delta:
            cutoff = (now - delta).isoformat()
            where += " AND timestamp >= ?"
            params.append(cutoff)

        c.execute(f"""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN classification = 'NO_FRAUD' THEN 1 ELSE 0 END) as no_fraud,
                SUM(CASE WHEN classification = 'FRAUD' THEN 1 ELSE 0 END) as fraud,
                AVG(internal_risk_score) as avg_score,
                SUM(amount) as total_amount,
                SUM(CASE WHEN status = 'BLOCKED' THEN amount ELSE 0 END) as blocked_amount,
                COUNT(DISTINCT upi_id_sender) as unique_senders,
                COUNT(DISTINCT upi_id_receiver) as unique_receivers
            FROM live_transactions
            WHERE {where}
        """, params)
        row = c.fetchone()

        total = row["total"] or 0
        fraud = row["fraud"] or 0
        no_fraud = row["no_fraud"] or 0
        fraud_rate = (fraud / total) if total > 0 else 0

        # Top fraud indicators
        c.execute(f"""
            SELECT fraud_indicators FROM live_transactions
            WHERE {where} AND classification = 'FRAUD'
            ORDER BY timestamp DESC LIMIT 200
        """, params)

        indicator_counts = {}
        for ind_row in c.fetchall():
            try:
                indicators = json.loads(ind_row["fraud_indicators"]) if ind_row["fraud_indicators"] else []
                for ind in indicators:
                    indicator_counts[ind] = indicator_counts.get(ind, 0) + 1
            except (json.JSONDecodeError, TypeError):
                pass

        top_indicators = sorted(indicator_counts.items(), key=lambda x: -x[1])[:10]

        c.execute("""
            INSERT INTO dashboard_aggregates (
                calculation_timestamp, time_window,
                total_transactions, no_fraud_count, fraud_count,
                fraud_rate, average_risk_score,
                total_amount, blocked_amount,
                top_fraud_indicators,
                unique_senders, unique_receivers
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            now.isoformat(), window,
            total, no_fraud, fraud,
            round(fraud_rate, 6), round(row["avg_score"] or 0, 2),
            round(row["total_amount"] or 0, 2), round(row["blocked_amount"] or 0, 2),
            json.dumps(top_indicators),
            row["unique_senders"] or 0, row["unique_receivers"] or 0,
        ))

    conn.commit()


def get_latest_aggregates(window: str = "1_HOUR") -> dict:
    """Get the most recent pre-computed aggregates for a time window."""
    conn = _get_conn()
    c = conn.cursor()
    c.execute("""
        SELECT * FROM dashboard_aggregates
        WHERE time_window = ?
        ORDER BY calculation_timestamp DESC
        LIMIT 1
    """, (window,))
    row = c.fetchone()
    if not row:
        return {
            "time_window": window,
            "total_transactions": 0, "no_fraud_count": 0, "fraud_count": 0,
            "fraud_rate": 0, "average_risk_score": 0,
            "total_amount": 0, "blocked_amount": 0,
            "top_fraud_indicators": [], "unique_senders": 0, "unique_receivers": 0,
        }

    d = dict(row)
    if d.get("top_fraud_indicators"):
        try:
            d["top_fraud_indicators"] = json.loads(d["top_fraud_indicators"])
        except (json.JSONDecodeError, TypeError):
            d["top_fraud_indicators"] = []
    return d


def get_hourly_trend(hours: int = 24) -> list:
    """Get hourly transaction counts for trend chart."""
    conn = _get_conn()
    c = conn.cursor()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()

    c.execute("""
        SELECT
            strftime('%Y-%m-%dT%H:00:00', timestamp) as hour,
            COUNT(*) as total,
            SUM(CASE WHEN classification = 'FRAUD' THEN 1 ELSE 0 END) as fraud,
            SUM(CASE WHEN classification = 'NO_FRAUD' THEN 1 ELSE 0 END) as no_fraud
        FROM live_transactions
        WHERE transaction_id IS NOT NULL AND timestamp >= ?
        GROUP BY strftime('%Y-%m-%dT%H:00:00', timestamp)
        ORDER BY hour ASC
    """, (cutoff,))

    return [dict(r) for r in c.fetchall()]


# ────────────────────────────────────────────────────────────────────
# PATTERN DETECTION (for Ring Explorer)
# ────────────────────────────────────────────────────────────────────

def detect_fraud_patterns(timeframe_hours: int = 24) -> list:
    """
    Detect suspicious patterns from live_transactions.
    Returns a list of detected pattern dicts.
    """
    conn = _get_conn()
    c = conn.cursor()
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=timeframe_hours)).isoformat()
    patterns = []

    # Fan-out: one sender → many receivers
    c.execute("""
        SELECT upi_id_sender, COUNT(DISTINCT upi_id_receiver) as recv_count,
               SUM(amount) as total_amount, COUNT(*) as txn_count
        FROM live_transactions
        WHERE transaction_id IS NOT NULL AND timestamp >= ?
        GROUP BY upi_id_sender
        HAVING recv_count >= 5
        ORDER BY recv_count DESC
        LIMIT 20
    """, (cutoff,))
    for r in c.fetchall():
        patterns.append({
            "type": "fan_out",
            "label": "Fan-Out (Money Dispersal)",
            "center_node": r["upi_id_sender"],
            "connected_count": r["recv_count"],
            "total_amount": r["total_amount"],
            "txn_count": r["txn_count"],
        })

    # Fan-in: many senders → one receiver
    c.execute("""
        SELECT upi_id_receiver, COUNT(DISTINCT upi_id_sender) as sender_count,
               SUM(amount) as total_amount, COUNT(*) as txn_count
        FROM live_transactions
        WHERE transaction_id IS NOT NULL AND timestamp >= ?
        GROUP BY upi_id_receiver
        HAVING sender_count >= 5
        ORDER BY sender_count DESC
        LIMIT 20
    """, (cutoff,))
    for r in c.fetchall():
        patterns.append({
            "type": "fan_in",
            "label": "Fan-In (Money Collection)",
            "center_node": r["upi_id_receiver"],
            "connected_count": r["sender_count"],
            "total_amount": r["total_amount"],
            "txn_count": r["txn_count"],
        })

    return patterns


# Initialise DB on import
init_live_db()
