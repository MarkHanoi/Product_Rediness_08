// ─────────────────────────────────────────────────────────────────────────────
// catalogAssetUrl.test.ts — L-570 (§FURNITURE-GLB-404-SUMMARY / OBJECT-STORAGE-GLB)
//
// WHAT IS ACTUALLY WORTH TESTING HERE. The resolver is four lines; the risk is not
// its arithmetic, it is its two CONTRACTS, both of which are silent when broken:
//
//   1. With no VITE_GLB_URL it must be an EXACT IDENTITY. Local dev serves
//      public/items/** from vite, and a stray rewrite there would break the one
//      environment where the catalogue currently works.
//   2. With a base set it must rewrite ONLY `/items/…`. Drag payloads, absolute
//      URLs, blob:/data: URLs and the literal 'box' sentinel all flow through the
//      same call sites (initFurnitureInteraction), and mangling one of those would
//      surface as an unrelated-looking load failure.
//
// The module reads `import.meta.env` ONCE at load (vite has already inlined it by
// then), so exercising the configured branch requires stubbing the env and
// re-importing the module — which is also an honest test of the "read once" design.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const MODULE = '../src/ui/furniture-carousel/catalogAssetUrl';

async function loadWith(base: string | undefined) {
    vi.resetModules();
    if (base === undefined) vi.unstubAllEnvs();
    else vi.stubEnv('VITE_GLB_URL', base);
    return await import(MODULE);
}

describe('resolveCatalogAssetUrl — unset base (local dev / test)', () => {
    beforeEach(() => { vi.unstubAllEnvs(); });
    afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

    it('is an exact identity for catalogue paths', async () => {
        const { resolveCatalogAssetUrl, isCatalogRehosted } = await loadWith(undefined);
        expect(isCatalogRehosted()).toBe(false);
        expect(resolveCatalogAssetUrl('/items/Sofas/sofa/model.glb')).toBe('/items/Sofas/sofa/model.glb');
        expect(resolveCatalogAssetUrl('/items/Sofas/sofa/thumbnail.webp')).toBe('/items/Sofas/sofa/thumbnail.webp');
    });

    it('treats an all-whitespace base as unset rather than as a prefix', async () => {
        const { resolveCatalogAssetUrl, isCatalogRehosted } = await loadWith('   ');
        expect(isCatalogRehosted()).toBe(false);
        expect(resolveCatalogAssetUrl('/items/Chairs/stool/model.glb')).toBe('/items/Chairs/stool/model.glb');
    });
});

describe('resolveCatalogAssetUrl — configured base (production)', () => {
    afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

    it('rewrites a catalogue path onto the object-storage base', async () => {
        const { resolveCatalogAssetUrl, isCatalogRehosted, catalogBaseUrl } =
            await loadWith('https://cdn.example.test/items/');
        expect(isCatalogRehosted()).toBe(true);
        expect(catalogBaseUrl()).toBe('https://cdn.example.test/items/');
        expect(resolveCatalogAssetUrl('/items/Sofas/sofa/model.glb'))
            .toBe('https://cdn.example.test/items/Sofas/sofa/model.glb');
    });

    it('normalises a base given without — or with a doubled — trailing slash', async () => {
        for (const base of ['https://cdn.example.test/items', 'https://cdn.example.test/items//']) {
            const { resolveCatalogAssetUrl } = await loadWith(base);
            expect(resolveCatalogAssetUrl('/items/Chairs/stool/model.glb'))
                .toBe('https://cdn.example.test/items/Chairs/stool/model.glb');
        }
    });

    it('preserves paths whose directory contains a space (e.g. "Soft Furnishings")', async () => {
        const { resolveCatalogAssetUrl } = await loadWith('https://cdn.example.test/items/');
        expect(resolveCatalogAssetUrl('/items/Soft Furnishings/shower-rug/model.glb'))
            .toBe('https://cdn.example.test/items/Soft Furnishings/shower-rug/model.glb');
    });

    it('leaves NON-catalogue inputs untouched', async () => {
        const { resolveCatalogAssetUrl } = await loadWith('https://cdn.example.test/items/');
        // The 'box' sentinel and drag payloads reach the same call site.
        expect(resolveCatalogAssetUrl('box')).toBe('box');
        expect(resolveCatalogAssetUrl('sofa')).toBe('sofa');
        // Already-absolute / non-http URLs must never be double-prefixed.
        expect(resolveCatalogAssetUrl('https://other.test/items/x.glb')).toBe('https://other.test/items/x.glb');
        expect(resolveCatalogAssetUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
        expect(resolveCatalogAssetUrl('data:model/gltf-binary;base64,AAA')).toBe('data:model/gltf-binary;base64,AAA');
        // A different public asset tree is not the catalogue.
        expect(resolveCatalogAssetUrl('/icons/logo.svg')).toBe('/icons/logo.svg');
        // 'items/…' WITHOUT the leading slash is not the documented logical form.
        expect(resolveCatalogAssetUrl('items/Sofas/sofa/model.glb')).toBe('items/Sofas/sofa/model.glb');
    });

    it('is total for empty/null/undefined input', async () => {
        const { resolveCatalogAssetUrl } = await loadWith('https://cdn.example.test/items/');
        expect(resolveCatalogAssetUrl('')).toBe('');
        expect(resolveCatalogAssetUrl(null)).toBe('');
        expect(resolveCatalogAssetUrl(undefined)).toBe('');
    });
});
