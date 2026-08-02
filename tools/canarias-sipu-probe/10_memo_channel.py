#!/usr/bin/env python3
"""THE SECOND PARAMETER CHANNEL - Obs*/otrasDet/detUso/DetGral memo fields.

Caught by dumping a row rather than trusting the columns: Vallehermoso's
'Ordenanza A' has AltMaxMP='I' (sentinel, i.e. "no column value") while its
`otrasDet` memo carries

    "Altura en metros : 12 :  # "

So a column-only measurement UNDER-COUNTS the published parameters. This script
measures how much the memo channel adds, and reports LABEL-HITS and
HITS-WITH-A-NUMBER SEPARATELY (the Aragon `densidad`=LIDAR-point-density trap).

Also quantifies the PROBE's own decoding failures so they are never reported as
absent data.
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

MEMO_COLS = ("otrasdet", "detuso", "detgral")
# label -> which envelope quantity it would supply
LABELS = [
    ("AltMaxMP/MV", r"altura\s+en\s+metros|altura\s+m[aá]xima\s+en\s+metros"),
    ("AltMaxPl",    r"n[uú]mero\s+de\s+plantas|altura\s+en\s+plantas|"
                    r"n[ºo]\s*de\s*plantas"),
    ("EdifMax(FAR)", r"edificabilidad(?!\s+total)"),
    ("SupEdif(m2!)", r"superficie\s+edificable"),   # AREA, not FAR - the Aragon `densidad` trap
    ("PMaxOcup",    r"ocupaci[oó]n"),
    ("SepMin*",     r"retranqueo|separaci[oó]n|condiciones\s+de\s+posici[oó]n"),
    ("FonMaxEd",    r"fondo\s+(m[aá]ximo\s+)?edificable|fondo\s+de\s+la\s+edif"),
    ("SupMin",      r"parcela\s+m[ií]nima|superficie\s+m[ií]nima"),
]
CTRL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f-￿]")


def unreadable(v):
    """Cells this PROBE could not decode (access_parser variable-length bug).
    Reported as UNKNOWN, never as absent."""
    if not isinstance(v, str) or not v:
        return False
    return bool(CTRL.search(v))


def main():
    works = sorted(glob.glob(os.path.join(DATA, "work", "*", "edif.mdb")))
    print(f"EDIF.mdb copies on disk: {len(works)}")
    label_hits = Counter()
    number_hits = Counter()
    rows_with_memo = 0
    rows_total = 0
    unread_cells = 0
    unread_rows = 0
    param_cells = 0
    upgrades = defaultdict(int)
    examples = []
    PAR = ["SupMin", "SepMinFr", "FonMaxEd", "FonMaxEdm", "PMaxOcup",
           "EdifMax", "AltMaxPl", "AltMaxMV", "AltMaxMP"]

    for w in works:
        try:
            db = open_mdb(w)
            tn = [t for t in db.catalog if t.upper() == "EDIF"][0]
            cols, rr = read_table(db, tn)
        except Exception:  # noqa: BLE001
            continue
        for row in rr:
            if row is None:
                continue
            rows_total += 1
            low = {k.lower(): v for k, v in row.items()}
            bad = 0
            for p in PAR:
                v = low.get(p.lower())
                param_cells += 1
                if unreadable(v):
                    bad += 1
                    unread_cells += 1
            if bad:
                unread_rows += 1
            memo = " \n ".join(str(low.get(c) or "") for c in MEMO_COLS)
            if not memo.strip():
                continue
            rows_with_memo += 1
            for name, pat in LABELS:
                for m in re.finditer(pat, memo, re.I):
                    label_hits[name] += 1
                    seg = memo[m.start():m.start() + 160]
                    # SIPU memo shape: "Label : value :  # "
                    mm = re.search(r":\s*([0-9]+(?:[.,][0-9]+)?)\s*(?::|#|$)",
                                   seg)
                    if mm:
                        number_hits[name] += 1
                        if len(examples) < 12:
                            examples.append((os.path.basename(
                                os.path.dirname(w))[:34], name,
                                seg.replace("\n", " ")[:70]))
                        # did the COLUMN already have it?
                        colname = {"AltMaxMP/MV": "altmaxmp",
                                   "AltMaxPl": "altmaxpl",
                                   "EdifMax(FAR)": "edifmax",
                                   "PMaxOcup": "pmaxocup",
                                   "FonMaxEd": "fonmaxedm",
                                   "SupMin": "supmin"}.get(name)
                        if colname:
                            cv = str(low.get(colname) or "").strip().upper()
                            if cv in ("I", "COM", "NP", "", "T"):
                                upgrades[name] += 1
                    break

    print(f"\n=== PROBE HONESTY: cells this probe COULD NOT DECODE ===")
    print(f"  envelope-param cells inspected : {param_cells}")
    print(f"  UNREADABLE (access_parser variable-length bug): {unread_cells} "
          f"({100*unread_cells/max(param_cells,1):.2f}%) across {unread_rows} "
          f"rows")
    print("  -> these are UNKNOWN, not absent; they are excluded from the "
          "denominators below.")

    print(f"\n=== THE MEMO CHANNEL ===")
    print(f"  zone rows total: {rows_total};  with a non-empty "
          f"otrasDet/detUso/DetGral memo: {rows_with_memo} "
          f"({100*rows_with_memo/max(rows_total,1):.1f}%)")
    print(f"\n  {'quantity':<14}{'LABEL hits':>12}{'hits WITH A NUMBER':>20}"
          f"{'UPGRADES a sentinel column':>30}")
    for name, _ in LABELS:
        print(f"  {name:<14}{label_hits[name]:>12}{number_hits[name]:>20}"
              f"{upgrades[name]:>30}")
    print("\n  (LABEL hits and hits-WITH-A-NUMBER reported separately: a label "
          "that carries no number is not a parameter.)")
    print("\n  examples:")
    for f, n, s in examples:
        print(f"    {f:<34} {n:<12} {s}")


if __name__ == "__main__":
    main()
