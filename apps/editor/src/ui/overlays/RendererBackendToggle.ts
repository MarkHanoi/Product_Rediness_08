/**
 * @file apps/editor/src/ui/overlays/RendererBackendToggle.ts
 *
 * RendererBackendToggle — §PERF-WEBGPU-FRAGMENT / ADR-0076 (2026-06-24)
 *
 * A small corner pill that lets the user force the GPU backend between WebGPU
 * (the full TSL pipeline: SSGI + TRAA + soft shadows + outlines) and plain
 * WebGL2 (a simple, very stable forward render with no post-processing).
 *
 * Why this exists (founder request):
 *   • A/B perf tool — instantly compare the heavy WebGPU pipeline against the
 *     lightweight WebGL path on the same model.
 *   • Stability escape hatch — on machines where WebGPU device-loss cascades to
 *     a dead renderer ("A valid external Instance reference no longer exists"),
 *     the user can pin WebGL and keep working without a crash loop.
 *
 * ADR-0077 (§RENDERER-LIVE-SWAP, supersedes ADR-0076's reload path): switching
 * backends now performs a LIVE, in-place renderer swap via
 * `window.pryzmSwapRendererBackend` (registered by initScene). The project stays
 * open, the camera/view stays put, and the viewport keeps rendering — no page
 * reload, no project reopen. The persist+reload path is retained only as a
 * graceful fallback (`_reloadInto`) when the live swap is unavailable or fails.
 *
 * CONTRACT (05-BIM-UI-ARCHITECTURE §1): self-contained widget; no store writes.
 * P4: the active-backend read uses the typed `window.pryzmRendererBackend`
 * global (declared in apps/editor/src/types/globals.d.ts) — no `(window as any)`.
 */

import {
    getRendererBackendPreference,
    setRendererBackendPreference,
    type RendererBackendPreference,
} from '../../rendering/createRenderer';

const TOGGLE_ID = 'pryzm-renderer-backend-toggle';

/**
 * §FIX-SWAP-WEBGL-TO-WEBGPU-CRASH (L-153) — decide whether a failed/declined backend
 * switch should fall back to the legacy persist+reload path.
 *
 * A plain `location.reload()` boots to the projects HUB (#/projects), so it is only
 * acceptable when there is NO live in-place swap available (the engine has not yet
 * registered `window.pryzmSwapRendererBackend` — e.g. the toggle was clicked before
 * initScene ran, when no project is even open yet).
 *
 * When the live-swap entry point EXISTS but the swap returned `false` or threw, the swap
 * has ALREADY rolled back to the previous, still-rendering renderer (initScene's
 * §RENDERER-LIVE-SWAP catch re-binds it). Reloading in that case is what dumped the
 * founder back to the project hub on a WebGL→WebGPU switch (which does heavy TSL-pipeline
 * work on a freshly-acquired device and can fail, unlike WebGPU→WebGL which builds no
 * pipeline). So: reload ONLY when the swap is unavailable; otherwise stay on the live
 * (rolled-back) renderer and just tell the user.
 */
export function shouldFallBackToReload(swapAvailable: boolean): boolean {
    return !swapAvailable;
}

export class RendererBackendToggle {
    /** Mounts the corner pill. Idempotent. */
    mount(parent: HTMLElement = document.body): void {
        this.unmount();

        const current = getRendererBackendPreference();
        const activeBackend = window.pryzmRendererBackend;

        const wrap = document.createElement('div');
        wrap.id = TOGGLE_ID;
        wrap.setAttribute('role', 'group');
        wrap.setAttribute('aria-label', 'GPU renderer backend');
        Object.assign(wrap.style, {
            position: 'fixed',
            bottom: '10px',
            left: '10px',
            zIndex: '2147483000',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 6px',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid rgba(102,0,255,0.35)',
            boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
            font: '11px/1.2 system-ui, sans-serif',
            color: '#3a2a66',
            userSelect: 'none',
        } as CSSStyleDeclaration);

        const label = document.createElement('span');
        label.textContent = 'GPU:';
        label.style.opacity = '0.7';
        label.style.fontWeight = '600';
        wrap.appendChild(label);

        const makeBtn = (pref: RendererBackendPreference, text: string, title: string) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = text;
            b.title = title;
            const isActive = current === pref;
            Object.assign(b.style, {
                cursor: 'pointer',
                border: 'none',
                borderRadius: '999px',
                padding: '2px 8px',
                font: 'inherit',
                fontWeight: isActive ? '700' : '500',
                background: isActive ? '#6600FF' : 'transparent',
                color: isActive ? '#fff' : '#3a2a66',
            } as CSSStyleDeclaration);
            b.addEventListener('click', () => this._choose(pref));
            return b;
        };

        wrap.appendChild(makeBtn('auto', 'Auto', 'Automatic: WebGPU when available, else WebGL'));
        wrap.appendChild(makeBtn('webgpu', 'WebGPU', 'Force the full WebGPU pipeline (SSGI/TRAA/shadows)'));
        wrap.appendChild(makeBtn('webgl', 'WebGL', 'Force plain WebGL2 — simpler & very stable, no post-FX'));

        if (activeBackend) {
            const now = document.createElement('span');
            now.textContent = `· ${activeBackend}`;
            now.style.opacity = '0.55';
            now.title = 'Backend currently in use';
            wrap.appendChild(now);
        }

        parent.appendChild(wrap);
    }

    unmount(): void {
        document.getElementById(TOGGLE_ID)?.remove();
    }

    private _choose(pref: RendererBackendPreference): void {
        if (pref === getRendererBackendPreference()) return;

        // ADR-0077 (§RENDERER-LIVE-SWAP) — supersedes ADR-0076's persist+reload.
        // initScene now registers `window.pryzmSwapRendererBackend`, a live in-place
        // rebind layer: it disposes the old renderer + TSL pipeline, builds the new
        // backend on a fresh canvas in the same DOM slot, re-binds every renderer-
        // bound service, re-establishes the TSL pipeline for the new backend, and
        // resumes the single rAF loop — keeping the project open, the camera/view
        // exactly where it was, and the viewport rendering. No reload, no reopen.
        // The swap function persists the preference itself (so a fresh boot still
        // honours it). We mark the buttons busy while it runs.
        const swap = window.pryzmSwapRendererBackend;
        if (typeof swap === 'function') {
            this._setBusy(pref);
            void swap(pref)
                .then((ok) => {
                    if (ok) {
                        // Live swap succeeded — remount to reflect the new active
                        // backend + clear the busy state.
                        this.mount();
                        return;
                    }
                    // §FIX-SWAP-WEBGL-TO-WEBGPU-CRASH (L-153) — the swap ran and returned
                    // false, which means it ALREADY rolled back to the previous, still-
                    // rendering renderer (or declined without touching it). Do NOT reload:
                    // a plain reload boots to the project hub, which is the exact crash the
                    // founder saw switching WebGL→WebGPU. Keep the live renderer and tell the
                    // user we stayed put (the swap is available, so shouldFallBackToReload is
                    // false).
                    console.warn(
                        '[RendererBackendToggle] §FIX-SWAP-WEBGL-TO-WEBGPU-CRASH live swap could not ' +
                        'complete and rolled back — keeping the current renderer (no reload to the hub).',
                    );
                    this._notifyStayedPut(pref);
                    this.mount(); // clears the busy state; reflects the unchanged backend
                })
                .catch((err) => {
                    // A thrown swap is likewise rolled back by initScene's catch — stay put.
                    console.error(
                        '[RendererBackendToggle] §FIX-SWAP-WEBGL-TO-WEBGPU-CRASH swap threw — keeping the ' +
                        'current renderer (no reload to the hub):',
                        err,
                    );
                    this._notifyStayedPut(pref);
                    this.mount();
                });
            return;
        }

        // No live-swap entry point registered — the engine has not wired the in-place
        // rebind yet (toggle clicked before initScene ran, typically with no project open).
        // Only here is the persist+reload fallback safe (shouldFallBackToReload(false)).
        if (shouldFallBackToReload(/* swapAvailable */ false)) {
            this._reloadInto(pref);
        }
    }

    /** Disable the buttons + show a tiny "switching…" hint during the live swap. */
    private _setBusy(pref: RendererBackendPreference): void {
        try {
            const wrap = document.getElementById(TOGGLE_ID);
            if (!wrap) return;
            wrap.style.opacity = '0.6';
            wrap.style.pointerEvents = 'none';
            const label = pref === 'webgl' ? 'WebGL' : pref === 'webgpu' ? 'WebGPU' : 'Auto';
            const hint = document.createElement('span');
            hint.textContent = `· switching to ${label}…`;
            hint.style.opacity = '0.7';
            wrap.appendChild(hint);
        } catch { /* non-fatal cosmetic */ }
    }

    /**
     * §FIX-SWAP-WEBGL-TO-WEBGPU-CRASH (L-153) — brief, non-destructive inline notice
     * shown when a live backend switch could not complete and rolled back. Unlike the
     * old reload path this NEVER navigates away (no hub crash); the viewport keeps
     * rendering on the previous backend. Auto-dismisses.
     */
    private _notifyStayedPut(pref: RendererBackendPreference): void {
        try {
            const label = pref === 'webgl' ? 'WebGL' : pref === 'webgpu' ? 'WebGPU' : 'Auto';
            const active = window.pryzmRendererBackend ?? 'current';
            const note = document.createElement('div');
            note.setAttribute('role', 'status');
            Object.assign(note.style, {
                position: 'fixed',
                bottom: '44px',
                left: '10px',
                zIndex: '2147483600',
                maxWidth: '280px',
                padding: '8px 12px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.96)',
                border: '1px solid rgba(102,0,255,0.35)',
                boxShadow: '0 2px 10px rgba(0,0,0,0.14)',
                font: '12px/1.4 system-ui, sans-serif',
                color: '#3a2a66',
            } as CSSStyleDeclaration);
            note.textContent = `Couldn't switch to ${label} — staying on ${active}. The viewport is unchanged.`;
            document.body.appendChild(note);
            setTimeout(() => { try { note.remove(); } catch { /* already gone */ } }, 4200);
        } catch { /* non-fatal cosmetic */ }
    }

    /**
     * ADR-0077 fallback — the legacy ADR-0076 persist+reload path. Used only when
     * the live swap is unavailable or fails: persist the choice, set the one-shot
     * reopen-project flag, then reload. A plain reload boots to the projects hub
     * (#/projects), so the sessionStorage flag tells PlatformRouter to relaunch the
     * last-open project on the next boot.
     */
    private _reloadInto(pref: RendererBackendPreference): void {
        setRendererBackendPreference(pref);
        try { sessionStorage.setItem('pryzm.reopenProjectAfterReload', '1'); } catch { /* no sessionStorage */ }
        this._showReloadNotice(pref);
        setTimeout(() => {
            try { location.reload(); } catch { /* non-browser env */ }
        }, 350);
    }

    /** Tiny centered "switching renderer — reloading…" notice shown before reload. */
    private _showReloadNotice(pref: RendererBackendPreference): void {
        try {
            const label = pref === 'webgl' ? 'WebGL' : pref === 'webgpu' ? 'WebGPU' : 'Auto';
            const note = document.createElement('div');
            note.setAttribute('role', 'status');
            Object.assign(note.style, {
                position: 'fixed',
                inset: '0',
                zIndex: '2147483600',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.86)',
                font: '600 14px/1.4 system-ui, sans-serif',
                color: '#3a2a66',
            } as CSSStyleDeclaration);
            note.textContent = `Switching renderer to ${label} — reloading…`;
            document.body.appendChild(note);
        } catch { /* non-fatal cosmetic */ }
    }
}

/** Singleton, mounted by initScene after the backend is known. */
export const rendererBackendToggle = new RendererBackendToggle();
