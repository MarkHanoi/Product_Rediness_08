#!/usr/bin/env python3
"""THE CANARIAS ENVELOPE MAXIMUM - three stages, never blended.

  STAGE A  columns only                    -> reproduces the measured baseline
  STAGE B  + the memo channel   (LEVER 1)
  STAGE C  + the private-developable denominator (LEVER 2)  <- THE MAXIMUM

Drawability tiers are the BASELINE definitions, unchanged, so stage A is a
REPRODUCTION and the deltas are attributable:

  complete rule    setbacks AND occupation AND height AND FAR
  partial-drawable (setbacks OR occupation OR depth) AND height   (LEVER 3 -
                   a footprint rule plus a height DRAWS; FAR alone does NOT,
                   and REQUIRING completeness would have discarded the lot)
  not drawable     everything else

Both weightings are reported every time: ZONE-weighted (one vote per rule row)
and LAND-weighted (rule rows carry the area of the polygons that cite them).
LAND-WEIGHTING IS NOT DECORATIVE - in Balears the top 1% of zone records
governed 32.0% of buildable land.

Writes .data/maximum.json
"""
import glob
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import DATA, PARAMS, read_edif, valid, num  # noqa: E402
from geo import read_dbf, read_shp_polygon_areas, crs_is_metric  # noqa: E402
import memo as M  # noqa: E402
import denom as D  # noqa: E402

OBS = {"SupMin": "ObsSMP", "LongMin": "ObsLM", "FonMin": "ObsFM",
       "CircInsc": "ObsCirc", "SepMinFr": "ObsSMFr", "SepMinPs": "ObsSMPs",
       "SepMinLt": "ObsSMLt", "SepMnEdf": "ObsSME", "FonMaxEd": "ObsFonMx",
       "FonMaxEdm": "ObsFonMxm", "PMaxOcup": "ObsPMO", "EdifMax": "ObsEdfMx",
       "AltMaxPl": "ObsAMPl", "AltMaxMV": "ObsAMV", "AltMaxMP": "ObsAMP",
       "DispOblm": "ObsDispOm"}
SET = ("SepMinFr", "SepMinPs", "SepMinLt")
HGT = ("AltMaxMP", "AltMaxMV", "AltMaxMt", "AltMaxCornis", "AltMaxCoron", "AltMaxPl")
DEP = ("FonMaxEd", "FonMaxEdm")


def tier(has_set, has_oc, has_h, has_far, has_dep):
    if has_set and has_oc and has_h and has_far:
        return "complete rule"
    if (has_set or has_oc or has_dep) and has_h:
        return "partial-drawable"
    return "not drawable"


# ── A1 · GRAMMAR DETECTION, NOT FIELD EXTRACTION ──────────────────────────
# Canarias is the only region whose PUBLISHED SCHEMA names BOTH grammars PRYZM
# already implements. Detect the grammar from the data and map it to the engine
# that EXISTS. NO NEW GEOMETRY ENGINE.
#
#   SepMinFr/Ps/Lt          -> SETBACK           GeometricRule kind 'setback'
#                              requiresBlockRing = false, the
#                              esBarcelona20aAillada path UNTOUCHED
#   FonMaxEd(m) + DispObl   -> ALIGNMENT_DEPTH   GeometricRule kind 'alignment'
#                              the Art. 242.2 machinery
#   PMaxOcup                -> OCCUPATION        footprint by ratio
#
# DispObl vocabulary MEASURED from the tables, never assumed (the Balears `AT`
# lesson - an assumed code dictionary reported 0/80 where the truth was 49/80):
#   'AV'      alineacion a vial      -> the facade sits ON the street line
#   'GRF'     grafico                -> the alignment is ON A DRAWING PRYZM
#                                       does not hold  => REFUSE, do not guess
#   'AV+GRF'  both
ALIGN_TOKENS = {"AV", "AV+GRF", "F"}
GRAPHIC_TOKENS = {"GRF", "AV+GRF"}


def grammar(colv, dispobl_raw):
    """-> (grammar, note). Ordered most-specific first."""
    d = str(dispobl_raw or "").strip().upper()
    aligned = d in ALIGN_TOKENS or d in GRAPHIC_TOKENS
    graphic = d in GRAPHIC_TOKENS
    has_dep = any(k in colv for k in DEP)
    has_set = any(k in colv for k in SET)
    if aligned and has_dep:
        return "ALIGNMENT_DEPTH", ("depth published as a number; alignment "
                                   f"token {d!r}")
    if aligned and graphic and not has_dep:
        return "REFUSE_GRAPHIC_ONLY", (
            "DispObl names a GRAPHED alignment and no depth is published as a "
            "number - the rule is on a plan sheet PRYZM does not hold "
            "(the Valencia Plano C situation). REFUSE, never guess.")
    if has_set:
        return "SETBACK", "per-edge inset from published setbacks"
    if "PMaxOcup" in colv:
        return "OCCUPATION", "footprint by coverage ratio"
    if has_dep:
        return "DEPTH_NO_ALIGNMENT", ("a buildable depth with no alignment "
                                      "token - the datum edge is UNKNOWN")
    return "NO_GRAMMAR", "no boundary rule of any kind"


def pct(a, b):
    return 100.0 * a / b if b else 0.0


def main():
    dirs = sorted(glob.glob(os.path.join(DATA, "work", "*")))
    fetched = {r["tag"]: r for r in json.load(
        open(os.path.join(DATA, "fetched.json"), encoding="utf-8"))} \
        if os.path.exists(os.path.join(DATA, "fetched.json")) else {}

    # A0 step 2 - the ROUTING restriction. A municipality with more than one
    # base instrument and no vigencia field cannot be routed to a governing
    # plan at all, so its rows are not addressable no matter how complete they
    # are. Measured in 01_corpus.py, not assumed.
    import re as _re
    tiers = json.load(open(os.path.join(DATA, "tiers.json"), encoding="utf-8"))

    def _slug(s):
        return _re.sub(r"[^A-Za-z0-9]+", "_", s or "x").strip("_")[:48]
    ROUTABLE = {_slug(m) for m in tiers["tierA"]}

    # counters ------------------------------------------------------------
    # A=columns only  B=+memo  C=+private denominator  D=+routable municipality
    zone = {s: Counter() for s in "ABCD"}
    land = {s: Counter() for s in "ABCD"}
    gram = Counter()
    gram_note = {}
    datum = Counter()
    cls_zone = Counter()
    cls_land = Counter()
    cls_param = Counter()          # parameters carried BY an excluded class
    cls_rows = Counter()
    fieldstat = defaultdict(Counter)
    memo_gain = Counter()
    obs_rows = {s: 0 for s in "ABCD"}
    unreadable_cells = 0
    param_cells = 0
    cross_fire = Counter()
    joinstat = Counter()
    per_muni = {}
    archives_ok = 0
    archives_noedif = 0
    nonmetric = []
    top_share = []

    for d in dirs:
        tag = os.path.basename(d)
        mdb = os.path.join(d, "edif.mdb")
        if not os.path.exists(mdb):
            archives_noedif += 1
            continue
        try:
            cols, rr = read_edif(mdb)
        except Exception:  # noqa: BLE001
            archives_noedif += 1
            continue
        if not cols:
            archives_noedif += 1
            continue
        archives_ok += 1
        colmap = {c.lower(): c for c in cols}

        # ---- polygon areas by ETIQUETA ---------------------------------
        area_by_eti = Counter()
        shp = os.path.join(d, "edif.shp")
        dbf = os.path.join(d, "edif.dbf")
        prj = os.path.join(d, "edif.prj")
        metric = None
        if os.path.exists(shp) and os.path.exists(dbf):
            metric, crsname = crs_is_metric(prj) if os.path.exists(prj) \
                else (None, None)
            areas, diag = read_shp_polygon_areas(shp)
            _f, prow = read_dbf(dbf)
            if metric is False:
                nonmetric.append((tag, crsname))
            elif len(areas) == len(prow):
                for a, pr in zip(areas, prow):
                    e = str(pr.get("ETIQUETA") or pr.get("Etiqueta") or "").strip()
                    area_by_eti[e] += a
                joinstat["dbf/shp aligned"] += 1
            else:
                joinstat["dbf/shp MISALIGNED - area dropped"] += 1
        else:
            joinstat["no polygon layer"] += 1

        rows_by_eti = Counter()
        parsed = []
        for row in rr:
            if row is None:
                continue
            low = {k.lower(): v for k, v in row.items()}
            rows_by_eti[str(low.get("etiqueta") or "").strip()] += 1
            parsed.append(low)

        mrow = Counter()
        for low in parsed:
            eti = str(low.get("etiqueta") or "").strip()
            nom = str(low.get("nombre") or "").strip()
            # land weight: the polygon area citing this code, shared evenly
            # among the rule rows that carry the code (never invented: rows
            # whose code matches no polygon get ZERO land, counted separately)
            w = area_by_eti.get(eti, 0.0) / max(rows_by_eti[eti], 1)
            if eti and eti in area_by_eti:
                joinstat["rule row joined to polygons"] += 1
            else:
                joinstat["rule row with NO matching polygon (land=0)"] += 1

            lc, _hit = D.classify(nom, eti)
            cls_zone[lc] += 1
            cls_land[lc] += w
            cls_rows[lc] += 1

            # ---- STAGE A: columns only ---------------------------------
            colv = {}
            for k in PARAMS:
                raw = low.get(k.lower())
                v, c = valid(k, raw)
                fieldstat[k][c] += 1
                fieldstat[k]["cells"] += 1
                param_cells += 1
                if c == "UNREADABLE":
                    unreadable_cells += 1
                if v is not None:
                    colv[k] = v
            # ⚠ cross-field: PMaxOcup==100 ALONGSIDE a published setback is
            # SUSPECT, NEVER VALID.
            if colv.get("PMaxOcup") == 100 and any(k in colv for k in SET):
                cross_fire["PMaxOcup=100 with a published setback"] += 1
                colv.pop("PMaxOcup")
            if colv.get("SupMin", 0) > 0 and low.get("fonmin") is not None \
                    and num(low.get("fonmin"))[0] == 0:
                cross_fire["SupMin>0 but FonMin==0"] += 1

            A = dict(has_set=any(k in colv for k in SET),
                     has_oc="PMaxOcup" in colv,
                     has_h=any(k in colv for k in HGT),
                     has_far="EdifMax" in colv,
                     has_dep=any(k in colv for k in DEP))

            # ---- STAGE B: + memo ---------------------------------------
            recs = M.harvest(low)
            got, derived, _ev = M.promotions(recs)
            B = dict(A)
            if not B["has_h"] and ("AltMaxM" in got or "AltMaxPl" in got):
                B["has_h"] = True
                memo_gain["height"] += 1
            if not B["has_oc"] and "PMaxOcup" in got:
                B["has_oc"] = True
                memo_gain["occupation"] += 1
            if not B["has_set"] and any(k.startswith("SepMin@") for k in got):
                B["has_set"] = True
                memo_gain["setback"] += 1
            if not B["has_dep"] and "FonMaxEd" in got:
                B["has_dep"] = True
                memo_gain["depth"] += 1
            if not B["has_far"]:
                if "EdifMax" in got:
                    B["has_far"] = True
                    memo_gain["FAR (memo column-equivalent)"] += 1
                elif derived is not None:
                    B["has_far"] = True
                    memo_gain["FAR (DERIVED floor-area/land-area)"] += 1

            # ---- A1: GRAMMAR + A2: WHICH HEIGHT DATUM -------------------
            g, note = grammar(colv, low.get("dispobl"))
            gram[g] += 1
            gram_note.setdefault(g, note)
            # ⚠ RECORD THE DATUM. AltMaxMV is measured from the STREET,
            # AltMaxMP from the PARCEL. Conflating them is exactly what makes
            # Madrid's NM_ALTURA uninterpretable - and §terrain-rasant (L-584)
            # is the same defect one level down.
            if "AltMaxMV" in colv and "AltMaxMP" in colv:
                datum["BOTH street+parcel - datum explicit"] += 1
            elif "AltMaxMV" in colv:
                datum["AltMaxMV - from the STREET (rasante)"] += 1
            elif "AltMaxMP" in colv:
                datum["AltMaxMP - from the PARCEL"] += 1
            elif "AltMaxPl" in colv:
                datum["floors only - NO metric datum"] += 1
            elif "AltMaxM" in got:
                datum["memo metres - datum NOT NAMED (UNKNOWN)"] += 1
            else:
                datum["no height"] += 1

            ta = tier(**A)
            tb = tier(**B)
            zone["A"][ta] += 1
            zone["B"][tb] += 1
            land["A"][ta] += w
            land["B"][tb] += w
            if D.is_private(lc):
                zone["C"][tb] += 1
                land["C"][tb] += w
                if tag in ROUTABLE:
                    zone["D"][tb] += 1
                    land["D"][tb] += w
            else:
                cls_param[lc] += (1 if (ta != "not drawable") else 0)

            # ---- Obs* conditioning -------------------------------------
            used = [k for k in colv]
            cond = any(str(low.get(OBS[k].lower()) or "").strip()
                       for k in used if k in OBS)
            if cond:
                obs_rows["A"] += 1
                obs_rows["B"] += 1
                if D.is_private(lc):
                    obs_rows["C"] += 1
                    if tag in ROUTABLE:
                        obs_rows["D"] += 1
            mrow[tb] += 1
            top_share.append((w, tag, eti))
        per_muni[tag] = {"rows": len(parsed), "tiers": dict(mrow),
                         "muni": fetched.get(tag, {}).get("muni", tag),
                         "island": fetched.get(tag, {}).get("island")}

    # ------------------------------------------------------------------
    tz = {s: sum(zone[s].values()) for s in "ABCD"}
    tl = {s: sum(land[s].values()) for s in "ABCD"}

    print("=" * 74)
    print("CANARIAS ENVELOPE MAXIMUM")
    print("=" * 74)
    print(f"  base-plan archives with a readable EDIF table : {archives_ok}")
    print(f"  archives with NO EDIF table                   : {archives_noedif}")
    print(f"  zone rows (all land classes)                  : {tz['A']}")
    print(f"  polygon land carried by those rows            : "
          f"{tl['A']/1e6:.1f} km2")

    def block(stage, label, denomz, denoml):
        c = zone[stage]["complete rule"]
        p = zone[stage]["partial-drawable"]
        n = zone[stage]["not drawable"]
        lc_ = land[stage]["complete rule"]
        lp = land[stage]["partial-drawable"]
        print(f"\n  {label}")
        print(f"    {'':<22}{'zone-weighted':>16}{'land-weighted':>16}")
        print(f"    {'complete rule':<22}{pct(c,denomz):>15.1f}%"
              f"{pct(lc_,denoml):>15.1f}%")
        print(f"    {'partial-drawable':<22}{pct(p,denomz):>15.1f}%"
              f"{pct(lp,denoml):>15.1f}%")
        print(f"    {'ANY-DRAWABLE (MAX)':<22}{pct(c+p,denomz):>15.1f}%"
              f"{pct(lc_+lp,denoml):>15.1f}%")
        print(f"    {'not drawable':<22}{pct(n,denomz):>15.1f}%"
              f"{pct(land[stage]['not drawable'],denoml):>15.1f}%")
        return pct(c + p, denomz)

    a = block("A", "STAGE A - COLUMNS ONLY (reproduces the baseline)",
              tz["A"], tl["A"])
    b = block("B", "STAGE B - + THE MEMO CHANNEL (LEVER 1)", tz["B"], tl["B"])
    c = block("C", "STAGE C - + PRIVATE-DEVELOPABLE DENOMINATOR (LEVER 2)",
              tz["C"], tl["C"])
    e = block("D", "STAGE D - + ONLY ROUTABLE MUNICIPALITIES (A0 step 2)",
              tz["D"], tl["D"])
    print(f"\n  DELTA  columns -> +memo          : {b-a:+.1f} pts")
    print(f"  DELTA  +memo -> +denominator     : {c-b:+.1f} pts")
    print(f"  DELTA  +denominator -> +routable : {e-c:+.1f} pts")
    print(f"  routable municipalities in the corpus: "
          f"{len(ROUTABLE)} of 88 (single base instrument, so no vigencia "
          f"question); rows retained {tz['D']} of {tz['C']} private")

    print(f"\n=== A1 - GRAMMAR DETECTED (maps to an engine that EXISTS) ===")
    ENG = {"SETBACK": "GeometricRule kind 'setback' - per-edge inset, "
                      "requiresBlockRing=false",
           "ALIGNMENT_DEPTH": "GeometricRule kind 'alignment' - inset then "
                              "half-plane clip at buildableDepth_m",
           "OCCUPATION": "footprint by coverage ratio (no new engine)",
           "DEPTH_NO_ALIGNMENT": "NOT SOLVABLE - depth with no datum edge",
           "REFUSE_GRAPHIC_ONLY": "REFUSAL - the rule is on a plan sheet",
           "NO_GRAMMAR": "REFUSAL - no boundary rule published"}
    for k, v in gram.most_common():
        print(f"  {v:6d}  {pct(v,tz['A']):5.1f}%  {k:<20}{ENG.get(k,'')}")
    print("  ⛔ NO NEW GEOMETRY ENGINE IS REQUIRED for SETBACK / "
          "ALIGNMENT_DEPTH / OCCUPATION.")

    print(f"\n=== A2 - WHICH HEIGHT DATUM (street vs parcel) ===")
    for k, v in datum.most_common():
        print(f"  {v:6d}  {pct(v,tz['A']):5.1f}%  {k}")

    print(f"\n=== WHAT THE MEMO CHANNEL SUPPLIED (rows upgraded) ===")
    for k, v in memo_gain.most_common():
        print(f"  {v:6d}  {k}")

    print(f"\n=== LEVER 2 - THE DENOMINATOR, land class by land class ===")
    print(f"  {'class':<26}{'rows':>7}{'zone%':>8}{'land km2':>11}"
          f"{'land%':>8}   in private denominator?")
    for k, v in cls_zone.most_common():
        print(f"  {k:<26}{v:>7}{pct(v,tz['A']):>7.1f}%"
              f"{cls_land[k]/1e6:>11.2f}{pct(cls_land[k],tl['A']):>7.1f}%"
              f"   {'YES' if D.is_private(k) else 'NO - EXCLUDED'}")
    exz = sum(v for k, v in cls_zone.items() if not D.is_private(k))
    exl = sum(v for k, v in cls_land.items() if not D.is_private(k))
    print(f"\n  EXCLUDED from the private denominator: {exz} rows "
          f"({pct(exz,tz['A']):.1f}% of rows), {exl/1e6:.1f} km2 "
          f"({pct(exl,tl['A']):.1f}% of land)")
    print(f"  ⛔ NON-CIRCULARITY AUDIT - drawable rows found INSIDE the "
          f"excluded classes:")
    for k, v in cls_param.most_common():
        print(f"      {k:<24}{v:>6} drawable rows out of {cls_rows[k]} "
              f"({pct(v,cls_rows[k]):.1f}%)")
    print("      (if these rates were HIGH the exclusion would be discarding "
          "real rules and would have to be withdrawn)")

    print(f"\n=== Obs* CONDITIONING (a conditioned parameter is PARTIAL) ===")
    for s in "ABCD":
        print(f"  stage {s}: {obs_rows[s]} rows ({pct(obs_rows[s],tz[s]):.1f}%)")

    print(f"\n=== VALIDATION - VALID is never merely non-null ===")
    print(f"  {'field':<11}{'cells':>8}{'VALID':>8}{'valid%':>8}"
          f"{'sentinel':>10}{'zero-inv':>9}{'out-rng':>8}{'non-int':>8}"
          f"{'UNREAD':>8}")
    for k in PARAMS:
        st = fieldstat[k]
        cn = st["cells"] or 1
        print(f"  {k:<11}{cn:>8}{st['VALID']:>8}{pct(st['VALID'],cn):>7.1f}%"
              f"{st['sentinel']:>10}{st['zero-invalid']:>9}"
              f"{st['out-of-range']:>8}{st['non-integer-floors']:>8}"
              f"{st['UNREADABLE']:>8}")
    print(f"\n  cross-field contradictions fired:")
    for k, v in cross_fire.most_common():
        print(f"    {v:6d}  {k}")
    print(f"\n  ⚠ UNREADABLE cells (access_parser variable-length defect): "
          f"{unreadable_cells}/{param_cells} "
          f"({pct(unreadable_cells,param_cells):.2f}%) - counted UNKNOWN, "
          f"NEVER zero")

    print(f"\n=== LAND-WEIGHTING SANITY ===")
    for k, v in joinstat.most_common():
        print(f"  {v:7d}  {k}")
    top_share.sort(reverse=True)
    n1 = max(1, len(top_share) // 100)
    print(f"  top 1% of rule rows ({n1}) govern "
          f"{pct(sum(w for w,_,_ in top_share[:n1]), tl['A']):.1f}% of the "
          f"land -> a zone-weighted rate and a land-weighted rate are "
          f"DIFFERENT STATISTICS")
    if nonmetric:
        print(f"  ⛔ NON-METRIC CRS, area refused: {nonmetric[:5]}")

    json.dump({"zone": {s: dict(zone[s]) for s in "ABCD"},
               "land": {s: dict(land[s]) for s in "ABCD"},
               "cls_zone": dict(cls_zone), "cls_land": dict(cls_land),
               "cls_rows": dict(cls_rows), "cls_param": dict(cls_param),
               "memo_gain": dict(memo_gain), "obs_rows": obs_rows,
               "grammar": dict(gram), "datum": dict(datum),
               "routable": sorted(ROUTABLE),
               "fieldstat": {k: dict(v) for k, v in fieldstat.items()},
               "cross_fire": dict(cross_fire), "joinstat": dict(joinstat),
               "unreadable_cells": unreadable_cells,
               "param_cells": param_cells,
               "archives_ok": archives_ok, "archives_noedif": archives_noedif,
               "per_muni": per_muni},
              open(os.path.join(DATA, "maximum.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    print("\nWROTE maximum.json")


if __name__ == "__main__":
    main()
