// §NL-VOORRANGSREGELS (lane ENVELOPE-NLDK, round 3, 2026-09-04) — precedence applied BEFORE answering.
// Founder review §1 (the #1 move), §9.2 (ontwerpregelingen as a forward view), §10 row 2; deep audit
// Gap 1 (applicability ≠ intersection) and §7 (temporal state is P0).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE MECHANISM THIS MODULE ENCODES
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Since 2024-01-01 the omgevingsplan's TIJDELIJK DEEL (bestemmingsplannen + bruidsschat) can only
// lapse as a whole, so the ONLY legal way a gemeente changes anything in it is by adopting
// VOORRANGSREGELS — rules in a wijzigingsbesluit that take precedence over the older rules. The
// regeling is the PRODUCT of the tijdelijk deel and ALL successive wijzigingsbesluiten. PRYZM reads
// the tijdelijk deel; the overrides live in the wijzigingsbesluiten. Until they are applied, every
// legally-grounded NL answer is a CORRECTNESS RISK ("as at the tijdelijk deel, overrides not
// checked" — `nlRegelingIdentity.ts` carries that state). This module is the operation that clears it.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHAT THE INPUT IS — AND IS NOT (deep audit Gap 1)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A voorrangsregel arrives here with an `applicability` verdict that is the OUTPUT of the applicability
// engine: location + activity + subject + rule scope + authority + effective date + exceptions. It is
// NEVER a raw "the parcel intersects the besluit's geometry": a wijzigingsbesluit can add a rule for
// one activity (bijbehorende bouwwerken, say) that touches nothing else on the same land. So the field
// is a closed three-state, and `not-evaluated` is honoured — a besluit whose applicability was not
// evaluated leaves precedence UNCHECKED, because "none apply" cannot be declared over a besluit nobody
// looked at. Collapsing `not-evaluated` into `does-not-apply` is how a correctness risk is laundered
// into a clean answer.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// TEMPORAL STATE (deep audit §7) — the question is "what was applicable at the TARGET DATE?"
// ══════════════════════════════════════════════════════════════════════════════════════════════
// A voorrangsregel in force AFTER the target date does not bind — it is a PENDING change, and the
// founder's §9.2 point is that a parcel whose governing rule is about to change is a materially
// different product answer from one that is stable. So pending besluiten are returned, never dropped
// and never applied. Among the in-force applicable besluiten the LATEST inWerkingOp wins (lex
// posterior: each wijzigingsbesluit is itself a later expression of the same regeling). Two applicable
// besluiten in force on the SAME day with different content is a CONFLICT this module refuses to
// resolve — it names both and hands the rule back as `unrecovered`/`semantic`, mechanism present.
//
// WHAT IS NOT HERE, BY NAME: reading the wijzigingsbesluiten themselves. That is a DSO/Ozon read
// (Presenteren v8 `/besluitversies`, key-gated, HTTP 401 anonymously 2026-09-04) and belongs to the
// adapter; this module is pure and consumes the transcription. Dates are ISO `YYYY-MM-DD` and compare
// lexicographically, so the module holds no clock (C58 §1.9).
//
// PURE (C58 §1.9). Deterministic (C58 §1.1). Emits the shared `RuleState` vocabulary against **B5**
// (site-specific override flag) and composes with `stampNlPrecedence` rather than re-deriving it.

import type { EnvelopeParameterKey, RuleState } from '@pryzm/schemas';
import {
    parseNlAknIdentifier,
    stampNlPrecedence,
    type NlPrecedenceCheck,
    type NlRegelingRef,
    type NlRuleStateWithPrecedence,
} from './nlRegelingIdentity.js';

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Inputs
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The applicability engine's verdict for ONE voorrangsregel at ONE parcel. Three states, never a
 * boolean: `not-evaluated` is a fact about US and blocks a "none apply" declaration.
 */
export type NlApplicability = 'applies' | 'does-not-apply' | 'not-evaluated';

/** One voorrangsregel, transcribed from a wijzigingsbesluit into the shared vocabulary. */
export interface NlVoorrangsregel {
    /** The besluit's AKN expression id (or the regeling version it produced). The citable object. */
    readonly besluitId: string;
    /** ISO `YYYY-MM-DD` on which the besluit became juridisch geldig (Presenteren: `inWerkingOp`). */
    readonly inWerkingOp: string;
    /** The envelope parameter this voorrangsregel speaks to. */
    readonly rule: EnvelopeParameterKey;
    /** Applicability engine output — location + activity + subject + scope + authority + exceptions. */
    readonly applicability: NlApplicability;
    /** What the voorrangsregel STATES for this rule here — already in the shared vocabulary. */
    readonly override: RuleState;
    /** The activity/subject scope of the regel, quoted. Never used to decide; carried for the reader. */
    readonly scopeVerbatim?: string | null;
}

/**
 * The wijzigingsbesluiten read for one gemeente. `null` at the call site means NOT READ — the
 * honest state of every NL answer today — and is a different fact from an empty `regels`.
 */
export interface NlWijzigingsbesluitenRead {
    readonly source: 'dso-presenteren-v8' | 'lvbb-publication' | 'manual-transcription';
    /** ISO date-time the read was performed. */
    readonly readAt: string;
    readonly gemeenteCode: string | null;
    /** AKN WORK of the gemeente's omgevingsplan (`/akn/nl/act/gm0363/2024/omgevingsplan`), if known. */
    readonly regelingWork: string | null;
    readonly regels: readonly NlVoorrangsregel[];
    /**
     * TRUE only when every besluitversie of the regeling since 2024-01-01 was enumerated. A PARTIAL
     * read (a page cut short, a besluit that would not download) cannot support "none apply" and is
     * reported as `overrides-not-checked` with the reason — not as a clean answer.
     */
    readonly complete: boolean;
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Output
// ──────────────────────────────────────────────────────────────────────────────────────────────

export interface NlVoorrangResolution {
    /** The rule state that BINDS at the target date after precedence. */
    readonly operative: RuleState;
    readonly precedence: NlPrecedenceCheck;
    /** The besluit whose voorrangsregel was applied, or null. */
    readonly appliedBesluit: string | null;
    /** States that were displaced: the tijdelijk-deel reading and any earlier in-force overrides. */
    readonly superseded: readonly RuleState[];
    /** Applicable voorrangsregels in force AFTER the target date — the forward view (§9.2). */
    readonly pending: readonly NlVoorrangsregel[];
    /** Besluit ids for this rule whose applicability was NOT evaluated (in force at the target date). */
    readonly unevaluated: readonly string[];
    /** Same-day applicable overrides with different content; null when there is no conflict. */
    readonly conflict: readonly string[] | null;
    /** One paragraph a reviewer reads. Never a bare status word. */
    readonly why: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const isIsoDate = (s: unknown): s is string => typeof s === 'string' && ISO_DATE_RE.test(s);

/** Structural equality of two rule states — the conflict test. Order-insensitive on keys. */
function sameContent(a: RuleState, b: RuleState): boolean {
    return canonical(a) === canonical(b);
}
function canonical(v: unknown): string {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
    const o = v as Record<string, unknown>;
    return '{' + Object.keys(o).sort().map((k) => JSON.stringify(k) + ':' + canonical(o[k])).join(',') + '}';
}

/**
 * Apply the voorrangsregels to one tijdelijk-deel rule state at one parcel for one target date.
 * Pure and total.
 *
 * BRANCH ORDER IS LEGAL, NOT COSMETIC:
 *   1. not read                         → unchecked; the tijdelijk-deel state stands AT RISK.
 *   2. target date malformed            → unchecked (a precedence question without a date is not a question).
 *   3. any in-force besluit for this rule whose applicability was not evaluated → unchecked, ids named.
 *   4. no applicable in-force besluit   → checked-none-apply IF the read was complete, else unchecked.
 *   5. one latest in-force besluit      → checked-applied; its override is operative.
 *   6. several latest on the SAME day, differing → checked, but the operative state is a named CONFLICT.
 */
export function applyNlVoorrang(opts: {
    readonly tijdelijkDeel: RuleState;
    readonly read: NlWijzigingsbesluitenRead | null;
    /** ISO `YYYY-MM-DD` — the date the answer is FOR. */
    readonly targetDate: string;
}): NlVoorrangResolution {
    const base = opts.tijdelijkDeel;
    const read = opts.read;

    if (read === null) {
        return {
            operative: base,
            precedence: 'overrides-not-checked',
            appliedBesluit: null,
            superseded: [],
            pending: [],
            unevaluated: [],
            conflict: null,
            why:
                `rule ${base.rule}: the wijzigingsbesluiten of the gemeente's omgevingsplan were NOT read, so ` +
                'no voorrangsregel could be applied. The tijdelijk-deel reading stands, as at the tijdelijk deel, ' +
                'overrides not checked — a correctness risk, not a clean answer.',
        };
    }
    if (!isIsoDate(opts.targetDate)) {
        return {
            operative: base,
            precedence: 'overrides-not-checked',
            appliedBesluit: null,
            superseded: [],
            pending: [],
            unevaluated: [],
            conflict: null,
            why:
                `rule ${base.rule}: the target date "${String(opts.targetDate)}" is not an ISO YYYY-MM-DD date, so ` +
                '"what was applicable at the target date" cannot be asked; precedence stays unchecked.',
        };
    }

    const forRule = read.regels.filter((r) => r.rule === base.rule);
    const malformed = forRule.filter((r) => !isIsoDate(r.inWerkingOp));
    const dated = forRule.filter((r) => isIsoDate(r.inWerkingOp));
    const inForce = dated.filter((r) => r.inWerkingOp <= opts.targetDate);
    const pending = Object.freeze(dated.filter((r) => r.inWerkingOp > opts.targetDate && r.applicability === 'applies'));

    // A besluit with a malformed date cannot be placed on the time axis: it is treated as unevaluated,
    // because we cannot say it is NOT in force.
    const unevaluated = Object.freeze([
        ...inForce.filter((r) => r.applicability === 'not-evaluated').map((r) => r.besluitId),
        ...malformed.map((r) => r.besluitId),
    ]);
    if (unevaluated.length > 0) {
        return {
            operative: base,
            precedence: 'overrides-not-checked',
            appliedBesluit: null,
            superseded: [],
            pending,
            unevaluated,
            conflict: null,
            why:
                `rule ${base.rule}: ${unevaluated.length} wijzigingsbesluit(en) in force at ${opts.targetDate} speak to this ` +
                `rule and their applicability at this parcel was not evaluated (${unevaluated.join(', ')}). "None apply" ` +
                'cannot be declared over a besluit nobody looked at; the tijdelijk-deel reading stands, overrides not checked.',
        };
    }

    const applicable = inForce.filter((r) => r.applicability === 'applies');
    if (applicable.length === 0) {
        if (!read.complete) {
            return {
                operative: base,
                precedence: 'overrides-not-checked',
                appliedBesluit: null,
                superseded: [],
                pending,
                unevaluated,
                conflict: null,
                why:
                    `rule ${base.rule}: no applicable voorrangsregel was found among the besluiten read, but the read of ` +
                    `${read.regelingWork ?? 'the regeling'} (${read.source}, ${read.readAt}) is marked INCOMPLETE — a ` +
                    'besluit not enumerated may still override. Overrides not checked.',
            };
        }
        return {
            operative: base,
            precedence: 'overrides-checked-none-apply',
            appliedBesluit: null,
            superseded: [],
            pending,
            unevaluated,
            conflict: null,
            why:
                `rule ${base.rule}: the wijzigingsbesluiten of ${read.regelingWork ?? 'the regeling'} were read completely ` +
                `(${read.source}, ${read.readAt}); ${forRule.length} speak to this rule, none applies at this parcel at ` +
                `${opts.targetDate}. The tijdelijk-deel reading is the operative rule` +
                (pending.length > 0 ? ` — ⚠ ${pending.length} applicable besluit(en) enter into force AFTER the target date (pending change).` : '.'),
        };
    }

    // Lex posterior: the latest inWerkingOp wins. Stable sort so same-day order is the input order.
    const sorted = [...applicable].sort((a, b) => (a.inWerkingOp < b.inWerkingOp ? 1 : a.inWerkingOp > b.inWerkingOp ? -1 : 0));
    const latestDate = sorted[0]!.inWerkingOp;
    const latest = sorted.filter((r) => r.inWerkingOp === latestDate);
    const earlier = sorted.filter((r) => r.inWerkingOp !== latestDate);
    const supersededStates = Object.freeze([base, ...earlier.map((r) => r.override)]);

    if (latest.length > 1 && latest.some((r) => !sameContent(r.override, latest[0]!.override))) {
        const ids = Object.freeze(latest.map((r) => r.besluitId));
        return {
            operative: {
                rule: base.rule,
                status: 'unrecovered',
                reachability: 'interpretive',
                failure: 'semantic',
                mechanism: 'present',
                stoppedAt:
                    `conflicting voorrangsregels in force on ${latestDate} for rule ${base.rule} at this parcel: ` +
                    `${ids.join(' vs ')} — same day, different content; precedence between them is not settled by date and ` +
                    'needs a human read of both besluiten',
                partial: null,
                ref: latest[0]!.override.ref,
            },
            precedence: 'overrides-checked-applied',
            appliedBesluit: null,
            superseded: supersededStates,
            pending,
            unevaluated,
            conflict: ids,
            why:
                `rule ${base.rule}: ${latest.length} voorrangsregels entered into force on the same day (${latestDate}) and ` +
                'state different things for this parcel. Lex posterior does not separate them; the rule is handed back as ' +
                'unrecovered/semantic with both besluiten named rather than picking one.',
        };
    }

    const winner = latest[0]!;
    return {
        operative: winner.override,
        precedence: 'overrides-checked-applied',
        appliedBesluit: winner.besluitId,
        superseded: supersededStates,
        pending,
        unevaluated,
        conflict: null,
        why:
            `rule ${base.rule}: voorrangsregel ${winner.besluitId} (in force ${winner.inWerkingOp}` +
            (winner.scopeVerbatim ? `; scope "${winner.scopeVerbatim}"` : '') +
            `) applies at this parcel and takes precedence over the tijdelijk-deel reading` +
            (earlier.length > 0 ? ` and ${earlier.length} earlier override(s)` : '') +
            `. Operative state: ${winner.override.status}.` +
            (pending.length > 0 ? ` ⚠ ${pending.length} applicable besluit(en) enter into force after ${opts.targetDate} (pending change).` : ''),
    };
}

/** Apply precedence to a set of tijdelijk-deel states. Order-preserving. Pure. */
export function applyNlVoorrangAll(opts: {
    readonly tijdelijkDeel: readonly RuleState[];
    readonly read: NlWijzigingsbesluitenRead | null;
    readonly targetDate: string;
}): readonly NlVoorrangResolution[] {
    return Object.freeze(opts.tijdelijkDeel.map((s) => applyNlVoorrang({ tijdelijkDeel: s, read: opts.read, targetDate: opts.targetDate })));
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// Composition with the regeling identity (B1) and the precedence stamp
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Build the `NlRegelingRef` that `stampNlPrecedence` needs, from the read and one resolution.
 * `wijzigingsbesluitenConsulted` lists every besluit READ (not only the applied one), because the
 * B1 claim "this regeling version" rests on all of them.
 */
export function nlVoorrangRegelingRef(opts: {
    readonly read: NlWijzigingsbesluitenRead | null;
    readonly planId: string | null;
    readonly resolution: NlVoorrangResolution;
}): NlRegelingRef {
    const read = opts.read;
    const consulted = read === null ? [] : [...new Set(read.regels.map((r) => r.besluitId))];
    return {
        readFrom: opts.resolution.appliedBesluit !== null ? 'dso-lvbb-omgevingsplan' : 'ruimtelijkeplannen-tijdelijk-deel',
        planId: opts.planId,
        akn: read === null ? null : parseNlAknIdentifier(read.regelingWork),
        precedence: opts.resolution.precedence,
        wijzigingsbesluitenConsulted: Object.freeze(consulted),
    };
}

/** The operative state, stamped with its precedence context — the shape every NL consumer should hold. */
export function nlVoorrangStamped(opts: {
    readonly read: NlWijzigingsbesluitenRead | null;
    readonly planId: string | null;
    readonly resolution: NlVoorrangResolution;
}): NlRuleStateWithPrecedence {
    return stampNlPrecedence(opts.resolution.operative, nlVoorrangRegelingRef(opts));
}

// ──────────────────────────────────────────────────────────────────────────────────────────────
// B5 — the site-specific override flag, in the shared vocabulary
// ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Project a resolution onto **B5** (site-specific override flag).
 *
 *   overrides-not-checked         → `unrecovered` / `inaccessible` / mechanism `unknown` — the layer that
 *                                   carries the besluiten exists and was not read (key-gated), which is the
 *                                   ONE retryable label; a key clears it.
 *   checked, none apply           → `resolved`, value names the date and the source.
 *   checked, applied              → `resolved`, value = the besluit id.
 *   checked, conflict             → `unrecovered` / `semantic` / mechanism `present`, both ids named.
 */
export function nlVoorrangToRuleState(r: NlVoorrangResolution, ref: RuleState['ref']): RuleState {
    if (r.precedence === 'overrides-not-checked') {
        return {
            rule: 'B5',
            status: 'unrecovered',
            reachability: 'source-complete',
            failure: 'inaccessible',
            mechanism: 'unknown',
            stoppedAt: r.why,
            partial: null,
            ref,
        };
    }
    if (r.conflict !== null) {
        return {
            rule: 'B5',
            status: 'unrecovered',
            reachability: 'interpretive',
            failure: 'semantic',
            mechanism: 'present',
            stoppedAt: r.why,
            partial: null,
            ref,
        };
    }
    return {
        rule: 'B5',
        status: 'resolved',
        reachability: 'source-complete',
        value: r.appliedBesluit ?? 'no site-specific override — no applicable voorrangsregel in force at the target date',
        unit: null,
        datum: null,
        provenance: 'pipeline-extracted',
        ref,
    };
}
