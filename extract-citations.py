#!/usr/bin/env python3
"""
extract-citations.py — deterministic citation-graph extractor for the SOA-Harness spec.

Produces JSON in graphify extraction schema, plus an integrity audit
(dangling cross-section refs, test-IDs cited but not defined).
"""
import argparse
import json
import re
import sys
from collections import defaultdict
from pathlib import Path

DOC_PREFIX = {
    'SOA-Harness Core Specification v1.0 (Final).md': ('core', 'Core'),
    'SOA-Harness UI Integration Profile v1.0 (Final).md': ('ui', 'UI'),
}

HEADING_RE = re.compile(r'^(#{2,6})\s+(\d+(?:\.\d+)*)\.?\s+(.+?)\s*$', re.M)
XREF_RE = re.compile(r'(Core|UI)\s*(?:Spec(?:ification)?|Profile)?\s*§\s*(\d+(?:\.\d+)*)', re.I)
# Bare intra-doc refs: "§9.6", "§16.2" without "Core" or "UI" prefix.
# Negative lookbehind excludes already-matched cross-doc refs.
INTRADOC_RE = re.compile(r'(?<![Ca-z])(?<!UI\s)(?<!Core\s)§\s*(\d+(?:\.\d+)*)')
TESTID_RE = re.compile(r'\b(UV|SV)-([A-Z0-9]+)-(\d+)(?:\.\.(\d+))?([a-z])?\b')


def make_node(nid, label, src, location=None, file_type='document'):
    return {
        'id': nid,
        'label': label,
        'file_type': file_type,
        'source_file': src,
        'source_location': location,
        'source_url': None,
        'captured_at': None,
        'author': None,
        'contributor': None,
    }


def make_edge(src, tgt, relation, src_file=None, location=None, score=1.0):
    return {
        'source': src,
        'target': tgt,
        'relation': relation,
        'confidence': 'EXTRACTED',
        'confidence_score': score,
        'source_file': src_file,
        'source_location': location,
        'weight': 1.0,
    }


def parse_headings(text):
    out = []
    for m in HEADING_RE.finditer(text):
        num = m.group(2)
        title = m.group(3).strip()
        lineno = text[:m.start()].count('\n') + 1
        out.append((m.start(), num, title, lineno))
    return out


def containing_section(pos, headings):
    current = None
    for off, num, _, _ in headings:
        if off <= pos:
            current = num
        else:
            break
    return current


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('root', nargs='?', default='.')
    ap.add_argument('--audit', action='store_true', help='print integrity audit to stderr')
    ap.add_argument('-o', '--output', default='graphify-out/citations.json')
    args = ap.parse_args()

    root = Path(args.root).resolve()
    nodes = {}
    edges = []
    declared_sections = set()  # section node ids that came from a real heading
    test_id_defined_in = defaultdict(list)  # tid -> [files where it appears]
    dangling_detail = defaultdict(list)  # dangling section id -> [(citer_file, lineno)]

    # Pass 1: real section nodes from the two spec docs
    for fname, (prefix, label_prefix) in DOC_PREFIX.items():
        path = root / fname
        if not path.exists():
            continue
        text = path.read_text(encoding='utf-8')
        for off, num, title, lineno in parse_headings(text):
            nid = f'{prefix}_section_{num.replace(".", "_")}'
            if nid in nodes:
                continue
            nodes[nid] = make_node(
                nid,
                f'{label_prefix} §{num}: {title}',
                fname,
                f'line {lineno}',
            )
            declared_sections.add(nid)

    # Pass 2: every .md file — cross-refs + test IDs
    md_files = [p for p in root.rglob('*.md') if 'graphify-out' not in p.parts]
    for md in md_files:
        rel = str(md.relative_to(root)).replace('\\', '/')
        text = md.read_text(encoding='utf-8')
        headings = parse_headings(text)

        # Figure out which doc prefix this file is
        file_prefix = None
        for fname, (prefix, _) in DOC_PREFIX.items():
            if md.name == fname:
                file_prefix = prefix

        # File-level node for non-spec files, used as edge source
        file_nid = f'file_{rel.replace("/", "_").replace(".", "_").replace(" ", "_")}'
        if not file_prefix and file_nid not in nodes:
            nodes[file_nid] = make_node(file_nid, rel, rel)

        # Cross-refs: Core §X / UI §X
        for m in XREF_RE.finditer(text):
            which = m.group(1).lower()
            num = m.group(2)
            target_prefix = 'core' if which == 'core' else 'ui'
            tgt = f'{target_prefix}_section_{num.replace(".", "_")}'

            # source
            if file_prefix:
                cs = containing_section(m.start(), headings)
                if cs:
                    src = f'{file_prefix}_section_{cs.replace(".", "_")}'
                else:
                    src = file_nid
                    if src not in nodes:
                        nodes[src] = make_node(src, rel, rel)
            else:
                src = file_nid

            lineno = text[:m.start()].count('\n') + 1

            # Mark dangling if target wasn't declared
            if tgt not in nodes:
                nodes[tgt] = make_node(
                    tgt, f'{m.group(1)} §{num} (DANGLING)', rel, f'line {lineno}'
                )
                dangling_detail[tgt].append((rel, lineno))
            elif tgt not in declared_sections:
                dangling_detail[tgt].append((rel, lineno))

            edges.append(make_edge(src, tgt, 'cites', rel, f'line {lineno}'))

        # Intra-doc bare §N.M refs (only inside the two spec docs).
        # Fallback rule: if §X.Y doesn't exist in the current doc, try the other doc
        # before declaring dangling — this auto-resolves `§19.4.1` in UI to Core's §19.4.1.
        # If neither doc has it, skip silently (treat as external/RFC reference).
        if file_prefix:
            cross_spans = [(m.start(), m.end()) for m in XREF_RE.finditer(text)]
            def is_in_cross(pos):
                return any(s <= pos < e for s, e in cross_spans)

            other_prefix = "ui" if file_prefix == "core" else "core"
            for m in INTRADOC_RE.finditer(text):
                if is_in_cross(m.start()):
                    continue
                num = m.group(1)
                self_tgt = f'{file_prefix}_section_{num.replace(".", "_")}'
                other_tgt = f'{other_prefix}_section_{num.replace(".", "_")}'

                # Resolve: prefer intra-doc, fall back to cross-doc, else skip
                if self_tgt in nodes:
                    tgt = self_tgt
                elif other_tgt in nodes:
                    tgt = other_tgt
                else:
                    # External reference (RFC section, WebAuthn spec, etc.) — skip
                    continue

                cs = containing_section(m.start(), headings)
                if cs:
                    src = f'{file_prefix}_section_{cs.replace(".", "_")}'
                else:
                    src = file_nid
                    if src not in nodes:
                        nodes[src] = make_node(src, rel, rel)
                if src == tgt:
                    continue  # self-loop
                lineno = text[:m.start()].count('\n') + 1
                edges.append(make_edge(src, tgt, 'cites', rel, f'line {lineno}'))

        # Test IDs with range unrolling
        for m in TESTID_RE.finditer(text):
            prefix_tok, cat, num, range_end, letter = m.groups()
            base = int(num)
            end = int(range_end) if range_end else base
            for i in range(base, end + 1):
                suffix = (letter or '') if (i == base and not range_end) else ''
                tid = f'{prefix_tok}-{cat}-{i}{suffix}'
                tid_nid = f'test_{tid.lower().replace("-", "_")}'
                if tid_nid not in nodes:
                    nodes[tid_nid] = make_node(tid_nid, tid, rel)
                test_id_defined_in[tid].append(rel)

                if file_prefix:
                    cs = containing_section(m.start(), headings)
                    if cs:
                        src = f'{file_prefix}_section_{cs.replace(".", "_")}'
                    else:
                        src = file_nid
                        if src not in nodes:
                            nodes[src] = make_node(src, rel, rel)
                else:
                    src = file_nid
                lineno = text[:m.start()].count('\n') + 1
                edges.append(make_edge(src, tid_nid, 'validated_by', rel, f'line {lineno}'))

    out = {
        'nodes': list(nodes.values()),
        'edges': edges,
        'hyperedges': [],
        'input_tokens': 0,
        'output_tokens': 0,
    }
    Path(args.output).write_text(json.dumps(out, indent=2), encoding='utf-8')
    print(f'Wrote {len(out["nodes"])} nodes, {len(out["edges"])} edges to {args.output}')

    if args.audit:
        print('', file=sys.stderr)
        print('=== Integrity audit ===', file=sys.stderr)
        print(f'Dangling cross-section refs (target not declared as heading): {len(dangling_detail)}',
              file=sys.stderr)
        for tgt in sorted(dangling_detail):
            citers = dangling_detail[tgt]
            print(f'  {tgt}', file=sys.stderr)
            for f, ln in citers[:5]:
                print(f'    cited from {f}:{ln}', file=sys.stderr)

        # test IDs only cited from one place and not from either normative doc
        from_spec = {
            tid for tid, files in test_id_defined_in.items()
            if any(f in DOC_PREFIX for f in files)
        }
        only_readme_or_vectors = set(test_id_defined_in) - from_spec
        print(f'\nTest IDs cited outside the normative specs only: {len(only_readme_or_vectors)}',
              file=sys.stderr)
        for tid in sorted(only_readme_or_vectors)[:20]:
            print(f'  {tid}  (cited from: {set(test_id_defined_in[tid])})', file=sys.stderr)


if __name__ == '__main__':
    main()
