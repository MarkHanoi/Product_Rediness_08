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
import { parseApartmentLayoutIntent } from '../src/intents/ZeroTokenResolver.js';
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

// ═════════════════════════════════════════════════════════════════════════════
// §HOUSE-IS-A-BUILDING-NOUN (L-13302 part 2, lane REFUTED-FIX 2026-09-10)
// ═════════════════════════════════════════════════════════════════════════════
//
// ⛔ THE FIX ABOVE MISSED THE FOUNDER'S OWN WORD, and a verifier measured it
// through the real `absentAxisFor` / `unmatchedQualifierTail`:
//
//     BUILDING_PLACE_NOUN_SRC === (?:buildings?|blocks?|towers?|complex)
//     ⇒ "house 2", "the houses" and "house" DO NOT FIRE.
//
// The sentence that opened L-13302 is, verbatim: *"it should create windows in
// all walls on all the envelopes of ALL HOUSES on the parcel."* The teaching
// example the fix shipped with was "in block b" — a phrase the founder never
// typed — while the noun he actually used fell straight through to
// "I can't find a room 'house 2'". So the axis-aware refusal existed and was
// unreachable by the one sentence that motivated it.
//
// ── THE MEMBERSHIP, AND WHY EACH DECISION IS THE ONE IT IS ──────────────────
//
// INCLUDED (`houses?`, `villas?`) — both are SHIPPED building-typology nouns in
// this package, not words chosen here: `ZeroTokenResolver.ts:5675` maps
// /\bhouse\b|\bvilla\b/ to the `'house'` typology of `generate-building`, and
// `BuildFromEnvelope.ts:244` stands down on the same two. A noun the product
// already treats as "a whole building it can generate" is exactly a noun a user
// will reach for to name one building among several on a parcel.
//
// EXCLUDED, each for a measured reason rather than taste:
//   · `bungalow` — appears ONLY in `BuildFromEnvelope`'s stand-down guard and in
//     NO typology mapping, so it fails the rule the two inclusions pass. Adding
//     it would be padding the list to look thorough.
//   · `unit(s)` — ⛔ COLLIDES, and the collision is in this same file's grammar:
//     `APT_SCOPE_NOT_A_PLACE_RE` lists `units?` among the phrases that are NOT a
//     place ("the unit" = the shell being filled), and the whole apartment
//     vocabulary uses "unit" for a DWELLING. A noun that resolves to two axes is
//     worse than one that resolves to none.
//   · `plot` — LAND, not a building. PRYZM has a real parcel/site axis
//     (@pryzm/site-parcel-data); answering "reads as a building, and PRYZM
//     cannot scope to one building yet" for a plot would be a confident wrong
//     sentence about an axis that does exist.
//   · `phase` — a DELIVERY grouping that spans buildings, not a building.
//   · `block` — already in the list since L-13302.
//
// ⭐ THE CONSEQUENCE IS MEASURED, NOT ASSUMED. The list has two callers, and the
// L-13302 header warned that widening it "would silently change which sentences
// the apartment grammar declines". So the arm below drives the REAL
// `parseApartmentLayoutIntent` rather than pinning a regex source, and the
// decline is asserted as the intended behaviour it is: "an apartment in house 2"
// is a building-scoped ask, exactly like "an apartment in block b", and both
// belong to an axis that does not exist yet.

describe("⭐ §HOUSE-IS-A-BUILDING-NOUN — the founder's own word fires the axis", () => {
    it('"house", "houses" and "house 2" land on the BUILDING axis', () => {
        for (const t of ['house', 'houses', 'house 2', 'the houses', 'all houses']) {
            expect(absentAxisFor(t)?.id, `"${t}"`).toBe('building');
        }
    });

    it('"villa" lands there too — it is the same shipped typology noun as "house"', () => {
        for (const t of ['villa', 'villas', 'villa 3', 'the villas']) {
            expect(absentAxisFor(t)?.id, `"${t}"`).toBe('building');
        }
    });

    it("the founder's verbatim phrase reads as a building place", () => {
        // "…create windows in all walls on all the envelopes of all houses on
        // the parcel." — the noun phrase the scope tail carries out of it.
        expect(namesABuildingPlace('all houses on the parcel')).toBe(true);
        expect(namesABuildingPlace('all the envelopes of all houses')).toBe(true);
    });

    it('⭐ the sentence the founder reads names the building axis and an escape hatch', () => {
        const said = bridgeRoomRefusal('house 2', 'window');
        expect(said).toContain('I can\'t find a room "house 2"');
        expect(said).toContain('reads as a building');
        expect(said).toContain('cannot scope a request to one building on a parcel yet');
        expect(said).toContain('select that block\'s windows and say "the selected windows"');
    });

    it('⛔ the EXCLUDED nouns stay off the axis, each for its own reason', () => {
        for (const t of [
            'unit 2', 'the units',   // dwelling vocabulary — APT_SCOPE_NOT_A_PLACE_RE owns it
            'plot 4', 'the plots',   // land, and there is a real parcel axis
            'phase 2',               // a delivery grouping, not a building
            'bungalow 1',            // no typology mapping — inclusion would be padding
        ]) {
            expect(absentAxisFor(t), `"${t}"`).toBeNull();
        }
    });

    it('⛔ still respects the word boundary — a greenhouse is not a house', () => {
        for (const t of ['greenhouse', 'housed', 'housing', 'housekeeping', 'villager']) {
            expect(absentAxisFor(t), `"${t}"`).toBeNull();
        }
    });
});

describe('ONE building-noun list, two callers', () => {
    it('⭐ the MEMBERSHIP is pinned, so a widening is always a deliberate edit', () => {
        // Not a byte-identity pin against the ORIGINAL four any more — that arm
        // existed to make this widening deliberate, and it did its job. What it
        // is replaced by is the same guard against the same drift: the list is
        // stated here, so growing it silently is impossible, and every member
        // has a reason recorded in this file's header.
        expect(BUILDING_PLACE_NOUN_SRC).toBe(
            String.raw`(?:buildings?|blocks?|towers?|complex|houses?|villas?)`,
        );
    });

    it('the predicate reads exactly the shared source, and nothing else', () => {
        const fromSource = new RegExp(String.raw`\b${BUILDING_PLACE_NOUN_SRC}\b`, 'i');
        for (const t of [
            'block b', 'building', 'towers', 'complex', 'house 2', 'the villas',
            'blocked', 'greenhouse', 'the kitchen', 'unit 2', 'plot 4',
        ]) {
            expect(namesABuildingPlace(t), `"${t}"`).toBe(fromSource.test(t));
        }
    });

    it('⭐ THE SECOND CALLER, DRIVEN FOR REAL — the apartment grammar declines a building place', () => {
        // `APT_PLACE_BUILDING_RE` is built from the shared source, so widening it
        // widens what this grammar hands back to `generate-building`. Measured
        // through the real parser rather than pinned as a regex string, because
        // a regex pin proves the constant equals itself — the exact defect the
        // sibling cadastral spec was refuted for on 2026-09-10.
        expect(parseApartmentLayoutIntent('create a 3 bedroom apartment in block b')).toBeNull();
        expect(parseApartmentLayoutIntent('create a 3 bedroom apartment in house 2')).toBeNull();
        expect(parseApartmentLayoutIntent('create a 3 bedroom apartment in villa 3')).toBeNull();
        // ⛔ AND THE OTHER HALF: an ordinary room place is STILL claimed. A
        // widening that quietly stopped claiming real sentences would be a
        // regression wearing this fix's name.
        const kept = parseApartmentLayoutIntent('create a 3 bedroom apartment in room 00-001');
        expect(kept).not.toBeNull();
        expect(kept!.intent).toBe('generate-apartment-layout');
    });
});
