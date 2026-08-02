#!/usr/bin/env python3
"""Dependency-free readers for the SIPU polygon layer: .dbf attributes + .shp
polygon AREA.

Why area matters: LAND-WEIGHTING IS NOT DECORATIVE. In Balears the top 1% of
zone records governed 32.0% of buildable land. A zone-weighted rate and a
land-weighted rate are different statistics and must be labelled as such.

The .shp reader is deliberately narrow: shape type 5 (Polygon) only, signed
shoelace so that interior rings (clockwise, negative) subtract from exterior
rings (counter-clockwise, positive). Anything else is reported, never guessed.
"""
import struct


# --------------------------------------------------------------------------
def read_dbf(path_or_bytes, encoding="cp1252"):
    if isinstance(path_or_bytes, (bytes, bytearray)):
        b = bytes(path_or_bytes)
    else:
        with open(path_or_bytes, "rb") as f:
            b = f.read()
    if len(b) < 32:
        return [], []
    nrec, hlen, rlen = struct.unpack("<IHH", b[4:12])
    fields, off = [], 32
    while off < hlen - 1 and b[off] != 0x0D:
        raw = b[off:off + 32]
        if len(raw) < 32:
            break
        fields.append((raw[0:11].split(b"\x00")[0].decode("latin-1").strip(),
                       chr(raw[11]), raw[16], raw[17]))
        off += 32
    rows, pos = [], hlen
    for _ in range(nrec):
        rec = b[pos:pos + rlen]
        pos += rlen
        if len(rec) < rlen:
            break
        if rec[0:1] == b"*":
            continue
        p, r = 1, {}
        for (name, ftype, flen, fdec) in fields:
            s = rec[p:p + flen].decode(encoding, "replace").strip()
            p += flen
            if ftype in ("N", "F"):
                if s in ("", "-", ".", "*"):
                    r[name] = None
                else:
                    try:
                        r[name] = float(s) if (fdec or "." in s) else int(s)
                    except ValueError:
                        r[name] = s
            elif ftype == "L":
                r[name] = {"T": True, "Y": True, "F": False,
                           "N": False}.get(s.upper())
            else:
                r[name] = s if s != "" else None
        rows.append(r)
    return fields, rows


# --------------------------------------------------------------------------
def _ring_area(pts):
    """Signed shoelace. +ve = exterior (CCW), -ve = hole (CW) in shapefile
    convention the areas come out with the opposite sign, so callers use the
    magnitude of the summed signed area."""
    a = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        a += x1 * y2 - x2 * y1
    return a / 2.0


def read_shp_polygon_areas(path):
    """-> (list_of_area_m2_per_record, diagnostics dict).

    One entry per shapefile RECORD, aligned 1:1 with .dbf row order (deleted
    dbf rows are the only way these can desync; SIPU files have none observed).
    Non-polygon or null shapes yield 0.0 and are counted in diagnostics.
    """
    with open(path, "rb") as f:
        b = f.read()
    diag = {"records": 0, "null": 0, "nonpolygon": 0, "shapetypes": {},
            "truncated": False}
    if len(b) < 100:
        diag["truncated"] = True
        return [], diag
    areas = []
    pos = 100
    n = len(b)
    while pos + 8 <= n:
        _num, clen = struct.unpack(">II", b[pos:pos + 8])
        pos += 8
        end = pos + clen * 2
        if end > n:
            diag["truncated"] = True
            break
        if clen * 2 < 4:
            areas.append(0.0)
            diag["records"] += 1
            pos = end
            continue
        stype = struct.unpack("<I", b[pos:pos + 4])[0]
        diag["shapetypes"][stype] = diag["shapetypes"].get(stype, 0) + 1
        diag["records"] += 1
        if stype == 0:
            diag["null"] += 1
            areas.append(0.0)
            pos = end
            continue
        if stype not in (5, 15, 25):        # Polygon / PolygonZ / PolygonM
            diag["nonpolygon"] += 1
            areas.append(0.0)
            pos = end
            continue
        p = pos + 4 + 32                     # skip shape type + bbox
        nparts, npoints = struct.unpack("<II", b[p:p + 8])
        p += 8
        parts = list(struct.unpack(f"<{nparts}I", b[p:p + 4 * nparts]))
        p += 4 * nparts
        xy = struct.unpack(f"<{2 * npoints}d", b[p:p + 16 * npoints])
        total = 0.0
        for k in range(nparts):
            s = parts[k]
            e = parts[k + 1] if k + 1 < nparts else npoints
            ring = [(xy[2 * i], xy[2 * i + 1]) for i in range(s, e)]
            if len(ring) >= 3:
                total += _ring_area(ring)
        areas.append(abs(total))
        pos = end
    return areas, diag


def crs_is_metric(prj_path):
    """-> (bool|None, name). Areas from a GEOGCS are DEGREES SQUARED and must
    never be reported as land."""
    try:
        txt = open(prj_path, "rb").read().decode("latin-1", "replace")
    except Exception:  # noqa: BLE001
        return None, None
    import re
    m = re.search(r'PROJCS\["([^"]+)"', txt)
    if m:
        return True, m.group(1)
    m = re.search(r'GEOGCS\["([^"]+)"', txt)
    if m:
        return False, m.group(1)
    return None, txt[:60]
