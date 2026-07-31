#!/usr/bin/env python3
"""Emit per-Norma-Zonal extraction records for Madrid PGOUM-97.

Source: Compendio 2025 de las NNUU del PGOUM-97, consolidated 24-09-2025.
Every value below was read directly from the PDF text layer; verbatim strings
are copied unmodified. Printed page = pdfPage - 2 throughout Título 8.

Usage:  python build_records.py [outdir]
Default outdir: docs/04-reference/jurisdictions/es/es-md/28079-madrid/extracted
"""
import json
import os
import sys

DOC = "Compendio 2025 de las NNUU del PGOUM-97 (24-09-2025)"
READ = "Compendio 2025 (24-09-2025)"


def rec(zone, param, value, unit, cap, art, ap, page, verbatim, **kw):
    """One record. `page` is the 1-based fitz PDF page index."""
    r = {
        "zoneCode": zone,
        "parameter": param,
        "value": value,
        "unit": unit,
        "measurement": kw.pop("measurement", None),
        "referencePlane": kw.pop("referencePlane", None),
        "denominatorScope": kw.pop("denominatorScope", None),
        "source": {
            "document": DOC,
            "capitulo": cap,
            "articulo": art,
            "apartado": ap,
            "pdfPage": page,
            "printedPage": page - 2,
            "table": kw.pop("table", None),
            "verbatim": verbatim,
        },
        "readFrom": READ,
        "effectiveDate": None,
        "extractedFrom": kw.pop("extractedFrom", "prose"),
        "confidence": kw.pop("confidence", "exact"),
    }
    r.update(kw)  # unknownReason, condition, formula, notes, amendment, ...
    return r


# ================================================================ HEIGHT DATUM
# Título 6, Capítulo 6.6 + Art. 6.3.5.c) — read 2026-07-31.
# See findings/COMPENDIO-2025-HEIGHT-DATUM-AND-NZ7.md for the full evidence chain.
#
# The datum has TWO parts and they must not be collapsed:
#   1. referencePlane — WHICH plane (rasante de la acera vs cota de nivelación de planta baja)
#   2. samplingRule   — WHERE on/relative to that plane the measurement is taken
# A datum name without a sampling rule reproduces PRYZM defect L-584 (terrain present but
# sampled at one point on the block centroid, while the ordinance samples at the FAÇADE).

# The three articles that bind any altura value to the cota de origen y referencia.
DATUM_CHAIN = [
    {"articulo": "6.6.5", "apartado": "preámbulo + 1 + 2", "pdfPage": 203, "printedPage": 201,
     "verbatim": "Son las que sirven para determinar las distintas alturas en un edificio, tomadas en relación con la cota de origen y referencia, determinada de acuerdo con el art. 6.3.5. apartado c) y se distinguen las siguientes: 1. Nivel de cornisa: El de la intersección de la cara inferior del forjado que forma el techo de la última planta con la fachada del edificio. 2. Nivel de coronación: El del plano superior de los petos de protección de cubierta si existieren, o en su defecto el de la cara superior del remate del forjado de la última planta. En función de estas referencias resultarán la altura de cornisa y la altura de coronación, siendo la altura total la que se mide hasta el elemento más alto del edificio.",
     "note": "Keeps cornisa / coronación / total distinct. All three share the SAME origin; they differ only in where the measurement stops."},
    {"articulo": "6.6.6", "apartado": "párrafo único", "pdfPage": 203, "printedPage": 201,
     "verbatim": "Es la altura del edificio medida en unidades métricas desde la cota de origen y referencia hasta cualquiera de las demás referencias altimétricas o elementos del edificio y en función de ellos será altura de cornisa, altura de coronación y altura total."},
    {"articulo": "6.3.5", "apartado": "c)", "pdfPage": 193, "printedPage": 191,
     "verbatim": "Cota de origen y referencia: La que se define en el planeamiento como origen para la medición de la altura del edificio, considerándose en edificación aislada la cota de nivelación de planta baja, que se tomará como cota cero (0) y en edificación en manzana cerrada la rasante de la acera en el punto medio de la línea de fachada. No obstante, las normas zonales, las ordenanzas particulares de las áreas del planeamiento correspondiente del Plan General, pueden determinar la situación o elemento que se instituye como cota de origen o referencia. En ningún caso la cota de origen y referencia podrá situarse por encima de la cota de nivelación de la planta baja.",
     "amendment": "Artículo modificado por la MPG 00/343 (aprobación definitiva 08.11.2023 BOCM 27.11.2023)",
     "note": "The typology split (aislada vs manzana cerrada) is the DEFAULT. A norma zonal may override it — NZ 7 grado 1º does exactly that (art. 8.7.11.1)."},
]

# Art. 6.6.7 — the storey count shares the same origin.
STOREY_COUNT_RULE = {
    "articulo": "6.6.7", "apartado": "párrafo único", "pdfPage": 204, "printedPage": 202,
    "verbatim": "Corresponde al número de plantas por encima de la cota de origen y referencia incluida la planta baja.",
    "note": "maxFloors is counted ABOVE the cota de origen y referencia, planta baja INCLUDED — so a storey count is datum-dependent exactly as a metre figure is. On a stepped façade the count is per-segment (art. 6.6.8.6.d)."}

# Art. 6.6.9.2 — plantas and metres bind simultaneously.
BOTH_BIND_RULE = {
    "articulo": "6.6.9", "apartado": "2", "pdfPage": 206, "printedPage": 204,
    "verbatim": "Cuando se establezca la altura por número de plantas y unidades métricas, ambas habrán de respetarse como máximos admisibles.",
    "note": "A '3 plantas / 11,50 m' pair is a CONJUNCTION, not a choice. Whichever binds first, binds."}

# ---- Sampling rule A: manzana-cerrada / street-referenced (rasante de la acera) -------------
SAMPLING_ACERA = {
    "point": "punto medio de la línea de fachada — sampled PER FAÇADE, on the vertical through that point",
    "planeAtPoint": "rasante de la acera en dicho punto",
    "perFacade": True,
    "isBlockCentroid": False,
    "isParcelCentroid": False,
    "articulo": "6.6.8", "apartado": "6.a)", "pdfPage": 205, "printedPage": 203,
    "verbatim": "La altura de cornisa se medirá en la vertical correspondiente al punto medio de la línea de fachada, tomando como cota de origen y referencia la rasante de la acera en dicho punto.",
    "amendment": "Artículo modificado por la MPG 00/343 (aprobación definitiva 08.11.2023 BOCM 27.11.2023)",
    "scopeCaveat": "Art. 6.6.8.6 opens 'Salvo que las normas zonales establezcan criterios específicos o las ordenanzas de los planeamientos de desarrollo los instituyan justificadamente'. Applied here only after verifying the zone's own chapter establishes none (or expressly redirects to art. 6.6.8).",
    "cases": [
        {"case": "no pavement exists", "apartado": "6.b)", "pdfPage": 205,
         "verbatim": "Cuando no exista acera, la medición se hará del mismo modo, tomando como cota de origen y referencia el punto de la vertical situado a la cota de rasante de la calle, incrementada con la altura correspondiente al declive transversal de la acera, calculado con pendiente del dos con cinco por ciento (2,5%)."},
        {"case": "corner parcel", "apartado": "6.c)", "pdfPage": 205,
         "verbatim": "En parcelas de esquina, la altura se tomará para cada una de las fachadas del modo antes descrito.",
         "note": "One datum PER FAÇADE, not one per parcel."},
        {"case": "sloping street / façade longer than 20 m", "apartado": "6.d)", "pdfPage": 205,
         "verbatim": "En calles en pendiente, la altura se medirá en el punto medio de la fachada. Si la longitud de la fachada es superior a veinte (20) metros, se descompondrá la línea de fachada en fracciones de longitud igual o inferior a veinte (20) metros. El número de escalonamientos será el menor posible, salvo que justificadamente por adaptación al entorno circundante sea conveniente incrementar el número de ellos. Ni la altura en metros, ni la expresada en plantas, podrá rebasarse en ninguno de los escalonamientos.",
         "note": "HARD 20 m segmentation ceiling. The envelope is a STEPPED solid: N segments of ≤20 m, each with its own datum at that segment's midpoint, each independently capped at the same metre AND storey figure. Escalonamiento buys no extra height."},
        {"case": "frontages to opposite streets", "apartado": "6.e)", "pdfPage": 206,
         "verbatim": "En parcelas con frentes a calles opuestas, entendiéndose por tales aquellas cuyos ejes forman entre sí un ángulo inferior a noventa (90) grados sexagesimales, la altura se medirá para el ancho de cada calle, manteniéndose esta altura hasta una profundidad determinada por la bisectriz del ángulo formado por la prolongación de las alineaciones oficiales."},
        {"case": "frontages to streets and plazas together", "apartado": "6.f)", "pdfPage": 206,
         "verbatim": "En parcelas con alineaciones oficiales a calles y plazas conjuntamente, se considerará la altura correspondiente a cada uno de dichos espacios públicos, tratándose, en función de la posición de la parcela respecto de ellas, como parcelas en esquina o parcelas con frentes a calles opuestas."},
        {"case": "mixed situations", "apartado": "7", "pdfPage": 206,
         "verbatim": "En situaciones mixtas, el modo de fijar la altura se establecerá combinando las reglas anteriores."},
    ],
    "l584Warning": "This is the rule PRYZM defect L-584 violates. Sampling one terrain point at the block centroid is WRONG for every parcel in this zone. Sample at the midpoint of each façade segment; segment at 20 m on sloping streets.",
}

# ---- Sampling rule B: aislada / project datum (cota de nivelación de planta baja) -----------
SAMPLING_PLANTA_BAJA = {
    "point": "not a terrain sample — the datum is a single horizontal plane (cota cero) fixed by the project",
    "planeAtPoint": "cota de nivelación de la planta baja",
    "perFacade": False,
    "isBlockCentroid": False,
    "isParcelCentroid": False,
    "articulo": "6.3.5", "apartado": "c)", "pdfPage": 193, "printedPage": 191,
    "verbatim": "…considerándose en edificación aislada la cota de nivelación de planta baja, que se tomará como cota cero (0)…",
    "note": "The plane is CHOSEN by the project, so there is no single terrain point to sample. It is nonetheless terrain-derived, because art. 6.6.15.1.b) boxes it into a ±150 cm window around a pavement rasante taken at a NAMED midpoint, and art. 6.3.5.c) caps it absolutely.",
    "absoluteCap": {"articulo": "6.3.5", "apartado": "c)", "pdfPage": 193,
                    "verbatim": "En ningún caso la cota de origen y referencia podrá situarse por encima de la cota de nivelación de la planta baja."},
    "steppedTerrainRule": {"articulo": "6.3.5", "apartado": "c)", "pdfPage": 193,
                           "verbatim": "Cuando se instituya como cota de origen y referencia la de nivelación de planta baja y por las necesidades de la edificación o por las características del terreno en que se asiente, deba escalonarse la misma, la medición de las alturas se realizará de forma independiente en cada una de las plataformas que la componga, sin que dicho escalonamiento de planta baja pueda traducirse en exceso de altura.",
                           "note": "The aislada analogue of the 20 m stepping rule: per-platform, independent, no height bonus."},
    "whereThePlaneMaySit": {
        "articulo": "6.6.15", "apartado": "1.b)", "pdfPage": 208, "printedPage": 206,
        "amendment": "Artículo modificado por la MPG 00/343 (aprobación definitiva 08.11.2023 BOCM 27.11.2023)",
        "cases": [
            {"case": "single frontage", "apartado": "1.b)i)",
             "verbatim": "Entre más/menos ciento cincuenta (150) centímetros respecto a la rasante de la acera en el punto medio del lindero frontal."},
            {"case": "opposite frontages", "apartado": "1.b)ii)",
             "verbatim": "En parcelas con linderos frontales a calles opuestas, el nivel de implantación de la planta baja se situará a más/menos ciento cincuenta (150) centímetros respecto al punto medio del segmento que une los puntos medios de dichos linderos frontales."},
            {"case": "corner parcel", "apartado": "1.b)iii)",
             "verbatim": "En parcelas de esquina, la cota de nivelación de planta baja deberá situarse entre más/menos ciento cincuenta (150) centímetros del punto medio de la rasante en la acera del lindero frontal de mayor longitud."},
            {"case": "three frontages / block head", "apartado": "1.b)iv)",
             "verbatim": "Las parcelas con tres frentes que constituyan cabeceras de manzanas, se tratarán como parcelas con linderos frontales a calles opuestas."},
            {"case": "triangular full block", "apartado": "1.b)v)",
             "verbatim": "Las parcelas coincidentes con manzanas completas de planta triangular se tratarán como parcelas con linderos frontales a calles opuestas, considerando los dos linderos de mayor longitud."},
            {"case": "polygonal full block, >3 sides", "apartado": "1.b)vi)",
             "verbatim": "Las parcelas coincidentes con manzanas completas de planta poligonal de más de tres lados, se tratarán como parcelas con linderos frontales a calles opuestas, considerando el lindero de mayor longitud y el enfrentado a él, que será el más largo cuando sean varios."},
            {"case": "multiple frontages with >3 m level difference", "apartado": "1.b)vii)",
             "verbatim": "En las parcelas con varios linderos frontales y desniveles entre estos superiores a tres (3) metros, cuando se dispongan distintos cuerpos de edificación, las plantas bajas de cada uno de ellos podrán situarse, alternativamente a la posición que corresponda según la tipología de la parcela, en la forma establecida para las parcelas con un solo lindero frontal en el apartado b.i), respecto del lindero más cercano al que dé frente el cuerpo de edificación considerado."},
            {"case": "cap on raising the parcel rasante above neighbours", "apartado": "1.b)viii)",
             "verbatim": "En sus linderos, la rasante de las parcelas no se elevará más de 1,50 m respecto de las colindantes, salvo en situaciones preexistentes, en cuyo caso se presentará estudio de implantación que reduzca en lo posible el desnivel original, el cual no podrá incrementarse en ningún caso."},
            {"case": "topographic justification", "apartado": "1.b)ix)",
             "verbatim": "Cuando por la configuración topográfica, forma, dimensiones de una parcela, o por la situación del edificio en la misma, se justifique, la planta baja podrá situarse en posiciones distintas de las reguladas anteriormente mediante la formulación, en su caso, de Estudio de Detalle.",
             "note": "Discretionary escape. An envelope generator cannot anticipate it."},
        ],
    },
}

# ---- Sampling rule C: NZ 8's own rule (ground contact at the ACCESS façade midpoint) --------
SAMPLING_NZ8_ACCESS = {
    "point": "punto medio de la fachada en que se sitúa el acceso al edificio — cota del CONTACTO de la edificación con el terreno at that point",
    "planeAtPoint": "cota del contacto de la edificación con el terreno",
    "perFacade": False,
    "isBlockCentroid": False,
    "isParcelCentroid": False,
    "articulo": "8.8.10", "apartado": "1", "pdfPage": 443, "printedPage": 441,
    "verbatim": "En los grados 1º, 2º, 3º, 4º y 6º, la cota del origen y referencia será la del contacto de la edificación con el terreno en el punto medio de la fachada en que se sitúa el acceso al edificio, respecto de la cual la edificación no podrá superar una altura de tres (3) plantas, ni una altura de cornisa de mil cincuenta (1.050) centímetros.",
    "secondLimit": {
        "articulo": "8.8.10", "apartado": "1", "pdfPage": 443,
        "verbatim": "En el resto de las fachadas no se podrá superar una altura de cornisa de mil doscientos (1.200) centímetros, medidos desde la cota del terreno en los puntos medios de cada fachada.",
        "note": "A SECOND, HIGHER limit (12,00 m) measured from a DIFFERENT datum (terrain at the midpoint of EACH other façade). Both bind. On sloping ground the 12,00 m limit is what actually governs the downhill side."},
    "note": "NZ 8 institutes its own datum under the art. 6.3.5.c) / 6.6.8.6 escape clause. It is neither the plain aislada rule nor the manzana-cerrada rule: it is ground CONTACT (not pavement rasante) at the ACCESS façade midpoint.",
}


def _facade_note(zone_chapter, verified):
    return {"generalRule": "art. 6.6.8 apartado 6 + art. 6.3.5 apartado c)",
            "zoneOverride": None,
            "escapeClauseCheck": verified}


# zoneCode prefix -> (referencePlane, samplingRule, datumSource)
# datumSource records WHICH article supplies the datum, so a reviewer can see at a glance
# whether it came from the norma zonal or from the Título 6 default.
_ACERA_PLANE = "rasante de la acera en el punto medio de la línea de fachada"
_PB_PLANE = "cota de nivelación de la planta baja"

HEIGHT_DATUM = {
    # NZ 1 — manzana cerrada (art. 8.1.2.2). Chapter 8.1 states NO measurement criteria.
    "1": (_ACERA_PLANE, SAMPLING_ACERA, {
        "from": "Título 6 general rule (no zone override)",
        "typology": {"articulo": "8.1.2", "apartado": "2", "pdfPage": 367,
                     "verbatim": "La tipología corresponde a la de edificación entre medianerías formando manzana cerrada."},
        "escapeClauseCheck": "Keyword sweep over PDF pp. 367-386 (the whole of Chapter 8.1) for 'cota de origen', 'cota de nivelación', 'rasante de la acera', '6.6.8', 'medición de la altura', 'se medirá': ZERO hits. Chapter 8.1 takes no 'criterios específicos' escape from art. 6.6.8.6, so the general manzana-cerrada rule applies unmodified.",
        "valueCaveat": "Grados 1º-5º have NO height VALUE — art. 8.1.15.1 leaves altura de cornisa and número de plantas to the CPPHAN case by case. The datum below is the plane against which whatever the CPPHAN fixes would be measured; it is not itself a value and does not make grados 1º-5º automatable.",
    }),
    # NZ 4 — manzana cerrada (chapter heading). Chapter 8.4 states NO measurement criteria.
    "4": (_ACERA_PLANE, SAMPLING_ACERA, {
        "from": "Título 6 general rule (no zone override)",
        "typology": {"articulo": "8.4", "apartado": "capítulo", "pdfPage": 410,
                     "verbatim": "CAPÍTULO 8.4. CONDICIONES PARTICULARES DE LA ZONA 4: EDIFICACIÓN EN MANZANA CERRADA"},
        "escapeClauseCheck": "Keyword sweep over PDF pp. 410-418 (the whole of Chapter 8.4) for 'cota de origen', 'cota de nivelación', 'rasante de la acera', '6.6.8', '6.3.5', 'se medirá': no datum article. There is no equivalent of NZ 9's art. 8.9.11 or NZ 5's art. 8.5.10. Art. 8.4.10 gives the table and nothing else.",
    }),
    # NZ 5 — bloques abiertos (aislada). Art. 8.5.10 institutes the datum expressly.
    "5": (_PB_PLANE, SAMPLING_PLANTA_BAJA, {
        "from": "norma zonal, express",
        "articulo": "8.5.10", "apartado": "párrafo único", "pdfPage": 421, "printedPage": 419,
        "verbatim": "La cota de origen y referencia coincide con la de nivelación de la planta baja y se situará de acuerdo con las determinaciones del art. 6.6.15.",
        "measurementCaveat": "NZ 5 regulates altura de CORONACIÓN (art. 8.5.9.1), not cornisa. Do NOT compare its 51/30/15 m figures with the cornisa figures of NZ 4 / NZ 7 / NZ 8 / NZ 9.",
    }),
    # NZ 7 grado 1º — aislada typology, but the zone OVERRIDES to the pavement rasante.
    "7.1": (_ACERA_PLANE, SAMPLING_ACERA, {
        "from": "norma zonal, express — OVERRIDES the art. 6.3.5.c) aislada default",
        "articulo": "8.7.11", "apartado": "1", "pdfPage": 435, "printedPage": 433,
        "verbatim": "En el grado 1º, la edificación no podrá superar una altura de cuatro (4) plantas, ni una altura de cornisa superior a mil cuatrocientos cincuenta (1.450) centímetros, medida desde la rasante de la acera en el punto medio de la línea de fachada.",
        "trap": "NZ 7 grado 1º is edificación AISLADA (art. 8.7.1.2), so the art. 6.3.5.c) default would be the cota de nivelación de planta baja — but art. 8.7.11.1 expressly overrides it to the pavement rasante at the façade midpoint. Deriving the datum from typology alone gets this grado WRONG. Read the norma zonal first, fall back to 6.3.5.c) second.",
    }),
    # NZ 7 grados 2º/3º — aislada, datum express.
    "7.2": (_PB_PLANE, SAMPLING_PLANTA_BAJA, {
        "from": "norma zonal, express",
        "articulo": "8.7.11", "apartado": "2", "pdfPage": 435, "printedPage": 433,
        "verbatim": "En los grados 2º y 3º, la edificación no podrá superar un altura de tres (3) plantas, ni una altura de cornisa de mil cincuenta (1.050) centímetros, midiendo ambos valores desde la cota de nivelación de planta baja.",
    }),
    "7.3": (_PB_PLANE, SAMPLING_PLANTA_BAJA, {
        "from": "norma zonal, express",
        "articulo": "8.7.11", "apartado": "2", "pdfPage": 435, "printedPage": 433,
        "verbatim": "En los grados 2º y 3º, la edificación no podrá superar un altura de tres (3) plantas, ni una altura de cornisa de mil cincuenta (1.050) centímetros, midiendo ambos valores desde la cota de nivelación de planta baja.",
    }),
    # NZ 9 grados 1º/2º — art. 8.9.11.a) REDIRECTS to art. 6.6.8. Redirect now followed.
    "9.1": (_ACERA_PLANE, SAMPLING_ACERA, {
        "from": "norma zonal redirect to Título 6",
        "articulo": "8.9.11", "apartado": "a)", "pdfPage": 455, "printedPage": 453,
        "verbatim": "En los grados 1º y 2º, la medición de la altura se hará conforme a lo dispuesto en el artículo 6.6.8.",
        "resolution": "The redirect lands on art. 6.6.8 apartado 6.a). This CLOSES the pass-01 placeholder 'the datum sits in Título 6, outside Chapter 8.9'.",
    }),
    "9.2": (_ACERA_PLANE, SAMPLING_ACERA, {
        "from": "norma zonal redirect to Título 6",
        "articulo": "8.9.11", "apartado": "a)", "pdfPage": 455, "printedPage": 453,
        "verbatim": "En los grados 1º y 2º, la medición de la altura se hará conforme a lo dispuesto en el artículo 6.6.8.",
        "resolution": "The redirect lands on art. 6.6.8 apartado 6.a). This CLOSES the pass-01 placeholder 'the datum sits in Título 6, outside Chapter 8.9'.",
    }),
}

# NZ 9 grados 3º/4º/5º
for _z in ("9.3", "9.4", "9.5"):
    HEIGHT_DATUM[_z] = (_PB_PLANE, SAMPLING_PLANTA_BAJA, {
        "from": "norma zonal, express",
        "articulo": "8.9.11", "apartado": "b)", "pdfPage": 455, "printedPage": 453,
        "verbatim": "En los grados 3º, 4º y 5º, la medición de la altura se realizará respecto a la cota de nivelación de la planta baja, situada según lo dispuesto en el artículo 6.6.15.",
    })

# NZ 8 grados 1º/2º/3º/4º/6º use the access-façade rule; grado 5º uses planta baja.
_NZ8_ACCESS_PLANE = ("cota del contacto de la edificación con el terreno en el punto medio de la "
                     "fachada en que se sitúa el acceso al edificio (cota de origen y referencia)")
for _z in ("8.1", "8.2", "8.3", "8.4", "8.6"):
    HEIGHT_DATUM[_z] = (_NZ8_ACCESS_PLANE, SAMPLING_NZ8_ACCESS, {
        "from": "norma zonal, express — institutes its own datum under the art. 6.3.5.c) escape",
        "articulo": "8.8.10", "apartado": "1", "pdfPage": 443, "printedPage": 441,
        "verbatim": "En los grados 1º, 2º, 3º, 4º y 6º, la cota del origen y referencia será la del contacto de la edificación con el terreno en el punto medio de la fachada en que se sitúa el acceso al edificio…",
    })
HEIGHT_DATUM["8.5"] = (_PB_PLANE, SAMPLING_PLANTA_BAJA, {
    "from": "norma zonal, express",
    "articulo": "8.8.10", "apartado": "2", "pdfPage": 443, "printedPage": 441,
    "verbatim": "En el grado 5º, la altura de la edificación no podrá exceder de dos (2) plantas ni de siete (7) metros a cornisa, medidos desde la cota de nivelación de la planta baja.",
})


def _lookup_datum(zone_code):
    """Longest-prefix match on zoneCode: '9.4.a' -> '9.4', '1.3' -> '1'."""
    for k in sorted(HEIGHT_DATUM, key=len, reverse=True):
        if zone_code == k or zone_code.startswith(k + "."):
            return HEIGHT_DATUM[k]
    return None


HEIGHT_PARAMS = ("maxHeight_m", "maxFloors")

# Pass-01 placeholders that this pass is entitled to replace.
_UNRESOLVED_PREFIXES = ("medición conforme",)


def _norm_plane(s):
    """Normalise a datum string for comparison ONLY.

    The Compendio itself spells the same plane several ways ('cota de nivelación de planta
    baja' in art. 8.7.11.2, 'cota de nivelación de la planta baja' in art. 8.5.9.1). Those are
    the ordinance's own words and each record keeps the spelling of the article it cites; the
    normalisation exists so that a REAL disagreement still raises.
    """
    s = s.lower().replace(",", " ")
    for a, b in (("de la planta baja", "de planta baja"),
                 ("en el punto medio", "punto medio"),
                 ("del contacto", "contacto"), ("de contacto", "contacto")):
        s = s.replace(a, b)
    return " ".join(s.split())


def stamp_height_datums(records):
    """Fill samplingRule / datumSource on every height record; fill referencePlane where null.

    Closes the pass-01 gap recorded in COMPENDIO-2025-EXTRACTION-01.md §8.6.

    A referencePlane already transcribed from the zone's own chapter is PRESERVED verbatim —
    this pass only checks it agrees (modulo the ordinance's own spelling variants) and raises
    on a real divergence rather than silently overwriting a cited string.
    """
    for r in records:
        if r.get("parameter") not in HEIGHT_PARAMS:
            continue
        hit = _lookup_datum(r["zoneCode"])
        if hit is None:
            raise AssertionError(
                "no height datum registered for zoneCode %r — refusing to emit a null datum"
                % r["zoneCode"])
        plane, sampling, src = hit
        existing = r.get("referencePlane")
        stale = bool(existing) and existing.startswith(_UNRESOLVED_PREFIXES)
        if existing and not stale:
            a, b = _norm_plane(existing), _norm_plane(plane)
            # Some pass-01 strings append an inline citation ('… (art. 8.9.11.b) …)') or a
            # parenthetical gloss. Prefix-equality is enough to prove the same plane.
            if not (a.startswith(b) or b.startswith(a)):
                raise AssertionError(
                    "datum disagreement for %s: record says %r, HEIGHT_DATUM says %r"
                    % (r["zoneCode"], existing, plane))
            # keep the zone's own wording
        else:
            if stale:
                r["referencePlaneSupersedes"] = existing
            r["referencePlane"] = plane
        r["samplingRule"] = sampling
        r["datumSource"] = src
        r["datumChain"] = DATUM_CHAIN
        if r["parameter"] == "maxFloors":
            r["storeyCountRule"] = STOREY_COUNT_RULE
        r["bothBind"] = BOTH_BIND_RULE
    return records


# ---------------------------------------------------------------- NZ 5
NZ5_FAR = {"5.1": (2.0, "Dos (2) metros cuadrados por cada metro cuadrado."),
           "5.2": (1.6, "Uno con seis (1,6) metros cuadrados por cada metro cuadrado."),
           "5.3": (1.4, "Uno con cuatro (1,4) metros cuadrados por cada metro cuadrado.")}
NZ5_H = {"5.1": (14, 51, "En grado 1º: Catorce (14) plantas y cincuenta y un (51) metros."),
         "5.2": (8, 30, "En grado 2º: Ocho (8) plantas y treinta (30) metros."),
         "5.3": (4, 15, "En grado 3º: Cuatro (4) plantas y quince (15) metros.")}


def nz5():
    out = []
    for z, (v, vb) in NZ5_FAR.items():
        out.append(rec(z, "farRatio", v, "m²/m²", "8.5", "8.5.8", z[-1] + ")",
                       421, vb,
                       measurement="coeficiente máximo de edificabilidad neta",
                       denominatorScope="parcela edificable (neta)"))
    for z, (fl, h, vb) in NZ5_H.items():
        out.append(rec(z, "maxFloors", fl, "plantas", "8.5", "8.5.9", "1." + z[-1] + ")",
                       421, vb, measurement="número de plantas"))
        out.append(rec(
            z, "maxHeight_m", h, "m", "8.5", "8.5.9", "1." + z[-1] + ")", 421, vb,
            measurement="coronación",
            referencePlane="cota de nivelación de la planta baja",
            heightDatumWarning=(
                "NZ 5 regulates altura de CORONACIÓN, not altura de cornisa. "
                "Do NOT compare these numbers with the cornisa values of NZ 4 / NZ 7 / NZ 8 / NZ 9."),
            datumCitation={
                "articulo": "8.5.9", "apartado": "1", "pdfPage": 421,
                "verbatim": "La edificación no rebasará en número de plantas y altura de coronación medida desde la cota de nivelación de planta baja:"},
            extra={"articulo": "8.5.10", "pdfPage": 421,
                   "verbatim": "La cota de origen y referencia coincide con la de nivelación de la planta baja y se situará de acuerdo con las determinaciones del art. 6.6.15."}))
    for z in NZ5_FAR:
        out.append(rec(z, "maxCoverage", 50, "%", "8.5", "8.5.7", "a)", 421,
                       "En plantas sobre rasante: El cincuenta por ciento (50%) de la superficie de la parcela edificable.",
                       measurement="ocupación sobre rasante",
                       denominatorScope="parcela edificable",
                       notes="Art. 8.5.7 opens 'En todos los grados' — identical for grados 1º, 2º and 3º."))
        out.append(rec(z, "maxCoverage", 100, "%", "8.5", "8.5.7", "b)", 421,
                       "En plantas bajo rasante: La totalidad de la superficie de la parcela edificable.",
                       measurement="ocupación bajo rasante",
                       referencePlane="bajo rasante",
                       denominatorScope="parcela edificable"))
        # Q2: rule KIND
        out.append(rec(
            z, "setbackSide_m", 5, "m", "8.5", "8.5.6", "4.a)", 420,
            "La edificación se dispondrá de modo que sus fachadas guarden una separación igual o superior a H/2 de su altura de coronación, respecto del lindero correspondiente, con mínimo de cinco (5) metros.",
            measurement="FLOOR of a height-proportional rule to the PARCEL BOUNDARY (separación a linderos). Governing value = max(5, H/2) where H = altura de coronación of the facing building body. 5 m binds only while H ≤ 10 m.",
            referencePlane="lindero de parcela",
            formula="max(5, altura_de_coronación / 2)",
            appliesTo="all linderos ('el lindero correspondiente') — laterales and testero alike; Ch. 8.5 does not distinguish them.",
            heightDefinition={
                "articulo": "8.5.6", "apartado": "2", "pdfPage": 419,
                "verbatim": "La posición de la nueva edificación se define en relación a su altura (H) de coronación, medida desde la cota de nivelación de la planta baja. Cuando la edificación tenga cuerpos de distinta altura de coronación, se tomará como valor de la altura, el correspondiente al cuerpo o cuerpos de edificación enfrentados con el lindero, viario o espacio público al que hace frente la parcela."},
            exception={"articulo": "8.5.6", "apartado": "4.b)",
                       "verbatim": "La edificación podrá adosarse a los linderos de parcela en las condiciones generales reguladas en el artículo 6.3.13."},
            amendment="Artículo modificado por la MPG 00/343 (aprobación definitiva 08.11.2023 BOCM 27.11.2023)"))
        out.append(rec(
            z, "setbackFront_m", None, "m", "8.5", "8.5.6", "3", 420,
            "La edificación guardará una separación igual a H/2 de su altura de coronación respecto al eje de la calle o del espacio libre público al que hace frente la parcela. En el caso de la existencia de una zona verde de acompañamiento de viario interpuesta entre la parcela edificable y la correspondiente vía, la separación se medirá al eje del conjunto de ambas.",
            unknownReason=(
                "NZ 5 imposes NO setback measured from the alineación oficial. The front rule is measured "
                "from the STREET CENTRELINE (eje de la calle), so the equivalent distance from the parcel "
                "frontage is H/2 minus half the street width and is parcel-and-street specific — it can be "
                "zero or negative (i.e. non-binding) on wide streets. Emitting a number here would be an "
                "invention. Implement Art. 8.5.6.3 as its own rule type, not as a front setback."),
            measurement="separación al EJE de la calle o espacio libre público (street centreline), NOT to the alineación oficial",
            referencePlane="eje de la calle / eje del conjunto vía+zona verde de acompañamiento",
            formula="distancia_al_eje >= altura_de_coronación / 2",
            confidence="exact",
            amendment="Artículo modificado por la MPG 00/343 (aprobación definitiva 08.11.2023 BOCM 27.11.2023)"))
        out.append(rec(
            z, "buildableDepth_m", None, None, "8.5", None, None, 419,
            None,
            unknownReason=(
                "Chapter 8.5 establishes no fondo edificable. NZ 5 is an aislada/bloques-abiertos "
                "typology governed by separations, coverage and FAR, not by a build depth. No article "
                "exists to cite, so the record is emitted uncited-and-null per the rules rather than guessed."),
            confidence="exact"))
        out.append(rec(z, "permittedUse", "residencial", None, "8.5", "8.5.1", "3", 419,
                       "Su uso cualificado es el residencial.",
                       measurement="uso cualificado"))
    return out


# ---------------------------------------------------------------- NZ 7
NZ7_GRADO = {"7.1.a": "1", "7.1.b": "1", "7.2.e": "2"}

# The grado 2º FAR question raised (unresolved) in COMPENDIO-2025-EXTRACTION-01.md §9.
# Resolved 2026-07-31 by reading the whole of Chapter 8.7 (PDF pp. 432-438).
# Full write-up: findings/COMPENDIO-2025-HEIGHT-DATUM-AND-NZ7.md.
NZ7E_RESOLUTION = {
    "verdict": "APPARENT, NOT REAL — resolved by scope. Both values are correct and they govern DISJOINT sets of parcels.",
    "governing": {"value": 1.0, "articulo": "8.7.20", "scope": "grado 2º nivel 'e' especial"},
    "displaced": {"value": 0.5, "articulo": "8.7.9", "apartado": "1.b)",
                  "scope": "grado 2º outside nivel 'e' (residential uso cualificado)"},
    "sameDenominator": "Art. 8.7.9.1 says 'coeficiente de edificabilidad NETA sobre PARCELA EDIFICABLE'; art. 8.7.20 says 'por metro cuadrado de PARCELA EDIFICABLE'. Identical denominator and character — this is NOT a neta-vs-bruta artefact.",
    "notACrossReference": "Art. 8.7.20 states an independent number and cites no article; art. 8.7.9 does not mention niveles at all.",
    "reasoning": [
        "1. SUBSET. Art. 8.7.9.1 fixes the coefficient 'para cada GRADO' and enumerates exactly three (1º, 2º, 3º) — it legislates at grado level. Art. 8.7.20 is titled, in the document's own words, 'Condiciones particulares del grado 2º Nivel \"e\" especial' — it legislates at NIVEL level, for a named sub-division established by art. 8.7.17.b). Nivel 'e' is a proper subset of grado 2º, so the general grado figure is displaced within it.",
        "2. DECISIVE — the two figures are mutually unreachable. Art. 8.7.20 provides 'Queda prohibido expresamente el uso residencial.' The 0,5 of art. 8.7.9.1.b) is the coefficient for the grado's uso cualificado, which art. 8.7.1.3 declares residential AND expressly carves nivel 'e' out of. A nivel-'e' parcel therefore cannot be developed under the residential regime at all; the only permitted development is the terciario one, whose edificabilidad art. 8.7.20 fixes at 1,0. There is NO parcel to which both numbers could apply.",
        "3. The alternative reading is self-defeating. If 1,0 were merely an ADDITIONAL cap stacked on 0,5, the lower 0,5 would always bind and art. 8.7.20's edificabilidad sentence would be inoperative in every case. A reading that renders an express provision a dead letter is not available. 8.7.20 REPLACES; it does not stack.",
        "4. Structural precedent in the same chapter. Art. 8.7.18.2.b)i) attaches a nivel-specific FAR of 1,2 m²/m² to grado 1º nivel b for an alternative use, against 0,8 for grado 1º generally (art. 8.7.9.1.a). The Compendio demonstrably does attach FARs to niveles when a non-residential regime is taken up; 8.7.9/8.7.20 is the same construction one grado over. That 1,2 record was already emitted in pass 01 without being flagged as a conflict — consistency demands the same treatment here.",
    ],
    "counterArgumentConsidered": {
        "argument": "Art. 8.7.17 opens 'A los efectos de aplicación de las condiciones referentes a los usos compatibles y autorizables, se distinguen … los siguientes niveles' — on a strict reading a nivel governs uses only and could not carry a building parameter, making 8.7.20's 1,0 a drafting error.",
        "whyItFails": [
            "Art. 8.7.1.3 already assigns nivel 'e' a different USO CUALIFICADO, which is neither a uso compatible nor a uso autorizable — so 8.7.17's declared scope is already narrower than what the chapter actually does with nivel 'e'. 8.7.17 describes the ordinary function of niveles; it is not an exhaustive limit on them.",
            "Both articles are marked (N-1) — equal normative rank, so there is no rank tiebreak in 8.7.9's favour. A specific express provision of equal rank prevails over a general one within its scope.",
            "The Sección-placement objection (8.7.20 sits in 'Sección Cuarta. Otras condiciones de uso') would equally invalidate art. 8.7.18.2.b)i)'s 1,2 m²/m², which also sits in a use section and which nobody disputes. Section placement is not doing normative work here.",
        ],
    },
    "honestLimit": "The Compendio contains NO express derogation clause linking art. 8.7.20 to art. 8.7.9. This resolution is a scope reading, not a stated hierarchy. It rests on 8.7.20's own title, 8.7.17's subset relation, and — decisively — 8.7.1.3's carve-out plus 8.7.20's express residential prohibition. Both citations are retained on both records so a reviewer can overturn the reasoning without re-reading the PDF.",
    "notDisplaced": "Art. 8.7.20 speaks only to uso cualificado, edificabilidad and the planta-baja use list. Grado 2º's other figures continue to apply to nivel 'e': parcela mínima 2.500 m² (8.7.4.1.b), lindero frontal ≥10 m + ⌀30 m circle (8.7.5), retranqueo >10 m (8.7.7.1), separación a linderos ≥7 m (8.7.7.2), ocupación sobre+bajo rasante ≤30 % (8.7.8.2), 3 plantas / 10,50 m cornisa from the cota de nivelación de planta baja (8.7.11.2). Art. 8.7.10.b)'s dwelling cap is moot — residential is prohibited.",
    "remainingBlocker": "This resolves WHAT applies in nivel 'e'; it does not resolve WHICH parcels are in it. Art. 8.7.17.b) establishes the nivel but no article maps it to ground — that lives on the Plano de Ordenación. Until the GIS layer distinguishes 7.2 from 7.2.e, the 1,0 cannot be applied to a specific parcel. This is now the binding blocker on NZ 7 grado 2º, and it is a DATA problem, not a legal one.",
    "citations": {
        "8.7.9.1.b)": {"pdfPage": 434, "printedPage": 432, "value": 0.5,
                       "verbatim": "1. El coeficiente de edificabilidad neta sobre parcela edificable se establece para cada grado en: … b) Grado 2º: Cinco (5) metros cuadrados por cada diez (10) metros cuadrados.",
                       "amendment": "Artículo modificado por la MPG 00/343 (aprobación definitiva 08.11.2023 BOCM 27.11.2023)"},
        "8.7.20": {"pdfPage": 438, "printedPage": 436, "value": 1.0,
                   "verbatim": "En el grado 2º nivel \"e\" especial, el uso cualificado es, el terciario en sus clases de oficinas y hospedaje. La edificabilidad máxima es de un (1) metro cuadrado por metro cuadrado de parcela edificable, pudiendo implantarse en planta baja el resto de usos terciarios, excepto el mediano comercio y grandes superficies comerciales. Queda prohibido expresamente el uso residencial.",
                   "amendment": None,
                   "note": "No footnote — original PGOUM-97 text, never amended."},
        "8.7.1.3": {"pdfPage": 432, "printedPage": 430,
                    "verbatim": "Su uso cualificado es el residencial. Excepto en el grado 2º nivel \"e\", en el que el uso cualificado es el Terciario en sus clases de Oficina y Hospedaje.",
                    "note": "The chapter carves nivel 'e' out of the use regime at the very top — an independent, deliberate act."},
        "8.7.17.b)": {"pdfPage": 436, "printedPage": 434,
                      "verbatim": "A los efectos de aplicación de las condiciones referentes a los usos compatibles y autorizables, se distinguen en función de los grados diferenciados en el art. 8.7.3, los siguientes niveles: a) En el grado 1º, niveles a y b. b) En el grado 2º, un nivel \"e\" especial. c) En el grado 3º, no se establecen niveles.",
                      "note": "Establishes nivel 'e' ⊂ grado 2º."},
        "8.7.18.2.b)i)": {"pdfPage": 437, "printedPage": 435, "value": 1.2,
                          "verbatim": "Terciario Oficinas, Hospedaje, Recreativo, Otros Servicios Terciarios y Comercial en las categorías de pequeño y mediano comercio, en edificio exclusivo, con una edificabilidad máxima de doce (12) metros cuadrados por cada diez (10) metros cuadrados de parcela edificable.",
                          "note": "Structural precedent: a nivel-specific alternative-use FAR, one grado over."},
    },
}


def nz7():
    out = []
    for z, g in NZ7_GRADO.items():
        if g == "1":
            out += [
                rec(z, "farRatio", 0.8, "m²/m²", "8.7", "8.7.9", "1.a)", 434,
                    "Grado 1º: Ocho (8) metros cuadrados por cada diez (10) metros cuadrados.",
                    measurement="coeficiente de edificabilidad neta",
                    denominatorScope="parcela edificable (neta)",
                    verbatimNormalisedNote="'Ocho (8) m² por cada diez (10) m²' = 0,8 m²/m². The verbatim ratio form is preserved.",
                    amendment="Artículo modificado por la MPG 00/343 (aprobación definitiva 08.11.2023 BOCM 27.11.2023)"),
                rec(z, "maxCoverage", 35, "%", "8.7", "8.7.8", "1", 434,
                    "En el grado 1º, la ocupación sobre rasante será inferior o igual al treinta y cinco por ciento (35%) de la superficie de la parcela edificable y la ocupación bajo rasante podrá alcanzar el sesenta por ciento (60%)",
                    measurement="ocupación sobre rasante", denominatorScope="parcela edificable",
                    amendment="Artículo modificado por la MPG 00/343 (aprobación definitiva 08.11.2023 BOCM 27.11.2023)"),
                rec(z, "maxCoverage", 60, "%", "8.7", "8.7.8", "1", 434,
                    "la ocupación bajo rasante podrá alcanzar el sesenta por ciento (60%), pudiendo en plantas enteramente subterráneas, en parcelas con superficie hasta mil seiscientos (1.600) metros cuadrados, ocuparse la totalidad de la parcela edificable y en parcelas con superficie superior a mil seiscientos (1.600) metros cuadrados, dicha ocupación será el resultado de aplicar el cien por cien (100%) a los mil seiscientos (1.600) metros cuadrados primeros, incrementados con el sesenta por ciento (60%) sobre el resto de la superficie.",
                    measurement="ocupación bajo rasante — base value; a tiered override applies to plantas enteramente subterráneas",
                    referencePlane="bajo rasante", denominatorScope="parcela edificable",
                    tieredOverride="Plantas enteramente subterráneas: 100% for parcels ≤1.600 m²; for parcels >1.600 m², 100% of the first 1.600 m² plus 60% of the remainder."),
                rec(z, "maxFloors", 4, "plantas", "8.7", "8.7.11", "1", 435,
                    "En el grado 1º, la edificación no podrá superar una altura de cuatro (4) plantas, ni una altura de cornisa superior a mil cuatrocientos cincuenta (1.450) centímetros, medida desde la rasante de la acera en el punto medio de la línea de fachada."),
                rec(z, "maxHeight_m", 14.5, "m", "8.7", "8.7.11", "1", 435,
                    "no podrá superar una altura de cuatro (4) plantas, ni una altura de cornisa superior a mil cuatrocientos cincuenta (1.450) centímetros, medida desde la rasante de la acera en el punto medio de la línea de fachada",
                    measurement="cornisa",
                    referencePlane="rasante de la acera, en el punto medio de la línea de fachada",
                    verbatimUnitNote="Stated as 1.450 centímetros; 14,5 m is the same value in metres."),
                rec(z, "setbackFront_m", 4, "m", "8.7", "8.7.6", "1.b)", 433,
                    "Respecto al resto del viario el retranqueo mínimo será de cuatro (4) metros.",
                    measurement="retranqueo mínimo a la alineación oficial",
                    referencePlane="alineación oficial",
                    exception={"apartado": "1.a)",
                               "verbatim": "El retranqueo mínimo a la alineación oficial en la calle Arturo Soria será de cinco (5) metros.",
                               "note": "Street-specific: 5 m on calle Arturo Soria."}),
                rec(z, "setbackSide_m", 4, "m", "8.7", "8.7.6", "2.a)", 433,
                    "La separación mínima de las fachadas y los linderos de parcela será de cuatro (4) metros.",
                    measurement="separación mínima a linderos de parcela",
                    referencePlane="lindero de parcela",
                    appliesTo="all linderos — the article says 'los linderos de parcela' without distinguishing lateral from testero.",
                    exception={"apartado": "2.b)",
                               "verbatim": "Se admite la edificación adosada a uno de los linderos laterales en las condiciones reguladas en el art. 6.3.13."}),
                rec(z, "setbackRear_m", 4, "m", "8.7", "8.7.6", "2.a)", 433,
                    "La separación mínima de las fachadas y los linderos de parcela será de cuatro (4) metros.",
                    measurement="separación mínima a linderos de parcela (no separate testero rule exists in grado 1º)",
                    referencePlane="lindero de parcela"),
                rec(z, "permittedUse", "residencial", None, "8.7", "8.7.1", "3", 432,
                    "Su uso cualificado es el residencial. Excepto en el grado 2º nivel \"e\", en el que el uso cualificado es el Terciario en sus clases de Oficina y Hospedaje.",
                    measurement="uso cualificado"),
            ]
            if z == "7.1.b":
                out.append(rec(
                    z, "farRatio", 1.2, "m²/m²", "8.7", "8.7.18", "2.b)i)", 437,
                    "Terciario Oficinas, Hospedaje, Recreativo, Otros Servicios Terciarios y Comercial en las categorías de pequeño y mediano comercio, en edificio exclusivo, con una edificabilidad máxima de doce (12) metros cuadrados por cada diez (10) metros cuadrados de parcela edificable.",
                    measurement="ALTERNATIVE-USE ceiling — applies only to the listed terciario uses in edificio exclusivo, NOT to the residential uso cualificado (which stays at 0,8 per Art. 8.7.9)",
                    denominatorScope="parcela edificable",
                    scopeWarning="Nivel-b-only, alternative-use-only. Do not apply to residential development.",
                    amendment="Artículo modificado por MPG 00/334 (19.01.2012) y PE 00/308 (27.01.2005)"))
        else:  # grado 2 (nivel e)
            out += [
                rec(z, "farRatio", 1.0, "m²/m²", "8.7", "8.7.20", "párrafo único (el artículo no tiene apartados numerados)", 438,
                    "En el grado 2º nivel \"e\" especial, el uso cualificado es, el terciario en sus clases de oficinas y hospedaje. La edificabilidad máxima es de un (1) metro cuadrado por metro cuadrado de parcela edificable, pudiendo implantarse en planta baja el resto de usos terciarios, excepto el mediano comercio y grandes superficies comerciales. Queda prohibido expresamente el uso residencial.",
                    measurement="edificabilidad máxima — GOVERNING value for grado 2º nivel 'e'",
                    denominatorScope="parcela edificable",
                    conflictResolution=NZ7E_RESOLUTION,
                    confidence="resolved-by-scope"),
                rec(z, "farRatio", 0.5, "m²/m²", "8.7", "8.7.9", "1.b)", 434,
                    "Grado 2º: Cinco (5) metros cuadrados por cada diez (10) metros cuadrados.",
                    measurement="coeficiente de edificabilidad neta — the general grado 2º value; DISPLACED inside nivel 'e' by art. 8.7.20",
                    denominatorScope="parcela edificable (neta)",
                    appliesTo="grado 2º OUTSIDE nivel 'e' (residential uso cualificado). Retained on this record so the 7.2.e entry carries both readings, but it is NOT the operative value for a nivel-'e' parcel.",
                    supersededWithinScope={
                        "by": {"articulo": "8.7.20", "value": 1.0, "pdfPage": 438},
                        "scope": "grado 2º nivel 'e' especial",
                        "see": "conflictResolution on the 1,0 m²/m² record"},
                    confidence="superseded-in-scope",
                    amendment="Artículo modificado por la MPG 00/343 (aprobación definitiva 08.11.2023 BOCM 27.11.2023)"),
                rec(z, "maxCoverage", 30, "%", "8.7", "8.7.8", "2", 434,
                    "En el grado 2º, la ocupación de la parcela por el conjunto de edificaciones situadas sobre y bajo rasante, no podrá ser superior al treinta por ciento (30%) de la superficie de parcela edificable.",
                    measurement="ocupación del CONJUNTO sobre y bajo rasante (a single combined budget, not two separate ones)",
                    denominatorScope="parcela edificable"),
                rec(z, "maxFloors", 3, "plantas", "8.7", "8.7.11", "2", 435,
                    "En los grados 2º y 3º, la edificación no podrá superar un altura de tres (3) plantas, ni una altura de cornisa de mil cincuenta (1.050) centímetros, midiendo ambos valores desde la cota de nivelación de planta baja."),
                rec(z, "maxHeight_m", 10.5, "m", "8.7", "8.7.11", "2", 435,
                    "no podrá superar un altura de tres (3) plantas, ni una altura de cornisa de mil cincuenta (1.050) centímetros, midiendo ambos valores desde la cota de nivelación de planta baja",
                    measurement="cornisa",
                    referencePlane="cota de nivelación de planta baja",
                    extra={"verbatim": "Sobre la última planta permitida, se consiente una (1) planta con una superficie máxima construida del diez por ciento (10%) de la superficie construida de la planta sobre la que se sitúa, siempre que su altura de coronación no supere los mil doscientos cincuenta (1.250) centímetros, medidos desde la cota de nivelación de planta baja.",
                           "note": "A coronación ceiling of 12,50 m — a DIFFERENT datum concept from the 10,50 m cornisa. Keep distinct."}),
                rec(z, "setbackFront_m", 10, "m", "8.7", "8.7.7", "1", 433,
                    "El retranqueo será superior a diez (10) metros.",
                    measurement="retranqueo a la alineación oficial — the text says 'superior a' (strictly greater than), not 'igual o superior a'",
                    referencePlane="alineación oficial"),
                rec(z, "setbackSide_m", 7, "m", "8.7", "8.7.7", "2", 434,
                    "La separación de la línea de edificación a linderos será como mínimo de siete (7) metros.",
                    measurement="separación mínima de la línea de edificación a linderos",
                    referencePlane="lindero de parcela",
                    appliesTo="all linderos — no lateral/testero distinction in grados 2º y 3º."),
                rec(z, "setbackRear_m", 7, "m", "8.7", "8.7.7", "2", 434,
                    "La separación de la línea de edificación a linderos será como mínimo de siete (7) metros.",
                    measurement="separación mínima a linderos (no separate testero rule)",
                    referencePlane="lindero de parcela"),
                rec(z, "permittedUse", "terciario (oficinas y hospedaje); uso residencial expresamente prohibido",
                    None, "8.7", "8.7.20", "párrafo único (el artículo no tiene apartados numerados)", 438,
                    "En el grado 2º nivel \"e\" especial, el uso cualificado es, el terciario en sus clases de oficinas y hospedaje. […] Queda prohibido expresamente el uso residencial.",
                    measurement="uso cualificado"),
            ]
        out.append(rec(
            z, "buildableDepth_m", None, None, "8.7", None, None, 432, None,
            unknownReason="Chapter 8.7 establishes no fondo edificable. NZ 7 is edificación aislada governed by retranqueos, separations, coverage and FAR. No article to cite.",
            confidence="exact"))
    return out


# ---------------------------------------------------------------- NZ 8
NZ8_CODES = ["8.1.a", "8.1.c", "8.2.a", "8.2.b", "8.2.c",
             "8.3.a", "8.3.c", "8.4", "8.5", "8.6"]
NZ8_GRADO = {"8.1.a": 1, "8.1.c": 1, "8.2.a": 2, "8.2.b": 2, "8.2.c": 2,
             "8.3.a": 3, "8.3.c": 3, "8.4": 4, "8.5": 5, "8.6": 6}
NZ8_SIDE = {1: (7, "Grado 1º: Siete (7) metros."),
            2: (5, "Grado 2º: Cinco (5) metros."),
            3: (3, "Grado 3º: Tres (3) metros."),
            4: (3, "Grado 4º: Tres (3) metros."),
            5: (3, "Grado 5º: Tres (3) metros."),
            6: (3, "Grado 6º: La separación de la línea de edificación a los linderos laterales será igual o superior a la mitad de su altura (H/2) con un mínimo de tres (3) metros, tomando como valor de H la altura de cornisa correspondiente al lindero.")}
NZ8_FRONT = {1: (10, "Grado 1º: Diez (10) metros."),
             2: (7, "Grado 2º: Siete (7) metros."),
             3: (4, "Grado 3º: Cuatro (4) metros."),
             4: (4, "Grado 4º: Cuatro (4) metros."),
             5: (5, "Grado 5º: Cinco (5) metros."),
             6: (4, "Grado 6º: Cuatro (4) metros.")}
NZ8_COV = {1: (20, "Grado 1º: Veinte por ciento (20%)."),
           2: (30, "Grado 2º: Treinta por ciento (30%)."),
           3: (40, "Grado 3º: Cuarenta por ciento (40%)."),
           4: (50, "Grado 4º: Cincuenta por ciento (50%)."),
           5: (50, "Grado 5º: Cincuenta por ciento (50%)."),
           6: (30, "Grado 6º: Treinta por ciento (30%).")}
NZ8_FAR = {1: (0.3, "Grado 1º: Tres (3) metros cuadrados por cada diez (10) metros cuadrados."),
           2: (0.5, "Grado 2º: Cinco (5) metros cuadrados por cada diez (10) metros cuadrados."),
           3: (0.7, "Grado 3º: Siete (7) metros cuadrados por cada diez (10) metros cuadrados."),
           4: (1.0, "Grado 4º: Un (1) metro cuadrado por cada metro cuadrado."),
           5: (0.8, "Grado 5º: Ocho (8) metros cuadrados por cada diez (10) metros cuadrados."),
           6: (0.7, "Grado 6º: Para parcelas de superficie menor o igual a quinientos (500) metros, siete (7) metros cuadrados por cada diez (10) metros cuadrados. Para parcelas de superficie mayor de quinientos (500) metros cuadrados, siete (7) metros cuadrados por cada diez (10) metros cuadrados sobre los primeros quinientos (500) metros cuadrados de superficie, y de cinco (5) metros cuadrados por cada diez (10) metros cuadrados sobre la superficie que exceda de quinientos (500) metros cuadrados.")}

NZ8_H1 = "En los grados 1º, 2º, 3º, 4º y 6º, la cota del origen y referencia será la del contacto de la edificación con el terreno en el punto medio de la fachada en que se sitúa el acceso al edificio, respecto de la cual la edificación no podrá superar una altura de tres (3) plantas, ni una altura de cornisa de mil cincuenta (1.050) centímetros. En el resto de las fachadas no se podrá superar una altura de cornisa de mil doscientos (1.200) centímetros, medidos desde la cota del terreno en los puntos medios de cada fachada."
NZ8_H5 = "En el grado 5º, la altura de la edificación no podrá exceder de dos (2) plantas ni de siete (7) metros a cornisa, medidos desde la cota de nivelación de la planta baja."
MPG343 = "Artículo modificado por la MPG 00/343 (aprobación definitiva 08.11.2023 BOCM 27.11.2023)"


def nz8():
    out = []
    for z in NZ8_CODES:
        g = NZ8_GRADO[z]
        gs = f"1.{'abcdef'[g-1]})"
        # side
        v, vb = NZ8_SIDE[g]
        kw = {}
        if g == 6:
            kw = {"formula": "max(3, altura_de_cornisa_al_lindero / 2)",
                  "measurement": "FLOOR of a height-proportional rule: ≥ H/2 with a 3 m minimum, H = altura de cornisa corresponding to that lindero. 3 m binds only while H ≤ 6 m.",
                  "heightDatumNote": "grado 6º uses altura de CORNISA here — distinct from the coronación datum used elsewhere."}
        out.append(rec(z, "setbackSide_m", v, "m", "8.8", "8.8.6", gs, 440 if g <= 2 else 441, vb,
                       referencePlane="lindero lateral",
                       measurement=kw.pop("measurement", "separación mínima de las fachadas a los linderos laterales"),
                       exceptions="Art. 8.8.6.3: in grados 3º, 4º and 5º the building may abut ONE lindero, and in grado 6º one lateral or the testero (art. 6.3.13). Art. 8.8.6.5: in grados 3º, 4º, 5º abutment is allowed for agrupada/hilera/adosada layouts. Art. 8.8.6.4: in grado 2º nivel a, only per art. 8.8.4.2.c).",
                       amendment=MPG343, **kw))
        # rear — one rule for all grados
        out.append(rec(
            z, "setbackRear_m", 4, "m", "8.8", "8.8.6", "2", 441,
            "Respecto al lindero testero, la separación será igual o superior a 2H:3 con un mínimo de cuatro (4) metros. Siendo el valor de (H), la altura de cornisa de los citados cuerpos, salvo en el grado 6º, en el que se tomará como valor de (H) la mayor de las alturas de cornisa de la construcción.",
            measurement="FLOOR of a height-proportional rule: ≥ 2H/3 with a 4 m minimum. 4 m binds only while H ≤ 6 m; above that the formula governs. Do NOT use 4 as a fixed rear setback.",
            referencePlane="lindero testero",
            formula="max(4, 2 * altura_de_cornisa / 3)",
            heightDatumNote=("H = altura de CORNISA of the facing bodies; in grado 6º, H = the GREATEST cornisa "
                             "height of the construction. Distinct from coronación."),
            amendment=MPG343))
        # front
        v, vb = NZ8_FRONT[g]
        out.append(rec(z, "setbackFront_m", v, "m", "8.8", "8.8.7", gs, 441, vb,
                       measurement="retranqueo: separación entre el plano de fachada y la alineación oficial. Art. 8.8.7.1 says 'será superior a' (strictly greater than) these values.",
                       referencePlane="alineación oficial",
                       exceptions=("Grados 1º y 2º: the retranqueo strip may not be built on above grade (art. 8.8.7.2). "
                                   "Grados 3º, 4º, 5º, 6º: a single-storey ancillary body (≤3,50 m coronación, ≤5 m façade length, "
                                   "parcel <500 m²) may sit ON the alineación oficial (art. 8.8.7.3).")))
        # coverage
        v, vb = NZ8_COV[g]
        out.append(rec(z, "maxCoverage", v, "%", "8.8", "8.8.8", gs, 442, vb,
                       measurement="coeficiente de ocupación applied to the COMBINED footprint above AND below grade — a single budget, not two",
                       denominatorScope="parcela edificable",
                       combinedAboveAndBelowGrade=True,
                       governingVerbatim="La ocupación del conjunto formado por las edificaciones situadas sobre y bajo rasante, no podrá ser superior al resultado de aplicar a la superficie de parcela edificable los siguientes coeficientes de ocupación:",
                       notes="Art. 8.8.8.2: only ONE below-grade storey is allowed, except for alternative/authorisable uses used as garage or building services.",
                       amendment=MPG343))
        # FAR
        v, vb = NZ8_FAR[g]
        kw = {}
        if g == 6:
            kw = {"tiered": {"first_500_m2": 0.7, "above_500_m2": 0.5},
                  "measurement": "coeficiente de edificabilidad neta — TIERED in grado 6º: 0,7 on the first 500 m² of parcel, 0,5 on the excess. A single scalar is only correct for parcels ≤500 m².",
                  "confidence": "exact"}
        out.append(rec(z, "farRatio", v, "m²/m²", "8.8", "8.8.9", gs, 442 if g <= 4 else 443, vb,
                       measurement=kw.pop("measurement", "coeficiente de edificabilidad neta sobre parcela edificable"),
                       denominatorScope="parcela edificable (neta)",
                       verbatimNormalisedNote="The Compendio expresses this as 'N metros cuadrados por cada diez (10) metros cuadrados'; the decimal is the same value. The verbatim ratio form is preserved above.",
                       **kw))
        # height
        if g == 5:
            out.append(rec(z, "maxFloors", 2, "plantas", "8.8", "8.8.10", "2", 443, NZ8_H5, amendment=MPG343))
            out.append(rec(z, "maxHeight_m", 7, "m", "8.8", "8.8.10", "2", 443, NZ8_H5,
                           measurement="cornisa",
                           referencePlane="cota de nivelación de la planta baja", amendment=MPG343))
        else:
            out.append(rec(z, "maxFloors", 3, "plantas", "8.8", "8.8.10", "1", 443, NZ8_H1, amendment=MPG343))
            out.append(rec(
                z, "maxHeight_m", 10.5, "m", "8.8", "8.8.10", "1", 443, NZ8_H1,
                measurement="cornisa, on the ACCESS façade",
                referencePlane="cota del contacto de la edificación con el terreno en el punto medio de la fachada en que se sitúa el acceso al edificio (cota de origen y referencia)",
                secondaryLimit={"value": 12.0, "unit": "m", "measurement": "cornisa, on ALL OTHER façades",
                                "referencePlane": "cota del terreno en los puntos medios de cada fachada",
                                "verbatim": "En el resto de las fachadas no se podrá superar una altura de cornisa de mil doscientos (1.200) centímetros, medidos desde la cota del terreno en los puntos medios de cada fachada."},
                extra={"articulo": "8.8.10", "apartado": "4", "pdfPage": 443,
                       "verbatim": "Sobre la última planta en los grados 1º, 2º, 3º, 4º y 6º, se admite la construcción de una planta, con una superficie máxima inferior o igual al diez por ciento (10%) de la superficie edificada de la planta sobre la que se sitúe. Su altura de coronación no superará los mil doscientos cincuenta (1.250) centímetros, medidos desde la cota de origen y referencia.",
                       "note": "12,50 m is a CORONACIÓN ceiling, not a cornisa one. Keep distinct."},
                amendment=MPG343))
        # depth
        out.append(rec(z, "buildableDepth_m", None, None, "8.8", None, None, 439, None,
                       unknownReason="Chapter 8.8 establishes no fondo edificable. NZ 8 is aislada/pareada/adosada governed by retranqueos, separations, coverage and FAR. No article to cite.",
                       confidence="exact"))
        out.append(rec(z, "permittedUse", "residencial en su categoría de vivienda unifamiliar", None,
                       "8.8", "8.8.1", "3", 439,
                       "Su uso cualificado es residencial en su categoría de vivienda unifamiliar.",
                       measurement="uso cualificado",
                       nivelNote=("The a/b/c nivel suffix affects the RÉGIMEN DE USOS only. Art. 8.8.16: 'A los efectos "
                                  "de la aplicación de las condiciones referentes a los usos compatibles y autorizables se "
                                  "distinguen, en función de los grados diferenciados en el art. 8.8.3 los siguientes niveles "
                                  "a, b y c.' Compatible/authorisable uses per grado+nivel are in arts. 8.8.17 and 8.8.18 "
                                  "(pdfPages 445-450)."),
                       compatibleUsesArticle="8.8.17", authorisableUsesArticle="8.8.18"))
        if z == "8.1.c":
            out.append(rec(z, "farRatio", 1.0, "m²/m²", "8.8", "8.8.17", "2.b)", 446,
                           "Edificabilidad máxima de un (1) m²/m² de parcela edificable.",
                           measurement="ALTERNATIVE-USE ceiling for grado 1º nivel c (terciario oficinas/hospedaje or dotacional in edificio exclusivo) — NOT the residential figure, which stays at 0,3 per Art. 8.8.9",
                           denominatorScope="parcela edificable",
                           scopeWarning="Nivel-c-only, alternative-use-only."))
            out.append(rec(z, "maxCoverage", 40, "%", "8.8", "8.8.17", "2.b)", 446,
                           "Ocupación: sobre rasante inferior o igual al cuarenta por ciento (40%) de la superficie de la parcela edificable y bajo rasante el setenta por ciento (70%).",
                           measurement="ALTERNATIVE-USE ocupación sobre rasante for grado 1º nivel c (vs 20% combined for the qualified use)",
                           denominatorScope="parcela edificable",
                           belowGrade={"value": 70, "unit": "%"},
                           scopeWarning="Nivel-c-only, alternative-use-only."))
    return out


# ---------------------------------------------------------------- NZ 9
NZ9_CODES = ["9.1", "9.2", "9.3", "9.4.a", "9.4.b", "9.5"]
NZ9_FAR = {"9.1": (2.4, "Grados 1º, 2º y 4º: Dos con cuatro (2,4) metros cuadrados por metro cuadrado."),
           "9.2": (2.4, "Grados 1º, 2º y 4º: Dos con cuatro (2,4) metros cuadrados por metro cuadrado."),
           "9.3": (1.6, "Grado 3º: Uno con seis (1,6) metros cuadrados por metro cuadrado."),
           "9.4.a": (2.4, "Grados 1º, 2º y 4º: Dos con cuatro (2,4) metros cuadrados por metro cuadrado."),
           "9.4.b": (2.4, "Grados 1º, 2º y 4º: Dos con cuatro (2,4) metros cuadrados por metro cuadrado."),
           "9.5": (2.0, "Grado 5º: Dos (2) metros cuadrados por metro cuadrado.")}
NZ9_STREET_TABLE = [("< 12", "Menos de 12", 3, 11.5), (">= 12 && < 18", "De 12 a menos de 18", 4, 15.0),
                    (">= 18", "A partir de 18", 5, 18.5)]
NZ9_SIDE = {"9.3": (3, "En el grado 3º y 4º nivel a: La separación entre el plano de fachada considerado y el lindero correspondiente no podrá ser inferior a tres (3) metros.", "2"),
            "9.4.a": (3, "En el grado 3º y 4º nivel a: La separación entre el plano de fachada considerado y el lindero correspondiente no podrá ser inferior a tres (3) metros.", "2"),
            "9.4.b": (6, "En grado 4º nivel b: Esta separación será de seis (6) metros.", "3"),
            "9.5": (4, "En grado 5º: Esta separación será de cuatro (4) metros.", "4")}
NZ9_FRONT = {"9.4.b": (8, "Grado 4º nivel b: Ocho (8) metros.", "3.a)"),
             "9.5": (6, "Grado 5º: Seis (6) metros.", "3.b)")}


def nz9():
    out = []
    for z in NZ9_CODES:
        g12 = z in ("9.1", "9.2")
        v, vb = NZ9_FAR[z]
        out.append(rec(z, "farRatio", v, "m²/m²", "8.9", "8.9.9",
                       "a)" if v == 2.4 else ("b)" if v == 1.6 else "c)"), 454, vb,
                       measurement="coeficiente de edificabilidad neta por parcela edificable",
                       denominatorScope="parcela edificable (neta)",
                       gradoNote=("Art. 8.9.9 keys on the GRADO only; niveles a/b of grado 4º share 2,4 m²/m². "
                                  "Art. 8.9.3 introduces niveles a and b in grado 4º 'a efectos de posición de la "
                                  "edificación' — position only.") if z.startswith("9.4") else None))
        if g12:
            for expr, cond_vb, fl, h in NZ9_STREET_TABLE:
                out.append(rec(z, "maxFloors", fl, "plantas", "8.9", "8.9.10", "1", 454,
                               f"{cond_vb} | {fl} | {h:.2f}".replace(".", ","),
                               table="Cuadro ancho de calle / Nº de plantas / Altura de cornisa (grados 1º y 2º)",
                               condition={"variable": "ancho de calle", "unit": "m", "expr": expr, "verbatim": cond_vb},
                               extractedFrom="table"))
                out.append(rec(z, "maxHeight_m", h, "m", "8.9", "8.9.10", "1", 454,
                               f"{cond_vb} | {fl} | {h:.2f}".replace(".", ","),
                               measurement="cornisa",
                               referencePlane="medición conforme al artículo 6.6.8 (art. 8.9.11.a)) — the datum sits in Título 6, outside Chapter 8.9",
                               table="Cuadro ancho de calle / Nº de plantas / Altura de cornisa (grados 1º y 2º)",
                               condition={"variable": "ancho de calle", "unit": "m", "expr": expr, "verbatim": cond_vb},
                               extractedFrom="table",
                               tableDiffersFromNZ4=("NZ 9's table has THREE rows and tops out at 5 plantas / 18,50 m "
                                                    "('A partir de 18'). NZ 4's has FOUR rows and reaches 6 plantas / "
                                                    "21,50 m. Do not reuse one table for the other.")))
            out.append(rec(z, "setbackSide_m", 0, "m", "8.9", "8.9.6", "1", 452,
                           "En los grados 1º y 2º: La edificación deberá construirse entre medianeras en los doce (12) primeros metros de fondo, debiendo separarse en el resto, un mínimo de tres (3) metros, de cada uno de los linderos laterales.",
                           measurement="mandatory party-wall abutment for the FIRST 12 m of depth; beyond 12 m a 3 m minimum separation applies",
                           referencePlane="lindero lateral",
                           depthDependent={"first_12m": 0, "beyond_12m": 3, "unit": "m"},
                           exception="If the adjoining building requires it, a 3 m separation is admitted within the first 12 m too."))
            out.append(rec(z, "setbackRear_m", 3, "m", "8.9", "8.9.6", "1", 452,
                           "La edificación se separará del lindero testero una distancia igual o superior a H:3 de la altura de coronación de cada uno de los cuerpos de edificación enfrentados al mismo, con un mínimo de tres (3) metros.",
                           measurement="FLOOR of a height-proportional rule: ≥ H/3 with a 3 m minimum. 3 m binds only while H ≤ 9 m.",
                           referencePlane="lindero testero",
                           formula="max(3, altura_de_coronación / 3)",
                           heightDatumNote="H = altura de CORONACIÓN here, while the 8.9.10 table gives altura de CORNISA. Keep distinct."))
            out.append(rec(z, "setbackFront_m", 0, "m", "8.9", "8.9.7", "1", 453,
                           "En los grados 1º y 2º: El edificio situará una de sus fachadas exteriores sobre y a lo largo de la alineación oficial en toda su altura, salvo lo dispuesto en los puntos siguientes en los que se podrá separar paralelamente:",
                           measurement="alineación obligatoria — build-to line, not a permissive zero",
                           referencePlane="alineación oficial",
                           exceptions="Art. 8.9.7.1 a)-c): manzana completa; frente de manzana completo (≥3 m); chaflanes of 4 m on corner parcels."))
            out.append(rec(z, "buildableDepth_m", None, None, "8.9", "8.9.6", "1", 452,
                           "La edificación deberá construirse entre medianeras en los doce (12) primeros metros de fondo, debiendo separarse en el resto, un mínimo de tres (3) metros, de cada uno de los linderos laterales.",
                           unknownReason=("Chapter 8.9 sets NO fondo máximo edificable for grados 1º/2º. The 12 m in art. "
                                          "8.9.6.1 is a PARTY-WALL-REGIME threshold (build between party walls for the "
                                          "first 12 m, then separate 3 m) — it does NOT cap build depth, and building "
                                          "beyond it is expressly contemplated. Art. 8.9.14.1 in fact contemplates a "
                                          "'fondo máximo de la edificación' exceeding 80 m. Do not import NZ 4's 12 m fondo edificable here."),
                           confidence="exact"))
        else:
            if z in ("9.3", "9.4.b"):
                fl, h, ap = 7, 28, "2"
                vb2 = "En grados 3º y 4º nivel b: La altura máxima de la edificación será de siete (7) plantas y veintiocho (28) metros al nivel de cornisa."
            else:  # 9.4.a, 9.5
                fl, h, ap = 5, 20, "3"
                vb2 = "En grados 4º nivel a y 5º: La altura máxima de la edificación será de cinco (5) plantas y veinte (20) metros al nivel de cornisa."
            out.append(rec(z, "maxFloors", fl, "plantas", "8.9", "8.9.10", ap, 454, vb2))
            out.append(rec(z, "maxHeight_m", h, "m", "8.9", "8.9.10", ap, 454, vb2,
                           measurement="cornisa",
                           referencePlane="cota de nivelación de la planta baja (art. 8.9.11.b), situada según el artículo 6.6.15)",
                           override={"articulo": "8.9.10", "apartado": "4",
                                     "verbatim": "En los grados 3º, 4º y 5º: La altura máxima de edificación podrá superarse cuando por las características especiales de la actividad industrial así lo requiera.",
                                     "note": "This is a discretionary industrial-process override with no numeric ceiling. Treat the tabulated value as the default, not an absolute cap."}))
            v, vb3, ap3 = NZ9_SIDE[z]
            for p in ("setbackSide_m", "setbackRear_m"):
                out.append(rec(z, p, v, "m", "8.9", "8.9.6", ap3, 452, vb3,
                               measurement="separación entre el plano de fachada considerado y el lindero correspondiente — the article does not distinguish lateral from testero in these grados",
                               referencePlane="lindero de parcela",
                               exception="Art. 8.9.6.5/8.9.6.6: abutment to a lateral lindero is admitted in grados 3º, 4º and 5º per art. 6.3.13."))
            if z in NZ9_FRONT:
                v, vb4, ap4 = NZ9_FRONT[z]
                out.append(rec(z, "setbackFront_m", v, "m", "8.9", "8.9.7", ap4, 453, vb4,
                               measurement="separación mínima del plano de fachada a la alineación oficial",
                               referencePlane="alineación oficial"))
            else:  # 9.3, 9.4.a
                out.append(rec(z, "setbackFront_m", None, "m", "8.9", "8.9.7", "2", 453,
                               "En los grados 3º y 4º nivel a: La nueva edificación podrá separarse de la alineación oficial en función de sus necesidades.",
                               unknownReason=("No minimum is imposed — the building may set back 'en función de sus "
                                              "necesidades'. This is 'no constraint', which is NOT the same as 0 m "
                                              "(0 m would mean a mandatory build-to line, as in grados 1º/2º). Model as unconstrained."),
                               measurement="free — no minimum retranqueo",
                               referencePlane="alineación oficial",
                               confidence="exact"))
            out.append(rec(z, "buildableDepth_m", None, None, "8.9", None, None, 451, None,
                           unknownReason="Chapter 8.9 establishes no fondo edificable for grados 3º/4º/5º (aislada typology).",
                           confidence="exact"))
        out.append(rec(z, "maxCoverage", None, None, "8.9", None, None, 451, None,
                       unknownReason=("Chapter 8.9 contains NO ocupación article — there is no equivalent of 8.4.8 / 8.5.7 / "
                                      "8.7.8 / 8.8.8 anywhere in arts. 8.9.1 to 8.9.16. Footprint is therefore a residual of "
                                      "the separación (8.9.6), alineación (8.9.7) and inter-building (8.9.8) rules together "
                                      "with the FAR (8.9.9). null means 'no coverage rule exists', NOT zero."),
                       confidence="exact"))
        use = ("industrial en coexistencia con terciario de oficinas" if z == "9.3" else "industrial")
        out.append(rec(z, "permittedUse", use, None, "8.9", "8.9.1", "3", 451,
                       "Su uso cualificado es el industrial, en los grados 1º, 2º, 4º y 5º, y en grado 3º industrial en coexistencia con terciario de oficinas, entendiendo como coexistencia la posibilidad de implantación de uno u otro uso, o de ambos en edificios diferenciados o en un mismo edificio en proporción libre.",
                       measurement="uso cualificado",
                       compatibleUsesArticle="8.9.17 (pdfPages 456-459)"))
    return out


# ---------------------------------------------------------------- NZ 1
NZ1_C = {"1.1": (0.875, "Coeficiente C: Para todas las parcelas reguladas por este grado, el coeficiente C es de 0,875.", "a)iii)", 371,
                 "Superficie computable S: Es la superficie de parcela comprendida entre la alineación oficial fijada en el Plano de Ordenación y el fondo máximo definido en el Plano de Condiciones de la Edificación."),
         "1.2": (0.66, "Coeficiente C: Para todas las parcelas reguladas por este grado, el coeficiente C es 0,66.", "b)iii)", 371,
                 "Superficie computable S: Es la superficie de la parcela edificable definida en el artículo 6.2.9."),
         "1.3": (0.90, "Coeficiente C: Para todas las parcelas reguladas por este grado, el coeficiente C es 0,90.", "c)iii)", 372,
                 "Superficie computable S: Es la superficie de parcela comprendida entre la alineación oficial fijada en el Plano de Ordenación y el fondo máximo definido en el Plano de Condiciones de la Edificación."),
         "1.4": (0.75, "Coeficiente C: Para todas las parcelas reguladas por este grado, el coeficiente C es 0,75.", "d)iii)", 372,
                 "Superficie computable S: Es la superficie de parcela edificable definida en el artículo 6.2.9."),
         "1.6": (0.66, "Coeficiente C: Para todas las parcelas reguladas por este grado, el coeficiente C es 0,66.", "f)iii)", 372,
                 "Superficie computable S: Es la superficie de la parcela edificable definida en el artículo 6.2.9.")}
NZ1_Z_TABLE = [("< 7", "Menos de 7 metros", 3), (">= 7 && < 12", "De 7 metros a menos de 12", 4),
               (">= 12 && < 18", "De 12 metros a menos de 18", 5), (">= 18 && < 24", "De 18 metros a menos de 24", 6),
               (">= 24", "De 24 metros en adelante", 7)]
E_FORMULA_VB = "La edificabilidad máxima de una parcela (E) se determina en función de la siguiente fórmula: E= S x Z x C. Siendo: S: Superficie computable de parcela a efectos de edificación; Z: Coeficiente ponderado de edificabilidad; C: Coeficiente corrector del índice de densidad"


def nz1():
    out = []
    for z in ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"]:
        if z == "1.5":
            out.append(rec(z, "farRatio", None, None, "8.1", "8.1.10", "3.e)", 372,
                           "La edificabilidad de las parcelas reguladas según este grado, es la existente tanto sobre como bajo rasante y que esté destinada a usos que computen como edificabilidad de acuerdo con las condiciones que fijan los artículos 6.5.3 y 6.5.4 de las presentes Normas.",
                           unknownReason="Grado 5º has NO E = S×Z×C formula and no coefficient. Buildability equals the EXISTING built floor area of the building on the parcel. It is a per-building survey figure, not a plan parameter.",
                           denominatorScope=None, confidence="exact"))
            out.append(rec(z, "maxCoverage", None, None, "8.1", "8.1.13", "4", 375,
                           "En el grado 5º la ocupación máxima será la de la edificación existente. En caso de sustitución de ésta sin obligarse a su reconstrucción, la ocupación será fijada mediante Estudio de Detalle con un máximo de los dos tercios (2/3) de la parcela edificable.",
                           unknownReason="Equals the existing building's footprint. Only on substitution without mandatory reconstruction does a ceiling appear: 2/3 of the parcela edificable, fixed by Estudio de Detalle.",
                           substitutionCeiling={"value": 66.67, "unit": "%", "verbatim": "un máximo de los dos tercios (2/3) de la parcela edificable", "requires": "Estudio de Detalle"},
                           denominatorScope="parcela edificable", confidence="exact",
                           amendment=MPG343))
            out.append(rec(z, "buildableDepth_m", None, None, "8.1", "8.1.14", "3", 375,
                           "Para el grado 5º, en el caso de no fijarse fondo máximo en el Plano de Condiciones de la Edificación, se determinará mediante Estudio de Detalle, teniendo presente el señalado, en su caso, para las edificaciones colindantes, salvo que sea obligada la reconstrucción del edificio.",
                           unknownReason="Map-borne (Plano de Condiciones de la Edificación) or, failing that, set by Estudio de Detalle. Not a value in the Compendio.",
                           confidence="exact"))
        else:
            c, cvb, ap, pg, svb = NZ1_C[z]
            out.append(rec(
                z, "farRatio", None, "m²/m²", "8.1", "8.1.10", ap.replace("iii)", "") + " + formula", pg,
                E_FORMULA_VB,
                unknownReason=("NZ 1 states no FAR scalar. Buildability is E = S × Z × C, where Z is read off the "
                               "Plano de Condiciones de la Edificación (not from this document) and S is a "
                               "grado-specific parcel sub-area. Only C is a constant here. Emitting a single "
                               "m²/m² would require Z, which the Compendio does not supply."),
                measurement="edificabilidad máxima de la parcela, E = S × Z × C",
                denominatorScope="parcela — never manzana, never ámbito (see denominatorEvidence)",
                formula="E = S * Z * C",
                coefficientC={"value": c, "articulo": "8.1.10", "apartado": ap, "pdfPage": pg, "verbatim": cvb},
                superficieComputableS={"articulo": "8.1.10", "apartado": ap.replace("iii)", "i)"), "pdfPage": pg, "verbatim": svb},
                denominatorEvidence=(
                    "Art. 8.1.10 opens 'La edificabilidad máxima de una PARCELA (E)' and defines S as "
                    "'Superficie computable de PARCELA a efectos de edificación' / 'Es aquella parte de la parcela "
                    "que interviene en el cómputo de la edificabilidad'. Z multiplies that parcel area. Z being "
                    "published per-manzana on the Plano de Condiciones de la Edificación (hence the CODMANZANA key "
                    "in GIS) does NOT make the manzana the denominator."),
                coefficientZMeaning={
                    "articulo": "8.1.10", "apartado": "2", "pdfPage": 371,
                    "verbatim": "Coeficiente ponderado de edificabilidad (Z): Es un factor que interviene en la determinación de la edificabilidad en función de las características urbanísticas y constructivas del entorno. Este coeficiente no determina la altura admisible en número de plantas, ya que este parámetro se fija, excepto en el grado 6º, en función de las alturas de cornisa de los edificios colindantes y debe ser aprobada por la CPPHAN.",
                    "source": "Grados 1-4: 'Coeficiente Z: El fijado en el Plano de Condiciones de la Edificación.' Grado 6º: read from the street-width table in art. 8.1.10.3.f)ii).",
                    "warning": "Z is NOT a storey count except in grado 6º (art. 8.1.15.1)."},
                fallback={"articulo": "8.1.10", "apartado": "3.f) closing paragraph", "pdfPage": 373,
                          "verbatim": "Cuando el cálculo de la edificabilidad no pueda obtenerse por la aplicación directa de la fórmula definida al principio de este artículo (E = S x Z x C) por tener la parcela fachadas a calles de distinto ancho, la superficie edificable se calculará conforme a lo establecido en los apartados 2 y 3 del artículo 8.4.9, sin considerar el fondo máximo de doce (12) metros, contemplado en dicho artículo."},
                confidence="exact",
                amendment=MPG343))
            if z in ("1.1", "1.3"):
                out.append(rec(z, "maxCoverage", 100, "%", "8.1", "8.1.13", "1", 374,
                               "En los grados 1º y 3º la ocupación máxima será la parte de la parcela definida como superficie computable para este grado en el artículo 8.1.10.",
                               measurement="footprint may occupy the WHOLE of the superficie computable S — i.e. 100% OF S, not of the parcel. As a fraction of the full parcel it is S/parcel and therefore parcel-specific.",
                               denominatorScope="superficie computable S (parcel area between the alineación oficial and the map-borne fondo máximo) — NOT the whole parcel",
                               confidence="exact", amendment=MPG343))
                out.append(rec(z, "buildableDepth_m", None, None, "8.1", "8.1.14", "1", 375,
                               "En los grados 1º y 3º el fondo máximo queda establecido en el Plano de Condiciones de la Edificación.",
                               unknownReason="Map-borne. The fondo máximo exists and is binding, but its value lives on the Plano de Condiciones de la Edificación, not in the Compendio. Requires the GIS/plan layer.",
                               confidence="exact"))
            elif z in ("1.2", "1.4"):
                out.append(rec(z, "maxCoverage", 75, "%", "8.1", "8.1.13", "2", 375,
                               "En los grados 2º, 4º y 6º la ocupación máxima será el setenta y cinco por ciento (75%) de la superficie computable, definida en ese artículo para los antedichos grados.",
                               measurement="75% of the superficie computable S. For grados 2º/4º/6º, S = the parcela edificable (art. 6.2.9), so here it is effectively 75% of the buildable parcel.",
                               denominatorScope="superficie computable S = parcela edificable (art. 6.2.9)",
                               confidence="exact", amendment=MPG343))
                out.append(rec(z, "buildableDepth_m", None, None, "8.1", "8.1.14", "2", 375,
                               "En los grados 2º y 4º no se establece fondo máximo, si bien se deberá tener presente lo regulado en el art. 8.1.12.",
                               unknownReason="Expressly NOT established ('no se establece fondo máximo'). This is an affirmative absence, not missing data. Art. 8.1.12.1 nonetheless requires grado 4º to leave a full-width rear courtyard.",
                               rearCourtyardRule={"articulo": "8.1.12", "apartado": "1", "pdfPage": 373,
                                                  "verbatim": "Como condición particular se establece que para los grados 4º y 6º se dejará al fondo de la parcela un espacio libre que ocupe todo su ancho y que cumpla las condiciones que para patios de parcela se fijan en estas Normas en función de las luces rectas de las piezas o locales recayentes a dichos patios."},
                               confidence="exact"))
            else:  # 1.6
                out.append(rec(z, "maxCoverage", 75, "%", "8.1", "8.1.13", "2", 375,
                               "En los grados 2º, 4º y 6º la ocupación máxima será el setenta y cinco por ciento (75%) de la superficie computable, definida en ese artículo para los antedichos grados.",
                               measurement="75% of the superficie computable S; for grado 6º S = the parcela edificable (art. 6.2.9)",
                               denominatorScope="superficie computable S = parcela edificable (art. 6.2.9)",
                               confidence="exact", amendment=MPG343))
                out.append(rec(z, "buildableDepth_m", 25, "m", "8.1", "8.1.14", "4", 375,
                               "Para el grado 6º el fondo máximo será de veinticinco (25) metros teniendo además presente el art. 8.1.12.",
                               measurement="fondo máximo",
                               referencePlane="not stated in art. 8.1.14; art. 8.1.11.1-2 places the building line on (grados 1º/2º) or optionally behind (grados 3º/4º/6º) the alineación oficial, so the datum is not unambiguously fixed by Chapter 8.1. Recorded as unstated rather than assumed.",
                               additionalRule="Art. 8.1.12.1 also requires a full-width rear open space in grado 6º."))
                for expr, cond_vb, zv in NZ1_Z_TABLE:
                    out.append(rec(z, "maxFloors", zv, "plantas", "8.1", "8.1.15", "1 (via 8.1.10.3.f)ii))", 372,
                                   f"{cond_vb} | {zv}",
                                   measurement="número de plantas = the Z coefficient value, in grado 6º ONLY",
                                   table="Cuadro ancho de calle / Coeficiente Z (art. 8.1.10.3.f)ii))",
                                   condition={"variable": "ancho de calle, medido en el punto medio de la fachada",
                                              "unit": "m", "expr": expr, "verbatim": cond_vb},
                                   governingVerbatim="Salvo en el grado 6º, en el que la altura de la edificación en número de plantas será coincidente con el número correspondiente al coeficiente Z señalado en el cuadro del artículo 8.1.10.3.f).ii) en función del ancho de calle, en los demás grados la altura de cornisa en metros y número de plantas se establecerá individualmente para cada caso por la CPPHAN",
                                   widthMeasurementRule="La medición del ancho de calle se realizará con los mismos criterios que para tal fin están previstos en el Capítulo 8.4 de este mismo Título. (art. 8.1.10, pdfPage 373)",
                                   extractedFrom="table", amendment=MPG343))
        # height — null for grados 1-5
        if z != "1.6":
            for p in ("maxHeight_m", "maxFloors"):
                out.append(rec(z, p, None, None, "8.1", "8.1.15", "1", 375,
                               "Salvo en el grado 6º, en el que la altura de la edificación en número de plantas será coincidente con el número correspondiente al coeficiente Z señalado en el cuadro del artículo 8.1.10.3.f).ii) en función del ancho de calle, en los demás grados la altura de cornisa en metros y número de plantas se establecerá individualmente para cada caso por la CPPHAN, previa presentación de las diferentes soluciones o propuestas que armonicen con los edificios colindantes, mediante representaciones de éstas en alzados completos de tramo de calle o calles a las que afecte.",
                               unknownReason=("Grados 1º-5º have NO tabulated height. Both the cornisa height in metres and the "
                                              "storey count are set CASE BY CASE by the CPPHAN (Comisión para la Protección del "
                                              "Patrimonio Histórico, Artístico y Natural), harmonised against the adjoining "
                                              "buildings. There is no rule to encode — this is a discretionary determination. "
                                              "Any automated envelope for NZ 1 grados 1-5 must refuse, not guess."),
                               measurement="cornisa (grados 1º-5º: CPPHAN-determined)" if p == "maxHeight_m" else None,
                               confidence="exact", amendment=MPG343))
        # NZ 1 no height for 1.6 in metres either
        if z == "1.6":
            out.append(rec(z, "maxHeight_m", None, "m", "8.1", "8.1.15", "1", 375,
                           "en los demás grados la altura de cornisa en metros y número de plantas se establecerá individualmente para cada caso por la CPPHAN",
                           unknownReason=("Grado 6º gets a STOREY COUNT (= Z, from the street-width table) but Chapter 8.1 "
                                          "gives it NO cornisa height in metres. Art. 8.1.16 sets minimum storey heights "
                                          "(360 cm ground, 300 cm upper) but minimums cannot be used to derive a maximum "
                                          "building height. Deriving metres from storeys is expressly out of bounds."),
                           minimumStoreyHeights={"articulo": "8.1.16", "pdfPage": 376,
                                                 "verbatim": "La altura de pisos será, como mínimo, de trescientos sesenta (360) centímetros en planta baja y de trescientos (300) centímetros en las plantas superiores."},
                           confidence="exact"))
        # position
        if z in ("1.1", "1.2"):
            out.append(rec(z, "setbackFront_m", 0, "m", "8.1", "8.1.11", "1", 373,
                           "En el grado 1º y 2º la línea de edificación deberá coincidir con la alineación oficial.",
                           measurement="alineación obligatoria — build-to line",
                           referencePlane="alineación oficial"))
        elif z in ("1.3", "1.4", "1.6"):
            out.append(rec(z, "setbackFront_m", None, "m", "8.1", "8.1.11", "2", 373,
                           "En los grados 3º,4º y 6º la línea de edificación podrá retranquearse total o parcialmente respecto a la alineación oficial. En cualquier caso dicha alineación deberá materializarse como mínimo en planta baja mediante cuerpos de edificación, soportales, arquerías o cualquier elemento que constituya cerramiento arquitectónico.",
                           unknownReason=("No minimum retranqueo is set — setback is optional and unquantified. But it is not "
                                          "a free setback either: the alineación oficial must still be materialised at ground "
                                          "floor by built fabric, arcades or an architectural enclosure. Model as "
                                          "'optional setback with a mandatory ground-floor street wall', not as 0 and not as free."),
                           referencePlane="alineación oficial",
                           cornerRule="Parcelas de esquina in grados 3º y 4º must form a 4 m chaflán perpendicular to the bisector.",
                           confidence="exact"))
        else:  # 1.5
            out.append(rec(z, "setbackFront_m", None, "m", "8.1", "8.1.11", "3", 373,
                           "En el grado 5º la nueva edificación tendrá la misma posición que la inicialmente existente. En caso de sustitución sin que sea obligada su reconstrucción, esta posición se fijará mediante un Estudio de Detalle.",
                           unknownReason="Position = that of the existing building; on substitution, fixed by Estudio de Detalle. No plan value exists.",
                           confidence="exact"))
        if z != "1.5":
            out.append(rec(z, "setbackSide_m", 0, "m", "8.1", "8.1.12", "2", 373,
                           "En los grados 1º, 2º, 3º, 4º y 6º la nueva edificación se adosará a los linderos laterales, con las particularidades que se indican en los apartados siguientes:",
                           measurement="mandatory party-wall abutment",
                           referencePlane="lindero lateral",
                           exception={"apartado": "2.a)",
                                      "verbatim": "Cuando la parcela coincida en su lindero lateral con una parcela de tipología edificatoria distinta a edificación en manzana cerrada, deberá separarse un mínimo de tres (3) metros de dicho lindero o adosarse en las condiciones del artículo 6.3.13 apartados 2, 3 y 4.",
                                      "value": 3, "unit": "m"},
                           amendment=MPG343))
        out.append(rec(z, "permittedUse", "residencial", None, "8.1", "8.1.2", "1", 367,
                       "El uso cualificado es el residencial.",
                       measurement="uso cualificado",
                       typology="La tipología corresponde a la de edificación entre medianerías formando manzana cerrada. (art. 8.1.2.2)"))
    return out


# ---------------------------------------------------------------- writer
META = {
    "nz5": {"normaZonal": "5", "designation": "Edificación en bloques abiertos", "capitulo": "8.5",
            "capituloHeading": "CAPÍTULO 8.5. CONDICIONES PARTICULARES DE LA ZONA 5: EDIFICACIÓN EN BLOQUES ABIERTOS",
            "grados": ["5.1", "5.2", "5.3"], "pdfPageRange": [419, 423],
            "gradosNote": "Art. 8.5.3: 'se distinguen tres (3) grados … con los códigos 1º, 2º y 3º'. No niveles."},
    "nz7": {"normaZonal": "7", "designation": "Edificación en baja densidad", "capitulo": "8.7",
            "capituloHeading": "CAPÍTULO 8.7. EDIFICACIÓN EN BAJA DENSIDAD", "grados": ["7.1.a", "7.1.b", "7.2.e"],
            "pdfPageRange": [432, 438],
            "gradosNote": "Art. 8.7.3 defines THREE grados; art. 8.7.17 defines niveles a and b in grado 1º, a special nivel 'e' in grado 2º, and NO niveles in grado 3º. Building conditions key on the GRADO; niveles govern uses (except art. 8.7.20, which also fixes a nivel-'e' FAR)."},
    "nz8": {"normaZonal": "8", "designation": "Edificación en vivienda unifamiliar", "capitulo": "8.8",
            "capituloHeading": "CAPÍTULO 8.8. CONDICIONES PARTICULARES DE LA ZONA 8: EDIFICACIÓN EN VIVIENDA UNIFAMILIAR",
            "grados": NZ8_CODES, "pdfPageRange": [439, 450],
            "gradosNote": "Art. 8.8.3 defines SIX grados (1º-6º). The a/b/c suffix is a NIVEL, and art. 8.8.16 confines niveles to the régimen de usos: 'A los efectos de la aplicación de las condiciones referentes a los usos compatibles y autorizables se distinguen … los siguientes niveles a, b y c.' Every building parameter (parcela, linderos, retranqueos, ocupación, edificabilidad, altura) is stated per GRADO only. Two nivel-specific exceptions were found and are recorded: grado 1º nivel c (art. 8.8.17.2.b) sets an alternative-use FAR of 1 m²/m² and ocupación 40%/70%) and grado 2º nivel a (art. 8.8.4.2.c) redirects registered parcels to grado 3º position conditions)."},
    "nz9": {"normaZonal": "9", "designation": "Actividades económicas", "capitulo": "8.9",
            "capituloHeading": "CAPÍTULO 8.9. CONDICIONES PARTICULARES DE LA ZONA 9: ACTIVIDADES ECONÓMICAS",
            "grados": NZ9_CODES, "pdfPageRange": [451, 459],
            "gradosNote": "CHAPTER NUMBER CONFIRMED = 8.9 (heading read at pdfPage 451). Art. 8.9.3: 'se distinguen cinco (5) grados … con los códigos 1º, 2º, 3º, 4º y 5º, estableciéndose los niveles a y b en el grado 4º, a efectos de posición de la edificación.' The niveles exist ONLY in grado 4º and — unlike NZ 8 — they are declared to govern POSITION, which is why 9.4.a and 9.4.b differ on separación a linderos (3 m vs 6 m), retranqueo (free vs 8 m) and altura (5/20 vs 7/28), while sharing the same 2,4 m²/m² FAR."},
    "nz1": {"normaZonal": "1", "designation": "Protección del Patrimonio Histórico", "capitulo": "8.1",
            "capituloHeading": "CAPÍTULO 8.1. CONDICIONES PARTICULARES DE LA ZONA 1. PROTECCIÓN DEL PATRIMONIO HISTÓRICO",
            "grados": ["1.1", "1.2", "1.3", "1.4", "1.5", "1.6"], "pdfPageRange": [367, 386],
            "gradosNote": "Art. 8.1.1.2: six grados, codes 1º-6º. No niveles.",
            "healthWarning": "NZ 1 is the LEAST automatable Norma Zonal in Título 8. Height is CPPHAN-discretionary in grados 1º-5º; Z is map-borne; fondo máximo is map-borne in grados 1º/3º; grado 5º is defined entirely by the existing building. An envelope generator should refuse for grados 1-5 rather than guess."},
}


def main():
    outdir = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        "docs", "04-reference", "jurisdictions", "es", "es-md", "28079-madrid", "extracted")
    os.makedirs(outdir, exist_ok=True)
    for name, fn in (("nz8", nz8), ("nz7", nz7), ("nz5", nz5), ("nz9", nz9), ("nz1", nz1)):
        recs = stamp_height_datums(fn())
        meta = dict(META[name])
        meta.update({"document": DOC, "readFrom": READ, "printedPageOffset": -2,
                     "extractedFromCounts": {
                         "table": sum(1 for r in recs if r["extractedFrom"] == "table"),
                         "prose": sum(1 for r in recs if r["extractedFrom"] == "prose")},
                     "nullCount": sum(1 for r in recs if r["value"] is None),
                     "recordCount": len(recs)})
        path = os.path.join(outdir, name + ".json")
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"$meta": meta, "records": recs}, f, ensure_ascii=False, indent=2)
        print(f"{path}: {len(recs)} records "
              f"(table={meta['extractedFromCounts']['table']}, "
              f"prose={meta['extractedFromCounts']['prose']}, null={meta['nullCount']})")


if __name__ == "__main__":
    main()
