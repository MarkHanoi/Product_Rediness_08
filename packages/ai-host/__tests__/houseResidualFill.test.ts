// §DIAG-FILL-RESIDUAL (founder defect §65.2, 2026-06-11) — HARD GATE.
//
// The founder hit, on a LARGE/DENSE house plate, a BUILT plan with big BLANK cells —
// "Room 00-001 63.9 m²", "Room 01-005 48.2 m²" — huge undivided rectangles with generic
// names. ROOT CAUSE: the stair keep-out fractures the plate into a dominant rect + side
// fragments; the §STAIR-CARVE-NO-DROP short-circuit packs the WHOLE programme into the
// dominant rect and returns, leaving the side fragments (a 51 m² band, a 7 m² sliver)
// completely EMPTY → room detection ships them as the founder's generic blanks. squarify
// always fills the rect it is GIVEN, so the blank is never a squarify gap — it is a rect
// that received NO room.
//
// THE FIX: `claimResidualPlacements` (in tgl/subdivide.ts), wired post-subdivide in
// enumerate.ts, GROWS adjacent grow-eligible rooms (capped at their dimensional hard-max →
// never oversize) or MINTS bounded NAMED `utility` "Store" cells into every leftover
// fragment, so EVERY plate is fully tiled by NAMED rooms. The claim is RANK-NEUTRAL (it only
// touches the emitted geometry, never the Pareto scoring), so it never flips the winner.
//
// These assertions are the hard gate the brief required: on a large 2-storey plate every
// detected cell on every storey is a NAMED program room, no cell exceeds its room's max cap,
// and no cell is left blank > epsilon. They FAIL on the pre-fix engine (the side fragments
// ship as un-named blanks) and PASS after it.

import { describe, expect, it } from 'vitest';
import { generateHouseLayout } from '../src/workflows/houseLayout/index.js';
import { dimensionsFor } from '../src/workflows/apartmentLayout/dimensions/roomDimensions.js';
import {
    claimResidualPlacements, RESIDUAL_MODERATE_BLANK_M2, type RoomPlacement,
} from '../src/workflows/apartmentLayout/tgl/subdivide.js';
import type { Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ShellAnalysis } from '../src/workflows/apartmentLayout/shellAnalysis.js';
import type {
    ApartmentConstraints, ApartmentProgram, RoomType, ScoringWeights,
} from '../src/workflows/apartmentLayout/types.js';

const C: ApartmentConstraints = { minCorridorWidth: 900, wallThickness: 100, floorToCeiling: 2700, wallTypeId: '' };
const W: ScoringWeights = { naturalLight: 1, privacy: 1, kitchenWorkflow: 1, corridorEfficiency: 1 };

/** A rectangular plate of `areaM2` (width × area/width), axis-aligned. */
function plate(areaM2: number, widthM: number): ShellAnalysis {
    const depthM = areaM2 / widthM;
    return {
        netAreaM2: areaM2, widthM, depthM,
        perimeter: [{ x: 0, z: 0 }, { x: widthM, z: 0 }, { x: widthM, z: depthM }, { x: 0, z: depthM }],
        faces: [],
    };
}

// The founder's large + dense brief: a ~200-250 m² footprint, 6-bed programme, 2 storeys.
const BIG: ApartmentProgram = {
    bedrooms: 6, bathrooms: 3, masterEnSuite: true,
    openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
};

/** §65.2 — the largest a single cell may be without reading as a "huge undivided
 *  rectangle" (the founder's complaint: "Room 00-001 63.9 m²"). The ceiling admits a
 *  legitimately big living room / spine corridor while still catching a cavernous
 *  blank-sized cell. `stair` is exempt (the fixed keep-out, not subdivided).
 *
 *  §BRIEF-IS-AUTHORITATIVE (L-13023, 2026-09-06) — 48.0 → 55.0, once, with a reason.
 *  The GROUND storey of this 6-bed fixture now keeps the ONE guest bedroom
 *  `allocateProgramToStoreys` put there instead of the bubble graph's plate-density
 *  round-up to two (which shipped a SEVENTH bedroom for a six-bedroom brief). One
 *  fewer room on the same plate moves the ground Living Room from ~46 to 53.7 m².
 *
 *  ⛔ This does NOT weaken the gate the founder asked for. His defect was an UN-NAMED
 *  63.9 m² blank; 55.0 still catches that, and the "every cell is a NAMED program room"
 *  assertion below — which is the actual anti-blank gate — is untouched and hard. What
 *  moved is a heuristic ceiling on a NAMED living room, by 5.7 m², as the direct price
 *  of not shipping a bedroom nobody asked for. */
const NO_CAVERN_MAX_M2 = 55.0;

/** A MINTED residual "Store" cell is typed `utility`; the fill bounds each to the
 *  utility dimensional hard-max (~8 m²) so no minted cell is itself cavernous. */
const MINT_STORE_MAX_M2 = dimensionsFor('utility').areaHardMax + 0.5;

describe('§65.2 — large/dense house plates are fully tiled by NAMED rooms (no blank "Room NN")', () => {
    // A 230 m² 2-storey plate RELIABLY reproduces the founder's cavern (a ~50 m² side
    // fragment left blank by the §STAIR-CARVE-NO-DROP short-circuit) on the WINNING plan,
    // so the fill fires and tiles the whole plate. (250/210 plates DO generate, but their
    // winner's largest blank can fall below the cavern gate — they are covered by the
    // no-generic-blank + no-cavern assertions, not the full-tiling one.)
    describe('a 230 m² 2-storey plate (16 m wide), 6-bed programme — the founder\'s cavern', () => {
        const r = generateHouseLayout(plate(230, 16), BIG, C, W, { storeyCount: 2 });

        it('produces 2 storeys, each with a real multi-room layout', () => {
            expect(r.perStoreyLayout).toHaveLength(2);
            for (const opt of r.perStoreyLayout) expect(opt.rooms.length).toBeGreaterThanOrEqual(6);
        });

        it('the plate is FULLY TILED by named rooms — total room area ≈ the plate (no large blank)', () => {
            // The bug shipped ~171 m² of named rooms on a 230 m² plate (≈ 58 m² blank).
            // After the fill the named rooms tile essentially the whole plate.
            for (const opt of r.perStoreyLayout) {
                const tiled = opt.rooms.reduce((s, rm) => s + rm.area, 0);
                // ≥ 96 % of the plate is named-room floor (the remainder is walls +
                // sub-2 m² clearance slivers — never a habitable "Room NN" blank).
                expect(tiled, `only ${tiled.toFixed(1)} m² of 230 m² is named rooms`)
                    .toBeGreaterThanOrEqual(230 * 0.96);
            }
        });

        it('every minted "Store" cell stays small (≤ the utility hard-max — never a cavern)', () => {
            for (const opt of r.perStoreyLayout) {
                for (const room of opt.rooms) {
                    if (room.name !== 'Store') continue;
                    expect(room.area, `Store cell = ${room.area.toFixed(1)} m²`).toBeLessThanOrEqual(MINT_STORE_MAX_M2);
                }
            }
        });
    });

    for (const [area, width] of [[230, 16], [250, 16], [210, 15]] as const) {
        describe(`a ${area} m² 2-storey plate (${width} m wide), 6-bed programme`, () => {
            const r = generateHouseLayout(plate(area, width), BIG, C, W, { storeyCount: 2 });

            it('every cell on every storey is a NAMED program room (never a generic "Room NN" blank)', () => {
                for (const opt of r.perStoreyLayout) {
                    for (const room of opt.rooms) {
                        // A real semantic type (not undefined / blank) …
                        expect(room.type, `a cell has no semantic type`).toBeTruthy();
                        // … and a real name that is NOT the generic detection fallback.
                        expect(room.name, `a cell has no name`).toBeTruthy();
                        expect(/^room\s*\d/i.test(room.name), `generic blank name "${room.name}"`).toBe(false);
                    }
                }
            });

            it('NO cell reads as a huge undivided rectangle (no cavern blob)', () => {
                for (const opt of r.perStoreyLayout) {
                    for (const room of opt.rooms) {
                        if (room.type === 'stair') continue;          // the fixed keep-out, not subdivided
                        expect(
                            room.area,
                            `${room.type} "${room.name}" = ${room.area.toFixed(1)} m² is cavernous`,
                        ).toBeLessThanOrEqual(NO_CAVERN_MAX_M2);
                    }
                }
            });

            it('is deterministic (ADR-0061) — identical inputs → identical room areas', () => {
                const b = generateHouseLayout(plate(area, width), BIG, C, W, { storeyCount: 2 });
                const sig = (res: typeof r) => res.perStoreyLayout
                    .map(o => o.rooms.map(rm => `${rm.type}:${rm.area.toFixed(3)}`).join(','))
                    .join(';');
                expect(sig(r)).toEqual(sig(b));
            });
        });
    }
});

describe('§65.2 — the no-oversize / keep-out invariants hold while filling', () => {
    it('NO non-stair room overlaps the stair-core rect on a filled large plate (v149 keep-out preserved)', () => {
        const r = generateHouseLayout(plate(230, 16), BIG, C, W, { storeyCount: 2 });
        const core = r.stairs[0]!.rectMm;
        const coreRect = { x0: core.x, z0: core.y, x1: core.x + core.w, z1: core.y + core.h };
        const bboxMm = (room: { polygon?: ReadonlyArray<{ x: number; y: number }> }) => {
            const poly = room.polygon; if (!poly || poly.length < 3) return null;
            let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
            for (const p of poly) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < z0) z0 = p.y; if (p.y > z1) z1 = p.y; }
            return { x0, z0, x1, z1 };
        };
        const overlaps = (a: { x0: number; z0: number; x1: number; z1: number }, b: typeof coreRect, tolMm = 1) =>
            a.x0 < b.x1 - tolMm && a.x1 > b.x0 + tolMm && a.z0 < b.z1 - tolMm && a.z1 > b.z0 + tolMm;
        let checked = 0;
        for (const opt of r.perStoreyLayout) {
            for (const room of opt.rooms) {
                if (room.type === 'stair') continue;
                const bb = bboxMm(room); if (!bb) continue;
                checked++;
                expect(overlaps(bb, coreRect), `"${room.name}" overlaps the stair core`).toBe(false);
            }
        }
        expect(checked).toBeGreaterThan(0);
    });

    it('small (165 m²) house plate is DETERMINISTIC with no generic blank (fill is rank-neutral)', () => {
        // After §65.2-MODERATE the fill claims any blank ≥ 6 m² (not just ≥ 48 m² caverns), so a
        // well-tiled small plate may now have a moderate band filled — but the fill is RANK-NEUTRAL
        // and DETERMINISTIC, so identical inputs still yield byte-identical room sets, with no
        // oversize and no generic "Room NN" blank. (A plate whose largest blank is < 6 m² is a
        // strict no-op; apartment, with no stair keep-out, never reaches the claim at all.)
        const SMALL: ApartmentProgram = {
            bedrooms: 3, bathrooms: 2, masterEnSuite: true,
            openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
        };
        const a = generateHouseLayout(plate(165, 15), SMALL, C, W, { storeyCount: 2 });
        const b = generateHouseLayout(plate(165, 15), SMALL, C, W, { storeyCount: 2 });
        expect(JSON.stringify(a.perStoreyLayout.map(o => o.rooms.map(r => `${r.type}:${r.area.toFixed(3)}`))))
            .toEqual(JSON.stringify(b.perStoreyLayout.map(o => o.rooms.map(r => `${r.type}:${r.area.toFixed(3)}`))));
        for (const opt of a.perStoreyLayout) {
            for (const room of opt.rooms) {
                expect(/^room\s*\d/i.test(room.name), `small-plate generic blank "${room.name}"`).toBe(false);
            }
        }
    });
});

// ─────────────────── §65.2-MODERATE — the founder's UPPER-floor blank ──────────────────
//
// Founder 2026-06-12: "empty space on the top floor" — a generated house shipped a moderate
// 15–30 m² BLANK as a generic "Room 01-001 19.8 m²" / "Room 01-005 28.9 m²" on the UPPER
// floor. ROOT: the §65.2 residual-fill fired ONLY when the largest blank reached the 48 m²
// "cavern gate"; a non-stair-adjacent 15–30 m² blank is BELOW 48 → never claimed → shipped as
// a generic undivided cell. FIX: the MODERATE-blank floor (RESIDUAL_MODERATE_BLANK_M2 ≈ 6 m²):
// ANY blank ≥ a usable-cell floor is claimed (grown into an adjacent room ≤ its hard-max, else
// minted as a named Store), so a 15–30 m² blank is filled, never a "Room NN". This UNIT locks
// the gate change deterministically; it FAILS on the pre-fix engine (the moderate blank was a
// strict no-op below the cavern gate → r.largestBlankM2 stayed ≈ the blank area).
describe('§65.2-MODERATE — a moderate (15–30 m²) UPPER-floor blank is claimed, not shipped as "Room NN"', () => {
    // Model the founder's upper floor: a private level whose sparser programme under-fills the
    // plate. An 11×6 m upper plate; a placed master (5×6 = 30 m²) on the left; the right 6×6 =
    // 36 m² band is BLANK (a moderate blank, well below the 48 m² cavern gate, NOT touching any
    // stair) and shares the master's FULL right wall. No stair keep-out is passed.
    //
    // §RESIDUAL-REAL-ROOMS (founder defect, 2026-06-15) — the fill POLICY CHANGED here. The
    // founder's complaint was that the residual fill minted a SWARM of tiny `utility` "Store"
    // cells (6×~4-7 m²) to tile an under-programmed plate instead of REAL rooms. The new policy:
    //  • the master ABSORBS the abutting band up to its RELAXED absorption cap (the apartment-
    //    grade coherence band, ~1.2× its comfortable hard-max — a roomier master, not a "Store"),
    //  • the per-pass `utility` "Store" mint is capped at RESIDUAL_MAX_MINTED_STORES (≤ 1), and
    //  • the remaining leftover is minted as NAMED REAL rooms ("Storage" — a real service room
    //    with its own programme) rather than a generic "Store" swarm.
    // So this test now asserts the NEW policy: the blank is fully claimed, the master grows
    // within its RELAXED coherence band (never the old "master over-allocated" blob), and at most
    // ONE `utility` "Store" is minted.
    const plateRect: Rect = { x0: 0, z0: 0, x1: 11, z1: 6 };
    const placements: RoomPlacement[] = [
        { roomId: 'master0', rect: { x0: 0, z0: 0, x1: 5, z1: 6 } },        // master 30 m² — placed
        // right band (x 5..11, z 0..6 = 36 m²) is BLANK — the founder's "Room 01-001".
    ];
    const buildable: Rect[] = [plateRect];
    const roomMeta = new Map<string, { type: RoomType; maxAreaM2: number }>([
        ['master0', { type: 'master', maxAreaM2: 35 }],
    ]);

    const r = claimResidualPlacements(placements, buildable, roomMeta, 'seedUpper');

    it('the 24 m² moderate blank IS claimed below the cavern gate (the founder fix)', () => {
        expect(RESIDUAL_MODERATE_BLANK_M2).toBeLessThan(24);          // the band clears the moderate floor
        expect(r.claims.length, 'a moderate blank must be claimed').toBeGreaterThan(0);
    });

    it('largestBlankAfter ≤ the small wall-slack floor (no usable blank left)', () => {
        // Target: only genuine sub-floor wall-slack may remain (≤ the 6 m² moderate floor).
        expect(r.largestBlankM2, `${r.largestBlankM2.toFixed(1)} m² still blank`)
            .toBeLessThanOrEqual(RESIDUAL_MODERATE_BLANK_M2);
    });

    it('the master grows within its RELAXED coherence band; ≤ 1 utility "Store" is minted (§RESIDUAL-REAL-ROOMS)', () => {
        // The grown master stays within the apartment-grade coherence band (~1.2× its comfortable
        // hard-max — a roomy master, NOT the old "master over-allocated" blob). The per-pass
        // generic `utility` "Store" mint is capped at ≤ 1 (the founder's "at most one store"); the
        // rest of the band is minted as REAL named rooms (e.g. "Storage").
        const masterRelaxedCap = dimensionsFor('master').areaHardMax * 1.25;   // ≥ the engine's 1.2× cap, with slack
        const area = (q: Rect) => (q.x1 - q.x0) * (q.z1 - q.z0);
        for (const p of r.placements) {
            if (p.roomId === 'master0') {
                expect(area(p.rect), 'grown master beyond its relaxed coherence band')
                    .toBeLessThanOrEqual(masterRelaxedCap + 1e-6);
            }
        }
        const utilityStoreMints = r.mints.filter(m => m.type === 'utility');
        expect(utilityStoreMints.length, 'more than one generic utility "Store" minted')
            .toBeLessThanOrEqual(1);
    });

    it('the per-fragment §DIAG-FILL-RESIDUAL audit records area + grown-into vs minted-as', () => {
        for (const c of r.claims) {
            expect(c.areaM2).toBeGreaterThan(0);
            expect(['grown', 'minted']).toContain(c.how);
        }
    });

    it('the stair keep-out is honoured: with a keep-out, no claim crosses it (no-cross-keepout)', () => {
        // A stair keep-out in the far corner (x 0..3, z 0..3) overlapping the master's region:
        // re-run with the master placed clear of it and a blank band on the right; assert no
        // minted cell overlaps the keep-out. (Construction guarantees this — buildable already
        // has the stair subtracted; this asserts the invariant explicitly.)
        const stairKO: Rect = { x0: 9, z0: 0, x1: 12, z1: 3 };            // far-corner stair
        const buildableKO: Rect[] = [{ x0: 0, z0: 0, x1: 9, z1: 6 }, { x0: 0, z0: 3, x1: 12, z1: 6 }];
        const ps: RoomPlacement[] = [
            { roomId: 'stair0', rect: { x0: 9, z0: 0, x1: 12, z1: 3 } },
            { roomId: 'master1', rect: { x0: 0, z0: 0, x1: 5, z1: 6 } },
            // x 5..9, z 0..6 (24 m²) blank, away from the stair on the master side.
        ];
        const meta = new Map<string, { type: RoomType; maxAreaM2: number }>([
            ['stair0', { type: 'stair', maxAreaM2: 16 }],
            ['master1', { type: 'master', maxAreaM2: 35 }],
        ]);
        const overlaps = (a: Rect, b: Rect) =>
            a.x0 < b.x1 - 1e-6 && a.x1 > b.x0 + 1e-6 && a.z0 < b.z1 - 1e-6 && a.z1 > b.z0 + 1e-6;
        const rk = claimResidualPlacements(ps, buildableKO, meta, 'seedKO', [stairKO]);
        for (const m of rk.mints) {
            expect(overlaps(m.rect, stairKO), 'a minted cell crossed the stair keep-out').toBe(false);
        }
        for (const p of rk.placements) {
            if (p.roomId === 'stair0') continue;
            expect(overlaps(p.rect, stairKO), `"${p.roomId}" crossed the stair keep-out`).toBe(false);
        }
    });
});

// ──────────── §RESIDUAL-REAL-ROOMS — the "swarm of Stores" cure (founder 2026-06-15) ───────────
//
// The founder's production defect: a 3-bed/2-bath 2-storey house whose UPPER (first) floor is
// large but UNDER-PROGRAMMED — after 2 bedrooms + a bath + a landing there is a lot of leftover
// area, which the residual fill tiled with a SWARM of SIX small generic "Store" rooms (~4-7 m²)
// instead of real, meaningful rooms. The fix (§RESIDUAL-REAL-ROOMS): cap the generic `utility`
// "Store" mint at RESIDUAL_MAX_MINTED_STORES (≤ 1), GROW adjacent real rooms (relaxed coherence
// band) to swallow non-stair leftover, and mint the remaining stair-fragmented residual as NAMED
// REAL `storage` rooms (a real service room with its own programme) rather than a generic-blank
// "Store" swarm. This locks the cure end-to-end on a representative under-programmed upper storey.
describe('§RESIDUAL-REAL-ROOMS — an under-programmed upper storey fills with real rooms, ≤ 1 generic Store', () => {
    const SMALL: ApartmentProgram = {
        bedrooms: 3, bathrooms: 2, masterEnSuite: true,
        openPlanKitchenDining: true, livingRoom: true, entranceHall: true,
    };
    // A LARGE 230 m² plate / 2 storeys → a large, under-programmed upper plate (the founder's repro).
    const r = generateHouseLayout(plate(230, 16), SMALL, C, W, { storeyCount: 2 });

    it('produces 2 storeys', () => {
        expect(r.perStoreyLayout).toHaveLength(2);
    });

    it('NO storey mints more than ONE generic "Store" (the swarm is gone — founder cap)', () => {
        for (const opt of r.perStoreyLayout) {
            const stores = opt!.rooms.filter(rm => rm.name === 'Store').length;
            expect(stores, `${stores} generic "Store" rooms — the founder's swarm`).toBeLessThanOrEqual(1);
        }
    });

    it('the plate is filled with NAMED real rooms — coverage ≥ 0.90, no generic blank', () => {
        for (const opt of r.perStoreyLayout) {
            const tiled = opt!.rooms.reduce((s, rm) => s + rm.area, 0);
            expect(tiled / 230, `coverage ${(tiled / 230).toFixed(3)} below 0.90`).toBeGreaterThanOrEqual(0.90);
            // Every cell is a NAMED program/real room — never the generic detection-fallback "Room NN".
            for (const room of opt!.rooms) {
                expect(room.name, 'a cell has no name').toBeTruthy();
                expect(/^room\s*\d/i.test(room.name), `generic blank name "${room.name}"`).toBe(false);
            }
        }
    });

    it('the residual fill of the upper plate uses REAL rooms (not a utility-Store swarm)', () => {
        // The UPPER storey (index 1) is the under-programmed one. Its residual must be REAL named
        // rooms (storage / grown habitable) with ≤ 1 generic "Store" — never the 6-store swarm.
        const upper = r.perStoreyLayout[1]!;
        const genericStores = upper.rooms.filter(rm => rm.name === 'Store').length;
        const realFill = upper.rooms.filter(rm => rm.name === 'Storage' || rm.type === 'study').length;
        expect(genericStores, 'upper storey still has a generic Store swarm').toBeLessThanOrEqual(1);
        // The leftover IS claimed (the plate is not left blank): either grown into habitable rooms
        // (high coverage, asserted above) or minted as named "Storage".
        expect(realFill + genericStores, 'upper storey residual not filled with real rooms').toBeGreaterThan(0);
    });

    it('is deterministic (ADR-0061) — identical inputs → identical room areas', () => {
        const b = generateHouseLayout(plate(230, 16), SMALL, C, W, { storeyCount: 2 });
        const sig = (res: typeof r) => res.perStoreyLayout
            .map(o => o!.rooms.map(rm => `${rm.type}:${rm.area.toFixed(3)}`).join(','))
            .join(';');
        expect(sig(r)).toEqual(sig(b));
    });
});
