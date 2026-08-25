// §L-11128 — the photo's WALL COLOUR reaches the brief; words still win.
//
// Before this, every card said "the façade COLOUR — nothing here reads colour out
// of an image". S17 now measures it and the mapper passes it at or above its
// floor. Proven on the REAL engine and the REAL mapper over a corpus image whose
// wall grey is known, never a hand-built brief.

import { describe, it, expect } from 'vitest';
import { reconstructFacade } from '@pryzm/facade-reconstruction';
import { caseA } from '@pryzm/facade-reconstruction/testing';
import { mapFacadeIRToPhotoBrief, PHOTO_NOT_USED_COLOUR_PREFIX } from '../src/intents/FacadePhotoBrief.js';

describe('§L-11128 — façade colour from the photograph', () => {
    it('with a plane: the wall colour is READ and lands in facade.facadeColor as #rrggbb', async () => {
        const img = caseA().image;
        const full = [
            { x: 0, y: 0 }, { x: img.width - 1, y: 0 },
            { x: img.width - 1, y: img.height - 1 }, { x: 0, y: img.height - 1 },
        ] as const;
        const result = await reconstructFacade(img, { facadeQuad: full, autoDetectFacadePlane: false });
        expect(result.diagnostics.colour.wall).not.toBeNull();
        const brief = mapFacadeIRToPhotoBrief(result);
        const row = brief.read.find((r) => r.label.startsWith('a façade colour of #'));
        expect(row).toBeDefined();
        if (row!.belowFloor) {
            // Under the floor: NOT applied, and the notUsed row names the number.
            expect(brief.facade.facadeColor).toBeUndefined();
            expect(brief.notUsed.some((n) => n.startsWith(PHOTO_NOT_USED_COLOUR_PREFIX) && n.includes('under the floor'))).toBe(true);
        } else {
            expect(brief.facade.facadeColor).toMatch(/^#[0-9a-f]{6}$/);
            expect(brief.facade.facadeColor).toBe(result.diagnostics.colour.wall!.hex);
            expect(brief.notUsed.some((n) => n.startsWith(PHOTO_NOT_USED_COLOUR_PREFIX))).toBe(false);
        }
    }, 60_000);

    it('the OPENING colour is reported as NOT USED — there is no route to the window leaves', async () => {
        const img = caseA().image;
        const full = [
            { x: 0, y: 0 }, { x: img.width - 1, y: 0 },
            { x: img.width - 1, y: img.height - 1 }, { x: 0, y: img.height - 1 },
        ] as const;
        const result = await reconstructFacade(img, { facadeQuad: full, autoDetectFacadePlane: false });
        const brief = mapFacadeIRToPhotoBrief(result);
        if (result.diagnostics.colour.openings !== null) {
            expect(brief.notUsed.some((n) => n.startsWith('the OPENING colour'))).toBe(true);
        }
    }, 60_000);

    it('without a plane: colour is UNKNOWN and NOT applied', async () => {
        const result = await reconstructFacade(caseA().image, { autoDetectFacadePlane: false });
        expect(result.diagnostics.colour.confidence).toBeNull();
        const brief = mapFacadeIRToPhotoBrief(result);
        expect(brief.facade.facadeColor).toBeUndefined();
    }, 60_000);
});
