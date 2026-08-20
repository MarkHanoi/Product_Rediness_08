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
// ── APPEARANCE (L-1361) ─────────────────────────────────────────────────────────
//
// Founder 2026-08-20: *"Can you make the UI/UX of the elements within the GIS panel
// properly, according to the graphics of PRYZM?"* Three things were wrong in his
// screenshot, and all three were the same mistake — this file painting with literals:
//
//   • a heavy saturated purple header against plain white rows, so the rows carried no
//     brand identity at all;
//   • the disabled `Floors shown` row differing from a live one only in text colour;
//   • no active treatment, so `Real` and `PRYZM Earth` read as ordinary rows.
//
// ⛔ NO COLOUR IS DECLARED IN THIS FILE. Every value comes from the `--app-*` /
// `--pryzm-*` tokens in `styles/tokens.ts` and the `.pb-gis-*` rules in
// `styles/panels/projectBrowser.ts`. C84 EI-8 names colour as a one-vocabulary concept
// and records that hex drift has already happened twice here, measured. A hard-coded
// `#6600FF` in this file would be that defect a third time — and it would be invisible
// to the §UI-DENSITY-SCALE transform, which rewrites the injected stylesheet and cannot
// see `Object.assign(el.style, …)`.
//
// The active state is DERIVED from `pryzmGetSiteViewState()`, never mirrored here.
// ⚠ That is a SNAPSHOT: this surface repaints when it is built and after its own
// dispatches. It does NOT subscribe, so a view changed from the remaining legacy
// view-mode bars is not reflected until the panel is reopened. Stated rather than
// hidden — a highlight that silently goes stale asserts a fact instead of omitting one.

import {
    GIS_ACTIONS,
    GIS_GROUP_LABEL,
    resolveGisAction,
    type GisActionDecl,
    type GisActionGroup,
    type GisCapabilityHost,
    type GisSiteViewState,
} from './gisActionRegistry';

/** Marks a rendered button that resolved to no live dispatch. */
export const GIS_UNAVAILABLE_ATTR = 'data-gis-unavailable';

/** Carries the declared action id onto the DOM, so tests key off ids, not labels. */
export const GIS_ACTION_ID_ATTR = 'data-gis-action';

/** Marks the button whose result the user is currently looking at. */
export const GIS_ACTIVE_ATTR = 'data-gis-active';

function readState(host: GisCapabilityHost): GisSiteViewState | null {
    try {
        return host.pryzmGetSiteViewState?.() ?? null;
    } catch {
        // A snapshot that throws is a snapshot we do not have. Painting nothing active is
        // the honest fallback; painting a guess is not.
        return null;
    }
}

function isActive(decl: GisActionDecl, state: GisSiteViewState | null): boolean {
    if (!decl.activeWhen || !state) return false;
    try {
        return decl.activeWhen(state);
    } catch {
        return false;
    }
}

function buildActionButton(
    decl: GisActionDecl,
    host: GisCapabilityHost,
    repaint: () => void,
): HTMLButtonElement {
    const dispatch = resolveGisAction(decl, host);
    const live = dispatch !== null;
    const active = live && isActive(decl, readState(host));

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute(GIS_ACTION_ID_ATTR, decl.id);
    btn.setAttribute('data-testid', `gis-action-${decl.id}`);

    // Classes, not inline style: the palette lives in the stylesheet where the density
    // transform and the theme can both reach it.
    btn.className = 'pb-gis-action'
        + (live ? '' : ' pb-gis-action--unavailable')
        + (active ? ' pb-gis-action--active' : '');

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
    if (active) {
        btn.setAttribute(GIS_ACTIVE_ATTR, 'true');
        // C43 — the state is carried by more than colour. A screen reader and a
        // colour-blind user read the pressed state, not the fill.
        btn.setAttribute('aria-pressed', 'true');
    } else if (decl.activeWhen && live) {
        btn.setAttribute('aria-pressed', 'false');
    }

    const icon = document.createElement('span');
    icon.className = 'pb-gis-action-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = decl.icon;

    const label = document.createElement('span');
    label.className = 'pb-gis-action-label';
    label.textContent = decl.label;

    btn.appendChild(icon);
    btn.appendChild(label);

    // The disabled row must not merely be a paler live row — the founder could not tell
    // `Floors shown` from an enabled control. It gets an explicit word, so the difference
    // survives a glance, a screenshot and a colour-blind reader.
    if (!live) {
        const tag = document.createElement('span');
        tag.className = 'pb-gis-action-tag';
        tag.textContent = 'soon';
        btn.appendChild(tag);
    }

    if (live) {
        btn.addEventListener('click', () => {
            dispatch();
            // Immediate feedback: re-read the authority so the active row moves with the
            // click rather than waiting for the panel to be reopened.
            repaint();
        });
    }

    return btn;
}

function buildGroupHeader(text: string): HTMLElement {
    const hdr = document.createElement('div');
    hdr.className = 'pb-gis-group';
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

    // Derived, never remembered: the group order comes from first appearance in the
    // registry, so adding an action in a new group cannot leave it unrendered.
    const order: GisActionGroup[] = [];
    for (const a of GIS_ACTIONS) if (!order.includes(a.group)) order.push(a.group);
    const wanted = groups ?? order;

    const paint = (): void => {
        root.innerHTML = '';
        for (const group of wanted) {
            const actions = GIS_ACTIONS.filter((a) => a.group === group);
            if (actions.length === 0) continue;
            root.appendChild(buildGroupHeader(GIS_GROUP_LABEL[group]));
            for (const decl of actions) root.appendChild(buildActionButton(decl, host, paint));
        }
    };
    paint();

    return root;
}
