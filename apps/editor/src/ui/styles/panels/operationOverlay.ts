/**
 * @file src/styles/panels/operationOverlay.ts
 *
 * CSS for the Operation Mode Overlay (Phase 5 — PRYZM Selection Toolbar Tools).
 *
 * CSS prefix: oop-  (Operation Overlay Panel)
 *
 * CONTRACT §05 §3  — prefix oop- registered in 05-BIM-UI-ARCHITECTURE-CONTRACT §3
 * CONTRACT §05 §7.6 — no independent <style> injection; registered via injectAppTheme()
 *
 * Panels covered:
 *   - oop-overlay        : instruction HUD bar (top-centre of canvas)
 *   - oop-offset-panel   : offset/parallel distance input panel (sub-panel)
 *
 * Implementation plan reference: Phase A, Step 3
 * docs/SELECTION-TOOLBAR-TOOLS-IMPLEMENTATION-PLAN.md §4
 */

export const OOP_STYLES = `
/* ═══════════════════════════════════════════════════════════════════════════
   OPERATION MODE OVERLAY  (prefix: oop-)
   Phase 5 — Instruction HUD that appears during multi-step editing operations.
   Position: absolute within #container, top-centre, z-index 320.
   Visual style: dark frosted glass — matches sel-overlay aesthetic.
   ═══════════════════════════════════════════════════════════════════════════ */

.oop-overlay {
  position: absolute;
  top: 76px;
  left: 50%;
  transform: translateX(-50%) translateY(-8px);
  z-index: 320;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  background: rgba(14, 14, 22, 0.90);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 10px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.50),
    0 2px 8px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  white-space: nowrap;
  user-select: none;
  max-width: calc(100vw - 200px);
}

.oop-overlay--visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

/* ── Escape key hint icon ───────────────────────────────────────────────── */
.oop-esc-hint {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-family: var(--app-font, 'Inter', sans-serif);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.35);
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  padding: 2px 5px;
  line-height: 1;
}

/* ── Divider between hint and message ──────────────────────────────────── */
.oop-divider {
  width: 1px;
  height: 14px;
  background: rgba(255, 255, 255, 0.12);
  flex-shrink: 0;
}

/* ── Instruction text ───────────────────────────────────────────────────── */
.oop-msg {
  font-family: var(--app-font, 'Inter', sans-serif);
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.88);
  line-height: 1;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Operation name badge ───────────────────────────────────────────────── */
.oop-op-badge {
  font-family: var(--app-font, 'Inter', sans-serif);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-violet-1, #8B5CF6);
  padding: 2px 7px;
  background: rgba(102, 0, 255, 0.14);
  border: 1px solid rgba(102, 0, 255, 0.28);
  border-radius: 5px;
  flex-shrink: 0;
}

/* ── Error state ────────────────────────────────────────────────────────── */
.oop-overlay--error .oop-msg {
  color: rgba(255, 100, 100, 0.92);
}

.oop-overlay--error {
  border-color: rgba(255, 80, 80, 0.28);
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.50),
    0 2px 8px rgba(255, 80, 80, 0.15),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
}

/* ═══════════════════════════════════════════════════════════════════════════
   OFFSET DISTANCE INPUT SUB-PANEL  (prefix: oop-offset-)
   Small floating panel with numeric distance input, shown by OffsetTool.
   Position: absolute within #container, below sel-overlay, centre-bottom area.
   ═══════════════════════════════════════════════════════════════════════════ */

.oop-offset-panel {
  position: absolute;
  bottom: 120px;
  left: 50%;
  transform: translateX(-50%) translateY(8px);
  z-index: 315;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(14, 14, 22, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 10px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.50),
    0 2px 8px rgba(0, 0, 0, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.06);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  white-space: nowrap;
  user-select: none;
}

.oop-offset-panel--visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

.oop-offset-label {
  font-family: var(--app-font, 'Inter', sans-serif);
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.50);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  flex-shrink: 0;
}

.oop-offset-input {
  width: 72px;
  padding: 5px 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.92);
  font-family: var(--app-font, 'Inter', sans-serif);
  font-size: 13px;
  font-weight: 500;
  text-align: right;
  outline: none;
  transition: border-color 0.12s ease;
}

.oop-offset-input:focus {
  border-color: var(--app-violet-1, #8B5CF6);
  background: rgba(102, 0, 255, 0.08);
}

.oop-offset-unit {
  font-family: var(--app-font, 'Inter', sans-serif);
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.35);
  flex-shrink: 0;
  margin-left: -4px;
}

.oop-offset-apply {
  padding: 5px 12px;
  background: var(--app-gradient, linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%));
  border: none;
  border-radius: 6px;
  color: #fff;
  font-family: var(--app-font, 'Inter', sans-serif);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition:
    opacity 0.12s ease,
    transform 0.08s ease;
  outline: none;
  flex-shrink: 0;
}

.oop-offset-apply:hover {
  opacity: 0.88;
}

.oop-offset-apply:active {
  transform: scale(0.95);
  opacity: 0.75;
}
`;
