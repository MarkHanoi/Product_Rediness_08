/**
 * viewPillActionsRow.ts — §ONE-REGION-SWITCHER (founder 2026-09-08 · L-13257 · C59 §2.9)
 *
 * Layer Affected:  UI — site view chrome (DOM only; no renderer, no store, no THREE)
 * File:            apps/editor/src/ui/site/viewPillActionsRow.ts
 * Contracts:       ⭐ C59 §2 invariant 9 / §2.9 (a registry-derived surface may only offer
 *                  VIEWS; anything else is modelled BESIDE it, as an ACTION) · C19 §5.6 /
 *                  C06 §13 (a panel is a HOST; the ACTION is the AUTHORITY) ·
 *                  STR §26.1.1 (a refusal SPEAKS) · C08 §3.1 (textContent, never an HTML sink)
 * Issue log:       L-13257
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * THE ASK, VERBATIM
 * ─────────────────────────────────────────────────────────────────────────────
 * *"Please in the drop down panel - add: zoom the site - it will zoom to the site - do it
 * architecturally sound - this has already been built - it just needs to be accessible here."*
 *
 * ⭐ HE IS RIGHT THAT IT IS BUILT, AND RIGHT THAT IT IS UNREACHABLE. `site.zoom-to-site` is a
 * DECLARED row in `GIS_ACTIONS` (`⤢ Zoom to Site`, entry point `pryzmZoomToSite`), and
 * §ONE-VIEW-SWITCHER's own classification table lists it as one of the NON-VIEW controls the
 * two retired legacy bars carried. Those bars stay mounted only on the site views where their
 * other controls have a subject — so from a PRYZM view, or from the plan pane, this action's
 * only route was the Project Browser's GIS tab. It is a reachability gap, exactly as he says.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⛔⛔ WHY THIS IS A SEPARATE ROW AND NOT A SEVENTH VIEW — C59 INVARIANT 9, BY NAME
 * ─────────────────────────────────────────────────────────────────────────────
 * *"A registry-derived surface may only offer VIEWS. Anything else is modelled BESIDE it, as
 * an action."* Zoom to Site puts NO different view on screen — it moves the camera of the view
 * you are already in. Minting a `ViewType` or a `viewPanelOptions()` row for it is the precise
 * defect §2.9 records (L-6800..L-6809): the pane reducer keys on view type, so a rival row
 * backed by the same renderer refuses on every click. ⭐ So it goes in its OWN group, under
 * its own caption, below the six.
 *
 * ⛔ AND THIS FILE IS A HOST, NOT AN AUTHORITY. It declares no label, no icon, no handler and
 * no availability rule: every one of those is read from `GIS_ACTIONS` and resolved through the
 * SAME `resolveGisAction` ladder `viewSegmentSwitcher` uses. Renaming or deleting the registry
 * row changes this control, and a spec fails if the id stops resolving — which is the property
 * a hand-copied button would not have.
 *
 * ⚠ UNAVAILABLE ⇒ SHOWN, DISABLED, WITH THE REASON (STR §26.1.1). `pryzmZoomToSite` is
 * registered by the site surfaces; on a PRYZM view it may not be. A control that VANISHES when
 * it cannot act teaches the user it does not exist, and a silently greyed one *"reads as a bug,
 * which is exactly how the founder has read three defects this session"*.
 */

import { trace } from '@opentelemetry/api';
import {
    GIS_ACTIONS,
    resolveGisAction,
    type GisActionDecl,
    type GisCapabilityHost,
} from '../gis/gisActionRegistry';

const _tracer = trace.getTracer('pryzm.site.viewPillActionsRow');

/** PRYZM purple — white + violet only ([[preview-color-unified-pryzm-purple]]). */
const BRAND = '#6600FF';

export const VIEW_PILL_ACTIONS_ROW_TESTID = 'view-pill-actions-row';

/**
 * The DECLARED action ids this row offers, in the order they appear.
 *
 * ⛔ IDS, NEVER COPIES. Each must resolve in `GIS_ACTIONS`; `viewPillActionsRow.spec.ts` fails
 * the build if one stops resolving, so a renamed registry row cannot leave a dead button here.
 *
 * ⚠ ONLY ONE TODAY, AND DELIBERATELY. The founder asked for Zoom to Site. `site.analysis` and
 * the two fidelity rows are also non-view controls the legacy bars carried, but they act on the
 * Cesium site surface and are meaningless on a PRYZM view — adding them here would put controls
 * with no subject in front of him, which is the thing §ONE-VIEW-SWITCHER retired them for.
 */
export const VIEW_PILL_ACTION_IDS: readonly string[] = ['site.zoom-to-site'];

/** The sentence a row shows when its entry point is not registered in this session. */
export function actionUnavailableText(decl: GisActionDecl): string {
    return `${decl.label} is not available from here in this session: `
        + `${decl.entryPoints.join(' / ')} `
        + `${decl.entryPoints.length === 1 ? 'has' : 'have'} not been registered. `
        + 'Open a site view once, then return.';
}

export interface ViewPillActionsRowHandle {
    readonly element: HTMLElement;
    /** Re-resolve every action against the host and repaint. Cheap; call when the popup opens. */
    readonly repaint: () => void;
}

/**
 * Build the actions group for a view pill's popup.
 *
 * @param host the capability host the actions are resolved against — injected, never reached
 *             for, so the row is headless-testable and P4 holds.
 */
export function buildViewPillActionsRow(host: GisCapabilityHost): ViewPillActionsRowHandle {
    const span = _tracer.startSpan('pryzm.site.buildViewPillActionsRow');
    try {
        const wrap = document.createElement('div');
        wrap.setAttribute('data-testid', VIEW_PILL_ACTIONS_ROW_TESTID);
        wrap.style.cssText =
            'margin-top:8px;padding-top:8px;border-top:1px solid #efecf7;'
            + 'display:flex;flex-direction:column;gap:5px;';

        const cap = document.createElement('div');
        // ⛔ NO px FONT SIZE — §ONE-TYPE-BASE. The pill's root sets the base and C43 / WCAG 2.2
        // AA puts a 10 px floor under it; a literal here is how `panelFold.ts` shipped a real
        // 9 px accessibility regression. Hierarchy is carried by weight and colour.
        cap.style.cssText = `font-weight:600;color:${BRAND};`;
        cap.textContent = 'Camera';
        wrap.appendChild(cap);

        /** One button per declared id, plus its repaint. */
        const painters: Array<() => void> = [];

        for (const id of VIEW_PILL_ACTION_IDS) {
            const decl = GIS_ACTIONS.find((a) => a.id === id) ?? null;
            if (!decl) {
                // ⛔ A MISSING DECLARATION IS A BUILD DEFECT, NOT A USER-FACING STATE. It is
                // logged and skipped rather than rendered as a mystery button; the spec is what
                // turns this into a failure, because a console line nobody reads is not a gate.
                console.warn(
                    `[views] §ONE-REGION-SWITCHER: "${id}" is not declared in GIS_ACTIONS, `
                    + 'so no row was rendered for it.',
                );
                continue;
            }

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-testid', `${VIEW_PILL_ACTIONS_ROW_TESTID}-${decl.id}`);
            btn.setAttribute('data-gis-action', decl.id);
            btn.style.cssText = [
                'appearance:none', 'text-align:left', 'display:block', 'width:100%',
                'padding:6px 9px', 'border-radius:8px',
                `border:1px solid ${BRAND}`, 'background:#ffffff', `color:${BRAND}`,
                'font:inherit', 'font-weight:600', 'cursor:pointer',
            ].join(';');

            const paint = (): void => {
                // ⭐ RESOLVED ON EVERY PAINT, never captured at build: `pryzmZoomToSite` is
                // registered when a site surface comes up, which can happen AFTER this popup
                // was first built. A once-resolved button would stay dead for the session.
                const dispatch = resolveGisAction(decl, host);
                const live = dispatch !== null;
                btn.textContent = `${decl.icon} ${decl.label}`;
                btn.disabled = !live;
                btn.title = live ? decl.title : actionUnavailableText(decl);
                btn.toggleAttribute('data-view-action-unavailable', !live);
                btn.style.opacity = live ? '1' : '0.5';
                btn.style.cursor = live ? 'pointer' : 'not-allowed';
            };
            paint();
            painters.push(paint);

            btn.addEventListener('click', () => {
                if (btn.disabled) return;
                // Re-resolved at click time for the same reason paint re-resolves: the session
                // can have changed since the popup was painted.
                const dispatch = resolveGisAction(decl, host);
                if (!dispatch) { paint(); return; }
                try {
                    dispatch();
                } catch (e) {
                    console.warn(`[views] §ONE-REGION-SWITCHER "${decl.id}" threw (non-fatal):`, e);
                }
                paint();
            });

            wrap.appendChild(btn);
        }

        span.setAttribute('pryzm.viewPillActions', painters.length);
        return {
            element: wrap,
            repaint: () => { for (const p of painters) p(); },
        };
    } finally {
        span.end();
    }
}
