"""C0 step 8 - the STRATIFIED SAMPLE FRAME for the sibling SIPU-interior agent.

Draws 20-30 candidate SIPU ZIPs spread across ISLAND, MUNICIPALITY VOLUME,
INSTRUMENT FAMILY and VINTAGE ERA, with the SEED and the STRATA recorded, then
HEAD-verifies every drawn URL so the sibling receives REACHABLE candidates.

+---------------------------------------------------------------------------+
| VALIDITY STATEMENT - read before using this frame.                          |
|                                                                             |
| VALID FOR: schema and consistency questions about ZIP INTERIORS.            |
|   "do N/N ZIPs contain EDIF.mdb?", "which fields are present?", "does the   |
|   grammar differ by vintage or by instrument family?"                       |
|                                                                             |
| NOT VALID FOR: estimating AREA or PARCEL shares of Canarias, or any         |
|   population-weighted quantity. A Valencia run on this programme stratified |
|   by POPULATION to estimate LAND AREA and OVERSTATED IT ~2x (14.61% vs a    |
|   census 6.83%). This frame is drawn proportional to CATALOGUE VOLUME, not  |
|   to land area, not to population, and not to parcel count. Any areal or    |
|   per-capita number computed from it would be a fabrication.                |
+---------------------------------------------------------------------------+
"""
import collections
import json
import random

from lib import head, load, save, sleep

SEED = 20260802
random.seed(SEED)

rows = load("05_records.json")
SIPU = [r for r in rows if r["format"] == "SIPU"
        and (r["url"] or "").lower().endswith(".zip")]
print("eligible SIPU .zip resources: %d" % len(SIPU))

# ---- stratum axes ---------------------------------------------------------
muni_vol = collections.Counter(r["package"] for r in SIPU
                               if r["package_kind"] == "municipal")
vols = sorted(muni_vol.values())
t1 = vols[len(vols) // 3]
t2 = vols[2 * len(vols) // 3]


def vol_band(pkg):
    v = muni_vol.get(pkg)
    if v is None:
        return "non-municipal"
    return "small(<=%d)" % t1 if v <= t1 else (
        "mid(<=%d)" % t2 if v <= t2 else "large(>%d)" % t2)


def era(y):
    if not y:
        return "undated"
    if y < 1990:
        return "pre-1990"
    if y < 2000:
        return "1990s"
    if y < 2010:
        return "2000s"
    if y < 2018:
        return "2010-2017"
    return "2018+"


TOP_FAMILIES = ["Plan General de Ordenacion (PGO/PGOU)", "Plan Parcial",
                "Normas Subsidiarias", "Plan Especial", "Estudio de Detalle",
                "Normas de Conservacion"]

for r in SIPU:
    r["_vol"] = vol_band(r["package"])
    r["_era"] = era(r["vintage_year"])
    r["_fam"] = r["instrument_family"] if r["instrument_family"] in TOP_FAMILIES \
        else "other"

print("\nstratum axis cardinalities:")
for ax in ("island", "_vol", "_era", "_fam"):
    c = collections.Counter(r[ax] for r in SIPU)
    print("  %-8s %s" % (ax, dict(c)))

# ---- draw -----------------------------------------------------------------
# Target 28. Coverage-first: guarantee every ISLAND (7), every top FAMILY (6)
# and every ERA (5) appears at least once, then fill proportionally to volume.
TARGET = 28
# Mogan alone is 7.7% of the universe, so an unconstrained proportional fill
# drew it FOUR times. A frame that spends 4 of 28 slots on one municipality
# answers less about Canarias than one that spreads. Cap at 2 per package; the
# cap is RELAXED only if a stratum cannot otherwise be covered.
PKG_CAP = 2
picked = {}
pkg_used = collections.Counter()


def take(pool, why, respect_cap=True):
    cand = [r for r in pool if r["resource_id"] not in picked]
    if respect_cap:
        capped = [r for r in cand if pkg_used[r["package"]] < PKG_CAP]
        if capped:
            cand = capped
        elif why.startswith("proportional-fill"):
            return False  # never breach the cap just to pad the count
    if not cand:
        return False
    r = dict(random.choice(cand))
    r["_strata_reason"] = why
    picked[r["resource_id"]] = r
    pkg_used[r["package"]] += 1
    return True


for isl in sorted({r["island"] for r in SIPU if r["island"]}):
    take([r for r in SIPU if r["island"] == isl], "island-coverage:%s" % isl)
for fam in TOP_FAMILIES:
    take([r for r in SIPU if r["_fam"] == fam], "family-coverage:%s" % fam)
for e in ("pre-1990", "1990s", "2000s", "2010-2017", "2018+", "undated"):
    take([r for r in SIPU if r["_era"] == e], "era-coverage:%s" % e)
for v in sorted({r["_vol"] for r in SIPU}):
    take([r for r in SIPU if r["_vol"] == v], "volume-coverage:%s" % v)
# extreme-size probes: the smallest and largest ZIPs are where a schema breaks
sized = sorted([r for r in SIPU if r["size"]], key=lambda r: r["size"])
take([sized[0]], "size-extreme:smallest")
take([sized[-1]], "size-extreme:largest")
take([sized[len(sized) // 2]], "size-extreme:median")
# proportional fill, cap-respecting
guard = 0
while len(picked) < TARGET and guard < 4000:
    guard += 1
    take(SIPU, "proportional-fill")

frame = list(picked.values())
print("\ndrawn: %d (seed=%d)" % (len(frame), SEED))

# ---- HEAD-verify every drawn candidate ------------------------------------
print("\nHEAD-verifying every drawn URL (reachability is part of the frame):")
reach = collections.Counter()
for r in frame:
    st, hdrs, err = head(r["url"])
    r["http_status"] = st
    r["content_length"] = hdrs.get("Content-Length")
    r["content_type"] = hdrs.get("Content-Type")
    r["head_note"] = err
    ok = st in (200, 206)
    r["reachable"] = ok
    reach["reachable" if ok else "status=%s" % st] += 1
    print("  %-3s %-9s %-26s %s" % (st, r["_era"], (r["island"] or "-")[:26],
                                    (r["municipality_title"] or r["package"])[:34]))
    sleep(0.15)
print("\nreachability of the frame: %s" % dict(reach))

# size agreement: catalogue `size` vs actual Content-Length
disagree = [r for r in frame if r["size"] and r["content_length"]
            and int(r["content_length"]) != int(r["size"])]
print("frame rows where catalogue size != served Content-Length: %d / %d"
      % (len(disagree), len(frame)))

art = {
    "artefact": "canarias-sipu-stratified-sample-frame",
    "generated_by": "tools/canarias-catalogue-probe/08_sample_frame.py",
    "seed": SEED,
    "drawn_from": {
        "universe": "all SIPU-format resources with a .zip URL in the "
                    "opendata.sitcan.es CKAN catalogue",
        "universe_size": len(SIPU),
        "catalogue_total_sipu": 1169,
        "harvest_reconciliation": "174/174 packages; CKAN count oracle == "
                                  "package_list == paged walk",
    },
    "VALIDITY": {
        "valid_for": [
            "ZIP-interior schema questions (presence of EDIF.mdb etc.)",
            "field-coverage and grammar-entropy comparisons ACROSS strata",
            "consistency checks by island / instrument family / vintage era",
        ],
        "NOT_valid_for": [
            "estimating AREA or PARCEL shares of Canarias",
            "population-weighted or per-capita quantities",
            "any areal extrapolation - the frame is drawn proportional to "
            "CATALOGUE VOLUME, not land area, not population, not parcel count",
        ],
        "precedent": "A Valencia run on this programme stratified by POPULATION "
                     "to estimate LAND AREA and overstated it ~2x (14.61% vs a "
                     "census 6.83%).",
    },
    "strata_axes": {
        "island": sorted({r["island"] for r in SIPU if r["island"]}),
        "municipality_volume_band": {
            "definition": "tercile of SIPU-instrument count per municipal package",
            "cut_points": {"small_max": t1, "mid_max": t2},
            "NOTE": "This is CATALOGUE VOLUME, not population. Population is "
                    "independently known for only 29 of 88 Canarian "
                    "municipalities (priority_407.csv) and was deliberately NOT "
                    "used as the stratifier.",
        },
        "instrument_family": TOP_FAMILIES + ["other"],
        "vintage_era": ["pre-1990", "1990s", "2000s", "2010-2017", "2018+", "undated"],
        "vintage_caveat": "vintage is a BOC PUBLICATION date for 90.4% of "
                          "records and an APPROVAL date for only 6.6%. The eras "
                          "are publication eras unless approval_date is set.",
    },
    "draw_method": "coverage-first (every island, every top family, every era, "
                   "every volume band guaranteed >=1) + smallest/median/largest "
                   "ZIP + cap-respecting proportional random fill to n=%d, "
                   "max %d per package, random.seed(%d)" % (TARGET, PKG_CAP, SEED),
    "per_package_cap": PKG_CAP,
    "distinct_packages_in_frame": len({r["package"] for r in frame}),
    "frame_size": len(frame),
    "reachability": dict(reach),
    "catalogue_size_vs_content_length_disagreements": len(disagree),
    "strata_realised": {
        "island": dict(collections.Counter(r["island"] for r in frame)),
        "family": dict(collections.Counter(r["_fam"] for r in frame)),
        "era": dict(collections.Counter(r["_era"] for r in frame)),
        "volume_band": dict(collections.Counter(r["_vol"] for r in frame)),
    },
    "candidates": [
        {
            "resource_id": r["resource_id"],
            "url": r["url"],
            "municipality": r["municipality_title"] or r["package"],
            "package": r["package"],
            "package_kind": r["package_kind"],
            "island": r["island"],
            "instrument_family": r["instrument_family"],
            "is_modification": r["is_modification"],
            "phase": r["phase"],
            "vintage_year": r["vintage_year"],
            "vintage_source": r["vintage_source"],
            "era": r["_era"],
            "volume_band": r["_vol"],
            "catalogue_size_bytes": r["size"],
            "http_status": r["http_status"],
            "content_length": r["content_length"],
            "reachable": r["reachable"],
            "strata_reason": r["_strata_reason"],
            "resource_name": r["resource_name"],
        } for r in sorted(frame, key=lambda x: (x["island"] or "", x["_fam"]))
    ],
}
save("SAMPLE-FRAME.json", art)
print("\nrealised strata:")
for k, v in art["strata_realised"].items():
    print("  %-11s %s" % (k, v))
print("\nwrote out/SAMPLE-FRAME.json")
