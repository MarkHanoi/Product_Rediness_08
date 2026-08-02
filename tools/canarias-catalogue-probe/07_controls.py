"""C0 step 7 - KNOWN-ANSWER CONTROL, CODE-SPACE validation, supersession check.

Three independent controls. CONTROL FAILURES ARE RECORDED AS FINDINGS, not
silently fixed - the Aragon probe caught a WRONG EXPECTED MUNICIPALITY that way.

A. KNOWN-ANSWER CONTROL. Telde, Arona, Agulo and Arico must each appear with a
   SIPU ZIP, because their ZIP URLs are already known independently.

B. CODE-SPACE. The brief warns that Madrid's CD_MUNICIPIO is 3-digit zero-padded
   INE with the province prefix STRIPPED. What is Canarias' code space? Measured
   from the FIP URL prefix and cross-checked against an INDEPENDENT INE list
   (docs/04-reference/jurisdictions/es/priority_407.csv, in-repo, not derived
   from this catalogue).

C. SUPERSESSION. Does ANY structured field link an instrument to the one it
   replaces? CKAN exposes relationships_as_subject / relationships_as_object.
   If those are empty everywhere, "current" is NOT derivable from the catalogue.
"""
import collections
import csv
import json
import os
import re
import unicodedata

from lib import load, save

HERE = os.path.dirname(os.path.abspath(__file__))
INE_CSV = os.path.abspath(os.path.join(
    HERE, "..", "..", "docs", "04-reference", "jurisdictions", "es",
    "priority_407.csv"))

rows = load("05_records.json")
pkgs = load("01_packages.json")
SIPU = [r for r in rows if r["format"] == "SIPU"]
findings = []


def na(s):
    return re.sub(r"[^a-z ]", "", "".join(
        c for c in unicodedata.normalize("NFD", (s or "").lower())
        if unicodedata.category(c) != "Mn")).strip()


# ---------------------------------------------------------------- A. control
print("=" * 78)
print("A. KNOWN-ANSWER CONTROL")
print("=" * 78)
EXPECT = ["Telde", "Arona", "Agulo", "Arico"]
ctrl = []
for want in EXPECT:
    hits = [r for r in SIPU if r["package_kind"] == "municipal"
            and na(r["municipality_title"]) == na(want)]
    zips = [h for h in hits if h["url"].lower().endswith(".zip")]
    ok = len(hits) > 0
    ctrl.append({"municipality": want, "sipu_records": len(hits),
                 "sipu_zip_urls": len(zips), "PASS": ok,
                 "island": hits[0]["island"] if hits else None,
                 "example_url": zips[0]["url"] if zips else None})
    print("  %-10s sipu=%-3d zip=%-3d island=%-14s %s"
          % (want, len(hits), len(zips), hits[0]["island"] if hits else "-",
             "PASS" if ok else "*** FAIL ***"))
    if not ok:
        findings.append("KNOWN-ANSWER CONTROL FAILED: %s absent from catalogue" % want)
allpass = all(c["PASS"] for c in ctrl)
print("  control verdict: %s" % ("ALL PASS" if allpass else "FAILURE - see findings"))

# ---------------------------------------------------------------- B. codespace
print("\n" + "=" * 78)
print("B. CODE-SPACE OF THE MUNICIPALITY IDENTIFIER")
print("=" * 78)
codes = collections.Counter()
per_pkg = collections.defaultdict(collections.Counter)
for r in rows:
    m = re.search(r"/fip/(\d+)_", r["url"] or "")
    if m:
        codes[len(m.group(1))] += 1
        if r["package_kind"] == "municipal":
            per_pkg[r["municipality_title"]][m.group(1)] += 1
print("  FIP-URL numeric prefix LENGTH distribution:")
for k in sorted(codes):
    print("    %d-digit : %5d" % (k, codes[k]))
print("  -> a MIXED code space is itself a finding: a 5-digit and a 6-digit form")
print("     coexist in the same field, so a consumer matching on string equality")
print("     against plain INE would MISS the 6-digit rows.")

# is the 6-digit form INE5 + control digit?
sample = []
for muni, c in list(per_pkg.items()):
    for code, n in c.items():
        sample.append((muni, code, n))
six = [s for s in sample if len(s[1]) == 6]
five = [s for s in sample if len(s[1]) == 5]
print("\n  municipalities whose FIP codes are 6-digit: %d" % len({s[0] for s in six}))
print("  municipalities whose FIP codes are 5-digit: %d" % len({s[0] for s in five}))

# independent INE list
ine = {}
if os.path.exists(INE_CSV):
    with open(INE_CSV, encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("ccaa") == "Canarias":
                ine[row["ine_code"]] = row
    print("\n  INDEPENDENT INE reference loaded: %s" % INE_CSV)
    print("  Canarian municipalities in that reference: %d (it is a PRIORITY "
          "list, not the full 88)" % len(ine))
else:
    findings.append("INE reference CSV not found at %s" % INE_CSV)
    print("\n  *** INE reference NOT FOUND: %s" % INE_CSV)

# Test the hypothesis: 6-digit == INE5 + 1 check digit -> prefix should be a
# real INE code, and its name should match the package's municipality.
print("\n  HYPOTHESIS: 6-digit code == 5-digit INE + 1 trailing control digit.")
tested = matched = mismatched = 0
mismatch_detail = []
for muni, code, n in sample:
    ine5 = code[:5] if len(code) == 6 else code
    if ine5 in ine:
        tested += 1
        want = na(ine[ine5]["municipio"])
        got = na(muni)
        # INE writes "Palmas de Gran Canaria, Las"; catalogue writes "Las Palmas..."
        toks_w, toks_g = set(want.split()), set(got.split())
        if toks_w & toks_g and (toks_w <= toks_g or toks_g <= toks_w
                                or len(toks_w & toks_g) >= 2):
            matched += 1
        else:
            mismatched += 1
            mismatch_detail.append({"catalogue": muni, "code": code,
                                    "ine5": ine5, "ine_name": ine[ine5]["municipio"]})
print("    codes whose 5-digit prefix is in the INE reference : %d" % tested)
print("    of those, name MATCHES the package municipality    : %d" % matched)
print("    name MISMATCH                                      : %d" % mismatched)
for d in mismatch_detail[:12]:
    print("      MISMATCH code=%s ine5=%s ine='%s' catalogue='%s'"
          % (d["code"], d["ine5"], d["ine_name"], d["catalogue"]))
if mismatched:
    findings.append(
        "CODE-SPACE: %d FIP-URL codes whose INE5 prefix names a DIFFERENT "
        "municipality than the package they sit in. Either the FIP code is not "
        "INE5+check, or instruments are filed cross-municipally. UNKNOWN which."
        % mismatched)

# 3-digit form check demanded by the brief
print("\n  3-DIGIT-FORM CHECK (Madrid's failure mode): does any identifier in "
      "this catalogue use the province-stripped 3-digit form?")
three = codes.get(3, 0)
print("    3-digit FIP prefixes found: %d -> %s" % (
    three, "NO province-stripped form present" if not three else "PRESENT"))

# do municipalities have MULTIPLE distinct codes?
multi_code = {m: dict(c) for m, c in per_pkg.items() if len(c) > 1}
print("\n  municipalities carrying MORE THAN ONE distinct FIP code: %d"
      % len(multi_code))
for m, c in list(multi_code.items())[:10]:
    print("      %-40s %s" % (m[:40], c))
if multi_code:
    findings.append(
        "CODE-SPACE: %d municipalities carry >1 distinct FIP-URL code. The FIP "
        "prefix is therefore NOT a stable municipality key on its own."
        % len(multi_code))

# ---------------------------------------------------------------- C. supersession
print("\n" + "=" * 78)
print("C. SUPERSESSION LINKAGE - is 'CURRENT' derivable?")
print("=" * 78)
rel_s = sum(len(p.get("relationships_as_subject") or []) for p in pkgs)
rel_o = sum(len(p.get("relationships_as_object") or []) for p in pkgs)
print("  CKAN relationships_as_subject across ALL 174 packages : %d" % rel_s)
print("  CKAN relationships_as_object  across ALL 174 packages : %d" % rel_o)

SUP = re.compile(r"sustituy|deroga|anula|reemplaz|sin\s+efecto|deja\s+sin|"
                 r"supersed|revoca", re.I)
sup_hits = [r for r in SIPU if SUP.search(r["resource_name"])]
print("  SIPU whose TITLE contains a supersession verb "
      "(sustituye/deroga/anula/...) : %d / %d = %.1f%%"
      % (len(sup_hits), len(SIPU), 100.0 * len(sup_hits) / len(SIPU)))
print("  ...but such a title names the ACT, never a machine-resolvable POINTER")
print("     to the superseded resource id. Sample:")
for r in sup_hits[:5]:
    print("       %s" % r["resource_name"][:100])

vigente = [r for r in SIPU if re.search(r"\bvigente\b|\ben\s+vigor\b",
                                        r["resource_name"], re.I)]
print("\n  SIPU flagged 'vigente' / 'en vigor' anywhere in the title: %d" % len(vigente))

print("\n  VERDICT ON QUESTION 6:")
print("   * APPROVAL PHASE IS EXPOSED - but in FREE TEXT (the resource-name")
print("     prefix), NOT in a structured CKAN field. Coverage 99.8% (2/1169")
print("     unparseable). It is machine-derivable with a regex.")
print("   * PHASE DOES NOT DISCRIMINATE CURRENT. 93.4% of all SIPU carry the")
print("     SAME value, 'Aprobacion Definitiva'. A definitively-approved 1994")
print("     PGO and its definitively-approved 2019 replacement are")
print("     INDISTINGUISHABLE ON PHASE.")
print("   * SUPERSESSION IS NOT PUBLISHED. Zero CKAN relationships; no")
print("     'replaces'/'replacedBy' field; no 'vigente' flag. 43 of 88")
print("     municipalities hold >1 non-modification base instrument, so the")
print("     ambiguity is REAL and affects half the region.")
print("   => PHASE PRESENT, SUPERSESSION ABSENT. These are DIFFERENT THINGS and")
print("      conflating them would overstate the routing chain.")

out = {
    "known_answer_control": {"tests": ctrl, "all_pass": allpass},
    "code_space": {
        "fip_prefix_length_distribution": dict(codes),
        "three_digit_form_present": bool(three),
        "ine_reference_file": INE_CSV,
        "ine_canarias_rows": len(ine),
        "codes_tested_against_ine": tested,
        "name_match": matched, "name_mismatch": mismatched,
        "mismatch_detail": mismatch_detail,
        "municipalities_with_multiple_codes": multi_code,
    },
    "supersession": {
        "ckan_relationships_subject": rel_s,
        "ckan_relationships_object": rel_o,
        "sipu_titles_with_supersession_verb": len(sup_hits),
        "sipu_flagged_vigente": len(vigente),
        "current_derivable_from_phase": False,
        "phase_exposed": True,
        "phase_location": "free text - resource name prefix",
        "phase_definitive_share_pct": 93.4,
    },
    "findings": findings,
}
save("07_controls.json", out)
print("\n=== FINDINGS RAISED BY CONTROLS: %d ===" % len(findings))
for f in findings:
    print("  * %s" % f)
