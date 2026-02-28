"""
02_model_training.py
====================
UPI Fraud Detection — LightGBM Model Training Pipeline

Loads engineered features, runs 5-fold Stratified K-Fold CV with
LightGBM + SMOTE, computes PR-AUC / F1 / recall, SHAP explainability,
and saves the final model + config.

Outputs:
  - models/lgbm_fraud_model.pkl
  - models/model_config.json
  - models/feature_importance.csv
  - models/shap_summary.png
"""

import os
import json
import warnings
import time
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import StratifiedKFold
from sklearn.metrics import (
    precision_recall_curve,
    auc,
    roc_auc_score,
    f1_score,
    confusion_matrix,
    average_precision_score,
    classification_report,
)

warnings.filterwarnings("ignore")

# ────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ────────────────────────────────────────────────────────────────────

DATA_DIR = Path("./data")
MODELS_DIR = Path("./models")
os.makedirs(MODELS_DIR, exist_ok=True)

FEATURE_FILE = DATA_DIR / "features_train.parquet"
METADATA_FILE = DATA_DIR / "feature_metadata.json"

# LightGBM hyperparameters
LGBM_PARAMS = {
    "objective": "binary",
    "metric": ["binary_logloss", "average_precision"],
    "boosting_type": "gbdt",
    "scale_pos_weight": 136.5,
    "learning_rate": 0.05,
    "num_leaves": 63,
    "max_depth": 7,
    "min_child_samples": 20,
    "feature_fraction": 0.8,
    "bagging_fraction": 0.8,
    "bagging_freq": 5,
    "lambda_l1": 0.1,
    "lambda_l2": 0.1,
    "n_estimators": 1000,
    "random_state": 42,
    "verbose": -1,
    "n_jobs": -1,
}

# SMOTE config
SMOTE_STRATEGY = 0.05   # Target 5% fraud ratio
SMOTE_K_NEIGHBORS = 5
SMOTE_RANDOM_STATE = 42

N_FOLDS = 5
SHAP_SAMPLE_SIZE = 2000


# ────────────────────────────────────────────────────────────────────
# 1. LOAD DATA
# ────────────────────────────────────────────────────────────────────

def load_features():
    """Load feature matrix and metadata."""
    print("[1/6] Loading feature matrix ...")
    df = pd.read_parquet(FEATURE_FILE)
    with open(METADATA_FILE, "r") as f:
        metadata = json.load(f)
    feature_cols = metadata["feature_cols"]
    print(f"       Loaded {len(df):,} rows, {len(feature_cols)} features")
    print(f"       Fraud count: {df['is_fraud'].sum():,}  ({df['is_fraud'].mean():.3%})")
    return df, feature_cols, metadata


# ────────────────────────────────────────────────────────────────────
# 2. SMOTE OVERSAMPLING (Training folds only!)
# ────────────────────────────────────────────────────────────────────

def apply_smote(X_train, y_train):
    """
    Apply SMOTE to oversample fraud class in training data.
    Never apply to validation/test data.
    """
    try:
        from imblearn.over_sampling import SMOTE
        fraud_count = y_train.sum()
        legit_count = len(y_train) - fraud_count

        smote = SMOTE(
            sampling_strategy=SMOTE_STRATEGY,
            k_neighbors=min(SMOTE_K_NEIGHBORS, fraud_count - 1),
            random_state=SMOTE_RANDOM_STATE,
        )
        X_resampled, y_resampled = smote.fit_resample(X_train, y_train)
        new_fraud = y_resampled.sum()
        print(f"         SMOTE: {fraud_count} → {new_fraud} fraud samples "
              f"({new_fraud / len(y_resampled):.1%} ratio)")
        return X_resampled, y_resampled

    except ImportError:
        print("         WARNING: imbalanced-learn not installed. Skipping SMOTE.")
        print("         Install with: pip install imbalanced-learn")
        return X_train, y_train
    except Exception as e:
        print(f"         WARNING: SMOTE failed ({e}). Continuing without SMOTE.")
        return X_train, y_train


# ────────────────────────────────────────────────────────────────────
# 3. FIND OPTIMAL THRESHOLD
# ────────────────────────────────────────────────────────────────────

def find_optimal_threshold(y_true, y_scores):
    """
    Find the threshold that maximises F1 score using the precision-recall curve.
    """
    precision, recall, thresholds = precision_recall_curve(y_true, y_scores)
    # Compute F1 for each threshold
    f1_scores = 2 * (precision * recall) / (precision + recall + 1e-8)
    # Best F1
    best_idx = np.argmax(f1_scores)
    best_threshold = thresholds[best_idx] if best_idx < len(thresholds) else 0.5
    best_f1 = f1_scores[best_idx]
    return best_threshold, best_f1


# ────────────────────────────────────────────────────────────────────
# 4. CROSS-VALIDATION
# ────────────────────────────────────────────────────────────────────

def run_cross_validation(X, y, feature_cols):
    """
    Run 5-fold Stratified K-Fold CV with LightGBM + SMOTE.
    Returns out-of-fold predictions and fold metrics.
    """
    print(f"\n[2/6] Running {N_FOLDS}-fold Stratified K-Fold CV ...")
    print(f"       Total samples: {len(X):,}  |  Fraud: {y.sum():,}  |  Legit: {(~y.astype(bool)).sum():,}")

    skf = StratifiedKFold(n_splits=N_FOLDS, shuffle=True, random_state=42)
    oof_preds = np.zeros(len(X))
    fold_metrics = []

    for fold_idx, (train_idx, val_idx) in enumerate(skf.split(X, y), 1):
        print(f"\n  ── Fold {fold_idx}/{N_FOLDS} ──")
        X_train, X_val = X.iloc[train_idx], X.iloc[val_idx]
        y_train, y_val = y.iloc[train_idx], y.iloc[val_idx]

        print(f"       Train: {len(X_train):,} ({y_train.sum():,} fraud)  |  "
              f"Val: {len(X_val):,} ({y_val.sum():,} fraud)")

        # Apply SMOTE to training fold only
        X_train_sm, y_train_sm = apply_smote(X_train, y_train)

        # Train LightGBM
        model = lgb.LGBMClassifier(**LGBM_PARAMS)

        model.fit(
            X_train_sm, y_train_sm,
            eval_set=[(X_val, y_val)],
            callbacks=[
                lgb.early_stopping(50, verbose=False),
                lgb.log_evaluation(period=0),
            ],
        )

        # Predict on validation (original, not SMOTE'd)
        y_val_prob = model.predict_proba(X_val)[:, 1]
        oof_preds[val_idx] = y_val_prob

        # Metrics
        pr_auc = average_precision_score(y_val, y_val_prob)
        roc = roc_auc_score(y_val, y_val_prob)
        threshold, f1 = find_optimal_threshold(y_val.values, y_val_prob)

        y_val_pred = (y_val_prob >= threshold).astype(int)
        tn, fp, fn, tp = confusion_matrix(y_val, y_val_pred).ravel()
        recall = tp / (tp + fn + 1e-8)
        precision = tp / (tp + fp + 1e-8)
        fpr = fp / (fp + tn + 1e-8)

        fold_metrics.append({
            "fold": fold_idx,
            "pr_auc": pr_auc,
            "roc_auc": roc,
            "f1": f1,
            "threshold": threshold,
            "precision": precision,
            "recall": recall,
            "false_positive_rate": fpr,
            "tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn),
            "best_iteration": model.best_iteration_ if hasattr(model, 'best_iteration_') else LGBM_PARAMS["n_estimators"],
        })

        print(f"       PR-AUC: {pr_auc:.4f}  |  ROC-AUC: {roc:.4f}  |  "
              f"F1: {f1:.4f}  |  Threshold: {threshold:.4f}")
        print(f"       Recall: {recall:.3f}  |  Precision: {precision:.3f}  |  "
              f"FPR: {fpr:.4f}")
        print(f"       TP: {tp}  FP: {fp}  FN: {fn}  TN: {tn:,}")

    return oof_preds, fold_metrics


# ────────────────────────────────────────────────────────────────────
# 5. EVALUATE OOF PREDICTIONS
# ────────────────────────────────────────────────────────────────────

def evaluate_oof(y_true, oof_preds, fold_metrics):
    """Compute and display global out-of-fold metrics."""
    print(f"\n{'=' * 60}")
    print(f"  OUT-OF-FOLD (OOF) RESULTS")
    print(f"{'=' * 60}")

    # Global metrics
    pr_auc = average_precision_score(y_true, oof_preds)
    roc = roc_auc_score(y_true, oof_preds)
    optimal_threshold, best_f1 = find_optimal_threshold(y_true.values, oof_preds)

    y_pred = (oof_preds >= optimal_threshold).astype(int)
    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()

    recall = tp / (tp + fn)
    precision_val = tp / (tp + fp)
    fpr = fp / (fp + tn)

    print(f"\n  Global PR-AUC:       {pr_auc:.4f}")
    print(f"  Global ROC-AUC:      {roc:.4f}")
    print(f"  Optimal F1:          {best_f1:.4f}")
    print(f"  Optimal Threshold:   {optimal_threshold:.4f}")

    print(f"\n  Confusion Matrix:")
    print(f"    True Negatives  (correct legit):  {tn:>8,}")
    print(f"    False Positives (false alarm):     {fp:>8,}")
    print(f"    False Negatives (missed fraud):    {fn:>8,}")
    print(f"    True Positives  (caught fraud):    {tp:>8,}")

    print(f"\n    Fraud caught:      {recall:.1%}")
    print(f"    False alarm rate:  {fpr:.3%}")
    print(f"    PR-AUC:            {pr_auc:.4f}")

    # Per-fold summary
    pr_aucs = [m["pr_auc"] for m in fold_metrics]
    print(f"\n  Per-Fold PR-AUC:     {np.mean(pr_aucs):.4f} ± {np.std(pr_aucs):.4f}")
    for m in fold_metrics:
        print(f"    Fold {m['fold']}: PR-AUC={m['pr_auc']:.4f}  "
              f"ROC={m['roc_auc']:.4f}  F1={m['f1']:.4f}  "
              f"Recall={m['recall']:.3f}")

    # Overfitting check
    if np.std(pr_aucs) > 0.05:
        print(f"\n  ⚠️  WARNING: High fold variance ({np.std(pr_aucs):.4f}). "
              f"Consider stronger regularisation.")

    return {
        "global_pr_auc": float(pr_auc),
        "global_roc_auc": float(roc),
        "global_f1": float(best_f1),
        "optimal_threshold": float(optimal_threshold),
        "recall": float(recall),
        "precision": float(precision_val),
        "false_positive_rate": float(fpr),
        "tp": int(tp), "fp": int(fp), "fn": int(fn), "tn": int(tn),
        "fold_pr_aucs": [float(x) for x in pr_aucs],
        "fold_mean_pr_auc": float(np.mean(pr_aucs)),
        "fold_std_pr_auc": float(np.std(pr_aucs)),
    }


# ────────────────────────────────────────────────────────────────────
# 6. TRAIN FINAL MODEL
# ────────────────────────────────────────────────────────────────────

def train_final_model(X, y, best_iteration):
    """
    Retrain on ALL data using the best iteration count from CV.
    """
    print(f"\n[3/6] Training final model on all data ...")
    print(f"       Using best_iteration = {best_iteration}")

    # Apply SMOTE to all data
    X_sm, y_sm = apply_smote(X, y)

    # Train final model with fixed iterations (no early stopping)
    final_params = LGBM_PARAMS.copy()
    final_params["n_estimators"] = best_iteration
    model = lgb.LGBMClassifier(**final_params)
    model.fit(X_sm, y_sm)

    print(f"       Final model trained on {len(X_sm):,} samples")
    return model


# ────────────────────────────────────────────────────────────────────
# 7. FEATURE IMPORTANCE
# ────────────────────────────────────────────────────────────────────

def save_feature_importance(model, feature_cols):
    """Save feature importance to CSV."""
    print(f"\n[4/6] Saving feature importance ...")
    importance = pd.DataFrame({
        "feature": feature_cols,
        "importance": model.feature_importances_,
    }).sort_values("importance", ascending=False)

    importance.to_csv(MODELS_DIR / "feature_importance.csv", index=False)
    print(f"       Top 15 features:")
    for _, row in importance.head(15).iterrows():
        print(f"         {row['feature']:40s} {row['importance']:>8}")
    return importance


# ────────────────────────────────────────────────────────────────────
# 8. SHAP EXPLAINABILITY
# ────────────────────────────────────────────────────────────────────

def compute_shap(model, X, feature_cols):
    """
    Compute SHAP values on a sample and save summary plot.
    Handles ImportError gracefully.
    """
    print(f"\n[5/6] Computing SHAP values ...")
    try:
        import shap
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt

        # Sample for SHAP (use stratified sample if possible)
        sample_size = min(SHAP_SAMPLE_SIZE, len(X))
        X_sample = X.sample(n=sample_size, random_state=42)

        explainer = shap.TreeExplainer(model)
        shap_values = explainer.shap_values(X_sample)

        # For binary classification, shap_values may be a list [neg, pos]
        if isinstance(shap_values, list):
            shap_vals = shap_values[1]  # Positive class
        else:
            shap_vals = shap_values

        # Summary plot
        plt.figure(figsize=(12, 10))
        shap.summary_plot(shap_vals, X_sample, feature_names=feature_cols,
                          show=False, max_display=20)
        plt.tight_layout()
        plt.savefig(MODELS_DIR / "shap_summary.png", dpi=150, bbox_inches="tight")
        plt.close()
        print(f"       SHAP summary plot saved to {MODELS_DIR / 'shap_summary.png'}")

    except ImportError:
        print("       WARNING: shap not installed. Skipping SHAP analysis.")
        print("       Install with: pip install shap")
    except Exception as e:
        print(f"       WARNING: SHAP computation failed: {e}")


# ────────────────────────────────────────────────────────────────────
# 9. SAVE MODEL & CONFIG
# ────────────────────────────────────────────────────────────────────

def save_model_and_config(model, feature_cols, eval_metrics, metadata, fold_metrics):
    """Save trained model and configuration."""
    print(f"\n[6/6] Saving model and config ...")

    # Save model
    model_path = MODELS_DIR / "lgbm_fraud_model.pkl"
    with open(model_path, "wb") as f:
        pickle.dump(model, f)
    print(f"       Model → {model_path}")

    # Average best iteration across folds
    avg_best_iter = int(np.mean([m["best_iteration"] for m in fold_metrics]))

    # Save config
    config = {
        "feature_cols": feature_cols,
        "threshold": eval_metrics["optimal_threshold"],
        "encoding_map": metadata.get("encoding_map", {}),
        "lgbm_params": {k: v for k, v in LGBM_PARAMS.items()},
        "smote_strategy": SMOTE_STRATEGY,
        "n_folds": N_FOLDS,
        "eval_metrics": eval_metrics,
        "best_iteration": avg_best_iter,
        "fraud_rate": metadata.get("fraud_rate", 0.00727),
    }
    config_path = MODELS_DIR / "model_config.json"
    with open(config_path, "w") as f:
        json.dump(config, f, indent=2, default=str)
    print(f"       Config → {config_path}")


# ────────────────────────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  UPI FRAUD DETECTION — MODEL TRAINING PIPELINE")
    print("=" * 70)
    pipeline_start = time.time()

    # 1. Load data
    df, feature_cols, metadata = load_features()

    X = df[feature_cols].copy()
    y = df["is_fraud"].astype(int).copy()

    # Handle any infinities
    X = X.replace([np.inf, -np.inf], np.nan).fillna(0)

    # 2. Cross-validation
    oof_preds, fold_metrics = run_cross_validation(X, y, feature_cols)

    # 3. Evaluate OOF
    eval_metrics = evaluate_oof(y, oof_preds, fold_metrics)

    # 4. Train final model
    avg_best_iter = int(np.mean([m["best_iteration"] for m in fold_metrics]))
    final_model = train_final_model(X, y, max(avg_best_iter, 100))

    # 5. Feature importance
    save_feature_importance(final_model, feature_cols)

    # 6. SHAP
    compute_shap(final_model, X, feature_cols)

    # 7. Save
    save_model_and_config(final_model, feature_cols, eval_metrics, metadata, fold_metrics)

    elapsed = time.time() - pipeline_start
    print(f"\n{'=' * 70}")
    print(f"  MODEL TRAINING COMPLETE  ({elapsed:.1f}s)")
    print(f"  PR-AUC: {eval_metrics['global_pr_auc']:.4f}")
    print(f"  F1:     {eval_metrics['global_f1']:.4f}")
    print(f"  Recall: {eval_metrics['recall']:.3f}")
    print(f"  FPR:    {eval_metrics['false_positive_rate']:.4f}")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
