/**
 * @file src/styles/panels/syncStateDrawer.ts
 *
 * CSS module for SyncStateDetailDrawer (Gap 1 — Phase 2.1).
 * Class prefix: ssd-  (Sync State Detail)
 *
 * CONTRACT §05 §2.1 — CSS prefix `ssd-` is reserved for SyncStateDetailDrawer.
 */

export const SSD_STYLES = `

/* ── Backdrop ──────────────────────────────────────────────────────────────── */

.ssd-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9100;
    background: transparent;
}

/* ── Drawer panel ──────────────────────────────────────────────────────────── */

.ssd-panel {
    position: fixed;
    z-index: 9101;
    width: 320px;
    max-height: 480px;
    background: var(--app-surface-raised, #1e2740);
    border: 1px solid var(--app-border, #2a3550);
    border-radius: 8px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.45);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--app-font, 'Inter', sans-serif);
    font-size: 12px;
    color: var(--app-text, #dce3f4);
    animation: ssd-slide-in 120ms ease-out;
}

@keyframes ssd-slide-in {
    from { opacity: 0; transform: translateY(-6px) scale(0.98); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── Header ────────────────────────────────────────────────────────────────── */

.ssd-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px 10px 14px;
    border-bottom: 1px solid var(--app-border, #2a3550);
    flex-shrink: 0;
}

.ssd-node-name {
    flex: 1;
    font-weight: 600;
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--app-text, #dce3f4);
}

.ssd-template-name {
    font-size: 11px;
    color: var(--app-text-muted, #7a8aaa);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 110px;
}

.ssd-state-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 7px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    flex-shrink: 0;
}

.ssd-close-btn {
    width: 22px;
    height: 22px;
    border: none;
    background: none;
    color: var(--app-text-muted, #7a8aaa);
    cursor: pointer;
    border-radius: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    padding: 0;
    flex-shrink: 0;
    transition: background 0.1s, color 0.1s;
}
.ssd-close-btn:hover {
    background: var(--app-surface-hover, rgba(255,255,255,0.06));
    color: var(--app-text, #dce3f4);
}

/* ── Body ──────────────────────────────────────────────────────────────────── */

.ssd-body {
    flex: 1;
    overflow-y: auto;
    padding: 6px 0;
}

.ssd-body::-webkit-scrollbar { width: 4px; }
.ssd-body::-webkit-scrollbar-track { background: transparent; }
.ssd-body::-webkit-scrollbar-thumb { background: var(--app-border, #2a3550); border-radius: 2px; }

/* ── Empty state ───────────────────────────────────────────────────────────── */

.ssd-empty {
    padding: 24px 16px;
    text-align: center;
    color: var(--app-text-muted, #7a8aaa);
    font-size: 12px;
    line-height: 1.6;
}

.ssd-empty-icon {
    font-size: 22px;
    margin-bottom: 6px;
}

/* ── Section label ─────────────────────────────────────────────────────────── */

.ssd-section-label {
    padding: 8px 14px 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--app-text-muted, #7a8aaa);
}

/* ── Check row ─────────────────────────────────────────────────────────────── */

.ssd-check {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 6px 14px;
    border-bottom: 1px solid rgba(255,255,255,0.04);
    cursor: default;
    transition: background 0.1s;
}
.ssd-check:last-child { border-bottom: none; }
.ssd-check:hover { background: var(--app-surface-hover, rgba(255,255,255,0.03)); }

.ssd-check-icon {
    font-size: 13px;
    flex-shrink: 0;
    margin-top: 1px;
    width: 16px;
    text-align: center;
}

.ssd-check-body {
    flex: 1;
    min-width: 0;
}

.ssd-check-label {
    font-weight: 600;
    font-size: 11px;
    color: var(--app-text, #dce3f4);
    margin-bottom: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.ssd-check-pair {
    display: flex;
    flex-direction: column;
    gap: 1px;
}

.ssd-check-row {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
}

.ssd-check-row-label {
    color: var(--app-text-muted, #7a8aaa);
    min-width: 46px;
    flex-shrink: 0;
}

.ssd-check-row-value {
    color: var(--app-text, #dce3f4);
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.ssd-check-delta {
    display: inline-flex;
    align-items: center;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    background: rgba(226,75,74,0.18);
    color: #E24B4A;
    margin-top: 3px;
}

.ssd-derived-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 1px 5px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    background: rgba(239,159,39,0.18);
    color: #EF9F27;
    margin-top: 3px;
}

/* ── State badge colour variants ───────────────────────────────────────────── */

.ssd-state--synced    { background: rgba(29,158,117,0.22); color: #1D9E75; }
.ssd-state--conflict  { background: rgba(226,75,74,0.22);  color: #E24B4A; }
.ssd-state--partial   { background: rgba(59,139,212,0.22); color: #3B8BD4; }
.ssd-state--derived   { background: rgba(239,159,39,0.22); color: #EF9F27; }
.ssd-state--planned-only { background: rgba(209,213,219,0.15); color: #d1d5db; }
.ssd-state--no-template  { background: rgba(156,163,175,0.15); color: #9ca3af; }

/* ── Footer actions ────────────────────────────────────────────────────────── */

.ssd-footer {
    padding: 8px 12px;
    border-top: 1px solid var(--app-border, #2a3550);
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    flex-wrap: wrap;
}

.ssd-action-btn {
    flex: 1;
    min-width: 80px;
    padding: 5px 8px;
    border: 1px solid var(--app-border, #2a3550);
    border-radius: 5px;
    background: var(--app-surface, #16203a);
    color: var(--app-text, #dce3f4);
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.12s, border-color 0.12s;
    text-align: center;
    white-space: nowrap;
}
.ssd-action-btn:hover {
    background: var(--app-surface-hover, rgba(255,255,255,0.06));
    border-color: var(--app-accent, #3B8BD4);
}
.ssd-action-btn--primary {
    background: rgba(59,139,212,0.18);
    border-color: rgba(59,139,212,0.4);
    color: #3B8BD4;
}
.ssd-action-btn--primary:hover {
    background: rgba(59,139,212,0.28);
    border-color: #3B8BD4;
}
.ssd-action-btn--warn {
    background: rgba(239,159,39,0.15);
    border-color: rgba(239,159,39,0.35);
    color: #EF9F27;
}
.ssd-action-btn--warn:hover {
    background: rgba(239,159,39,0.25);
    border-color: #EF9F27;
}

`;
