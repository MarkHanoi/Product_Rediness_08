// ─────────────────────────────────────────────────────────────────────────────
// STAGE 0 — DATASET DISCOVERY · THE PLANNING VOCABULARY
//
// WHY THIS FILE IS DATA, NOT CODE
// -------------------------------
// This is the only part of the discovery tool a planner (not an engineer) must be able to read and
// correct. It is therefore a flat table with no control flow. `classify.mjs` is the engine; this is
// its dictionary.
//
// HOW IT WAS CONSTRUCTED — and why that ordering matters
// ------------------------------------------------------
// It was built VARIABLE-FIRST, not layer-first. We enumerated the geometric + normative inputs an
// envelope compiler needs (the same inventory Córdoba's `LAYER2-GEOMETRY-RECOVERY-2026-08-02.md`
// §Task 1 tabulates), and only then asked what a Spanish/Catalan/English publisher would call each.
// It was NOT built by looking at the three datasets humans missed and writing patterns that match
// them. That distinction is the whole validity of the acid test in the protocol §9 — a dictionary
// reverse-engineered from its own answer key proves nothing.
//
// ⚠ EVERY ENTRY PROPOSES A **CANDIDATE**. Nothing here resolves anything.
//   `sup_viales` produced a believable 9.12 m median street width in Córdoba and was still the wrong
//   legal object — the *callejero* (physical street surface), not an *alineación* (a legal line).
//   *"Plausible, which is the trap."* Terms whose historical misuse is documented carry a `caveat`
//   that the tool prints next to every hit, forever. Institutional memory belongs in the dictionary,
//   not in the reviewer's head.
//
// AUTHORITY: ADR-0283 (publication bounds knowledge) · ADR-0284 (derived geometry ok, derived law
// not) · ADR-0285 (the four-part observable-criterion test) · ADR-0288 (machine-readable ≠
// publishable) · MACHINE-READABLE-EVIDENCE-REGISTER.md · PROBE-DISCIPLINE.md.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The planning variables an envelope compiler consumes. A discovery hit names one of these ids; it
 * never names a value.
 *
 * `adr0285` marks variables whose supply is an OBSERVABLE GEOMETRIC QUANTITY — i.e. where the
 * ADR-0285 four-part test is the gate between "we may compute this" and "this is an amendment to the
 * ordinance". The tool can pre-answer parts 3 and 4 only; parts 1 and 2 are a human reading the
 * instrument.
 */
export const PLANNING_VARIABLES = {
    'parcel-boundary': { label: 'Parcel boundary', adr0285: false },
    'parcel-area': { label: 'Parcel area (parcela mínima)', adr0285: true },
    'block-ring': { label: 'Block ring / manzana polygon', adr0285: false },
    'block-depth': { label: 'Block depth', adr0285: true },
    'street-width': { label: 'Street width (ancho de calle)', adr0285: true },
    'building-line': { label: 'Building line / alignment (alineación)', adr0285: false },
    'frontage': { label: 'Frontage (frente de parcela)', adr0285: true },
    'setback': { label: 'Setback (retranqueo)', adr0285: false },
    'buildable-depth': { label: 'Buildable depth (fondo / profundidad edificable)', adr0285: false },
    'building-height': { label: 'Building height (altura de cornisa)', adr0285: false },
    'storey-count': { label: 'Storey count (número de plantas)', adr0285: false },
    'floor-area-ratio': { label: 'Floor-area ratio (edificabilidad / aprovechamiento)', adr0285: false },
    'coverage-ratio': { label: 'Coverage / occupancy (ocupación)', adr0285: false },
    'zoning-regime': { label: 'Zoning regime (calificación / ordenanza / clave)', adr0285: false },
    'land-classification': { label: 'Land classification (suelo urbano / urbanizable / rústico)', adr0285: false },
    'plan-delegation': { label: 'Delegation to a derived plan (sector / ámbito / UE / PERI / ED)', adr0285: false },
    'use-designation': { label: 'Use designation (uso característico / compatible)', adr0285: false },
    'typology': { label: 'Building typology (aislada / entre medianeras / adosada)', adr0285: false },
    'axis-designation': { label: 'Designated axis (eje comercial / viario principal)', adr0285: false },
    'heritage-constraint': { label: 'Heritage / protection constraint', adr0285: false },
    'public-system': { label: 'Public system (dotacional / equipamiento / espacio libre)', adr0285: false },
    'building-footprint': { label: 'Building footprint', adr0285: false },
    'street-surface': { label: 'Street surface (callejero / viario físico)', adr0285: true },
    'terrain-rasante': { label: 'Terrain / rasante datum', adr0285: true },
    'admin-boundary': { label: 'Administrative boundary', adr0285: false },
    'sheet-index': { label: 'Plan-sheet index (hojas)', adr0285: false },
    'address-point': { label: 'Address / numbering', adr0285: false },
};

/**
 * `kind` drives DEMOTION, never exclusion. Every enumerated layer is emitted; the register wants the
 * whole inventory, including the boring parts, because a `Closed` row is only defensible if the
 * thing it closes was actually looked at.
 *
 *   normative  — the layer purports to depict a legal determination (an ordinance zone, an
 *                alignment, a designation). The only kind that can EVER carry legal authority.
 *   geometry   — a physical/administrative partition. Authorises nothing; may be REUSABLE.
 *   inventory  — a register of things (schools, trees, parking). Rarely relevant.
 *   basemap    — cartographic furniture (toponymy, sheet frames, symbols).
 *   imagery    — raster/orthophoto/flight coverage.
 */
export const LAYER_KINDS = ['normative', 'geometry', 'inventory', 'basemap', 'imagery', 'unknown'];

/**
 * INSTRUMENT MARKERS — tokens naming a PLANNING INSTRUMENT. These raise the LEGAL-AUTHORITY axis
 * only. They never raise machine-readability (ADR-0288: the two axes are independent, and a layer
 * called `pgou_*` is not one byte more readable for it).
 *
 * ⚠ A marker is evidence that the publisher ASSOCIATES the layer with an instrument. It is not
 * evidence that the instrument GRANTS the determination we want (ADR-0288 condition 2).
 */
export const INSTRUMENT_MARKERS = [
    { re: /\bpgou\b|\bpgm\b|\bpgmo\b|\bpg\b|plan[_\s-]?general/, instrument: 'plan general' },
    { re: /\bnnss\b|normas[_\s-]?subsidiarias/, instrument: 'normas subsidiarias' },
    { re: /\bpp\b|plan[_\s-]?parcial/, instrument: 'plan parcial' },
    { re: /\bperi\b|plan[_\s-]?especial/, instrument: 'plan especial' },
    { re: /\bpau\b|\bue\b|unidad[_\s-]?(de[_\s-]?)?ejecucion/, instrument: 'unidad de ejecución' },
    { re: /estudio[_\s-]?(de[_\s-]?)?detalle|\bed\b/, instrument: 'estudio de detalle' },
    { re: /ordenanza|\bnormativa\b|\bnorma\b/, instrument: 'ordenanza / normativa' },
    { re: /\bpou\b|\bpoum\b|\bmpg\b|modificacion[_\s-]?(puntual|del)/, instrument: 'plan / modification (CA/ES variants)' },
    { re: /\bplu\b|\bplui\b/, instrument: 'PLU (FR)' },
    { re: /bestemmingsplan|omgevingsplan/, instrument: 'bestemmingsplan (NL)' },
    { re: /\bzoning\b|land[_\s-]?use[_\s-]?plan/, instrument: 'zoning plan (EN)' },
    { re: /\bcatastro\b|\bcadastr|\binspire\b/, instrument: 'cadastre / INSPIRE' },
];

/**
 * ARTICLE-LEVEL CITATION MARKERS — attribute names that suggest a per-feature legal reference. This
 * is the strongest single legal-authority signal available WITHOUT reading the ordinance, because it
 * means the publisher itself bound the geometry to a text.
 */
export const CITATION_ATTRIBUTE_MARKERS = [
    /^art(iculo)?/, /^norma/, /^orden/, /^ficha/, /^link$/, /^url$/, /^expedient/, /^instrumento/,
    /^planeamiento/, /^referencia/, /^clave$/, /^clau$/, /^cod(igo)?_?(orden|zona|calif)/,
];

/**
 * ATTRIBUTES THAT ARE NOT SEMANTICS — an id column is not a planning attribute. Córdoba's Madrid
 * row turned on exactly this: `PG_ANALISIS_EDIFICACION` layers 2 and 12 are geometry-only
 * (`OBJECTID` and nothing else), which is a different machine-readability fact from a layer with
 * typed planning columns. `classify.mjs` subtracts these before counting semantics.
 */
export const NON_SEMANTIC_ATTRIBUTES = [
    /^objectid$/, /^globalid$/, /^fid$/, /^gid$/, /^id$/, /^oid$/, /^shape[_.]?(area|length|len)$/,
    /^st_area/, /^st_length/, /^geom(etry)?$/, /^the_geom$/, /^msgeometry$/, /^wkb_geometry$/,
];

/**
 * THE DICTIONARY.
 *
 *   `re`        — matched against the DE-ACCENTED, token-normalised layer name + title + abstract +
 *                 keywords. Word-boundary anchored wherever a bare substring would over-match.
 *   `variables` — candidate PLANNING_VARIABLES ids. Candidates. Always candidates.
 *   `weight`    — planning relevance, 0..3. Drives triage order ONLY (see `classify.mjs`
 *                 §RANK-IS-NOT-A-SCORE). Never an authority claim.
 *   `kind`      — see LAYER_KINDS.
 *   `caveat`    — a documented way this term has misled PRYZM before. Printed with every hit.
 */
export const PLANNING_TERMS = [
    // ── The alignment family — the single highest-value discovery class in the corpus. ───────────
    {
        id: 'alineacion',
        re: /\balineacion(es)?\b|\balineament|\bbuilding[_\s-]?line\b|\brooilijn\b/,
        variables: ['building-line', 'street-width', 'block-depth', 'frontage'],
        weight: 3, kind: 'normative',
        note: 'Murcia SIG-MU2: the PGOU measures ancho de calle BETWEEN alineaciones, so this layer '
            + 'is the lawful input where `viales` centrelines are not.',
    },
    {
        id: 'retranqueo',
        re: /\bretranqueo?s?\b|\bsetback\b|\breculement\b|\bafstand[_\s-]?tot\b/,
        variables: ['setback', 'building-line'],
        weight: 3, kind: 'normative',
    },
    {
        id: 'fondo-edificable',
        re: /\bfondo(s)?\b|\bprofundidad(es)?\b|\bprofunditat\b|\bbuildable[_\s-]?depth\b/,
        variables: ['buildable-depth', 'block-depth'],
        weight: 3, kind: 'normative',
    },

    // ── The zoning-regime family. ────────────────────────────────────────────────────────────────
    {
        id: 'calificacion',
        re: /\bcalificacion(es)?\b|\bqualificacio\b|\bzonificacion\b|\bzonificacio\b|\bzonage\b|\bzoning\b/,
        variables: ['zoning-regime'],
        weight: 3, kind: 'normative',
    },
    {
        id: 'ordenanza',
        re: /\bordenanza(s)?\b|\bordenanca\b|\bordinance\b|\bnormativa\b/,
        variables: ['zoning-regime', 'coverage-ratio', 'floor-area-ratio'],
        weight: 3, kind: 'normative',
    },
    {
        id: 'clave',
        re: /\bclave(s)?\b|\bclau\b|\bcod[_\s-]?zona\b|\bzone[_\s-]?code\b/,
        variables: ['zoning-regime'],
        weight: 2, kind: 'normative',
        caveat: '`clave` is also a generic database word ("key"). Confirm the attribute domain before believing it.',
    },
    {
        id: 'clasificacion-suelo',
        re: /\bclasificacion\b|\bsuelo[_\s-]?(urbano|urbanizable|no[_\s-]?urbanizable|rustico)\b|\bsnu\b|\bsuc\b|\bsuelo\b/,
        variables: ['land-classification'],
        weight: 2, kind: 'normative',
    },

    // ── Height / bulk. ───────────────────────────────────────────────────────────────────────────
    {
        id: 'altura',
        re: /\baltura(s)?\b|\balcada\b|\bhoogte\b|\bheight\b|\bcornisa\b|\bgalibo\b/,
        variables: ['building-height'],
        weight: 3, kind: 'normative',
        caveat: 'A height layer is often a MEASURED height (LiDAR/Catastro), not a PERMITTED height. '
            + 'They are different variables; do not let the word bridge them.',
    },
    {
        id: 'plantas',
        re: /\bplanta(s)?\b|\bnum[_\s-]?plantas\b|\bmax[_\s-]?plantas\b|\bstorey|\bfloors?\b|\bniveles\b/,
        variables: ['storey-count'],
        weight: 3, kind: 'normative',
        caveat: 'Córdoba `vhex25_max_plantas` is Catastro-DERIVED storey counts — recorded as '
            + '`derived-levels`, earning no C63 Axis-6 credit. Derived ≠ normative.',
    },
    {
        id: 'edificabilidad',
        re: /\bedificabilidad\b|\bedificabilitat\b|\baprovechamiento\b|\bfar\b|\bfsi\b|\bcoef[_\s-]?edif/,
        variables: ['floor-area-ratio'],
        weight: 3, kind: 'normative',
    },
    {
        id: 'ocupacion',
        re: /\bocupacion\b|\bocupacio\b|\bcoverage\b|\bfootprint[_\s-]?ratio\b|\bbebouwingspercentage\b/,
        variables: ['coverage-ratio'],
        weight: 3, kind: 'normative',
    },
    {
        id: 'tipologia',
        re: /\btipologia(s)?\b|\btypolog|\baislada\b|\bentre[_\s-]?medianeras\b|\badosada\b/,
        variables: ['typology'],
        weight: 2, kind: 'normative',
    },

    // ── Designations. `eje` is a real planning object in ES instruments: a designated axis whose
    //    membership is GRAPHED by the plan rather than computed. Murcia Art. 5.5.3's *Ejes
    //    Comerciales* is the canonical case. ─────────────────────────────────────────────────────
    {
        id: 'eje',
        re: /\beje(s)?\b|\beix\b|\bcorredor\b|\baxis\b|\bviario[_\s-]?principal\b/,
        variables: ['axis-designation', 'street-surface'],
        weight: 2, kind: 'normative',
        caveat: 'An `eje` layer may be a DESIGNATION (a graphed legal condition — consume it) or a '
            + 'plain centreline geometry (no width, no designation). Read DescribeFeatureType before deciding.',
    },
    {
        id: 'uso',
        re: /\buso(s)?\b|\bus_?global\b|\bcomercial\b|\bresidencial\b|\bindustrial\b|\bterciario\b|\bdotacional\b/,
        variables: ['use-designation'],
        weight: 2, kind: 'normative',
    },
    {
        id: 'sistemas',
        re: /\bsistema(s)?\b|\bequipamiento(s)?\b|\bespacio(s)?[_\s-]?libre|\bzona(s)?[_\s-]?verde|\bviario\b/,
        variables: ['public-system'],
        weight: 2, kind: 'normative',
    },
    {
        id: 'delegacion-plan',
        re: /\bsector(es)?\b|\bambito(s)?\b|\bactuacion(es)?\b|\bunidad(es)?[_\s-]?ejec|\bpolig(ono)?[_\s-]?actuacion\b|\bdesarrollo\b/,
        variables: ['plan-delegation'],
        weight: 3, kind: 'normative',
        note: 'Delegated land is where the compiler must REFUSE with the instrument named — a cited '
            + 'refusal is the correct answer (C63 §1.5 / L-656), not a coverage failure.',
    },
    {
        id: 'proteccion',
        re: /\bproteccion(es)?\b|\bprotegid|\bpatrimonio\b|\bbic\b|\bcatalog|\bheritage\b|\byacimiento/,
        variables: ['heritage-constraint'],
        weight: 2, kind: 'normative',
        note: 'Heritage constrains DOWNWARD. Ignoring it OVER-states the envelope (València row).',
    },

    // ── Reusable geometry. Authorises nothing; supplies the compiler's spatial scaffolding. ──────
    {
        id: 'manzana',
        re: /\bmanzana(s)?\b|\billa\b|\bcity[_\s-]?block(s)?\b|\bblock(s)?\b|\bbouwblok/,
        variables: ['block-ring', 'block-depth'],
        weight: 3, kind: 'geometry',
        note: 'ADR-0283: a PUBLISHED block polygon outranks a cadastral dissolve we reconstruct. '
            + 'Córdoba `idecordoba:manzana` = 20,730 blocks covering 92.9 % of ordenanza polygons.',
    },
    {
        id: 'parcela',
        re: /\bparcela(s)?\b|\bparcel(a|es|as)?\b|\bcatastr|\bcadastr|\bperceel|\bplot(s)?\b/,
        variables: ['parcel-boundary', 'parcel-area'],
        weight: 3, kind: 'geometry',
    },
    {
        id: 'edificio',
        re: /\bedificio(s)?\b|\bconstruccion(es)?\b|\bedifici\b|\bbuilding(s)?\b|\bpand(en)?\b|\bvbuilding\b/,
        variables: ['building-footprint'],
        weight: 2, kind: 'geometry',
    },
    {
        id: 'vial',
        re: /\bvial(es)?\b|\bcalle(s)?\b|\bcallejero\b|\bcalzada\b|\bacera(s)?\b|\bcarrer\b|\bstreet\b|\broad\b|\bred[_\s-]?viaria\b|\btramo[_\s-]?vial\b/,
        variables: ['street-surface'],
        weight: 1, kind: 'geometry',
        caveat: '⛔ THE DOCUMENTED FALSE POSITIVE. Córdoba `sup_viales` gave a plausible 9.12 m median '
            + 'width and was WRONG: it is the callejero (physical street surface), a DIFFERENT LEGAL '
            + 'OBJECT from an alineación. Substituting it changes the criterion = derived LAW = '
            + 'forbidden (ADR-0284). Never accept this as a street-width source without the '
            + 'ordinance stating that the physical surface is the measurement basis.',
    },
    {
        id: 'rasante',
        re: /\brasante(s)?\b|\bcota(s)?\b|\bcurva(s)?[_\s-]?(de[_\s-]?)?nivel\b|\bmdt\b|\bdtm\b|\bdsm\b|\btopograf|\baltimetr/,
        variables: ['terrain-rasante'],
        weight: 2, kind: 'geometry',
        caveat: 'L-584: holding terrain is not holding the rasante. The ordinance measures from the '
            + 'rasante AT THE FAÇADE; one sample at a block centroid is a LEGAL defect, not a rounding error.',
    },
    {
        id: 'limite-admin',
        re: /\blim(ite)?[_\s-]?admin|\btermino[_\s-]?municipal\b|\bdistrito(s)?\b|\bbarrio(s)?\b|\bpedania(s)?\b|\bmunicipi|\bboundary\b/,
        variables: ['admin-boundary'],
        weight: 1, kind: 'geometry',
    },

    // ── Index / addressing. Low weight, but a sheet index is how a raster corpus becomes tractable. ─
    {
        id: 'hojas',
        re: /\bhoja(s)?\b|\bcuadricula\b|\bsheet(s)?\b|\bgrid[_\s-]?index\b|\bmalla\b/,
        variables: ['sheet-index'],
        weight: 1, kind: 'basemap',
    },
    {
        id: 'direcciones',
        re: /\bnumero(s)?\b|\bportal(es)?\b|\bdireccion(es)?\b|\baddress\b|\bnumerac/,
        variables: ['address-point'],
        weight: 1, kind: 'basemap',
    },
];

/**
 * DEMOTION TERMS — strong signals that a layer is furniture. They set `kind` when no `normative`
 * term matched, and they never delete a layer from the inventory.
 *
 * ⚠ They must not out-vote a normative hit. `Murcia:catastro_pgou_textos` matches both `toponimia`-
 * ish text furniture and `pgou`; the normative reading wins and the layer stays visible.
 */
export const DEMOTION_TERMS = [
    { id: 'imagery', re: /\bvuelo\b|\bortofoto\b|\bpnoa\b|\bortho\b|\braster\b|\bmosaico\b|\bimagen(es)?\b|\bwmts\b/, kind: 'imagery' },
    { id: 'toponymy', re: /\btoponimia\b|\btexto(s)?\b|\betiqueta(s)?\b|\brotul|\blabel(s)?\b|\bdrawings?\b|\bsimbolo/, kind: 'basemap' },
    { id: 'facilities', re: /\bbiblioteca|\bcolegio|\bcentro(s)?[_\s-]|\bdeportiv|\bdesfibrilador|\bwifi\b|\bparquimetro|\bsemafor|\baparcabici|\bpapelera|\bfuente(s)?\b|\bmobiliario\b/, kind: 'inventory' },
    { id: 'environment', re: /\bruido\b|\barbolad|\bcultivo(s)?\b|\bhidrografia\b|\bacequia|\bzepa\b|\blic\b|\bporn\b|\bhabitat|\bnitrato|\bnevada|\binundac|\bzfp\b/, kind: 'inventory' },
    { id: 'mobility-ops', re: /\btrafico\b|\btranvia\b|\bbus\b|\bmuybici\b|\bparada(s)?\b|\bsensor|\bmedida\b|\bpilona/, kind: 'inventory' },
    { id: 'census-stats', re: /\bvivienda(s)?[_\s-]?p?\d|\bhex\d|\bpoblacion\b|\bcenso\b|\bestadistic|\bpotencial[_\s-]?fotovolt|\benergia\b/, kind: 'inventory' },
];

/**
 * A layer name may be a HISTORIC EDITION of an in-force layer (`pgou_alineaciones_2001` next to
 * `pgou_alineaciones`). Superseded editions are a supersession TRAP, not a discovery: binding one
 * publishes repealed law. Flagged, never silently dropped.
 */
export const EDITION_SUFFIX_RE = /[_-](19|20)\d{2}$/;

/** Deaccent + lowercase + split camelCase and separators into space-delimited tokens. */
export function normaliseText(s) {
    if (!s) return '';
    return String(s)
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/**
 * Word-boundary matching over the normalised token stream. `normaliseText` collapses `_`/`:`/`-` to
 * spaces, so a `\b`-anchored pattern in this file matches `pgou_alineaciones` and `idecordoba:manzana`
 * without any pattern needing to know about separators.
 */
export function matchTerm(term, normalisedHaystack) {
    return term.re.test(normalisedHaystack);
}
