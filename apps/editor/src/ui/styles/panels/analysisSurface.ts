/**
 * @file apps/editor/src/ui/styles/panels/analysisSurface.ts
 *
 * Analysis surface — anl- prefix. The F4 workspace mode's right-hand half.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 *
 * ⛔ EVERY COLOUR HERE IS A TOKEN. `tokens.ts:276-277`: *"Adding a value here is
 * the ONLY sanctioned way to introduce a colour to a panel. If a role is
 * missing, add the role — do not inline the hex."* This sheet holds ZERO hex
 * literals and ZERO `var(--x, fallback)` forms — a fallback can never fire
 * (AppTheme concatenates DESIGN_TOKENS ahead of every panel sheet) and a dead
 * fallback that disagrees with its token is a second palette kept alive in
 * code. §PANEL-BRAND-STANDARD ARMS A/B/C enforce all three.
 *
 * ⛔ NO BLACK. `--app-canvas-bg` (#0d1117) is the 3-D canvas and never appears
 * in a panel; every shadow here is on the blue-ink axis, not rgba(0,0,0,·).
 */
export const ANALYSIS_SURFACE_STYLES = `

/* ═══════════════════════════════════════════════════════════════════════════
   ANL — root. Fixed right 50%, exactly as #aud-stack does for Inspect. The
   canvas keeps the left half (WorkspaceController reads the mode registry's
   canvas: 'half'), because every widget here is a SELECTOR.
   ═══════════════════════════════════════════════════════════════════════════ */

#anl-surface {
  position: fixed;
  top: 0;
  right: 0;
  width: 50%;
  height: 100%;
  z-index: 50;
  display: none;
  flex-direction: column;
  background: var(--app-panel-bg);
  border-left: 1px solid var(--app-border);
  overflow: hidden;
  pointer-events: auto;
  font-family: var(--app-font);
}

#anl-surface.anl-surface--visible { display: flex; }

.anl-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--app-bg);
}

/* ── Header ─────────────────────────────────────────────────────────────── */

.anl-header {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 12px;
  background: var(--app-panel-bg);
  border-bottom: 1px solid var(--app-border);
}

.anl-title-wrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }

.anl-title {
  font-size: 11.7px;
  font-weight: 800;
  letter-spacing: 0.10em;
  color: var(--app-accent);
}

.anl-title-sub {
  font-size: 9.9px;
  color: var(--app-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.anl-header-actions { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.anl-header-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: 24px;
  padding: 4px 10px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-panel-bg);
  color: var(--app-text-2);
  font-family: var(--app-font);
  font-size: 10.8px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.anl-header-btn:hover {
  background: var(--app-wash-hover);
  color: var(--app-accent);
  border-color: var(--app-accent);
}
.anl-header-btn:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

/* ── Status strip ───────────────────────────────────────────────────────── */

.anl-status {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 16px;
  background: var(--app-surface-sunken);
  border-bottom: 1px solid var(--app-border-light);
  font-size: 9.9px;
  color: var(--app-text-muted);
}
.anl-status--warn {
  background: var(--app-status-warning-bg);
  border-bottom-color: var(--app-status-warning-line);
  color: var(--app-status-warning-ink);
}
.anl-status-note { flex-shrink: 0; font-style: italic; }

/* ── Grid ───────────────────────────────────────────────────────────────── */

.anl-grid {
  flex: 1 1 auto;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  padding: 14px 16px 24px;
  overflow-y: auto;
  align-content: start;
}

/* ── Card ───────────────────────────────────────────────────────────────── */

.anl-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-card);
  overflow: hidden;
}
.anl-card--wide { grid-column: 1 / -1; }

.anl-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 11px 13px 9px;
  border-bottom: 1px solid var(--app-border-light);
}

.anl-card-headline { min-width: 0; display: flex; flex-direction: column; gap: 3px; }

.anl-card-title {
  margin: 0;
  font-size: 11.7px;
  font-weight: 700;
  color: var(--app-text);
  line-height: 1.3;
}

.anl-card-sub {
  margin: 0;
  font-size: 9.9px;
  line-height: 1.5;
  color: var(--app-text-muted);
}

.anl-card-tools { display: flex; align-items: center; gap: 6px; flex-shrink: 0; }

.anl-icon-btn {
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--app-radius-sm);
  background: transparent;
  color: var(--app-text-muted);
  font-size: 11px;
  cursor: pointer;
}
.anl-icon-btn:hover { background: var(--app-wash-hover); color: var(--app-accent); }
.anl-icon-btn:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-card-body { padding: 12px 13px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }

.anl-card-foot {
  padding: 7px 13px 9px;
  border-top: 1px solid var(--app-border-light);
  background: var(--app-surface-sunken);
  font-size: 9px;
  line-height: 1.5;
  color: var(--app-text-muted);
}

/* ── Badges + strips (the four states, made visible) ────────────────────── */

.anl-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  border-radius: 99px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  white-space: nowrap;
}
.anl-badge--ok   { color: var(--app-status-success-ink); background: var(--app-status-success-bg); }
.anl-badge--warn { color: var(--app-status-warning-ink); background: var(--app-status-warning-bg); }
.anl-badge--err  { color: var(--app-status-error-ink);   background: var(--app-status-error-bg);   }

.anl-strip {
  display: flex;
  gap: 8px;
  padding: 8px 10px;
  border-radius: var(--app-radius-sm);
  border-left: 3px solid var(--app-status-warning-line);
  background: var(--app-status-warning-bg);
}
.anl-strip--warn { border-left-color: var(--app-status-warning-line); background: var(--app-status-warning-bg); }
.anl-strip--err  { border-left-color: var(--app-status-error-line);   background: var(--app-status-error-bg);   }
.anl-strip-text { font-size: 10.8px; line-height: 1.6; color: var(--app-text); }
.anl-strip--err .anl-strip-text  { color: var(--app-status-error-ink); }
.anl-strip--warn .anl-strip-text { color: var(--app-status-warning-ink); }

.anl-note {
  margin: 0;
  font-size: 9.9px;
  line-height: 1.6;
  color: var(--app-text-muted);
}

.anl-lede {
  margin: 0;
  font-size: 10.8px;
  line-height: 1.65;
  color: var(--app-text-2);
}

/* ── Empty state — a real answer, never a zeroed chart ─────────────────── */

.anl-empty {
  padding: 18px 14px;
  border: 1px dashed var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-sunken);
  font-size: 10.8px;
  line-height: 1.65;
  color: var(--app-text-2);
}
.anl-empty p { margin: 0; }
.anl-empty--page { grid-column: 1 / -1; }

/* ── KPI ────────────────────────────────────────────────────────────────── */

.anl-kpi-row { display: flex; gap: 10px; flex-wrap: wrap; }

.anl-kpi {
  flex: 1 1 120px;
  padding: 12px 14px;
  border-radius: var(--app-radius-sm);
  background: var(--app-violet-soft);
}

.anl-kpi-value {
  font-size: 26px;
  font-weight: 800;
  line-height: 1.1;
  color: var(--app-accent);
  font-variant-numeric: tabular-nums;
}
.anl-kpi-value--warn { color: var(--app-status-warning-ink); }

.anl-kpi-label {
  margin-top: 3px;
  font-size: 9.9px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

/* ── Chart canvas ──────────────────────────────────────────────────────── */

.anl-canvas-wrap { position: relative; width: 100%; height: 190px; }
.anl-canvas-wrap canvas { width: 100% !important; height: 100% !important; }

/* ── Legend — this is what stops hue being the only channel ─────────────── */

.anl-legend { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }

.anl-legend-item {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 7px;
  padding: 3px 5px;
  border-radius: var(--app-radius-sm);
  cursor: pointer;
  font-size: 10.8px;
  color: var(--app-text-2);
}
.anl-legend-item:hover { background: var(--app-wash-hover); color: var(--app-text); }
.anl-legend-item:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  border: 1px solid var(--app-panel-bg);
  box-shadow: 0 0 0 1px var(--app-border);
  display: inline-block;
}

.anl-legend-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.anl-legend-value { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--app-text); }
.anl-legend-pct   { font-variant-numeric: tabular-nums; color: var(--app-text-muted); }

/* ── Tables ────────────────────────────────────────────────────────────── */

.anl-table { width: 100%; border-collapse: collapse; font-size: 10.8px; }
.anl-table th {
  text-align: left;
  padding: 5px 7px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border);
}
.anl-table td {
  padding: 6px 7px;
  border-bottom: 1px solid var(--app-border-light);
  vertical-align: top;
  color: var(--app-text-2);
}
.anl-td-key    { color: var(--app-text); font-weight: 600; }
.anl-td-num    { font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; color: var(--app-text); font-weight: 600; }
.anl-td-note   { font-size: 9.9px; line-height: 1.55; color: var(--app-text-muted); }
.anl-td-swatch { width: 18px; }

.anl-row-clickable { cursor: pointer; }
.anl-row-clickable:hover td { background: var(--app-wash-hover); }
.anl-row-clickable:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-qualifier { margin-top: 3px; font-size: 9px; color: var(--app-status-warning-ink); line-height: 1.5; }

/* ── Treemap ───────────────────────────────────────────────────────────── */

.anl-treemap {
  position: relative;
  width: 100%;
  height: 260px;
  border-radius: var(--app-radius-sm);
  overflow: hidden;
  background: var(--app-surface-sunken);
}

.anl-tile {
  position: absolute;
  border: 1px solid var(--app-panel-bg);
  box-sizing: border-box;
  overflow: hidden;
  cursor: pointer;
}
.anl-tile:hover  { filter: brightness(1.06); }
.anl-tile:focus-visible { outline: none; box-shadow: var(--app-focus-ring); }

.anl-tile-cap {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 6px;
  background: var(--app-panel-glass);
  margin: 3px;
  border-radius: 3px;
  max-width: calc(100% - 6px);
}
.anl-tile-label {
  font-size: 9.9px;
  font-weight: 700;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.anl-tile-value {
  font-size: 9px;
  color: var(--app-text-2);
  font-variant-numeric: tabular-nums;
}

/* ── NOT BUILT card ────────────────────────────────────────────────────── */

.anl-nb { display: flex; flex-direction: column; gap: 8px; }
.anl-nb-lede { margin: 0; font-size: 11.7px; line-height: 1.7; color: var(--app-text); }
.anl-nb-h {
  margin: 6px 0 0;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}
.anl-nb-list { margin: 0; padding-left: 17px; display: flex; flex-direction: column; gap: 5px; }
.anl-nb-list li { font-size: 10.8px; line-height: 1.65; }
.anl-nb-list--have li { color: var(--app-text-muted); }
.anl-nb-list--need li { color: var(--app-text); }
.anl-nb-list code {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9.9px;
  padding: 1px 4px;
  border-radius: 3px;
  background: var(--app-violet-soft);
  color: var(--app-accent);
}
.anl-nb-close {
  margin: 6px 0 0;
  padding: 10px 12px;
  border-left: 3px solid var(--app-accent);
  background: var(--app-violet-soft);
  font-size: 10.8px;
  line-height: 1.7;
  color: var(--app-text);
}
.anl-nb-foot { margin: 0; font-size: 9px; line-height: 1.6; color: var(--app-text-muted); }

/* ── Picker / provenance sheet ─────────────────────────────────────────── */

.anl-picker {
  position: absolute;
  top: 54px;
  right: 16px;
  left: 16px;
  max-height: calc(100% - 90px);
  overflow-y: auto;
  z-index: 5;
  padding: 12px 13px;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-modal);
}

.anl-picker-head {
  font-size: 11.7px;
  font-weight: 800;
  color: var(--app-text);
  margin-bottom: 4px;
}

.anl-picker-note {
  margin: 0 0 10px;
  font-size: 9.9px;
  line-height: 1.6;
  color: var(--app-text-muted);
}

.anl-picker-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  padding: 8px 9px;
  margin-bottom: 4px;
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
  background: var(--app-panel-bg);
  text-align: left;
  cursor: pointer;
  font-family: var(--app-font);
}
.anl-picker-row:hover:not(:disabled) { background: var(--app-wash-hover); border-color: var(--app-accent); }
.anl-picker-row:disabled { opacity: 0.45; cursor: default; }
.anl-picker-row--static { cursor: default; }
.anl-picker-left { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.anl-picker-label { font-size: 10.8px; font-weight: 700; color: var(--app-text); }
.anl-picker-sub { font-size: 9px; line-height: 1.5; color: var(--app-text-muted); }

/* ── Narrow viewports — one column rather than two half-width slivers ──── */

@media (max-width: 1100px) {
  .anl-grid { grid-template-columns: minmax(0, 1fr); }
  .anl-card--wide { grid-column: 1 / -1; }
}

/* ── The relationship graph (ADR-0343 D.7, STR-14 4) ──────────────────────
 *
 * Every colour here is a TOKEN. The node fills and edge strokes come from
 * seriesColour() -> --app-cat-1..8, the CVD-simulated categorical scale whose
 * first value is the PRYZM purple #6600FF. Nothing on this card is black:
 * text is --app-text / --app-text-2, the plate is --app-surface-sunken.
 *
 * The SVG scrolls inside its own box rather than widening the card, so a dense
 * graph never makes the panel scroll sideways. */

.anl-nodelink-box {
  overflow-x: auto;
  border: 1px solid var(--app-border-light);
  border-radius: var(--app-radius-sm);
  background: var(--app-surface-sunken);
  padding: 4px;
}
.anl-nodelink { display: block; width: 100%; min-width: 420px; height: auto; }
.anl-nodelink g[role='button']:focus-visible {
  outline: 2px solid var(--app-focus-ring);
  outline-offset: 2px;
}
.anl-nodelink g[role='button']:hover circle { stroke: var(--app-accent); stroke-width: 2.5; }

.anl-nodelink-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin-top: 8px;
  font-size: 9px;
  color: var(--app-text-2);
}
.anl-nodelink-legend-row { display: inline-flex; align-items: center; gap: 5px; }
.anl-nodelink-swatch {
  width: 9px;
  height: 3px;
  border-radius: 2px;
  display: inline-block;
  flex: 0 0 auto;
}
`;
