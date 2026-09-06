/**
 * @file apps/editor/src/ui/styles/panels/siteViewQuickToggle.ts
 *
 * §SITE-VIEW-QUICK-TOGGLE (L-5110..L-5117 · C06 §15 · C06 §6.1) — the top-centre
 * 3D globe / 3D site bar.
 *
 * ⛔ ENROLLED IN §SHELL-FLOAT-BUDGET, and this is not optional. 'left' is
 * 'var(--shell-canvas-cx)' — the ONE published horizontal accounting — never
 * 'left: 50%'. 'shellFloatBudget.spec.ts' ARM B asserts exactly that and fails if
 * it reverts. 'top' clears the shell's always-on band via '--shell-topbar-h'
 * rather than a hand-picked number (C06 §15.6: a bar at the top of the canvas
 * MUST clear the band, and the band can grow).
 *
 * ⚠ NO BACKTICKS ANYWHERE IN THIS FILE, comments included — the whole sheet is one
 * template literal and a stray backtick terminates it mid-file.
 *
 * ⚠ NO inline 'var(--x)cc' concatenation. An invalid inline var() made a whole
 * header render transparent elsewhere today; every colour here is either a token
 * or a literal, never a token with characters glued on.
 *
 * Shares the mode strip's language on purpose (C06 §6.1): the same pill radius,
 * the same panel background token, the same border token. It is a sibling of
 * '.wdh-bar', not a third panel style.
 */

export const SITE_VIEW_QUICK_TOGGLE_STYLES = `
    /* ── The bar ────────────────────────────────────────────────────── */
    .svq-bar {
        position: fixed;
        /* Clear the always-on top row (6px offset + the published band height),
           plus one gutter. DERIVED, so a taller band moves this with it. */
        top: calc(6px + var(--shell-topbar-h, 36px) + 8px);
        left: var(--shell-canvas-cx, 50%);
        transform: translateX(-50%);
        max-width: calc(var(--shell-canvas-w, 100vw) - 32px);
        z-index: 8980;
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 5px 6px;
        background: var(--app-panel-bg);
        border: 1px solid var(--app-border);
        border-radius: 100px;
        box-shadow: var(--app-shadow-panel);
        pointer-events: all;
        user-select: none;
        font-family: var(--app-font);
    }

    /* ── Segments ───────────────────────────────────────────────────── */
    .svq-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        /* C43 / WCAG 2.2 AA SC 2.5.8 — 24px minimum target. 8px + 12px line +
           8px = 28px, so this clears the floor with the label at any length. */
        min-height: 28px;
        padding: 6px 12px;
        border: 1.5px solid transparent;
        border-radius: 100px;
        background: transparent;
        color: var(--app-text);
        font-family: var(--app-font);
        font-size: 12px;
        font-weight: 600;
        line-height: 1;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.12s ease, border-color 0.12s ease, color 0.12s ease;
    }

    .svq-btn:hover:not(:disabled) {
        background: var(--app-hover-bg, rgba(102, 0, 255, 0.06));
        border-color: var(--app-border);
    }

    .svq-btn:focus-visible {
        outline: 2px solid var(--app-accent, #6600FF);
        outline-offset: 1px;
    }

    /* Hosted in some pane. */
    .svq-btn--active {
        border-color: var(--app-accent, #6600FF);
        color: var(--app-accent, #6600FF);
    }

    /* Hosted AND alone on screen — the current view, not merely a visible one.
       The two states are visibly different because they are different facts. */
    .svq-btn--solo {
        background: var(--app-accent, #6600FF);
        border-color: var(--app-accent, #6600FF);
        color: #ffffff;
    }

    /* A refused segment stays READABLE. It keeps its label and carries its reason
       in the title attribute; it does not shrink, hide, or become a bare glyph.
       C06 §15.6 — an occluded or dimmed control that keeps only its affordance is
       the defect, not the fix. */
    .svq-btn:disabled {
        opacity: 0.42;
        cursor: not-allowed;
    }

    .svq-glyph {
        font-size: 13px;
        line-height: 1;
    }

    /* The label must never be truncated to an ellipsis — a clipped view name is a
       control the user cannot identify. */
    .svq-lbl {
        overflow: visible;
        text-overflow: clip;
    }

    .svq-btn--split {
        color: var(--app-text-muted, #6b6880);
        font-weight: 500;
    }

    /* SITE-VIEW-QUICK-TOGGLE / GLOBE (L-6800..L-6807) — the '3D Globe' action.

       It is NOT a view type (C60 6.10 forbids it ever being one - it is 'site-3d' at world
       altitude), so it keeps the ACTION treatment: a filled purple pill, separated from the
       rest by a hairline rule.

       CORRECTED 2026-09-06 (VIEW-PANEL-PER-PANE). This note used to end "It is never
       '--active' or '--solo', because those two words describe a view being HOSTED, and
       this action hosts nothing". Half of that is still true and half is not: the globe is
       now a ROW of the founder's six, so it CAN be active - active meaning "the 3D Site is
       hosted AND the camera is at the world framing". What it still never asserts is that it
       hosts a view of its own.

       Purple on white, per the brand: no black anywhere. */
    .svq-btn--globe {
        margin-left: 5px;
        /* The separator is a rule on the BAR, not a border on the button: a border-left
           of a different width from the button's own 1.5px transparent border would
           shift the label half a pixel, and it would light up on hover with the rest
           of the border. A box-shadow inset draws in the gutter and stays put. */
        box-shadow: -5px 0 0 -4px var(--app-border);
        color: var(--app-accent, #6600FF);
        font-weight: 600;
    }

    .svq-btn--globe:hover:not(:disabled) {
        background: var(--app-accent, #6600FF);
        border-color: var(--app-accent, #6600FF);
        color: #ffffff;
    }

    /* VIEW-PANEL-PER-PANE (founder 2026-09-06) - the PER-PANE panel.

       Founder: "WHEN BEING IN SPLIT VIEW - WE SHALL HAVE TWO PANELS LIKE THAT - AND THE
       USER CAN DECIDE WHAT TO ADD IN EACH OF THE SPLIT VIEWS (LEFT OR RIGHT)."

       NOT IN THE SHELL FLOAT BUDGET, and that is correct rather than an omission.
       '--shell-canvas-cx' measures '#container'; a pane is a fraction of it, so centring
       two pane panels on the canvas centre would stack them on top of each other in the
       middle of the screen. This is PANE chrome (C06 7): 'position: absolute' inside its
       own pane element, so it can never overlay its sibling. 'shellFloatBudget.spec.ts'
       ARM D only classifies 'position: fixed' rules, so nothing here leaves that budget.

       'top: 52px' clears the pane's OWN corner view picker ('PaneViewPicker' mounts at
       'top: 10px' with a ~30px trigger). The panel is the promoted six; the picker beside
       it is the founder's "if the user wants to open more they can do it in the browser". */
    .svq-bar--pane {
        position: absolute;
        top: 52px;
        left: 50%;
        transform: translateX(-50%);
        max-width: calc(100% - 24px);
        flex-wrap: wrap;
        justify-content: center;
        /* Above this pane's renderer surface (the Cesium container carries z 15, the
           MapLibre overlay is 'inset: 0'), and BELOW the picker's own 40 so the two never
           fight for the same click. Still inside the pane box, so never over the sibling. */
        z-index: 38;
    }

    /* ONE-PANEL-PER-PANE-AND-MAKE-IT-A-DROPDOWN (L-13015, founder 2026-09-06: "keep the
       one, the formal and more robust only, and keep it DROP DOWN only") - the MENU shape.

       SAME CONTROL, SAME ROWS, SAME REFUSALS - only the painting differs. It is mounted
       INSIDE 'PaneViewPicker''s popup, so it is placed by its host and carries NO position
       of its own: no 'absolute', no 'fixed', nothing for the float budget to classify.
       Six segments plus Split wrapped onto two rows at ~470px in the founder's half-width
       pane; stacking them is the layout agreeing with him. */
    .svq-bar--menu {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 2px;
        padding: 0;
        border: none;
        background: transparent;
        box-shadow: none;
        max-width: none;
    }
    .svq-bar--menu .svq-btn {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 3px;
        width: 100%;
        text-align: left;
        padding: 8px 10px;
        border-radius: 8px;
        white-space: normal;
    }
    .svq-bar--menu .svq-glyph { display: inline; }

    /* THE REFUSAL SPEAKS (STR 26.1.1 / L-12999): "PRYZM declines in ONE SENTENCE naming
       the reason ... a silently greyed-out segment is the WRONG implementation." So the
       reason is DOM TEXT under the row, never only a 'title=' - a hover string says
       nothing on a touch surface and nothing to a screen reader that is not hovering. */
    .svq-reason {
        display: block;
        font: 400 11px/1.35 var(--app-font, system-ui, sans-serif);
        color: #5b5470;
        white-space: normal;
    }
    .svq-btn:disabled .svq-reason { color: #8b86a0; }

    /* L-13025 (founder 2026-09-06) - "the left hand side view, on the top-right corner,
       there is ALSO something we don't need, for 2D map view / 2D satellite. ALL OF THAT
       SHOULD BE CONCATENATED ON THE SINGLE DROP DOWN PANEL WITH ALL VIEWS."

       That is the 2D map's OWN corner 'Map | Satellite' chip (A.8.c.f.4,
       'pryzm-gis-basemap-toggle', top 52px / right 12px on the map overlay). Both of its
       routes are now rows of the pane dropdown ('2D Site Map' / '2D Satellite'), which
       dispatch into the SAME 'SiteBoundaryMap2D.swapBasemap' - so this is a duplicate
       control, not a second capability.

       SCOPED TO THE SPLIT SHELL, DELIBERATELY, and this is the whole care in the rule: the
       chip is hidden ONLY where a pane dropdown exists to replace it. The map also mounts
       standalone (onboarding's draw surface, the import overlay) where there is no pane and
       no dropdown; hiding it there would delete the only basemap route on that surface -
       a removed route, not a de-duplicated one (C19 5.6 clause 4 / L-942).

       NO JS LIFECYCLE, because the fact is structural: 'PaneHost' re-parents the map
       overlay INTO the pane element, so "the map is in a pane of the split shell" is
       exactly "the chip is a descendant of #pryzm-site-authoring-panes". A mount-time flag
       would have to be re-asked on every re-target; this cannot go stale. */
    #pryzm-site-authoring-panes .pryzm-gis-basemap-toggle {
        display: none;
    }

    /* UNREPORTED is not OFF (C84 EI-1b). The row works; whether it is what you are looking
       at cannot be read in this session, so it must not paint as either state. A dotted
       underline says "there is a state here I cannot show you" without borrowing the
       active treatment. 'aria-pressed="mixed"' carries the same fact non-visually (C43). */
    .svq-btn[data-variant-unreported='true'] .svq-lbl {
        text-decoration: underline dotted;
        text-underline-offset: 3px;
    }
`;
