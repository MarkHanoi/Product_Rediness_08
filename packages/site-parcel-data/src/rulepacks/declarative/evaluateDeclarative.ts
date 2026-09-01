// LANE E1bc (E1 gate decision §F item 3 · challenge verdict §G item 3) — THE
// TYPED DETERMINISTIC EVALUATOR over declarative rule-pack documents
// (`DeclarativeRulePackDocumentSchema`, the §DRAFT-RULEFORMAT schema seat).
//
// WHAT THIS IS. The L2 evaluator the ruleformat header promises ("the typed
// deterministic evaluator lives at L2, @pryzm/site-parcel-data
// rulepacks/declarative"): scalar rules + `isInForceOn`, no `any`, no eval,
// byte-deterministic. It resolves ONE (zone, parameter) question at a time and
// answers with the binding value, the losers and WHY, the temporal refusals,
// and the evidence chain — or an honest refusal.
//
// THE FIVE DOCTRINES WIRED HERE, each with its test arm:
//
//  R3 — `validityBasis` is load-bearing (gate decision §B.3/§C R3): a rule
//      whose window is INGESTION-dated must NOT answer a LEGAL point-in-time
//      query as if legal. A `legal-as-of` query surfaces such rules as
//      NOT-ANSWERABLE (first-class, named), never as a confident
//      in-force/not-in-force verdict — that false negative is the exact
//      defect R3 exists to kill. A `current-set` query is a membership claim
//      about the current ingested set (REPORT §K.2's sanction) and both bases
//      answer it.
//
//  R1 rank — precedence is resolved ENGINE-SIDE reading `applicability.rank`
//      (verdict §F.7: rank is a FACT about the rule; no precedence algorithm
//      in the data model; §G item 1b: the DK ladder rides rank, NEVER
//      `inheritsFromZoneCode`). Lower `level` = more specific = wins; a level
//      tie with disagreeing values REFUSES (never pick on a tie — the
//      attribution layer's invariant 1, honoured here); ranks from different
//      schemes are INCOMPARABLE and refuse.
//
//  R1 basis contract — every `basis` reference must resolve to a MINTED
//      entity (the companion contract sentence, entities.ts). In a pack
//      document the minted referent is the document's own `plan` record; a
//      basis ref that resolves to nothing is a HARD refusal naming the
//      dangling ref — the dangling-`geometryRef` defect (gate §B.2) made
//      impossible to reproduce silently.
//
//  Tier-6 guard — `envelopeSolidHeightCap` (e1a-gate-supplement §8.1): a
//      tier-6 (uncertain-missing) height must NEVER become a null-capped
//      envelope solid — that is UNKNOWN drawn as unbounded, the L-616
//      overstatement. The guard refuses with the reason named.
//
//  Fact vocabulary — a condition referencing an undeclared fact refuses
//      (factVocabulary.ts, supplement §3.4). Conditions whose facts ARE
//      declared still refuse with a NAMED seam ('condition-not-evaluable'):
//      the pilot migrates scalar rules only; the constructions migrate with
//      the body dialect tag (verdict §E LATER), and a silently-skipped
//      condition would convert a conditional rule into an unconditional one.
//
// ── EVIDENCE: ADOPTED, NOT RE-MINTED (E1c wire · E1B-GATE-BRIEF §4) ─────────
// The binding decision among reviewable candidates runs through the EXISTING
// attribution layer — `resolveParameter` + `ParameterEvidence`/`Resolution`
// (@pryzm/ordinance-extraction), the layer whose own header says it is
// "deliberately wired to nothing" and waiting for a producer. This evaluator
// is that first producer. The layer's honesty invariant (a citation MUST
// carry the verbatim span a human can review) is honoured, not weakened: a
// migrated rule WITHOUT a curated verbatim span (`rase.requirement`) cannot
// inhabit `ParameterEvidence` and resolves on the ARTICLE-ADDRESSED path
// instead ('resolved-unattributed'), with the gap named in its chain — never
// a fabricated quote, never a silent downgrade.
//
// PURE + deterministic (C58 §1.1): no I/O, no clock (the query supplies the
// date), no RNG. P8: OTel spans on the exported entry points.

import { trace } from '@opentelemetry/api';
import {
    isInForceOn,
    type DeclarativeRule,
    type DeclarativeRulePackDocument,
    type DeclarativeZone,
    type RuleBasisRef,
} from '@pryzm/schemas';
import {
    resolveParameter,
    type EvidenceConfidence,
    type InstrumentRef,
    type LegalStatus,
    type LegalStatusSource,
    type ParameterEvidence,
    type Resolution,
} from '@pryzm/ordinance-extraction';
import { assertKnownFacts, DECLARATIVE_PARAMETER_BY_NAME } from './factVocabulary.js';

const _tracer = trace.getTracer('pryzm.zoning.declarative');

/* ────────────────────────────── query types ─────────────────────────────── */

/** A scalar a declarative rule can state (the non-null leg of `provenance.value`). */
export type DeclarativeScalar = number | string | boolean;

/**
 * The temporal question being asked — the two bases are DIFFERENT QUESTIONS
 * (gate §B.3), and the evaluator never lets one answer the other:
 *   - `legal-as-of`  — "was this rule legally in force on `date`?" Only
 *                      `validityBasis: 'legal'` windows can answer it (R3).
 *   - `current-set`  — "is this rule in the current resolved set as of
 *                      `date`?" Both validity bases answer (REPORT §K.2).
 */
export type DeclarativeTemporalQuery =
    | { readonly basis: 'legal-as-of'; readonly date: string }
    | { readonly basis: 'current-set'; readonly date: string };

/**
 * Country/instrument semantics supplied AS DATA by the pack's own data module
 * (the §9 adapter-boundary rule: instrument status is country knowledge, so
 * it rides beside the pack, never inside generic evaluator code). The shapes
 * are the attribution layer's own.
 */
export interface DeclarativeInstrumentContext {
    readonly instrument: InstrumentRef;
    readonly legalStatus: LegalStatus;
    readonly legalStatusSource: LegalStatusSource;
    /** WHERE the status claim comes from — a citation, not a rationale. */
    readonly citation: string;
}

/* ───────────────────────────── outcome types ────────────────────────────── */

/** One R3 temporal refusal — surfaced, never silently dropped. */
export interface TemporalRefusal {
    readonly ruleId: string;
    readonly validityBasis: 'ingestion';
    readonly detail: string;
}

/** One hop of the E1c evidence chain (zone → plan → document → article → rule → …). */
export interface EvidenceChainHop {
    readonly hop:
        | 'zone'
        | 'plan'
        | 'document'
        | 'article'
        | 'rule'
        | 'verbatim'
        | 'calculation'
        | 'value';
    /** The hop's referent, or null when this hop is honestly absent. */
    readonly ref: string | null;
    readonly detail: string;
}
export type EvidenceChain = readonly EvidenceChainHop[];

/** A rank-precedence rejection (engine-side R1 rank read). */
export interface RankRejection {
    readonly ruleId: string;
    readonly detail: string;
}

/** The binding answer for one (zone, parameter) under one temporal query. */
export type DeclarativeParameterOutcome =
    /** Full E1c wire: the attribution layer resolved among verbatim-reviewable candidates. */
    | {
          readonly kind: 'attributed';
          readonly resolution: Resolution<DeclarativeScalar>;
          readonly winningRuleId: string | null;
          readonly rankRejected: readonly RankRejection[];
          readonly chain: EvidenceChain | null;
      }
    /**
     * Article-addressed resolution: the value binds and its chain reaches the
     * article, but no curated verbatim span exists, so the attribution
     * layer's citation invariant cannot be inhabited. The gap is NAMED — it
     * is authoring debt, not schema debt.
     */
    | {
          readonly kind: 'resolved-unattributed';
          readonly value: DeclarativeScalar;
          readonly winningRuleId: string;
          readonly corroboratedBy: readonly string[];
          readonly rankRejected: readonly RankRejection[];
          readonly gap: 'no-verbatim-span-curated';
          readonly chain: EvidenceChain;
      }
    /** The only in-force answer is tier-6 UNKNOWN — a first-class answer, never 0/no-limit. */
    | { readonly kind: 'unknown-tier6'; readonly ruleIds: readonly string[]; readonly detail: string }
    /** R3: every in-window candidate is ingestion-dated and the query is legal point-in-time. */
    | { readonly kind: 'not-answerable-temporal'; readonly refusals: readonly TemporalRefusal[] }
    /** Candidates exist but none is in force on the query date (a real negative). */
    | { readonly kind: 'not-in-force'; readonly ruleIds: readonly string[] }
    /** R1 rank could not pick and refused — tie or incomparable ladders. Never a guess. */
    | {
          readonly kind: 'conflicted-rank';
          readonly reason: 'rank-tie' | 'rank-incomparable';
          readonly ruleIds: readonly string[];
          readonly detail: string;
      }
    /** R1 companion contract violated: a basis ref resolves to no minted entity. HARD refusal. */
    | {
          readonly kind: 'dangling-basis';
          readonly ruleId: string;
          readonly dangling: readonly RuleBasisRef[];
          readonly detail: string;
      }
    /** A condition references an undeclared fact — the two-spellings defect, refused loudly. */
    | {
          readonly kind: 'unknown-fact';
          readonly ruleId: string;
          readonly unknownFacts: readonly string[];
          readonly detail: string;
      }
    /** Condition facts are declared but condition evaluation is a later, named seam. */
    | { readonly kind: 'condition-not-evaluable'; readonly ruleId: string; readonly detail: string }
    /** No rule states this parameter — the honest absence (ruleformat.ts: loads as C58 null). */
    | { readonly kind: 'no-rule' };

/** The full evaluation record for one (zone, parameter): answer + surfaced refusals. */
export interface DeclarativeParameterEvaluation {
    readonly zoneCode: string;
    readonly parameter: string;
    readonly outcome: DeclarativeParameterOutcome;
    /** R3 refusals — ALWAYS surfaced beside the outcome, even when another rule answered. */
    readonly notAnswerableTemporal: readonly TemporalRefusal[];
    /** Rules honestly out of window on the query date. */
    readonly notInForce: readonly string[];
    /** Tier-6 siblings set aside because a valued rule answered. */
    readonly tier6SetAside: readonly string[];
}

/* ─────────────────────────── internal helpers ───────────────────────────── */

/** Float-tolerant sameness (mirrors the attribution layer's default). */
function sameScalar(a: DeclarativeScalar, b: DeclarativeScalar): boolean {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
    return Object.is(a, b);
}

/**
 * READ/ATTRIBUTION certainty projection for the attribution wire — the
 * evaluator's documented mapping from the E1a derivation axis onto the
 * layer's `EvidenceConfidence` (a READ-certainty axis, NOT the six tiers):
 * a recorded human validation or a direct machine-attribute read is a 'high'
 * -certainty READ; a deterministic derivation or an AI extraction is 'medium'
 * (dual-pass unverified). Tier-6 rules never reach this mapping (filtered as
 * carrying no value).
 */
function readConfidenceOf(rule: DeclarativeRule): EvidenceConfidence {
    switch (rule.provenance.derivation) {
        case 'HUMAN_VALIDATED':
        case 'DIRECT':
            return 'high';
        case 'DERIVED':
        case 'AI_EXTRACTED':
            return 'medium';
    }
}

/** Find the zone (and its pack index) across the document's packs; refuse ambiguity. */
function findZone(
    doc: DeclarativeRulePackDocument,
    zoneCode: string,
): { readonly zone: DeclarativeZone; readonly packIndex: number } | null {
    let found: { zone: DeclarativeZone; packIndex: number } | null = null;
    doc.packs.forEach((pack, packIndex) => {
        for (const zone of pack.zones) {
            if (zone.code !== zoneCode) continue;
            if (found) {
                throw new Error(
                    `[declarative] zone code "${zoneCode}" is claimed by two packs in one ` +
                        'document — an ambiguity is refused, never resolved (registry doctrine).',
                );
            }
            found = { zone, packIndex };
        }
    });
    return found;
}

/**
 * Gather the candidate rules for one parameter — own rules first; where the
 * zone states NONE for this parameter and names `inheritsFromZoneCode`, the
 * base zone's rules for it (§DEC-2 spread semantics: an absent parameter
 * inherits, a present one overrides WHOLLY). ⚠ This is zone-supplement
 * inheritance (13E-over-13a), NOT layer precedence — precedence rides R1
 * `rank` (verdict §G item 1b).
 */
function candidateRules(
    doc: DeclarativeRulePackDocument,
    zone: DeclarativeZone,
    parameter: string,
): readonly DeclarativeRule[] {
    const own = zone.rules.filter((r) => r.provenance.parameter === parameter);
    if (own.length > 0 || zone.inheritsFromZoneCode === null) return own;
    const base = findZone(doc, zone.inheritsFromZoneCode);
    if (!base) {
        throw new Error(
            `[declarative] zone "${zone.code}" inherits from "${zone.inheritsFromZoneCode}" ` +
                'which no pack in this document declares — a dangling inheritance is a ' +
                'document-authoring error, refused loudly.',
        );
    }
    if (base.zone.inheritsFromZoneCode !== null) {
        throw new Error(
            `[declarative] inheritance chain deeper than one level (${zone.code} → ` +
                `${zone.inheritsFromZoneCode} → ${base.zone.inheritsFromZoneCode}) — not supported, ` +
                'refused (no shipped pack needs it; §DEC-2 is a single supplement).',
        );
    }
    return base.zone.rules.filter((r) => r.provenance.parameter === parameter);
}

/** R1 companion contract: resolve every basis ref against the document's minted entities. */
function danglingBasisRefs(
    doc: DeclarativeRulePackDocument,
    rule: DeclarativeRule,
): readonly RuleBasisRef[] {
    return rule.applicability.basis.filter((b) => {
        if (b.kind === 'plan') return b.ref !== doc.plan.id;
        // A pack document mints exactly ONE entity (its plan). Any other kind
        // cannot resolve here and must not be cited by a pack rule.
        return true;
    });
}

/** Build the E1c evidence chain for one winning rule. */
function buildChain(
    doc: DeclarativeRulePackDocument,
    zoneCode: string,
    rule: DeclarativeRule,
): EvidenceChain {
    const src = rule.provenance.source;
    const spec = DECLARATIVE_PARAMETER_BY_NAME.get(rule.provenance.parameter);
    const planRef = rule.applicability.basis.find((b) => b.kind === 'plan');
    const verbatim = rule.rase?.requirement ?? null;
    return [
        { hop: 'zone', ref: zoneCode, detail: 'the zone the rule set was resolved for' },
        {
            hop: 'plan',
            ref: planRef ? planRef.ref : null,
            detail: planRef
                ? `applicability.basis plan ref, resolved against the minted plan "${doc.plan.id}" ` +
                  `(kind ${doc.plan.kind}, status ${doc.plan.status})`
                : 'no plan basis on this rule',
        },
        {
            hop: 'document',
            ref: src.document,
            detail: src.document
                ? 'RuleSourceRef.document — the committed source document'
                : 'source serves no document hop',
        },
        {
            hop: 'article',
            ref: src.article,
            detail: src.article ? 'RuleSourceRef.article' : 'source serves no article hop',
        },
        { hop: 'rule', ref: rule.id, detail: `parameter ${rule.provenance.parameter}` },
        {
            hop: 'verbatim',
            ref: verbatim,
            detail: verbatim
                ? 'rase.requirement — the verbatim span a human reviews against the document'
                : 'no-verbatim-span-curated: the value is a coordinate-read table-cell ' +
                  'transcription (L-590/L-591); no verbatim requirement clause is held, and a ' +
                  'paraphrase is never substituted (attribution-layer honesty invariant)',
        },
        {
            hop: 'calculation',
            ref: spec?.c58Calculation ?? 'verbatim-scalar',
            detail:
                rule.provenance.derivation === 'DERIVED'
                    ? `derivation DERIVED — ${rule.provenance.confidence.note ?? 'see rule note'}`
                    : 'deterministic load-time step (parameterVocabulary c58Calculation)',
        },
        {
            hop: 'value',
            ref: rule.provenance.value === null ? null : String(rule.provenance.value),
            detail: `unit ${rule.provenance.unit ?? '(dimensionless)'}`,
        },
    ];
}

/* ────────────────────────────── the evaluator ───────────────────────────── */

/**
 * Evaluate one (zone, parameter) question under one temporal query.
 * Deterministic; throws only on document-authoring errors (ambiguous zone
 * code, dangling inheritance) — every per-rule defect is a typed refusal.
 */
export function evaluateZoneParameter(
    doc: DeclarativeRulePackDocument,
    zoneCode: string,
    parameter: string,
    query: DeclarativeTemporalQuery,
    ctx: DeclarativeInstrumentContext,
): DeclarativeParameterEvaluation {
    const span = _tracer.startSpan('pryzm.zoning.declarative.evaluateZoneParameter');
    try {
        span.setAttribute('pryzm.zone', zoneCode);
        span.setAttribute('pryzm.parameter', parameter);
        span.setAttribute('pryzm.temporalBasis', query.basis);

        const found = findZone(doc, zoneCode);
        const base = { zoneCode, parameter } as const;
        if (!found) {
            return {
                ...base,
                outcome: { kind: 'no-rule' },
                notAnswerableTemporal: [],
                notInForce: [],
                tier6SetAside: [],
            };
        }
        const candidates = candidateRules(doc, found.zone, parameter);
        if (candidates.length === 0) {
            return {
                ...base,
                outcome: { kind: 'no-rule' },
                notAnswerableTemporal: [],
                notInForce: [],
                tier6SetAside: [],
            };
        }

        // ── temporal split (R3) ─────────────────────────────────────────────
        const notAnswerableTemporal: TemporalRefusal[] = [];
        const notInForce: string[] = [];
        const inForce: DeclarativeRule[] = [];
        for (const rule of candidates) {
            const p = rule.provenance;
            if (query.basis === 'legal-as-of' && p.validityBasis === 'ingestion') {
                // R3: an ingestion window CANNOT answer a legal point-in-time
                // question — neither "in force" nor "not in force". Surfaced,
                // never dropped, never verdict-ed (gate §B.3).
                notAnswerableTemporal.push({
                    ruleId: rule.id,
                    validityBasis: 'ingestion',
                    detail:
                        `rule ${rule.id}: validityBasis 'ingestion' — its window is an ` +
                        'ingestion-versioning claim (REPORT §K.2), not a legal validity axis; ' +
                        `it cannot answer "was this in force on ${query.date}" (R3, gate §B.3)`,
                });
                continue;
            }
            if (isInForceOn(p.valid_from, p.valid_to, query.date)) inForce.push(rule);
            else notInForce.push(rule.id);
        }
        const surfaced = { notAnswerableTemporal, notInForce } as const;
        if (inForce.length === 0) {
            if (notAnswerableTemporal.length > 0) {
                return {
                    ...base,
                    outcome: { kind: 'not-answerable-temporal', refusals: notAnswerableTemporal },
                    ...surfaced,
                    tier6SetAside: [],
                };
            }
            return {
                ...base,
                outcome: { kind: 'not-in-force', ruleIds: candidates.map((r) => r.id) },
                ...surfaced,
                tier6SetAside: [],
            };
        }

        // ── R1 companion contract: no dangling basis refs ───────────────────
        for (const rule of inForce) {
            const dangling = danglingBasisRefs(doc, rule);
            if (dangling.length > 0) {
                return {
                    ...base,
                    outcome: {
                        kind: 'dangling-basis',
                        ruleId: rule.id,
                        dangling,
                        detail:
                            `rule ${rule.id} cites ${dangling
                                .map((d) => `{kind:${d.kind}, ref:${d.ref}}`)
                                .join(', ')} which resolve(s) to NO minted entity in this ` +
                            `document (its one minted referent is plan "${doc.plan.id}") — the R1 ` +
                            'companion contract (entities.ts): every basis reference MUST resolve ' +
                            'to a minted entity (gate §B.2, the dangling-geometryRef defect)',
                    },
                    ...surfaced,
                    tier6SetAside: [],
                };
            }
        }

        // ── condition gate (fact vocabulary) ────────────────────────────────
        for (const rule of inForce) {
            const condition = rule.applicability.condition;
            if (condition === null) continue;
            const verdict = assertKnownFacts(condition);
            if (!verdict.ok) {
                return {
                    ...base,
                    outcome: {
                        kind: 'unknown-fact',
                        ruleId: rule.id,
                        unknownFacts: verdict.unknown,
                        detail: verdict.detail,
                    },
                    ...surfaced,
                    tier6SetAside: [],
                };
            }
            return {
                ...base,
                outcome: {
                    kind: 'condition-not-evaluable',
                    ruleId: rule.id,
                    detail:
                        `rule ${rule.id} carries a condition over declared fact(s) ` +
                        `${verdict.vars.join(', ')} — condition evaluation is the constructions ` +
                        'migration (body dialect tag, verdict §E LATER), not this lane; refusing ' +
                        'is mandatory because silently ignoring a condition converts a ' +
                        'conditional rule into an unconditional one (ruleformat.ts RASE doctrine)',
                },
                ...surfaced,
                tier6SetAside: [],
            };
        }

        // ── tier-6 split: UNKNOWN is an answer, not a candidate value ───────
        const valued = inForce.filter((r) => r.provenance.value !== null);
        const tier6 = inForce.filter((r) => r.provenance.value === null);
        if (valued.length === 0) {
            return {
                ...base,
                outcome: {
                    kind: 'unknown-tier6',
                    ruleIds: tier6.map((r) => r.id),
                    detail:
                        'every in-force rule for this parameter is tier-6 uncertain-missing — ' +
                        'UNKNOWN is the answer; it is never 0 and never no-limit (REPORT §I, L-616)',
                },
                ...surfaced,
                tier6SetAside: [],
            };
        }
        const tier6SetAside = tier6.map((r) => r.id);

        // ── R1 rank precedence, engine-side ─────────────────────────────────
        const allSame = valued.every((r) =>
            sameScalar(
                r.provenance.value as DeclarativeScalar,
                valued[0]!.provenance.value as DeclarativeScalar,
            ),
        );
        let survivors = valued;
        const rankRejected: RankRejection[] = [];
        if (valued.length > 1 && !allSame) {
            const ranks = valued.map((r) => r.applicability.rank);
            const schemes = new Set(ranks.map((r) => (r === null ? '(none)' : r.scheme)));
            if (ranks.some((r) => r === null) || schemes.size > 1) {
                return {
                    ...base,
                    outcome: {
                        kind: 'conflicted-rank',
                        reason: 'rank-incomparable',
                        ruleIds: valued.map((r) => r.id),
                        detail:
                            'disagreeing values whose ranks are missing or from different ' +
                            `ladders (schemes: ${[...schemes].join(', ')}) — ranks from ` +
                            'different schemes carry no comparison; refusing, never guessing ' +
                            '(verdict §F.7)',
                    },
                    ...surfaced,
                    tier6SetAside,
                };
            }
            const minLevel = Math.min(...valued.map((r) => r.applicability.rank!.level));
            survivors = valued.filter((r) => r.applicability.rank!.level === minLevel);
            for (const loser of valued) {
                if (loser.applicability.rank!.level !== minLevel) {
                    rankRejected.push({
                        ruleId: loser.id,
                        detail:
                            `outranked: level ${loser.applicability.rank!.level} loses to level ` +
                            `${minLevel} on ladder "${loser.applicability.rank!.scheme}" ` +
                            '(1 = most specific; resolution engine-side per verdict §F.7)',
                    });
                }
            }
            const survivorsSame = survivors.every((r) =>
                sameScalar(
                    r.provenance.value as DeclarativeScalar,
                    survivors[0]!.provenance.value as DeclarativeScalar,
                ),
            );
            if (!survivorsSame) {
                return {
                    ...base,
                    outcome: {
                        kind: 'conflicted-rank',
                        reason: 'rank-tie',
                        ruleIds: survivors.map((r) => r.id),
                        detail:
                            `≥2 rules tie at level ${minLevel} on ladder ` +
                            `"${survivors[0]!.applicability.rank!.scheme}" and state different ` +
                            'values — never pick on a tie (attribution invariant 1)',
                    },
                    ...surfaced,
                    tier6SetAside,
                };
            }
        }

        // ── binding decision: the EXISTING attribution layer where reviewable ─
        const everyReviewable = survivors.every((r) => r.rase?.requirement);
        if (everyReviewable) {
            const evidences: ParameterEvidence<DeclarativeScalar>[] = survivors.map((rule) => {
                const p = rule.provenance;
                const note = p.confidence.note;
                return {
                    parameter,
                    value: p.value as DeclarativeScalar,
                    ...(p.unit !== null ? { unit: p.unit } : {}),
                    instrument: ctx.instrument,
                    legalStatus: ctx.legalStatus,
                    legalStatusSource: ctx.legalStatusSource,
                    ruleKind: 'numeric',
                    citation: {
                        document: p.source.document ?? p.source.dataset,
                        ...(p.source.article !== null ? { article: p.source.article } : {}),
                        ...(p.source.page !== null ? { page: p.source.page } : {}),
                        verbatim: rule.rase!.requirement,
                    },
                    confidence: readConfidenceOf(rule),
                    ...(note !== undefined ? { note } : {}),
                };
            });
            const resolution = resolveParameter<DeclarativeScalar>(evidences);
            const winner = survivors[0] ?? null;
            return {
                ...base,
                outcome: {
                    kind: 'attributed',
                    resolution,
                    winningRuleId: resolution.status === 'resolved' && winner ? winner.id : null,
                    rankRejected,
                    chain:
                        resolution.status === 'resolved' && winner
                            ? buildChain(doc, zoneCode, winner)
                            : null,
                },
                ...surfaced,
                tier6SetAside,
            };
        }

        // Article-addressed path: value binds, gap named, chain still walked.
        const winner = survivors[0]!;
        return {
            ...base,
            outcome: {
                kind: 'resolved-unattributed',
                value: winner.provenance.value as DeclarativeScalar,
                winningRuleId: winner.id,
                corroboratedBy: survivors.slice(1).map((r) => r.id),
                rankRejected,
                gap: 'no-verbatim-span-curated',
                chain: buildChain(doc, zoneCode, winner),
            },
            ...surfaced,
            tier6SetAside,
        };
    } finally {
        span.end();
    }
}

/* ─────────────────────────── the chain walker ───────────────────────────── */

export type ChainWalkVerdict =
    | { readonly ok: true; readonly gaps: readonly string[] }
    | { readonly ok: false; readonly missingHop: string; readonly detail: string };

/**
 * Walk an evidence chain (E1c acceptance: "severing the wiring → the test
 * fails naming the missing hop"). REQUIRED hops: zone, plan, document,
 * article, rule, value — a chain missing one cannot answer "why is max height
 * X?" from stored evidence and FAILS naming the hop. `verbatim` may be
 * honestly absent (named as a gap, not a failure — authoring debt).
 */
export function walkEvidenceChain(chain: EvidenceChain): ChainWalkVerdict {
    const span = _tracer.startSpan('pryzm.zoning.declarative.walkEvidenceChain');
    try {
        const required: ReadonlyArray<EvidenceChainHop['hop']> = [
            'zone',
            'plan',
            'document',
            'article',
            'rule',
            'value',
        ];
        for (const hop of required) {
            const entry = chain.find((h) => h.hop === hop);
            if (!entry || entry.ref === null) {
                return {
                    ok: false,
                    missingHop: hop,
                    detail: entry
                        ? `hop "${hop}" is present but unresolved (ref null): ${entry.detail}`
                        : `hop "${hop}" is absent from the chain entirely`,
                };
            }
        }
        const gaps = chain
            .filter((h) => h.ref === null)
            .map((h) => `${h.hop}: ${h.detail}`);
        return { ok: true, gaps };
    } finally {
        span.end();
    }
}

/* ─────────────────────── the tier-6 envelope guard ──────────────────────── */

export type EnvelopeSolidHeightCapVerdict =
    | { readonly ok: true; readonly maxHeightM: number }
    | {
          readonly ok: false;
          readonly refusal: 'tier6-unknown-height' | 'no-resolved-height';
          readonly detail: string;
      };

/**
 * The tier-6 envelope guard (e1a-gate-supplement §8.1, gate decision §B
 * structural note) — the EVALUATOR-SIDE invariant standing in front of
 * `SiteIntelEnvelopeSolid.maxHeightM`: **no null-capped solids from tier-6
 * rules.** A tier-6 (uncertain-missing) height answer must never flow into a
 * solid as `maxHeightM: null`, because on the solid null means "geometrically
 * determined but NO PUBLISHED vertical limit" — a POSITIVE claim — and an
 * UNKNOWN drawn as unbounded is the L-616 overstatement, one dereference away
 * from a renderer.
 */
export function envelopeSolidHeightCap(
    evaluation: DeclarativeParameterEvaluation,
): EnvelopeSolidHeightCapVerdict {
    const span = _tracer.startSpan('pryzm.zoning.declarative.envelopeSolidHeightCap');
    try {
        const o = evaluation.outcome;
        if (o.kind === 'unknown-tier6') {
            return {
                ok: false,
                refusal: 'tier6-unknown-height',
                detail:
                    'the height answer is tier-6 uncertain-missing — a solid built from it may ' +
                    'NOT carry maxHeightM: null ("no published limit" is a positive claim the ' +
                    'evidence does not make); refusing prevents UNKNOWN being drawn as unbounded ' +
                    '(e1a-gate-supplement §8.1, L-616)',
            };
        }
        if (o.kind === 'attributed' && o.resolution.status === 'resolved') {
            const v = o.resolution.value;
            if (typeof v === 'number') return { ok: true, maxHeightM: v };
        }
        if (o.kind === 'resolved-unattributed' && typeof o.value === 'number') {
            return { ok: true, maxHeightM: o.value };
        }
        return {
            ok: false,
            refusal: 'no-resolved-height',
            detail:
                `no resolved numeric height (outcome kind: ${o.kind}) — a solid cap requires a ` +
                'resolved number; anything else is refused, never defaulted',
        };
    } finally {
        span.end();
    }
}
