#!/usr/bin/env python3
"""C1 - CANARIAS: the prior probe concluded buildable depth was "0.0% valid,
7,870 sentinels, schema-only" from the column `FonMaxEd`, and its memo-channel
scan used

    ("FonMaxEd", r"fondo\\s+(m[aá]ximo\\s+)?edificable|fondo\\s+de\\s+la\\s+edif")

which is PURE `fondo`. It has NO `profundidad` branch at all, while its own
sibling labels are broad (`retranqueo|separacion|condiciones de posicion`).
The memo channel is a `label : value : #` structure, so an entry reading
`Profundidad edificable : 15 : #` is INVISIBLE to that regex.

THIS SCRIPT DOES NOT EXPAND THE WORDLIST AND RE-GREP. It:
  1. dumps the FULL COLUMN UNION of EVERY table in every sampled .mdb, so a
     depth column under any name is visible whether or not it is in a wordlist;
  2. dumps the FULL MEMO LABEL UNION - every `label :` token that appears on the
     left of a colon in otrasDet/detUso/DetGral - so the vocabulary is DERIVED
     from the corpus rather than assumed;
  3. only THEN applies a depth/height/setback classifier to those unions, and
  4. for anything depth-shaped, reports the VALUE LADDER, because a plausible
     ladder {8,10,12,15,20,25} is the proof and a single distinct value is the
     DFIVIGEN signature and carries nothing.

CONTROLS
  * `FonMaxEdm` (the metric twin, already known 2.3% populated) is the POSITIVE
    control: if this script cannot see FonMaxEdm it is broken, and every zero it
    reports is its own fault rather than the publisher's.
  * decode failures are counted and reported SEPARATELY from absent data.
  * every reported zero is accompanied by the number of rows actually read.

Writes out/c1-canarias-depth-union.json
"""
import io
import json
import os
import re
import sys
import unicodedata
import urllib.request
import zipfile
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "out")
CACHE = os.path.join(HERE, ".cache-canarias")
os.makedirs(OUT, exist_ok=True)
os.makedirs(CACHE, exist_ok=True)

SIPU = r"C:/Users/LENOVO/OneDrive/Desktop/PRYZM/Product_Rediness_08/tools/canarias-sipu-probe"
sys.path.insert(0, SIPU)
from mdb import open_mdb, read_table  # noqa: E402  (tolerant wrapper, read-only use)

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
BASE = "https://opendata.sitcan.es/api/3/action"
SEED = 20260802
N_PKG = int(os.environ.get("N_PKG", "26"))


def deacc(s):
    return "".join(c for c in unicodedata.normalize("NFD", s or "")
                   if unicodedata.category(c) != "Mn")


def api(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def get(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 4096:
        return "cached"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=900) as r:
        body = r.read()
    with open(dest, "wb") as f:
        f.write(body)
    return f"http={r.status}"


# ─────────────────────────────────────────────── the DERIVED classifier
# Applied to column names and to memo labels AFTER the union is dumped.
DEPTH_RE = re.compile(
    r"fond(?:o|aria|ària)|profund(?:idad|itat|idade)|"
    r"\bfon_?max|\bfonmax|\bprof\b|\bpe_?(?:max|edif)|\bfdo\b|\bfondo_", re.I)
HEIGHT_RE = re.compile(
    r"alt(?:ura|ura|ària|aria)|alcada|alçada|cornisa|"
    r"n[uú]m(?:ero)?\s*de\s*plantas|plantes|\baltmax|\bhr\b|\bht\b|\bnp\b", re.I)
SETBACK_RE = re.compile(
    r"retranqueo|retranqueig|reculada|separaci|lindero|llindar|"
    r"\bsepmin|\bra\b|\brf\b|\brm\b|recuo|distancia\s+m[ií]nima", re.I)

# Depth terms that the PRIOR regex could NOT match, for the delta statement.
PRIOR_DEPTH_RE = re.compile(r"fondo\s+(m[aá]ximo\s+)?edificable|fondo\s+de\s+la\s+edif", re.I)

MEMO_COLS = ("otrasdet", "detuso", "detgral", "obs", "observ")
NUM_RE = re.compile(r"(-?\d{1,6}(?:[.,]\d{1,3})?)")


def main():
    report = {"seed": SEED, "errors": []}

    # ── catalogue ──────────────────────────────────────────────────────
    pkgs = []
    try:
        res = api("/package_search?q=planeamiento&rows=1000")
        pkgs = res["result"]["results"]
    except Exception as e:  # noqa: BLE001
        report["errors"].append(f"catalogue: {e}")
    report["packagesFound"] = len(pkgs)

    # resources that look like a SIPU geodatabase delivery
    cands = []
    for p in pkgs:
        for r in p.get("resources", []):
            u = r.get("url") or ""
            fmt = (r.get("format") or "").lower()
            nm = deacc((r.get("name") or "") + " " + (p.get("title") or "")).lower()
            if u.lower().endswith((".zip", ".7z")) or fmt in ("zip", "7z"):
                cands.append({"pkg": p.get("title"), "name": r.get("name"),
                              "url": u, "nm": nm, "size": r.get("size")})
    report["zipResources"] = len(cands)

    import random
    rnd = random.Random(SEED)
    # prefer PGO / NNSS / plan general deliveries, which carry municipality-wide EDIF
    cands.sort(key=lambda c: 0 if re.search(r"\bpgo\b|nnss|plan general|normas subsid", c["nm"]) else 1)
    head = cands[:max(N_PKG * 3, 60)]
    rnd.shuffle(head)
    picks, seen = [], set()
    for c in head:
        k = c["url"].rsplit("/", 1)[-1]
        if k in seen:
            continue
        seen.add(k)
        picks.append(c)
        if len(picks) >= N_PKG:
            break
    report["sampled"] = len(picks)

    # ── open every table, dump the full column union ───────────────────
    col_union = Counter()                    # column name -> tables seen in
    col_tables = defaultdict(set)
    table_union = Counter()
    memo_labels = Counter()                  # derived memo vocabulary
    memo_label_numeric = Counter()
    depth_col_values = defaultdict(Counter)  # depth-shaped column -> value ladder
    depth_memo_values = defaultdict(Counter)
    prior_only = Counter()
    derived_only = Counter()
    files = []
    rows_read = 0
    decode_fail = 0

    for i, c in enumerate(picks, 1):
        tag = re.sub(r"[^A-Za-z0-9]+", "_", c["url"].rsplit("/", 1)[-1])[:60]
        z = os.path.join(CACHE, tag + ".bin")
        rec = {"pkg": c["pkg"], "url": c["url"], "tables": 0, "rows": 0}
        try:
            sys.stderr.write(f"[{i}/{len(picks)}] {c['pkg'][:60]}\n")
            get(c["url"], z)
            if not zipfile.is_zipfile(z):
                rec["st"] = "NOT-A-ZIP (7z/rar unsupported here)"
                decode_fail += 1
                files.append(rec)
                continue
            zf = zipfile.ZipFile(z)
            mdbs = [n for n in zf.namelist() if n.lower().endswith((".mdb", ".accdb"))]
            rec["mdbMembers"] = len(mdbs)
            for mn in mdbs:
                p = os.path.join(CACHE, tag + "_" + os.path.basename(mn))
                if not os.path.exists(p):
                    with open(p, "wb") as f:
                        f.write(zf.read(mn))
                try:
                    db = open_mdb(p)
                except Exception as e:  # noqa: BLE001
                    decode_fail += 1
                    rec.setdefault("mdbErrors", []).append(str(e)[:120])
                    continue
                for tname in db.catalog:
                    if tname.startswith("MSys"):
                        continue
                    table_union[tname.upper()] += 1
                    try:
                        tbl = read_table(db, tname)
                    except Exception as e:  # noqa: BLE001
                        decode_fail += 1
                        continue
                    if not tbl:
                        continue
                    cols = list(tbl.keys())
                    n = max((len(v) for v in tbl.values()), default=0)
                    rec["tables"] += 1
                    rec["rows"] += n
                    rows_read += n
                    for col in cols:
                        col_union[col] += 1
                        col_tables[col].add(tname.upper())
                        # depth-shaped column -> ladder
                        if DEPTH_RE.search(col):
                            for v in tbl[col]:
                                s = ("" if v is None else str(v)).strip()
                                if s:
                                    depth_col_values[col][s[:40]] += 1
                        # memo channel -> derive the label vocabulary
                        if col.lower() in MEMO_COLS or col.lower().startswith("obs"):
                            for v in tbl[col]:
                                if not v:
                                    continue
                                txt = str(v)
                                for m in re.finditer(r"([A-Za-zÁÉÍÓÚÑáéíóúñÀÈÌÒÙàèìòùç \.\-/]{4,60}?)\s*:\s*([^:#\n]{0,40})", txt):
                                    lab = re.sub(r"\s+", " ", m.group(1)).strip()
                                    val = m.group(2).strip()
                                    if len(lab) < 4:
                                        continue
                                    memo_labels[lab] += 1
                                    if NUM_RE.search(val):
                                        memo_label_numeric[lab] += 1
                                    if DEPTH_RE.search(lab):
                                        depth_memo_values[lab][val[:30]] += 1
                                        if PRIOR_DEPTH_RE.search(lab):
                                            prior_only[lab] += 1
                                        else:
                                            derived_only[lab] += 1
            rec["st"] = "OK"
        except Exception as e:  # noqa: BLE001
            rec["st"] = f"ERR {str(e)[:140]}"
            decode_fail += 1
        files.append(rec)

    # ── classify the unions ────────────────────────────────────────────
    def classify(names):
        return {
            "depth": sorted(n for n in names if DEPTH_RE.search(n)),
            "height": sorted(n for n in names if HEIGHT_RE.search(n)),
            "setback": sorted(n for n in names if SETBACK_RE.search(n)),
        }

    report["controls"] = {
        "rowsRead": rows_read,
        "decodeFailures": decode_fail,
        "distinctTables": len(table_union),
        "distinctColumns": len(col_union),
        "POSITIVE_CONTROL_FonMaxEdm_seen": any(c.lower() == "fonmaxedm" for c in col_union),
        "POSITIVE_CONTROL_FonMaxEd_seen": any(c.lower() == "fonmaxed" for c in col_union),
    }
    report["files"] = files
    report["tableUnion"] = table_union.most_common()
    report["columnUnion"] = col_union.most_common()
    report["columnClassified"] = classify(col_union.keys())
    report["memoLabelUnion"] = memo_labels.most_common(300)
    report["memoLabelNumeric"] = memo_label_numeric.most_common(120)
    report["memoLabelClassified"] = classify(memo_labels.keys())
    report["depthColumnLadders"] = {k: v.most_common(40) for k, v in depth_col_values.items()}
    report["depthMemoLadders"] = {k: v.most_common(40) for k, v in depth_memo_values.items()}
    report["depthMemoLabels_matchedByPRIORregex"] = prior_only.most_common()
    report["depthMemoLabels_MISSEDbyPRIORregex"] = derived_only.most_common()

    with open(os.path.join(OUT, "c1-canarias-depth-union.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    print("\n════ CANARIAS depth union ════")
    print(json.dumps(report["controls"], indent=2))
    print(f"\ncolumns classed DEPTH : {report['columnClassified']['depth']}")
    print(f"memo labels classed DEPTH : {report['memoLabelClassified']['depth'][:40]}")
    print(f"\nMISSED by the prior fondo-only regex: {report['depthMemoLabels_MISSEDbyPRIORregex'][:20]}")
    for k, v in report["depthColumnLadders"].items():
        print(f"\nladder {k}: {v[:25]}")
    for k, v in report["depthMemoLadders"].items():
        print(f"\nmemo ladder {k}: {v[:25]}")


if __name__ == "__main__":
    main()
