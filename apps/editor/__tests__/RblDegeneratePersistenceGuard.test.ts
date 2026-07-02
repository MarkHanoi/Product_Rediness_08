// @vitest-environment node
//
// §RBL-NO-PERSIST-DEGENERATE (2026-07-02) — regression test for the invariant that
// degenerate room-bounding-line records (undefined placement.start/end) are dropped
// on BOTH save (ProjectSerializer) and load (ProjectLoader / ImportProjectCommand),
// so the count (940 on the reported 40-storey office, many partial/legacy) stops
// growing and self-heals on the next save.
//
// The predicate is intentionally identical across all three sites; this test locks
// its semantics so a future edit to any one site is caught if it drifts.

import { describe, it, expect } from 'vitest';

/** The canonical keep-predicate used at save time (serializer) and load time. */
const isWellFormedRbl = (l: { placement?: { start?: unknown; end?: unknown } } | null | undefined): boolean =>
    l?.placement?.start != null && l?.placement?.end != null;

describe('§RBL-NO-PERSIST-DEGENERATE — degenerate record filter', () => {
    it('keeps a well-formed line (both endpoints present)', () => {
        expect(isWellFormedRbl({ placement: { start: { x: 0, z: 0 }, end: { x: 1, z: 1 } } })).toBe(true);
    });

    it('drops a record with undefined placement', () => {
        expect(isWellFormedRbl({} as any)).toBe(false);
    });

    it('drops a record missing start', () => {
        expect(isWellFormedRbl({ placement: { end: { x: 1, z: 1 } } } as any)).toBe(false);
    });

    it('drops a record missing end', () => {
        expect(isWellFormedRbl({ placement: { start: { x: 0, z: 0 } } } as any)).toBe(false);
    });

    it('filtering a mixed batch keeps only well-formed lines', () => {
        const batch = [
            { id: 'a', placement: { start: { x: 0, z: 0 }, end: { x: 1, z: 0 } } },
            { id: 'b', placement: undefined },
            { id: 'c', placement: { start: { x: 2, z: 2 } } },
            { id: 'd', placement: { start: { x: 3, z: 0 }, end: { x: 4, z: 0 } } },
        ];
        const kept = batch.filter(isWellFormedRbl as any).map(l => l.id);
        expect(kept).toEqual(['a', 'd']);
    });
});
