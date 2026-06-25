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
 * The renderer is created once at engine boot, so switching backends writes the
 * persisted preference (localStorage) and reloads the page — the next boot
 * honours the choice via createRenderer().
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
        setRendererBackendPreference(pref);

        // §PERF-WEBGPU-FRAGMENT / ADR-0076 — the renderer backend is resolved ONCE
        // at boot by RendererHandleFactory. A LIVE in-place renderer hot-swap of an
        // already-open project collapses the viewport (scene/camera/RenderPipeline
        // manager/frame-loop are bound to the old renderer). The founder confirmed a
        // FRESH boot into either backend renders perfectly. So we deliberately do NOT
        // hot-swap — we persist the choice and trigger a full page reload, which boots
        // cleanly into the chosen backend via the exact, known-good boot path.
        //
        // REOPEN-PROJECT: a plain reload boots to the projects hub (#/projects), so
        // the user would lose the project they were in on every swap. Set a one-shot
        // sessionStorage flag; PlatformRouter consumes it on the next boot and
        // relaunches the last-open project (which it records in launchWorkspace).
        try { sessionStorage.setItem('pryzm.reopenProjectAfterReload', '1'); } catch { /* no sessionStorage */ }

        this._showReloadNotice(pref);
        // Defer the reload one tick so the notice paints before navigation.
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
