"""
03_graph_features.py
====================
UPI Fraud Detection — Graph-Based Ring Detection Module

Builds a NetworkX transaction graph, computes per-node graph metrics
(degree, PageRank, HITS, clustering, SCC), Louvain community detection,
and ring risk scores.

Outputs:
  - models/graph_node_features.parquet
  - models/graph_risk_scores.pkl
"""

import os
import json
import warnings
import time
import pickle
from pathlib import Path

import numpy as np
import pandas as pd
import networkx as nx

warnings.filterwarnings("ignore")

# ────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ────────────────────────────────────────────────────────────────────

DATA_DIR = Path("./data")
MODELS_DIR = Path("./models")
os.makedirs(MODELS_DIR, exist_ok=True)

FEATURE_FILE = DATA_DIR / "features_train.parquet"
RING_FILE = DATA_DIR / "upi_fraud_rings.json"
TRANSACTION_FILE = DATA_DIR / "upi_transactions.csv"

GRAPH_FEATURES_OUTPUT = MODELS_DIR / "graph_node_features.parquet"
GRAPH_RISK_OUTPUT = MODELS_DIR / "graph_risk_scores.pkl"


# ────────────────────────────────────────────────────────────────────
# 1. LOAD FRAUD RINGS
# ────────────────────────────────────────────────────────────────────

def load_rings(path: Path) -> dict:
    """Load and display fraud rings from JSON."""
    print(f"[1/6] Loading fraud rings from {path} ...")
    with open(path, "r") as f:
        rings = json.load(f)

    # Print ring summary table
    print(f"\n  {'Ring ID':<16} {'Type':<12} {'Size':<6} {'Controller':<12}")
    print(f"  {'─' * 16} {'─' * 12} {'─' * 6} {'─' * 12}")

    ring_members_set = set()
    ring_controllers_set = set()
    ring_membership = {}  # user_id → ring_id

    for ring_id, ring_data in rings.items():
        ring_type = ring_data.get("type", "unknown")

        if ring_type == "hub_spoke":
            controller = ring_data.get("controller", "N/A")
            members = ring_data.get("all_members", [])
            print(f"  {ring_id:<16} {ring_type:<12} {len(members):<6} {controller:<12}")
            ring_controllers_set.add(controller)
            for m in members:
                ring_members_set.add(m)
                ring_membership[m] = ring_id
        elif ring_type == "collusive":
            members = ring_data.get("members", [])
            print(f"  {ring_id:<16} {ring_type:<12} {len(members):<6} {'(collusive)':<12}")
            for m in members:
                ring_members_set.add(m)
                ring_membership[m] = ring_id

    hub_spoke_count = sum(1 for r in rings.values() if r.get("type") == "hub_spoke")
    collusive_count = sum(1 for r in rings.values() if r.get("type") == "collusive")
    print(f"\n  Total: {len(rings)} rings ({hub_spoke_count} hub-spoke, {collusive_count} collusive)")
    print(f"  Total ring members: {len(ring_members_set)}")
    print(f"  Total controllers:  {len(ring_controllers_set)}")

    return rings, ring_members_set, ring_controllers_set, ring_membership


# ────────────────────────────────────────────────────────────────────
# 2. BUILD TRANSACTION GRAPH
# ────────────────────────────────────────────────────────────────────

def build_transaction_graph(feature_file: Path, txn_file: Path) -> nx.DiGraph:
    """
    Build a directed graph: sender_user_id → receiver_id.
    Each unique pair = one edge with weight (txn count) and total_amount.
    """
    print(f"\n[2/6] Building transaction graph ...")

    # Try to load from feature file, fall back to raw transactions
    if feature_file.exists():
        print(f"       Loading from {feature_file} ...")
        df = pd.read_parquet(feature_file, columns=["sender_user_id", "receiver_id", "amount"])
    elif txn_file.exists():
        print(f"       Loading from {txn_file} ...")
        df = pd.read_csv(txn_file, usecols=["sender_user_id", "receiver_id", "amount"])
    else:
        print("       WARNING: No transaction data found. Building minimal graph from rings only.")
        return None

    print(f"       {len(df):,} transactions loaded")

    # Aggregate edges
    edge_agg = df.groupby(["sender_user_id", "receiver_id"]).agg(
        weight=("amount", "count"),
        total_amount=("amount", "sum"),
    ).reset_index()

    print(f"       {len(edge_agg):,} unique edges (sender→receiver pairs)")

    # Build directed graph
    G = nx.DiGraph()
    for _, row in edge_agg.iterrows():
        G.add_edge(
            row["sender_user_id"],
            row["receiver_id"],
            weight=int(row["weight"]),
            total_amount=float(row["total_amount"]),
        )

    print(f"       Graph: {G.number_of_nodes():,} nodes, {G.number_of_edges():,} edges")
    return G


# ────────────────────────────────────────────────────────────────────
# 3. COMPUTE NODE METRICS
# ────────────────────────────────────────────────────────────────────

def compute_node_metrics(G: nx.DiGraph) -> pd.DataFrame:
    """
    Compute per-node graph metrics:
      - in_degree, out_degree, degree_ratio
      - in_volume, out_volume
      - pagerank
      - hub_score, authority_score (HITS)
      - clustering_coeff
      - scc_id, scc_size, in_large_scc
    """
    print(f"\n[3/6] Computing per-node graph metrics ...")
    start = time.time()
    nodes = list(G.nodes())

    # Degree statistics
    in_deg = dict(G.in_degree())
    out_deg = dict(G.out_degree())

    # Volume (weighted degree by total_amount)
    in_vol = {}
    out_vol = {}
    for node in nodes:
        in_vol[node] = sum(
            G[pred][node].get("total_amount", 0)
            for pred in G.predecessors(node)
        )
        out_vol[node] = sum(
            G[node][succ].get("total_amount", 0)
            for succ in G.successors(node)
        )

    # PageRank
    print("       Computing PageRank ...")
    try:
        pagerank = nx.pagerank(G, alpha=0.85, max_iter=100, weight="weight")
    except Exception:
        pagerank = {n: 1.0 / len(nodes) for n in nodes}

    # HITS (hub and authority scores)
    print("       Computing HITS scores ...")
    try:
        hub_scores, authority_scores = nx.hits(G, max_iter=100)
    except Exception:
        hub_scores = {n: 0.0 for n in nodes}
        authority_scores = {n: 0.0 for n in nodes}

    # Clustering coefficient (on undirected view)
    print("       Computing clustering coefficients ...")
    G_undirected = G.to_undirected()
    clustering = nx.clustering(G_undirected)

    # Strongly connected components
    print("       Computing SCCs ...")
    scc_map = {}
    scc_size_map = {}
    for scc_id, scc in enumerate(nx.strongly_connected_components(G)):
        for node in scc:
            scc_map[node] = scc_id
            scc_size_map[node] = len(scc)

    # Build dataframe
    df = pd.DataFrame({
        "node_id": nodes,
        "in_degree": [in_deg.get(n, 0) for n in nodes],
        "out_degree": [out_deg.get(n, 0) for n in nodes],
        "in_volume": [in_vol.get(n, 0) for n in nodes],
        "out_volume": [out_vol.get(n, 0) for n in nodes],
        "pagerank": [pagerank.get(n, 0) for n in nodes],
        "hub_score": [hub_scores.get(n, 0) for n in nodes],
        "authority_score": [authority_scores.get(n, 0) for n in nodes],
        "clustering_coeff": [clustering.get(n, 0) for n in nodes],
        "scc_id": [scc_map.get(n, -1) for n in nodes],
        "scc_size": [scc_size_map.get(n, 1) for n in nodes],
    })

    df["degree_ratio"] = df["out_degree"] / (df["in_degree"] + 1)
    df["in_large_scc"] = (df["scc_size"] > 3).astype(int)

    elapsed = time.time() - start
    print(f"       Graph metrics computed in {elapsed:.1f}s")
    return df


# ────────────────────────────────────────────────────────────────────
# 4. COMMUNITY DETECTION (LOUVAIN)
# ────────────────────────────────────────────────────────────────────

def detect_communities(G: nx.DiGraph, node_df: pd.DataFrame) -> pd.DataFrame:
    """
    Use Louvain community detection to find implicit communities.
    This can catch rings NOT listed in the ground-truth JSON.
    """
    print(f"\n[4/6] Running community detection (Louvain) ...")

    try:
        import community as community_louvain

        G_undirected = G.to_undirected()
        partition = community_louvain.best_partition(G_undirected, random_state=42)

        node_df["community_id"] = node_df["node_id"].map(partition).fillna(-1).astype(int)

        # Community sizes
        community_sizes = node_df["community_id"].value_counts()
        large_communities = community_sizes[community_sizes > 5]
        node_df["community_size"] = node_df["community_id"].map(community_sizes).fillna(1).astype(int)
        node_df["in_large_community"] = (node_df["community_size"] > 5).astype(int)

        print(f"       Found {len(community_sizes)} communities")
        print(f"       Large communities (>5 members): {len(large_communities)}")

    except ImportError:
        print("       WARNING: python-louvain not installed. Skipping community detection.")
        print("       Install with: pip install python-louvain")
        node_df["community_id"] = -1
        node_df["community_size"] = 1
        node_df["in_large_community"] = 0

    except Exception as e:
        print(f"       WARNING: Community detection failed: {e}")
        node_df["community_id"] = -1
        node_df["community_size"] = 1
        node_df["in_large_community"] = 0

    return node_df


# ────────────────────────────────────────────────────────────────────
# 5. COMPUTE RING RISK SCORES
# ────────────────────────────────────────────────────────────────────

def compute_ring_risk_scores(
    node_df: pd.DataFrame,
    ring_members_set: set,
    ring_controllers_set: set,
) -> dict:
    """
    Compute the composite ring risk score per node.

    Formula:
        graph_ring_risk = (
            0.25 × (out_degree / max_out_degree) +
            0.20 × in_large_scc +
            0.15 × in_large_community +
            0.20 × (hub_score / max_hub_score) +
            0.20 × known_ring_member
        ).clip(0, 1)

    Controllers get 1.2× multiplier, clipped at 1.0.
    """
    print(f"\n[5/6] Computing ring risk scores ...")

    max_out_degree = max(node_df["out_degree"].max(), 1)
    max_hub_score = max(node_df["hub_score"].max(), 1e-10)

    # Known ring membership flag
    node_df["known_ring_member"] = node_df["node_id"].isin(ring_members_set).astype(int)
    node_df["is_controller"] = node_df["node_id"].isin(ring_controllers_set).astype(int)

    # Composite risk score
    node_df["graph_ring_risk"] = (
        0.25 * (node_df["out_degree"] / max_out_degree) +
        0.20 * node_df["in_large_scc"] +
        0.15 * node_df["in_large_community"] +
        0.20 * (node_df["hub_score"] / max_hub_score) +
        0.20 * node_df["known_ring_member"]
    ).clip(0, 1)

    # Controller multiplier
    controller_mask = node_df["is_controller"] == 1
    node_df.loc[controller_mask, "graph_ring_risk"] = (
        node_df.loc[controller_mask, "graph_ring_risk"] * 1.2
    ).clip(0, 1)

    # Build O(1) lookup dictionary
    risk_scores = dict(zip(node_df["node_id"], node_df["graph_ring_risk"]))

    # Stats
    high_risk = (node_df["graph_ring_risk"] > 0.5).sum()
    medium_risk = ((node_df["graph_ring_risk"] > 0.2) & (node_df["graph_ring_risk"] <= 0.5)).sum()
    print(f"       High risk (>0.5):   {high_risk:,} nodes")
    print(f"       Medium risk (0.2–0.5): {medium_risk:,} nodes")
    print(f"       Ring members risk:   mean={node_df.loc[node_df['known_ring_member']==1, 'graph_ring_risk'].mean():.3f}")
    print(f"       Non-ring risk:       mean={node_df.loc[node_df['known_ring_member']==0, 'graph_ring_risk'].mean():.3f}")

    return risk_scores


# ────────────────────────────────────────────────────────────────────
# 6. BUILD MINIMAL GRAPH FROM RINGS ONLY (FALLBACK)
# ────────────────────────────────────────────────────────────────────

def build_minimal_risk_from_rings(
    rings: dict,
    ring_members_set: set,
    ring_controllers_set: set,
) -> dict:
    """
    Fallback: if no transaction data, assign risk based on ring membership alone.
    Controllers → 1.0, ring members → 0.6, others → 0.0
    """
    print("       Building minimal risk scores from ring JSON only ...")
    risk_scores = {}
    for member in ring_members_set:
        if member in ring_controllers_set:
            risk_scores[member] = 1.0
        else:
            risk_scores[member] = 0.6
    return risk_scores


# ────────────────────────────────────────────────────────────────────
# 7. SAVE OUTPUTS
# ────────────────────────────────────────────────────────────────────

def save_outputs(node_df: pd.DataFrame, risk_scores: dict):
    """Save graph node features and risk score lookup."""
    print(f"\n[6/6] Saving outputs ...")

    if node_df is not None:
        node_df.to_parquet(GRAPH_FEATURES_OUTPUT, index=False)
        print(f"       Node features → {GRAPH_FEATURES_OUTPUT}  ({len(node_df):,} nodes)")

    with open(GRAPH_RISK_OUTPUT, "wb") as f:
        pickle.dump(risk_scores, f)
    print(f"       Risk scores  → {GRAPH_RISK_OUTPUT}  ({len(risk_scores):,} entries)")


# ────────────────────────────────────────────────────────────────────
# MAIN
# ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 70)
    print("  UPI FRAUD DETECTION — GRAPH FEATURE ENGINEERING")
    print("=" * 70)
    pipeline_start = time.time()

    # 1. Load rings
    rings, ring_members_set, ring_controllers_set, ring_membership = load_rings(RING_FILE)

    # 2. Build transaction graph
    G = build_transaction_graph(FEATURE_FILE, TRANSACTION_FILE)

    if G is not None and G.number_of_nodes() > 0:
        # 3. Compute node metrics
        node_df = compute_node_metrics(G)

        # 4. Community detection
        node_df = detect_communities(G, node_df)

        # 5. Ring risk scores
        risk_scores = compute_ring_risk_scores(node_df, ring_members_set, ring_controllers_set)

        # 6. Save
        save_outputs(node_df, risk_scores)
    else:
        # Fallback: minimal risk from rings JSON only
        risk_scores = build_minimal_risk_from_rings(rings, ring_members_set, ring_controllers_set)
        save_outputs(None, risk_scores)

    elapsed = time.time() - pipeline_start
    print(f"\n{'=' * 70}")
    print(f"  GRAPH FEATURES COMPLETE  ({elapsed:.1f}s)")
    print(f"  Risk scores for {len(risk_scores):,} nodes")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
