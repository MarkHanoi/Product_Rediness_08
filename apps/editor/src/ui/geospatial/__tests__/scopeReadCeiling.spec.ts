/**
 * §SITE-SCOPE D2 — THE COMPLETENESS MARK MUST BE TRUE WHERE THE FOUNDER IS STANDING.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * WHAT THESE PIN, AND HOW THE DEFECT WAS FOUND
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * `CTX_SCOPE_READ_COMPLETE_CEILING_M` is a single constant, 1 781 m, and the slider's "complete"
 * mark was driven straight off it. It was measured on Barcelona / Madrid / Córdoba / Lisbon, where
 * the default scope's fetch bbox needs 81 / 81 / 64 / 81 zoom-16 tiles against a 112-tile cap.
 *
 * It was found to be false in the north by RE-RUNNING the repo's own arithmetic rather than reading
 * the table it is written under — the same discipline the constant's own doc comment demands two
 * paragraphs above itself. At Oslo the identical 1 781 m scope needs 169 tiles and at Reykjavík 225,
 * so `zoomForExtent` has already stepped both reads below z16 AT THE DEFAULT SCOPE, and the bake's
 * `--drop-densest-as-needed` has therefore already deleted footprints from their dense cores —
 * while the caption said *"Complete at this scope"*.
 *
 * ⚠ THESE ARE REAL MEASUREMENTS THROUGH THE REAL FUNCTIONS. Nothing here is a fixture: every number
 * below comes out of `farFetchHalfDeg` → `contextFetchBbox` → `tileCountCovering`, the same three
 * the tile reader itself calls. What they CANNOT tell you is whether a given city's bake actually
 * holds z16 everywhere inside that radius — that is a bake fact, not a geometry fact.
 */

import { describe, it, expect } from 'vitest';
import { scopeReadCompleteCeilingM, SCOPE_READ_FULL_ZOOM } from '../scopeReadCeiling';
import {
    CTX_SCOPE_READ_COMPLETE_CEILING_M,
    CTX_SCOPE_MIN_RADIUS_M,
    CTX_SCOPE_MAX_RADIUS_M,
    CTX_BUILDINGS_MAX_TILES_PER_FETCH,
} from '../contextExtentBudget';

const BARCELONA = [41.3874, 2.1686] as const;
const MADRID = [40.4168, -3.7038] as const;
const OSLO = [59.9139, 10.7522] as const;
const REYKJAVIK = [64.1466, -21.9426] as const;

describe('§SITE-SCOPE D2 — the read ceiling is measured per site', () => {
    it('the mid-latitude cities keep the constant that was measured on them', () => {
        // The reference is not wrong — it is wrong OUTSIDE the cities it was measured on. Pinning
        // that keeps this suite from reading as "the old number was nonsense".
        for (const [lat, lon] of [BARCELONA, MADRID]) {
            const c = scopeReadCompleteCeilingM(lat, lon);
            expect(c.radiusM).toBeGreaterThanOrEqual(CTX_SCOPE_READ_COMPLETE_CEILING_M);
            expect(c.tighterThanReference).toBe(false);
        }
    });

    it('⛔ the NORTH is tighter, and the flat constant over-claimed there', () => {
        for (const [lat, lon] of [OSLO, REYKJAVIK]) {
            const c = scopeReadCompleteCeilingM(lat, lon);
            expect(c.tighterThanReference, `${lat}° should be tighter than the reference`).toBe(true);
            expect(c.radiusM).toBeLessThan(CTX_SCOPE_READ_COMPLETE_CEILING_M);
            // The over-claim is not marginal — it is the whole point.
            expect(CTX_SCOPE_READ_COMPLETE_CEILING_M - c.radiusM).toBeGreaterThan(200);
        }
    });

    it('Reykjavík is tighter than Oslo, which is tighter than Barcelona — the 1/cos φ ordering', () => {
        const bcn = scopeReadCompleteCeilingM(...BARCELONA).radiusM;
        const osl = scopeReadCompleteCeilingM(...OSLO).radiusM;
        const rvk = scopeReadCompleteCeilingM(...REYKJAVIK).radiusM;
        expect(bcn).toBeGreaterThan(osl);
        expect(osl).toBeGreaterThan(rvk);
    });

    it('the ceiling it returns really is the LAST radius inside the cap — one metre more is over', () => {
        // The bisection's own postcondition, checked against the same function the reader calls, so
        // a monotonicity mistake shows up as a failure rather than as a plausible number.
        const c = scopeReadCompleteCeilingM(...OSLO);
        expect(c.tilesAtCeiling).toBeLessThanOrEqual(c.capTiles);
        expect(c.capTiles).toBe(CTX_BUILDINGS_MAX_TILES_PER_FETCH);
        const justOver = scopeReadCompleteCeilingM(...OSLO, c.tilesAtCeiling - 1);
        expect(justOver.radiusM).toBeLessThanOrEqual(c.radiusM);
    });

    it('every verdict is inside the slider range — a mark off the track is not a mark', () => {
        for (const [lat, lon] of [BARCELONA, MADRID, OSLO, REYKJAVIK]) {
            const c = scopeReadCompleteCeilingM(lat, lon);
            expect(c.radiusM).toBeGreaterThanOrEqual(CTX_SCOPE_MIN_RADIUS_M);
            expect(c.radiusM).toBeLessThanOrEqual(CTX_SCOPE_MAX_RADIUS_M);
        }
    });

    it('⛔ an unknown origin ADMITS it rather than answering as if it were Barcelona', () => {
        const c = scopeReadCompleteCeilingM(Number.NaN, Number.NaN);
        expect(c.radiusM).toBe(CTX_SCOPE_READ_COMPLETE_CEILING_M);
        expect(c.tilesAtCeiling).toBe(-1);                 // -1 = not measured, never a count
        expect(c.line).toContain('NOT MEASURED');
        expect(c.line).toContain('admission');
    });

    it('the line carries BOTH numbers — the radius and the tiles it was measured at', () => {
        const c = scopeReadCompleteCeilingM(...REYKJAVIK);
        expect(c.line).toContain(String(c.radiusM));
        expect(c.line).toContain(String(c.tilesAtCeiling));
        expect(c.line).toContain(`z${SCOPE_READ_FULL_ZOOM}`);
        // ⛔ A cap that drops something must SAY so, with the metre figure it drops from.
        expect(c.line).toContain('TIGHTER');
        expect(c.line).toContain(String(CTX_SCOPE_READ_COMPLETE_CEILING_M - c.radiusM));
    });

    it('⛔ NEGATIVE CONTROL — an absurdly small cap makes even the floor refuse, and it says so', () => {
        // Guards the `neverCompleteHere` arm, which no test city reaches. Without this the arm is
        // unreachable code asserting a state nobody has seen — exactly the kind of "refusal branch
        // that was never exercised" this repo keeps finding.
        const c = scopeReadCompleteCeilingM(...REYKJAVIK, 1);
        expect(c.neverCompleteHere).toBe(true);
        expect(c.radiusM).toBe(CTX_SCOPE_MIN_RADIUS_M);
        expect(c.line).toContain('NEVER COMPLETE HERE');
        expect(c.line).toContain('NOT a completeness promise');
    });
});
