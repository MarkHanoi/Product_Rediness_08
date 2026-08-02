#!/usr/bin/env python3
"""THE ENVELOPE MAXIMUM - tiered drawability, distinct-value proof, vigencia.

Runs directly over every EDIF.mdb extracted on disk (does not depend on the
measurement JSON), so it always reflects the full set of archives opened.

Reports, in the shape the brief asks for:
  TIER A (single base instrument) vs TIER B (multi) - routing settled or not
  distinct-value proof per field  (a 100%-populated single-valued field is
    Balears' DFIVIGEN = zero information)
  three drawability tiers: complete rule / partial-drawable / not drawable
  Obs* conditioning rate
  WHICH HEIGHT DATUM (AltMaxMV street vs AltMaxMP parcel)
  FonMaxEd - the parameter no other Spanish region serves
"""
import glob
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
sys.path.insert(0, HERE)
from mdb import open_mdb, read_table  # noqa: E402

PARAMS = {
    "SupMin": (1, 100000, False), "LongMin": (1, 500, False),
    "FonMin": (1, 500, False), "CircInsc": (1, 500, False),
    "SepMinFr": (0, 200, True), "SepMinPs": (0, 200, True),
    "SepMinLt": (0, 200, True), "SepMnEdf": (0, 200, True),
    "DispOblm": (0, 200, True), "FonMaxEd": (1, 500, False),
    "FonMaxEdm": (1, 500, False), "PMaxOcup": (0, 100, True),
    "EdifMax": (0.01, 20, False), "AltMaxPl": (1, 60, False),
    "AltMaxMV": (1, 300, False), "AltMaxMP": (1, 300, False),
}
SENT = {"I", "COM", "NP", "T", "GRF", "AV", "AV+GRF", "S", "N", "SI", "NO",
        "-", "--", "*", "ND", "NC", "X", ""}
CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f-￿]")
# non-buildable / protection / systems families - EXCLUDED from the denominator
NONBUILD = re.compile(
    r"^(SRP|SG|SL|EQ|E$|ESP|IF|VP|ZV|EL|EsCAT|ECAT|DOT|VIA|RED|INF|PZ|"
    r"SIST|ESPACIO|ZONA VERDE)", re.I)
NONBUILD_NAME = re.compile(
    r"equipamiento|espacio libre|zona verde|infraestructur|viario|sistema |"
    r"dotacional|protecci[oó]n|r[uú]stico|catalogad|parque|deportiv|"
    r"cementerio|aparcamiento|servicio", re.I)


def num(v):
    if v is None:
        return None, "null"
    s = str(v).strip()
    if CTRL.search(s):
        return None, "UNREADABLE"
    if s.upper() in SENT:
        return None, "sentinel"
    t = re.sub(r"(?<=\d)\.(?=\d{3}\b)", "", s.replace(" ", "")).replace(",", ".")
    if re.fullmatch(r"[-+]?\d*\.?\d+", t):
        try:
            return float(t), "numeric"
        except ValueError:
            return None, "text"
    m = re.fullmatch(r"([-+]?\d*[.,]?\d+)\s*(m2?c?|m²c?|%|pl(?:antas?)?|ml)\.?",
                     t, re.I)
    if m:
        return float(m.group(1).replace(",", ".")), "numeric-with-unit"
    return None, "text"


def valid(key, v):
    n, cls = num(v)
    if n is None:
        return None, cls
    lo, hi, zero_ok = PARAMS[key]
    if n == 0 and not zero_ok:
        return None, "zero-invalid"
    if not (lo <= n <= hi):
        return None, "out-of-range"
    if key == "AltMaxPl" and abs(n - round(n)) > 1e-9:
        return None, "non-integer-floors"
    return n, "VALID"


def main():
    cls = json.load(open(os.path.join(DATA, "classified.json"),
                        encoding="utf-8"))
    # --- TIER A / TIER B ------------------------------------------------
    base = defaultdict(int)
    EXCL = re.compile(r"modificaci|estudio de detalle|sentencia|anulaci|"
                      r"plan parcial|plan especial|suspensi", re.I)
    ACC = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
    INCL = re.compile(r"plan general de ordenacion|normas subsidiarias", re.I)
    for r in cls:
        if not r.get("muni"):
            continue
        nm = (r.get("name") or "").translate(ACC)
        if EXCL.search(nm) or not INCL.search(nm):
            continue
        base[r["muni"]] += 1
    tierA = sorted(m for m, c in base.items() if c == 1)
    tierB = sorted(m for m, c in base.items() if c > 1)
    print("=== ROUTING TIERS (from the CKAN catalogue census, 88/88) ===")
    print(f"  TIER A single base instrument -> routing SETTLED : {len(tierA)}")
    print(f"  TIER B multi base instrument  -> needs vigencia  : {len(tierB)}")
    print(f"  municipalities with a base instrument            : {len(base)}/88")
    print(f"  TIER B examples: {tierB[:10]}")

    # --- per-archive scan ------------------------------------------------
    works = sorted(glob.glob(os.path.join(DATA, "work", "*", "edif.mdb")))
    print(f"\n=== EDIF.mdb ARCHIVES OPENED: {len(works)} ===")
    distinct = defaultdict(Counter)
    stats = defaultdict(Counter)
    tiers = Counter()
    obs_cond = Counter()
    datum = Counter()
    fon_rows = []
    buildable = 0
    total = 0
    excluded = 0
    per_arch = {}

    for w in works:
        try:
            db = open_mdb(w)
            tn = [t for t in db.catalog if t.upper() == "EDIF"][0]
            cols, rr = read_table(db, tn)
        except Exception:  # noqa: BLE001
            continue
        tag = os.path.basename(os.path.dirname(w))
        loc = Counter()
        for row in rr:
            if row is None:
                continue
            total += 1
            low = {k.lower(): v for k, v in row.items()}
            et = str(low.get("etiqueta") or "")
            nm = str(low.get("nombre") or "")
            if NONBUILD.match(et) or NONBUILD_NAME.search(nm):
                excluded += 1
                loc["excluded"] += 1
                continue
            buildable += 1
            vals = {}
            for k in PARAMS:
                raw = low.get(k.lower())
                v, c = valid(k, raw)
                stats[k][c] += 1
                stats[k]["cells"] += 1
                if v is not None:
                    vals[k] = v
                    distinct[k][v] += 1
                    # Obs conditioning
                    obs = None
                    for oc in low:
                        if oc.startswith("obs") and k.lower()[:4] in oc:
                            obs = low[oc]
                    if obs and str(obs).strip():
                        obs_cond[k] += 1
                        obs_cond["_any"] += 1
            # height + datum
            h_par = vals.get("AltMaxMP")
            h_str = vals.get("AltMaxMV")
            fl = vals.get("AltMaxPl")
            has_h = any(x is not None for x in (h_par, h_str, fl))
            if h_par is not None and h_str is not None:
                datum["BOTH (street+parcel) - datum explicit"] += 1
            elif h_par is not None:
                datum["AltMaxMP only (from PARCEL)"] += 1
            elif h_str is not None:
                datum["AltMaxMV only (from STREET)"] += 1
            elif fl is not None:
                datum["floors only (AltMaxPl, no metric datum)"] += 1
            else:
                datum["no height"] += 1
            # footprint rule
            has_set = any(k in vals for k in
                          ("SepMinFr", "SepMinPs", "SepMinLt"))
            has_oc = "PMaxOcup" in vals
            has_dep = ("FonMaxEd" in vals) or ("FonMaxEdm" in vals)
            if has_dep:
                fon_rows.append((tag, et, vals.get("FonMaxEd"),
                                 vals.get("FonMaxEdm")))
            full = has_set and has_oc and has_h and (
                "EdifMax" in vals)
            if full:
                tiers["complete rule"] += 1
                loc["complete"] += 1
            elif (has_set or has_oc or has_dep) and has_h:
                tiers["partial-drawable"] += 1
                loc["partial"] += 1
            elif "EdifMax" in vals or vals:
                tiers["not drawable (quantities only, no shape)"] += 1
            else:
                tiers["not drawable (nothing)"] += 1
        per_arch[tag] = loc

    print(f"  zone rows total              : {total}")
    print(f"  EXCLUDED non-buildable/systems: {excluded} "
          f"({100*excluded/max(total,1):.1f}%)")
    print(f"  BUILDABLE denominator         : {buildable}")

    print("\n=== GATE 2 - DISTINCT-VALUE PROOF (never 'n% populated' alone) ===")
    print(f"  {'field':<11}{'cells':>7}{'VALID':>7}{'valid%':>8}"
          f"{'distinct':>9}{'min':>8}{'max':>9}  values")
    for k in PARAMS:
        st = stats[k]
        d = distinct[k]
        c = st["cells"] or 1
        vs = sorted(d)
        show = ",".join(f"{v:g}" for v in vs[:12]) + ("..." if len(vs) > 12 else "")
        print(f"  {k:<11}{c:>7}{st['VALID']:>7}{100*st['VALID']/c:>7.1f}%"
              f"{len(d):>9}{(min(vs) if vs else 0):>8g}{(max(vs) if vs else 0):>9g}"
              f"  {{{show}}}")

    print("\n  -- rejected-value classes (why a non-null is not a value) --")
    for k in PARAMS:
        bad = {c: v for c, v in stats[k].items()
               if c in ("sentinel", "zero-invalid", "out-of-range",
                        "non-integer-floors", "UNREADABLE", "text") and v}
        if bad:
            print(f"    {k:<11}{bad}")

    print("\n=== ⭐ FonMaxEd / FonMaxEdm - BUILDABLE DEPTH ===")
    print(f"  rows carrying a VALID depth: {len(fon_rows)} / {buildable} "
          f"({100*len(fon_rows)/max(buildable,1):.2f}% of buildable rows)")
    print(f"  distinct FonMaxEdm values: "
          f"{sorted(distinct['FonMaxEdm'])[:20]}")
    print(f"  distinct FonMaxEd  values: {sorted(distinct['FonMaxEd'])[:20]}")
    for t, e, a, b in fon_rows[:14]:
        print(f"    {t[:38]:<38} {e[:14]:<14} FonMaxEd={a} FonMaxEdm={b}")

    print("\n=== HEIGHT DATUM (Canarias disambiguates BY SCHEMA) ===")
    for k, v in datum.most_common():
        print(f"  {v:6d}  {100*v/max(buildable,1):5.1f}%  {k}")

    print("\n=== DRAWABILITY TIERS (zone-weighted over BUILDABLE rows) ===")
    for k, v in tiers.most_common():
        print(f"  {v:6d}  {100*v/max(buildable,1):5.1f}%  {k}")
    maxdraw = tiers["complete rule"] + tiers["partial-drawable"]
    print(f"\n  ⭐ MAXIMUM (complete + partial-drawable): {maxdraw}/{buildable} "
          f"({100*maxdraw/max(buildable,1):.1f}%)  [zone-weighted, NOT area]")

    print("\n=== Obs* CONDITIONING (a conditioned value is PARTIAL) ===")
    tot_valid = sum(stats[k]["VALID"] for k in PARAMS)
    print(f"  valid parameter values carrying a non-empty Obs*: "
          f"{obs_cond['_any']}/{tot_valid} "
          f"({100*obs_cond['_any']/max(tot_valid,1):.1f}%)")
    for k in PARAMS:
        if obs_cond[k]:
            print(f"    {k:<11}{obs_cond[k]}")


if __name__ == "__main__":
    main()
