// §PARCEL-LAW-TAB (lane PARCEL-LAW-TAB, 2026-09-05 · STR §21 / §24.1 item 2 · L-12915) — the
// FOUR-VIEW switcher, as a control any host can mount.
//
// Founder 2026-09-05: *"the 3d view on the left (with option to switch to 3d site or 3d globe or
// plan view)"* — from the PARCEL LAW tab of the Analysis surface, not only from the GIS layout.
//
// ═══════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS IS NOT A COPY OF `GISAreaLayout.mountResultToggleBar`, AND NOT AN EXTRACTION OF IT
// ═══════════════════════════════════════════════════════════════════════════════════════════
// The GIS bar's three segments are closure-bound: `activeSegment`, `resultViewMode` and
// `formaViewMode` live inside `mountGISArea`, its clicks run through `containViewActivation`, and
// it carries the globe-only sub-controls (fidelity · zoom · fly tour). Lifting that out of a
// 6,400-line file that several lanes edit concurrently is the wrong trade. What CAN be shared
// without inventing anything is the thing the registry already declares: `GIS_ACTIONS` names each
// view as an action with its registered entry point, and `pryzmGetSiteViewState` is the ONE
// snapshot of which view is current. So this control is a HOST of four declared actions —
// exactly the §GIS-ACTION-REGISTRY rule (L-1187): *"A panel is a HOST; the action is the
// AUTHORITY."* It contributes no handler and no state of its own.
//
// The dispatches are the SAME registered functions the GIS bar's own buttons drive:
//   · `site.plan-oblique`  → `pryzmEnterSiteView('plan')`      (the bar's ◉ 3D Site → sub-bar Plan)
//   · `site.bim-split`     → `pryzmShowSiteResultView('2D')`   (the bar's ◧ 3D + plan)
//   · `site.earth`         → `pryzmEnterSiteView('3d')`        (the bar's ◉ 3D Site)
//   · `site.globe`         → `pryzmShowSiteResultView('3D')`   (the bar's ◉ 3D globe)
// `showSiteResultView` calls `applyResultView`, and `pryzmEnterSiteView` calls
// `mountFormaViewToggle` — the very closures behind the bar's segments — so the two controls
// cannot disagree about what a click DOES. They can only disagree about what they PAINT, and
// both derive that from the same snapshot.
//
// ── THE FOUNDER'S FOUR WORDS, MAPPED TO DECLARED ACTIONS — stated, not implied ──────────────
// "plan"     = `site.plan-oblique`, the near-top-down shadowed massing over the real plot. It is
//              the plan view in which the envelope is DRAWN (STR §24.1 item 3); `site.plan-gis`
//              (plan over aerial, project north) is UNDER REPAIR (L-1197) and is not offered here.
// "BIM 3D"   = `site.bim-split`, the BIM dual pane (3D left · plan right). ⚠ The registry declares
//              NO "BIM 3D only" action — `pryzmActivateBimView('3D')` exists as a window entry point
//              but is not a declared GIS action, and this control does not invent one. If the
//              founder wants the single BIM 3D pane here, the fix is a registry row, not a handler
//              in this file.
// "3D Site"  = `site.earth`  (PRYZM Earth — the Forma massing surface, landing on its 3D preset).
// "3D Globe" = `site.globe`  (the photoreal tiles view).
//
// ── HONEST UNAVAILABILITY ───────────────────────────────────────────────────────────────────
// A segment whose action does not resolve (`resolveGisAction` → null: the GIS layout has not
// registered its entry point in this session) renders DISABLED with the reason on the control —
// never as a live-looking button. No dead clicks: that is the rule the founder has already been
// bitten by (L-1187), and it is why `unavailable` is a printed sentence rather than a silent
// return.
//
// ── ACTIVE STATE IS A SNAPSHOT — repainted, never subscribed ───────────────────────────────
// `pryzmGetSiteViewState` says so on its own signature. This control repaints after its own
// dispatches and whenever its host calls `repaint()` (the Parcel Law tab calls it on every
// activation). A view changed from the GIS bar while this control is on screen is not reflected
// until the next repaint; the status line under the buttons says WHEN it last derived, so a
// stale highlight is dated rather than asserted.
//
// P4 — no globals: the host object is a parameter (production: `window`). P6 — no store writes.
// P8 — one span per exported function.

import { trace } from '@opentelemetry/api';
import {
    GIS_ACTIONS,
    resolveGisAction,
    type GisActionDecl,
    type GisCapabilityHost,
    type GisSiteViewState,
} from '../gis/gisActionRegistry';

const _tracer = trace.getTracer('pryzm.site.viewSegmentSwitcher');

/** The founder's four views, in his order (STR §24.1 item 2). */
export type ViewSegmentId = 'plan' | 'bim-3d' | 'site-3d' | 'globe';

export interface ViewSegmentDef {
    readonly id: ViewSegmentId;
    /** The founder's word for the view — the label on the control. */
    readonly label: string;
    /** The DECLARED `GIS_ACTIONS` id this segment dispatches. The registry is the authority. */
    readonly actionId: string;
}

/**
 * ⛔ Four rows, each pointing at a registry id. Nothing here is a handler: the spec asserts every
 * `actionId` resolves to a declared action, so a renamed or deleted registry row fails the build
 * here instead of silently rendering a dead segment.
 */
export const VIEW_SEGMENTS: readonly ViewSegmentDef[] = Object.freeze([
    { id: 'plan',    label: 'Plan',     actionId: 'site.plan-oblique' },
    { id: 'bim-3d',  label: 'BIM 3D',   actionId: 'site.bim-split' },
    { id: 'site-3d', label: '3D Site',  actionId: 'site.earth' },
    { id: 'globe',   label: '3D Globe', actionId: 'site.globe' },
]);

/** `data-testid` on the control root. */
export const VIEW_SEGMENT_SWITCHER_TESTID = 'view-segment-switcher';
/** Carries the segment id onto each button, so tests key off ids, never labels. */
export const VIEW_SEGMENT_ATTR = 'data-view-segment';
/** Marks a segment that resolved to no live dispatch. */
export const VIEW_SEGMENT_UNAVAILABLE_ATTR = 'data-view-segment-unavailable';
/** Marks the segment whose view the snapshot reports as current. */
export const VIEW_SEGMENT_ACTIVE_ATTR = 'data-view-segment-active';
/** `data-testid` on the one-line status under the buttons. */
export const VIEW_SEGMENT_STATUS_TESTID = 'view-segment-switcher-status';

/** The sentence printed when the host reports no snapshot at all. */
export const VIEW_SEGMENT_NO_SNAPSHOT_TEXT =
    'Which view is current is not reported in this session (pryzmGetSiteViewState is not registered) — '
    + 'no segment is highlighted rather than a guess.';

export interface ViewSegmentSwitcherHandle {
    readonly element: HTMLElement;
    /** Re-derive live/disabled/active from the host. Cheap; call on every host activation. */
    repaint(): void;
    dispose(): void;
}

/** Resolve a segment's declared action, or `null` when the registry no longer declares it. */
export function viewSegmentAction(def: ViewSegmentDef): GisActionDecl | null {
    return GIS_ACTIONS.find((a) => a.id === def.actionId) ?? null;
}

function readSnapshot(host: GisCapabilityHost): GisSiteViewState | null {
    try {
        return host.pryzmGetSiteViewState?.() ?? null;
    } catch {
        // A snapshot that throws is a snapshot we do not have. Painting nothing active is the
        // honest fallback; painting a guess is not.
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

/**
 * Mount the four-view switcher. Returns a handle; the caller owns placement.
 *
 * Styling reuses the `.pb-gis-action*` rules `renderGisActions` paints with (tokens only — C84
 * EI-8, no colour literal in this file), under a `.view-segment-switcher` row so the four read
 * as one segmented control rather than as four rail rows.
 */
export function mountViewSegmentSwitcher(host: GisCapabilityHost): ViewSegmentSwitcherHandle {
    const span = _tracer.startSpan('pryzm.site.mountViewSegmentSwitcher');
    try {
        const root = document.createElement('div');
        root.className = 'view-segment-switcher';
        root.setAttribute('data-testid', VIEW_SEGMENT_SWITCHER_TESTID);
        root.setAttribute('role', 'group');
        root.setAttribute('aria-label', 'Left-pane view');

        const row = document.createElement('div');
        row.className = 'view-segment-switcher-row';
        root.appendChild(row);

        const status = document.createElement('div');
        status.className = 'view-segment-switcher-status';
        status.setAttribute('data-testid', VIEW_SEGMENT_STATUS_TESTID);
        root.appendChild(status);

        let disposed = false;

        const paint = (): void => {
            if (disposed) return;
            row.replaceChildren();
            const snapshot = readSnapshot(host);
            let live = 0;
            let activeLabel: string | null = null;

            for (const def of VIEW_SEGMENTS) {
                const decl = viewSegmentAction(def);
                const dispatch = decl ? resolveGisAction(decl, host) : null;
                const isLive = dispatch !== null;
                const active = isLive && decl !== null && isActive(decl, snapshot);
                if (isLive) live++;
                if (active) activeLabel = def.label;

                const btn = document.createElement('button');
                btn.type = 'button';
                btn.setAttribute(VIEW_SEGMENT_ATTR, def.id);
                btn.setAttribute('data-testid', `view-segment-${def.id}`);
                btn.className = 'pb-gis-action view-segment-btn'
                    + (isLive ? '' : ' pb-gis-action--unavailable')
                    + (active ? ' pb-gis-action--active' : '');

                // The reason a control cannot act is ON the control. "Nothing happened and I do
                // not know why" is the state this file exists to prevent.
                if (!decl) {
                    btn.title = `${def.label}: the registry no longer declares "${def.actionId}" — this segment cannot dispatch.`;
                } else if (!isLive) {
                    btn.title = `${decl.title}\n\nNot available from here right now — `
                        + (decl.unavailableReason
                            ?? `its entry point (${decl.entryPoints.join(', ') || 'none declared'}) is not registered in this session. Open the site view once, then return.`);
                } else {
                    btn.title = decl.title;
                }

                if (!isLive) {
                    btn.disabled = true;
                    btn.setAttribute(VIEW_SEGMENT_UNAVAILABLE_ATTR, 'true');
                    btn.setAttribute('aria-disabled', 'true');
                }
                if (active) {
                    btn.setAttribute(VIEW_SEGMENT_ACTIVE_ATTR, 'true');
                    // C43 — the state is carried by more than colour.
                    btn.setAttribute('aria-pressed', 'true');
                } else if (isLive) {
                    btn.setAttribute('aria-pressed', 'false');
                }

                const icon = document.createElement('span');
                icon.className = 'pb-gis-action-icon';
                icon.setAttribute('aria-hidden', 'true');
                icon.textContent = decl?.icon ?? '·';
                const label = document.createElement('span');
                label.className = 'pb-gis-action-label';
                label.textContent = def.label;
                btn.append(icon, label);

                if (!isLive) {
                    const tag = document.createElement('span');
                    tag.className = 'pb-gis-action-tag';
                    tag.textContent = 'unavailable';
                    btn.appendChild(tag);
                }

                if (dispatch) {
                    btn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        dispatch();
                        // Immediate feedback: re-read the authority so the highlight moves with
                        // the click rather than waiting for the host to repaint.
                        paint();
                    });
                }
                row.appendChild(btn);
            }

            // textContent only — no HTML sink in this file (C08 §3.1).
            if (live === 0) {
                status.textContent =
                    'No view can be switched from here: the site views have not registered their entry points '
                    + 'in this session. Open the site from the GIS panel once, then return.';
            } else if (!snapshot) {
                status.textContent = VIEW_SEGMENT_NO_SNAPSHOT_TEXT;
            } else if (activeLabel) {
                status.textContent = `Current view: ${activeLabel} (read at ${new Date().toLocaleTimeString()} — a snapshot; press a segment or reopen the tab to re-read).`;
            } else {
                status.textContent =
                    `The left pane is not on one of these four views (segment "${snapshot.segment}", site mode "${snapshot.formaMode}") — `
                    + 'read as a snapshot; press a segment to switch.';
            }
        };

        paint();
        span.setAttribute('pryzm.viewSegments', VIEW_SEGMENTS.length);
        return {
            element: root,
            repaint: paint,
            dispose(): void {
                disposed = true;
            },
        };
    } finally {
        span.end();
    }
}
