#!/usr/bin/env python3
"""Validate the emitted Madrid extraction JSON.

Checks: file parses; every non-null value carries articulo + apartado;
reports the table-vs-prose ratio and null counts per file and overall.

Usage: python validate.py [extracted_dir]
"""
import glob
import json
import os
import sys

d = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
    "docs", "04-reference", "jurisdictions", "es", "es-md", "28079-madrid", "extracted")

TOT = {"table": 0, "prose": 0, "null": 0, "n": 0, "bad": 0}
for f in sorted(glob.glob(os.path.join(d, "*.json"))):
    data = json.load(open(f, encoding="utf-8"))
    r = data.get("records", [])
    t = sum(1 for x in r if x.get("extractedFrom") == "table")
    p = sum(1 for x in r if x.get("extractedFrom") == "prose")
    n = sum(1 for x in r if x.get("value") is None)
    bad = [x for x in r if x.get("value") is not None
           and not (x["source"].get("articulo") and x["source"].get("apartado"))]
    TOT["table"] += t
    TOT["prose"] += p
    TOT["null"] += n
    TOT["n"] += len(r)
    TOT["bad"] += len(bad)
    print(f"{os.path.basename(f):<18} records={len(r):<4} table={t:<3} prose={p:<3} "
          f"null={n:<3} uncited_non_null={len(bad)}")
    for x in bad:
        print(f"    ! {x['zoneCode']} {x['parameter']} "
              f"art={x['source'].get('articulo')} ap={x['source'].get('apartado')}")

print(f"\nTOTAL records={TOT['n']} table={TOT['table']} prose={TOT['prose']} "
      f"null={TOT['null']} uncited_non_null={TOT['bad']}")
den = TOT["table"] + TOT["prose"]
if den:
    print(f"table:prose = {TOT['table']}:{TOT['prose']} "
          f"({100*TOT['table']/den:.1f}% table / {100*TOT['prose']/den:.1f}% prose)")
sys.exit(1 if TOT["bad"] else 0)
