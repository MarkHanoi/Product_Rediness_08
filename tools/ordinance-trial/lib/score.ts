// E8-TRIAL — the SCORER.
//
// Two arms, because they answer different questions and a single blended number
// would hide the one that matters.
//
//   ARM A — CLAIM SET, at the distinct (field, value) level within a stratum.
//           "Of the numbers this text yields, how many are real and how many are
//           invented?" This is the arm a document-level extractor CAN be scored on.
//
//   ARM B — SLOT, at the (locator, field, value) level.
//           "Can the value be attributed to the zone / sentence it actually
//           governs?" This is the PRODUCT unit — a buildable envelope is computed
//           for ONE parcel — and it is the arm a document-level extractor fails by
//           construction on a table, which is exactly the fact worth measuring.
//
// ⭐ THREE NUMBERS ARE REPORTED SEPARATELY AND NEVER BLENDED (E8-SCOUT §4.4):
// precision, recall, and the OVERSTATEMENT RATE. An extractor that is 95% precise
// and overstates one envelope in twenty on real land is not shippable, and a single
// accuracy figure hides exactly that.

import type { ExtractableField } from '../../../packages/ordinance-extraction/src/types.js';
import type { ExtractedRule } from '../../../packages/ordinance-extraction/src/textExtract/types.js';
import type { GoldRow, StratumId } from '../goldset/types.js';

/** One thing the extractor emitted, reduced to what the scorer compares. */
export interface Prediction {
    readonly field: ExtractableField;
    readonly value: number;
    /** The sentence the rule cited — used by ARM B only. */
    readonly sentence: string;
    readonly matcherId: string;
}

export function toPredictions(rules: readonly ExtractedRule[]): Prediction[] {
    return rules.map((r) => ({
        field: r.field,
        value: r.value,
        sentence: r.citation.sentence,
        matcherId: r.matcherId,
    }));
}

/**
 * ⭐ HOW TO RUN THE **AFTER** (the whole reason this is a harness and not a memo).
 *
 * The scorer is deliberately API-AGNOSTIC: it consumes `Prediction[]`, nothing else.
 * When a new producer lands — the Layer-3 `CanonicalDocument` reader, the
 * `DualPassExtractor`, a CH grammar, a tier-4 `AI_EXTRACTED` claim producer —
 * adapt its output to this shape and re-run. The gold set does not move, so the
 * BEFORE and AFTER are directly comparable.
 *
 *   claims.map((c) => ({
 *       field: c.field,
 *       value: c.value,
 *       sentence: c.evidence.verbatimSpan,   // whatever the producer cites
 *       matcherId: c.extractionMethod,
 *   }))
 *
 * ⛔ Two rules for the AFTER run, both learned the hard way:
 *   1. Re-run the ORACLE and the SCRAMBLE controls too. A harness that has not been
 *      shown able to fail on THIS input has not been shown to measure it.
 *   2. Do NOT edit a gold row to match a new producer's output. If a gold value is
 *      wrong, correct it against the DOCUMENT and say who corrected it — otherwise
 *      the set stops being ground truth and becomes a mirror.
 */
export function asPredictions(
    rows: readonly { field: ExtractableField; value: number; sentence: string; matcherId?: string }[],
): Prediction[] {
    return rows.map((r) => ({ field: r.field, value: r.value, sentence: r.sentence, matcherId: r.matcherId ?? 'external' }));
}

export type FpClass =
    /** Emitted a value the gold set NAMED as not-a-parcel-rule — a trap we predicted. */
    | 'named-trap'
    /** Emitted a value the gold set never lists at all — an unanticipated fabrication. */
    | 'unlisted';

export interface FalsePositive {
    readonly field: ExtractableField;
    readonly value: number;
    readonly klass: FpClass;
    /** True when the value EXCEEDS every gold value for this field in the stratum. */
    readonly overstates: boolean;
    /** The gold row that named it, when one did. */
    readonly namedBy: string | null;
    readonly sentences: readonly string[];
}

export interface ArmAResult {
    readonly truePositives: readonly { field: ExtractableField; value: number }[];
    readonly falsePositives: readonly FalsePositive[];
    readonly falseNegatives: readonly { field: ExtractableField; value: number; rows: string[] }[];
    /** null when the denominator is 0 — an undefined ratio is never reported as 0 or 1. */
    readonly precision: number | null;
    readonly recall: number | null;
    readonly overstatementCount: number;
    /** overstating FPs ÷ distinct claims emitted. null when nothing was emitted. */
    readonly overstatementRate: number | null;
    readonly emittedCount: number;
    readonly goldClaimCount: number;
}

export interface SilentLoss {
    readonly rowId: string;
    readonly field: ExtractableField;
    readonly value: number;
    readonly emittedInstead: readonly number[];
}

export interface ArmBResult {
    /** Gold NUMBER rows whose value AND locator were both recovered. */
    readonly matched: readonly string[];
    /** Gold NUMBER rows whose value appeared but could not be tied to this locator. */
    readonly valueOnly: readonly string[];
    /** Gold NUMBER rows nothing recovered. */
    readonly missed: readonly string[];
    /** Rows for which no anchor can exist (a table cell has no sentence to cite). */
    readonly unanchorable: readonly string[];
    readonly slotRecall: number | null;
    readonly slotDenominator: number;
}

export interface StratumScore {
    readonly stratum: StratumId;
    readonly armA: ArmAResult;
    readonly armB: ArmBResult;
    /** Gold rows by label — the denominators, stated. */
    readonly labelCounts: Readonly<Record<string, number>>;
    /**
     * ⭐ SILENT LOSS — gold NUMBER rows that were missed for a field that DID emit
     * at least one other value. `FieldOutcome` is per-FIELD, not per-CLAIM, so once
     * one height is emitted the extractor records NO unknown for the four heights it
     * failed to read. Those losses leave no trace in the outcome at all, which is a
     * different and worse failure than an honest unknown (§CONTEXT-DATA-HONESTY).
     */
    readonly silentLosses: readonly SilentLoss[];
}

const key = (f: ExtractableField, v: number): string => `${f}|${v}`;

/** Compare two ordinance values. Tolerance is tight — a 1000x locale slip must not pass. */
function sameValue(a: number, b: number): boolean {
    return Math.abs(a - b) < 1e-9;
}

function normalise(s: string): string {
    return s.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function scoreStratum(
    stratum: StratumId,
    goldRows: readonly GoldRow[],
    predictions: readonly Prediction[],
): StratumScore {
    const rows = goldRows.filter((r) => r.stratum === stratum);

    const labelCounts: Record<string, number> = {};
    for (const r of rows) labelCounts[r.label] = (labelCounts[r.label] ?? 0) + 1;

    // ── gold claim sets ──
    const goldValues = new Map<string, GoldRow[]>();
    const forbidden = new Map<string, GoldRow[]>();
    for (const r of rows) {
        if (r.value === null) continue;
        const k = key(r.field, r.value);
        if (r.label === 'NUMBER') {
            const arr = goldValues.get(k) ?? [];
            arr.push(r);
            goldValues.set(k, arr);
        } else if (r.label === 'NOT-A-PARCEL-RULE') {
            const arr = forbidden.get(k) ?? [];
            arr.push(r);
            forbidden.set(k, arr);
        }
    }

    // Per-field ceiling of the legitimate values — used to classify an FP as an
    // OVERSTATEMENT (permissive) rather than merely wrong.
    const goldMax = new Map<ExtractableField, number>();
    for (const r of rows) {
        if (r.label !== 'NUMBER' || r.value === null) continue;
        const cur = goldMax.get(r.field);
        if (cur === undefined || r.value > cur) goldMax.set(r.field, r.value);
    }

    // ── distinct emitted claims ──
    const emitted = new Map<string, { field: ExtractableField; value: number; sentences: string[] }>();
    for (const p of predictions) {
        const k = key(p.field, p.value);
        const e = emitted.get(k);
        if (e === undefined) emitted.set(k, { field: p.field, value: p.value, sentences: [p.sentence] });
        else e.sentences.push(p.sentence);
    }

    const truePositives: { field: ExtractableField; value: number }[] = [];
    const falsePositives: FalsePositive[] = [];
    for (const [k, e] of emitted) {
        if (goldValues.has(k)) {
            truePositives.push({ field: e.field, value: e.value });
            continue;
        }
        const named = forbidden.get(k);
        const ceiling = goldMax.get(e.field);
        falsePositives.push({
            field: e.field,
            value: e.value,
            klass: named === undefined ? 'unlisted' : 'named-trap',
            // No legitimate value for this field in this stratum ⇒ ANY emission is
            // permissive, because the honest answer was "no number".
            overstates: ceiling === undefined ? true : e.value > ceiling,
            namedBy: named === undefined ? null : (named[0]?.id ?? null),
            sentences: e.sentences,
        });
    }

    const falseNegatives: { field: ExtractableField; value: number; rows: string[] }[] = [];
    for (const [k, gs] of goldValues) {
        if (emitted.has(k)) continue;
        const g = gs[0]!;
        falseNegatives.push({ field: g.field, value: g.value!, rows: gs.map((x) => x.id) });
    }

    const tp = truePositives.length;
    const fp = falsePositives.length;
    const fn = falseNegatives.length;
    const overstatementCount = falsePositives.filter((f) => f.overstates).length;

    const armA: ArmAResult = {
        truePositives,
        falsePositives,
        falseNegatives,
        precision: tp + fp === 0 ? null : tp / (tp + fp),
        recall: tp + fn === 0 ? null : tp / (tp + fn),
        overstatementCount,
        overstatementRate: emitted.size === 0 ? null : overstatementCount / emitted.size,
        emittedCount: emitted.size,
        goldClaimCount: goldValues.size,
    };

    // ── ARM B — slot recall ──
    const numberRows = rows.filter((r) => r.label === 'NUMBER' && r.value !== null);
    const matched: string[] = [];
    const valueOnly: string[] = [];
    const missed: string[] = [];
    const unanchorable: string[] = [];
    for (const r of numberRows) {
        const anchor = r.evidence.anchor;
        const hits = predictions.filter((p) => p.field === r.field && sameValue(p.value, r.value!));
        if (anchor === null || anchor === undefined) {
            // No sentence exists to cite (a table cell). Record it honestly rather
            // than scoring it as a pass or a fail.
            unanchorable.push(r.id);
            if (hits.length > 0) valueOnly.push(r.id);
            continue;
        }
        const a = normalise(anchor);
        if (hits.some((p) => normalise(p.sentence).includes(a))) matched.push(r.id);
        else if (hits.length > 0) valueOnly.push(r.id);
        else missed.push(r.id);
    }
    const anchorable = numberRows.length - unanchorable.length;
    const armB: ArmBResult = {
        matched,
        valueOnly,
        missed,
        unanchorable,
        slotRecall: anchorable === 0 ? null : matched.length / anchorable,
        slotDenominator: anchorable,
    };

    // ── SILENT LOSS ──
    const emittedByField = new Map<ExtractableField, number[]>();
    for (const p of predictions) {
        const arr = emittedByField.get(p.field) ?? [];
        if (!arr.some((v) => sameValue(v, p.value))) arr.push(p.value);
        emittedByField.set(p.field, arr);
    }
    const silentLosses: SilentLoss[] = [];
    for (const r of numberRows) {
        const emittedForField = emittedByField.get(r.field);
        if (emittedForField === undefined || emittedForField.length === 0) continue; // an honest unknown IS recorded
        if (emittedForField.some((v) => sameValue(v, r.value!))) continue; // recovered
        silentLosses.push({ rowId: r.id, field: r.field, value: r.value!, emittedInstead: emittedForField });
    }

    return { stratum, armA, armB, labelCounts, silentLosses };
}

// ─────────────────────────── falsification controls ───────────────────────────
//
// §CORPUS-NEVER-JITTERED: a gate is trusted to PASS only after it is proven able to
// FAIL. Two controls, both run on every trial:

/**
 * CONTROL 1 — the ORACLE. Build predictions directly from the gold NUMBER rows and
 * score them. Anything but precision = 1 and recall = 1 means the SCORER is broken,
 * not the extractor.
 */
export function oraclePredictions(goldRows: readonly GoldRow[], stratum: StratumId): Prediction[] {
    return goldRows
        .filter((r) => r.stratum === stratum && r.label === 'NUMBER' && r.value !== null)
        .map((r) => ({
            field: r.field,
            value: r.value!,
            sentence: r.evidence.anchor ?? r.evidence.quote,
            matcherId: 'oracle',
        }));
}

/**
 * CONTROL 2 — the SCRAMBLE. Perturb the INPUT TEXT by remapping every digit, then
 * re-run the real extractor. A harness that scores the same on scrambled text is
 * measuring nothing. Digits only: the keywords, the grammar and the sentence
 * structure are untouched, so the extractor still fires — it simply fires on
 * numbers that are no longer the document's.
 */
export function scrambleDigits(text: string): string {
    // A fixed permutation with no fixed points, so no digit survives.
    const MAP: Record<string, string> = {
        '0': '7', '1': '4', '2': '9', '3': '6', '4': '1',
        '5': '8', '6': '3', '7': '0', '8': '5', '9': '2',
    };
    return text.replace(/[0-9]/g, (d) => MAP[d]!);
}
