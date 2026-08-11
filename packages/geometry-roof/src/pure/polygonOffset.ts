/**
 * §W2A-ONE-OFFSET — RE-EXPORT ONLY. There is no offset algorithm in this file.
 *
 * The implementation moved DOWN to `@pryzm/geometry-kernel`
 * (`packages/geometry-kernel/src/pure/polygonOffset.ts`). Read that file's header
 * for the algorithm, the measured error table of the routine it replaces, and its
 * honest limits.
 *
 * WHY IT MOVED: the shipping roof path is `plugins/roof` → `@pryzm/plugin-sdk` →
 * `produceRoof` (`geometry-kernel`), and `geometry-kernel` cannot import this
 * package (`geometry-roof` depends on `core-app-model` / `renderer-three`, so the
 * edge would run upward through L4). While the correct offset lived HERE, the
 * committer users actually hit kept calling an unfixed verbatim clone. Fixing a
 * copy the shipping path cannot reach is not a fix.
 *
 * ⚠ DO NOT REINTRODUCE AN IMPLEMENTATION HERE. Neither module owns a second
 * offset routine — the same rule `site-parcel-data/src/geometry/insetPolygon.ts`
 * states for its erosion. Extend the kernel module and add a fixture.
 *
 * @file packages/geometry-roof/src/pure/polygonOffset.ts
 */

export {
    offsetPolygon,
    offsetPolygonOrSelf,
    findSelfIntersection,
    dedupeRing,
    FOLD_CHECK_MAX_VERTS,
} from '@pryzm/geometry-kernel';
export { polygonSignedArea2D as signedArea } from '@pryzm/geometry-kernel';
export type { OffsetResult, Pt2 } from '@pryzm/geometry-kernel';
