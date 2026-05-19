/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const STRATEGIZE_STYLES = `
/* ═══════════════════════════════════════════════════════════════════════════
   STRAT — Strategize Bucket (F3 Bucket 1)
   ═══════════════════════════════════════════════════════════════════════════ */

.strat-shell {
  background: var(--app-panel-bg);
}

.strat-header {
  flex: 0 0 auto;
  padding: 0 16px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--app-gradient);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.07em;
  color: #fff;
  text-transform: uppercase;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.strat-briefer-toggle,
.strat-catalog-toggle {
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.35);
  background: rgba(255,255,255,0.12);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s;
}

.strat-briefer-toggle:hover,
.strat-catalog-toggle:hover {
  background: rgba(255,255,255,0.22);
}

.strat-autobriefing-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-bg);
}

.strat-autobriefing-bar input {
  flex: 1;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: 8px;
  color: var(--app-text);
  font-size: 12px;
  padding: 6px 10px;
  outline: none;
}

.strat-autobriefing-bar input:focus {
  border-color: var(--app-accent);
}

.strat-autobriefing-btn {
  padding: 6px 14px;
  border-radius: 8px;
  border: none;
  background: var(--app-gradient);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 5px;
}

/* Template master bar */
.strat-template-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 5px 12px;
  background: rgba(102, 0, 255, 0.04);
  border-bottom: 2px solid rgba(102, 0, 255, 0.15);
  font-size: 11px;
  color: var(--app-text);
}

.strat-propagate-btn {
  margin-left: auto;
  padding: 4px 12px;
  border-radius: 6px;
  border: 1px solid var(--app-accent);
  background: rgba(102, 0, 255, 0.06);
  color: var(--app-accent);
  font-size: 11px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: background 0.12s;
}

.strat-propagate-btn:hover {
  background: rgba(102, 0, 255, 0.12);
}

/* Power spreadsheet */
.strat-grid-container {
  flex: 1 1 0;
  overflow: auto;
  position: relative;
  background: var(--app-panel-bg);
}

.strat-grid {
  min-width: max-content;
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.strat-grid thead th {
  position: sticky;
  top: 0;
  z-index: 10;
  background: var(--app-bg);
  color: var(--app-text-muted);
  font-weight: 600;
  font-size: 10px;
  text-align: left;
  padding: 6px 10px;
  border-bottom: 2px solid var(--app-border);
  border-right: 1px solid var(--app-border-light);
  white-space: nowrap;
}

/* Sticky first column (Room ID) */
.strat-grid th:first-child,
.strat-grid td:first-child {
  position: sticky;
  left: 0;
  z-index: 8;
  background: var(--app-bg);
  border-right: 1px solid var(--app-border);
  min-width: 100px;
}

.strat-grid thead th:first-child {
  z-index: 11;
}

.strat-grid tbody tr {
  transition: background 0.1s;
  cursor: pointer;
}

.strat-grid tbody tr:hover {
  background: var(--app-bg);
}

.strat-grid tbody tr.strat-row-selected {
  background: rgba(102, 0, 255, 0.06);
}

.strat-grid tbody td {
  padding: 4px 10px;
  border-bottom: 1px solid var(--app-border-light);
  color: var(--app-text);
  vertical-align: middle;
  white-space: nowrap;
}

/* Blue = template-inherited */
.strat-cell-inherited {
  color: var(--app-accent);
}

.strat-cell-override {
  color: var(--app-text);
}

/* Asset pill tags */
.strat-asset-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  background: rgba(102, 0, 255, 0.08);
  border: 1px solid rgba(102, 0, 255, 0.25);
  border-radius: 10px;
  font-size: 10px;
  color: var(--app-accent);
  margin: 1px 2px;
}

.strat-asset-pill-remove {
  cursor: pointer;
  opacity: 0.6;
  font-size: 10px;
  line-height: 1;
  background: none;
  border: none;
  color: inherit;
  padding: 0;
}

.strat-asset-pill-remove:hover {
  opacity: 1;
}

/* Equipment catalog sidebar */
.strat-catalog-sidebar {
  flex: 0 0 350px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--app-border);
  background: var(--app-panel-bg);
  overflow: hidden;
}

.strat-catalog-header {
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
}

.strat-catalog-search {
  padding: 6px 10px;
  border-bottom: 1px solid var(--app-border);
}

.strat-catalog-search input {
  width: 100%;
  background: var(--app-bg);
  border: 1px solid var(--app-border);
  border-radius: 6px;
  color: var(--app-text);
  font-size: 11px;
  padding: 5px 8px;
  outline: none;
}

.strat-catalog-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.strat-catalog-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  cursor: grab;
  transition: background 0.1s;
  border-bottom: 1px solid var(--app-border-light);
}

.strat-catalog-card:hover {
  background: var(--app-bg);
}

.strat-catalog-card:active {
  cursor: grabbing;
}

.strat-catalog-icon {
  font-size: 20px;
  flex-shrink: 0;
  width: 28px;
  text-align: center;
}

.strat-catalog-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--app-text);
}

.strat-catalog-meta {
  font-size: 10px;
  color: var(--app-text-muted);
  margin-top: 2px;
}

.strat-catalog-empty {
  padding: 16px 12px;
  font-size: 11px;
  color: var(--app-text-muted);
  text-align: center;
}

/* ── Catalog "+" add-button ─────────────────────────────────────────────── */

.strat-catalog-add-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,255,255,0.35);
  border-radius: 4px;
  color: #fff;
  font-size: 15px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s;
}

.strat-catalog-add-btn:hover {
  background: rgba(255,255,255,0.28);
}

.strat-catalog-add-btn--active {
  background: rgba(255,255,255,0.35);
}

/* ── Catalog add-item form ──────────────────────────────────────────────── */

.strat-catalog-add-form {
  flex: 0 0 auto;
  padding: 10px 12px 8px;
  background: var(--app-bg);
  border-bottom: 1px solid var(--app-border);
}

.strat-catalog-add-row {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin-bottom: 7px;
}

.strat-catalog-add-dims {
  flex-direction: row;
  gap: 6px;
  align-items: flex-start;
}

.strat-catalog-add-dims > div {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.strat-catalog-add-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

.strat-catalog-add-input {
  width: 100%;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text);
  font-size: 11px;
  padding: 4px 6px;
  outline: none;
  box-sizing: border-box;
}

.strat-catalog-add-input:focus {
  border-color: var(--app-accent);
}

.strat-catalog-add-dim {
  width: 100%;
}

.strat-catalog-add-select {
  width: 100%;
  background: var(--app-panel-bg);
  border: 1px solid var(--app-border);
  border-radius: 4px;
  color: var(--app-text);
  font-size: 11px;
  padding: 4px 6px;
  outline: none;
  box-sizing: border-box;
  cursor: pointer;
}

.strat-catalog-add-select:focus {
  border-color: var(--app-accent);
}

.strat-catalog-add-actions {
  display: flex;
  gap: 6px;
  justify-content: flex-end;
  margin-top: 2px;
}

.strat-catalog-add-cancel,
.strat-catalog-add-submit {
  font-size: 11px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  border: 1px solid var(--app-border);
  transition: background 0.15s;
}

.strat-catalog-add-cancel {
  background: var(--app-panel-bg);
  color: var(--app-text-muted);
}

.strat-catalog-add-cancel:hover {
  background: var(--app-bg);
}

.strat-catalog-add-submit {
  background: var(--app-accent);
  color: #fff;
  border-color: var(--app-accent);
}

.strat-catalog-add-submit:hover {
  opacity: 0.88;
}

.strat-catalog-add-error {
  font-size: 10px;
  color: var(--app-error, #e55);
  margin-top: 6px;
  padding: 4px 6px;
  background: rgba(220, 50, 50, 0.08);
  border-radius: 4px;
}

`;
