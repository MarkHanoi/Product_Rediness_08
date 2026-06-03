// A.5.f — styling for the re-mounted RAC onboarding canvas (RACChatbotPanel)
// and the O.2 onboarding STEP controller (location → draw → generate).
//
// BRAND (tested defects — founder review 2026-06-03)
// --------------------------------------------------
// PRYZM is WHITE + PURPLE (#6600FF) — "we don't use black". The earlier dark
// cards (`#14141c` / `rgba(8,8,14,…)`) were a brand violation and the panels were
// too big. This stylesheet now matches the on-brand AuthModal / ProjectHub
// visual language: a near-white frosted card, #6600FF purple accents, dark text
// on light, and restrained (compact) sizing. Reference: AUTH_MODAL_STYLES
// (`src/ui/styles/panels/authModals.ts`) — white card, 420px max-width, dark
// charcoal text (#111), violet-soft accents. Brand purple is the unified #6600FF
// (Contract §41 / PreviewStyle).

export const ONBOARDING_STYLES = `
.rac-onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  flex-direction: column;
  width: min(440px, 92vw);
  max-height: 82vh;
  margin: auto;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(28px) saturate(1.6);
  -webkit-backdrop-filter: blur(28px) saturate(1.6);
  color: #1a1a2e;
  border: 1px solid rgba(102, 0, 255, 0.14);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(60, 20, 120, 0.18), 0 4px 16px rgba(0, 0, 0, 0.08);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}
.rac-onboarding-overlay .rac-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.07);
  background: linear-gradient(180deg, rgba(102, 0, 255, 0.06), transparent);
}
.rac-onboarding-overlay .rac-title {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #111;
}
.rac-onboarding-overlay .rac-phase-chip {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  background: rgba(102, 0, 255, 0.08);
  color: #6600ff;
  border: 1px solid rgba(102, 0, 255, 0.22);
}
.rac-onboarding-overlay .rac-transcript {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.rac-onboarding-overlay .rac-turn {
  max-width: 85%;
  padding: 0.55rem 0.8rem;
  border-radius: 12px;
  line-height: 1.45;
  font-size: 0.9rem;
}
.rac-onboarding-overlay .rac-turn--assistant {
  align-self: flex-start;
  background: #f5f4fb;
  border: 1px solid rgba(0, 0, 0, 0.06);
  color: #1a1a2e;
}
.rac-onboarding-overlay .rac-turn--user {
  align-self: flex-end;
  background: #6600ff;
  color: #fff;
}
.rac-onboarding-overlay .rac-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  padding: 0 1rem 0.5rem;
}
.rac-onboarding-overlay .rac-suggestion {
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  background: rgba(102, 0, 255, 0.06);
  border: 1px solid rgba(102, 0, 255, 0.22);
  color: #6600ff;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}
.rac-onboarding-overlay .rac-suggestion:hover {
  border-color: #6600ff;
  background: rgba(102, 0, 255, 0.12);
}
.rac-onboarding-overlay .rac-summary {
  padding: 0 1rem;
  font-size: 0.82rem;
  color: rgba(0, 0, 0, 0.45);
}
.rac-onboarding-overlay .rac-error {
  margin: 0 1rem 0.5rem;
  padding: 0.5rem 0.7rem;
  border-radius: 8px;
  background: rgba(185, 28, 28, 0.06);
  border: 1px solid rgba(185, 28, 28, 0.18);
  color: #b91c1c;
  font-size: 0.82rem;
}
.rac-onboarding-overlay .rac-input-row {
  display: flex;
  gap: 0.5rem;
  padding: 0.85rem 1rem;
  border-top: 1px solid rgba(0, 0, 0, 0.07);
  background: rgba(250, 250, 252, 0.8);
}
.rac-onboarding-overlay .rac-input {
  flex: 1 1 auto;
  padding: 0.6rem 0.85rem;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fafafa;
  color: #111;
  font-size: 0.9rem;
}
.rac-onboarding-overlay .rac-input:focus-visible {
  outline: none;
  border-color: #6600ff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.18);
}
.rac-onboarding-overlay .rac-send {
  padding: 0.6rem 1rem;
  border-radius: 10px;
  border: none;
  background: #6600ff;
  color: #fff;
  font-weight: 700;
  cursor: pointer;
}
.rac-onboarding-overlay .rac-send:hover { background: #5500dd; }

/* ── O.2 — Onboarding STEP CONTROLLER overlay (os-*) ───────────────────────────
   The guided location → draw-or-skip → generate flow. On-brand WHITE card with
   #6600FF purple accents and dark text — matches AuthModal / ProjectHub. Compact
   sizing (max-width 420px) per the founder's "too big" feedback. */
.os-onboarding-overlay {
  position: fixed;
  inset: 0;
  z-index: 1250;
  display: flex;
  flex-direction: column;
  width: min(420px, 92vw);
  max-height: 82vh;
  margin: auto;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(28px) saturate(1.6);
  -webkit-backdrop-filter: blur(28px) saturate(1.6);
  color: #1a1a2e;
  border: 1px solid rgba(102, 0, 255, 0.14);
  border-radius: 16px;
  box-shadow: 0 24px 60px rgba(60, 20, 120, 0.18), 0 4px 16px rgba(0, 0, 0, 0.08), 0 0 0 100vmax rgba(30, 10, 70, 0.32);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}
.os-onboarding-overlay .os-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.8rem 1rem;
  border-bottom: 1px solid rgba(0, 0, 0, 0.07);
  background: linear-gradient(180deg, rgba(102, 0, 255, 0.06), transparent);
}
.os-onboarding-overlay .os-title {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: #111;
}
.os-onboarding-overlay .os-step-chip {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.22rem 0.55rem;
  border-radius: 999px;
  background: rgba(102, 0, 255, 0.08);
  color: #6600ff;
  border: 1px solid rgba(102, 0, 255, 0.22);
  white-space: nowrap;
}
.os-onboarding-overlay .os-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.os-onboarding-overlay .os-prompt {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #111;
}
.os-onboarding-overlay .os-hint {
  margin: 0;
  font-size: 0.84rem;
  color: rgba(0, 0, 0, 0.48);
  line-height: 1.45;
}
.os-onboarding-overlay .os-status {
  margin: 0.2rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: #6600ff;
}
.os-onboarding-overlay .os-input-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.4rem;
}
.os-onboarding-overlay .os-input {
  flex: 1 1 auto;
  padding: 0.6rem 0.85rem;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: #fafafa;
  color: #111;
  font-size: 0.9rem;
}
.os-onboarding-overlay .os-input:focus-visible {
  outline: none;
  border-color: #6600ff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.18);
}
.os-onboarding-overlay .os-btn {
  padding: 0.6rem 1rem;
  border-radius: 10px;
  border: none;
  font-weight: 700;
  font-size: 0.86rem;
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
  gap: 0.5rem;
  margin-top: 0.4rem;
}
.os-onboarding-overlay .os-choice {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  text-align: left;
  padding: 0.75rem 0.9rem;
  border-radius: 12px;
  border: 1px solid rgba(0, 0, 0, 0.10);
  background: #fafafa;
  color: #1a1a2e;
  cursor: pointer;
}
.os-onboarding-overlay .os-choice:hover {
  border-color: #6600ff;
  background: rgba(102, 0, 255, 0.05);
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.12);
}
.os-onboarding-overlay .os-choice-title { font-size: 0.94rem; font-weight: 700; color: #111; }
.os-onboarding-overlay .os-choice-desc { font-size: 0.82rem; color: rgba(0, 0, 0, 0.46); line-height: 1.4; }
.os-onboarding-overlay .os-footer {
  display: flex;
  justify-content: flex-start;
  margin-top: 0.6rem;
}

/* ── DRAW phase — NON-BLOCKING presentation (tested defect fix) ─────────────────
   During "STEP 2 OF 3 · DRAW YOUR PLOT" the user must SEE and CLICK the map to
   trace their plot. So the overlay stops being a centered modal-with-backdrop and
   becomes a slim instruction banner docked to the BOTTOM-CENTER edge:
     • NO full-screen backdrop (drop the 100vmax box-shadow) — the map stays visible;
     • the overlay shrinks to fit its content and is anchored bottom-center, so it
       does NOT cover the center of the map;
     • pointer events fall through to the map everywhere EXCEPT the banner itself —
       the container is pointer-events:none, the banner card re-enables them. This
       means clicks/drags to draw corners reach SiteBoundaryMap2D underneath.
   The banner is on-brand white + purple (no dark card) and compact. */
.os-onboarding-overlay.os-onboarding-overlay--drawing {
  /* Container spans the viewport but is click-through; only the banner inside is
     interactive (see below). Anchor the banner to the bottom edge. */
  inset: auto 0 0 0;
  top: auto;
  width: 100vw;
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
  align-items: center;          /* center the banner horizontally */
  pointer-events: none;         /* let clicks pass through to the map */
}
/* The visible banner card — re-enables pointer events for its own controls only. */
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-header,
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-body {
  pointer-events: auto;
  width: min(560px, 94vw);
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20px) saturate(1.5);
  -webkit-backdrop-filter: blur(20px) saturate(1.5);
  border: 1px solid rgba(102, 0, 255, 0.16);
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-header {
  border-radius: 14px 14px 0 0;
  border-bottom: none;
  padding: 0.5rem 0.9rem;
  box-shadow: 0 -8px 28px rgba(60, 20, 120, 0.16);
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-title {
  font-size: 0.88rem;
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-body {
  flex: 0 0 auto;
  overflow: visible;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  padding: 0.6rem 0.9rem;
  border-top: none;
  border-radius: 0 0 14px 14px;
  box-shadow: 0 8px 28px rgba(60, 20, 120, 0.16);
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-draw-instruction {
  flex: 1 1 auto;
  margin: 0;
  color: #4a2a8a;
  font-size: 0.84rem;
  white-space: normal;
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-footer {
  flex: 0 0 auto;
  margin: 0;
}

/* ── O.7.1 — GENERATE-CONFIRM step (non-blocking, keeps boundary visible) ───────
   The confirm card REUSES the non-blocking drawing presentation (no full-screen
   backdrop → the drawn boundary stays visible behind it; pointer-events fall
   through to the map). But unlike the slim one-line draw banner it needs a
   vertical title + subtext + two-button layout, so the --confirm modifier
   restores the column flow on the body and renders the actions as a button row. On-brand
   white card + #6600FF primary, matching the compact onboarding card. */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-body {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 0.5rem;
  padding: 0.85rem 1rem 0.95rem;
}
.os-onboarding-overlay--confirm .os-confirm-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.35rem;
}
.os-onboarding-overlay--confirm .os-confirm-actions .os-btn {
  flex: 1 1 auto;
}
`;
