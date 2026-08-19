/**
 * handrailSnapshotUtils (geometry-stair) — ⚠ AN EXACT DUPLICATE, DECLARED (C84 EI-9).
 *
 * THE AUTHORITY is `packages/core-app-model/src/stores/HandrailSnapshotUtils.ts`;
 * see its sibling `handrailSnapshotUtils2.ts` for the full three-way §3.5
 * measurement. This copy differs from the authority only in importing
 * `HandrailData` from `@pryzm/core-app-model/stores` rather than a relative path.
 *
 * §3.5: re-exported from `@pryzm/geometry-stair`'s barrel (`index.ts`), zero
 * importers repo-wide outside that line. It is REACHABLE (unlike its sibling,
 * nothing shadows it) but UNUSED — the two production consumers,
 * `UpdateHandrailCommand` and `DeleteHandrailCommand`, both import the authority
 * from `@pryzm/core-app-model`. ⇒ CO-LIVING-BUT-UNCONSUMED.
 *
 * ⛔ NOT DELETED BY THIS LANE: it is part of a published package barrel. Pinned
 * to the authority by an equality test instead, so the copies cannot diverge
 * while the retirement decision is open. ISSUE-LOG L-987.
 */

import { HandrailData } from '@pryzm/core-app-model/stores';

export function serializeHandrailSnapshot(handrail: HandrailData): string {
    return JSON.stringify(handrail);
}

export function deserializeHandrailSnapshot(snapshot: string): HandrailData {
    return JSON.parse(snapshot) as HandrailData;
}
