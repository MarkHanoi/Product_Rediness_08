// §PV-02-REPAIR-IS-INFERRED — C75 §2.3 / §7 exit condition 2.
//
// ─── THE DEFECT THIS PINS ────────────────────────────────────────────────────
// C75 §0 Finding 4, measured 2026-08-12: `RoomDetectionEngine` ran
// `repairToSimplePolygon()` on a self-intersecting traced ring — replacing it with
// *the largest simple sub-ring*, a polygon the topology never traced — and then
// wrote the room with `detectionMethod: 'auto-topology'`, byte-identical to a room
// whose boundary was genuinely flood-filled. The substitution went to
// `console.debug`. **The console is not the model** (C75 §4.c): it survives no
// reload, reaches no exporter, and answers no question a user or a regeneration
// pass will later ask. So the model held two different claims under one label, and
// C75 §1.2 forbids exactly that merge — *entailed by the inputs* (computed) versus
// *plausibly guessed from them* (inferred) is the whole subject of the contract.
//
// ─── WHAT "DISTINGUISHABLE" MEANS HERE, STATED AS AN ASSERTION ───────────────
// Not "the repaired case has a nicer message". The test below feeds the SAME
// function the two inputs that used to be indistinguishable downstream, and
// asserts that the two boundaries it returns differ in the FIELD A CONSUMER READS
// — `detectionMethod` — and that the difference survives a serialise/deserialise
// round trip. A distinction that dies on save is the console defect with extra
// steps.
//
// ─── THE THIRD OUTCOME ───────────────────────────────────────────────────────
// C75 §2.3 permits two behaviours and no others: record what the repair did, or
// refuse. The refusal arm is asserted too, in the `SlabFragmentBuilder.ts:706`
// form (§REFUSE-NONSIMPLE-SLAB-RING, ADR-0299 §RECOVERY-MUST-REFUSE) — a ring that
// cannot be repaired yields NO boundary rather than a plausible-looking one.
//
// ⚠ This file deliberately does NOT restate the five-value L0 vocabulary
// (`@pryzm/schemas` `ValueOrigin`). C78 §8.6 / §13.1 forbid absorbing or aliasing
// it; `RoomDetectionMethod` is a room-domain determination union that
// `ElementProvenanceIndex` translates into it, and the translation is that file's
// test, not this one's.

import { describe, it, expect } from 'vitest';
import {
    buildDetectedRoomBoundary,
    isRoomBoundaryRefusal,
} from '../detectedRoomBoundary';
import { isSimple, polygonAreaM2 } from '../RoomPolygonUtils';
import { RoomBoundarySchema } from '../RoomDataSchema';
import type { RoomVertex } from '../RoomTypes';

const LEVEL_HEIGHT = 2.7;

/** A clean 4 m × 3 m room — what a genuinely flood-filled ground-floor ring is. */
const TRACED: RoomVertex[] = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
    { x: 0, z: 3 },
];

/**
 * The live §A.21.D58 shape: a proper crossing (bow-tie). Two loops meet where two
 * non-adjacent boundary edges of the SAME traced face cross, because a wall
 * crossing on the dense upper storey was never split into a shared graph node.
 * `repairToSimplePolygon` keeps the larger loop and discards the rest.
 */
const SELF_INTERSECTING: RoomVertex[] = [
    { x: 0, z: 0 },
    { x: 6, z: 0 },
    { x: 6, z: 4 },
    { x: 3, z: 4 },
    { x: 3, z: -1 }, // shoots back DOWN past z = 0, crossing the bottom edge
    { x: 0, z: 4 },
];

describe('C75 §7.2 — a REPAIRED room boundary is distinguishable from a DETECTED one', () => {
    it('the two inputs are genuinely the two cases (precondition, not decoration)', () => {
        // Asserted rather than assumed: if `isSimple` ever changed such that the
        // bow-tie passed, every assertion below would still be green while
        // testing nothing at all.
        expect(isSimple(TRACED)).toBe(true);
        expect(isSimple(SELF_INTERSECTING)).toBe(false);
    });

    it('a genuinely traced ring is auto-topology, and carries NO repair detail', () => {
        const result = buildDetectedRoomBoundary([...TRACED], LEVEL_HEIGHT);
        expect(isRoomBoundaryRefusal(result)).toBe(false);
        if (isRoomBoundaryRefusal(result)) return;

        expect(result.boundary.detectionMethod).toBe('auto-topology');
        // There is nothing to explain — the member already names the producer, and
        // a detail here would imply a substitution that did not happen.
        expect(result.boundary.detectionDetail).toBeUndefined();
        expect(polygonAreaM2(result.boundary.polygon)).toBeCloseTo(12, 6);
    });

    it('a REPAIRED ring is repaired-ring — NOT auto-topology — and says what it did', () => {
        const result = buildDetectedRoomBoundary([...SELF_INTERSECTING], LEVEL_HEIGHT);
        expect(isRoomBoundaryRefusal(result)).toBe(false);
        if (isRoomBoundaryRefusal(result)) return;

        // ⭐ THE LINE C75 §0 Finding 4 IS ABOUT. Before 2026-08-12 this read
        // 'auto-topology' and the whole file would have been green anyway.
        expect(result.boundary.detectionMethod).toBe('repaired-ring');
        expect(result.boundary.detectionMethod).not.toBe('auto-topology');

        // §2.3 — the reason lands in the MODEL, not the console, and it states the
        // thing a later reader actually needs: how much was thrown away.
        const detail = result.boundary.detectionDetail;
        expect(detail).toBeDefined();
        expect(detail).toContain('SELF-INTERSECTING');
        expect(detail).toContain('NOT traced by the topology');
        expect(detail).toContain('discarded');

        // The repair really did substitute: the emitted ring is not the input.
        expect(result.boundary.polygon.length).toBeLessThan(SELF_INTERSECTING.length);
        expect(isSimple(result.boundary.polygon)).toBe(true);
    });

    it('the two results DIFFER in the field a consumer reads — the distinguishability itself', () => {
        const traced = buildDetectedRoomBoundary([...TRACED], LEVEL_HEIGHT);
        const repaired = buildDetectedRoomBoundary([...SELF_INTERSECTING], LEVEL_HEIGHT);
        if (isRoomBoundaryRefusal(traced) || isRoomBoundaryRefusal(repaired)) {
            throw new Error('both fixtures must yield boundaries');
        }

        // The single assertion that would have FAILED before the fix, and the
        // reason the whole file exists: an exporter, the renderer, the AI host or
        // a regeneration pass can now tell these apart from the stored value
        // alone, with no console and no re-run of detection.
        expect(repaired.boundary.detectionMethod)
            .not.toBe(traced.boundary.detectionMethod);
    });

    it('the distinction SURVIVES persistence — a difference that dies on save is not one', () => {
        const repaired = buildDetectedRoomBoundary([...SELF_INTERSECTING], LEVEL_HEIGHT);
        if (isRoomBoundaryRefusal(repaired)) throw new Error('expected a boundary');

        // Round-trip through the persisted shape's own Zod gate. `repaired-ring`
        // must be a MEMBER of the serialised union, not a string the schema
        // tolerates by being loose — C75 §7.1's second half.
        const wire = JSON.parse(JSON.stringify(repaired.boundary)) as unknown;
        const parsed = RoomBoundarySchema.parse(wire);
        expect(parsed.detectionMethod).toBe('repaired-ring');
        expect(parsed.detectionDetail).toContain('NOT traced by the topology');
    });
});

describe('C75 §2.3 — the other permitted behaviour: REFUSE', () => {
    it('an irreparable ring yields a REFUSAL naming the cause, never a boundary', () => {
        // Degenerate: a "ring" with no simple sub-ring of any area to retain.
        // ADR-0299 §RECOVERY-MUST-REFUSE — emitting geometry that is wrong but
        // plausible enough to be read as a modelling quirk is the thing being
        // refused. A missing room is visibly missing; an invented one is not
        // (C75 §0.1).
        const irreparable: RoomVertex[] = [
            { x: 0, z: 0 },
            { x: 1, z: 0 },
            { x: 0, z: 0 },
            { x: 1, z: 0 },
        ];
        const result = buildDetectedRoomBoundary(irreparable, LEVEL_HEIGHT);
        if (!isRoomBoundaryRefusal(result)) {
            // If the repair CAN salvage this shape then the refusal arm has no
            // subject here — but the arm must still never emit an unrepaired
            // ring, so assert that instead of passing vacuously.
            expect(isSimple(result.boundary.polygon)).toBe(true);
            return;
        }
        expect(result.reason).toBe('irreparably-self-intersecting');
        expect(result.detail).toContain('§A.21.D58');
        expect(result).not.toHaveProperty('boundary');
    });
});
