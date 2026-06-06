// Apartment Layout modal styles (SPEC §11, A5-modal).
// CONTRACT §05 §2.1 — runtime CSS lives here as a string constant + is injected
// once by AppTheme.injectAppTheme(); no independent <style> tags. `alm-` prefix.

export const APARTMENT_LAYOUT_MODAL_STYLES = `
.alm-overlay {
  position: fixed; inset: 0; z-index: 4000;
  /* §PANEL-BACKDROP-UNIFY — shared scrim (was rgba(15,23,42,0.55), no blur). */
  background: var(--pryzm-panel-backdrop);
  backdrop-filter: var(--pryzm-panel-backdrop-blur);
  -webkit-backdrop-filter: var(--pryzm-panel-backdrop-blur);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.alm-panel {
  background: #ffffff; color: #0f172a;
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  width: min(960px, 96vw); max-height: 88vh; display: flex; flex-direction: column;
  overflow: hidden; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.alm-header {
  padding: 16px 20px; font-size: 16px; font-weight: 650;
  border-bottom: 1px solid #e2e8f0; display: flex; align-items: baseline; gap: 8px;
}
.alm-header small { font-size: 12px; font-weight: 500; color: #64748b; }
.alm-grid {
  padding: 16px 20px; overflow-y: auto;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px;
}
.alm-card {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;
  display: flex; flex-direction: column; gap: 10px; background: #f8fafc;
  transition: border-color .12s, box-shadow .12s;
}
.alm-card:hover { border-color: #6600FF; box-shadow: 0 4px 16px rgba(102,0,255,0.12); }
.alm-thumb {
  background: #ffffff; border: 1px solid #eef2f7; border-radius: 8px;
  height: 120px; display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.alm-thumb svg { width: 100%; height: 100%; }
.alm-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.alm-title { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.alm-overall { font-weight: 700; font-size: 18px; color: #6600FF; }
.alm-overall small { font-size: 11px; font-weight: 500; color: #94a3b8; }
.alm-bars { display: flex; flex-direction: column; gap: 4px; }
.alm-bar { display: grid; grid-template-columns: 72px 1fr 28px; align-items: center; gap: 6px; }
.alm-bar-label { font-size: 11px; color: #64748b; }
.alm-bar-track { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
.alm-bar-fill { display: block; height: 100%; background: #6600FF; border-radius: 3px; }
.alm-bar-pct { font-size: 11px; color: #475569; text-align: right; }
.alm-meta { font-size: 11px; color: #64748b; }
.alm-rooms { list-style: none; margin: 0; padding: 0; max-height: 132px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px; }
.alm-room { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; font-size: 11px;
  padding: 2px 0; border-bottom: 1px dashed #eef2f7; }
.alm-room-name { font-weight: 500; }
.alm-room-type { color: #94a3b8; }
.alm-room-area { color: #475569; }
.alm-select {
  margin-top: auto; padding: 8px 12px; border: none; border-radius: 8px; cursor: pointer;
  background: #6600FF; color: #ffffff; font-weight: 600; font-size: 12px;
}
.alm-select:hover { background: #5200cc; }
.alm-footer { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
.alm-cancel {
  padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer;
  background: #ffffff; color: #334155; font-weight: 600; font-size: 12px;
}
.alm-cancel:hover { background: #f1f5f9; }
.alm-empty { padding: 32px 20px; text-align: center; color: #64748b; }

/* §MODAL-DYNAMIC (2026-05-29) — inline program-edit form + busy overlay. */
.alm-program {
  padding: 12px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
  display: flex; flex-direction: column; gap: 8px;
}
.alm-program-row {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
.alm-program-checks { color: #334155; }
.alm-program-num {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #334155;
}
.alm-program-num input[type="number"] {
  width: 56px; padding: 4px 6px; font: inherit; color: inherit;
  border: 1px solid #cbd5e1; border-radius: 6px; background: #ffffff;
}
.alm-program-num input[type="number"]:focus {
  outline: 2px solid #6600FF; outline-offset: -1px; border-color: #6600FF;
}
.alm-program-chk {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;
}
.alm-program-chk input[type="checkbox"] { cursor: pointer; }
/* §ROOM-AREAS (2026-05-29) — per-RoomType m² inputs (a third row). */
.alm-program-areas { gap: 10px; }
.alm-program-area {
  display: inline-flex; align-items: center; gap: 4px;
  font-size: 11px; color: #475569;
}
.alm-program-area input[type="number"] {
  width: 56px; padding: 3px 6px; font: inherit; color: inherit;
  border: 1px solid #cbd5e1; border-radius: 6px; background: #ffffff;
}
.alm-program-area input[type="number"]::placeholder { color: #94a3b8; font-style: italic; }
.alm-program-area input[type="number"]:focus {
  outline: 2px solid #6600FF; outline-offset: -1px; border-color: #6600FF;
}
.alm-program-area-unit { color: #94a3b8; }
.alm-program-hint {
  font-size: 11px; color: #64748b; font-style: italic;
}
/* §MODAL-DYNAMIC busy state — dims the grid + shows a pulse. */
.alm-busy .alm-grid { opacity: 0.55; pointer-events: none; transition: opacity .15s; }
.alm-busy .alm-program-hint { color: #6600FF; font-style: normal; font-weight: 600; }

/* §CLICK-FOCUS (2026-05-29) — clickable room polygons in the thumbnail.
 * Hover/focus brighten the polygon slightly + the cursor becomes a pointer so
 * the user discovers the click-to-edit affordance. */
.alm-room-polygon { cursor: pointer; transition: fill-opacity .12s, stroke-opacity .12s; }
.alm-room-polygon:hover { stroke-opacity: 0.85; stroke-width: 0.8; }
/* §A11Y (2026-05-29) — focus ring for keyboard navigation. The PRYZM-purple
 * 1-pixel stroke + outline makes the focused polygon obvious without
 * disturbing the layout. */
.alm-room-polygon:focus { outline: none; stroke: #6600FF; stroke-opacity: 1; stroke-width: 1.2; }
.alm-room-polygon:focus-visible { stroke: #6600FF; stroke-opacity: 1; stroke-width: 1.2; }

/* §MODAL-DYNAMIC part-3 (2026-05-29) — occupancy legend. */
.alm-legend {
  padding: 8px 20px; border-bottom: 1px solid #e2e8f0; background: #ffffff;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.alm-legend-item {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; color: #475569;
}
.alm-legend-swatch {
  display: inline-block; width: 12px; height: 12px; border-radius: 3px;
  border: 1px solid rgba(15, 23, 42, 0.12);
}
.alm-legend-label { white-space: nowrap; }

/* §VALIDATION-BADGE / §VALIDATION-DETAILS (2026-06-01) — per-card pill +
 * expandable per-class details panel. Pill colour reflects state
 * (green = passes, amber = warnings only, red = errors, slate = unknown).
 * Details panel is hidden by default; the modal controller toggles
 * .alm-card--expanded on click. */
.alm-validation-pill {
  align-self: flex-start; cursor: pointer; user-select: none;
  display: inline-flex; align-items: center; gap: 4px;
  padding: 3px 8px; border: 1px solid transparent; border-radius: 999px;
  font: inherit; font-size: 11px; font-weight: 600;
  background: #f1f5f9; color: #334155;
  transition: background .12s, border-color .12s;
}
.alm-validation-pill:hover { background: #e2e8f0; }
.alm-validation-pill:focus-visible {
  outline: 2px solid #6600FF; outline-offset: 1px;
}
.alm-validation-pill--ok {
  background: #ecfdf5; color: #047857; border-color: #a7f3d0;
}
.alm-validation-pill--ok:hover { background: #d1fae5; }
.alm-validation-pill--warn {
  background: #fffbeb; color: #b45309; border-color: #fde68a;
}
.alm-validation-pill--warn:hover { background: #fef3c7; }
.alm-validation-pill--err {
  background: #fef2f2; color: #b91c1c; border-color: #fecaca;
}
.alm-validation-pill--err:hover { background: #fee2e2; }
.alm-validation-pill--unknown {
  background: #f1f5f9; color: #64748b; border-color: #cbd5e1;
}
.alm-validation-caret {
  font-size: 10px; line-height: 1; opacity: 0.65;
  transition: transform .15s;
}
.alm-card--expanded .alm-validation-caret { transform: rotate(180deg); }

.alm-validation-details {
  display: none;
  margin: 0; padding: 8px 10px;
  background: #0f172a; color: #e2e8f0;
  border: 1px solid #1e293b; border-radius: 6px;
  font-family: ui-monospace, "Cascadia Code", "Menlo", "Consolas", monospace;
  font-size: 10.5px; line-height: 1.5;
  white-space: pre-wrap; word-wrap: break-word;
  max-height: 320px; overflow-y: auto;
}
.alm-card--expanded .alm-validation-details { display: block; }

/* §L2-β-5 NARRATIVE (2026-06-01) — short architect-language line surfaced
 * under the score bars when the layout exhibits a recognisable cognition
 * pattern (compression-release arrival, dominant spatial climax, …). Plain
 * italic muted text — does NOT compete with the bars or the validation
 * pill for attention. Hidden naturally on cards whose card-model omits the
 * field (the renderer emits no element at all). */
.alc-narrative {
  font-size: 11px; line-height: 1.45; color: #6600FF;
  font-style: italic; font-weight: 500;
  padding: 4px 8px; margin: 2px 0 0;
  background: rgba(102, 0, 255, 0.06);
  border-left: 2px solid #6600FF; border-radius: 0 6px 6px 0;
}

/* A.21.k — "Choose a house layout" modal. Reuses the apartment modal chrome
 * (.alm-overlay/panel/header/grid/card/overall/select/footer/cancel) so brand
 * (white + #6600FF) + z-index (4000) match by construction; these hlm- rules
 * add only the per-storey strip a house card shows (one mini plan + summary per
 * storey). The house card grid wants wider cards (a per-storey strip is taller
 * + reads better wide), so widen the auto-fill minimum on house cards. */
.alm-grid:has(.hlm-card) { grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.hlm-storeys {
  display: flex; flex-direction: column; gap: 8px;
  margin: 4px 0;
}
.hlm-storey {
  display: grid; grid-template-columns: 92px 1fr; gap: 10px; align-items: center;
  padding: 6px; border: 1px solid #eef2f7; border-radius: 8px; background: #ffffff;
}
.hlm-storey-thumb {
  height: 64px; width: 92px; overflow: hidden;
  display: flex; align-items: center; justify-content: center;
  background: #ffffff; border: 1px solid #eef2f7; border-radius: 6px;
}
.hlm-storey-thumb svg { width: 100%; height: 100%; }
.hlm-storey-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.hlm-storey-label { font-weight: 600; font-size: 12px; color: #0f172a; }
.hlm-storey-summary {
  font-size: 11px; color: #475569;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.hlm-storey-stats { font-size: 11px; color: #94a3b8; }
`;
