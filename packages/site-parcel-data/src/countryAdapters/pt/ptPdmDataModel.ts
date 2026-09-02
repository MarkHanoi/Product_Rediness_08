// LANE PT-ENVELOPE (the founder's PDM data-model brief, Immediate Action 1) — THE VENDORED
// NATIONAL CATALOGUE: the closed 18-category soil nomenclature, the Anexo I-PO objects worth
// wiring, the condicionantes theme codes, and the five-table filing schema — AS PURE DATA.
//
// WHAT THIS IS. Portugal's Norma Técnica sobre o Modelo de Dados e Sistematização da Informação
// Gráfica dos PDM (Vol. I + II, 18-02-2021, approved by Aviso n.º 9282/2021) defines a CLOSED
// national nomenclature: 18 soil categories that "cannot be added to — only disaggregated into
// subcategories" (via the typed ESPECIFICA field), a five-table minimum database structure that
// is a LEGAL FILING REQUIREMENT for Diário da República publication + DGT deposit, and per-act
// legal citation built into the mandatory schema (ATO_ESPECIFICO). Stable, national, legally
// mandated — encoded once, here.
//
// WHAT THIS IS NOT (the brief's verified gap, stated at every seam):
//   • NOT a schema change: `packages/schemas/**` is untouched — this is package DATA on the P5
//     discipline (pure data, no I/O, no THREE, no DOM), the ptPortoPdmDraft precedent.
//   • NOT an envelope source: the founder's read verified EVERY field of the model — there is
//     no cércea, no índice de utilização, no número de pisos, no afastamento, no emprise. The
//     model's ONLY numeric attribute is MEDIDA (area/length). Zoning identity is fully
//     structured nationally; envelope parameters are entirely in each município's Regulamento.
//     Nothing keyed off this catalogue may ever mint a number.
//   • NOT unconditionally applicable: the five-table shape binds plans filed under the 2021
//     norm. Plans approved before Feb 2021 predate it (Norma 01/2011 or nothing) — the single
//     most important Portuguese unknown is how many of the 308 municípios conform (brief
//     §Still-unverified 1). Consumers must carry that caveat; `PT_PDM_NORM_CONFORMANCE_CAVEAT`
//     is the one string to cite.
//
// ⭐ THE JOIN THAT MAKES THIS LIVE (measured 2026-09-02, lane PT-ENVELOPE): the DGT's national
// CRUS collection serves `codigo` = EXACTLY this catalogue's CODIGO — verified at 8/8 features
// across 5 municípios and both classes (Lisboa 7 + 3, Porto 7, Évora 3 + 11, Braga 2,
// Coimbra 2; transcripts in audit/demo-esfrpt/2026-09-02/). CRUS assigns it even where the
// underlying PDM predates the norm (Lisboa's 2020 plan serves codigo 7/3), because CRUS is the
// DGT's own harmonised transcription — so the categoria join works nationally TODAY.
//
// Source of every entry: Aviso n.º 9282/2021 Anexo I, as read by the founder in
// docs/04-reference/jurisdictions/pt/PT-PDM-DATA-MODEL-BRIEF.md (captured verbatim, f59f8a23).
// TRUNCATION IS HONOURED: Anexo I-PO codes 41–52+ were truncated in that read (brief
// §Still-unverified 4) and are represented ONLY by `PT_ANEXO_I_PO_TRUNCATION` — never guessed.

/** The one citation string every entry in this module carries or references. */
export const PT_PDM_NORM_CITATION =
    'Aviso n.º 9282/2021 Anexo I — Norma Técnica sobre o Modelo de Dados e Sistematização da ' +
    'Informação Gráfica dos Planos Diretores Municipais (DGT, Vol. I + II, 18-02-2021); read as ' +
    'captured in docs/04-reference/jurisdictions/pt/PT-PDM-DATA-MODEL-BRIEF.md';

/**
 * The conformance caveat every consumer must carry (brief §Still-unverified 1 + §Immediate
 * action 5): the five-table model binds NORM-CONFORMANT filings; pre-Feb-2021 plans predate it.
 * The CRUS `codigo` join is the exception — it is the DGT's own harmonisation and was measured
 * populated even for a pre-norm plan (Lisboa 2020).
 */
export const PT_PDM_NORM_CONFORMANCE_CAVEAT =
    'Applies to PDMs filed under the 2021 norm (Aviso n.º 9282/2021); plans approved before ' +
    'Feb 2021 predate it (Norma 01/2011 or none). How many of the 308 municípios conform is ' +
    'UNMEASURED nationally (PT-PDM-DATA-MODEL-BRIEF §Still-unverified 1).';

/* ────────────── the closed 18-category soil nomenclature (Anexo I) ────────────── */

/** DR 15/2015 / Aviso 9282/2021 soil classe — the two-way national split. */
export type PtSoloClasse = 'urbano' | 'rustico';

/** One category of the CLOSED national nomenclature. */
export interface PtSoilCategory {
    /** The national CODIGO — the value CRUS serves live as `codigo` (measured 2026-09-02). */
    readonly codigo: number;
    readonly classe: PtSoloClasse;
    /** The national designation, verbatim from Anexo I as the brief tables it. */
    readonly designacao: string;
    /** The brief's PRYZM-relevance reading (prose, never a number). */
    readonly note: string;
}

/**
 * THE CLOSED LIST — 8 urbano + 10 rústico. The norm states explicitly that new categories
 * CANNOT be added, only disaggregated into subcategories via the typed ESPECIFICA field.
 * Source: PT_PDM_NORM_CITATION.
 */
export const PT_SOIL_CATEGORIES: readonly PtSoilCategory[] = [
    // Solo Urbano — 8 categories
    { codigo: 2, classe: 'urbano', designacao: 'Espaço Central', note: 'Primary development target' },
    { codigo: 3, classe: 'urbano', designacao: 'Espaço Habitacional', note: 'Primary development target' },
    { codigo: 4, classe: 'urbano', designacao: 'Espaço Urbano de Baixa Densidade', note: 'Development, lower intensity' },
    { codigo: 5, classe: 'urbano', designacao: 'Espaço de Atividades Económicas', note: 'Commercial / industrial development' },
    { codigo: 151, classe: 'urbano', designacao: 'Espaço de uso especial – infraestrutura estruturante', note: 'Usually non-developable' },
    { codigo: 152, classe: 'urbano', designacao: 'Espaço de uso especial – equipamento', note: 'Usually non-developable' },
    { codigo: 6, classe: 'urbano', designacao: 'Espaço de uso especial – turístico', note: 'Tourism development' },
    { codigo: 7, classe: 'urbano', designacao: 'Espaço Verde', note: 'Correct null — no envelope' },
    // Solo Rústico — 10 categories
    { codigo: 8, classe: 'rustico', designacao: 'Espaço Agrícola', note: 'Rural regime' },
    { codigo: 9, classe: 'rustico', designacao: 'Espaço Florestal', note: 'Rural regime' },
    { codigo: 10, classe: 'rustico', designacao: 'Espaço de Exploração de Recursos Energéticos e Geológicos', note: 'Rural regime' },
    { codigo: 11, classe: 'rustico', designacao: 'Espaço Natural e Paisagístico', note: 'Rural regime — protection' },
    { codigo: 12, classe: 'rustico', designacao: 'Espaço de Atividades Industriais', note: 'Rural regime — industrial' },
    { codigo: 13, classe: 'rustico', designacao: 'Aglomerado Rural', note: 'Limited edification under the rural regime' },
    { codigo: 14, classe: 'rustico', designacao: 'Área de Edificação Dispersa', note: 'Limited edification under the rural regime' },
    { codigo: 15, classe: 'rustico', designacao: 'Espaço Cultural', note: 'Rural regime' },
    { codigo: 16, classe: 'rustico', designacao: 'Espaço de Ocupação Turística', note: 'Limited edification under the rural regime' },
    { codigo: 17, classe: 'rustico', designacao: 'Espaço de Equipamentos e Infraestruturas', note: 'Rural regime — facilities' },
] as const;

/** Accent-and-case-insensitive normalisation for matching served PT vocabulary (the ptCrusZone shape). */
export function normalisePtDesignacao(s: string): string {
    return s
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/** Look a category up by its national CODIGO, or null — NEVER a guess for an unknown code. */
export function ptSoilCategoryByCodigo(codigo: number): PtSoilCategory | null {
    return PT_SOIL_CATEGORIES.find((c) => c.codigo === codigo) ?? null;
}

/**
 * Look a category up by served categoria name (accent/case-insensitive EXACT match on the
 * normalised designação — deliberately not fuzzy: a partial match against a CLOSED list would
 * let a disaggregated subcategory string bind the wrong parent). Returns null on no exact match.
 */
export function ptSoilCategoryByName(categoria: string): PtSoilCategory | null {
    const n = normalisePtDesignacao(categoria);
    return PT_SOIL_CATEGORIES.find((c) => normalisePtDesignacao(c.designacao) === n) ?? null;
}

/* ────────────── Anexo I-PO — the Planta de Ordenamento objects worth wiring ────────────── */

/** One Anexo I-PO object type the brief tables (NOT the full annex — see the truncation record). */
export interface PtAnexoPoObject {
    readonly codigo: number;
    readonly designacao: string;
    /** The brief's use reading — what the object DOES to a determination. */
    readonly role: string;
}

/**
 * The Anexo I-PO objects the brief verified and tabled. Codes 22/132 are the DERIVABILITY GATE
 * pair (a PU/PP overrides the PDM inside its área de intervenção — `ptPdmObjectGates.ts`).
 * Source: PT_PDM_NORM_CITATION.
 */
export const PT_ANEXO_I_PO_OBJECTS: readonly PtAnexoPoObject[] = [
    { codigo: 18, designacao: 'Estrutura Ecológica Municipal', role: 'Overlay constraint' },
    { codigo: 19, designacao: 'Espaço Canal', role: 'Infrastructure corridor — removes land' },
    { codigo: 133, designacao: 'Área de Risco', role: 'Negative overlay' },
    { codigo: 134, designacao: 'Área de Perigosidade', role: 'Negative overlay' },
    { codigo: 139, designacao: 'Zona Sensível ao Ruído', role: 'Constraint on residential use' },
    { codigo: 140, designacao: 'Zona Mista ao Ruído', role: 'Constraint on residential use' },
    { codigo: 20, designacao: 'UOPG (Unidade Operativa de Planeamento e Gestão)', role: 'Deferred-planning area — often no direct licensing' },
    { codigo: 138, designacao: 'Unidade de Execução', role: 'Execution unit' },
    { codigo: 135, designacao: 'AUGI (Área Urbana de Génese Ilegal)', role: 'Illegal-origin urban area — special regime' },
    { codigo: 136, designacao: 'ARU (Área de Reabilitação Urbana)', role: 'Rehabilitation area — incentives, often modified parameters' },
    { codigo: 22, designacao: 'Área de Intervenção de Plano de Urbanização', role: 'DERIVABILITY GATE: the PU overrides the PDM here' },
    { codigo: 132, designacao: 'Área de Intervenção de Plano de Pormenor', role: 'DERIVABILITY GATE: the PP overrides the PDM here' },
    { codigo: 149, designacao: 'Geossítio', role: 'Heritage' },
    { codigo: 150, designacao: 'Imóvel inventariado', role: 'Heritage' },
] as const;

/**
 * ⛔ TRUNCATED-IN-SOURCE (brief §Still-unverified 4): Anexo I-PO codes 41–52+ were truncated in
 * the founder's read, and the Sistemas Estruturantes theme continues past 50. Those codes are
 * NOT vendored and must NEVER be guessed — extend `PT_ANEXO_I_PO_OBJECTS` only from a re-read
 * of Anexo I itself, citing it. Any consumer meeting an un-vendored code must treat it as
 * unrecognised (no role, no claim), never interpolate.
 */
export const PT_ANEXO_I_PO_TRUNCATION = {
    truncatedCodes: 'Anexo I-PO codes 41–52+ (Sistemas Estruturantes continues past 50)',
    rule: 'TRUNCATED-IN-SOURCE — never guess; extend only from a re-read of Anexo I, cited',
    source: PT_PDM_NORM_CITATION,
} as const;

/** Look an Anexo I-PO object up by codigo — null for anything not vendored (incl. the truncated range). */
export function ptAnexoPoObjectByCodigo(codigo: number): PtAnexoPoObject | null {
    return PT_ANEXO_I_PO_OBJECTS.find((o) => o.codigo === codigo) ?? null;
}

/* ────────────── Anexo I-PC — condicionantes theme codes the brief names ────────────── */

/** One condicionantes (servidões e restrições — SRUP) code the brief names individually. */
export interface PtCondicionanteCode {
    readonly codigo: number;
    readonly designacao: string;
}

/**
 * The individually-coded condicionantes the brief verified. Anexo I-PC follows the national
 * SRUP typology in eight themes (Recursos Hídricos / Geológicos / Agrícolas e Florestais /
 * Ecológicos, Património Cultural, Equipamentos, Infraestruturas, Atividades Perigosas).
 * Source: PT_PDM_NORM_CITATION.
 */
export const PT_CONDICIONANTES_CODES: readonly PtCondicionanteCode[] = [
    { codigo: 148, designacao: 'REN — Reserva Ecológica Nacional' },
    { codigo: 68, designacao: 'RAN — Reserva Agrícola Nacional' },
    { codigo: 91, designacao: 'Monumento classificado (Património Cultural)' },
    { codigo: 92, designacao: 'Monumento classificado (Património Cultural)' },
    { codigo: 93, designacao: 'Monumento classificado (Património Cultural)' },
    { codigo: 94, designacao: 'Monumento classificado (Património Cultural)' },
    { codigo: 95, designacao: 'Zona de proteção de imóvel classificado' },
    { codigo: 96, designacao: 'Zona de proteção de imóvel classificado' },
    { codigo: 97, designacao: 'Zona de proteção de imóvel classificado' },
] as const;

/** The eight Anexo I-PC SRUP themes, verbatim from the brief. */
export const PT_CONDICIONANTES_THEMES: readonly string[] = [
    'Recursos Hídricos',
    'Recursos Geológicos',
    'Recursos Agrícolas e Florestais',
    'Recursos Ecológicos',
    'Património Cultural',
    'Equipamentos',
    'Infraestruturas',
    'Atividades Perigosas',
] as const;

/* ────────────── the five-table filing schema (the legal minimum structure) ────────────── */

/** PLANTA domain on OBJETO_TIPO. */
export const PT_PLANTA_DOMAIN = ['Ordenamento', 'Condicionantes'] as const;

/** SERIE domain on ATO_ESPECIFICO (Diário da República series). */
export const PT_ATO_SERIE_DOMAIN = ['SERIE I', 'SERIE II'] as const;

/** The CLOSED TIPO_ATO domain on ATO_ESPECIFICO, verbatim from the norm. */
export const PT_ATO_TIPO_DOMAIN = [
    'Lei',
    'Decreto-Lei',
    'Dec-Reg',
    'Decreto',
    'RCM',
    'Portaria',
    'Aviso',
    'Decisao',
    'Declaracao',
    'Deliberacao',
    'Despacho',
    'Desp-Conj',
    'Regulamento',
] as const;

export type PtAtoSerie = (typeof PT_ATO_SERIE_DOMAIN)[number];
export type PtAtoTipo = (typeof PT_ATO_TIPO_DOMAIN)[number];

/** One field of a five-table schema table, as data. */
export interface PtPdmTableField {
    readonly name: string;
    readonly type: 'integer' | 'text' | 'date' | 'decimal' | 'geometry';
    readonly notes: string;
    /** Closed value domain where the norm fixes one. */
    readonly domain?: readonly string[];
}

/** One of the five tables. */
export interface PtPdmTable {
    readonly table: 'OBJETO_TIPO' | 'OBJETOS_PONTO' | 'OBJETOS_LINHA' | 'OBJETOS_POLIGONO' | 'ATO_ESPECIFICO';
    readonly role: string;
    readonly fields: readonly PtPdmTableField[];
}

/** The seven attributes shared IDENTICALLY by the three graphic tables (the norm's own shape). */
const GRAPHIC_TABLE_FIELDS: readonly PtPdmTableField[] = [
    { name: 'IDENTIFICA', type: 'text', notes: 'PK, GUID preferred, non-null, unique' },
    { name: 'ID', type: 'integer', notes: 'FK to OBJETO_TIPO' },
    {
        name: 'ESPECIFICA',
        type: 'text',
        notes:
            'The subcategory / disaggregation field — the TYPED extension mechanism (new categories ' +
            'cannot be added). Mandatory for UOPG, UE, programmes, plans, ARU, AUGI.',
    },
    { name: 'ETIQUETA', type: 'text', notes: 'Short label shown on the plan, e.g. EH1' },
    { name: 'FONTE_INF', type: 'text', notes: 'Source entity of the information' },
    { name: 'DATA_INF', type: 'date', notes: 'Date of the object or of its acquisition' },
    { name: 'GEOM', type: 'geometry', notes: 'Point, line or polygon (PT-TM06 / ETRS89 mandatory)' },
    {
        name: 'MEDIDA',
        type: 'decimal',
        notes:
            'Polygon area in HECTARES, line length in km — ⭐ the ONLY numeric attribute anywhere ' +
            'in the model (the verified envelope-parameter gap).',
    },
] as const;

/**
 * THE FIVE TABLES — the minimum structure the norm requires for publication in Diário da
 * República and deposit with DGT (a legal filing requirement, not a recommendation). Vendored
 * as data so parsers/gates cite one shape. Source: PT_PDM_NORM_CITATION.
 *
 * ⚠ DISTRIBUTION ≠ FILING (measured 2026-09-02, lane PT-ENVELOPE): NO public DGT/SNIT channel
 * serves these tables — the national OGC API's 75 collections carry the harmonised CRUS +
 * national SRUP layers only; the per-DICOFRE CRUS WFS serves the harmonised view even for a
 * norm-conformant 2025 PDM (Évora); the per-instrument WFS guess 404s; snit-mais GeoServer
 * answers 401. The filing exists by law; the distribution is the gap.
 */
export const PT_PDM_FIVE_TABLE_SCHEMA: readonly PtPdmTable[] = [
    {
        table: 'OBJETO_TIPO',
        role: 'Auxiliary lookup: object type per Anexo I (theme/subtheme/designation/codigo)',
        fields: [
            { name: 'ID', type: 'integer', notes: 'PK; FK into the graphic tables' },
            { name: 'PLANTA', type: 'text', notes: 'Which planta the object belongs to', domain: PT_PLANTA_DOMAIN },
            { name: 'TEMA', type: 'text', notes: 'Per Anexo I' },
            { name: 'SUBTEMA', type: 'text', notes: 'Per Anexo I' },
            { name: 'DESIGNACAO', type: 'text', notes: 'Per Anexo I' },
            { name: 'CODIGO', type: 'integer', notes: 'The catalogue code (2, 3, 4, … — PT_SOIL_CATEGORIES / PT_ANEXO_I_PO_OBJECTS)' },
        ],
    },
    { table: 'OBJETOS_PONTO', role: 'Point geometry objects', fields: GRAPHIC_TABLE_FIELDS },
    { table: 'OBJETOS_LINHA', role: 'Line geometry objects', fields: GRAPHIC_TABLE_FIELDS },
    { table: 'OBJETOS_POLIGONO', role: 'Polygon geometry objects', fields: GRAPHIC_TABLE_FIELDS },
    {
        table: 'ATO_ESPECIFICO',
        role:
            'The citation table — legal citation built into the mandatory schema: for every servidão ' +
            'or restrição constituted by a specific act, the Diário da República reference is a ' +
            'required database record.',
        fields: [
            { name: 'IDENTIFICA', type: 'text', notes: 'FK to the graphic tables' },
            { name: 'SERIE', type: 'text', notes: 'Diário da República series', domain: PT_ATO_SERIE_DOMAIN },
            { name: 'TIPO_ATO', type: 'text', notes: 'CLOSED domain of act types', domain: PT_ATO_TIPO_DOMAIN },
            { name: 'NUM_ATO', type: 'text', notes: 'Act number' },
            { name: 'DATA', type: 'date', notes: 'Act date' },
            { name: 'NUM_DR', type: 'text', notes: 'Diário da República issue number' },
            { name: 'OBSERV', type: 'text', notes: 'Optional' },
        ],
    },
] as const;

/**
 * The topological guarantee the norm asserts for Classificação e Qualificação do Solo, quotable
 * at solver seams: WITHIN A CONFORMANT PDM, closed polygons cover the entire plan area with no
 * overlaps and no gaps (wall-to-wall, unambiguous) — plus mandatory PT-TM06/ETRS89
 * georeferencing and CAOP administrative limits. Carry PT_PDM_NORM_CONFORMANCE_CAVEAT with it.
 */
export const PT_PDM_TOPOLOGY_GUARANTEE =
    'Within a norm-conformant PDM, Classificação e Qualificação do Solo objects are closed ' +
    'polygons covering the entire plan area, no overlaps, no gaps (wall-to-wall, unambiguous); ' +
    'PT-TM06/ETRS89 georeferencing and current-CAOP administrative limits are mandatory. ' +
    PT_PDM_NORM_CITATION;
