#!/usr/bin/env python3
"""STEP 1 - rebuild the SIPU corpus frame: catalogue -> classify -> base plans.

The prior probe's .data/ is gitignored and absent, so the corpus is rebuilt
from the CKAN catalogue at opendata.sitcan.es. Selection is DETERMINISTIC (no
randomness): one municipality-wide base instrument per municipality, preferring
adaptacion PLENA > PARCIAL > BASICA > none, then latest year - identical to the
rule that produced the measured baseline, so the columns-only figure is
REPRODUCED rather than re-derived.

Writes .data/catalogue.json, .data/classified.json, .data/corpus.json
"""
import json
import os
import re
import sys
import time
import urllib.request
from collections import Counter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import DATA, UA, deacc  # noqa: E402

BASE = "https://opendata.sitcan.es/api/3/action"

ISLAND = {
    "Adeje": "Tenerife", "Arafo": "Tenerife", "Arico": "Tenerife",
    "Arona": "Tenerife", "Buenavista del Norte": "Tenerife",
    "Candelaria": "Tenerife", "El Rosario": "Tenerife",
    "El Sauzal": "Tenerife", "El Tanque": "Tenerife", "Fasnia": "Tenerife",
    "Garachico": "Tenerife", "Granadilla de Abona": "Tenerife",
    "Guia de Isora": "Tenerife", "Guimar": "Tenerife",
    "Icod de Los Vinos": "Tenerife", "La Guancha": "Tenerife",
    "La Matanza de Acentejo": "Tenerife", "La Orotava": "Tenerife",
    "La Victoria de Acentejo": "Tenerife", "Los Realejos": "Tenerife",
    "Los Silos": "Tenerife", "Puerto de La Cruz": "Tenerife",
    "San Cristobal de La Laguna": "Tenerife",
    "San Juan de La Rambla": "Tenerife", "San Miguel de Abona": "Tenerife",
    "Santa Cruz de Tenerife": "Tenerife", "Santa Ursula": "Tenerife",
    "Santiago del Teide": "Tenerife", "Tacoronte": "Tenerife",
    "Tegueste": "Tenerife", "Vilaflor": "Tenerife",
    "Agaete": "Gran Canaria", "Aguimes": "Gran Canaria",
    "Artenara": "Gran Canaria", "Arucas": "Gran Canaria",
    "Firgas": "Gran Canaria", "Galdar": "Gran Canaria",
    "Ingenio": "Gran Canaria", "La Aldea de San Nicolas": "Gran Canaria",
    "Las Palmas de Gran Canaria": "Gran Canaria", "Mogan": "Gran Canaria",
    "Moya": "Gran Canaria", "San Bartolome de Tirajana": "Gran Canaria",
    "Santa Brigida": "Gran Canaria", "Santa Lucia de Tirajana": "Gran Canaria",
    "Santa Maria de Guia de Gran Canaria": "Gran Canaria",
    "Tejeda": "Gran Canaria", "Telde": "Gran Canaria",
    "Teror": "Gran Canaria", "Valleseco": "Gran Canaria",
    "Valsequillo de Gran Canaria": "Gran Canaria",
    "Vega de San Mateo": "Gran Canaria",
    "Arrecife": "Lanzarote", "Haria": "Lanzarote",
    "San Bartolome": "Lanzarote", "Teguise": "Lanzarote",
    "Tias": "Lanzarote", "Tinajo": "Lanzarote", "Yaiza": "Lanzarote",
    "Antigua": "Fuerteventura", "Betancuria": "Fuerteventura",
    "La Oliva": "Fuerteventura", "Pajara": "Fuerteventura",
    "Puerto del Rosario": "Fuerteventura", "Tuineje": "Fuerteventura",
    "Barlovento": "La Palma", "Brena Alta": "La Palma",
    "Brena Baja": "La Palma", "El Paso": "La Palma",
    "Fuencaliente de La Palma": "La Palma", "Garafia": "La Palma",
    "Los Llanos de Aridane": "La Palma", "Puntagorda": "La Palma",
    "Puntallana": "La Palma", "San Andres y Sauces": "La Palma",
    "Santa Cruz de La Palma": "La Palma", "Tazacorte": "La Palma",
    "Tijarafe": "La Palma", "Villa de Mazo": "La Palma",
    "Agulo": "La Gomera", "Alajero": "La Gomera", "Hermigua": "La Gomera",
    "San Sebastian de La Gomera": "La Gomera",
    "Valle Gran Rey": "La Gomera", "Vallehermoso": "La Gomera",
    "El Pinar": "El Hierro", "Frontera": "El Hierro",
    "Valverde": "El Hierro",
}

INSTR = [
    ("PGO", r"plan general de ordenacion|\bpgo\b|-pgo-|_pgo_"),
    ("NNSS", r"normas subsidiarias|\bnnss\b"),
    ("PLAN_PARCIAL", r"plan parcial|\bpp-|-pp-"),
    ("PLAN_ESPECIAL", r"plan especial|\bpe[ro]?i?\b|-peri-|-peo-"),
    ("ESTUDIO_DETALLE", r"estudio de detalle|-ed-|-edpp-|\bed\b"),
    ("MODIFICACION", r"modificacion puntual|\bmp\b|-mp"),
    ("SENTENCIA", r"sentencia|anulacion"),
    ("NORMAS_CONSERV", r"normas de conservacion|plan rector|plan director|"
                       r"plan especial de proteccion"),
    ("PIO", r"plan insular"),
    ("PMM", r"plan de modernizacion|modernizacion, mejora"),
    ("TEXTO_REF", r"texto refundido"),
]
EXCL = re.compile(
    r"modificacion|estudio de detalle|sentencia|anulacion|plan parcial|"
    r"plan especial|texto refundido de plan parcial|suspension|"
    r"delimitacion de suelo urbano|catalogo|ordenanza", re.I)
INCL = re.compile(r"plan general de ordenacion|normas subsidiarias|"
                  r"proyecto de delimitacion|normas de planeamiento", re.I)
RANK = {"PLENA": 0, "PARCIAL": 1, "BASICA": 2, None: 3}


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA,
                                               "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read().decode("utf-8"))


def municipality(title):
    t = deacc(title or "")
    for pre in ("Planeamiento urbanistico de ", "Planeamiento urbanTstico de "):
        if t.startswith(pre):
            return t[len(pre):].strip()
    return None


def island_of(title):
    t = deacc(title or "")
    m = municipality(title)
    if m:
        return ISLAND.get(m, "UNKNOWN")
    for isl in ("Tenerife", "Gran Canaria", "Lanzarote", "Fuerteventura",
                "La Palma", "La Gomera", "El Hierro"):
        if isl in t:
            return isl
    return "REGIONAL"


def instrument_type(name, url):
    s = deacc((name or "") + " " + (url or "")).lower()
    for label, pat in INSTR:
        if re.search(pat, s):
            return label
    return "OTRO"


def vintage(name, url):
    fn = (url or "").rsplit("/", 1)[-1]
    m = re.match(r"(\d{6})[-_]", fn)
    if m:
        yy = int(m.group(1)[:2])
        return 1900 + yy if yy >= 50 else 2000 + yy
    m = re.search(r"\b(19[6-9]\d|20[0-2]\d)\b", deacc(name or ""))
    return int(m.group(1)) if m else None


def adaptation(name):
    s = deacc(name or "").lower()
    if "adaptacion plena" in s or "adaptaci=n plena" in s:
        return "PLENA"
    if "adaptacion basica" in s:
        return "BASICA"
    if "modo parcial" in s or "adaptacion parcial" in s:
        return "PARCIAL"
    return None


def harvest():
    rows, offset, page = [], 0, 200
    while True:
        d = get(f"{BASE}/resource_search?query=format:SIPU"
                f"&limit={page}&offset={offset}")
        res = d["result"]
        got = res.get("results", [])
        total = res.get("count")
        for x in got:
            rows.append({"res_id": x.get("id"), "pkg_id": x.get("package_id"),
                         "name": x.get("name"), "url": x.get("url"),
                         "format": x.get("format"), "size": x.get("size"),
                         "created": x.get("created")})
        print(f"  offset={offset} got={len(got)} total={total} acc={len(rows)}",
              file=sys.stderr, flush=True)
        offset += page
        if not got or offset >= (total or 0):
            break
        time.sleep(0.2)
    pkgs = sorted({r["pkg_id"] for r in rows if r.get("pkg_id")})
    titles = {}
    for i, p in enumerate(pkgs):
        try:
            titles[p] = get(f"{BASE}/package_show?id={p}")["result"].get("title")
        except Exception as e:  # noqa: BLE001
            titles[p] = f"<ERR {e}>"
        if i % 25 == 0:
            print(f"  pkg {i}/{len(pkgs)}", file=sys.stderr, flush=True)
        time.sleep(0.05)
    for r in rows:
        r["municipality"] = titles.get(r.get("pkg_id"))
    return rows


def main():
    os.makedirs(DATA, exist_ok=True)
    cp = os.path.join(DATA, "catalogue.json")
    if os.path.exists(cp):
        cat = json.load(open(cp, encoding="utf-8"))
        print(f"catalogue.json cached rows={len(cat)}")
    else:
        cat = harvest()
        json.dump(cat, open(cp, "w", encoding="utf-8"),
                  ensure_ascii=False, indent=1)
        print(f"WROTE catalogue.json rows={len(cat)}")

    out = []
    for r in cat:
        t = r.get("municipality")
        out.append({**r, "muni": municipality(t), "island": island_of(t),
                    "instrument": instrument_type(r.get("name"), r.get("url")),
                    "year": vintage(r.get("name"), r.get("url")),
                    "adaptation": adaptation(r.get("name")),
                    "file": (r.get("url") or "").rsplit("/", 1)[-1]})
    json.dump(out, open(os.path.join(DATA, "classified.json"), "w",
                        encoding="utf-8"), ensure_ascii=False, indent=1)

    # ---- deterministic base-plan corpus, one per municipality ----------
    by_muni = {}
    for r in out:
        if not r.get("muni"):
            continue
        nm = deacc(r.get("name") or "")
        if EXCL.search(nm) or not INCL.search(nm):
            continue
        by_muni.setdefault(r["muni"], []).append(r)

    corpus = []
    for m, rs in sorted(by_muni.items()):
        rs.sort(key=lambda r: (RANK.get(r.get("adaptation"), 3),
                               -(r.get("year") or 0)))
        corpus.append({**rs[0], "candidates": len(rs)})
    json.dump(corpus, open(os.path.join(DATA, "corpus.json"), "w",
                           encoding="utf-8"), ensure_ascii=False, indent=1)

    allm = {r["muni"] for r in out if r["muni"]}
    print(f"\nSIPU resources               : {len(out)}")
    print(f"municipalities with any SIPU : {len(allm)} / 88")
    print(f"CORPUS (one base plan each)  : {len(corpus)}")
    print(f"no base-plan candidate       : {sorted(allm - set(by_muni))}")
    print("\n-- ROUTING TIER (base-instrument count per municipality) --")
    tierA = sorted(m for m, rs in by_muni.items() if len(rs) == 1)
    tierB = sorted(m for m, rs in by_muni.items() if len(rs) > 1)
    print(f"  TIER A single-instrument (routing SETTLED) : {len(tierA)}")
    print(f"  TIER B multi-instrument  (needs vigencia)  : {len(tierB)}")
    json.dump({"tierA": tierA, "tierB": tierB},
              open(os.path.join(DATA, "tiers.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)
    print("\n-- corpus by island --")
    for k, v in Counter(c["island"] for c in corpus).most_common():
        print(f"  {v:3d}  {k}")
    tot = sum(int(c.get("size") or 0) for c in corpus)
    print(f"\ncorpus declared bytes: {tot/1e9:.2f} GB "
          f"({sum(1 for c in corpus if not c.get('size'))} unknown)")


if __name__ == "__main__":
    main()
