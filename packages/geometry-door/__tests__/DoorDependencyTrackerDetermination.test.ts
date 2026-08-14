// §GR-10/GR-14 — the DoorDependencyTracker ARM C row, drained.
//
// THE ROW: `check-no-empty-means-unknown`, one site —
//     return Array.from(this.graph.get(wallId) ?? []);
//
// TWO CASES, ONE VALUE: the wall genuinely hosts no doors, and THE INDEX WAS
// NEVER POPULATED (`bootstrap()` never ran, no door event fired). The second is
// the exact failure `check-move-propagation` pins for the SLAB tracker — whose
// wire was found cut in TWO places — and its only symptom is a correct-looking
// empty array.
//
// Every arm below is DIFFERENTIATING: it fails if `[]` and unknown are
// conflated.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DoorDependencyTracker } from '../src/DoorDependencyTracker';
import { doorStore } from '../src/DoorStore';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** A wall store that satisfies the tracker's `subscribe`-only requirement. */
const wallStoreRef = { subscribe: () => () => { /* no events in this fixture */ } } as never;
const cmRef = { current: undefined };

/** The minimum `DoorOpeningSchema` accepts; every other field has a default. */
const DOOR = (id: string, wallId: string) => ({
    id, openingId: id + '-op', wallId,
    offset: 1, width: 0.9, height: 2.1, sillHeight: 0,
}) as never;

let trackers: DoorDependencyTracker[] = [];
function tracker(): DoorDependencyTracker {
    const t = new DoorDependencyTracker(cmRef, wallStoreRef);
    trackers.push(t);
    return t;
}

beforeEach(() => { doorStore.clear?.(); });
afterEach(() => { for (const t of trackers) t.dispose(); trackers = []; doorStore.clear?.(); });

describe('DoorDependencyTracker — an un-bootstrapped index stops answering "no doors"', () => {
    it('DETERMINED and EMPTY — an empty store and an empty index AGREE; refusing here would be the mirror defect', () => {
        const d = tracker().doorIdsForWallDetermination('wall-1');
        expect(d.kind).toBe('determined');
        expect(d.kind === 'determined' && d.doorIds).toEqual([]);
    });

    it('DETERMINED — after bootstrap, a wall with doors answers positively', () => {
        doorStore.add(DOOR('door-1', 'wall-1'));
        const t = tracker();
        t.bootstrap();
        const d = t.doorIdsForWallDetermination('wall-1');
        expect(d.kind === 'determined' && d.doorIds).toEqual(['door-1']);
    });

    it('DETERMINED — after bootstrap, a wall WITHOUT doors answers "none", not a refusal', () => {
        doorStore.add(DOOR('door-1', 'wall-1'));
        const t = tracker();
        t.bootstrap();
        const d = t.doorIdsForWallDetermination('wall-OTHER');
        expect(d.kind).toBe('determined');
        expect(d.kind === 'determined' && d.doorIds).toEqual([]);
    });

    it('THE DEFECT ARM — doors EXIST but the tracker was never bootstrapped: UNDETERMINED, not "no doors"', () => {
        // Constructed FIRST so its subscription cannot see the add below…
        const t = tracker();
        t.dispose();                                  // …and then deafened, which is the
        const t2 = Object.assign(t, {});              // shape of a tracker whose wire is cut.
        doorStore.add(DOOR('door-1', 'wall-1'));
        const d = t2.doorIdsForWallDetermination('wall-1');
        expect(d.kind).toBe('undetermined');
        expect(d.kind === 'undetermined' && d.reason).toBe('STALE_DERIVED_STATE');
        expect(d.kind === 'undetermined' && d.detail).toContain('bootstrap');
    });

    it('THE DIFFERENTIATOR — "wall has no doors" and "the index was never built" are no longer the same value', () => {
        const honest = tracker().doorIdsForWallDetermination('wall-1');   // empty store, empty index

        const blindT = tracker();
        blindT.dispose();
        doorStore.add(DOOR('door-9', 'wall-9'));
        const blind = blindT.doorIdsForWallDetermination('wall-1');

        expect(honest.kind).not.toBe(blind.kind);
        // …and the legacy accessor STILL returns the same `[]` for both, which is
        // exactly why the distinction had to move into the type rather than into
        // the array. Asserted, so the necessity is measured and not narrated.
        expect(tracker().getDoorIdsForWall('wall-1')).toEqual(blindT.getDoorIdsForWall('wall-1'));
    });

    it('the legacy accessor is unchanged for every caller — a narrowing, not a rival read', () => {
        doorStore.add(DOOR('door-1', 'wall-1'));
        const t = tracker();
        t.bootstrap();
        expect(t.getDoorIdsForWall('wall-1')).toEqual(['door-1']);
        expect(t.getDoorIdsForWall('wall-none')).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// UNION PIN — no rival vocabulary (C78 §8.1, CLOSED at eleven)
// ═════════════════════════════════════════════════════════════════════════════

describe('the reason is command-bus vocabulary, not a fork', () => {
    const union = (): string => {
        const s = readFileSync(resolve(REPO, 'packages/command-bus/src/consequence.ts'), 'utf8');
        const start = s.indexOf('export type UndeterminedReason');
        expect(start, 'UndeterminedReason not found — command-bus moved').toBeGreaterThan(-1);
        return s.slice(start, s.indexOf(';', start));
    };

    it('the member this tracker produces exists in the closed union', () => {
        expect(union()).toContain("'STALE_DERIVED_STATE'");
    });

    it('the union is still closed at ELEVEN — extending it here would fail HERE', () => {
        expect(union().match(/\|\s*'[A-Z_]+'/g)).toHaveLength(11);
    });
});
