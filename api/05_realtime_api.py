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
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List
from collections import defaultdict, deque

import numpy as np

# ── FastAPI / Pydantic ──
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
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
    decision: str
    fraud_score: float
    lgbm_score: float
    graph_risk_score: float
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
        """Score a single transaction."""
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

        # 2. Check ring membership
        sender_in_ring = txn.sender_user_id in self.reg.ring_members
        sender_is_controller = txn.sender_user_id in self.reg.ring_controllers
        receiver_in_ring = txn.receiver_id in self.reg.ring_members
        receiver_is_controller = txn.receiver_id in self.reg.ring_controllers

        sender_ring = self.reg.ring_membership.get(txn.sender_user_id, "")
        receiver_ring = self.reg.ring_membership.get(txn.receiver_id, "")
        intra_ring = sender_ring != "" and receiver_ring != "" and sender_ring == receiver_ring

        # 3. Hard block rules — fire immediately (no model needed)
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
            latency = (time.perf_counter() - t_start) * 1000
            # Record in rolling window even for hard blocks
            self.ws.add_transaction(txn.sender_user_id, ts_epoch, txn.amount, txn.receiver_id)
            logger.info(
                f"TXN={txn.transaction_id}  SENDER={txn.sender_user_id}  "
                f"AMT=₹{txn.amount:.0f}  SCORE=1.0000  DECISION=BLOCK  "
                f"REASON={hard_reason}  LAT={latency:.1f}ms"
            )
            return TransactionResponse(
                transaction_id=txn.transaction_id,
                decision="BLOCK",
                fraud_score=1.0,
                lgbm_score=1.0,
                graph_risk_score=1.0,
                reason=hard_reason,
                latency_ms=round(latency, 2),
                timestamp=ts.isoformat(),
            )

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

        # 10. Apply thresholds
        if fraud_score >= self.reg.block_threshold:
            decision = "BLOCK"
        elif fraud_score >= self.reg.review_threshold:
            decision = "REVIEW"
        else:
            decision = "ALLOW"

        # 11. Record transaction in rolling window
        self.ws.add_transaction(txn.sender_user_id, ts_epoch, txn.amount, txn.receiver_id)

        latency = (time.perf_counter() - t_start) * 1000
        logger.info(
            f"TXN={txn.transaction_id}  SENDER={txn.sender_user_id}  "
            f"AMT=₹{txn.amount:.0f}  SCORE={fraud_score:.4f}  "
            f"DECISION={decision}  LAT={latency:.1f}ms"
        )

        return TransactionResponse(
            transaction_id=txn.transaction_id,
            decision=decision,
            fraud_score=round(fraud_score, 6),
            lgbm_score=round(lgbm_score, 6),
            graph_risk_score=round(graph_score, 6),
            reason=None,
            latency_ms=round(latency, 2),
            timestamp=ts.isoformat(),
        )

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
        self.start_time = time.time()

    def record(self, decision: str):
        self.total_scored += 1
        if decision == "BLOCK":
            self.total_blocked += 1
        elif decision == "REVIEW":
            self.total_reviewed += 1
        else:
            self.total_allowed += 1

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
    stats.record(result.decision)
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
        stats.record(result.decision)
        results.append(result)
    total_latency = (time.perf_counter() - t_start) * 1000

    return BatchResponse(results=results, total_latency_ms=round(total_latency, 2))


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
        block_rate=round(stats.total_blocked / total, 4),
        review_rate=round(stats.total_reviewed / total, 4),
        uptime_seconds=round(stats.uptime, 1),
    )


# ────────────────────────────────────────────────────────────────────
# LOCAL DEV SERVER
# ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "05_realtime_api:app",
        host="0.0.0.0",
        port=8000,
        workers=1,
        reload=False,
    )
