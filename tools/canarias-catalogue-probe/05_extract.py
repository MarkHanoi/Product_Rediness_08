"""C0 step 5 - normalise every catalogue resource into one flat record.

PARTITIONS ARE COMPUTED CLIENT-SIDE from the full 174-package harvest, never
from a server-side filter. Every distribution emitted here is required to SUM
BACK to the unfiltered totals (174 packages / 4697 resources / 1169 SIPU); the
sum checks run in 06_distributions.py and a failure is a FINDING, not a warning.

Per record we resolve:
  municipality (+ code)  <- package name; code from FIP/idecanarias URL
  island                 <- idecanarias URL path segment
  instrument type        <- free-text name, AFTER stripping the phase prefix
  approval phase         <- free-text name prefix + description
  vintage                <- explicit approval date if present, else UNKNOWN
                            (catalogue `created` is a CATALOGUING date and is
                            recorded SEPARATELY - conflating them would fabricate
                            a vintage distribution)
  format / url / size
"""
import collections
import json
import re
import unicodedata
import urllib.parse

from lib import load, save


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s)
                   if unicodedata.category(c) != "Mn")


def norm(s):
    return re.sub(r"\s+", " ", strip_accents(s or "").lower()).strip()


# ---------------------------------------------------------------- phase
# Ordered: first match wins. Derived from the observed leading-token census.
PHASE_PATTERNS = [
    ("definitiva_parcial", r"^aprobacion\s+definitiva\s+parcial"),
    ("definitiva",         r"^aprobacion\s+defin[ii]t[ai]v?a?\b"),
    ("inicial",            r"^aprobacion\s+inicial\b"),
    ("provisional",        r"^aprobacion\s+provisional\b"),
    ("sentencia",          r"^sentencia\b|^anulacion\b"),
    ("texto_refundido",    r"^texto\s+refundido\b"),
    ("suspension",         r"^suspension\b|^ambito\s+suspendido\b"),
    ("levantamiento_susp", r"^levantamiento\b"),
    ("adaptacion",         r"^adaptacion\b"),
]

PHASE_STRIP = re.compile(
    r"^(aprobacion\s+defin[ii]t[ai]v?a?(\s+parcial)?|aprobacion\s+inicial|"
    r"aprobacion\s+provisional|texto\s+refundido)\s+(de\s+la\s+|del\s+|de\s+|a\s+la\s+|en\s+)?",
    re.I)

# ---------------------------------------------------------------- instrument
# Ordered longest/most-specific FIRST. Canary Islands instrument families under
# TR-LOTCENC 2000 / Ley 4/2017.
INSTRUMENT_PATTERNS = [
    ("Plan General de Ordenacion (PGO/PGOU)",
     r"plan\s+general\s+(de\s+ordenacion|municipal|de\s+ordenacion\s+urbana)?|^pgo\b|\bpgou\b"),
    ("Normas Subsidiarias",
     r"normas\s+subsidiar\w*|\bnn\.?ss\.?\b|normas\s+de\s+planeamiento"),
    ("Plan Parcial",
     r"plan\s+parcial|\bpp\b|plan\s+de\s+ordenacion\s+territorial\s+y\s+urbana|\bcitn\b"),
    ("Plan Especial",
     r"plan\s+especial|plan\s+de\s+especial|\bpepri\b|\bperi\b|\bpeo\b|\bpe\b|"
     r"plan\s+de\s+ordenacion\b"),
    ("Estudio de Detalle",
     r"estudio\s+(de\s+)?detalle|\bed\b"),
    ("Plan Insular de Ordenacion (PIO)",
     r"plan\s+insular"),
    ("Plan Territorial (PTE/PTP)",
     r"plan\s+territorial"),
    ("Plan Rector de Uso y Gestion (PRUG)",
     r"plan\s+rector"),
    ("Plan Director",
     r"plan\s+director"),
    ("Plan de Modernizacion (PMM)",
     r"plan\s+de\s+modernizacion|plan\s+para\s+la\s+modernizacion|\bpmm\b"),
    ("Programa de Actuacion",
     r"programa\s+de\s+actuacion"),
    ("Normas de Conservacion",
     r"normas\s+de\s+conservacion"),
    ("Proyecto de Urbanizacion / Actuacion",
     r"proyecto\s+de\s+(urbanizacion|actuacion)"),
    ("Delimitacion de Suelo Urbano",
     r"delimitacion\s+de\s+suelo"),
    ("Ordenanza / Ordenacion (other)",
     r"\bordenanza|ordenacion\s+(pormenorizada|estructural)"),
    ("Catalogo",
     r"\bcatalogo\b"),
    ("Convenio",
     r"\bconvenio\b"),
]

# A MODIFICATION is a MODIFIER on a base instrument, not a family of its own.
MODIF_RE = re.compile(
    r"modificacion|\bmodif\.?\b|revision|adaptacion|correccion\s+de\s+errores|"
    r"subsanacion", re.I)

# VINTAGE VOCABULARY, measured not assumed. A census of the token preceding a
# dd/mm/yyyy across all 1169 SIPU records returned:
#     publicado/publicada  1332   <- BOC publication date  (DOMINANT)
#     aprobado/aprobada     109   <- approval date
# These are DIFFERENT EVENTS and are captured into SEPARATE fields. Merging them
# would manufacture an "approval year" for ~1100 records that carry no approval
# date at all.
APPROVED_RE = re.compile(r"aprobad[ao]s?\s+(?:el|en)\s+(\d{1,2})/(\d{1,2})/(\d{4})", re.I)
PUBLISHED_RE = re.compile(r"publicad[ao]s?\s+(?:el|en)\s+(\d{1,2})/(\d{1,2})/(\d{4})", re.I)
ANYDATE_RE = re.compile(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b")
DATE_RE = APPROVED_RE  # back-compat name
# Fallback vintage tokens seen in titles: "de 19 Jun. 2013", "1994", "Nº 984/2014"
YEAR_RE = re.compile(r"\b(19[6-9]\d|20[0-2]\d)\b")

# CLOSED whitelist - exactly the seven codes observed in idecanarias paths, and
# nothing else. Deliberately NOT a permissive map: an unrecognised token must be
# dropped as UNKNOWN rather than invented into an island.
ISLAND_CODE = {
    "GC": "Gran Canaria", "TF": "Tenerife", "LZ": "Lanzarote",
    "FV": "Fuerteventura", "LP": "La Palma", "LG": "La Gomera",
    "EH": "El Hierro",
}


def classify_phase(name):
    n = norm(name)
    for label, pat in PHASE_PATTERNS:
        if re.search(pat, n):
            return label
    return "UNKNOWN"


def classify_instrument(name, desc):
    """Return (family, is_modification). Family from the FIRST matching pattern
    on the phase-stripped title; falls back to the description."""
    raw = norm(name)
    stripped = PHASE_STRIP.sub("", raw)
    ismod = bool(MODIF_RE.search(raw) or MODIF_RE.search(norm(desc)))
    for hay in (stripped, raw, norm(desc)):
        for label, pat in INSTRUMENT_PATTERNS:
            if re.search(pat, hay):
                return label, ismod
    if re.search(r"sentencia|anulacion|recurso|tsjc|tribunal", raw):
        return "Sentencia judicial (no base instrument named)", ismod
    if ismod:
        # A real and reportable category: the catalogue names a MODIFICATION but
        # never names the instrument being modified. Calling this UNCLASSIFIED
        # would hide a supersession-resolution problem; calling it a family
        # would fabricate one. It is neither - it is BASE NOT NAMED.
        return "Modificacion - BASE INSTRUMENT NOT NAMED", ismod
    if re.search(r"suspension|ambito\s+suspendido|levantamiento", raw):
        return "Suspension / levantamiento (no base instrument named)", ismod
    return "UNCLASSIFIED", ismod


def main():
    pkgs = load("01_packages.json")

    # --- island lookup, learned from idecanarias URLs, keyed by package ------
    pkg_island = {}
    pkg_codes = collections.defaultdict(collections.Counter)
    for p in pkgs:
        for r in p.get("resources", []) or []:
            u = r.get("url") or ""
            # PATH SHAPE - two DIFFERENT layouts, and reading the wrong segment
            # silently produced a fake island called "AD" on 169 records:
            #   municipal : /PLA_ENP_URB/URB_PLA/<ISLAND>/<Muni4>/<id>/indice.html
            #   natural   : /PLA_ENP_URB/<ISLAND>/AD/<Space>/<id>/indice.html
            # "AD" is "Aprobacion Definitiva", a PHASE directory, not an island.
            # The ISLAND_CODE whitelist below is the guard that makes a repeat of
            # this mistake impossible: an unknown 2-letter token is dropped, not
            # promoted to an island.
            m = (re.search(r"/URB_PLA/([A-Z]{2})/", u)
                 or re.search(r"/PLA_ENP_URB/([A-Z]{2})/AD/", u))
            if m and m.group(1) in ISLAND_CODE:
                pkg_island.setdefault(p["name"], collections.Counter())[m.group(1)] = \
                    pkg_island.setdefault(p["name"], collections.Counter())[m.group(1)] + 1
            m2 = re.search(r"/fip/(\d{5,6})_", u)
            if m2:
                pkg_codes[p["name"]][m2.group(1)] += 1

    rows = []
    for p in pkgs:
        pname = p["name"]
        muni_slug = None
        kind = "other"
        if pname.startswith("planeamiento-urbanistico-de-"):
            muni_slug = pname[len("planeamiento-urbanistico-de-"):]
            kind = "municipal"
        elif pname.startswith("planeamiento-de-espacios-naturales-de-"):
            kind = "espacios-naturales"
        elif pname.startswith("planes-de-modernizacion-de-"):
            kind = "modernizacion"
        elif pname == "planes-insulares-de-ordenacion":
            kind = "insular"

        isl_ctr = pkg_island.get(pname) or collections.Counter()
        isl = ISLAND_CODE.get(isl_ctr.most_common(1)[0][0], isl_ctr.most_common(1)[0][0]) \
            if isl_ctr else None
        code_ctr = pkg_codes.get(pname) or collections.Counter()
        code = code_ctr.most_common(1)[0][0] if code_ctr else None

        for r in p.get("resources", []) or []:
            name = r.get("name") or ""
            desc = r.get("description") or ""
            fam, ismod = classify_instrument(name, desc)
            phase = classify_phase(name)
            blob = name + " || " + desc

            def _d(rx, last=False):
                ms = list(rx.finditer(blob))
                if not ms:
                    return None, None
                m = ms[-1] if last else ms[0]
                try:
                    return ("%04d-%02d-%02d" % (int(m.group(3)), int(m.group(2)),
                                                int(m.group(1))), int(m.group(3)))
                except Exception:
                    return None, None

            approval_date, approval_year = _d(APPROVED_RE)
            published_date, published_year = _d(PUBLISHED_RE)
            anydate, anyyear = _d(ANYDATE_RE, last=True)
            # BEST-AVAILABLE vintage, with its PROVENANCE recorded so a downstream
            # consumer can never mistake a publication date for an approval date.
            if approval_year:
                vintage_year, vintage_src = approval_year, "approved"
            elif published_year:
                vintage_year, vintage_src = published_year, "published_BOC"
            elif anyyear:
                vintage_year, vintage_src = anyyear, "bare_date_unlabelled"
            else:
                vintage_year, vintage_src = None, "NONE"
            title_years = [int(y) for y in YEAR_RE.findall(name)]
            u = r.get("url") or ""
            rows.append({
                "package": pname,
                "package_kind": kind,
                "municipality_slug": muni_slug,
                "municipality_title": (p.get("title") or "").replace(
                    "Planeamiento urbanístico de ", ""),
                "muni_code_from_url": code,
                "island": isl,
                "resource_id": r.get("id"),
                "resource_name": name,
                "format": (r.get("format") or "").strip(),
                "mimetype": r.get("mimetype"),
                "size": r.get("size"),
                "url": u,
                "url_host": urllib.parse.urlparse(u).netloc,
                "instrument_family": fam,
                "is_modification": ismod,
                "phase": phase,
                "approval_date": approval_date,
                "approval_year": approval_year,
                "published_date": published_date,
                "published_year": published_year,
                "vintage_year": vintage_year,
                "vintage_source": vintage_src,
                "title_years": title_years,
                "catalogued": (r.get("created") or "")[:10],
                "catalogued_year": int(r["created"][:4]) if r.get("created") else None,
                "last_modified": (r.get("last_modified") or "")[:10],
            })

    save("05_records.json", rows)
    print("records emitted:", len(rows))
    print("SIPU records    :", sum(1 for x in rows if x["format"] == "SIPU"))
    print("municipal pkgs  :", len({x["package"] for x in rows if x["package_kind"] == "municipal"}))
    print("islands seen    :", collections.Counter(
        x["island"] for x in rows if x["package_kind"] == "municipal").most_common())
    unc = [x for x in rows if x["format"] == "SIPU" and x["instrument_family"] == "UNCLASSIFIED"]
    print("UNCLASSIFIED SIPU:", len(unc))
    for x in unc[:20]:
        print("   ", x["resource_name"][:110])


if __name__ == "__main__":
    main()
