#!/usr/bin/env python3
"""STEP 2 - fetch the base-plan corpus and extract the EDIF quartet.

Extracts, per municipality:
  EDIF.mdb   the RULE table (SIPU 2.6.A Archivo de Zonas de Edificacion)
  EDIF.dbf   the POLYGON attribute table  (ETIQUETA -> rule join key)
  EDIF.shp   the POLYGON GEOMETRY         <- enables a LAND-WEIGHTED statistic
  EDIF.prj   CRS, so the areas are in metres and not degrees
  IDENTIF.TXT  the only vigencia substitute Canarias publishes
  PLAN.mdb   if it exists at all (the baseline says 0/86)

Writes .data/work/<muni>/ and .data/fetched.json
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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import DATA, UA  # noqa: E402

WANT = ("EDIF.MDB", "EDIF.DBF", "EDIF.SHP", "EDIF.SHX", "EDIF.PRJ",
        "PLAN.MDB", "IDENTIF.TXT")
ZIPS = os.path.join(DATA, "zips")
WORK = os.path.join(DATA, "work")


def slug(s):
    return re.sub(r"[^A-Za-z0-9]+", "_", s or "x").strip("_")[:48]


def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return "cached", os.path.getsize(dest)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=900) as r:
        body = r.read()
        code = r.status
    with open(dest, "wb") as f:
        f.write(body)
    return f"http={code}", len(body)


def members(path, tmp):
    """-> (kind, names, reader) tolerating non-zip archives."""
    if zipfile.is_zipfile(path):
        z = zipfile.ZipFile(path)
        return "zip", z.namelist(), z.read
    for exe in ("7z", "7za", r"C:\Program Files\7-Zip\7z.exe"):
        if shutil.which(exe) or os.path.exists(exe):
            os.makedirs(tmp, exist_ok=True)
            subprocess.run([exe, "x", "-y", f"-o{tmp}", path],
                           capture_output=True)
            names = []
            for root, _, fs in os.walk(tmp):
                for fn in fs:
                    names.append(os.path.relpath(os.path.join(root, fn), tmp))
            if names:
                return "7z", names, (
                    lambda n: open(os.path.join(tmp, n), "rb").read())
    return "UNSUPPORTED", [], None


def main():
    corpus = json.load(open(os.path.join(DATA, "corpus.json"),
                            encoding="utf-8"))
    os.makedirs(ZIPS, exist_ok=True)
    os.makedirs(WORK, exist_ok=True)
    out = []
    for i, c in enumerate(corpus):
        tag = slug(c["muni"])
        rec = {"muni": c["muni"], "tag": tag, "island": c["island"],
               "year": c.get("year"), "adaptation": c.get("adaptation"),
               "file": c["file"], "url": c["url"],
               "candidates": c.get("candidates")}
        dest = os.path.join(ZIPS, c["file"])
        try:
            rec["fetch"], rec["bytes"] = fetch(c["url"], dest)
        except Exception as e:  # noqa: BLE001
            rec["fetch"] = f"ERR {type(e).__name__}: {e}"
            out.append(rec)
            print(f"[{i+1}/{len(corpus)}] {c['muni'][:24]:<25} {rec['fetch']}",
                  flush=True)
            continue
        wd = os.path.join(WORK, tag)
        os.makedirs(wd, exist_ok=True)
        kind, names, read = members(dest, os.path.join(wd, "_raw"))
        rec["archive"] = kind
        rec["members"] = len(names)
        got = []
        for n in names:
            b = os.path.basename(n.replace("\\", "/")).upper()
            if b in WANT:
                try:
                    blob = read(n)
                except Exception:  # noqa: BLE001
                    continue
                with open(os.path.join(wd, b.lower()), "wb") as f:
                    f.write(blob)
                got.append(b)
        rec["extracted"] = sorted(set(got))
        rec["has_edif_mdb"] = "EDIF.MDB" in got
        rec["has_edif_shp"] = "EDIF.SHP" in got
        rec["has_plan_mdb"] = "PLAN.MDB" in got
        rec["mdbs_in_archive"] = sorted({
            os.path.basename(n.replace("\\", "/")).upper()
            for n in names if n.lower().endswith(".mdb")})
        # IDENTIF.TXT -> Modifica= free text (the vigencia substitute)
        ip = os.path.join(wd, "identif.txt")
        if os.path.exists(ip):
            txt = open(ip, "rb").read().decode("latin-1", "replace")
            m = re.search(r"^\s*Modifica\s*=\s*(.*)$", txt, re.I | re.M)
            rec["modifica"] = (m.group(1).strip()[:200] if m else None)
            rec["identif_keys"] = re.findall(r"^\s*([A-Za-z_]+)\s*=", txt,
                                             re.M)[:40]
        shutil.rmtree(os.path.join(wd, "_raw"), ignore_errors=True)
        out.append(rec)
        print(f"[{i+1}/{len(corpus)}] {c['muni'][:24]:<25} {kind:<12}"
              f"mdb={rec['has_edif_mdb']!s:<6}shp={rec['has_edif_shp']!s:<6}"
              f"plan={rec['has_plan_mdb']!s:<6}{rec['fetch']}", flush=True)

    json.dump(out, open(os.path.join(DATA, "fetched.json"), "w",
                        encoding="utf-8"), ensure_ascii=False, indent=1)
    n = len(out)
    print(f"\ncorpus={n}  EDIF.mdb={sum(1 for r in out if r.get('has_edif_mdb'))}"
          f"  EDIF.shp={sum(1 for r in out if r.get('has_edif_shp'))}"
          f"  PLAN.mdb={sum(1 for r in out if r.get('has_plan_mdb'))}")
    print(f"  IDENTIF.TXT with Modifica=: "
          f"{sum(1 for r in out if r.get('modifica'))}")


if __name__ == "__main__":
    main()
