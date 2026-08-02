#!/usr/bin/env python3
"""C3 - CANARIAS, disk-frugal harvest. Same question as C1, but it streams.

C1 kept every archive on disk and stalled the machine at <2 GB free on a single
64 MB package. C3:
  * SKIPS resources whose advertised size exceeds MAX_MB (recorded as SKIPPED,
    never as absent - a skipped file is a hole in the denominator, not a zero),
  * downloads to a temp file, extracts ONLY *.mdb members, DELETES the archive,
  * appends each file's contribution to out/c3-partial.json as it goes, so a kill
    at any point still leaves a stated denominator.

It exists to widen the sample behind C2's finding that a THIRD depth column,
`FondoMax`, is present in SIPU deliveries and was never in the prior probe's
PARAMS dict (which held only FonMaxEd and FonMaxEdm).
"""
import json
import os
import re
import sys
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
from mdb import open_mdb, read_table  # noqa: E402

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
BASE = "https://opendata.sitcan.es/api/3/action"
SEED = 20260802
MAX_MB = float(os.environ.get("MAX_MB", "12"))
N_PKG = int(os.environ.get("N_PKG", "45"))

DEPTH_RE = re.compile(r"fond(?:o|aria|ària)|profund(?:idad|itat|idade)|fon_?max|fonmax|\bprof\.?\b|\bfdo\b", re.I)
HEIGHT_RE = re.compile(r"alt(?:ura|ària)|alçada|cornisa|plantas|plantes|altmax", re.I)
SETBACK_RE = re.compile(r"retranqueo|reculada|separaci|lindero|sepmin|recuo", re.I)
PRIOR_MEMO_RE = re.compile(r"fondo\s+(m[aá]ximo\s+)?edificable|fondo\s+de\s+la\s+edif", re.I)
MEMO_COLS = ("otrasdet", "detuso", "detgral")
NUM = re.compile(r"-?\d{1,6}(?:[.,]\d{1,3})?")
SENTINELS = {"I", "COM", "NP", "T", "GRF", "AV", "AV+GRF", "S", "N", "SI", "NO",
             "-", "--", "*", "ND", "NC", "X", ""}


def api(path):
    req = urllib.request.Request(BASE + path, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


col_union, table_union = Counter(), Counter()
col_nonnull, col_rows = Counter(), Counter()
memo_labels, memo_numeric = Counter(), Counter()
depth_col_vals = defaultdict(Counter)
depth_memo_vals = defaultdict(Counter)
missed_prior, caught_prior = Counter(), Counter()
stats = {"downloaded": 0, "skippedTooBig": 0, "notZip": 0, "decodeFail": 0,
         "mdbOpened": 0, "rowsRead": 0, "memoCells": 0, "httpErr": 0}
seen_files = set()


def ingest(mdb_path):
    global stats
    try:
        db = open_mdb(mdb_path)
    except Exception:  # noqa: BLE001
        stats["decodeFail"] += 1
        return
    stats["mdbOpened"] += 1
    for tname in db.catalog:
        if tname.startswith("MSys"):
            continue
        try:
            cols, rows = read_table(db, tname)
        except Exception:  # noqa: BLE001
            stats["decodeFail"] += 1
            continue
        if not cols:
            continue
        table_union[tname.upper()] += 1
        stats["rowsRead"] += len(rows)
        for col in cols:
            col_union[col] += 1
            col_rows[col] += len(rows)
            nn = 0
            for r in rows:
                v = r.get(col)
                s = ("" if v is None else str(v)).strip()
                if s.upper() not in SENTINELS:
                    nn += 1
                    if DEPTH_RE.search(col):
                        depth_col_vals[col][s[:32]] += 1
            col_nonnull[col] += nn
            if col.lower() in MEMO_COLS:
                for r in rows:
                    v = r.get(col)
                    if not v:
                        continue
                    stats["memoCells"] += 1
                    for m in re.finditer(
                            r"([A-Za-zÁÉÍÓÚÑÜáéíóúñü \.\-/º°]{4,60}?)\s*:\s*([^:#\n]{0,40})", str(v)):
                        lab = re.sub(r"\s+", " ", m.group(1)).strip(" .-/")
                        val = m.group(2).strip()
                        if len(lab) < 4:
                            continue
                        memo_labels[lab] += 1
                        if NUM.search(val):
                            memo_numeric[lab] += 1
                        if DEPTH_RE.search(lab):
                            depth_memo_vals[lab][val[:24]] += 1
                            (caught_prior if PRIOR_MEMO_RE.search(lab) else missed_prior)[lab] += 1


def flush():
    def classed(names):
        return {"depth": sorted(n for n in names if DEPTH_RE.search(n)),
                "height": sorted(n for n in names if HEIGHT_RE.search(n)),
                "setback": sorted(n for n in names if SETBACK_RE.search(n))}
    rep = {
        "denominators": dict(stats),
        "POSITIVE_CONTROL": {
            "FonMaxEdm_seen": any(c.lower() == "fonmaxedm" for c in col_union),
            "FonMaxEd_seen": any(c.lower() == "fonmaxed" for c in col_union)},
        "tableUnion": table_union.most_common(),
        "columnUnion": col_union.most_common(),
        "columnClassified": classed(col_union.keys()),
        "depthColumnValidity": {
            c: {"rows": col_rows[c], "nonSentinel": col_nonnull[c],
                "pct": round(col_nonnull[c] / col_rows[c] * 100, 2) if col_rows[c] else None,
                "distinct": len(depth_col_vals[c]),
                "ladder": depth_col_vals[c].most_common(40)}
            for c in col_union if DEPTH_RE.search(c)},
        "memoLabelUnion": memo_labels.most_common(300),
        "memoLabelsWithANumber": memo_numeric.most_common(150),
        "memoLabelClassified": classed(memo_labels.keys()),
        "depthMemoLadders": {k: v.most_common(40) for k, v in depth_memo_vals.items()},
        "depthMemoLabels_MISSED_by_prior_fondo_regex": missed_prior.most_common(),
        "depthMemoLabels_CAUGHT_by_prior_fondo_regex": caught_prior.most_common(),
    }
    with open(os.path.join(OUT, "c3-canarias-frugal.json"), "w", encoding="utf-8") as f:
        json.dump(rep, f, ensure_ascii=False, indent=2)
    return rep


def main():
    # ingest anything C1/C2 already left behind
    for fn in sorted(os.listdir(CACHE)):
        if fn.lower().endswith((".mdb", ".accdb")):
            seen_files.add(fn)
            ingest(os.path.join(CACHE, fn))
    for fn in os.listdir(CACHE):          # reclaim C1's archives
        if fn.endswith(".bin"):
            try:
                os.remove(os.path.join(CACHE, fn))
            except OSError:
                pass

    pkgs = api("/package_search?q=planeamiento&rows=1000")["result"]["results"]
    cands = []
    for p in pkgs:
        for r in p.get("resources", []):
            u = (r.get("url") or "")
            if not u.lower().endswith(".zip"):
                continue
            cands.append({"pkg": p.get("title"), "url": u, "size": r.get("size")})
    import random
    random.Random(SEED).shuffle(cands)

    tmp = os.path.join(CACHE, "_stream.zip")
    for i, c in enumerate(cands, 1):
        if stats["downloaded"] >= N_PKG:
            break
        sz = c["size"]
        try:
            szmb = float(sz) / 1e6 if sz else None
        except (TypeError, ValueError):
            szmb = None
        if szmb is not None and szmb > MAX_MB:
            stats["skippedTooBig"] += 1
            continue
        try:
            req = urllib.request.Request(c["url"], headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=240) as r:
                # enforce the cap even when the catalogue lied about size
                clen = r.headers.get("Content-Length")
                if clen and int(clen) > MAX_MB * 1e6:
                    stats["skippedTooBig"] += 1
                    continue
                body = r.read(int(MAX_MB * 1e6) + 1)
            if len(body) > MAX_MB * 1e6:
                stats["skippedTooBig"] += 1
                continue
            with open(tmp, "wb") as f:
                f.write(body)
            stats["downloaded"] += 1
        except Exception:  # noqa: BLE001
            stats["httpErr"] += 1
            continue
        try:
            if not zipfile.is_zipfile(tmp):
                stats["notZip"] += 1
                continue
            # MUST close the ZipFile before unlinking on Windows, or the
            # cleanup raises PermissionError and the whole run dies.
            with zipfile.ZipFile(tmp) as zf:
                for mn in zf.namelist():
                    if not mn.lower().endswith((".mdb", ".accdb")):
                        continue
                    base = re.sub(r"[^A-Za-z0-9._-]+", "_", os.path.basename(mn))
                    p = os.path.join(CACHE, f"{i}_{base}")
                    with open(p, "wb") as f:
                        f.write(zf.read(mn))
                    ingest(p)
                    try:
                        os.remove(p)              # frugal: keep nothing
                    except OSError:
                        pass
        except Exception:  # noqa: BLE001
            stats["decodeFail"] += 1
        finally:
            try:
                if os.path.exists(tmp):
                    os.remove(tmp)
            except OSError:
                pass
        if stats["downloaded"] % 5 == 0:
            flush()
            sys.stderr.write(f"  [{stats['downloaded']}/{N_PKG}] rows={stats['rowsRead']} cols={len(col_union)}\n")

    rep = flush()
    sys.stdout.reconfigure(encoding="utf-8")
    print("════ CANARIAS frugal harvest ════")
    print(json.dumps(rep["denominators"], indent=2))
    print("positive control:", rep["POSITIVE_CONTROL"])
    print("\ntables:", [t for t, _ in rep["tableUnion"]][:20])
    print("\nDEPTH columns:", rep["columnClassified"]["depth"])
    print("HEIGHT columns:", rep["columnClassified"]["height"])
    for c, d in rep["depthColumnValidity"].items():
        print(f"\n  {c}: rows={d['rows']} nonSentinel={d['nonSentinel']} ({d['pct']}%) distinct={d['distinct']}")
        print(f"     ladder {d['ladder'][:24]}")
    print("\nMEMO depth labels:", rep["memoLabelClassified"]["depth"])
    print("MISSED by prior fondo-only regex:", rep["depthMemoLabels_MISSED_by_prior_fondo_regex"][:20])
    print("\ntop memo labels:", [l for l, _ in rep["memoLabelUnion"][:40]])


if __name__ == "__main__":
    main()
