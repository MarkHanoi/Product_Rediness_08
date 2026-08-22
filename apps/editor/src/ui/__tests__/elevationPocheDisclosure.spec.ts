/**
 * §ELEVATION-POCHE-NEEDS-A-VIEW-TYPE-ROW (L-3904) — THE CONTROL MUST SAY WHAT IT
 * CANNOT DO.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT WAS MEASURED, AND WHAT IS *NOT* BEING CLAIMED
 * ─────────────────────────────────────────────────────────────────────────────
 * The founder set slab -> `cut` -> FILL STYLE `poche`, FILL COLOUR grey on the
 * **Element Rules** tab and reported that plan honours it and elevation does not.
 * Measured 2026-08-22, both halves are working exactly as built:
 *
 *   • Elevation DOES emit a `:cut` band (§ELEV-LINEWEIGHT / L-182) and the poché pass
 *     DOES run for elevations (`_ELEVATION_SCOPE.poche === true`, §ELEVATION-POCHE-IS-
 *     INTENT-DECLARED / L-1601). The brief's hypothesis that elevation emits "edges,
 *     not faces" and therefore has nothing to fill is **REFUTED** — it emits fillable
 *     regions, and `elevationCutPocheIsIntentDeclared.test.ts` fills them GREEN.
 *   • Elevation poché is gated on `viewTypeDeclaresCutFill()`: the fill must be declared
 *     FOR THE ELEVATION VIEW TYPE (a View Modifiers row). A fill on the intent's BASE
 *     element rules — what the Element Rules tab writes — is deliberately not enough,
 *     because every system intent seeds plan poché tones there (slab #dcdcdc, wall
 *     #c9c9c9) and honouring them would flood the façade — §FIX-ELEVATION-POCHE (L-119).
 *
 * So this is NOT a styling bug and NOT an unbuilt feature. It is a control that accepts
 * a value which, for one whole view family, nothing can ever draw — and said nothing.
 * The escape hatch already existed and was simply never NAMED where the user setting the
 * value would see it ([[refusing-half-needs-its-escape-hatch]]).
 *
 * This suite pins the DISCLOSURE, and pins it to the `cut` state only — on `projection`
 * / `beyond` / `hidden` the sentence would be false, and a note that is sometimes wrong
 * is worse than no note.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PANEL_SRC = readFileSync(
    resolve(__dirname, '../VisibilityIntentPanel.ts'),
    'utf-8',
);

describe('§ELEVATION-POCHE-NEEDS-A-VIEW-TYPE-ROW (L-3904) — the disclosure', () => {
    it('the Element Rules appearance form renders the note', () => {
        expect(PANEL_SRC).toContain('${this.renderElevationPocheNote()}');
    });

    it('the note is scoped to the CUT state — it is false for any other state', () => {
        const body = PANEL_SRC.slice(PANEL_SRC.indexOf('private renderElevationPocheNote'));
        expect(body).toContain("if (this.selectedState !== 'cut') return '';");
    });

    it('it NAMES the surface that does work, rather than only refusing', () => {
        const body = PANEL_SRC.slice(PANEL_SRC.indexOf('private renderElevationPocheNote'));
        const note = body.slice(0, body.indexOf('\n    }'));
        expect(note).toContain('View Modifiers');
        expect(note).toMatch(/elevation/i);
    });

    /**
     * The note sits inside one big template literal. A stray backtick in it terminates
     * the literal mid-file and takes the whole panel with it — a trap this repo has
     * sprung before. Cheap to pin, so pinned.
     */
    it('the note introduces no unbalanced backticks', () => {
        const body = PANEL_SRC.slice(PANEL_SRC.indexOf('private renderElevationPocheNote'));
        const note = body.slice(0, body.indexOf('\n    }'));
        expect((note.match(/`/g) ?? []).length % 2).toBe(0);
    });
});
