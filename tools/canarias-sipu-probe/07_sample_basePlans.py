#!/usr/bin/env python3
"""SAMPLE B - one MUNICIPALITY-WIDE base plan per municipality.

Sample A (seeded stratified, n=30) answers "is the schema harmonised across
strata". It is dominated by Modificaciones/Estudios de Detalle that cover a
single parcel. Sample B answers the operational question: for each of the 88
municipalities, does its GOVERNING municipality-wide instrument carry EDIF?

Selection rule (deterministic, no randomness):
  candidates = resources whose NAME begins "Aprobacion Definitiva de ..." and
  names a Plan General de Ordenacion / Normas Subsidiarias of the municipality
  itself, EXCLUDING Modificacion Puntual / Estudio de Detalle / Sentencia /
  Plan Parcial / Plan Especial.  Prefer adaptacion PLENA > PARCIAL > BASICA >
  none, then the LATEST year.
Writes .data/sample_base.json
"""
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
ACC = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")
EXCL = re.compile(
    r"modificacion|estudio de detalle|sentencia|anulacion|plan parcial|"
    r"plan especial|texto refundido de plan parcial|suspension|"
    r"delimitacion de suelo urbano|catalogo|ordenanza", re.I)
INCL = re.compile(r"plan general de ordenacion|normas subsidiarias|"
                  r"proyecto de delimitacion|normas de planeamiento", re.I)
RANK = {"PLENA": 0, "PARCIAL": 1, "BASICA": 2, None: 3}


def main():
    cat = json.load(open(os.path.join(DATA, "classified.json"),
                        encoding="utf-8"))
    by_muni = {}
    for r in cat:
        if not r.get("muni"):
            continue
        nm = (r.get("name") or "").translate(ACC)
        if EXCL.search(nm) or not INCL.search(nm):
            continue
        by_muni.setdefault(r["muni"], []).append(r)

    sample = []
    for m, rs in sorted(by_muni.items()):
        rs.sort(key=lambda r: (RANK.get(r.get("adaptation"), 3),
                               -(r.get("year") or 0)))
        pick = rs[0]
        sample.append({**pick, "stratum": f"BASE|{pick['island']}|{m}",
                       "candidates": len(rs)})
    with open(os.path.join(DATA, "sample_base.json"), "w",
              encoding="utf-8") as f:
        json.dump(sample, f, ensure_ascii=False, indent=1)
    allm = {r["muni"] for r in cat if r.get("muni")}
    print(f"municipalities with any SIPU resource : {len(allm)}")
    print(f"municipalities with a BASE-PLAN candidate: {len(sample)}")
    missing = sorted(allm - set(by_muni))
    print(f"NO base-plan candidate ({len(missing)}): {missing}")
    for s in sample:
        print(f"  {s['muni'][:26]:<27}{str(s['island'])[:14]:<15}"
              f"{str(s.get('adaptation') or '-'):<8}{str(s.get('year') or '?'):<6}"
              f"cand={s['candidates']:<3} {s['file'][:52]}")


if __name__ == "__main__":
    sys.exit(main())
