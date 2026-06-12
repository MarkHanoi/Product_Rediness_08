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
  /* A.21.D51 — founder feedback #1: the picker must fill ~90% of the viewport so
   * the layout thumbnails are large + readable (was min(960px,96vw)/88vh — too
   * small, thumbnails near-illegible). Now ~90vw × ~90vh, capped on ultrawide so
   * it never sprawls to an absurd width. Stays scrollable (the .alm-grid scrolls)
   * and brand-true (white + #6600FF). */
  background: #ffffff; color: #0f172a;
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  width: min(1600px, 90vw); height: 90vh; max-height: 90vh;
  display: flex; flex-direction: column;
  overflow: hidden; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.alm-header {
  padding: 16px 20px; font-size: 16px; font-weight: 650;
  border-bottom: 1px solid #e2e8f0; display: flex; align-items: baseline; gap: 8px;
}
.alm-header small { font-size: 12px; font-weight: 500; color: #64748b; }
.alm-grid {
  padding: 16px 20px; overflow-y: auto; flex: 1 1 auto; min-height: 0;
  /* A.21.D51 — wider min column (was 260px) so the bigger modal shows fewer,
   * LARGER cards → each plan thumbnail is readable. */
  display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 16px;
  align-content: start;
}
.alm-card {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;
  display: flex; flex-direction: column; gap: 10px; background: #f8fafc;
  transition: border-color .12s, box-shadow .12s;
}
.alm-card:hover { border-color: #6600FF; box-shadow: 0 4px 16px rgba(102,0,255,0.12); }
.alm-thumb {
  /* A.21.D51 — taller plan preview (was 120px) so rooms + labels read at the
   * larger modal size. Scales with the card so it stays large on wide screens. */
  background: #ffffff; border: 1px solid #eef2f7; border-radius: 8px;
  height: clamp(180px, 22vh, 320px);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
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

/* A.21.D5 editor follow-up — program-feasibility notices (reduced programme +
 * plate rejection). NON-BLOCKING; brand white + #6600FF. The reduced-programme
 * chip sits near the result score; the rejection banner replaces the blank
 * empty-state. Dismiss button is purely cosmetic (never blocks "Use this layout"). */
/* Apartment-modal notice region — only takes space when it holds a notice. */
.alm-notice-region:not(:empty) { padding: 12px 20px 0 20px; }
.alm-notice {
  display: flex; align-items: flex-start; gap: 10px;
  margin: 0 0 10px 0; padding: 10px 12px; border-radius: 8px;
  font-size: 12px; line-height: 1.4;
}
.alm-notice-icon { font-size: 15px; line-height: 1.2; flex: 0 0 auto; }
.alm-notice-body { display: flex; flex-direction: column; gap: 2px; flex: 1 1 auto; min-width: 0; }
.alm-notice-title { font-weight: 700; }
.alm-notice-text { color: inherit; }
.alm-notice-hint { color: #475569; font-size: 11px; }
.alm-notice-close {
  flex: 0 0 auto; border: none; background: transparent; cursor: pointer;
  font-size: 16px; line-height: 1; color: inherit; opacity: 0.6; padding: 0 2px;
}
.alm-notice-close:hover { opacity: 1; }
/* Reduced programme — informative (purple), non-alarming. */
.alm-notice--reduced {
  background: #f3ecff; border: 1px solid #6600FF; color: #3d1a99;
}
.alm-notice--reduced .alm-notice-icon { color: #6600FF; }
/* Rejection — the plate couldn't host the programme at all. */
.alm-notice--rejected {
  background: #fff4f4; border: 1px solid #e11d48; color: #9f1239;
}
.alm-notice--rejected .alm-notice-icon { color: #e11d48; }

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
/* §MODAL-DYNAMIC (A.21.D22) — house design-slider row (Daylight / Privacy /
 * Kitchen / Compactness mapped to ScoringWeights). Brand: #6600FF accent. */
.alm-program-sliders { gap: 14px; }
.alm-program-slider {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; color: #475569;
}
.alm-program-slider input[type="range"] {
  width: 90px; accent-color: #6600FF; cursor: pointer;
}
.alm-program-slider input[type="range"]:focus {
  outline: 2px solid #6600FF; outline-offset: 2px;
}
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
  /* A.21.D51 — wider thumb column (was 92px) so the per-storey plan is readable
   * in the enlarged modal. */
  display: grid; grid-template-columns: 160px 1fr; gap: 12px; align-items: center;
  padding: 8px; border: 1px solid #eef2f7; border-radius: 8px; background: #ffffff;
}
.hlm-storey-thumb {
  height: 120px; width: 160px; overflow: hidden;
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

/* DEMO-2 (Living Graph) — Plan / Graph per-card toggle + view swap. The plan
 * thumbnail shows by default; clicking "Graph" sets .alm-card--graph on the card,
 * hiding the plan view and revealing the bubble graph. Brand violet #6600FF. */
.alm-view-toggle {
  display: inline-flex; align-self: flex-start; gap: 0; margin-bottom: 6px;
  border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;
}
.alm-view-btn {
  padding: 3px 10px; border: none; cursor: pointer;
  font: inherit; font-size: 11px; font-weight: 600;
  background: #ffffff; color: #64748b; transition: background .12s, color .12s;
}
.alm-view-btn + .alm-view-btn { border-left: 1px solid #e2e8f0; }
.alm-view-btn:hover { background: #f1f5f9; color: #334155; }
.alm-view-btn[aria-pressed="true"] { background: #6600FF; color: #ffffff; }

/* View swap: default = plan visible, graph hidden. .alm-card--graph inverts. The
 * revealed view keeps .alm-thumb's flex centering so the SVG stays centred. */
.alm-view--graph { display: none; }
.alm-card--graph .alm-view--plan { display: none; }
.alm-card--graph .alm-view--graph { display: flex; }

/* §LIVE-MODAL (2026-06-09) — the house modal now shows the SINGLE best option at
 * "better visibility": one wide card, a HERO-size per-storey plan, a per-storey
 * Plan/Graph toggle, and an editable living graph. */

/* Single card → one wide centred column (no auto-fill grid). */
.alm-grid:has(.hlm-card) {
  grid-template-columns: minmax(0, 720px);
  justify-content: center;
}

/* Hero per-storey strip: the plan/graph sits ABOVE the meta (stacked), full width,
 * so the enlarged SVG is legible — overrides the compact 160px side-by-side. */
.hlm-card .hlm-storey {
  grid-template-columns: 1fr;
  gap: 8px;
}
.hlm-card .hlm-storey-views { display: flex; flex-direction: column; gap: 4px; }
.hlm-card .hlm-storey-thumb {
  width: 100%; height: 320px; max-width: 100%;
}

/* §LIVE-MODAL.B — per-storey Plan/Graph view swap. Plan visible by default;
 * .hlm-storey--graph (set by the click handler) reveals the graph. */
.hlm-storey-view--graph { display: none; }
.hlm-storey--graph .hlm-storey-view--plan { display: none; }
.hlm-storey--graph .hlm-storey-view--graph { display: flex; }
.hlm-storey-toggle { margin-bottom: 4px; }

/* Editable graph nodes — a subtle hover affordance. */
.alm-graph-node:hover { stroke: #6600FF; stroke-width: 2; }

/* §LIVE-MODAL.D — the inline node area/type editor popover. White + #6600FF brand. */
.hlm-node-editor {
  z-index: 10; min-width: 200px; max-width: 280px;
  max-height: calc(100vh - 24px); overflow-y: auto;
  background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.18);
  padding: 10px; display: flex; flex-direction: column; gap: 6px;
  font-size: 12px; color: #0f172a;
}
.hlm-node-editor-title { font-weight: 700; font-size: 12px; color: #0f172a; }

/* §54 LIVING-GRAPH NODE INSPECTOR — read-only relationships card above the editor.
 * INFORMATION · DEPENDENCIES · ADJACENCY · CIRCULATION. Brand white + #6600FF. */
.hlm-node-inspector {
  display: flex; flex-direction: column; gap: 8px;
  padding: 10px; margin: -2px -2px 4px; border-radius: 8px;
  background: #faf7ff; border: 1px solid #ece5ff;
}
.hlm-insp-section { display: flex; flex-direction: column; gap: 3px; }
.hlm-insp-label {
  font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase;
  color: #6600FF;
}
.hlm-insp-line { font-size: 12px; color: #1e1b2e; }
.hlm-insp-line b { font-weight: 700; }
.hlm-insp-meta { font-size: 11px; color: #6b7280; }
.hlm-insp-chips { display: flex; flex-wrap: wrap; gap: 4px; }
.hlm-insp-chip {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  background: #ffffff; border: 1px solid #d9ccff; color: #4b2fa6;
  font-size: 10px; font-weight: 600; line-height: 1.4;
}
.hlm-insp-empty { font-size: 11px; color: #9aa0ac; font-style: italic; }
.hlm-insp-circ { font-size: 11px; font-weight: 600; }
.hlm-insp-circ small { font-weight: 500; color: #6b7280; }
.hlm-insp-circ--on { color: #6600FF; }
.hlm-insp-circ--off { color: #b45309; }
.hlm-node-field { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: #475569; }
.hlm-node-field input, .hlm-node-field select {
  font: inherit; padding: 3px 6px; border: 1px solid #cbd5e1; border-radius: 6px;
}
.hlm-node-actions { display: flex; gap: 6px; margin-top: 2px; }
.hlm-node-apply, .hlm-node-close {
  flex: 1; padding: 4px 8px; border-radius: 6px; cursor: pointer;
  font: inherit; font-size: 11px; font-weight: 600; border: 1px solid #e2e8f0;
}
.hlm-node-apply { background: #6600FF; color: #ffffff; border-color: #6600FF; }
.hlm-node-close { background: #ffffff; color: #64748b; }

/* §3PANE (SPEC-DYNAMIC-PROGRAM-CANVAS §1.1, ADR-0069) — the dynamic three-column
 * workspace: LEFT plan view(s) · CENTER graph(s) · RIGHT tools rail. Brand white +
 * #6600FF, no black. The LEFT+CENTER share the regenerated [data-role="grid"] region. */
.hlm-3pane { flex: 1 1 auto; min-height: 0; display: flex; gap: 14px; padding: 12px 16px; overflow: hidden; }
.hlm-panes { flex: 1 1 auto; min-width: 0; display: flex; gap: 14px; overflow: hidden; }
.alm-busy .hlm-panes { opacity: 0.55; pointer-events: none; transition: opacity .15s; }
.hlm-pane { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; padding-right: 4px; }
.hlm-pane-storey {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; background: #f8fafc;
  display: flex; flex-direction: column; gap: 6px;
}
.hlm-pane--plans .hlm-pane-storey { border-top: 3px solid #c4b5fd; }
.hlm-pane--graphs .hlm-pane-storey { border-top: 3px solid #6600FF; }
.hlm-pane-storey-label { font-weight: 600; font-size: 12px; color: #6600FF; }
.hlm-pane-plan, .hlm-pane-graph {
  background: #ffffff; border: 1px solid #eef2f7; border-radius: 8px;
  height: clamp(200px, 32vh, 420px);
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.hlm-pane-plan svg, .hlm-pane-graph svg { width: 100%; height: 100%; }
.hlm-pane-graph-empty { color: #cbd5e1; font-size: 24px; }
.hlm-pane-storey-stats { font-size: 11px; color: #94a3b8; }
.hlm-tools-rail {
  flex: 0 0 340px; min-width: 0; display: flex; flex-direction: column; gap: 14px;
  overflow-y: auto; padding: 4px 2px 4px 14px; border-left: 1px solid #e2e8f0;
}
.hlm-tools-rail .alm-program, .hlm-tools-rail .hlm-program { width: 100%; }
.hlm-tools-result {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; background: #f8fafc;
  display: flex; flex-direction: column; gap: 10px; margin-top: auto;
}
.hlm-execute {
  background: #6600FF; color: #ffffff; border: none; border-radius: 8px;
  padding: 11px 14px; font-weight: 650; cursor: pointer; font-size: 13px; width: 100%;
}
.hlm-execute:hover { background: #5200cc; }
/* §3PANE IT-2 — per-room SIZE sliders in the tools rail (founder: "increase size of room with a slider") */
.hlm-tools-rail .alm-program-areas { display: flex; flex-direction: column; gap: 6px; }
.alm-program-size { display: grid; grid-template-columns: 60px 1fr 50px; align-items: center; gap: 8px; font-size: 11px; }
.alm-program-size-label { color: #64748b; }
.alm-program-size input[type=range] { width: 100%; accent-color: #6600FF; }
.alm-program-size-val { color: #6600FF; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
/* §3PANE IT-3 SELECTION-SYNC — click a graph node or a plan room → highlight that
 * room across every pane (same data-room-name). */
.hlm-pane-plan .alm-room-polygon { cursor: pointer; }
.hlm-pane-plan .alm-room-polygon.hlm-selected { stroke: #6600FF; stroke-width: 1.8; stroke-opacity: 1; }
.alm-graph-node.hlm-selected { stroke: #6600FF; stroke-width: 3; }
/* §3PANE IT-4 — the unified Miro/Mural CENTER canvas: both storeys' living graphs as
 * lanes inside one pan/zoom world (founder 2026-06-11). The CENTER pane becomes a single
 * full-height canvas (not a scrolling stack). Brand white + #6600FF, no black. */
.hlm-pane--graphs { padding-right: 0; overflow: hidden; }
.hlm-miro { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column;
  border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff; overflow: hidden; }
.hlm-miro-toolbar { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between;
  gap: 8px; padding: 6px 10px; border-bottom: 1px solid #eef2f7; background: #faf8ff; }
.hlm-miro-hint { font-size: 10.5px; color: #94a3b8; }
.hlm-miro-zoom { display: flex; gap: 4px; flex: 0 0 auto; }
.hlm-miro-btn { border: 1px solid #ddd6fe; background: #ffffff; color: #6600FF; border-radius: 6px;
  min-width: 26px; height: 24px; padding: 0 8px; font-size: 13px; font-weight: 650; cursor: pointer; line-height: 1; }
.hlm-miro-btn:hover { background: #f3efff; }
.hlm-miro-viewport { position: relative; flex: 1 1 auto; min-height: 0; overflow: hidden;
  cursor: grab; touch-action: none;
  background-image: radial-gradient(#ede9fe 1px, transparent 1px); background-size: 22px 22px; }
.hlm-miro-viewport--panning { cursor: grabbing; }
.hlm-miro-world { position: absolute; top: 0; left: 0; transform-origin: 0 0;
  display: flex; flex-direction: column; gap: 18px; padding: 4px; will-change: transform; }
.hlm-miro-lane { border: 1px dashed #ddd6fe; border-radius: 12px; background: #ffffff;
  padding: 6px 8px 8px; box-shadow: 0 1px 4px rgba(102,0,255,0.06); }
.hlm-miro-lane-label { font-weight: 650; font-size: 12px; color: #6600FF; margin: 2px 2px 4px; }
.hlm-miro-lane-graph { width: 460px; height: 320px; }
.hlm-miro-lane-graph svg { width: 100%; height: 100%; display: block; }
.hlm-miro-lane-graph .alm-graph-node { cursor: grab; }
/* §3PANE IT-4b/c — node drag: ghost label that follows the cursor + drop-target cues. */
.hlm-miro-ghost { position: fixed; z-index: 100000; transform: translate(-50%, -140%);
  background: #6600FF; color: #fff; font-size: 11px; font-weight: 650; padding: 3px 8px;
  border-radius: 7px; pointer-events: none; box-shadow: 0 2px 8px rgba(102,0,255,0.35); white-space: nowrap; }
.hlm-miro-lane--drop { border-color: #6600FF; border-style: solid;
  background: #f6f1ff; box-shadow: 0 0 0 2px rgba(102,0,255,0.25); }
.alm-graph-node.hlm-drop-target { stroke: #6600FF; stroke-width: 4; }
`;
