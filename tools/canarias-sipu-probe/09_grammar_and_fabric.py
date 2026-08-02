#!/usr/bin/env python3
"""C2 - grammar clustering, block-ring share, and THE VALENCIA TEST.

THE VALENCIA TEST (the one that matters most): does anything IN THE DATA
discriminate two physically different fabrics? Valencia's 1,967 ZUR-RE polygons
span closed-block AND detached with NO attribute separating them. Run the same
test on Canarias SIPU EDIF.

RULE-KIND CLASSIFICATION against packages/schemas GeometricRule:
  setback                 -> any SepMin* numeric            -> parcel-only, SOLVED TODAY
  alignment + depth       -> DispObl set AND FonMaxEd(m) num-> parcel-only, SOLVED TODAY
  block-derived-alignment -> aligned/closed but NO depth    -> requiresBlockRing TRUE
  unknown                 -> neither
"""
import glob
import json
import os
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")

SETBACKS = ["SepMinFr", "SepMinPs", "SepMinLt", "SepMnEdf"]
DEPTH = ["FonMaxEd", "FonMaxEdm"]
CORE = ["PMaxOcup", "EdifMax", "AltMaxPl", "AltMaxMP", "AltMaxMV"]


def load():
    rows, seen = [], set()
    for p in sorted(glob.glob(os.path.join(DATA, "measurements*.json"))):
        for r in json.load(open(p, encoding="utf-8")):
            if r["file"] in seen:
                continue
            seen.add(r["file"])
            rows.append(r)
    return rows


def classify(z, raw_dispobl):
    has_set = any(z.get(k) is not None for k in SETBACKS)
    has_depth = any(z.get(k) is not None for k in DEPTH)
    aligned = bool(raw_dispobl) and str(raw_dispobl).upper() not in \
        {"I", "NP", "", "NONE"}
    ocup = z.get("PMaxOcup")
    closed = (ocup is not None and ocup >= 95)
    if has_set:
        return "setback"
    if (aligned or closed) and has_depth:
        return "alignment+explicit-depth"
    if aligned or closed:
        return "block-derived-alignment(NEEDS BLOCK RING)"
    if any(z.get(k) is not None for k in CORE):
        return "quantitative-only(no boundary rule)"
    return "no-rule"


def main():
    M = load()
    parsed = [r for r in M if r.get("zones")]
    print(f"archives with parsed EDIF zone rows: {len(parsed)}")

    # ---- DispObl vocabulary (needed before classifying) ----------------
    print("\n=== DispObl (mandatory-alignment) VOCABULARY ===")
    # zones dict does not keep DispObl (non-numeric); recover from raw mdb
    sys.path.insert(0, HERE)
    from mdb import open_mdb, read_table   # noqa: E402
    dvoc = Counter()
    rawmap = {}
    for r in parsed:
        w = os.path.join(DATA, "work", r["file"].replace(".", "_"), "edif.mdb")
        if not os.path.exists(w):
            continue
        try:
            db = open_mdb(w)
            tn = [t for t in db.catalog if t.upper() == "EDIF"][0]
            _c, rr = read_table(db, tn)
        except Exception:  # noqa: BLE001
            continue
        lst = []
        for row in rr:
            if row is None:
                continue
            low = {k.lower(): v for k, v in row.items()}
            d = low.get("dispobl")
            dvoc[str(d).strip()[:20] if d else "<null>"] += 1
            lst.append(d)
        rawmap[r["file"]] = lst
    for k, v in dvoc.most_common(15):
        print(f"  {v:6d}  {k!r}")

    # ---- rule-kind distribution ---------------------------------------
    print("\n=== C2 RULE KIND per zone row (zone-weighted, NOT area) ===")
    kinds = Counter()
    per_muni_kind = defaultdict(Counter)
    for r in parsed:
        d = rawmap.get(r["file"], [])
        for i, z in enumerate(r["zones"]):
            k = classify(z, d[i] if i < len(d) else None)
            kinds[k] += 1
            per_muni_kind[r.get("muni") or r["file"]][k] += 1
    tot = sum(kinds.values())
    for k, v in kinds.most_common():
        print(f"  {v:6d}  {100*v/max(tot,1):5.1f}%  {k}")
    need = kinds["block-derived-alignment(NEEDS BLOCK RING)"]
    solved = kinds["setback"] + kinds["alignment+explicit-depth"]
    print(f"\n  ⭐ zones solvable by the PARCEL-ONLY engine PRYZM already has: "
          f"{solved}/{tot} ({100*solved/max(tot,1):.1f}%)")
    print(f"     zones REQUIRING a block ring (requiresBlockRing==true): "
          f"{need}/{tot} ({100*need/max(tot,1):.1f}%)")
    print("     [zone-weighted over parsed EDIF rows; NOT area- or "
          "parcel-weighted - this sample cannot support an area statistic]")

    # ---- THE VALENCIA TEST --------------------------------------------
    print("\n=== THE VALENCIA TEST: does the data DISCRIMINATE FABRICS? ===")
    print("  Q: within ONE municipality, do zone rows that share a code FAMILY")
    print("     carry DIFFERENT built-form parameters? If yes, SIPU encodes")
    print("     GRAMMAR, not just classification.")
    disc = 0
    tested = 0
    for r in parsed:
        z = r["zones"]
        if len(z) < 3:
            continue
        tested += 1
        fam = defaultdict(list)
        for zz in z:
            e = str(zz.get("etiqueta") or "")
            base = "".join(ch for ch in e if ch.isalpha())[:3] or e[:3]
            fam[base].append(zz)
        split = False
        for b, members in fam.items():
            if len(members) < 2:
                continue
            for key in ("AltMaxPl", "EdifMax", "PMaxOcup", "FonMaxEdm"):
                vals = {m.get(key) for m in members if m.get(key) is not None}
                if len(vals) > 1:
                    split = True
        if split:
            disc += 1
    print(f"  municipalities/archives where a shared code FAMILY carries "
          f"DIFFERING numeric built-form: {disc}/{tested}")

    # concrete exhibit
    print("\n  -- CONCRETE EXHIBIT (closed-block vs low-rise IN ONE "
          "MUNICIPALITY) --")
    for r in parsed:
        z = r["zones"]
        closed = [x for x in z if (x.get("PMaxOcup") or 0) >= 95
                  and x.get("AltMaxPl")]
        openf = [x for x in z if x.get("PMaxOcup") is not None
                 and x.get("PMaxOcup") <= 60 and x.get("AltMaxPl")]
        if closed and openf:
            print(f"   {r.get('muni')} ({r.get('year')}):")
            for x in closed[:2]:
                print(f"     CLOSED  {str(x.get('etiqueta'))[:10]:<10} "
                      f"ocup={x.get('PMaxOcup')} FAR={x.get('EdifMax')} "
                      f"floors={x.get('AltMaxPl')} depth_m={x.get('FonMaxEdm')} "
                      f"h_m={x.get('AltMaxMP')}")
            for x in openf[:2]:
                print(f"     OPEN    {str(x.get('etiqueta'))[:10]:<10} "
                      f"ocup={x.get('PMaxOcup')} FAR={x.get('EdifMax')} "
                      f"floors={x.get('AltMaxPl')} depth_m={x.get('FonMaxEdm')} "
                      f"h_m={x.get('AltMaxMP')}")

    # ---- KNOWN-ANSWER CONTROL -----------------------------------------
    print("\n=== KNOWN-ANSWER CONTROL ===")
    print("  Brief states GeoBDP shows Brena Alta (38008) carrying")
    print("  'SIPU 2.6.A - RSE (Edificacion residencial semiextensiva)'.")
    hit = False
    for r in parsed:
        if (r.get("muni") or "").startswith("Brena"):
            for zz in r["zones"]:
                e = str(zz.get("etiqueta") or "")
                if e.upper().startswith("RSE"):
                    hit = True
                    print(f"   CONTROL PASS  {r.get('muni')} {r['file'][:34]} "
                          f"ETIQUETA={e} nombre={str(zz.get('nombre'))[:52]}")
    if not hit:
        munis = sorted({r.get("muni") for r in parsed
                        if (r.get("muni") or "").startswith("Brena")})
        print(f"   CONTROL NOT YET EVALUABLE - Brena archives parsed: {munis}")
    # negative control: a code that must not exist
    bogus = sum(1 for r in parsed for zz in r["zones"]
                if str(zz.get("etiqueta") or "").upper() == "ZZZ-NOTACODE")
    print(f"   NEGATIVE CONTROL (impossible code 'ZZZ-NOTACODE'): "
          f"{bogus} hits (expected 0)")


if __name__ == "__main__":
    main()
