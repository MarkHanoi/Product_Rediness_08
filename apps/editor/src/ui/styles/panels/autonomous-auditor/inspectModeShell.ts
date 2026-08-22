/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const INSPECT_MODE_STYLES = `
/* ═══════════════════════════════════════════════════════════════════════════
   INS — Inspect Mode Shell (F2)
   ═══════════════════════════════════════════════════════════════════════════ */

.ins-shell {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
}

.ins-canvas-half {
  flex: 1 1 50%;
  min-width: 0;
  position: relative;
  overflow: hidden;
}

.ins-audit-half {
  flex: 1 1 50%;
  min-width: 320px;
  max-width: 60%;
  display: flex;
  flex-direction: column;
  background: var(--app-panel-bg);
  border-left: 1px solid var(--app-border);
  overflow: hidden;
}

/* Z-Slicer elevation handle — absolutely positioned over canvas */
.ins-zslicer {
  position: absolute;
  left: 8px;
  top: 50%;
  transform: translateY(-50%) rotate(-90deg);
  transform-origin: center center;
  width: 140px;
  height: 28px;
  z-index: 120;
  opacity: 0.75;
  cursor: ns-resize;
  accent-color: var(--app-accent);
}

.ins-zslicer:hover {
  opacity: 1;
}

.ins-zslicer-label {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  font-size: 9px;
  color: var(--app-text-muted);
  pointer-events: none;
  white-space: nowrap;
}

/* Lens Selector HUD pill bar — floats over dark 3D canvas */
.ins-lens-bar {
  position: absolute;
  bottom: 16px;
  left: var(--shell-canvas-cx, 50%);
  transform: translateX(-50%);
  display: flex;
  flex-direction: row;
  gap: 4px;
  padding: 4px 8px;
  background: var(--app-panel-glass);
  border: 1px solid var(--app-border);
  border-radius: 20px;
  z-index: 110;
  backdrop-filter: var(--app-panel-glass-blur);
  box-shadow: var(--app-shadow-hud);
}

.ins-lens-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--app-text-2);
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.ins-lens-pill:hover {
  background: var(--app-bg);
  color: var(--app-text);
}

.ins-lens-pill.ins-lens-active {
  background: var(--app-accent);
  color: var(--app-on-accent);
}

/* Level Explode HUD — floats above the lens bar over the dark 3D canvas.
   CSS prefix: ins-explode-  (extension of ins- inspect prefix per §05 §3)       */

.ins-explode-bar {
  position: absolute;
  bottom: 62px;
  left: var(--shell-canvas-cx, 50%);
  transform: translateX(-50%);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  background: var(--app-panel-glass);
  border: 1px solid var(--app-border);
  border-radius: 20px;
  z-index: 110;
  backdrop-filter: var(--app-panel-glass-blur);
  box-shadow: var(--app-shadow-hud);
  white-space: nowrap;
}

.ins-explode-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 14px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--app-text-2);
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}

.ins-explode-btn:hover {
  background: var(--app-bg);
  color: var(--app-text);
}

.ins-explode-btn.ins-explode-active {
  background: var(--app-accent);
  color: var(--app-on-accent);
}

.ins-explode-sep {
  color: var(--app-border);
  font-size: 12px;
  padding: 0 2px;
  pointer-events: none;
  user-select: none;
}

.ins-explode-select {
  height: 24px;
  padding: 0 6px;
  border-radius: 10px;
  border: 1px solid var(--app-border);
  background: var(--app-panel-bg);
  color: var(--app-text);
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  outline: none;
  max-width: 120px;
}

.ins-explode-select:focus {
  border-color: var(--app-accent);
}

/* Ghost asset label (3D canvas overlay) */
.ins-ghost-label {
  background: var(--app-panel-glass);
  color: var(--app-text);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--app-border);
  pointer-events: none;
  white-space: nowrap;
}

/* ── §SHELL-FLOAT-BUDGET (L-4010..L-4016) — THIS BLOCK USED TO BE FOUR RULES ──
   It read:

     body.pryzm-mode-inspect  .wmb-toplevel-wrapper   ->  left: 25%
     body.pryzm-mode-inspect  .bam-container          ->  left: 25%
     body.pryzm-mode-inspect  .ins-lens-bar           ->  fixed, left 25%, bottom 16px
     body.pryzm-mode-inspect  .ins-explode-bar        ->  fixed, left 25%, bottom 62px

   (written with arrows, not braces: the spec arms find a rule by matching the
   selector followed by a brace, so a comment in that shape IS the first match -
   which is how the first draft of this lane's own test failed.)

   Four rules for four bars, in ONE mode. Analysis is also a half-canvas mode and
   had exactly ONE of the four (L-3601, and only after the founder reported the
   sliced subtitle); '.ceb-bar' — the editor toolbar he was actually looking at —
   had none in either. FIVE of the eight cells were written and three were not,
   which is what a per-(mode x bar) rule set always converges to.

   ⭐ The 'left' half is now ONE published number. Every bar above declares
   'left: var(--shell-canvas-cx, 50%)' and 'WorkspaceController._applyLayout()'
   writes it from the 'canvas' column of WORKSPACE_MODES. Adding a half-canvas
   mode is a ROW (ADR-0343 §D.1). Nothing here names a bar and nothing there
   names a mode.

   ⛔ WHAT SURVIVES, AND WHY IT IS NOT THE SAME THING. These two bars are
   'position: absolute' in their own right — they float INSIDE a container in
   Author mode. Inspect promotes them to 'position: fixed' and re-anchors their
   'bottom' so they clear the Inspect HUD stack. That is a POSITIONING-MODEL
   change, not a horizontal budget, and folding it into '--shell-canvas-cx'
   would make one variable mean two unrelated things. It stays mode-keyed and
   stays here, beside the bars it belongs to. */
body.pryzm-mode-inspect .ins-lens-bar {
  position: fixed;
  bottom: 16px;
}

body.pryzm-mode-inspect .ins-explode-bar {
  position: fixed;
  bottom: 62px;
}
`;
