/**
 * levelChangeDispositions — §FIX-LEVEL-MOVE-NEEDS-A-GESTURE (L-10062).
 * Lane LAYERMAT10, 2026-08-23.
 *
 * ─── WHAT THIS PINS, AND WHY A SET AND NOT A COUNT ──────────────────────────
 *
 * The founder's console, 2026-08-23, while his slab silently changed storey:
 *
 *   [YjsDocAdapter] W5-3: command type 'slab.changeLevel' has NO sync
 *   disposition. Its properties are NOT replicated.
 *
 * `syncDisposition.ts` declared `wall.changeLevel` and `roof.changeLevel` and
 * stopped there — written when those were the only two families with the verb.
 * §L-1032 later widened the property panel's storey control from a hard-coded
 * `elType === 'wall'` to the whole `LEVEL_CHANGE_VERBS` register, and **the
 * disposition table did not follow**. Ten reachable verbs were therefore silent
 * BY OMISSION, which is the one thing that file's own rule forbids: *"silent by
 * DECLARATION, never by OMISSION"*.
 *
 * ⭐ SO THIS ASSERTS SET EQUALITY IN BOTH DIRECTIONS, never a number. A count can
 * be right while the membership is wrong — the exact failure shape CLAUDE.md
 * records five times over for the contract index, and the reason
 * `check-contract-index-equivalence.ts` compares sets. Arm A catches the case
 * that actually happened (a family gains the verb upstream and nobody declares
 * it here). Arm B catches its mirror (a family loses the verb and a stale row
 * goes on claiming a decision about something that no longer exists).
 *
 * ⚠ WHAT THIS DOES **NOT** ASSERT: that any of these replicate. All twelve are
 * `not-synced`, deliberately — `levelId` is the ADR-049 document selector and the
 * sole member of `GLOBAL_PROPERTY_EXCLUDES`, so the property path would replicate
 * nothing while reading as synced. This suite pins that every one of them has a
 * WRITTEN REASON, not that the reason is "yes".
 */

import { describe, it, expect } from 'vitest';
import { LEVEL_CHANGE_VERBS } from '@pryzm/command-bus';
import { SYNC_DISPOSITIONS } from '../src/syncDisposition';

const registerVerbs = (): string[] =>
    Object.values(LEVEL_CHANGE_VERBS).map((s) => s.verb).sort();

const declaredLevelVerbs = (): string[] =>
    Object.keys(SYNC_DISPOSITIONS).filter((v) => v.endsWith('.changeLevel')).sort();

describe('§L-10062 — every level-change verb has a written sync disposition', () => {

    it('ARM A — no verb in LEVEL_CHANGE_VERBS is missing from SYNC_DISPOSITIONS', () => {
        const declared = new Set(declaredLevelVerbs());
        const missing = registerVerbs().filter((v) => !declared.has(v));
        expect(
            missing,
            'These level-change verbs are reachable from the property panel and would warn ' +
            '"has NO sync disposition" at runtime. Declare each one in ' +
            'packages/sync-client/src/syncDisposition.ts with a written reason — silent by ' +
            'DECLARATION, never by OMISSION.',
        ).toEqual([]);
    });

    it('ARM B — no `.changeLevel` row in SYNC_DISPOSITIONS names a verb the register dropped', () => {
        const known = new Set(registerVerbs());
        const orphan = declaredLevelVerbs().filter((v) => !known.has(v));
        expect(
            orphan,
            'These rows decide a question about a verb LEVEL_CHANGE_VERBS no longer declares. ' +
            'A stale decision reads as a live one.',
        ).toEqual([]);
    });

    it('every declared level-change row carries a non-empty reason', () => {
        for (const verb of declaredLevelVerbs()) {
            const row = SYNC_DISPOSITIONS[verb] as { kind: string; reason?: string };
            expect(row.kind, `${verb}: level moves are document moves, not property writes`)
                .toBe('not-synced');
            expect(
                (row.reason ?? '').trim().length,
                `${verb}: a not-synced row without a reason is silence with a type annotation`,
            ).toBeGreaterThan(0);
        }
    });

    /**
     * The measurement that made this suite necessary, kept as an assertion so the
     * number in the ISSUE-LOG can be re-derived rather than trusted.
     */
    it('the register and the table cover the same twelve families', () => {
        expect(registerVerbs()).toEqual(declaredLevelVerbs());
    });
});
