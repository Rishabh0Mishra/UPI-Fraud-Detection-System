"""
04_ensemble.py
==============
UPI Fraud Detection — Ensemble Scoring & Calibration

Combines LightGBM score + graph risk score into a final calibrated
probability. Applies hard block rules, finds 3-tier thresholds
(BLOCK / REVIEW / ALLOW), and saves ensemble config + calibrator.

Outputs:
  - models/ensemble_config.json
  - models/score_calibrator.pkl
  - models/threshold_analysis.png
"""

import os
import json
import warnings
import time
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    precision_recall_curve,
    average_precision_score,
    roc_auc_score,
)

warnings.filterwarnings("ignore")

# ────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ────────────────────────────────────────────────────────────────────

DATA_DIR = Path("./data")
MODELS_DIR = Path("./models")
os.makedirs(MODELS_DIR, exist_ok=True)

FEATURE_FILE = DATA_DIR / "features_train.parquet"
MODEL_FILE = MODELS_DIR / "lgbm_fraud_model.pkl"
CONFIG_FILE = MODELS_DIR / "model_config.json"
GRAPH_RISK_FILE = MODELS_DIR / "graph_risk_scores.pkl"
RING_FILE = DATA_DIR / "upi_fraud_rings.json"

ENSEMBLE_CONFIG_OUTPUT = MODELS_DIR / "ensemble_config.json"
CALIBRATOR_OUTPUT = MODELS_DIR / "score_calibrator.pkl"
THRESHOLD_PLOT_OUTPUT = MODELS_DIR / "threshold_analysis.png"

# Ensemble weights
LGBM_WEIGHT = 0.75
GRAPH_WEIGHT = 0.25

# Hard block amount ratio threshold
EXTREME_AMOUNT_RATIO = 50


# ────────────────────────────────────────────────────────────────────
# 1. LOAD ALL COMPONENTS
# ────────────────────────────────────────────────────────────────────

def load_components():
    """Load model, data, graph risk scores, and ring info."""
    print("[1/7] Loading components ...")

    # Feature data
    df = pd.read_parquet(FEATURE_FILE)
    print(f"       Features: {len(df):,} rows")

    # Model config
    with open(CONFIG_FILE, "r") as f:
        model_config = json.load(f)
    feature_cols = model_config["feature_cols"]

    # LightGBM model
    with open(MODEL_FILE, "rb") as f:
        lgbm_model = pickle.load(f)
    print(f"       LightGBM model loaded")

    # Graph risk scores
    with open(GRAPH_RISK_FILE, "rb") as f:
        graph_risk = pickle.load(f)
    print(f"       Graph risk scores: {len(graph_risk):,} nodes")

    # Ring info
    with open(RING_FILE, "r") as f:
        rings = json.load(f)

    ring_controllers = set()
    ring_members = set()
    ring_membership = {}  # user → ring_id
    for ring_id, ring_data in rings.items():
        if ring_data.get("type") == "hub_spoke":
            controller = ring_data.get("controller", "")
            ring_controllers.add(controller)
            for m in ring_data.get("all_members", []):
                ring_members.add(m)
                ring_membership[m] = ring_id
        elif ring_data.get("type") == "collusive":
            for m in ring_data.get("members", []):
                ring_members.add(m)
                ring_membership[m] = ring_id
    print(f"       Ring controllers: {len(ring_controllers)}, members: {len(ring_members)}")

    return df, lgbm_model, feature_cols, model_config, graph_risk, ring_controllers, ring_members, ring_membership


# ────────────────────────────────────────────────────────────────────
# 2. COMPUTE LGBM SCORES
# ────────────────────────────────────────────────────────────────────

def compute_lgbm_scores(df, model, feature_cols):
    """Run LightGBM inference on all data."""
    print("\n[2/7] Computing LightGBM scores ...")
    X = df[feature_cols].copy()
    X = X.replace([np.inf, -np.inf], np.nan).fillna(0)
    lgbm_scores = model.predict_proba(X)[:, 1]
    print(f"       Score range: [{lgbm_scores.min():.4f}, {lgbm_scores.max():.4f}]")
    print(f"       Mean score:  {lgbm_scores.mean():.6f}")
    return lgbm_scores


# ────────────────────────────────────────────────────────────────────
# 3. COMPUTE GRAPH RISK SCORES
# ────────────────────────────────────────────────────────────────────

def compute_graph_scores(df, graph_risk):
    """Look up graph risk score for each sender."""
    print("\n[3/7] Looking up graph risk scores ...")
    graph_scores = df["sender_user_id"].map(graph_risk).fillna(0.0).values
    in_graph = (graph_scores > 0).sum()
    print(f"       {in_graph:,} / {len(df):,} senders have graph risk scores")
    print(f"       Score range: [{graph_scores.min():.4f}, {graph_scores.max():.4f}]")
    return graph_scores


# ────────────────────────────────────────────────────────────────────
# 4. HARD BLOCK RULES
# ────────────────────────────────────────────────────────────────────

def apply_hard_block_rules(df, ring_controllers, ring_members, ring_membership):
    """
    Apply deterministic hard block rules. These fire BEFORE the model.
    Returns a boolean array (True = hard block) and a string array (reason).
    """
    print("\n[4/7] Applying hard block rules ...")

    n = len(df)
    hard_block = np.zeros(n, dtype=bool)
    hard_reason = np.full(n, "", dtype=object)

    # Rule 1: Sender is a known ring controller
    sender_is_controller = df["sender_user_id"].isin(ring_controllers).values
    mask = sender_is_controller & ~hard_block
    hard_block |= mask
    hard_reason[mask] = "sender_is_known_controller"
    print(f"       sender_is_known_controller: {mask.sum():,}")

    # Rule 2: Intra-ring transfer (sender AND receiver in same ring)
    if "intra_ring_txn" in df.columns:
        intra_ring = df["intra_ring_txn"].values == 1
    else:
        sender_ring = df["sender_user_id"].map(ring_membership).fillna("")
        receiver_ring = df["receiver_id"].map(ring_membership).fillna("")
        intra_ring = (
            (sender_ring != "") & (receiver_ring != "") & (sender_ring == receiver_ring)
        ).values
    mask = intra_ring & ~hard_block
    hard_block |= mask
    hard_reason[mask] = "intra_ring_transfer"
    print(f"       intra_ring_transfer:         {mask.sum():,}")

    # Rule 3: Receiver is a fake merchant
    if "receiver_is_fake_merchant" in df.columns:
        fake_merch = df["receiver_is_fake_merchant"].values == 1
        mask = fake_merch & ~hard_block
        hard_block |= mask
        hard_reason[mask] = "receiver_is_fake_merchant"
        print(f"       receiver_is_fake_merchant:   {mask.sum():,}")

    # Rule 4: Extreme amount ratio (amount / avg > 50)
    if "amount_ratio" in df.columns:
        extreme = df["amount_ratio"].values > EXTREME_AMOUNT_RATIO
    elif "amount" in df.columns and "sender_avg_txn_amount" in df.columns:
        extreme = (df["amount"] / (df["sender_avg_txn_amount"].fillna(500) + 1e-6)).values > EXTREME_AMOUNT_RATIO
    else:
        extreme = np.zeros(n, dtype=bool)
    mask = extreme & ~hard_block
    hard_block |= mask
    hard_reason[mask] = "extreme_amount_ratio"
    print(f"       extreme_amount_ratio:        {mask.sum():,}")

    total = hard_block.sum()
    fraud_in_block = df["is_fraud"].values[hard_block].sum() if "is_fraud" in df.columns else 0
    print(f"       Total hard blocks: {total:,} ({fraud_in_block} fraud, {total - fraud_in_block} legit)")

    return hard_block, hard_reason


# ────────────────────────────────────────────────────────────────────
# 5. ENSEMBLE + CALIBRATION
# ────────────────────────────────────────────────────────────────────

def compute_ensemble_and_calibrate(lgbm_scores, graph_scores, y_true, hard_block):
    """
    Blend LightGBM + graph scores, then calibrate with Platt scaling.
    """
    print("\n[5/7] Computing ensemble and calibrating ...")

    # Ensemble
    ensemble_scores = LGBM_WEIGHT * lgbm_scores + GRAPH_WEIGHT * graph_scores
    print(f"       Ensemble range: [{ensemble_scores.min():.4f}, {ensemble_scores.max():.4f}]")

    # Platt scaling (LogisticRegression on ensemble scores)
    # Only calibrate on non-hard-blocked samples
    cal_mask = ~hard_block
    X_cal = ensemble_scores[cal_mask].reshape(-1, 1)
    y_cal = y_true[cal_mask]

    calibrator = LogisticRegression(random_state=42, max_iter=1000)
    calibrator.fit(X_cal, y_cal)

    calibrated_scores = calibrator.predict_proba(
        ensemble_scores.reshape(-1, 1)
    )[:, 1]

    # For hard-blocked transactions, set calibrated score to 1.0
    calibrated_scores[hard_block] = 1.0

    print(f"       Calibrated range: [{calibrated_scores[~hard_block].min():.6f}, "
          f"{calibrated_scores[~hard_block].max():.6f}]")
    print(f"       Calibrated mean:  {calibrated_scores[~hard_block].mean():.6f}  "
          f"(target ≈ {y_true.mean():.6f})")

    return ensemble_scores, calibrated_scores, calibrator


# ────────────────────────────────────────────────────────────────────
# 6. FIND THRESHOLDS
# ────────────────────────────────────────────────────────────────────

def find_thresholds(calibrated_scores, y_true, hard_block):
    """
    Find BLOCK and REVIEW thresholds:
      BLOCK:  lowest threshold where precision ≥ 0.90
      REVIEW: highest threshold where recall ≥ 0.80
    """
    print("\n[6/7] Finding optimal thresholds ...")

    # Work only on non-hard-blocked for threshold tuning
    mask = ~hard_block
    scores = calibrated_scores[mask]
    labels = y_true[mask]

    precision, recall, thresholds = precision_recall_curve(labels, scores)

    # BLOCK: lowest threshold with precision ≥ 0.90
    block_candidates = np.where(precision[:-1] >= 0.90)[0]
    if len(block_candidates) > 0:
        block_idx = block_candidates[0]
        block_threshold = float(thresholds[block_idx])
    else:
        # Fallback: use 90th percentile of fraud scores
        fraud_scores = scores[labels == 1]
        block_threshold = float(np.percentile(fraud_scores, 50)) if len(fraud_scores) > 0 else 0.5

    # REVIEW: highest threshold with recall ≥ 0.80
    review_candidates = np.where(recall[:-1] >= 0.80)[0]
    if len(review_candidates) > 0:
        review_idx = review_candidates[-1]
        review_threshold = float(thresholds[review_idx])
    else:
        review_threshold = block_threshold * 0.3

    # Ensure block > review
    if review_threshold >= block_threshold:
        review_threshold = block_threshold * 0.5

    print(f"       BLOCK threshold:  {block_threshold:.6f}  (precision ≥ 0.90)")
    print(f"       REVIEW threshold: {review_threshold:.6f}  (recall ≥ 0.80)")

    return block_threshold, review_threshold


# ────────────────────────────────────────────────────────────────────
# 7. EVALUATE DECISIONS
# ────────────────────────────────────────────────────────────────────

def evaluate_decisions(calibrated_scores, y_true, hard_block, hard_reason,
                       block_threshold, review_threshold):
    """Assign decisions and print per-bucket analysis."""
    print("\n[7/7] Evaluating 3-tier decisions ...")

    n = len(y_true)
    decisions = np.full(n, "ALLOW", dtype=object)

    # Hard blocks always → BLOCK
    decisions[hard_block] = "BLOCK"

    # Model-based thresholds for non-hard-blocked
    non_hard = ~hard_block
    decisions[non_hard & (calibrated_scores >= block_threshold)] = "BLOCK"
    decisions[non_hard & (calibrated_scores >= review_threshold) & (calibrated_scores < block_threshold)] = "REVIEW"

    # Per-bucket stats
    total_fraud = y_true.sum()
    print(f"\n  {'Bucket':<10} {'Total':>8} {'Fraud':>8} {'Legit':>8} {'Fraud%':>8}")
    print(f"  {'─' * 10} {'─' * 8} {'─' * 8} {'─' * 8} {'─' * 8}")

    for bucket in ["BLOCK", "REVIEW", "ALLOW"]:
        mask = decisions == bucket
        total_in = mask.sum()
        fraud_in = y_true[mask].sum()
        legit_in = total_in - fraud_in
        pct = fraud_in / total_in * 100 if total_in > 0 else 0
        print(f"  {bucket:<10} {total_in:>8,} {fraud_in:>8,} {legit_in:>8,} {pct:>7.1f}%")

    # Fraud disposition
    fraud_blocked = y_true[(decisions == "BLOCK")].sum()
    fraud_review = y_true[(decisions == "REVIEW")].sum()
    fraud_allowed = y_true[(decisions == "ALLOW")].sum()

    print(f"\n  Total fraud: {total_fraud:,}")
    print(f"    Blocked:   {fraud_blocked:,}  ({fraud_blocked / total_fraud:.1%})")
    print(f"    Reviewed:  {fraud_review:,}  ({fraud_review / total_fraud:.1%})")
    print(f"    Missed:    {fraud_allowed:,}  ({fraud_allowed / total_fraud:.1%})")

    # Overall metrics
    pr_auc = average_precision_score(y_true, calibrated_scores)
    roc = roc_auc_score(y_true, calibrated_scores)
    print(f"\n  Calibrated PR-AUC: {pr_auc:.4f}")
    print(f"  Calibrated ROC-AUC: {roc:.4f}")

    return decisions, {
        "calibrated_pr_auc": float(pr_auc),
        "calibrated_roc_auc": float(roc),
        "fraud_blocked": int(fraud_blocked),
        "fraud_reviewed": int(fraud_review),
        "fraud_missed": int(fraud_allowed),
        "total_fraud": int(total_fraud),
    }


# ────────────────────────────────────────────────────────────────────
# PLOT: PR CURVE + SCORE DISTRIBUTION
# ────────────────────────────────────────────────────────────────────

def plot_analysis(lgbm_scores, graph_scores, ensemble_scores, calibrated_scores,
                  y_true, block_threshold, review_threshold):
    """Save PR curve comparison + score distribution plot."""
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        fig, axes = plt.subplots(1, 2, figsize=(16, 6))

        # --- PR Curve Comparison ---
        ax = axes[0]
        for scores, label, color in [
            (lgbm_scores, "LightGBM", "#e74c3c"),
            (graph_scores, "Graph Risk", "#3498db"),
            (ensemble_scores, "Ensemble", "#2ecc71"),
            (calibrated_scores, "Calibrated", "#9b59b6"),
        ]:
            prec, rec, _ = precision_recall_curve(y_true, scores)
            ap = average_precision_score(y_true, scores)
            ax.plot(rec, prec, label=f"{label} (AP={ap:.3f})", color=color, linewidth=2)
        ax.set_xlabel("Recall", fontsize=12)
        ax.set_ylabel("Precision", fontsize=12)
        ax.set_title("Precision-Recall Curve Comparison", fontsize=14)
        ax.legend(fontsize=10)
        ax.grid(True, alpha=0.3)

        # --- Score Distribution ---
        ax = axes[1]
        fraud_scores = calibrated_scores[y_true == 1]
        legit_scores = calibrated_scores[y_true == 0]
        ax.hist(legit_scores, bins=100, alpha=0.6, label="Legit", color="#3498db", density=True)
        ax.hist(fraud_scores, bins=100, alpha=0.6, label="Fraud", color="#e74c3c", density=True)
        ax.axvline(block_threshold, color="#e74c3c", linestyle="--",
                   linewidth=2, label=f"BLOCK ({block_threshold:.4f})")
        ax.axvline(review_threshold, color="#f39c12", linestyle="--",
                   linewidth=2, label=f"REVIEW ({review_threshold:.4f})")
        ax.set_xlabel("Calibrated Score", fontsize=12)
        ax.set_ylabel("Density", fontsize=12)
        ax.set_title("Score Distribution by Class", fontsize=14)
        ax.legend(fontsize=10)
        ax.grid(True, alpha=0.3)

        plt.tight_layout()
        plt.savefig(THRESHOLD_PLOT_OUTPUT, dpi=150, bbox_inches="tight")
        plt.close()
        print(f"\n  Threshold analysis plot → {THRESHOLD_PLOT_OUTPUT}")

    except ImportError:
        print("  WARNING: matplotlib not installed. Skipping plots.")
    except Exception as e:
        print(f"  WARNING: Plotting failed: {e}")


# ────────────────────────────────────────────────────────────────────
# SAVE CONFIG
# ────────────────────────────────────────────────────────────────────

def save_config(block_threshold, review_threshold, calibrator, eval_metrics):
    """Save ensemble configuration and calibrator."""
    config = {
        "lgbm_weight": LGBM_WEIGHT,
        "graph_weight": GRAPH_WEIGHT,
        "block_threshold": block_threshold,
        "review_threshold": review_threshold,
        "hard_block_rules": [
            "sender_is_known_controller",
            "intra_ring_transfer",
            "receiver_is_fake_merchant",
            "extreme_amount_ratio",
        ],
        "extreme_amount_ratio_limit": EXTREME_AMOUNT_RATIO,
        "calibrator_coef": float(calibrator.coef_[0][0]),
        "calibrator_intercept": float(calibrator.intercept_[0]),
        "eval_metrics": eval_metrics,
    }

    with open(ENSEMBLE_CONFIG_OUTPUT, "w") as f:
        json.dump(config, f, indent=2)
    print(f"  Ensemble config → {ENSEMBLE_CONFIG_OUTPUT}")

    with open(CALIBRATOR_OUTPUT, "wb") as f:
        pickle.dump(calibrator, f)
    print(f"  Calibrator      → {CALIBRATOR_OUTPUT}")


# ────────────────────────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  UPI FRAUD DETECTION — ENSEMBLE & CALIBRATION")
    print("=" * 70)
    pipeline_start = time.time()

    # 1. Load everything
    (df, lgbm_model, feature_cols, model_config,
     graph_risk, ring_controllers, ring_members, ring_membership) = load_components()

    y_true = df["is_fraud"].astype(int).values

    # 2. LightGBM scores
    lgbm_scores = compute_lgbm_scores(df, lgbm_model, feature_cols)

    # 3. Graph scores
    graph_scores = compute_graph_scores(df, graph_risk)

    # 4. Hard block rules
    hard_block, hard_reason = apply_hard_block_rules(
        df, ring_controllers, ring_members, ring_membership
    )

    # 5. Ensemble + calibration
    ensemble_scores, calibrated_scores, calibrator = compute_ensemble_and_calibrate(
        lgbm_scores, graph_scores, y_true, hard_block
    )

    # 6. Find thresholds
    block_threshold, review_threshold = find_thresholds(
        calibrated_scores, y_true, hard_block
    )

    # 7. Evaluate
    decisions, eval_metrics = evaluate_decisions(
        calibrated_scores, y_true, hard_block, hard_reason,
        block_threshold, review_threshold
    )

    # 8. Plot
    plot_analysis(lgbm_scores, graph_scores, ensemble_scores, calibrated_scores,
                  y_true, block_threshold, review_threshold)

    # 9. Save
    save_config(block_threshold, review_threshold, calibrator, eval_metrics)

    elapsed = time.time() - pipeline_start
    print(f"\n{'=' * 70}")
    print(f"  ENSEMBLE & CALIBRATION COMPLETE  ({elapsed:.1f}s)")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
