// ═════════════════════════════════════════════════════════════════════════════════════════════
// §PT-DERIVATION-PIPELINE (lane ENVELOPE-IBERIA round 3, 2026-09-04) — doctrine §12, THE TWELVE
// STEPS AS ONE FUNCTION, and its hand-off to `computeBuildableEnvelope`.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE DEFECT THIS CLOSES. Round 2 (`9c14009f`) shipped SEVEN pure modules — one per doctrine step
// — and round 3's scorecard found them (a) exported from NO barrel (`countryAdapters/pt/index.ts`
// listed none of them: committed ≠ reachable), (b) imported by NOTHING, and (c) never composed: a
// caller wanting the doctrine's answer had to know the step order, the blocking rule (§0.2), and
// how each module's refusal maps onto the ratified `EnvelopeRefusal`. That is a toolbox, not a
// derivation. This file is the derivation.
//
// WHAT IT IS: a PURE, TOTAL function from an INJECTED input bundle (A1 rungs, CRUS identity, the
// municipal ETIQUETA, the regulamento index, the datum, the condicionante reads, the art. 59/60
// neighbour measurements) to the doctrine §13 output — `parcel · regulatory_identity · volume ·
// yield · constraints_applied · assumptions · refusals · watch_flags` — PLUS the C58 artefacts the
// rest of PRYZM consumes: a one-zone `JurisdictionZoningContract` (the Balears "resolved pack"
// shape, `esBalearsMuib.ts`) and the `BuildableEnvelope` that `computeBuildableEnvelope` solves
// from it. The engine is CALLED, not re-implemented: the pipeline supplies the numbers with their
// provenance and the engine does what it does for every other jurisdiction.
//
// WHAT IT IS NOT: a fetcher. Nothing here reads a network. Every input arrives already fetched
// (C58 §1.9 purity, C12 §8), which is also why this file can state honestly what the PT stack can
// and cannot do TODAY: the inputs it needs — a regulamento index per município, the municipal
// ETIQUETA, the procedural start date, S from the DGT MDT, the condicionante reads with their
// exclusion layers — are WIRED FOR NO MUNICÍPIO. The pipeline is complete; its feed is not. See
// `docs/04-reference/jurisdictions/pt/PT-DOCTRINE-SCORECARD.md`.
//
// ⛔ THE FOUR NON-NEGOTIABLES (doctrine §0), where each lives here:
//   1. every value carries its block → `PtProvenancedValue` on every parameter in `volume`;
//   2. any `unresolved` BLOCKS → `refuse()` short-circuits the step order; NO partial volume;
//   3. no silent default → every fallback is an `assumptions` entry with its direction;
//   4. no discretionary outcome as entitlement → `assumed` values are listed, and `supletivo`
//      parameters (UOPG) are FLAGGED on the pack's ordinanceRef.
//
// ⚠ THE STEP ORDER IS THE DOCTRINE'S AND IS NOT INTERCHANGEABLE (see each step's comment).
//
// PURITY: L2-pure. No I/O, no clock (retrievedAt is injected). P8: one span on the entry point.

import { trace } from '@opentelemetry/api';
import type {
    BuildableEnvelope,
    EnvelopeRefusal,
    FetchOutcome,
    GeometricRule,
    JurisdictionZoningContract,
    ParcelEdgeClassification,
    Pt,
    ZoningRecord,
    ZoningRule,
} from '@pryzm/schemas';
import { computeBuildableEnvelope } from '../../ZoningRulesEngine.js';
import { insetPolygonPerEdge } from '../../geometry/insetPolygon.js';
import { ptCountAc, ptEmitAcYield, ptTrimToIu, type PtAcYield, type PtFloorInput } from './ptAcCounting.js';
import { resolveConceptDictionaryVersion, typeCheckPtToken, type PtConceptDictionaryVersion, type PtConceptUnit } from './ptConceptLexicon.js';
import { evaluatePtCondicionantes, type PtCondicionantesInput } from './ptCondicionantes.js';
import { classifyPtCrusClasse, type PtCrusZone } from './ptCrusZone.js';
import { joinPtEtiqueta, PT_ETIQUETA_WATCH, type PtRegulamentoEntry, type PtRegulamentoIndex, type PtRegulamentoNumber } from './ptEtiquetaJoin.js';
import { ptJointHeightStoreys, ptTopCapAboveSoleira, PT_RGEU_STATUS_WATCH, type PtDatum } from './ptHeightQuantities.js';
import { buildPtPoligonoImplantacao, inferPtC1Family, type PtC1Family } from './ptImplantacao.js';
import { resolvePtParcelGeometrySource, PT_BUPI_WATCH, type PtA1Input } from './ptParcelSource.js';
import { ptPlanInterventionOverride, type PtPdmObjectEvidence } from './ptPdmObjectGates.js';
import { ptAssumed, ptCollectAssumptions, ptResolved, type PtInstrumentRef, type PtProvenancedValue } from './ptProvenance.js';
import { solvePtRgeuArt59, type PtArt59Input } from './ptRgeuArt59.js';
import { evaluatePtRgeuArt60, type PtArt60Edge } from './ptRgeuArt60.js';
import { evaluatePtRusticoFuelStrip, type PtTristate } from './ptRusticoFuelStrip.js';

const tracer = trace.getTracer('pryzm.zoning.pt.derive');

/** The jurisdiction id a município-level DERIVED pack carries — `pt-<dtcc>-<slug>` (Porto precedent). */
export function ptDerivedJurisdictionId(zone: PtCrusZone): string {
    const slug = zone.municipio.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    return `pt-${zone.dtcc}-${slug}`;
}

/* ═══════════════════════════════════════ INPUT ═══════════════════════════════════════ */

export interface PtDeriveInput {
    /** ISO timestamp of the reads, injected (no clock in L2). */
    readonly retrievedAt: string;
    /** Step 1 — the A1 ladder inputs (client survey / Cadastro Predial / BUPi / caderneta). */
    readonly a1: PtA1Input;
    /** A3 — per-edge classification of the resolved ring. Length must equal the ring's. */
    readonly edgeClassifications: ReadonlyArray<ParcelEdgeClassification>;
    /** Step 2 — the CRUS zone identity at the point (B2), or null when CRUS served nothing. */
    readonly zone: PtCrusZone | null;
    /** Step 5 — B3: the municipal planta de ordenamento's ETIQUETA for the polygon, when in hand. */
    readonly etiqueta: string | null;
    /** Step 3 — the DL 82/2021 art. 61 facts (only consulted on solo rústico). */
    readonly rustico: {
        readonly inAglomeradoRural: PtTristate;
        readonly forestOrWithin50m: PtTristate;
        readonly subRegionalStripM?: number | null;
    };
    /** Step 4 — B5. */
    readonly b5: {
        /** The Anexo I-PO objects containing the point (codes 22/132 override; 20 = UOPG). null = layer not wired. */
        readonly pdmObjects: FetchOutcome<readonly PtPdmObjectEvidence[]> | null;
        /** Is there evidence of an alvará de loteamento governing the parcel? (no national register — doctrine §7) */
        readonly loteamentoEvidence: PtTristate;
        /** When a loteamento governs, are ITS parameters in hand (as a regulamento entry)? */
        readonly loteamentoEntry: PtRegulamentoEntry | null;
    };
    /** Steps 5/7 — the município's regulamento, transcribed and keyed by ETIQUETA. */
    readonly regulamento: PtRegulamentoIndex;
    /** Step 6 — the plan's PROCEDURAL start date (⛔ not its publication date). null ⇒ refuse. */
    readonly proceduralStartDateIso: string | null;
    /** Step 10 — the datum (S, Es, S2) — S needed whenever Alt is stated. */
    readonly datum: PtDatum;
    /** Step 10 — B4 condicionante reads. null ⇒ NOT READ ⇒ unresolved (blocks). */
    readonly condicionantes: PtCondicionantesInput | null;
    /** Step 10 — art. 59 frontages (opposing alignments). null ⇒ no plane; the flat cap alone bounds. */
    readonly art59: Omit<PtArt59Input, 'footprint'> | null;
    /** Step 10 — art. 60 per-edge neighbour distances. null ⇒ NOT MEASURED ⇒ unresolved (blocks). */
    readonly art60: ReadonlyArray<Omit<PtArt60Edge, 'existingErosion_m'>> | null;
    /** Step 10 — art. 65 inputs. */
    readonly use: 'residential' | 'commercial' | null;
    readonly slabThickness_m: number | null;
    /**
     * Step 11 — the proposed floors for Ac counting. null ⇒ Ac is COMPUTED as footprint × effective
     * storeys (regular floors at S and above, single use), and flagged `assumed`.
     */
    readonly floors: ReadonlyArray<PtFloorInput> | null;
    /** Is this output commercial? (drives the APA licence gate inside `condicionantes`). */
    readonly commercialUse: boolean;
}

/* ═══════════════════════════════════════ OUTPUT ═══════════════════════════════════════ */

export interface PtRefusalEntry {
    /** Which doctrine §12 step refused (1–12). */
    readonly step: number;
    readonly reason: string;
    readonly instrument: string;
    /** Doctrine seam: is this about the LAW (true) or PRYZM's coverage/inputs (false)? */
    readonly legallyGrounded: boolean;
}

export interface PtConstraintApplied {
    readonly code: string;
    readonly article: string;
    readonly effect: string;
}

export interface PtRegulatoryIdentity {
    readonly municipio: string;
    readonly dtcc: string;
    readonly classe: string;
    readonly categoria: string;
    readonly classificacaoEQualificacao: string;
    readonly registoOuDeposito: string | null;
    readonly situacaoPdm: string | null;
    readonly etiqueta: string | null;
    readonly joinKind: 'etiqueta-join' | 'text-fallback' | null;
    readonly conceptDictionaryVersion: PtConceptDictionaryVersion | null;
    readonly c1Family: PtC1Family | null;
    readonly supletivo: boolean;
}

export interface PtParcelBlock {
    readonly source: string;
    readonly provenance: string;
    readonly identifier: string | null;
    readonly ring: ReadonlyArray<Pt>;
    readonly areaM2: number;
    readonly confidence: 'resolved' | 'assumed';
}

export interface PtVolumeBlock {
    readonly footprint: ReadonlyArray<Pt>;
    readonly footprintSource: 'drawn' | 'derived-from-recuo-afastamentos' | 'rustico-outer-bound';
    readonly footprintAreaM2: number;
    readonly topAboveS_m: PtProvenancedValue<number> | null;
    readonly governingHeight: string;
    readonly effectiveMaxFloors: PtProvenancedValue<number> | null;
    readonly volumeM3: PtProvenancedValue<number>;
    readonly parameters: Readonly<Record<string, PtProvenancedValue<number>>>;
}

export type PtDerivation =
    | {
          readonly kind: 'refused';
          readonly stepReached: number;
          readonly refusals: readonly PtRefusalEntry[];
          /** The ratified refusal card, for the dispatcher. */
          readonly refusal: EnvelopeRefusal;
          readonly regulatoryIdentity: PtRegulatoryIdentity | null;
          readonly parcel: PtParcelBlock | null;
          readonly assumptions: readonly string[];
          readonly watchFlags: readonly string[];
      }
    | {
          readonly kind: 'derived';
          readonly parcel: PtParcelBlock;
          readonly regulatoryIdentity: PtRegulatoryIdentity;
          readonly volume: PtVolumeBlock;
          readonly yield: PtAcYield & { readonly iuCeilingM2: number; readonly withinIu: boolean; readonly trimmedAcM2: number };
          readonly constraintsApplied: readonly PtConstraintApplied[];
          readonly assumptions: readonly string[];
          readonly refusals: readonly [];
          readonly watchFlags: readonly string[];
          /** The C58 artefacts — the pack the numbers became, and the envelope the ENGINE solved. */
          readonly pack: JurisdictionZoningContract;
          readonly zoning: ZoningRecord;
          readonly envelope: BuildableEnvelope;
      };

/* ═══════════════════════════════════════ helpers ═══════════════════════════════════════ */

const PT_WATCH_FLAGS_BASE: readonly string[] = [
    PT_RGEU_STATUS_WATCH,
    'DL 108/2026 RJUE revision in force 2026-10-01.',
    'PEPU mandatory since 2026-01-05 — practical availability unconfirmed.',
    'SGIFR technical norms under at-least-annual review (Despacho 675/2026).',
    PT_ETIQUETA_WATCH,
    PT_BUPI_WATCH,
];

function ringArea(ring: ReadonlyArray<Pt>): number {
    let a = 0;
    for (let i = 0; i < ring.length; i++) {
        const p = ring[i]!;
        const q = ring[(i + 1) % ring.length]!;
        a += p.x * q.z - q.x * p.z;
    }
    return Math.abs(a / 2);
}

function identityOf(zone: PtCrusZone | null, etiqueta: string | null): PtRegulatoryIdentity | null {
    if (!zone) return null;
    return {
        municipio: zone.municipio,
        dtcc: zone.dtcc,
        classe: zone.classe2021,
        categoria: zone.categoria2021,
        classificacaoEQualificacao: zone.classificacaoEQualificacao,
        registoOuDeposito: zone.registoOuDeposito,
        situacaoPdm: zone.situacaoPdm,
        etiqueta,
        joinKind: null,
        conceptDictionaryVersion: null,
        c1Family: null,
        supletivo: false,
    };
}

/**
 * Step 7's type-check applied to ONE transcribed number: the token must be a DR concept in the
 * unit the transcriber claims. A failure is a REFUSAL of the transcription, never a conversion.
 */
function checked(
    key: string,
    unit: PtConceptUnit,
    n: PtRegulamentoNumber | null,
    version: PtConceptDictionaryVersion,
    problems: string[],
): number | null {
    if (n === null) return null;
    const t = typeCheckPtToken(key, { dictionaryVersion: version, unit, value: n.value });
    if (!t.ok) {
        problems.push(`${key} = ${n.value} (${n.article}): ${t.detail}`);
        return null;
    }
    if (n.article.trim().length === 0) {
        problems.push(`${key} = ${n.value} carries NO article — a number without an article is not a product (doctrine §0).`);
        return null;
    }
    return n.value;
}

/* ═══════════════════════════════════════ THE PIPELINE ═══════════════════════════════════════ */

/**
 * PURE + TOTAL: doctrine §12 steps 1–12 in order. Every input lands on `derived` or on a `refused`
 * that names the step, the instrument and the seam. The engine is called at the end, never before
 * every parameter is `resolved`/`assumed`.
 */
export function derivePtEnvelope(input: PtDeriveInput): PtDerivation {
    const span = tracer.startSpan('pryzm.zoning.pt.derivePtEnvelope');
    try {
        return run(input);
    } finally {
        span.end();
    }
}

function run(input: PtDeriveInput): PtDerivation {
    const assumptions: string[] = [];
    const watch = new Set<string>(PT_WATCH_FLAGS_BASE);
    const constraints: PtConstraintApplied[] = [];
    let identity = identityOf(input.zone, input.etiqueta);
    let parcel: PtParcelBlock | null = null;

    const refuse = (
        step: number,
        reason: string,
        instrument: string,
        legallyGrounded: boolean,
        code: EnvelopeRefusal['code'],
        headline: string,
    ): PtDerivation => ({
        kind: 'refused',
        stepReached: step,
        refusals: [{ step, reason, instrument, legallyGrounded }],
        refusal: {
            code,
            headline,
            detail: `Doctrine §12 step ${step} refused: ${reason}`,
            ordinanceRef: instrument,
            knownFacts: [
                ...(identity ? [`Zona: ${identity.classificacaoEQualificacao}`, `Município: ${identity.municipio} (DTCC ${identity.dtcc})`] : []),
                ...(identity?.registoOuDeposito ? [`PDM registo/depósito: ${identity.registoOuDeposito}`] : []),
                ...(identity?.etiqueta ? [`ETIQUETA: ${identity.etiqueta}`] : []),
                ...(parcel ? [`Parcela: ${parcel.areaM2.toFixed(0)} m² (${parcel.source})`] : []),
            ],
            legallyGrounded,
        },
        regulatoryIdentity: identity,
        parcel,
        assumptions,
        watchFlags: [...watch],
    });

    // ── STEP 2 (first, because step 1's BUPi rung needs B2) — classify urbano / rústico. ──────
    // The doctrine orders "Resolve A1" before "Classify", but the A1 ladder's rung 3 is
    // "rustic/mixed ONLY" and needs the classe; asking CRUS costs nothing here because the identity
    // is already in hand. A1 is still the first REFUSAL gate: an unresolved A1 refuses at step 1.
    const classe = input.zone ? classifyPtCrusClasse(input.zone.classe2021) : 'unrecognised';
    const isSoloUrbano: PtTristate = classe === 'solo-urbano' ? true : classe === 'solo-rustico' ? false : null;

    // ── STEP 1 — resolve A1. ──────────────────────────────────────────────────────────────────
    const a1 = resolvePtParcelGeometrySource({ ...input.a1, isSoloUrbano });
    if (a1.kind !== 'geometry') {
        const reason = a1.refusalReason;
        return refuse(1, reason, 'Doctrine §11 A1 — Cadastro Predial (118 CGPR + 7 SiNErGIC concelhos) · BUPi (rústico/misto) · AT caderneta (área only)', false, 'source-data-unavailable', 'Portugal — the parcel geometry (A1) is unresolved.');
    }
    if (input.edgeClassifications.length !== a1.ring.length) {
        return refuse(1, `edge classifications (${input.edgeClassifications.length}) do not match the resolved ring (${a1.ring.length} edges) — A3 is unresolved`, 'Doctrine §11 A1/A3', false, 'source-data-unavailable', 'Portugal — the parcel edges are unclassified.');
    }
    parcel = {
        source: a1.rung,
        provenance: a1.provenance,
        identifier: a1.identifier,
        ring: a1.ring,
        areaM2: ringArea(a1.ring),
        confidence: a1.confidence,
    };
    for (const c of a1.caveats) assumptions.push(c);

    if (!input.zone) {
        return refuse(2, 'CRUS served no zone at the point — B2 (classification) is unresolved; neither solo urbano nor solo rústico can be asserted', 'Doctrine §11 B2 — DGT CRUS + municipal planta de ordenamento', false, 'no-plan-at-point', 'Portugal — no classification served at this point.');
    }
    if (classe === 'unrecognised') {
        return refuse(2, `CRUS classe_2021 «${input.zone.classe2021}» is neither Solo Urbano nor Solo Rústico — B2 unresolved (report the record, never guess)`, 'DR 15/2015 — classificação do solo', false, 'regime-undetermined', 'Portugal — the soil classification is unrecognised.');
    }

    // ── STEP 3 — solo rústico: DL 82/2021 art. 61. ───────────────────────────────────────────
    let footprintOuterBound: ReadonlyArray<Pt> = a1.ring;
    let footprintSource: PtVolumeBlock['footprintSource'] = 'derived-from-recuo-afastamentos';
    if (classe === 'solo-rustico') {
        const strip = evaluatePtRusticoFuelStrip({
            parcelRing: a1.ring,
            isSoloRustico: true,
            inAglomeradoRural: input.rustico.inAglomeradoRural,
            forestOrWithin50m: input.rustico.forestOrWithin50m,
            subRegionalStripM: input.rustico.subRegionalStripM ?? null,
        });
        if (strip.kind === 'unresolved') return refuse(3, strip.refusalReason, strip.ordinanceRef, false, 'overlay-uncertain', 'Portugal — DL 82/2021 art. 61 cannot be evaluated.');
        if (strip.kind === 'refused-empty') return refuse(3, strip.refusalReason, strip.ordinanceRef, true, 'protected-soil', 'Portugal — the 50 m fuel-management strip consumes the parcel (DL 82/2021 art. 61).');
        if (strip.kind === 'outer-bound') {
            footprintOuterBound = strip.ring;
            footprintSource = 'rustico-outer-bound';
            constraints.push({ code: 'DL82/2021-art61', article: strip.ordinanceRef, effect: `outer bound: negative buffer ${strip.stripM} m (${strip.stripBasis})` });
            watch.add(strip.watch);
            if (strip.mayOverstate) assumptions.push(`DL 82/2021 art. 61 strip taken at the statutory 50 m — the Programa Sub-regional may widen it up to 50 %, in which case this outer bound OVERSTATES.`);
        } else {
            constraints.push({ code: 'DL82/2021-art61', article: 'DL 82/2021 art. 61', effect: `not applicable: ${strip.why}` });
        }
    }

    // ── STEP 4 — resolve B5: PU/PP override, loteamento, UOPG supletivo. ─────────────────────
    let supletivo = false;
    if (input.b5.pdmObjects === null) {
        assumptions.push('The Anexo I-PO plan-intervention layer (PU/PP override, códigos 22/132) is NOT WIRED — whether a site-specific plan overrides the PDM here is UNVERIFIED; this derivation assumes the PDM governs.');
    } else if (input.b5.pdmObjects.status === 'found') {
        const override = ptPlanInterventionOverride(input.zone, input.b5.pdmObjects.value);
        if (override !== null) {
            return {
                kind: 'refused',
                stepReached: 4,
                refusals: [{ step: 4, reason: override.detail, instrument: override.ordinanceRef ?? 'PU/PP (Anexo I-PO 22/132)', legallyGrounded: override.legallyGrounded }],
                refusal: override,
                regulatoryIdentity: identity,
                parcel,
                assumptions,
                watchFlags: [...watch],
            };
        }
        supletivo = input.b5.pdmObjects.value.some((o) => o.codigo === 20);
    } else if (input.b5.pdmObjects.status === 'absent') {
        // the layer answered: no object here — the durable clean case
    } else {
        return refuse(4, `the Anexo I-PO plan-intervention layer did not answer (${input.b5.pdmObjects.reason ?? 'aborted'}) — whether a PU/PP overrides the PDM is unverifiable; failure is not "no override"`, 'Norma Técnica PDM (Aviso 9282/2021) Anexo I-PO códigos 22/132', false, 'source-data-unavailable', 'Portugal — the PU/PP override layer did not answer.');
    }
    if (input.b5.loteamentoEvidence === null) {
        assumptions.push('Alvará de loteamento: NO evidence either way (there is no national register — doctrine §7). This derivation assumes none governs; if one does, it SUPERSEDES the PDM inside its perimeter.');
    } else if (input.b5.loteamentoEvidence === true && input.b5.loteamentoEntry === null) {
        return refuse(4, 'evidence of an alvará de loteamento governing this parcel exists and its parameters are NOT in hand — B5 unresolved (doctrine §7: a loteamento supersedes the PDM and has no national register)', 'RJUE (DL 555/99) — alvará de loteamento', false, 'derived-plan', 'Portugal — an alvará de loteamento governs and its parameters are not in hand.');
    }

    // ── STEP 5 — B2/B3 → ETIQUETA → regulamento entry (ETIQUETA before text). ───────────────
    let entry: PtRegulamentoEntry;
    let joinKind: 'etiqueta-join' | 'text-fallback';
    if (input.b5.loteamentoEvidence === true && input.b5.loteamentoEntry !== null) {
        entry = input.b5.loteamentoEntry;
        joinKind = 'etiqueta-join';
        constraints.push({ code: 'B5-loteamento', article: entry.instrument.article, effect: 'the alvará de loteamento\'s parameters govern (supersede the PDM inside its perimeter)' });
    } else {
        const join = joinPtEtiqueta(input.regulamento, input.etiqueta, input.zone.classificacaoEQualificacao);
        if (join.kind === 'unresolved') {
            return refuse(5, join.refusalReason, `${input.regulamento.municipio} — PDM regulamento index (ETIQUETA join)`, false, 'no-rule-pack', 'Portugal — the polygon cannot be joined to a regulamento article.');
        }
        entry = join.entry;
        joinKind = join.kind;
        if (join.kind === 'text-fallback') for (const a of join.assumptions) assumptions.push(a);
    }
    if (entry.supletivo === true) supletivo = true;
    if (supletivo) assumptions.push('UOPG (código 20): the PDM\'s SUPLETIVO parameters are applied pending the plan — flagged `supletivo` (doctrine §7); a future PU/PP will replace them.');

    // ── STEP 6 — concept_dictionary_version from the PROCEDURAL start date. ─────────────────
    const dict = resolveConceptDictionaryVersion(input.proceduralStartDateIso);
    if (!dict.ok) return refuse(6, dict.refusalReason, 'DR 5/2019 vs DR 9/2009 — boundary 2019-09-27 (doctrine §2.6)', false, 'no-rule-pack', 'Portugal — the concept dictionary version cannot be determined.');
    assumptions.push(`concept_dictionary_version = ${dict.version} (${dict.basis})`);

    identity = {
        ...(identity as PtRegulatoryIdentity),
        etiqueta: input.etiqueta ?? entry.etiqueta,
        joinKind,
        conceptDictionaryVersion: dict.version,
        supletivo,
    };

    // ── STEP 7 — extract C1–C5, D1 and TYPE-CHECK every token; reject, never guess. ─────────
    const problems: string[] = [];
    const Iu = checked('Iu', 'dimensionless', entry.Iu, dict.version, problems);
    const Io = checked('Io', 'percent', entry.Io_pct, dict.version, problems);
    const H = checked('H', 'm', entry.H_m, dict.version, problems);
    const Hf = checked('Hf', 'm', entry.Hf_m, dict.version, problems);
    const Alt = checked('Alt', 'm', entry.Alt_m, dict.version, problems);
    const Re = checked('Re', 'm', entry.Re_m, dict.version, problems);
    const AfL = checked('Af', 'm', entry.AfLateral_m, dict.version, problems);
    const AfT = checked('Af', 'm', entry.AfTardoz_m, dict.version, problems);
    // No lexicon key (see `PtRegulamentoEntry`) — admissibility only.
    const pisos = entry.pisos === null ? null : Number.isInteger(entry.pisos.value) && entry.pisos.value > 0 ? entry.pisos.value : (problems.push(`pisos = ${entry.pisos.value} is not a positive integer storey count`), null);
    const prof = entry.profundidade_m === null ? null : Number.isFinite(entry.profundidade_m.value) && entry.profundidade_m.value > 0 ? entry.profundidade_m.value : (problems.push(`profundidade = ${entry.profundidade_m.value} is not a positive distance`), null);
    if (problems.length > 0) {
        return refuse(7, `transcription tokens fail the ${dict.version} type-check — ${problems.join('; ')}`, `${entry.instrument.instrument} — ${entry.instrument.article}`, false, 'no-rule-pack', 'Portugal — the regulamento transcription does not type-check.');
    }

    // ── STEP 8 — C1, ALWAYS inferred/assumed; no basis ⇒ refuse. ────────────────────────────
    const c1 = inferPtC1Family(entry.c1Text);
    if (!c1.ok) return refuse(8, c1.refusalReason, `${entry.instrument.instrument} — ${entry.instrument.article}`, false, 'no-rule-pack', 'Portugal — the ordering type (C1) cannot be inferred with a stated basis.');
    for (const a of c1.family.assumptions) assumptions.push(a);
    const family = c1.family.value;
    identity = { ...identity, c1Family: family };
    if (family === 'context-aggregate') {
        return refuse(8, 'C1 = context-aggregate (a fabric-derived rule such as Porto\'s moda da cércea or Lisboa\'s Traçado Urbano). This pipeline draws the setback and alignment families; the context-aggregate family is evaluated by `evaluatePtPortoCercea` over an injected frente-urbana member set (ADR-0379) and states NO PDM cap of its own to draw from.', `${entry.instrument.instrument} — ${entry.instrument.article}`, false, 'no-rule-pack', 'Portugal — a fabric-derived rule governs; no scalar envelope is drawn here.');
    }

    // ── STEP 9 — the polígono de implantação from Re/Af (alignment: Re = 0 by definition). ───
    const recuo = family === 'alignment' ? (Re ?? 0) : Re;
    if (family === 'alignment' && Re === null) assumptions.push('C1 = alignment: the façade sits ON the alinhamento, so Re is taken as 0 by definition of the family (DR 5/2019: alinhamento / recuo).');
    const artRe = entry.Re_m?.article ?? (family === 'alignment' ? entry.instrument.article : '');
    const poly = buildPtPoligonoImplantacao({
        parcelRing: footprintOuterBound,
        edgeClassifications: input.edgeClassifications,
        recuo_m: recuo,
        afastamentoLateral_m: AfL,
        afastamentoTardoz_m: AfT,
    });
    if (poly.kind === 'unresolved') return refuse(9, poly.refusalReason, `${entry.instrument.instrument} — ${entry.instrument.article}`, false, 'no-rule-pack', 'Portugal — the polígono de implantação cannot be derived.');
    if (poly.kind === 'empty') return refuse(9, poly.refusalReason, `${entry.instrument.instrument} — Re ${artRe} · Af ${entry.AfLateral_m?.article ?? ''}/${entry.AfTardoz_m?.article ?? ''}`, true, 'protected-soil', 'Portugal — the recuo/afastamentos leave no polígono de implantação.');
    let footprint = poly.ring;
    constraints.push({ code: 'C1', article: `${entry.instrument.article} (inferred: "${c1.matched.phrase}")`, effect: `family ${family}` });
    constraints.push({ code: 'C5-Re/Af', article: [artRe, entry.AfLateral_m?.article, entry.AfTardoz_m?.article].filter(Boolean).join(' · '), effect: `polígono de implantação ${poly.source} (${poly.areaM2.toFixed(1)} m²)` });

    // Alignment family: the profundidade clips the footprint from the front edge — expressed to
    // the ENGINE as the alignment rule's `buildableDepth_m` (the engine clips; we do not).
    if (family === 'alignment' && prof === null) {
        return refuse(9, 'C1 = alignment but the regulamento entry states no profundidade máxima — the depth band cannot be placed and a whole-parcel footprint would OVERSTATE', `${entry.instrument.instrument} — ${entry.instrument.article}`, false, 'no-rule-pack', 'Portugal — alignment family without a buildable depth.');
    }

    // ── STEP 10 — the constraint stack: condicionantes (VETOES), art. 59, art. 60, art. 65, Alt. ──
    if (input.condicionantes === null) {
        return refuse(10, 'B4 condicionantes NOT READ (planta de condicionantes / DGPC / REN with its exclusion layer 82 / RAN with 69) — an unread overlay stack cannot be assumed clear', 'Doctrine §11 B4 — planta de condicionantes (152-code catalogue) + DGPC + REN/RAN with exclusion layers 69/82', false, 'overlay-uncertain', 'Portugal — the condicionantes were not read.');
    }
    const cond = evaluatePtCondicionantes({ ...input.condicionantes, commercialUse: input.commercialUse });
    if (cond.kind === 'unresolved') return refuse(10, cond.refusalReason, 'RJREN DL 166/2008 · RJRAN DL 73/2009 · APA/SNIAmb licence terms (doctrine §11)', false, 'overlay-uncertain', 'Portugal — a condicionante is unresolved.');
    if (cond.kind === 'veto') {
        const vetoes = cond.applied.filter((a) => a.effect === 'veto');
        if (cond.wholeParcel === true) {
            return refuse(10, `condicionante VETO over the whole parcel: ${vetoes.map((v) => `${v.designacao} (código ${v.codigo}${v.act ? `, ${v.act}` : ''})`).join('; ')}`, vetoes.map((v) => v.instrument).join(' · '), true, 'protected-soil', 'Portugal — a condicionante vetoes construction on the whole parcel.');
        }
        return refuse(10, `condicionante VETO over PART of the parcel (${vetoes.map((v) => v.designacao).join('; ')}) and the veto polygon ∩ parcel is not in hand — the footprint cannot be derived without OVERSTATING. Supply the veto geometry to subtract it (a veto is a subtraction, never a trim).`, vetoes.map((v) => v.instrument).join(' · '), false, 'overlay-uncertain', 'Portugal — a partial condicionante veto needs its geometry.');
    }
    for (const a of cond.applied) constraints.push({ code: `B4-${a.codigo}`, article: a.act ?? a.instrument, effect: `${a.effect}: ${a.why}` });
    if (cond.sourceUsed) constraints.push({ code: 'B4-REN-source', article: 'doctrine §11 licence gate', effect: `REN sourced from ${cond.sourceUsed}` });

    // art. 60 — additional erosion per edge, composed onto the footprint.
    if (input.art60 === null) {
        return refuse(10, 'RGEU art. 60 (10 m between façades with habitable openings) cannot be evaluated: the opposing-façade distances were not measured — assuming none would OVERSTATE', 'RGEU art. 60.º', false, 'source-data-unavailable', 'Portugal — art. 60 neighbour distances not measured.');
    }
    const erosionOf = (e: Exclude<ParcelEdgeClassification, 'unclassified'>): number => (e === 'front' ? recuo ?? 0 : e === 'rear' ? AfT ?? 0 : AfL ?? 0);
    const art60 = evaluatePtRgeuArt60(input.art60.map((e) => ({ ...e, existingErosion_m: erosionOf(e.edge) })));
    if (!art60.ok) return refuse(10, art60.refusalReason, art60.instrument.article, false, 'source-data-unavailable', 'Portugal — art. 60 is unresolved on an edge.');
    for (const a of art60.assumptions) assumptions.push(a);
    watch.add(art60.watch);
    const extra = { front: 0, side: 0, rear: 0 };
    for (const e of art60.edges) {
        constraints.push({ code: 'RGEU-art60', article: art60.instrument.article, effect: `${e.edge}: ${e.effect} — ${e.why}` });
        if (e.effect === 'additional-erosion') extra[e.edge] = Math.max(extra[e.edge], e.additionalErosion_m);
    }
    if (extra.front > 0 || extra.side > 0 || extra.rear > 0) {
        const inset = insetPolygonPerEdge(footprint, input.edgeClassifications, { ...extra, unclassified: Math.max(extra.front, extra.side, extra.rear) });
        if (inset.degenerate || inset.polygon.length < 3) {
            return refuse(10, `RGEU art. 60's additional façade separation (front +${extra.front} m, side +${extra.side} m, rear +${extra.rear} m) consumes the polígono de implantação — nothing can be built at this separation`, art60.instrument.article, true, 'protected-soil', 'Portugal — art. 60 leaves no footprint.');
        }
        footprint = inset.polygon;
    }

    // Alt as ABSOLUTE cap · H · Es — the five quantities, never collapsed.
    const top = ptTopCapAboveSoleira(input.datum, { H_m: H, Hf_m: Hf, Alt_m: Alt, maxFloors: pisos });
    if (top.kind === 'unresolved') return refuse(10, top.refusalReason, top.instrument.article, false, 'no-rule-pack', 'Portugal — the height cap cannot be resolved (Alt without S).');
    let topAboveS: PtProvenancedValue<number> | null = null;
    let governing = 'none';
    if (top.kind === 'cap') {
        topAboveS = top.topAboveS;
        governing = top.governing;
        for (const a of top.topAboveS.assumptions) assumptions.push(a);
        constraints.push({ code: 'C2-H/Alt', article: [entry.H_m?.article, entry.Alt_m?.article].filter(Boolean).join(' · '), effect: `top above S = ${top.topAboveS.value.toFixed(2)} m, governing ${top.governing}${top.governing === 'Alt' ? ' (ABSOLUTE cap binds — stricter than H)' : ''}` });
    }
    // art. 65 — metres and storeys JOINTLY binding.
    const joint = ptJointHeightStoreys({ capAboveS_m: topAboveS?.value ?? null, maxFloors: pisos, use: input.use, slabThickness_m: input.slabThickness_m });
    if (joint.effectiveMaxFloors) for (const a of joint.effectiveMaxFloors.assumptions) assumptions.push(a);
    watch.add(joint.watch);
    constraints.push({ code: 'RGEU-art65', article: 'RGEU art. 65.º', effect: `binding: ${joint.binding}; effective storeys ${joint.effectiveMaxFloors?.value ?? 'n/a'}; ${joint.metreCapFromStoreysWhy}` });

    if (topAboveS === null && input.art59 === null) {
        return refuse(10, 'the plan states neither H nor Alt and no art. 59 frontage is supplied — the top of the volume is UNBOUNDED; fabricating a cap is the forbidden direction (§2.4: "N pisos" is not a metre cap)', `${entry.instrument.instrument} — ${entry.instrument.article}`, false, 'no-rule-pack', 'Portugal — no vertical limit can be established.');
    }

    // art. 59 — the inclined plane over the footprint, with the flat cap; EXACT volume.
    let volumeM3: number;
    let volumeMethod: 'art59-solve' | 'prism';
    if (input.art59 !== null) {
        const solved = solvePtRgeuArt59({ ...input.art59, footprint }, topAboveS?.value ?? null);
        if (!solved.ok) return refuse(10, solved.refusalReason, solved.instrument.article, false, 'no-rule-pack', 'Portugal — RGEU art. 59 could not be solved.');
        for (const a of solved.assumptions) assumptions.push(a);
        watch.add(solved.watch);
        for (const p of solved.provenance) constraints.push({ code: 'RGEU-art59', article: `RGEU ${p.clause}`, effect: `plane ${p.planeId} on frontage ${p.frontageId}: base ${p.baseHeight_m} m, street width ${p.streetWidth_m.toFixed(2)} m` });
        volumeM3 = solved.solve.volumeM3;
        volumeMethod = 'art59-solve';
    } else {
        volumeM3 = ringArea(footprint) * (topAboveS as PtProvenancedValue<number>).value;
        volumeMethod = 'prism';
    }

    // ── STEP 11 — compute Ac, then TRIM to Iu by the national counting rule. ────────────────
    const footprintArea = ringArea(footprint);
    let floors = input.floors;
    if (floors === null) {
        const n = joint.effectiveMaxFloors?.value ?? null;
        if (n === null) return refuse(11, 'no storey count is derivable (no metre cap and no número de pisos) and no floor schedule was supplied — Ac cannot be counted', `${entry.instrument.instrument} — ${entry.instrument.article}`, false, 'no-rule-pack', 'Portugal — Ac cannot be counted.');
        const use = input.use === 'commercial' ? 'com' : 'hab';
        floors = Array.from({ length: n }, (_, i) => ({ piso: i + 1, use, areaExteriorPerimeterM2: footprintArea, kind: 'regular' as const }));
        assumptions.push(`Ac COMPUTED as the polígono de implantação (${footprintArea.toFixed(1)} m²) × ${n} regular pisos above S, single use «${use}» — no floor schedule supplied; below-S floors, sótão and cave are NOT counted (they would only ADD Ac, so this Ac may UNDER-state and the trim is conservative).`);
    }
    const counted = ptCountAc(floors);
    if (counted.kind === 'unresolved') return refuse(11, counted.refusalReason, 'DR 5/2019 — área de construção (Ac)', false, 'no-rule-pack', 'Portugal — Ac cannot be counted.');
    if (Iu === null) {
        return refuse(11, 'the regulamento entry states no Iu (índice de utilização / índice de construção / COS-as-Iu) — D1 unresolved; the volume cannot be trimmed and an untrimmed volume OVERSTATES (L-616)', `${entry.instrument.instrument} — ${entry.instrument.article}`, false, 'no-rule-pack', 'Portugal — no floor-area index (Iu) transcribed.');
    }
    const trim = ptTrimToIu(counted.ac.total.value, Iu, parcel.areaM2);
    if ('kind' in trim) return refuse(11, trim.refusalReason, entry.Iu?.article ?? entry.instrument.article, false, 'no-rule-pack', 'Portugal — the Iu trim is unresolved.');
    constraints.push({ code: 'D1-Iu', article: entry.Iu!.article, effect: `Iu ${Iu} × As ${parcel.areaM2.toFixed(1)} m² = ceiling ${trim.ceilingM2.value.toFixed(1)} m²; Ac ${trim.acM2.toFixed(1)} m² → ${trim.withinIu ? 'within' : `EXCEEDS by ${trim.excessM2.toFixed(1)} m² — trimmed`}` });
    if (Io !== null) constraints.push({ code: 'C4-Io', article: entry.Io_pct!.article, effect: `Io ${Io} % of As = ${(parcel.areaM2 * Io / 100).toFixed(1)} m² max implantação (polígono ${footprintArea.toFixed(1)} m² ${footprintArea <= parcel.areaM2 * Io / 100 + 1e-6 ? 'within' : 'EXCEEDS — the engine applies maxCoverage'})` });

    // ── STEP 12 — emit Ac disaggregated, and hand the numbers to the ENGINE. ────────────────
    const acYield = ptEmitAcYield(counted.ac);
    const trimmedVolume = trim.withinIu ? volumeM3 : volumeM3 * (trim.trimmedAcM2 / Math.max(trim.acM2, 1e-9));
    const vol = ptResolved(trimmedVolume, 'm³', entry.instrument, 'computed', ['footprint', volumeMethod, 'Iu trim'], 'ordinance-pdf');

    const params: Record<string, PtProvenancedValue<number>> = {};
    const put = (k: string, v: number | null, unit: string, art: string | undefined): void => {
        if (v === null || !art) return;
        params[k] = ptResolved(v, unit, { ...entry.instrument, article: art }, 'direct', [k], 'ordinance-pdf', input.retrievedAt);
    };
    put('Iu', Iu, 'dimensionless', entry.Iu?.article);
    put('Io', Io, 'percent', entry.Io_pct?.article);
    put('H', H, 'm above S', entry.H_m?.article);
    put('Hf', Hf, 'm above S', entry.Hf_m?.article);
    put('Alt', Alt, 'm (national datum)', entry.Alt_m?.article);
    put('pisos', pisos, 'pisos', entry.pisos?.article);
    if (family === 'alignment' && Re === null) params['Re'] = ptAssumed(0, 'm', { ...entry.instrument, article: entry.instrument.article }, 'inferred', ['C1 = alignment'], 'ordinance-pdf', ['Re = 0 by definition of the alignment family (façade on the alinhamento).']);
    else put('Re', Re, 'm', entry.Re_m?.article);
    put('Af-lateral', AfL, 'm', entry.AfLateral_m?.article);
    put('Af-tardoz', AfT, 'm', entry.AfTardoz_m?.article);
    put('profundidade', prof, 'm', entry.profundidade_m?.article);
    if (topAboveS) params['topAboveS'] = topAboveS;
    if (joint.effectiveMaxFloors) params['effectiveMaxFloors'] = joint.effectiveMaxFloors;
    params['volume'] = vol;
    for (const a of ptCollectAssumptions(Object.values(params))) if (!assumptions.includes(a)) assumptions.push(a);

    // The ONE-ZONE PACK — the Balears "resolved pack" shape — and the engine call.
    const { pack, zoning } = ptResolvedPack({
        zone: input.zone,
        entry,
        family,
        recuo_m: recuo,
        afLateral_m: AfL,
        afTardoz_m: AfT,
        profundidade_m: prof,
        topAboveS_m: topAboveS?.value ?? null,
        effectiveMaxFloors: joint.effectiveMaxFloors?.value ?? null,
        Iu,
        Io_pct: Io,
        supletivo,
        governing,
        joinKind,
        dictionaryVersion: dict.version,
        retrievedAt: input.retrievedAt,
    });
    const envelope = computeBuildableEnvelope({
        parcelRing: footprintSource === 'rustico-outer-bound' ? footprintOuterBound : a1.ring,
        edgeClassifications: input.edgeClassifications,
        zoning,
        rulePack: pack,
    });

    return {
        kind: 'derived',
        parcel,
        regulatoryIdentity: identity,
        volume: {
            footprint,
            footprintSource: footprintSource === 'rustico-outer-bound' ? 'rustico-outer-bound' : poly.source,
            footprintAreaM2: footprintArea,
            topAboveS_m: topAboveS,
            governingHeight: governing,
            effectiveMaxFloors: joint.effectiveMaxFloors,
            volumeM3: vol,
            parameters: params,
        },
        yield: { ...acYield, iuCeilingM2: trim.ceilingM2.value, withinIu: trim.withinIu, trimmedAcM2: trim.trimmedAcM2 },
        constraintsApplied: constraints,
        assumptions,
        refusals: [],
        watchFlags: [...watch],
        pack,
        zoning,
        envelope,
    };
}

/* ═══════════════════════════ the pack — the Balears "resolved pack" shape ═══════════════════════════ */

export interface PtResolvedPackInput {
    readonly zone: PtCrusZone;
    readonly entry: PtRegulamentoEntry;
    readonly family: Exclude<PtC1Family, 'context-aggregate'>;
    readonly recuo_m: number | null;
    readonly afLateral_m: number | null;
    readonly afTardoz_m: number | null;
    readonly profundidade_m: number | null;
    /** The permitted top above S (H/Alt/Es composed), or null when no metric cap exists. */
    readonly topAboveS_m: number | null;
    readonly effectiveMaxFloors: number | null;
    readonly Iu: number | null;
    readonly Io_pct: number | null;
    readonly supletivo: boolean;
    readonly governing: string;
    readonly joinKind: 'etiqueta-join' | 'text-fallback';
    readonly dictionaryVersion: PtConceptDictionaryVersion;
    readonly retrievedAt: string;
}

/**
 * PURE: the doctrine's resolved parameters as a ONE-ZONE `JurisdictionZoningContract` + the
 * `ZoningRecord` that selects it — exactly what `computeBuildableEnvelope` consumes. Every number
 * carries `fieldProvenance: 'ordinance-pdf'` (the regulamento is a PDF, read by a human) and the
 * `ordinanceRef` names EVERY article a value came from.
 *
 * ⚠ `heightDatum` is deliberately NOT set: `maxHeight_m` here is "metres above the cota de soleira
 * S (DR 5/2019)", and ADR-0377's union has no `cota-de-soleira` member and no Portuguese absolute
 * frame (Cascais Helmert 38) — so the read path stamps `unknown`, which REFUSES in datum-consuming
 * resolvers. That is the honest state: the seat is an amendment surface named in the scorecard, not
 * a member minted by this lane (schemas are not this lane's to widen).
 */
export function ptResolvedPack(i: PtResolvedPackInput): { readonly pack: JurisdictionZoningContract; readonly zoning: ZoningRecord } {
    const e = i.entry;
    const jurisdictionId = ptDerivedJurisdictionId(i.zone);
    const code = e.etiqueta;
    const articles: string[] = [];
    const cite = (label: string, n: PtRegulamentoNumber | null): void => { if (n) articles.push(`${label} ${n.value} — ${n.article}`); };
    cite('Iu', e.Iu); cite('Io %', e.Io_pct); cite('H', e.H_m); cite('Hf', e.Hf_m); cite('Alt', e.Alt_m); cite('pisos', e.pisos);
    cite('Re', e.Re_m); cite('Af lateral', e.AfLateral_m); cite('Af tardoz', e.AfTardoz_m); cite('profundidade', e.profundidade_m);

    const fieldProvenance: Record<string, 'ordinance-pdf'> = {};
    const mark = (k: string, v: number | null): void => { if (v !== null) fieldProvenance[k] = 'ordinance-pdf'; };
    const maxCoverage = i.Io_pct === null ? null : Math.min(1, i.Io_pct / 100);
    mark('maxHeight', i.topAboveS_m); mark('maxFloors', i.effectiveMaxFloors); mark('maxFAR', i.Iu); mark('maxCoverage', maxCoverage);
    mark('setback.front', i.recuo_m); mark('setback.side', i.afLateral_m); mark('setback.rear', i.afTardoz_m);
    if (e.permittedUse.length > 0) fieldProvenance['permittedUse'] = 'ordinance-pdf';

    let geometricRule: GeometricRule;
    if (i.family === 'alignment') {
        geometricRule = {
            kind: 'alignment',
            alignTo: 'street',
            alignmentOffset_m: i.recuo_m ?? 0,
            sideTreatment: i.afLateral_m !== null && i.afLateral_m > 0 ? 'setback' : 'party-wall',
            ...(i.afLateral_m !== null && i.afLateral_m > 0 ? { side_m: i.afLateral_m } : {}),
            ...(i.afTardoz_m !== null ? { rear_m: i.afTardoz_m } : {}),
            buildableDepth_m: i.profundidade_m as number,
        };
    } else {
        geometricRule = { kind: 'setback', front_m: i.recuo_m ?? 0, side_m: i.afLateral_m ?? 0, rear_m: i.afTardoz_m ?? 0 };
    }

    const ordinanceRef =
        `${e.instrument.instrument}${e.instrument.version ? ` (${e.instrument.version})` : ''}${e.instrument.dateInForce ? `, em vigor ${e.instrument.dateInForce}` : ''} — ` +
        `${e.instrument.article}; ${articles.join(' · ')}. ` +
        `Join: ${i.joinKind === 'etiqueta-join' ? `ETIQUETA «${code}»` : `TEXT FALLBACK to «${code}» (assumed — confirm the ETIQUETA)`}. ` +
        `concept_dictionary_version ${i.dictionaryVersion}. maxHeight_m is metres ABOVE THE COTA DE SOLEIRA S (governing ${i.governing}). ` +
        `${i.supletivo ? '⚠ SUPLETIVO parameters (UOPG código 20) pending the plan. ' : ''}` +
        `CRUS: ${i.zone.classificacaoEQualificacao} · registo/depósito ${i.zone.registoOuDeposito ?? 'n/a'} · ${i.zone.situacaoPdm ?? 'situação n/a'}.`;

    const zone: ZoningRule = {
        code,
        label: e.designacao,
        permittedUse: [...e.permittedUse],
        maxHeight_m: i.topAboveS_m,
        maxFloors: i.effectiveMaxFloors,
        plotRatioFAR: i.Iu,
        maxCoverage,
        setbacks: { front_m: i.recuo_m, side_m: i.afLateral_m, rear_m: i.afTardoz_m },
        fieldProvenance,
        ordinanceRef,
        geometricRule,
    };
    const pack: JurisdictionZoningContract = {
        jurisdictionId,
        displayName: `${i.zone.municipio} — PDM (${code}) — DERIVED`,
        source: 'manual',
        crs: 'EPSG:3763',
        lastReviewed: e.instrument.dateInForce ?? i.retrievedAt.slice(0, 10),
        // A human-read regulamento transcription with per-value articles: the curated tier,
        // never `structured` (the pack may not certify its own numbers — L-665 ceiling).
        defaultConfidence: 'estimated-ruleset',
        zones: [zone],
    };
    const zoning: ZoningRecord = {
        zoneCode: code,
        zoneLabel: e.designacao,
        jurisdictionId,
        structuredFields: {},
        overlays: [],
        ordinanceRef,
        provenance: {
            source: 'pt-pdm-regulamento',
            label: `${i.zone.municipio} PDM regulamento — ${e.instrument.instrument}`,
            version: e.instrument.version,
            license: null,
            crs: 'EPSG:3763',
        },
    };
    return { pack, zoning };
}

/** Re-export so a caller composing the input has the seam types in one place. */
export type { PtInstrumentRef };
