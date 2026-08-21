/* CONTRACT §05 §2 — CSS layer only, zero logic. All colours via var(--app-*) tokens. */
export const REQUIREMENT_STYLES = `
/* ═══════════════════════════════════════════════════════════════════════════
   REQ — Requirement Record Components (shared across all buckets)
   ═══════════════════════════════════════════════════════════════════════════ */

.req-status-dot {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  vertical-align: middle;
}

.req-status-dot.req-pass   { background: var(--app-status-success-ink); }
.req-status-dot.req-warn   { background: var(--app-status-warning-ink); }
.req-status-dot.req-fail   { background: var(--app-status-error-ink); }
.req-status-dot.req-miss   { background: var(--app-text-muted); }

.req-delta-positive { color: var(--app-status-warning-ink); }
.req-delta-negative { color: var(--app-accent); }
.req-delta-zero     { color: var(--app-status-success-ink); }

.req-metric-label {
  font-size: 11px;
  color: var(--app-text-muted);
}

.req-value {
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text);
  font-variant-numeric: tabular-nums;
}

.req-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 180px;
  color: var(--app-text-muted);
  font-size: 12px;
  text-align: center;
  padding: 20px;
}

.req-empty-icon {
  font-size: 32px;
  opacity: 0.5;
}

/* Shared table base (reused across Audit, Validate, Lifecycle) */
.req-data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.req-data-table thead th {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--app-bg);
  color: var(--app-text-muted);
  font-weight: 600;
  font-size: 10px;
  text-align: left;
  padding: 5px 10px;
  border-bottom: 1px solid var(--app-border);
  white-space: nowrap;
}

.req-data-table tbody tr {
  cursor: pointer;
  transition: background 0.1s;
}

.req-data-table tbody tr:hover {
  background: var(--app-bg);
}

.req-data-table tbody td {
  padding: 4px 10px;
  border-bottom: 1px solid var(--app-border-light);
  color: var(--app-text);
  vertical-align: middle;
  white-space: nowrap;
}

`;
