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
import { dispatchParcelBoundary, resolveSiteContext, type SiteContext } from './siteDispatch';

type Runtime = import('@pryzm/runtime-composer/types').PryzmRuntime;

const tracer = trace.getTracer('pryzm.ui.manual-admin-zone-panel');

const AUTH_TOKEN_KEY = 'bim-platform-token';

let _runtime: Runtime | null = null;
let _panel: HTMLElement | null = null;
let _statusEl: HTMLElement | null = null;
let _zoneInput: HTMLInputElement | null = null;
let _subzoneInput: HTMLInputElement | null = null;

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
    _zoneInput = null;
    _subzoneInput = null;
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
    header.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-weight:600;';
    header.textContent = '🛠️ Manual zone entry (admin)';
    const close = document.createElement('button');
    close.type = 'button';
    close.textContent = '✕';
    close.style.cssText = 'background:none;border:none;color:inherit;cursor:pointer;';
    close.addEventListener('click', () => closeManualAdminZonePanel());
    header.appendChild(close);
    el.appendChild(header);

    const zoneLabel = document.createElement('label');
    zoneLabel.textContent = 'Zone code (e.g. PAS-2)';
    const zoneInput = document.createElement('input');
    zoneInput.type = 'text';
    zoneInput.placeholder = 'PAS-2';
    _zoneInput = zoneInput;
    el.appendChild(zoneLabel);
    el.appendChild(zoneInput);

    const subzoneLabel = document.createElement('label');
    subzoneLabel.textContent = 'Subzone (optional)';
    const subzoneInput = document.createElement('input');
    subzoneInput.type = 'text';
    subzoneInput.placeholder = '2';
    _subzoneInput = subzoneInput;
    el.appendChild(subzoneLabel);
    el.appendChild(subzoneInput);

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
        const zoneCode = _zoneInput?.value?.trim() ?? '';
        const subzoneCode = _subzoneInput?.value?.trim() || undefined;
        if (!zoneCode) {
            _setStatus('Zone code is required.');
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

        _setStatus('Saving…');
        const res = await fetch('/api/manual-zone', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({
                jurisdiction: 'es-cordoba',
                lat: location.latitude,
                lon: location.longitude,
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
        const boundary = site.parcel?.boundary;
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
