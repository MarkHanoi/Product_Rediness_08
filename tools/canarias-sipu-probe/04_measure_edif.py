#!/usr/bin/env python3
"""C1 - download the seeded sample, open every EDIF table, measure VALID rates.

VALID != non-null. A value is VALID only if it
  (a) parses as a number after decimal-comma normalisation, AND
  (b) survives the per-field plausibility range, AND
  (c) is not a sentinel code (I / COM / NP / T / GRF / ...).

Contradiction checks (brief):
  * 0 in SepMin* is legitimate; 0 in AltMaxPl is NOT
  * PMaxOcup outside 0..100 is a null substitute wearing a number
  * EdifMax above ~20 is implausible
  * SupMin > 0 with FonMin == 0 is geometrically suspect
  * AltMaxPl non-integer (e.g. "7,5") is a METRES value in a FLOORS column

Usage: python 04_measure_edif.py [--sample sample.json]
Writes .data/measurements.json
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
DL = os.path.join(DATA, "zips")
sys.path.insert(0, HERE)
from dbf import read_dbf            # noqa: E402
from mdb import open_mdb, read_table  # noqa: E402

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

# SIPU 2.6.A numeric envelope parameters, with plausibility ranges.
# (lo, hi, zero_ok)  -- zero_ok=False means 0 is a null substitute, not a value.
PARAMS = {
    "SupMin":    (1, 100000, False),   # m2 minimum parcel
    "LongMin":   (1, 500, False),      # m minimum frontage
    "FonMin":    (1, 500, False),      # m minimum depth
    "CircInsc":  (1, 500, False),      # m inscribed circle
    "SepMinFr":  (0, 200, True),       # m setback front  - 0 LEGITIMATE
    "SepMinPs":  (0, 200, True),       # m setback rear   - 0 LEGITIMATE
    "SepMinLt":  (0, 200, True),       # m setback lateral- 0 LEGITIMATE
    "SepMnEdf":  (0, 200, True),       # m between buildings
    "DispOblm":  (0, 200, True),       # m mandatory alignment
    "FonMaxEd":  (1, 500, False),      # BUILDABLE DEPTH (coded/graphic form)
    "FonMaxEdm": (1, 500, False),      # BUILDABLE DEPTH in metres
    "PMaxOcup":  (0, 100, True),       # % coverage
    "EdifMax":   (0.01, 20, False),    # m2/m2 FAR
    "AltMaxPl":  (1, 60, False),       # FLOORS - 0 is NOT legitimate
    "AltMaxMV":  (1, 300, False),      # m height from STREET
    "AltMaxMP":  (1, 300, False),      # m height from PARCEL
}
# Non-numeric sentinel vocabulary observed in SIPU EDIF tables.
SENTINELS = {"I", "COM", "NP", "T", "GRF", "AV", "AV+GRF", "S", "N", "SI", "NO",
             "-", "--", "*", "ND", "NC", "X"}


def norm_num(v):
    """-> (float|None, classification)"""
    if v is None:
        return None, "null"
    s = str(v).strip()
    if s == "":
        return None, "null"
    up = s.upper()
    if up in SENTINELS:
        return None, "sentinel:" + up
    t = s.replace(" ", "")
    t = re.sub(r"(?<=\d)\.(?=\d{3}\b)", "", t)   # thousands dot
    t = t.replace(",", ".")
    m = re.fullmatch(r"[-+]?\d*\.?\d+", t)
    if m:
        try:
            return float(t), "numeric"
        except ValueError:
            pass
    # unit-suffixed numeric: "72 m2c", "9,50 m", "40%", "3 plantas".
    # These ARE parameter values; they are reported separately from bare
    # numerics but they count as VALID once the range check passes.
    m = re.fullmatch(r"[-+]?\d*[.,]?\d+\s*"
                     r"(m2?c?|m²c?|%|pl(?:antas?)?|ml|uds?\.?)\.?",
                     t, re.IGNORECASE)
    if m:
        try:
            return float(re.sub(r"[^\d.\-+]", "", t.replace(",", ".")) or "0"), \
                "numeric-with-unit"
        except ValueError:
            pass
    if re.search(r"\d", s):
        return None, "text-with-number"
    return None, "text"


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "cached"
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=900) as r:
        body = r.read()
    with open(dest, "wb") as f:
        f.write(body)
    return f"http={r.status}"


def open_archive(path, workdir):
    """Return (kind, list_of_member_names, reader(name)->bytes)."""
    if zipfile.is_zipfile(path):
        z = zipfile.ZipFile(path)
        return "zip", z.namelist(), z.read
    # try 7z via bundled 7z if present
    for exe in ("7z", "7za", r"C:\Program Files\7-Zip\7z.exe"):
        if shutil.which(exe) or os.path.exists(exe):
            os.makedirs(workdir, exist_ok=True)
            subprocess.run([exe, "x", "-y", f"-o{workdir}", path],
                           capture_output=True)
            names = []
            for root, _, fs in os.walk(workdir):
                for fn in fs:
                    names.append(os.path.relpath(os.path.join(root, fn),
                                                 workdir))
            return "7z", names, (lambda n: open(os.path.join(workdir, n),
                                                "rb").read())
    return "UNSUPPORTED", [], None


def edif_rows_from_mdb(blob, workdir, tag):
    os.makedirs(workdir, exist_ok=True)
    p = os.path.join(workdir, tag + ".mdb")
    with open(p, "wb") as f:
        f.write(blob)
    db = open_mdb(p)
    tname = None
    for t in db.catalog:
        if t.upper() == "EDIF":
            tname = t
    if not tname:
        return None, list(db.catalog)
    cols, rows = read_table(db, tname)
    return (cols, [r for r in rows if r is not None]), list(db.catalog)


def measure_one(entry):
    """-> dict of findings for one instrument archive."""
    res = {"file": entry["file"], "muni": entry.get("muni"),
           "island": entry.get("island"), "instrument": entry.get("instrument"),
           "year": entry.get("year"), "stratum": entry.get("stratum"),
           "url": entry["url"]}
    os.makedirs(DL, exist_ok=True)
    dest = os.path.join(DL, entry["file"])
    try:
        res["fetch"] = fetch(entry["url"], dest)
        res["bytes"] = os.path.getsize(dest)
    except Exception as e:  # noqa: BLE001
        res["fetch"] = f"ERR {type(e).__name__}: {e}"
        return res
    work = os.path.join(DATA, "work", entry["file"].replace(".", "_"))
    kind, names, read = open_archive(dest, work)
    res["archive"] = kind
    if kind == "UNSUPPORTED":
        res["note"] = "archive format not openable here"
        return res
    res["members"] = len(names)
    up = [n.replace("\\", "/") for n in names]
    res["layers"] = sorted({os.path.splitext(os.path.basename(n))[0].upper()
                            for n in up
                            if os.path.splitext(n)[1].lower() in
                            (".shp", ".mdb", ".gdb")})
    res["has_pdf_only"] = all(n.lower().endswith((".pdf", ".txt", "/"))
                              for n in up if n)
    res["has_edif_shp"] = any(re.search(r"/EDIF\.SHP$", n.upper()) for n in up)
    res["has_edif_dbf"] = any(re.search(r"/EDIF\.DBF$", n.upper()) for n in up)
    res["has_edif_mdb"] = any(re.search(r"/EDIF\.MDB$", n.upper()) for n in up)
    res["has_plan_mdb"] = any(re.search(r"/PLAN\.MDB$", n.upper()) for n in up)
    res["mdbs"] = sorted({os.path.basename(n).upper() for n in up
                          if n.lower().endswith(".mdb")})

    # ---- geometry SCALE / CRS from EDIF.prj + shp bbox --------------------
    prj = [n for n in up if n.upper().endswith("/EDIF.PRJ")]
    if prj:
        try:
            txt = read(names[up.index(prj[0])]).decode("latin-1")
            m = re.search(r'PROJCS\["([^"]+)"', txt) or \
                re.search(r'GEOGCS\["([^"]+)"', txt)
            res["crs"] = m.group(1) if m else txt[:60]
        except Exception as e:  # noqa: BLE001
            res["crs"] = f"ERR {e}"

    # ---- EDIF.dbf (the PUBLISHED polygon attribute table) -----------------
    dbfn = [n for n in up if n.upper().endswith("/EDIF.DBF")]
    if dbfn:
        try:
            blob = read(names[up.index(dbfn[0])])
            flds, rows = read_dbf(io.BytesIO(blob).getvalue())
            res["edif_dbf_fields"] = [f[0] for f in flds]
            res["edif_dbf_rows"] = len(rows)
            res["edif_dbf_numeric_param_fields"] = sorted(
                set(f[0] for f in flds) & set(PARAMS))
            res["etiqueta_values"] = sorted({str(r.get("ETIQUETA"))
                                             for r in rows
                                             if r.get("ETIQUETA")})
            res["etiqueta_counts"] = {}
            for r in rows:
                k = r.get("ETIQUETA")
                if k:
                    res["etiqueta_counts"][k] = \
                        res["etiqueta_counts"].get(k, 0) + 1
        except Exception as e:  # noqa: BLE001
            res["edif_dbf_err"] = f"{type(e).__name__}: {e}"

    # ---- EDIF.mdb (SIPU 2.6.A Archivo de Zonas de Edificacion) ------------
    mdbn = [n for n in up if n.upper().endswith("/EDIF.MDB")]
    if mdbn:
        try:
            blob = read(names[up.index(mdbn[0])])
            got, tables = edif_rows_from_mdb(blob, work, "edif")
            res["mdb_tables"] = tables
            if got is None:
                res["edif_mdb_err"] = "no EDIF table"
            else:
                cols, rows = got
                res["edif_mdb_cols"] = cols
                res["edif_mdb_rows"] = len(rows)
                res["zones"] = []
                stats = {}
                for c in cols:
                    key = next((p for p in PARAMS if p.lower() == c.lower()),
                               None)
                    if key:
                        stats[key] = {"present": 0, "nonnull": 0, "numeric": 0,
                                      "valid": 0, "sentinel": 0,
                                      "text_with_number": 0, "with_unit": 0,
                                      "violations": []}
                for r in rows:
                    zrow = {}
                    lower = {k.lower(): v for k, v in r.items()}
                    zrow["etiqueta"] = lower.get("etiqueta")
                    zrow["nombre"] = lower.get("nombre")
                    for key, (lo, hi, zero_ok) in PARAMS.items():
                        if key not in stats:
                            continue
                        raw = lower.get(key.lower())
                        st = stats[key]
                        st["present"] += 1
                        num, cls = norm_num(raw)
                        if cls != "null":
                            st["nonnull"] += 1
                        if cls.startswith("sentinel"):
                            st["sentinel"] += 1
                        if cls == "text-with-number":
                            st["text_with_number"] += 1
                        if cls == "numeric-with-unit":
                            st["with_unit"] += 1
                        if num is None:
                            zrow[key] = None
                            continue
                        st["numeric"] += 1
                        ok = True
                        if num == 0 and not zero_ok:
                            ok = False
                            st["violations"].append(
                                f"{zrow['etiqueta']}: zero in {key}")
                        elif not (lo <= num <= hi):
                            ok = False
                            st["violations"].append(
                                f"{zrow['etiqueta']}: {key}={num} out of "
                                f"[{lo},{hi}]")
                        if key == "AltMaxPl" and num == int(num) is False:
                            pass
                        if key == "AltMaxPl" and abs(num - round(num)) > 1e-9:
                            ok = False
                            st["violations"].append(
                                f"{zrow['etiqueta']}: AltMaxPl={num} is NOT an "
                                f"integer floor count (metres in floors column)")
                        if ok:
                            st["valid"] += 1
                        zrow[key] = num
                    # cross-field contradiction
                    if (zrow.get("SupMin") or 0) > 0 and zrow.get("FonMin") == 0:
                        stats.setdefault("_cross", {"violations": []})
                        stats["_cross"]["violations"].append(
                            f"{zrow['etiqueta']}: SupMin>0 but FonMin==0")
                    res["zones"].append(zrow)
                res["field_stats"] = stats
        except Exception as e:  # noqa: BLE001
            res["edif_mdb_err"] = f"{type(e).__name__}: {e}"
    return res


def main():
    src = os.path.join(DATA, "sample.json")
    if "--sample" in sys.argv:
        src = os.path.join(DATA, sys.argv[sys.argv.index("--sample") + 1])
    sample = json.load(open(src, encoding="utf-8"))
    out = []
    for i, e in enumerate(sample):
        r = measure_one(e)
        out.append(r)
        print(f"[{i+1}/{len(sample)}] {r['file'][:52]:<52} "
              f"edif_mdb={r.get('has_edif_mdb')} "
              f"rows={r.get('edif_mdb_rows')} {r.get('edif_mdb_err','')}",
              flush=True)
    tag = os.path.basename(src).replace("sample", "measurements")
    with open(os.path.join(DATA, tag), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print("WROTE", tag, len(out))


if __name__ == "__main__":
    main()
