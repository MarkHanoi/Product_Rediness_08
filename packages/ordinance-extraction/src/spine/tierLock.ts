// @pryzm/ordinance-extraction — THE TIER LOCK.
//
// ⛔ "It must be IMPOSSIBLE for the spine to emit tier 1/2/3." Two independent
// enforcements, because one of them can always be cast away:
//
//   1. TYPE LEVEL — `ExtractionClaimProvenance` (spine/types.ts) narrows
//      `confidence.tier` to the literal `4` and `derivation` to the literal
//      `'AI_EXTRACTED'`. A producer that writes tier 2 does not compile.
//   2. RUNTIME — {@link assertExtractionProvenance} re-parses the record through
//      the **FROZEN L0 `RuleProvenanceSchema`** and then hard-refuses anything but
//      tier 4 + AI_EXTRACTED. That is the door a JSON payload, an `as unknown as`
//      cast or a future caller comes through, and `__tests__/spineTierLock.test.ts`
//      proves it FIRES for tiers 1, 2, 3, 5 and 6 and for every other derivation.
//
// ── WHY `AI_EXTRACTED` EVEN WHEN NO MODEL RAN — stated openly, because it is the
// one place this spine says something slightly stronger than what happened ──────
// The Luzern table path is DETERMINISTIC: page geometry, no model. `RuleDerivation`
// (FROZEN, control 3) has exactly four members — DIRECT / DERIVED / AI_EXTRACTED /
// HUMAN_VALIDATED — and none of them means "a machine READ this out of a document".
// DIRECT means an authoritative machine attribute; DERIVED means computed from
// authoritative inputs. So the choice is between AI_EXTRACTED and a member that
// would claim MORE authority than the read deserves.
//
// AI_EXTRACTED is the CONSERVATIVE choice, not a flattering one: it projects to
// tier 4, which the E1a ladder ranks BELOW tier 2 (authoritative-document-derived)
// and tier 3 (deterministic-inference). Under-claiming is safe; over-claiming is
// the sin. And the frozen schema's own documentation prescribes exactly this:
// "Where two tiers are simultaneously true — an AI-extracted value from an
// authoritative document is both tier-2-shaped and tier-4-shaped — the projection
// takes the EXTRACTION-side tier (4); the source-side information stays
// recoverable from `source.document` + `valueLocation`." (siteintel/confidence.ts)
//
// What actually happened is NOT lost: `ClaimEvidence.method` records
// `table-reconstruction` / `text-grammar` / `ai-span-retrieval` verbatim, and the
// same word is mirrored into `confidence.note`, which travels inside the frozen
// record. **DISCOVERY, recorded and NOT acted on (control 10):** `RuleDerivation`
// has no member for a deterministic machine READ of a document. Adding one is an
// L0 change and this lane REFUSES it — see the lane report §Refusals.

import {
    RuleProvenanceSchema,
    type RuleProvenance,
    type RuleSourceRef,
} from '@pryzm/schemas';
import { type ClaimValidity, type ExtractionClaimProvenance, type ExtractionMethod } from './types.js';

/** The ONLY confidence tier an extraction spine may stamp. */
export const EXTRACTION_TIER = 4 as const;

/** The ONLY derivation an extraction spine may stamp (see the header for why). */
export const EXTRACTION_DERIVATION = 'AI_EXTRACTED' as const;

/** Everything a claim's provenance needs that is not fixed by the lock. */
export interface ExtractionProvenanceInput {
    readonly parameter: string;
    /** The claimed value. `null` is NOT accepted here — an absent value is a `NothingFound`. */
    readonly value: number | string | boolean;
    readonly unit: string | null;
    readonly source: RuleSourceRef;
    readonly validity: ClaimValidity;
    /** The method that actually produced the value — mirrored into `confidence.note`. */
    readonly method: ExtractionMethod;
    /** R5: normative force MIRRORED verbatim from the source, or null. Never harmonised. */
    readonly normativeForce?: string | null;
    /** R2: the value-basis qualifier, carried verbatim as `{scheme, code}`. */
    readonly valueBasis?: { readonly scheme: string; readonly code: string };
    /** Extra caveat text appended to the note (source quirks, reviewer warnings). */
    readonly note?: string;
}

/**
 * Build a claim's provenance. **The only constructor** — nothing else in the spine
 * assembles a `RuleProvenance` literal, so the tier and the derivation have exactly
 * one origin.
 *
 * `valueLocation` is always `'in-document-text'`: everything this spine reads was
 * read out of a document. That is also the pair the frozen schema rejects at tier
 * 1, so the lock is belt-and-braces with L0's own `superRefine`.
 */
export function buildExtractionProvenance(
    input: ExtractionProvenanceInput,
): ExtractionClaimProvenance {
    const methodNote = `extraction method: ${input.method}; validation: UNVALIDATED (not-checked)`;
    const record: RuleProvenance = {
        parameter: input.parameter,
        value: input.value,
        unit: input.unit,
        source: input.source,
        derivation: EXTRACTION_DERIVATION,
        valueLocation: 'in-document-text',
        ...(input.valueBasis !== undefined ? { valueBasis: input.valueBasis } : {}),
        confidence: {
            tier: EXTRACTION_TIER,
            note: input.note === undefined ? methodNote : `${methodNote}; ${input.note}`,
        },
        normativeForce: input.normativeForce ?? null,
        validityBasis: input.validity.basis,
        valid_from: input.validity.from,
        valid_to: input.validity.to,
    };
    return assertExtractionProvenance(record);
}

/** Why a record failed the lock — a closed vocabulary, so a caller can branch. */
export type TierLockViolation =
    | 'not-an-object'
    | 'schema-invalid'
    | 'tier-not-4'
    | 'derivation-not-ai-extracted'
    | 'value-location-not-in-document-text';

/** The lock's verdict, without throwing — for callers that must not crash. */
export interface TierLockResult {
    readonly ok: boolean;
    readonly violations: readonly TierLockViolation[];
    readonly detail: string;
}

/**
 * Check a record against the tier lock. Runs the FROZEN L0 parse FIRST (so a
 * record that is not a valid `RuleProvenance` at all is caught as such), then the
 * spine's two extra hard constraints.
 */
export function checkExtractionProvenance(record: unknown): TierLockResult {
    if (record === null || typeof record !== 'object' || Array.isArray(record)) {
        return {
            ok: false,
            violations: ['not-an-object'],
            detail: 'Provenance must be an object.',
        };
    }
    const parsed = RuleProvenanceSchema.safeParse(record);
    if (!parsed.success) {
        return {
            ok: false,
            violations: ['schema-invalid'],
            detail:
                'Rejected by the FROZEN L0 RuleProvenanceSchema: ' +
                parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | '),
        };
    }
    const rec = parsed.data;
    const violations: TierLockViolation[] = [];
    if (rec.confidence.tier !== EXTRACTION_TIER) violations.push('tier-not-4');
    if (rec.derivation !== EXTRACTION_DERIVATION) violations.push('derivation-not-ai-extracted');
    if (rec.valueLocation !== 'in-document-text') {
        violations.push('value-location-not-in-document-text');
    }
    if (violations.length === 0) {
        return { ok: true, violations, detail: 'Within the extraction tier lock (tier 4, AI_EXTRACTED).' };
    }
    return {
        ok: false,
        violations,
        detail:
            `TIER LOCK BREACH (${violations.join(', ')}): an extraction spine may emit tier ` +
            `${EXTRACTION_TIER} / ${EXTRACTION_DERIVATION} / in-document-text and nothing else. ` +
            `Read: tier ${rec.confidence.tier}, derivation ${rec.derivation}, valueLocation ` +
            `${rec.valueLocation ?? 'undefined'}. Tier 1/2/3 assert authority this pipeline does not ` +
            `have; tier 5 requires a RECORDED human validation event (spec §20 / C58 L-449).`,
    };
}

/**
 * Assert the lock, or THROW.
 *
 * ⚠ This is the ONE place this package throws on purpose, and the reason is worth
 * stating: everything else here answers a question about a DOCUMENT, where a
 * refusal is data. This answers a question about the CODE. A tier-1 record reaching
 * this function means a producer somewhere is claiming authority it does not have —
 * that is not a corpus condition to be reported, it is a defect, and a defect that
 * returns a value keeps shipping.
 */
export function assertExtractionProvenance(record: unknown): ExtractionClaimProvenance {
    const verdict = checkExtractionProvenance(record);
    if (!verdict.ok) throw new Error(`[ordinance-extraction/tier-lock] ${verdict.detail}`);
    return record as ExtractionClaimProvenance;
}
