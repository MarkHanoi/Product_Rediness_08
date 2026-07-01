/**
 * gpuDisabledOverlay.ts — §GPU-DISABLED-GRACEFUL-BOOT
 *
 * A tiny, SELF-CONTAINED full-screen recovery overlay shown when the BIM engine
 * cannot obtain a WebGL/WebGPU context because the browser has DISABLED graphics
 * acceleration for the session (a repeated-GPU-crash lockout — Chrome/Edge
 * blocklist GPU access until the browser process is fully restarted).
 *
 * WHY IT LIVES HERE (and has ZERO engine deps):
 *   The engine (Three.js / @thatopen / renderer-three) is exactly what FAILED to
 *   boot, so this overlay must not import any of it. It builds a plain DOM tree,
 *   uses only the PRYZM brand palette (white + #6600FF, no black — see MEMORY
 *   "Preview color = unified PRYZM purple"), and is called from `src/main.ts`'s
 *   `startEngine()` catch AFTER the safe forced-WebGL retry has also failed.
 *
 * Detection of the GPU-disabled case + the retry-once policy live in `main.ts`;
 * this module is purely the presentation surface.
 */

const OVERLAY_ID = 'pryzm-gpu-disabled-overlay';

const BRAND_PURPLE = '#6600FF';

/**
 * Matches the family of WebGL/WebGPU context-creation failures that mean the
 * browser has disabled hardware acceleration (as opposed to an ordinary
 * bootstrap error). These are the exact substrings seen in the field console
 * after a GPU lockout:
 *   • "context could not be created"   (THREE.WebGLRenderer)
 *   • "Error creating WebGL context"   (three → OBC bootstrap)
 *   • "GL_VENDOR = Disabled"           (Chrome/Edge blocklist banner)
 *   • "BindToCurrentSequence failed"   (sandboxed GPU process refused)
 *   • "WebGL context could not be created"
 */
export function isGpuDisabledError(err: unknown): boolean {
    const msg =
        (err instanceof Error ? err.message : typeof err === 'string' ? err : '') || '';
    if (!msg) return false;
    return (
        /context could not be created/i.test(msg) ||
        /Error creating WebGL context/i.test(msg) ||
        /GL_VENDOR\s*=\s*Disabled/i.test(msg) ||
        /BindToCurrentSequence/i.test(msg) ||
        /WebGL context could not be created/i.test(msg)
    );
}

/**
 * Paints the recovery overlay. Idempotent — a second call is a no-op if the
 * overlay is already mounted (so a duplicate failure path cannot stack two).
 */
export function showGpuDisabledOverlay(): void {
    if (typeof document === 'undefined') return;
    if (document.getElementById(OVERLAY_ID)) return;

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Graphics acceleration is disabled');
    overlay.style.cssText = [
        'position:fixed',
        'inset:0',
        'z-index:2147483647',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'padding:24px',
        'background:#ffffff',
        'font-family:Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif',
        'color:#1a1333',
    ].join(';');

    const card = document.createElement('div');
    card.style.cssText = [
        'max-width:560px',
        'width:100%',
        'background:#ffffff',
        'border:1px solid rgba(102,0,255,0.18)',
        'border-radius:16px',
        'box-shadow:0 12px 48px rgba(102,0,255,0.14)',
        'padding:36px 40px',
        'text-align:left',
    ].join(';');

    // Brand mark (purple wordmark — no black).
    const brand = document.createElement('div');
    brand.textContent = 'PRYZM';
    brand.style.cssText = [
        `color:${BRAND_PURPLE}`,
        'font-weight:800',
        'letter-spacing:0.14em',
        'font-size:14px',
        'margin-bottom:20px',
    ].join(';');

    const heading = document.createElement('h1');
    heading.textContent = "Your browser's graphics acceleration is disabled";
    heading.style.cssText = [
        'font-size:22px',
        'line-height:1.3',
        'font-weight:700',
        'margin:0 0 12px',
        'color:#1a1333',
    ].join(';');

    const intro = document.createElement('p');
    intro.textContent =
        "PRYZM can't start its 3D engine because the browser has turned off GPU " +
        'acceleration for this session. This usually happens after repeated ' +
        'graphics crashes. To recover:';
    intro.style.cssText = 'font-size:15px;line-height:1.55;margin:0 0 20px;color:#3a2f57;';

    const steps = document.createElement('ol');
    steps.style.cssText =
        'font-size:15px;line-height:1.6;margin:0 0 28px;padding-left:22px;color:#3a2f57;';
    const stepText = [
        'Fully <strong>quit and reopen your browser</strong> — a normal page refresh will not clear the lockout.',
        'Make sure <strong>hardware acceleration is ON</strong>: open <strong>edge://settings/system</strong> or <strong>chrome://settings/system</strong> and enable “Use graphics acceleration when available”.',
        'Return to PRYZM and reload.',
    ];
    for (const t of stepText) {
        const li = document.createElement('li');
        li.innerHTML = t;
        li.style.cssText = 'margin-bottom:8px;';
        steps.appendChild(li);
    }

    const reloadBtn = document.createElement('button');
    reloadBtn.type = 'button';
    reloadBtn.textContent = 'Reload PRYZM';
    reloadBtn.style.cssText = [
        `background:${BRAND_PURPLE}`,
        'color:#ffffff',
        'border:none',
        'border-radius:10px',
        'padding:13px 26px',
        'font-size:15px',
        'font-weight:600',
        'cursor:pointer',
        'box-shadow:0 4px 16px rgba(102,0,255,0.28)',
    ].join(';');
    reloadBtn.addEventListener('click', () => {
        try {
            window.location.reload();
        } catch {
            /* non-fatal */
        }
    });
    reloadBtn.addEventListener('mouseenter', () => {
        reloadBtn.style.filter = 'brightness(1.08)';
    });
    reloadBtn.addEventListener('mouseleave', () => {
        reloadBtn.style.filter = 'none';
    });

    card.appendChild(brand);
    card.appendChild(heading);
    card.appendChild(intro);
    card.appendChild(steps);
    card.appendChild(reloadBtn);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
}
