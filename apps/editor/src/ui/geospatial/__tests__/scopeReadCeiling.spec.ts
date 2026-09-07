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
    CTX_SCOPE_READ_MAX_TILES_POINTS,
} from '../contextExtentBudget';

const BARCELONA = [41.3874, 2.1686] as const;
const MADRID = [40.4168, -3.7038] as const;
const OSLO = [59.9139, 10.7522] as const;
const REYKJAVIK = [64.1466, -21.9426] as const;

describe('§SITE-SCOPE D2 — the read ceiling is measured per site', () => {
    it('the mid-latitude cities are never tighter than the reference they define', () => {
        for (const [lat, lon] of [BARCELONA, MADRID]) {
            const c = scopeReadCompleteCeilingM(lat, lon);
            // §SCOPE-FILL — the reference is now the SAME BUDGET at the reference latitude, not the
            // flat 1 781 m. A southern city can only ever tie or beat it.
            expect(c.tighterThanReference).toBe(false);
            expect(c.radiusM).toBeGreaterThan(CTX_SCOPE_READ_COMPLETE_CEILING_M);
        }
    });

    it('⛔ the NORTH is tighter, at EVERY budget — which the flat constant could not express', () => {
        // ⭐ THE REGRESSION THIS PINS (lane SCOPE-FILL, L-13098). `tighterThanReference` used to be
        // `radiusM < CTX_SCOPE_READ_COMPLETE_CEILING_M`, i.e. against a hard 1 781 m — the ceiling
        // the BUILDINGS cap happens to yield in southern Europe. At the 576-tile POINT budget every
        // one of the six reference cities clears 1 781 m, so that comparison would have reported
        // Reykjavík as NOT tighter: the flag would have flipped to the exact opposite of the fact it
        // exists to carry, silently, on a budget change. Comparing to the same budget's ceiling at a
        // fixed reference latitude is cap-independent, so the property holds at both.
        for (const cap of [CTX_SCOPE_READ_MAX_TILES_POINTS, 112, 64]) {
            for (const [lat, lon] of [OSLO, REYKJAVIK]) {
                const here = scopeReadCompleteCeilingM(lat, lon, cap);
                const ref = scopeReadCompleteCeilingM(...BARCELONA, cap);
                expect(here.tighterThanReference, `${lat}° at cap ${cap}`).toBe(true);
                expect(here.radiusM).toBeLessThan(ref.radiusM);
                // The over-claim is not marginal — it is the whole point.
                expect(ref.radiusM - here.radiusM).toBeGreaterThan(200);
            }
        }
    });

    it('⭐ the POINT budget is the default, and it reaches materially further than the old one', () => {
        // The lane's own finding, pinned as a number rather than a sentence: `trees` is the only
        // layer a coarser read actually costs (tippecanoe's default --drop-rate 2.5, measured 0.400
        // per step), so the ceiling is bisected for ITS budget — and that budget reaches ~2.4× the
        // old buildings-cap ceiling at Barcelona.
        const c = scopeReadCompleteCeilingM(...BARCELONA);
        expect(c.capTiles).toBe(CTX_SCOPE_READ_MAX_TILES_POINTS);
        expect(c.radiusM).toBeGreaterThan(2 * CTX_SCOPE_READ_COMPLETE_CEILING_M);
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
        expect(c.capTiles).toBe(CTX_SCOPE_READ_MAX_TILES_POINTS);
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
        // The shortfall is quoted against the reference the flag was ACTUALLY compared to, so the
        // sentence and the boolean can never disagree.
        const ref = scopeReadCompleteCeilingM(...BARCELONA).radiusM;
        expect(c.line).toContain(String(ref - c.radiusM));
        expect(c.line).toContain(String(ref));
    });

    it('⛔ NEGATIVE CONTROL — an absurdly small cap makes even the floor refuse, and it says so', () => {
        // Guards the `neverCompleteHere` arm, which no test city reaches. Without this the arm is
        // unreachable code asserting a state nobody has seen — exactly the kind of "refusal branch
        // that was never exercised" this repo keeps finding.
        const c = scopeReadCompleteCeilingM(...REYKJAVIK, 1);
        expect(c.neverCompleteHere).toBe(true);
        expect(c.radiusM).toBe(CTX_SCOPE_MIN_RADIUS_M);
        expect(c.line).toContain('NEVER COMPLETE HERE');
        expect(c.line).toContain('NOT a canopy-completeness promise');
        // ⛔ AND IT MUST NOT LIBEL THE LAYERS THAT ARE FINE. A refusal that reads as "no context
        // here" would be the §CONTEXT-DATA-HONESTY failure this whole module exists to close.
        expect(c.line).toContain('Buildings and linework are unaffected');
    });
});
