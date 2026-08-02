#!/usr/bin/env python3
"""LEVER 1 MEASUREMENT - what the memo channel adds, and PROOF that it is real.

Three separate numbers, never blended:
  LABEL hits          the label appears
  NUMBER hits         the label carries a parsable number
  PROMOTABLE          it survives the deny-list, the unit gate and the
                      magnitude gate

Plus the two controls that make the channel believable:

  ⭐ AGREEMENT CONTROL - on rows where the COLUMN is already VALID and the memo
     also speaks, do they AGREE? A memo channel that contradicts the columns is
     not a second parameter store, it is noise. This is the INDEPENDENT SOURCE.
  ⭐ DERIVATION CONTROL - the FAR derived from (floor-area / land-area) is only
     usable if it reproduces the EdifMax column where that column exists.

Writes .data/memo.json
"""
import glob
import json
import os
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import DATA, PARAMS, read_edif, valid  # noqa: E402
import memo as M  # noqa: E402

COLS_FOR = {"AltMaxM": ("AltMaxMP", "AltMaxMV"), "AltMaxPl": ("AltMaxPl",),
            "PMaxOcup": ("PMaxOcup",), "EdifMax": ("EdifMax",),
            "FonMaxEd": ("FonMaxEdm", "FonMaxEd"), "SupMin": ("SupMin",),
            # face-matched only - see memo.FACE_COL
            "SepMin@front": ("SepMinFr",), "SepMin@rear": ("SepMinPs",),
            "SepMin@lateral": ("SepMinLt",)}
# these carry a value but name no comparable column: usable for DRAWABILITY,
# never for the agreement control
NOT_COMPARABLE = ("SepMin@any", "SepMin@unspecified")


def main():
    works = sorted(glob.glob(os.path.join(DATA, "work", "*", "edif.mdb")))
    print(f"EDIF.mdb archives on disk: {len(works)}")
    label_hits = Counter()
    number_hits = Counter()
    promotable = Counter()
    verdicts = Counter()
    deny_reasons = Counter()
    reject_reasons = Counter()
    upgrades = Counter()          # memo fills a sentinel/empty column
    conflicts = Counter()         # memo disagrees with a populated column
    incomparable = Counter()      # memo speaks but names no comparable column
    conflict_ex = []
    agrees = Counter()            # memo agrees with a populated column
    rows_total = rows_memo = 0
    derived_rows = 0
    der_vs_col = []
    examples = defaultdict(list)
    per_row = {}                  # (tag,i) -> promoted dict  (for 05_maximum)

    for w in works:
        tag = os.path.basename(os.path.dirname(w))
        try:
            cols, rr = read_edif(w)
        except Exception:  # noqa: BLE001
            continue
        if not cols:
            continue
        for i, row in enumerate(rr):
            if row is None:
                continue
            rows_total += 1
            low = {k.lower(): v for k, v in row.items()}
            recs = M.harvest(low)
            if not recs:
                continue
            rows_memo += 1
            for r in recs:
                verdicts[r["verdict"]] += 1
                if r["verdict"] == "DENIED":
                    deny_reasons[r["reason"]] += 1
                    continue
                if r["verdict"] == "NOT_A_PARAMETER":
                    continue
                q = r["quantity"]
                label_hits[q] += 1
                if r.get("value") is not None:
                    number_hits[q] += 1
                if r["verdict"] == "REJECT_UNIT":
                    reject_reasons[f"{q}: {r['reason'][:60]}"] += 1
                if r["verdict"] == "PROMOTABLE":
                    promotable[q] += 1
                    if len(examples[q]) < 4:
                        examples[q].append(
                            f"{tag[:22]:<22} {r['label'][:34]:<34} = {r['value']:g}")

            got, derived, ev = M.promotions(recs)
            if derived is not None:
                derived_rows += 1
            per_row[f"{tag}#{i}"] = {"promoted": got, "derived_far": derived}

            # --- G3 + the AGREEMENT CONTROL --------------------------------
            for q, v in got.items():
                if q in NOT_COMPARABLE:
                    # still an UPGRADE if no setback column is populated at all
                    if not any(valid(c, low.get(c.lower()))[1] == "VALID"
                               for c in ("SepMinFr", "SepMinPs", "SepMinLt")):
                        upgrades[q] += 1
                    else:
                        incomparable[q] += 1
                    continue
                for cname in COLS_FOR.get(q, ()):
                    cv, cls = valid(cname, low.get(cname.lower()))
                    if cls == "VALID":
                        rel = abs(cv - v) / max(abs(cv), 1e-9)
                        if rel <= 0.05:
                            agrees[q] += 1
                        else:
                            conflicts[q] += 1
                            if len(conflict_ex) < 20:
                                conflict_ex.append(
                                    f"{tag[:20]:<20} {q:<14} col {cname}={cv:g}"
                                    f" memo={v:g}")
                        break
                else:
                    upgrades[q] += 1
            # derived FAR vs the EdifMax column
            if derived is not None:
                cv, cls = valid("EdifMax", low.get("edifmax"))
                if cls == "VALID":
                    der_vs_col.append((cv, derived, tag, ev))

    print(f"\n=== MEMO COVERAGE ===")
    print(f"  zone rows                      : {rows_total}")
    print(f"  rows with a non-empty memo     : {rows_memo} "
          f"({100*rows_memo/max(rows_total,1):.1f}%)")
    print(f"  rows where a FAR is DERIVABLE  : {derived_rows} "
          f"({100*derived_rows/max(rows_total,1):.1f}%)")

    print(f"\n=== RECORD VERDICTS (every memo record classified) ===")
    for k, v in verdicts.most_common():
        print(f"  {v:7d}  {k}")

    print(f"\n=== ⛔ THE DENY LIST DOING ITS JOB (labels that LOOK like "
          f"parameters) ===")
    for k, v in deny_reasons.most_common():
        print(f"  {v:7d}  {k}")

    print(f"\n=== THREE SEPARATE NUMBERS - never blend them ===")
    print(f"  {'quantity':<14}{'LABEL':>9}{'+NUMBER':>10}{'PROMOTABLE':>12}"
          f"{'UPGRADES col':>14}{'agrees col':>12}{'CONFLICTS':>11}")
    for q in ("AltMaxM", "AltMaxPl", "PMaxOcup", "EdifMax", "SepMin",
              "FonMaxEd", "SupMin", "NoOcup_pct", "FloorArea_m2",
              "LandArea_m2"):
        if not label_hits[q]:
            continue
        if q == "SepMin":
            up = sum(v for k, v in upgrades.items() if k.startswith("SepMin@"))
            ag = sum(v for k, v in agrees.items() if k.startswith("SepMin@"))
            co = sum(v for k, v in conflicts.items()
                     if k.startswith("SepMin@"))
        else:
            up, ag, co = upgrades[q], agrees[q], conflicts[q]
        print(f"  {q:<14}{label_hits[q]:>9}{number_hits[q]:>10}"
              f"{promotable[q]:>12}{up:>14}{ag:>12}{co:>11}")
    ic = sum(incomparable.values())
    print(f"  (setbacks the memo does not attribute to a face, so NOT "
          f"comparable to any column: {ic})")

    print(f"\n=== ⛔ UNIT REJECTIONS (a number in the wrong unit) - top 14 ===")
    for k, v in reject_reasons.most_common(14):
        print(f"  {v:7d}  {k}")

    print(f"\n=== examples of PROMOTABLE values ===")
    for q, ex in examples.items():
        for e in ex[:2]:
            print(f"  {q:<13} {e}")

    # ---------------- the two controls ------------------------------------
    print(f"\n=== ⭐ AGREEMENT CONTROL - memo vs a VALID column, same row ===")
    ta = sum(agrees.values())
    tc = sum(conflicts.values())
    print(f"  rows where BOTH speak: {ta+tc}   agree(<=5%): {ta} "
          f"({100*ta/max(ta+tc,1):.1f}%)   CONFLICT: {tc}")
    if ta + tc < 30:
        print("  ⚠ TOO FEW CO-OCCURRENCES TO BE A CONTROL - the memo channel "
              "and the columns are largely DISJOINT populations, which is "
              "consistent with the memo being a SUBSTITUTE store, but it means "
              "this control CANNOT confirm the memo values. Reported as "
              "UNKNOWN, not as pass.")
    else:
        print("  -> a high agreement rate is the independent evidence that the "
              "memo channel carries the SAME quantity the column carries.")
    if conflict_ex:
        print("  remaining CONFLICTS (each one is a quantity confusion still "
              "unaccounted for - listed, never hidden):")
        for e in conflict_ex[:14]:
            print(f"    {e}")

    print(f"\n=== ⭐ DERIVATION CONTROL - derived FAR vs the EdifMax column ===")
    print(f"  rows where both exist: {len(der_vs_col)}")
    if der_vs_col:
        ok = sum(1 for c, d, _t, _e in der_vs_col
                 if abs(c - d) / max(c, 1e-9) <= 0.10)
        print(f"  derived within 10% of the column: {ok}/{len(der_vs_col)} "
              f"({100*ok/len(der_vs_col):.1f}%)")
        for c, d, t, e in der_vs_col[:10]:
            print(f"    {t[:26]:<26} column={c:g}  derived={d:g}  "
                  f"({e[0]:g}/{e[1]:g})")
        if ok / len(der_vs_col) < 0.6:
            print("  ⛔ DERIVATION REFUTED - the quotient does NOT reproduce "
                  "the published FAR. It is NOT promoted.")
        else:
            print("  ⭐ DERIVATION SUPPORTED.")
    else:
        print("  ⚠ ZERO co-occurrences: the derivation CANNOT be validated "
              "against the column. It is reported SEPARATELY and is NOT "
              "counted in the headline maximum.")

    json.dump({"rows_total": rows_total, "rows_memo": rows_memo,
               "derived_rows": derived_rows,
               "label_hits": label_hits, "number_hits": number_hits,
               "promotable": promotable, "upgrades": upgrades,
               "agrees": agrees, "conflicts": conflicts,
               "der_vs_col": [(c, d, t) for c, d, t, _ in der_vs_col],
               "per_row": per_row},
              open(os.path.join(DATA, "memo.json"), "w", encoding="utf-8"),
              ensure_ascii=False)
    print("\nWROTE memo.json")


if __name__ == "__main__":
    main()
