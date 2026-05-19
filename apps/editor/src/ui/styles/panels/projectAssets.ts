/**
 * @file src/styles/panels/projectAssets.ts
 *
 * CSS for Project Member Panel, CDE Version Panel, Name Builder.
 * CONTRACT §05 §2 — CSS layer only, zero logic.
 */
export const PROJECT_MEMBER_PANEL_STYLES = `
.mp-panel { display:flex; flex-direction:column; gap:0; width:100%; }
.mp-panel-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; }
.mp-panel-title { font-size:15px; font-weight:700; color:var(--app-text); }
.mp-member-count { font-size:12px; color:var(--app-text-muted,#888); background:var(--app-surface,#f3f4f6); border-radius:10px; padding:2px 8px; }
.mp-invite-form { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
.mp-invite-input { flex:1; min-width:140px; padding:7px 10px; border:1px solid var(--app-border,#dde3f0); border-radius:6px; font-size:13px; background:var(--app-bg,#e8edf6); color:var(--app-text); outline:none; }
.mp-invite-input:focus { border-color:var(--app-accent,#6600FF); box-shadow:0 0 0 2px rgba(102,0,255,0.12); }
.mp-role-select { padding:7px 10px; border:1px solid var(--app-border,#dde3f0); border-radius:6px; font-size:12px; background:var(--app-bg,#e8edf6); color:var(--app-text); outline:none; cursor:pointer; }
.mp-role-select:focus { border-color:var(--app-accent,#6600FF); }
.mp-invite-btn { padding:7px 14px; background:var(--app-gradient,linear-gradient(135deg,#6600FF,#8B3FF2)); color:#fff; border:none; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; white-space:nowrap; transition:opacity 0.15s; }
.mp-invite-btn:hover { opacity:0.88; }
.mp-invite-btn:disabled { opacity:0.5; cursor:not-allowed; }
.mp-error { font-size:12px; color:#dc2626; margin-bottom:8px; padding:6px 10px; background:#fef2f2; border-radius:5px; border:1px solid #fecaca; }
.mp-member-list { display:flex; flex-direction:column; gap:6px; }
.mp-member-row { display:flex; align-items:center; gap:10px; padding:8px 10px; background:var(--app-surface,#f3f4f6); border-radius:8px; border:1px solid var(--app-border,#dde3f0); }
.mp-member-avatar { width:30px; height:30px; border-radius:50%; background:var(--app-gradient,linear-gradient(135deg,#6600FF,#8B3FF2)); color:#fff; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; flex-shrink:0; }
.mp-member-info { flex:1; min-width:0; }
.mp-member-name { font-size:13px; font-weight:600; color:var(--app-text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mp-member-email { font-size:11px; color:var(--app-text-muted,#888); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.mp-member-role-badge { font-size:11px; font-weight:600; padding:2px 8px; border-radius:10px; background:rgba(102,0,255,0.1); color:var(--app-accent,#6600FF); white-space:nowrap; }
.mp-member-role-select { font-size:11px; padding:3px 6px; border:1px solid var(--app-border,#dde3f0); border-radius:5px; background:var(--app-bg,#e8edf6); color:var(--app-text); outline:none; cursor:pointer; }
.mp-remove-btn { padding:3px 8px; font-size:11px; color:#dc2626; background:transparent; border:1px solid #fecaca; border-radius:5px; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
.mp-remove-btn:hover { background:#fef2f2; }
.mp-pending-badge { font-size:10px; padding:2px 6px; background:#fff7ed; color:#d97706; border-radius:8px; border:1px solid #fed7aa; }
.mp-empty { text-align:center; color:var(--app-text-muted,#888); font-size:13px; padding:24px 0; }
.mp-loading { text-align:center; color:var(--app-text-muted,#888); font-size:13px; padding:16px 0; opacity:0.7; }
`;

export const CDE_VERSION_PANEL_STYLES = `
.vs-panel { display:flex; flex-direction:column; gap:12px; width:100%; }
.vs-version-card { background:var(--app-surface,#f3f4f6); border:1px solid var(--app-border,#dde3f0); border-radius:10px; overflow:hidden; }
.vs-card-header { display:flex; align-items:center; gap:10px; padding:10px 14px; border-bottom:1px solid var(--app-border,#dde3f0); }
.vs-state-badge { font-size:11px; font-weight:700; padding:3px 9px; border-radius:10px; letter-spacing:0.03em; }
.vs-state-badge--wip       { background:#fff7ed; color:#d97706; border:1px solid #fed7aa; }
.vs-state-badge--shared    { background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; }
.vs-state-badge--published { background:#f0fdf4; color:#16a34a; border:1px solid #bbf7d0; }
.vs-state-badge--archived  { background:#f9fafb; color:#6b7280; border:1px solid #e5e7eb; }
.vs-version-label { font-size:13px; font-weight:700; color:var(--app-text); flex:1; }
.vs-version-meta { font-size:11px; color:var(--app-text-muted,#888); }
.vs-card-body { padding:10px 14px; }
.vs-field-row { display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap; }
.vs-field { font-size:11px; color:var(--app-text-muted,#888); }
.vs-field strong { color:var(--app-text); font-weight:600; }
.vs-filename { font-size:11px; font-family:monospace; color:var(--app-accent,#6600FF); background:rgba(102,0,255,0.06); padding:3px 8px; border-radius:5px; word-break:break-all; margin-bottom:8px; }
.vs-transition-row { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
.vs-transition-btn { font-size:12px; font-weight:600; padding:5px 12px; border-radius:6px; border:none; cursor:pointer; transition:opacity 0.15s; }
.vs-transition-btn:hover { opacity:0.85; }
.vs-transition-btn--share    { background:rgba(59,130,246,0.08);   color:var(--cde-state-shared);    border:1px solid rgba(59,130,246,0.25); }
.vs-transition-btn--publish  { background:rgba(22,163,74,0.08);    color:var(--cde-state-published); border:1px solid rgba(22,163,74,0.25); }
.vs-transition-btn--archive  { background:rgba(107,114,128,0.08);  color:var(--cde-state-archived);  border:1px solid rgba(107,114,128,0.25); }
.vs-transition-btn--reject   { background:rgba(239,68,68,0.08);    color:var(--cde-state-wip);       border:1px solid rgba(239,68,68,0.25); }
.vs-rejection-row { display:flex; gap:6px; margin-top:6px; align-items:center; flex-wrap:wrap; }
.vs-rejection-input { flex:1; min-width:160px; font-size:12px; padding:5px 8px; border:1px solid var(--app-border,#dde3f0); border-radius:5px; background:var(--app-bg,#e8edf6); color:var(--app-text); outline:none; }
.vs-rejection-input:focus { border-color:var(--cde-state-wip); }
.vs-rejection-confirm-btn { font-size:12px; padding:5px 12px; background:var(--cde-state-wip); color:#fff; border:none; border-radius:5px; cursor:pointer; }
.vs-audit-dot { width:10px; height:10px; border-radius:50%; flex-shrink:0; margin-top:2px; background:var(--cde-state-archived); }
.vs-audit-dot[data-cde-state="wip"]       { background:var(--cde-state-wip);       }
.vs-audit-dot[data-cde-state="shared"]    { background:var(--cde-state-shared);    }
.vs-audit-dot[data-cde-state="published"] { background:var(--cde-state-published); }
.vs-audit-dot[data-cde-state="archived"]  { background:var(--cde-state-archived);  }
.vs-audit-section { margin-top:10px; border-top:1px solid var(--app-border,#dde3f0); padding-top:10px; }
.vs-audit-title { font-size:11px; font-weight:700; color:var(--app-text-muted,#888); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:8px; }
.vs-audit-entry { display:flex; gap:8px; font-size:11px; padding:4px 0; border-bottom:1px solid rgba(0,0,0,0.04); }
.vs-audit-time { color:var(--app-text-muted,#888); white-space:nowrap; }
.vs-audit-action { color:var(--app-text); flex:1; }
.vs-audit-actor { color:var(--app-accent,#6600FF); font-weight:600; }
.vs-audit-empty { font-size:11px; color:var(--app-text-muted,#888); font-style:italic; }
.vs-empty { text-align:center; color:var(--app-text-muted,#888); font-size:13px; padding:24px 0; }
.vs-loading { text-align:center; color:var(--app-text-muted,#888); font-size:13px; padding:16px 0; opacity:0.7; }
`;

export const NAME_BUILDER_STYLES = `
.nb-builder { display:flex; flex-direction:column; gap:0; width:100%; }
.nb-builder-title { font-size:14px; font-weight:700; color:var(--app-text); margin-bottom:12px; }
.nb-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; }
.nb-field { display:flex; flex-direction:column; gap:4px; }
.nb-field--full { grid-column:1/-1; }
.nb-label { font-size:11px; font-weight:600; color:var(--app-text-muted,#888); text-transform:uppercase; letter-spacing:0.04em; }
.nb-input { padding:7px 10px; border:1px solid var(--app-border,#dde3f0); border-radius:6px; font-size:12px; background:var(--app-bg,#e8edf6); color:var(--app-text); outline:none; font-family:monospace; }
.nb-input:focus { border-color:var(--app-accent,#6600FF); box-shadow:0 0 0 2px rgba(102,0,255,0.1); }
.nb-input--error { border-color:#dc2626; }
.nb-select { padding:7px 10px; border:1px solid var(--app-border,#dde3f0); border-radius:6px; font-size:12px; background:var(--app-bg,#e8edf6); color:var(--app-text); outline:none; cursor:pointer; }
.nb-select:focus { border-color:var(--app-accent,#6600FF); }
.nb-preview { margin-top:12px; padding:8px 12px; background:rgba(102,0,255,0.06); border:1px solid rgba(102,0,255,0.15); border-radius:7px; }
.nb-preview-label { font-size:10px; font-weight:700; color:var(--app-accent,#6600FF); text-transform:uppercase; letter-spacing:0.06em; margin-bottom:4px; }
.nb-preview-filename { font-size:12px; font-family:monospace; color:var(--app-text); word-break:break-all; }
.nb-preview-filename--placeholder { opacity:0.45; }
.nb-errors { margin-top:8px; display:flex; flex-direction:column; gap:3px; }
.nb-error-item { font-size:11px; color:#dc2626; }
.nb-actions { display:flex; gap:8px; margin-top:12px; justify-content:flex-end; }
.nb-cancel-btn { padding:6px 14px; background:transparent; border:1px solid var(--app-border,#dde3f0); border-radius:6px; font-size:13px; color:var(--app-text); cursor:pointer; }
.nb-save-btn { padding:6px 16px; background:var(--app-gradient,linear-gradient(135deg,#6600FF,#8B3FF2)); color:#fff; border:none; border-radius:6px; font-size:13px; font-weight:600; cursor:pointer; transition:opacity 0.15s; }
.nb-save-btn:hover { opacity:0.88; }
.nb-save-btn:disabled { opacity:0.5; cursor:not-allowed; }
`;

