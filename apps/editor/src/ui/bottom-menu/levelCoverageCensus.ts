/**
 * levelCoverageCensus — §LEVEL-COVERAGE-IS-MEASURED (L-3520), 2026-08-22.
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    L7 UI — pure derivation. No THREE (P2), no DOM, no rAF (P3),
 *                    no `(window as any)` (P4), no store writes (P6). The CALLER
 *                    walks the scene and hands this plain data.
 * Architectural Classification: A (view-only, diagnostic).
 * Contract:          C25 (visibility intent is a DOMAIN concept — this measures
 *                    the intent's REACH and writes nothing) · C84 §9 (a family is
 *                    not exempt from an element-facing surface merely because
 *                    nobody noticed it was missing).
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * Founder, 2026-08-22, screenshot 3: *"EXPLODE does not separate every element —
 * upper levels lift, but a lot of geometry stays behind."*
 *
 * The live log he was reading is `BottomActionMenu._applyLevelTransforms()`:
 *
 *   [§LEVEL-STACK] exploded: offset roots per level — Ground=44(rm2+lbl1+fur4),
 *   Level 1=158(...), … (total 443; rooms 34, labels 17, furniture 31)
 *
 * ⭐ AND THAT LINE CANNOT ANSWER HIS QUESTION, WHICH IS THE POINT. It is a
 * census of the objects the pass DID move. A pass that moves 443 roots and
 * leaves 900 behind prints exactly the same reassuring line as one that moves
 * all 443 of 443. The number is a numerator with no denominator — the same
 * defect shape as `[§LEVEL-STACK-COUNT-IS-NOT-PROOF]` (L-1012), one level up.
 *
 * ⚠ THE FOUNDER'S LEAD WAS "the same population as the census `(unattributed)`
 * bucket". IT IS NOT THE SAME POPULATION, and the difference matters — measured
 * from the two predicates, 2026-08-22:
 *
 *   · `logSceneCensusOnce` (pryzmPerfConsole.ts) buckets `(unattributed)` on a
 *     missing **`userData.elementType`**.
 *   · The explode buckets on a resolvable **`userData.levelId`**
 *     (`BottomActionMenu._objectLevelId`), behind an `_isBimObject` gate that
 *     asks for `id || levelId || storeyName`.
 *
 * Those are different questions, and each has a population the other misses: an
 * object CAN carry `elementType: 'wall'` and no `levelId` (named in the census,
 * left behind by the explode), and it CAN carry a `levelId` and no `elementType`
 * (unattributed in the census, lifted correctly). The overlap is expected to be
 * large — a builder that forgets one tag tends to forget both — but "expected to
 * be large" is not a measurement, and reporting the overlap as an identity would
 * be the `probe-can-be-wrong-three-ways` failure in miniature.
 *
 * So this module reports the LEFT-BEHIND population **broken out by family**, and
 * separately reports how much of it is also `(unattributed)`. The overlap becomes
 * a printed number instead of a hypothesis.
 *
 * ⛔ THIS MODULE IS A MEASUREMENT, NOT A FIX. It does not decide anything, it
 * does not move anything, and a green run of its tests establishes nothing about
 * the viewport. It exists so the next person argues from a number.
 */

/** One drawable scene object, reduced to the facts the two predicates read. */
export interface LevelCoverageSubject {
    /**
     * `userData.elementType ?? userData.type`, verbatim. `null` when the object
     * carries neither — that is the census's `(unattributed)` condition and it is
     * kept DISTINCT from the string '(unattributed)' so a builder that literally
     * stamps that word cannot be confused with one that stamps nothing.
     */
    readonly family: string | null;
    /**
     * True when the object (or an ancestor) ended up inside a level group, i.e.
     * the explode/solo pass actually reaches it. The caller computes this from
     * the SAME root set the pass uses — never from a re-derived predicate, or
     * this census would be measuring its own copy of the rule.
     */
    readonly covered: boolean;
    /**
     * True when the object resolves a level tag of its own. Reported separately
     * from `covered` because they diverge in the informative direction: an object
     * with a tag that is still not covered means the BUCKETING dropped it (e.g.
     * its level id names no level in `bimManager.getLevels()`), which is a
     * different defect from having no tag at all.
     */
    readonly hasLevelTag: boolean;
}

/** Per-family coverage. */
export interface LevelCoverageRow {
    readonly family: string;
    readonly drawn: number;
    readonly covered: number;
    readonly leftBehind: number;
    /** Left behind DESPITE carrying a level tag — a bucketing failure, not a tagging one. */
    readonly leftBehindWithTag: number;
}

export interface LevelCoverageReport {
    readonly rows: readonly LevelCoverageRow[];
    readonly totalDrawn: number;
    readonly totalCovered: number;
    readonly totalLeftBehind: number;
    /** Of `totalLeftBehind`, how many are also `(unattributed)` — the founder's overlap. */
    readonly leftBehindUnattributed: number;
    /** Of `totalLeftBehind`, how many DID carry a level tag and were dropped anyway. */
    readonly leftBehindWithTag: number;
}

/** The label an object with no `elementType`/`type` is reported under. */
export const UNATTRIBUTED = '(unattributed)';

/**
 * Census the level pass's reach.
 *
 * Rows are sorted by `leftBehind` DESCENDING, then by family name, so the first
 * row is the thing to fix. (`logSceneCensusOnce` learned the same lesson the hard
 * way: a scene-wide average "is USELESS for deciding what to fix".)
 */
export function censusLevelCoverage(
    subjects: readonly LevelCoverageSubject[],
): LevelCoverageReport {
    const byFamily = new Map<string, { drawn: number; covered: number; leftBehind: number; leftBehindWithTag: number }>();

    let totalDrawn = 0;
    let totalCovered = 0;
    let leftBehindUnattributed = 0;
    let leftBehindWithTag = 0;

    for (const s of subjects) {
        const family = s.family ?? UNATTRIBUTED;
        const row = byFamily.get(family)
            ?? { drawn: 0, covered: 0, leftBehind: 0, leftBehindWithTag: 0 };

        row.drawn++;
        totalDrawn++;
        if (s.covered) {
            row.covered++;
            totalCovered++;
        } else {
            row.leftBehind++;
            if (s.family === null) leftBehindUnattributed++;
            if (s.hasLevelTag) {
                row.leftBehindWithTag++;
                leftBehindWithTag++;
            }
        }
        byFamily.set(family, row);
    }

    const rows: LevelCoverageRow[] = [...byFamily.entries()]
        .map(([family, r]) => ({ family, ...r }))
        .sort((a, b) => (b.leftBehind - a.leftBehind) || a.family.localeCompare(b.family));

    return {
        rows,
        totalDrawn,
        totalCovered,
        totalLeftBehind: totalDrawn - totalCovered,
        leftBehindUnattributed,
        leftBehindWithTag,
    };
}

/**
 * The one-line console form.
 *
 * ⭐ IT LEADS WITH THE DENOMINATOR. `443 roots offset` is not a claim about
 * coverage; `1103 of 1546 drawn objects left behind` is. When coverage is total
 * the line says so explicitly rather than going quiet — an instrument that prints
 * nothing when everything is fine is indistinguishable from one that is broken,
 * which is the `context-data-honesty-family` rule.
 */
export function formatLevelCoverage(report: LevelCoverageReport, mode: string): string {
    const { totalDrawn, totalCovered, totalLeftBehind } = report;

    if (totalDrawn === 0) {
        return `[§LEVEL-COVERAGE] ${mode}: nothing drawn in the scene — coverage is UNDEFINED, not 100%.`;
    }
    if (totalLeftBehind === 0) {
        return `[§LEVEL-COVERAGE] ${mode}: ${totalCovered}/${totalDrawn} drawn objects are inside a level `
            + 'group — COMPLETE. Every drawable thing moves/hides with its storey.';
    }

    const worst = report.rows
        .filter(r => r.leftBehind > 0)
        .slice(0, 6)
        .map(r => `${r.family}=${r.leftBehind}/${r.drawn}`
            + (r.leftBehindWithTag > 0 ? ` [${r.leftBehindWithTag} TAGGED but unbucketed]` : ''))
        .join(', ');

    const pct = ((totalLeftBehind / totalDrawn) * 100).toFixed(1);

    return `[§LEVEL-COVERAGE] ${mode}: ⚠ ${totalLeftBehind} of ${totalDrawn} drawn objects (${pct}%) are `
        + `in NO level group — they do not lift when exploded and are not hidden when soloed. `
        + `Worst families: ${worst}. `
        + `Of the ${totalLeftBehind}, ${report.leftBehindUnattributed} also carry no \`userData.elementType\` `
        + `(the census's "(unattributed)" bucket — this is the OVERLAP, measured, not assumed) and `
        + `${report.leftBehindWithTag} DO carry a level tag and were dropped by the bucketing anyway.`;
}
