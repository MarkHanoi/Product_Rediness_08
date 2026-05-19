/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const AUDIT_STACK_STYLES = `

/* ═══════════════════════════════════════════════════════════════════════════
   AUD-STACK — Root container (Phase 1 — fixed right 50% panel in Inspect)
   ═══════════════════════════════════════════════════════════════════════════ */

#aud-stack {
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
}

#aud-stack.aud-stack--visible {
  display: flex;
}
/* ═══════════════════════════════════════════════════════════════════════════
   AUD — Audit Stack (F2 RHS)
   ═══════════════════════════════════════════════════════════════════════════ */

.aud-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #e8edf6;
}

.aud-header {
  flex: 0 0 auto;
  padding: 14px 16px 12px;
  height: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: linear-gradient(135deg, #8B5CF6 0%, #6600FF 100%);
  box-shadow: 0 2px 12px rgba(102,0,255,0.30);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.10em;
  color: #fff;
  text-transform: uppercase;
  flex-shrink: 0;
  font-family: var(--app-font);
}

.aud-header-actions {
  display: flex;
  gap: 6px;
}

.aud-header-btn {
  background: rgba(255,255,255,0.18);
  border: none;
  border-radius: 4px;
  color: #fff;
  font-size: 10px;
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
}

.aud-header-btn:hover {
  background: rgba(255,255,255,0.3);
}

/* Tree zone */
.aud-tree-zone {
  flex: 0 0 30%;
  overflow-y: auto;
  overflow-x: hidden;
  border-bottom: 1px solid var(--app-border);
  padding: 6px 0;
  background: var(--app-panel-bg);
}

.aud-tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px 4px 0;
  cursor: pointer;
  font-size: 12px;
  color: var(--app-text);
  transition: background 0.1s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.aud-tree-node:hover {
  background: var(--app-bg);
}

.aud-tree-node.aud-tree-selected {
  background: rgba(102, 0, 255, 0.07);
  color: var(--app-accent);
}

.aud-health-badge {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  padding: 1px 5px;
  border-radius: 8px;
  color: #fff;
  min-width: 34px;
  text-align: center;
}

/* Grid zone */
.aud-grid-zone {
  flex: 1 1 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  background: var(--app-panel-bg);
}

.aud-filter-pills {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--app-border);
}

.aud-filter-pill {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid var(--app-border);
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
  transition: all 0.12s;
}

.aud-filter-pill.aud-filter-active {
  border-color: var(--app-accent);
  background: rgba(102, 0, 255, 0.07);
  color: var(--app-accent);
}

/* Comparison table */
.aud-table {
  flex: 1 1 0;
  overflow-y: auto;
  font-size: 11px;
}

.aud-table-head {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--app-bg);
}

.aud-table-head tr th {
  padding: 5px 8px;
  text-align: left;
  font-size: 10px;
  font-weight: 600;
  color: var(--app-text-muted);
  border-bottom: 1px solid var(--app-border);
  white-space: nowrap;
}

.aud-table-body tr {
  cursor: pointer;
  transition: background 0.1s;
}

.aud-table-body tr:hover {
  background: var(--app-bg);
}

.aud-table-body tr.aud-row-hover {
  background: rgba(102, 0, 255, 0.05);
}

.aud-table-body td {
  padding: 4px 8px;
  border-bottom: 1px solid var(--app-border-light);
  color: var(--app-text);
  vertical-align: middle;
  white-space: nowrap;
}

.aud-status-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.aud-status-green  { background: #16a34a; box-shadow: 0 0 4px rgba(22,163,74,0.4); }
.aud-status-amber  { background: #d97706; box-shadow: 0 0 4px rgba(217,119,6,0.4); }
.aud-status-red    { background: #dc2626; box-shadow: 0 0 4px rgba(220,38,38,0.4); }

.aud-fix-btn {
  font-size: 10px;
  padding: 2px 7px;
  border-radius: 4px;
  border: 1px solid var(--app-accent);
  background: transparent;
  color: var(--app-accent);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}

.aud-fix-btn:hover {
  background: rgba(102, 0, 255, 0.08);
}

.aud-global-fix-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-top: none;
  background: #ffffff;
  margin: 4px 8px 8px;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(30,50,120,0.07), 0 1px 3px rgba(30,50,120,0.04);
}

.aud-global-fix-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  background: var(--app-gradient);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}

.aud-global-fix-btn:hover {
  opacity: 0.85;
}

.aud-health-summary {
  flex: 1;
  font-size: 11px;
  color: var(--app-text-muted);
}

/* ─────────────────────────────────────────────────────────────────────────────
   AuditStack v1.4 — Project Browser Tree + Element Selector + Content Zone
───────────────────────────────────────────────────────────────────────────── */

/* ── Section wrapper (project tree) ───────────────────────────────────────── */
.aud-tree-section {
  flex: 0 0 auto;
  border-bottom: none;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  max-height: 38%;
  overflow: hidden;
  margin: 8px 8px 0;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(30,50,120,0.07), 0 1px 3px rgba(30,50,120,0.04);
}

.aud-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px 8px;
  background: #ffffff;
  border-bottom: 1px solid #eef1f8;
  border-radius: 12px 12px 0 0;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
}

.aud-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  color: #5a6a85;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--app-font);
}

.aud-section-collapse {
  background: none;
  border: none;
  color: #c4cde0;
  font-size: 13px;
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  transition: color 0.12s;
}
.aud-section-collapse:hover { color: #5a6a85; }

/* ── Project tree scrollable body ─────────────────────────────────────────── */
/* flex: 1 1 0 collapses to 0px inside a flex: 0 0 auto parent — use an
   explicit min/max-height instead so the content is always visible.         */
.aud-project-tree {
  min-height: 180px;
  max-height: calc(38vh - 36px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 0 6px;
  background: #ffffff;
  border-radius: 0 0 12px 12px;
}
.aud-project-tree--collapsed { display: none; }

.aud-breadcrumb {
  font-size: 10px;
  color: #7a8aaa;
  padding: 4px 12px 2px;
  letter-spacing: 0.03em;
  font-family: var(--app-font);
}

.aud-search-wrap {
  padding: 4px 10px;
}

.aud-search {
  width: 100%;
  box-sizing: border-box;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text);
  font-size: 10px;
  padding: 3px 7px;
  outline: none;
  transition: border-color 0.15s;
}
.aud-search:focus { border-color: var(--app-accent); }
.aud-search::placeholder { color: var(--app-text-muted); }

.aud-tree-body {
  padding: 2px 0;
}

/* ── Tree row types ────────────────────────────────────────────────────────── */
.aud-tree-project-row,
.aud-tree-building-row,
.aud-tree-site-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 10px;
  font-size: 10px;
  color: var(--app-text-muted);
}

.aud-tree-dot {
  font-size: 10px;
  color: var(--app-accent);
}

.aud-tree-project-row .aud-tree-row-label {
  font-weight: 700;
  font-size: 10px;
  color: var(--app-text);
  letter-spacing: 0.06em;
}

.aud-tree-row-meta {
  margin-left: auto;
  font-size: 9px;
  color: var(--app-text-muted);
}

.aud-tree-level-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 0;
  cursor: pointer;
  font-size: 11px;
  color: var(--app-text);
  transition: background 0.1s;
}
.aud-tree-level-row:hover { background: var(--app-bg); }

.aud-tree-active-badge {
  margin-left: auto;
  font-size: 8px;
  font-weight: 700;
  background: var(--app-accent);
  color: #fff;
  padding: 1px 5px;
  border-radius: 8px;
  letter-spacing: 0.05em;
}

.aud-tree-expand-btn {
  background: none;
  border: none;
  color: var(--app-text-muted);
  font-size: 9px;
  cursor: pointer;
  padding: 0 2px;
  flex-shrink: 0;
  line-height: 1;
  transition: color 0.1s;
}
.aud-tree-expand-btn:hover { color: var(--app-text); }

.aud-tree-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: #8888aa;
}

.aud-tree-row-label {
  font-size: 11px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aud-tree-type-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 0;
  cursor: pointer;
  transition: background 0.1s;
}
.aud-tree-type-row:hover { background: var(--app-bg); }

.aud-tree-type-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--app-text-muted);
  text-transform: uppercase;
}

.aud-tree-type-count {
  margin-left: auto;
  font-size: 9px;
  color: var(--app-text-muted);
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  padding: 0 5px;
  border-radius: 8px;
  min-width: 18px;
  text-align: center;
}

.aud-tree-elem-row,
.aud-tree-child-row {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px 2px 0;
  cursor: pointer;
  font-size: 11px;
  color: var(--app-text);
  transition: background 0.1s;
  white-space: nowrap;
  overflow: hidden;
}
.aud-tree-elem-row:hover,
.aud-tree-child-row:hover { background: var(--app-bg); }

.aud-tree-elem-row.aud-tree-selected {
  background: rgba(102, 0, 255, 0.07);
  color: var(--app-accent);
}

.aud-tree-elem-icon {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  color: #8888aa;
}

.aud-tree-elem-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
}

.aud-tree-empty {
  padding: 12px 10px;
  font-size: 11px;
  color: var(--app-text-muted);
  text-align: center;
}

/* ── Element type selector ─────────────────────────────────────────────────── */
.aud-element-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: none;
  background: #ffffff;
  flex-shrink: 0;
  margin: 4px 8px 0;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(30,50,120,0.07), 0 1px 3px rgba(30,50,120,0.04);
}

.aud-selector-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  color: #5a6a85;
  text-transform: uppercase;
  flex-shrink: 0;
  font-family: var(--app-font);
}

.aud-element-dropdown {
  flex: 1;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text);
  font-size: 11px;
  padding: 3px 6px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}
.aud-element-dropdown:focus { border-color: var(--app-accent); }

/* ── Attribute selector row (below element type selector) ──────────────────── */
.aud-attr-selector {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-bottom: none;
  background: #ffffff;
  flex-shrink: 0;
  margin: 4px 8px 0;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(30,50,120,0.07), 0 1px 3px rgba(30,50,120,0.04);
}

.aud-attr-dropdown {
  flex: 1;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text);
  font-size: 11px;
  padding: 3px 6px;
  outline: none;
  cursor: pointer;
  transition: border-color 0.15s;
}
.aud-attr-dropdown:focus { border-color: var(--app-accent); }

/* ── Content zone (contains either discovery or audit grid) ────────────────── */
.aud-content-zone {
  flex: 1 1 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  margin: 4px 8px 0;
  border-radius: 12px;
  box-shadow: 0 2px 10px rgba(30,50,120,0.07), 0 1px 3px rgba(30,50,120,0.04);
}

/* ── Audit sub-header row ──────────────────────────────────────────────────── */
.aud-audit-subheader {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.aud-audit-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--app-accent);
}

.aud-audit-subtitle {
  font-size: 10px;
  color: var(--app-text-muted);
}

/* ── Audit room list (compact selection) ──────────────────────────────────── */
.aud-audit-room-list {
  border-bottom: 1px solid var(--app-border);
  max-height: 110px;
  overflow-y: auto;
  flex-shrink: 0;
}

.aud-audit-room-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  cursor: pointer;
  font-size: 11px;
  color: var(--app-text);
  transition: background 0.1s;
}
.aud-audit-room-row:hover { background: var(--app-bg); }
.aud-audit-room-row.aud-tree-selected {
  background: rgba(102, 0, 255, 0.07);
  color: var(--app-accent);
}

.aud-audit-room-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── Discovery Mode ────────────────────────────────────────────────────────── */
.aud-discovery-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px 5px;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.aud-discovery-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: rgb(0, 180, 220);
}

.aud-discovery-subtitle {
  font-size: 10px;
  color: var(--app-text-muted);
}

/* ── Discovery legend ──────────────────────────────────────────────────────── */
.aud-discovery-legend {
  padding: 5px 10px;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.aud-discovery-legend-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  color: var(--app-text-muted);
}

.aud-discovery-legend-swatch {
  flex: 1;
  height: 6px;
  border-radius: 3px;
  background: linear-gradient(to right, rgb(168,230,240), rgb(0,110,180));
}

/* ── Discovery room list ───────────────────────────────────────────────────── */
.aud-discovery-list {
  flex: 1 1 0;
  overflow-y: auto;
}

.aud-discovery-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 10px;
  cursor: pointer;
  transition: background 0.1s;
  border-bottom: 1px solid var(--app-border-light, rgba(255,255,255,0.04));
}
.aud-discovery-row:hover { background: var(--app-bg); }
.aud-discovery-row.aud-discovery-selected {
  background: rgba(0, 140, 210, 0.08);
}

.aud-discovery-swatch {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.15);
}

.aud-discovery-name {
  flex: 1;
  font-size: 11px;
  color: var(--app-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.aud-discovery-vals {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-shrink: 0;
}

.aud-disc-metric {
  font-size: 9px;
  color: var(--app-text-muted);
}

.aud-disc-value {
  font-size: 10px;
  font-weight: 600;
  color: rgb(0, 180, 220);
  font-variant-numeric: tabular-nums;
}

.aud-discovery-empty {
  padding: 20px 16px;
  font-size: 11px;
  color: var(--app-text-muted);
  text-align: center;
}

.aud-discovery-cta {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  font-size: 10px;
  color: var(--app-text-muted);
  border-top: 1px solid var(--app-border);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.aud-discovery-cta strong {
  color: var(--app-accent);
  font-size: 10px;
}

/* ── Discovery hover tooltip ───────────────────────────────────────────────── */
#aud-disc-tooltip,
.aud-disc-tooltip {
  position: fixed;
  z-index: 9999;
  display: none;
  background: var(--app-panel-bg, #1a1a2e);
  border: 1px solid rgba(0, 180, 220, 0.4);
  border-radius: 6px;
  padding: 8px 10px;
  min-width: 150px;
  max-width: 200px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
  pointer-events: none;
}

.aud-disc-tt-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--app-text);
  margin-bottom: 5px;
}

.aud-disc-tt-row {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--app-text-muted);
  margin-top: 2px;
}
.aud-disc-tt-row strong {
  color: rgb(0, 180, 220);
  font-size: 11px;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Polymorphic Matrix table (Phase 2 — non-room element type inspection)
   ═══════════════════════════════════════════════════════════════════════════ */

.aud-poly-count {
  flex: 0 0 auto;
  padding: 4px 10px 2px;
  font-size: 10px;
  color: var(--app-text-muted);
  letter-spacing: 0.04em;
}

.aud-matrix-th {
  cursor: pointer;
  user-select: none;
  transition: color 0.12s;
}

.aud-matrix-th:hover {
  color: var(--app-text);
}

.aud-matrix-th-active {
  color: var(--app-accent);
  border-bottom: 2px solid var(--app-accent);
}

.aud-matrix-cell-active {
  background: rgba(102, 0, 255, 0.04);
}

.aud-matrix-heat-bar {
  height: 2px;
  border-radius: 1px;
  margin-top: 3px;
  width: 100%;
  min-width: 24px;
}
`;
