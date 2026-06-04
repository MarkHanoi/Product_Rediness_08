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
  background: var(--app-panel-bg, #ffffff);
  border-left: 1px solid var(--app-border, #e2e8f0);
  box-shadow: -4px 0 24px rgba(15,23,42,0.08);
  z-index: 110;
  display: flex;
  flex-direction: row;
  font-family: var(--app-font, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
  font-size: 11.7px;
  color: var(--app-text, #1a2035);
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
  background: var(--app-bg, #f8faff);
  border-right: 1px solid var(--app-border, #e2e8f0);
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
  color: var(--app-text-muted, #94a3b8);
  flex-shrink: 0;
}
.dw-rail-btn:hover {
  background: var(--app-border-light, #eef1f8);
  color: var(--app-text, #1a2035);
}
.dw-rail-btn--active {
  background: rgba(102,0,255,0.09);
  color: var(--app-accent, #6600FF);
}
.dw-rail-btn--active::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: var(--app-accent, #6600FF);
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
  background: var(--app-text, #1a2035);
  color: #fff;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 8px;
  border-radius: 5px;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.13s;
  z-index: 9999;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
}
.dw-rail-btn:hover::after { opacity: 1; }

.dw-rail-sep {
  width: 20px;
  height: 1px;
  background: var(--app-border, #e2e8f0);
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
  border-bottom: 1px solid var(--app-border, #e2e8f0);
  background: var(--app-panel-bg, #ffffff);
}

.dw-content-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--app-text-muted, #94a3b8);
}

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
  color: var(--app-text-muted, #94a3b8);
  font-size: 13px;
  padding: 24px;
}
.dw-placeholder-icon {
  font-size: 28px;
  opacity: 0.3;
  margin-bottom: 4px;
}

/* ── Toolbar (inside panels) ─────────────────────────────────────────────── */
.dw-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  background: var(--app-bg, #f8faff);
  border-bottom: 1px solid var(--app-border-light, #eef1f8);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.dw-toolbar-btn {
  padding: 4px 9px;
  background: var(--app-panel-bg, #fff);
  border: 1px solid var(--app-border, #e2e8f0);
  border-radius: 6px;
  cursor: pointer;
  font-family: var(--app-font);
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text, #1a2035);
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  white-space: nowrap;
}
.dw-toolbar-btn:hover {
  background: rgba(102,0,255,0.07);
  border-color: var(--app-accent, #6600FF);
  color: var(--app-accent, #6600FF);
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
.dw-tree-scroll::-webkit-scrollbar-thumb { background: #d0d4e3; border-radius: 3px; }

/* ── Tree empty state ─────────────────────────────────────────────────────── */
.dw-tree-empty {
  padding: 24px 16px;
  text-align: center;
  color: var(--app-text-muted, #94a3b8);
  font-size: 12px;
  line-height: 1.6;
}

/* ── Auto-setup banner ────────────────────────────────────────────────────── */
.dw-banner {
  margin: 10px 10px 4px;
  padding: 11px 13px;
  background: linear-gradient(135deg, rgba(102,0,255,0.07) 0%, rgba(59,139,212,0.07) 100%);
  border: 1px solid rgba(102,0,255,0.18);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}
.dw-banner-text {
  font-size: 12px;
  color: var(--app-text, #1a2035);
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
.dw-banner-btn--primary { background: var(--app-accent, #6600FF); color: #fff; }
.dw-banner-btn--primary:hover { background: #7B3FF2; }
.dw-banner-btn--ghost {
  background: transparent;
  border: 1px solid var(--app-border, #e2e8f0);
  color: var(--app-text-2, #5a6a85);
}
.dw-banner-btn--ghost:hover { background: var(--app-border-light, #eef1f8); }

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
.dw-node:hover { background: rgba(102,0,255,0.06); }
.dw-node.dw-node--selected {
  background: rgba(102,0,255,0.10);
  border: 1px solid rgba(102,0,255,0.18);
}
.dw-node-indent { display: inline-block; flex-shrink: 0; }
.dw-node-expand {
  width: 16px; height: 16px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  font-size: 10px;
  color: var(--app-text-muted, #94a3b8);
  background: none; border: none; cursor: pointer; padding: 0;
  border-radius: 3px;
  transition: background 0.10s, transform 0.15s;
}
.dw-node-expand:hover { background: var(--app-border, #e2e8f0); }
.dw-node-expand.dw-node-expand--open { transform: rotate(90deg); }
.dw-node-expand--leaf { visibility: hidden; }
.dw-node-icon { flex-shrink: 0; font-size: 13px; line-height: 1; }
.dw-node-label {
  flex: 1;
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text, #1a2035);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dw-node-meta {
  font-size: 10px;
  color: var(--app-text-muted, #94a3b8);
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
  color: var(--app-text-muted, #94a3b8);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.dw-unassigned-sep::before, .dw-unassigned-sep::after {
  content: ''; flex: 1; height: 1px; background: var(--app-border-light, #eef1f8);
}
.dw-node--room .dw-node-label { font-weight: 400; color: var(--app-text-2, #5a6a85); }

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
  background: var(--app-panel-bg, #fff);
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.18);
  padding: 20px 22px;
  min-width: 300px;
  max-width: 400px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  font-family: var(--app-font, -apple-system, sans-serif);
}
.dw-dialog-title { font-size: 14px; font-weight: 700; color: var(--app-text, #1a2035); margin: 0; }
.dw-dialog-body { display: flex; flex-direction: column; gap: 8px; }
.dw-dialog-label {
  font-size: 11px; font-weight: 600;
  color: var(--app-text-muted, #94a3b8);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.dw-dialog-input {
  width: 100%; padding: 8px 10px;
  border: 1px solid var(--app-border, #e2e8f0);
  border-radius: 6px;
  font-family: var(--app-font); font-size: 13px;
  color: var(--app-text, #1a2035);
  box-sizing: border-box; outline: none;
  transition: border-color 0.12s;
}
.dw-dialog-input:focus { border-color: var(--app-accent, #6600FF); }
.dw-dialog-select {
  width: 100%; padding: 8px 10px;
  border: 1px solid var(--app-border, #e2e8f0);
  border-radius: 6px;
  font-family: var(--app-font); font-size: 12px;
  color: var(--app-text, #1a2035); background: #fff;
  box-sizing: border-box;
}
.dw-dialog-actions { display: flex; justify-content: flex-end; gap: 8px; }
.dw-dialog-btn {
  padding: 7px 16px; border-radius: 6px; border: none;
  cursor: pointer; font-family: var(--app-font); font-size: 12px; font-weight: 600;
}
.dw-dialog-btn--primary { background: var(--app-accent, #6600FF); color: #fff; }
.dw-dialog-btn--primary:hover { background: #7B3FF2; }
.dw-dialog-btn--cancel { background: var(--app-border-light, #eef1f8); color: var(--app-text-2, #5a6a85); }
.dw-dialog-btn--cancel:hover { background: var(--app-border, #e2e8f0); }
.dw-dialog-group { display: flex; flex-direction: column; gap: 4px; }

/* ── Tree rows ───────────────────────────────────────────────────────────── */
.dw-tree-row {
  display: flex; align-items: center;
  padding: 5px 10px; cursor: pointer;
  transition: background 0.10s; user-select: none; min-height: 28px;
}
.dw-tree-row:hover { background: rgba(102,0,255,0.06); }
.dw-tree-row--selected {
  background: rgba(102,0,255,0.10);
  border-left: 2px solid var(--app-accent, #6600FF);
}
.dw-tree-arrow { width: 14px; display: inline-block; cursor: pointer; font-size: 9px; opacity: 0.6; flex-shrink: 0; }
.dw-tree-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
.dw-tree-divider {
  padding: 4px 12px; font-size: 10px; font-weight: 600;
  color: var(--app-text-muted, #94a3b8); letter-spacing: 0.04em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  border-bottom: 1px solid var(--app-border-light, #eef1f8); margin: 2px 0;
}

/* ── Setup banner ────────────────────────────────────────────────────────── */
.dw-setup-banner {
  margin: 8px 10px; padding: 10px 12px;
  background: linear-gradient(135deg, rgba(102,0,255,0.07) 0%, rgba(59,139,212,0.07) 100%);
  border: 1px solid rgba(102,0,255,0.2); border-radius: 10px; flex-shrink: 0;
}

/* ── Data sheet sections ─────────────────────────────────────────────────── */
.dw-sheet-section { border-bottom: 1px solid var(--app-border-light, #eef1f8); }
.dw-sheet-section-header {
  padding: 8px 12px 6px;
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--app-text-muted, #94a3b8);
  background: var(--app-bg, #f8faff);
  border-bottom: 1px solid var(--app-border-light, #eef1f8);
  position: sticky; top: 0; z-index: 1;
}
.dw-sheet-content { padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }

/* ── Field groups ────────────────────────────────────────────────────────── */
.dw-field-group { display: flex; flex-direction: column; gap: 3px; }
.dw-field-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.04em; color: var(--app-text-muted, #94a3b8);
}
.dw-field-value { font-size: 13px; color: var(--app-text, #1a2035); padding: 2px 0; line-height: 1.4; }

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
  color: var(--app-text-muted, #94a3b8);
  border-bottom: 1px solid var(--app-border, #e2e8f0); letter-spacing: 0.04em;
}
.dw-comparison-table tbody tr { border-bottom: 1px solid var(--app-border-light, #eef1f8); }

/* ── Hierarchy filter bar ───────────────────────────────────────────────── */
.dw-filter-bar {
  padding: 6px 8px 4px; flex-shrink: 0;
  border-bottom: 1px solid var(--app-border-light, #eef1f8);
  background: var(--app-bg, #e8edf6);
}
.dw-filter-row {
  display: flex; align-items: center; gap: 4px; margin-bottom: 5px;
}
.dw-filter-input {
  flex: 1; padding: 4px 8px; font-size: 12px;
  border: 1px solid var(--app-border, #dde3f0);
  border-radius: var(--app-radius-sm, 6px);
  background: #fff; color: var(--app-text, #1a2035);
  font-family: var(--app-font, sans-serif); outline: none;
}
.dw-filter-input:focus { border-color: var(--app-accent, #6600FF); }
.dw-filter-input::placeholder { color: var(--app-text-muted, #7a8aaa); }
.dw-filter-clear {
  padding: 3px 7px; font-size: 11px; cursor: pointer;
  border: 1px solid var(--app-border, #dde3f0); border-radius: var(--app-radius-sm, 6px);
  background: #fff; color: var(--app-text-muted, #7a8aaa); flex-shrink: 0;
  font-family: var(--app-font, sans-serif); transition: background 0.1s;
}
.dw-filter-clear:hover { background: var(--app-border-light, #eef1f8); }
.dw-filter-pills { display: flex; flex-wrap: wrap; gap: 4px; }
.dw-filter-pill {
  padding: 2px 9px; font-size: 10px; font-weight: 600;
  border-radius: 100px; border: 1px solid var(--app-border, #dde3f0);
  background: #fff; color: var(--app-text-2, #5a6a85); cursor: pointer;
  font-family: var(--app-font, sans-serif); transition: all 0.12s; white-space: nowrap;
  letter-spacing: 0.02em;
}
.dw-filter-pill:hover { border-color: var(--app-accent, #6600FF); color: var(--app-accent, #6600FF); }
.dw-filter-pill--active {
  background: var(--app-accent, #6600FF); color: #fff;
  border-color: var(--app-accent, #6600FF);
}
.dw-filter-counter {
  padding: 4px 10px; font-size: 10px; font-weight: 600;
  color: var(--app-text-muted, #7a8aaa); letter-spacing: 0.03em;
  border-bottom: 1px solid var(--app-border-light, #eef1f8); flex-shrink: 0;
}
.dw-filter-item {
  display: flex; align-items: center; padding: 5px 10px 5px 14px;
  cursor: pointer; transition: background 0.1s; min-height: 26px; gap: 6px;
}
.dw-filter-item:hover { background: rgba(102,0,255,0.06); }
.dw-filter-item--selected { background: rgba(102,0,255,0.10); border-left: 2px solid var(--app-accent,#6600FF); }
.dw-filter-item-icon { font-size: 12px; flex-shrink: 0; }
.dw-filter-item-label { flex: 1; font-size: 12px; color: var(--app-text,#1a2035); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dw-filter-item-meta { font-size: 10px; color: var(--app-text-muted,#7a8aaa); white-space: nowrap; flex-shrink: 0; }
.dw-filter-item-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.dw-filter-empty {
  padding: 20px 12px; text-align: center;
  font-size: 12px; color: var(--app-text-muted,#7a8aaa); line-height: 1.6;
}

/* ── Workbench header (legacy compat) ─────────────────────────────────────── */
.dw-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 12px 8px;
  border-bottom: 1px solid var(--app-border-light, #eef1f8);
  flex-shrink: 0;
}
.dw-header-title {
  font-size: 12px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--app-text-muted, #94a3b8);
}
.dw-header-actions { display: flex; gap: 4px; align-items: center; }

/* ── Relationship Explorer Panel (dw-rel-*) ──────────────────────────────── */
/* Step 5: Moved from RelationshipExplorerPanel.ts independent injector to     */
/* AppTheme system per §05 §7.6. Colours corrected to light-theme tokens.      */
.dw-rel-panel {
  display: flex; flex-direction: column; height: 100%; overflow: hidden;
  font-family: var(--app-font, sans-serif); font-size: 12px;
  color: var(--app-text, #1a2035);
}
.dw-rel-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 14px; flex-shrink: 0;
  border-bottom: 1px solid var(--app-border, #dde3f0);
  background: var(--app-panel-bg, #ffffff);
}
.dw-rel-title {
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--app-text-muted, #7a8aaa);
}
.dw-rel-count { font-size: 11px; color: var(--app-text-muted, #7a8aaa); }
.dw-rel-infobar {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 14px; flex-shrink: 0;
  background: var(--app-bg, #e8edf6);
  border-bottom: 1px solid var(--app-border, #dde3f0);
}
.dw-rel-selected-label { color: var(--app-text-muted, #7a8aaa); font-size: 11px; }
.dw-rel-type-badge {
  background: var(--app-violet-soft, rgba(102,0,255,0.08));
  color: var(--app-accent, #6600FF);
  border-radius: 4px; padding: 1px 6px;
  font-size: 10px; font-weight: 600; text-transform: uppercase;
}
.dw-rel-selected-id {
  color: var(--app-accent, #6600FF);
  font-size: 11px; font-family: ui-monospace, monospace;
}
.dw-rel-list {
  flex: 1; overflow-y: auto; padding: 4px 0;
  scrollbar-width: thin; scrollbar-color: #c4cde0 transparent;
}
.dw-rel-list::-webkit-scrollbar { width: 4px; }
.dw-rel-list::-webkit-scrollbar-track { background: transparent; }
.dw-rel-list::-webkit-scrollbar-thumb { background: #c4cde0; border-radius: 3px; }
.dw-rel-group { margin-bottom: 1px; }
.dw-rel-group-label {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 14px;
  background: var(--app-bg, #e8edf6);
  cursor: default; user-select: none;
  position: sticky; top: 0; z-index: 1;
}
.dw-rel-icon { font-size: 12px; width: 16px; text-align: center; }
.dw-rel-type-name {
  flex: 1; font-size: 10px; font-weight: 700;
  color: var(--app-text-muted, #7a8aaa);
  text-transform: uppercase; letter-spacing: 0.06em;
}
.dw-rel-group-count {
  background: var(--app-violet-soft, rgba(102,0,255,0.08));
  color: var(--app-accent, #6600FF);
  border-radius: 10px; padding: 1px 6px;
  font-size: 10px; font-weight: 700;
}
.dw-rel-items {
  border-left: 2px solid var(--app-border, #dde3f0);
  margin-left: 22px;
}
.dw-rel-item {
  display: flex; align-items: center; gap: 6px;
  padding: 5px 10px 5px 8px; cursor: pointer;
  transition: background 0.10s;
  border-bottom: 1px solid var(--app-border-light, #eef1f8);
}
.dw-rel-item:hover { background: var(--app-violet-soft, rgba(102,0,255,0.06)); }
.dw-rel-dir {
  color: var(--app-accent, #6600FF); font-weight: 700;
  font-size: 13px; width: 16px;
}
.dw-rel-id {
  font-size: 11px; color: var(--app-text-2, #5a6a85);
  flex: 1; font-family: ui-monospace, monospace;
}
.dw-rel-meta {
  background: var(--app-bg, #e8edf6);
  border: 1px solid var(--app-border, #dde3f0);
  border-radius: 3px; padding: 1px 4px;
  font-size: 10px; color: var(--app-text-2, #5a6a85);
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
  color: var(--app-text-muted, #7a8aaa);
}
.dw-rel-empty-icon { font-size: 32px; opacity: 0.35; }
.dw-rel-empty-text { font-size: 12px; line-height: 1.5; }
.dw-rel-empty-hint {
  font-size: 11px; line-height: 1.5; max-width: 240px; opacity: 0.7;
}
.dw-rel-actions {
  display: flex; gap: 8px; padding: 8px 14px;
  border-top: 1px solid var(--app-border, #dde3f0);
  flex-shrink: 0; background: var(--app-panel-bg, #ffffff);
}
.dw-rel-action-btn {
  flex: 1; padding: 5px 10px;
  background: var(--app-panel-bg, #ffffff);
  border: 1px solid var(--app-border, #dde3f0);
  border-radius: var(--app-radius-sm, 6px);
  color: var(--app-text-2, #5a6a85);
  font-size: 11px; font-weight: 600; cursor: pointer;
  font-family: var(--app-font, sans-serif);
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.dw-rel-action-btn:hover {
  background: var(--app-violet-soft, rgba(102,0,255,0.06));
  border-color: var(--app-accent, #6600FF);
  color: var(--app-accent, #6600FF);
}
.dw-rel-action-btn--primary {
  background: var(--app-accent, #6600FF);
  border-color: var(--app-accent, #6600FF); color: #fff;
}
.dw-rel-action-btn--primary:hover {
  background: var(--app-violet-2, #7B3FF2);
  border-color: var(--app-violet-2, #7B3FF2);
}

/* ── Generative Design Panel (dw-gen-) ──────────────────────────────────── */
.dw-generative-panel { display:flex;flex-direction:column;gap:0;overflow:hidden;height:100%; }
.dw-gen-section-header { padding:10px 12px 6px;border-bottom:1px solid var(--app-border);background:var(--app-bg); }
.dw-gen-title { font-size:11px;font-weight:700;letter-spacing:.05em;color:var(--app-text-muted);margin-bottom:6px;text-transform:uppercase; }
.dw-gen-mode-toggle { display:flex;gap:4px; }
.dw-gen-mode-btn { padding:3px 10px;border:1px solid var(--app-border);border-radius:var(--app-radius-sm);background:transparent;font-size:11px;cursor:pointer;color:var(--app-text);font-family:var(--app-font); }
.dw-gen-mode-btn--active { background:var(--app-gradient);color:#fff;border-color:var(--app-accent); }
.dw-gen-mode-content { flex:1;overflow-y:auto;padding:10px 12px; }
.dw-gen-field-label { font-size:11px;font-weight:600;color:var(--app-text);margin-bottom:4px;font-family:var(--app-font); }
.dw-gen-textarea { width:100%;box-sizing:border-box;padding:8px;border:1px solid var(--app-border);border-radius:var(--app-radius-sm);font-size:12px;font-family:var(--app-font);resize:vertical;background:var(--app-panel-bg);color:var(--app-text); }
.dw-gen-parse-btn { margin-top:8px;width:100%;padding:7px;background:var(--app-gradient);color:#fff;border:none;border-radius:var(--app-radius-sm);font-size:12px;font-weight:600;cursor:pointer;font-family:var(--app-font); }
.dw-gen-parse-btn:disabled { opacity:.5;cursor:default; }
.dw-gen-hint { margin-top:6px;font-size:11px;color:var(--app-text-muted);line-height:1.5; }
.dw-gen-table-wrap { overflow-x:auto;margin-bottom:8px; }
.dw-gen-table { width:100%;border-collapse:collapse;font-size:11px; }
.dw-gen-table th { padding:4px 6px;background:var(--app-bg);border-bottom:1px solid var(--app-border);text-align:left;font-weight:600;color:var(--app-text);font-family:var(--app-font); }
.dw-gen-table td { padding:3px 4px;border-bottom:1px solid var(--app-border-light); }
.dw-gen-input { width:100%;box-sizing:border-box;padding:3px 5px;border:1px solid var(--app-border);border-radius:3px;font-size:11px;background:var(--app-panel-bg);color:var(--app-text);font-family:var(--app-font); }
.dw-gen-input--num { width:60px; }
.dw-gen-input--adj { min-width:160px; }
.dw-gen-remove-btn { background:none;border:none;color:var(--app-status-error, #c62828);cursor:pointer;font-size:12px;padding:2px 4px; }
.dw-gen-add-btn { font-size:11px;color:var(--app-accent);background:none;border:1px dashed var(--app-accent);padding:4px 10px;border-radius:var(--app-radius-sm);cursor:pointer;margin-bottom:10px;font-family:var(--app-font); }
.dw-gen-settings { margin:8px 0;display:flex;flex-direction:column;gap:6px; }
.dw-gen-settings-row { display:flex;align-items:center;gap:8px; }
.dw-gen-settings-label { font-size:11px;font-weight:600;color:var(--app-text);min-width:90px;font-family:var(--app-font); }
.dw-gen-bbox { display:flex;align-items:center;gap:4px;font-size:12px;color:var(--app-text); }
.dw-gen-bbox-sep { font-weight:700;color:var(--app-text-muted); }
.dw-gen-select { padding:4px 8px;border:1px solid var(--app-border);border-radius:var(--app-radius-sm);font-size:11px;background:var(--app-panel-bg);color:var(--app-text);font-family:var(--app-font); }
.dw-gen-generate-btn { width:100%;padding:9px;background:var(--app-gradient);color:#fff;border:none;border-radius:var(--app-radius-sm);font-size:13px;font-weight:700;cursor:pointer;margin-top:4px;letter-spacing:.01em;font-family:var(--app-font); }
.dw-gen-generate-btn:disabled { opacity:.5;cursor:default; }
.dw-gen-error { margin:8px 12px;padding:8px 10px;background:#fef2f2;border:1px solid #fca5a5;border-radius:var(--app-radius-sm);font-size:11px;color:#b91c1c; }
.dw-gen-success { margin:8px 12px;padding:8px 10px;background:#f0fdf4;border:1px solid #86efac;border-radius:var(--app-radius-sm);font-size:11px;color:#15803d;line-height:1.5; }
.dw-gen-advisory { padding:10px 12px;border-top:1px solid var(--app-border); }
.dw-gen-advisory-title { font-size:11px;font-weight:700;color:#d97706;margin-bottom:6px; }
.dw-gen-advisory-card { background:#fffbeb;border:1px solid #fde68a;border-radius:var(--app-radius-sm);padding:8px 10px;margin-bottom:6px; }
.dw-gen-advisory-card-title { font-size:11px;font-weight:700;color:#92400e;margin-bottom:2px; }
.dw-gen-advisory-card-desc { font-size:11px;color:#78350f;line-height:1.5;margin-bottom:4px; }
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
.dw-vb-card:hover { border-color:var(--app-accent);box-shadow:0 0 0 2px rgba(102,0,255,0.15); }
.dw-vb-card.dw-vb-card--selected { border-color:var(--app-accent);box-shadow:0 0 0 2px rgba(102,0,255,0.25); }
.dw-vb-card--noncompliant { opacity:.8; }
.dw-vb-card-thumb { width:100%;display:block;overflow:hidden;background:#f8fafc; }
.dw-vb-card-thumb svg { display:block;width:100%;height:auto; }
.dw-vb-card-body { padding:6px 8px; }
.dw-vb-card-variant { font-size:10px;font-weight:700;color:var(--app-accent); }
.dw-vb-card-gia { font-size:11px;color:var(--app-text);font-family:var(--app-font); }
.dw-vb-card-adj { font-size:10px;color:var(--app-text-muted); }
.dw-vb-card-score { font-size:11px;color:var(--app-text);font-family:var(--app-font); }
.dw-vb-card-warn { font-size:10px;color:#d97706;margin-top:2px; }
.dw-vb-select-btn { display:none; }
.dw-vb-footer { display:flex;align-items:center;gap:8px;padding:8px 12px;border-top:1px solid var(--app-border);background:var(--app-bg);flex-wrap:wrap; }
.dw-vb-selected-label { font-size:11px;color:var(--app-text);flex:1;font-family:var(--app-font); }
.dw-vb-apply-btn { padding:6px 14px;background:var(--app-gradient);color:#fff;border:none;border-radius:var(--app-radius-sm);font-size:11px;font-weight:700;cursor:pointer;font-family:var(--app-font); }
.dw-vb-merge-btn { padding:6px 10px;background:none;border:1px solid var(--app-border);color:var(--app-text);border-radius:var(--app-radius-sm);font-size:11px;cursor:pointer;font-family:var(--app-font); }
.dw-vb-applied-ok { font-size:11px;color:#16a34a;font-weight:600;animation:dw-fadeout 3s forwards; }
@keyframes dw-fadeout { 0%,70%{opacity:1} 100%{opacity:0} }
.dw-vb-error { padding:20px;color:#b91c1c;font-size:12px;font-family:var(--app-font); }
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
  width: 56px;
  flex-shrink: 0;
  background: var(--app-bg, #f8faff);
  border-right: 1px solid var(--app-border, #e2e8f0);
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
  width: 44px;
  height: 54px;
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
  color: var(--app-text-muted, #94a3b8);
  flex-shrink: 0;
}
.dw-bucket-btn:hover {
  background: rgba(0,0,0,0.05);
  color: var(--app-text, #1a2035);
}
.dw-bucket-btn--active {
  background: color-mix(in srgb, var(--bucket-color, #6600FF) 10%, transparent);
  color: var(--bucket-color, #6600FF);
}
.dw-bucket-btn--active::before {
  content: '';
  position: absolute;
  left: -1px;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 28px;
  background: var(--bucket-color, #6600FF);
  border-radius: 0 3px 3px 0;
}
.dw-bucket-icon {
  font-size: 18px;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dw-bucket-label {
  font-size: 7.5px;
  font-weight: 700;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  max-width: 44px;
  text-overflow: ellipsis;
  text-align: center;
}

/* ── Lifecycle Header (replaces legacy dw-content-header) ─────────────────── */
.dw-content-header--lifecycle {
  height: auto;
  min-height: auto;
  padding: 0;
  flex-direction: column;
  align-items: stretch;
}

/* ── Bucket header strip (like INSPECT / AUDIT header) ────────────────────── */
.dw-bucket-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 14px;
  height: 44px;
  flex-shrink: 0;
  background: var(--bucket-header-bg, linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%));
  color: #fff;
}
.dw-bucket-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dw-bucket-header-icon {
  font-size: 16px;
  line-height: 1;
  opacity: 0.9;
}
.dw-bucket-header-title {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #fff;
}
.dw-bucket-header-count {
  font-size: 10px;
  font-weight: 600;
  background: rgba(255,255,255,0.18);
  border-radius: 99px;
  padding: 2px 7px;
  color: rgba(255,255,255,0.9);
  letter-spacing: 0.03em;
}

/* ── Sub-tab Pill Bar ─────────────────────────────────────────────────────── */
.dw-subtab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--app-border, #e2e8f0);
  background: var(--app-panel-bg, #fff);
  flex-wrap: nowrap;
  overflow-x: auto;
  scrollbar-width: none;
  flex-shrink: 0;
}
.dw-subtab-bar::-webkit-scrollbar { display: none; }

.dw-bucket-chip {
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--bucket-color, #6600FF);
  padding: 2px 7px;
  background: color-mix(in srgb, var(--bucket-color, #6600FF) 10%, transparent);
  border-radius: 100px;
  white-space: nowrap;
  flex-shrink: 0;
}

.dw-subtab-sep {
  font-size: 11px;
  color: var(--app-border, #e2e8f0);
  flex-shrink: 0;
  user-select: none;
}

.dw-subtab-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 100px;
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
  font-family: var(--app-font, sans-serif);
  font-size: 11px;
  font-weight: 600;
  color: var(--app-text-muted, #94a3b8);
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.dw-subtab-btn:hover {
  background: color-mix(in srgb, var(--bucket-color, #6600FF) 8%, transparent);
  color: var(--bucket-color, #6600FF);
  border-color: color-mix(in srgb, var(--bucket-color, #6600FF) 30%, transparent);
}
.dw-subtab-btn--active {
  background: color-mix(in srgb, var(--bucket-color, #6600FF) 12%, transparent);
  color: var(--bucket-color, #6600FF);
  border-color: color-mix(in srgb, var(--bucket-color, #6600FF) 35%, transparent);
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
  border-right: 1px solid var(--app-border, #e2e8f0);
}
.dw-audit-tree-pane--narrow {
  flex: 0 0 55%;
}

.dw-audit-sheet-pane {
  flex: 0 0 45%;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--app-panel-bg, #fff);
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
  background: var(--app-border, #e2e8f0);
  color: var(--app-text-muted, #94a3b8);
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
  background: var(--app-border, #dde3f0);
  color: var(--app-text, #1a2035);
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

/* ── Visualizer / Heatmap Bar (below sub-tab strip in AUDIT bucket) ──────────── */
.dw-viz-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
  background: #fafafa;
  border-bottom: 1px solid var(--app-border, #e2e8f0);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
}
.dw-viz-bar::-webkit-scrollbar { display: none; }

.dw-viz-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--app-text-muted, #94a3b8);
  white-space: nowrap;
  flex-shrink: 0;
  margin-right: 4px;
}

.dw-viz-btn {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 9px;
  border-radius: 100px;
  border: 1px solid var(--app-border, #e2e8f0);
  background: var(--app-panel-bg, #fff);
  cursor: pointer;
  font-family: var(--app-font, sans-serif);
  font-size: 10px;
  font-weight: 600;
  color: var(--app-text-muted, #94a3b8);
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.dw-viz-btn:hover {
  background: rgba(59,139,212,0.08);
  border-color: #3B8BD4;
  color: #3B8BD4;
}
.dw-viz-btn--active {
  background: #3B8BD4;
  border-color: #3B8BD4;
  color: #fff;
}

/* ── Legend overlay (fixed, bottom-left of 3D viewport) ──────────────────────── */
#dw-viz-legend {
  position: fixed;
  bottom: 60px;
  left: 60px;
  z-index: 105;
  background: rgba(15,23,42,0.82);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 10px 12px;
  display: none;
  flex-direction: column;
  gap: 5px;
  min-width: 160px;
  font-family: var(--app-font, sans-serif);
  pointer-events: none;
}
#dw-viz-legend.dw-viz-legend--visible { display: flex; }

.dw-viz-legend-title {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.5);
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
  color: rgba(255,255,255,0.85);
  white-space: nowrap;
}

/* ── Ghost volume tooltip (floating label on hover) ──────────────────────────── */
.dw-ghost-tooltip {
  position: fixed;
  z-index: 9999;
  background: rgba(147,51,234,0.90);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 5px 10px;
  border-radius: 6px;
  pointer-events: none;
  white-space: nowrap;
  display: none;
}
`;
