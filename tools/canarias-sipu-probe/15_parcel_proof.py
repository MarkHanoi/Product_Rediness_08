#!/usr/bin/env python3
"""GATE 1 - ONE PARCEL, END TO END. Telde (35026, Gran Canaria).

parcel -> EDIF zone polygon -> ETIQUETA -> EDIF.mdb rule row -> ENVELOPE.

Pure-python: minimal .shp polygon reader + point-in-polygon + Catastro INSPIRE
parcel fetch. No external geo deps.

⛔ This proves the CHAIN, not the region. R and P are reported separately and
the island-plan ceiling is stated in missing_constraints.
"""
import io
import json
import math
import os
import re
import struct
import sys
import urllib.parse
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
sys.path.insert(0, HERE)
from dbf import read_dbf            # noqa: E402
from mdb import open_mdb, read_table  # noqa: E402

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
ZIP = os.path.join(DATA, "telde_pgo.zip")


def read_shp_polygons(blob):
    """-> list of (bbox, [rings]) for shapeType 5 (Polygon)."""
    out = []
    pos = 100
    n = len(blob)
    while pos + 8 <= n:
        _num, clen = struct.unpack(">II", blob[pos:pos + 8])
        pos += 8
        rec = blob[pos:pos + clen * 2]
        pos += clen * 2
        if len(rec) < 4:
            break
        st = struct.unpack("<I", rec[0:4])[0]
        if st != 5:
            out.append(None)
            continue
        box = struct.unpack("<4d", rec[4:36])
        nparts, npoints = struct.unpack("<II", rec[36:44])
        parts = struct.unpack(f"<{nparts}I", rec[44:44 + 4 * nparts])
        po = 44 + 4 * nparts
        pts = struct.unpack(f"<{2*npoints}d", rec[po:po + 16 * npoints])
        rings = []
        for i in range(nparts):
            s = parts[i]
            e = parts[i + 1] if i + 1 < nparts else npoints
            rings.append([(pts[2 * j], pts[2 * j + 1]) for j in range(s, e)])
        out.append((box, rings))
    return out


def pip(x, y, rings):
    inside = False
    for r in rings:
        for i in range(len(r) - 1):
            x1, y1 = r[i]
            x2, y2 = r[i + 1]
            if (y1 > y) != (y2 > y):
                xin = (x2 - x1) * (y - y1) / (y2 - y1 + 1e-18) + x1
                if x < xin:
                    inside = not inside
    return inside


def ring_area(r):
    a = 0.0
    for i in range(len(r) - 1):
        a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return abs(a) / 2


def utm28(lon, lat):
    a, f = 6378137.0, 1 / 298.257223563
    e2 = f * (2 - f)
    k0, lon0 = 0.9996, math.radians(-15.0)
    p, l = math.radians(lat), math.radians(lon)
    nu = a / math.sqrt(1 - e2 * math.sin(p) ** 2)
    t = math.tan(p) ** 2
    c = e2 / (1 - e2) * math.cos(p) ** 2
    A = (l - lon0) * math.cos(p)
    e4, e6 = e2 * e2, e2 ** 3
    M = a * ((1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * p
             - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * math.sin(2 * p)
             + (15 * e4 / 256 + 45 * e6 / 1024) * math.sin(4 * p)
             - (35 * e6 / 3072) * math.sin(6 * p))
    x = k0 * nu * (A + (1 - t + c) * A ** 3 / 6
                   + (5 - 18 * t + t * t + 72 * c - 58 * e2 / (1 - e2))
                   * A ** 5 / 120) + 500000
    y = k0 * (M + nu * math.tan(p) * (A * A / 2 + (5 - t + 9 * c + 4 * c * c)
              * A ** 4 / 24 + (61 - 58 * t + t * t + 600 * c
                               - 330 * e2 / (1 - e2)) * A ** 6 / 720))
    return x, y


def catastro_parcel(x, y):
    """Catastro INSPIRE CadastralParcel WFS by bbox (EPSG:25828/32628 both
    tried). Returns (refcat, area_m2, raw) or None. A ZERO HERE IS A FINDING,
    not a silent skip."""
    base = ("https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=WFS&"
            "version=2.0.0&request=GetFeature&"
            "TypeNames=cp:CadastralParcel&srsName=EPSG:{crs}&"
            "bbox={bb},EPSG:{crs}")
    for crs in (25828, 32628, 4326):
        if crs == 4326:
            continue
        bb = f"{x-60},{y-60},{x+60},{y+60}"
        u = base.format(crs=crs, bb=bb)
        req = urllib.request.Request(u, headers={"User-Agent": UA})
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                t = r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"    catastro crs={crs}: {type(e).__name__}: {e}")
            continue
        if "Exception" in t:
            print(f"    catastro crs={crs} EXCEPTION: "
                  f"{re.sub(r'[ \t]+',' ',t)[:220]}")
            continue
        refs = re.findall(r"<cp:nationalCadastralReference>([^<]+)<", t)
        areas = re.findall(r"<cp:areaValue[^>]*>([0-9.]+)<", t)
        print(f"    catastro crs={crs}: bytes={len(t)} parcels={len(refs)}")
        if refs:
            return refs[0], (float(areas[0]) if areas else None), t
    return None


def main():
    if not os.path.exists(ZIP):
        print("Telde archive not on disk")
        return 1
    z = zipfile.ZipFile(ZIP)
    up = [n.replace("\\", "/") for n in z.namelist()]
    shp = z.read(z.namelist()[up.index(
        [n for n in up if n.upper().endswith("/EDIF.SHP")][0])])
    dbfb = z.read(z.namelist()[up.index(
        [n for n in up if n.upper().endswith("/EDIF.DBF")][0])])
    polys = read_shp_polygons(shp)
    _f, attrs = read_dbf(dbfb)
    print(f"Telde EDIF: {len(polys)} polygons, {len(attrs)} attribute rows")

    # rule table
    mp = os.path.join(DATA, "telde_pgo", "02SIST", "TMP", "EDIF.mdb")
    db = open_mdb(mp)
    tn = [t for t in db.catalog if t.upper() == "EDIF"][0]
    _c, rules = read_table(db, tn)
    rules = [r for r in rules if r]
    byet = {}
    for r in rules:
        low = {k.lower(): v for k, v in r.items()}
        byet[str(low.get("etiqueta") or "").strip()] = low
    print(f"Telde EDIF.mdb rule rows: {len(rules)}  "
          f"distinct ETIQUETA: {len(byet)}")

    # pick the LARGEST polygon whose ETIQUETA has a numerically complete rule
    best = None
    for i, p in enumerate(polys):
        if not p or i >= len(attrs):
            continue
        et = str(attrs[i].get("ETIQUETA") or "").strip()
        rl = byet.get(et)
        if not rl:
            continue
        def nv(k):
            v = str(rl.get(k) or "").strip().replace(",", ".")
            return float(v) if re.fullmatch(r"\d*\.?\d+", v) else None
        if nv("altmaxpl") and (nv("pmaxocup") or nv("fonmaxedm")):
            a = sum(ring_area(r) for r in p[1])
            if not best or a > best[0]:
                best = (a, i, et, rl)
    if not best:
        print("no polygon with a drawable rule")
        return 1
    area, idx, et, rl = best
    box, rings = polys[idx]
    cx = sum(pt[0] for pt in rings[0]) / len(rings[0])
    cy = sum(pt[1] for pt in rings[0]) / len(rings[0])
    print(f"\nCHOSEN ZONE POLYGON #{idx}  ETIQUETA={et}  area={area:,.0f} m2")
    print(f"  centroid UTM28N = ({cx:.1f}, {cy:.1f})")
    print(f"  ETIPLAN={attrs[idx].get('ETIPLAN')}  "
          f"TXTPLAN={str(attrs[idx].get('TXTPLAN'))[:80]}")

    def nv(k):
        v = str(rl.get(k) or "").strip().replace(",", ".")
        return float(v) if re.fullmatch(r"\d*\.?\d+", v) else None

    print("\n  RULE ROW (source: 02SIST/TMP/EDIF.mdb, table EDIF):")
    for k in ("supmin", "sepminfr", "sepminps", "sepminlt", "fonmaxed",
              "fonmaxedm", "pmaxocup", "edifmax", "altmaxpl", "altmaxmv",
              "altmaxmp"):
        print(f"    {k:<10} raw={str(rl.get(k))!r:<10} parsed={nv(k)}")

    # --- Catastro parcel ------------------------------------------------
    print("\n  CATASTRO PARCEL LOOKUP at the zone centroid:")
    par = catastro_parcel(cx, cy)
    if par:
        ref, parea, _raw = par
        print(f"    refcat={ref} area={parea} m2")
    else:
        ref, parea = None, None
        print("    NO PARCEL RETURNED - recorded as UNKNOWN, not absent.")

    # --- ENVELOPE -------------------------------------------------------
    floors = nv("altmaxpl")
    ocup = nv("pmaxocup")
    depth = nv("fonmaxedm")
    h_par = nv("altmaxmp")
    h_str = nv("altmaxmv")
    datum = ("AltMaxMP (from PARCEL)" if h_par else
             "AltMaxMV (from STREET)" if h_str else
             "NONE - floors only, no metric datum")
    height = h_par or h_str
    plot = parea or area
    env = {
        "municipality": "Telde", "ine": "35026", "island": "Gran Canaria",
        "instrument": "PGO Adaptacion Plena al D.L. 1/2000, Aprobacion "
                      "Definitiva (IDENTIF.TXT FechaCierre 19_01_2009)",
        "sipu_archive": "030319-pgo-ad-itpu-150323-210504-sipu.zip",
        "ETIQUETA": et, "ETIPLAN": attrs[idx].get("ETIPLAN"),
        "parcel_refcat": ref, "parcel_area_m2": parea,
        "parameters": {
            "AltMaxPl": {"value": floors, "source": "EDIF.mdb/EDIF.AltMaxPl",
                         "unit": "plantas"},
            "PMaxOcup": {"value": ocup, "source": "EDIF.mdb/EDIF.PMaxOcup",
                         "unit": "%"},
            "FonMaxEdm": {"value": depth,
                          "source": "EDIF.mdb/EDIF.FonMaxEdm", "unit": "m"},
            "EdifMax": {"value": nv("edifmax"),
                        "source": "EDIF.mdb/EDIF.EdifMax", "unit": "m2/m2"},
            "AltMaxMP": {"value": h_par, "source": "EDIF.mdb/EDIF.AltMaxMP",
                         "unit": "m", "datum": "PARCEL"},
            "AltMaxMV": {"value": h_str, "source": "EDIF.mdb/EDIF.AltMaxMV",
                         "unit": "m", "datum": "STREET"},
        },
        "height_datum_used": datum,
        "geometry_method": ("occupation-ratio footprint x height"
                            if ocup else "depth-from-alignment x height"),
        "footprint_m2": (plot * ocup / 100.0) if (ocup and plot) else None,
        "height_m": height,
        "storeys": floors,
        "open_top": height is None,
        "open_top_reason": (None if height else
                            "ADR-0293: no metric height served for this zone; "
                            "AltMaxMV and AltMaxMP are both sentinel 'NP'. "
                            "Storey count is served but the storey module is "
                            "not, so no metric top may be asserted."),
        "missing_constraints": [
            "ISLAND PLAN (Plan Insular de Ordenacion de Gran Canaria) - sits "
            "ABOVE municipal determinations, same class as Balears PTI. "
            "UNMODELLED. Can only REDUCE, never over-grant.",
            "heritage (CAT.mdb catalogue present but not applied)",
            "flood", "airport", "coastal (Ley de Costas)", "environmental",
            "Ambitos en suspension (SUSP layer published but not applied)",
        ],
        "limitations": [
            "R (routing) is NOT proven: idecan2 Planeamiento WMS advertises "
            "EDIF/ZUSO/CLA but returns BLANK tiles and zero GetFeatureInfo "
            "records at every tested point INCLUDING an ocean control; WFS is "
            "administratively disabled (msWFSDispatch ows_enable_request). "
            "The zone->parcel join here was done LOCALLY from the SIPU "
            "shapefile, not through a published routing service.",
            "Telde holds more than one base instrument (TIER B): the "
            "catalogue publishes PHASE but not SUPERSESSION, so 'current' is "
            "asserted from IDENTIF.TXT FechaCierre, not proven.",
        ],
    }
    print("\n=== ENVELOPE ===")
    print(json.dumps(env, ensure_ascii=False, indent=1))
    with open(os.path.join(DATA, "parcel_proof.json"), "w",
              encoding="utf-8") as f:
        json.dump(env, f, ensure_ascii=False, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
