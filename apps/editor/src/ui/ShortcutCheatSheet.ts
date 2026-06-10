/**
 * ShortcutCheatSheet — global keyboard shortcut reference overlay (A.33.b).
 *
 * Toggled by pressing `?` (Shift+/) anywhere in the app, except inside text
 * inputs / textareas. Renders a centered modal listing every shortcut.
 *
 * §A.33.b (2026-06-10) — the overlay now renders from the canonical
 * `@pryzm/keyboard-registry` (A.33.a) via `buildCheatSheetData(platform)`,
 * NOT a hand-curated list. This makes it (a) the single source of truth (the
 * cheat sheet can never drift from the live registry / CI guard) and (b)
 * platform-aware (`⌘ S` on macOS per Apple HIG, `Ctrl+S` on Windows/Linux per
 * the MS style guide). Experimental shortcuts render muted (per C43 §1.3).
 *
 * The overlay is dismissed by `?`, `Escape`, or clicking the backdrop.
 *
 * Contract compliance:
 *   §05 §6 — Plain DOM, no bim-* elements.
 *   §05 §7.6 — All styling inline; no independent <style> injection.
 *   §11      — Reserved keys policy: `?` is a discoverable, modifier-free key
 *              that is only treated as a shortcut when no input is focused.
 *   C43 §1.3 — cheat sheet sourced from the registry, never hand-curated.
 */

import {
    buildCheatSheetData,
    type CheatSheetData,
    type CheatSheetSection,
    type Platform,
} from '@pryzm/keyboard-registry';

/** Detect the active platform for combo glyph rendering. The registry's
 *  formatter is pure (platform passed explicitly, no file-scope sniff); the
 *  sniff lives here in the L5 component where the real environment is known. */
function detectPlatform(): Platform {
    const s = (typeof navigator !== 'undefined'
        ? (navigator.platform || navigator.userAgent || '')
        : '').toLowerCase();
    if (s.includes('mac') || s.includes('iphone') || s.includes('ipad')) return 'mac';
    if (s.includes('win')) return 'win';
    return 'linux';
}

let _overlayEl: HTMLElement | null = null;
let _installed = false;

export function installShortcutCheatSheet(
    runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime installShortcutCheatSheet */,
): void {
    void runtime; /* B-runtime-void installShortcutCheatSheet — TODO(C.3.x): consume in Phase C — runtime threading lands when Phase C wires the panel-host slot */
    if (_installed) return;
    _installed = true;

    window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

        // `?` (Shift+/) toggles the overlay. Skip when other modifiers are
        // pressed so it doesn't fight Ctrl+Shift+/ etc.
        if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            e.preventDefault();
            toggleShortcutCheatSheet();
            return;
        }

        // Escape closes the overlay if it is open.
        if (e.key === 'Escape' && _overlayEl) {
            e.preventDefault();
            hideShortcutCheatSheet();
        }
    }, { capture: false });
}

export function toggleShortcutCheatSheet(): void {
    if (_overlayEl) hideShortcutCheatSheet();
    else showShortcutCheatSheet();
}

export function showShortcutCheatSheet(): void {
    if (_overlayEl) return;

    // §A.33.b — render the LIVE registry, platform-aware. Single source of truth.
    const data: CheatSheetData = buildCheatSheetData(detectPlatform());

    const overlay = document.createElement('div');
    overlay.id = 'pryzm-shortcut-cheatsheet';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Keyboard shortcuts');
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: var(--pryzm-panel-backdrop, rgba(15,18,25,0.55));
        backdrop-filter: var(--pryzm-panel-backdrop-blur, blur(2px));
        -webkit-backdrop-filter: var(--pryzm-panel-backdrop-blur, blur(2px));
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
    `;
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) hideShortcutCheatSheet();
    });

    const card = document.createElement('div');
    card.style.cssText = `
        background: var(--app-surface, #ffffff);
        color: var(--app-text, #1a1a1a);
        border-radius: 14px;
        box-shadow: 0 24px 64px rgba(0, 0, 0, 0.35);
        max-width: 980px;
        width: 100%;
        max-height: 88vh;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: var(--app-font, system-ui, -apple-system, "Segoe UI", sans-serif);
    `;

    const header = document.createElement('div');
    header.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 24px;
        border-bottom: 1px solid var(--app-border, #e6e6ec);
    `;

    const title = document.createElement('div');
    title.style.cssText = `
        font-size: 16px;
        font-weight: 700;
        letter-spacing: 0.02em;
        color: var(--app-accent, #6600ff);
    `;
    title.textContent = 'Keyboard Shortcuts';

    const subtitle = document.createElement('div');
    subtitle.style.cssText = `
        font-size: 11px;
        color: var(--app-text-muted, #888);
        margin-top: 2px;
    `;
    subtitle.textContent = `${data.totalShortcuts} shortcuts · press ? again or Escape to close.`;

    const titleWrap = document.createElement('div');
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close shortcut cheat sheet');
    closeBtn.style.cssText = `
        background: none;
        border: 1px solid var(--app-border, #e6e6ec);
        border-radius: 8px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 12px;
        color: var(--app-text, #1a1a1a);
    `;
    closeBtn.textContent = 'Close';
    closeBtn.addEventListener('click', hideShortcutCheatSheet);

    header.appendChild(titleWrap);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.style.cssText = `
        flex: 1 1 auto;
        overflow-y: auto;
        padding: 18px 24px 24px 24px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 18px 28px;
        align-items: start;
    `;

    for (const section of data.sections) {
        body.appendChild(buildSection(section));
    }

    card.appendChild(header);
    card.appendChild(body);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    _overlayEl = overlay;
}

export function hideShortcutCheatSheet(): void {
    if (!_overlayEl) return;
    _overlayEl.remove();
    _overlayEl = null;
}

function buildSection(section: CheatSheetSection): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = `
        display: flex;
        flex-direction: column;
        gap: 6px;
        min-width: 0;
    `;

    const h = document.createElement('div');
    h.style.cssText = `
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--app-accent, #6600ff);
        border-bottom: 1px solid var(--app-border, #e6e6ec);
        padding-bottom: 4px;
        margin-bottom: 4px;
    `;
    h.textContent = section.displayName;
    wrap.appendChild(h);

    for (const r of section.rows) {
        const row = document.createElement('div');
        row.style.cssText = `
            display: grid;
            grid-template-columns: 132px 1fr;
            align-items: baseline;
            gap: 12px;
            padding: 4px 0;
            font-size: 12px;
            opacity: ${r.experimental ? '0.55' : '1'};
        `;

        const k = document.createElement('span');
        k.style.cssText = `
            font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
            font-size: 11px;
            background: var(--app-accent-bg, #f0ebff);
            color: var(--app-accent, #6600ff);
            padding: 3px 8px;
            border-radius: 6px;
            text-align: center;
            font-weight: 600;
            letter-spacing: 0.02em;
            white-space: nowrap;
        `;
        // Primary combo, plus any alias combos in parentheses.
        k.textContent = r.aliasCombos.length > 0
            ? `${r.primaryCombo}  ·  ${r.aliasCombos.join(' · ')}`
            : r.primaryCombo;

        const textWrap = document.createElement('span');
        textWrap.style.cssText = `min-width: 0;`;

        const l = document.createElement('span');
        l.style.cssText = `
            color: var(--app-text, #1a1a1a);
            display: block;
            font-weight: 500;
        `;
        l.textContent = r.experimental ? `${r.label} (experimental)` : r.label;
        textWrap.appendChild(l);

        if (r.description && r.description !== r.label) {
            const d = document.createElement('span');
            d.style.cssText = `
                color: var(--app-text-muted, #888);
                font-size: 10.5px;
                display: block;
                margin-top: 1px;
            `;
            d.textContent = r.description;
            textWrap.appendChild(d);
        }

        row.appendChild(k);
        row.appendChild(textWrap);
        wrap.appendChild(row);
    }

    return wrap;
}
