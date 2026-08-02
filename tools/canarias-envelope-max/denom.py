#!/usr/bin/env python3
"""LEVER 2 - the DENOMINATOR: separating PRIVATE DEVELOPABLE land from land
that carries NO PRIVATE ENVELOPE AT ANY COMPLETENESS OF DATA.

Next door in Balears, 32.55% of "buildable" land was road, public open space
and infrastructure; excluding it moved complete-rule from 41.6% to 61.4%.
Pajara's 0% across 447 rows is REAL - every row equipment or catalogued with
empty strings - and that is exactly the population to exclude.

⛔ THE CIRCULARITY THIS MODULE MUST NOT COMMIT
If rows were excluded BECAUSE they are empty, the resulting rate would be true
by construction and would mean nothing. So classification here is made
**purely on the LAND CLASS named in the record** - never on whether the row
carries parameters. The parameter rate WITHIN each excluded class is then
reported as the audit: if public/systems rows turn out to carry complete
rules, the exclusion is WRONG and must be withdrawn.
"""
import re
import unicodedata


def norm(s):
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()


# '.' stands in for any accented / U+FFFD-damaged character.
CLASSES = [
    ("PUBLIC_SYSTEM", [
        r"\bviario\b|red\s+viaria|\bvial(es)?\b|\bcalle\b|carretera|"
        r"\bcamino\b|\bsenda\b|peatonal|aparcamiento\s+p.blico|"
        r"espacios?\s+libres?|zonas?\s+verdes?|.reas?\s+ajardinadas?|"
        r"\bajardinad|parque\s+(urbano|p.blico|rural)|\bplaza(s)?\b|"
        # ⛔ CAUGHT IN RUN 3: `jardin` matched 'Proceso tipologico de CIUDAD
        # JARDIN' - a GARDEN-CITY HOUSING TYPOLOGY, and in Telde the single
        # most complete private rule in the table (setbacks + occupation +
        # FAR + height, Art. 229). A term collision, not a land class.
        r"(?<!ciudad )\bjard.n\b|(?<!ciudad )\bjardines\b|paseo|rambla|"
        r"infraestructuras?|\bservicios?\s+(t.cnicos?|urbanos?|p.blicos?)|"
        r"sistema\s+(general|local)|\bs\.?\s?g\.?\b|"
        r"depuradora|desaladora|vertedero|subestaci.n|dep.sito|"
        r"cementerio|\bcanal(es)?\b|puerto|aeropuerto|helipuerto|"
        r"litoral\s+p.blico|dominio\s+p.blico|\bcauce\b|"
        r"transporte|estaci.n\s+de\s+guaguas|\bmuelle\b",
    ]),
    ("EQUIPMENT", [
        r"equipamiento|\bequip\.|dotacional|\bdotaci.n|"
        r"\bdocente\b|\bescolar\b|\bcolegio\b|\bcultural\b|socio-?cultural|"
        r"\bdeportivo\b|\bdeportiva\b|\bsanitario\b|\bsanitaria\b|"
        r"asistencial|\breligioso\b|\bcementerio\b|administrativo|"
        r"\bmercado\b|centro\s+de\s+salud|\bhospital\b|"
        r"seguridad|bomberos|\bcuartel\b",
    ]),
    # ⛔ CAUGHT IN RUN 1: bare `costa`, `natural`, `barranco`, `reserva` and
    # `agricola` are PLACE NAMES in the Canaries. 'Costa Calma' is a Fuerte-
    # ventura resort - prime private land - and it was being classed as
    # protected rustic. A REGEX HIT IS NOT A LAND CLASS. Only unambiguous
    # planning terms survive here.
    ("PROTECTED_RUSTIC", [
        r"suelo\s+r.stico|\br.stico\s+de\s+protecci|no\s+urbanizable|"
        r"de\s+protecci.n\s+(natural|paisaj|ecol|cient|costera|litoral|"
        r"hidrol|forestal|agraria|territorial|cultural|de\s+entornos)|"
        r"espacio\s+natural\s+protegid|\ba\.?n\.?p\.?\b|"
        r"suelo\s+protegid|zona\s+de\s+servidumbre",
    ]),
    # ⛔ CAUGHT IN RUN 1: bare `historico` excluded 'EDIFICACION EN CASCO
    # HISTORICO' and 'Zonas Historico-Artisticas ... Casco' - historic urban
    # cores are the DENSEST PRIVATE LAND there is, not a catalogue entry.
    ("CATALOGUED", [
        r"cat.log|catalogad|\bb\.?i\.?c\.?\b|patrimoni|"
        r"inter.s\s+cultural|\bfuera\s+de\s+ordenaci.n\b|"
        r"elemento\s+protegido",
    ]),
]
COMPILED = [(k, [re.compile(p) for p in pats]) for k, pats in CLASSES]

# a row that names a private built form OVERRIDES a weak class hit: an
# "Equipamiento. Edificacion Libre" row is a real built-form rule that happens
# to serve an equipment use, and the SIPU EDIF table is the ARCHIVE OF BUILDING
# ZONES.  Kept as a separate verdict so the effect of either choice is visible.
PRIVATE_FORM = re.compile(
    r"edificaci.n\s+(cerrada|abierta|aislada|libre|adosada|entre\s+medianer|"
    r"en\s+manzana|pareada|agrupada|intensiva|extensiva|semi)|"
    r"manzana\s+cerrada|ciudad\s+jard.n|residencial|\bvivienda|"
    r"\bhotelero\b|extrahotelero|tur.stic|\bcomercial\b|\bindustrial\b|"
    r"\bterciario\b|\boficinas\b|\bintensiva\b|\bextensiva\b|"
    r"semi-?intensiva|semi-?extensiva|\bunifamiliar")


def classify(*texts):
    """-> (land_class, matched_text). Never returns None: an unmatched row is
    PRIVATE_DEVELOPABLE_ASSUMED and is counted separately so the assumption is
    visible."""
    blob = " | ".join(norm(t) for t in texts if t)
    if not blob.strip():
        return "UNNAMED", ""
    hits = []
    for k, pats in COMPILED:
        for p in pats:
            m = p.search(blob)
            if m:
                hits.append((k, m.group(0)))
                break
    if not hits:
        return "PRIVATE_DEVELOPABLE", ""
    if PRIVATE_FORM.search(blob):
        # names a private built form AND a public/equipment use
        return "MIXED_" + hits[0][0], hits[0][1]
    return hits[0][0], hits[0][1]


# the land classes that carry NO PRIVATE ENVELOPE AT ANY COMPLETENESS OF DATA
EXCLUDE = {"PUBLIC_SYSTEM", "EQUIPMENT", "PROTECTED_RUSTIC", "CATALOGUED"}
# MIXED_* are kept IN the private denominator (they publish a built form);
# UNNAMED is kept in and flagged.


def is_private(land_class):
    return land_class not in EXCLUDE
