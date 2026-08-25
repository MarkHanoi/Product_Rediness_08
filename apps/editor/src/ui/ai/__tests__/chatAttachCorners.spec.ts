/**
 * §FIX-CHAT-CORNERS-ARE-THE-FRONT-DOOR (L-11127) — the photo attached in the chat
 * can now carry the user's four corners, and without them the plane is UNKNOWN.
 *
 * ── THE DEFECT ──────────────────────────────────────────────────────────────
 * The founder's reply ledger, verbatim: *"an opening lattice of 5 bay(s) × 7
 * band(s) — read from your photo, confidence 0.00 (under the 0.50 floor), so the
 * generator uses its own window rhythm"*. The chat had no corners step; the plane
 * was unknown; C108 §4.3 zeroed everything downstream; the whole (proven) chain
 * was inert via chat. The same photo with corners in the panel reads 1.00.
 *
 * ── FOUR ARMS ───────────────────────────────────────────────────────────────
 *   ARM A — the OPTIONS the chat passes are pinned: never auto-detect (corners
 *           asked, never assumed), never crop (the corners are clicked on the
 *           decoded frame and a crop would move it under them).
 *   ARM B — ⭐ THE MECHANISM, on the REAL ENGINE and a REAL corpus image: with
 *           `reconstructionOptionsFor(null)` the plane is `needs-user`; with a
 *           user quad it is `user-supplied` and the lattice is derived. This is
 *           the founder's 0.00 → 1.00, reproduced.
 *   ARM C — the PICKER MODULE really imports and exports its entry point (a
 *           module-load throw or a renamed export fails here).
 *   ARM D — THE JOIN: `AIPanel.ts` renders the button AND calls the picker AND
 *           writes the quad back. Source-level and labelled as such: rendering the
 *           real chip needs `createImageBitmap`, which happy-dom lacks — the same
 *           limit `chatAttachReachability.spec.ts` records. The three names are
 *           checked TOGETHER because a button, a picker and a setter can each
 *           exist while nothing connects them (L-10930).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { reconstructFacade } from '@pryzm/facade-reconstruction';
import { caseA } from '@pryzm/facade-reconstruction/testing';
import { reconstructionOptionsFor } from '../chatFacadeAttachment.js';

const AI_PANEL = resolve('apps/editor/src/ui/ai/AIPanel.ts');
const ENGINE_TIMEOUT_MS = 60_000;

describe('§L-11127 · ARM A — the chat never guesses the plane and never moves the frame', () => {
    it('without corners: autoDetect OFF, crop OFF, no quad', () => {
        const o = reconstructionOptionsFor(null);
        expect(o.autoDetectFacadePlane).toBe(false);
        expect(o.cropEnabled).toBe(false);
        expect(o.facadeQuad).toBeUndefined();
    });
    it('with corners: the quad is passed through untouched', () => {
        const quad = [{ x: 1, y: 2 }, { x: 30, y: 2 }, { x: 30, y: 40 }, { x: 1, y: 40 }] as const;
        const o = reconstructionOptionsFor(quad);
        expect(o.facadeQuad).toBe(quad);
        expect(o.autoDetectFacadePlane).toBe(false);
    });
});

describe('§L-11127 · ARM B — the mechanism on the real engine', () => {
    it('no corners ⇒ plane needs-user; corners ⇒ plane user-supplied and a lattice from the openings', async () => {
        const img = caseA().image;

        const without = await reconstructFacade(img, reconstructionOptionsFor(null));
        expect(without.diagnostics.facadeQuad.status).toBe('needs-user');

        const full = [
            { x: 0, y: 0 },
            { x: img.width - 1, y: 0 },
            { x: img.width - 1, y: img.height - 1 },
            { x: 0, y: img.height - 1 },
        ] as const;
        const withCorners = await reconstructFacade(img, reconstructionOptionsFor(full));
        expect(withCorners.diagnostics.facadeQuad.status).toBe('user-supplied');
        // The lattice is USED — the founder's "5 bay(s) × 7 band(s)" that was dropped.
        expect(withCorners.diagnostics.notes.some((n) => n.includes('from THE DETECTED OPENINGS'))).toBe(true);
        expect(withCorners.ir.facade.zones.length).toBeGreaterThan(1);
        expect(withCorners.ir.facade.zones[0]!.cells.length).toBeGreaterThan(1);
    }, ENGINE_TIMEOUT_MS);
});

describe('§L-11127 · ARM C — the picker module loads', () => {
    it('exports pickFacadeCorners', async () => {
        const mod = await import('../chatFacadeCornerPicker.js');
        expect(typeof mod.pickFacadeCorners).toBe('function');
    });
});

describe('§L-11127 · ARM D — the join in the real panel source', () => {
    const src = readFileSync(AI_PANEL, 'utf8');
    it('renders the button, calls the picker, and writes the quad back — all three, together', () => {
        expect(src).toContain("'Set facade corners'");
        expect(src).toContain('pickFacadeCorners({');
        expect(src).toContain('setChatAttachmentQuad(quad)');
    });
    it('says on the chip that a photo without corners will not shape the building', () => {
        expect(src).toContain('corners NOT set');
    });
});
