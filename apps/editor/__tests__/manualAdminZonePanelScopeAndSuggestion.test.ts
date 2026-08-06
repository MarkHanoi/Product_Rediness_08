// @vitest-environment happy-dom
//
// §COR-MANUAL-ADMIN-ZONE-SCOPE + §NEARBY-HEIGHT-SUGGESTION (2026-08-05) — integration-style tests
// for `ManualAdminZonePanel.ts`'s two new behaviours:
//   1. The founder-confirmed Sevilla bug: outside Córdoba, the panel must NEVER show a working
//      save flow or a misleading "Saved" success message — even if something re-enables the
//      disabled controls (the defense-in-depth check inside `_onSave` itself).
//   2. Inside Córdoba, a real nearby-height suggestion pre-selects the dropdown and shows the
//      SUGGESTED label — and a genuine no-data-gap parcel (empty Overpass response) is completely
//      unaffected: dropdown stays at the blank placeholder, exactly as before this feature existed.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SiteModelStore, siteCreate, siteSetParcelBoundary } from '@pryzm/stores';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import {
    wireManualAdminZonePanelRuntime,
    openManualAdminZonePanelIfAdmin,
    disposeManualAdminZonePanel,
} from '../src/ui/site/ManualAdminZonePanel';

/** Sevilla — the founder's own bug-report coordinate, well outside Córdoba's municipal bbox. */
const SEVILLA = { lat: 37.38540, lon: -5.97976 };
/** Inside Córdoba's municipal bbox AND the pilot extent (mirrors `cordobaSiteDispatch.test.ts`). */
const CORDOBA = { lat: 37.87, lon: -4.779 };

const BOUNDARY_POLYGON = [
    { x: 0, z: 0 }, { x: 12, z: 0 }, { x: 12, z: 14 }, { x: 0, z: 14 },
];

function buildRuntimeWithSite(location: { lat: number; lon: number }, withBoundary: boolean): {
    rt: PryzmRuntime;
    store: SiteModelStore;
} {
    const store = new SiteModelStore();
    const created = siteCreate(
        { projectId: 'proj-test', location: { latitude: location.lat, longitude: location.lon } },
        store,
    );
    const siteId = created.ok ? created.event.siteId : store.getSite()!.id;
    if (withBoundary) {
        siteSetParcelBoundary(
            { siteId, boundary: { polygon: BOUNDARY_POLYGON, edgeClassifications: ['front', 'side', 'rear', 'side'] } },
            store,
        );
    }
    const rt = {
        siteModelStore: store,
        audit: { projectId: 'proj-test' },
        events: { emit: () => {} },
    } as unknown as PryzmRuntime;
    return { rt, store };
}

/** Panel DOM lookups — the panel exposes no ids, so locate structurally (see file for the build order). */
function panelEl(): HTMLElement {
    const el = document.querySelector('.mazp-panel');
    if (!el) throw new Error('panel not mounted');
    return el as HTMLElement;
}
function selectEl(): HTMLSelectElement {
    return panelEl().querySelector('select') as HTMLSelectElement;
}
function saveButtonEl(): HTMLButtonElement {
    // Button order: [close ✕, Save + compute].
    const buttons = panelEl().querySelectorAll('button');
    return buttons[1] as HTMLButtonElement;
}
function statusText(): string {
    return panelEl().querySelector('[data-role="mazp-status"]')?.textContent ?? '';
}
function scopeNoticeText(): string {
    return panelEl().querySelector('[data-role="mazp-scope-notice"]')?.textContent ?? '';
}
function suggestionLabelVisible(): boolean {
    const el = panelEl().querySelector('[data-role="mazp-suggestion-label"]') as HTMLElement | null;
    return !!el && el.style.display !== 'none' && (el.textContent ?? '').length > 0;
}

async function flushMicrotasks(times = 5): Promise<void> {
    for (let i = 0; i < times; i++) await new Promise((r) => setTimeout(r, 0));
}

describe('ManualAdminZonePanel — §COR-MANUAL-ADMIN-ZONE-SCOPE (the Sevilla bug)', () => {
    let realFetch: typeof globalThis.fetch;
    const calledUrls: string[] = [];

    beforeEach(() => {
        realFetch = globalThis.fetch;
        localStorage.setItem('bim-platform-token', 'tok-admin');
        calledUrls.length = 0;
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            calledUrls.push(url);
            if (url.startsWith('/api/session/whoami')) {
                return { ok: true, status: 200, json: async () => ({ isAdmin: true }) } as unknown as Response;
            }
            if (url.startsWith('/api/overpass')) {
                return { ok: true, status: 200, json: async () => ({ elements: [] }) } as unknown as Response;
            }
            if (url.startsWith('/api/manual-zone')) {
                return { ok: true, status: 200, json: async () => ({ ok: true, entry: {} }) } as unknown as Response;
            }
            return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
        }) as unknown as typeof globalThis.fetch;
    });
    afterEach(() => {
        globalThis.fetch = realFetch;
        localStorage.clear();
        disposeManualAdminZonePanel();
        wireManualAdminZonePanelRuntime(null);
        vi.restoreAllMocks();
    });

    it('disables the dropdown + save button and shows the scope notice for a site outside Córdoba', async () => {
        const { rt } = buildRuntimeWithSite(SEVILLA, false);
        wireManualAdminZonePanelRuntime(rt);
        await openManualAdminZonePanelIfAdmin(rt);

        expect(selectEl().disabled).toBe(true);
        expect(saveButtonEl().disabled).toBe(true);
        expect(scopeNoticeText()).toMatch(/Córdoba/i);
        // A genuine data gap must never be masked as a suggestion outside scope either.
        expect(calledUrls.some((u) => u.startsWith('/api/overpass'))).toBe(false);
    });

    it('NEVER sends a misleading "Saved" message for a non-Córdoba site, even if disabled controls are bypassed', async () => {
        const { rt } = buildRuntimeWithSite(SEVILLA, false);
        wireManualAdminZonePanelRuntime(rt);
        await openManualAdminZonePanelIfAdmin(rt);

        // Simulate a caller bypassing the disabled UI (e.g. devtools) — the REAL guard must be in
        // `_onSave` itself, not just the disabled attribute.
        const select = selectEl();
        const save = saveButtonEl();
        select.disabled = false;
        save.disabled = false;
        select.value = 'UAD-1';
        save.click();
        await flushMicrotasks();

        // Must never read as the normal success message ("Saved <code> — envelope recomputed.").
        expect(statusText()).not.toMatch(/envelope recomputed/i);
        expect(statusText()).not.toMatch(/^Saved /i);
        expect(statusText()).toMatch(/outside that scope/i);
        expect(calledUrls.some((u) => u.startsWith('/api/manual-zone'))).toBe(false);
    });
});

describe('ManualAdminZonePanel — §NEARBY-HEIGHT-SUGGESTION (Córdoba only)', () => {
    let realFetch: typeof globalThis.fetch;

    beforeEach(() => {
        realFetch = globalThis.fetch;
        localStorage.setItem('bim-platform-token', 'tok-admin');
    });
    afterEach(() => {
        globalThis.fetch = realFetch;
        localStorage.clear();
        disposeManualAdminZonePanel();
        wireManualAdminZonePanelRuntime(null);
        vi.restoreAllMocks();
    });

    it('pre-selects a real suggested zone + shows the SUGGESTED label when real nearby heights exist', async () => {
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('/api/session/whoami')) {
                return { ok: true, status: 200, json: async () => ({ isAdmin: true }) } as unknown as Response;
            }
            if (url.startsWith('/api/overpass')) {
                // Two real (tagged) 12-13 m footprints near the Córdoba site origin — closest match
                // is PAS-1 (maxHeight_m 12.75).
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        elements: [
                            {
                                type: 'way', id: 1, tags: { building: 'yes', height: '12' },
                                geometry: [
                                    { lat: CORDOBA.lat + 0.0002, lon: CORDOBA.lon + 0.0002 },
                                    { lat: CORDOBA.lat + 0.0003, lon: CORDOBA.lon + 0.0002 },
                                    { lat: CORDOBA.lat + 0.0003, lon: CORDOBA.lon + 0.0003 },
                                    { lat: CORDOBA.lat + 0.0002, lon: CORDOBA.lon + 0.0003 },
                                    { lat: CORDOBA.lat + 0.0002, lon: CORDOBA.lon + 0.0002 },
                                ],
                            },
                            {
                                type: 'way', id: 2, tags: { building: 'yes', height: '13' },
                                geometry: [
                                    { lat: CORDOBA.lat - 0.0002, lon: CORDOBA.lon + 0.0002 },
                                    { lat: CORDOBA.lat - 0.0003, lon: CORDOBA.lon + 0.0002 },
                                    { lat: CORDOBA.lat - 0.0003, lon: CORDOBA.lon + 0.0003 },
                                    { lat: CORDOBA.lat - 0.0002, lon: CORDOBA.lon + 0.0003 },
                                    { lat: CORDOBA.lat - 0.0002, lon: CORDOBA.lon + 0.0002 },
                                ],
                            },
                        ],
                    }),
                } as unknown as Response;
            }
            return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
        }) as unknown as typeof globalThis.fetch;

        const { rt } = buildRuntimeWithSite(CORDOBA, true);
        wireManualAdminZonePanelRuntime(rt);
        await openManualAdminZonePanelIfAdmin(rt);
        await flushMicrotasks(10);

        expect(selectEl().disabled).toBe(false);
        expect(selectEl().value).toBe('PAS-1');
        expect(suggestionLabelVisible()).toBe(true);
    });

    it('leaves the dropdown at the blank placeholder when Overpass returns zero real samples (genuine data gap)', async () => {
        // ⚠ A DIFFERENT coordinate than the test above — `fetchContextBuildings` keeps its own
        // per-bbox in-memory cache alive for the whole test-file run (production behaviour, by
        // design), so re-using the exact same point would silently replay the PREVIOUS test's
        // real-footprint result instead of exercising this test's zero-sample mock.
        const CORDOBA_GAP = { lat: 37.90, lon: -4.75 };
        globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.startsWith('/api/session/whoami')) {
                return { ok: true, status: 200, json: async () => ({ isAdmin: true }) } as unknown as Response;
            }
            if (url.startsWith('/api/overpass')) {
                return { ok: true, status: 200, json: async () => ({ elements: [] }) } as unknown as Response;
            }
            return { ok: false, status: 404, json: async () => ({}) } as unknown as Response;
        }) as unknown as typeof globalThis.fetch;

        const { rt } = buildRuntimeWithSite(CORDOBA_GAP, true);
        wireManualAdminZonePanelRuntime(rt);
        await openManualAdminZonePanelIfAdmin(rt);
        await flushMicrotasks(10);

        // Byte-identical to today: the placeholder (empty value) stays selected.
        expect(selectEl().value).toBe('');
        expect(suggestionLabelVisible()).toBe(false);
    });
});
