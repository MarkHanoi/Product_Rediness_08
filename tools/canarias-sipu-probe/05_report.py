#!/usr/bin/env python3
"""C1/C2 report: EDIF presence, SCHEMA UNION + frequency, VALID rates,
contradiction checks, grammar entropy. Reads .data/measurements*.json
"""
import glob
import json
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
sys.path.insert(0, HERE)
from importlib import import_module  # noqa: E402
PARAMS = import_module("04_measure_edif").PARAMS if False else None

ORDER = ["SupMin", "LongMin", "FonMin", "CircInsc", "DispObl", "DispOblm",
         "SepMinFr", "SepMinPs", "SepMinLt", "SepMnEdf", "FonMaxEd",
         "FonMaxEdm", "PMaxOcup", "EdifMax", "AltMaxPl", "AltMaxMV",
         "AltMaxMP"]


def load(pattern="measurements*.json"):
    rows = []
    for p in sorted(glob.glob(os.path.join(DATA, pattern))):
        rows += json.load(open(p, encoding="utf-8"))
    # de-dup by file
    seen, out = set(), []
    for r in rows:
        if r["file"] in seen:
            continue
        seen.add(r["file"])
        out.append(r)
    return out


def main():
    pat = sys.argv[1] if len(sys.argv) > 1 else "measurements*.json"
    M = load(pat)
    print(f"ARCHIVES OPENED: {len(M)}")

    ok = [r for r in M if r.get("archive") == "zip"]
    bad = [r for r in M if r.get("archive") != "zip"]
    print(f"  openable={len(ok)}  not-openable={len(bad)} "
          f"{[b['file'] for b in bad]}")

    # ---- 1. THE SINGLE NUMBER -----------------------------------------
    with_mdb = [r for r in ok if r.get("has_edif_mdb")]
    with_shp = [r for r in ok if r.get("has_edif_shp")]
    print(f"\n=== C1 HEADLINE ===")
    print(f"  EDIF.mdb  present : {len(with_mdb)}/{len(ok)}")
    print(f"  EDIF.shp  present : {len(with_shp)}/{len(ok)}")
    parsed = [r for r in with_mdb if r.get("edif_mdb_rows") is not None]
    print(f"  EDIF.mdb  parsed  : {len(parsed)}/{len(with_mdb)}")
    nonempty = [r for r in parsed if r["edif_mdb_rows"] > 0]
    print(f"  EDIF.mdb  rows>0  : {len(nonempty)}/{len(parsed)}")

    print("\n  -- WHY THE MISSING ONES ARE MISSING (a zero must be explained) --")
    for r in ok:
        if not r.get("has_edif_mdb"):
            print(f"    {r['file'][:46]:<46} instr={r.get('instrument'):<16} "
                  f"layers={r.get('layers')}")

    # ---- 2. TABLE-COUNT / THEMATIC FILE DISTRIBUTION -------------------
    print("\n=== C1.2 THEMATIC .mdb FILES PER ARCHIVE ===")
    mdbdist = Counter()
    for r in ok:
        for m in r.get("mdbs", []):
            mdbdist[m] += 1
    for k, v in mdbdist.most_common():
        print(f"  {v:4d}/{len(ok)}  {k}")
    print("  EDIF table count per EDIF.mdb:",
          dict(Counter(len([t for t in (r.get('mdb_tables') or [])
                            if not t.startswith('MSys')])
                       for r in parsed)))

    # ---- 3. SCHEMA UNION + FREQUENCY ----------------------------------
    print("\n=== C1.3 EDIF.mdb SCHEMA UNION (frequency across parsed archives) ===")
    freq = Counter()
    for r in parsed:
        for c in r.get("edif_mdb_cols", []):
            freq[c.lower()] += 1
    n = len(parsed)
    for c, v in freq.most_common():
        star = " <-- ENVELOPE PARAM" if c in {p.lower() for p in ORDER} else ""
        print(f"  {v:3d}/{n}  {c}{star}")
    shapes = Counter(tuple(sorted(c.lower() for c in r.get("edif_mdb_cols", [])))
                     for r in parsed)
    print(f"\n  DISTINCT EDIF SCHEMAS: {len(shapes)} across {n} archives")
    for i, (s, v) in enumerate(shapes.most_common()):
        print(f"   schema#{i+1} n={v} fields={len(s)}")
        if i > 0:
            base = shapes.most_common()[0][0]
            print(f"     diff vs #1: only-here={sorted(set(s)-set(base))} "
                  f"missing={sorted(set(base)-set(s))}")

    # ---- 4. VALID RATES (never non-null) ------------------------------
    print("\n=== C1.4 VALID RATES PER FIELD (all zone rows pooled) ===")
    print("  field        rows  nonnull%  numeric%   VALID%   sentinel%  "
          "text+num  violations")
    agg = defaultdict(lambda: Counter())
    viol = defaultdict(list)
    for r in nonempty:
        for k, st in (r.get("field_stats") or {}).items():
            if k.startswith("_"):
                viol["_cross"] += st.get("violations", [])
                continue
            for f in ("present", "nonnull", "numeric", "valid", "sentinel",
                      "text_with_number"):
                agg[k][f] += st.get(f, 0)
            viol[k] += [f"{r.get('muni')}: {v}" for v in st.get("violations", [])]
    for k in ORDER:
        st = agg.get(k)
        if not st:
            continue
        p = st["present"] or 1
        print(f"  {k:<11} {st['present']:5d}  {100*st['nonnull']/p:7.1f}% "
              f"{100*st['numeric']/p:8.1f}% {100*st['valid']/p:8.1f}% "
              f"{100*st['sentinel']/p:9.1f}% {st['text_with_number']:8d}  "
              f"{len(viol[k])}")

    print("\n  -- CONTRADICTIONS (sample, max 25) --")
    allv = [v for k in viol for v in viol[k]]
    for v in allv[:25]:
        print("   ", v)
    print(f"   total contradiction hits: {len(allv)}")

    # ---- 5. SENTINEL VOCABULARY ---------------------------------------
    print("\n=== C1.5 WHAT THE NON-NUMERIC CELLS ACTUALLY SAY ===")
    sent = Counter()
    for r in nonempty:
        pass
    # recomputed from zones is lossy; report from raw stats instead
    tot_present = sum(agg[k]["present"] for k in agg)
    tot_num = sum(agg[k]["numeric"] for k in agg)
    tot_sent = sum(agg[k]["sentinel"] for k in agg)
    tot_null = tot_present - sum(agg[k]["nonnull"] for k in agg)
    print(f"  cells={tot_present}  numeric={tot_num} "
          f"({100*tot_num/max(tot_present,1):.1f}%)  sentinel={tot_sent} "
          f"({100*tot_sent/max(tot_present,1):.1f}%)  null={tot_null} "
          f"({100*tot_null/max(tot_present,1):.1f}%)")

    # ---- 6. GRAMMAR ENTROPY -------------------------------------------
    print("\n=== C2 ZONING VOCABULARY ENTROPY (ETIQUETA, polygon-weighted) ===")
    per_muni = defaultdict(set)
    codefreq = Counter()
    polyw = Counter()
    for r in ok:
        m = r.get("muni") or r["file"]
        for c, n_ in (r.get("etiqueta_counts") or {}).items():
            per_muni[m].add(c)
            codefreq[c] += 1
            polyw[c] += n_
    allcodes = set(codefreq)
    muni_count = Counter()
    for m, cs in per_muni.items():
        for c in cs:
            muni_count[c] += 1
    shared = [c for c in allcodes if muni_count[c] > 1]
    print(f"  municipalities/archives contributing: {len(per_muni)}")
    print(f"  distinct ETIQUETA codes: {len(allcodes)}")
    print(f"  codes appearing in >1 municipality: {len(shared)} "
          f"({100*len(shared)/max(len(allcodes),1):.1f}%)")
    print(f"  total polygons: {sum(polyw.values())}")
    sharedpoly = sum(polyw[c] for c in shared)
    print(f"  polygons carrying a SHARED code: {sharedpoly} "
          f"({100*sharedpoly/max(sum(polyw.values()),1):.1f}%)  "
          f"[polygon-weighted, NOT area-weighted]")
    print("  top 25 codes (muni_count, polygons):")
    for c, v in polyw.most_common(25):
        print(f"    {c[:36]:<36} muni={muni_count[c]:3d} poly={v}")


if __name__ == "__main__":
    main()
