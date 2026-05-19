/**
 * RoomPropertySectionHelpers.ts
 *
 * Design tokens, shared style strings, and primitive DOM builders
 * for the room property inspector sections.
 * Extracted from RoomPropertySection.ts (WS-B S85-WIRE).
 *
 * Design rules:
 *  - Pure DOM factory — no class state, no store imports.
 *  - All symbols exported for use by section modules.
 */


// ── Design tokens ─────────────────────────────────────────────────────────────

export const C = {
    purple:       '#7c3aed',
    purpleDk:     '#5b21b6',
    purpleSoft:   '#f5f3ff',
    purpleBorder: '#ddd6fe',
    indigoDk:     '#1e1b4b',
    text:         '#1e1b4b',
    textMid:      '#6b7280',
    textFaint:    '#9ca3af',
    cardBorder:   '#ede9f6',
    rowSep:       '#f3f0fb',
    green:        '#16a34a',
    greenSoft:    '#f0fdf4',
    greenBorder:  '#bbf7d0',
    red:          '#dc2626',
    redSoft:      '#fef2f2',
    redBorder:    '#fecaca',
    amber:        '#d97706',
    amberSoft:    '#fffbeb',
    amberBorder:  '#fde68a',
};

// ── Shared style strings ──────────────────────────────────────────────────────

export const INPUT_S = [
    'width:100%;box-sizing:border-box;',
    'font-size:11px;padding:5px 8px;',
    `border:1px solid ${C.cardBorder};`,
    'border-radius:6px;',
    'background:#f7f6fb;',
    `color:${C.text};`,
    'font-family:inherit;outline:none;',
    'transition:border-color 0.15s;',
].join('');

export const LABEL_S = `font-size:11px;color:${C.textMid};flex-shrink:0;min-width:76px;`;

export const VALUE_S = `font-size:11px;font-weight:600;color:${C.text};text-align:right;`;

// ── Primitive builders ────────────────────────────────────────────────────────

export function makeRow(label: string, valueEl: HTMLElement): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = `display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid ${C.rowSep};`;
    const lbl = document.createElement('span');
    lbl.style.cssText = LABEL_S;
    lbl.textContent = label;
    row.appendChild(lbl);
    row.appendChild(valueEl);
    return row;
}

export function makeReadonlyValue(text: string): HTMLElement {
    const span = document.createElement('span');
    span.style.cssText = VALUE_S + 'flex:1;';
    span.textContent = text;
    return span;
}

/** Small pill-style primary button (purple gradient). */
export function makePrimaryBtn(label: string, opts: { small?: boolean } = {}): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    const pad = opts.small ? '3px 9px' : '5px 14px';
    const fs  = opts.small ? '10px'    : '11px';
    btn.style.cssText = [
        `padding:${pad};font-size:${fs};font-weight:600;`,
        `background:linear-gradient(135deg,${C.purple},${C.purpleDk});`,
        'color:#fff;border:none;border-radius:6px;cursor:pointer;',
        'transition:opacity 0.15s;flex-shrink:0;',
    ].join('');
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.85'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
    return btn;
}

/** Ghost outline button (purple text, no fill). */
export function makeGhostBtn(label: string, opts: { small?: boolean; danger?: boolean } = {}): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    const pad   = opts.small ? '3px 9px' : '5px 12px';
    const fs    = opts.small ? '10px'    : '11px';
    const col   = opts.danger ? C.red    : C.purple;
    const brd   = opts.danger ? C.redBorder : C.purpleBorder;
    btn.style.cssText = [
        `padding:${pad};font-size:${fs};font-weight:600;`,
        `background:none;color:${col};border:1px solid ${brd};`,
        'border-radius:6px;cursor:pointer;flex-shrink:0;',
        'transition:background 0.15s;',
    ].join('');
    btn.addEventListener('mouseenter', () => {
        btn.style.background = opts.danger ? C.redSoft : C.purpleSoft;
    });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'none'; });
    return btn;
}

/** Full-width action button (subtle filled). */
export function makeWideBtn(label: string, opts: { color?: string; bg?: string; border?: string } = {}): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.textContent = label;
    const bg  = opts.bg     ?? C.purpleSoft;
    const col = opts.color  ?? C.purple;
    const brd = opts.border ?? C.purpleBorder;
    btn.style.cssText = [
        'width:100%;padding:7px 0;font-size:11px;font-weight:600;',
        `background:${bg};color:${col};border:1px solid ${brd};`,
        'border-radius:7px;cursor:pointer;transition:opacity 0.15s;',
    ].join('');
    btn.addEventListener('mouseenter', () => { btn.style.opacity = '0.82'; });
    btn.addEventListener('mouseleave', () => { btn.style.opacity = '1'; });
    return btn;
}

export function showFeedback(btn: HTMLButtonElement, ok: string, fail: string, origText: string, origStyle: string, success: boolean): void {
    btn.textContent = success ? ok : fail;
    btn.style.background = success
        ? `linear-gradient(135deg,${C.green},#15803d)`
        : `linear-gradient(135deg,${C.red},#b91c1c)`;
    btn.disabled = true;
    setTimeout(() => {
        btn.textContent = origText;
        btn.style.cssText = origStyle;
        btn.disabled = false;
    }, 1600);
}

// ── Collapsible Section Card ──────────────────────────────────────────────────

let _cardCounter = 0;
export function resetCardCounter(): void { _cardCounter = 0; }

export function makeCard(title: string, initCollapsed = false): { card: HTMLElement; body: HTMLElement } {
    _cardCounter++;
    const num = _cardCounter;

    const card = document.createElement('div');
    card.style.cssText = [
        'background:#fff;',
        `border:1px solid ${C.cardBorder};`,
        'border-radius:10px;',
        'box-shadow:0 1px 5px rgba(124,58,237,0.07);',
        'overflow:hidden;',
        'margin-bottom:6px;',
        'position:relative;z-index:1;',  // sit above .gpp-body::before connector line
    ].join('');

    // Header row
    const hdr = document.createElement('div');
    hdr.style.cssText = [
        'display:flex;align-items:center;gap:8px;',
        'padding:8px 12px;',
        `background:${C.purpleSoft};`,
        `border-bottom:1px solid ${C.cardBorder};`,
        'cursor:pointer;user-select:none;',
    ].join('');

    // Numbered badge
    const badge = document.createElement('div');
    badge.style.cssText = [
        'width:18px;height:18px;border-radius:50%;flex-shrink:0;',
        `background:linear-gradient(135deg,${C.purple},${C.purpleDk});`,
        'color:#fff;font-size:9px;font-weight:700;',
        'display:flex;align-items:center;justify-content:center;',
    ].join('');
    badge.textContent = String(num);

    const titleEl = document.createElement('span');
    titleEl.style.cssText = `font-size:10px;font-weight:700;color:${C.indigoDk};text-transform:uppercase;letter-spacing:0.07em;flex:1;`;
    titleEl.textContent = title;

    const chevron = document.createElement('span');
    chevron.style.cssText = `font-size:10px;color:${C.textFaint};transition:transform 0.2s;`;
    chevron.textContent = '▾';
    if (initCollapsed) chevron.style.transform = 'rotate(-90deg)';

    hdr.appendChild(badge);
    hdr.appendChild(titleEl);
    hdr.appendChild(chevron);

    // Body
    const body = document.createElement('div');
    body.style.cssText = 'padding:10px 12px 12px;display:flex;flex-direction:column;gap:0;';
    if (initCollapsed) body.style.display = 'none';

    hdr.addEventListener('click', () => {
        const hidden = body.style.display === 'none';
        body.style.display = hidden ? 'block' : 'none';
        chevron.style.transform = hidden ? '' : 'rotate(-90deg)';
    });

    card.appendChild(hdr);
    card.appendChild(body);
    return { card, body };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Appends room properties into `content` div.
 * ALL mutations go through the legacy command manager.
 *
 * @param runtime Phase B.6-a (S73-WIRE) — optional PryzmRuntime handle threaded by
 *                PropertyInspector.  All 17 window-global reaches in this function — now typed via Window interface
 *                are annotated with their replacement phase (E.rooms.X / E.rooms.S /
 *                D.13).  The parameter is unused until Phase E.rooms rewires the stores.
 *                `null` permitted — behaviour is identical with or without a runtime.
 *                TODO(E.rooms.X/S): replace window casts with runtime.stores.rooms.*
 */
