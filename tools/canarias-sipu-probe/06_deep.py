#!/usr/bin/env python3
"""Per-archive VALID rates + the ACTUAL non-numeric vocabulary.

Pooled rates hide everything: one 1,247-row archive was 51% of the pool.
Also dumps every distinct non-numeric cell value so that no meaningful value is
silently discarded as a "sentinel" (a regex that does not match is not proof).
"""
import glob
import json
import os
import re
import sys
import zipfile
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
sys.path.insert(0, HERE)
from mdb import open_mdb, read_table  # noqa: E402

ORDER = ["SupMin", "LongMin", "FonMin", "CircInsc", "DispOblm", "SepMinFr",
         "SepMinPs", "SepMinLt", "SepMnEdf", "FonMaxEd", "FonMaxEdm",
         "PMaxOcup", "EdifMax", "AltMaxPl", "AltMaxMV", "AltMaxMP"]
CORE = ["PMaxOcup", "EdifMax", "AltMaxPl", "AltMaxMP", "SepMinFr", "FonMaxEdm"]


def is_num(s):
    if s is None:
        return None
    t = str(s).strip().replace(" ", "")
    t = re.sub(r"(?<=\d)\.(?=\d{3}\b)", "", t).replace(",", ".")
    if re.fullmatch(r"[-+]?\d*\.?\d+", t):
        try:
            return float(t)
        except ValueError:
            return None
    return None


def main():
    M = []
    for p in sorted(glob.glob(os.path.join(DATA, "measurements*.json"))):
        M += json.load(open(p, encoding="utf-8"))
    seen, rows = set(), []
    for r in M:
        if r["file"] in seen:
            continue
        seen.add(r["file"])
        rows.append(r)
    parsed = [r for r in rows if r.get("edif_mdb_rows")]

    # ---- the actual non-numeric vocabulary ---------------------------
    vocab = Counter()
    percol = defaultdict(Counter)
    for r in parsed:
        for z in r.get("zones", []):
            pass
    # zones already numeric-coerced; re-read raw from cached mdb copies
    for r in parsed:
        work = os.path.join(DATA, "work", r["file"].replace(".", "_"),
                            "edif.mdb")
        if not os.path.exists(work):
            continue
        try:
            db = open_mdb(work)
            tn = [t for t in db.catalog if t.upper() == "EDIF"][0]
            cols, rr = read_table(db, tn)
        except Exception:  # noqa: BLE001
            continue
        for row in rr:
            if row is None:
                continue
            low = {k.lower(): v for k, v in row.items()}
            for f in ORDER:
                v = low.get(f.lower())
                if v is None or str(v).strip() == "":
                    continue
                if is_num(v) is None:
                    vocab[str(v).strip()[:40]] += 1
                    percol[f][str(v).strip()[:40]] += 1

    print("=== NON-NUMERIC CELL VOCABULARY (top 30 of "
          f"{len(vocab)} distinct) ===")
    for v, c in vocab.most_common(30):
        print(f"  {c:6d}  {v!r}")
    tail = sum(c for v, c in vocab.most_common()[30:])
    print(f"  ... {len(vocab)-30 if len(vocab)>30 else 0} more values, "
          f"{tail} cells")

    # ---- per-archive VALID rates on the CORE envelope params ----------
    print("\n=== PER-ARCHIVE VALID RATE, CORE ENVELOPE PARAMS ===")
    print(f"{'municipality':<26}{'instr':<10}{'yr':<6}{'zones':>6}  " +
          "".join(f"{c[:9]:>10}" for c in CORE) + "   ANY")
    tally = []
    for r in sorted(parsed, key=lambda x: (x.get("muni") or "")):
        z = r.get("zones") or []
        if not z:
            continue
        line = f"{(r.get('muni') or '?')[:25]:<26}" \
               f"{(r.get('instrument') or '')[:9]:<10}" \
               f"{str(r.get('year') or ''):<6}{len(z):>6}  "
        anyrow = 0
        for zz in z:
            if any(zz.get(c) is not None for c in CORE):
                anyrow += 1
        for c in CORE:
            v = sum(1 for zz in z if zz.get(c) is not None)
            line += f"{100*v/len(z):9.0f}%"
        line += f"{100*anyrow/len(z):8.0f}%"
        print(line)
        tally.append((r, len(z), anyrow))

    tot = sum(t[1] for t in tally)
    anyz = sum(t[2] for t in tally)
    print(f"\n  POOLED zones={tot}  zones with >=1 core numeric param="
          f"{anyz} ({100*anyz/max(tot,1):.1f}%)  [zone-weighted]")
    good = [t for t in tally if t[1] and t[2] / t[1] >= 0.5]
    print(f"  ARCHIVES where >=50% of zones carry >=1 core param: "
          f"{len(good)}/{len(tally)}")

    # ---- ETIQUETA vocabulary reality check ---------------------------
    print("\n=== ETIQUETA in EDIF.mdb (the RULE table, one row per zone) ===")
    codes = defaultdict(set)
    for r in parsed:
        m = r.get("muni") or r["file"]
        for zz in (r.get("zones") or []):
            e = zz.get("etiqueta")
            if e:
                codes[str(e).strip()].add(m)
    print(f"  distinct rule-table ETIQUETA codes: {len(codes)}")
    multi = {k: v for k, v in codes.items() if len(v) > 1}
    print(f"  shared across >1 municipality: {len(multi)} "
          f"({100*len(multi)/max(len(codes),1):.1f}%)")
    for k, v in sorted(multi.items(), key=lambda x: -len(x[1]))[:25]:
        print(f"    {k[:22]:<22} in {len(v)} munis: {sorted(v)[:6]}")

    # ---- polygon-layer ETIQUETA (EDIF.dbf) ---------------------------
    print("\n=== ETIQUETA in EDIF.dbf (the POLYGON layer) ===")
    pcodes = defaultdict(set)
    pw = Counter()
    for r in rows:
        m = r.get("muni") or r["file"]
        for c, n in (r.get("etiqueta_counts") or {}).items():
            pcodes[str(c).strip()].add(m)
            pw[str(c).strip()] += n
    print(f"  distinct: {len(pcodes)}  polygons: {sum(pw.values())}")
    lng = [c for c in pcodes if len(c) > 12]
    print(f"  codes longer than 12 chars (not a code, a sentence): {len(lng)}"
          f"  e.g. {lng[:3]}")
    shortc = {c: v for c, v in pcodes.items() if len(c) <= 12}
    ms = {c for c in shortc if len(shortc[c]) > 1}
    print(f"  short codes: {len(shortc)}  shared across >1 muni: {len(ms)} "
          f"({100*len(ms)/max(len(shortc),1):.1f}%)")
    sp = sum(pw[c] for c in ms)
    print(f"  polygons with a shared short code: {sp}/{sum(pw.values())} "
          f"({100*sp/max(sum(pw.values()),1):.1f}%) [polygon-weighted]")
    print("  top 20 polygon codes:")
    for c, v in pw.most_common(20):
        print(f"    {c[:34]:<34} munis={len(pcodes[c]):3d} poly={v}")


if __name__ == "__main__":
    main()
