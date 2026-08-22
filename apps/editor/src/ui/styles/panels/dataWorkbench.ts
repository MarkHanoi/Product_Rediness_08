/**
 * @file src/styles/panels/dataWorkbench.ts
 *
 * CSS styles for the PRYZM Data Workbench panel.
 * CSS class prefix: `dw-` (Data Workbench — §05 §3 contract table)
 *
 * Layout: vertical icon-rail (left) + content area (right).
 * Colours follow AppTheme design tokens (--app-*).
 */

export const DATA_WORKBENCH_STYLES = `

/* ── Workbench container ──────────────────────────────────────────────────── */
#dw-workbench {
  position: fixed;
  top: 40px; right: 0; bottom: 0;
  width: 342px;
  background: var(--app-panel-bg);
  border-left: 1px solid var(--app-border);
  box-shadow: var(--app-shadow-drawer);
  z-index: 110;
  display: flex;
  flex-direction: row;
  font-family: var(--app-font);
  font-size: 11.7px;
  color: var(--app-text);
  overflow: hidden;
  transition: width 0.22s ease;
}
#dw-workbench.dw--hidden    { display: none; }
#dw-workbench.dw--split     { width: 50%; }
#dw-workbench.dw--full      { width: 100%; }

/* ── Icon rail ────────────────────────────────────────────────────────────── */
.dw-rail {
  width: 44px;
  flex-shrink: 0;
  background: var(--app-bg);
  border-right: 1px solid var(--app-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 10px 0 10px;
  gap: 2px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}
.dw-rail::-webkit-scrollbar { display: none; }

.dw-rail-btn {
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  transition: background 0.13s, color 0.13s;
  color: var(--app-text-muted);
  flex-shrink: 0;
}
.dw-rail-btn:hover {
  background: var(--app-border-light);
  color: var(--app-text);
}
.dw-rail-btn--active {
  background: var(--app-violet-soft);
  color: var(--app-accent);
}
.dw-rail-btn--active::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--app-accent);
  border-radius: 0 2px 2px 0;
}

.dw-rail-icon {
  font-size: 16px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-style: normal;
}

/* Tooltip on hover */
.dw-rail-btn::after {
  content: attr(title);
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: var(--app-text);
  color: var(--app-on-accent);
  font-size: 11px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 5px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.13s;
  z-index: 9999;
  box-shadow: var(--app-shadow-hud);
}
.dw-rail-btn:hover::after { opacity: 1; }

.dw-rail-sep {
  width: 20px;
  height: 1px;
  background: var(--app-border);
  margin: 4px 0;
  flex-shrink: 0;
}

/* ── Content area ─────────────────────────────────────────────────────────── */
.dw-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.dw-content-header {
  display: flex;
  align-items: center;
  padding: 0 14px;
  height: 40px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-panel-bg);
}

/* §DW-DEAD-CHROME-RULES (L-3702) — '.dw-content-title' DELETED. It was the
   title of the LEGACY '.dw-content-header', superseded by
   '.dw-content-header--lifecycle' + '.dw-bucket-header-title'. Measured
   2026-08-22 repo-wide: 'rg dw-content-title' → 1 hit, this declaration. */

/* ── Panel content area ───────────────────────────────────────────────────── */
.dw-panel {
  display: none;
  flex: 1;
  overflow: hidden;
  flex-direction: column;
}
.dw-panel.dw-panel--active {
  display: flex;
}

/* ── Placeholder panels ──────────────────────────────────────────────────── */
.dw-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: var(--app-text-muted);
  font-size: 13px;
  padding: 24px;
}
.dw-placeholder-icon {
  font-size: 28px;
  opacity: 0.3;
  margin-bottom: 4px;
}
/* The empty-state sentence. Was an inline style attribute in DataSheetPanel's
   HTML string — including its own 'var(--app-text-muted, #7a8aaa)' fallback. */
.dw-placeholder-text {
  font-size: 12px;
  text-align: center;
  max-width: 200px;
  line-height: 1.5;
  color: var(--app-text-muted);
}

/* ── Toolbar (inside panels) ─────────────────────────────────────────────── */
.dw-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--app-bg);
  border-bottom: 1px solid var(--app-border-light);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.dw-toolbar-btn {
  padding: 4px 9px;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--app-font);
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text);
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  white-space: nowrap;
}
.dw-toolbar-btn:hover {
  background: var(--app-violet-soft);
  border-color: var(--app-accent);
  color: var(--app-accent);
}

/* ── Tree scroll area ─────────────────────────────────────────────────────── */
.dw-tree-scroll {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0 16px;
}
.dw-tree-scroll::-webkit-scrollbar { width: 4px; }
.dw-tree-scroll::-webkit-scrollbar-track { background: transparent; }
.dw-tree-scroll::-webkit-scrollbar-thumb { background: var(--app-scrollbar-thumb); border-radius: 3px; }

/* ── Tree empty state ─────────────────────────────────────────────────────── */
.dw-tree-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--app-text-muted);
  font-size: 12px;
  line-height: 1.6;
}

/* ── Auto-setup banner ────────────────────────────────────────────────────── */
.dw-banner {
  margin: 10px 10px 4px;
  padding: 11px 13px;
  background: linear-gradient(135deg, var(--app-violet-soft) 0%, var(--app-wash-hover) 100%);
  border: 1px solid var(--app-wash-ring);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.dw-banner-text {
  font-size: 12px;
  color: var(--app-text);
  line-height: 1.5;
}
.dw-banner-actions { display: flex; gap: 6px; }
.dw-banner-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  cursor: pointer;
  font-family: var(--app-font);
  font-size: 11px;
  font-weight: 600;
}
.dw-banner-btn--primary { background: var(--app-accent); color: var(--app-on-accent); }
.dw-banner-btn--primary:hover { background: var(--app-accent-hover); }
.dw-banner-btn--ghost {
  background: transparent;
  border: 1px solid var(--app-border);
  color: var(--app-text-2);
}
.dw-banner-btn--ghost:hover { background: var(--app-border-light); }

/* ── Tree nodes ───────────────────────────────────────────────────────────── */
.dw-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px 4px 0;
  cursor: pointer;
  border-radius: 5px;
  margin: 1px 6px;
  transition: background 0.10s;
  min-height: 28px;
  user-select: none;
}
.dw-node:hover { background: var(--app-wash-hover); }
.dw-node.dw-node--selected {
  background: var(--app-wash-selected);
  border: 1px solid var(--app-wash-ring);
}
.dw-node-indent { display: inline-block; flex-shrink: 0; }
.dw-node-expand {
  width: 16px; height: 16px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--app-text-muted);
  background: none; border: none; cursor: pointer; padding: 0;
  border-radius: 3px;
  transition: background 0.10s, transform 0.15s;
}
.dw-node-expand:hover { background: var(--app-border); }
.dw-node-expand.dw-node-expand--open { transform: rotate(90deg); }
.dw-node-expand--leaf { visibility: hidden; }
.dw-node-icon { flex-shrink: 0; font-size: 13px; line-height: 1; }
.dw-node-label {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dw-node-meta {
  font-size: 10px;
  color: var(--app-text-muted);
  white-space: nowrap;
  margin-left: 4px;
}
.dw-sync-dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; margin-left: 4px; }

/* ── Unassigned rooms separator ───────────────────────────────────────────── */
.dw-unassigned-sep {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px;
  font-size: 10px;
  font-weight: 600;
  color: var(--app-text-muted);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.dw-unassigned-sep::before, .dw-unassigned-sep::after {
  content: ''; flex: 1; height: 1px; background: var(--app-border-light);
}
.dw-node--room .dw-node-label { font-weight: 400; color: var(--app-text-2); }

/* ── Dialog ──────────────────────────────────────────────────────────────── */
.dw-dialog-overlay {
  position: fixed;
  inset: 0;
  /* §PANEL-BACKDROP-UNIFY — shared scrim (was rgba(0,0,0,0.35) — black, brand-violation). */
  background: var(--pryzm-panel-backdrop);
  backdrop-filter: var(--pryzm-panel-backdrop-blur);
  -webkit-backdrop-filter: var(--pryzm-panel-backdrop-blur);
  z-index: 9500;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dw-dialog {
  background: var(--app-panel-bg);
  border-radius: 12px;
  box-shadow: var(--app-shadow-modal);
  padding: 20px 22px;
  min-width: 300px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-family: var(--app-font);
}
.dw-dialog-title { font-size: 14px; font-weight: 700; color: var(--app-text); margin: 0; }
.dw-dialog-body { display: flex; flex-direction: column; gap: 8px; }
.dw-dialog-label {
  font-size: 11px; font-weight: 600;
  color: var(--app-text-muted);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.dw-dialog-input {
  width: 100%; padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  font-family: var(--app-font); font-size: 13px;
  color: var(--app-text);
  box-sizing: border-box; outline: none;
  transition: border-color 0.12s;
}
.dw-dialog-input:focus { border-color: var(--app-accent); }
.dw-dialog-select {
  width: 100%; padding: 8px 10px;
  border: 1px solid var(--app-border);
  border-radius: 6px;
  font-family: var(--app-font); font-size: 12px;
  color: var(--app-text); background: var(--app-panel-bg);
  box-sizing: border-box;
}
.dw-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.dw-dialog-btn {
  padding: 7px 16px; border-radius: 6px; border: none;
  cursor: pointer; font-family: var(--app-font); font-size: 12px; font-weight: 600;
}
.dw-dialog-btn--primary { background: var(--app-accent); color: var(--app-on-accent); }
.dw-dialog-btn--primary:hover { background: var(--app-accent-hover); }
.dw-dialog-btn--cancel { background: var(--app-border-light); color: var(--app-text-2); }
.dw-dialog-btn--cancel:hover { background: var(--app-border); }
.dw-dialog-group { display: flex; flex-direction: column; gap: 4px; }

/* ── Tree rows ───────────────────────────────────────────────────────────── */
.dw-tree-row {
  display: flex; align-items: center;
  padding: 5px 10px; cursor: pointer;
  transition: background 0.10s; user-select: none; min-height: 28px;
}
.dw-tree-row:hover { background: var(--app-wash-hover); }
.dw-tree-row--selected {
  background: var(--app-wash-selected);
  border-left: 2px solid var(--app-accent);
}
.dw-tree-arrow { width: 14px; display: inline-block; cursor: pointer; font-size: 9px; opacity: 0.6; flex-shrink: 0; }
.dw-tree-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dw-tree-divider {
  padding: 4px 12px; font-size: 10px; font-weight: 600;
  color: var(--app-text-muted); letter-spacing: 0.04em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-bottom: 1px solid var(--app-border-light); margin: 2px 0;
}

/* ── Setup banner ────────────────────────────────────────────────────────── */
.dw-setup-banner {
  margin: 8px 10px; padding: 10px 12px;
  background: linear-gradient(135deg, var(--app-violet-soft) 0%, var(--app-wash-hover) 100%);
  border: 1px solid var(--app-wash-ring); border-radius: 10px; flex-shrink: 0;
}

/* ── Data sheet sections ─────────────────────────────────────────────────── */
.dw-sheet-section { border-bottom: 1px solid var(--app-border-light); }
.dw-sheet-section-header {
  padding: 8px 12px 6px;
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--app-text-muted);
  background: var(--app-bg);
  border-bottom: 1px solid var(--app-border-light);
  position: sticky; top: 0; z-index: 1;
}
.dw-sheet-content { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }

/* ── Data sheet root + scroller (§PANEL-BRAND-STANDARD L-1743) ────────────
   DataSheetPanel used to declare BOTH of these as 'style.cssText' string
   literals in TypeScript. Two costs, neither cosmetic: §05 §7.6 says panel
   styling lives in this layer, and — the concrete one — 'scaleCssText()' in
   uiScale.ts rewrites the INJECTED sheet, so any length written inline is
   invisible to the ONE density lever. 'padding: 0 0 20px' in TS did not scale
   while every other length in this panel did. */
.dw-sheet-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}
.dw-sheet-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0 0 20px;
}

/* ── Field groups ────────────────────────────────────────────────────────── */
/* §PANEL-BRAND-STANDARD (L-1743) — label/value RHYTHM.
   These were 'flex-direction: column': every label sat on its own line above
   its value, so a six-field section was twelve stacked lines and no two values
   started at the same x. The house idiom for a label/value list is the aligned
   two-column grid in propertyInspector.ts ('.dw-section-body',
   grid-template-columns: 108px 1fr) — the same one the door/window sections
   use. Adopted here at the same 108px so the two read as one product.
   Every .dw-field-group has exactly two children (label, then value or input),
   which is what makes the flattening safe. */
.dw-field-group {
  display: grid;
  grid-template-columns: 108px 1fr;
  gap: 4px 12px;
  align-items: center;
}
.dw-field-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--app-text-muted);
  align-self: center;
  min-width: 0;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
.dw-field-value {
  font-size: 13px; color: var(--app-text); padding: 2px 0; line-height: 1.4;
  min-width: 0;
  overflow-wrap: anywhere;
}

/* ── Badges ──────────────────────────────────────────────────────────────── */
.dw-badge {
  display: inline-block; padding: 2px 7px;
  border-radius: 100px; font-size: 10px; font-weight: 600;
  letter-spacing: 0.02em; white-space: nowrap;
}

/* ── Comparison table ────────────────────────────────────────────────────── */
.dw-comparison-table th, .dw-comparison-table td {
  text-align: left; padding: 5px 6px; vertical-align: middle;
}
.dw-comparison-table thead th {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border); letter-spacing: 0.04em;
}
.dw-comparison-table tbody tr { border-bottom: 1px solid var(--app-border-light); }

/* ── Hierarchy filter bar ───────────────────────────────────────────────── */
.dw-filter-bar {
  padding: 6px 8px 4px; flex-shrink: 0;
  border-bottom: 1px solid var(--app-border-light);
  background: var(--app-bg);
}
.dw-filter-row {
  display: flex; align-items: center; gap: 4px; margin-bottom: 5px;
}
.dw-filter-input {
  flex: 1; padding: 4px 8px; font-size: 12px;
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  background: var(--app-panel-bg); color: var(--app-text);
  font-family: var(--app-font); outline: none;
}
.dw-filter-input:focus { border-color: var(--app-accent); }
.dw-filter-input::placeholder { color: var(--app-text-muted); }
.dw-filter-clear {
  padding: 3px 7px; font-size: 11px; cursor: pointer;
  border: 1px solid var(--app-border); border-radius: var(--app-radius-sm);
  background: var(--app-panel-bg); color: var(--app-text-muted); flex-shrink: 0;
  font-family: var(--app-font); transition: background 0.1s;
}
.dw-filter-clear:hover { background: var(--app-border-light); }
.dw-filter-pills { display: flex; flex-wrap: wrap; gap: 4px; }
.dw-filter-pill {
  padding: 2px 9px; font-size: 10px; font-weight: 600;
  border-radius: 100px; border: 1px solid var(--app-border);
  background: var(--app-panel-bg); color: var(--app-text-2); cursor: pointer;
  font-family: var(--app-font); transition: all 0.12s; white-space: nowrap;
  letter-spacing: 0.02em;
}
.dw-filter-pill:hover { border-color: var(--app-accent); color: var(--app-accent); }
.dw-filter-pill--active {
  background: var(--app-accent); color: var(--app-on-accent);
  border-color: var(--app-accent);
}
.dw-filter-counter {
  padding: 4px 10px; font-size: 10px; font-weight: 600;
  color: var(--app-text-muted); letter-spacing: 0.03em;
  border-bottom: 1px solid var(--app-border-light); flex-shrink: 0;
}
.dw-filter-item {
  display: flex; align-items: center; padding: 5px 10px 5px 14px;
  cursor: pointer; transition: background 0.1s; min-height: 26px; gap: 6px;
}
.dw-filter-item:hover { background: var(--app-wash-hover); }
.dw-filter-item--selected { background: var(--app-wash-selected); border-left: 2px solid var(--app-accent); }
.dw-filter-item-icon { font-size: 12px; flex-shrink: 0; }
.dw-filter-item-label { flex: 1; font-size: 12px; color: var(--app-text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dw-filter-item-meta { font-size: 10px; color: var(--app-text-muted); white-space: nowrap; flex-shrink: 0; }
.dw-filter-item-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dw-filter-empty {
  padding: 20px 12px; text-align: center;
  font-size: 12px; color: var(--app-text-muted); line-height: 1.6;
}

/* ── Workbench header (legacy compat) ─────────────────────────────────────── */
.dw-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--app-border-light);
  flex-shrink: 0;
}
.dw-header-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--app-text-muted);
}
.dw-header-actions { display: flex; gap: 4px; align-items: center; }

/* ── Relationship Explorer Panel (dw-rel-*) ──────────────────────────────── */
/* Step 5: Moved from RelationshipExplorerPanel.ts independent injector to     */
/* AppTheme system per §05 §7.6. Colours corrected to light-theme tokens.      */
.dw-rel-panel {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  font-family: var(--app-font); font-size: 12px;
  color: var(--app-text);
}
.dw-rel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; flex-shrink: 0;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-panel-bg);
}
.dw-rel-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--app-text-muted);
}
.dw-rel-count { font-size: 11px; color: var(--app-text-muted); }
.dw-rel-infobar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; flex-shrink: 0;
  background: var(--app-bg);
  border-bottom: 1px solid var(--app-border);
}
.dw-rel-selected-label { color: var(--app-text-muted); font-size: 11px; }
.dw-rel-type-badge {
  background: var(--app-violet-soft);
  color: var(--app-accent);
  border-radius: 4px; padding: 1px 6px;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
}
.dw-rel-selected-id {
  color: var(--app-accent);
  font-size: 11px; font-family: ui-monospace, monospace;
}
.dw-rel-list {
  flex: 1; overflow-y: auto; padding: 4px 0;
  scrollbar-width: thin; scrollbar-color: var(--app-scrollbar-thumb) transparent;
}
.dw-rel-list::-webkit-scrollbar { width: 4px; }
.dw-rel-list::-webkit-scrollbar-track { background: transparent; }
.dw-rel-list::-webkit-scrollbar-thumb { background: var(--app-scrollbar-thumb); border-radius: 3px; }
.dw-rel-group { margin-bottom: 1px; }
.dw-rel-group-label {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 14px;
  background: var(--app-bg);
  cursor: default; user-select: none;
  position: sticky; top: 0; z-index: 1;
}
.dw-rel-icon { font-size: 12px; width: 16px; text-align: center; }
.dw-rel-type-name {
  flex: 1; font-size: 10px; font-weight: 700;
  color: var(--app-text-muted);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.dw-rel-group-count {
  background: var(--app-violet-soft);
  color: var(--app-accent);
  border-radius: 10px; padding: 1px 6px;
  font-size: 10px; font-weight: 700;
}
.dw-rel-items {
  border-left: 2px solid var(--app-border);
  margin-left: 22px;
}
.dw-rel-item {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px 5px 8px; cursor: pointer;
  transition: background 0.10s;
  border-bottom: 1px solid var(--app-border-light);
}
.dw-rel-item:hover { background: var(--app-violet-soft); }
.dw-rel-dir {
  color: var(--app-accent); font-weight: 700;
  font-size: 13px; width: 16px;
}
.dw-rel-id {
  font-size: 11px; color: var(--app-text-2);
  flex: 1; font-family: ui-monospace, monospace;
}
.dw-rel-meta {
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 3px; padding: 1px 4px;
  font-size: 10px; color: var(--app-text-2);
}
.dw-rel-highlight-btn {
  background: transparent; border: none; cursor: pointer;
  font-size: 12px; opacity: 0.5; transition: opacity 0.15s; padding: 2px 4px;
}
.dw-rel-highlight-btn:hover { opacity: 1; }
.dw-rel-empty, .dw-rel-no-rels {
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 40px 20px; text-align: center; gap: 10px; flex: 1;
  color: var(--app-text-muted);
}
.dw-rel-empty-icon { font-size: 32px; opacity: 0.35; }
.dw-rel-empty-text { font-size: 12px; line-height: 1.5; }
.dw-rel-empty-hint {
  font-size: 11px; line-height: 1.5; max-width: 240px; opacity: 0.7;
}
.dw-rel-actions {
  display: flex; gap: 8px; padding: 8px 14px;
  border-top: 1px solid var(--app-border);
  flex-shrink: 0; background: var(--app-panel-bg);
}
.dw-rel-action-btn {
  flex: 1; padding: 5px 10px;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-sm);
  color: var(--app-text-2);
  font-size: 11px; font-weight: 600; cursor: pointer;
  font-family: var(--app-font);
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.dw-rel-action-btn:hover {
  background: var(--app-violet-soft);
  border-color: var(--app-accent);
  color: var(--app-accent);
}
.dw-rel-action-btn--primary {
  background: var(--app-accent);
  border-color: var(--app-accent); color: var(--app-on-accent);
}
.dw-rel-action-btn--primary:hover {
  background: var(--app-violet-2);
  border-color: var(--app-violet-2);
}

/* ── Generative Design Panel (dw-gen-) ──────────────────────────────────── */
.dw-generative-panel { display:flex;flex-direction:column;gap:0;overflow:hidden;height:100%; }
.dw-gen-section-header { padding:10px 12px 6px;border-bottom:1px solid var(--app-border);background:var(--app-bg); }
.dw-gen-title { font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--app-text-muted);margin-bottom:6px;text-transform:uppercase; }
.dw-gen-mode-toggle { display:flex;gap:4px; }
.dw-gen-mode-btn { padding:3px 10px;border:1px solid var(--app-border);border-radius:var(--app-radius-sm);background:transparent;font-size:11px;cursor:pointer;color:var(--app-text);font-family:var(--app-font); }
.dw-gen-mode-btn--active { background:var(--app-gradient);color:var(--app-on-accent);border-color:var(--app-accent); }
.dw-gen-mode-content { flex:1;overflow-y:auto;padding:10px 12px; }
.dw-gen-field-label { font-size:11px;font-weight:600;color:var(--app-text);margin-bottom:4px;font-family:var(--app-font); }
.dw-gen-textarea { width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--app-border);border-radius:var(--app-radius-sm);font-size:12px;font-family:var(--app-font);resize:vertical;background:var(--app-panel-bg);color:var(--app-text); }
.dw-gen-parse-btn { margin-top:8px;width:100%;padding:7px;background:var(--app-gradient);color:var(--app-on-accent);border:none;border-radius:var(--app-radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--app-font); }
.dw-gen-parse-btn:disabled { opacity:.5;cursor:default; }
.dw-gen-hint { margin-top:6px;font-size:11px;color:var(--app-text-muted);line-height:1.5; }
.dw-gen-table-wrap { overflow-x:auto;margin-bottom:8px; }
.dw-gen-table { width:100%;border-collapse:collapse;font-size:11px; }
.dw-gen-table th { padding:4px 6px;background:var(--app-bg);border-bottom:1px solid var(--app-border);text-align:left;font-weight:600;color:var(--app-text);font-family:var(--app-font); }
.dw-gen-table td { padding:3px 4px;border-bottom:1px solid var(--app-border-light); }
.dw-gen-input { width:100%;box-sizing:border-box;padding:3px 5px;border:1px solid var(--app-border);border-radius:3px;font-size:11px;background:var(--app-panel-bg);color:var(--app-text);font-family:var(--app-font); }
.dw-gen-input--num { width:60px; }
.dw-gen-input--adj { min-width:160px; }
.dw-gen-remove-btn { background:none;border:none;color:var(--app-status-error);cursor:pointer;font-size:12px;padding:2px 4px; }
.dw-gen-add-btn { font-size:11px;color:var(--app-accent);background:none;border:1px dashed var(--app-accent);padding:4px 10px;border-radius:var(--app-radius-sm);cursor:pointer;margin-bottom:10px;font-family:var(--app-font); }
.dw-gen-settings { margin:8px 0;display:flex;flex-direction:column;gap:6px; }
.dw-gen-settings-row { display:flex;align-items:center;gap:8px; }
.dw-gen-settings-label { font-size:11px;font-weight:600;color:var(--app-text);min-width:90px;font-family:var(--app-font); }
.dw-gen-bbox { display:flex;align-items:center;gap:4px;font-size:12px;color:var(--app-text); }
.dw-gen-bbox-sep { font-weight:700;color:var(--app-text-muted); }
.dw-gen-select { padding:4px 8px;border:1px solid var(--app-border);border-radius:var(--app-radius-sm);font-size:11px;background:var(--app-panel-bg);color:var(--app-text);font-family:var(--app-font); }
.dw-gen-generate-btn { width:100%;padding:9px;background:var(--app-gradient);color:var(--app-on-accent);border:none;border-radius:var(--app-radius-sm);font-size:13px;font-weight:700;cursor:pointer;margin-top:4px;letter-spacing:.01em;font-family:var(--app-font); }
.dw-gen-generate-btn:disabled { opacity:.5;cursor:default; }
.dw-gen-error { margin:8px 12px;padding:8px 10px;background:var(--app-status-error-bg);border:1px solid var(--app-status-error-line);border-radius:var(--app-radius-sm);font-size:11px;color:var(--app-status-error-ink); }
.dw-gen-success { margin:8px 12px;padding:8px 10px;background:var(--app-status-success-bg);border:1px solid var(--app-status-success-line);border-radius:var(--app-radius-sm);font-size:11px;color:var(--app-status-success-ink);line-height:1.5; }
.dw-gen-advisory { padding:10px 12px;border-top:1px solid var(--app-border); }
.dw-gen-advisory-title { font-size:11px;font-weight:700;color:var(--app-status-warning-ink);margin-bottom:6px; }
.dw-gen-advisory-card { background:var(--app-status-warning-bg);border:1px solid var(--app-status-warning-line);border-radius:var(--app-radius-sm);padding:8px 10px;margin-bottom:6px; }
.dw-gen-advisory-card-title { font-size:11px;font-weight:700;color:var(--app-status-warning-ink);margin-bottom:2px; }
.dw-gen-advisory-card-desc { font-size:11px;color:var(--app-status-warning-ink);line-height:1.5;margin-bottom:4px; }
.dw-gen-advisory-apply-btn { font-size:11px;color:var(--app-accent);background:none;border:none;padding:0;cursor:pointer;text-decoration:underline; }

/* ── Variant Browser Panel (dw-vb-) ─────────────────────────────────────── */
.dw-vb-idle { display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:6px;color:var(--app-text-muted); }
.dw-vb-idle-icon { font-size:28px;opacity:.4; }
.dw-vb-idle-title { font-size:12px;font-weight:600;color:var(--app-text);font-family:var(--app-font); }
.dw-vb-idle-hint { font-size:11px;text-align:center;line-height:1.6;color:var(--app-text-muted); }
.dw-vb-loading { display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:10px;font-size:12px;color:var(--app-text);font-family:var(--app-font); }
.dw-vb-spinner { font-size:24px;animation:dw-spin 1.2s linear infinite; }
@keyframes dw-spin { to { transform:rotate(360deg); } }
.dw-vb-header { display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-bottom:1px solid var(--app-border);background:var(--app-bg); }
.dw-vb-header-title { font-size:10px;font-weight:700;letter-spacing:.04em;color:var(--app-text-muted);text-transform:uppercase; }
.dw-vb-filter { font-size:10px;color:var(--app-text-muted); }
.dw-vb-back-btn { font-size:11px;background:none;border:none;color:var(--app-accent);cursor:pointer;font-family:var(--app-font); }
.dw-vb-grid { display:grid;grid-template-columns:repeat(2,1fr);gap:8px;padding:10px;overflow-y:auto; }
.dw-vb-card { border:1px solid var(--app-border);border-radius:var(--app-radius-sm);overflow:hidden;cursor:pointer;transition:border-color .15s,box-shadow .15s;background:var(--app-panel-bg); }
.dw-vb-card:hover { border-color:var(--app-accent);box-shadow:var(--app-focus-ring); }
.dw-vb-card.dw-vb-card--selected { border-color:var(--app-accent);box-shadow:0 0 0 2px var(--app-accent); }
.dw-vb-card--noncompliant { opacity:.8; }
.dw-vb-card-thumb { width:100%;display:block;overflow:hidden;background:var(--app-surface-sunken); }
.dw-vb-card-thumb svg { display:block;width:100%;height:auto; }
.dw-vb-card-body { padding:6px 8px; }
.dw-vb-card-variant { font-size:10px;font-weight:700;color:var(--app-accent); }
.dw-vb-card-gia { font-size:11px;color:var(--app-text);font-family:var(--app-font); }
.dw-vb-card-adj { font-size:10px;color:var(--app-text-muted); }
.dw-vb-card-score { font-size:11px;color:var(--app-text);font-family:var(--app-font); }
.dw-vb-card-warn { font-size:10px;color:var(--app-status-warning-ink);margin-top:2px; }
.dw-vb-select-btn { display:none; }
.dw-vb-footer { display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--app-border);background:var(--app-bg);flex-wrap:wrap; }
.dw-vb-selected-label { font-size:11px;color:var(--app-text);flex:1;font-family:var(--app-font); }
.dw-vb-apply-btn { padding:6px 14px;background:var(--app-gradient);color:var(--app-on-accent);border:none;border-radius:var(--app-radius-sm);font-size:11px;font-weight:700;cursor:pointer;font-family:var(--app-font); }
.dw-vb-merge-btn { padding:6px 10px;background:none;border:1px solid var(--app-border);color:var(--app-text);border-radius:var(--app-radius-sm);font-size:11px;cursor:pointer;font-family:var(--app-font); }
.dw-vb-applied-ok { font-size:11px;color:var(--app-status-success-ink);font-weight:600;animation:dw-fadeout 3s forwards; }
@keyframes dw-fadeout { 0%,70%{opacity:1} 100%{opacity:0} }
.dw-vb-error { padding:20px;color:var(--app-status-error-ink);font-size:12px;font-family:var(--app-font); }
.dw-vb-merge-selectors { display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 12px;border-bottom:1px solid var(--app-border); }
.dw-vb-merge-col-title { font-size:10px;font-weight:700;color:var(--app-text-muted);margin-bottom:4px;text-transform:uppercase; }
.dw-vb-merge-hint { font-size:11px;color:var(--app-text-muted);padding:8px 12px;background:var(--app-bg); }
.dw-vb-merge-room-list { overflow-y:auto;max-height:200px;padding:8px 12px;display:flex;flex-direction:column;gap:4px; }
.dw-vb-merge-room-row { display:flex;align-items:center;gap:6px;font-size:11px;color:var(--app-text);cursor:pointer;font-family:var(--app-font); }

/* ── Design History panel: remove default dw-panel padding (§05 §2.1) ─── */
#dw-workbench .dw-panel[data-panel="design-history"] { padding: 0; }

/* ══════════════════════════════════════════════════════════════════════════════
   PHASE 1: BIM 3.0 LIFECYCLE HUB — Bucket Rail + Sub-tab Bar + Audit Split
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── Bucket Rail (replaces legacy dw-rail) ─────────────────────────────────── */
.dw-bucket-rail {
  width: 48px;
  flex-shrink: 0;
  background: var(--app-bg);
  border-right: 1px solid var(--app-border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 0;
  gap: 4px;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-width: none;
}
.dw-bucket-rail::-webkit-scrollbar { display: none; }

.dw-bucket-btn {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 0;
  position: relative;
  transition: background 0.14s, color 0.14s;
  color: var(--app-text-muted);
  flex-shrink: 0;
}
.dw-bucket-btn:hover {
  background: var(--app-wash-hover);
  color: var(--app-text);
}
.dw-bucket-btn--active {
  background: color-mix(in srgb, var(--bucket-color, var(--app-accent)) 10%, transparent);
  color: var(--bucket-color, var(--app-accent));
}
.dw-bucket-btn--active::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 22px;
  background: var(--bucket-color, var(--app-accent));
  border-radius: 0 3px 3px 0;
}
.dw-bucket-icon {
  font-size: 19px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
/* §DW-RAIL-ICON-ONLY (L-3301) — '.dw-bucket-label' DELETED, not restyled.
   It was 'font-size: 7.5px' clamped to 'max-width: 44px', which elides five of
   the seven bucket names. Widening the rail to fit "MEDICIONES" at a legible
   size costs ~70px of a panel the founder already reports as too cramped, so
   the label moves to a tooltip — the pattern '.dw-rail-btn::after' in this same
   sheet has used since the legacy rail. Same markup contract: 'content:
   attr(title)', and the button sets 'title' + 'aria-label'. */
.dw-bucket-btn::after {
  content: attr(title);
  position: absolute;
  left: calc(100% + 8px);
  top: 50%;
  transform: translateY(-50%);
  background: var(--app-text);
  color: var(--app-on-accent);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 4px 8px;
  border-radius: 5px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.13s;
  z-index: 9999;
  box-shadow: var(--app-shadow-hud);
}
.dw-bucket-btn:hover::after { opacity: 1; }

/* ── Lifecycle Header (replaces legacy dw-content-header) ─────────────────── */
.dw-content-header--lifecycle {
  height: auto;
  min-height: auto;
  padding: 0;
  flex-direction: column;
  align-items: stretch;
}

/* ── Bucket header strip — THE panel header, converged on Inspect ──────────── */
/* §DW-ONE-HEADER-BAND (L-3701). The comment above this rule used to say
   'like INSPECT / AUDIT header'. It was not like it, and the differences were
   the whole of what the founder called drift. Measured against '.aud-header'
   (panels/autonomous-auditor/auditStack.ts:38), the Inspect surface he named as
   the reference:

       property          Inspect '.aud-header'      Data (was)        Data (now)
       padding           14px 16px 12px             0 14px            14px 16px 12px
       height            auto                       44px fixed        auto
       box-shadow        var(--app-shadow-header)   NONE              var(--app-shadow-header)
       font-weight       700                        800 (on title)    700
       letter-spacing    0.10em                     0.1em             0.10em
       font-family       var(--app-font)            inherited         var(--app-font)

   Two of those are load-bearing rather than cosmetic. The missing box-shadow is
   the reason the Data header floated with no separation from the sub-tab row
   below it, so the two bands read as one thick slab; and the fixed 44px height
   cannot grow for the actions slot that 'justify-content: space-between' was
   already reserving. */
.dw-bucket-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 16px 12px;
  height: auto;
  flex-shrink: 0;
  /* Was 'var(--bucket-header-bg, <the gradient written out again>)'. MEASURED
     2026-08-21: NOTHING in this repo ever writes --bucket-header-bg, so the
     fallback was the value, always. A runtime hook nobody publishes is not
     configurability, it is a second copy of the token with a longer name. */
  background: var(--app-gradient);
  box-shadow: var(--app-shadow-header);
  color: var(--app-on-accent);
  font-family: var(--app-font);
}
.dw-bucket-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  /* The actions slot must never be crushed by a long bucket name. 'MEDICIONES'
     is the widest of the seven; min-width:0 lets THIS side ellipsise instead. */
  min-width: 0;
  overflow: hidden;
}
.dw-bucket-header-icon {
  font-size: 16px;
  line-height: 1;
  opacity: 0.9;
  flex-shrink: 0;
}
.dw-bucket-header-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--app-on-accent);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dw-bucket-header-count {
  font-size: 10px;
  font-weight: 600;
  background: var(--app-on-accent-veil);
  border-radius: 99px;
  padding: 2px 7px;
  color: var(--app-on-accent-dim);
  letter-spacing: 0.03em;
  flex-shrink: 0;
  white-space: nowrap;
}

/* ── Header actions slot (Inspect's '.aud-header-actions' equivalent) ─────── */
/* §DW-ONE-HEADER-BAND (L-3700) — this is where the deleted third band went. */
.dw-bucket-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.dw-header-ctl-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--app-on-accent-dim);
  white-space: nowrap;
  user-select: none;
}
/* A native <select> sitting ON the purple gradient. The closed control takes
   the veil treatment '.aud-header-btn' uses; the OPEN option list does NOT —
   and that distinction is the entire reason the 'option' rule below exists.

   ⛔ §DW-HEADER-TRANSPARENT (L-3300) was white-text-on-white-ground caused by a
   colour that silently failed to resolve. An unstyled 'option' is the same trap
   by a different route: Chromium paints the popup on the UA's own light ground
   while the option INHERITS 'color: var(--app-on-accent)' (#ffffff) from the
   select. Every option would be white on white — invisible, and invisible in a
   popup no screenshot of the panel would ever show. The option list is pinned
   to the panel's own surface tokens explicitly. */
.dw-header-select {
  background: var(--app-on-accent-veil);
  border: 1px solid var(--app-on-accent-veil-hover);
  border-radius: 4px;
  color: var(--app-on-accent);
  font-family: var(--app-font);
  font-size: 10px;
  font-weight: 600;
  padding: 3px 6px;
  max-width: 118px;
  cursor: pointer;
  outline: none;
  transition: background 0.13s, border-color 0.13s;
}
.dw-header-select:hover {
  background: var(--app-on-accent-veil-hover);
}
.dw-header-select:focus-visible {
  outline: 2px solid var(--app-on-accent);
  outline-offset: 1px;
}
.dw-header-select option {
  background: var(--app-panel-bg);
  color: var(--app-text);
  font-weight: 500;
}

/* ── Sub-tab Pill Bar ─────────────────────────────────────────────────────── */
.dw-subtab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-panel-bg);
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}
.dw-subtab-bar::-webkit-scrollbar { display: none; }

/* §DW-DEAD-CHROME-RULES (L-3702) — '.dw-bucket-chip' and '.dw-subtab-sep' were
   DELETED here, not restyled. They are the FOSSIL of the one-row header this
   panel was originally meant to have: a bucket chip, a separator glyph, then the
   sub-tab pills, all on a single strip. Measured 2026-08-22, repo-wide:

       rg 'dw-bucket-chip|dw-subtab-sep' --glob '*.{ts,tsx,js,html,css}'
         → 2 hits, BOTH of them these two rule declarations. Zero emitters.

   Keeping a rule for markup nothing produces is not harmless: it is the second
   half of a design that the header stack silently replaced, and the next reader
   cannot tell 'planned' from 'broken'. Recorded in the ISSUE-LOG instead. */

.dw-subtab-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 100px;
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
  font-family: var(--app-font);
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.dw-subtab-btn:hover {
  background: color-mix(in srgb, var(--bucket-color, var(--app-accent)) 8%, transparent);
  color: var(--bucket-color, var(--app-accent));
  border-color: color-mix(in srgb, var(--bucket-color, var(--app-accent)) 30%, transparent);
}
.dw-subtab-btn--active {
  background: color-mix(in srgb, var(--bucket-color, var(--app-accent)) 12%, transparent);
  color: var(--bucket-color, var(--app-accent));
  border-color: color-mix(in srgb, var(--bucket-color, var(--app-accent)) 35%, transparent);
}
.dw-subtab-icon {
  font-size: 12px;
  line-height: 1;
}

/* ── AUDIT Split Layout ─────────────────────────────────────────────────────── */
.dw-audit-split {
  display: flex;
  flex-direction: row;
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.dw-audit-tree-pane {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  transition: flex 0.22s ease;
  border-right: 1px solid var(--app-border);
}
.dw-audit-tree-pane--narrow {
  flex: 0 0 55%;
}

.dw-audit-sheet-pane {
  flex: 0 0 45%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--app-panel-bg);
  position: relative;
  transition: flex 0.22s ease, opacity 0.18s ease;
}
.dw-audit-sheet-pane--hidden {
  flex: 0 0 0%;
  overflow: hidden;
  pointer-events: none;
  opacity: 0;
}

.dw-audit-sheet-close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: var(--app-border);
  color: var(--app-text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: background 0.12s;
}
.dw-audit-sheet-close:hover {
  background: var(--app-border);
  color: var(--app-text);
}

/* ── Panel container adjustments for lifecycle hub ─────────────────────────── */
#dw-workbench .dw-panel {
  flex: 1;
  overflow: hidden;
  flex-direction: column;
}

/* ══════════════════════════════════════════════════════════════════════════════
   PHASE 2: VISUAL INTELLIGENCE OVERLAY — Heatmap Toolbar + Legend
   ══════════════════════════════════════════════════════════════════════════════ */

/* ── Visualizer / Heatmap Bar — DELETED. §DW-HEATMAP-BAR-HAD-NO-RULE (L-3703) ──
   THE THIRD BAND WAS UNSTYLED FOR ITS WHOLE LIFE, AND THE RULES FOR IT WERE
   SITTING RIGHT HERE UNDER A DIFFERENT NAME.

       DataWorkbench.ts emitted   .dw-heatmap-bar / .dw-heatmap-label
       this sheet declared        .dw-viz-bar     / .dw-viz-label

   Measured 2026-08-22, repo-wide:
       rg 'dw-heatmap' --glob '*.{ts,tsx,js,html,css}'  → 2 hits, both emitters
       rg 'dw-viz-bar|dw-viz-label' (same glob)         → 3 hits, all declarations

   ⛔ ABSENT vs UNREACHABLE (C01 §6.1). 'The heatmap bar has no styling' and 'the
   heatmap bar's styling is unreachable' look identical in the browser and have
   OPPOSITE fixes. This was the second: padding, a sunken ground, a bottom border
   and a 9px/700/uppercase muted label all existed and none of them could ever
   match. So the band shipped with 'Heatmap:' flush against x=0, no ground, no
   separator, and the label at the container's inherited 11.7px regular.

   §DW-ONE-HEADER-BAND (L-3700) moved the capability into the bucket header's
   actions slot, so '.dw-viz-btn' has no emitter either now. All four rules are
   deleted rather than renamed onto '.dw-heatmap-*': the markup they styled no
   longer exists, and a rule kept for markup nothing produces is exactly the
   condition that let this defect live. The legend rules BELOW are NOT dead —
   DataVisualizerService.ts emits '#dw-viz-legend' and '.dw-viz-legend-*'. */

/* ── Legend overlay (fixed, bottom-left of 3D viewport) ──────────────────────── */
#dw-viz-legend {
  position: fixed;
  bottom: 60px;
  left: 60px;
  z-index: 105;
  /* §PANEL-BRAND-STANDARD (L-1742) — this legend was the last DARK-THEME island
     in the Data surface: a slate-900 ground (rgba(15,23,42,0.82)) with
     white-at-alpha text and a white hairline, floating over a white product. It
     is now the same glass card every other floating PRYZM panel uses. */
  background: var(--app-panel-glass);
  backdrop-filter: var(--app-panel-glass-blur);
  -webkit-backdrop-filter: var(--app-panel-glass-blur);
  border: 1px solid var(--app-border);
  border-radius: var(--app-radius-md);
  box-shadow: var(--app-shadow-card);
  padding: 10px 12px;
  display: none;
  flex-direction: column;
  gap: 5px;
  min-width: 160px;
  font-family: var(--app-font);
  pointer-events: none;
}
#dw-viz-legend.dw-viz-legend--visible { display: flex; }

.dw-viz-legend-title {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--app-text-muted);
  margin-bottom: 3px;
}

.dw-viz-legend-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.dw-viz-legend-swatch {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  flex-shrink: 0;
}
.dw-viz-legend-text {
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text);
  white-space: nowrap;
}

/* ── Ghost volume tooltip (floating label on hover) ──────────────────────────── */
.dw-ghost-tooltip {
  position: fixed;
  z-index: 9999;
  background: var(--app-accent);
  color: var(--app-on-accent);
  font-size: 11px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 6px;
  pointer-events: none;
  white-space: nowrap;
  display: none;
}
`;
