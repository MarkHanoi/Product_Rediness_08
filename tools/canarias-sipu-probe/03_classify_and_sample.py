#!/usr/bin/env python3
"""C0 - classify the 1,169 SIPU resources; C1 - draw a SEEDED stratified sample.

Strata: island x instrument-type x vintage-decade.
Seed is fixed (SEED=20260802) so the sample is re-runnable and auditable.
Writes .data/classified.json and .data/sample.json
"""
import json
import os
import random
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, ".data")
SEED = 20260802
N_SAMPLE = 30

ISLAND = {
    # Tenerife
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
    # Gran Canaria
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
    # Lanzarote
    "Arrecife": "Lanzarote", "Haria": "Lanzarote",
    "San Bartolome": "Lanzarote", "Teguise": "Lanzarote",
    "Tias": "Lanzarote", "Tinajo": "Lanzarote", "Yaiza": "Lanzarote",
    # Fuerteventura
    "Antigua": "Fuerteventura", "Betancuria": "Fuerteventura",
    "La Oliva": "Fuerteventura", "Pajara": "Fuerteventura",
    "Puerto del Rosario": "Fuerteventura", "Tuineje": "Fuerteventura",
    # La Palma
    "Barlovento": "La Palma", "Brena Alta": "La Palma",
    "Brena Baja": "La Palma", "El Paso": "La Palma",
    "Fuencaliente de La Palma": "La Palma", "Garafia": "La Palma",
    "Los Llanos de Aridane": "La Palma", "Puntagorda": "La Palma",
    "Puntallana": "La Palma", "San Andres y Sauces": "La Palma",
    "Santa Cruz de La Palma": "La Palma", "Tazacorte": "La Palma",
    "Tijarafe": "La Palma", "Villa de Mazo": "La Palma",
    # La Gomera
    "Agulo": "La Gomera", "Alajero": "La Gomera", "Hermigua": "La Gomera",
    "San Sebastian de La Gomera": "La Gomera",
    "Valle Gran Rey": "La Gomera", "Vallehermoso": "La Gomera",
    # El Hierro
    "El Pinar": "El Hierro", "Frontera": "El Hierro",
    "Valverde": "El Hierro",
}

ACCENTS = str.maketrans("áéíóúüñÁÉÍÓÚÜÑ", "aeiouunAEIOUUN")


def deacc(s):
    return (s or "").translate(ACCENTS)


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


INSTR = [
    ("PGO",        r"plan general de ordenacion|\bpgo\b|-pgo-|_pgo_"),
    ("NNSS",       r"normas subsidiarias|\bnnss\b"),
    ("PLAN_PARCIAL", r"plan parcial|\bpp-|-pp-"),
    ("PLAN_ESPECIAL", r"plan especial|\bpe[ro]?i?\b|-peri-|-peo-"),
    ("ESTUDIO_DETALLE", r"estudio de detalle|-ed-|-edpp-|\bed\b"),
    ("MODIFICACION", r"modificacion puntual|\bmp\b|-mp"),
    ("SENTENCIA",  r"sentencia|anulacion"),
    ("NORMAS_CONSERV", r"normas de conservacion|plan rector|plan director|"
                       r"plan especial de proteccion"),
    ("PIO",        r"plan insular"),
    ("PMM",        r"plan de modernizacion|modernizacion, mejora"),
    ("TEXTO_REF",  r"texto refundido"),
]


def instrument_type(name, url):
    s = deacc((name or "") + " " + (url or "")).lower()
    # order matters - most specific first
    for label, pat in INSTR:
        if re.search(pat, s):
            return label
    return "OTRO"


def vintage(name, url):
    """Instrument date - leading YYMMDD/YYYYMMDD in filename is the BOC date."""
    fn = (url or "").rsplit("/", 1)[-1]
    m = re.match(r"(\d{6})[-_]", fn)
    if m:
        yy = int(m.group(1)[:2])
        return 1900 + yy if yy >= 50 else 2000 + yy
    m = re.search(r"\b(19[6-9]\d|20[0-2]\d)\b", deacc(name or ""))
    if m:
        return int(m.group(1))
    return None


def adaptation(name):
    s = deacc(name or "").lower()
    if "adaptacion plena" in s or "adaptaci=n plena" in s:
        return "PLENA"
    if "adaptacion basica" in s:
        return "BASICA"
    if "modo parcial" in s or "adaptacion parcial" in s:
        return "PARCIAL"
    return None


def main():
    cat = json.load(open(os.path.join(DATA, "catalogue.json"),
                        encoding="utf-8"))
    out = []
    for r in cat:
        t = r.get("municipality")
        out.append({
            **r,
            "muni": municipality(t),
            "island": island_of(t),
            "instrument": instrument_type(r.get("name"), r.get("url")),
            "year": vintage(r.get("name"), r.get("url")),
            "adaptation": adaptation(r.get("name")),
            "file": (r.get("url") or "").rsplit("/", 1)[-1],
        })
    with open(os.path.join(DATA, "classified.json"), "w",
              encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    # ---- stratified seeded sample -------------------------------------
    rnd = random.Random(SEED)
    strata = {}
    for r in out:
        dec = (r["year"] // 10 * 10) if r["year"] else 0
        strata.setdefault((r["island"], r["instrument"], dec), []).append(r)
    keys = sorted(strata, key=lambda k: (str(k[0]), str(k[1]), k[2]))
    rnd.shuffle(keys)
    # prefer PGO/NNSS strata (they carry municipality-wide EDIF) then round-robin
    keys.sort(key=lambda k: 0 if k[1] in ("PGO", "NNSS") else 1)
    sample, seen_key = [], set()
    for k in keys:
        if len(sample) >= N_SAMPLE:
            break
        pool = strata[k]
        pick = rnd.choice(pool)
        if pick["file"] in seen_key:
            continue
        seen_key.add(pick["file"])
        sample.append({**pick, "stratum": f"{k[0]}|{k[1]}|{k[2]}"})
    with open(os.path.join(DATA, "sample.json"), "w", encoding="utf-8") as f:
        json.dump(sample, f, ensure_ascii=False, indent=1)

    # ---- C0 report ----------------------------------------------------
    from collections import Counter
    print(f"SEED={SEED}  resources={len(out)}")
    print("\n-- BY INSTRUMENT TYPE --")
    for k, v in Counter(r["instrument"] for r in out).most_common():
        print(f"  {v:5d}  {k}")
    print("\n-- BY ISLAND --")
    for k, v in Counter(r["island"] for r in out).most_common():
        print(f"  {v:5d}  {k}")
    print("\n-- BY DECADE --")
    for k, v in sorted(Counter((r["year"] // 10 * 10) if r["year"] else 0
                               for r in out).items()):
        print(f"  {v:5d}  {k or 'unknown'}")
    print("\n-- ADAPTATION STATUS (published?) --")
    for k, v in Counter(r["adaptation"] for r in out).most_common():
        print(f"  {v:5d}  {k}")
    muni = {r["muni"] for r in out if r["muni"]}
    print(f"\nmunicipalities with >=1 SIPU resource: {len(muni)} / 88")
    print(f"\nSAMPLE n={len(sample)} strata={len({s['stratum'] for s in sample})}")
    for s in sample:
        print(f"  {s['stratum']:<40} {s['muni'] or '-':<28} {s['file'][:60]}")


if __name__ == "__main__":
    sys.exit(main())
