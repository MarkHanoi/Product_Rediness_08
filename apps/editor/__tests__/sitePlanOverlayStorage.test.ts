// @vitest-environment happy-dom
//
// §FIX-SITE-OVERLAY-RENDER-AND-FLOW (L-58) — storage gate for relocating the SITE-PLAN
// overlay RASTER out of localStorage and into IndexedDB (mirrors the L-45 floor-plan
// underlay storage gate).
//
// The live bug: `sitePlanOverlayPersistence` serialised the ENTIRE record — including the
// multi-MB `imageDataUrl` raster — into one localStorage key
// (`pryzm.sitePlanOverlay.v1.<projectId>`). A survey scan blew the ~5 MB localStorage
// budget → `QuotaExceededError`, the overlay never persisted, and on reload it never
// restored → the raster never painted.
//
// These tests prove the FIX at the persistence boundary:
//   • writePersistedOverlay strips the raster → localStorage stays lean (fits a budget the
//     full-raster record would blow) and NEVER throws QuotaExceededError;
//   • readPersistedOverlayMetadata accepts a metadata-only (raster-absent) record;
//   • a LEGACY inline-raster record is still readable + flagged for migration
//     (hasInlineRaster) so the controller can move it to IDB.

import { describe, it, expect, beforeEach } from 'vitest';
import {
    serializeOverlay,
    writePersistedOverlay,
    readPersistedOverlayMetadata,
    hasInlineRaster,
    toStoredMetadata,
    key,
    SITE_OVERLAY_SCHEMA_VERSION,
    type PersistedSitePlanOverlay,
} from '../src/ui/site/overlay/sitePlanOverlayPersistence';
import { defaultOverlayTransform } from '../src/ui/site/overlay/sitePlanOverlayGeometry';

// A fat raster — ~300 KB base64, dwarfs any lean localStorage budget.
const FAT_RASTER = 'data:image/png;base64,' + 'A'.repeat(300_000);

function fullRecord(raster: string): PersistedSitePlanOverlay {
    return serializeOverlay({
        fileName: 'survey.png',
        sourceKind: 'image',
        imageDataUrl: raster,
        page: 1,
        originLat: 51.5,
        originLon: -0.12,
        transform: defaultOverlayTransform(2000, 1400),
        opacity: 0.7,
        locked: false,
        visible: true,
        calibrated: false,
    });
}

// Byte-budgeted localStorage that throws a real QuotaExceededError when a setItem would
// push total stored bytes over `budget` (same device the L-45 storage test models).
function installBudgetedLocalStorage(budget: number): Map<string, string> {
    const store = new Map<string, string>();
    const usage = () => { let n = 0; for (const [k, v] of store) n += k.length + v.length; return n; };
    const ls = {
        get length() { return store.size; },
        key: (i: number) => Array.from(store.keys())[i] ?? null,
        getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
        setItem: (k: string, v: string) => {
            const prev = store.get(k) ?? '';
            const projected = usage() - (k.length + prev.length) + (k.length + v.length);
            if (projected > budget) {
                throw Object.assign(new Error('quota'), { name: 'QuotaExceededError', code: 22 });
            }
            store.set(k, v);
        },
        removeItem: (k: string) => { store.delete(k); },
        clear: () => { store.clear(); },
    };
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true, writable: true });
    return store;
}

beforeEach(() => { installBudgetedLocalStorage(50_000_000).clear(); });

describe('§FIX-SITE-OVERLAY-RENDER-AND-FLOW — raster out of localStorage', () => {
    it('toStoredMetadata strips the raster but keeps the metadata', () => {
        const rec = fullRecord(FAT_RASTER);
        const lean = toStoredMetadata(rec);
        expect(lean.imageDataUrl).toBe('');
        expect(lean.fileName).toBe('survey.png');
        expect(lean.transform.widthPx).toBe(2000);
        expect(lean.opacity).toBeCloseTo(0.7, 9);
    });

    it('writePersistedOverlay keeps localStorage LEAN (no quota) for a 300 KB raster', () => {
        // A 4 KB budget the full-raster record would blow instantly; lean metadata fits.
        const store = installBudgetedLocalStorage(4_000);
        const ok = writePersistedOverlay('proj-1', fullRecord(FAT_RASTER));
        expect(ok).toBe(true); // did NOT throw / fail on quota
        const raw = store.get(key('proj-1'))!;
        expect(raw).toBeTruthy();
        expect(raw).not.toContain('data:image'); // raster stripped
        expect(raw.length).toBeLessThan(2_000);
        expect(JSON.parse(raw).imageDataUrl).toBe('');
    });

    it('readPersistedOverlayMetadata round-trips lean metadata (raster absent)', () => {
        writePersistedOverlay('proj-2', fullRecord(FAT_RASTER));
        const rec = readPersistedOverlayMetadata('proj-2');
        expect(rec).not.toBeNull();
        expect(rec!.schemaVersion).toBe(SITE_OVERLAY_SCHEMA_VERSION);
        expect(rec!.imageDataUrl).toBe(''); // raster lives in IDB, not here
        expect(rec!.transform.widthPx).toBe(2000);
        expect(hasInlineRaster(rec!)).toBe(false);
    });

    it('reads a LEGACY inline-raster record and flags it for IDB migration', () => {
        // Simulate an old (pre-fix) record whose raster is still inline in localStorage.
        const store = installBudgetedLocalStorage(50_000_000);
        store.set(key('proj-3'), JSON.stringify(fullRecord(FAT_RASTER)));
        const rec = readPersistedOverlayMetadata('proj-3');
        expect(rec).not.toBeNull();
        expect(rec!.imageDataUrl).toBe(FAT_RASTER); // preserved for the caller to migrate
        expect(hasInlineRaster(rec!)).toBe(true);
    });

    it('rejects a structurally invalid stored record (bad transform)', () => {
        const store = installBudgetedLocalStorage(50_000_000);
        const bad = { ...toStoredMetadata(fullRecord(FAT_RASTER)), transform: { ...defaultOverlayTransform(10, 10), metresPerPixel: 0 } };
        store.set(key('proj-4'), JSON.stringify(bad));
        expect(readPersistedOverlayMetadata('proj-4')).toBeNull();
    });
});
