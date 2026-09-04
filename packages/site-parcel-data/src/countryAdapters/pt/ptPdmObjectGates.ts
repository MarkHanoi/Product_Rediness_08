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

// (5)/(6) — doctrine §7's other flags (20/135/136/138) and §8's topology invariant live at the
// FOOT of this file: they are the same subject (what the município's own filing says about this
// point) and splitting them into a rival module would give the PDM object layer two seats.
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

/* ────────────────── (5) doctrine §7 — the OTHER derived-plan flags: 20 · 135 · 136 · 138 ──────────────────
 *
 * ⛔ THE DEFECT THIS CLOSES (lane ENVELOPE-IBERIA round 4, 2026-09-04). Doctrine §7 is a FIVE-ROW
 * table and the pipeline read TWO rows of it: 22/132 (the override pair, above) and 20 (UOPG
 * supletivo, read inline in `derivePtEnvelope` step 4 as `codigo === 20`). Codes **135 (AUGI)**,
 * **136 (ARU)** and **138 (Unidade de Execução)** reached NOTHING — an object layer answering
 * "AUGI here" was filtered away by `PT_PLAN_INTERVENTION_CODES.includes()` and the derivation
 * continued as if the PDM governed unqualified. Each has a DIFFERENT consequence, kept apart:
 *
 *   • **135 AUGI** — doctrine: *"distinct legalisation regime — treat as its own C1 family"*.
 *     PRYZM's C1 vocabulary (`ptImplantacao.ts`) holds three families: `alignment`, `setback`,
 *     `context-aggregate`. AUGI is a FOURTH the pipeline cannot express, and inferring one of the
 *     three would produce the well-formed nonsense doctrine §12.8 warns about. ⇒ **REFUSE**, cited.
 *   • **136 ARU** — doctrine: *"check D3 increments under RJRU"*. The RJRU incentive régime can
 *     RAISE the PDM's parameters inside an ARU; deriving from the PDM alone therefore UNDERSTATES,
 *     which is the safe direction (L-616 forbids OVERSTATING, not understating). ⇒ an **assumption
 *     with its direction stated**, never a silent pass and never a fabricated increment.
 *   • **138 Unidade de Execução** — doctrine §7's consequence column is **EMPTY** for this row.
 *     ⇒ recorded as a flag with NO consequence invented. Inventing one would be worse than the gap.
 *
 * ⚠ These are read from SERVED evidence only. An unanswered object layer never reaches here — that
 * is step 4's `transient` branch, which refuses on its own terms (failure ≠ "no flag").
 */

/** Doctrine §7's flag codes, named. 22/132 are the override PAIR handled above. */
export const PT_DERIVED_PLAN_FLAG_CODES = Object.freeze({
    /** UOPG — the PDM MUST carry supletivo parameters pending the plan; usable, FLAGGED. */
    UOPG: 20,
    /** Área de Intervenção de Plano de Urbanização — override. */
    PU: 22,
    /** Plano Territorial Intermunicipal (PUI/PPI) — override. */
    PTI: 132,
    /** AUGI — distinct legalisation regime; its OWN C1 family. */
    AUGI: 135,
    /** ARU — RJRU D3 increments must be checked. */
    ARU: 136,
    /** Unidade de Execução — doctrine states NO consequence. */
    UNIDADE_EXECUCAO: 138,
});

/** The RJRU seat, named by instrument. ⚠ The D3 article is NOT pinned by this lane. */
export const PT_RJRU_INSTRUMENT =
    'Regime Jurídico da Reabilitação Urbana (RJRU) — DL 307/2009, as amended; the D3 increment ' +
    'article is NOT pinned by this lane and the increments themselves are NOT held by PRYZM';

/** What the §7 flags at a point mean for the derivation. Every member is DERIVED FROM SERVED EVIDENCE. */
export interface PtDerivedPlanFlags {
    /** Código 20 — apply the PDM's supletivo parameters and flag them. */
    readonly supletivo: boolean;
    /** Código 138 — recorded; doctrine states no consequence, so none is invented. */
    readonly unidadeExecucao: readonly PtPdmObjectEvidence[];
    /** Código 136 — the derivation may UNDERSTATE by the unheld RJRU D3 increments. */
    readonly aru: readonly PtPdmObjectEvidence[];
    /** ⛔ Código 135 — a C1 family the pipeline cannot express. Non-empty ⇒ REFUSE. */
    readonly augi: readonly PtPdmObjectEvidence[];
    /** Assumption lines the caller appends verbatim (each states its DIRECTION). */
    readonly assumptions: readonly string[];
}

function ptFlagLabel(h: PtPdmObjectEvidence): string {
    const vendored = ptAnexoPoObjectByCodigo(h.codigo);
    const bits = [h.etiqueta ? `«${h.etiqueta}»` : null, h.especifica ? `— ${h.especifica}` : null]
        .filter((s): s is string => s !== null)
        .join(' ');
    return `${vendored?.designacao ?? `Anexo I-PO código ${h.codigo}`}${bits ? ` ${bits}` : ''}`;
}

/**
 * PURE + TOTAL: classify the served Anexo I-PO objects at a point into doctrine §7's flags.
 * ⛔ Does NOT look at 22/132 — those are `ptPlanInterventionOverride`'s, and running the override
 * first keeps it ahead of every flag (the doctrine's own order).
 */
export function ptDerivedPlanFlags(objects: readonly PtPdmObjectEvidence[]): PtDerivedPlanFlags {
    const by = (codigo: number): readonly PtPdmObjectEvidence[] => objects.filter((o) => o.codigo === codigo);
    const augi = by(PT_DERIVED_PLAN_FLAG_CODES.AUGI);
    const aru = by(PT_DERIVED_PLAN_FLAG_CODES.ARU);
    const ue = by(PT_DERIVED_PLAN_FLAG_CODES.UNIDADE_EXECUCAO);
    const assumptions: string[] = [];
    for (const h of aru) {
        assumptions.push(
            `ARU (Anexo I-PO código 136) — ${ptFlagLabel(h)}: this point lies inside an Área de ` +
            'Reabilitação Urbana. Under the RJRU the ARU\'s D3 increments may RAISE the PDM parameters ' +
            'used here, and PRYZM does not hold them. This derivation therefore MAY UNDERSTATE the ' +
            'permitted volume — the conservative direction, never the forbidden one (L-616). ' +
            `Instrument: ${PT_RJRU_INSTRUMENT}.`,
        );
    }
    for (const h of ue) {
        assumptions.push(
            `Unidade de Execução (Anexo I-PO código 138) — ${ptFlagLabel(h)}: recorded as a flag. ` +
            'Doctrine §7 states NO consequence for this code, so none is applied and none is invented; ' +
            'the execution unit\'s own terms are not held by PRYZM and may modify what is derived here.',
        );
    }
    return { supletivo: by(PT_DERIVED_PLAN_FLAG_CODES.UOPG).length > 0, unidadeExecucao: ue, aru, augi, assumptions };
}

/**
 * PURE: the AUGI refusal (doctrine §7 código 135). `legallyGrounded: true` — an AUGI is a distinct
 * LEGALISATION régime fixed by law (Lei 91/95, as amended) and filed by the município itself; the
 * refusal is a statement about which régime governs, not about PRYZM's coverage.
 */
export function ptAugiRefusal(zone: PtCrusZone, hits: readonly PtPdmObjectEvidence[]): EnvelopeRefusal {
    const labels = hits.map(ptFlagLabel);
    return {
        code: 'derived-plan',
        headline: 'AUGI — Área Urbana de Génese Ilegal: a distinct legalisation régime governs here.',
        detail:
            `The município's own PDM filing places this point inside ${hits.length === 1 ? 'an' : `${hits.length}`} ` +
            `AUGI: ${labels.join('; ')}. Doctrine §7: an AUGI is its OWN C1 (ordering) family — buildability ` +
            'is fixed by the reconversion process (alvará de loteamento or plano de pormenor de reconversão) ' +
            'under the AUGI régime, not by reading the PDM subcategory\'s recuos and afastamentos. PRYZM\'s ' +
            'C1 vocabulary holds three families (alignment · setback · context-aggregate) and AUGI is none ' +
            'of them: inferring one would produce a well-formed answer about the wrong régime. Obtain the ' +
            'reconversion instrument for this AUGI before any determination — refused until then.',
        ordinanceRef:
            `${PT_PDM_NORM_CITATION} — Anexo I-PO código 135 (AUGI); regime de reconversão das Áreas ` +
            'Urbanas de Génese Ilegal (Lei n.º 91/95, as amended — the governing article is NOT pinned by ' +
            'this lane). Evidence: the PDM\'s own filed OBJETOS record(s) containing this point.',
        knownFacts: [
            `Município: ${zone.municipio} (DTCC ${zone.dtcc})`,
            `Zona (CRUS, verbatim): ${zone.classificacaoEQualificacao}`,
            ...hits.map((h, i) => `AUGI ${i + 1}: ${labels[i]} (Anexo I-PO código ${h.codigo}${h.fonteInf ? `, fonte ${h.fonteInf}` : ''})`),
            'Regra: a AUGI é uma família C1 própria — o PDM não fixa aqui a implantação (doutrina §7)',
        ],
        legallyGrounded: true,
    };
}

/* ────────────────── (6) doctrine §8 — the TOPOLOGY invariant, as a REPORT ──────────────────
 *
 * §8: *"Classification/qualification polygons must be closed, cover the entire plan area, with NO
 * overlaps and NO gaps. Any double classification is a municipal DATA DEFECT. ⛔ Report it. Never
 * resolve it silently."*
 *
 * ⛔ THE DEFECT THIS CLOSES. `PT_PDM_TOPOLOGY_GUARANTEE` existed as a STRING and nothing read it.
 * `resolvePtCrusZoneAtPoint` does detect double containment — and collapses it to `fetchAbsent`
 * with a `degenerate-geometry:` reason, which downstream reads as *"nothing here"*, i.e. the same
 * value as sea. That is §CONTEXT-DATA-HONESTY's failure-vs-empty collapse applied to a DATA DEFECT:
 * a defect reported as emptiness is not reported. This function turns the overlap into a NAMED,
 * legally-grounded-FALSE refusal that says whose data is wrong and which two zones collide.
 */

/** One classification polygon claiming a point (the caller supplies the containing set). */
export interface PtClassificationClaim {
    /** `classificacao_e_qualificacao` verbatim — the identity the two claims disagree on. */
    readonly classificacaoEQualificacao: string;
    /** The feature id the publisher served, for the defect report. */
    readonly fid?: string | number | null;
    /** ETIQUETA where the municipal layer carries one. */
    readonly etiqueta?: string | null;
}

/**
 * PURE + TOTAL: doctrine §8. `null` when 0 or 1 polygon claims the point (0 is "no plan here", a
 * different fact with its own card). A defect card when 2+ do — NAMING every claimant.
 *
 * ⚠ An exact-boundary click also produces two claims. The report says so rather than guessing:
 * whether it is a defect or a boundary is not decidable from containment alone, and BOTH readings
 * require the same action — do not pick one of the two zones.
 */
export function ptDoubleClassificationDefect(
    zone: PtCrusZone,
    claims: readonly PtClassificationClaim[],
): EnvelopeRefusal | null {
    if (claims.length < 2) return null;
    const distinct = [...new Set(claims.map((c) => c.classificacaoEQualificacao.trim()))];
    const lines = claims.map(
        (c, i) => `Reivindicação ${i + 1}: «${c.classificacaoEQualificacao}»${c.etiqueta ? ` (ETIQUETA ${c.etiqueta})` : ''}${c.fid !== undefined && c.fid !== null ? ` [fid ${c.fid}]` : ''}`,
    );
    return {
        code: 'regime-undetermined',
        headline:
            distinct.length > 1
                ? 'Dupla classificação — the municipal plan gives this point two different zones.'
                : 'Sobreposição de polígonos — two filed polygons claim this point.',
        detail:
            `${claims.length} classification/qualification polygons contain this point` +
            `${distinct.length > 1 ? `, carrying ${distinct.length} DIFFERENT identities: ${distinct.map((d) => `«${d}»`).join(' vs ')}` : ' with the same identity'}. ` +
            'Norma Técnica PDM (Aviso 9282/2021) requires the qualification layer to be closed, ' +
            'exhaustive over the plan area, with NO overlaps and NO gaps — so this is a MUNICIPAL DATA ' +
            'DEFECT (or an exact-boundary point, which is not decidable from containment alone and ' +
            'requires the same action). Doctrine §8: report it, never resolve it silently. Picking ' +
            'either polygon would cite the right regulamento against the wrong article. Report the ' +
            'overlap to the município and supply the governing zone explicitly — refused until then.',
        ordinanceRef:
            `${PT_PDM_NORM_CITATION} — topology invariant (closed · exhaustive · no overlaps · no gaps); ` +
            'DR 15/2015 classificação/qualificação do solo. Evidence: the municipal/CRUS polygons served at this point.',
        knownFacts: [`Município: ${zone.municipio} (DTCC ${zone.dtcc})`, ...lines],
        // ⛔ FALSE, deliberately: the LAW is unambiguous here (one point, one qualification). What
        // is ambiguous is the município's FILING. That is a data fact, not a legal one.
        legallyGrounded: false,
    };
}
