// apps/editor — §GIS-ACTION-REGISTRY (L-1187, C06 §12) — the ONE renderer for the
// declared GIS actions.
//
// Every surface that shows GIS actions calls THIS. It derives its buttons from
// `GIS_ACTIONS`; it does not accept a list of ids to render, because a caller-supplied
// list is exactly the hand-written enumeration this whole change exists to delete.
//
// The rendering contract this function enforces (asserted by gisActionRegistry.test.ts):
//
//   1. Every declared action in the requested groups is rendered — no surface can
//      quietly drop one, and a NEW action appears in the panel with no panel edit.
//   2. An action whose dispatch does not resolve (`resolveGisAction` → null) is
//      rendered DISABLED, marked `data-gis-unavailable`, and shows its reason. It is
//      never painted as a live button. This is the executable answer to verdict (c):
//      a dead button can no longer look alive.
//   3. A live button's click calls the registry's dispatch — the renderer contributes
//      no handler of its own.
//
// Pure DOM, no THREE, no runtime import: it can be unit-tested against a fake host.

import {
    GIS_ACTIONS,
    GIS_GROUP_LABEL,
    resolveGisAction,
    type GisActionDecl,
    type GisActionGroup,
    type GisCapabilityHost,
} from './gisActionRegistry';

/** Marks a rendered button that resolved to no live dispatch. */
export const GIS_UNAVAILABLE_ATTR = 'data-gis-unavailable';

/** Carries the declared action id onto the DOM, so tests key off ids, not labels. */
export const GIS_ACTION_ID_ATTR = 'data-gis-action';

function buildActionButton(decl: GisActionDecl, host: GisCapabilityHost): HTMLButtonElement {
    const dispatch = resolveGisAction(decl, host);
    const live = dispatch !== null;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(GIS_ACTION_ID_ATTR, decl.id);
    btn.setAttribute('data-testid', `gis-action-${decl.id}`);
    btn.className = 'pb-gis-action' + (live ? '' : ' pb-gis-action--unavailable');

    // Honesty, not decoration: the reason a control cannot act is shown ON the control.
    // "Nothing happened and I do not know why" is the state this change removes.
    btn.title = live
        ? decl.title
        : `${decl.title}\n\nNot available yet — ${decl.unavailableReason ?? 'no registered entry point.'}`;

    if (!live) {
        btn.disabled = true;
        btn.setAttribute(GIS_UNAVAILABLE_ATTR, 'true');
        btn.setAttribute('aria-disabled', 'true');
    }

    btn.style.cssText = [
        'display:flex', 'align-items:center', 'gap:9px', 'width:100%',
        'padding:8px 10px', 'background:var(--app-panel-bg,#fff)',
        'border:1px solid var(--app-border,#dde3ef)', 'border-radius:7px',
        'font-family:var(--app-font)', 'text-align:left',
        live ? 'cursor:pointer' : 'cursor:not-allowed',
        live ? '' : 'opacity:0.5',
        'transition:background 0.12s,border-color 0.12s,color 0.12s',
    ].filter(Boolean).join(';');

    const icon = document.createElement('span');
    icon.style.cssText = 'font-size:15px;flex-shrink:0;width:20px;text-align:center;';
    icon.textContent = decl.icon;

    const label = document.createElement('span');
    label.style.cssText = 'font-size:12px;font-weight:500;';
    label.textContent = decl.label;

    btn.appendChild(icon);
    btn.appendChild(label);

    if (live) {
        btn.addEventListener('mouseenter', () => { btn.style.background = '#f0f4ff'; btn.style.borderColor = '#6600ff'; });
        btn.addEventListener('mouseleave', () => { btn.style.background = ''; btn.style.borderColor = ''; });
        btn.addEventListener('click', () => { dispatch(); });
    }

    return btn;
}

function buildGroupHeader(text: string): HTMLElement {
    const hdr = document.createElement('div');
    hdr.style.cssText = [
        'font-size:10px', 'font-weight:700', 'letter-spacing:0.06em',
        'text-transform:uppercase', 'color:var(--app-text-muted,#888)',
        'padding:8px 2px 4px',
    ].join(';');
    hdr.textContent = text;
    return hdr;
}

/**
 * Render the declared GIS actions, grouped, into a fresh container.
 *
 * @param host   the object carrying the live entry points (production: `window`).
 * @param groups which groups to render, in order. Defaults to every group that has
 *               at least one declared action — DERIVED from the registry, so a new
 *               group needs no edit here.
 */
export function renderGisActions(
    host: GisCapabilityHost,
    groups?: readonly GisActionGroup[],
): HTMLElement {
    const root = document.createElement('div');
    root.className = 'pb-gis-actions';
    root.style.cssText = 'display:flex;flex-direction:column;gap:5px;';

    // Derived, never remembered: the group order comes from first appearance in the
    // registry, so adding an action in a new group cannot leave it unrendered.
    const order: GisActionGroup[] = [];
    for (const a of GIS_ACTIONS) if (!order.includes(a.group)) order.push(a.group);
    const wanted = groups ?? order;

    for (const group of wanted) {
        const actions = GIS_ACTIONS.filter((a) => a.group === group);
        if (actions.length === 0) continue;
        root.appendChild(buildGroupHeader(GIS_GROUP_LABEL[group]));
        for (const decl of actions) root.appendChild(buildActionButton(decl, host));
    }

    return root;
}
