// §GEN-PHOTO-BRIEF (L-11020) — the IR -> generation-brief mapper, asserted against
// the C108 synthetic corpus's KNOWN GROUND TRUTH.
//
// ⛔ THE RULE THIS FILE OBEYS (C108 §6.2, inherited deliberately): "no error
// thrown", "the object is defined" and "a brief was produced" are NOT assertions.
// Every `expect` below compares a computed value to a number the corpus GENERATOR
// DREW, or to a threshold this module declares and justifies.
//
// ⚠ L-11001 STANDS. The façade engine has never seen a real photograph. These
// cases are synthetic with known ground truth, and a green run here says nothing
// about a phone camera.

import { describe, expect, it } from 'vitest';

import { reconstructFacade } from '@pryzm/facade-reconstruction';
import { caseA, caseC, caseD, caseJ } from '@pryzm/facade-reconstruction/testing';

import {
    BALCONY_COVERAGE_THRESHOLD,
    FACADE_PHOTO_CONFIDENCE_FLOOR,
    GROUND_ARCH_THRESHOLD,
    mapFacadeIRToPhotoBrief,
} from '../src/intents/FacadePhotoBrief.js';

describe('§GEN-PHOTO-BRIEF — storeys are MEASURED from the image', () => {
    it('derives the DRAWN storey count from case A (4 storeys), not a default', async () => {
        const c = caseA();
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(c.image));
        expect(brief.refusal).toBeNull();
        // ⭐⭐ THE NUMBER THE PHOTOGRAPH CONTRIBUTES. `c.truth.storeys` is 4 because
        // the generator DREW four storeys.
        expect(brief.storeys).toBe(c.truth.storeys);
    });

    it('the same count survives case J (fixed-seed sensor noise)', async () => {
        const c = caseJ();
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(c.image));
        expect(brief.storeys).toBe(c.truth.storeys);
    });

    it('carries a confidence at or above the declared floor on clean corpus input', async () => {
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(caseA().image));
        expect(brief.storeysConfidence).not.toBeNull();
        expect(brief.storeysConfidence!).toBeGreaterThanOrEqual(FACADE_PHOTO_CONFIDENCE_FLOOR);
        expect(brief.storeysBelowFloor).toBe(false);
    });

    it('names the storey count in `read` with its confidence, so the card can show it', async () => {
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(caseA().image));
        const storeyReading = brief.read.find((r) => r.label === '4 storeys');
        expect(storeyReading).toBeDefined();
        expect(storeyReading!.confidence).toBe(brief.storeysConfidence);
    });
});

describe('§GEN-PHOTO-BRIEF — archness ⇒ groundCommercialCurtain, at a corpus-fixed threshold', () => {
    it('case C (semicircular heads, drawn archness 1) maps to an arcaded ground floor', async () => {
        const c = caseC();
        expect(c.truth.archness).toBe(1);
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(c.image));
        expect(brief.facade.groundCommercialCurtain).toBe(true);
    });

    it('case A (drawn archness 0) does NOT — the flat grid is not an arcade', async () => {
        const c = caseA();
        expect(c.truth.archness).toBe(0);
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(c.image));
        expect(brief.facade.groundCommercialCurtain).toBeUndefined();
    });

    it('the threshold sits between the two MEASURED means, not on top of either', async () => {
        const arched = await reconstructFacade(caseC().image);
        const flat = await reconstructFacade(caseA().image);
        const meanGroundArch = (r: typeof arched): number => {
            const zones = [...r.ir.facade.zones].sort((a, b) => a.y - b.y);
            const openings = zones[0]!.cells.flatMap((cell) => (cell.opening === null ? [] : [cell.opening]));
            return openings.reduce((a, o) => a + o.archness, 0) / openings.length;
        };
        expect(meanGroundArch(arched)).toBeGreaterThan(GROUND_ARCH_THRESHOLD);
        expect(meanGroundArch(flat)).toBeLessThan(GROUND_ARCH_THRESHOLD);
    });
});

describe('§GEN-PHOTO-BRIEF — the soffit cue ⇒ balconies (L-11021: NOT protrusion.depth)', () => {
    it('case D draws a balcony slab at all 3 interior storey lines and maps to balconies', async () => {
        const c = caseD();
        expect(c.truth.soffitBandHeight).toBeGreaterThan(0);
        const result = await reconstructFacade(c.image);
        // ⭐ THE ENGINE WAS FIXED, AND THIS ASSERTION IS WHAT TOLD US (L-10979).
        // It used to read `toBe(0)` with the note: *"the IR's own protrusion channel
        // is EMPTY on the one case that draws balconies — the ±2 px soffit↔lattice
        // match misses by 3 px. Asserted, so that if the engine is ever fixed this
        // test tells us rather than silently passing either way."* It did exactly
        // that: lane FACADEREAL60 moved the lattice onto the DETECTED OPENINGS
        // (C108 §3.4, L-10971), so the zone boundaries now fall midway between
        // opening centres — which is where a storey line actually is — instead of
        // at the comb's quiet phase, and the soffit cue lands inside the tolerance.
        // ⛔ The mapper's SOURCE is unchanged: it still reads the diagnostics, so
        // `balconies` does not depend on this channel. The channel simply stopped
        // being empty. 3 interior storey lines x 5 bays = 15 cells.
        const protrusions = result.ir.facade.zones
            .flatMap((z) => z.cells)
            .filter((cell) => cell.protrusion !== null);
        expect(protrusions.length).toBe((c.truth.storeys - 1) * c.truth.bays);
        // ⛔ And the DEPTH is still UNKNOWN in every one of them (C108 §3.10,
        // L-11005). A channel that filled in is not a channel that started claiming.
        for (const cell of protrusions) {
            expect(cell.protrusion!.depth).toBeNull();
            expect(cell.protrusion!.unknownReason).toBe('geometry-incomplete');
        }
        // ...and the cue IS in the diagnostics, at every interior line.
        expect(result.diagnostics.soffits.length).toBe(c.truth.storeys - 1);

        const brief = mapFacadeIRToPhotoBrief(result);
        expect(brief.facade.balconies).toBe(true);
    });

    it('case A draws no soffit at all, so balconies are not claimed', async () => {
        const result = await reconstructFacade(caseA().image);
        expect(result.diagnostics.soffits.length).toBe(0);
        const brief = mapFacadeIRToPhotoBrief(result);
        expect(brief.facade.balconies).toBeUndefined();
    });

    it('case D covers 3/3 storey lines — above the declared coverage threshold', async () => {
        const c = caseD();
        const result = await reconstructFacade(c.image);
        const coverage = result.diagnostics.soffits.length / (c.truth.storeys - 1);
        expect(coverage).toBeGreaterThanOrEqual(BALCONY_COVERAGE_THRESHOLD);
    });

    it('⛔ says the DEPTH was not read, even when balconies ARE applied', async () => {
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(caseD().image));
        expect(brief.facade.balconies).toBe(true);
        expect(brief.notUsed.some((n) => n.includes('balcony DEPTH'))).toBe(true);
    });
});

describe('§GEN-PHOTO-BRIEF — ⛔ what the photograph may NEVER supply', () => {
    it('§L-11128 — emits facadeColor ONLY at or above the floor, as the exact S17 hex; names it either way', async () => {
        for (const c of [caseA(), caseC(), caseD(), caseJ()]) {
            const result = await reconstructFacade(c.image);
            const brief = mapFacadeIRToPhotoBrief(result);
            const wall = result.diagnostics.colour.wall;
            const conf = result.diagnostics.colour.confidence;
            if (wall !== null && conf !== null && conf >= 0.5) {
                expect(brief.facade.facadeColor).toBe(wall.hex);
                expect(brief.read.some((r) => r.label.startsWith('a façade colour of #') && !r.belowFloor)).toBe(true);
            } else {
                expect('facadeColor' in brief.facade).toBe(false);
                expect(brief.notUsed.some((n) => n.includes('COLOUR'))).toBe(true);
            }
        }
    });

    it('never lets the FALSIFIED tile pitch (L-11012) reach the brief', async () => {
        const result = await reconstructFacade(caseA().image);
        // The engine DOES report a grid surface with a confidence...
        expect(result.ir.facade.surface.pattern).toBe('grid');
        expect(result.ir.facade.surface.confidence).not.toBeNull();
        // ...and the brief carries it as NOT-USED, with the falsification named.
        const brief = mapFacadeIRToPhotoBrief(result);
        expect(brief.notUsed.some((n) => n.includes('L-11012'))).toBe(true);
        // ⛔ Nothing tile-shaped is in the applied façade fields.
        expect(Object.keys(brief.facade).every((k) =>
            ['groundCommercialCurtain', 'balconies', 'roofGarden', 'facadeColor'].includes(k),
        )).toBe(true);
    });

    it('always states that the SIZE comes from the footprint, never the image', async () => {
        const brief = mapFacadeIRToPhotoBrief(await reconstructFacade(caseA().image));
        expect(brief.notUsed.some((n) => n.includes('SIZE'))).toBe(true);
    });
});

describe('§GEN-PHOTO-BRIEF — refusals name what was measured and what was needed (C74)', () => {
    it('refuses a 2-band image with no openings as "not a façade", quoting BOTH counts', async () => {
        // A flat grey field: the pipeline runs, finds bands, finds no apertures.
        const width = 200;
        const height = 200;
        const data = new Uint8ClampedArray(width * height * 4);
        for (let i = 0; i < width * height; i += 1) {
            data[i * 4] = 180;
            data[i * 4 + 1] = 180;
            data[i * 4 + 2] = 180;
            data[i * 4 + 3] = 255;
        }
        const brief = mapFacadeIRToPhotoBrief(
            await reconstructFacade({ width, height, data }),
        );
        expect(brief.refusal).not.toBeNull();
        expect(brief.storeys).toBeNull();
        // BOTH numbers, per C74: what it measured and what it needed.
        expect(brief.refusal!).toMatch(/opening\(s\)/);
        expect(brief.refusal!).toMatch(/at least 2 bands/);
    });
});
