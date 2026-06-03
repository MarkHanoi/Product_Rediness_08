// A.8.a (UI) — address-search box for the GIS site surface.
//
// A small, CSP-safe (addEventListener, no inline handlers) address-search input
// overlaid on the Cesium GIS view. On submit it calls the headless
// `geocodeAddress()` (A.8.a core), renders the candidate list, and on pick:
//   1) flies the Cesium camera to the result bbox/point (via an injected
//      `onFlyTo` callback so this module stays Cesium-import-free), and
//   2) dispatches `site.updateLocation` (lat/lon + the typed address) through the
//      shared `dispatchSiteLocation` helper so the C19 Site location becomes real.
//
// LAYERING: no THREE / Cesium import here. Camera control is delegated to the
// `onFlyTo` callback supplied by `GISAreaLayout` (which owns the viewer).

import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { geocodeAddress, type GeocodeResult } from './geocodeAddress.js';
import { resolveSiteContext, dispatchSiteLocation } from './siteDispatch.js';

const VIOLET = '#6600FF';

export interface SiteGeocodeSearchBoxOptions {
    /** Where to mount the search box (the GIS viewport container). */
    readonly parent: HTMLElement;
    /** The runtime (for `site.updateLocation` dispatch + toasts). */
    readonly runtime: PryzmRuntime | null;
    /**
     * Fly the Cesium camera to a result. `bbox` is `[w,s,e,n]` (lon/lat) when
     * available; otherwise frame the point. Owned by GISAreaLayout (has the
     * viewer). Kept as a callback so this module imports no Cesium.
     */
    readonly onFlyTo: (result: GeocodeResult) => void;
}

export interface SiteGeocodeSearchBox {
    /** Detach + remove the search box from the DOM. */
    dispose(): void;
    /** Programmatically run a search (e.g. from the RAC address). */
    search(query: string): void;
    readonly element: HTMLElement;
}

/**
 * Build + mount the address-search box. Returns a handle with `dispose()`.
 * Idempotent at the call site is the caller's responsibility (it returns a fresh
 * element each call).
 */
export function mountSiteGeocodeSearchBox(
    opts: SiteGeocodeSearchBoxOptions,
): SiteGeocodeSearchBox {
    const { parent, runtime, onFlyTo } = opts;

    // ── Container ────────────────────────────────────────────────────────────
    const root = document.createElement('div');
    root.className = 'pryzm-gis-geocode';
    Object.assign(root.style, {
        position: 'absolute',
        top: '12px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '10',
        width: 'min(440px, 80vw)',
        font: '13px/1.4 system-ui, sans-serif',
        pointerEvents: 'auto',
    } satisfies Partial<CSSStyleDeclaration>);

    // ── Input row ────────────────────────────────────────────────────────────
    const inputRow = document.createElement('div');
    Object.assign(inputRow.style, {
        display: 'flex',
        gap: '6px',
        background: 'rgba(20,16,32,0.92)',
        border: `1px solid ${VIOLET}`,
        borderRadius: '8px',
        padding: '6px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    } satisfies Partial<CSSStyleDeclaration>);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Search address or place…';
    input.setAttribute('aria-label', 'Site address search');
    Object.assign(input.style, {
        flex: '1',
        background: 'transparent',
        border: 'none',
        outline: 'none',
        color: '#fff',
        fontSize: '13px',
    } satisfies Partial<CSSStyleDeclaration>);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Search';
    Object.assign(button.style, {
        background: VIOLET,
        color: '#fff',
        border: 'none',
        borderRadius: '5px',
        padding: '4px 12px',
        cursor: 'pointer',
        fontSize: '13px',
    } satisfies Partial<CSSStyleDeclaration>);

    inputRow.appendChild(input);
    inputRow.appendChild(button);
    root.appendChild(inputRow);

    // ── Results dropdown ─────────────────────────────────────────────────────
    const list = document.createElement('ul');
    Object.assign(list.style, {
        listStyle: 'none',
        margin: '4px 0 0',
        padding: '0',
        background: 'rgba(20,16,32,0.97)',
        border: '1px solid rgba(102,0,255,0.5)',
        borderRadius: '8px',
        maxHeight: '240px',
        overflowY: 'auto',
        display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    root.appendChild(list);

    const status = document.createElement('div');
    Object.assign(status.style, {
        marginTop: '4px',
        color: '#b9a9e0',
        fontSize: '12px',
        display: 'none',
    } satisfies Partial<CSSStyleDeclaration>);
    root.appendChild(status);

    function setStatus(text: string): void {
        if (!text) {
            status.style.display = 'none';
            status.textContent = '';
            return;
        }
        status.textContent = text;
        status.style.display = 'block';
    }

    function clearList(): void {
        list.replaceChildren();
        list.style.display = 'none';
    }

    function pick(result: GeocodeResult): void {
        console.log('[gis] geocode pick', result.displayName, result.lat, result.lon);
        clearList();
        input.value = result.displayName;
        setStatus('');

        // 1) Fly the Cesium camera (delegated — no Cesium import here).
        try {
            onFlyTo(result);
        } catch (err) {
            console.warn('[gis] onFlyTo threw', err);
        }

        // 2) Dispatch site.updateLocation so the Site location is real.
        const ctx = resolveSiteContext(runtime);
        if (!ctx) return;
        const ok = dispatchSiteLocation(ctx, {
            latitude: result.lat,
            longitude: result.lon,
            siteAddress: result.displayName,
        });
        if (ok) {
            ctx.toast(
                `Site located — ${result.displayName} ` +
                `(${result.lat.toFixed(5)}, ${result.lon.toFixed(5)}). ` +
                `Draw a boundary, then generate.`,
                'success',
            );
        }
    }

    function renderResults(results: GeocodeResult[]): void {
        list.replaceChildren();
        if (results.length === 0) {
            clearList();
            setStatus('No matches — try a more specific address.');
            return;
        }
        setStatus('');
        for (const r of results) {
            const li = document.createElement('li');
            li.textContent = r.displayName;
            li.title = r.displayName;
            Object.assign(li.style, {
                padding: '7px 10px',
                color: '#e8e0f8',
                cursor: 'pointer',
                borderBottom: '1px solid rgba(102,0,255,0.18)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
            } satisfies Partial<CSSStyleDeclaration>);
            li.addEventListener('mouseenter', () => {
                li.style.background = 'rgba(102,0,255,0.22)';
            });
            li.addEventListener('mouseleave', () => {
                li.style.background = 'transparent';
            });
            li.addEventListener('click', () => pick(r));
            list.appendChild(li);
        }
        list.style.display = 'block';
    }

    let inFlight = false;
    async function runSearch(query: string): Promise<void> {
        const q = query.trim();
        if (!q || inFlight) return;
        inFlight = true;
        button.disabled = true;
        setStatus('Searching…');
        try {
            const results = await geocodeAddress(q);
            renderResults(results);
        } catch (err) {
            console.warn('[gis] search failed', err);
            setStatus('Search failed — see console.');
        } finally {
            inFlight = false;
            button.disabled = false;
        }
    }

    // ── Wiring (CSP-safe: addEventListener only) ─────────────────────────────
    button.addEventListener('click', () => void runSearch(input.value));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            void runSearch(input.value);
        } else if (e.key === 'Escape') {
            clearList();
            setStatus('');
        }
    });

    parent.appendChild(root);
    console.log('[gis] geocode search box mounted');

    return {
        element: root,
        search: (query: string) => void runSearch(query),
        dispose: () => {
            if (root.parentElement) root.parentElement.removeChild(root);
            console.log('[gis] geocode search box disposed');
        },
    };
}
