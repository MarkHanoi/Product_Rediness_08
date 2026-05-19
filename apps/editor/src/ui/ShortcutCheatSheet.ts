/**
 * ShortcutCheatSheet — global keyboard shortcut reference overlay.
 *
 * Toggled by pressing `?` (Shift+/) anywhere in the app, except inside text
 * inputs / textareas. Renders a centered modal listing every shortcut from:
 *
 *   • Element creation layer (Alt+letter) — see
 *     docs/00_AI_COMMANDS_REFERENCE/PRYZM-CREATION-SHORTCUTS.md
 *   • Contextual edit layer (single letter when an element is selected) —
 *     see docs/00_Contracts/11-KEYBOARD-SHORTCUTS-CONTRACT.md
 *   • Global layer (Ctrl+Z, Escape, etc.)
 *   • Visibility layer (H / I / G with selection)
 *
 * The overlay is dismissed by `?`, `Escape`, or clicking the backdrop.
 *
 * Contract compliance:
 *   §05 §6 — Plain DOM, no bim-* elements.
 *   §05 §7.6 — All styling inline; no independent <style> injection.
 *   §11      — Reserved keys policy: `?` is a discoverable, modifier-free key
 *              that is only treated as a shortcut when no input is focused.
 */

interface ShortcutEntry {
    keys:  string;
    label: string;
}

interface ShortcutSection {
    heading: string;
    note?:   string;
    entries: ShortcutEntry[];
}

const SECTIONS: ShortcutSection[] = [
    {
        heading: 'Element Creation — Architecture',
        note:    'Hold Alt + letter (works anywhere except text inputs).',
        entries: [
            { keys: 'Alt+W',        label: 'Wall' },
            { keys: 'Alt+Q',        label: 'Curtain Wall' },
            { keys: 'Alt+D',        label: 'Door' },
            { keys: 'Alt+I',        label: 'Window' },
            { keys: 'Alt+T',        label: 'Stair (I)' },
            { keys: 'Alt+Shift+T',  label: 'Stair (L)' },
            { keys: 'Alt+Ctrl+T',   label: 'Stair (U)' },
            { keys: 'Alt+H',        label: 'Handrail' },
            { keys: 'Alt+P',        label: 'Ramp' },
            { keys: 'Alt+C',        label: 'Ceiling' },
            { keys: 'Alt+Shift+C',  label: 'Auto Ceiling' },
            { keys: 'Alt+F',        label: 'Floor' },
            { keys: 'Alt+Shift+F',  label: 'Auto Floor' },
            { keys: 'Alt+R',        label: 'Room' },
            { keys: 'Alt+Shift+R',  label: 'Room (level auto-detect)' },
            { keys: 'Alt+B',        label: 'Room Bounding line' },
        ],
    },
    {
        heading: 'Element Creation — Structure',
        entries: [
            { keys: 'Alt+K',        label: 'Column' },
            { keys: 'Alt+E',        label: 'Beam' },
            { keys: 'Alt+S',        label: 'Slab' },
            { keys: 'Alt+O',        label: 'Roof (2-point)' },
            { keys: 'Alt+Shift+O',  label: 'Roof (polyline)' },
            { keys: 'Alt+Ctrl+O',   label: 'Roof (region)' },
            { keys: 'Alt+N',        label: 'Slab Opening' },
        ],
    },
    {
        heading: 'Element Creation — Services',
        entries: [
            { keys: 'Alt+J',        label: 'Bath' },
            { keys: 'Alt+L',        label: 'Toilet' },
            { keys: 'Alt+Y',        label: 'Sink' },
            { keys: 'Alt+G',        label: 'Shower' },
        ],
    },
    {
        heading: 'Edit — when an element is selected',
        note:    'Single letter, no modifier.',
        entries: [
            { keys: 'M then V',   label: 'Move (two-key chord, plan view)' },
            { keys: 'M',          label: 'Translate (3-D mode)' },
            { keys: 'R',          label: 'Rotate' },
            { keys: 'F',          label: 'Mirror' },
            { keys: 'L',          label: 'Align' },
            { keys: 'S',          label: 'Scale' },
            { keys: 'O',          label: 'Offset / Parallel' },
            { keys: 'J',          label: 'Join' },
            { keys: 'X',          label: 'Cut / Trim' },
            { keys: 'E',          label: 'Reference Edit' },
            { keys: 'Del / ⌫',    label: 'Delete' },
            { keys: 'Ctrl+C',     label: 'Copy' },
            { keys: 'Ctrl+V',     label: 'Paste' },
        ],
    },
    {
        heading: 'View visibility — when an element is selected',
        entries: [
            { keys: 'H',          label: 'Hide selected in current view' },
            { keys: 'I',          label: 'Isolate selected in current view' },
            { keys: 'G',          label: 'Ghost selected in current view' },
        ],
    },
    {
        heading: 'Global',
        entries: [
            { keys: 'Ctrl+Z',         label: 'Undo' },
            { keys: 'Ctrl+Y',         label: 'Redo' },
            { keys: 'Ctrl+Shift+Z',   label: 'Redo (alternative)' },
            { keys: 'Escape',         label: 'Cancel active tool' },
            { keys: 'Space (hold)',   label: 'Pan camera (3-D mode)' },
            { keys: 'Shift + drag',   label: 'Marquee multi-select (3-D)' },
            { keys: 'F1 / F2 / F3',   label: 'Author / Data / Inspect mode' },
            { keys: 'P',              label: 'Room point-pick' },
            { keys: 'R',              label: 'Roof rectangle (no selection)' },
            { keys: '?',              label: 'Open / close this cheat sheet' },
        ],
    },
];

let _overlayEl:    HTMLElement | null = null;
let _installed                           = false;

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
    else            showShortcutCheatSheet();
}

export function showShortcutCheatSheet(): void {
    if (_overlayEl) return;

    const overlay = document.createElement('div');
    overlay.id = 'pryzm-shortcut-cheatsheet';
    overlay.style.cssText = `
        position: fixed;
        inset: 0;
        background: rgba(15, 18, 25, 0.55);
        z-index: 9999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px;
        backdrop-filter: blur(2px);
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
    subtitle.textContent = 'Press ? again or Escape to close.';

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

    for (const section of SECTIONS) {
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

function buildSection(section: ShortcutSection): HTMLElement {
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
    h.textContent = section.heading;
    wrap.appendChild(h);

    if (section.note) {
        const note = document.createElement('div');
        note.style.cssText = `
            font-size: 10px;
            color: var(--app-text-muted, #888);
            margin-bottom: 6px;
            font-style: italic;
        `;
        note.textContent = section.note;
        wrap.appendChild(note);
    }

    for (const e of section.entries) {
        const row = document.createElement('div');
        row.style.cssText = `
            display: grid;
            grid-template-columns: 120px 1fr;
            align-items: center;
            gap: 12px;
            padding: 4px 0;
            font-size: 12px;
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
        k.textContent = e.keys;

        const l = document.createElement('span');
        l.style.cssText = `
            color: var(--app-text, #1a1a1a);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        l.textContent = e.label;

        row.appendChild(k);
        row.appendChild(l);
        wrap.appendChild(row);
    }

    return wrap;
}
