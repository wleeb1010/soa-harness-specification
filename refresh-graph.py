#!/usr/bin/env python3
"""
refresh-graph.py — rebuild graphify-out/ using AST + cached semantic + citation extractions.

Pipeline:
  1. AST extraction on code files (fresh, deterministic, no LLM)
  2. Load all cached semantic extractions (free — written by prior /graphify runs)
  3. Citation extractor on all .md files (fresh, deterministic, no LLM)
  4. Merge via graphify.build.build([...])
  5. Re-cluster and analyze
  6. Regenerate graph.json + graph.html + GRAPH_REPORT.md

Invoked by git post-commit/post-checkout hooks; safe to run manually.
Falls back gracefully if graphify isn't installed or no semantic cache exists.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

os.environ.setdefault("PYTHONIOENCODING", "utf-8")

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "graphify-out"
CACHE = OUT / "cache"
CITATIONS = OUT / "citations.json"


def load_citations() -> dict:
    script = ROOT / "extract-citations.py"
    if not script.exists():
        return {"nodes": [], "edges": [], "hyperedges": []}
    subprocess.run(
        [sys.executable, str(script), str(ROOT), "-o", str(CITATIONS)],
        check=True,
    )
    return json.loads(CITATIONS.read_text(encoding="utf-8"))


def load_semantic_cache() -> dict:
    """Load only cache entries whose hash matches a current file in the tree.

    Stale entries (from files that were edited, renamed, or deleted since the
    last `/graphify .` run) are silently skipped so they don't contaminate
    the merged graph.
    """
    merged = {"nodes": [], "edges": [], "hyperedges": [], "stats": {"live": 0, "stale": 0, "uncovered": []}}
    if not CACHE.exists():
        return merged

    try:
        from graphify.cache import file_hash
    except ImportError:
        return merged

    # Build the set of hashes for every current project file graphify might cache
    current_hashes: dict[str, str] = {}  # hash -> relpath
    candidate_patterns = ("*.md", "*.mjs", "*.py", "*.ts", "*.js", "*.go", "*.rs",
                          "*.java", "*.cpp", "*.c", "*.rb", "*.swift", "*.kt", "*.cs")
    for pat in candidate_patterns:
        for p in ROOT.rglob(pat):
            if OUT in p.parents:
                continue
            try:
                h = file_hash(p, ROOT)
                current_hashes[h] = str(p.relative_to(ROOT))
            except OSError:
                pass

    seen_node_ids: set[str] = set()
    covered_files: set[str] = set()
    live, stale, pruned = 0, 0, 0
    prune = os.environ.get("REFRESH_GRAPH_PRUNE", "1") != "0"
    for entry in CACHE.glob("*.json"):
        if entry.stem not in current_hashes:
            stale += 1
            # Prune stale cache file from disk (source file deleted or edited)
            if prune:
                try:
                    entry.unlink()
                    pruned += 1
                except OSError:
                    pass
            continue
        live += 1
        covered_files.add(current_hashes[entry.stem])
        try:
            d = json.loads(entry.read_text(encoding="utf-8"))
        except Exception:
            continue
        for n in d.get("nodes", []):
            nid = n.get("id")
            if nid and nid not in seen_node_ids:
                seen_node_ids.add(nid)
                merged["nodes"].append(n)
        merged["edges"].extend(d.get("edges", []))
        merged["hyperedges"].extend(d.get("hyperedges", []))

    # Flag files without semantic coverage so the user can decide whether to re-run /graphify
    uncovered = sorted(set(current_hashes.values()) - covered_files)
    # Filter out files graphify wouldn't extract anyway (e.g., the tool scripts)
    uncovered = [f for f in uncovered if not f.startswith(".") and f not in {
        "extract-citations.py", "refresh-graph.py"
    }]
    merged["stats"] = {"live": live, "stale": stale, "pruned": pruned, "uncovered": uncovered}
    return merged


def _is_inside_out(path_str: str) -> bool:
    """True if a path (string) lives inside graphify-out/."""
    p = Path(path_str)
    try:
        p_abs = p if p.is_absolute() else (ROOT / p)
        return OUT in p_abs.resolve().parents or p_abs.resolve() == OUT
    except OSError:
        # Fall back to part-name check
        return "graphify-out" in p.parts


def detect_filtered() -> dict:
    """graphify.detect() but with graphify-out/ stripped out of every file bucket.

    Prevents our own generated artifacts (graph.html, GRAPH_REPORT.md, etc.)
    from being counted as inputs.
    """
    from graphify.detect import detect
    d = detect(ROOT)
    files = d.get("files", {})
    cleaned = {}
    removed = 0
    for cat, paths in files.items():
        kept = [f for f in paths if not _is_inside_out(f)]
        removed += len(paths) - len(kept)
        cleaned[cat] = kept
    d["files"] = cleaned
    if removed:
        d["total_files"] = sum(len(v) for v in cleaned.values())
    return d


def load_ast() -> dict:
    try:
        from graphify.extract import collect_files, extract
    except ImportError:
        return {"nodes": [], "edges": [], "hyperedges": []}

    detected = detect_filtered()
    code_paths = []
    for f in detected.get("files", {}).get("code", []):
        p = Path(f)
        code_paths.extend(collect_files(p) if p.is_dir() else [p])
    if not code_paths:
        return {"nodes": [], "edges": [], "hyperedges": []}
    return extract(code_paths)


def main() -> int:
    try:
        import graphify  # noqa: F401
    except ImportError:
        print("[refresh-graph] graphify not installed — skipping", file=sys.stderr)
        return 0

    from graphify.analyze import god_nodes, suggest_questions, surprising_connections
    from graphify.build import build
    from graphify.cluster import cluster, score_all
    from graphify.export import to_html, to_json
    from graphify.report import generate

    OUT.mkdir(parents=True, exist_ok=True)

    ast = load_ast()
    semantic = load_semantic_cache()
    citations = load_citations()

    stats = semantic.get("stats", {})
    stale_n = stats.get("stale", 0)
    pruned_n = stats.get("pruned", 0)
    stale_desc = f"stale={stale_n}"
    if pruned_n:
        stale_desc += f" (pruned {pruned_n} from disk)"
    print(
        f"[refresh-graph] sources: "
        f"AST {len(ast['nodes'])}n/{len(ast['edges'])}e, "
        f"semantic-cache {len(semantic['nodes'])}n/{len(semantic['edges'])}e "
        f"(live={stats.get('live',0)}, {stale_desc}), "
        f"citations {len(citations['nodes'])}n/{len(citations['edges'])}e"
    )
    uncovered = stats.get("uncovered", [])
    flag_path = OUT / ".needs-semantic-update"
    if uncovered:
        flag_path.write_text("\n".join(uncovered), encoding="utf-8")
        banner = "=" * 72
        print(banner)
        print(f"[refresh-graph] ACTION NEEDED: {len(uncovered)} file(s) have no semantic coverage.")
        print("  These files are captured structurally (sections, refs, test IDs)")
        print("  but have no LLM-inferred semantic edges yet.")
        for f in uncovered[:10]:
            print(f"    - {f}")
        if len(uncovered) > 10:
            print(f"    ...and {len(uncovered) - 10} more")
        print("")
        print("  To refresh: run `/graphify --update` in your next Claude Code session.")
        print(f"  Flag file written: {flag_path.relative_to(ROOT)}")
        print(banner)
    elif flag_path.exists():
        # All caught up — clear any stale flag
        try:
            flag_path.unlink()
        except OSError:
            pass

    G = build([ast, semantic, citations])

    # Cluster on the non-test-ID subgraph; test-IDs are leaf-heavy and explode
    # the community count. Reattach them to their citing section's community.
    test_ids = {n for n, d in G.nodes(data=True) if str(n).startswith("test_")}
    G_core = G.subgraph(set(G.nodes()) - test_ids).copy()
    communities = cluster(G_core)
    cohesion = score_all(G_core, communities)

    # Reattach each test-ID to the community of the section that cites it.
    node_to_comm = {nid: cid for cid, members in communities.items() for nid in members}
    for tid in test_ids:
        for _, src in G.in_edges(tid) if G.is_directed() else [(None, nbr) for nbr in G.neighbors(tid)]:
            cid = node_to_comm.get(src)
            if cid is not None:
                communities[cid].append(tid)
                node_to_comm[tid] = cid
                break

    # Collapse all zero-degree singletons into one "Unreferenced" community.
    # These are section headings that neither cite anything nor are cited
    # (Table of Contents, Conventions, References, change-log entries).
    isolated_cid = max(communities.keys(), default=-1) + 1
    isolated_members = []
    for cid in list(communities.keys()):
        members = communities[cid]
        if len(members) == 1 and G.degree(members[0]) == 0:
            isolated_members.append(members[0])
            del communities[cid]
    if isolated_members:
        communities[isolated_cid] = isolated_members
        cohesion[isolated_cid] = 0.0
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)

    # Labels are keyed by the community's *anchor node* (highest-degree member)
    # so they survive re-runs even when Louvain renumbers community IDs.
    labels_path = OUT / "community-labels.json"
    anchor_labels: dict[str, str] = {}
    if labels_path.exists():
        try:
            anchor_labels = json.loads(labels_path.read_text(encoding="utf-8"))
        except Exception:
            anchor_labels = {}

    def anchor_of(members: list[str]) -> str:
        # Highest-degree node in the community; ties broken by sorted id
        return max(members, key=lambda n: (G.degree(n), -len(n)))

    labels: dict[int, str] = {}
    for cid, members in communities.items():
        a = anchor_of(members)
        if a in anchor_labels:
            labels[cid] = anchor_labels[a]
        else:
            # Fall back to anchor's own label
            anchor_label = G.nodes[a].get("label", a) if a in G.nodes else a
            labels[cid] = f'"{anchor_label[:60]}"'

    questions = suggest_questions(G, communities, labels)
    detection = detect_filtered()
    tokens = {"input": 0, "output": 0}  # refresh is free

    report = generate(
        G, communities, cohesion, labels, gods, surprises,
        detection, tokens, str(ROOT), suggested_questions=questions,
    )
    (OUT / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    to_json(G, communities, str(OUT / "graph.json"))

    n = G.number_of_nodes()
    e = G.number_of_edges()
    if n <= 5000:
        to_html(G, communities, str(OUT / "graph.html"), community_labels=labels)
        print(f"[refresh-graph] wrote graph.json + graph.html + GRAPH_REPORT.md ({n}n/{e}e, {len(communities)} communities)")
    else:
        print(f"[refresh-graph] {n} nodes exceeds viz limit; skipped graph.html")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
