#!/usr/bin/env python3
"""LEVER 1 - the memo channel parser, with UNIT DISCIPLINE.

SIPU memo shape (confirmed on Agaete / Vallehermoso):

    "EDIFICABILIDAD : 216 :  # \nSUPERFICIE DE PARCELA : 135 :  #"

records terminated by '#', fields separated by ':'. A column-only adapter
UNDER-COUNTS the published parameters because the matching column holds a
sentinel ('I') while the memo holds the number.

⛔ THE TRAPS THIS MODULE EXISTS TO AVOID
  1. The prior run found 1,308 of 1,611 memo "FAR" hits were m2 of FLOOR AREA,
     not a RATIO (the Aragon `densidad`=LiDAR-point-density trap). CONFIRMED
     AND WORSE THAN LABELLED: Agaete publishes literal
     "EDIFICABILIDAD : 216" against "SUPERFICIE DE PARCELA : 135".  The LABEL
     says edificabilidad; the VALUE is m2. Label matching alone is not enough -
     magnitude and unit must both be tested.
  2. `Altura Libre interior` / `Altura de pisos` / `Altura minima libre` are
     FLOOR-TO-CEILING heights. Matching "altura" loosely turns interior
     clearances into building heights.
  3. `Ocupacion actual` is the EXISTING state of a catalogued building, not a
     rule. `Ocupacion del subsuelo` is BASEMENT coverage, not above ground.
  4. `Densidad` here is dwellings/ha - not an envelope parameter at all.

⭐ AND THE RECOVERY THE TRAP CONCEALS
Because the memo publishes BOTH a floor-area numerator AND a land-area
denominator in the same record set, the FAR the column does not hold can be
DERIVED: FAR = superficie de techo edificable / superficie neta de la manzana.
That derivation is only reported after it is PROVEN against rows where the
EdifMax COLUMN is also populated (see 03_memo.py, the agreement control).

Every promotion passes three gates:
  G1 LABEL  the label names the quantity unambiguously (deny-list first)
  G2 UNIT   explicit unit token, else magnitude plausibility for the family
  G3 SLOT   the column is empty/sentinel; a memo that DISAGREES with a
            populated column is a CONFLICT, never a promotion
"""
import re
import unicodedata

MEMO_COLS = ("otrasdet", "detuso", "detgral")


def norm(s):
    """Lower-case, strip diacritics, and neutralise the cp1252/UCS-2 damage.

    Accented characters in these MDBs arrive EITHER correctly OR as U+FFFD.
    Patterns below therefore use '.' at every accent position so a regex miss
    can never be mistaken for an absent field.
    """
    if not s:
        return ""
    s = unicodedata.normalize("NFKD", str(s))
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower()


# ---------------------------------------------------------------------------
# G1a - DENY LIST, evaluated FIRST. These labels look like parameters and are
# not.
# ---------------------------------------------------------------------------
DENY = [
    ("interior clearance, not building height",
     r"altura\s+(libre|m.nima|de\s+pisos|entre\s+plantas|de\s+planta\b)"),
    ("interior clearance, not building height",
     r"altura\s+m.nima\s+libre"),
    # CAUGHT IN RUN 1: "volumenes autorizables sobre la altura maxima" was
    # being read as a maximum height. It is what may sit ABOVE it.
    ("what is allowed ABOVE the height, not the height",
     r"sobre\s+la\s+altura|por\s+encima\s+de\s+la\s+altura|"
     r"vol.menes?\s+autorizables?|.tico|remonte"),
    # CAUGHT IN RUN 1: "fondo maximo de parcela" is PARCEL depth (a plot
    # dimension), not FONDO MAXIMO EDIFICABLE (how deep you may build).
    ("parcel depth, not buildable depth",
     r"fondo\s+(m.ximo|m.nimo)?\s*de\s+(la\s+)?parcela|"
     r"fondo\s+m.nimo|profundidad\s+(m.xima\s+)?de\s+(la\s+)?parcela"),
    # 'profundidad maxima del vuelo' is the CANTILEVER projection, not depth.
    ("cantilever projection depth, not buildable depth",
     r"profundidad\s+(m.xima\s+)?del?\s+vuelo"),
    # ⛔ CAUGHT IN RUN 1 AND IT IS A ~3x TRAP: "edificabilidad neta (m3/m2)"
    # is a VOLUME ratio. Reading 9 m3/m2 as a FAR of 9 overstates the envelope
    # by roughly the storey height. This is the Canarias tourist-zone form.
    ("m3/m2 VOLUME ratio, not a m2/m2 floor-area ratio",
     r"m3\s*/\s*m2|m.\s*/\s*m2\b(?!.*m2\s*/\s*m2)|volum.trica|"
     r".ndice\s+volum|edificabilidad\s+c.bica|c.bica"),
    # CAUGHT IN RUN 2: 'edificabilidad media' / 'global' is the sector MEAN or
    # GROSS FAR, not the zone MAXIMUM. Fasnia publishes both and the memo runs
    # 10-30% BELOW the column every time - exactly a mean-vs-max relation.
    ("average / gross FAR, not the zone maximum",
     r"edificabilidad\s+(media|global|bruta)|aprovechamiento\s+(medio|tipo)|"
     r"edificabilidad\s+del?\s+(sector|.mbito)"),
    ("below-ground coverage, not above ground",
     r"bajo\s+rasante"),
    ("existing state of a catalogued building, not a rule",
     r"\bactual\b"),
    ("basement, not above-ground coverage",
     r"ocupaci.n\s+del\s+subsuelo|s.tanos?"),
    ("dwellings, not an envelope parameter",
     r"viviendas?|habitantes|densidad|dotaci.n\s+de\s+aparcamiento|"
     r"aparcamientos?\s+p.blicos"),
    ("weighting coefficient, not a FAR",
     r"coeficiente\s+de\s+ponderaci.n|coeficiente\s+de\s+homogene"),
    ("cantilever / balcony projection, not a setback",
     r"volado|cuerpos\s+volados|vuelo"),
    ("prose, not a value",
     r"observaciones|caracter.sticas|descripci.n|diagn.stico|"
     r"medidas\s+correctoras|condiciones|estilo|fachadas|cubiertas|"
     r"tipolog.a|situaci.n|dominio|solicitud|inscripci.n|parcelaci.n|"
     r"medici.n\s+de\s+la\s+altura|abancalamiento|cerramiento|adosamiento|"
     r"concurrencia|.mbito|ficha\s+de|instrumento|afecci.n|salones|"
     r"planta\s+baja|construcciones\s+(auxiliares|por\s+encima)|"
     r"adaptaci.n\s+topogr|.reas\s+de\s+movimiento|par.metros\s+exteriores|"
     r"c.digo\s+plano|sistema\s+estructural|estado\s+de\s+conservaci"),
]
DENY_C = [(why, re.compile(p)) for why, p in DENY]

# ---------------------------------------------------------------------------
# G1b - the accept list.  ORDER MATTERS: every m2 form is matched BEFORE the
# ratio form, so `superficie ... edificable` can never be read as a FAR.
# ---------------------------------------------------------------------------
LABELS = [
    # ---- land-area DENOMINATORS (not parameters; feed the FAR derivation) --
    ("LandArea_m2", r"superficie\s+(neta\s+de\s+la\s+manzana|de\s+la\s+parcela|"
                    r"de\s+parcela|del\s+solar|bruta|neta|de\s+suelo|"
                    r"del?\s+.mbito)", "m2_land"),
    # ---- floor-area NUMERATORS (not parameters alone) ----------------------
    ("FloorArea_m2", r"superficie\s+(de\s+techo\s+edificable|edificable|"
                     r"m.xima\s+construida|construida\s+m.xima|construida|"
                     r"total\s+construida|de\s+techo)|"
                     r"aprovechamiento|techo\s+edificable", "m2_floor"),
    # ---- unambiguous RATIO -------------------------------------------------
    ("EdifMax", r"coeficiente\s+de\s+edificabilidad|"
                r".ndice\s+de\s+edificabilidad|edificabilidad\s*\(?\s*m2/m2|"
                r"edificabilidad\s+neta|edificabilidad", "ratio"),
    # ---- HEIGHT in metres --------------------------------------------------
    ("AltMaxM", r"altura\s+(m.xima\s+)?en\s+metros|"
                r"altura\s+m.xima\s*-?\s*l.nea\s+de\s+cornisa|"
                r"altura\s+reguladora(\s+m.xima)?|altura\s+de\s+cornisa|"
                r"altura\s+de\s+coronaci.n|altura\s+m.xima\s*\(?\s*m\b|"
                r"altura\s+m.xima\s+edificable|altura\s+total", "metres"),
    # ---- HEIGHT in storeys -------------------------------------------------
    ("AltMaxPl", r"altura\s+en\s+plantas|n.?\s*(mero)?\s*de\s+plantas|"
                 r"plantas\s+m.ximas|n.?\s*plantas|n.mero\s+m.ximo\s+de\s+"
                 r"plantas", "storeys"),
    # ---- COVERAGE ----------------------------------------------------------
    ("NoOcup_pct", r"superficie\s+(libre|no\s+ocupada)\s*%|"
                   r"superficie\s+no\s+ocupada\s*%", "percent"),
    ("PMaxOcup", r"ocupaci.n\s+(m.xima|de\s+parcela|de\s+la\s+parcela)|"
                 r"^ocupaci.n$|porcentaje\s+de\s+ocupaci.n|"
                 r"coeficiente\s+de\s+ocupaci.n|ocupaci.n", "percent"),
    # ---- SETBACKS ----------------------------------------------------------
    ("SepMin", r"retranqueos?\s+(a\s+)?(linderos?|v.a|fachada|frente)|"
               r"^retranqueos?$|separaci.n\s+a\s+linderos?|"
               r"separaci.n\s+m.nima|distancia\s+a\s+linderos?", "metres"),
    # ---- BUILDABLE DEPTH ---------------------------------------------------
    # ⭐ NATIONAL RE-TEST APPLIED: every probe in this programme searched the
    # lexeme `fondo`, and Malaga never uses it - it writes `profundidad
    # edificable`. Canarias uses BOTH. Searching only `fondo` missed 7 rows
    # here (small - but the lexeme gap is real and is NOT small elsewhere).
    ("FonMaxEd", r"fondo\s+(m.ximo\s+)?edificable|fondo\s+de\s+la\s+"
                 r"edificaci.n|fondo\s+m.ximo|"
                 r"profundidad\s+(m.xima\s+)?edificable|"
                 r"profundidad\s+de\s+la\s+edificaci.n|\bcruj.a", "metres"),
    # ---- MINIMUM PARCEL ----------------------------------------------------
    ("SupMin", r"parcela\s+m.nima|superficie\s+m.nima(\s+de\s+parcela)?", "m2_parcel"),
]
COMPILED = [(q, re.compile(p), u) for q, p, u in LABELS]

# quantity -> EDIF column(s) it would upgrade (G3)
SLOT = {
    "EdifMax": ("edifmax",),
    "AltMaxM": ("altmaxmp", "altmaxmv"),
    "AltMaxPl": ("altmaxpl",),
    "PMaxOcup": ("pmaxocup",),
    "NoOcup_pct": ("pmaxocup",),
    "SepMin": ("sepminfr", "sepminps", "sepminlt"),
    "FonMaxEd": ("fonmaxedm", "fonmaxed"),
    "SupMin": ("supmin",),
}
# quantities that are INPUTS to a derivation, never parameters on their own
DERIVED_ONLY = {"FloorArea_m2", "LandArea_m2"}

MAGNITUDE = {
    "ratio":    (0.01, 20.0),
    "metres":   (0.0, 300.0),
    "storeys":  (1.0, 60.0),
    "percent":  (0.0, 100.0),
    "m2_parcel": (1.0, 100000.0),
    "m2_floor": (1.0, 5.0e7),
    "m2_land":  (1.0, 5.0e7),
}
# an explicit token that PROVES the wrong unit family
WRONG_UNIT = {
    "ratio":   re.compile(r"\b(m2c?|m2|metros?\s+cuadrados?)\b(?!\s*/)"),
    "percent": re.compile(r"\b(m2c?|metros?)\b"),
    "storeys": re.compile(r"\b(m2c?|metros?|ml)\b"),
    "metres":  re.compile(r"\b(m2c?|plantas?)\b|%"),
}
NUM = re.compile(r"([-+]?\d{1,9}(?:[.,]\d+)?)")


def split_records(memo):
    if not memo:
        return []
    parts = [p for p in re.split(r"#", memo) if p and p.strip()]
    if len(parts) == 1:
        parts = [p for p in re.split(r"[\r\n]+", memo) if p.strip()]
    return parts


def parse_record(rec):
    fields = [f.strip() for f in rec.split(":")]
    if len(fields) < 2:
        return None
    return fields[0], fields[1], " ".join(fields[2:])


def to_float(s):
    m = NUM.search(s or "")
    if not m:
        return None
    t = m.group(1)
    # 1.234 in a m2 field is a thousands separator, not a decimal
    if re.fullmatch(r"\d{1,3}\.\d{3}", t):
        t = t.replace(".", "")
    try:
        return float(t.replace(",", "."))
    except ValueError:
        return None


def classify(rec):
    """-> dict(quantity, unit, value, verdict, label, reason).

    verdict in PROMOTABLE | DERIVED_INPUT | REJECT_UNIT | NO_NUMBER |
              DENIED | NOT_A_PARAMETER
    """
    p = parse_record(rec)
    label, valstr, tail = (p if p else (rec, rec, ""))
    nl = norm(label)
    nval = norm(valstr)
    ntail = norm(tail)
    for why, pat in DENY_C:
        if pat.search(nl):
            return {"quantity": None, "verdict": "DENIED", "label": nl[:44],
                    "reason": why}
    q = u = None
    for quant, pat, unit in COMPILED:
        if pat.search(nl):
            q, u = quant, unit
            break
    if q is None:
        return {"quantity": None, "verdict": "NOT_A_PARAMETER",
                "label": nl[:44], "reason": "no quantity label"}
    v = to_float(nval)
    if v is None:
        v = to_float(ntail)
    if v is None:
        return {"quantity": q, "unit": u, "value": None,
                "verdict": "NO_NUMBER", "label": nl[:44],
                "reason": "label carries no number"}
    # ⚠ CAUGHT IN RUN 1: scanning the free-text Observaciones tail for unit
    # tokens rejected ~380 legitimate heights because the PROSE mentioned "m2"
    # or "plantas". The unit token only counts in the VALUE field.
    wu = WRONG_UNIT.get(u)
    if wu and wu.search(nval):
        return {"quantity": q, "unit": u, "value": v,
                "verdict": "REJECT_UNIT", "label": nl[:44],
                "reason": f"explicit wrong-unit token in value '{nval[:34]}'"}
    lo, hi = MAGNITUDE[u]
    if not (lo <= v <= hi):
        return {"quantity": q, "unit": u, "value": v,
                "verdict": "REJECT_UNIT", "label": nl[:44],
                "reason": f"{v:g} outside {u} range [{lo:g},{hi:g}] - "
                          f"WRONG UNIT wearing a number"}
    if q == "AltMaxPl" and abs(v - round(v)) > 1e-9:
        return {"quantity": q, "unit": u, "value": v,
                "verdict": "REJECT_UNIT", "label": nl[:44],
                "reason": f"{v:g} is not an integer storey count (metres?)"}
    if q in ("PMaxOcup", "AltMaxM", "FonMaxEd", "SupMin") and v == 0:
        return {"quantity": q, "unit": u, "value": v,
                "verdict": "REJECT_UNIT", "label": nl[:44],
                "reason": "0 is a null substitute for this quantity"}
    # ⚠ CAUGHT IN RUN 1: coverage published as a FRACTION (0,1] rather than a
    # percent - "ocupacion maxima en planta : 0,55" is 55%, not 0.55%.
    # Anything that lands between 1 and 5 after that test is AMBIGUOUS between
    # a 2% coverage and a mis-typed fraction, so it is refused, not guessed.
    if q == "PMaxOcup":
        if 0 < v <= 1.0:
            v = v * 100.0
        elif v <= 5.0:
            return {"quantity": q, "unit": u, "value": v,
                    "verdict": "REJECT_UNIT", "label": nl[:44],
                    "reason": f"{v:g} is AMBIGUOUS between a percent and a "
                              f"fraction - refused, not guessed"}
    # ⚠ 'superficie no ocupada % : 0' means 100% coverage, which the brief
    # rules SUSPECT-NEVER-VALID. Treated as a null substitute.
    if q == "NoOcup_pct" and v == 0:
        return {"quantity": q, "unit": u, "value": v,
                "verdict": "REJECT_UNIT", "label": nl[:44],
                "reason": "no-unoccupied-area=0 implies 100% coverage - a null "
                          "substitute, and 100% coverage is never VALID"}
    if q in DERIVED_ONLY:
        return {"quantity": q, "unit": u, "value": v,
                "verdict": "DERIVED_INPUT", "label": nl[:44],
                "reason": "m2 - an input to the FAR derivation, never a "
                          "parameter on its own"}
    out = {"quantity": q, "unit": u, "value": v, "verdict": "PROMOTABLE",
           "label": nl[:44], "reason": ""}
    if q == "SepMin":
        out["face"] = face_of(nl)
    return out


# ⚠ CAUGHT IN RUN 2: comparing a memo 'retranqueo a vias' against the column
# SepMinPs (REAR) produced a fake CONFLICT. A setback only compares to the
# column for the SAME FACE. Where the memo does not name a face, the value is
# still usable for drawability but is NOT comparable to any one column.
FACE = [
    ("front",   r"\bv.a|\bvial|calle|fachada|frente|alineaci.n"),
    ("rear",    r"fondo|testero|trasero|posterior"),
    ("lateral", r"lateral|medianer"),
    ("any",     r"linderos?|colindante|parcelas?\s+vecinas?"),
]
FACE_C = [(f, re.compile(p)) for f, p in FACE]
FACE_COL = {"front": "sepminfr", "rear": "sepminps", "lateral": "sepminlt"}


def face_of(nl):
    for f, pat in FACE_C:
        if pat.search(nl):
            return f
    return "unspecified"


def memo_text(low):
    return " \n ".join(str(low.get(c) or "") for c in MEMO_COLS)


def harvest(low):
    """All classified memo records for one EDIF row (lower-cased dict)."""
    return [classify(r) for r in split_records(memo_text(low))]


def promotions(recs):
    """Collapse a row's classified records into {quantity: value}.

    NoOcup_pct is inverted into a coverage. The FAR derivation is applied only
    when BOTH a floor-area numerator and a land-area denominator are present
    and the quotient is a plausible FAR.
    Setbacks are keyed by FACE where the memo names one (SepMin@front etc.) so
    the agreement control never compares two different faces.

    -> (promoted dict, derived_far or None, derivation_evidence)
    """
    got = {}
    floors, lands = [], []
    for r in recs:
        if r["verdict"] == "PROMOTABLE":
            q = r["quantity"]
            if q == "NoOcup_pct":
                got.setdefault("PMaxOcup", 100.0 - r["value"])
            elif q == "SepMin":
                got.setdefault(f"SepMin@{r.get('face', 'unspecified')}",
                               r["value"])
            else:
                got.setdefault(q, r["value"])
        elif r["verdict"] == "DERIVED_INPUT":
            (floors if r["quantity"] == "FloorArea_m2" else lands).append(
                r["value"])
    derived = None
    ev = None
    if floors and lands:
        f, l = max(floors), max(lands)
        if l > 0:
            ratio = f / l
            if 0.05 <= ratio <= 20.0:
                derived = round(ratio, 4)
                ev = (f, l)
    return got, derived, ev
