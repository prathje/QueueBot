"""
Analyse match history to gauge how well OpenSkill can rate the player pool.

For OpenSkill to produce globally comparable ratings, the "opponent graph"
(edges between players who have faced each other) needs to be one densely
connected component. Sparse or fragmented graphs produce rating "islands"
where ratings only mean something inside each cluster.

Usage: python3 scripts/analyze_matches.py [path/to/matchresults.json]
"""

import json
import sys
import statistics
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from itertools import combinations

import networkx as nx

DEFAULT_PATH = "data/teeworlds-league.matchresults.json"


def parse_completed_at(record):
    raw = record["completedAt"]
    if isinstance(raw, dict) and "$date" in raw:
        raw = raw["$date"]
    return datetime.fromisoformat(raw.replace("Z", "+00:00"))


def load(path):
    with open(path) as f:
        return json.load(f)


def filter_queue(records, queue_id):
    return [r for r in records if r["queueId"] == queue_id]


def build_graphs(matches):
    """Return (co_play_graph, opponent_graph). Edge weight = number of matches."""
    co_play = nx.Graph()
    opp = nx.Graph()

    for m in matches:
        t1 = m["teams"]["team1"]
        t2 = m["teams"]["team2"]
        all_players = list(set(t1) | set(t2))
        for p in all_players:
            co_play.add_node(p)
            opp.add_node(p)

        # Co-play: every pair within the match (teammates + opponents)
        for a, b in combinations(all_players, 2):
            if co_play.has_edge(a, b):
                co_play[a][b]["weight"] += 1
            else:
                co_play.add_edge(a, b, weight=1)

        # Opponent: every team1 vs team2 pair
        for a in t1:
            for b in t2:
                if opp.has_edge(a, b):
                    opp[a][b]["weight"] += 1
                else:
                    opp.add_edge(a, b, weight=1)

    return co_play, opp


def graph_stats(g, label, total_possible_pairs=None):
    print(f"  {label}:")
    n = g.number_of_nodes()
    m = g.number_of_edges()
    if n == 0:
        print("    (empty)")
        return
    print(f"    nodes: {n}, edges: {m}")
    components = list(nx.connected_components(g))
    sizes = sorted((len(c) for c in components), reverse=True)
    print(f"    components: {len(components)} (sizes: {sizes[:10]}{'…' if len(sizes) > 10 else ''})")

    largest = max(components, key=len)
    sub = g.subgraph(largest)
    print(f"    largest component: {len(largest)} players, {sub.number_of_edges()} edges")

    possible_pairs = (n * (n - 1)) // 2
    pair_coverage = m / possible_pairs if possible_pairs else 0
    print(f"    pair coverage: {m}/{possible_pairs} ({pair_coverage:.1%})")

    degrees = [d for _, d in g.degree()]
    print(f"    degree: mean {statistics.mean(degrees):.1f}, "
          f"median {statistics.median(degrees):.1f}, "
          f"min {min(degrees)}, max {max(degrees)}")

    weights = [data["weight"] for _, _, data in g.edges(data=True)]
    if weights:
        print(f"    edge weight (matches per pair): "
              f"mean {statistics.mean(weights):.1f}, "
              f"median {statistics.median(weights)}, "
              f"max {max(weights)}")

    if len(largest) > 1 and sub.number_of_edges() > 0:
        try:
            diam = nx.diameter(sub)
            avg_path = nx.average_shortest_path_length(sub)
            print(f"    largest-component diameter: {diam}, avg path length: {avg_path:.2f}")
        except nx.NetworkXError:
            pass


def player_match_counts(matches):
    counts = Counter()
    for m in matches:
        for p in set(m["players"]):
            counts[p] += 1
    return counts


def percentile(values, p):
    if not values:
        return 0
    s = sorted(values)
    k = (len(s) - 1) * p
    f = int(k)
    c = min(f + 1, len(s) - 1)
    return s[f] + (s[c] - s[f]) * (k - f)


def analyse(matches, label, active_window_days=None):
    print(f"\n{'=' * 60}\n{label}\n{'=' * 60}")
    if not matches:
        print("(no matches)")
        return

    dates = [parse_completed_at(m) for m in matches]
    span_days = (max(dates) - min(dates)).days
    print(f"matches: {len(matches)}")
    print(f"date range: {min(dates).date()} → {max(dates).date()} ({span_days} days)")

    counts = player_match_counts(matches)
    n_players = len(counts)
    print(f"distinct players: {n_players}")

    values = list(counts.values())
    print(f"matches per player: "
          f"mean {statistics.mean(values):.1f}, "
          f"median {statistics.median(values):.1f}, "
          f"p25 {percentile(values, 0.25):.1f}, "
          f"p75 {percentile(values, 0.75):.1f}, "
          f"max {max(values)}")

    # Distribution buckets (rough sense of how many active vs casual players)
    buckets = [(1, 4), (5, 19), (20, 49), (50, 99), (100, 10**9)]
    print("  match-count distribution:")
    for lo, hi in buckets:
        n = sum(1 for v in values if lo <= v <= hi)
        upper = "+" if hi >= 10**9 else f"–{hi}"
        print(f"    {lo}{upper:>5}  matches: {n} players")

    print("\nGraph analysis (all-time):")
    co, opp = build_graphs(matches)
    graph_stats(co, "co-play graph (teammates + opponents)")
    graph_stats(opp, "opponent graph (team1 vs team2)")

    if active_window_days is not None:
        cutoff = max(dates) - timedelta(days=active_window_days)
        recent = [m for m, d in zip(matches, dates) if d >= cutoff]
        if recent:
            print(f"\nRecent activity (last {active_window_days} days, {len(recent)} matches):")
            recent_counts = player_match_counts(recent)
            print(f"  active players: {len(recent_counts)}")
            recent_values = list(recent_counts.values())
            if recent_values:
                print(f"  matches per active player: "
                      f"mean {statistics.mean(recent_values):.1f}, "
                      f"median {statistics.median(recent_values):.1f}, "
                      f"max {max(recent_values)}")
            rco, ropp = build_graphs(recent)
            graph_stats(rco, "co-play graph (active subset)")
            graph_stats(ropp, "opponent graph (active subset)")


def main():
    path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_PATH
    data = load(path)

    for queue_id, label in [
        ("gctf_2v2", "gCTF 2v2"),
        ("gctf_3v3", "gCTF 3v3"),
    ]:
        analyse(filter_queue(data, queue_id), label, active_window_days=28)

    # Combined view
    combined = filter_queue(data, "gctf_2v2") + filter_queue(data, "gctf_3v3")
    analyse(combined, "gCTF combined (2v2 + 3v3)", active_window_days=28)


if __name__ == "__main__":
    main()
