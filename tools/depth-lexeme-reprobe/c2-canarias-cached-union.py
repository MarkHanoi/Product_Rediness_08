#!/usr/bin/env python3
"""C2 - CANARIAS, incremental: analyse whatever .mdb files C1 has already pulled.

Same question as C1, but it reads the local cache only, so it terminates and can
be re-run as the cache grows. It exists because C1's download leg is slow and
disk-bound, and a partial answer that STATES ITS OWN DENOMINATOR beats waiting.

Reports, per the brief:
  * the FULL column union across every table (so a depth column under any name is
    visible without being on a wordlist)
  * the FULL memo LABEL union from otrasDet/detUso/DetGral - the derived vocabulary
  * for every depth-shaped column or label, the VALUE LADDER
  * the delta between the PRIOR `fondo`-only memo regex and a derived one

CONTROLS
  * FonMaxEdm is the positive control (known ~2.3% populated). If this script
    cannot see it, the script is broken and its zeros are its own.
  * decode failures counted separately from absent data.
  * rows read is printed alongside every zero.
"""
import json
import os
import re
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(HERE, ".cache-canarias")
os.makedirs(OUT, exist_ok=True)

SIPU = r"C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/tools/canarias-sipu-probe"
sys.path.insert(0, SIPU)
from mdb import open_mdb, read_table  # noqa: E402

DEPTH_RE = re.compile(
    r"fond(?:o|aria|ària)|profund(?:idad|itat|idade)|"
    r"fon_?max|fonmax|\bprof\.?\b|pe_?(?:max|edif)|\bfdo\b", re.I)
HEIGHT_RE = re.compile(r"alt(?:ura|ària)|alçada|alcada|cornisa|plantas|plantes|altmax|\brasante\b", re.I)
SETBACK_RE = re.compile(r"retranqueo|retranqueig|reculada|separaci|lindero|llindar|sepmin|recuo", re.I)
PRIOR_MEMO_RE = re.compile(r"fondo\s+(m[aá]ximo\s+)?edificable|fondo\s+de\s+la\s+edif", re.I)

MEMO_COLS = ("otrasdet", "detuso", "detgral")
NUM = re.compile(r"-?\d{1,6}(?:[.,]\d{1,3})?")
SENTINELS = {"I", "COM", "NP", "T", "GRF", "AV", "AV+GRF", "S", "N", "SI", "NO",
             "-", "--", "*", "ND", "NC", "X", ""}

col_union = Counter()
col_tables = defaultdict(set)
table_union = Counter()
memo_labels = Counter()
memo_numeric = Counter()
depth_col_vals = defaultdict(Counter)
depth_memo_vals = defaultdict(Counter)
missed_by_prior = Counter()
caught_by_prior = Counter()
rows_read = 0
decode_fail = 0
files_ok = 0
memo_cells = 0

mdbs = sorted(f for f in os.listdir(CACHE) if f.lower().endswith((".mdb", ".accdb")))
for fn in mdbs:
    p = os.path.join(CACHE, fn)
    try:
        db = open_mdb(p)
    except Exception as e:  # noqa: BLE001
        decode_fail += 1
        print(f"  DECODE-FAIL {fn}: {str(e)[:90]}", file=sys.stderr)
        continue
    files_ok += 1
    for tname in db.catalog:
        if tname.startswith("MSys"):
            continue
        try:
            cols, rows = read_table(db, tname)   # -> (columns, list-of-dict rows)
        except Exception:  # noqa: BLE001
            decode_fail += 1
            continue
        if not cols:
            continue
        table_union[tname.upper()] += 1
        rows_read += len(rows)
        for col in cols:
            col_union[col] += 1
            col_tables[col].add(tname.upper())
            if DEPTH_RE.search(col):
                for r in rows:
                    v = r.get(col)
                    s = ("" if v is None else str(v)).strip()
                    if s.upper() not in SENTINELS:
                        depth_col_vals[col][s[:32]] += 1
            if col.lower() in MEMO_COLS:
                for r in rows:
                    v = r.get(col)
                    if not v:
                        continue
                    memo_cells += 1
                    txt = str(v)
                    for m in re.finditer(
                            r"([A-Za-zÁÉÍÓÚÑÜáéíóúñü \.\-/º°]{4,60}?)\s*:\s*([^:#\n]{0,40})", txt):
                        lab = re.sub(r"\s+", " ", m.group(1)).strip(" .-/")
                        val = m.group(2).strip()
                        if len(lab) < 4:
                            continue
                        memo_labels[lab] += 1
                        if NUM.search(val):
                            memo_numeric[lab] += 1
                        if DEPTH_RE.search(lab):
                            depth_memo_vals[lab][val[:24]] += 1
                            (caught_by_prior if PRIOR_MEMO_RE.search(lab) else missed_by_prior)[lab] += 1


def classed(names):
    return {"depth": sorted(n for n in names if DEPTH_RE.search(n)),
            "height": sorted(n for n in names if HEIGHT_RE.search(n)),
            "setback": sorted(n for n in names if SETBACK_RE.search(n))}


rep = {
    "denominators": {
        "mdbFilesInCache": len(mdbs), "mdbFilesOpened": files_ok,
        "decodeFailures": decode_fail, "rowsRead": rows_read,
        "memoCellsRead": memo_cells,
        "distinctTables": len(table_union), "distinctColumns": len(col_union),
    },
    "POSITIVE_CONTROL": {
        "FonMaxEdm_columnSeen": any(c.lower() == "fonmaxedm" for c in col_union),
        "FonMaxEd_columnSeen": any(c.lower() == "fonmaxed" for c in col_union),
    },
    "tableUnion": table_union.most_common(),
    "columnUnion": col_union.most_common(),
    "columnClassified": classed(col_union.keys()),
    "memoLabelUnion": memo_labels.most_common(250),
    "memoLabelsWithANumber": memo_numeric.most_common(120),
    "memoLabelClassified": classed(memo_labels.keys()),
    "depthColumnLadders": {k: v.most_common(40) for k, v in depth_col_vals.items()},
    "depthMemoLadders": {k: v.most_common(40) for k, v in depth_memo_vals.items()},
    "depthMemoLabels_CAUGHT_by_prior_fondo_regex": caught_by_prior.most_common(),
    "depthMemoLabels_MISSED_by_prior_fondo_regex": missed_by_prior.most_common(),
}
with open(os.path.join(OUT, "c2-canarias-cached-union.json"), "w", encoding="utf-8") as f:
    json.dump(rep, f, ensure_ascii=False, indent=2)

sys.stdout.reconfigure(encoding="utf-8")
print("════ CANARIAS (cached subset) ════")
print(json.dumps(rep["denominators"], indent=2))
print("positive control:", rep["POSITIVE_CONTROL"])
print("\ntables:", [t for t, _ in rep["tableUnion"]][:25])
print("\nCOLUMNS classed DEPTH  :", rep["columnClassified"]["depth"])
print("COLUMNS classed HEIGHT :", rep["columnClassified"]["height"])
print("\nMEMO labels classed DEPTH:", rep["memoLabelClassified"]["depth"])
print("MISSED by prior fondo-only regex:", rep["depthMemoLabels_MISSED_by_prior_fondo_regex"][:25])
print("CAUGHT by prior fondo-only regex:", rep["depthMemoLabels_CAUGHT_by_prior_fondo_regex"][:25])
for k, v in rep["depthColumnLadders"].items():
    print(f"\nCOLUMN ladder {k} (distinct {len(v)}): {v[:28]}")
for k, v in rep["depthMemoLadders"].items():
    print(f"\nMEMO ladder {k}: {v[:28]}")
print("\ntop memo labels:", [l for l, _ in rep["memoLabelUnion"][:45]])
