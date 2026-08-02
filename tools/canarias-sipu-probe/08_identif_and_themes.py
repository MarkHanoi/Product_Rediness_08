#!/usr/bin/env python3
"""C3/C4 - what the ARCHIVES carry that the CATALOGUE does not.

1. IDENTIF.TXT  -> Modifica= / Desarrolla= / Ambito= / FaseTramitacion=
   The catalogue publishes PHASE but NOT SUPERSESSION. IDENTIF.TXT has
   `Modifica=` and `Desarrolla=` fields - i.e. the supersession/derivation
   EDGES - and `Ambito=Total|Parcial`, i.e. whether the instrument is
   municipality-wide. Measure how often they are POPULATED.
2. Schema inventory for EVERY thematic .mdb (EDIF/USOS/ZUSO/RUS/GES/DES/CAT/
   SUSP/ADS), not just EDIF.
3. CRS + geometry extent from EDIF.prj/.shp (scale is itself a ceiling).
4. Any field anywhere named like vigencia/validity/supersession.
"""
import glob
import json
import os
import re
import struct
import sys
import zipfile
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
sys.path.insert(0, HERE)
from mdb import open_mdb, table_columns  # noqa: E402

VIG = re.compile(r"vigen|valid|derog|superse|sustitu|estado|fecha|activo|"
                 r"situacion|tramit|suspen", re.I)


def shp_bbox(blob):
    if len(blob) < 100:
        return None
    xmin, ymin, xmax, ymax = struct.unpack("<4d", blob[36:68])
    return [round(v, 1) for v in (xmin, ymin, xmax, ymax)]


def main():
    zips = sorted(glob.glob(os.path.join(DATA, "zips", "*.zip"))) + \
        sorted(glob.glob(os.path.join(DATA, "*.zip")))
    print(f"archives on disk: {len(zips)}")

    idf_fields = Counter()
    idf_pop = Counter()
    n_idf = 0
    ambito = Counter()
    fase = Counter()
    modifica_examples = []
    desarrolla_examples = []
    theme_cols = defaultdict(Counter)
    theme_seen = Counter()
    theme_tables = defaultdict(Counter)
    crs = Counter()
    vig_hits = Counter()
    extents = []

    for zp in zips:
        try:
            z = zipfile.ZipFile(zp)
        except Exception:  # noqa: BLE001
            continue
        names = z.namelist()
        up = [n.replace("\\", "/") for n in names]

        # --- IDENTIF.TXT ---
        idn = [n for n in up if n.upper().endswith("IDENTIF.TXT")]
        if idn:
            n_idf += 1
            txt = z.read(names[up.index(idn[0])]).decode("latin-1")
            kv = {}
            for line in txt.splitlines():
                if "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    kv[k] = v.strip()
                    idf_fields[k] += 1
                    if v.strip():
                        idf_pop[k] += 1
            ambito[kv.get("Ámbito") or kv.get("Ambito") or "<absent>"] += 1
            fase[kv.get("FaseTramitación") or kv.get("FaseTramitacion")
                 or "<absent>"] += 1
            if kv.get("Modifica"):
                modifica_examples.append((os.path.basename(zp),
                                          kv["Modifica"][:90]))
            if kv.get("Desarrolla"):
                desarrolla_examples.append((os.path.basename(zp),
                                            kv["Desarrolla"][:90]))

        # --- CRS + extent ---
        prjs = [n for n in up if n.upper().endswith(".PRJ")]
        if prjs:
            t = z.read(names[up.index(prjs[0])]).decode("latin-1")
            m = re.search(r'PROJCS\["([^"]+)"', t) or \
                re.search(r'GEOGCS\["([^"]+)"', t)
            crs[m.group(1) if m else t[:40]] += 1
        eshp = [n for n in up if n.upper().endswith("/EDIF.SHP")]
        if eshp:
            bb = shp_bbox(z.read(names[up.index(eshp[0])]))
            if bb:
                extents.append((os.path.basename(zp), bb,
                                round(bb[2] - bb[0], 1),
                                round(bb[3] - bb[1], 1)))

        # --- every thematic .mdb ---
        for n in up:
            if not n.lower().endswith(".mdb"):
                continue
            theme = os.path.splitext(os.path.basename(n))[0].upper()
            theme_seen[theme] += 1
            tmp = os.path.join(DATA, "_tmp.mdb")
            try:
                with open(tmp, "wb") as f:
                    f.write(z.read(names[up.index(n)]))
                db = open_mdb(tmp)
                tabs = [t for t in db.catalog if not t.startswith("MSys")]
                theme_tables[theme][len(tabs)] += 1
                for t in tabs:
                    try:
                        for c, _ty in table_columns(db, t):
                            theme_cols[theme][c.lower()] += 1
                            if VIG.search(c):
                                vig_hits[f"{theme}.{t}.{c}"] += 1
                    except Exception:  # noqa: BLE001
                        pass
            except Exception:  # noqa: BLE001
                pass

    print(f"\n=== C3 IDENTIF.TXT ({n_idf} archives carry it) ===")
    print(f"{'field':<22}{'present':>9}{'POPULATED':>11}")
    for k, v in idf_fields.most_common():
        print(f"  {k[:20]:<20}{v:>9}{idf_pop[k]:>11}"
              f"  ({100*idf_pop[k]/max(v,1):.0f}%)")
    print("\n  Ámbito distribution (municipality-wide vs parcel-scoped):")
    for k, v in ambito.most_common():
        print(f"    {v:5d}  {k}")
    print("\n  FaseTramitación distribution:")
    for k, v in fase.most_common(12):
        print(f"    {v:5d}  {k}")
    print(f"\n  ⭐ SUPERSESSION EDGES: Modifica= populated in "
          f"{len(modifica_examples)}/{n_idf}; Desarrolla= in "
          f"{len(desarrolla_examples)}/{n_idf}")
    for f, v in modifica_examples[:8]:
        print(f"    Modifica   {f[:34]:<34} {v}")
    for f, v in desarrolla_examples[:8]:
        print(f"    Desarrolla {f[:34]:<34} {v}")

    print("\n=== C1.3b THEMATIC .mdb INVENTORY ===")
    for th, cnt in theme_seen.most_common():
        tabs = theme_tables[th]
        print(f"\n  {th}  in {cnt} archives  tables-per-file={dict(tabs)}")
        top = theme_cols[th].most_common(14)
        print(f"    top fields: {[c for c,_ in top]}")

    print("\n=== VALIDITY / SUPERSESSION-LOOKING FIELDS ANYWHERE IN THE MDBs ===")
    if not vig_hits:
        print("  NONE. (searched vigen|valid|derog|superse|sustitu|estado|"
              "fecha|activo|situacion|tramit|suspen across every column of "
              "every table of every .mdb)")
    for k, v in vig_hits.most_common(30):
        print(f"  {v:4d}  {k}")

    print("\n=== CRS (scale ceiling check) ===")
    for k, v in crs.most_common():
        print(f"  {v:4d}  {k}")
    print("\n  EDIF.shp extents (metres, projected):")
    for f, bb, w, h in extents[:12]:
        print(f"    {f[:44]:<44} {w:>10.1f} x {h:>10.1f} m")


if __name__ == "__main__":
    main()
