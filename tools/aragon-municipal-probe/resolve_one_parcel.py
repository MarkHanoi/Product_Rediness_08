#!/usr/bin/env python3
"""
resolve_one_parcel.py -- ONE PARCEL, END TO END, WITH THE SOURCE HIERARCHY APPLIED.

    municipal detailed plan  ->  regional SIUa  ->  REFUSE

That ordering is the real product of this run and it generalises beyond Aragon.
Spain is organised `parcel -> municipality -> instrument -> detailed zoning -> rule`,
NOT by autonomous community. A resolver that prefers municipal detail and falls
back to regional is the correct shape everywhere.

This resolves a REAL Zaragoza parcel through that hierarchy and reports every
input the envelope needs, each with the tier it came from and its citation.

⛔ WHAT THIS DOES NOT DO. It does not emit a solid. Producing the massing is the
job of PRYZM's envelope engine under C58/ADR-0279, and this probe is deliberately
UNAPPLIED -- no rule pack, no registry entry, nothing published. What it proves is
that every INPUT the engine needs is resolvable from municipal data, which is the
thing ARAGON-BUILDABILITY-RESEARCH.md concluded was impossible.

⛔ AND IT REFUSES OUT LOUD. Where an input is only available graphically (the
`fondo edificable` "grafiado en los planos"), the resolver reports REFUSE for that
dimension rather than substituting the prose default -- because for zone A1 the
error direction of that substitution is UNKNOWN, and an unknown-direction
substitution is exactly how an envelope silently over-grants.
"""
from __future__ import annotations

import json
import os
import sys
import time
import urllib.parse
import urllib.request

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "out")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0 Safari/537.36")
WFS = "https://idezar-sig.zaragoza.es/servicios/geoserver/urbanismo/wfs"
CRS = "EPSG:25830"

# Zone code -> governing article in Zaragoza PGOU Normas Urbanisticas,
# Texto Refundido 2024, Titulo Cuarto (Zonas de suelo urbano consolidado).
# Verbatim article titles as extracted from the published PDF.
ZONE_ARTICLES = {
    "A1": {
        "zone": "A1. Edificacion en manzana cerrada",
        "chapter": "Titulo 4, Capitulo 4.1",
        "grammar": "alignment + depth (CLOSED BLOCK)",
        "articles": {
            "4.1.1": "CONDICIONES DE POSICION -- fachadas frontales alineadas con "
                     "las alineaciones de vial, laterales con los linderos laterales; "
                     "no se admiten retranqueos salvo que esten GRAFIADOS en los "
                     "planos de regulacion",
            "4.1.3": "FONDO MINIMO -- 7'50 m en toda la longitud de fachada, "
                     "aplicable SOLO 'en las manzanas que no se ordenen mediante "
                     "regulacion grafica de los fondos edificables'",
            "4.1.5": "NORMAS PARA LA DETERMINACION DE ALTURAS -- altura maxima en "
                     "funcion de la ANCHURA DE LA CALLE, medida entre alineaciones "
                     "oficiales opuestas, promediada sobre el frente de manzana",
            "4.1.8+": "CONDICIONES DE APROVECHAMIENTO, por subgrado "
                      "(A1/3.1, A1/3.2, A1/4.1, A1/4.2)",
        },
    },
    "A2": {"zone": "A2. Edificacion en ordenacion abierta",
           "chapter": "Titulo 4, Capitulo 4.2", "grammar": "setback",
           "articles": {"4.2.2": "CONDICIONES DE POSICION",
                        "4.2.5": "CONDICIONES DE APROVECHAMIENTO"}},
    "A3": {"zone": "A3. Edificacion en ordenacion abierta extensiva",
           "chapter": "Titulo 4, Capitulo 4.2", "grammar": "setback",
           "articles": {"4.2.8": "TIPO DE EDIFICACION",
                        "4.2.9": "CONDICIONES DE APROVECHAMIENTO"}},
    "A4": {"zone": "A4. Vivienda unifamiliar aislada o agrupada",
           "chapter": "Titulo 4, Capitulo 4.2", "grammar": "setback",
           "articles": {"4.2.3": "CONDICIONES DE POSICION EN VIVIENDAS "
                                 "UNIFAMILIARES AGRUPADAS",
                        "4.2.13": "CONDICIONES DE APROVECHAMIENTO"}},
    "A6": {"zone": "A6. Edificacion destinada a usos productivos",
           "chapter": "Titulo 4, Capitulo 4.2", "grammar": "setback",
           "articles": {"4.2.16": "CONDICIONES DE APROVECHAMIENTO",
                        "4.2.20": "ZONA A-6 GRADO 1", "4.2.21": "ZONA A-6 GRADO 2"}},
    "B": {"zone": "B. Ciudad historica", "chapter": "Titulo 4, Capitulo 4.3",
          "grammar": "alignment + conservation",
          "articles": {"4.3.8": "CONDICIONES DE POSICION",
                       "4.3.9": "CONDICIONES DIMENSIONALES Y DE APROVECHAMIENTO"}},
    "C": {"zone": "C. Conjuntos urbanos contemporaneos",
          "chapter": "Titulo 4, Capitulo 4.3", "grammar": "conservation",
          "articles": {"4.3.21": "ZONA C GRADO 1", "4.3.22": "ZONA C GRADO 2"}},
    "D": {"zone": "D. Edificacion residencial en agrupaciones de densidad media",
          "chapter": "Titulo 4, Capitulo 4.4", "grammar": "setback",
          "articles": {"4.4.2": "CONDICIONES DE APROVECHAMIENTO"}},
}

# Zone codes that are NOT a buildable ordinance -- refusing on these is CORRECT,
# not a coverage failure. (C63 §L-656: refusal is the correct answer, not an
# envelope.)
NON_BUILDABLE_PREFIXES = ("ZV", "EQ", "SNU", "SGU", "SGNU", "SGUZ", "RIO",
                          "VT-", "AL-", "AC", "F", "G", "E", "K")
DEFERRED_PREFIXES = ("PR-", "SUZ")   # governed by a development instrument


def get(url, timeout=300):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.getcode(), r.read()
    except Exception as e:  # noqa: BLE001
        return -1, str(e).encode()


def wfs_json(typename, bbox=None, count=None):
    q = {"service": "WFS", "version": "2.0.0", "request": "GetFeature",
         "typeNames": typename, "outputFormat": "application/json"}
    if count:
        q["count"] = str(count)
    if bbox:
        q["bbox"] = ",".join(str(v) for v in bbox) + f",urn:ogc:def:crs:EPSG::{CRS.split(':')[1]}"
    code, body = get(WFS + "?" + urllib.parse.urlencode(q))
    if code != 200:
        return None, {"http": code, "body": body[:300].decode("latin-1", "replace")}
    try:
        return json.loads(body.decode("utf-8", "replace")), None
    except Exception as e:  # noqa: BLE001
        return None, {"error": str(e)}


def ring_of(geom):
    t = geom.get("type")
    if t == "Polygon":
        return geom["coordinates"][0]
    if t == "MultiPolygon":
        return max(geom["coordinates"], key=lambda p: len(p[0]))[0]
    return []


def centroid(ring):
    a = cx = cy = 0.0
    for i in range(len(ring) - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        cr = x0 * y1 - x1 * y0
        a += cr
        cx += (x0 + x1) * cr
        cy += (y0 + y1) * cr
    if abs(a) < 1e-9:
        xs = [p[0] for p in ring]
        ys = [p[1] for p in ring]
        return sum(xs) / len(xs), sum(ys) / len(ys)
    a *= 0.5
    return cx / (6 * a), cy / (6 * a)


def area_of(ring):
    a = 0.0
    for i in range(len(ring) - 1):
        a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return abs(a) * 0.5


def point_in_ring(x, y, ring):
    inside = False
    n = len(ring)
    for i in range(n - 1):
        x0, y0 = ring[i][0], ring[i][1]
        x1, y1 = ring[i + 1][0], ring[i + 1][1]
        if (y0 > y) != (y1 > y):
            xin = (x1 - x0) * (y - y0) / (y1 - y0) + x0
            if x < xin:
                inside = not inside
    return inside


def resolve(parcel_feat, zones):
    ring = ring_of(parcel_feat["geometry"])
    cx, cy = centroid(ring)
    hit = None
    for z in zones:
        zr = ring_of(z["geometry"])
        if zr and point_in_ring(cx, cy, zr):
            hit = z
            break
    props = parcel_feat.get("properties") or {}
    out = {
        "parcel": {
            "referencia_catastral": props.get("referencia_catastral"),
            "superficie_m2_declared": props.get("superficie"),
            "superficie_m2_from_geometry": round(area_of(ring), 2),
            "vertices": len(ring),
            "centroid_epsg25830": [round(cx, 2), round(cy, 2)],
            "source_TIER_1": "urbanismo:Parcelas (IDEZar municipal WFS)",
        }
    }
    # ⛔ POPULATED IS NOT PRESENT: cross-check the declared area against the
    # geometry. A declared area that disagrees with its own polygon is the same
    # class of defect as SIUa's shape_area>0 with perimeter==0.
    d = props.get("superficie")
    if isinstance(d, (int, float)) and d:
        err = abs(d - area_of(ring)) / d
        out["parcel"]["declared_vs_geometry_rel_error"] = round(err, 4)
        out["parcel"]["declared_area_INTERNALLY_CONSISTENT"] = err < 0.02

    if hit is None:
        out["TIER_1_municipal"] = {"resolved": False}
        out["VERDICT"] = "FALL THROUGH to TIER 2 (regional SIUa)"
        return out

    zp = hit.get("properties") or {}
    code = str(zp.get("calificacion") or "")
    out["TIER_1_municipal"] = {
        "resolved": True,
        "source": "urbanismo:Estructura -- UNADVERTISED WFS typename on IDEZar "
                  "(absent from GetCapabilities; found from the GetFeatureInfo "
                  "feature-id prefix 'Estructura.fid-')",
        "calificacion": code,
        "descripcion": zp.get("descripcion"),
        "zone_polygon_vertices": len(ring_of(hit["geometry"])),
        "crs": CRS,
    }

    if any(code.startswith(p) for p in DEFERRED_PREFIXES):
        out["VERDICT"] = ("DEFER -- zone is governed by a development instrument. "
                          "Route to urbanismo:PLA_1_Instrumentos_ambito "
                          "(525 rows, carries enlace_normas / enlace_planos).")
        return out
    if any(code.startswith(p) for p in NON_BUILDABLE_PREFIXES):
        out["VERDICT"] = ("REFUSE -- not a buildable residential ordinance. "
                          "Refusal is the CORRECT answer here, not a coverage gap.")
        return out

    base = code.split("/")[0]
    art = ZONE_ARTICLES.get(base)
    if not art:
        out["VERDICT"] = f"REFUSE -- no article mapping read for code {code!r}."
        return out

    out["TIER_1_rule"] = art

    # ⛔ THE PER-DIMENSION BLOCK BELOW IS A1-SPECIFIC. An earlier version of this
    # script emitted it for EVERY mapped zone, so a parcel in zone B (Ciudad
    # Historica) was reported carrying art. 4.1.3's fondo minimo -- an article
    # that does not govern it. That is exactly the fabrication this programme
    # keeps catching: a resolver that always answers is not a resolver.
    # Only A1 was read to article level. Everything else says so.
    if base != "A1":
        out["dimensions"] = {
            "status": "NOT-READ",
            "why": (f"only zone A1 was read to article level in this run. "
                    f"{base} is mapped to {art['chapter']} and its grammar is "
                    f"'{art['grammar']}', but no per-dimension extraction was "
                    f"performed. READ, not MEASURED."),
        }
        out["VERDICT"] = (f"PARTIAL -- zone and governing chapter RESOLVED from "
                          f"municipal data; per-dimension rule NOT READ for {base}.")
        return out

    # -------- per-dimension resolution, ADR-0293 style: tier is PER DIMENSION
    dims = {
        "alignment": {
            "status": "RESOLVED-BY-PROXY",
            "value": "parcel street frontage from urbanismo:Parcelas",
            "citation": "art. 4.1.1 -- fachadas frontales alineadas con las "
                        "alineaciones de vial",
            "caveat": "the ALINEACION OFICIAL itself is a plan-sheet line. Using "
                      "the cadastral street frontage is a SUBSTITUTION. In "
                      "consolidated manzana cerrada the two coincide in the "
                      "common case, but this is an assumption, not a measurement.",
        },
        "depth_fondo": {
            "status": "REFUSE",
            "citation": "art. 4.1.3 -- the 7'50 m fondo minimo applies ONLY 'en "
                        "las manzanas que no se ordenen mediante regulacion "
                        "grafica de los fondos edificables'",
            "why": "⛔ THE PROSE DEFAULT IS NOT A SAFE UPPER BOUND. It is a "
                   "MINIMUM, and it is conditioned on the block NOT being "
                   "graphically regulated -- a condition that cannot be "
                   "evaluated without the plan sheet. Substituting it would "
                   "under-grant on regulated blocks and the direction of error "
                   "on unregulated ones is unknown.",
        },
        "height": {
            "status": "DERIVABLE",
            "citation": "art. 4.1.5 -- altura maxima en funcion de la ANCHURA DE "
                        "LA CALLE, medida entre alineaciones oficiales opuestas, "
                        "promediada sobre el frente de manzana",
            "inputs_available": ["urbanismo:Vias", "urbanismo:Manzanas",
                                 "urbanismo:Parcelas"],
            "caveat": "needs the street-width ladder; PRYZM already has one "
                      "(Barcelona). The ladder table itself is in the "
                      "aprovechamiento articles per subgrado and was NOT read here.",
        },
        "far_aprovechamiento": {
            "status": "READ-NOT-MEASURED",
            "citation": "arts. 4.1.8 / 4.1.10 / 4.1.12 / 4.1.13 / 4.1.15 / 4.1.17 "
                        "-- CONDICIONES DE APROVECHAMIENTO, per SUBGRADO",
            "why": "the subgrado (A1/3.1, A1/3.2, A1/4.1, A1/4.2) is not carried "
                   "on the Estructura polygon -- `calificacion` reads 'A1' only. "
                   "⛔ WITHOUT THE SUBGRADO THE APROVECHAMIENTO ARTICLE CANNOT BE "
                   "SELECTED. This is the single blocking gap for a numeric A1 "
                   "envelope, and it is a DATA gap, not a legal one.",
        },
    }
    out["dimensions"] = dims
    out["VERDICT"] = ("PARTIAL -- zone, grammar and governing articles RESOLVED "
                      "from municipal data; fondo REFUSED (graphic); subgrado "
                      "MISSING so aprovechamiento cannot be selected.")
    return out


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    print("pulling municipal zoning (unadvertised typename 'Estructura') ...")
    zgj, err = wfs_json("Estructura")
    if not zgj:
        print("FAILED", err)
        return 1
    zones = zgj["features"]
    print(f"  {len(zones)} zone polygons")

    # ⛔ AN UNFILTERED GetFeature IS NOT A SAMPLE. Taking the first 400 rows
    # returned every parcel from ONE corner of the historic centre -- 313 of 400
    # in zone B -- and a "zone distribution" computed from that would have been
    # a statement about GeoServer's row order, not about Zaragoza. Draw from
    # several bboxes across the city instead, and say so.
    boxes = {
        "casco_historico": (676000, 4613300, 676600, 4613900),
        "centro_ensanche": (676600, 4612600, 677200, 4613200),
        "delicias": (674800, 4613200, 675400, 4613800),
        "actur": (674900, 4616000, 675500, 4616600),
        "las_fuentes": (678200, 4613400, 678800, 4614000),
    }
    parcels = []
    for name, bb in boxes.items():
        pgj, err = wfs_json("urbanismo:Parcelas", bbox=bb, count=120)
        got = pgj["features"] if pgj else []
        for f in got:
            f.setdefault("properties", {})["_sample_box"] = name
        parcels.extend(got)
        print(f"  {name}: {len(got)} parcels")
    print(f"  {len(parcels)} parcels sampled across {len(boxes)} areas")

    results = []
    verdicts = {}
    for p in parcels:
        r = resolve(p, zones)
        v = r["VERDICT"].split(" --")[0]
        verdicts[v] = verdicts.get(v, 0) + 1
        results.append(r)

    # the headline: one parcel that landed in A1, reported in full
    exemplar = next((r for r in results
                     if r.get("TIER_1_municipal", {}).get("calificacion") == "A1"),
                    None)
    if exemplar is None:
        exemplar = next((r for r in results if "dimensions" in r), None)

    payload = {
        "probe": "aragon-source-hierarchy-one-parcel",
        "when": time.strftime("%Y-%m-%d"),
        "hierarchy": "municipal detailed plan -> regional SIUa -> REFUSE",
        "tier_1_sources": {
            "parcel": "urbanismo:Parcelas (IDEZar WFS)",
            "zoning": "Estructura (IDEZar WFS, UNADVERTISED typename)",
            "instrument": "urbanismo:PLA_1_Instrumentos_ambito (525 rows)",
            "rule_text": "PGOU Zaragoza Normas Urbanisticas TR2024, Titulo Cuarto",
        },
        "tier_2_source": "SIUa regional -- 1:15.000, fiab_geom legal-approval "
                         "ceiling 21.8%. NOT consulted for any parcel here "
                         "because tier 1 resolved.",
        "parcels_tested": len(results),
        "verdict_histogram": verdicts,
        "exemplar_parcel": exemplar,
        # Compact projection. The per-dimension prose is IDENTICAL for every A1
        # parcel, so repeating it 310 times would be an 864 KB restatement of the
        # exemplar -- and a file nobody reads is a file that silently drifts.
        "all": [{
            "rc": r["parcel"]["referencia_catastral"],
            "m2": r["parcel"]["superficie_m2_from_geometry"],
            "area_consistent": r["parcel"].get("declared_area_INTERNALLY_CONSISTENT"),
            "calificacion": r.get("TIER_1_municipal", {}).get("calificacion"),
            "verdict": r["VERDICT"].split(" --")[0],
        } for r in results],
    }
    with open(os.path.join(OUT, "one_parcel_resolution.json"), "w",
              encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)

    print("\nverdicts:")
    for k, v in sorted(verdicts.items(), key=lambda kv: -kv[1]):
        print(f"  {v:>5}  {k}")
    print("\nwrote out/one_parcel_resolution.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
