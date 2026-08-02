#!/usr/bin/env python3
"""NZ-3 ArcGIS interrogation sweep — the founder's six-point plan, every probe logged.

INV-3 / §CONTEXT-DATA-HONESTY: every row records URL, HTTP status, content-type and byte count.
A non-200, an ArcGIS `error` body and an empty `features[]` are THREE different values.
"""
import json
import ssl
import sys
import urllib.error
import urllib.request

ROOT = "https://sigma.madrid.es/hosted/rest/services/PGOUM97"
CTX = ssl.create_default_context()
CTX.check_hostname = False
CTX.verify_mode = ssl.CERT_NONE

LOG = []


def get(url, timeout=45):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "PRYZM-probe/1.0"})
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
            body = r.read()
            row = {"url": url, "status": r.status,
                   "contentType": r.headers.get("Content-Type"), "bytes": len(body)}
            try:
                data = json.loads(body)
            except Exception:
                data = None
                row["parse"] = "NOT-JSON"
            if isinstance(data, dict) and "error" in data:
                row["arcgisError"] = data["error"].get("message")
            LOG.append(row)
            return data, row
    except urllib.error.HTTPError as e:
        LOG.append({"url": url, "status": e.code, "bytes": 0, "transport": "HTTPError"})
        return None, LOG[-1]
    except Exception as e:
        LOG.append({"url": url, "status": None, "bytes": 0,
                    "transport": f"{type(e).__name__}: {e}"})
        return None, LOG[-1]


def main():
    out = {"service": {}, "layers": {}, "probes": {}, "siblings": {}, "log": LOG}

    # ── (5) full MapServer enumeration ──────────────────────────────────────
    svc, _ = get(f"{ROOT}/PG_ANALISIS_EDIFICACION/MapServer?f=json")
    if svc:
        out["service"] = {
            "layerCount": len(svc.get("layers", [])),
            "tableCount": len(svc.get("tables", [])),
            "capabilities": svc.get("capabilities"),
            "supportsDynamicLayers": svc.get("supportsDynamicLayers"),
            "maxRecordCount": svc.get("maxRecordCount"),
            "spatialReference": (svc.get("spatialReference") or {}).get("latestWkid"),
            "layers": [{"id": l["id"], "name": l["name"],
                        "parentLayerId": l.get("parentLayerId"),
                        "subLayerIds": l.get("subLayerIds")} for l in svc.get("layers", [])],
            "tables": svc.get("tables", []),
        }

    # ── (2) per-layer: fields+aliases, domains, renderer, relationships, capabilities ──
    # Probe ids past the declared 12 too — unlisted ids often still answer.
    for lid in range(0, 20):
        d, row = get(f"{ROOT}/PG_ANALISIS_EDIFICACION/MapServer/{lid}?f=json")
        if not d or "error" in (d or {}):
            out["layers"][str(lid)] = {"probe": row}
            continue
        di = d.get("drawingInfo") or {}
        rend = di.get("renderer") or {}
        out["layers"][str(lid)] = {
            "name": d.get("name"),
            "type": d.get("type"),
            "geometryType": d.get("geometryType"),
            "parentLayer": (d.get("parentLayer") or {}).get("name") if d.get("parentLayer") else None,
            "fields": [{"name": f["name"], "type": f["type"].replace("esriFieldType", ""),
                        "alias": f.get("alias"),
                        "domain": (f.get("domain") or {}).get("name") if f.get("domain") else None,
                        "codedValues": [cv.get("name") for cv in
                                        ((f.get("domain") or {}).get("codedValues") or [])][:20]}
                       for f in (d.get("fields") or [])],
            "renderer": {
                "type": rend.get("type"),
                "field1": rend.get("field1"),
                "uniqueValueInfos": [
                    {"value": u.get("value"), "label": u.get("label")}
                    for u in (rend.get("uniqueValueInfos") or [])][:25],
            },
            "relationships": d.get("relationships"),
            "types": [t.get("name") for t in (d.get("types") or [])],
            "subtypeField": d.get("subtypeField"),
            "hasAttachments": d.get("hasAttachments"),
            "supportsStatistics": d.get("supportsStatistics"),
            "supportsAdvancedQueries": d.get("supportsAdvancedQueries"),
            "capabilities": d.get("capabilities"),
            "extent": d.get("extent"),
            "minScale": d.get("minScale"), "maxScale": d.get("maxScale"),
        }

    # ── (6) query probes on the two FONDO layers — count + extent decide APE vs city-wide ──
    for lid in ("2", "12", "8", "9", "10", "6"):
        q = f"{ROOT}/PG_ANALISIS_EDIFICACION/MapServer/{lid}/query"
        cnt, _ = get(f"{q}?where=1%3D1&returnCountOnly=true&f=json")
        ext, _ = get(f"{q}?where=1%3D1&returnExtentOnly=true&f=json")
        ids, _ = get(f"{q}?where=1%3D1&returnIdsOnly=true&f=json")
        out["probes"][lid] = {
            "count": (cnt or {}).get("count"),
            "extent": (ext or {}).get("extent"),
            "idCount": len((ids or {}).get("objectIds") or []) if ids else None,
        }

    # ── distinct values where a real attribute exists ──────────────────────
    for lid, fld in (("8", "TIPOANEDIF"), ("9", "TIPOANEDIF"), ("8", "PROTECCION"),
                     ("9", "PROTECCION"), ("8", "PLANO_AE"), ("10", "ENLACE")):
        q = (f"{ROOT}/PG_ANALISIS_EDIFICACION/MapServer/{lid}/query"
             f"?where=1%3D1&outFields={fld}&returnDistinctValues=true"
             f"&returnGeometry=false&resultRecordCount=50&f=json")
        d, _ = get(q)
        vals = [list(f.get("attributes", {}).values())[0]
                for f in (d or {}).get("features", [])][:50] if d else None
        out["probes"][f"{lid}.{fld}"] = {"distinct": vals}

    # ── (5) sibling services: does any expose a richer schema for the same geometry? ──
    for name in ("PG_ORDENACION", "PG_CONDICIONES_EDIFICACION", "PG_AREAS_ESPECIALES",
                 "PG_ORDENACION_SIN_AMBITO", "PG_GESTION"):
        d, _ = get(f"{ROOT}/{name}/MapServer?f=json")
        if d:
            out["siblings"][name] = {
                "layers": [{"id": l["id"], "name": l["name"]} for l in d.get("layers", [])],
                "tables": [{"id": t["id"], "name": t["name"]} for t in d.get("tables", [])],
            }

    dest = sys.argv[1] if len(sys.argv) > 1 else "nz3-sweep.json"
    with open(dest, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=2, ensure_ascii=False)
    print(json.dumps({"probesRun": len(LOG),
                      "nonOk": [r for r in LOG if r.get("status") != 200][:10]}, indent=2))
    print("wrote", dest)


if __name__ == "__main__":
    main()
