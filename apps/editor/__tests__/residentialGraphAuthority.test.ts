/**
 * §RESI-DOUBLE-ROOM-TAGS (ADR-0069 GR1) regression.
 *
 * The founder saw EVERY space in a generated residential building ship with TWO
 * superimposed rooms: the correct name (e.g. "Kitchen", "Bedroom 1") AND a generic
 * duplicate "Room NN". ROOT CAUSE: the resi executor marked a level
 * graph-authoritative only DEEP inside the deferred `_finishApartments` batch — but
 * the structural batch dispatches the apartment walls via the async bus, and the
 * RoomTopologyObserver auto-redetected those levels in the gap (after the 1 s
 * post-batch cooldown, before the finish batch marked them) → it minted the generic
 * "Room NN" set, which `_finishApartments` then doubled with the NAMED graph rooms.
 *
 * FIX: decide graph-authority ONCE and PRE-MARK every apartment level BEFORE any wall
 * commits. These cases pin that contract: the decision is all-or-nothing, every
 * apartment level is pre-marked, and the kill-switch / no-room-polygons paths fall
 * back to legacy detection (no pre-mark → no graph rooms → no doubles either way).
 */
import { describe, it, expect } from 'vitest';
import {
    decideAndPreMarkGraphAuthority,
    type ApartmentBuildLite,
    type GraphAuthorityObserverLike,
} from '../src/ui/residential-building/residentialGraphAuthority.js';

function recordingObserver(): GraphAuthorityObserverLike & { marked: string[] } {
    const marked: string[] = [];
    return { marked, markGraphAuthoritative(levelId: string) { marked.push(levelId); } };
}

const APT = (levelId: string, roomCommandCount: number): ApartmentBuildLite => ({ levelId, roomCommandCount });

describe('decideAndPreMarkGraphAuthority — §RESI-DOUBLE-ROOM-TAGS / ADR-0069 GR1', () => {
    it('pre-marks EVERY apartment level graph-authoritative when builds carry room polygons', () => {
        const obs = recordingObserver();
        const builds = [APT('L1', 4), APT('L1', 3), APT('L2', 5), APT('L3', 4)];

        const { useGraphRooms, apartmentLevelIds } = decideAndPreMarkGraphAuthority(builds, true, obs);

        expect(useGraphRooms).toBe(true);
        // De-duplicated across the two L1 apartments.
        expect([...apartmentLevelIds].sort()).toEqual(['L1', 'L2', 'L3']);
        // Each distinct level pre-marked exactly once — BEFORE any wall commit, so the
        // observer can never auto-redetect a generic "Room NN" to double against.
        expect([...obs.marked].sort()).toEqual(['L1', 'L2', 'L3']);
    });

    it('the decision is consistent with what _finishApartments will pass as skipRedetectRooms', () => {
        // The fix relies on the SAME `useGraphRooms` value driving both the pre-mark AND
        // the deferred batch's `skipRedetectRooms`. With graph polygons present, both are true.
        const obs = recordingObserver();
        const { useGraphRooms } = decideAndPreMarkGraphAuthority([APT('L1', 2)], true, obs);
        expect(useGraphRooms).toBe(true);
        expect(obs.marked).toEqual(['L1']);
    });

    it('falls back to legacy detection (no pre-mark) when the kill-switch is OFF', () => {
        const obs = recordingObserver();
        const { useGraphRooms } = decideAndPreMarkGraphAuthority([APT('L1', 4), APT('L2', 4)], false, obs);
        expect(useGraphRooms).toBe(false);
        // No level pre-marked — detection defines the rooms; no graph rooms minted ⇒ no doubles.
        expect(obs.marked).toEqual([]);
    });

    it('falls back to legacy detection when NO build carries room polygons', () => {
        const obs = recordingObserver();
        const { useGraphRooms } = decideAndPreMarkGraphAuthority([APT('L1', 0), APT('L2', 0)], true, obs);
        expect(useGraphRooms).toBe(false);
        expect(obs.marked).toEqual([]);
    });

    it('is all-or-nothing: any build with room polygons makes the whole batch graph-authoritative', () => {
        // A SINGLE-flag batch (BatchOptions.skipRedetectRooms) cannot skip per-level, so
        // the decision must cover the batch — one apartment with polygons marks every level.
        const obs = recordingObserver();
        const { useGraphRooms } = decideAndPreMarkGraphAuthority([APT('L1', 0), APT('L1', 4), APT('L2', 0)], true, obs);
        expect(useGraphRooms).toBe(true);
        expect([...obs.marked].sort()).toEqual(['L1', 'L2']);
    });

    it('never throws when the observer is missing (pre-init) and still reports the decision', () => {
        const { useGraphRooms, apartmentLevelIds } =
            decideAndPreMarkGraphAuthority([APT('L1', 4)], true, undefined);
        expect(useGraphRooms).toBe(true);
        expect(apartmentLevelIds).toEqual(['L1']);
    });

    it('swallows a throwing observer (stays non-fatal) and still pre-marks the rest', () => {
        let calls = 0;
        const obs: GraphAuthorityObserverLike = {
            markGraphAuthoritative() { calls++; if (calls === 1) throw new Error('observer boom'); },
        };
        expect(() => decideAndPreMarkGraphAuthority([APT('L1', 4), APT('L2', 4)], true, obs)).not.toThrow();
        expect(calls).toBe(2); // both levels attempted despite the first throwing
    });
});
