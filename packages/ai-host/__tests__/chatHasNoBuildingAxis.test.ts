// §CHAT-HAS-NO-BUILDING-AXIS (L-13302, 2026-09-09)
// ═══════════════════════════════════════════════════════════════════════════
//
// THE FOUNDER, 2026-09-09: *"i am not sure if the engine via RAC / Bulk chat AI
// works efficiently across multiple footprints… if i say create windows on all
// walls - it should create windows in all walls on all the envelopes of all
// houses on the parcel."*
//
// The audit answered YES for "all" (project-wide stores, no building partition
// — see windowsAllWallsAcrossBuildings.test.ts). This file is about the very
// next sentence he will type, *"…in block b"*, which every family answered:
//
//     "I can't find a room 'block b'. The rooms here are: 00-001 (Kitchen).
//      I searched compass orientations, colours, finishes, levels, rooms or
//      wall types — 'block b' is on none of them."
//
// ⛔ TRUE, EXHAUSTIVE, AND STILL THE WRONG ANSWER — and it is `QualifierAxes`'
// own founding defect displaced by one step. The refusal no longer mistakes one
// axis for the whole vocabulary; it correctly names six. The user still walks
// away believing they misspelled a room, when what they actually did was name a
// real thing on an axis THAT DOES NOT EXIST. ADR-0383 gave `SpaceEnvelope` a
// `group` and ADR-0385 made `hierarchyStore` the containment authority; neither
// reaches the chat stack, so PRYZM cannot scope to a block and cannot even
// count the blocks it would refuse for.
//
// ⭐ THE FIRST DESCRIBE BLOCK IS THE ONE THAT MATTERS, because it drives the
// production path rather than the one this lane edited
// ([[committed-is-not-reachable]]). "delete all windows in block b" is refused
// inside the EDITOR BRIDGE's room-scope miss branch, not inside ai-host — the
// bridge calls `unmatchedQualifierTail` at
// `apps/editor/src/ui/ai/ZeroTokenChatBridge.ts:452-470`. That call site is
// already wired, which is why this fix needed no editor change; the arm below
// reproduces that branch verbatim so the claim "the founder sees this" is
// measured and not asserted.

import { describe, it, expect } from 'vitest';
import {
    unmatchedQualifierTail,
    absentAxisFor,
    ABSENT_QUALIFIER_AXES,
} from '../src/intents/QualifierAxes.js';
import { BUILDING_PLACE_NOUN_SRC, namesABuildingPlace } from '../src/intents/SpatialScopeTail.js';
import { describeRoomRow } from '../src/intents/roomNumberMatch.js';
import type { ResolverContext } from '../src/intents/ZeroTokenResolver.js';

const LEVELS = [{ id: 'L0', name: 'Level 0', elevation: 0 }];
const ROOMS = [{ id: 'r1', name: 'Kitchen', roomNumber: '00-001' }];

/** The MINIMAL context the bridge builds for the axis probe — levels and rooms
 *  it actually read, and nothing else, so no axis claims a search it did not
 *  run (§CONTEXT-DATA-HONESTY). Reproduced from the bridge, not invented. */
function bridgeAxisCtx(): ResolverContext {
    return {
        selection: [],
        levels: LEVELS.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation })),
        rooms: ROOMS.map((r) => ({ id: r.id, name: r.name, roomNumber: r.roomNumber })),
        mintId: () => '',
    } as unknown as ResolverContext;
}

/** `ZeroTokenChatBridge.ts:452-470`, verbatim — the sentence the founder reads
 *  when a room-scoped request names something that is not a room. */
function bridgeRoomRefusal(roomRef: string, elementKind: string): string {
    const labels = ROOMS.map((r) => describeRoomRow(r)).filter((n) => n.length > 0).slice(0, 8);
    const axisTail = unmatchedQualifierTail(roomRef, elementKind, bridgeAxisCtx(), {
        searchedAxis: 'room',
        searchedNoun: 'room',
    });
    return (labels.length === 0
        ? `There are no rooms in this project yet — detect rooms first.`
        : `I can't find a room "${roomRef}". The rooms here are: ${labels.join(', ')}.`) + axisTail.tail;
}

// ─────────────────────────────────────────────────────────────────────────────

describe("⭐ THE LAYER THE FOUNDER SEES — the bridge's room-scope miss", () => {
    it('"block b" is named as a BUILDING, not implied to be a misspelled room', () => {
        const said = bridgeRoomRefusal('block b', 'window');
        // The honest half that already existed stays — the refusal still says
        // what it searched, and still lists the rooms.
        expect(said).toContain('I can\'t find a room "block b"');
        expect(said).toContain('00-001 (Kitchen)');
        expect(said).toContain('is on none of them');
        // ⭐ THE NEW HALF: the axis PRYZM does not have, named as such.
        expect(said).toContain('reads as a building');
        expect(said).toContain('cannot scope a request to one building on a parcel yet');
        // ⛔ AND THE ESCAPE HATCH. A refusal whose "no" branch leaves the user
        // with nothing to type is a regression with a citation attached
        // ([[refusing-half-needs-its-escape-hatch]]).
        expect(said).toContain('select that block\'s windows and say "the selected windows"');
    });

    it('the workaround is phrased for the ELEMENT KIND that was asked about', () => {
        expect(bridgeRoomRefusal('tower 2', 'wall')).toContain('the selected walls');
        expect(bridgeRoomRefusal('tower 2', 'door')).toContain('the selected doors');
    });

    it('⛔ a plain unknown room is UNCHANGED — no building sentence is invented', () => {
        const said = bridgeRoomRefusal('pantry', 'wall');
        expect(said).toContain('I can\'t find a room "pantry"');
        expect(said).not.toContain('building');
        expect(said).not.toContain('reads as a');
    });
});

describe('the absent-axis table', () => {
    it('claims every building noun the shared vocabulary knows', () => {
        for (const t of ['block b', 'building 2', 'tower 2', 'the complex', 'blocks']) {
            expect(absentAxisFor(t)?.id, `"${t}"`).toBe('building');
        }
    });

    it('⛔ respects the word boundary — "blocked" is not a block', () => {
        // A substring match here would turn ordinary refusals into confident
        // nonsense about buildings.
        for (const t of ['blocked', 'unblocked', 'complexity']) {
            expect(absentAxisFor(t), `"${t}"`).toBeNull();
        }
    });

    it('does not claim a real room, orientation or finish', () => {
        for (const t of ['the kitchen', 'south', 'white paint', 'pantry']) {
            expect(absentAxisFor(t), `"${t}"`).toBeNull();
        }
    });

    it('every row states BOTH what it cannot do AND what to say instead', () => {
        // The two halves are what separate an honest refusal from a dead end;
        // a future row that omits either would ship the dead end.
        expect(ABSENT_QUALIFIER_AXES.length).toBeGreaterThan(0);
        for (const a of ABSENT_QUALIFIER_AXES) {
            expect(a.cannot.length, a.id).toBeGreaterThan(20);
            expect(a.insteadSay('wall').length, a.id).toBeGreaterThan(10);
            // "yet" is the exit condition made visible: this row is deleted when
            // the axis is built, and the copy must not read as permanent.
            expect(a.cannot, a.id).toContain('yet');
        }
    });
});

describe('⛔ REGRESSION GUARD — the axis REDIRECTS are untouched', () => {
    // These are §CHAT-AXIS-AWARE-REFUSAL's original founder cases (L-10942). An
    // absent-axis note must never pre-empt a redirect that actually works.
    it('"south" still redirects to the orientation axis with a working sentence', () => {
        const r = unmatchedQualifierTail('south', 'window', bridgeAxisCtx(), {
            searchedAxis: 'room', searchedNoun: 'room',
        });
        expect(r.tail).toContain('IS a compass orientation');
        expect(r.tail).toContain('change all windows in the south facade');
        expect(r.redirects.length).toBeGreaterThan(0);
        expect(r.tail).not.toContain('building');
    });

    it('"segmental" still redirects to the opening-shape axis', () => {
        const r = unmatchedQualifierTail('segmental', 'window', bridgeAxisCtx(), {
            searchedAxis: 'type', searchedNoun: 'window type',
        });
        expect(r.tail).toContain('IS a opening shape');
        expect(r.redirects.length).toBeGreaterThan(0);
    });
});

describe('ONE building-noun list, two callers', () => {
    it('the shared source rebuilds the apartment grammar regex BYTE-IDENTICALLY', () => {
        // ⭐ THE POINT OF THE CONSOLIDATION, pinned. `APT_PLACE_BUILDING_RE` in
        // ZeroTokenResolver.ts is now built from `BUILDING_PLACE_NOUN_SRC`
        // instead of repeating the four alternatives. If a later edit widens the
        // shared list (to "house", say) this arm goes red, which is correct:
        // that changes which sentences the apartment grammar DECLINES, and it is
        // a measured decision, never a side effect of sharing a string.
        const rebuilt = new RegExp(String.raw`\b${BUILDING_PLACE_NOUN_SRC}\b`);
        const asItWas = /\b(?:buildings?|blocks?|towers?|complex)\b/;
        expect(rebuilt.source).toBe(asItWas.source);
        expect(rebuilt.flags).toBe(asItWas.flags);
    });

    it('the predicate and the regex agree on every token', () => {
        const asItWas = /\b(?:buildings?|blocks?|towers?|complex)\b/;
        for (const t of ['block b', 'building', 'towers', 'complex', 'blocked', 'the kitchen', 'house 2']) {
            expect(namesABuildingPlace(t), `"${t}"`).toBe(asItWas.test(t));
        }
    });
});
