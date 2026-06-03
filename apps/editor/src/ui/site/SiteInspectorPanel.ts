/**
 * SiteInspectorPanel.ts — A.8.f (Phase A · GIS)
 *
 * L5 Site Inspector. A singleton floating card that SURFACES the authored
 * C19 SiteModel (held on the L3 SiteModelStore) so the user can SEE the plot
 * they loaded from an address / drew on the map. Closes the IP-A2 acceptance
 * gap: "I now see a Site panel in the editor with my plot boundary loaded
 * from address."
 *
 * DATA FLOW (read-only):
 *   runtime.siteModelStore.getSite()            → SiteModel | null
 *   runtime.siteModelStore.getLocation()        → SiteLocation { address, lat, lon, trueNorth }
 *   runtime.siteModelStore.getParcelBoundary()  → { polygon: {x,z}[], edgeClassifications }
 *
 * Shows: address + lat/lon · parcel area (m², store-computed or shoelace
 * fallback) · boundary vertex count + inline SVG thumbnail · frontage edge
 * count + true-north · "Climate analysis" link (opens ClimatePanel) + "Edit
 * boundary" (window.pryzmStartBoundaryDraw).
 *
 * LIVE UPDATE: subscribes to the SiteModelStore (canonical change source) AND
 * the three typed runtime events `site.created` / `site.location-changed` /
 * `site.parcel-boundary-set` (emitted by siteDispatch.ts). Re-renders on any.
 * Listeners are torn down on dispose().
 *
 * RULES (mirrors ClimatePanel idiom):
 *   - UI-only. NEVER writes to any store directly (P6).
 *   - No THREE imports. No Anthropic / fetch calls.
 *   - All derivation math lives in the pure `siteInspectorData.ts` helper.
 *   - Styles live in AppTheme (SITE_INSPECTOR_PANEL_STYLES), never inline.
 *   - Guards everything; never throws into the rail. No runtime/store ⇒ empty state.
 *
 * References:
 *   - docs/02-decisions/contracts/C19-SITE-MODEL-AND-PARCEL.md
 *   - apps/editor/src/ui/site/siteDispatch.ts (event emitters)
 *   - apps/editor/src/ui/climate/ClimatePanel.ts (sibling panel)
 */

import { injectAppTheme } from '../styles/AppTheme';
import {
    summarizeSite,
    boundaryThumbnailPath,
    type SiteLocationLike,
    type ParcelBoundaryLike,
} from './siteInspectorData';

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

const SVG_NS = 'http://www.w3.org/2000/svg';

// ── Runtime injection (module-load singleton) ────────────────────────────────

let _runtime: Runtime | null = null;
export function wireSiteInspectorRuntime(rt: Runtime | null): void {
    _runtime = rt;
}

// ── Singleton DOM state ──────────────────────────────────────────────────────

let _panel: HTMLElement | null = null;
let _body: HTMLElement | null = null;
let _unsub: (() => void) | null = null;

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Open the Site Inspector. Creates it on first call; re-renders on every call.
 * Subscribes to the SiteModelStore + site.* runtime events so the panel
 * live-updates when the user authors / redraws the site.
 */
export function openSiteInspectorPanel(runtime: Runtime | null = null): void {
    if (runtime) _runtime = runtime;
    if (!_panel) {
        _panel = _build();
        document.body.appendChild(_panel);
        _subscribe();
    }
    _panel.style.display = 'flex';
    _render();
}

/** Hide the panel (kept in the DOM for cheap re-open). */
export function closeSiteInspectorPanel(): void {
    if (_panel) _panel.style.display = 'none';
}

/** Toggle visibility. */
export function toggleSiteInspectorPanel(runtime: Runtime | null = null): void {
    if (_panel && _panel.style.display !== 'none') closeSiteInspectorPanel();
    else openSiteInspectorPanel(runtime);
}

export function isSiteInspectorPanelOpen(): boolean {
    return !!_panel && _panel.style.display !== 'none';
}

/** Test/HMR hygiene — tear the panel down + drop subscriptions. */
export function disposeSiteInspectorPanel(): void {
    if (_unsub) {
        try { _unsub(); } catch { /* ignore */ }
        _unsub = null;
    }
    if (_panel?.parentElement) _panel.parentElement.removeChild(_panel);
    _panel = null;
    _body = null;
}

// ── Build shell ──────────────────────────────────────────────────────────────

function _build(): HTMLElement {
    injectAppTheme();
    const el = document.createElement('div');
    el.className = 'sip-panel';
    el.style.display = 'none';

    const header = document.createElement('div');
    header.className = 'sip-header';
    const title = document.createElement('span');
    title.className = 'sip-title';
    title.textContent = '📐 Site';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'sip-close';
    close.title = 'Close';
    close.textContent = '✕';
    close.addEventListener('click', () => closeSiteInspectorPanel());
    header.appendChild(title);
    header.appendChild(close);

    const body = document.createElement('div');
    body.className = 'sip-body';
    _body = body;

    el.appendChild(header);
    el.appendChild(body);
    return el;
}

function _subscribe(): void {
    const rt = _runtime;
    if (!rt) return;
    const refresh = () => { if (isSiteInspectorPanelOpen()) _render(); };
    const disposers: Array<() => void> = [];

    // Canonical change source — the store fires after every mutation.
    try {
        const store = rt.siteModelStore as { subscribe?: (cb: () => void) => () => void } | undefined;
        if (store?.subscribe) disposers.push(store.subscribe(refresh));
    } catch { /* ignore */ }

    // Typed domain events (emitted by siteDispatch.ts). `.on()` returns an
    // EventSubscription with `.dispose()`.
    const ev = rt.events;
    if (ev) {
        for (const key of ['site.created', 'site.location-changed', 'site.parcel-boundary-set'] as const) {
            try {
                const sub = ev.on(key, refresh);
                disposers.push(() => { try { sub.dispose(); } catch { /* ignore */ } });
            } catch { /* ignore */ }
        }
    }

    _unsub = () => disposers.forEach((d) => { try { d(); } catch { /* ignore */ } });
}

// ── Render ───────────────────────────────────────────────────────────────────

function _render(): void {
    const body = _body;
    if (!body) return;
    body.replaceChildren();

    const rt = _runtime;
    let location: SiteLocationLike | null = null;
    let boundary: ParcelBoundaryLike | null = null;
    let storeArea: number | null = null;

    try {
        const store = rt?.siteModelStore as {
            getSite?: () => { parcel?: { area?: number } } | null;
            getLocation?: () => SiteLocationLike | null;
            getParcelBoundary?: () => ParcelBoundaryLike | null;
        } | undefined;
        location = store?.getLocation?.() ?? null;
        boundary = store?.getParcelBoundary?.() ?? null;
        storeArea = store?.getSite?.()?.parcel?.area ?? null;
    } catch (err) {
        console.warn('[SiteInspectorPanel] store read failed:', err);
    }

    const summary = summarizeSite(location, boundary, storeArea);

    if (!summary.hasSite) {
        body.appendChild(_emptyState(
            '📍',
            'No site yet',
            'Search an address or draw your plot boundary on the map (Draw Site Boundary) — the site you author will appear here.',
        ));
        // Still offer the edit-boundary entry point so the user can start.
        body.appendChild(_actions(false));
        return;
    }

    // ── Location ──
    const locSection = _section();
    locSection.appendChild(_row('Address', summary.address ?? '—'));
    const latlon = summary.latitude != null && summary.longitude != null
        ? `${summary.latitude.toFixed(5)}°, ${summary.longitude.toFixed(5)}°`
        : '—';
    locSection.appendChild(_row('Lat / Lon', latlon, true));
    body.appendChild(locSection);

    // ── Parcel ──
    const parcelSection = _section();
    parcelSection.appendChild(_row(
        'Parcel area',
        summary.areaM2 > 0 ? `${_fmtArea(summary.areaM2)} m²` : '—',
        true,
    ));
    parcelSection.appendChild(_row(
        'Boundary',
        summary.vertexCount > 0 ? `${summary.vertexCount} vertices` : 'not drawn',
        true,
    ));
    if (summary.frontageEdges != null && summary.frontageEdges > 0) {
        parcelSection.appendChild(_row(
            'Frontage',
            `${summary.frontageEdges} edge${summary.frontageEdges === 1 ? '' : 's'}`,
            true,
        ));
    }
    if (summary.trueNorthDeg != null) {
        parcelSection.appendChild(_row('True north', `${summary.trueNorthDeg.toFixed(1)}°`, true));
    }
    body.appendChild(parcelSection);

    // ── Boundary thumbnail ──
    const thumb = boundary ? _thumbnail(boundary.polygon) : null;
    if (thumb) body.appendChild(thumb);

    // ── Actions ──
    body.appendChild(_actions(summary.vertexCount > 0));
}

// ── Sub-builders ──────────────────────────────────────────────────────────────

function _section(): HTMLElement {
    const s = document.createElement('div');
    s.className = 'sip-section';
    return s;
}

function _row(label: string, value: string, mono = false): HTMLElement {
    const row = document.createElement('div');
    row.className = 'sip-row';
    const l = document.createElement('span');
    l.className = 'sip-label';
    l.textContent = label;
    const v = document.createElement('span');
    v.className = 'sip-value' + (mono ? ' sip-value--mono' : '');
    v.textContent = value;
    row.appendChild(l);
    row.appendChild(v);
    return row;
}

function _thumbnail(polygon: ParcelBoundaryLike['polygon']): HTMLElement | null {
    const d = boundaryThumbnailPath(polygon, 1);
    if (!d) return null;
    const wrap = document.createElement('div');
    wrap.className = 'sip-thumb-wrap';
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'sip-thumb');
    svg.setAttribute('width', '120');
    svg.setAttribute('height', '120');
    svg.setAttribute('viewBox', '0 0 1 1');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('class', 'sip-thumb-poly');
    path.setAttribute('d', d);
    svg.appendChild(path);
    wrap.appendChild(svg);
    return wrap;
}

function _actions(hasBoundary: boolean): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'sip-actions';

    const climate = _actionBtn('🌦', 'Climate analysis', () => {
        void import('../climate/ClimatePanel')
            .then((m) => m.openClimatePanel(_runtime))
            .catch((err) => console.error('[SiteInspectorPanel] open climate failed:', err));
    });
    wrap.appendChild(climate);

    const edit = _actionBtn(hasBoundary ? '✏️' : '➕', hasBoundary ? 'Edit boundary' : 'Draw boundary', () => {
        try {
            const fn = (window as { pryzmStartBoundaryDraw?: () => void }).pryzmStartBoundaryDraw;
            if (typeof fn === 'function') fn();
            else console.warn('[SiteInspectorPanel] window.pryzmStartBoundaryDraw not ready — activate Geospatial first.');
        } catch (err) {
            console.error('[SiteInspectorPanel] start boundary draw failed:', err);
        }
    });
    wrap.appendChild(edit);

    return wrap;
}

function _actionBtn(icon: string, label: string, onClick: () => void): HTMLElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sip-action-btn';
    const ic = document.createElement('span');
    ic.className = 'sip-action-icon';
    ic.textContent = icon;
    const lbl = document.createElement('span');
    lbl.textContent = label;
    btn.appendChild(ic);
    btn.appendChild(lbl);
    btn.addEventListener('click', onClick);
    return btn;
}

function _emptyState(icon: string, title: string, detail: string): HTMLElement {
    const el = document.createElement('div');
    el.className = 'sip-empty';
    const ic = document.createElement('span');
    ic.className = 'sip-empty-icon';
    ic.textContent = icon;
    const t = document.createElement('div');
    t.className = 'sip-empty-title';
    t.textContent = title;
    const d = document.createElement('div');
    d.textContent = detail;
    el.appendChild(ic);
    el.appendChild(t);
    el.appendChild(d);
    return el;
}

// ── Format helpers ────────────────────────────────────────────────────────────

function _fmtArea(m2: number): string {
    if (m2 >= 100) return Math.round(m2).toLocaleString();
    return m2.toFixed(1);
}
