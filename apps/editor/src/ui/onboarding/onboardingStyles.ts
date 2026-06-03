// A.5.f — styling for the re-mounted RAC onboarding canvas (RACChatbotPanel)
// and the O.2 onboarding STEP controller (location → draw → generate).
//
// BRAND + GLASS (tested defects — founder review 2026-06-03)
// ----------------------------------------------------------
// PRYZM is WHITE + PURPLE (#6600FF) — "we don't use black". The cards are a
// translucent FROSTED GLASS panel (MasterMiawW ConversationCanvas reference):
// a semi-transparent white background + `backdrop-filter: blur(24px)` so the
// canvas/map shows through, a hairline #6600FF border, and a soft purple shadow.
// Dark charcoal text (#111) keeps contrast readable on the frosted card.
//
// The earlier opaque-white cards (`rgba(255,255,255,0.94)`) were too solid AND
// too TALL — they reserved a big empty vertical box (fixed/min message area +
// `flex:1` body). Per founder feedback the panels now SIZE TO THEIR CONTENT:
// no min-heights, the transcript/body grow with content (capped by max-height +
// scroll), and paddings are tighter. Net: smaller, denser, glassy cards.
//
// CHROME (this session): the panels are DRAGGABLE by their header (makeDraggable,
// cursor:move) and RESIZABLE via a bottom-right grip (makeResizable). The shared
// `.vg-panel--dragging` / `.vg-panel--resizing` classes are toggled by those
// helpers; the grip visuals + drag cursor live here (§05 §7 — no separate <style>).

export const ONBOARDING_STYLES = `
.rac-onboarding-overlay {
  position: fixed;
  /* §PANEL-SIZE-FIX (2026-06-03): centre with transform, NOT inset:0 + margin:auto.
     With top:0+bottom:0 (inset:0) + height:auto the box STRETCHES to the max-height
     (620px) up-front, then snaps to content only on the first drag (when makeDraggable
     sets bottom:auto) — the founder's "starts big, shrinks on select" regression.
     Transform-centring keeps height:auto = content-height from first paint. */
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 1200;
  display: flex;
  flex-direction: column;
  width: min(420px, 92vw);
  /* Content-sized: cap height so a long transcript scrolls, but DON'T reserve a
     tall empty box up-front. The card is only as tall as its content until the cap. */
  height: auto;
  max-height: min(72vh, 620px);
  /* Frosted glass (MasterMiawW): translucent white + blur so the canvas shows through. */
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  color: #1a1a2e;
  border: 1px solid rgba(102, 0, 255, 0.12);
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(60, 20, 120, 0.20), 0 2px 10px rgba(0, 0, 0, 0.06);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}
.rac-onboarding-overlay .rac-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.55rem 0.85rem;
  border-bottom: 1px solid rgba(102, 0, 255, 0.08);
  background: linear-gradient(180deg, rgba(102, 0, 255, 0.06), transparent);
  cursor: move; /* draggable by the header (makeDraggable) */
  user-select: none;
}
.rac-onboarding-overlay .rac-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #111;
}
.rac-onboarding-overlay .rac-phase-chip {
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: rgba(102, 0, 255, 0.10);
  color: #6600ff;
  border: 1px solid rgba(102, 0, 255, 0.22);
}
.rac-onboarding-overlay .rac-transcript {
  /* GROW with messages, don't reserve an empty box: no flex-grow, no min-height.
     The card shrinks to fit 0-1 turns and only scrolls past the max-height cap. */
  flex: 0 1 auto;
  overflow-y: auto;
  padding: 0.7rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.rac-onboarding-overlay .rac-transcript-empty {
  font-size: 0.9rem;
  line-height: 1.45;
  color: #2a2440;
  font-weight: 600;
}
.rac-onboarding-overlay .rac-turn {
  max-width: 85%;
  padding: 0.5rem 0.75rem;
  border-radius: 12px;
  line-height: 1.4;
  font-size: 0.88rem;
}
.rac-onboarding-overlay .rac-turn--assistant {
  align-self: flex-start;
  background: rgba(245, 244, 251, 0.85);
  border: 1px solid rgba(102, 0, 255, 0.08);
  color: #1a1a2e;
}
.rac-onboarding-overlay .rac-turn--user {
  align-self: flex-end;
  background: #6600ff;
  color: #fff;
}
.rac-onboarding-overlay .rac-turn-speaker {
  display: block;
  font-size: 0.62rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  opacity: 0.6;
  margin-bottom: 0.1rem;
}
.rac-onboarding-overlay .rac-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0 0.85rem 0.45rem;
}
.rac-onboarding-overlay .rac-suggestion,
.rac-onboarding-overlay .rac-chip {
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  background: rgba(102, 0, 255, 0.08);
  border: 1px solid rgba(102, 0, 255, 0.22);
  color: #6600ff;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.rac-onboarding-overlay .rac-suggestion:hover,
.rac-onboarding-overlay .rac-chip:hover {
  border-color: #6600ff;
  background: rgba(102, 0, 255, 0.14);
}
.rac-onboarding-overlay .rac-summary {
  padding: 0 0.85rem;
  font-size: 0.78rem;
  color: rgba(20, 10, 40, 0.55);
}
.rac-onboarding-overlay .rac-summary:empty { display: none; }
.rac-onboarding-overlay .rac-error {
  margin: 0 0.85rem 0.45rem;
  padding: 0.45rem 0.65rem;
  border-radius: 8px;
  background: rgba(185, 28, 28, 0.08);
  border: 1px solid rgba(185, 28, 28, 0.20);
  color: #b91c1c;
  font-size: 0.8rem;
}
.rac-onboarding-overlay .rac-input-row {
  display: flex;
  gap: 0.45rem;
  padding: 0.6rem 0.85rem;
  border-top: 1px solid rgba(102, 0, 255, 0.08);
  background: rgba(250, 250, 252, 0.55);
}
.rac-onboarding-overlay .rac-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.55rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.85);
  color: #111;
  font-size: 0.88rem;
}
.rac-onboarding-overlay .rac-input:focus-visible {
  outline: none;
  border-color: #6600ff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.18);
}
.rac-onboarding-overlay .rac-send {
  padding: 0.55rem 0.95rem;
  border-radius: 10px;
  border: none;
  background: #6600ff;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.rac-onboarding-overlay .rac-send:hover { background: #5500dd; }

/* ── O.2 — Onboarding STEP CONTROLLER overlay (os-*) ───────────────────────────
   The guided location → draw-or-skip → generate flow. Same frosted-glass card +
   #6600FF accents, content-sized (no min-heights), draggable + resizable. */
.os-onboarding-overlay {
  position: fixed;
  /* §PANEL-SIZE-FIX (2026-06-03): transform-centre, not inset:0 + margin:auto —
     see the .rac-onboarding-overlay note. Keeps height:auto = content from first paint. */
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 1250;
  display: flex;
  flex-direction: column;
  width: min(400px, 92vw);
  height: auto;
  max-height: min(72vh, 600px);
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  color: #1a1a2e;
  border: 1px solid rgba(102, 0, 255, 0.12);
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(60, 20, 120, 0.20), 0 2px 10px rgba(0, 0, 0, 0.06), 0 0 0 100vmax rgba(30, 10, 70, 0.28);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}
.os-onboarding-overlay .os-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid rgba(102, 0, 255, 0.08);
  background: linear-gradient(180deg, rgba(102, 0, 255, 0.06), transparent);
  cursor: move; /* draggable by the header (makeDraggable) */
  user-select: none;
}
.os-onboarding-overlay .os-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #111;
}
.os-onboarding-overlay .os-step-chip {
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: rgba(102, 0, 255, 0.10);
  color: #6600ff;
  border: 1px solid rgba(102, 0, 255, 0.22);
  white-space: nowrap;
}
.os-onboarding-overlay .os-body {
  /* Content-sized: no flex-grow, no min-height; scroll only past the cap. */
  flex: 0 1 auto;
  overflow-y: auto;
  padding: 0.8rem 0.85rem 0.9rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}
.os-onboarding-overlay .os-prompt {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #111;
}
.os-onboarding-overlay .os-hint {
  margin: 0;
  font-size: 0.82rem;
  color: rgba(20, 10, 40, 0.58);
  line-height: 1.4;
}
.os-onboarding-overlay .os-status {
  margin: 0.15rem 0 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6600ff;
}
.os-onboarding-overlay .os-input-row {
  display: flex;
  gap: 0.45rem;
  margin-top: 0.3rem;
}
.os-onboarding-overlay .os-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.55rem 0.8rem;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.85);
  color: #111;
  font-size: 0.88rem;
}
.os-onboarding-overlay .os-input:focus-visible {
  outline: none;
  border-color: #6600ff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.18);
}
.os-onboarding-overlay .os-btn {
  padding: 0.55rem 0.95rem;
  border-radius: 10px;
  border: none;
  font-weight: 700;
  font-size: 0.85rem;
  cursor: pointer;
}
.os-onboarding-overlay .os-btn--primary { background: #6600ff; color: #fff; }
.os-onboarding-overlay .os-btn--primary:hover { background: #5500dd; }
.os-onboarding-overlay .os-btn--primary:disabled { opacity: 0.45; cursor: default; }
.os-onboarding-overlay .os-btn--ghost {
  background: transparent;
  color: #6600ff;
  border: 1px solid rgba(102, 0, 255, 0.28);
}
.os-onboarding-overlay .os-btn--ghost:hover { border-color: #6600ff; background: rgba(102, 0, 255, 0.06); }
.os-onboarding-overlay .os-choices {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.3rem;
}
.os-onboarding-overlay .os-choice {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  text-align: left;
  padding: 0.6rem 0.8rem;
  border-radius: 12px;
  border: 1px solid rgba(102, 0, 255, 0.10);
  background: rgba(255, 255, 255, 0.55);
  color: #1a1a2e;
  cursor: pointer;
}
.os-onboarding-overlay .os-choice:hover {
  border-color: #6600ff;
  background: rgba(102, 0, 255, 0.06);
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.12);
}
.os-onboarding-overlay .os-choice-title { font-size: 0.92rem; font-weight: 700; color: #111; }
.os-onboarding-overlay .os-choice-desc { font-size: 0.8rem; color: rgba(20, 10, 40, 0.52); line-height: 1.35; }
.os-onboarding-overlay .os-footer {
  display: flex;
  justify-content: flex-start;
  margin-top: 0.45rem;
}

/* ── DRAW phase — NON-BLOCKING presentation (tested defect fix) ─────────────────
   During "DRAW YOUR PLOT" the user must SEE and CLICK the map. The overlay stops
   being a centered modal-with-backdrop and becomes a slim instruction banner
   docked bottom-center; pointer events fall through to the map everywhere except
   the banner card. The banner is glass too. While drawing the panel is NOT
   draggable/resizable (it's docked) — those affordances only apply to the modal
   presentations. */
.os-onboarding-overlay.os-onboarding-overlay--drawing {
  inset: auto 0 0 0;
  top: auto;
  width: 100vw;
  height: auto;
  max-width: none;
  max-height: none;
  margin: 0;
  padding: 0 0 1rem;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: none;
  border-radius: 0;
  box-shadow: none;
  overflow: visible;
  align-items: center;
  pointer-events: none;
}
/* The visible banner card — re-enables pointer events for its own controls only. */
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-header,
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-body {
  pointer-events: auto;
  width: min(560px, 94vw);
  background: rgba(255, 255, 255, 0.74);
  backdrop-filter: blur(20px) saturate(1.2);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  border: 1px solid rgba(102, 0, 255, 0.14);
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-header {
  border-radius: 14px 14px 0 0;
  border-bottom: none;
  padding: 0.45rem 0.85rem;
  box-shadow: 0 -8px 26px rgba(60, 20, 120, 0.16);
  cursor: default; /* docked banner is not draggable */
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-title {
  font-size: 0.86rem;
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-body {
  flex: 0 0 auto;
  overflow: visible;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
  padding: 0.55rem 0.85rem;
  border-top: none;
  border-radius: 0 0 14px 14px;
  box-shadow: 0 8px 26px rgba(60, 20, 120, 0.16);
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-draw-instruction {
  flex: 1 1 auto;
  margin: 0;
  color: #4a2a8a;
  font-size: 0.82rem;
  white-space: normal;
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-footer {
  flex: 0 0 auto;
  margin: 0;
}
/* The resize grip is meaningless on the docked banner — hide it while drawing. */
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-resize-grip { display: none; }

/* ── O.7.1 — GENERATE-CONFIRM step (non-blocking, keeps boundary visible) ───────
   Reuses the non-blocking drawing presentation but restores a vertical
   title + subtext + two-button layout via --confirm. Glass card + #6600FF. */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-body {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 0.45rem;
  padding: 0.75rem 0.9rem 0.85rem;
}
.os-onboarding-overlay--confirm .os-confirm-actions {
  display: flex;
  gap: 0.45rem;
  margin-top: 0.3rem;
}
.os-onboarding-overlay--confirm .os-confirm-actions .os-btn {
  flex: 1 1 auto;
}

/* ── DRAG + RESIZE chrome (shared with makeDraggable / makeResizable) ───────────
   The helpers toggle .vg-panel--dragging / .vg-panel--resizing. Suppress text
   selection while interacting; show the grip in the bottom-right corner. */
.vg-panel--dragging,
.vg-panel--resizing { user-select: none; }
.rac-onboarding-overlay .rac-resize-grip,
.os-onboarding-overlay .os-resize-grip {
  position: absolute;
  right: 3px;
  bottom: 3px;
  width: 16px;
  height: 16px;
  cursor: nwse-resize;
  z-index: 2;
  /* Two short diagonal strokes — a subtle purple grip mark. */
  background:
    linear-gradient(135deg, transparent 0 50%, rgba(102, 0, 255, 0.5) 50% 60%, transparent 60% 100%),
    linear-gradient(135deg, transparent 0 70%, rgba(102, 0, 255, 0.5) 70% 80%, transparent 80% 100%);
  opacity: 0.55;
}
.rac-onboarding-overlay .rac-resize-grip:hover,
.os-onboarding-overlay .os-resize-grip:hover { opacity: 0.9; }
`;
