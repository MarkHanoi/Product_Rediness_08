/**
 * handrailSnapshotUtils2 — ⚠ AN EXACT DUPLICATE, DECLARED (C84 EI-9 / §3.5).
 *
 * MEASURED 2026-08-19. THREE byte-identical implementations of this pair exist:
 *
 *   1. `packages/core-app-model/src/stores/HandrailSnapshotUtils.ts`  ← THE AUTHORITY
 *   2. `packages/core-app-model/src/stores/handrailSnapshotUtils2.ts` (this file)
 *   3. `packages/geometry-stair/src/handrailSnapshotUtils.ts`
 *
 * All three are `JSON.stringify` / `JSON.parse` with NO field whitelist. That
 * absence is load-bearing and worth stating: it is why every field this lane
 * added to `HandrailData` (`infillMaxGap`, `suppressStartPost`, the baluster
 * members) survives an `UpdateHandrailCommand` undo without any further work.
 *
 * §3.5 REACHABILITY, ALL FOUR AXES, FOR THIS FILE:
 *   · IMPORT axis  — zero importers outside the barrel.
 *   · BARREL axis  — `stores/index.ts` re-exports it with `export *`, but the
 *                    SAME index explicitly exports the identical two names from
 *                    `HandrailSnapshotUtils.js` a few lines earlier. Under ES
 *                    module semantics an explicit local export SHADOWS a
 *                    star-export of the same name, so nothing can reach these
 *                    two functions by name. It is re-exported and unreachable.
 *   · BUS axis     — n/a; not a command handler.
 *   · OTHER-HOST   — `packages/persistence-client`, `apps/cli`, `apps/bench`:
 *                    zero references.
 *   ⇒ DEAD, not CO-LIVING.
 *
 * ⛔ NOT DELETED BY THIS LANE, AND THE REASON IS NOT TIMIDITY. Deleting a symbol
 * that a barrel re-exports changes that barrel's public surface, and this lane
 * does not own `stores/index.ts`'s consumers. The honest interim is to DECLARE
 * (C84 §8.c: declare, do not mirror) and to PIN the three to identical behaviour
 * so the duplication cannot silently diverge —
 * `packages/command-registry/__tests__/handrailTypeMaterialisationAndRun.test.ts`
 * does that. Retirement is C95 §11's item, tracked as ISSUE-LOG L-987.
 */

import { HandrailData } from './HandrailTypes';

export function serializeHandrailSnapshot(handrail: HandrailData): string {
    return JSON.stringify(handrail);
}

export function deserializeHandrailSnapshot(snapshot: string): HandrailData {
    return JSON.parse(snapshot) as HandrailData;
}
