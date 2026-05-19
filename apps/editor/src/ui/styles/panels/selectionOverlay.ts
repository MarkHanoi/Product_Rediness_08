/**
 * @file src/styles/panels/selectionOverlay.ts
 *
 * CSS for the Floating Selection Overlay (Phase 4 — PRYZM-UI-GRAND-PLAN-2026).
 *
 * CSS prefix: sel- (Selection Overlay)
 *
 * CONTRACT §05 §3  — prefix sel- registered in 05-BIM-UI-ARCHITECTURE-CONTRACT §3
 * CONTRACT §05 §7.6 — No independent <style> injection; styles registered via injectAppTheme()
 */

export const SEL_OVERLAY_STYLES = `
/* ═══════════════════════════════════════════════════════════════════════════
   SELECTION OVERLAY  (prefix: sel-)
   Phase 4 — Floating contextual action panel above the bottom bar.
   Position: absolute within #container, bottom-center, z-index 310.
   ═══════════════════════════════════════════════════════════════════════════ */

.sel-overlay {
  position: absolute;
  bottom: 68px;
  left: 50%;
  transform: translateX(-50%) translateY(12px);
  z-index: 310;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: var(--app-bg, #1e1e2e);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 12px;
  box-shadow:
    0 8px 32px rgba(0,0,0,0.45),
    0 2px 8px rgba(0,0,0,0.3),
    inset 0 1px 0 rgba(255,255,255,0.05);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  white-space: nowrap;
  user-select: none;
}

.sel-overlay--visible {
  opacity: 1;
  pointer-events: auto;
  transform: translateX(-50%) translateY(0);
}

/* ── Context label ─────────────────────────────────────────────────────── */
.sel-label {
  font-family: var(--app-font, 'Inter', sans-serif);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.38);
  padding: 0 6px 0 4px;
  flex-shrink: 0;
}

/* ── Divider between groups ────────────────────────────────────────────── */
.sel-divider {
  width: 1px;
  height: 20px;
  background: rgba(255,255,255,0.1);
  flex-shrink: 0;
  margin: 0 2px;
}

/* ── Action button ─────────────────────────────────────────────────────── */
.sel-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: rgba(255,255,255,0.78);
  font-family: var(--app-font, 'Inter', sans-serif);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition:
    background 0.12s ease,
    color 0.12s ease,
    transform 0.08s ease;
  flex-shrink: 0;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.sel-btn:hover {
  background: rgba(255,255,255,0.09);
  color: #fff;
}

.sel-btn:active {
  transform: scale(0.95);
  background: rgba(255,255,255,0.13);
}

.sel-btn:focus-visible {
  box-shadow: 0 0 0 2px var(--app-accent, #7c6cf5);
}

/* ── Icon inside button ────────────────────────────────────────────────── */
.sel-btn-icon {
  width: 15px;
  height: 15px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: inherit;
}

/* ── Danger variant (Delete) ───────────────────────────────────────────── */
.sel-btn--danger {
  color: rgba(255,99,99,0.82);
}

.sel-btn--danger:hover {
  background: rgba(255,80,80,0.12);
  color: #ff6b6b;
}

.sel-btn--danger:active {
  background: rgba(255,80,80,0.2);
}

/* ── Wall-specific buttons and divider (legacy — kept for backward compat) ── */
.sel-btn--wall-only {
  display: none;
}

.sel-divider--wall-only {
  display: none;
}

.sel-overlay[data-element-type="wall"] .sel-btn--wall-only {
  display: flex;
}

.sel-overlay[data-element-type="wall"] .sel-divider--wall-only {
  display: block;
}

/* ── Linear-ops group divider (Phase 5 capability system) ──────────────── */
/* Shown/hidden by SelectionOverlay._refreshButtonVisibility() via JS. */
.sel-divider--linear-ops {
  width: 1px;
  height: 20px;
  background: rgba(255,255,255,0.1);
  flex-shrink: 0;
  margin: 0 2px;
  display: none;  /* hidden by default; JS sets display:block when applicable */
}

/* ── Disabled state ─────────────────────────────────────────────────────── */
.sel-btn:disabled {
  opacity: 0.22;
  cursor: not-allowed;
  pointer-events: none;
}

/* ── Active / operation-in-progress state ──────────────────────────────── */
.sel-btn--active {
  background: rgba(102, 0, 255, 0.14);
  color: var(--app-violet-1, #8B5CF6);
  box-shadow: inset 0 0 0 1px rgba(102, 0, 255, 0.28);
}

.sel-btn--active:hover {
  background: rgba(102, 0, 255, 0.22);
  color: var(--app-violet-1, #8B5CF6);
}
`;
