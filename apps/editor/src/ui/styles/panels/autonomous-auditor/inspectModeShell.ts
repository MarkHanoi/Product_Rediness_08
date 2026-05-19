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
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: row;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--app-border);
  border-radius: 20px;
  z-index: 110;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
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
  color: #fff;
}

/* Level Explode HUD — floats above the lens bar over the dark 3D canvas.
   CSS prefix: ins-explode-  (extension of ins- inspect prefix per §05 §3)       */

.ins-explode-bar {
  position: absolute;
  bottom: 62px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid var(--app-border);
  border-radius: 20px;
  z-index: 110;
  backdrop-filter: blur(8px);
  box-shadow: 0 2px 12px rgba(0,0,0,0.15);
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
  color: #fff;
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
  background: rgba(255,255,255,0.92);
  color: var(--app-text);
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--app-border);
  pointer-events: none;
  white-space: nowrap;
}

/* ── Inspect mode: shift all floating toolbars to the left 50% canvas ────────
   When the INSPECT panel occupies the right 50%, every floating bar is
   re-centred over the left canvas so nothing overlaps the panel.
   • .wmb-toplevel-wrapper — Author/Inspect/Data tab bar (position: fixed)
   • .bam-container        — Stacked/Ghost/Area toolbar  (position: fixed)
   • .ins-lens-bar         — Ghost/Area/Openings lens bar (position: absolute → fixed)
   • .ins-explode-bar      — Stacked/Exploded/Solo bar   (position: absolute → fixed) */
body.pryzm-mode-inspect .wmb-toplevel-wrapper {
  left: 25%;
}

body.pryzm-mode-inspect .bam-container {
  left: 25%;
}

body.pryzm-mode-inspect .ins-lens-bar {
  position: fixed;
  left: 25%;
  bottom: 16px;
}

body.pryzm-mode-inspect .ins-explode-bar {
  position: fixed;
  left: 25%;
  bottom: 62px;
}
`;
