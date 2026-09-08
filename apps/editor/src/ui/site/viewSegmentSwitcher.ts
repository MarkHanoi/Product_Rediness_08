// §PARCEL-LAW-TAB (lane PARCEL-LAW-TAB, 2026-09-05 · STR §21 / §24.1 item 2 · L-12915) — the
// view switcher, as a control any host can mount.
//
// ⭐ UPDATED 2026-09-06 (§VIEW-PANEL-PER-PANE, founder request with screenshots). The table
// is no longer four hand-written rows: it is DERIVED from `viewPanelOptions()`, the ONE
// panel definition, which the founder specified as SIX — *"2D SITE MAP / 2D SATELLITE / 3D
// SITE / 3D GLOBE / 3D PRYZM / 2D PRYZM"*. This file is the WHOLE-SCREEN host of that
// definition (it dispatches `GIS_ACTIONS`); `SiteViewQuickToggle` is the PER-PANE host of
// the same definition (it dispatches `view.pane.*` into `PaneLayoutStore`). Two hosts, ONE
// definition, two authorities — the §GIS-ACTION-REGISTRY rule, not a second switcher.
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
// snapshot of which view is current. So this control is a HOST of declared actions —
// exactly the §GIS-ACTION-REGISTRY rule (L-1187): *"A panel is a HOST; the action is the
// AUTHORITY."* It contributes no handler and no state of its own.
//
// The dispatches are the SAME registered functions the GIS bar's own buttons drive:
//   · `site.map-2d`       → `pryzmEnterSiteView('map2d')` + `pryzmSetSiteBasemap('map')`
//   · `site.satellite-2d` → `pryzmEnterSiteView('map2d')` + `pryzmSetSiteBasemap('satellite')`
//   · `site.earth`        → `pryzmEnterSiteView('3d')`        (the bar's ◉ 3D Site)
//   · `site.globe`        → `pryzmShowSiteResultView('3D')`   (the bar's ◉ 3D globe)
//   · `site.bim-3d`       → `pryzmActivateBimView('3D')`      (the model, filling the canvas)
//   · `site.bim-plan`     → `pryzmActivateBimView('Top')`     (the model in plan)
// `showSiteResultView` calls `applyResultView`, and `pryzmEnterSiteView` calls
// `mountFormaViewToggle` — the very closures behind the bar's segments — so the two controls
// cannot disagree about what a click DOES. They can only disagree about what they PAINT, and
// both derive that from the same snapshot.
//
// ── THE FOUNDER'S SIX WORDS, MAPPED TO DECLARED ACTIONS — stated, not implied ───────────────
// "2D Site Map"  = `site.map-2d`, the pastel vector draw map, basemap forced to `map`.
// "2D Satellite" = `site.satellite-2d`. ⭐ THE SAME MAP under ESRI imagery — NOT a second map
//                  and NOT a second view type. Satellite is a MapLibre STYLE
//                  (`SiteBoundaryMap2D.swapBasemap`, A.8.c.f.4, shipped 2026-06-03), reached
//                  until today only from a 32-px chip drawn inside the map itself. The
//                  founder called that *"MASKED FOR ANOTHER PANEL"*; this is the promotion,
//                  and the chip still works (C19 §5.6 clause 4). See `viewPanelOptions.ts`
//                  for why a rival `site-satellite-2d` view type is ruled out by measurement.
// "3D Site"      = `site.earth`  (PRYZM Earth — the Forma massing surface, on its 3D preset).
// "3D Globe"     = `site.globe`  (the photoreal tiles view).
// "3D PRYZM"     = `site.bim-3d`, the model filling the canvas. ⭐ CORRECTED 2026-09-06
//                  (§PARCEL-LAW-BIM3D). This segment used to point at `site.bim-split`, the
//                  DUAL PANE — and from THIS host that was a click the reader could not see
//                  the result of. Measured: `.svp-pane` is `position: fixed; right: 0;
//                  width: 40%; z-index: 1` (styles/panels/splitView.ts) and `#anl-surface`,
//                  the Analysis surface this control is mounted on, is `position: fixed;
//                  right: 0; width: 50%; z-index: 50` (styles/panels/analysisSurface.ts). The
//                  pane opened ENTIRELY BEHIND the panel; and `SplitViewManager._buildDOM`
//                  also wrote `#container.style.width = '60%'` over the 50%
//                  `WorkspaceController` had set, sliding the right tenth of the 3-D viewport
//                  under the panel. `site.bim-split` is NOT removed — it stays on the GIS bar
//                  and in the GIS panel, where a full-width canvas makes its pane visible.
// "2D PRYZM"     = `site.bim-plan`, the model in plan (top view), filling the canvas. Its
//                  entry point was ALREADY live and already defaulted to this
//                  (`pryzmActivateBimView` is registered as `activateView(mode ?? 'Top')`);
//                  no action named it, so no surface could offer it.
//
// ⚠ NOT OFFERED HERE, AND NOT REMOVED: `site.plan-oblique` (the near-top-down shadowed
// massing over the real plot, STR §24.1 item 3) is not one of the founder's six. It stays
// DECLARED, stays on the Forma sub-bar, and stays in the Project Browser's GIS panel —
// `renderGisActions` renders every declared action and refuses a caller-supplied id list, so
// the route cannot be lost by omission here. That is the founder's own escape hatch:
// *"if the user wants to open more they can do it in the browser."*
//
// ── HONEST UNAVAILABILITY ───────────────────────────────────────────────────────────────────
// A segment whose action does not resolve (`resolveGisAction` → null: the GIS layout has not
// registered its entry point in this session) renders DISABLED with the reason on the control —
// never as a live-looking button. No dead clicks: that is the rule the founder has already been
// bitten by (L-1187), and it is why `unavailable` is a printed sentence rather than a silent
// return.
//
// ── UNREPORTED ≠ NOT CURRENT ──────────────────────────────────────────────
// `GisSiteViewState` has four fields — `segment`, `formaMode`, `buildingFidelity` and (new
// 2026-09-06) `basemap` — and NONE of them says which model view ViewController activated. So
// `site.bim-3d` and `site.bim-plan` declare no `activeWhen`, and this control can never
// highlight them. That is a gap in the AUTHORITY, not a judgement that
// the view is off, and the two must not print the same thing (C84 EI-1b — failure and emptiness
// becoming one value is this repo's most expensive recurring defect).
//
// A segment whose action declares no `activeWhen` is therefore marked
// `data-view-segment-unreported`, its title says so, and the status line NAMES it. Nothing is
// mirrored to paper over it: this control holds no state, and a control that remembered its own
// last click would be asserting a view it cannot observe. The fix is a field on the snapshot,
// owned by `GISAreaLayout` — reported as a seam, not silently worked around.
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
import { viewPanelOptions, type ViewPanelOptionId } from '../../engine/views/viewPanelOptions';

const _tracer = trace.getTracer('pryzm.site.viewSegmentSwitcher');

/** The founder's panel rows (`viewPanelOptions.ts` — the ONE definition). */
export type ViewSegmentId = ViewPanelOptionId;

export interface ViewSegmentDef {
    readonly id: ViewSegmentId;
    /** The founder's word for the view — the label on the control. */
    readonly label: string;
    /** The DECLARED `GIS_ACTIONS` id this segment dispatches. The registry is the authority. */
    readonly actionId: string;
}

/**
 * ⭐ §VIEW-PANEL-PER-PANE (founder 2026-09-06) — DERIVED from `viewPanelOptions()`, the ONE
 * panel definition, rather than hand-listed here. Its six rows are the founder's own:
 * *"2D SITE MAP / 2D SATELLITE / 3D SITE / 3D GLOBE / 3D PRYZM / 2D PRYZM"*.
 *
 * ⛔ The guarantee this table has always carried is UNCHANGED and is why the derivation is
 * safe: nothing here is a handler, and the spec asserts every `actionId` resolves to a
 * declared action WITH a registered entry point — so a renamed or deleted registry row fails
 * the build here instead of silently rendering a dead segment.
 *
 * ⚠ WHAT LEFT, AND WHERE IT STILL LIVES. The previous four rows were
 * `Plan · BIM 3D · 3D Site · 3D Globe`. `site.plan-oblique` ("Plan") is not one of the
 * founder's six and is no longer offered FROM THIS HOST — but the ROUTE is not removed
 * (C19 §5.6 clause 4): `renderGisActions` renders EVERY declared action and refuses to
 * accept a caller-supplied id list, so `site.plan-oblique` is still one click away in the
 * GIS panel of the Project Browser, and the Forma sub-bar (`mountFormaViewToggle`) still
 * carries it. That is precisely the founder's *"if the user wants to open more they can do
 * it in the browser."* "BIM 3D" is the same view under his own spelling, `3D PRYZM`.
 */
export const VIEW_SEGMENTS: readonly ViewSegmentDef[] = Object.freeze(
    viewPanelOptions().map((o) => Object.freeze({ id: o.id, label: o.label, actionId: o.actionId })),
);

/** `data-testid` on the control root. */
export const VIEW_SEGMENT_SWITCHER_TESTID = 'view-segment-switcher';
/** Carries the segment id onto each button, so tests key off ids, never labels. */
export const VIEW_SEGMENT_ATTR = 'data-view-segment';
/** Marks a segment that resolved to no live dispatch. */
export const VIEW_SEGMENT_UNAVAILABLE_ATTR = 'data-view-segment-unavailable';
/** Marks the segment whose view the snapshot reports as current. */
export const VIEW_SEGMENT_ACTIVE_ATTR = 'data-view-segment-active';
/**
 * Marks a LIVE segment whose action declares no `activeWhen` — the authority cannot report
 * whether that view is current, so this control never highlights it. ⛔ Not the same as
 * unavailable: the segment dispatches perfectly well. See the header's UNREPORTED section.
 */
export const VIEW_SEGMENT_UNREPORTED_ATTR = 'data-view-segment-unreported';
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
    /**
     * §ONE-REGION-SWITCHER (L-13257) — the label of the segment currently ACTIVE, or `null`
     * when the authority cannot establish one.
     *
     * ⭐ RE-DERIVED FROM THE HOST SNAPSHOT ON EVERY CALL, never a remembered string: a pill
     * that cached its own last dispatch would assert a view it never checked (the L-13002
     * shape). ⛔ AND `null` IS A REAL ANSWER, NOT AN ERROR — most segments carry no
     * `activeWhen`, so `GisSiteViewState` has no field to read them from. A caller that
     * turned `null` into a guessed view name would be inventing the one fact this control
     * is careful not to invent (C84 EI-1b); the pill prints its neutral word instead.
     */
    activeLabel(): string | null;
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
 * Mount the view switcher. Returns a handle; the caller owns placement.
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
        root.setAttribute('aria-label', 'View');

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
            /** Live segments the AUTHORITY cannot report on — named in the status line. */
            const unreported: string[] = [];

            for (const def of VIEW_SEGMENTS) {
                const decl = viewSegmentAction(def);
                const dispatch = decl ? resolveGisAction(decl, host) : null;
                const isLive = dispatch !== null;
                const active = isLive && decl !== null && isActive(decl, snapshot);
                // ⚠ UNREPORTED ≠ NOT CURRENT. A live action with no `activeWhen` is one the
                // snapshot has no field for; it can never be highlighted, and the reason is a
                // gap in `GisSiteViewState`, not a reading that the view is off.
                const isUnreported = isLive && decl !== null && !decl.activeWhen;
                if (isLive) live++;
                if (active) activeLabel = def.label;
                if (isUnreported) unreported.push(def.label);

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
                } else if (isUnreported) {
                    btn.title = `${decl.title}

This segment works. Whether it is the CURRENT view is not `
                        + 'reported by pryzmGetSiteViewState (the snapshot has no field for the BIM view), '
                        + 'so it is never highlighted — that is a missing reading, not "off".';
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
                } else if (isUnreported) {
                    btn.setAttribute(VIEW_SEGMENT_UNREPORTED_ATTR, 'true');
                    // C43 — `aria-pressed="mixed"` is the ARIA spelling of "this control has a
                    // pressed state and I cannot tell you which". `"false"` would ASSERT off.
                    btn.setAttribute('aria-pressed', 'mixed');
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
            } else if (unreported.length > 0) {
                // The honest sentence for the state this control is ACTUALLY in most of the time
                // on the Parcel Law tab: the snapshot says "not one of these", but it has no field
                // for `${unreported}`, so "not one of these" is not something it can establish.
                status.textContent =
                    `Current view is not reported for ${unreported.join(' · ')} — pryzmGetSiteViewState carries no `
                    + `field for it, so no segment is highlighted rather than a guess. The other segments read `
                    + `segment "${snapshot.segment}", site mode "${snapshot.formaMode}"; press a segment to switch.`;
            } else {
                status.textContent =
                    `The view is not one of these (segment "${snapshot.segment}", site mode "${snapshot.formaMode}", basemap "${snapshot.basemap ?? 'not reported'}") — `
                    + 'read as a snapshot; press a segment to switch.';
            }
        };

        /**
         * The active segment's label, derived the SAME way `paint` derives it — one rule, read
         * twice, rather than a second opinion about what "active" means.
         */
        const activeLabel = (): string | null => {
            const snapshot = readSnapshot(host);
            if (!snapshot) return null;
            for (const def of VIEW_SEGMENTS) {
                const decl = viewSegmentAction(def);
                if (!decl) continue;
                if (resolveGisAction(decl, host) === null) continue;
                if (isActive(decl, snapshot)) return def.label;
            }
            return null;
        };

        paint();
        span.setAttribute('pryzm.viewSegments', VIEW_SEGMENTS.length);
        return {
            element: root,
            repaint: paint,
            activeLabel,
            dispose(): void {
                disposed = true;
            },
        };
    } finally {
        span.end();
    }
}
