/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const LIFECYCLE_STYLES = `
/* ═══════════════════════════════════════════════════════════════════════════
   LIFE — Lifecycle Bucket (F3 Bucket 4)
   ═══════════════════════════════════════════════════════════════════════════ */

.life-shell {
  background: var(--app-panel-bg);
}

.life-header {
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

.life-filter-bar {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  padding: 6px 10px;
  flex-wrap: wrap;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-bg);
}

.life-filter-btn {
  padding: 3px 10px;
  border-radius: 10px;
  border: 1px solid var(--app-border);
  background: transparent;
  color: var(--app-text-muted);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.12s;
}

.life-filter-btn:hover {
  border-color: var(--app-accent);
  color: var(--app-text);
}

.life-filter-active {
  border-color: var(--app-accent);
  background: rgba(102, 0, 255, 0.07);
  color: var(--app-accent);
  font-weight: 600;
}

.life-body {
  background: var(--app-panel-bg);
}

.life-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.life-table thead th {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--app-bg);
  color: var(--app-text-muted);
  font-weight: 600;
  font-size: 10px;
  text-align: left;
  padding: 5px 12px;
  border-bottom: 2px solid var(--app-border);
  white-space: nowrap;
}

.life-table tbody tr {
  transition: background 0.1s;
}

.life-table tbody tr:hover {
  background: var(--app-bg);
}

.life-table tbody td {
  padding: 5px 12px;
  border-bottom: 1px solid var(--app-border-light);
  color: var(--app-text);
  vertical-align: middle;
  white-space: nowrap;
}

.life-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
}

.life-badge--ok      { background: rgba(22, 163, 74, 0.12);  color: #16a34a; }
.life-badge--due     { background: rgba(217, 119, 6, 0.12);  color: #d97706; }
.life-badge--overdue { background: rgba(220, 38, 38, 0.12);  color: #dc2626; }

`;
