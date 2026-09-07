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
  /* Content-sized: cap height so a long transcript/brief form scrolls, but DON'T
     reserve a tall empty box up-front. The card is only as tall as its content
     until the cap. O.13.e — cap to the viewport (min(86vh, …)) so the panel
     ALWAYS fits and the sticky footer CTA is never pushed below the fold; the
     middle (transcript + brief form) is the scroll region, header + footer pin. */
  height: auto;
  max-height: min(86vh, 720px);
  /* Frosted glass (MasterMiawW): translucent white + blur so the canvas shows through. */
  background: rgba(255, 255, 255, 0.88);
  backdrop-filter: blur(24px) saturate(1.2);
  -webkit-backdrop-filter: blur(24px) saturate(1.2);
  color: #1a1a2e;
  border: 1px solid rgba(102, 0, 255, 0.12);
  border-radius: 16px;
  /* O.13.b — subtle modal backdrop (the big 100vmax spread dims the canvas behind
     the panel like other PRYZM modals, but light — "not too much"). Removed for the
     non-blocking draw banner via the --drawing modifier so the map stays interactive. */
  /* §PANEL-BACKDROP-UNIFY — shared scrim (the 100vmax spread) via the one token. */
  box-shadow: 0 20px 50px rgba(60, 20, 120, 0.20), 0 2px 10px rgba(0, 0, 0, 0.06), 0 0 0 100vmax var(--pryzm-panel-backdrop);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}
/* O.13 — New-Project-modal design: solid purple gradient header bar + white body. */
.rac-onboarding-overlay .rac-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: none;
  background: linear-gradient(135deg, #6600ff 0%, #8b2fe0 100%);
  cursor: move; /* draggable by the header (makeDraggable) */
  user-select: none;
}
.rac-onboarding-overlay .rac-title {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #ffffff;
}
.rac-onboarding-overlay .rac-phase-chip {
  font-size: 0.66rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.20);
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.35);
}
/* O.13.c — dedicated body heading. Sits FULLY below the gradient header bar
   (its own top margin clears the header) with dark, readable text on the white
   body — the founder's "heading clipped under the header / low-contrast" fix.
   It does not scroll with the transcript, so the question stays anchored. */
.rac-onboarding-overlay .rac-body-heading {
  /* Pinned (never scrolls) directly under the gradient header. O.13.e — extra
     top clearance (1.05rem) so the first line is fully visible and never reads
     as clipped under the header bar. */
  flex: 0 0 auto;
  margin: 0;
  padding: 1.05rem 0.9rem 0.55rem;
  font-size: 0.98rem;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.01em;
  color: #1a1a2e;
}
.rac-onboarding-overlay .rac-body-heading[hidden] { display: none; }
.rac-onboarding-overlay .rac-transcript {
  /* GROW with messages, don't reserve an empty box: no flex-grow, no min-height.
     The card shrinks to fit 0-1 turns and only scrolls past the max-height cap.
     min-height:0 lets this flex child actually shrink below its content so the
     sticky footer is never pushed out of the (overflow:hidden) card. */
  flex: 0 1 auto;
  min-height: 0;
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

/* ── O.13.d — sticky bottom action bar (prominent primary CTA) ───────────────
   The advance action used to be a small chip at the TOP next to Cancel — the
   founder couldn't tell what to click to proceed. The CTA now lives in a pinned
   bottom bar: full-bleed prominent purple primary + a de-emphasised ghost
   Cancel. 'flex: 0 0 auto' keeps it pinned below the scrollable transcript. */
.rac-onboarding-overlay .rac-footer {
  /* O.13.e — pinned bottom action bar. flex:0 0 auto keeps it out of the
     scroll-shrink, and position:sticky + bottom:0 guarantees the primary CTA
     is ALWAYS visible at the panel bottom (never below the fold) even as the
     transcript/brief middle scrolls. */
  flex: 0 0 auto;
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.65rem 0.85rem 0.7rem;
  border-top: 1px solid rgba(102, 0, 255, 0.10);
  background: rgba(250, 250, 252, 0.92);
}
.rac-onboarding-overlay .rac-footer[hidden] { display: none; }
.rac-onboarding-overlay .rac-footer-cancel {
  flex: 0 0 auto;
  padding: 0.6rem 0.85rem;
  border-radius: 10px;
  border: 1px solid rgba(102, 0, 255, 0.22);
  background: transparent;
  color: #6600ff;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.rac-onboarding-overlay .rac-footer-cancel:hover {
  border-color: #6600ff;
  background: rgba(102, 0, 255, 0.06);
}
.rac-onboarding-overlay .rac-footer-primary {
  flex: 1 1 auto;
  padding: 0.7rem 1rem;
  border-radius: 10px;
  border: none;
  background: #6600ff;
  color: #fff;
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  cursor: pointer;
  box-shadow: 0 2px 12px rgba(102, 0, 255, 0.28);
}
.rac-onboarding-overlay .rac-footer-primary:hover { background: #5500dd; }
.rac-onboarding-overlay .rac-footer-primary:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.3);
}

/* ── O.12.b — DYNAMIC TYPOLOGY-BRIEF controls (rac-brief-*) ─────────────────────
   The RAC brief step renders the typology-declared briefSchema as compact,
   on-brand controls (sliders / steppers / segmented selects / chips / switches /
   text). Scoped under .rac-onboarding-overlay so it inherits the glass card +
   #6600FF accents. White + purple only (founder rule: NO black). */
.rac-onboarding-overlay .rac-brief {
  /* O.13.e — the brief form is part of the SCROLLABLE middle: it shrinks
     (flex:1 1 auto + min-height:0) and scrolls internally past the cap so
     the sticky footer CTA below it stays visible (never pushed off the bottom). */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  padding: 0.2rem 0.85rem 0.5rem;
}
.rac-onboarding-overlay .rac-brief[hidden] { display: none; }
.rac-onboarding-overlay .rac-brief-form {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
}
.rac-onboarding-overlay .rac-brief-row {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.rac-onboarding-overlay .rac-brief-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.6rem;
}
.rac-onboarding-overlay .rac-brief-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: #1a1a2e;
}
.rac-onboarding-overlay .rac-brief-value {
  font-size: 0.82rem;
  font-weight: 700;
  color: #6600ff;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
/* range → slider, purple accent. */
.rac-onboarding-overlay .rac-brief-range {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 999px;
  background: rgba(102, 0, 255, 0.16);
  outline: none;
  cursor: pointer;
  accent-color: #6600ff;
}
.rac-onboarding-overlay .rac-brief-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #6600ff;
  border: 2px solid #fff;
  box-shadow: 0 1px 4px rgba(60, 20, 120, 0.3);
  cursor: pointer;
}
.rac-onboarding-overlay .rac-brief-range::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #6600ff;
  border: 2px solid #fff;
  cursor: pointer;
}
.rac-onboarding-overlay .rac-brief-range:focus-visible {
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.22);
}
/* stepper → −/＋ buttons. */
.rac-onboarding-overlay .rac-brief-stepper {
  display: inline-flex;
  align-self: flex-start;
  gap: 0.3rem;
}
.rac-onboarding-overlay .rac-brief-step-btn {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  border: 1px solid rgba(102, 0, 255, 0.28);
  background: rgba(102, 0, 255, 0.06);
  color: #6600ff;
  font-size: 1.1rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
}
.rac-onboarding-overlay .rac-brief-step-btn:hover {
  border-color: #6600ff;
  background: rgba(102, 0, 255, 0.12);
}
.rac-onboarding-overlay .rac-brief-step-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
/* select / multiselect → segmented buttons + chips. */
.rac-onboarding-overlay .rac-brief-segments {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.rac-onboarding-overlay .rac-brief-segment {
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  border: 1px solid rgba(102, 0, 255, 0.22);
  background: rgba(102, 0, 255, 0.04);
  color: #6600ff;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.rac-onboarding-overlay .rac-brief-segment:hover {
  border-color: #6600ff;
  background: rgba(102, 0, 255, 0.1);
}
.rac-onboarding-overlay .rac-brief-segment--on {
  background: #6600ff;
  border-color: #6600ff;
  color: #fff;
}
/* toggle → switch. */
.rac-onboarding-overlay .rac-brief-switch {
  position: relative;
  width: 40px;
  height: 22px;
  border-radius: 999px;
  border: none;
  align-self: flex-start;
  background: rgba(102, 0, 255, 0.18);
  cursor: pointer;
  transition: background 0.15s ease;
  padding: 0;
}
.rac-onboarding-overlay .rac-brief-switch--on { background: #6600ff; }
.rac-onboarding-overlay .rac-brief-switch-knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(60, 20, 120, 0.3);
  transition: transform 0.15s ease;
}
.rac-onboarding-overlay .rac-brief-switch--on .rac-brief-switch-knob {
  transform: translateX(18px);
}
.rac-onboarding-overlay .rac-brief-switch:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.22);
}
/* text → free-text input. */
.rac-onboarding-overlay .rac-brief-text {
  width: 100%;
  box-sizing: border-box;
  padding: 0.5rem 0.7rem;
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.12);
  background: rgba(255, 255, 255, 0.85);
  color: #111;
  font-size: 0.85rem;
}
.rac-onboarding-overlay .rac-brief-text:focus-visible {
  outline: none;
  border-color: #6600ff;
  background: #fff;
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.18);
}

/* ── O.2 — Onboarding STEP CONTROLLER overlay (os-*) ───────────────────────────
   The guided location → draw-or-skip → generate flow. Same frosted-glass card +
   #6600FF accents, content-sized (no min-heights), draggable + resizable.

   §UX1-ONBOARDING-CARD-HALVED (founder 2026-08-19: "the middle panel should be
   50% smaller, following the UI/UX contract").

   TWO changes, and the second is the one that matters architecturally.

   1. THE ARITHMETIC, stated so "50% smaller" is a measurement and not a mood.
      Read as FOOTPRINT (area), which is what a panel occupying the middle of the
      canvas actually costs the user:
        · width   min(400px, 92vw) → min(288px, 92vw)   — 0.72× linear
        · type + padding                                 — ~0.72× linear
        · area                            0.72 × 0.72   = 0.52 ≈ HALF
      Taking it as 50% of WIDTH instead (400 → 200px) would put the location
      input and the two footer buttons below usable size and breach C43's 24px
      target floor — so the honest halving is of area, and it is written down
      here rather than left for the next reader to re-derive.

   2. ⭐ rem → px, because the density lever was BLIND to this card. §UI-DENSITY-
      SCALE ('styles/uiScale.ts') is the declared single authority for chrome
      density, and its transform matches PX LITERALS ONLY (a number followed by
      the two characters p and x). Every padding, gap and font-size in this
      block was authored in 'rem', so
      'UI_SCALE = 0.85' scaled the card's WIDTH (a px literal) and nothing else:
      a 340px-wide card wearing full-size 0.95rem/0.82rem type. That mismatch IS
      the "oversized" the founder is seeing, and it is the same defect class as
      L-1022 (the floating panels' inline styles) arriving by a different route.
      Converting these to px puts the card under the one density authority, so
      the values below are AUTHORED sizes and the effective size is value × 0.85.
      The 'vh'/'vw' clamps are deliberately left alone — they measure the real
      viewport and must not drift. */
/* §UX1-DRAW-PHASE-GATE — the UA stylesheet's [hidden] display:none is LOWER precedence
   than this block's own display:flex, so setting the hidden ATTRIBUTE would change
   nothing on screen. Author it here, or the gate is decorative. */
.os-onboarding-overlay[hidden] { display: none !important; }
.os-onboarding-overlay {
  position: fixed;
  /* §PANEL-SIZE-FIX (2026-06-03): transform-centre, not inset:0 + margin:auto —
     see the .rac-onboarding-overlay note. Keeps height:auto = content from first paint. */
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  /* PRYZM-EARTH-ONBOARDING PRD Phase 2 (2026-08-06) — founder live-traced bug:
     for the guided (auto-created project) path, runtime.persistence.openProject
     lazy-boots the FULL BIM engine (walls/slabs/stairs/furniture/37 stores,
     DefaultViewsManager default views) synchronously ahead of the
     pryzm-project-loaded event this step-flow's mount waits on
     (briefBootstrap.ts). The engine's own body-mounted chrome (toolbars, floating
     panels — see PlatformRouter.ts's §BACK-TO-PROJECT note, which independently
     found the same class of chrome reaching z-index 2147483000) was rendering
     ABOVE this overlay's old z-index of 1250 during that gap, so the user briefly
     saw the empty workspace before this overlay (mounted correctly, just buried)
     became visible. Raised to the SAME "above all editor chrome" value already
     established for exactly this problem elsewhere in the platform layer, so the
     location/globe step is guaranteed on top and opaque for its full life, with
     no change to engine-boot timing/sequencing (a materially bigger, riskier fix
     that was deliberately NOT attempted this pass — see PRD §14). */
  z-index: 2147483000;
  display: flex;
  flex-direction: column;
  /* §UX1-ONBOARDING-HEADER-ROOT — 264 x 0.85 = 224px of content, the SAME
     measured width the confirm card settled on, so steps 1-4 are one card that
     changes contents rather than four cards that change size. */
  width: min(264px, 92vw);
  height: auto;
  max-height: min(56vh, 440px);
  /* §UX1-CONFIRM-GLASS — the ONE panel surface, and 0.88 was under its floor.
     A white surface at alpha 0.88 composites to 224 over a dark globe, which puts
     --app-text-2 body copy at 4.2:1 — below AA. 0.92 is the solved minimum (see
     the §UX1-CONFIRM-GLASS block below for the derivation); using the token here
     means the location/draw/confirm cards cannot drift apart again. */
  background: var(--app-panel-glass);
  backdrop-filter: var(--app-panel-glass-blur);
  -webkit-backdrop-filter: var(--app-panel-glass-blur);
  color: var(--app-text);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  /* §PANEL-BACKDROP-UNIFY — shared scrim (the 100vmax spread) via the one token. */
  box-shadow: 0 20px 50px rgba(60, 20, 120, 0.20), 0 2px 10px rgba(0, 0, 0, 0.06), 0 0 0 100vmax var(--pryzm-panel-backdrop);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow: hidden;
}
/* §UX1-ONBOARDING-HEADER-ROOT (founder 2026-08-19 — TWO screenshots, ONE block).
   Symptom A, the LOCATION step: "Set up your project" wrapped onto three lines
   and the step badge sat inside the wrap, reading as a second bordered box
   overlapping the header. Symptom B, the DRAW banner over the loading screen:
   the title and the badge render GHOSTED, near-invisible, while the body copy
   below them is legible.

   They are two mechanisms in this ONE block, and both are the same mistake —
   the header was written against conditions that have since changed underneath
   it, and nothing re-derived it.

     A. rem vs the density lever. §UI-DENSITY-SCALE ('styles/uiScale.ts') matches
        PX LITERALS ONLY. The card's width IS a px literal, so
        §UX1-ONBOARDING-CARD-HALVED's 288px became 244.8 real px — but the title
        stayed at 0.95rem (15.2px) and the padding/gap at 0.6rem, i.e. full-size
        type inside a card that had halved. Measured in a browser before the fix:
        title box 70.5 x 60 px (THREE lines), header 79.2 px tall. A 15.2px/800
        "Set up your project" (~145px) beside a 135.9px white-space:nowrap badge
        needs ~290px of a 206px content box. It cannot fit, and it never could.

     B. #ffffff assumed a purple bar. The --drawing presentation repaints the
        header rgba(255,255,255,...) at higher specificity; .os-title and
        .os-step-chip were #ffffff for the gradient that is no longer under them,
        so the banner renders white-on-white at ~1.1:1.

   ONE decision fixes both: the header stops carrying its own surface. It is
   transparent over the card's glass, separated by a hairline; its type is the
   chrome scale in PX so the density lever governs it; its colour is --app-text;
   and the purple survives as the badge's fill — the accent used once. That is
   the same idiom §UX1-CONFIRM-GLASS gave step 3, so all four steps are now one
   panel vocabulary rather than two (C84 EI-8/EI-9).

   The title also gains min-width:0 + ellipsis. A flex item defaults to
   min-width:auto and REFUSES to shrink below its content, which is the property
   that turned "too wide" into "wrapped and overlapping" instead of a clean
   truncation. With this, a longer title or a wider badge degrades legibly at any
   card width rather than re-creating symptom A. */
.os-onboarding-overlay .os-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  padding: 4px 8px;
  background: transparent;
  border-bottom: 1px solid var(--app-border);
  cursor: move; /* draggable by the header (makeDraggable) */
  user-select: none;
}
.os-onboarding-overlay .os-title {
  margin: 0;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
/* 8.5px / 0.02em is what lets the longest badge ("STEP 1 OF 4 · LOCATION") and
   the full title co-exist on one line at the 224px content width — measured, not
   guessed; at 9px / 0.03em the title ellipsised to "Set up your pro...". */
.os-onboarding-overlay .os-step-chip {
  flex: 0 0 auto;
  font-size: 8.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--app-accent);
  color: var(--app-panel-bg);
  border: 1px solid var(--app-accent);
  white-space: nowrap;
}
.os-onboarding-overlay .os-body {
  /* §RESI-MODAL-SCROLL (founder 2026-06-24: "top info not accessible") — in a flex column the
     body must be allowed to SHRINK below its content size (min-height:0) so it scrolls INTERNALLY
     instead of overflowing the overlay (which clips it via overflow:hidden, hiding the top rows). */
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 7px 8px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.os-onboarding-overlay .os-prompt {
  margin: 0;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: var(--app-text);
}
.os-onboarding-overlay .os-hint {
  margin: 0;
  font-size: 11.5px;
  /* Was rgba(20, 10, 40, 0.58) — a WASH, and a wash cannot be measured until you
     know what is under it. Composited on the 0.92 glass over a dark globe it
     reads 4.46:1, i.e. it fails AA on exactly the backdrop the location step
     always has. --app-text-2 is 4.59:1 there and 5.48:1 on white. */
  color: var(--app-text-2);
  line-height: 1.4;
}
/* §TYPOLOGY-CHOICE-AT-CONFIRM — the confirm step's "what do you want to build?"
   chooser, plus the two advisory registers. The advisory colours are deliberately
   DIFFERENT so "we haven't resolved zoning" (muted, informational) can never be
   mistaken for "zoning records a conflicting use" (amber, a real finding) — the
   two answers must not look alike.
   §CONFIRM-PANEL-UX — every colour below now comes from the ONE injected token
   layer (src/ui/styles/tokens.ts, whose --app-accent is the canonical #6600FF
   that @pryzm/a11y-tokens registers as pryzm-purple). No literals here: C51
   §2.1.4 exists because a second surface once shipped its own purple. */
.os-onboarding-overlay .os-typology-choices {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-bottom: 2px;
}
.os-onboarding-overlay .os-typology-choices__row {
  /* Fixed 2-up grid rather than a wrapping flex row: with four options a flex row
     re-flows into 4/3+1/2+2 depending on label width, so the card's height changed
     as the user clicked. A grid keeps the panel's height CONSTANT across choices —
     part of "smaller", since the layout no longer has to reserve the tallest case. */
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}
.os-onboarding-overlay .os-typology-choice {
  padding: 6px 8px;
  border: 1px solid var(--app-text-muted);
  border-radius: var(--app-radius-sm);
  background: var(--app-panel-bg);
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--app-text);
  text-align: center;
  transition: border-color 120ms ease, color 120ms ease, background 120ms ease;
}
.os-onboarding-overlay .os-typology-choice:hover {
  border-color: var(--app-accent);
  color: var(--app-accent);
}
.os-onboarding-overlay .os-typology-choice--selected {
  border-color: var(--app-accent);
  background: var(--app-violet-soft);
  color: var(--app-accent);
  box-shadow: inset 0 0 0 1px var(--app-accent);
}
.os-onboarding-overlay .os-typology-choice:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
/* The chooser's micro-heading — the same uppercase section label the office
   analytics card (.ob-section-title) and the residential views rail already use,
   so the chooser reads as product chrome rather than as modal copy. */
.os-onboarding-overlay .os-section-label {
  margin: 0;
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--app-accent);
}
.os-onboarding-overlay .os-hint--muted {
  /* Measured 5.48:1 on the confirm card's opaque white — AA at this size. The old
     rgba(20,10,40,0.45) wash measured 3.0:1 and FAILED, which mattered most for the
     "we haven't resolved zoning" line: the least certain statement was the least
     legible one. Italic (not a lighter colour) still carries the softer register. */
  color: var(--app-text-2);
  font-style: italic;
}
.os-onboarding-overlay .os-hint--warn {
  color: var(--vg-badge-warn-color);
  font-weight: 600;
}
.os-onboarding-overlay .os-status {
  margin: 2px 0 0;
  font-size: 11px;
  font-weight: 600;
  color: var(--app-accent);
}
.os-onboarding-overlay .os-input-row {
  display: flex;
  gap: 5px;
  margin-top: 3px;
}
/* "Find location" wrapped to two lines once the card halved, for the same
   flex reason as the title: the button is a flex item and the input's
   min-width:auto would not yield. Pin the button, let the input give. */
.os-onboarding-overlay .os-input-row .os-btn { white-space: nowrap; flex: 0 0 auto; }
/* ⚠ §UX1-COMMENT-EATS-THE-CLAMP — READ BEFORE MOVING A COMMENT INTO A BLOCK.
   uiScale's scanner treats a comment as OPAQUE but does NOT flush the pending
   segment when it meets one, so a comment sitting between declarations is glued
   onto the NEXT declaration. scaleDeclaration then takes everything before the
   first ':' as the property name — which is now "<the whole comment> min-height"
   — so the declaration matches neither BOX_SIZE_PROPS nor the font-size test and
   BOTH C43 clamps are skipped. Measured in the emitted sheet: this exact shape
   was emitting 'min-height: 23.8px' on .os-input and .os-btn, i.e. UNDER the
   24px SC 2.5.8 floor, and a comment containing a colon (a contrast ratio! e.g.
   "4.5:1") additionally re-scaled every px in its own text.
   The previous pass's comment on .os-input asserted the clamp was working. The
   comment WAS the reason it was not. Explanatory comments therefore live ABOVE
   the selector, never between declarations. */
/* C43 / WCAG 2.2 AA SC 2.5.8 — an explicit min-height so the density lever
   cannot push this control under the 24px target floor. uiScale clamps
   'min-height' on the way down (28 × 0.85 = 23.8 → 24); padding is NOT clamped,
   which is how a density pass silently breaches the floor. Same on '.os-btn'. */
.os-onboarding-overlay .os-input {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 28px;
  padding: 6px 9px;
  border-radius: var(--app-radius-sm);
  border: 1px solid var(--app-border);
  background: var(--app-panel-bg);
  color: var(--app-text);
  font-size: 11.5px;
}
.os-onboarding-overlay .os-input:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 1px;
  border-color: var(--app-accent);
  background: var(--app-panel-bg);
}
/* 28 × 0.85 = 23.8, clamped back to the 24px SC 2.5.8 floor by uiScale. Padding
   is NOT clamped, so this min-height is what keeps the floor true. */
.os-onboarding-overlay .os-btn {
  min-height: 28px;
  padding: 6px 10px;
  border-radius: var(--app-radius-sm);
  border: none;
  font-weight: 700;
  font-size: 11px;
  line-height: 1.2;
  cursor: pointer;
}
.os-onboarding-overlay .os-btn--primary { background: var(--app-accent); color: var(--app-panel-bg); }
.os-onboarding-overlay .os-btn--primary:hover { background: var(--app-violet-2); }
.os-onboarding-overlay .os-btn--primary:disabled { opacity: 0.45; cursor: default; }
.os-onboarding-overlay .os-btn--ghost {
  background: transparent;
  color: var(--app-accent);
  border: 1px solid var(--app-violet-soft);
}
.os-onboarding-overlay .os-btn--ghost:hover { border-color: var(--app-accent); background: var(--app-violet-soft); }
.os-onboarding-overlay .os-btn:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.os-onboarding-overlay .os-choices {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 3px;
}
/* rem -> px for the same reason as the header: these were invisible to the
   density lever, so the plot-choice cards stayed full size inside a card that
   had halved. The 0.52-alpha description wash is replaced by --app-text-2 for
   the same reason as .os-hint — a wash cannot be measured. */
.os-onboarding-overlay .os-choice {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
  padding: 7px 9px;
  min-height: 28px;
  border-radius: var(--app-radius-sm);
  border: 1px solid var(--app-text-2);
  background: transparent;
  color: var(--app-text);
  cursor: pointer;
}
.os-onboarding-overlay .os-choice:hover {
  border-color: var(--app-accent);
  background: var(--app-violet-soft);
}
.os-onboarding-overlay .os-choice:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.os-onboarding-overlay .os-choice-title { font-size: 11.5px; font-weight: 700; color: var(--app-text); }
.os-onboarding-overlay .os-choice-desc { font-size: 11px; color: var(--app-text-2); line-height: 1.35; }
.os-onboarding-overlay .os-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-start;
  margin-top: 3px;
}
/* SS FIX-DRAW-BANNER-OVERFLOW -- the hidden attribute MUST WIN over the rule
   above. The UA stylesheet rule for [hidden] is specificity (0,1,0); the rule
   above is (0,2,0), so setting .hidden = true on ANY .os-footer sets the
   attribute and changes NOTHING. The draw banner has TWO .os-footer children
   (the Back/Skip row and the surface-lost row) that are meant to be mutually
   exclusive -- so BOTH rendered at once, in a row-direction body, and the hint
   column was squeezed to its longest word ("double-" / "click or" on their own
   lines) while the lost-message overflowed the card onto the map.
   The .rac- ancestor of this sheet had .rac-footer[hidden] (~line 246); the
   .os- port dropped it, and UX1-DRAW-PHASE-GATE (~line 495) already records the
   identical precedence bug for the overlay ROOT. Same fix, same reason, applied
   to the sibling it was never applied to. */
.os-onboarding-overlay .os-footer[hidden] { display: none; }

/* ── §WHERE-IS-YOUR-PROJECT — the LOCATION step's own presentation (L-13057 item 3) ──────────
   Founder 2026-09-07: "MAKE THIS PANEL A BIT MORE MODERN, MORE 'REACT' TYPE — SEMI TRANSPARENT
   — MOSTLY BLACK AND WHITE — JUST ONE OR TWO TOUCHES OF PURPLE PRYZM … MODERN BUT ELEGANT."

   ⚠ THIS BLOCK IS IN TENSION WITH THE STANDING BRAND NOTE "white + purple, NO black", AND THE
   TENSION IS RESOLVED BY SCOPE, NOT BY GENERALISING. The founder's instruction is newer and more
   specific, and it governs HERE for a reason that is site-specific and worth writing down: this
   card — alone in the product — floats over the globe's BLACK STARFIELD. A white glass surface on
   that backdrop is the brightest object on screen and reads as a dialog interrupting the globe; a
   dark translucent one reads as part of it. Every other onboarding surface (the drawing banner,
   the confirm card, the typology chooser, the resi/office panels) sits over the WHITE app chrome
   and keeps the standing white glass.

   ⛔ THE SCOPING IS THE SAFETY, AND IT IS ENFORCED IN TWO PLACES. Every rule below is prefixed
   with .os-onboarding-overlay--location, a class that is added by renderLocationStep() and
   REMOVED by clearBody() — i.e. by the one function every other step render calls before it
   builds anything. There is no path on which a later step inherits this. Do not lift any of these
   declarations out of this block, and do not add the class to another surface.

   THE PALETTE IS ONE TOKEN OVERRIDE, NOT A SECOND STYLESHEET. The card's descendants already read
   --app-text / --app-border / --app-panel-bg etc., so re-pointing those variables on this one
   element flips the whole card and leaves the rest of the sheet untouched. Purple appears TWICE
   and only twice, as instructed: the submit control, and the focus ring. */
.os-onboarding-overlay.os-onboarding-overlay--location {
  --app-panel-glass: rgba(10, 11, 16, 0.58);
  --app-panel-glass-blur: blur(26px) saturate(1.2);
  --app-text: #ffffff;
  --app-text-2: rgba(255, 255, 255, 0.66);
  --app-text-muted: rgba(255, 255, 255, 0.28);
  --app-border: rgba(255, 255, 255, 0.12);
  --app-panel-bg: rgba(255, 255, 255, 0.06);
  --app-violet-soft: rgba(102, 0, 255, 0.22);
  width: min(376px, 94vw);
  border-radius: 18px;
  color: var(--app-text);
}
/* The 100vmax scrim is deliberately NOT inherited here. It exists to hold attention on a card
   over a busy app; on this step the thing behind the card is the globe the user is being asked
   to fly, and dimming the whole planet both fights the "semi transparent" instruction and hides
   the drag affordance the copy now points at. Shadow only — no wash. */
.os-onboarding-overlay.os-onboarding-overlay--location {
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.55), 0 1px 0 0 rgba(255, 255, 255, 0.06) inset;
}
/* THE TEXT THE FOUNDER REMOVED. The nodes stay so the header remains the drag handle and the
   step model is unchanged — only this step hides them. */
.os-onboarding-overlay.os-onboarding-overlay--location .os-title,
.os-onboarding-overlay.os-onboarding-overlay--location .os-step-chip {
  display: none;
}
/* What is left of the header is a grab strip: no border, no label, a 2px hairline handle that
   says "draggable" without saying anything. */
.os-onboarding-overlay.os-onboarding-overlay--location .os-header {
  justify-content: center;
  padding: 9px 10px 3px;
  border-bottom: none;
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-header::after {
  content: '';
  width: 26px;
  height: 2px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.16);
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-body {
  padding: 6px 20px 20px;
  gap: 12px;
}
/* THE ONE LINE. Generous, quiet, and the only type on the card that carries weight. */
.os-onboarding-overlay.os-onboarding-overlay--location .os-prompt--hero {
  font-size: 21px;
  font-weight: 600;
  letter-spacing: -0.015em;
  line-height: 1.25;
  color: var(--app-text);
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-input-row--hero {
  gap: 8px;
  margin-top: 0;
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-input {
  min-height: 42px;
  padding: 10px 14px;
  border-radius: 11px;
  border: 1px solid var(--app-border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--app-text);
  font-size: 13px;
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-input::placeholder {
  color: rgba(255, 255, 255, 0.4);
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-input:focus-visible {
  outline: none;
  border-color: var(--app-accent);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: 0 0 0 3px rgba(102, 0, 255, 0.35);
}
/* PURPLE, USE 1 OF 2 — the submit control. A square glyph button, not a labelled one. */
.os-onboarding-overlay.os-onboarding-overlay--location .os-btn--go {
  min-height: 42px;
  width: 42px;
  padding: 0;
  border-radius: 11px;
  background: var(--app-accent);
  color: #ffffff;
  font-size: 16px;
  font-weight: 600;
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-btn--go:hover {
  background: var(--app-accent-hover);
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-btn--go:disabled {
  opacity: 0.45;
  cursor: default;
}
/* The globe-drag signpost — six words, at hint weight, deliberately below the field it is an
   alternative to. This is the ONLY statement in the product that the globe behind the card is
   live; see the note at its construction site in OnboardingStepController. */
.os-onboarding-overlay.os-onboarding-overlay--location .os-hint--affordance {
  margin: -4px 0 0;
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.005em;
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-status {
  color: rgba(255, 255, 255, 0.82);
  font-weight: 500;
  font-size: 11.5px;
  line-height: 1.45;
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-btn--ghost {
  background: transparent;
  color: rgba(255, 255, 255, 0.62);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 9px;
  font-weight: 500;
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-btn--ghost:hover {
  color: #ffffff;
  border-color: rgba(255, 255, 255, 0.34);
  background: rgba(255, 255, 255, 0.06);
}
/* PURPLE, USE 2 OF 2 — the focus ring, so keyboard users get the accent where it matters most. */
.os-onboarding-overlay.os-onboarding-overlay--location .os-btn:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-footer {
  margin-top: 0;
}
.os-onboarding-overlay.os-onboarding-overlay--location .os-footer--alt-reading {
  margin-top: -4px;
}
/* The resize grip is chrome the founder did not ask to see on a card this quiet. The panel is
   still resizable — the grip's hit area is unchanged, only its paint. */
.os-onboarding-overlay.os-onboarding-overlay--location .os-resize-grip {
  opacity: 0.18;
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
  /* The base .os-onboarding-overlay centres via transform: translate(-50%,-50%).
     This docked full-width banner MUST cancel it — otherwise the 100vw element is
     shifted 50vw left (+ up), pushing the "Generate?" card off-screen to the left. */
  transform: none;
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
  width: min(420px, 94vw);
  /* §UX1-ONBOARDING-HEADER-ROOT — this rule is symptom B's mechanism: it repaints
     the header at (0,3,0), so the old #ffffff title/badge became white-on-white
     the moment the banner appeared. The colours are fixed at their source (the
     base .os-title / .os-step-chip); the surface here just joins the ONE glass so
     the banner and the cards are the same material at the same measured alpha. */
  background: var(--app-panel-glass);
  backdrop-filter: var(--app-panel-glass-blur);
  -webkit-backdrop-filter: var(--app-panel-glass-blur);
  border: 1px solid var(--app-border);
}
/* rem -> px throughout this presentation, the other half of
   §UX1-ONBOARDING-HEADER-ROOT symptom A: 0.85rem stayed 13.6px while the card's
   px widths halved, so the banner's header was 13.6px-padded around 6.8px-padded
   content and rendered WIDER than its own body (measured: header 253.6px vs body
   241.7px on the confirm card — a visible mis-registration at the seam). */
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-header {
  border-radius: var(--app-radius-md) var(--app-radius-md) 0 0;
  padding: 4px 8px;
  box-shadow: none;
  cursor: default; /* docked banner is not draggable */
}
/* The banner title is the base .os-title — no second size. The old 0.86rem
   override was rem, i.e. invisible to the density lever, which is half of
   §UX1-ONBOARDING-HEADER-ROOT symptom A. */
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-body {
  flex: 0 0 auto;
  overflow: visible;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 7px;
  padding: 7px 8px 8px;
  border-top: none;
  border-radius: 0 0 var(--app-radius-md) var(--app-radius-md);
  box-shadow: var(--app-shadow-panel);
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-draw-instruction {
  flex: 1 1 auto;
  margin: 0;
  color: var(--app-text-2);
  font-size: 11px;
  /* SS FIX-DRAW-BANNER-OVERFLOW -- the hint is now short enough to sit on ONE
     line inside the banner, so pin it there. The old value (normal) is what let
     a flex sibling squeeze this column to its own min-content width, i.e. its
     longest word, and render one word per line. Kept ALONGSIDE the hidden-attr
     fix, not instead of it: that one removes the squeezing sibling, this one
     stops the column collapsing if another ever appears. */
  white-space: nowrap;
}
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-footer {
  flex: 0 0 auto;
  margin: 0;
}
/* The resize grip is meaningless on the docked banner — hide it while drawing. */
.os-onboarding-overlay.os-onboarding-overlay--drawing .os-resize-grip { display: none; }

/* ── O.7.1 — GENERATE-CONFIRM step (non-blocking, keeps boundary visible) ───────
   Reuses the non-blocking drawing presentation but restores a vertical
   title + subtext + two-button layout via --confirm.

   §CONFIRM-PANEL-UX (founder 2026-08-07: "make this panel smaller — more aligned
   with the contractual UI/UX")
   ---------------------------------------------------------------------------
   The card inherited the DRAW banner's 560px width and the onboarding modal's own
   type scale (0.95-0.98rem headings, 0.85rem buttons). That is 30-50% larger than
   everything it now sits beside — the Site analysis card titles at 700 12px, the
   launcher pills at 600 12px, the basemap segmented control at 12px. Two panels
   using two type scales is what reads as "a different design language", so this
   block does not invent a style: it adopts the measurements those neighbours use.

     surface     --app-panel-bg, 1px --app-border, --app-radius-md (12px),
                 --app-shadow-panel  ->  byte-for-byte the Site analysis card.
     width       min(360px, 92vw)     (was 560px)
     type        12px/700 title · 11px body · 11px controls
     controls    --app-radius-sm, 6-7px x 10-12px padding (the pill / segment box)

   §UX1-CONFIRM-GLASS (founder 2026-08-19: "make this panel HALF SIZE — smaller.
   SEMI-TRANSPARENT. More ELEGANT, more TECH. Still aligned with the contracts
   for UI/UX.")
   ---------------------------------------------------------------------------
   All three asks are bounded by numbers the contracts already fix, so each one
   below is a SOLVE and not a preference. Everything is authored in px because
   §UI-DENSITY-SCALE ('styles/uiScale.ts') matches px literals only; effective
   size is the authored value x UI_SCALE (0.85), with two clamps that bite here —
   MIN_TARGET_PX 24 (C43 / WCAG 2.2 SC 2.5.8) and MIN_FONT_PX 10.

   1. SEMI-TRANSPARENT — alpha 0.92 is SOLVED, not chosen, and it REVERSES the
      opaque decision this block used to carry rather than ignoring it.
      That decision was right about the risk and wrong about the only remedy: the
      old rgba(255,255,255,0.74) card put body copy at 3.73:1 over a dark basemap
      because nothing pinned the composite. Pin it instead. A translucent white
      surface over the WORST-CASE backdrop (black) composites to alpha x 255, so
      the floor is solvable in closed form. For 4.5:1 against the weakest
      foreground the card carries — --app-text-2 #5a6a85 (relative luminance
      0.1418) and --vg-badge-warn-color #856404 (0.1412) —

          need L_bg >= 4.5 x (0.1418 + 0.05) - 0.05 = 0.8131
          -> sRGB channel  (0.8131 ^ (1/2.4)) x 1.055 - 0.055 = 0.9128
          -> alpha         >= 0.913 over black.

      0.92 is that floor plus headroom, and it is the reason the value is a TOKEN
      (--app-panel-glass): a second surface must not re-guess it. The pairs below
      are SAMPLED FROM RENDERED PIXELS, not derived from the tokens — the card was
      screenshotted over a solid-black scene, the composite surface read back
      (235,235,235 = the predicted 0.92 x 255) and each foreground taken as the
      darkest ink inside its own box. Over BLACK, the pessimal case:
        body --app-text-2 4.59:1 · advisory-warn 4.59:1 · advisory-muted 4.78:1
        · prompt --app-text 13.53:1 · title --app-text 13.69:1 · section label +
        ghost labels --app-accent 5.85:1 · accent on --app-violet-soft (selected
        chip) 5.05:1 · white on --app-accent (CTA + step chip, both opaque fills)
        6.98:1 · resting chip border --app-text-2 4.59:1 (WCAG 1.4.11 needs 3:1).
      Over WHITE the same pairs read 5.48 / 5.48 / 5.70 / 16.13 / 16.32 / 6.98 /
      6.03 / 6.98 / 5.48 — every one AA at both extremes of the basemap.
      The resting chip border moved from --app-text-muted to --app-text-2 for
      exactly this reason: --app-text-muted measures 3.47:1 on opaque white but
      2.90:1 on the glass — it would have crossed the 1.4.11 non-text floor the
      moment the surface went translucent.
      Two escapes, because translucency without blur is worse than opacity:
      @supports (no backdrop-filter) and prefers-reduced-transparency both put the
      opaque --app-panel-bg back.

   2. HALF SIZE — the honest answer is 0.68 of the footprint, MEASURED, and the
      remaining 0.18 is not available without deleting content.
      Read as area, the way the previous halving (§UX1-ONBOARDING-CARD-HALVED) was
      read. Rendered in a browser at UI_SCALE 0.85 (Playwright, 1440x900):
          before  328.4 x 236.7 = 77.7k px^2
          after   241.7 x 218.3 = 52.8k px^2   = 0.68x  (-32% area, -26% width)
      Why not 0.50. A width sweep across 306/280/260/240/224/210/196/184 px of
      content shows the area is CONTENT-bound, not width-bound: it falls to ~61k
      at 224 and then goes back UP, because below ~260 the "Not now — I'll design
      it myself" exit wraps to two lines (+12 px) and below ~210 the "Residential
      building" chip wraps as well (+22 px). Narrower stops buying anything at
      224 px of content, which is why that is the width. Everything left is a
      floor: the type is already AT MIN_FONT_PX (11px x 0.85 = 9.35 -> clamped to
      10), so shrinking type is now a NO-OP, and the three button rows plus the
      chip grid are held at 24px by SC 2.5.8. Reaching 0.50 would mean dropping
      the section label, the prompt or an exit — i.e. redesigning the flow, which
      this pass is explicitly not.

   3. PURPLE AS THE ACCENT, NOT THE SURFACE — the header's solid --app-accent bar
      is gone; the header is the same glass as the body with --app-text on it, and
      the purple survives as the step chip, the CTA fill, the selected chip and
      the focus ring. That is the founder's "more elegant, more tech" and it also
      keeps the C43 fix the solid bar was carrying: the --drawing banner repaints
      the header white, and .os-title / .os-step-chip are #ffffff, so white-on-
      white (~1.1:1) is what the solid bar existed to prevent. Recolouring the
      TEXT to --app-text (13.69:1) removes the cause instead of covering it.
      The DRAW banner (step 2) still has that latent bug and is still NOT fixed
      here — different step, reported not absorbed. */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-header,
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-body {
  /* 264 x 0.85 = 224px of content — the measured floor of the width sweep in the
     block comment. The 560px draw banner is a one-line instruction strip and
     keeps its width; only the confirm CARD shrinks. */
  width: min(264px, 92vw);
  border-color: var(--app-border);
  /* ONE glass surface across header + body — see §UX1-CONFIRM-GLASS (1). */
  background: var(--app-panel-glass);
  backdrop-filter: var(--app-panel-glass-blur);
  -webkit-backdrop-filter: var(--app-panel-glass-blur);
}
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-header {
  /* Only the corner radius is confirm-specific. The hairline rule, the type and
     the accent badge all come from the BASE header now (§UX1-ONBOARDING-HEADER-
     ROOT) — one definition, so the four steps cannot drift apart again. */
  border-radius: var(--app-radius-md) var(--app-radius-md) 0 0;
}
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-body {
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 4px;
  padding: 7px 8px 8px;
  border-radius: 0 0 var(--app-radius-md) var(--app-radius-md);
  box-shadow: var(--app-shadow-panel);
}
/* The opaque escapes. Both repeat the full triple-class selector because the glass
   is declared at (0,4,0) and a shorter selector would silently lose to it. */
@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
  .os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-header,
  .os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-body {
    background: var(--app-panel-bg);
  }
}
@media (prefers-reduced-transparency: reduce) {
  .os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-header,
  .os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm .os-body {
    background: var(--app-panel-bg);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
}
/* Title + body copy at the neighbouring panels' scale. .os-prompt / .os-hint keep
   their larger sizes on the location/draw steps — only --confirm is retuned. */
.os-onboarding-overlay--confirm .os-prompt {
  font-size: 12px;
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: 0.01em;
  color: var(--app-text);
}
.os-onboarding-overlay--confirm .os-hint {
  font-size: 11px;
  line-height: 1.4;
  color: var(--app-text-2);
}
/* The chooser at the smaller width. The chip is the only control on the card that
   is sized by padding alone, so it carries an explicit min-height: 28 x 0.85 =
   23.8 is clamped back to 24 by uiScale's MIN_TARGET_PX, which is what keeps SC
   2.5.8 true through any future density change. */
/* ⭐ §CONFIRM-IS-LANDSCAPE (L-6700), founder 2026-08-22: *"make the bottom panel
   more landscape shape"*, pointing at THIS step — the confirm card was running off
   the bottom of his viewport, with the "Generate your apartment with AI" heading
   clipped at the top and the two exit links clipped at the bottom.
   Cause: "width: min(264px, 92vw)" + "max-height: min(56vh, 440px)" is a PORTRAIT
   box, and the confirm step carries the most content of the four — a section
   label, a 2x2 typology grid, an AI blurb, a primary CTA and two exits. A narrow
   column makes that content tall by construction, so it overflowed.

   ⚠ THIS DELIBERATELY DEPARTS FROM §UX1-ONBOARDING-HEADER-ROOT, and the departure
   is recorded rather than made silently. That rule says the width is
   264 = "the SAME measured width the confirm card settled on, so steps 1-4 are ONE
   card that changes contents rather than four cards that change size." That is a
   real design decision and it is why this override is scoped to "--confirm" ONLY:
   steps 1, 2 and 4 keep the shared 264px card and do not move. The founder asked
   for this step specifically, and a card that clips its own primary CTA is a worse
   outcome than four cards of two widths.

   Landscape = wider AND shorter: the typology chips go 4-across on one row instead
   of 2x2, which removes a whole row of height, and the height cap comes down so the
   card cannot grow back into the fold. "92vw"/"94vw" guards keep it inside a narrow
   viewport, where it degrades back to the stacked portrait form below. */
.os-onboarding-overlay--confirm {
  width: min(560px, 94vw);
  max-height: min(46vh, 340px);
}
.os-onboarding-overlay--confirm .os-typology-choices__row {
  /* 4-across on one row — the height this removes is the point of the change. */
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
@media (max-width: 620px) {
  /* Below the landscape width there is no room for four chips; fall back to the
     original 2x2 portrait card rather than shrinking the chips past a tap target
     (SC 2.5.8 — the 28px min-height below is load-bearing). */
  .os-onboarding-overlay--confirm {
    width: min(264px, 92vw);
    max-height: min(56vh, 440px);
  }
  .os-onboarding-overlay--confirm .os-typology-choices__row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.os-onboarding-overlay--confirm .os-section-label { line-height: 1.1; }
.os-onboarding-overlay--confirm .os-typology-choices { gap: 4px; margin-bottom: 0; }
.os-onboarding-overlay--confirm .os-typology-choices__row { gap: 4px; }
.os-onboarding-overlay--confirm .os-typology-choice {
  min-height: 28px;
  padding: 5px 6px;
  /* Transparent so the scene reads through the chooser too; the label sits on the
     card's glass, at the same measured contrast as the body copy. */
  background: transparent;
  border-color: var(--app-text-2);
}
/* Ordered AFTER the resting rule on purpose: both are (0,2,0), so the later one
   wins. The fill is restated for the same reason — the resting rule above sets
   'background: transparent' at equal specificity and later in the sheet, so
   WITHOUT this line the selected chip silently loses its --app-violet-soft tint
   and the selected state falls back to colour-on-border alone. */
.os-onboarding-overlay--confirm .os-typology-choice--selected {
  border-color: var(--app-accent);
  background: var(--app-violet-soft);
}
.os-onboarding-overlay--confirm .os-confirm-actions {
  /* One column: the primary CTA gets its own full-width row, the two exits share
     the row beneath it. The old single wrapping row gave "← Back to drawing",
     "Generate apartment" and "Not now — I'll design it myself" equal visual weight
     at equal width, so the panel had to be wide enough for the longest of them —
     which is most of why it was 560px. Ranking them costs no clarity: all three
     keep their full labels. */
  display: grid;
  grid-template-columns: 1fr;
  gap: 4px;
  margin-top: 0;
}
.os-onboarding-overlay--confirm .os-confirm-exits {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 4px;
}
.os-onboarding-overlay--confirm .os-confirm-actions .os-btn {
  padding: 6px 9px;
  font-size: 11px;
  border-radius: var(--app-radius-sm);
  line-height: 1.2;
}
.os-onboarding-overlay--confirm .os-confirm-actions .os-btn--primary {
  font-size: 11.5px;
  padding: 7px 10px;
  box-shadow: var(--app-shadow-glow);
}
.os-onboarding-overlay--confirm .os-btn--primary:hover { background: var(--app-violet-2); }
/* Visible focus on every control (C43 / WCAG 2.2 2.4.11). outline-offset: 2px
   puts the ring on the card's own surface, never on the button's purple fill,
   so it measures 5.83:1 there — comfortably past the 3:1 non-text threshold. */
.os-onboarding-overlay--confirm .os-btn:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 2px;
}
/* The resize grip is meaningless on this content-sized card. */
.os-onboarding-overlay--confirm .os-resize-grip { display: none; }

/* ── §RESI-MULTIFAMILY (Task 2) residential program panel ─────────────────────── */
.os-onboarding-overlay .os-resi-form {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin-top: 0.4rem;
}
.os-onboarding-overlay .os-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.os-onboarding-overlay .os-field-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: rgba(20, 10, 40, 0.7);
}
/* §RESI-LIVE-SLIDERS — slider row: label on the left, the live value on the right. */
.os-onboarding-overlay .os-field-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.os-onboarding-overlay .os-field-value {
  font-size: 0.85rem;
  font-weight: 700;
  color: #6600ff;
  font-variant-numeric: tabular-nums;
}
.os-onboarding-overlay .os-slider {
  width: 100%;
  accent-color: #6600ff;
  cursor: pointer;
}
/* §RESI-PREVIEW-PRODUCTION (founder 2026-06-24) — the live floor-plan preview pane.
   Brand white + #6600FF, NO black: a card with a faint purple frame, the architectural
   plan on a white sheet, a clear summary line, and a CALM purple over-program note. */
.os-onboarding-overlay .os-resi-preview {
  margin-top: 0.5rem;
  padding: 0.7rem 0.8rem 0.75rem;
  border: 1px solid rgba(102, 0, 255, 0.18);
  border-radius: 0.6rem;
  background: linear-gradient(180deg, #ffffff 0%, rgba(102, 0, 255, 0.04) 100%);
  min-height: 2.4rem;
}
.os-onboarding-overlay .os-resi-preview-plan {
  margin: 0 0 0.5rem;
  padding: 0.5rem;
  background: #ffffff;
  border: 1px solid rgba(102, 0, 255, 0.14);
  border-radius: 0.5rem;
  box-shadow: 0 1px 4px rgba(102, 0, 255, 0.06);
  display: flex;
  justify-content: center;
}
/* §RESI-PREVIEW-SMALLER (founder 2026-06-24) — cap the plan thumbnail so the whole setup
   modal (4 option groups + colour swatches + preview) fits without the top being clipped. */
.os-onboarding-overlay .os-resi-preview-plan svg {
  width: 100%; height: auto; max-height: 190px; display: block;
  shape-rendering: geometricPrecision;
}
.os-onboarding-overlay .os-resi-preview-caption {
  display: flex; align-items: center; justify-content: center; gap: 0.35rem;
  font-size: 0.72rem; font-weight: 600;
  color: #6600ff;
  margin: -0.2rem 0 0.5rem;
  text-align: center;
}
.os-onboarding-overlay .os-resi-preview-caption::before {
  content: ""; width: 0.45rem; height: 0.45rem; border-radius: 999px;
  background: #6600ff; flex: 0 0 auto;
}
/* §RESI-CIRC-GRAPH — the circulation bubble graph panel BELOW the plan (house-modal parity).
   Brand white + #6600FF, soft purple-tinted chrome (NO black). */
.os-onboarding-overlay .os-resi-preview-graph {
  margin: 0 0 0.5rem;
  padding: 0.4rem 0.5rem 0.5rem;
  border: 1px solid rgba(102, 0, 255, 0.14);
  border-radius: 10px;
  background: linear-gradient(180deg, #ffffff 0%, #faf8ff 100%);
}
.os-onboarding-overlay .os-resi-preview-graph-head {
  font-size: 0.7rem; font-weight: 700; color: #6600ff;
  letter-spacing: 0.01em; margin: 0 0 0.3rem; text-align: center;
}
.os-onboarding-overlay .os-resi-preview-graph-svg { display: flex; justify-content: center; }
.os-onboarding-overlay .os-resi-preview-graph-svg svg {
  width: 100%; height: auto; max-height: 200px; display: block;
}
.os-onboarding-overlay .os-resi-preview-head {
  font-size: 0.86rem; font-weight: 500;
  color: #2a1a52;
}
.os-onboarding-overlay .os-resi-preview-head strong { color: #6600ff; font-weight: 700; font-variant-numeric: tabular-nums; }
.os-onboarding-overlay .os-resi-preview-mix {
  display: inline-block;
  font-size: 0.74rem;
  font-weight: 600;
  color: #6b5f8c;
  margin-top: 0.3rem;
  padding: 0.12rem 0.45rem;
  background: rgba(102, 0, 255, 0.07);
  border-radius: 999px;
}
/* Over-program note — calm, helpful, brand purple (NOT alarming red). */
.os-onboarding-overlay .os-resi-preview-warn {
  display: flex; align-items: center; gap: 0.3rem;
  font-size: 0.74rem; color: #6b5f8c; margin-top: 0.35rem;
}
.os-onboarding-overlay .os-resi-preview-warn::before {
  content: "i"; flex: 0 0 auto;
  display: inline-flex; align-items: center; justify-content: center;
  width: 0.9rem; height: 0.9rem; border-radius: 999px;
  font-size: 0.62rem; font-weight: 700; font-style: normal;
  color: #fff; background: #6600ff;
}
.os-onboarding-overlay .os-resi-preview-hint { font-size: 0.8rem; color: rgba(42, 26, 82, 0.55); }
.os-onboarding-overlay .os-typo-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.os-onboarding-overlay .os-typo-chip {
  border: 1px solid rgba(102, 0, 255, 0.3);
  background: #fff;
  color: #4a3a6a;
  border-radius: 999px;
  padding: 0.32rem 0.7rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
}
.os-onboarding-overlay .os-typo-chip:hover { border-color: #6600ff; }
.os-onboarding-overlay .os-typo-chip--on {
  background: #6600ff;
  border-color: #6600ff;
  color: #fff;
}
/* §RESI-PREVIEW-OPTIONS — façade colour swatches (pastel palette). */
.os-onboarding-overlay .os-swatch {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 999px;
  border: 2px solid rgba(102, 0, 255, 0.25);
  padding: 0;
  cursor: pointer;
}
.os-onboarding-overlay .os-swatch:hover { border-color: #6600ff; }
.os-onboarding-overlay .os-swatch--on {
  border-color: #6600ff;
  box-shadow: 0 0 0 2px rgba(102, 0, 255, 0.35);
}
/* §BUILDING-PREVIEW-MODULAR — the expanded (~21) pastel façade palette wraps to a tidy
   multi-row grid; a slightly tighter gap + a cap keep it neat. The swatches are FAÇADE
   tints only; the chrome stays white + #6600FF (NO black). */
.os-onboarding-overlay .os-swatch-row {
  gap: 0.38rem;
  max-width: 19rem;
}

/* ── §RESI-LANDSCAPE-MODAL (founder 2026-06-27) — wide LANDSCAPE residential setup ──
   The residential program step (and ONLY that step) earns the wide layout the founder
   asked for: a left "Views / levels" rail · a LARGE central plan preview · the controls
   form on the right — mirroring the residential-HOUSE preview modal. It rides the
   non-blocking docked-banner presentation (--drawing) so the drawn boundary stays
   visible behind it, but --resi widens the card and replaces the single vertical
   column with a 3-column grid. White + #6600FF only. Collapses to one column when the
   viewport is too narrow for three. The --resi rules come AFTER --confirm so they
   win the cascade (same specificity, later wins) for the body's flex-direction. */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--resi .os-header,
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--resi .os-body {
  /* Override the slim 560px banner cap — the landscape layout needs widescreen room. */
  width: min(1080px, 96vw);
}
/* §RESI-DRAG (founder 2026-06-28) — make the landscape setup card DRAGGABLE by its header.
   The --drawing banner makes the overlay a full-width (100vw) transparent strip with the
   visible card centred inside it; dragging that strip can only nudge it vertically (its
   width ≈ viewport width pins it horizontally). For --resi we instead size the OVERLAY to
   the card itself and dock it bottom-centre, so it stays NON-BLOCKING (no scrim, the drawn
   boundary shows behind) yet getBoundingClientRect() returns the real card box —
   makeDraggable then repositions the actual card and the on-screen clamp works. */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--resi {
  inset: auto auto 1.2rem 50%;
  transform: translateX(-50%);
  width: min(1080px, 96vw);
  align-items: stretch;
}
/* Header carries the move cursor again (the slim banner set it to default). The drag
   listener is wired in mountOverlay and survives the body re-renders between steps. */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--resi .os-header {
  cursor: move;
  border-radius: 14px 14px 0 0;
}
/* Once dragged, makeDraggable pins left/top + clears the transform; honour that by
   dropping the centring translate so the card sits exactly where it was released. */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--resi.vg-panel--dragging {
  transform: none;
}
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--resi .os-body {
  /* Reset the --confirm vertical column: the body now hosts ONE landscape grid. */
  display: block;
  /* The card can get tall on small screens — let the body scroll internally. */
  max-height: min(82vh, 760px);
  overflow-y: auto;
  padding: 0.85rem 0.95rem 0.95rem;
}
.os-onboarding-overlay--resi .os-resi-layout {
  display: grid;
  /* LEFT views rail · CENTER plan (takes the slack) · RIGHT controls. */
  grid-template-columns: 152px minmax(0, 1fr) 300px;
  gap: 0.85rem;
  align-items: start;
}
/* Narrow viewport: collapse to a single column (views → plan → form stack). */
@media (max-width: 880px) {
  .os-onboarding-overlay--resi .os-resi-layout { grid-template-columns: 1fr; }
}

/* LEFT — "Views / levels" rail. A framed column of per-floor chips; the
   representative-plan floor is highlighted in #6600FF. */
.os-onboarding-overlay--resi .os-resi-views {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  padding: 0.6rem 0.55rem;
  border: 1px solid rgba(102, 0, 255, 0.16);
  border-radius: 0.7rem;
  background: linear-gradient(180deg, #ffffff 0%, rgba(102, 0, 255, 0.035) 100%);
}
.os-onboarding-overlay--resi .os-resi-views-head {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #6600ff;
  padding: 0 0.15rem 0.15rem;
}
.os-onboarding-overlay--resi .os-resi-views-list {
  display: flex;
  flex-direction: column;
  gap: 0.32rem;
}
.os-onboarding-overlay--resi .os-resi-views-empty {
  font-size: 0.74rem;
  color: rgba(42, 26, 82, 0.5);
  padding: 0.2rem 0.15rem;
}
.os-onboarding-overlay--resi .os-resi-view-chip {
  display: flex;
  flex-direction: column;
  gap: 0.06rem;
  text-align: left;
  padding: 0.4rem 0.55rem;
  border-radius: 0.55rem;
  border: 1px solid rgba(102, 0, 255, 0.12);
  background: rgba(255, 255, 255, 0.7);
  color: #2a1a52;
  cursor: default;
}
.os-onboarding-overlay--resi .os-resi-view-chip--on {
  border-color: #6600ff;
  background: rgba(102, 0, 255, 0.08);
  box-shadow: 0 0 0 1px rgba(102, 0, 255, 0.22) inset;
}
.os-onboarding-overlay--resi .os-resi-view-chip-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: #2a1a52;
}
.os-onboarding-overlay--resi .os-resi-view-chip--on .os-resi-view-chip-label { color: #6600ff; }
.os-onboarding-overlay--resi .os-resi-view-chip-meta {
  font-size: 0.68rem;
  color: #6b5f8c;
}

/* CENTER — the large plan preview stage. Lets the preview occupy the main area. */
.os-onboarding-overlay--resi .os-resi-stage {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.os-onboarding-overlay--resi .os-resi-stage .os-resi-preview {
  margin-top: 0;
}
/* The big central plan — let it use the full stage width (cap raised vs. the old
   190px portrait thumbnail so the plan is genuinely prominent, not a small box). */
.os-onboarding-overlay--resi .os-resi-stage .os-resi-preview-plan svg {
  max-height: 360px;
}

/* RIGHT — the controls form column. Tighter gaps so all groups fit beside the plan;
   it scrolls internally if the parameter stack runs taller than the card. */
.os-onboarding-overlay--resi .os-resi-form {
  margin-top: 0;
  gap: 0.55rem;
  max-height: min(72vh, 680px);
  overflow-y: auto;
  padding-right: 0.15rem;
}
/* On the single-column (narrow) fallback, drop the per-column scroll so the whole
   body scrolls as one. */
@media (max-width: 880px) {
  .os-onboarding-overlay--resi .os-resi-form { max-height: none; overflow: visible; }
}

/* ── §OFFICE-PREVIEW-MODAL-LAYOUT (founder 2026-06-30) — the OFFICE-building setup step ──
   A clean two-column landscape: LEFT = a bounded circular plate preview (its own box,
   nothing overlaps it) + the floor-plate analytics key→value table beneath; RIGHT = the
   four labelled sliders, the culture toggle, the plate-shape caption and the action
   buttons. Rides the --resi wide card + body reset, then lays its OWN grid via --office
   so the preview and the sliders sit in SEPARATE bounded cells and never bleed into each
   other. Brand white + #6600FF, dark-grey text (NO pure black). */
.os-onboarding-overlay--office .os-office-layout {
  display: grid;
  grid-template-columns: minmax(0, 320px) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}
@media (max-width: 880px) {
  .os-onboarding-overlay--office .os-office-layout { grid-template-columns: 1fr; }
}

/* LEFT column — preview box (top) stacked over the analytics table (bottom). */
.os-onboarding-overlay--office .os-office-left {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  min-width: 0;
}

/* The bounded plate-preview box — the circular SVG centred on a white sheet with a
   faint purple frame. Fixed, self-contained; nothing from the form reaches into it. */
.os-onboarding-overlay--office .os-office-plate {
  padding: 0.7rem;
  border: 1px solid rgba(102, 0, 255, 0.18);
  border-radius: 0.7rem;
  background: linear-gradient(180deg, #ffffff 0%, rgba(102, 0, 255, 0.04) 100%);
}
.os-onboarding-overlay--office .os-office-plate-svg {
  display: flex;
  justify-content: center;
}
.os-onboarding-overlay--office .os-office-plate-svg svg {
  width: 100%;
  height: auto;
  max-width: 260px;
  border-radius: 10px;
  box-shadow: 0 1px 6px rgba(102, 0, 255, 0.1);
}
.os-onboarding-overlay--office .os-office-plate-caption {
  margin-top: 0.5rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: #6600ff;
  text-align: center;
}

/* The analytics card — frames the key→value table + zone legend + variety chips. */
.os-onboarding-overlay--office .os-office-analytics {
  padding: 0.7rem 0.8rem 0.8rem;
  border: 1px solid rgba(102, 0, 255, 0.16);
  border-radius: 0.7rem;
  background: #ffffff;
}

/* §OFFICE-PREVIEW-MODAL-LAYOUT — the ob-* analytics styles are injected by the standalone
   OfficeBuildingModal; the onboarding overlay never loads that sheet, so without these the
   analytics rendered as an unstyled value-above-label list. Define a clean two-column
   key→value table here (label left/muted · value right/emphasised, aligned rows). */
.os-onboarding-overlay--office .ob-analytics { color: #2a1a52; }
.os-onboarding-overlay--office .ob-section-title {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #6600ff;
  margin: 0.7rem 0 0.35rem;
}
.os-onboarding-overlay--office .ob-section-title:first-child { margin-top: 0; }
.os-onboarding-overlay--office .ob-metrics {
  display: flex;
  flex-direction: column;
  gap: 0;
  border: 1px solid rgba(102, 0, 255, 0.14);
  border-radius: 0.55rem;
  overflow: hidden;
  background: rgba(102, 0, 255, 0.03);
}
.os-onboarding-overlay--office .ob-metric {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.4rem 0.65rem;
  border-bottom: 1px solid rgba(102, 0, 255, 0.1);
}
.os-onboarding-overlay--office .ob-metric:last-child { border-bottom: none; }
.os-onboarding-overlay--office .ob-metric-label {
  font-size: 0.78rem;
  color: rgba(42, 26, 82, 0.62);
}
.os-onboarding-overlay--office .ob-metric-value {
  font-size: 0.85rem;
  font-weight: 700;
  color: #2a1a52;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.os-onboarding-overlay--office .ob-rise { font-size: 0.8rem; color: #4a3a6a; }
.os-onboarding-overlay--office .ob-legend {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.os-onboarding-overlay--office .ob-legend-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.74rem;
}
.os-onboarding-overlay--office .ob-swatch {
  width: 0.85rem;
  height: 0.85rem;
  border-radius: 3px;
  flex: 0 0 auto;
}
.os-onboarding-overlay--office .ob-legend-label { flex: 1 1 auto; color: #2a1a52; }
.os-onboarding-overlay--office .ob-legend-area {
  color: #6600ff;
  font-weight: 600;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.os-onboarding-overlay--office .ob-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}
.os-onboarding-overlay--office .ob-chip {
  background: rgba(102, 0, 255, 0.08);
  color: #4400aa;
  border-radius: 999px;
  padding: 0.15rem 0.55rem;
  font-size: 0.7rem;
  font-weight: 600;
}

/* RIGHT column — the controls form. Clear vertical spacing between slider rows; it
   scrolls internally if the parameter stack runs taller than the card. */
.os-onboarding-overlay--office .os-office-layout .os-resi-form {
  margin-top: 0;
  gap: 0.9rem;
  max-height: min(72vh, 680px);
  overflow-y: auto;
  padding-right: 0.15rem;
}
@media (max-width: 880px) {
  .os-onboarding-overlay--office .os-office-layout .os-resi-form {
    max-height: none;
    overflow: visible;
  }
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

/* ── §UX-COMPACT-TYPE-PILL (founder 2026-08-25, L-11131; placement + parity by lane
   UXPILL70) — the confirm step as ONE pill in the TOP BAND, beside the view-mode bar
   (2D Site Map · 3D Site · 3D Globe · Split): BUILDING TYPE ▾ + Do it myself.

   PARITY WITH .svq-bar IS THE SPEC (styles/panels/siteViewQuickToggle.ts). That bar is
   the founder's "standard rectangular shape with curved edges", so every surface value
   below is the bar's, not a fresh choice, and a source-text arm in
   apps/editor/__tests__/onboardingCompactPill.test.ts pins each pair so they cannot
   drift apart.
     top       calc(6px + var(--shell-topbar-h, 36px) + 8px) — DERIVED, clears the band
     padding   5px 6px — with 28px controls the pill is exactly the bar's height
     surface   var(--app-panel-bg). The bar is OPAQUE, so the pill is opaque. The glass
               token the previous pass used is not what the bar wears, and a translucent
               pill beside an opaque bar reads as two materials. Opaque white also clears
               every C43 floor with no alpha derivation (see UX1-CONFIRM-GLASS for the
               method) — accent on white 6.98 to 1, body text on white 16.13 to 1, both
               past WCAG 2.2 AA's 4.5 to 1, on a black or a white basemap alike because
               nothing shows through.
     border    1px solid var(--app-border) · shadow var(--app-shadow-panel)
     radius    100px — the bar's own literal. There is no stadium token; the
               --app-radius-* scale tops out at 16px, which at this height is a visibly
               different shape. Matching the bar byte-for-byte beats minting a token for
               one pair of surfaces.
     type      var(--app-font) 12px / 600 on the controls, as the bar's segments.

   HORIZONTAL POSITION IS MEASURED, NOT GUESSED. The bar's width follows its labels, so
   the controller measures its live rect and the pure model (compactPillPlacement.ts)
   decides beside-right / beside-left / below; the answer arrives as ONE data attribute
   plus --os-compact-left / --os-compact-top on the overlay. With no bar on screen the
   pill is CENTRED on the same --shell-canvas-cx the bar reads (C06 §15), so it is never
   anchored to the viewport and never lands on a split pane.

   SPECIFICITY (0,5,0) IS LOAD-BEARING (L-11206). The confirm card's glass is declared at
   (0,4,0) on the drawing+confirm body — width min(264px, 92vw), glass, padding — and the
   previous --compact pass authored at (0,3,0), so the body kept a 264px glass card BEHIND
   the pill. Repeat the full class chain, as the opaque escapes above already do for the
   same reason. Comments stay ABOVE selectors (UX1-COMMENT-EATS-THE-CLAMP). ── */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm.os-onboarding-overlay--compact {
  inset: auto;
  top: calc(6px + var(--shell-topbar-h, 36px) + 8px);
  left: var(--os-compact-left, var(--shell-canvas-cx, 50%));
  right: auto;
  bottom: auto;
  transform: translateX(-50%);
  width: auto;
  max-width: calc(var(--shell-canvas-w, 100vw) - 32px);
  height: auto;
  max-height: none;
  margin: 0;
  padding: 0;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border: none;
  border-radius: 0;
  box-shadow: none;
  overflow: visible;
  pointer-events: none;
}
/* A measured placement supplies the pill's LEFT EDGE, so the centring translate goes. */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm.os-onboarding-overlay--compact[data-os-compact-placement="beside-right"],
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm.os-onboarding-overlay--compact[data-os-compact-placement="beside-left"],
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm.os-onboarding-overlay--compact[data-os-compact-placement="below"] {
  transform: none;
}
/* Only the no-room fallback leaves the band, by a MEASURED top — never by a guess. */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm.os-onboarding-overlay--compact[data-os-compact-placement="below"] {
  top: var(--os-compact-top);
}
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm.os-onboarding-overlay--compact .os-header,
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm.os-onboarding-overlay--compact .os-footer,
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm.os-onboarding-overlay--compact .os-resize-grip {
  display: none;
}
/* The body is a transparent carrier; the pill row below is the only painted surface. */
.os-onboarding-overlay.os-onboarding-overlay--drawing.os-onboarding-overlay--confirm.os-onboarding-overlay--compact .os-body {
  pointer-events: auto;
  flex: 0 0 auto;
  width: auto;
  max-width: none;
  overflow: visible;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  box-shadow: none;
}
/* The pill. Every value here is .svq-bar's — see the block comment above. */
.os-onboarding-overlay.os-onboarding-overlay--confirm .os-compact-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 6px;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: 100px;
  box-shadow: var(--app-shadow-panel);
  font-family: var(--app-font);
  white-space: nowrap;
  user-select: none;
}
/* BUILDING TYPE — short, uppercase, the section-label idiom in the bar's own face. */
.os-onboarding-overlay.os-onboarding-overlay--confirm .os-compact-label {
  margin: 0;
  padding: 0 4px 0 10px;
  font-family: var(--app-font);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-accent);
  cursor: pointer;
}
/* C43 / WCAG 2.2 AA SC 2.5.8 — min-height 28px is the SAME floor .svq-btn carries; uiScale
   clamps it to 24px on the way down. The explicit height (same value, same clamp) is
   MEASURED, not decorative: Chromium gives a native select an intrinsic menulist height
   of ~26.5px that ignores min-height, which rendered the pill 37px tall beside a 34.3px bar
   (tests/e2e/static/onboardingCompactPill.static.ts caught it). border-box so the border
   and the vertical padding live inside that height, as they do on the bar's segments. */
.os-onboarding-overlay.os-onboarding-overlay--confirm .os-compact-select {
  box-sizing: border-box;
  min-height: 28px;
  height: 28px;
  padding: 0 8px;
  font-family: var(--app-font);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--app-text);
  background: var(--app-panel-bg);
  border: 1.5px solid var(--app-border);
  border-radius: 100px;
  min-width: 140px;
  cursor: pointer;
}
.os-onboarding-overlay.os-onboarding-overlay--confirm .os-compact-select:hover {
  border-color: var(--app-accent);
}
.os-onboarding-overlay.os-onboarding-overlay--confirm .os-compact-select:focus-visible {
  outline: 2px solid var(--app-accent);
  outline-offset: 1px;
}
/* Do it myself — the bar's ACTION treatment (.svq-btn--globe): accent text on the pill
   surface, a transparent 1.5px border so hover cannot shift the label, purple fill with
   white text on hover. Overrides .os-btn / .os-btn--ghost at (0,3,0). */
.os-onboarding-overlay.os-onboarding-overlay--confirm .os-compact-row .os-compact-notnow {
  min-height: 28px;
  padding: 6px 12px;
  font-family: var(--app-font);
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
  color: var(--app-accent);
  background: transparent;
  border: 1.5px solid transparent;
  border-radius: 100px;
  white-space: nowrap;
}
.os-onboarding-overlay.os-onboarding-overlay--confirm .os-compact-row .os-compact-notnow:hover {
  background: var(--app-accent);
  border-color: var(--app-accent);
  color: var(--app-panel-bg);
}
`;
