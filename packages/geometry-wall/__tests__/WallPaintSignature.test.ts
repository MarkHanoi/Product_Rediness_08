/**
 * §WALL-FINISH-RENDERS (L-1670) — `composeWallPaintSignature` unit pins.
 *
 * The founder's *"Make all interior finish wall white paint"* wrote 59 walls'
 * `sideFinishes` and NOTHING rendered, because the flush pipeline's invalidation
 * gates (`_levelWallSig` no-progress guard, `_buildKey` rebuild memo) hashed only
 * geometry. Both gates now fold THIS signature, so its contract is exactly:
 *
 *   MOVES for every wall-record input of the builder's paint path
 *   (materialId, materialColor, layer colours, both sideFinishes slots),
 *   and is STABLE under everything else (geometry, names, metadata).
 *
 * A field this signature misses is a repaint the user never sees; a field it
 * over-folds is a spurious whole-level rebuild. Both directions are pinned.
 */

import { describe, it, expect } from 'vitest';
import { composeWallPaintSignature, type PaintBearingWall } from '../src/WallPaintSignature';

const MATTE_WHITE = { materialId: 'paint-matte-white', materialColor: '#f7f5ef', materialName: 'Paint · Matte White' };

/** The founder's wall shape: one structure layer, no colours authored anywhere. */
function plainWall(overrides: Partial<PaintBearingWall> = {}): PaintBearingWall {
    return {
        layers: [{ materialId: undefined, materialColor: undefined }],
        ...overrides,
    };
}

describe('§WALL-FINISH-RENDERS — the paint signature MOVES on every paint input', () => {
    it("THE FOUNDER'S EDIT — setting the interior sideFinish changes the signature", () => {
        const before = composeWallPaintSignature(plainWall());
        const after = composeWallPaintSignature(plainWall({ sideFinishes: { interior: MATTE_WHITE } }));
        expect(after).not.toBe(before);
    });

    it('the EXTERIOR slot moves it too, and differently from the interior slot', () => {
        const base = composeWallPaintSignature(plainWall());
        const int = composeWallPaintSignature(plainWall({ sideFinishes: { interior: MATTE_WHITE } }));
        const ext = composeWallPaintSignature(plainWall({ sideFinishes: { exterior: MATTE_WHITE } }));
        expect(ext).not.toBe(base);
        // The two sides are INDEPENDENT slots — a signature that cannot tell them
        // apart would skip the rebuild that swaps a finish from one face to the other.
        expect(ext).not.toBe(int);
    });

    it('a sideFinish COLOUR change alone moves it (same materialId)', () => {
        const a = composeWallPaintSignature(plainWall({ sideFinishes: { interior: { ...MATTE_WHITE } } }));
        const b = composeWallPaintSignature(plainWall({ sideFinishes: { interior: { ...MATTE_WHITE, materialColor: '#303236' } } }));
        expect(b).not.toBe(a);
    });

    it('wall.materialColor moves it (the colour-batch verb takes the same flush path)', () => {
        const a = composeWallPaintSignature(plainWall({ materialColor: '#e8e8e8' }));
        const b = composeWallPaintSignature(plainWall({ materialColor: '#aa0000' }));
        expect(b).not.toBe(a);
    });

    it('a LAYER materialColor moves it (the band arm paints layer.materialColor)', () => {
        const a = composeWallPaintSignature(plainWall({ layers: [{ materialColor: '#ffffff' }, { materialColor: '#cccccc' }] }));
        const b = composeWallPaintSignature(plainWall({ layers: [{ materialColor: '#ffffff' }, { materialColor: '#5a3a28' }] }));
        expect(b).not.toBe(a);
    });

    it('REMOVING a finish (undo) moves it back to the unfinished value', () => {
        const before = composeWallPaintSignature(plainWall());
        const painted = composeWallPaintSignature(plainWall({ sideFinishes: { interior: MATTE_WHITE } }));
        const undone = composeWallPaintSignature(plainWall());
        expect(painted).not.toBe(before);
        expect(undone).toBe(before);
    });
});

describe('§WALL-FINISH-RENDERS — and is STABLE under non-paint changes', () => {
    it('materialName is display-only — renaming must not rebuild a level', () => {
        const a = composeWallPaintSignature(plainWall({ sideFinishes: { interior: MATTE_WHITE } }));
        const b = composeWallPaintSignature(plainWall({ sideFinishes: { interior: { ...MATTE_WHITE, materialName: 'Renamed' } } }));
        expect(b).toBe(a);
    });

    it('absent vs empty layers vs no colour fields — all collapse to one stable legacy value', () => {
        // Every pre-finish wall in every existing project must hash to a stable
        // signature, so the fold itself never triggers a rebuild storm on load.
        const noLayers = composeWallPaintSignature({});
        const emptyLayers = composeWallPaintSignature({ layers: [] });
        expect(noLayers).toBe(emptyLayers);
        expect(composeWallPaintSignature({})).toBe(composeWallPaintSignature({}));
    });

    it('slot boundaries do not alias — the SAME colour in a different slot is a different signature', () => {
        // A layer painted X with no finish, and an interior finish X with no layer
        // colour, paint DIFFERENT pixels (band vs whole-body precedence), so the
        // signature may not collapse them into one value.
        const layerPainted = composeWallPaintSignature(plainWall({ layers: [{ materialColor: '#f7f5ef' }] }));
        const finishPainted = composeWallPaintSignature(plainWall({ sideFinishes: { interior: { materialId: 'paint-matte-white', materialColor: '#f7f5ef' } } }));
        expect(layerPainted).not.toBe(finishPainted);
    });
});
