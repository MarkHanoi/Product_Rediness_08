// ─────────────────────────────────────────────────────────────────────────────────────────────
// §ENVELOPE-SLOT-COVERAGE — THE SHARED CLASSIFIER. One definition of "a slot", one definition of
// F1 vs F2, used by every country arm so two arms cannot publish incomparable percentages.
//
// WHY THIS FILE EXISTS AT ALL (deliverable 1 of lane ENVELOPE-IBERIA; C63 §1.1's total-function
// rule). The C63 scorecard's ENVELOPE axis has always been `not-assessed` with a typed reason —
// nothing in this repo measured *"what fraction of the envelope does the SHIPPED code resolve on
// real land?"*. Every coverage figure published for ES/PT so far measures a DIFFERENT thing:
// share of land a pack's zone codes claim (Murcia crosstab, 23.51 %), share of features whose
// attribute is non-null (Madrid 70.2 % altura, Aragón 1.3 % edificab), share of clicks that get a
// parcel (the C63 PARCEL axis). None of those is the envelope. This is.
//
// ⭐ THE ONE DISTINCTION THIS FILE EXISTS TO PROTECT — F1 ≠ F2.
//   F1  the instrument GOVERNS this land and PRYZM serves no envelope mechanism for it → a GAP.
//   F2  the instrument governs and its own answer is "no private buildable envelope here"
//       (water, rail corridor, espaço verde, equipamento, solo rústico reserved) → a CORRECT
//       NULL, and NOT a gap.
// Merging them corrupts the figure in BOTH directions at once: it inflates the numerator with
// land we never answered for, and inflates the denominator with questions that were never asked.
// `packages/schemas/src/site/zoning/RuleState.ts` states this at the per-RULE level; this file
// applies the identical seam at the per-PARCEL level.
//
// ⚠ NO RIVAL VOCABULARY IS MINTED HERE. The seam is read from the ALREADY-RATIFIED
// `EnvelopeRefusal.legallyGrounded` (`BuildableEnvelope.ts`) — *is this refusal about the LAW or
// about PRYZM's coverage?* — which IS the F1/F2 question. When the ENVELOPE-FR lane's `RuleState`
// union is committed and exported from `@pryzm/schemas`, this classifier must adopt its
// `isF1PlanNoMechanism` / `isF2CorrectNull` helpers verbatim and DELETE `classifyRefusal` below.
// The two agree by construction today (RuleState's own header calls `legallyGrounded` "the exact
// seam"). Recorded here so the adoption is a deletion, never a second opinion.
//
// ⚠ A SERVICE FAILURE IS NEVER A ZERO. `service-failure` leaves every denominator
// (L-422/457/467/469, §CONTEXT-DATA-HONESTY). A city whose upstream is down reports a failure
// count, never a bad score.

/**
 * The envelope slots, verbatim from `computeBuildableEnvelope`'s own resolution list
 * (`packages/site-parcel-data/src/ZoningRulesEngine.ts` — `front`, `side`, `rear`, `maxHeight`,
 * `maxFloors`, `maxFAR`, `maxCoverage`, plus `permittedUse`). The engine is the authority; this
 * array must not drift from it, and `envelopeSlotCoverage.test.ts` pins that it does not.
 */
export const ENVELOPE_SLOTS = [
    'setback.front',
    'setback.side',
    'setback.rear',
    'maxHeight',
    'maxFloors',
    'maxFAR',
    'maxCoverage',
    'permittedUse',
] as const;
export type EnvelopeSlot = (typeof ENVELOPE_SLOTS)[number];

/** The per-point verdict. Total and mutually exclusive — every probed point lands on exactly one. */
export type PointClass =
    /** The upstream did not answer. EXCLUDED from every denominator; counted and reported. */
    | 'service-failure'
    /** The source answered and serves nothing here (sea, un-transcribed land, outside routing). */
    | 'no-plan-served'
    /** F2 — the instrument governs and its own answer is "no private buildable envelope". */
    | 'f2-correct-null'
    /** F1 — the instrument governs, the land is privately buildable, PRYZM resolves 0 slots. */
    | 'f1-gap'
    /**
     * ⭐ NEITHER F1 NOR RESOLVED — the pack answers with a SHAPE this harness cannot score.
     *
     * ⚠ ADDED 2026-09-03 BECAUSE THE FIRST READING OF THIS HARNESS WAS WRONG, AND THE
     * INDEPENDENT WITNESS CAUGHT IT. The first ES run put Barcelona's `13a`/`13b` in `f1-gap`
     * and disagreed with the committed cold-start-probe on **169 of 400 Barcelona parcels**.
     * The witness was right: those zones carry `geometricRule: 'block-derived-alignment'` with
     * EVERY scalar null — `maxHeight_m`, `maxFloors`, `plotRatioFAR`, `maxCoverage` and all three
     * setbacks — because the Eixample envelope is a *profunditat edificable* band CONSTRUCTED from
     * the block ring and the *amplada de vial*, resolved live by the editor's providers. The
     * ordinance's answer is a SHAPE; there is no scalar to fill, so scoring it 0/8 was measuring
     * the wrong thing and calling the result a gap.
     *
     * Counting it as `resolved` would be just as wrong — this harness supplies no block ring, so
     * it has not established that the shape resolves either. **Unmeasurable is a third value**,
     * and it is EXCLUDED from the slot denominator exactly as F2 is: the alternative is a figure
     * that moves when a jurisdiction switches rule KIND rather than when its coverage changes.
     * The count is printed so nobody reads its absence as zero.
     */
    | 'shape-rule-unmeasured'
    /** At least one envelope slot resolved from a pack or a structured provider. */
    | 'resolved';

export interface PointResult {
    readonly lat: number;
    readonly lon: number;
    readonly cls: PointClass;
    /** The zone as the source names it — VERBATIM. Null when no plan was served. */
    readonly zoneLabel: string | null;
    /** The jurisdiction / município key the point routed to, for the per-area breakdown. */
    readonly area: string | null;
    /** Which slots resolved. Empty for every class but `resolved`. */
    readonly slots: readonly EnvelopeSlot[];
    /** Free-text WHY, carried verbatim from the shipped refusal / outcome. Never invented here. */
    readonly why: string;
}

/**
 * The ratified seam, applied. `legallyGrounded: true` ⇒ the refusal is a statement about the LAW
 * ⇒ F2. `false` ⇒ a statement about PRYZM's coverage ⇒ F1.
 *
 * ⚠ It is deliberately NOT "the refusal code looks legal-ish". The flag is authored by the pack
 * that knows, on the same object as the citation; a classifier that re-derived it from the code
 * string would be a second opinion able to disagree with the card the user actually sees.
 */
export function classifyRefusal(refusal: {
    readonly legallyGrounded: boolean;
}): 'f1-gap' | 'f2-correct-null' {
    return refusal.legallyGrounded ? 'f2-correct-null' : 'f1-gap';
}

export interface SlotCoverageReport {
    readonly probed: number;
    readonly serviceFailures: number;
    readonly noPlanServed: number;
    readonly f2CorrectNull: number;
    readonly f1Gap: number;
    readonly shapeRuleUnmeasured: number;
    readonly resolved: number;
    /**
     * ⭐ THE HEADLINE. Slots resolved ÷ (8 × answerable points), where an ANSWERABLE point is
     * `f1-gap` + `resolved`. F2 is EXCLUDED because its slots have no subject; service failures
     * and no-plan points are excluded because no question was asked. Null when the answerable
     * denominator is 0 — an unmeasured axis is null + a reason, never 0.
     */
    readonly slotCoveragePct: number | null;
    readonly answerablePoints: number;
    readonly slotsResolvedTotal: number;
    readonly perSlot: Readonly<Record<EnvelopeSlot, number>>;
    /** Zone labels seen on F1 points, most frequent first — the build queue, MEASURED. */
    readonly f1TopZones: ReadonlyArray<{ readonly zone: string; readonly n: number }>;
}

export function report(points: readonly PointResult[]): SlotCoverageReport {
    const by = (c: PointClass): number => points.filter((p) => p.cls === c).length;
    const answerable = points.filter((p) => p.cls === 'f1-gap' || p.cls === 'resolved');
    const perSlot = Object.fromEntries(ENVELOPE_SLOTS.map((s) => [s, 0])) as Record<
        EnvelopeSlot,
        number
    >;
    let total = 0;
    for (const p of answerable) {
        for (const s of p.slots) {
            perSlot[s] += 1;
            total += 1;
        }
    }
    const f1Zones = new Map<string, number>();
    for (const p of points) {
        if (p.cls !== 'f1-gap') continue;
        const k = p.zoneLabel ?? '(unnamed zone)';
        f1Zones.set(k, (f1Zones.get(k) ?? 0) + 1);
    }
    return {
        probed: points.length,
        serviceFailures: by('service-failure'),
        noPlanServed: by('no-plan-served'),
        f2CorrectNull: by('f2-correct-null'),
        f1Gap: by('f1-gap'),
        shapeRuleUnmeasured: by('shape-rule-unmeasured'),
        resolved: by('resolved'),
        slotCoveragePct:
            answerable.length === 0
                ? null
                : (total / (ENVELOPE_SLOTS.length * answerable.length)) * 100,
        answerablePoints: answerable.length,
        slotsResolvedTotal: total,
        perSlot,
        f1TopZones: [...f1Zones.entries()]
            .map(([zone, n]) => ({ zone, n }))
            .sort((a, b) => b.n - a.n)
            .slice(0, 15),
    };
}

/** Render a report as the markdown block the dossier docs carry. Same numbers, one formatter. */
export function renderMarkdown(title: string, r: SlotCoverageReport, frame: string): string {
    const pct = (n: number, d: number): string => (d === 0 ? 'n/a' : `${((n / d) * 100).toFixed(1)} %`);
    const answered = r.probed - r.serviceFailures;
    const lines: string[] = [
        `### ${title}`,
        '',
        `**Frame (the denominator, stated):** ${frame}`,
        '',
        '| class | n | share of answered points |',
        '|---|---:|---:|',
        `| \`service-failure\` (EXCLUDED from every denominator) | ${r.serviceFailures} | — |`,
        `| \`no-plan-served\` (source answered, nothing here) | ${r.noPlanServed} | ${pct(r.noPlanServed, answered)} |`,
        `| **F2** correct-null — the ordinance answers "no envelope" | ${r.f2CorrectNull} | ${pct(r.f2CorrectNull, answered)} |`,
        `| **F1** gap — governed + buildable, PRYZM serves no mechanism | ${r.f1Gap} | ${pct(r.f1Gap, answered)} |`,
        `| \`shape-rule-unmeasured\` — the pack answers with a SHAPE, not scalars (EXCLUDED from the slot denominator) | ${r.shapeRuleUnmeasured} | ${pct(r.shapeRuleUnmeasured, answered)} |`,
        `| \`resolved\` — at least one envelope slot resolved | ${r.resolved} | ${pct(r.resolved, answered)} |`,
        `| probed | ${r.probed} | |`,
        '',
        `**⭐ ENVELOPE SLOT COVERAGE = ${
            r.slotCoveragePct === null ? 'null (no answerable point)' : `${r.slotCoveragePct.toFixed(1)} %`
        }** — ${r.slotsResolvedTotal} slots resolved ÷ (8 × ${r.answerablePoints} answerable points).`,
        '',
        'Answerable = F1 + resolved. **F2 and `shape-rule-unmeasured` are excluded from this ' +
            'denominator by construction** — the first has no subject, the second has no scalar to fill.',
        '',
        `| slot | resolved on n of ${r.answerablePoints} answerable |`,
        '|---|---:|',
        ...ENVELOPE_SLOTS.map((s) => `| \`${s}\` | ${r.perSlot[s]} |`),
    ];
    if (r.f1TopZones.length > 0) {
        lines.push(
            '',
            '**The F1 build queue, measured (top zones by point count):**',
            '',
            '| zone (verbatim from the source) | n |',
            '|---|---:|',
        );
        for (const z of r.f1TopZones) lines.push(`| ${z.zone.replace(/\|/g, '\\|')} | ${z.n} |`);
    }
    return lines.join('\n');
}
