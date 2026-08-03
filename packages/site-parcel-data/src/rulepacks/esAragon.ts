// ARAGÓN (ES) — Huesca (INE 22125) and Zaragoza (INE 50297), registered as REFUSAL jurisdictions.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHY THIS EXISTS AT ALL: "ARAGÓN IS CLOSED" WAS A REGIONAL CLAIM, AND IT DOES NOT SURVIVE
// ─────────────────────────────────────────────────────────────────────────────────────────────
//
// Aragón was recorded CLOSED on four caps. Three of the four are properties of the REGIONAL SIUa
// layer (its 21.8 % `fiab_geom` legal-approval rate, its 1:15,000 publication scale, the fact
// that IDEAragon's download catalogue carries no buildability) generalised to the municipal level
// without ever being tested there. Measured on 421 Zaragoza parcels, the regional tier was NEVER
// REACHED on 412 of them — the headline cap was not binding on 97.9 % of the sample.
//
// Spain is organised `parcel → municipality → instrument → detailed zoning → rule`, NOT by
// autonomous community. So the honest unit of coverage is the MUNICIPALITY, and both capitals
// below now route. Neither publishes a numeric envelope, and both say precisely why.
//
// PURITY: L2-pure. Data + string builders + spans. No I/O, no THREE, no DOM, no clock.
//
// Strategic context — C58 §1.2/§1.4/§1.5, C60 §3, C63 (LEGISLATION vs SOURCES axes),
// §CONTEXT-DATA-HONESTY, ENVELOPE-REPLICATION-STANDARD (ADR-0279).

import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { EnvelopeRefusal } from '@pryzm/schemas';

const tracer = trace.getTracer('pryzm.zoning');

/** The jurisdiction id Huesca uses — the INE municipal code. */
export const HUESCA_JURISDICTION_ID = 'es-22125-huesca';

/** The jurisdiction id Zaragoza uses — the INE municipal code. */
export const ZARAGOZA_JURISDICTION_ID = 'es-50297-zaragoza';

/**
 * ⚠ THE HONESTY GATE for Huesca. `false`, and the reason is a GEOREFERENCE, not a missing law.
 * The governing numbers are read and article-cited (see `HUESCA_PLANO5_FINDING`); what is missing
 * is the ability to say WHERE on the ground the plan sheet's lines fall. Do not flip to make a
 * demo work.
 */
export const HUESCA_ENVELOPE_VERIFIED: boolean = false;

/**
 * ⚠ THE HONESTY GATE for Zaragoza. `false` — and as of the §ZGZ-SUBGRADO census the REASON HAS
 * CHANGED, while the value deliberately has not.
 *
 * It used to read: *"the reason is ONE named attribute — the A1 subgrado — not a missing
 * ordinance."* That was wrong. The subgrado is published (`urbanismo:Calificaciones_Urbanas`,
 * 7,967 polygons, all four article selectors populated); it was merely unreachable by guessing
 * and invisible to WFS GetCapabilities. What is missing now is the TRANSCRIPTION of arts. 4.1.12
 * / 4.1.13 / 4.1.15 / 4.1.17 and the graphically-regulated fondo — i.e. a legal reading and a
 * signature, which is precisely what a gate exists to withhold.
 *
 * ⛔ DO NOT FLIP THIS BECAUSE THE DATA GOT BETTER. Better data moved Zaragoza from *"cannot be
 * signed"* to *"can now be signed once someone does the reading"*. A signature is a founder act
 * (L-449); a model flipping it is the L-677 defect. Flipping it today would authorise nothing
 * anyway — no zone table exists to publish — and would only remove the interlock that stops a
 * later author packing a guessed FAR (the L-616 mechanism).
 */
export const ZARAGOZA_ENVELOPE_VERIFIED: boolean = false;

/** The instrument every Huesca refusal that makes a claim about the law cites. */
export const HUESCA_INSTRUMENT_REF =
    'Revisión y Adaptación del Plan General de Ordenación Urbana de Huesca, TEXTO REFUNDIDO ' +
    '(enero 2008) of the PGOU approved by the Consejo de Ordenación del Territorio de Aragón on ' +
    '9 May 2003 — Normas Urbanísticas, Tomo I; and plano nº 5, «Clasificación, calificación y ' +
    'regulación del suelo y la edificación en suelo urbano. Red viaria, alineaciones y ' +
    'rasantes», E: 1/1.000, 28 hojas.';

/** The instrument every Zaragoza refusal that makes a claim about the law cites. */
export const ZARAGOZA_INSTRUMENT_REF =
    'Plan General de Ordenación Urbana de Zaragoza, Normas Urbanísticas, TEXTO REFUNDIDO 2024 — ' +
    'Título Cuarto (zonas de suelo urbano consolidado). Municipal zoning served live by IDEZar ' +
    '(Ayuntamiento de Zaragoza) in EPSG:25830.';

/**
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 * §PLANO5-IS-VECTOR — THE PREMISE BEHIND THE REFUSAL WAS FALSE, AND THE CORRECTION IS NATIONAL.
 * ─────────────────────────────────────────────────────────────────────────────────────────────
 *
 * València is a refusal jurisdiction because its buildable depth is «GRAPHED ON THE PLANO C
 * SHEETS, which the city does not publish as data». Huesca refuses for the identical stated
 * reason («definido gráficamente en el plano nº5»), Zaragoza for a third instance of it.
 *
 * ⛔ MEASURED, AND THE PREMISE IS FALSE FOR HUESCA. The sheets are not images. They are
 * MicroStation (`HOJAS-URBANA.dgn`) CAD plots printed through PScript5 → Acrobat Distiller:
 * ZERO font objects, ZERO raster XObjects, ZERO painted-text operators, and 111k–336k vector
 * path operators per sheet. *"Not published as data"* was inferred from *"published as PDF"*,
 * and **PDF is a container, not a format.**
 *
 * What that does and does not buy, stated separately because they are different claims:
 *
 *   ✔ THE GEOMETRY EXTRACTS. 672 closed building-scale polygons recovered from one sheet.
 *   ✔ THE LEGEND IS ON THE SHEET AND BINDS. The «DELIMITACIONES Y SIMBOLOGÍA» panel is printed
 *     on every sheet; its swatches are real geometry at known page positions, so each one's
 *     stroke class is MEASURABLE and can be bound to the caption beside it. 7 rows measured,
 *     5 uniquely bound, 0 stroke-class collisions.
 *   ✔ AND THE SHEETS ARE IN COLOUR. An earlier probe reported them GREYSCALE («every paint
 *     colour satisfies r == g == b») and concluded zone identity is not colour-coded. That is
 *     WRONG: measured stroke colours include pure red (1,0,0), pure blue (0,0,1) and cyan
 *     (0,1,1). Alineación is red at width 0.72 pt; the fondo/height-change line is red at width
 *     0.60 pt — indistinguishable to the eye, cleanly separable by measurement.
 *
 *   ✗ THE SHEET IS NOT GEOREFERENCED. See `HUESCA_GEOREFERENCE_STATUS`. Being vector is
 *     NECESSARY, NOT SUFFICIENT.
 *
 * ⇒ Every Spanish refusal whose stated reason is "the number is on a plan sheet" should be
 *   re-tested rather than inherited. València's plano C and Zaragoza's tomo 11 were NOT
 *   anatomised — that is UNKNOWN, not absent.
 */
export const HUESCA_PLANO5_FINDING =
    'Plano nº 5 is a VECTOR CAD plot, not a picture: zero fonts, zero rasters, zero text ' +
    'operators and 111k–336k path operators per sheet, exported from a MicroStation drawing. Its ' +
    'geometry extracts, and the legend printed on the sheet binds each symbol to a measurable ' +
    'stroke class. So the long-standing reason for refusing — "the figure is only on a plan ' +
    'sheet" — is not a reason on its own.';

/**
 * §GEOREFERENCE-UNKNOWN — the blocker, stated as a measurement rather than an impression.
 *
 * CRS is NOT the problem and is not in doubt: EPSG:25830 (ETRS89 / UTM 30N), declared
 * independently by Catastro's Buildings WFS, by Catastro's ATOM entry for 22901-HUESCA, by the
 * delivered GML's own `srsName`, and by IDEAragon's WFS. Scale is not in doubt either — the
 * title block prints «ESCALA 1 / 1.000», giving 0.35278 m of ground per PDF point without
 * fitting anything.
 *
 * ⛔ WHAT IS UNKNOWN IS THE SHIFT. Matching extracted building footprints against the Catastro
 * cadastre for the same municipality produced a best candidate at E 713634.1, N 4668726.6, with
 * a MEDIAN HOLD-OUT RESIDUAL OF 2.31 m over 23 features the fit never saw. It is REJECTED, and
 * the reason it is rejected is the part that matters:
 *
 *   • the candidate matched only 1.9× as many hold-out features as a deliberately WRONG decoy
 *     shift 45–60 m away (23 vs 12). The acceptance bar was 3×.
 *   • a nearest-neighbour search in a dense historic centre matches ~93 % of features at ANY
 *     offset, so "93 % matched" — the first run's headline — measured nothing at all.
 *   • 2.31 m is in any case too coarse for a 1:1.000 sheet, where an alignment line is a legal
 *     boundary and a metre is a room.
 *
 * ⇒ The sheet is NOT georeferenced. That is an UNKNOWN, not a statement that it cannot be — the
 *   next lever is to filter the match features BY THE BOUND STROKE CLASSES (match only the base
 *   map's parcel line work, not hatching or outlined glyphs) instead of by polygon area.
 *   ⛔ Until it clears, no line on the sheet may be turned into a metre value on the ground.
 */
export const HUESCA_GEOREFERENCE_STATUS =
    'The plan sheet is not yet georeferenced. Its coordinate system is certain (ETRS89 / UTM ' +
    '30N, EPSG:25830, declared by four independent sources) and its scale is printed on the ' +
    'sheet (1/1.000), but the position fix tested against the national cadastre was rejected: it ' +
    'was only 1.9× better than a deliberately wrong control offset, against a 3× bar, at a ' +
    '2.31 m median error. Until that is closed, PRYZM cannot say where on your land the plan’s ' +
    'lines fall, and will not convert them into a figure.';

/**
 * §LEGEND-BOUND — the symbology mapping, and the two entries that must stay UNKNOWN.
 *
 * Each mapping below is cited to the legend text printed on plano nº 5 itself (panel
 * «DELIMITACIONES Y SIMBOLOGÍA»), with the stroke class measured from the swatch beside it:
 *
 *   BOUND    «LÍMITE DE TÉRMINO MUNICIPAL»      black, w 0.60, solid
 *   BOUND    «LÍMITE DE SUELO URBANO»           blue  (0,0,1), w 0.90, solid
 *   BOUND    «RASANTE»                          black, w 0.30 + filled marker, annotated in m
 *   BOUND    «ALINEACIÓN»                       red   (1,0,0), w 0.72, solid
 *   BOUND    «SOPORTAL Y PASAJES»               red   (1,0,0), w 0.60, dashed [11.88 3.96]
 *
 *   ⚠ UNKNOWN «CAMBIO DE ALTURA Y USO / FONDO EDIFICABLE»   red (1,0,0), w 0.60, solid
 *       The stroke class is unique and findable. THE MEANING IS NOT: the sheet prints TWO
 *       distinct planning meanings against this ONE swatch. A red 0.60 solid line is EITHER a
 *       change-of-height-and-use line OR the buildable-depth line, and nothing in the drawing
 *       says which. Detectable, NEVER convertible into a depth.
 *
 *   ⚠ UNKNOWN «LÍMITE DE NORMA ZONAL Y GRADOS / API / APE / APR»  blue, w 0.90, dashed
 *       FOUR captions against one swatch.
 *
 * ⛔ THE ASYMMETRY IS THE WHOLE POINT. "I can find the line" and "I know what the line means"
 *    are different claims, and only the first is true for the fondo edificable. Drawing an
 *    UNKNOWN as a number is how buildability gets overstated (L-616).
 */
export const HUESCA_LEGEND_STATUS =
    'The plan sheet’s own legend has been read and bound: municipal boundary, urban-land ' +
    'boundary, rasante, alineación and soportal each map to a distinct, measurable line style. ' +
    'But the sheet draws the BUILDABLE-DEPTH line and the change-of-height line in the SAME ' +
    'style, and prints both captions against one legend swatch — so a line of that style cannot ' +
    'be attributed to one meaning or the other from the drawing alone.';

/**
 * §THE-LAW-IS-READ — Huesca's blocker is DATA, not legislation. Cited verbatim.
 *
 * Art. 8.4.8 «Ocupación y fondo edificable» (NZ4, manzana cerrada), Normas Urbanísticas Tomo I:
 *   «La ocupación viene definida por la alineación oficial, los linderos laterales y la línea de
 *    fondo edificable. […] Grado 2: El fondo máximo se fija en veinte (20) metros […] con
 *    excepción de los casos en los que gráficamente se determine un fondo edificable diferente
 *    […]. En cualquier caso, para el cálculo de la edificabilidad se utilizará el fondo definido
 *    gráficamente en el plano nº5.»
 *
 * Art. 8.4.10 sends height the same way: «La altura de la edificación y consiguiente número de
 * plantas, se establece según las grafiadas en el plano nº5», with art. 6.4.5.5.a converting
 * storeys to metres (B+1 = 7,50 m · B+2 = 10,50 · B+3 = 13,50 · B+4 = 16,50 · B+5 = 19,50 ·
 * B+6 = 22,50 · B+7 = 25,50).
 *
 * ⛔ SO THE 20 m DEFAULT IS NOT A FALLBACK PRYZM MAY USE. It is expressly overridden by whatever
 *    the sheet dimensions, and it applies only to Grado 2 — and the calificación data does not
 *    publish the grado. Publishing 20 m would be inventing a datum in the one case the ordinance
 *    explicitly excludes.
 *
 * ⚠ AND PLANO Nº 5 IS NOT THE WHOLE CITY. NZ1 («Edificación Tradicional en Barrios») and NZ2
 *   («Transformación en Barrios») are graphed on plano nº 12, not nº 5; NZ3 spans both. A
 *   pipeline that reads only plano nº 5 returns "unzoned" for the barrios — failure wearing the
 *   costume of absence.
 */
export const HUESCA_LAW_STATUS =
    'Huesca’s ordinance is fully read and article-cited: art. 8.4.8 defines the buildable ' +
    'footprint from the official alignment, the side boundaries and the fondo edificable line, ' +
    'and art. 8.4.10 sets height by the storey count drawn on the same sheet. The 20 m written ' +
    'default cannot stand in for the drawing — the article itself makes it yield wherever the ' +
    'plan dimensions a different depth, and it governs only one of the two grades, which the ' +
    'published zoning data does not identify. The gap is DATA, not law.';

/**
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * §ZGZ-SUBGRADO — ⛔ THE RECORDED BLOCKER WAS FALSE. THE SUBGRADO IS PUBLISHED, AND ALWAYS WAS.
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *
 * WHAT THIS FILE USED TO SAY, AND WHY IT WAS WRONG
 * ------------------------------------------------
 * *"The published polygon carries only `A1`. A 28-name sweep for a subgrado-bearing typename
 * returned HTTP 400 on all 28 — an unknown-typename answer, which IS evidence."*
 *
 * The 28 400s were REAL and they were WORTHLESS. An HTTP 400 from a WFS means UNKNOWN TYPENAME:
 * it is a fact about the twenty-eight GUESSES, not about the city. Reading it as "the city does
 * not hold this" is the §CONTEXT-DATA-HONESTY failure exactly — *could not find* recorded as
 * *is not there* — and it cost Zaragoza a numeric pack it was eligible for.
 *
 * ⭐ TWO LAYERS WITH ALMOST THE SAME NAME, AND OPPOSITE VERDICTS. The earlier probe measured
 *    `urbanismo:Estructura` (9,031 polygons) — the *plano de ESTRUCTURA urbanística*, whose
 *    `calificacion` is deliberately coarse (`A1`, `B`, `C`, 42 codes, zero containing `/`).
 *    That reading was accurate about `Estructura` and was then generalised to "Zaragoza".
 *    The *plano de CALIFICACIÓN y regulación del suelo* is a DIFFERENT feature type,
 *    `urbanismo:Calificaciones_Urbanas` — 7,967 polygons, EPSG:25830, and its codes CARRY THE
 *    SUBGRADO. All four articles' selectors are present and populated:
 *
 *        A1/3.1 → 301 polygons (art. 4.1.12)   A1/4.1 → 215 polygons (art. 4.1.15)
 *        A1/3.2 →  40 polygons (art. 4.1.13)   A1/4.2 → 114 polygons (art. 4.1.17)
 *        plus A1/1 (299), A1/2 (354), A1/2* (1), A1/3.1* (1)
 *
 *    ⭐ AND THE TWO LAYERS RECONCILE EXACTLY: `Estructura` reports A1 = **1,325** polygons, and
 *      those eight A1/* codes sum to **1,325**. The fine layer is the coarse layer resolved, not
 *      a rival dataset — which is the strongest available evidence that the subgrado is the
 *      SAME determination at finer grain, and not some unrelated annotation.
 *
 * ⛔⛔ WHY NO AMOUNT OF GUESSING **OR** ENUMERATING WOULD HAVE FOUND IT — THE REUSABLE LESSON.
 *    `urbanismo:Calificaciones_Urbanas` answers WFS `GetFeature` with HTTP 200 and always did.
 *    It is simply **ABSENT FROM WFS `GetCapabilities`**, which advertises 178 typenames and omits
 *    it. So the obvious correction to a failed name-sweep — *"stop guessing, enumerate
 *    GetCapabilities"* — WOULD ALSO HAVE MISSED IT. Capabilities is not an inventory; it is a
 *    publication choice.
 *
 *    The step that closes it is WMS **`DescribeLayer`**, which asks the server what each drawn
 *    layer is MADE OF and returns the typeName behind it. Chained from the city's own published
 *    page, every link is server-authored and nothing is invented:
 *
 *        published city page → WMS endpoint → GetCapabilities (4,565 layers)
 *          → DescribeLayer → 47 `urbanismo:` feature types, of which **25 are unadvertised**
 *
 *    ⇒ `tools/ogc-layer-census/` implements this and is city-agnostic. Any jurisdiction recorded
 *      blocked on "the service does not serve X" should be re-run through it before that claim is
 *      allowed to stand. §CONTEXT-DATA-HONESTY: ship the probe before the fix.
 *
 * ⚠ WHAT THIS DOES **NOT** DO: it does not open the gate. Selecting art. 4.1.12 now has a
 *   selector, but PRYZM has NOT transcribed those articles' numbers, and the A1 fondo edificable
 *   remains graphically regulated (art. 4.1.3 makes the 7,50 m prose figure a minimum that
 *   applies only where no graphic regulation exists). A selector is not a number.
 *   ⇒ `ZARAGOZA_ENVELOPE_VERIFIED` stays `false`. What changed is the REASON, and the reason is
 *     now a transcription that has not been done rather than data the city withholds.
 */
export const ZARAGOZA_SUBGRADO_FINDING =
    'Zaragoza’s municipal zoning is live and parcel-precise, and — corrected against an earlier ' +
    'reading — the plan’s subgrado IS published: the city’s calificación layer carries 7,967 ' +
    'polygons whose codes are the full grades (A1/3.1, A1/3.2, A1/4.1, A1/4.2 and 23 more), not ' +
    'the coarse "A1" an earlier probe measured on the separate estructura layer. What is still ' +
    'missing is not data but a reading: the articles those grades select have not been ' +
    'transcribed and signed, and the buildable depth for the closed-block grades is regulated ' +
    'graphically on the plan. So PRYZM publishes no floor-area ratio and no height here yet.';

/** Zaragoza's calificación vocabulary as MEASURED, not as transcribed — the counts are a census
 *  of `urbanismo:Calificaciones_Urbanas` (7,967 polygons, EPSG:25830), not a claim about the law. */
export const ZARAGOZA_CALIFICACION_CENSUS = Object.freeze({
    typeName: 'urbanismo:Calificaciones_Urbanas',
    epsg: 25830,
    polygons: 7967,
    distinctCodes: 52,
    subgradedCodes: 27,
    subgradedPolygons: 2025,
    /** ⚠ ADVERTISED = false. Reachable over WFS, absent from WFS GetCapabilities. */
    advertisedInWfsCapabilities: false,
    /** The four selectors the aprovechamiento articles key on, with their measured counts. */
    articleSelectors: Object.freeze({
        'A1/3.1': Object.freeze({ polygons: 301, article: '4.1.12' }),
        'A1/3.2': Object.freeze({ polygons: 40, article: '4.1.13' }),
        'A1/4.1': Object.freeze({ polygons: 215, article: '4.1.15' }),
        'A1/4.2': Object.freeze({ polygons: 114, article: '4.1.17' }),
    }),
    /** The reconciliation that makes the fine layer the coarse layer RESOLVED, not a rival. */
    coarseA1Polygons: 1325,
    fineA1PolygonsSummed: 1325,
} as const);

/**
 * §ZGZ-ALIGNMENT-CANDIDATE — a candidate PROVED against a paired control, and still not adopted.
 *
 * Zaragoza runs an official *Alineaciones y Rasantes* procedure (sede tramite 3337), so
 * authoritative alignment data demonstrably EXISTS as an administrative product. The city's own
 * A&R page states that editable Shapefile/GeoJSON over WMS/WFS is a FUTURE availability, and a
 * term census over all 4,565 published WMS layers returns **ZERO** hits for `alineac` and
 * **ZERO** for `rasante`. So there is no layer that ANNOUNCES itself as the alignment.
 *
 * ⚠ THERE IS, HOWEVER, ONE UNADVERTISED CANDIDATE, AND IT WAS TESTED RATHER THAN ASSUMED.
 *   `urbanismo:Linea_Normativa` ("Línea normativa", 8,705 lines, EPSG:25830) splits into three
 *   `codigo` classes. Measured as point-to-segment distance from each class's vertices to the
 *   nearest `urbanismo:Manzanas` block boundary, inside one dense consolidated-urban window:
 *
 *     codigo=302101   n=1,643   median  0.03 m   74.2 % within 1 m   ◀ on the block/street line
 *     codigo=302401   n=3,054   median 10.77 m   10.1 % within 1 m
 *     codigo=302201   n=   90   median 12.67 m   16.7 % within 1 m
 *     PAIRED CONTROL — `urbanismo:Vias` named street CENTRELINES:
 *                     n=7,240   median 11.68 m    1.0 % within 1 m
 *
 *   ⇒ the candidate class is **367×** closer to the block boundary than the axis control, while
 *     its OWN SIBLING CLASSES sit at the control's distance (1.08× and 0.92×). The separation is
 *     therefore not an artefact of "in a dense city everything is near everything" — the same
 *     layer, same window, same metric discriminates internally. (A second control, `Parcelas`
 *     boundaries, lands between at 6.04 m as expected, since it includes interior plot divisions.)
 *
 * ⛔ AND IT IS STILL NOT ADOPTED, for a reason that is not squeamishness. Lying on the
 *    block/street interface is NECESSARY for an alineación and NOT SUFFICIENT — a kerb line, a
 *    façade line and a parcel frontage all satisfy it. GeoServer's own SLD for this layer keys
 *    its rules on the bare code (`302101`) with NO human-readable title, so the city publishes
 *    the geometry WITHOUT its semantics. Adopting it would mean asserting a meaning nobody has
 *    established — the L-616 mechanism, and the thing §NO-SYNTHESISED-ALIGNMENT forbids.
 *    ⇒ Recorded as a MEASURED CANDIDATE awaiting a semantic citation, never as an alignment.
 */
export const ZARAGOZA_ALIGNMENT_CANDIDATE = Object.freeze({
    typeName: 'urbanismo:Linea_Normativa',
    epsg: 25830,
    candidateCodigo: '302101',
    candidateSamples: 1643,
    /** ⚠ FULL PRECISION, as measured. Rounding this to `0.03` for readability and ALSO storing a
     *  separately-rounded ratio made the two disagree by 6 % — the L-422 family at the numeric
     *  seam, caught by the test that recomputes it. Store the measurement; derive the rest. */
    candidateMedianMetres: 0.03179072931957302,
    candidateFractionWithin1m: 0.7419354838709677,
    controlTypeName: 'urbanismo:Vias',
    controlSamples: 7240,
    controlMedianMetres: 11.67704921777246,
    controlFractionWithin1m: 0.009668508287292817,
    /** ⛔ The gating fact: geometry published, meaning not. */
    semanticsPublished: false,
    adopted: false,
} as const);

/**
 * How much closer to a block boundary the candidate sits than the paired street-axis control.
 * ⚠ DERIVED, never stored — see `candidateMedianMetres`. One statement of a number, not two.
 */
export function zaragozaAlignmentSeparationRatio(): number {
    const span = tracer.startSpan('pryzm.zoning.zaragozaAlignmentSeparationRatio');
    try {
        const { controlMedianMetres, candidateMedianMetres } = ZARAGOZA_ALIGNMENT_CANDIDATE;
        const ratio = controlMedianMetres / candidateMedianMetres;
        span.setAttribute('separationRatio', ratio);
        span.setStatus({ code: SpanStatusCode.OK });
        return ratio;
    } finally {
        span.end();
    }
}

/**
 * §ZGZ-SHEET-INDEX — the plan-sheet index the Aragón agent recorded as NOT LOCATED. It exists.
 *
 * That agent was right to refuse to guess a URL for Zaragoza's tomo 11 sheet index. It is
 * published as VECTOR GEOMETRY rather than as a document: four georeferenced sheet-grid layers on
 * the city's own WFS, in EPSG:25830 —
 *   `urbanismo:hoja_pgou_2000` (165 sheets, codes H12…), `hoja_pgou_5000` (141),
 *   `hoja_pgou_chc` (4), `hoja_pgou_chr` (11).
 *
 * ⭐ WHY THIS MATTERS BEYOND ZARAGOZA. Huesca's blocker is that plano nº 5 is vector CAD that is
 *   NOT GEOREFERENCED (best fit rejected at 2.31 m). A sheet index is exactly the missing datum:
 *   each polygon IS the sheet's footprint on the ground, so a sheet can be positioned from the
 *   publisher's own geometry instead of fitted against the cadastre. Zaragoza publishes one.
 *   ⚠ It is NOT asserted that Huesca has an equivalent — that is UNKNOWN and worth one probe.
 */
export const ZARAGOZA_SHEET_INDEX_FINDING =
    'Zaragoza publishes its PGOU plan-sheet index as georeferenced vector geometry (165 sheets at ' +
    '1:2.000 and 141 at 1:5.000, in ETRS89 / UTM 30N), so a plan sheet can be placed on the ' +
    'ground from the city’s own published footprint rather than fitted by guesswork.';

/**
 * §ZGZ-NORMATIVE-LAYERS — what else the DescribeLayer census turned up, stated as reachability
 * only. None of these is transcribed, and none authorises a number.
 *
 * ⚠ THE ONE MOST LIKELY TO BE MISREAD: `urbanismo:Alturas_Edificios` (179,692 labels) is the
 *   SURVEYED existing storey count — its vocabulary contains `SOLAR`, `MARQ.` and `E.T.`, which
 *   are descriptions of what is standing, not grants. The NORMATIVE height is a different,
 *   unadvertised layer, `urbanismo:Textos_Altura_Edificable` (7,856 labels), whose GeoServer rule
 *   is literally named "Altura Edificable" and whose values include `H = III PLANTAS` and
 *   `H = 10,50 M.`. Confusing the two would publish an existing building as a legal entitlement.
 */
export const ZARAGOZA_REACHABLE_NORMATIVE_LAYERS = Object.freeze([
    Object.freeze({ typeName: 'urbanismo:Calificaciones_Urbanas', features: 7967, advertised: false }),
    Object.freeze({ typeName: 'urbanismo:Textos_Altura_Edificable', features: 7856, advertised: false }),
    Object.freeze({ typeName: 'urbanismo:Condiciones_Edificacion', features: 8092, advertised: false }),
    Object.freeze({ typeName: 'urbanismo:Linea_Normativa', features: 8705, advertised: false }),
    Object.freeze({ typeName: 'urbanismo:Poligono_Normativo', features: 986, advertised: false }),
    Object.freeze({ typeName: 'urbanismo:Acotaciones', features: 3287, advertised: false }),
    Object.freeze({ typeName: 'urbanismo:Condicion_Adjetiva_Uso', features: 93, advertised: false }),
    Object.freeze({ typeName: 'urbanismo:Ejes_Vias_Previstos', features: 1945, advertised: false }),
    Object.freeze({ typeName: 'urbanismo:Calificaciones_No_Urbanas', features: 995, advertised: false }),
    Object.freeze({ typeName: 'urbanismo:Estructura', features: 9031, advertised: false }),
    Object.freeze({ typeName: 'urbanismo:Alturas_Edificios', features: 179692, advertised: true }),
] as const);

/** C60 §3 — the honest statement of what PRYZM covers in Aragón today, and its limits. */
export const ARAGON_ROADMAP_LINE =
    'Aragón coverage today: both provincial capitals are ROUTED, and their parcels resolve from ' +
    'the national Catastro. Zaragoza additionally resolves its municipal calificación live. ' +
    'Neither publishes a buildable envelope yet, and the two reasons are different and specific ' +
    '— Zaragoza serves the plan’s full zone grades, so what it now needs is the transcription of ' +
    'the articles those grades select, plus the graphically-regulated depth; Huesca needs its ' +
    '1:1.000 plan sheet positioned on the ground to better than a metre. ' +
    'Neither is a legislative gap. Points outside these municipalities fall back to their own ' +
    'jurisdiction, never to a borrowed Aragonese number.';

function zoneLabelOf(
    zoneCode: string | null | undefined,
    zoneLabel: string | null | undefined,
    fallback: string,
): string {
    if (zoneLabel && zoneLabel.trim()) {
        return `${zoneLabel.trim()}${zoneCode ? ` (${zoneCode})` : ''}`;
    }
    if (zoneCode && zoneCode.trim()) return `Zone ${zoneCode.trim()}`;
    return fallback;
}

/**
 * Huesca's coverage refusal. `code: 'no-rule-pack'`, `legallyGrounded: false`,
 * `ordinanceRef: null` — a statement about PRYZM's data, NOT about the law. The PGOU DOES grant
 * an envelope here; PRYZM cannot yet locate the drawing that carries it.
 */
export function huescaNoRulePackRefusal(
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.huescaNoRulePackRefusal');
    try {
        const zone = zoneLabelOf(zoneCode, zoneLabel, 'This Huesca parcel');
        span.setAttribute('jurisdictionId', HUESCA_JURISDICTION_ID);
        span.setAttribute('zoneCode', (zoneCode ?? '').trim());
        span.setAttribute('resultFields', 'no-rule-pack');
        span.setStatus({ code: SpanStatusCode.OK });

        return {
            code: 'no-rule-pack',
            headline:
                `${zone} — PRYZM has identified your land and has read the governing ordinance ` +
                'article by article. It cannot yet place the plan drawing on the ground to the ' +
                'precision the law requires, so it will not publish a buildable figure.',
            detail:
                'The parcel is established from the Spanish Dirección General del Catastro. ' +
                HUESCA_LAW_STATUS +
                ' ' +
                HUESCA_PLANO5_FINDING +
                ' ' +
                HUESCA_LEGEND_STATUS +
                ' ' +
                HUESCA_GEOREFERENCE_STATUS +
                ' ' +
                ARAGON_ROADMAP_LINE,
            ordinanceRef: null,
            legallyGrounded: false,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}

/**
 * Zaragoza's coverage refusal. Same shape and same discipline as Huesca's: a statement about one
 * missing published attribute, never about the law.
 */
export function zaragozaNoRulePackRefusal(
    zoneCode?: string | null,
    zoneLabel?: string | null,
    knownFacts: readonly string[] = [],
): EnvelopeRefusal {
    const span = tracer.startSpan('pryzm.zoning.zaragozaNoRulePackRefusal');
    try {
        const zone = zoneLabelOf(zoneCode, zoneLabel, 'This Zaragoza parcel');
        span.setAttribute('jurisdictionId', ZARAGOZA_JURISDICTION_ID);
        span.setAttribute('zoneCode', (zoneCode ?? '').trim());
        span.setAttribute('resultFields', 'no-rule-pack');
        span.setStatus({ code: SpanStatusCode.OK });

        return {
            code: 'no-rule-pack',
            headline:
                `${zone} — PRYZM has identified your land and reads Zaragoza's municipal zoning ` +
                'live, at the plan’s own zone grade. The articles that grade selects have not ' +
                'yet been transcribed and signed, so PRYZM will not publish a buildable figure.',
            detail:
                'The parcel is established from the Spanish Dirección General del Catastro, and ' +
                "the zoning from the city's own municipal service at parcel precision. " +
                ZARAGOZA_SUBGRADO_FINDING +
                ' No height, buildability, occupation or depth is published here — never an ' +
                'estimate, never a proxy figure. ' +
                ARAGON_ROADMAP_LINE,
            ordinanceRef: null,
            legallyGrounded: false,
            knownFacts: [...knownFacts],
        };
    } finally {
        span.end();
    }
}
