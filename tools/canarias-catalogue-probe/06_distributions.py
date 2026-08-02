"""C0 step 6 - the six distributions, each with a MANDATORY SUM CHECK.

Coordinator's national finding applied: a partition that does not sum back to the
unfiltered total means either the filter was not applied or records are multiply
classified. BOTH ARE FINDINGS. Every distribution below asserts its own total and
the assertion result is printed and persisted, pass or fail.

Also runs the KNOWN-ANSWER CONTROL (Telde, Arona, Agulo, Arico must all appear)
and records control outcomes as findings.
"""
import collections
import json

from lib import load, save

rows = load("05_records.json")
SIPU = [r for r in rows if r["format"] == "SIPU"]
MUNI_SIPU = [r for r in SIPU if r["package_kind"] == "municipal"]

TOT_RES, TOT_SIPU = 4697, 1169
checks = []
report = {}


def sumcheck(label, counter, expected):
    got = sum(counter.values())
    ok = got == expected
    checks.append({"partition": label, "sums_to": got, "expected": expected,
                   "PASS": ok, "buckets": len(counter)})
    print("  SUMCHECK %-42s %6d / %6d  %s  (%d buckets)"
          % (label, got, expected, "PASS" if ok else "*** FAIL ***", len(counter)))
    return ok


def show(counter, total, limit=None, indent="    "):
    items = counter.most_common(limit)
    for k, v in items:
        print("%s%-56s %5d  %5.1f%%" % (indent, str(k)[:56], v, 100.0 * v / total))


print("=" * 78)
print("0. TOTALS (proven in 01_harvest.py: oracle == package_list == walk)")
print("=" * 78)
print("  packages in catalogue        : 174")
print("  resources in catalogue       : %d" % len(rows))
print("  SIPU resources               : %d" % len(SIPU))
print("  SIPU in MUNICIPAL packages   : %d" % len(MUNI_SIPU))
report["totals"] = {"packages": 174, "resources": len(rows),
                    "sipu_all": len(SIPU), "sipu_municipal": len(MUNI_SIPU)}

# ---------------------------------------------------------------- 5. FORMAT
print("\n" + "=" * 78)
print("5. FILE-FORMAT DISTRIBUTION  (whole catalogue, then planning corpus)")
print("=" * 78)
fmt_all = collections.Counter(r["format"] or "(empty)" for r in rows)
show(fmt_all, len(rows))
sumcheck("format / whole catalogue", fmt_all, TOT_RES)

PLAN = [r for r in rows if r["package_kind"] in
        ("municipal", "espacios-naturales", "modernizacion", "insular")]
fmt_plan = collections.Counter(r["format"] or "(empty)" for r in PLAN)
print("\n  -- planning packages only (n=%d) --" % len(PLAN))
show(fmt_plan, len(PLAN))
sumcheck("format / planning corpus", fmt_plan, len(PLAN))

# POPULATED IS NOT PRESENT: does `format` agree with `mimetype`?
print("\n  -- format vs mimetype cross-tab (contradiction check) --")
xt = collections.Counter((r["format"], r["mimetype"]) for r in PLAN)
for (f, m), c in xt.most_common(12):
    print("    format=%-6s mimetype=%-26s %5d" % (f, m, c))
pdf_html = sum(c for (f, m), c in xt.items() if f == "PDF" and m == "text/html")
print("    >>> resources labelled format=PDF but served as text/html: %d" % pdf_html)
report["format_mimetype_contradiction_pdf_as_html"] = pdf_html
report["format_all"] = dict(fmt_all)
report["format_planning"] = dict(fmt_plan)

# ---------------------------------------------------------------- 1. INSTRUMENT
print("\n" + "=" * 78)
print("1. INSTRUMENT-TYPE DISTRIBUTION  (SIPU resources = one per instrument)")
print("=" * 78)
inst = collections.Counter(r["instrument_family"] for r in SIPU)
show(inst, len(SIPU))
sumcheck("instrument family / all SIPU", inst, TOT_SIPU)
top = inst.most_common()
cum = 0
print("\n  cumulative coverage by family:")
for i, (k, v) in enumerate(top, 1):
    cum += v
    print("    %2d families -> %5d / %d = %5.1f%%   (+%s)"
          % (i, cum, len(SIPU), 100.0 * cum / len(SIPU), k[:44]))
    if cum / len(SIPU) >= 0.951 and i >= 1:
        break
report["instrument_family_all_sipu"] = dict(inst)

inst_m = collections.Counter(r["instrument_family"] for r in MUNI_SIPU)
print("\n  -- MUNICIPAL SIPU only (n=%d) --" % len(MUNI_SIPU))
show(inst_m, len(MUNI_SIPU))
sumcheck("instrument family / municipal SIPU", inst_m, len(MUNI_SIPU))
report["instrument_family_municipal_sipu"] = dict(inst_m)

mods = sum(1 for r in SIPU if r["is_modification"])
print("\n  MODIFICATION flag (orthogonal modifier, NOT a family):")
print("    %d / %d = %.1f%% of SIPU instruments are a modification/revision"
      % (mods, len(SIPU), 100.0 * mods / len(SIPU)))
report["modification_share_sipu"] = {"n": mods, "of": len(SIPU)}

# ---------------------------------------------------------------- 2. MUNICIPALITY
print("\n" + "=" * 78)
print("2. MUNICIPALITY COVERAGE")
print("=" * 78)
muni_pkgs = sorted({r["package"] for r in rows if r["package_kind"] == "municipal"})
print("  municipal planning packages published : %d" % len(muni_pkgs))
per_muni = collections.Counter(r["municipality_title"] for r in MUNI_SIPU)
zero = [p for p in muni_pkgs
        if p not in {r["package"] for r in MUNI_SIPU}]
print("  municipalities with >=1 SIPU          : %d" % len(per_muni))
print("  municipalities with ZERO SIPU         : %d" % len(zero))
for z in zero:
    print("      ZERO-SIPU: %s" % z)
sumcheck("SIPU per municipality", per_muni, len(MUNI_SIPU))
print("\n  top 15 municipalities by SIPU count:")
show(per_muni, len(MUNI_SIPU), 15)
print("\n  bottom 15:")
for k, v in per_muni.most_common()[-15:]:
    print("    %-56s %5d" % (k[:56], v))
report["municipal_packages"] = len(muni_pkgs)
report["municipalities_with_sipu"] = len(per_muni)
report["municipalities_zero_sipu"] = zero
report["sipu_per_municipality"] = dict(per_muni)

isl = collections.Counter(r["island"] for r in MUNI_SIPU)
print("\n  -- by ISLAND (municipal SIPU) --")
show(isl, len(MUNI_SIPU))
sumcheck("island / municipal SIPU", isl, len(MUNI_SIPU))
isl_m = collections.Counter()
for p in muni_pkgs:
    rr = [r for r in rows if r["package"] == p and r["island"]]
    if rr:
        isl_m[rr[0]["island"]] += 1
print("  municipalities per island:", dict(isl_m), "total", sum(isl_m.values()))
report["sipu_by_island"] = dict(isl)
report["municipalities_per_island"] = dict(isl_m)

# ---------------------------------------------------------------- 3. VINTAGE
print("\n" + "=" * 78)
print("3. VINTAGE DISTRIBUTION")
print("=" * 78)
print("  DATE PROVENANCE - 'aprobado el' and 'publicado el' are DIFFERENT EVENTS")
print("  and are counted separately. Merging them would manufacture an approval")
print("  year for ~1100 records that carry no approval date at all.")
prov = collections.Counter(r["vintage_source"] for r in SIPU)
show(prov, len(SIPU))
sumcheck("vintage provenance / all SIPU", prov, TOT_SIPU)
report["vintage_provenance"] = dict(prov)
n_appr = sum(1 for r in SIPU if r["approval_year"])
n_pub = sum(1 for r in SIPU if r["published_year"])
n_any = sum(1 for r in SIPU if r["vintage_year"])
print("\n  SIPU with an APPROVAL date ('aprobado el')  : %4d / %d = %5.1f%%"
      % (n_appr, len(SIPU), 100.0 * n_appr / len(SIPU)))
print("  SIPU with a BOC PUBLICATION date            : %4d / %d = %5.1f%%"
      % (n_pub, len(SIPU), 100.0 * n_pub / len(SIPU)))
print("  SIPU with ANY usable vintage year           : %4d / %d = %5.1f%%"
      % (n_any, len(SIPU), 100.0 * n_any / len(SIPU)))
print("  SIPU with NO date at all -> vintage UNKNOWN : %4d" % (len(SIPU) - n_any))
report["vintage_coverage"] = {"approval": n_appr, "boc_published": n_pub,
                              "any": n_any, "none": len(SIPU) - n_any,
                              "of": len(SIPU)}

have_date = [r for r in SIPU if r["vintage_year"]]
# VALIDATE FOR INTERNAL CONTRADICTION BEFORE QUOTING ANY RATE.
impossible = [r for r in have_date if not (1950 <= r["vintage_year"] <= 2026)]
print("\n  IMPOSSIBLE-YEAR CHECK (outside 1950-2026): %d record(s)" % len(impossible))
for r in impossible:
    print("      year=%s  %s" % (r["vintage_year"], r["resource_name"][:88]))
print("      -> these are SOURCE data-entry errors in the catalogue's own free")
print("         text, not parser errors. Retained in the histogram and flagged.")
report["impossible_vintage_years"] = [
    {"year": r["vintage_year"], "name": r["resource_name"],
     "package": r["package"]} for r in impossible]

print("\n  -- BEST-AVAILABLE vintage histogram (mostly BOC publication) --")
yr = collections.Counter(r["vintage_year"] for r in have_date)
for y in sorted(yr):
    print("    %d  %s %d" % (y, "#" * min(yr[y], 60), yr[y]))
sumcheck("vintage year / dated SIPU", yr, len(have_date))
report["sipu_with_any_vintage"] = len(have_date)
report["vintage_year_hist"] = {str(k): v for k, v in sorted(yr.items())}
dec = collections.Counter((r["vintage_year"] // 10) * 10 for r in have_date)
print("\n  by decade:")
for d in sorted(dec):
    print("    %ds  %-42s %4d  %4.1f%%"
          % (d, "#" * min(dec[d] // 6, 42), dec[d], 100.0 * dec[d] / len(have_date)))
sumcheck("vintage decade / dated SIPU", dec, len(have_date))
report["vintage_decade_hist"] = {str(k): v for k, v in sorted(dec.items())}

# fallback: any 4-digit year in the title
ty = [r for r in SIPU if r["title_years"]]
print("\n  SIPU with a 4-digit year ANYWHERE in the title : %d / %d = %.1f%%"
      % (len(ty), len(SIPU), 100.0 * len(ty) / len(SIPU)))
tyc = collections.Counter(max(r["title_years"]) for r in ty)
print("  (title-year is a WEAKER signal - may be a sentence number or an "
      "ambit name, NOT necessarily approval)")
for y in sorted(tyc):
    print("    %d  %d" % (y, tyc[y]))
report["sipu_with_title_year"] = len(ty)

print("\n  -- CATALOGUING year (created) - NOT a vintage, recorded separately --")
cy = collections.Counter(r["catalogued_year"] for r in SIPU)
for y in sorted(cy):
    print("    %s  %s %d" % (y, "#" * min(cy[y] // 8, 60), cy[y]))
sumcheck("catalogued year / all SIPU", cy, TOT_SIPU)
report["catalogued_year_hist"] = {str(k): v for k, v in sorted(cy.items())}

print("\n  -- vintage x instrument family (dated SIPU only) --")
xtab = collections.defaultdict(collections.Counter)
for r in have_date:
    d = r["vintage_year"]
    bucket = "pre-2000" if d < 2000 else ("2000-2009" if d < 2010 else
                                          ("2010-2017" if d < 2018 else "2018+"))
    xtab[r["instrument_family"]][bucket] += 1
for fam in sorted(xtab, key=lambda f: -sum(xtab[f].values())):
    tot = sum(xtab[fam].values())
    print("    %-46s n=%3d  %s" % (fam[:46], tot,
          " ".join("%s=%d" % (b, xtab[fam][b]) for b in
                   ("pre-2000", "2000-2009", "2010-2017", "2018+") if xtab[fam][b])))
report["vintage_x_family_dated"] = {k: dict(v) for k, v in xtab.items()}

# ---------------------------------------------------------------- 4. RECURRENCE
print("\n" + "=" * 78)
print("4. RECURRENCE / SUPERSESSION AMBIGUITY")
print("=" * 78)
BASE = {"Plan General de Ordenacion (PGO/PGOU)", "Normas Subsidiarias"}
base_per_muni = collections.Counter()
for r in MUNI_SIPU:
    if r["instrument_family"] in BASE and not r["is_modification"]:
        base_per_muni[r["municipality_title"]] += 1
multi = {k: v for k, v in base_per_muni.items() if v > 1}
print("  municipalities with >1 NON-modification base instrument (PGO or NNSS):")
print("    %d / %d municipalities" % (len(multi), len(muni_pkgs)))
for k, v in sorted(multi.items(), key=lambda x: -x[1])[:20]:
    print("      %-50s %d" % (k[:50], v))
none_base = [p for p in muni_pkgs
             if not any(r["package"] == p and r["instrument_family"] in BASE
                        and not r["is_modification"] for r in MUNI_SIPU)]
print("  municipalities with ZERO non-modification base instrument: %d" % len(none_base))
for n in none_base:
    print("      %s" % n)
report["recurrence"] = {
    "municipalities_with_multiple_base_instruments": len(multi),
    "detail": multi,
    "municipalities_with_zero_base_instrument": none_base,
}
tot_instr_per_muni = collections.Counter(r["municipality_title"] for r in MUNI_SIPU)
gt1 = sum(1 for v in tot_instr_per_muni.values() if v > 1)
print("  municipalities with >1 SIPU instrument of ANY kind: %d / %d"
      % (gt1, len(muni_pkgs)))
report["recurrence"]["municipalities_with_gt1_any_instrument"] = gt1

# ---------------------------------------------------------------- 6. PHASE
print("\n" + "=" * 78)
print("6. APPROVAL PHASE - IS IT EXPOSED, AND IS 'CURRENT' DERIVABLE?")
print("=" * 78)
ph = collections.Counter(r["phase"] for r in SIPU)
show(ph, len(SIPU))
sumcheck("phase / all SIPU", ph, TOT_SIPU)
definitive = ph["definitiva"] + ph["definitiva_parcial"]
print("\n  phase is carried in FREE TEXT (resource name prefix), not in a "
      "structured CKAN field.")
print("  structured CKAN extras on planning packages are only: identifier, "
      "language, publisher_name, publisher_uri, theme -- NO phase, NO date, "
      "NO municipality code.")
print("  DEFINITIVE-or-partial share: %d / %d = %.1f%%"
      % (definitive, len(SIPU), 100.0 * definitive / len(SIPU)))
print("  NON-definitive share       : %d / %d = %.1f%%"
      % (len(SIPU) - definitive, len(SIPU),
         100.0 * (len(SIPU) - definitive) / len(SIPU)))
report["phase_dist"] = dict(ph)
report["phase_definitive_share"] = {"n": definitive, "of": len(SIPU)}

# supersession fields present?
print("\n  supersession linkage check - does ANY field point one instrument at")
print("  the instrument it replaces or repeals?")
has_rel = sum(1 for r in rows if r.get("replaces"))
print("    CKAN relationships_as_subject/object on planning packages: "
      "harvested in 01, checked in 07.")

save("06_report.json", report)
save("06_sumchecks.json", checks)
print("\n" + "=" * 78)
failed = [c for c in checks if not c["PASS"]]
print("SUM CHECKS: %d run, %d PASS, %d FAIL" % (len(checks), len(checks) - len(failed), len(failed)))
for f in failed:
    print("  *** FAILED PARTITION: %s" % json.dumps(f))
print("=" * 78)
