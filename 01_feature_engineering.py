"""
01_feature_engineering.py
========================
UPI Fraud Detection — Feature Engineering Pipeline

Loads all 5 raw data sources, merges them, and engineers ~55 features
including amount, time, sender profile, graph/ring, merchant, and
rolling velocity features.

Outputs:
  - data/features_train.parquet   (full feature matrix, ~500K rows)
  - data/feature_metadata.json    (feature col list + encoding maps)
"""

import os
import json
import warnings
import time
from pathlib import Path

import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")

# ────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ────────────────────────────────────────────────────────────────────

DATA_DIR = Path("./data")
OUTPUT_DIR = Path("./data")
MODELS_DIR = Path("./models")

TRANSACTION_FILE = DATA_DIR / "upi_transactions.csv"
FRAUD_LABEL_FILE = DATA_DIR / "upi_fraud_labels.csv"
USER_PROFILE_FILE = DATA_DIR / "upi_user_profiles.csv"
MERCHANT_PROFILE_FILE = DATA_DIR / "upi_merchant_profiles.csv"
RING_FILE = DATA_DIR / "upi_fraud_rings.json"

FEATURE_OUTPUT = OUTPUT_DIR / "features_train.parquet"
METADATA_OUTPUT = OUTPUT_DIR / "feature_metadata.json"

# Create output directories
os.makedirs(MODELS_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)


# ────────────────────────────────────────────────────────────────────
# 1. LOAD RAW DATA
# ────────────────────────────────────────────────────────────────────

def load_transactions(path: Path) -> pd.DataFrame:
    """Load UPI transactions CSV."""
    print(f"[1/7] Loading transactions from {path} ...")
    df = pd.read_csv(path, parse_dates=["timestamp"])
    print(f"       Loaded {len(df):,} transactions, {df.shape[1]} columns")
    return df


def load_fraud_labels(path: Path) -> pd.DataFrame:
    """Load fraud labels CSV (fraud rows only)."""
    print(f"[2/7] Loading fraud labels from {path} ...")
    df = pd.read_csv(path, parse_dates=["timestamp"])
    print(f"       Loaded {len(df):,} fraud labels")
    return df


def load_user_profiles(path: Path) -> pd.DataFrame:
    """Load user profile CSV."""
    print(f"[3/7] Loading user profiles from {path} ...")
    df = pd.read_csv(path)
    print(f"       Loaded {len(df):,} user profiles")
    return df


def load_merchant_profiles(path: Path) -> pd.DataFrame:
    """Load merchant profile CSV."""
    print(f"[4/7] Loading merchant profiles from {path} ...")
    df = pd.read_csv(path)
    print(f"       Loaded {len(df):,} merchant profiles")
    return df


def load_fraud_rings(path: Path) -> dict:
    """Load fraud rings JSON."""
    print(f"[5/7] Loading fraud rings from {path} ...")
    with open(path, "r") as f:
        rings = json.load(f)
    print(f"       Loaded {len(rings)} fraud rings")
    return rings


# ────────────────────────────────────────────────────────────────────
# 2. BUILD RING MEMBERSHIP LOOKUP
# ────────────────────────────────────────────────────────────────────

def build_ring_membership(rings: dict) -> pd.DataFrame:
    """
    Build a flat lookup table from the rings JSON.
    Columns: user_id, ring_id, ring_type, is_controller
    """
    records = []
    for ring_id, ring_data in rings.items():
        ring_type = ring_data.get("type", "unknown")

        if ring_type == "hub_spoke":
            controller = ring_data.get("controller", "")
            all_members = ring_data.get("all_members", [])
            for member in all_members:
                records.append({
                    "user_id": member,
                    "ring_id": ring_id,
                    "ring_type": ring_type,
                    "is_controller": 1 if member == controller else 0,
                })
        elif ring_type == "collusive":
            members = ring_data.get("members", [])
            for member in members:
                records.append({
                    "user_id": member,
                    "ring_id": ring_id,
                    "ring_type": ring_type,
                    "is_controller": 0,  # No single controller in collusive rings
                })

    df = pd.DataFrame(records)
    print(f"       Built ring membership: {len(df)} user-ring entries")
    return df


# ────────────────────────────────────────────────────────────────────
# 3. MERGE ALL DATA SOURCES
# ────────────────────────────────────────────────────────────────────

def merge_data(
    txn: pd.DataFrame,
    fraud_labels: pd.DataFrame,
    users: pd.DataFrame,
    merchants: pd.DataFrame,
    ring_membership: pd.DataFrame,
) -> pd.DataFrame:
    """
    Merge all data sources onto the transaction table:
      1. Left-join fraud labels (fill missing → is_fraud=False)
      2. Left-join sender user profile (prefix: sender_)
      3. Left-join merchant profile (for P2M only)
      4. Left-join ring membership for sender AND receiver
    """
    print("[6/7] Merging data sources ...")
    df = txn.copy()

    # --- 1. Merge fraud labels ---
    # The transactions CSV may already have is_fraud. Use the labels file as
    # the authoritative fraud source and ensure consistency.
    fraud_cols_from_labels = ["transaction_id", "fraud_type", "fraud_sub_type", "fraud_ring_id"]
    fraud_subset = fraud_labels[
        [c for c in fraud_cols_from_labels if c in fraud_labels.columns]
    ].copy()

    # If is_fraud already in txn, keep it; otherwise create from labels
    if "is_fraud" not in df.columns:
        fraud_ids = set(fraud_labels["transaction_id"].unique())
        df["is_fraud"] = df["transaction_id"].isin(fraud_ids).astype(int)
    else:
        df["is_fraud"] = df["is_fraud"].astype(int)

    # Merge fraud detail columns
    if "fraud_type" not in df.columns:
        df = df.merge(fraud_subset, on="transaction_id", how="left")
    df["fraud_type"] = df.get("fraud_type", pd.Series(dtype=str)).fillna("legit")
    if "fraud_sub_type" in df.columns:
        df["fraud_sub_type"] = df["fraud_sub_type"].fillna("none")
    if "fraud_ring_id" in df.columns:
        df["fraud_ring_id"] = df["fraud_ring_id"].fillna("")

    print(f"       Fraud rate: {df['is_fraud'].mean():.4%}  ({df['is_fraud'].sum():,} fraud / {len(df):,} total)")

    # --- 2. Merge sender user profile ---
    # Rename user profile columns with sender_ prefix (avoid collisions)
    sender_cols_to_use = [
        "user_id", "age", "gender", "city", "state", "base_lat", "base_lon",
        "lat_std", "lon_std", "account_age_days", "kyc_level", "income_tier",
        "avg_txn_amount", "txn_frequency_per_day", "preferred_hour", "hour_std",
        "primary_device_id", "secondary_device_id", "device_brand", "os_version",
        "primary_app", "primary_app_package", "vulnerability_score",
        "is_mule", "mule_ring_id", "is_fraudster",
        "avg_typing_speed_ms", "avg_session_duration_s",
        "avg_touch_pressure", "typical_swipe_velocity",
    ]
    # Only pick columns that exist
    available_user_cols = [c for c in sender_cols_to_use if c in users.columns]
    user_subset = users[available_user_cols].copy()
    user_rename = {c: f"sender_{c}" for c in available_user_cols if c != "user_id"}
    user_subset = user_subset.rename(columns=user_rename)

    # Check what join key to use — avoid duplicating columns already in txn
    existing_sender_cols = [c for c in df.columns if c.startswith("sender_")]
    # We rename user_id → sender_user_id for the merge key
    user_subset = user_subset.rename(columns={"user_id": "sender_user_id"})

    # Drop user columns from txn that we'll replace from the profile
    cols_from_profile = [c for c in user_subset.columns if c in df.columns and c != "sender_user_id"]
    # Keep the profile version as authoritative for these enrichment fields
    # (but don't drop core txn fields)
    profile_override_cols = [
        c for c in cols_from_profile
        if c not in {"sender_lat", "sender_lon", "sender_city", "sender_state"}
    ]
    if profile_override_cols:
        df = df.drop(columns=profile_override_cols, errors="ignore")

    df = df.merge(user_subset, on="sender_user_id", how="left")
    print(f"       After sender profile join: {df.shape[1]} columns")

    # --- 3. Merge merchant profile (P2M only) ---
    merch_rename = {
        "merchant_id": "receiver_id",
        "category": "receiver_category",
        "city": "receiver_city",
        "state": "receiver_state",
        "lat": "receiver_lat",
        "lon": "receiver_lon",
        "is_verified": "receiver_is_verified_merchant",
        "registered_months_ago": "receiver_registered_months_ago",
        "avg_daily_txn": "receiver_avg_daily_txn",
        "is_fake": "receiver_is_fake_merchant",
    }
    merch_cols = [c for c in merch_rename.keys() if c in merchants.columns]
    merch_subset = merchants[merch_cols].copy().rename(columns=merch_rename)
    df = df.merge(merch_subset, on="receiver_id", how="left")
    print(f"       After merchant profile join: {df.shape[1]} columns")

    # --- 4. Merge ring membership for sender ---
    sender_ring = ring_membership.rename(columns={
        "user_id": "sender_user_id",
        "ring_id": "sender_ring_id",
        "ring_type": "sender_ring_type",
        "is_controller": "sender_is_controller",
    })
    # A user may belong to multiple rings; take first (dedup)
    sender_ring = sender_ring.drop_duplicates(subset=["sender_user_id"], keep="first")
    df = df.merge(sender_ring, on="sender_user_id", how="left")

    # --- 5. Merge ring membership for receiver ---
    receiver_ring = ring_membership.rename(columns={
        "user_id": "receiver_id",
        "ring_id": "receiver_ring_id",
        "ring_type": "receiver_ring_type",
        "is_controller": "receiver_is_controller",
    })
    receiver_ring = receiver_ring.drop_duplicates(subset=["receiver_id"], keep="first")
    df = df.merge(receiver_ring, on="receiver_id", how="left")

    # --- 6. Fill ring NaNs ---
    for col in ["sender_ring_id", "receiver_ring_id"]:
        if col in df.columns:
            df[col] = df[col].fillna("")
    for col in ["sender_is_controller", "receiver_is_controller"]:
        if col in df.columns:
            df[col] = df[col].fillna(0).astype(int)
    for col in ["sender_ring_type", "receiver_ring_type"]:
        if col in df.columns:
            df[col] = df[col].fillna("none")

    # sender_in_ring / receiver_in_ring
    df["sender_in_ring"] = (df["sender_ring_id"] != "").astype(int)
    df["receiver_in_ring"] = (df["receiver_ring_id"] != "").astype(int)

    # intra_ring_txn: both in same ring (and not empty)
    df["intra_ring_txn"] = (
        (df["sender_ring_id"] != "") &
        (df["receiver_ring_id"] != "") &
        (df["sender_ring_id"] == df["receiver_ring_id"])
    ).astype(int)

    print(f"       After ring joins: {df.shape[1]} columns")
    return df


# ────────────────────────────────────────────────────────────────────
# 4. FEATURE ENGINEERING
# ────────────────────────────────────────────────────────────────────

def engineer_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Engineer all feature groups:
      - Amount features
      - Time features
      - Sender profile features
      - Merchant features
      - Graph/ring features (already in df from merge)
      - Location features
      - Rolling velocity features (per sender, chronological)
    """
    print("[7/7] Engineering features ...")
    start = time.time()

    # ── AMOUNT FEATURES ──
    df["log_amount"] = np.log1p(df["amount"])
    sender_avg = df.get("sender_avg_txn_amount", pd.Series(500.0, index=df.index))
    if "sender_avg_txn_amount" not in df.columns:
        sender_avg = pd.Series(500.0, index=df.index)
    else:
        sender_avg = df["sender_avg_txn_amount"].fillna(500.0)
    df["amount_ratio"] = df["amount"] / (sender_avg + 1e-6)
    df["is_round_amount"] = (df["amount"] % 100 == 0).astype(int)
    df["is_high_value"] = (df["amount"] > 10000).astype(int)

    # Amount vs merchant average (P2M only)
    if "receiver_avg_daily_txn" in df.columns:
        df["amount_vs_merchant_avg"] = df["amount"] / (df["receiver_avg_daily_txn"].fillna(0) + 1e-6)
    else:
        df["amount_vs_merchant_avg"] = np.nan

    # ── TIME FEATURES ──
    if "hour_of_day" not in df.columns:
        df["hour_of_day"] = df["timestamp"].dt.hour
    else:
        df["hour_of_day"] = df["hour_of_day"].astype(int)

    if "day_of_week" not in df.columns:
        df["day_of_week"] = df["timestamp"].dt.dayofweek
    else:
        df["day_of_week"] = df["day_of_week"].astype(int)

    if "is_weekend" not in df.columns:
        df["is_weekend"] = (df["day_of_week"] >= 5).astype(int)
    else:
        df["is_weekend"] = df["is_weekend"].astype(int)

    df["is_night"] = ((df["hour_of_day"] >= 22) | (df["hour_of_day"] <= 5)).astype(int)
    df["is_peak_morning"] = ((df["hour_of_day"] >= 8) & (df["hour_of_day"] <= 10)).astype(int)
    df["is_peak_evening"] = ((df["hour_of_day"] >= 18) & (df["hour_of_day"] <= 21)).astype(int)

    # Hour deviation from sender's preferred hour
    pref_hour = df.get("sender_preferred_hour", pd.Series(12.0, index=df.index))
    if "sender_preferred_hour" not in df.columns:
        pref_hour = pd.Series(12.0, index=df.index)
    else:
        pref_hour = df["sender_preferred_hour"].fillna(12.0)
    df["hour_deviation"] = np.abs(df["hour_of_day"] - pref_hour).clip(upper=12)

    hour_std = df.get("sender_hour_std", pd.Series(4.0, index=df.index))
    if "sender_hour_std" not in df.columns:
        hour_std = pd.Series(4.0, index=df.index)
    else:
        hour_std = df["sender_hour_std"].fillna(4.0)
    df["hour_zscore"] = df["hour_deviation"] / (hour_std + 1e-6)

    # ── SENDER PROFILE FEATURES ──
    if "sender_account_age_days" in df.columns:
        acct_age = df["sender_account_age_days"].fillna(365)
    elif "account_age_days" in df.columns:
        acct_age = df["account_age_days"].fillna(365)
    else:
        acct_age = pd.Series(365, index=df.index)

    df["sender_account_age_days_feat"] = acct_age
    df["sender_is_new_account"] = (acct_age < 30).astype(int)
    df["sender_is_young_account"] = (acct_age < 90).astype(int)

    # KYC ordinal
    kyc_map = {"none": 0, "basic": 1, "partial": 2, "full": 3}
    kyc_col = "sender_kyc_level" if "sender_kyc_level" in df.columns else "kyc_level"
    if kyc_col in df.columns:
        df["sender_kyc_ordinal"] = df[kyc_col].map(kyc_map).fillna(0).astype(int)
    else:
        df["sender_kyc_ordinal"] = 0

    # Income ordinal
    income_map = {"low": 0, "lower_middle": 1, "middle": 2, "upper_middle": 3, "high": 4}
    income_col = "sender_income_tier" if "sender_income_tier" in df.columns else "income_tier"
    if income_col in df.columns:
        df["sender_income_ordinal"] = df[income_col].map(income_map).fillna(0).astype(int)
    else:
        df["sender_income_ordinal"] = 0

    # Vulnerability × amount interaction
    vuln_col = "sender_vulnerability_score" if "sender_vulnerability_score" in df.columns else "vulnerability_score"
    if vuln_col in df.columns:
        df["vuln_x_amount"] = df[vuln_col].fillna(0.3) * df["log_amount"]
    else:
        df["vuln_x_amount"] = 0.3 * df["log_amount"]

    # ── DEVICE FEATURES ──
    if "device_changed" in df.columns:
        df["device_changed"] = df["device_changed"].astype(int)
    elif "device_id" in df.columns and "sender_primary_device_id" in df.columns:
        df["device_changed"] = (
            df["device_id"].fillna("") != df["sender_primary_device_id"].fillna("")
        ).astype(int)
    else:
        df["device_changed"] = 0

    # ── MERCHANT FEATURES ──
    # receiver_is_merchant: use receiver_type or transaction_type
    if "receiver_type" in df.columns:
        df["receiver_is_merchant"] = (df["receiver_type"] == "merchant").astype(int)
    elif "transaction_type" in df.columns:
        df["receiver_is_merchant"] = (df["transaction_type"] == "P2M").astype(int)
    else:
        df["receiver_is_merchant"] = 0

    if "receiver_is_fake_merchant" not in df.columns:
        df["receiver_is_fake_merchant"] = 0
    else:
        df["receiver_is_fake_merchant"] = df["receiver_is_fake_merchant"].fillna(0).astype(int)

    if "receiver_is_verified_merchant" not in df.columns:
        df["receiver_is_verified_merchant"] = 0
    else:
        df["receiver_is_verified_merchant"] = df["receiver_is_verified_merchant"].fillna(0).astype(int)

    if "receiver_registered_months_ago" not in df.columns:
        df["receiver_registered_months_ago"] = np.nan

    # ── GEO FEATURES ──
    if "geo_distance_from_home_km" in df.columns:
        df["geo_distance_km"] = df["geo_distance_from_home_km"].fillna(0.0)
    elif all(c in df.columns for c in ["sender_lat", "sender_lon", "sender_base_lat", "sender_base_lon"]):
        # Haversine approximation
        lat1 = np.radians(df["sender_lat"].fillna(0))
        lon1 = np.radians(df["sender_lon"].fillna(0))
        lat2 = np.radians(df["sender_base_lat"].fillna(0))
        lon2 = np.radians(df["sender_base_lon"].fillna(0))
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
        df["geo_distance_km"] = 6371 * 2 * np.arcsin(np.sqrt(a.clip(0, 1)))
    else:
        df["geo_distance_km"] = 0.0

    # ── BEHAVIOURAL BIOMETRICS ──
    for col in ["sender_avg_typing_speed_ms", "sender_avg_session_duration_s",
                "sender_avg_touch_pressure", "sender_typical_swipe_velocity"]:
        if col not in df.columns:
            # Try without sender_ prefix
            base = col.replace("sender_", "")
            if base in df.columns:
                df[col] = df[base].fillna(0)
            else:
                df[col] = 0.0
        else:
            df[col] = df[col].fillna(0)

    # ── PIN ATTEMPTS ──
    if "pin_attempts" in df.columns:
        df["multiple_pin_attempts"] = (df["pin_attempts"] > 1).astype(int)
    else:
        df["multiple_pin_attempts"] = 0

    # ── APP LEGITIMACY ──
    if "app_version_legitimate" in df.columns:
        df["app_not_legitimate"] = (~df["app_version_legitimate"].fillna(True).astype(bool)).astype(int)
    else:
        df["app_not_legitimate"] = 0

    # ── IS NEW BENEFICIARY ──
    if "is_new_beneficiary" in df.columns:
        df["is_new_beneficiary"] = df["is_new_beneficiary"].astype(int)
    else:
        df["is_new_beneficiary"] = 0

    elapsed = time.time() - start
    print(f"       Basic features done in {elapsed:.1f}s")

    # ── ROLLING VELOCITY FEATURES ──
    print("       Computing rolling velocity features (this may take a few minutes) ...")
    df = compute_rolling_features(df)

    print(f"       Feature engineering complete: {df.shape[1]} total columns")
    return df


def compute_rolling_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Compute per-sender rolling window features:
      - txn_count_1h, amount_sum_1h, unique_recv_1h
      - txn_count_24h, amount_sum_24h, unique_recv_24h

    Uses a vectorised approach: sort by sender + timestamp, then for each
    transaction look back 1h and 24h. Uses pandas rolling on time-indexed
    groups for efficiency.
    """
    start = time.time()

    # Sort by sender and timestamp for chronological ordering
    df = df.sort_values(["sender_user_id", "timestamp"]).reset_index(drop=True)

    # Initialise columns
    for col in ["txn_count_1h", "amount_sum_1h", "unique_recv_1h",
                "txn_count_24h", "amount_sum_24h", "unique_recv_24h"]:
        df[col] = 0.0

    # Process per sender group using vectorised rolling
    # For large datasets, we use a chunked approach
    n_senders = df["sender_user_id"].nunique()
    print(f"       Processing {n_senders:,} unique senders ...")

    # Group by sender and compute rolling features
    # Using a pandas-native approach with time-based rolling
    # We set timestamp as index within each group to use time-based rolling

    results = []
    chunk_size = 5000
    sender_groups = df.groupby("sender_user_id")
    processed = 0

    for sender_id, group in sender_groups:
        if len(group) <= 1:
            # Single transaction — all rolling features are 0
            results.append(group.index.tolist())
            processed += 1
            continue

        g = group.set_index("timestamp").sort_index()

        # 1-hour window (look-back only)
        # shift(1) ensures we exclude the current transaction
        roll_1h = g["amount"].shift(1).rolling("1h", min_periods=0)
        count_1h = roll_1h.count().values
        sum_1h = roll_1h.sum().values

        roll_24h = g["amount"].shift(1).rolling("24h", min_periods=0)
        count_24h = roll_24h.count().values
        sum_24h = roll_24h.sum().values

        # For unique receivers, we use a simpler approximation:
        # count unique receivers in the window using a shifting approach
        # Since exact rolling unique is expensive, we approximate with
        # the ratio of count to a rough estimate
        idx = group.index
        df.loc[idx, "txn_count_1h"] = count_1h
        df.loc[idx, "amount_sum_1h"] = sum_1h
        df.loc[idx, "txn_count_24h"] = count_24h
        df.loc[idx, "amount_sum_24h"] = sum_24h

        # Unique receivers (approximate via loop for smaller groups,
        # fallback to count for larger groups)
        if len(group) <= 200:
            timestamps = group["timestamp"].values
            receivers = group["receiver_id"].values
            unique_1h = np.zeros(len(group))
            unique_24h = np.zeros(len(group))
            for i in range(1, len(group)):
                ts_i = timestamps[i]
                # 1h window
                mask_1h = (timestamps[:i] >= ts_i - np.timedelta64(1, "h"))
                if mask_1h.any():
                    unique_1h[i] = len(set(receivers[:i][mask_1h]))
                # 24h window
                mask_24h = (timestamps[:i] >= ts_i - np.timedelta64(24, "h"))
                if mask_24h.any():
                    unique_24h[i] = len(set(receivers[:i][mask_24h]))
            df.loc[idx, "unique_recv_1h"] = unique_1h
            df.loc[idx, "unique_recv_24h"] = unique_24h
        else:
            # Approximation: unique receivers ≈ min(count, some cap)
            df.loc[idx, "unique_recv_1h"] = np.minimum(count_1h, 20)
            df.loc[idx, "unique_recv_24h"] = np.minimum(count_24h, 50)

        processed += 1
        if processed % chunk_size == 0:
            elapsed = time.time() - start
            print(f"       ... processed {processed:,}/{n_senders:,} senders ({elapsed:.1f}s)")

    elapsed = time.time() - start
    print(f"       Rolling features complete in {elapsed:.1f}s")
    return df


# ────────────────────────────────────────────────────────────────────
# 5. CATEGORICAL ENCODING
# ────────────────────────────────────────────────────────────────────

def encode_categoricals(df: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    """
    Label-encode categorical columns and return encoding maps.
    """
    print("       Encoding categorical columns ...")

    cat_columns = [
        "transaction_type", "sender_gender", "sender_state",
        "sender_device_brand", "sender_primary_app",
        "sender_ring_type", "receiver_ring_type", "receiver_category",
    ]

    # Also handle columns that may exist with slightly different names
    alt_names = {
        "sender_gender": "gender",
        "sender_state": "sender_state",
        "sender_device_brand": "device_brand",
        "sender_primary_app": "primary_app",
    }

    encoding_map = {}

    for col in cat_columns:
        # Find the actual column name
        actual_col = col
        if col not in df.columns and col in alt_names and alt_names[col] in df.columns:
            actual_col = alt_names[col]

        if actual_col not in df.columns:
            df[f"{col}_encoded"] = 0
            encoding_map[col] = {}
            continue

        # Fill NaN with "unknown"
        df[actual_col] = df[actual_col].fillna("unknown").astype(str)

        # Create mapping
        unique_vals = sorted(df[actual_col].unique())
        val_to_int = {v: i for i, v in enumerate(unique_vals)}
        encoding_map[col] = val_to_int

        # Apply encoding
        df[f"{col}_encoded"] = df[actual_col].map(val_to_int).fillna(0).astype(int)

    return df, encoding_map


# ────────────────────────────────────────────────────────────────────
# 6. SELECT FINAL FEATURE COLUMNS
# ────────────────────────────────────────────────────────────────────

def select_features(df: pd.DataFrame) -> tuple[pd.DataFrame, list]:
    """
    Select the final feature columns for model training.
    Returns the dataframe with only relevant columns and the feature list.
    """
    # Core feature columns (order matters for model consistency)
    feature_cols = [
        # Amount features
        "log_amount", "amount_ratio", "is_round_amount", "is_high_value",
        "amount_vs_merchant_avg",
        # Time features
        "hour_of_day", "day_of_week", "is_weekend", "is_night",
        "is_peak_morning", "is_peak_evening",
        "hour_deviation", "hour_zscore",
        # Sender profile features
        "sender_account_age_days_feat", "sender_is_new_account", "sender_is_young_account",
        "sender_kyc_ordinal", "sender_income_ordinal",
        "vuln_x_amount",
        # Ring features
        "sender_in_ring", "sender_is_controller",
        "receiver_in_ring", "receiver_is_controller",
        "intra_ring_txn",
        # Merchant features
        "receiver_is_merchant", "receiver_is_fake_merchant",
        "receiver_is_verified_merchant", "receiver_registered_months_ago",
        # Geo features
        "geo_distance_km",
        # Device features
        "device_changed",
        # Behavioural biometrics
        "sender_avg_typing_speed_ms", "sender_avg_session_duration_s",
        "sender_avg_touch_pressure", "sender_typical_swipe_velocity",
        # Rolling velocity features
        "txn_count_1h", "amount_sum_1h", "unique_recv_1h",
        "txn_count_24h", "amount_sum_24h", "unique_recv_24h",
        # Extra signals
        "multiple_pin_attempts", "app_not_legitimate", "is_new_beneficiary",
        # Encoded categoricals
        "transaction_type_encoded", "sender_gender_encoded",
        "sender_state_encoded", "sender_device_brand_encoded",
        "sender_primary_app_encoded",
        "sender_ring_type_encoded", "receiver_ring_type_encoded",
        "receiver_category_encoded",
    ]

    # Also include vulnerability_score directly if available
    vuln_col = "sender_vulnerability_score" if "sender_vulnerability_score" in df.columns else "vulnerability_score"
    if vuln_col in df.columns:
        feature_cols.append("sender_vulnerability_score_direct")
        df["sender_vulnerability_score_direct"] = df[vuln_col].fillna(0.3)

    # Filter to only columns that exist
    available_features = [c for c in feature_cols if c in df.columns]
    missing = [c for c in feature_cols if c not in df.columns]
    if missing:
        print(f"       WARNING: {len(missing)} features not available: {missing[:5]}...")

    # Meta columns to keep alongside features
    meta_cols = ["transaction_id", "sender_user_id", "receiver_id",
                 "timestamp", "amount", "is_fraud", "fraud_type"]
    meta_cols = [c for c in meta_cols if c in df.columns]

    output_cols = meta_cols + available_features
    result = df[output_cols].copy()

    # Fill any remaining NaN in feature columns with 0
    for c in available_features:
        result[c] = result[c].fillna(0)

    print(f"       Selected {len(available_features)} feature columns + {len(meta_cols)} meta columns")
    return result, available_features


# ────────────────────────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  UPI FRAUD DETECTION — FEATURE ENGINEERING PIPELINE")
    print("=" * 70)
    pipeline_start = time.time()

    # 1. Load all data
    txn = load_transactions(TRANSACTION_FILE)
    fraud_labels = load_fraud_labels(FRAUD_LABEL_FILE)
    users = load_user_profiles(USER_PROFILE_FILE)
    merchants = load_merchant_profiles(MERCHANT_PROFILE_FILE)
    rings = load_fraud_rings(RING_FILE)

    # 2. Build ring membership
    ring_membership = build_ring_membership(rings)

    # 3. Merge all data
    df = merge_data(txn, fraud_labels, users, merchants, ring_membership)

    # 4. Engineer features
    df = engineer_features(df)

    # 5. Encode categoricals
    df, encoding_map = encode_categoricals(df)

    # 6. Select final features
    df, feature_cols = select_features(df)

    # 7. Save outputs
    print(f"\nSaving outputs ...")
    df.to_parquet(FEATURE_OUTPUT, index=False)
    print(f"  → {FEATURE_OUTPUT}  ({len(df):,} rows × {len(df.columns)} cols)")

    metadata = {
        "feature_cols": feature_cols,
        "encoding_map": encoding_map,
        "n_rows": len(df),
        "n_features": len(feature_cols),
        "fraud_count": int(df["is_fraud"].sum()),
        "fraud_rate": float(df["is_fraud"].mean()),
        "meta_cols": ["transaction_id", "sender_user_id", "receiver_id",
                      "timestamp", "amount", "is_fraud", "fraud_type"],
    }
    with open(METADATA_OUTPUT, "w") as f:
        json.dump(metadata, f, indent=2, default=str)
    print(f"  → {METADATA_OUTPUT}")

    elapsed = time.time() - pipeline_start
    print(f"\n{'=' * 70}")
    print(f"  FEATURE ENGINEERING COMPLETE  ({elapsed:.1f}s)")
    print(f"  Features: {len(feature_cols)} | Rows: {len(df):,}")
    print(f"  Fraud: {df['is_fraud'].sum():,} ({df['is_fraud'].mean():.3%})")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
