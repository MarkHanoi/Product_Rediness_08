/**
 * @file src/styles/panels/canvasOverlays.ts
 *
 * CSS for canvas overlay UI: Intent Prompt toast (ip-) and the contextual
 * CREATE affordance that every plan/elevation view pane carries (vco-).
 * CONTRACT §05 §3 — prefixes `ip-` and `vco-` reserved for this module.
 */

export const CANVAS_OVERLAYS_STYLES = `
.ip-toast {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 9500;
    background: var(--app-bg);
    border: 1px solid var(--app-border-light);
    border-radius: var(--app-radius-md);
    padding: 14px 16px;
    width: 380px;
    max-width: 92vw;
    box-shadow: var(--app-shadow-panel);
    font-family: var(--app-font);
    animation: ip-slide-up 0.22s cubic-bezier(.16,1,.3,1);
    pointer-events: all;
}
@keyframes ip-slide-up {
    from { opacity:0; transform: translateX(-50%) translateY(16px); }
    to   { opacity:1; transform: translateX(-50%) translateY(0);    }
}
.ip-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
}
.ip-icon {
    font-size: 16px;
    flex-shrink: 0;
}
.ip-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--app-text);
    flex: 1;
}
.ip-badge {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--app-violet-soft);
    color: var(--app-accent);
}
.ip-context {
    font-size: 11px;
    color: var(--app-text-2);
    margin-bottom: 10px;
    line-height: 1.45;
}
.ip-input {
    width: 100%;
    box-sizing: border-box;
    background: var(--app-panel-bg);
    border: 1px solid var(--app-border);
    border-radius: var(--app-radius-sm);
    padding: 8px 10px;
    font-size: 12px;
    color: var(--app-text);
    font-family: var(--app-font);
    resize: none;
    outline: none;
    transition: border-color 0.15s;
}
.ip-input:focus {
    border-color: var(--app-accent);
}
.ip-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 10px;
}
.ip-timer {
    flex: 1;
    font-size: 10px;
    color: var(--app-text-muted);
}
.ip-btn-dismiss {
    background: transparent;
    border: 1px solid var(--app-border);
    border-radius: var(--app-radius-sm);
    padding: 5px 12px;
    font-size: 11px;
    color: var(--app-text-2);
    cursor: pointer;
    font-family: var(--app-font);
    transition: background 0.12s;
}
.ip-btn-dismiss:hover { background: var(--app-violet-soft); }
.ip-btn-record {
    background: var(--app-gradient);
    border: none;
    border-radius: var(--app-radius-sm);
    padding: 5px 14px;
    font-size: 11px;
    font-weight: 600;
    color: #fff;
    cursor: pointer;
    font-family: var(--app-font);
    transition: opacity 0.12s;
}
.ip-btn-record:hover { opacity: 0.88; }

/* ── VoiceCommandIndicator pulse animation (§05 §2.1 — AppTheme only) ─── */
@keyframes voice-pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(220,38,38,0.5); }
    50%      { box-shadow: 0 0 0 7px rgba(220,38,38,0); }
}

/* ═══════════════════════════════════════════════════════════════════════════
   VCO — the contextual CREATE affordance ('+ Grid' in plan, '+ Level' in
   elevation/section). §GRID-BUTTON-CENSUS (L-4000..L-4004)
   ═══════════════════════════════════════════════════════════════════════════

   ⛔ THE DEFECT, MEASURED 2026-08-22, AND IT WAS TWO BUTTONS, NOT ONE.
   'rg "\+ Grid" --type ts' returns TWO owners that each build their own pill:

     PlanViewToolOverlay.ts:694   document.body.appendChild  position: fixed  z-index 6
     SvpPlanToolOverlay.ts:692    document.body.appendChild  position: fixed  z-index 10002

   Both then computed 'left'/'top' in JS from their canvas's
   'getBoundingClientRect()', on 'document.body', which is where the whole
   family of failures comes from:

   1. THE SPLIT-VIEW PILL PAINTED ON TOP OF THE RIGHT-HAND PANELS. '.svp-pane'
      is 'position: fixed; right: 0; width: 40%' at z-index 1 (splitView.ts:37);
      '#dw-workbench' is z-index 110 and '#anl-surface' is z-index 50. The PANE
      therefore sits correctly BEHIND both panels — but its button was not a
      child of the pane, it was a body child at 10002, so it floated ALONE over
      the panel at x = 60vw with no pane around it. That is the founder's
      screenshot: a '+ Grid' pill inside STRATEGIZE / Programme and inside the
      Analysis panel.
   2. NEITHER BUTTON KNEW ABOUT THE WORKSPACE MODE. A body-parented fixed
      element survives every mode switch; nothing hid it when the canvas went to
      half width or 'display: none' (Data mode, 'canvas: hidden').
   3. BOTH HAND-PICKED A z-index. C06 §7.3 forbids exactly that, and the two
      values were on opposite sides of the panel layer — which is why the same
      control was simultaneously 'invisible under the panel' and 'floating over
      the panel' depending on which of the two you measured.

   ⭐ THE FIX IS STRUCTURAL, NOT ARITHMETIC — C06 §14 applied to a canvas.
   The button is now a CHILD of the pane it belongs to, positioned by CSS at
   that pane's own bottom-left corner. There is no JS geometry left to drift:

     · plan view   → '#container'  ('position: relative', z-index AUTO)
     · split view  → '.svp-pane'   ('position: fixed',   z-index 1)

   It inherits, BY CONSTRUCTION: the pane's width (half-canvas modes move it),
   the pane's 'display' (Data mode hides the canvas and the button with it), and
   the pane's stacking. '.svp-pane' carries a z-index, so it CREATES a stacking
   context and its button is CONTAINED — it cannot out-paint '#dw-workbench'
   whatever number it holds. '#container' does not (C06 §7.2 names this trap
   explicitly), so this rule declares NO z-index at all: an 'auto' positioned
   descendant paints below every positioned body sibling with z-index >= 1,
   which is every panel in the shell.

   ⚠ NOT A z-index TOKEN, deliberately. Adding 'var(--z-viewport-hud)' (900)
   would REINTRODUCE the bug: 900 beats '#anl-surface' (50) and '#dw-workbench'
   (110), because those two panels have not been migrated to '--z-panel' (1000).
   The correct layer for this control is 'below every panel', and the only
   expression of that which does not depend on the unmigrated numbers is to
   carry no z-index and let containment do the work. Recorded in C06 §7.4.
   ─────────────────────────────────────────────────────────────────────────── */
.vco-create-btn {
    position: absolute;
    left: 16px;
    bottom: 16px;
    padding: 8px 14px;
    background: var(--app-gradient);
    color: var(--app-on-accent);
    border: 1px solid var(--app-on-accent-veil-hover);
    border-radius: var(--app-radius-sm);
    font-family: var(--app-font);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    cursor: pointer;
    box-shadow: var(--app-shadow-hud);
    user-select: none;
    transition: filter 0.13s;
}
.vco-create-btn:hover { filter: brightness(1.08); }
.vco-create-btn:focus-visible {
    outline: 2px solid var(--app-accent);
    outline-offset: 2px;
}
`;
