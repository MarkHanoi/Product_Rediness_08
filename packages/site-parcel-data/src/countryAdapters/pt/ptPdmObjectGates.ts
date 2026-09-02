// LANE PT-ENVELOPE (the founder's PDM data-model brief, Immediate Actions 3 + 4) — THE OBJECT
// 22/132 DERIVABILITY GATE and the ATO_ESPECIFICO CITATION SEAT.
//
// (3) THE GATE. Anexo I-PO codes 22 (Área de Intervenção de Plano de Urbanização) and 132
// (Área de Intervenção de Plano de Pormenor) mark land where a PU or PP OVERRIDES the PDM:
// inside such an área de intervenção, the PDM's parameters are NOT the governing determination
// — the site-specific plan's are, and PRYZM does not hold it. That is EXACTLY the
// `derived-plan` refusal code's definition ("the general plan POINTS AT ANOTHER DOCUMENT that
// fixes buildability per site — the rule is not absent, it is elsewhere"), the same shape as
// Barcelona clau 18, and the same deferral discipline as FR's chain yielding to site-specific
// documents. The gate REPLACES the category-level card with a typed refusal NAMING the
// overriding PU/PP requirement, so the PDM-category developability verdict can never be read
// as governing where it is not.
//
// ⚠ WHAT THE GATE NEEDS, HONESTLY STATED (brief Immediate Action 5, measured 2026-09-02): the
// object layer must be QUERYABLE, and TODAY NO PUBLIC CHANNEL SERVES IT — the national OGC API
// (75 collections enumerated) carries no OBJETOS/Anexo-I-PO collection; the per-DICOFRE CRUS
// WFS serves the harmonised zoning view even for a norm-conformant 2025 PDM (Évora,
// DescribeFeatureType measured); the per-instrument WFS guess 404s; snit-mais GeoServer
// answers 401. The gate therefore takes object EVIDENCE through an injectable dep on the chain
// (`PtChainDeps.resolvePdmObjectsAt`, `pt/index.ts`) and no production wiring exists yet —
// when a channel appears (or a per-município feed is negotiated), wire the dep, not a rival
// path. Until then the gate is proven on synthetic five-table-shaped fixtures.
//
// (4) THE CITATION SEAT. ATO_ESPECIFICO is the norm's mandatory citation table — per-act
// Diário da República provenance BUILT INTO THE FILING SCHEMA (France has nothing equivalent).
// The tables themselves are not distributed (above), so this module seats:
//   • the typed row + a domain-validating parser for WHEN the tables are obtainable, and
//   • `parsePtSrupServCitation` — the MEASURED live channel: the DGT national SRUP collections
//     (srup_ran / srup_ren_areal / srup_areas_protegidas, queryables read 2026-09-02) serve the
//     ATO_ESPECIFICO content FLATTENED per feature (`serv_lei` "Aviso n.º 23631/2025/2",
//     `serv_data`, `serv_dr` "184 IIS", `serv_hiperligacao` → the diploma PDF, `lei_tipo`).
//     Nothing speculative is wired: no SRUP chain leg exists yet, and none is minted here —
//     the parser is the seat a condicionantes lane consumes.
//
// PURE. Types, parsers and refusal construction only; no I/O.

import type { EnvelopeRefusal } from '@pryzm/schemas';
import type { PtCrusZone } from './ptCrusZone.js';
import {
    PT_ATO_SERIE_DOMAIN,
    PT_ATO_TIPO_DOMAIN,
    PT_PDM_NORM_CITATION,
    ptAnexoPoObjectByCodigo,
    type PtAtoSerie,
    type PtAtoTipo,
} from './ptPdmDataModel.js';

/* ────────────────── (3) the object 22/132 derivability gate ────────────────── */

/** The Anexo I-PO codes that mark a PU/PP área de intervenção — the override pair. */
export const PT_PLAN_INTERVENTION_CODES: readonly number[] = [22, 132] as const;

/**
 * Evidence that ONE Anexo I-PO object (five-table shape) exists AT the resolved point —
 * i.e. its OBJETOS_POLIGONO polygon CONTAINS the point (containment is the PROVIDER's job,
 * exactly like the CRUS containment pick; this gate never re-derives geometry).
 * Field names mirror the norm's graphic-table attributes, camelCased.
 */
export interface PtPdmObjectEvidence {
    /** OBJETO_TIPO.CODIGO — the Anexo I object code (22/132 trigger the gate). */
    readonly codigo: number;
    /** OBJETO_TIPO.DESIGNACAO, verbatim where served. */
    readonly designacao?: string | null;
    /** ESPECIFICA — MANDATORY for plans per the norm: names WHICH PU/PP área this is. */
    readonly especifica?: string | null;
    /** ETIQUETA — the plan-legend label, e.g. `PP3`. */
    readonly etiqueta?: string | null;
    /** FONTE_INF — source entity. */
    readonly fonteInf?: string | null;
    /** DATA_INF — ISO date as served. */
    readonly dataInf?: string | null;
}

/**
 * PURE: the derivability gate. If any evidence object carries codigo 22 or 132, the PDM's
 * parameters are NOT governing at this point — return the `derived-plan` refusal NAMING the
 * overriding PU/PP requirement (ESPECIFICA/ETIQUETA verbatim where present). Otherwise null:
 * the caller keeps the category-level card.
 *
 * `legallyGrounded: true` — this is a statement about the LAW's structure (the plan hierarchy
 * delegates), grounded on the município's own filed object, not about PRYZM's coverage. It
 * fires ONLY on served evidence; an unanswered object layer never reaches this function.
 */
export function ptPlanInterventionOverride(
    zone: PtCrusZone,
    objects: readonly PtPdmObjectEvidence[],
): EnvelopeRefusal | null {
    const hits = objects.filter((o) => PT_PLAN_INTERVENTION_CODES.includes(o.codigo));
    if (hits.length === 0) return null;

    const names = hits.map((h) => {
        const kind =
            h.codigo === 22 ? 'Plano de Urbanização (PU)' : 'Plano de Pormenor (PP)';
        const vendored = ptAnexoPoObjectByCodigo(h.codigo);
        const label = [
            h.etiqueta ? `«${h.etiqueta}»` : null,
            h.especifica ? `— ${h.especifica}` : null,
        ]
            .filter((s): s is string => s !== null)
            .join(' ');
        return `${vendored?.designacao ?? `Anexo I-PO código ${h.codigo}`} (${kind})${label ? ` ${label}` : ''}`;
    });

    const detailNames = names.join('; ');
    return {
        code: 'derived-plan',
        headline:
            'Área de Intervenção de Plano Municipal — a site-specific plan overrides the PDM here.',
        detail:
            `The município's own PDM filing places this point inside ${hits.length === 1 ? 'an' : `${hits.length}`} ` +
            `Área${hits.length === 1 ? '' : 's'} de Intervenção de Plano Municipal: ${detailNames}. ` +
            'Under the plan hierarchy (RJIGT, DL 80/2015), the Plano de Urbanização / Plano de ' +
            'Pormenor governs buildability inside its área de intervenção — the PDM\'s categoria ' +
            `(CRUS: "${zone.classificacaoEQualificacao}") remains the classification, but its ` +
            'developability reading is NOT the governing determination here. PRYZM does not hold ' +
            'the overriding plan: any envelope or verdict computed from the PDM alone would cite ' +
            'the right instrument against the wrong rule. Obtain and encode the named PU/PP before ' +
            'any determination — refused until then.',
        ordinanceRef:
            `${PT_PDM_NORM_CITATION} — Anexo I-PO codes 22/132 (Área de Intervenção de Plano de ` +
            'Urbanização / de Pormenor); plan-hierarchy precedence per RJIGT (DL 80/2015). ' +
            'Evidence: the PDM\'s own filed OBJETOS record(s) containing this point.',
        knownFacts: [
            `Município: ${zone.municipio} (DTCC ${zone.dtcc})`,
            `Zona (CRUS, verbatim): ${zone.classificacaoEQualificacao}`,
            ...hits.map(
                (h, i) =>
                    `Plano sobreposto ${i + 1}: ${names[i]} (Anexo I-PO código ${h.codigo}` +
                    `${h.fonteInf ? `, fonte ${h.fonteInf}` : ''}${h.dataInf ? `, data ${h.dataInf.slice(0, 10)}` : ''})`,
            ),
            'Regra: dentro da área de intervenção, o PU/PP prevalece sobre o PDM (derivability gate)',
        ],
        legallyGrounded: true,
    };
}

/* ────────────────── (4) ATO_ESPECIFICO — the typed citation seat ────────────────── */

/** One ATO_ESPECIFICO row, typed to the norm's domains. */
export interface PtAtoEspecificoRow {
    /** FK to the graphic tables (IDENTIFICA — GUID preferred). */
    readonly identifica: string;
    /** Diário da República series — closed domain, or null where the record omits it. */
    readonly serie: PtAtoSerie | null;
    /** The act type — the norm's CLOSED domain. */
    readonly tipoAto: PtAtoTipo;
    /** Act number, verbatim (e.g. `23631/2025/2`). */
    readonly numAto: string;
    /** Act date, verbatim as served (ISO preferred). */
    readonly data: string;
    /** Diário da República issue number, or null. */
    readonly numDr: string | null;
    /** Optional observations, verbatim. */
    readonly observ: string | null;
}

function fieldStr(bag: Record<string, unknown>, key: string): string | null {
    const v = bag[key];
    return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

/**
 * PURE: parse one five-table ATO_ESPECIFICO record (verbatim field names) into the typed row,
 * or null when it cannot be a CONFORMANT citation: missing IDENTIFICA / TIPO_ATO / NUM_ATO /
 * DATA, or a TIPO_ATO / SERIE outside the norm's CLOSED domains. Out-of-domain values are
 * refused, not coerced — a citation whose act type the norm does not recognise is not a
 * citation this seat can vouch for (never guess; the caller keeps the raw record).
 */
export function parsePtAtoEspecifico(record: Record<string, unknown>): PtAtoEspecificoRow | null {
    const identifica = fieldStr(record, 'IDENTIFICA');
    const tipoAtoRaw = fieldStr(record, 'TIPO_ATO');
    const numAto = fieldStr(record, 'NUM_ATO');
    const data = fieldStr(record, 'DATA');
    if (!identifica || !tipoAtoRaw || !numAto || !data) return null;
    if (!(PT_ATO_TIPO_DOMAIN as readonly string[]).includes(tipoAtoRaw)) return null;
    const serieRaw = fieldStr(record, 'SERIE');
    if (serieRaw !== null && !(PT_ATO_SERIE_DOMAIN as readonly string[]).includes(serieRaw)) {
        return null;
    }
    return {
        identifica,
        serie: (serieRaw as PtAtoSerie | null) ?? null,
        tipoAto: tipoAtoRaw as PtAtoTipo,
        numAto,
        data,
        numDr: fieldStr(record, 'NUM_DR'),
        observ: fieldStr(record, 'OBSERV'),
    };
}

/** Format a parsed row as the one-line Diário da República citation a card cites. */
export function ptAtoCitation(row: PtAtoEspecificoRow): string {
    const parts = [`${row.tipoAto} n.º ${row.numAto}`, `de ${row.data.slice(0, 10)}`];
    if (row.serie || row.numDr) {
        parts.push(
            `Diário da República${row.serie ? ` ${row.serie}` : ''}${row.numDr ? ` n.º ${row.numDr}` : ''}`,
        );
    }
    return parts.join(', ');
}

/* ────────────────── (4b) the MEASURED live channel: SRUP flattened citations ────────────────── */

/**
 * The ATO_ESPECIFICO content as the DGT national SRUP collections actually serve it —
 * FLATTENED onto each condicionante feature (queryables measured 2026-09-02 on srup_ran,
 * srup_ren_areal, srup_areas_protegidas: `serv_lei`, `serv_data`, `serv_dr`,
 * `serv_hiperligacao`, `lei_tipo`, `servidao`, `designacao`, `municipio`).
 */
export interface PtSrupServCitation {
    /** The constituting act, verbatim — e.g. `Aviso n.º 23631/2025/2` (measured live). */
    readonly servLei: string;
    /** Act date, ISO as served, or null. */
    readonly servData: string | null;
    /** DR issue + series shorthand as served — e.g. `184 IIS` — or null. */
    readonly servDr: string | null;
    /** Direct hyperlink to the diploma (measured: a SNIT-MAIS PDF), or null. */
    readonly hiperligacao: string | null;
    /** The framing law, verbatim — e.g. `DL 196/89` — or null. */
    readonly leiTipo: string | null;
    /** The servidão name, verbatim — e.g. `RESERVA AGRÍCOLA NACIONAL` — or null. */
    readonly servidao: string | null;
}

/**
 * PURE: read one SRUP feature's properties into the flattened citation, or null when the
 * feature carries no `serv_lei` (no act, no citation — never fabricate one from `lei_tipo`
 * alone: the framing law is not the constituting act).
 */
export function parsePtSrupServCitation(
    properties: Record<string, unknown>,
): PtSrupServCitation | null {
    const servLei = fieldStr(properties, 'serv_lei');
    if (servLei === null) return null;
    return {
        servLei,
        servData: fieldStr(properties, 'serv_data'),
        servDr: fieldStr(properties, 'serv_dr'),
        hiperligacao: fieldStr(properties, 'serv_hiperligacao'),
        leiTipo: fieldStr(properties, 'lei_tipo'),
        servidao: fieldStr(properties, 'servidao'),
    };
}

/** Format the flattened SRUP citation as the one-line provenance a card cites. */
export function ptSrupCitationLine(c: PtSrupServCitation): string {
    const parts = [c.servLei];
    if (c.servData) parts.push(`de ${c.servData.slice(0, 10)}`);
    if (c.servDr) parts.push(`D.R. ${c.servDr}`);
    if (c.leiTipo) parts.push(`ao abrigo de ${c.leiTipo}`);
    return parts.join(', ');
}
