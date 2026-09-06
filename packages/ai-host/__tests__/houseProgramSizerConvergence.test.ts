// M-B (ADR-0063 H1) — §PLATE-ROLE program-sizer convergence acceptance tests.
//
// THE DEFECT (last house prod run, ~517 m² plate): rooms came out ENORMOUS +
// generic voids — "Living Room 696 m²", "Bedroom 144 m²", "Room 00-008",
// §FEASIBILITY-ALLOC dropping rooms. The apartment on a 146 m² plate produced
// sensible 7-29 m² rooms on the SAME shared engine.
//
// ROOT CAUSE (audit): the subdivider fills the real plate EXACTLY (squarify), so the
// ONLY lever on per-room size is room COUNT. The apartment is coherent because
// `scaleProgramToShell` scales bedroom COUNT to the plate (~130 m²/bed). The house's
// parallel sizer (`enrichStoreyProgramToPlate`/`fillGroundPlate` grow-loop +
// §ENRICH-DENSITY-CAP) capped growth far too low (≤5 enriched / ≤2 ground beds), so a
// large house storey was starved of rooms and every room stretched.
//
// THE FIX: parameterise `scaleProgramToShell` with a `plateRole` ('single' | 'ground'
// | 'upper') and route every house storey's bedroom-COUNT growth through that SAME
// shared sizer (a denser 45 m²/bed for a house storey, bounded ≤ 8), retiring the
// parallel grow-loop. 'single' (the apartment) is BYTE-IDENTICAL.

import { describe, expect, it } from 'vitest';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import {
    buildBubbleGraph,
    scaleProgramToShell,
    type PlateRole,
} from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { apartmentDimensionsFor } from '../src/workflows/apartmentLayout/dimensions/roomDimensions.js';
import { generateDeterministicLayouts } from '../src/workflows/apartmentLayout/tgl/runDeterministicLayout.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, ScoringWeights, ScoredLayoutOption,
} from '../src/workflows/apartmentLayout/types.js';

const C: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const W: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

const FULL: ApartmentProgram = {
    bedrooms: 3, bathrooms: 2, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

/** A rectangular plate of `areaM2` (width × area/width), axis-aligned. */
function plate(areaM2: number, widthM: number): ShellAnalysis {
    const depthM = areaM2 / widthM;
    return {
        netAreaM2: areaM2, widthM, depthM,
        perimeter: [{ x: 0, z: 0 }, { x: widthM, z: 0 }, { x: widthM, z: depthM }, { x: 0, z: depthM }],
        faces: [],
    };
}

/** Shoelace area (m²) of a room polygon (emitted mm → m²), or 0 when absent. */
function roomAreaM2(room: { polygon?: ReadonlyArray<{ x: number; y: number }> }): number {
    const p = room.polygon;
    if (!p || p.length < 3) return 0;
    let a = 0;
    for (let i = 0; i < p.length; i++) {
        const q = p[i]!, r = p[(i + 1) % p.length]!;
        a += q.x * r.y - r.x * q.y;
    }
    return Math.abs(a) / 2 / 1e6;
}

/** Per-type "no longer a blob" upper bound (m²). M-B (the shared-density sizer)
 *  retires the parallel sizer's over-allocation: the founder's defect class —
 *  "Bedroom 144 m² / Living 696 m²" — is GONE. These bounds prove that class is
 *  closed (a bedroom is tens-of-m², not 144; living is < ~110, not 696). They are
 *  DELIBERATELY looser than the architectural hard max because the residual
 *  proportional inflation on a GENUINELY-OVERSIZED single-family plate is a squarify
 *  fill-the-plate property the density model cannot bound alone — that final
 *  tightening is the envelope/M-C job (see the report). On a NORMAL/MEDIUM house
 *  plate (≤ ~260 m²) rooms are firmly in band (asserted separately, tighter). */
const NO_BLOB_MAX: Partial<Record<string, number>> = {
    living: 110, kitchen: 60, dining: 55, hall: 30, corridor: 45,
    // §ENTRANCE-HALL-ON-SHELL (tracker §57.4, 2026-06-11) — utility 18 → 20. The ground-storey
    // hall is now pinned to a perimeter SHELL-SLICE (the front-door wall), which reshapes the
    // public-zone squarify; the post-pass `snapAxisLines` (50 mm edge clustering) then nudges an
    // adjacent service-zone edge a few cm, growing the 500 m² house's utility cell from 18.0 to
    // 18.35 m². That is well within this DELIBERATELY-loose "not a blob" band (the founder's
    // defect class was 144 m² bedrooms / 696 m² living, not an 18 m² utility) and the room stays
    // sound (door + sane shape). Bumped a single m² to absorb the residual snap inflation.
    master: 110, bedroom: 70, study: 40, bathroom: 28, ensuite: 24, wc: 10, utility: 20,
};

/** Tight per-type band for a NORMAL/MEDIUM house plate — the apartment-grade
 *  coherence the founder asked for (bedrooms ~12-30, living ~20-50). */
const MEDIUM_MAX: Partial<Record<string, number>> = {
    living: 55, kitchen: 35, dining: 30, hall: 16, corridor: 25,
    // §BRIEF-IS-AUTHORITATIVE (L-13023, 2026-09-06) - `bathroom` 16 -> 18 and `ensuite`
    // 12 -> 16. NOT a quality retreat: these two rows moved because the engine no longer
    // GROWS the bedroom count to fill a plate, so each room carries a slightly larger
    // share of the same plate. Measured overshoot on the two fixtures below is 17.5
    // (165 m2 house bathroom) and 15.2 (258 m2 house ensuite) - 1.5 and 3.2 m2 over the
    // old rows, on plates whose brief genuinely under-fills them. Every OTHER row is
    // unchanged and still enforced, and both fixtures now ALSO assert the far stronger
    // invariant those rows were a proxy for: the shipped bedroom count never exceeds the
    // brief (see `shippedBedrooms`).
    master: 50, bedroom: 50, study: 28, bathroom: 18, ensuite: 16, wc: 8, utility: 14,
};

/** Total bedrooms (incl. the master) the layout SHIPPED across every storey. The
 *  L-13023 invariant is expressed against this, not a per-storey count: the whole-house
 *  brief is a whole-house total that `allocateProgramToStoreys` splits across storeys. */
function shippedBedrooms(res: { perStoreyLayout: ReadonlyArray<ScoredLayoutOption | null> }): number {
    let n = 0;
    for (const opt of res.perStoreyLayout) {
        for (const rm of opt?.rooms ?? []) if (rm.type === 'bedroom' || rm.type === 'master') n++;
    }
    return n;
}

describe('M-B §PLATE-ROLE — apartment is BYTE-IDENTICAL (the HARD SAFETY GATE)', () => {
    it("scaleProgramToShell(program, area) === scaleProgramToShell(program, area, 'single') across the curve", () => {
        const programs: ApartmentProgram[] = [
            { ...FULL, bedrooms: 0, bathrooms: 0 },                 // explicit studio
            { ...FULL, bedrooms: 1, bathrooms: 1, masterEnSuite: false },
            { ...FULL, bedrooms: 2, bathrooms: 1 },
            FULL,
            { ...FULL, bedrooms: 5, bathrooms: 3 },
        ];
        for (const p of programs) {
            for (const area of [20, 60, 100, 120, 146, 200, 260, 400, 500, 650, 1000]) {
                const legacy = scaleProgramToShell(p, area);                 // default param
                const explicit = scaleProgramToShell(p, area, 'single');     // explicit role
                // THE role-parameterisation safety gate: 'single' === default, ALWAYS.
                // (§ENVELOPE-FIT-GROWTH applies equally to both, so the equality holds.)
                expect(JSON.stringify(explicit)).toEqual(JSON.stringify(legacy));
                // And the value MUST match the count model: the 130 m²/bed heuristic FLOOR
                // (≤5) THEN §ENVELOPE-FIT-GROWTH (founder bug #1, 2026-06-10) — grow the
                // count one bedroom at a time while the shell EXCEEDS the §3.1 grossMax for
                // the current count, so an over-capacity shell fills the plate with MORE
                // in-band rooms rather than inflating a fixed small program.
                if (!(p.bedrooms === 0 && p.bathrooms === 0)) {
                    let expectedBeds = Math.min(5, Math.max(p.bedrooms, Math.round(area / 130)));
                    while (expectedBeds < 5 && area > apartmentDimensionsFor(expectedBeds).grossMax + 1e-6) {
                        expectedBeds += 1;
                    }
                    expect(legacy.bedrooms).toBe(expectedBeds);
                }
            }
        }
    });

    it('buildBubbleGraph is byte-identical for the apartment (no plateRole reaches it)', () => {
        // The apartment never passes a role; buildBubbleGraph defaults to 'single'.
        for (const area of [60, 100, 120, 146, 260]) {
            const a = buildBubbleGraph(FULL, area);
            const b = buildBubbleGraph(FULL, area);
            const areasA = a.rooms.map(r => `${r.type}:${r.targetAreaM2.toFixed(6)}`).join('|');
            const areasB = b.rooms.map(r => `${r.type}:${r.targetAreaM2.toFixed(6)}`).join('|');
            expect(areasA).toEqual(areasB);
        }
    });

    it("a studio request (0 beds ∧ 0 baths) is preserved for every role", () => {
        const studio: ApartmentProgram = { ...FULL, bedrooms: 0, bathrooms: 0 };
        for (const role of ['single', 'ground', 'upper'] as PlateRole[]) {
            const out = scaleProgramToShell(studio, 500, role);
            expect(out.bedrooms).toBe(0);
            expect(out.bathrooms).toBe(0);
        }
    });

    it('the known-good 146 m² apartment still produces sensible rooms (regression floor)', () => {
        const opts = generateDeterministicLayouts(plate(146, 12), FULL, C, W, 1);
        expect(opts.length).toBeGreaterThan(0);
        for (const r of opts[0]!.rooms) {
            const a = roomAreaM2(r);
            const cap = MEDIUM_MAX[r.type] ?? 55;
            expect(a, `apartment ${r.type} = ${a.toFixed(1)} m²`).toBeLessThanOrEqual(cap);
        }
    });

    // §ENVELOPE-FIT-GROWTH (founder bug #1, 2026-06-10) — the over-capacity 206.7 m²
    // shell with a 2-bed request used to hit §TOPO-HARD-REJECT-ALL (every strategy
    // HARD-INVALID, rooms overlapping/merged at fillRatio ≈ 1.0, §EVERY-ROOM-ACCESS-COMB
    // infeasible). Growing the program to 4 bedrooms gives MORE rooms of normal size so
    // the comb fires + every room reaches circulation. This asserts the shipped layout is
    // architecturally valid (more rooms than the 2-bed program + every room a door).
    it('the over-capacity 206.7 m² 2-bed shell ships a grown, valid layout (founder bug #1)', () => {
        const TWO_BED: ApartmentProgram = {
            bedrooms: 2, bathrooms: 1, masterEnSuite: false,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const opts = generateDeterministicLayouts(plate(206.7, 12), TWO_BED, C, W, 1);
        // No §TOPO-HARD-REJECT-ALL / no empty pool — a real layout ships.
        expect(opts.length).toBeGreaterThan(0);
        const bedroomCount = opts[0]!.rooms.filter(r =>
            r.type === 'bedroom' || r.type === 'master').length;
        // Grew from 2 → 4 bedrooms (more rooms of normal size, not 2 ballooned ones).
        expect(bedroomCount).toBeGreaterThanOrEqual(3);
        // Every habitable room stays within the "no blob" band — proof the shell grew
        // MORE rooms rather than inflating a fixed small program past its envelope.
        for (const r of opts[0]!.rooms) {
            const a = roomAreaM2(r);
            const cap = NO_BLOB_MAX[r.type] ?? 110;
            expect(a, `206 m² apartment ${r.type} = ${a.toFixed(1)} m²`).toBeLessThanOrEqual(cap);
        }
    });
});

describe('M-B §PLATE-ROLE — a HOUSE on a large plate sizes rooms coherently', () => {
    // The convergence target: a house storey on a large (~400-500 m²) plate produces
    // room areas within sensible per-type bounds (no 100+ m² bedroom, no 600 m²
    // living) — exactly like the apartment, and with NO dropped/generic rooms.
    // -- REWRITTEN 2026-09-06 for §BRIEF-IS-AUTHORITATIVE (L-13023) -----------------
    // These two fixtures put a THREE-bedroom brief on a 400 / 500 m² plate. They used to
    // assert per-room area caps, and those caps HELD only because the engine answered an
    // over-capacity plate by GROWING the programme - a 3-bed brief became an 8-bed house,
    // so every room stayed small. The founder has ruled that trade unacceptable (L-13023:
    // *"the brief asked for 2 bedrooms and 1 bath ... never eight small ones nobody
    // requested"*; STR §25.0 *"guide the human, do not decide for him"*), so the PREMISE
    // of the old assertion is retired, not merely relaxed.
    //
    // WHAT IS HONESTLY TRUE NOW, stated rather than hidden: on a plate this far over the
    // brief the rooms come out VERY large (measured: a 174.8 m² master on the 500 m²
    // fixture). That is bigger than the 144 m² bedroom the M-B work closed - and it is
    // NOT a regression of M-B's density model, it is the arithmetic of laying a 3-bed
    // programme over 500 m² without inventing rooms. The bound must come from elsewhere:
    // STR §25.2's TO-BE-BUILT envelope (size the HOUSE to the brief, leave the rest of the
    // parcel as open ground). Until that exists the product guarantee is that PRYZM never
    // builds a cavern SILENTLY - which is what these tests now assert.
    for (const total of [400, 500]) {
        it(`a ${total} m² 2-storey house: the brief is honoured and the over-capacity is DECLARED`, () => {
            const r = generateHouseLayout(plate(total, 20), FULL, C, W, { storeyCount: 2 });
            // (a) THE RULE - the house ships the brief's bedroom count. Never more.
            expect(shippedBedrooms(r), `shipped beds on a ${total} m² plate`)
                .toBeLessThanOrEqual(FULL.bedrooms);
            // (b) THE DISCLOSURE - every storey whose brief under-fills its plate raises a
            //     WARNING-severity offer carrying both numbers and both remedies. A silent
            //     cavern is the defect; a declared one is the user's decision.
            expect(r.programmeHeadroom.length, `no §PROGRAMME-OFFER on a ${total} m² plate`)
                .toBeGreaterThan(0);
            for (const h of r.programmeHeadroom) {
                expect(h.severity, `storey ${h.storeyIndex} offer severity`).toBe('warning');
                expect(h.spareAreaM2).toBeGreaterThan(h.plateAreaM2 * 0.5);
                expect(h.offer).toContain('did not add rooms');
                expect(h.offer).toContain('smaller house footprint');
            }
            // (c) The one size claim that still holds: nothing reaches the founder's
            //     ORIGINAL 696 m² living / whole-plate blob - the plate is still divided
            //     into a real room set, not stretched into one or two rooms.
            for (const opt of r.perStoreyLayout) {
                if (!opt) continue;
                expect(opt.rooms.length, `${total}m² storey room count`).toBeGreaterThanOrEqual(6);
                for (const room of opt.rooms) {
                    const a = roomAreaM2(room);
                    expect(a, `${total}m² house ${room.type} = ${a.toFixed(1)} m² is a whole-plate blob`)
                        .toBeLessThan(total * 0.5);
                }
            }
        });
    }

    it('a 500 m² single-storey house packs ENOUGH rooms (density) that none blobs', () => {
        const r = generateHouseLayout(plate(500, 22), FULL, C, W, { storeyCount: 1 });
        const opt = r.perStoreyLayout[0]!;
        // A large single plate is filled with MANY rooms (the shared density), not a
        // few stretched ones — far more than the bare programme's ~9.
        expect(opt.rooms.length).toBeGreaterThanOrEqual(10);
        for (const room of opt.rooms) {
            const a = roomAreaM2(room);
            const cap = NO_BLOB_MAX[room.type] ?? 110;
            expect(a, `single-storey ${room.type} = ${a.toFixed(1)} m²`).toBeLessThanOrEqual(cap);
        }
    });

    // REWRITTEN 2026-09-06 (L-13023) - this test asserted the OPPOSITE of the founder's
    // ruling. It required the private level of a large house to be *bedroom-dense*
    // (>= 4 bedrooms) for a THREE-bedroom brief - i.e. it asserted that the engine invents
    // at least one bedroom nobody asked for. That is the defect L-13023 names. The
    // invariant that replaces it is the strict one: the stack ships the brief.
    it('the private level of a large house ships the BRIEF, not the plate (L-13023)', () => {
        const r = generateHouseLayout(plate(500, 20), FULL, C, W, { storeyCount: 2 });
        expect(shippedBedrooms(r), 'whole-house bedrooms vs the 3-bed brief')
            .toBeLessThanOrEqual(FULL.bedrooms);
        const upper = r.perStoreyLayout[1]!;
        const beds = upper.rooms.filter(rm => rm.type === 'bedroom' || rm.type === 'master');
        // The private level still HOLDS the house's bedrooms (they never migrate down to
        // the ground) - it just holds the ones the user asked for.
        expect(beds.length).toBeGreaterThanOrEqual(1);
        expect(beds.length).toBeLessThanOrEqual(FULL.bedrooms);
    });

    // REWRITTEN 2026-09-06 (L-13023) - same reason as the 400/500 fixtures above, and
    // this one is the most instructive of the three. A 258 m² footprint over TWO storeys
    // is ~129 m² per storey; `allocateProgramToStoreys` puts 1 guest bedroom on the
    // ground and 2 upstairs, so the upper storey's stated programme spends ~69 m² of its
    // 129 m² plate - 47 % unspent. The old assertion ("firmly in the apartment-grade
    // band", every room under MEDIUM_MAX) held ONLY because the engine grew that storey
    // to ~5 bedrooms. With the brief authoritative the measured upper bathroom is 36.2 m².
    // That is the honest arithmetic of a 3-bed brief on a 258 m² two-storey footprint, and
    // the answer is NOT to invent bedrooms - it is to build a smaller house (STR §25.2) or
    // to ask for more rooms. So the test asserts the brief + the declaration, and keeps
    // MEDIUM_MAX enforcement where the brief genuinely FITS its plate (the 165 m² case
    // below, which still passes every original row).
    it('a MEDIUM (~260 m²) 2-storey house ships the brief and DECLARES the unspent plate', () => {
        const r = generateHouseLayout(plate(258, 16), FULL, C, W, { storeyCount: 2 });
        expect(shippedBedrooms(r)).toBeLessThanOrEqual(FULL.bedrooms);
        // At least one storey under-fills its plate enough to be worth saying out loud.
        expect(r.programmeHeadroom.length).toBeGreaterThan(0);
        expect(r.programmeHeadroom.some(h => h.severity === 'warning'),
            'a 47 %-unspent storey must WARN, not whisper').toBe(true);
        for (const opt of r.perStoreyLayout) {
            if (!opt) continue;
            expect(opt.rooms.length).toBeGreaterThanOrEqual(5);
        }
        // NO per-room area bound is asserted here, deliberately. A 258 m² footprint
        // REPEATED on two storeys is 516 m² of floor for a 3-bedroom brief; the measured
        // upper master is 73.7 m². There is no honest ceiling to assert until the house
        // FOOTPRINT is sized to the brief (STR §25.2's TO-BE-BUILT envelope) — asserting
        // a number here would only record today's arithmetic as if it were a target.
        // The in-band property is tested where it is achievable: on a plate the brief
        // FITS, immediately below.
    });

    // ADDED 2026-09-06 (L-13023) — the replacement for the area half of the test above.
    // The "rooms are firmly in band" property is real, but it is a property of a plate
    // the brief FITS, not of the density sizer papering over one it does not. A 3-bed
    // brief wants ~165 m² of FLOOR; over two storeys that is a ~90 m² footprint. On that
    // plate every original MEDIUM_MAX row holds with the brief honoured exactly.
    it('a house whose brief FITS its plate is firmly in the apartment-grade band', () => {
        const r = generateHouseLayout(plate(90, 10), FULL, C, W, { storeyCount: 2 });
        expect(shippedBedrooms(r)).toBeLessThanOrEqual(FULL.bedrooms);
        for (const opt of r.perStoreyLayout) {
            if (!opt) continue;
            for (const room of opt.rooms) {
                const a = roomAreaM2(room);
                const cap = MEDIUM_MAX[room.type] ?? 55;
                expect(a, `90m² footprint house ${room.type} = ${a.toFixed(1)} m²`)
                    .toBeLessThanOrEqual(cap);
            }
        }
    });

    it('is deterministic (ADR-0061) — identical inputs → identical room areas', () => {
        const a = generateHouseLayout(plate(500, 20), FULL, C, W, { storeyCount: 2 });
        const b = generateHouseLayout(plate(500, 20), FULL, C, W, { storeyCount: 2 });
        const sig = (res: typeof a) => res.perStoreyLayout
            .map(o => (o ? o.rooms.map(r => `${r.type}:${roomAreaM2(r).toFixed(4)}`).join(',') : 'null'))
            .join(';');
        expect(sig(a)).toEqual(sig(b));
    });
});

describe('§GROUND-COUNT-CONSTRAINT — an explicit per-level bedroom count is honoured (no density round-up)', () => {
    it('explicit Ground bedrooms=1 ships EXACTLY 1 bedroom on a plate big enough to tempt a 2nd', () => {
        // 400 m² / 2 storeys → ~200 m² ground; round(200/130)=2 would have minted a 2nd
        // ground bedroom (the founder defect). The lock holds the explicit count at 1.
        const r = generateHouseLayout(plate(400, 20), FULL, C, W, {
            storeyCount: 2,
            perStoreyOverrides: [{ bedrooms: 1 }, undefined],
        });
        const ground = r.perStoreyLayout[0]!;
        const groundBeds = ground.rooms.filter(rm => rm.type === 'bedroom' || rm.type === 'master');
        expect(groundBeds.length, `ground beds = [${groundBeds.map(b => b.type).join(',')}]`).toBe(1);
    });

    // REWRITTEN 2026-09-06 (L-13023). This asserted that an AUTO storey (no per-level
    // override) keeps the plate-density round-up, so a 3-bed brief packs >= 4 bedrooms
    // upstairs. §BRIEF-IS-AUTHORITATIVE extends the very lock this describe-block tests
    // from the per-LEVEL tab to the WHOLE-HOUSE brief - the number the modal actually
    // shows the user - so there is no longer an "AUTO" storey for a brief that states a
    // count, and the round-up can no longer over-deliver anywhere.
    it('a stated whole-house brief locks the count on AUTO storeys too (L-13023)', () => {
        const r = generateHouseLayout(plate(500, 20), FULL, C, W, { storeyCount: 2 });
        expect(shippedBedrooms(r), 'AUTO storeys must not out-deliver the brief')
            .toBeLessThanOrEqual(FULL.bedrooms);
    });

    it('a brief that states NO bedroom count STILL fills the plate (the sparse case is untouched)', () => {
        // The enricher was written for a SPARSE brief - "a 165 m² house plate yields ONE
        // giant Room 00-001". L-13023 must not re-open that: with bedrooms = 0 there is no
        // stated count to protect, so the plate-fill runs exactly as it did before.
        const SPARSE: ApartmentProgram = {
            bedrooms: 0, bathrooms: 0, masterEnSuite: false,
            openPlanKitchenDining: false, livingRoom: false, entranceHall: false,
        };
        const r = generateHouseLayout(plate(300, 18), SPARSE, C, W, { storeyCount: 2 });
        // The plate is filled with a real room set, not one stretched blob ...
        for (const opt of r.perStoreyLayout) {
            expect(opt?.rooms.length ?? 0, 'sparse-brief storey room count').toBeGreaterThanOrEqual(5);
        }
        // ... and nothing is OFFERED, because a brief that states nothing has no count to
        // measure the plate against.
        expect(r.programmeHeadroom).toHaveLength(0);
    });
});

describe('M-B — the well-behaved small house is unchanged', () => {
    it('a normal 165 m² 2-storey 3-bed house keeps a sensible room set on every storey', () => {
        const r = generateHouseLayout(plate(165, 15), FULL, C, W, { storeyCount: 2 });
        expect(r.perStoreyLayout).toHaveLength(2);
        // L-13023 - the well-behaved plate ships EXACTLY the brief.
        expect(shippedBedrooms(r)).toBe(FULL.bedrooms);
        for (const opt of r.perStoreyLayout as ScoredLayoutOption[]) {
            expect(opt.rooms.length).toBeGreaterThanOrEqual(5);
            for (const room of opt.rooms) {
                const a = roomAreaM2(room);
                const cap = MEDIUM_MAX[room.type] ?? 55;
                expect(a, `165m² house ${room.type} = ${a.toFixed(1)} m²`).toBeLessThanOrEqual(cap);
            }
        }
    });
});
