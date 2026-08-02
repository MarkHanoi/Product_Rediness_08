"""C0 step 4 - NEGATIVE CONTROL on CKAN server-side filtering.

Coordinator's national finding: MapServer accepted CQL_FILTER and SILENTLY
IGNORED it, returning the whole-layer total wearing a municipal label. Only the
negative control caught it.

Seventh negative-proof condition, applied to CKAN:
  (a) every returned record CARRIES the requested value, AND
  (b) A VALUE KNOWN TO BE OUTSIDE THE UNIVERSE RETURNS ZERO.

We test three CKAN filter forms against the known unfiltered total (174 packages):
  1. fq on a REAL indexed field with a REAL value          -> expect a subset
  2. fq on a REAL field with an IMPOSSIBLE value           -> expect 0
  3. fq on a NONSENSE field name                           -> expect 0 or an
     ERROR. If it returns 174, the filter was IGNORED and every fq-derived
     number in this probe would be untrustworthy.
  4. q= free-text for a municipality                        -> expect OVER-match
     (matches any record MENTIONING it), demonstrating why q must not be used
     to partition.

Outcome governs the whole probe: if fq is unreliable we partition CLIENT-SIDE
off the full harvest, which is what 05_extract.py in fact does.
"""
import json

from lib import ckan, save

TOTAL = 174  # proven in 01_harvest.py: oracle == package_list == walk

tests = []


def t(label, expectation, **params):
    ok, res, d = ckan("package_search", rows=0, **params)
    n = res["count"] if ok else None
    rec = {"label": label, "params": params, "expectation": expectation,
           "ok": ok, "count": n, "status": d.get("status"),
           "error": (d.get("error") or "")[:600]}
    tests.append(rec)
    print("%-58s -> count=%-8s ok=%s" % (label, n, ok))
    if rec["error"]:
        # READ THE WHOLE ERROR STRING before concluding a capability is absent.
        print("      error: %s" % rec["error"][:300])
    return rec


print("unfiltered oracle total = %d\n" % TOTAL)
t("UNFILTERED (control)", "==174", q="")

# 1. real field, real value
r_real = t("fq organization=grafcan (real field, real value)", "subset <174",
           fq="organization:grafcan")
r_real2 = t("fq groups=urbanismo-infraestructuras", "subset <174",
            fq="groups:urbanismo-infraestructuras")
r_fmt = t("fq res_format=SIPU (real field, real value)", "subset <174",
          fq="res_format:SIPU")

# 2. real field, IMPOSSIBLE value  <-- (b), the control that catches silent-ignore
r_imp = t("fq organization=ZZZ_NOT_AN_ORG (real field, impossible value)", "==0",
          fq="organization:ZZZ_NOT_AN_ORG")
r_imp2 = t("fq res_format=ZZZ_NOT_A_FORMAT (impossible value)", "==0",
           fq="res_format:ZZZ_NOT_A_FORMAT")

# 3. NONSENSE FIELD NAME - the silent-ignore shape
r_bad = t("fq notafield_xyz=anything (nonsense FIELD name)", "0 or ERROR, never 174",
          fq="notafield_xyz:anything")

# 4. q= free text over-matching
r_q = t("q=Telde (free text - matches ANY mention)", "over-match", q="Telde")
r_q2 = t("q=Arona (free text)", "over-match", q="Arona")

verdict = {}
verdict["fq_applied_at_all"] = (r_real["count"] is not None
                                and r_real["count"] < TOTAL)
verdict["impossible_value_returns_zero"] = (r_imp["count"] == 0
                                            and r_imp2["count"] == 0)
verdict["nonsense_field_silently_ignored"] = (r_bad["count"] == TOTAL)
verdict["nonsense_field_result"] = r_bad["count"]
verdict["fq_TRUSTWORTHY"] = bool(verdict["fq_applied_at_all"]
                                 and verdict["impossible_value_returns_zero"]
                                 and not verdict["nonsense_field_silently_ignored"])
verdict["q_free_text_overmatches"] = {
    "Telde": r_q["count"], "Arona": r_q2["count"],
    "note": "q matches across ALL fields incl. notes; NOT a partition key"}
verdict["probe_decision"] = (
    "Partition CLIENT-SIDE from the full 174-package harvest regardless of this "
    "verdict. Every distribution in 05_extract.py is required to SUM BACK to the "
    "unfiltered totals (174 packages / 4697 resources / 1169 SIPU).")

print("\n=== VERDICT ===")
print(json.dumps(verdict, ensure_ascii=False, indent=2))
save("04_filter_negative_control.json", {"tests": tests, "verdict": verdict})
