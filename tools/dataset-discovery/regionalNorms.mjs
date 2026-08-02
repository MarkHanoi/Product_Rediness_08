// ─────────────────────────────────────────────────────────────────────────────
// STAGE 0 · STEP S0.0 — THE REGIONAL PLANNING-DATA NORM
//
// ⛔ THE SEARCH TARGET CHANGED, AND THIS FILE IS THAT CHANGE.
//
// Probe C measured 0 of 20 municipalities self-hosting an OGC service and concluded — correctly —
// that *the municipality is the wrong unit of analysis*. It then filed three regions as absent.
// **Three of those filings were wrong**, and all three for one structural reason the tool was not
// looking for:
//
//   > Several CCAAs have LEGISLATED a regional planning-data standard: municipalities must deliver
//   > planning instruments to a regional authority in a defined schema, and the authority publishes
//   > them. **One adapter · one legal interpretation · N municipalities.**
//
// So Stage 0 now asks, BEFORE it sweeps a single municipal host:
//
//   > **"Does this region have a *norma técnica* mandating planning-data delivery, and what schema
//   > does it specify?"**
//
// ⚠⚠ THAT IS A LEGAL-REGISTER SEARCH, NOT A SERVICE PROBE. A mandated schema is STRONGER evidence
// than a live service: a service can be switched off, a schema in a published Orden binds every
// instrument approved after its enforcement date. It is also, crucially, evidence that survives a
// 403 — which is what made `icearagon.aragon.es`'s `ROBOTS_DISALLOWED` an UNKNOWN rather than a wall.
//
// ⚠ WHAT A NORM DOES **NOT** ESTABLISH — carried verbatim, not laundered:
//   1. **Specified and mandated ≠ POPULATED.** Andalucía's own template ships with **0 rows** in all
//      21 feature classes. A norm tells you what the columns will be, never that anyone filled them.
//   2. **In scope ≠ complete.** Andalucía mandates edificabilidad + density + use. It mandates NO
//      height, NO setback, NO depth, NO minimum plot. A FAR ceiling is not an envelope.
//   3. **An unread endpoint is UNKNOWN.** Where a norm exists but its service refused us, the row
//      says so; it never becomes an absence.
//
// AUTHORITY: ADR-0290 (exhaust authoritative sources first — this is the cheapest such source) ·
// ADR-0288 (a mandated schema is readability, never publishability) · ADR-0283 · ADR-0292 ·
// DATASET-DISCOVERY-PROTOCOL §S0.0.
// ─────────────────────────────────────────────────────────────────────────────

export const REGIONAL_NORM_REGISTRY_VERSION = '1.1';

/**
 * §MATURITY LADDER — replaces the Y/N binary. A region's level is about what an ATTRIBUTE TABLE
 * contains, not whether a service answers.
 *
 * ⚠⚠ THE DISTINCTION THAT DECIDES EVERYTHING:
 *   • *clasificación / categoría de suelo* — urbano / urbanizable / no urbanizable.
 *     A REGIME SELECTOR. **It draws nothing.**
 *   • *calificación / ordenanza / zona + parameters* — edificabilidad, altura reguladora,
 *     profundidad edificable, plantas, retranqueos, ocupación. **It draws an envelope.**
 *
 * ⚠ Every level below is asserted from `populated` / `not populated`, NEVER `present` / `absent`.
 * **A field NAME proves nothing** — Madrid publishes `NM_APRV_BC` (aprovechamiento) on 93 839
 * features and it is non-null on **0.0 %** of every sample drawn.
 */
export const MATURITY_LADDER = {
    0: { label: 'classification only', envelope: 'no' },
    1: { label: 'ordinance polygons, no code', envelope: 'maybe' },
    2: { label: 'ordinance polygons + code (ordinance text must be parsed)', envelope: 'yes, with corpus' },
    3: { label: 'ordinance polygons + STRUCTURED PARAMETERS', envelope: 'yes' },
    4: { label: 'regional delivery standard (one parser, N municipalities)', envelope: 'scalable' },
};

/**
 * `status`:
 *   `verified`     — the norm AND its schema were retrieved and read by this tool.
 *   `reported`     — a norm is named by research we hold, but this tool has not read its schema.
 *   `none-found`   — searched, nothing found. ⚠ Still a bounded negative: see `searchedWhere`.
 *   `unknown`      — not yet searched. The honest default for 13 of 17 CCAAs.
 */
/**
 * CORRECTION (1) — THE LADDER MUST BE READ PER **OUTPUT**, NOT PER REGION.
 *
 * A source can sit at different levels for a DETERMINATION and for an ENVELOPE. Filing the SIU as
 * "cannot produce envelopes, dead end" was half-right and too harsh:
 *
 *   > "Sector-level edificabilidad is not worthless. It is a NATIONAL buildability signal covering
 *   > ten regions with an agreed model. For determinations - the proven national product - that is
 *   > usable: it tells you a sector's aggregate capacity even where the parcel-level ordinance is
 *   > unreachable. The SIU is the only thing in Spain with national coverage and an agreed schema."
 *
 * THE REGISTRY COULD NOT EXPRESS THIS. `level` was a single scalar per region, which silently
 * forces one number onto two different questions. `levelByOutput` is the fix; `level` is retained
 * only where a region has not yet been split, and MUST NOT be read as an envelope rating.
 */
export const OUTPUT_KINDS = ['determination', 'envelope'];

export const REGIONAL_NORMS = {
    // THE ONLY THING IN SPAIN WITH NATIONAL COVERAGE AND AN AGREED SCHEMA.
    'es-national-siu': {
        ccaa: 'SPAIN - SIU (Sistema de Informacion Urbana), Ministerio de Vivienda y Agenda Urbana',
        status: 'verified',
        norm: 'SIU Working Group (2008) - agreed common minimum thematic contents of the SIU data model',
        legalBasis: 'DA 1a, TR Ley de Suelo y Rehabilitacion Urbana (RDL 7/2015)',
        convenios: ['Aragon', 'Asturias', 'Cantabria', 'Castilla y Leon', 'Castilla-La Mancha',
            'Extremadura', 'Galicia', 'Madrid', 'Murcia', 'Pais Vasco'],
        // Per-OUTPUT, per correction (1). Never collapse these to one number.
        levelByOutput: {
            determination: { level: 2, basis: 'sector-level UsoSuelo + ClaseSuelo under an agreed model across ten CCAAs - a NATIONAL buildability signal usable for determinations even where the parcel ordinance is unreachable' },
            envelope: { level: 0, basis: 'no ordinance parameter of any kind in any of the 17 published layers' },
        },
        serviceRetrieved: {
            at: '2026-08-02',
            endpoint: 'https://mapas.fomento.gob.es/arcgis/rest/services/SIU/Servicios_OGC/MapServer',
            note: 'Browser UA required (the ministry 403s a default client) and an ArcGIS 200 can carry an Esri error in its body - both checked.',
            layers: 17,
        },
        // THE #1 QUESTION, ANSWERED: the served model STOPS AT CLASSIFICATION.
        measuredFields: {
            '13 OGC_Sectores': 'OBJECTID / ProvINE / IdSector / FechaBaja - 4 real fields, NO parameters',
            '14 OGC_Recintos': 'OBJECTID / ProvINE / IdSector / UsoSuelo / FechaBaja - UsoSuelo is the ONLY semantic field',
            '15 OGC_Clases_Suelo': 'OBJECTID / ProvINE / ClaseSuelo / NuclRural / FechaBaja',
            '0-12': 'SIOSE / CORINE land COVER - not planning',
            '16 OGC_Areas_Urbanas': 'urban-area statistics (population, density, dwellings)',
        },
        envelopeParameters: {
            absent: ['floor-area-ratio', 'building-height', 'storey-count', 'coverage-ratio', 'setback',
                'buildable-depth', 'zoning-regime (calificacion)'],
            caveat: 'NOT ONE ordinance parameter across all 17 layers. This confirms the second branch: '
                + 'the common model stopping at classification EXPLAINS WHY SO MANY REGIONS LOOK IDENTICAL '
                + 'AND THIN - they are publishing the agreed minimum, and the agreed minimum is classification.',
        },
        currency: 'FechaBaja is present on layers 13/14/15 - currency is a field here.',
        unknown: 'This measures what the SIU SERVES. The convenio model SPECIFICATION document was not read '
            + '(mivau.gob.es returned 403 to WebFetch), so whether the agreed model on paper is broader than '
            + 'the published product is UNKNOWN - never "no". The served product is the operative artefact.',
    },


    // ═══ MADRID — never sampled before this pass, and the highest-value result of it. ═══════════
    'es-md': {
        ccaa: 'Comunidad de Madrid', population: 6_900_000,
        status: 'verified',
        // ⚠ Rated on a MEASURED attribute table, not on a norm.
        level: 3,
        levelBasis: 'ordinance polygons + structured parameters, MEASURED populated',
        norm: null,
        normSearchNote: '⚠ No norma técnica searched for. Madrid reaches L3 through a regional SERVICE, not a '
            + 'known delivery standard — so it is L3, NOT L4. Those are different facts.',
        system: 'SITCM / IDEM',
        serviceRetrieved: {
            at: '2026-08-02',
            wfs: 'https://idem.comunidad.madrid/geoserver3/wfs',
            layer: 'sitcm:VPLA_V_ORDENANZA',
            numberMatched: 93_839,
            note: '⚠ This endpoint has been in the corpus since it was recovered from the viewer Config.js. '
                + 'Its attribute table had NEVER been opened until 2026-08-02.',
        },
        envelopeParameters: {
            // ⭐ A full ordinance parameter set — the only one measured in Spain to date.
            schemaFields: {
                'building-height': 'NM_ALTURA', 'storey-count': 'NM_N_PLTA', 'coverage-ratio': 'NM_OCP_MX',
                setback: 'NM_RTR_FRNT / NM_RTR_LATL / NM_RTR_POST', 'buildable-depth': 'NM_FDO_MX_ED',
                frontage: 'NM_FRTE_MIN', 'floor-area-ratio': 'NM_C_ED_ORD / NM_S_MX_ED_O',
                'minimum-plot': 'NM_TA_MIN_P', typology: 'DS_TIPOLOG', 'zoning-regime': 'DS_NOMB_ORD / DS_GRA_ORD',
                'use-designation': 'CD_US_PRED / CD_US_COMPA / CD_US_PROHI',
                provenance: 'DS_LEY / DS_PLANEAM_GRAL / FC_BOCM / FC_BOE / DS_ADJUNTO',
            },
            // ⚠⚠ POPULATED, measured. Natural-order draw n=4000 across 17 municipalities.
            populatedNaturalDraw: {
                n: 4000, municipalities: 17,
                NM_ALTURA: 0.702, NM_N_PLTA: 0.729, NM_OCP_MX: 0.529,
                NM_RTR_FRNT: 0.581, NM_RTR_POST: 0.612, NM_C_ED_ORD: 0.390,
                NM_TA_MIN_P: 0.541, NM_FDO_MX_ED: 0.163,
                anyOfAlturaOrPlantas: 0.762, bothAlturaAndPlantas: 0.669,
            },
            // ⚠ AND THE VARIANCE IS THE FINDING. Madrid CAPITAL is the sparse one.
            perMunicipality: {
                "CD_MUNICIPIO='079' MADRID (n=500)": { NM_ALTURA: 0.036, NM_N_PLTA: 0.336, NM_OCP_MX: 0.188, DS_ADJUNTO: 1.0 },
                "CD_MUNICIPIO='005' ALCALÁ DE HENARES (n=500)": { NM_ALTURA: 0.694, NM_N_PLTA: 0.658, NM_OCP_MX: 0.930 },
            },
            neverPopulated: ['NM_APRV_BC — 0.0 % across every sample. A field NAME proves nothing.'],
            caveat: '⚠ Paging is UNSUPPORTED on this layer ("Cannot do natural order without a primary key"), so '
                + 'the 4 000-row draw is the natural-order HEAD, covering 17 of ~179 municipalities — NOT a '
                + 'random sample. Per-municipality draws are that municipality\'s first 500 rows, not a random '
                + 'draw within it. The rates above are therefore INDICATIVE, not a coverage measurement. '
                + '⚠⚠ Madrid CAPITAL at 3.6 % NM_ALTURA is the single most consequential number here and it '
                + 'is the WORST in the sample — do not average it away.',
        },
        populated: 'YES — measured, with high per-municipality variance (NM_ALTURA 3.6 % to 69.4 %).',
        supersedes: 'no prior filing — Madrid was never sampled by Probe C.',
    },

    'es-an': {
        ccaa: 'Andalucía', population: 8_500_000,
        status: 'verified',
        // L4 framework; the SCHEMA reaches L3 only for FAR + density, and the CORPUS is unmeasured.
        level: '4 (framework) / 3-partial (schema scope) / corpus UNKNOWN',
        levelBasis: 'a regional delivery standard exists and is mandatory — but it specifies FAR + density and '
            + 'NOT height/plantas/depth/occupancy/setbacks, and the corpus submitted since 2026-04-24 is unmeasured',
        norm: 'Orden de 18 de febrero de 2026 — Normas Directoras de la documentación electrónica de los instrumentos de ordenación urbanística',
        legalBasis: 'Ley 7/2021 (LISTA) Art. 11 — SITUA, the territorial+urban information system',
        published: 'BOJA nº 37, 24 February 2026',
        enforcementDate: '2026-04-24',
        enforcementScope: 'instruments not yet at aprobación inicial on the enforcement date — determination 5 makes submission OBLIGATORY',
        system: 'SITUA', viewer: 'VITUA',
        schemaUrl: 'https://www.juntadeandalucia.es/sites/default/files/inline-files/2026/07/2026.07.31_Plantilla_NNDD.zip',
        // ⚠ The published ZIP is dated 2026.07.31 and supersedes the 2026.02.18 filename in the
        // founder research. The GeoPackage INSIDE it is still stamped 2026.02.18.
        schemaRetrieved: {
            at: '2026-08-02', httpStatus: 200, contentType: 'application/zip', bytes: 188_973,
            sha256: '5b8cd38614a05c02d7ed574fc342320aed549456cf2cefac04951c4d73f2db03',
            format: 'GeoPackage (2026.02.18_nndd_iiou.gpkg) + QGIS project',
            featureClasses: 21, vocabularyTables: 21,
        },
        // ⭐ THE TIER-1 GATE, ANSWERED FROM THE SCHEMA WITHOUT PROBING A SINGLE SERVICE.
        envelopeParameters: {
            present: {
                'floor-area-ratio': ['INE_TIP_FT_OU_04_ZSU.EDIF_GLOB', 'INE_TIP_FT_OU_16_PROP_ATU.EDIF_MAX/EDIF_MIN', 'INE_TIP_FT_OU_18_ATU.EDIF_GLOBAL/EDIF_RES/EDIF_PROT/EDIF_PROD/EDIF_SERV/EDIF_TUR'],
                density: ['INE_TIP_FT_OU_04_ZSU.DENS', 'INE_TIP_FT_OU_16_PROP_ATU.DENS_MAX/DENS_MIN', 'INE_TIP_FT_OU_18_ATU.DENS'],
                'use-designation': ['USO_G (6 global uses)', 'USO_P (16 pormenorizado, FK to USO_G)'],
                'land-classification': ['C_S (SU/SR)', 'INE_TIP_FT_OU_05_SR.CAT_SR/SCAT_SR'],
                'plan-delegation': ['INE_TIP_FT_OU_18_ATU', 'INE_TIP_FT_OU_16_PROP_ATU'],
                'heritage-constraint': ['INE_TIP_FT_OU_19_PROT_POL.CAR_PROT/TIP_BIC'],
            },
            // ⚠⚠ THE HALF THAT IS NOT MANDATED. Say it every time the FAR is quoted.
            absent: ['building-height', 'storey-count', 'setback', 'buildable-depth', 'coverage-ratio', 'minimum-plot', 'building-line'],
            caveat: '⚠ `EDIF_GLOB` is edificabilidad GLOBAL over a ZONE, not a per-parcel FAR. Applying a zone '
                + 'aggregate parcel-by-parcel is precisely the L-616 over-statement. And with no height, no '
                + 'setback and no depth in the mandated schema, this supplies a FAR CEILING, not an envelope.',
        },
        // ⚠⚠ THE ORDEN'S OWN SCOPE LIMIT, quoted. This is why the test existed.
        scopeLimitVerbatim: 'the Orden states the schema "no pretende incorporar la totalidad de las '
            + 'determinaciones posibles" and "abarca únicamente aquellas determinaciones que se consideran '
            + 'imprescindibles para la difusión de una información urbanística homogénea". '
            + '⚠ "Esencial para la interoperabilidad" is NOT the same set as "sufficient to compute an envelope".',
        submission: { formats: ['GeoPackage (.gpkg)', 'Shapefile (.shp)'], coding: 'INE_TIP_FT_AAAAMMDD — municipality keyed by INE code (determinación 4)' },
        // ⚠⚠ TWO NUMBERS, NEVER ONE.
        populated: {
            schemaScope: 'FAR (EDIF_*) + density (DENS*) + use (USO_G/USO_P) + classification + delegation + '
                + 'heritage. NO altura, NO plantas, NO profundidad, NO ocupación, NO retranqueos.',
            templateRows: 'ZERO — all 21 feature classes in the published template are empty; the 907 rows are '
                + 'controlled vocabularies + the 785-municipality register.',
            corpusSubmittedSince20260424: '⛔ UNKNOWN — NOT MEASURED. The Registro de Instrumentos Urbanísticos '
                + 'was not queried. The mandate is FORWARD-ONLY and ~14 weeks old, so across ~785 municipalities '
                + 'the count of general instruments in that window is plausibly zero to a handful. '
                + '⚠ A schema specifying ordinance parameters against an unmeasured corpus is a strong signal '
                + 'about 2027 and a weak one about this quarter. DO NOT CONFLATE THEM.',
        },
        supersedes: 'the Stage-0 filing "Andalucía — no calificación WFS" (DERA / ideandalucia were searched; SITUA is the planning system)',
    },

    'es-ar': {
        ccaa: 'Aragón', population: 1_330_000,
        status: 'verified',
        norm: 'NOTEPA — Decreto 78/2017, Normas Técnicas de Planeamiento de Aragón',
        legalBasis: 'standardises planning cartography, terminology and urbanistic concepts "to reduce discretion in interpretation"',
        published: 'BOA 2017', enforcementDate: '2017',
        system: 'SIUa', viewer: 'https://idearagon.aragon.es/SIUa/visor',
        normDefines: 'NOTEPA Art. 7 defines *edificabilidad* as maximum buildable area, plus Índice de Edificabilidad Bruta and Neta (m² floor / m² land)',
        serviceRetrieved: {
            at: '2026-08-02',
            wms: { url: 'https://icearagon.aragon.es/SIUa_WMS?service=WMS&version=1.3.0&request=GetCapabilities', httpStatus: 200, bytes: 43_763, layers: 51 },
            // ⚠ TWO WFS GUESSES 404'd. That is UNKNOWN for WFS, never "no WFS exists".
            wfs: { tried: ['icearagon.aragon.es/SIUa_WFS', 'idearagon.aragon.es/SIUa_WFS'], httpStatus: 404, verdict: 'UNKNOWN — not found at two guessed paths; absence NOT established' },
            note: 'icearagon.aragon.es answered 200 to this tool. The founder\'s `ROBOTS_DISALLOWED` was a '
                + 'fetch-tool restriction, not an HTTP block — so SIUa\'s capabilities ARE readable.',
        },
        // ⚠⚠ THIS IS THE ONE WHERE THE OPTIMISTIC READING LOSES. Reported, not laundered.
        envelopeParameters: {
            present: {
                'land-classification': ['clasificaciondelsuelo', 'clasificacion_SNUE', 'clasificacion_SNUE_sist/noSist', 'SIOSESUC'],
                'use-designation': ['usoglobal — GLOBAL use only'],
            },
            absent: ['zoning-regime (calificación)', 'floor-area-ratio', 'building-height', 'storey-count', 'setback', 'buildable-depth', 'coverage-ratio'],
            caveat: '⛔ THE CAVEAT WAS RIGHT AND THE OPTIMISTIC READING WAS WRONG. The 51 published SIUa WMS '
                + 'layers carry CLASIFICACIÓN + USO GLOBAL. There is no `calificacion` layer and no '
                + 'edificabilidad/aprovechamiento/densidad layer among them. NOTEPA normatively DEFINES '
                + 'edificabilidad, and SIUa publishes *fichas de datos urbanísticos* carrying building '
                + 'parameters — but the PUBLISHED VECTOR COVERAGE does not expose them. The original '
                + '"clasificación only" observation about the vector HOLDS.',
        },
        level: 1,
        levelResolved: '⇒ L1 — ordinance/classification polygons with a NOTEPA code, NO populated parameters. '
            + 'The three-way split the brief posed is answered: the parameters are NOT in the vectors. Whether '
            + 'they live in the *fichas* (L2) is UNKNOWN — the fichas were not opened.',
        levelBasis: "the publisher's OWN CURRENT product register describes the Urbanismo coverage as "
            + 'classification + global use',
        // ⭐ CURRENT-DATED, not the historic 2013 line the earlier filing rested on.
        catalogueVerbatim: 'ICEARAGON product register `BD_GIS/consultaColeccionesAmpliado.jsp?coleccion=Urbanismo`, '
            + 'row `t01_productos;Tematica;Urbanismo`, stamped **2025** (data 2024), table `V_T01_PO_SIUA`, keyed by '
            + 'Municipio: "Información de planeamiento urbanístico: **figura de planeamiento, clasificación de '
            + 'suelo y uso global**." ⚠ Its KEYWORD list contains "Calificación" — a search index is not a schema.',
        // ⭐⭐ MEASURED 2026-08-02 — the attribute audit the brief asked for, via WMS GetFeatureInfo
        // (no WFS is published, but WMS returns the FULL attribute row, which is what mattered).
        // n = 78 rows across 16 distinct municipalities, sampled at 72 points across Aragón and
        // grouped by the `cod_ine` that came BACK, never by the municipality aimed at.
        attributeAudit: {
            at: '2026-08-02', method: 'WMS 1.1.1 GetFeatureInfo, info_format=application/json, browser UA',
            layer: 'v_modelodatunicurbanismo_acuerdo', n: 78, municipalities: 16,
            // ⚠⚠ "non-null" is 100 % for every numeric field and it is MEANINGLESS — see nullSubstitute.
            nonZeroRate: {
                edificab: 0.013, aprove: 0.0, densidad: 0.013,
                viv_libr: 0.013, viv_prot: 0.013, sup_ssgg: 0.013, porc_otr: 0.0, sup_plan: 0.103,
            },
            populatedText: { clase: 1.0, notepa: 0.974, cod_plan: 1.0, n_expedien: 0.974, uso_glob: 0.859, web_acu: 0.872, nombre: 0.038, pdf: 0.026 },
            // ⭐ THE PROOF, from an INTERNAL CONTRADICTION rather than an assumption.
            nullSubstitute: "⚠⚠ 0 IS THIS SCHEMA'S NULL SUBSTITUTE, NOT A VALUE. 70 of 78 rows (89.7 %) carry "
                + '`shape_area > 0` AND `perimeter == 0` — geometrically impossible. So `edificab: 0` on a '
                + 'SUC polygon is an EMPTY CELL, not an edificabilidad of zero. Reporting these fields as '
                + '"100 % non-null" would have been true and completely misleading.',
            // ⚠ CURRENCY IS A FIELD — and here it is populated and mostly negative.
            currency: '`fiab_geom` is present on 100 % of rows: "No disponible" 40 · '
                + '"No aprobada/Denegada/Obsoleta" 21 · "Aprobada" 17 (21.8 %). Only about a fifth of sampled '
                + 'polygons are flagged as approved, reliable geometry.',
            caveat: '⚠ Point-sampled around 12 urban seeds, so the `clase` mix skews rural (SENU 40 · SENE 26 · '
                + 'SUC 10 · SEUND 2). The non-zero rates are therefore INDICATIVE of the coverage as served, '
                + 'not a per-class measurement, and 16 of 731 Aragonese municipalities were touched.',
        },
        populated: '⛔ ORDINANCE PARAMETERS: effectively NO — MEASURED. `edificab` and `densidad` are non-zero on '
            + '1.3 % of sampled rows, `aprove` on 0.0 %, and 0 is demonstrably the null substitute. '
            + 'CLASSIFICATION IS populated: `clase` 100 %, `notepa` 97.4 %, `uso_glob` 85.9 %. '
            + '⇒ The columns exist and are empty. A field NAME proves nothing. '
            + '⚠ `icearagon.aragon.es` answered HTTP 200 to a browser UA throughout — the ROBOTS_DISALLOWED '
            + 'wall is a crawler restriction and was never the obstacle.',
        supersedes: 'the filing "Aragón — no regional planning standard". NOTEPA exists, is in force since 2017, '
            + 'and normatively defines edificabilidad. What does NOT hold is that the published vector carries it.',
    },

    'es-ex': {
        ccaa: 'Extremadura', population: 1_050_000,
        status: 'verified',
        norm: null,
        normSearchNote: '⚠ NO norma técnica identified for Extremadura. The service exists WITHOUT one being found — '
            + 'which is itself informative: a regional service and a regional norm are independent facts.',
        system: 'CICTEX / IDEEX',
        level: 1,
        levelBasis: 'ordinance polygons, NO code and NO parameters — MEASURED at attribute level',
        serviceRetrieved: {
            at: '2026-08-02',
            wfs: { url: 'https://mapas.ideex.es/CICTEX/urbanismo?service=WFS&version=2.0.0&request=GetCapabilities', httpStatus: 200, contentType: 'text/xml', bytes: 67_447, layers: 36 },
            wms: { url: 'https://mapas.ideex.es/CICTEX/urbanismo?service=WMS&version=1.3.0&request=GetCapabilities', httpStatus: 200, bytes: 72_195, layers: 92 },
        },
        // ⭐ CALIFICACIÓN, not merely clasificación — the Tier-1 gate.
        envelopeParameters: {
            present: {
                'zoning-regime': [
                    'CICTEX_URBANISMO_CALIFICACION_SUELO_USO_RESIDENCIAL', 'ª_USO_INDUSTRIAL', 'ª_USO_TERCIARIO',
                    'ª_ZONAS_VERDES', 'ª_COMUNICACIONES', 'ª_OTRAS_DOTACIONES',
                    'ª_DOTACIONES_EQUIPAMIENTOS_{ADMINISTRATIVO_INSTITUCIONAL,CULTURAL_DEPORTIVO,EDUCATIVO,INFRAESTRUCTURAS_SERVICIOS_URBANOS,SANITARIO_ASISTENCIAL,OTROS}',
                ],
                'land-classification': ['CICTEX_URBANISMO_CLASIFICACION_SUELO_{URBANO,URBANIZABLE,NO_URBANIZABLE}', 'CICTEX_URBANISMO_CATEGORIAS_SUELO_*'],
                'plan-delegation': ['CICTEX_URBANISMO_UNIDADES_ACTUACION'],
            },
            absent: ['floor-area-ratio', 'building-height', 'storey-count', 'setback', 'buildable-depth', 'coverage-ratio'],
            caveat: '⚠ 12 CALIFICACIÓN layers are published — a regime SELECTOR with an envelope hook, which is '
                + 'the Tier-1 gate this corpus identified. But NO numeric envelope parameter was observed in the '
                + 'layer names. Whether the FEATURES carry ordinance attributes is UNVERIFIED — no '
                + 'DescribeFeatureType was run. Do not read "calificación exists" as "an envelope is computable".',
        },
        populated: '⛔ NO — MEASURED 2026-08-02. `DescribeFeatureType` on '
            + '`ms:CICTEX_URBANISMO_CALIFICACION_SUELO_USO_RESIDENCIAL` returns exactly TWO elements: the '
            + 'feature type itself and `msGeometry`. `GetFeature count=2` returns polygons with NO scalar '
            + 'payload at all. Same for `..._USO_INDUSTRIAL` and `..._UNIDADES_ACTUACION`. '
            + '⇒ The USE CATEGORY is encoded ONLY IN THE LAYER NAME; there is no edificabilidad, altura, '
            + 'ocupación or retranqueo anywhere in the schema. **L1, not L3.** '
            + '⚠ The server also reports `numberMatched="unknown"` and "No featureid defined", so feature '
            + 'COUNTS are UNKNOWN — geometry coverage was not measured.',
        supersedes: 'the filing "Extremadura — dead host". The host was WRONG (`geoportal.ideex.es` was guessed); '
            + 'the live endpoint is `mapas.ideex.es/CICTEX/urbanismo`, listed by Spain\'s national IDE monitor.',
    },

    'es-ct': {
        ccaa: 'Catalunya', population: 8_000_000,
        status: 'reported',
        norm: 'Refós — the AMB/DGOTU consolidated planning refós already in the PRYZM corpus',
        system: 'MUC / AMB Refós',
        // ⚠⚠ THE CORRECTION. Catalunya is rated L4 externally on twenty years of standardisation; OUR OWN
        // REGISTER CONTRADICTS THAT over two-thirds of the best city we have.
        level: 'L4 (framework) / L2 (governing text unresolved)',
        levelBasis: '`PD*` covers **70.69 % of Barcelona buildable land**, recorded in our own register as '
            + '"the clau we read is a translation, not the governing text". Regional SEMANTICS with the '
            + 'governing determination DELEGATED to an instrument we do not hold is **L2 wearing L4 clothes**.',
        splitRule: '⚠ APPLY THIS SPLIT WHEREVER a region has a standard but an unverified corpus. Same caution '
            + 'on Murcia = L3: *edificabilidad in a schema* is what was observed; **populated and normative** '
            + 'is what would be needed.',
        note: 'Already onboarded for Barcelona (`qualificacio_refos_3857`, 89 CLAU_URB). Listed here so the '
            + 'registry reflects that Catalunya is a region with a regional standard — which is what makes '
            + 'this a pattern rather than two anecdotes.',
    },
};

/** ⚠ The 13 CCAAs nobody has looked at. `unknown` is the honest default and must stay visible. */
export const CCAA_NOT_YET_SEARCHED = [
    'es-cm (Castilla-La Mancha)', 'es-cl (Castilla y León)', 'es-ga (Galicia)', 'es-vc (C. Valenciana)',
    'es-mc (Murcia)', 'es-ib (Illes Balears)', 'es-cn (Canarias)', 'es-as (Asturias)',
    'es-cb (Cantabria)', 'es-ri (La Rioja)',
];
/**
 * ⚠ Ceuta and Melilla are AUTONOMOUS CITIES, not CCAAs. Spain is 17 CCAAs + 2 autonomous cities =
 * 19 territorial units with planning competence. They were previously counted inside the CCAA list,
 * which made the coverage arithmetic fail to close (5 + 12 + 2 = 19 ≠ 17) — caught by the
 * `registryCoverage` honesty guard, which is exactly what that guard is for.
 */
export const AUTONOMOUS_CITIES_NOT_YET_SEARCHED = ['es-ce (Ceuta)', 'es-ml (Melilla)'];
/** País Vasco + Navarra are excluded by the foral guard, not merely unsearched. */
export const CCAA_FORAL_EXCLUDED = ['es-pv (País Vasco)', 'es-nc (Navarra)'];

/**
 * Look up the regional norm for a municipality. Pure.
 * ⚠ Returns `status: 'unknown'` — never `none-found` — for a CCAA nobody has searched. Those are
 * different facts and Probe-C-style aggregation must be able to tell them apart.
 */
export function regionalNormFor(ccaaId) {
    const rec = REGIONAL_NORMS[ccaaId];
    if (rec) return { ccaaId, ...rec };
    const foral = CCAA_FORAL_EXCLUDED.some((x) => x.startsWith(ccaaId));
    return {
        ccaaId,
        status: foral ? 'foral-excluded' : 'unknown',
        norm: null,
        note: foral
            ? 'foral regime — a separate cadastral adapter, excluded before probing'
            : '⚠ NOT SEARCHED. This is UNKNOWN, not "no norm exists". 13 of 17 CCAAs are in this state.',
    };
}

/** Coverage of the registry itself — so nobody reads 4 rows as a national survey. */
export function registryCoverage() {
    // The national SIU row is NOT a CCAA and must not enter the CCAA arithmetic - the honesty
    // guard caught this the moment it was added, which is what that guard exists for.
    const ccaaRows = Object.entries(REGIONAL_NORMS).filter(([k]) => !k.startsWith('es-national'));
    const searched = ccaaRows.length;
    const verified = ccaaRows.filter(([, r]) => r.status === 'verified').length;
    return {
        version: REGIONAL_NORM_REGISTRY_VERSION,
        // 17 CCAAs; Ceuta + Melilla are autonomous CITIES and are accounted separately.
        ccaaTotal: 17,
        territorialUnitsTotal: 19,
        searched, verified,
        reported: searched - verified,
        notYetSearched: CCAA_NOT_YET_SEARCHED.length,
        autonomousCitiesNotYetSearched: AUTONOMOUS_CITIES_NOT_YET_SEARCHED.length,
        foralExcluded: CCAA_FORAL_EXCLUDED.length,
        populationCovered: ccaaRows.reduce((s, [, r]) => s + (r.population ?? 0), 0),
        nationalRows: Object.keys(REGIONAL_NORMS).filter((k) => k.startsWith('es-national')).length,
        // ⚠⚠ THE LINE THAT STOPS THIS BEING OVERSOLD.
        warning: `⚠ ${searched} of 17 CCAAs. This is A HANDFUL OF DATA POINTS AND A PATTERN, not a `
            + `seventeen-CCAA survey. Do not present it as one. The other ${CCAA_NOT_YET_SEARCHED.length} are `
            + 'UNKNOWN — not "no norm". And no tier POPULATION may be derived from it.',
    };
}
