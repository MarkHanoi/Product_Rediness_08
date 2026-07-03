// @vitest-environment happy-dom
//
// §FIX-CATALOG-THUMBNAIL-RESTORE (founder L-67) — the furniture / interiors
// library cards (FurnitureSidePanel) must show a rich PREVIEW IMAGE per item;
// the diagrammatic plan-symbol icon is a PLACEHOLDER + FALLBACK ONLY. Regression
// b2b32e22 (§FIX-LIBRARY-DIAGRAM-ICONS, L-22) had removed the image path and left
// every card on the flat icon.
//
// These specs assert the restored resolution order on `_buildCard`:
//   1. a pre-baked raster `thumbnailPath` is used as an <img> when present,
//   2. a PARAMETRIC item (no glbPath / no raster) requests a 3D preview from
//      FurnitureThumbnailService (prod-safe — no GLB fetch) and upgrades it
//      over the plan symbol,
//   3. the plan-symbol icon is always present as the placeholder/fallback,
//   4. a GLB item without a hosted raster keeps the plan symbol (no parametric
//      render for a GLB — a generic box would be worse than the clean symbol).
//
// FurnitureThumbnailService is mocked so the test never constructs a real
// offscreen WebGLRenderer (unavailable under happy-dom).

import { describe, it, expect, vi, beforeEach } from 'vitest';

const requestThumbnail = vi.fn(async () => 'data:image/webp;base64,STUBPREVIEW');

vi.mock('../src/ui/furniture-carousel/FurnitureThumbnailService', () => ({
    FurnitureThumbnailService: {
        getInstance: () => ({ requestThumbnail }),
    },
}));

import { FurnitureSidePanel } from '../src/ui/furniture-carousel/FurnitureSidePanel';

const dims = { width: 1, length: 1, height: 1, baseOffset: 0 };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildCard(panel: FurnitureSidePanel, item: any): HTMLElement {
    // _buildCard is private; drive it directly for a focused card-render assertion.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (panel as any)._buildCard(item);
}

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

describe('FurnitureSidePanel thumbnail — §FIX-CATALOG-THUMBNAIL-RESTORE (L-67)', () => {
    beforeEach(() => requestThumbnail.mockClear());

    it('uses the pre-baked raster thumbnail image when thumbnailPath is present', () => {
        // The raster upgrades over the symbol atomically on `img.onload` (no
        // broken-image flash). Capture the created <img> to assert its src and
        // simulate the load the way a real browser would.
        const created: HTMLImageElement[] = [];
        const realCreate = document.createElement.bind(document);
        const spy = vi.spyOn(document, 'createElement').mockImplementation(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ((tag: any, opts?: any) => {
                const el = realCreate(tag, opts);
                if (String(tag).toLowerCase() === 'img') created.push(el as HTMLImageElement);
                return el;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            }) as any,
        );

        const panel = new FurnitureSidePanel();
        const card = buildCard(panel, {
            type: 'sofa',
            label: 'Sofa',
            defaultDimensions: dims,
            defaultMaterial: 'fabric',
            thumbnailPath: '/items/Sofas/sofa/thumbnail.webp',
        });
        spy.mockRestore();

        // The raster <img> is created with the catalogue thumbnail src.
        const raster = created.find(i => i.src.includes('/items/Sofas/sofa/thumbnail.webp'));
        expect(raster).toBeTruthy();
        expect(raster!.className).toBe('fsp-thumb-img');
        // Plan symbol is the placeholder/fallback shown until the raster loads (or on 404).
        expect(card.querySelector('svg.fsp-plan-icon')).not.toBeNull();
        // A raster item does NOT trigger a parametric render.
        expect(requestThumbnail).not.toHaveBeenCalled();

        // Simulate a successful load → the image upgrades over the symbol.
        raster!.onload?.(new Event('load'));
        const shown = card.querySelector('img.fsp-thumb-img') as HTMLImageElement | null;
        expect(shown).not.toBeNull();
        expect(shown!.src).toContain('/items/Sofas/sofa/thumbnail.webp');
    });

    it('renders a parametric 3D preview image for a parametric item and upgrades over the symbol', async () => {
        const panel = new FurnitureSidePanel();
        const card = buildCard(panel, {
            type: 'chair',
            label: 'Chair',
            defaultDimensions: dims,
            defaultMaterial: 'timber',
            defaultColor: '#4a4a4a',
        });

        // Plan symbol paints immediately as the placeholder.
        expect(card.querySelector('svg.fsp-plan-icon')).not.toBeNull();
        // Parametric preview requested (prod-safe: parametric geometry, no GLB), colour folded in.
        expect(requestThumbnail).toHaveBeenCalledWith('chair', 0x4a4a4a);

        // Connect so the thumbWrap.isConnected guard passes, then let the promise resolve.
        document.body.appendChild(card);
        await flush();

        const img = card.querySelector('img.fsp-thumb-img') as HTMLImageElement | null;
        expect(img).not.toBeNull();
        expect(img!.src).toContain('STUBPREVIEW');
        card.remove();
    });

    it('keeps the plan symbol for a GLB item with no hosted raster (no parametric render)', () => {
        const panel = new FurnitureSidePanel();
        const card = buildCard(panel, {
            type: 'ai_element',
            label: 'Kave Sofa',
            defaultDimensions: dims,
            defaultMaterial: 'fabric',
            glbPath: '/items/Sofas/kave/model.glb',
        });

        expect(requestThumbnail).not.toHaveBeenCalled();
        expect(card.querySelector('svg.fsp-plan-icon')).not.toBeNull();
        expect(card.querySelector('img.fsp-thumb-img')).toBeNull();
    });
});
