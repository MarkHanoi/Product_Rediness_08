/**
 * ManualAdminZonePanel.ts — the admin-only manual zone-entry panel.
 *
 * WHAT THIS IS: a small floating panel, visible ONLY to the small named `PRYZM_ADMIN` allowlist
 * (`server/adminAllowlist.js`), that lets that admin type a Córdoba zone + subzone code for the
 * currently-viewed site and save it INSTANTLY (no git commit, no deploy) — a computed envelope
 * follows immediately, visible ONLY in that admin's own session. Replaces the much slower "full
 * agent tracing pass" workflow for one-off TEST parcels. See
 * `docs/04-reference/jurisdictions/es/es-an/14021-cordoba/findings/TRACED-ZONE-SERVICE-2026-08-05.md`.
 *
 * ⚠⚠ CLIENT-SIDE VISIBILITY IS ADVISORY ONLY. This panel calls `GET /api/session/whoami` to decide
 * whether to render at all — but the REAL gate is server-side (`server/adminAllowlist.js`'s
 * `isPryzmAdmin`, re-checked by both `POST /api/manual-zone` and `GET /api/manual-zone/resolve`).
 * A non-admin who forced this panel open (e.g. via devtools) would still get a 403 from the save
 * endpoint and would never see a resolved entry — the UI hiding it is a convenience, not a control.
 *
 * P6 — THIS PANEL NEVER WRITES TO ANY STORE DIRECTLY. Saving a manual zone entry is a plain
 * `fetch()` to the server (there is no client-side store field for "manual admin zone" at all —
 * the server is the sole source of truth for it). To make the freshly-saved entry compute
 * IMMEDIATELY, this panel re-invokes `dispatchParcelBoundary()` with the site's OWN
 * already-committed boundary — the exact same sanctioned re-entry point every other GIS authoring
 * surface in this codebase uses to (re)trigger zoning resolution, which itself writes zoning
 * fields ONLY via the `site.updateZoning` command (`siteUpdateZoning`, see `dispatchEnvelope` in
 * `siteDispatch.ts`, annotated "(P6)" at its call site) — never a raw store write. This panel adds
 * no new store-mutation path; it only triggers the existing one.
 *
 * P8 — every exported function below adds an OTel span.
 */

import { trace, SpanStatusCode } from '@opentelemetry/api';
import { injectAppTheme } from '../styles/AppTheme';
import { dispatchParcelBoundary, deriveParcelQueryLatLon, resolveSiteContext, type SiteContext } from './siteDispatch';

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

const tracer = trace.getTracer('pryzm.ui.manual-admin-zone-panel');

const AUTH_TOKEN_KEY = 'bim-platform-token';

let _runtime: Runtime | null = null;
let _panel: HTMLElement | null = null;
let _statusEl: HTMLElement | null = null;
let _zoneSelect: HTMLSelectElement | null = null;
let _customRow: HTMLElement | null = null;
let _zoneInput: HTMLInputElement | null = null;
let _subzoneInput: HTMLInputElement | null = null;

/** Sentinel `<option>` value that reveals the free-text fallback row below. */
const CUSTOM_CODE_VALUE = '__custom__';

/**
 * The known, real-footprint Córdoba PGOU-2001 zone codes (`packages/site-parcel-data/src/rulepacks/
 * esCordobaPGOU2001.ts`) — every code here computes a real envelope, never a refusal. Grouped by
 * plain-language family so an admin doesn't need to already know the ordinance's own zone-family
 * abbreviations to pick the right one. Each option's `value` is the EXACT combined code the rule
 * pack keys on (e.g. `'OA-1'`, not `'OA'` + a separate subzone) — the pack has no separate
 * zone/subzone fields for these, so selecting one sets `zoneCode` alone and leaves the subzone input
 * unused (see `_onSave`).
 *
 * ⚠ This list is NOT exhaustive of every code the pack recognises — several codes (`MC`, `PTC`, and
 * others documented in `SEVILLA`/`CORDOBA-REMAINING-BLOCKERS` findings as structural refusals) are
 * deliberately excluded here because they never resolve to a buildable footprint; offering them in a
 * "pick one" dropdown would misleadingly imply they're just as usable as the real-footprint codes.
 * An admin who genuinely wants to test one of those (or a code not in this pack at all) uses
 * "Other / I don't know — type it" below instead.
 */
const KNOWN_CORDOBA_ZONE_OPTIONS: ReadonlyArray<{
    readonly group: string;
    readonly code: string;
    readonly label: string;
}> = [
    { group: 'Unifamiliar Aislada — detached single-family houses', code: 'UAS-1', label: 'UAS-1 (PGOU Art. 13.10)' },
    { group: 'Unifamiliar Aislada — detached single-family houses', code: 'UAS-2', label: 'UAS-2 (PGOU Art. 13.10)' },
    { group: 'Unifamiliar Aislada — detached single-family houses', code: 'UAS-3', label: 'UAS-3 (PGOU Art. 13.10)' },
    { group: 'Unifamiliar Aislada — detached single-family houses', code: 'UAS-4', label: 'UAS-4 (PGOU Art. 13.10)' },
    { group: 'Unifamiliar Aislada — detached single-family houses', code: 'UAS-5', label: 'UAS-5 (PGOU Art. 13.10)' },
    { group: 'Unifamiliar Aislada — detached single-family houses', code: 'UAS-6', label: 'UAS-6 (PGOU Art. 13.10)' },
    { group: 'Unifamiliar Adosada — row houses / townhouses', code: 'UAD-1', label: 'UAD-1 (PGOU Art. 13.9)' },
    { group: 'Unifamiliar Adosada — row houses / townhouses', code: 'UAD-2', label: 'UAD-2 (PGOU Art. 13.9)' },
    { group: 'Unifamiliar Adosada — row houses / townhouses', code: 'UAD-3', label: 'UAD-3 (PGOU Art. 13.9)' },
    { group: 'Plurifamiliar Aislada — apartment blocks', code: 'PAS-1', label: 'PAS-1 (PGOU Art. 13.7)' },
    { group: 'Plurifamiliar Aislada — apartment blocks', code: 'PAS-2', label: 'PAS-2 (PGOU Art. 13.7)' },
    { group: 'Plurifamiliar Aislada — apartment blocks', code: 'PAS-3', label: 'PAS-3 (PGOU Art. 13.7)' },
    { group: 'Ordenación Abierta — open urban layout', code: 'OA-1', label: 'OA-1 (PGOU Art. 13.6)' },
    { group: 'Ordenación Abierta — open urban layout', code: 'OA-2', label: 'OA-2 (PGOU Art. 13.6)' },
    { group: 'Colonia Tradicional Popular — traditional housing colony', code: 'CTP-1', label: 'CTP-1 (PGOU Art. 13.8)' },
    // ⚠ Manzana Cerrada (MC-1..4) and PTC are DELIBERATELY EXCLUDED — both are structural refusals in
    // the pack (`CORDOBA_MC_FONDO_UNRESOLVED_RING` / `CORDOBA_PTCV_FOOTPRINT_UNRESOLVED_RING`; the
    // depth/footprint is legally unresolved, not just unimplemented), so picking them here would
    // never compute a real envelope and would misleadingly imply they're as usable as the codes
    // above. An admin who wants to try one anyway uses "Other / I don't know" below.
];

export function wireManualAdminZonePanelRuntime(rt: Runtime | null): void {
    _runtime = rt;
}

function _authToken(): string | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        return localStorage.getItem(AUTH_TOKEN_KEY);
    } catch {
        return null;
    }
}

/**
 * Asks the server whether the current session belongs to an allowlisted admin
 * (`GET /api/session/whoami`). Never throws — a network failure is treated as "not an admin"
 * (fail closed, never fail open on a UI-only convenience check).
 */
export async function currentSessionIsPryzmAdmin(): Promise<boolean> {
    const span = tracer.startSpan('pryzm.ui.manual_admin_zone_panel.check_session');
    try {
        const token = _authToken();
        if (!token) {
            span.setAttribute('result', 'no-token');
            span.setStatus({ code: SpanStatusCode.OK });
            return false;
        }
        const res = await fetch('/api/session/whoami', {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            span.setAttribute('result', `http-${res.status}`);
            span.setStatus({ code: SpanStatusCode.OK });
            return false;
        }
        const body = (await res.json()) as { isAdmin?: boolean };
        span.setAttribute('result', body?.isAdmin === true ? 'admin' : 'not-admin');
        span.setStatus({ code: SpanStatusCode.OK });
        return body?.isAdmin === true;
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message ?? String(err) });
        console.warn('[ManualAdminZonePanel] session check failed (treated as non-admin):', err);
        return false;
    } finally {
        span.end();
    }
}

/**
 * Mounts (or re-shows) the panel iff the current session is an allowlisted admin. Safe to call
 * unconditionally from app boot — it is a no-op for every non-admin session.
 */
export async function openManualAdminZonePanelIfAdmin(runtime: Runtime | null = null): Promise<void> {
    const span = tracer.startSpan('pryzm.ui.manual_admin_zone_panel.open_if_admin');
    try {
        if (runtime) _runtime = runtime;
        const isAdmin = await currentSessionIsPryzmAdmin();
        span.setAttribute('isAdmin', isAdmin);
        if (!isAdmin) {
            span.setStatus({ code: SpanStatusCode.OK });
            return;
        }
        if (!_panel) {
            _panel = _build();
            document.body.appendChild(_panel);
        }
        _panel.style.display = 'flex';
        span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message ?? String(err) });
        console.warn('[ManualAdminZonePanel] open failed (non-fatal):', err);
    } finally {
        span.end();
    }
}

export function closeManualAdminZonePanel(): void {
    if (_panel) _panel.style.display = 'none';
}

/** Test/HMR hygiene. */
export function disposeManualAdminZonePanel(): void {
    if (_panel?.parentElement) _panel.parentElement.removeChild(_panel);
    _panel = null;
    _statusEl = null;
    _zoneSelect = null;
    _customRow = null;
    _zoneInput = null;
    _subzoneInput = null;
}

/**
 * Makes `panel` draggable by pointer-dragging `handle` (its header). Converts the panel's
 * fixed `right`/`bottom` anchoring to an explicit `left`/`top` pixel position on first drag (so it
 * moves from wherever it currently sits, not from a hardcoded corner), and clamps the result to
 * stay fully on-screen — dragging off-viewport would make the panel unreachable/unclosable, which
 * would be worse than not offering drag at all.
 */
function _wireDrag(panel: HTMLElement, handle: HTMLElement): void {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onPointerDown = (ev: PointerEvent): void => {
        // Ignore drags started on the close button itself.
        if ((ev.target as HTMLElement)?.tagName === 'BUTTON') return;
        const rect = panel.getBoundingClientRect();
        // Freeze the panel's CURRENT on-screen position as explicit left/top, replacing
        // right/bottom anchoring — otherwise the browser would keep re-deriving position from
        // right/bottom as the window resizes, fighting the drag.
        panel.style.left = `${rect.left}px`;
        panel.style.top = `${rect.top}px`;
        panel.style.right = '';
        panel.style.bottom = '';
        startLeft = rect.left;
        startTop = rect.top;
        startX = ev.clientX;
        startY = ev.clientY;
        dragging = true;
        handle.setPointerCapture(ev.pointerId);
        ev.preventDefault();
    };
    const onPointerMove = (ev: PointerEvent): void => {
        if (!dragging) return;
        const rect = panel.getBoundingClientRect();
        const maxLeft = Math.max(0, window.innerWidth - rect.width);
        const maxTop = Math.max(0, window.innerHeight - rect.height);
        const nextLeft = Math.min(maxLeft, Math.max(0, startLeft + (ev.clientX - startX)));
        const nextTop = Math.min(maxTop, Math.max(0, startTop + (ev.clientY - startY)));
        panel.style.left = `${nextLeft}px`;
        panel.style.top = `${nextTop}px`;
    };
    const onPointerUp = (ev: PointerEvent): void => {
        if (!dragging) return;
        dragging = false;
        try { handle.releasePointerCapture(ev.pointerId); } catch { /* already released */ }
    };
    handle.addEventListener('pointerdown', onPointerDown);
    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerUp);
    handle.addEventListener('pointercancel', onPointerUp);
}

function _build(): HTMLElement {
    injectAppTheme();
    const el = document.createElement('div');
    el.className = 'mazp-panel';
    el.style.cssText =
        'position:fixed;right:16px;bottom:16px;z-index:9999;display:flex;flex-direction:column;' +
        'gap:8px;padding:12px;border-radius:8px;background:var(--pryzm-panel-bg,#1e1e1e);' +
        'color:var(--pryzm-panel-fg,#eee);box-shadow:0 4px 16px rgba(0,0,0,0.4);width:260px;' +
        'font:12px/1.4 system-ui,sans-serif;';

    const header = document.createElement('div');
    header.style.cssText =
        'display:flex;justify-content:space-between;align-items:center;font-weight:600;' +
        'cursor:move;user-select:none;';
    const headerLabel = document.createElement('span');
    headerLabel.textContent = '🛠️ Manual zone entry (admin)';
    header.appendChild(headerLabel);
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.title = 'Close';
    close.style.cssText = 'background:none;border:none;color:inherit;cursor:pointer;font-size:14px;';
    close.addEventListener('click', () => closeManualAdminZonePanel());
    header.appendChild(close);
    el.appendChild(header);
    _wireDrag(el, header);

    const zoneLabel = document.createElement('label');
    zoneLabel.textContent = 'Zone';
    el.appendChild(zoneLabel);

    const select = document.createElement('select');
    select.style.cssText =
        'padding:6px;border-radius:6px;border:1px solid #444;background:#2a2a2a;color:inherit;';
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = '— choose a zone —';
    placeholderOpt.disabled = true;
    placeholderOpt.selected = true;
    select.appendChild(placeholderOpt);

    const groups = new Map<string, HTMLOptGroupElement>();
    for (const opt of KNOWN_CORDOBA_ZONE_OPTIONS) {
        let group = groups.get(opt.group);
        if (!group) {
            group = document.createElement('optgroup');
            group.label = opt.group;
            select.appendChild(group);
            groups.set(opt.group, group);
        }
        const optionEl = document.createElement('option');
        optionEl.value = opt.code;
        optionEl.textContent = opt.label;
        group.appendChild(optionEl);
    }

    const customOpt = document.createElement('option');
    customOpt.value = CUSTOM_CODE_VALUE;
    customOpt.textContent = "Other / I don't know — type it";
    select.appendChild(customOpt);
    _zoneSelect = select;
    select.addEventListener('change', () => {
        if (_customRow) {
            _customRow.style.display = select.value === CUSTOM_CODE_VALUE ? 'flex' : 'none';
        }
    });
    el.appendChild(select);

    // Free-text fallback — hidden unless "Other / I don't know" is selected above. Kept as two
    // separate zone/subzone inputs (rather than one combined-code input) because a code typed here
    // may be one this dropdown doesn't list at all (see the dropdown's own "deliberately excluded"
    // note) — an admin exploring an unlisted code still needs to say what they mean in the ordinance's
    // own vocabulary, which is a family + subzone pair, not always a single hyphenated token.
    const customRow = document.createElement('div');
    customRow.style.cssText = 'display:none;flex-direction:column;gap:8px;';
    _customRow = customRow;

    const zoneInputLabel = document.createElement('label');
    zoneInputLabel.textContent = 'Zone code (e.g. PAS-2)';
    const zoneInput = document.createElement('input');
    zoneInput.type = 'text';
    zoneInput.placeholder = 'PAS-2';
    _zoneInput = zoneInput;
    customRow.appendChild(zoneInputLabel);
    customRow.appendChild(zoneInput);

    const subzoneLabel = document.createElement('label');
    subzoneLabel.textContent = 'Subzone (optional)';
    const subzoneInput = document.createElement('input');
    subzoneInput.type = 'text';
    subzoneInput.placeholder = '2';
    _subzoneInput = subzoneInput;
    customRow.appendChild(subzoneLabel);
    customRow.appendChild(subzoneInput);

    el.appendChild(customRow);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save + compute';
    saveBtn.style.cssText =
        'padding:6px 10px;border-radius:6px;border:none;background:#6600FF;color:#fff;cursor:pointer;';
    saveBtn.addEventListener('click', () => { void _onSave(); });
    el.appendChild(saveBtn);

    const status = document.createElement('div');
    status.style.cssText = 'min-height:16px;opacity:0.85;';
    _statusEl = status;
    el.appendChild(status);

    return el;
}

function _setStatus(msg: string): void {
    if (_statusEl) _statusEl.textContent = msg;
}

/**
 * The panel's ONE mutating action: save the typed zone/subzone to the server, then re-invoke
 * `dispatchParcelBoundary()` on the site's OWN already-committed boundary so the new entry
 * computes immediately (see the file header's P6 note — this never writes to any store field
 * directly; it re-triggers the existing, sanctioned zoning-recompute entry point).
 */
async function _onSave(): Promise<void> {
    const span = tracer.startSpan('pryzm.ui.manual_admin_zone_panel.save');
    try {
        const token = _authToken();
        if (!token) {
            _setStatus('Not signed in.');
            span.setAttribute('result', 'no-token');
            span.setStatus({ code: SpanStatusCode.OK });
            return;
        }
        const selected = _zoneSelect?.value ?? '';
        const usingCustom = selected === CUSTOM_CODE_VALUE || selected === '';
        const zoneCode = usingCustom
            ? (_zoneInput?.value?.trim() ?? '')
            : selected;
        // Only the free-text fallback ever carries a separate subzone — every known dropdown code is
        // already the pack's own combined code (e.g. `'OA-1'`), so appending a subzone to it would be
        // double-counting (see `KNOWN_CORDOBA_ZONE_OPTIONS`'s doc comment).
        const subzoneCode = usingCustom ? (_subzoneInput?.value?.trim() || undefined) : undefined;
        if (!zoneCode) {
            _setStatus(usingCustom ? 'Zone code is required.' : 'Choose a zone first.');
            span.setAttribute('result', 'no-zone-code');
            span.setStatus({ code: SpanStatusCode.OK });
            return;
        }

        const ctx: SiteContext | null = resolveSiteContext(_runtime);
        const site = ctx?.store.getSite();
        const location = site?.location;
        if (!ctx || !site || location == null || typeof location.latitude !== 'number' || typeof location.longitude !== 'number') {
            _setStatus('No active site with a location — open/create a site first.');
            span.setAttribute('result', 'no-site-location');
            span.setStatus({ code: SpanStatusCode.OK });
            return;
        }
        // §MANUAL-ADMIN-ZONE-QUERY-POINT-FIX (2026-08-05) — save at the SAME point the resolver
        // will query at, not the site's anchor/geocode location. Before this fix, a save at
        // `location.latitude/longitude` could silently miss `resolveManualAdminZone`'s 60m match
        // radius whenever the parcel's true centroid sat further than that from the anchor (any
        // DRAW flow, or a SELECT on an off-centre parcel) — the admin saw "Saved" but the card kept
        // showing the old refusal, because read-back queried a DIFFERENT point than what was saved.
        // `deriveParcelQueryLatLon` is the exact function `siteDispatch.ts`'s own zoning dispatch
        // uses for this parcel, so save and read are now guaranteed to agree.
        const boundary = site.parcel?.boundary;
        const queryPoint =
            deriveParcelQueryLatLon(location, boundary?.polygon ?? []) ??
            { lat: location.latitude, lon: location.longitude };

        _setStatus('Saving…');
        const res = await fetch('/api/manual-zone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                jurisdiction: 'es-cordoba',
                lat: queryPoint.lat,
                lon: queryPoint.lon,
                zoneCode,
                subzoneCode,
            }),
        });
        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            _setStatus(`Save failed: ${body?.error ?? res.status}`);
            span.setAttribute('result', `http-${res.status}`);
            span.setStatus({ code: SpanStatusCode.OK });
            return;
        }

        _setStatus('Saved — recomputing…');
        if (boundary && Array.isArray(boundary.polygon) && boundary.polygon.length >= 3) {
            dispatchParcelBoundary(ctx, {
                polygon: boundary.polygon,
                edgeClassifications: boundary.edgeClassifications ?? [],
            });
        }
        _setStatus(`Saved ${zoneCode}${subzoneCode ? `/${subzoneCode}` : ''} — envelope recomputed.`);
        span.setAttribute('result', 'ok');
        span.setAttribute('zoneCode', zoneCode);
        span.setStatus({ code: SpanStatusCode.OK });
    } catch (err) {
        _setStatus('Save failed (unexpected error) — see console.');
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error)?.message ?? String(err) });
        console.error('[ManualAdminZonePanel] save failed:', err);
    } finally {
        span.end();
    }
}
