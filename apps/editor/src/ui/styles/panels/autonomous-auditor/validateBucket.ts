/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const VALIDATE_STYLES = `
/* ═══════════════════════════════════════════════════════════════════════════
   VAL — Validate Bucket (F3 Bucket 3)
   ═══════════════════════════════════════════════════════════════════════════ */

.val-shell {
  background: var(--app-panel-bg);
}

.val-header {
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
  color: var(--app-on-accent);
  text-transform: uppercase;
  border-bottom: 1px solid var(--app-border);
  flex-shrink: 0;
}

.val-tab-bar {
  flex: 0 0 auto;
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-bg);
}

.val-tab-btn {
  padding: 4px 14px;
  font-size: 11px;
  border-radius: 6px;
  border: 1px solid var(--app-border);
  background: transparent;
  color: var(--app-text-muted);
  cursor: pointer;
  transition: all 0.12s;
}

.val-tab-btn:hover {
  border-color: var(--app-accent);
  color: var(--app-text);
}

.val-tab-active {
  border-color: var(--app-accent);
  background: var(--app-violet-soft);
  color: var(--app-accent);
  font-weight: 600;
}

.val-body {
  background: var(--app-panel-bg);
}

.val-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.val-table thead th {
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

.val-table tbody tr {
  transition: background 0.1s;
}

.val-table tbody tr:hover {
  background: var(--app-bg);
}

.val-table tbody td {
  padding: 5px 12px;
  border-bottom: 1px solid var(--app-border-light);
  color: var(--app-text);
  vertical-align: middle;
  white-space: nowrap;
}

.val-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 8px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
}

.val-badge--pass { background: var(--app-status-success-bg);  color: var(--app-status-success-ink); }
.val-badge--fail { background: var(--app-status-error-bg);  color: var(--app-status-error-ink); }
.val-badge--info { background: var(--app-violet-soft);  color: var(--app-accent); }

`;
