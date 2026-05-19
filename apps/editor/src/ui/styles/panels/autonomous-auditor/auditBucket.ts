/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const AUDIT_BUCKET_STYLES = `
/* ═══════════════════════════════════════════════════════════════════════════
   AUDIT — Audit Bucket (F3 Bucket 2)
   ═══════════════════════════════════════════════════════════════════════════ */

.audit-shell {
  background: var(--app-panel-bg);
}

.audit-header {
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

.audit-toolbar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border-bottom: 1px solid var(--app-border);
  background: var(--app-bg);
}

.audit-toolbar-hint {
  font-size: 10px;
  color: var(--app-text-muted);
  flex: 1;
}

.audit-sync-btn {
  padding: 5px 14px;
  border-radius: 6px;
  border: none;
  background: var(--app-gradient);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 5px;
  transition: opacity 0.15s;
}

.audit-sync-btn:hover {
  opacity: 0.85;
}

.audit-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
  min-width: max-content;
}

.audit-table thead th {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--app-bg);
  color: var(--app-text-muted);
  font-weight: 600;
  font-size: 10px;
  text-align: left;
  padding: 5px 10px;
  border-bottom: 2px solid var(--app-border);
  white-space: nowrap;
}

.audit-table tbody tr {
  cursor: pointer;
  transition: background 0.1s;
}

.audit-table tbody tr:hover {
  background: var(--app-bg);
}

.audit-row--fail {
  background: rgba(220, 38, 38, 0.03);
}

.audit-table tbody td {
  padding: 4px 10px;
  border-bottom: 1px solid var(--app-border-light);
  color: var(--app-text);
  vertical-align: middle;
  white-space: nowrap;
}

.audit-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  white-space: nowrap;
}

.audit-badge--pass { background: rgba(22, 163, 74, 0.12);  color: #16a34a; }
.audit-badge--fail { background: rgba(220, 38, 38, 0.12);  color: #dc2626; }
.audit-badge--warn { background: rgba(217, 119, 6, 0.12);  color: #d97706; }
.audit-badge--info { background: rgba(102, 0, 255, 0.08);  color: var(--app-accent); }

.audit-cell--neg { color: #dc2626; font-weight: 600; }
.audit-cell--pos { color: #d97706; font-weight: 600; }

.audit-fix-btn {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--app-accent);
  background: transparent;
  color: var(--app-accent);
  cursor: pointer;
  transition: background 0.12s;
}

.audit-fix-btn:hover {
  background: rgba(102, 0, 255, 0.08);
}

.audit-status-bar {
  flex: 0 0 auto;
  padding: 6px 12px;
  font-size: 11px;
  color: var(--app-text-muted);
  border-top: 1px solid var(--app-border);
  background: var(--app-bg);
}

`;
