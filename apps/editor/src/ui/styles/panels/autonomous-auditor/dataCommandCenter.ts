/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const DATA_COMMAND_CENTER_STYLES = `
/* ═══════════════════════════════════════════════════════════════════════════
   DCC — Data Command Center (F3 Shell)
   ═══════════════════════════════════════════════════════════════════════════ */

.dcc-shell {
  display: flex;
  flex-direction: row;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--app-bg);
}

/* Bucket Rail — 60px icon strip */
.dcc-bucket-rail {
  flex: 0 0 60px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 0;
  gap: 2px;
  background: var(--app-panel-bg);
  border-right: 1px solid var(--app-border);
}

.dcc-bucket-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  width: 48px;
  height: 52px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  transition: background 0.12s, color 0.12s;
}

.dcc-bucket-btn:hover {
  background: var(--app-bg);
  color: var(--app-text);
}

.dcc-bucket-btn.dcc-bucket-active {
  background: rgba(102, 0, 255, 0.08);
  color: var(--app-accent);
}

.dcc-bucket-icon {
  font-size: 18px;
  line-height: 1;
}

/* Filter tree */
.dcc-filter-tree {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--app-border);
  overflow: hidden;
  background: var(--app-panel-bg);
}

.dcc-filter-header {
  flex: 0 0 auto;
  padding: 0 12px;
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--app-gradient);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: #fff;
  text-transform: uppercase;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.dcc-filter-search {
  flex: 0 0 auto;
  padding: 6px 10px;
  border-bottom: 1px solid var(--app-border);
}

.dcc-filter-search input {
  width: 100%;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text);
  font-size: 11px;
  padding: 5px 8px;
  outline: none;
}

.dcc-filter-search input:focus {
  border-color: var(--app-accent);
}

.dcc-filter-tree-body {
  flex: 1;
  overflow-y: auto;
}

.dcc-tree-node {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 12px;
  color: var(--app-text);
  transition: background 0.1s;
  border-bottom: 1px solid var(--app-border-light);
}

.dcc-tree-node:hover {
  background: var(--app-bg);
}

.dcc-tree-node--selected {
  background: rgba(102, 0, 255, 0.07);
  color: var(--app-accent);
}

.dcc-tree-node-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.dcc-tree-node-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dcc-quick-filters {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 10px;
  border-top: 1px solid var(--app-border);
}

.dcc-quick-filter-btn {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 10px;
  border: 1px solid var(--app-border);
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
  transition: all 0.12s;
}

.dcc-quick-filter-btn:hover {
  border-color: var(--app-accent);
  color: var(--app-accent);
}

.dcc-qf-active {
  border-color: var(--app-accent);
  color: var(--app-accent);
}

/* Main content area */
.dcc-main {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
}

.dcc-bucket-content {
  flex: 1 1 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* PIP mini-map (floating bottom-right of dcc-main) */
.dcc-pip {
  position: absolute;
  bottom: 16px;
  right: 16px;
  width: 320px;
  height: 320px;
  background: var(--app-text);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  overflow: hidden;
  z-index: 50;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}

.dcc-pip-header {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 24px;
  background: var(--app-gradient);
  display: flex;
  align-items: center;
  padding: 0 8px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: #fff;
  text-transform: uppercase;
  z-index: 1;
}

.dcc-pip canvas {
  width: 100%;
  height: 100%;
}

`;
