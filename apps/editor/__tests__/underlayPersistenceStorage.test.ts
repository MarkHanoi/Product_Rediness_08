// @vitest-environment happy-dom
//
// §FIX-UNDERLAY-DELETE-AND-STORAGE (L-45) — storage gate for relocating the
// floor-plan underlay RASTER out of localStorage and into IndexedDB.
//
// The live bug: UnderlayPersistence serialised the ENTIRE record — including the
// multi-MB `imageDataUrl` raster — into one localStorage key
// (`pryzm.floorPlanUnderlay.v2.<projectId>`). A single large plan blew the ~5 MB
// localStorage budget → `QuotaExceededError` and the underlay failed to persist.
//
// These tests mock the new UnderlayRasterStore (a Map-backed mirror + spies — the
// same approach the thumbnail / version-history storage tests use) and prove:
//   • a SAVE routes the raster to IndexedDB (.put) and writes ONLY lean metadata to
//     localStorage — small enough to fit a budget a full-raster record would blow;
//   • restore reads the raster back from IndexedDB (.get);
//   • a legacy inline localStorage raster (pre-fix record) is migrated to IndexedDB
//     and stripped from localStorage on restore;
//   • clearing the underlay drops the raster from IndexedDB too.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Mock the IDB raster store: Map-backed mirror + spyable get/put/delete ──────
const _mirror = new Map<string, string>();
const _get = vi.fn(async (id: string) => (_mirror.has(id) ? _mirror.get(id)! : null));
const _put = vi.fn(async (id: string, url: string) => { _mirror.set(id, url); return true; });
const _delete = vi.fn(async (id: string) => { _mirror.delete(id); });
vi.mock('../src/engine/UnderlayRasterStore', () => ({
    getUnderlayRasterStore: () => ({ get: _get, put: _put, delete: _delete }),
}));

// Keep importing UnderlayPersistence cheap — it only needs these as types at runtime.
vi.mock('@pryzm/renderer-three/three', () => ({}));
vi.mock('@pryzm/input-host', () => ({
    FloorPlanUnderlayTool: class {
        async create() {}
        getState() { return null; }
        dispose() {}
        setOpacity() {}
        setLocked() {}
        setVisible() {}
    },
}));

const KEY_PREFIX = 'pryzm.floorPlanUnderlay.v2.';

// Byte-budgeted mock localStorage that throws a real QuotaExceededError when a
// setItem would push total stored bytes over `budget`.
function installBudgetedLocalStorage(budget: number): { store: Map<string, string> } {
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
    return { store };
}

// A fat raster — ~300 KB base64. 50× would dwarf any localStorage budget.
const FAT_RASTER = 'data:image/png;base64,' + 'A'.repeat(300_000);

function legacyRecordWith(raster: string): string {
    return JSON.stringify({
        fileName: 'Plan',
        imageDataUrl: raster, // legacy inline raster (pre-fix format)
        pxPerMeter: 50,
        widthPx: 1000,
        heightPx: 800,
        elevationY: 0,
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        opacity: 0.5,
        locked: false,
        visible: true,
        savedAt: new Date().toISOString(),
    });
}

/** A duck-typed underlay tool whose texture has no blob src → capture falls back to IDB. */
function installToolStub() {
    const mesh = {
        position: { x: 3, y: 0, z: 4 },
        rotation: { x: 0, y: 0, z: 0.25 },
        scale: { x: 1, y: 1, z: 1 },
        visible: true,
        material: { opacity: 0.5, map: null },
        userData: { fileName: 'Plan' },
    };
    (window as any).floorPlanUnderlayTool = {
        getState: () => ({
            mesh,
            pxPerMeter: 50,
            widthPx: 1000,
            heightPx: 800,
            planWidthMeters: 20,
            planHeightMeters: 16,
            locked: false,
        }),
    };
}

function makeEventsEmitter() {
    const listeners: Record<string, Array<(p?: unknown) => void>> = {};
    return {
        on: (e: string, cb: (p?: unknown) => void) => { (listeners[e] ??= []).push(cb); },
        emit: (e: string, p?: unknown) => { (listeners[e] ?? []).forEach(cb => cb(p)); },
    };
}

beforeEach(() => {
    vi.resetModules();
    _mirror.clear();
    _get.mockClear(); _put.mockClear(); _delete.mockClear();
    delete (window as any).floorPlanUnderlayTool;
    delete (window as any).runtime;
    delete (window as any).scene;
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe('§FIX-UNDERLAY-DELETE-AND-STORAGE — raster → IndexedDB, metadata → localStorage', () => {
    it('a SAVE routes the raster to IDB and keeps localStorage lean (no quota) for a 300 KB raster', async () => {
        // Tiny budget the FULL-raster record would blow instantly; metadata-only fits.
        const { store } = installBudgetedLocalStorage(4_000);
        // Seed the IDB mirror so capture's fallback resolves the raster from IDB
        // (the tool's texture has no blob src in this stub).
        _mirror.set('proj-1', FAT_RASTER);
        installToolStub();
        (window as any).runtime = { events: makeEventsEmitter() };

        const mod = await import('../src/engine/UnderlayPersistence');
        mod.installUnderlayPersistence();

        // Bind the current project (sets _currentProjectId; no record/scene → no-op restore).
        (window as any).runtime.events.emit('pryzm-project-loaded', { projectId: 'proj-1' });

        // Trigger a debounced save and let it flush.
        vi.useFakeTimers();
        (window as any).runtime.events.emit('underlay:transform-changed');
        await vi.advanceTimersByTimeAsync(400);

        // Raster went to IndexedDB…
        expect(_put).toHaveBeenCalledWith('proj-1', FAT_RASTER);
        // …and localStorage holds ONLY lean metadata — no raster, well under budget.
        const raw = store.get(KEY_PREFIX + 'proj-1');
        expect(raw).toBeTruthy();
        expect(raw!).not.toContain('data:image');
        expect(raw!.length).toBeLessThan(1_000);
        const meta = JSON.parse(raw!);
        expect(meta.imageDataUrl).toBeUndefined();
        expect(meta.pxPerMeter).toBe(50);
    });

    it('migrates a legacy inline localStorage raster into IDB and strips it from localStorage on restore', async () => {
        const { store } = installBudgetedLocalStorage(50_000_000); // generous — seed the fat legacy record
        store.set(KEY_PREFIX + 'proj-2', legacyRecordWith(FAT_RASTER));
        // IDB miss → migration path.
        (window as any).runtime = { events: makeEventsEmitter() };

        const mod = await import('../src/engine/UnderlayPersistence');
        // No window.scene → restore bails AFTER the migration has already run.
        const ok = await mod.restoreUnderlayForProject('proj-2');
        expect(ok).toBe(false);

        // Raster migrated into IDB…
        expect(_put).toHaveBeenCalledWith('proj-2', FAT_RASTER);
        // …and the localStorage record has been rewritten WITHOUT the inline raster.
        const raw = store.get(KEY_PREFIX + 'proj-2')!;
        expect(raw).not.toContain('data:image');
        expect(raw.length).toBeLessThan(1_000);
    });

    it('clearing the underlay removes both the localStorage record and the IDB raster', async () => {
        const { store } = installBudgetedLocalStorage(50_000_000);
        store.set(KEY_PREFIX + 'proj-3', legacyRecordWith(FAT_RASTER));
        _mirror.set('proj-3', FAT_RASTER);

        const mod = await import('../src/engine/UnderlayPersistence');
        mod.clearPersistedUnderlay('proj-3');

        expect(store.has(KEY_PREFIX + 'proj-3')).toBe(false);
        expect(_delete).toHaveBeenCalledWith('proj-3');
    });

    it('readPersistedUnderlay accepts a metadata-only record (no inline raster required)', async () => {
        const { store } = installBudgetedLocalStorage(50_000_000);
        // New-format record: metadata only, raster lives in IDB.
        store.set(KEY_PREFIX + 'proj-4', JSON.stringify({
            fileName: 'Plan', pxPerMeter: 50, widthPx: 1000, heightPx: 800, elevationY: 0,
            position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 },
            opacity: 0.5, locked: false, visible: true, savedAt: new Date().toISOString(),
        }));

        const mod = await import('../src/engine/UnderlayPersistence');
        const rec = mod.readPersistedUnderlay('proj-4');
        expect(rec).not.toBeNull();
        expect(rec!.pxPerMeter).toBe(50);
        expect(rec!.imageDataUrl).toBeUndefined();
    });
});
