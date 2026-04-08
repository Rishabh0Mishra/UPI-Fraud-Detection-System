"""
05_realtime_api.py
==================
UPI Fraud Detection — Production FastAPI Inference Server

Provides real-time transaction scoring with:
  POST /score       — single transaction scoring
  POST /score/batch — batch up to 100 transactions
  GET  /health      — health check + model metadata
  GET  /stats       — running detection stats

Target latency: <50ms per transaction (typically 5–15ms)

Run:
    cd api
    uvicorn 05_realtime_api:app --host 0.0.0.0 --port 8000 --workers 4
"""

import os
import sys
import json
import time
import pickle
import logging
import asyncio
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List
from collections import defaultdict, deque

import numpy as np

# ── FastAPI / Pydantic ──
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

# ────────────────────────────────────────────────────────────────────
# LOGGING
# ────────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("upi_fraud_api")

# ────────────────────────────────────────────────────────────────────
# PATHS — models/ and data/ are one level up from api/
# ────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = BASE_DIR / "models"
DATA_DIR = BASE_DIR / "data"

# ────────────────────────────────────────────────────────────────────
# SCHEMAS
# ────────────────────────────────────────────────────────────────────

class TransactionRequest(BaseModel):
    transaction_id: str
    sender_user_id: str
    receiver_id: str
    payee_name: Optional[str] = None
    amount: float = Field(..., gt=0, le=10_000_000)
    timestamp: Optional[str] = None
    transaction_type: Optional[str] = "P2P"

    # Sender profile (provided by platform at runtime)
    sender_age: Optional[float] = None
    sender_account_age_days: Optional[float] = None
    sender_kyc_level: Optional[str] = None
    sender_income_tier: Optional[str] = None
    sender_avg_txn_amount: Optional[float] = 500.0
    sender_preferred_hour: Optional[float] = 12.0
    sender_hour_std: Optional[float] = 4.0
    sender_vulnerability_score: Optional[float] = 0.3
    sender_avg_typing_speed_ms: Optional[float] = 280.0
    sender_avg_session_duration_s: Optional[float] = 45.0
    sender_avg_touch_pressure: Optional[float] = 0.45
    sender_typical_swipe_velocity: Optional[float] = 450.0

    # Receiver context
    receiver_is_merchant: Optional[int] = 0
    receiver_is_fake_merchant: Optional[int] = 0
    receiver_is_verified_merchant: Optional[int] = 0


class BatchRequest(BaseModel):
    transactions: List[TransactionRequest] = Field(..., max_length=100)


class TransactionResponse(BaseModel):
    transaction_id: str
    decision: str                               # Legacy (BLOCK/REVIEW/ALLOW)
    classification: str = "NO_FRAUD"             # Binary: FRAUD / NO_FRAUD
    status: str = "ALLOWED"                      # ALLOWED / WARNING / BLOCKED
    risk_level: str = ""                         # Internal only
    user_message: Optional[str] = None
    fraud_score: float                           # 0-1 legacy
    internal_risk_score: float = 0               # 0-100 background score
    lgbm_score: float
    graph_risk_score: float
    base_score: float = 0
    penalty_total: float = 0
    reduction_total: float = 0
    applied_penalties: Optional[dict] = None
    applied_reductions: Optional[dict] = None
    fraud_indicators: Optional[list] = None
    trust_indicators: Optional[list] = None
    reason: Optional[str] = None
    latency_ms: float
    timestamp: str


class BatchResponse(BaseModel):
    results: List[TransactionResponse]
    total_latency_ms: float


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    n_features: int
    block_threshold: float
    review_threshold: float
    n_ring_members: int
    n_ring_controllers: int
    n_graph_risk_entries: int
    uptime_seconds: float


class StatsResponse(BaseModel):
    total_scored: int
    total_blocked: int
    total_reviewed: int
    total_allowed: int
    total_fraud: int = 0
    total_no_fraud: int = 0
    fraud_rate: float = 0.0
    block_rate: float
    review_rate: float
    uptime_seconds: float


# ────────────────────────────────────────────────────────────────────
# MODEL REGISTRY — loads all models once at startup
# ────────────────────────────────────────────────────────────────────

class ModelRegistry:
    """Holds all pre-loaded models and lookup tables for O(1) inference."""

    def __init__(self):
        self.lgbm_model = None
        self.model_config = None
        self.ensemble_config = None
        self.calibrator = None
        self.graph_risk_lookup = {}     # {user_id: float}
        self.ring_members = set()
        self.ring_controllers = set()
        self.ring_membership = {}       # {user_id: ring_id}
        self.feature_cols = []
        self.encoding_map = {}
        self.block_threshold = 0.5
        self.review_threshold = 0.1
        self.lgbm_weight = 0.75
        self.graph_weight = 0.25
        self.approved_handles = set()
        self.loaded = False

    def load(self):
        """Load all serialised artefacts from models/ and data/."""
        logger.info("Loading model registry ...")

        # ── LightGBM Model ──
        model_path = MODELS_DIR / "lgbm_fraud_model.pkl"
        if model_path.exists():
            with open(model_path, "rb") as f:
                self.lgbm_model = pickle.load(f)
            logger.info(f"  LightGBM model loaded from {model_path}")
        else:
            logger.error(f"  Model not found: {model_path}")
            raise FileNotFoundError(f"Model not found: {model_path}")

        # ── Model Config ──
        config_path = MODELS_DIR / "model_config.json"
        if config_path.exists():
            with open(config_path, "r") as f:
                self.model_config = json.load(f)
            self.feature_cols = self.model_config.get("feature_cols", [])
            self.encoding_map = self.model_config.get("encoding_map", {})
            logger.info(f"  Model config loaded: {len(self.feature_cols)} features")

        # ── Ensemble Config ──
        ensemble_path = MODELS_DIR / "ensemble_config.json"
        if ensemble_path.exists():
            with open(ensemble_path, "r") as f:
                self.ensemble_config = json.load(f)
            self.block_threshold = self.ensemble_config.get("block_threshold", 0.5)
            self.review_threshold = self.ensemble_config.get("review_threshold", 0.1)
            self.lgbm_weight = self.ensemble_config.get("lgbm_weight", 0.75)
            self.graph_weight = self.ensemble_config.get("graph_weight", 0.25)
            logger.info(f"  Ensemble config: BLOCK≥{self.block_threshold:.4f}, "
                        f"REVIEW≥{self.review_threshold:.4f}")

        # ── Calibrator ──
        cal_path = MODELS_DIR / "score_calibrator.pkl"
        if cal_path.exists():
            with open(cal_path, "rb") as f:
                self.calibrator = pickle.load(f)
            logger.info(f"  Score calibrator loaded")

        # ── Graph Risk Scores ──
        graph_path = MODELS_DIR / "graph_risk_scores.pkl"
        if graph_path.exists():
            with open(graph_path, "rb") as f:
                self.graph_risk_lookup = pickle.load(f)
            logger.info(f"  Graph risk scores: {len(self.graph_risk_lookup):,} entries")

        # ── Fraud Rings ──
        ring_path = DATA_DIR / "upi_fraud_rings.json"
        if ring_path.exists():
            with open(ring_path, "r") as f:
                rings = json.load(f)
            for ring_id, ring_data in rings.items():
                ring_type = ring_data.get("type", "unknown")
                if ring_type == "hub_spoke":
                    controller = ring_data.get("controller", "")
                    self.ring_controllers.add(controller)
                    for m in ring_data.get("all_members", []):
                        self.ring_members.add(m)
                        self.ring_membership[m] = ring_id
                elif ring_type == "collusive":
                    for m in ring_data.get("members", []):
                        self.ring_members.add(m)
                        self.ring_membership[m] = ring_id
            logger.info(f"  Ring members: {len(self.ring_members)}, "
                        f"controllers: {len(self.ring_controllers)}")

        # ── NPCI Approved Handles ──
        try:
            from fraud_enhancements import load_approved_handles
            self.approved_handles = load_approved_handles()
            logger.info(f"  Approved UPI handles: {len(self.approved_handles)}")
        except Exception as e:
            logger.error(f"  Failed to load approved handles: {e}")
            self.approved_handles = set()

        self.loaded = True
        logger.info("Model registry ready ✓")


# ────────────────────────────────────────────────────────────────────
# IN-MEMORY ROLLING WINDOW STORE (Redis fallback)
# ────────────────────────────────────────────────────────────────────

class RollingWindowStore:
    """
    Stores recent transactions per user for velocity feature computation.
    Uses Redis if available, falls back to in-memory dict.

    Each entry: (timestamp_epoch, amount, receiver_id)
    """

    def __init__(self):
        self.redis_client = None
        self.in_memory = defaultdict(deque)  # {user_id: deque of (ts, amt, recv)}
        self.ttl_hours = 25
        self._try_redis()

    def _try_redis(self):
        """Try to connect to Redis, fall back to in-memory."""
        try:
            import redis
            r = redis.Redis(host="localhost", port=6379, db=0, socket_timeout=1)
            r.ping()
            self.redis_client = r
            logger.info("  Redis connected for rolling window store")
        except Exception:
            logger.info("  Redis unavailable — using in-memory rolling window store")
            self.redis_client = None

    def add_transaction(self, user_id: str, ts_epoch: float, amount: float, receiver_id: str):
        """Record a transaction."""
        if self.redis_client:
            try:
                key = f"txn:{user_id}"
                entry = f"{ts_epoch}:{amount}:{receiver_id}"
                self.redis_client.zadd(key, {entry: ts_epoch})
                self.redis_client.expire(key, self.ttl_hours * 3600)
                return
            except Exception:
                pass

        # In-memory fallback
        self.in_memory[user_id].append((ts_epoch, amount, receiver_id))
        # Trim old entries (>25h)
        cutoff = ts_epoch - self.ttl_hours * 3600
        while self.in_memory[user_id] and self.in_memory[user_id][0][0] < cutoff:
            self.in_memory[user_id].popleft()

    def get_window(self, user_id: str, ts_epoch: float, window_hours: float):
        """Get transactions in the lookback window."""
        cutoff = ts_epoch - window_hours * 3600

        if self.redis_client:
            try:
                key = f"txn:{user_id}"
                entries = self.redis_client.zrangebyscore(key, cutoff, ts_epoch)
                result = []
                for entry in entries:
                    parts = entry.decode("utf-8").split(":", 2)
                    if len(parts) == 3:
                        result.append((float(parts[0]), float(parts[1]), parts[2]))
                return result
            except Exception:
                pass

        # In-memory fallback
        result = []
        for ts, amt, recv in self.in_memory.get(user_id, []):
            if cutoff <= ts < ts_epoch:  # Exclude current timestamp (look-back only)
                result.append((ts, amt, recv))
        return result

    def compute_velocity_features(self, user_id: str, ts_epoch: float):
        """Compute rolling velocity features for a user at a given time."""
        # 1-hour window
        window_1h = self.get_window(user_id, ts_epoch, 1.0)
        txn_count_1h = len(window_1h)
        amount_sum_1h = sum(amt for _, amt, _ in window_1h)
        unique_recv_1h = len(set(recv for _, _, recv in window_1h))

        # 24-hour window
        window_24h = self.get_window(user_id, ts_epoch, 24.0)
        txn_count_24h = len(window_24h)
        amount_sum_24h = sum(amt for _, amt, _ in window_24h)
        unique_recv_24h = len(set(recv for _, _, recv in window_24h))

        return {
            "txn_count_1h": txn_count_1h,
            "amount_sum_1h": amount_sum_1h,
            "unique_recv_1h": unique_recv_1h,
            "txn_count_24h": txn_count_24h,
            "amount_sum_24h": amount_sum_24h,
            "unique_recv_24h": unique_recv_24h,
        }


# ────────────────────────────────────────────────────────────────────
# SCORING ENGINE
# ────────────────────────────────────────────────────────────────────

class ScoringEngine:
    """Core scoring pipeline — matches training feature schema exactly."""

    def __init__(self, registry: ModelRegistry, window_store: RollingWindowStore):
        self.reg = registry
        self.ws = window_store

        # Pre-compute encoding maps
        self.kyc_map = {"none": 0, "basic": 1, "partial": 2, "full": 3}
        self.income_map = {"low": 0, "lower_middle": 1, "middle": 2, "upper_middle": 3, "high": 4}

        # Transaction type encoding from model config
        self.txn_type_map = self.reg.encoding_map.get("transaction_type", {})

    def score(self, txn: TransactionRequest) -> TransactionResponse:
        """Score a single transaction with binary classification."""
        t_start = time.perf_counter()

        # 1. Parse timestamp
        if txn.timestamp:
            try:
                ts = datetime.fromisoformat(txn.timestamp)
            except ValueError:
                ts = datetime.now(timezone.utc)
        else:
            ts = datetime.now(timezone.utc)
        ts_epoch = ts.timestamp()
        hour = ts.hour
        dow = ts.weekday()

        # Tracking structures
        penalties = {}
        fraud_indicators = []
        trust_indicators = []

        # 2. Check ring membership
        sender_in_ring = txn.sender_user_id in self.reg.ring_members
        sender_is_controller = txn.sender_user_id in self.reg.ring_controllers
        receiver_in_ring = txn.receiver_id in self.reg.ring_members
        receiver_is_controller = txn.receiver_id in self.reg.ring_controllers

        sender_ring = self.reg.ring_membership.get(txn.sender_user_id, "")
        receiver_ring = self.reg.ring_membership.get(txn.receiver_id, "")
        intra_ring = sender_ring != "" and receiver_ring != "" and sender_ring == receiver_ring

        # 3. Imports
        from fraud_enhancements import (
            check_upi_handle_validity,
            check_name_upi_mismatch,
            check_report_threshold,
            get_risk_level_updated,
            classify_binary,
            calculate_name_penalty,
            calculate_report_penalty,
        )

        # Helper to build hard-block response with binary classification
        def _hard_block(reason, message=None):
            latency = (time.perf_counter() - t_start) * 1000
            self.ws.add_transaction(txn.sender_user_id, ts_epoch, txn.amount, txn.receiver_id)
            binary = classify_binary(100.0, [reason])
            risk_info = get_risk_level_updated(100.0)

            resp = TransactionResponse(
                transaction_id=txn.transaction_id,
                decision="BLOCK",
                classification=binary["classification"],
                status=binary["status"],
                risk_level=risk_info["level"],
                user_message=message or binary["user_message"],
                fraud_score=1.0,
                internal_risk_score=100.0,
                lgbm_score=1.0,
                graph_risk_score=1.0,
                base_score=100.0,
                penalty_total=100.0,
                reduction_total=0,
                applied_penalties={reason: 100},
                applied_reductions={},
                fraud_indicators=[reason],
                trust_indicators=[],
                reason=reason,
                latency_ms=round(latency, 2),
                timestamp=ts.isoformat(),
            )
            # Insert into circular buffer
            _insert_to_buffer(resp, txn)
            logger.info(f"TXN={txn.transaction_id} DECISION=BLOCK CLASSIFICATION=FRAUD REASON={reason}")
            return resp

        def _insert_to_buffer(resp, txn):
            try:
                from circular_buffer import insert_transaction
                insert_transaction({
                    "transaction_id": resp.transaction_id,
                    "timestamp": resp.timestamp,
                    "upi_id_sender": txn.sender_user_id,
                    "upi_id_receiver": txn.receiver_id,
                    "payee_name": txn.payee_name,
                    "amount": txn.amount,
                    "transaction_type": txn.transaction_type,
                    "internal_risk_score": resp.internal_risk_score,
                    "risk_level": resp.risk_level,
                    "classification": resp.classification,
                    "status": resp.status,
                    "confidence": min(1.0, resp.internal_risk_score / 100.0),
                    "base_score": resp.base_score,
                    "penalty_total": resp.penalty_total,
                    "reduction_total": resp.reduction_total,
                    "applied_penalties": resp.applied_penalties or {},
                    "applied_reductions": resp.applied_reductions or {},
                    "fraud_indicators": resp.fraud_indicators or [],
                    "trust_indicators": resp.trust_indicators or [],
                    "name_similarity_score": None,
                    "handle_valid": resp.reason != "invalid_upi_handle",
                    "report_count": 0,
                    "lgbm_score": resp.lgbm_score,
                    "graph_risk_score": resp.graph_risk_score,
                    "processing_time_ms": resp.latency_ms,
                    "reason": resp.reason,
                })
            except Exception as e:
                logger.error(f"Failed to insert into circular buffer: {e}")

        # 3a. UPI Handle Validity Check
        handle_res = check_upi_handle_validity(txn.receiver_id, self.reg.approved_handles)
        if not handle_res['is_valid_handle']:
            return _hard_block("invalid_upi_handle", handle_res['message'])

        # 3b. Community report check
        report_res = check_report_threshold(txn.receiver_id)
        report_penalty = calculate_report_penalty(
            report_res.get('report_count', 0),
            report_res.get('confirmed_fraud_count', 0)
        )
        if report_penalty.get("force_fraud"):
            return _hard_block("confirmed_fraud_5plus_reports", report_res.get('warning_message'))
        if report_res['is_flagged'] and report_res.get('confirmed_fraud_count', 0) >= 2:
            return _hard_block("confirmed_fraud_reports",
                               get_risk_level_updated(100.0)['user_message'] +
                               f"\nReason: {report_res['warning_message']}")

        # 3c. Existing Hard blocks (ring/fake merchant/extreme amount)
        hard_reason = None
        if sender_is_controller:
            hard_reason = "sender_is_known_controller"
        elif intra_ring:
            hard_reason = "intra_ring_transfer"
        elif txn.receiver_is_fake_merchant == 1:
            hard_reason = "receiver_is_fake_merchant"
        elif txn.amount / (txn.sender_avg_txn_amount + 1e-6) > 50:
            hard_reason = "extreme_amount_ratio"

        if hard_reason:
            return _hard_block(hard_reason)

        # 4. Rolling window features
        velocity = self.ws.compute_velocity_features(txn.sender_user_id, ts_epoch)

        # 5. Assemble feature vector
        feature_vec = self._build_feature_vector(txn, hour, dow, velocity,
                                                  sender_in_ring, sender_is_controller,
                                                  receiver_in_ring, receiver_is_controller,
                                                  intra_ring)

        # 6. LightGBM predict
        import pandas as pd
        X = pd.DataFrame([feature_vec], columns=self.reg.feature_cols)
        X = X.fillna(0).replace([np.inf, -np.inf], 0)
        lgbm_score = float(self.reg.lgbm_model.predict_proba(X)[:, 1][0])

        # 7. Graph risk lookup
        graph_score = self.reg.graph_risk_lookup.get(txn.sender_user_id, 0.0)

        # 8. Ensemble blend
        ensemble = self.reg.lgbm_weight * lgbm_score + self.reg.graph_weight * graph_score

        # 9. Calibrate
        if self.reg.calibrator is not None:
            fraud_score = float(
                self.reg.calibrator.predict_proba([[ensemble]])[0, 1]
            )
        else:
            fraud_score = ensemble

        # Scale to 0-100 for base score
        base_score = round(fraud_score * 100.0, 2)

        # ── STEP 2: Apply Penalties ──
        name_sim_score = None
        if txn.payee_name:
            sim_res = check_name_upi_mismatch(txn.payee_name, txn.receiver_id)
            name_sim_score = sim_res.get('similarity_score', 1.0)
            name_pen = calculate_name_penalty(name_sim_score)
            if name_pen["penalty"] > 0:
                penalties[name_pen["indicator"]] = name_pen["penalty"]
                fraud_indicators.append(name_pen["indicator"])

        if report_penalty["penalty"] > 0:
            penalties[report_penalty["indicator"]] = report_penalty["penalty"]
            fraud_indicators.append(report_penalty["indicator"])

        penalty_total = sum(penalties.values())
        score_after_penalties = min(100, base_score + penalty_total)

        # ── STEP 3: Apply Reduction Factors ──
        has_any_reports = report_res.get('report_count', 0) > 0
        try:
            from scan_history import calculate_all_reductions
            red_result = calculate_all_reductions(
                upi_id_receiver=txn.receiver_id,
                upi_id_sender=txn.sender_user_id,
                amount=txn.amount,
                hour=hour,
                sender_avg_amount=txn.sender_avg_txn_amount or 500,
                receiver_is_verified_merchant=bool(txn.receiver_is_verified_merchant),
                current_score=score_after_penalties,
                has_any_fraud_reports=has_any_reports,
                has_invalid_handle=False,
            )
            reductions = red_result["reductions"]
            reduction_capped = red_result["capped_total"]
            trust_indicators = list(reductions.keys())
        except Exception as e:
            logger.error(f"Reduction calc failed: {e}")
            reductions = {}
            reduction_capped = 0

        # ── STEP 4: Final Score ──
        final_score = round(max(0, min(100, score_after_penalties + reduction_capped)), 2)

        # ── STEP 5: Binary Classification ──
        binary = classify_binary(final_score, fraud_indicators)
        risk_info = get_risk_level_updated(final_score)

        # Legacy decision mapping
        if final_score >= 80:
            decision = "BLOCK"
        elif final_score >= 50:
            decision = "REVIEW"
        else:
            decision = "ALLOW"

        # Build user message
        final_msg = binary["user_message"]
        if txn.payee_name and name_sim_score is not None and name_sim_score < 0.5:
            sim_res = check_name_upi_mismatch(txn.payee_name, txn.receiver_id)
            if sim_res.get('warning_message'):
                final_msg += "\n\n" + sim_res['warning_message']
        if report_res['is_flagged']:
            final_msg += "\n\n" + report_res.get('warning_message', '')

        # Record in rolling window
        self.ws.add_transaction(txn.sender_user_id, ts_epoch, txn.amount, txn.receiver_id)

        latency = (time.perf_counter() - t_start) * 1000
        logger.info(
            f"TXN={txn.transaction_id}  SENDER={txn.sender_user_id}  "
            f"AMT=₹{txn.amount:.0f}  SCORE={final_score:.2f}  "
            f"CLASS={binary['classification']}  DECISION={decision}  LAT={latency:.1f}ms"
        )

        resp = TransactionResponse(
            transaction_id=txn.transaction_id,
            decision=decision,
            classification=binary["classification"],
            status=binary["status"],
            risk_level=risk_info["level"],
            user_message=final_msg,
            fraud_score=round(fraud_score, 6),
            internal_risk_score=final_score,
            lgbm_score=round(lgbm_score, 6),
            graph_risk_score=round(graph_score, 6),
            base_score=base_score,
            penalty_total=round(penalty_total, 2),
            reduction_total=round(reduction_capped, 2),
            applied_penalties=penalties if penalties else None,
            applied_reductions=reductions if reductions else None,
            fraud_indicators=fraud_indicators if fraud_indicators else None,
            trust_indicators=trust_indicators if trust_indicators else None,
            reason=None,
            latency_ms=round(latency, 2),
            timestamp=ts.isoformat(),
        )

        # Insert into circular buffer
        _insert_to_buffer(resp, txn)

        return resp

    def _build_feature_vector(self, txn, hour, dow, velocity,
                               sender_in_ring, sender_is_controller,
                               receiver_in_ring, receiver_is_controller,
                               intra_ring):
        """
        Build a feature dict matching self.reg.feature_cols exactly.
        Missing features are filled with 0.
        """
        avg_txn = txn.sender_avg_txn_amount or 500.0
        log_amount = float(np.log1p(txn.amount))
        amount_ratio = txn.amount / (avg_txn + 1e-6)
        pref_hour = txn.sender_preferred_hour or 12.0
        hour_std = txn.sender_hour_std or 4.0
        hour_dev = min(abs(hour - pref_hour), 12)
        hour_zscore = hour_dev / (hour_std + 1e-6)
        vuln = txn.sender_vulnerability_score or 0.3
        acct_age = txn.sender_account_age_days or 365

        # Build complete feature dict
        features = {
            # Amount
            "log_amount": log_amount,
            "amount_ratio": amount_ratio,
            "is_round_amount": int(txn.amount % 100 == 0),
            "is_high_value": int(txn.amount > 10000),
            "amount_vs_merchant_avg": 0.0,
            # Time
            "hour_of_day": hour,
            "day_of_week": dow,
            "is_weekend": int(dow >= 5),
            "is_night": int(hour >= 22 or hour <= 5),
            "is_peak_morning": int(8 <= hour <= 10),
            "is_peak_evening": int(18 <= hour <= 21),
            "hour_deviation": hour_dev,
            "hour_zscore": hour_zscore,
            # Sender profile
            "sender_account_age_days_feat": acct_age,
            "sender_is_new_account": int(acct_age < 30),
            "sender_is_young_account": int(acct_age < 90),
            "sender_kyc_ordinal": self.kyc_map.get(txn.sender_kyc_level or "basic", 1),
            "sender_income_ordinal": self.income_map.get(txn.sender_income_tier or "middle", 2),
            "vuln_x_amount": vuln * log_amount,
            # Ring
            "sender_in_ring": int(sender_in_ring),
            "sender_is_controller": int(sender_is_controller),
            "receiver_in_ring": int(receiver_in_ring),
            "receiver_is_controller": int(receiver_is_controller),
            "intra_ring_txn": int(intra_ring),
            # Merchant
            "receiver_is_merchant": txn.receiver_is_merchant or 0,
            "receiver_is_fake_merchant": txn.receiver_is_fake_merchant or 0,
            "receiver_is_verified_merchant": txn.receiver_is_verified_merchant or 0,
            "receiver_registered_months_ago": 0.0,
            # Geo
            "geo_distance_km": 0.0,
            # Device
            "device_changed": 0,
            # Biometrics
            "sender_avg_typing_speed_ms": txn.sender_avg_typing_speed_ms or 280.0,
            "sender_avg_session_duration_s": txn.sender_avg_session_duration_s or 45.0,
            "sender_avg_touch_pressure": txn.sender_avg_touch_pressure or 0.45,
            "sender_typical_swipe_velocity": txn.sender_typical_swipe_velocity or 450.0,
            # Rolling velocity
            "txn_count_1h": velocity["txn_count_1h"],
            "amount_sum_1h": velocity["amount_sum_1h"],
            "unique_recv_1h": velocity["unique_recv_1h"],
            "txn_count_24h": velocity["txn_count_24h"],
            "amount_sum_24h": velocity["amount_sum_24h"],
            "unique_recv_24h": velocity["unique_recv_24h"],
            # Extra
            "multiple_pin_attempts": 0,
            "app_not_legitimate": 0,
            "is_new_beneficiary": 0,
            # Encoded categoricals
            "transaction_type_encoded": self.txn_type_map.get(txn.transaction_type or "P2P", 0),
            "sender_gender_encoded": 0,
            "sender_state_encoded": 0,
            "sender_device_brand_encoded": 0,
            "sender_primary_app_encoded": 0,
            "sender_ring_type_encoded": 0,
            "receiver_ring_type_encoded": 0,
            "receiver_category_encoded": 0,
            # Vulnerability direct
            "sender_vulnerability_score_direct": vuln,
        }

        # Build ordered vector matching feature_cols
        return [features.get(col, 0.0) for col in self.reg.feature_cols]


# ────────────────────────────────────────────────────────────────────
# DETECTION STATS
# ────────────────────────────────────────────────────────────────────

class DetectionStats:
    """Running statistics tracker."""

    def __init__(self):
        self.total_scored = 0
        self.total_blocked = 0
        self.total_reviewed = 0
        self.total_allowed = 0
        self.total_fraud = 0
        self.total_no_fraud = 0
        self.start_time = time.time()

    def record(self, decision: str, classification: str = "NO_FRAUD"):
        self.total_scored += 1
        if decision == "BLOCK":
            self.total_blocked += 1
        elif decision == "REVIEW":
            self.total_reviewed += 1
        else:
            self.total_allowed += 1
        if classification == "FRAUD":
            self.total_fraud += 1
        else:
            self.total_no_fraud += 1

    @property
    def uptime(self):
        return time.time() - self.start_time


# ────────────────────────────────────────────────────────────────────
# FASTAPI APPLICATION
# ────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="UPI Fraud Detection API",
    description="Real-time UPI transaction fraud scoring with LightGBM + Graph Risk ensemble",
    version="1.0.0",
)

# CORS — allow frontend dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global objects — initialised at startup
registry = ModelRegistry()
window_store = RollingWindowStore()
scorer: Optional[ScoringEngine] = None
stats = DetectionStats()


@app.on_event("startup")
async def startup():
    """Load all models and initialise scoring engine."""
    global scorer
    try:
        registry.load()
        scorer = ScoringEngine(registry, window_store)
        logger.info("=" * 50)
        logger.info("  UPI Fraud Detection API — READY")
        logger.info(f"  Features:    {len(registry.feature_cols)}")
        logger.info(f"  BLOCK ≥      {registry.block_threshold:.6f}")
        logger.info(f"  REVIEW ≥     {registry.review_threshold:.6f}")
        logger.info("=" * 50)
    except Exception as e:
        logger.error(f"Failed to load models: {e}")
        raise


# ── POST /score ──────────────────────────────────────────────────

@app.post("/score", response_model=TransactionResponse)
async def score_transaction(txn: TransactionRequest):
    """Score a single UPI transaction."""
    if scorer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    result = scorer.score(txn)
    stats.record(result.decision, result.classification)
    return result


# ── POST /score/batch ────────────────────────────────────────────

@app.post("/score/batch", response_model=BatchResponse)
async def score_batch(batch: BatchRequest):
    """Score a batch of up to 100 transactions."""
    if scorer is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t_start = time.perf_counter()
    results = []
    for txn in batch.transactions:
        result = scorer.score(txn)
        stats.record(result.decision, result.classification)
        results.append(result)
    total_latency = (time.perf_counter() - t_start) * 1000

    return BatchResponse(results=results, total_latency_ms=round(total_latency, 2))

# ── POST /report ─────────────────────────────────────────────────

class ReportRequest(BaseModel):
    upi_id: str = None
    fraud_identifier: str = None
    report_type: str = 'UPI_ID'
    reporter_user_id: str = 'anonymous'
    report_reason: str = 'Suspicious'
    fraud_occurred: bool = False
    amount_lost: float = 0.0
    additional_notes: Optional[str] = None
    upi_id_extracted: Optional[str] = None

@app.post("/report")
async def submit_report(req: ReportRequest):
    """Submit a fraud report for any identifier (UPI ID, URL, QR, etc)."""
    from fraud_enhancements import submit_fraud_report
    identifier = req.fraud_identifier or req.upi_id or ''
    if not identifier:
        raise HTTPException(status_code=400, detail="No identifier provided")
    res = submit_fraud_report(
        fraud_identifier=identifier,
        report_type=req.report_type,
        reporter_user_id=req.reporter_user_id,
        report_reason=req.report_reason,
        fraud_confirmed=req.fraud_occurred,
        amount_lost=req.amount_lost,
        additional_notes=req.additional_notes,
        upi_id_extracted=req.upi_id_extracted
    )
    return res

# ── POST /vouch (Mark as Safe) ───────────────────────────────────

class VouchRequest(BaseModel):
    identifier: str
    vouch_type: str = 'UPI_ID'
    user_id: str = 'anonymous'

@app.post("/vouch")
async def vouch_safe(req: VouchRequest):
    """Mark an identifier as safe — reduces its fraud report count."""
    from fraud_enhancements import submit_vouch
    if not req.identifier:
        raise HTTPException(status_code=400, detail="No identifier provided")
    return submit_vouch(
        identifier=req.identifier,
        vouch_type=req.vouch_type,
        user_id=req.user_id,
    )


# ── POST /validate-upi ───────────────────────────────────────────

class ValidateUPIRequest(BaseModel):
    upi_id: str

@app.post("/validate-upi")
async def validate_upi(req: ValidateUPIRequest):
    """3-step UPI validation: format → handle → fraud reports."""
    from fraud_enhancements import validate_upi_format, check_fraud_reports

    # Step 1: Format validation
    fmt = validate_upi_format(req.upi_id)
    if not fmt['is_valid']:
        return {
            'valid': False,
            'step_failed': 'FORMAT',
            'error_type': fmt['error_type'],
            'message': fmt['error_message'],
            'risk_score': 100
        }

    # Step 2: Handle validation
    handle = fmt['handle']
    if registry.approved_handles and handle not in registry.approved_handles:
        return {
            'valid': False,
            'step_failed': 'HANDLE',
            'error_type': 'INVALID_HANDLE',
            'handle': handle,
            'username': fmt['username'],
            'message': (
                f'🚨 FRAUDULENT UPI ID DETECTED!\n\n'
                f'The UPI handle "@{handle}" is NOT recognized by NPCI.\n\n'
                f'✓ Valid handles: @paytm, @phonepe, @googlepay, @okaxis, @ybl\n'
                f'✗ Detected: @{handle}\n\n'
                f'⚠️ This is a CONFIRMED SCAM.\nDO NOT PROCEED!'
            ),
            'risk_score': 100
        }

    # Step 3: Fraud report check
    reports = check_fraud_reports(req.upi_id)
    return {
        'valid': True,
        'step_failed': None,
        'username': fmt['username'],
        'handle': handle,
        'reports': reports,
        'risk_score': reports.get('risk_adjustment', 0)
    }


# ── GET /check-reports/{identifier} ──────────────────────────────

@app.get("/check-reports/{identifier:path}")
async def get_fraud_reports(identifier: str):
    """Check if an identifier has been reported as fraud."""
    from fraud_enhancements import check_fraud_reports
    return check_fraud_reports(identifier)


@app.get("/approved_handles")
async def get_approved_handles():
    """Get list of NPCI approved handles."""
    if registry is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"handles": list(registry.approved_handles)}


# ── GET /health ──────────────────────────────────────────────────

@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check with model metadata."""
    return HealthResponse(
        status="healthy" if registry.loaded else "unhealthy",
        model_loaded=registry.loaded,
        n_features=len(registry.feature_cols),
        block_threshold=registry.block_threshold,
        review_threshold=registry.review_threshold,
        n_ring_members=len(registry.ring_members),
        n_ring_controllers=len(registry.ring_controllers),
        n_graph_risk_entries=len(registry.graph_risk_lookup),
        uptime_seconds=round(stats.uptime, 1),
    )


# ── GET /stats ───────────────────────────────────────────────────

@app.get("/stats", response_model=StatsResponse)
async def get_stats():
    """Running detection statistics."""
    total = max(stats.total_scored, 1)
    return StatsResponse(
        total_scored=stats.total_scored,
        total_blocked=stats.total_blocked,
        total_reviewed=stats.total_reviewed,
        total_allowed=stats.total_allowed,
        total_fraud=stats.total_fraud,
        total_no_fraud=stats.total_no_fraud,
        fraud_rate=round(stats.total_fraud / total, 4),
        block_rate=round(stats.total_blocked / total, 4),
        review_rate=round(stats.total_reviewed / total, 4),
        uptime_seconds=round(stats.uptime, 1),
    )


# ────────────────────────────────────────────────────────────────────
# WEBSOCKET — LIVE FEED STREAMING
# ────────────────────────────────────────────────────────────────────

# Track connected WebSocket clients
live_clients: list = []


@app.websocket("/ws/live")
async def websocket_live_feed(ws: WebSocket):
    """WebSocket endpoint for real-time transaction streaming."""
    await ws.accept()
    live_clients.append(ws)
    try:
        while True:
            await ws.receive_text()  # Keep alive
    except WebSocketDisconnect:
        live_clients.remove(ws)
    except Exception:
        if ws in live_clients:
            live_clients.remove(ws)


async def broadcast_transaction(txn_data: dict):
    """Broadcast a transaction to all connected WebSocket clients."""
    if not live_clients:
        return
    message = json.dumps(txn_data, default=str)
    disconnected = []
    for client in live_clients:
        try:
            await client.send_text(message)
        except Exception:
            disconnected.append(client)
    for c in disconnected:
        live_clients.remove(c)


# ────────────────────────────────────────────────────────────────────
# LIVE FEED API ENDPOINTS
# ────────────────────────────────────────────────────────────────────

@app.get("/api/live-feed/recent")
async def get_live_feed_recent(limit: int = Query(100, ge=1, le=500)):
    """Get recent transactions from circular buffer."""
    try:
        from circular_buffer import get_recent_transactions
        return {"transactions": get_recent_transactions(limit)}
    except Exception as e:
        logger.error(f"Live feed error: {e}")
        return {"transactions": [], "error": str(e)}


@app.get("/api/live-feed/stream")
async def live_feed_sse():
    """Server-Sent Events fallback for live transaction streaming."""
    async def event_generator():
        last_count = 0
        while True:
            try:
                from circular_buffer import get_buffer_status, get_recent_transactions
                status = get_buffer_status()
                current = status.get("total_processed", 0)
                if current > last_count:
                    new_txns = get_recent_transactions(min(current - last_count, 10))
                    for txn in new_txns:
                        yield f"data: {json.dumps(txn, default=str)}\n\n"
                    last_count = current
            except Exception:
                pass
            await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/live-feed/filter")
async def filter_live_feed(
    classification: str = None,
    status: str = None,
    min_score: float = None,
    limit: int = 100,
):
    """Filter live transactions by classification, status, or score."""
    try:
        from circular_buffer import get_filtered_transactions
        return {"transactions": get_filtered_transactions(classification, status, min_score, limit)}
    except Exception as e:
        logger.error(f"Filter error: {e}")
        return {"transactions": [], "error": str(e)}


# ────────────────────────────────────────────────────────────────────
# DASHBOARD API ENDPOINTS
# ────────────────────────────────────────────────────────────────────

@app.get("/api/dashboard/stats")
async def get_dashboard_stats(window: str = Query("1_HOUR")):
    """Get pre-computed dashboard aggregates."""
    try:
        from circular_buffer import compute_and_store_aggregates, get_latest_aggregates
        compute_and_store_aggregates()  # Refresh stats
        return get_latest_aggregates(window)
    except Exception as e:
        logger.error(f"Dashboard stats error: {e}")
        # Fallback to in-memory stats
        total = max(stats.total_scored, 1)
        return {
            "time_window": window,
            "total_transactions": stats.total_scored,
            "no_fraud_count": stats.total_no_fraud,
            "fraud_count": stats.total_fraud,
            "fraud_rate": round(stats.total_fraud / total, 4),
            "average_risk_score": 0,
            "total_amount": 0,
            "blocked_amount": 0,
        }


@app.get("/api/dashboard/chart-data")
async def get_dashboard_chart_data(hours: int = Query(24, ge=1, le=168)):
    """Get hourly trend data for dashboard charts."""
    try:
        from circular_buffer import get_hourly_trend
        return {"hourly_trend": get_hourly_trend(hours)}
    except Exception as e:
        logger.error(f"Chart data error: {e}")
        return {"hourly_trend": []}


@app.get("/api/dashboard/recent-alerts")
async def get_dashboard_recent_alerts(limit: int = Query(10, ge=1, le=50)):
    """Get recent fraud-classified transactions for alert display."""
    try:
        from circular_buffer import get_filtered_transactions
        return {"alerts": get_filtered_transactions(classification="FRAUD", limit=limit)}
    except Exception as e:
        logger.error(f"Recent alerts error: {e}")
        return {"alerts": []}


# ────────────────────────────────────────────────────────────────────
# NETWORK / RING EXPLORER API ENDPOINTS
# ────────────────────────────────────────────────────────────────────

@app.get("/api/network/graph-data")
async def get_network_graph_data(
    min_risk: float = Query(50, ge=0, le=100),
    timeframe: int = Query(24, ge=1, le=168),
):
    """Get high-risk transaction graph data for Ring Explorer."""
    try:
        from circular_buffer import get_graph_data
        return get_graph_data(min_risk, timeframe)
    except Exception as e:
        logger.error(f"Graph data error: {e}")
        return {"nodes": [], "edges": [], "total_nodes": 0, "total_edges": 0}


@app.get("/api/network/detect-patterns")
async def get_network_patterns(timeframe: int = Query(24, ge=1, le=168)):
    """Detect fraud network patterns (fan-out, fan-in, chains)."""
    try:
        from circular_buffer import detect_fraud_patterns
        patterns = detect_fraud_patterns(timeframe)
        return {"patterns": patterns, "total_patterns": len(patterns)}
    except Exception as e:
        logger.error(f"Pattern detection error: {e}")
        return {"patterns": [], "total_patterns": 0}


# ────────────────────────────────────────────────────────────────────
# CIRCULAR BUFFER STATUS
# ────────────────────────────────────────────────────────────────────

@app.get("/api/buffer/status")
async def get_buffer_status_endpoint():
    """Get current circular buffer state."""
    try:
        from circular_buffer import get_buffer_status
        return get_buffer_status()
    except Exception as e:
        logger.error(f"Buffer status error: {e}")
        return {"error": str(e)}


# ────────────────────────────────────────────────────────────────────
# SCAN HISTORY
# ────────────────────────────────────────────────────────────────────

class ScanRequest(BaseModel):
    upi_id: str
    user_id: str = "anonymous"
    score: float = 0
    action: str = "VIEWED"
    reported: bool = False


@app.post("/api/scan/record")
async def record_scan_endpoint(req: ScanRequest):
    """Record a UPI scan event for community trust scoring."""
    try:
        from scan_history import record_scan
        return record_scan(req.upi_id, req.user_id, req.score, req.action, req.reported)
    except Exception as e:
        logger.error(f"Scan record error: {e}")
        return {"error": str(e)}


# ────────────────────────────────────────────────────────────────────
# SCREENSHOT VERIFICATION (POC)
# ────────────────────────────────────────────────────────────────────

from fastapi import File, UploadFile

@app.post("/api/verify-screenshot")
async def verify_screenshot_endpoint(file: UploadFile = File(...)):
    """
    Verify a UPI transaction screenshot for authenticity.

    POC feature using LSB steganography extraction:
    1. Checks file format (PNG only)
    2. Detects which UPI app the screenshot is from (OCR + color)
    3. Extracts hidden LSB signature from image pixels
    4. Cross-checks signature against lookup table

    Returns verdict: GENUINE, FRAUD, or REJECTED with reason.
    """
    import tempfile
    import shutil

    # Validate content type
    if file.content_type and "image" not in file.content_type:
        return {
            "result": "REJECTED",
            "reason_code": "INVALID_FORMAT",
            "message": "Please upload an image file.",
            "risk_score": 100,
            "detected_app": None,
            "display_name": "N/A",
            "confidence": 0,
            "confidence_label": "LOW",
            "signature_status": "N/A",
            "detection_method": "none",
            "extracted_string": None,
        }

    # Save to temp file for processing
    tmp_path = None
    try:
        suffix = f".{file.filename.rsplit('.', 1)[-1]}" if '.' in (file.filename or '') else ".png"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            shutil.copyfileobj(file.file, tmp)

        from screenshot_verification import verify_screenshot
        result = verify_screenshot(tmp_path, original_filename=file.filename or "upload.png")

        logger.info(
            f"SCREENSHOT VERIFY  file={file.filename}  "
            f"app={result.get('display_name')}  "
            f"result={result.get('result')}  "
            f"reason={result.get('reason_code')}"
        )

        return result

    except Exception as e:
        logger.error(f"Screenshot verification error: {e}")
        return {
            "result": "FRAUD",
            "reason_code": "UNKNOWN_APP",
            "message": f"Verification failed: {str(e)}",
            "risk_score": 100,
            "detected_app": None,
            "display_name": "Unknown",
            "confidence": 0,
            "confidence_label": "LOW",
            "signature_status": "ERROR",
            "detection_method": "none",
            "extracted_string": None,
        }
    finally:
        # Clean up temp file
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)


# ────────────────────────────────────────────────────────────────────
# ADMIN SESSION MANAGEMENT + VERIFICATION TABLE CRUD
# ────────────────────────────────────────────────────────────────────

import secrets as _secrets
from fastapi import Header

# Hardcoded admin credentials (POC)
ADMIN_USERNAME = "admin"
ADMIN_PASSWORD = "admin123"

# In-memory session store: {token: True}
_admin_sessions: dict = {}


def _check_admin_session(x_admin_token: str = None) -> bool:
    """Return True if the provided token is a valid admin session."""
    if not x_admin_token:
        return False
    return x_admin_token in _admin_sessions


# ── POST /api/admin/login ────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    username: str
    password: str


@app.post("/api/admin/login")
async def admin_login(req: AdminLoginRequest):
    """Validate admin credentials and return a session token."""
    if req.username == ADMIN_USERNAME and req.password == ADMIN_PASSWORD:
        token = _secrets.token_hex(32)
        _admin_sessions[token] = True
        logger.info("Admin login successful")
        return {"success": True, "session_token": token}
    logger.warning(f"Failed admin login attempt for username: {req.username}")
    raise HTTPException(status_code=401, detail="Invalid credentials")


# ── POST /api/admin/logout ───────────────────────────────────────

@app.post("/api/admin/logout")
async def admin_logout(x_admin_token: str = Header(default=None)):
    """Invalidate the current admin session token."""
    if x_admin_token and x_admin_token in _admin_sessions:
        del _admin_sessions[x_admin_token]
        logger.info("Admin logged out")
    return {"success": True}


# ── GET /api/admin/verify-session ───────────────────────────────

@app.get("/api/admin/verify-session")
async def admin_verify_session(x_admin_token: str = Header(default=None)):
    """Check if the provided token is a valid admin session."""
    if _check_admin_session(x_admin_token):
        return {"valid": True}
    raise HTTPException(status_code=401, detail="Invalid or expired session")


# ── GET /api/admin/verification-table ───────────────────────────

@app.get("/api/admin/verification-table")
async def admin_get_verification_table(x_admin_token: str = Header(default=None)):
    """Return all rows from the screenshot_verification_table. Admin only."""
    if not _check_admin_session(x_admin_token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        import sqlite3 as _sq3
        from screenshot_verification import DB_PATH
        conn = _sq3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT app_id, app_name, secret_string FROM screenshot_verification_table ORDER BY app_id")
        rows = cursor.fetchall()
        conn.close()
        return {
            "rows": [
                {"app_id": r[0], "app_name": r[1], "secret_string": r[2]}
                for r in rows
            ]
        }
    except Exception as e:
        logger.error(f"Verification table fetch error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── POST /api/admin/verification-table/add ──────────────────────

class AddVerificationRowRequest(BaseModel):
    app_name: str
    secret_string: str


@app.post("/api/admin/verification-table/add")
async def admin_add_verification_row(
    req: AddVerificationRowRequest,
    x_admin_token: str = Header(default=None),
):
    """Add a new app -> secret_string row. Admin only."""
    if not _check_admin_session(x_admin_token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not req.app_name.strip() or not req.secret_string.strip():
        raise HTTPException(status_code=400, detail="app_name and secret_string are required")
    try:
        import sqlite3 as _sq3
        from screenshot_verification import DB_PATH
        conn = _sq3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO screenshot_verification_table (app_name, secret_string) VALUES (?, ?)",
            (req.app_name.strip().lower(), req.secret_string.strip()),
        )
        conn.commit()
        new_id = cursor.lastrowid
        conn.close()
        logger.info(f"Admin added verification row: {req.app_name}")
        return {"success": True, "app_id": new_id, "app_name": req.app_name, "secret_string": req.secret_string}
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(status_code=409, detail=f"App '{req.app_name}' already exists")
        logger.error(f"Add verification row error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ── DELETE /api/admin/verification-table/{app_id} ───────────────

@app.delete("/api/admin/verification-table/{app_id}")
async def admin_delete_verification_row(
    app_id: int,
    x_admin_token: str = Header(default=None),
):
    """Delete a row from the verification table by ID. Admin only."""
    if not _check_admin_session(x_admin_token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    try:
        import sqlite3 as _sq3
        from screenshot_verification import DB_PATH
        conn = _sq3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("DELETE FROM screenshot_verification_table WHERE app_id = ?", (app_id,))
        deleted = cursor.rowcount
        conn.commit()
        conn.close()
        if deleted == 0:
            raise HTTPException(status_code=404, detail="Row not found")
        logger.info(f"Admin deleted verification row: app_id={app_id}")
        return {"success": True, "deleted_id": app_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete verification row error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "05_realtime_api:app",
        host="0.0.0.0",
        port=8000,
        workers=1,
        reload=False,
    )

