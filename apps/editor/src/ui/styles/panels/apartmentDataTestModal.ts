// BIM 2/3 D-α-4 — Apartment Data Test Modal styles.
//
// Surfaces the read-only ApartmentParametersStore + RoomParametersStore
// browser as a dev-only modal so a user can inspect the L0 records (per
// `APARTMENT-BIM2-BIM3-DATA-MANAGEMENT-AND-LIVE-PARAMETRIC-SYSTEM.md §6`,
// Panel A — read-only first) without DevTools. Visual parity with the
// sibling dev modals (`mttm-*`, `sgtm-*`, `fpmtm-*`, `vltm-*`).
//
// Runtime CSS lives here as a string constant + is injected once by
// AppTheme.injectAppTheme(); no independent <style> tags. Class prefix
// `adtm-` (Apartment Data Test Modal).

export const APARTMENT_DATA_TEST_MODAL_STYLES = `
dialog.adtm-dialog {
  width: 1020px; max-width: 96vw; max-height: 90vh;
  padding: 0; border: 1px solid #444; border-radius: 8px;
  background: #1e1e1e; color: #e0e0e0;
  font-family: var(--app-font, system-ui, sans-serif);
  box-shadow: 0 8px 32px rgba(0,0,0,.6);
}
dialog.adtm-dialog::backdrop { background: rgba(0,0,0,.5); }
.adtm-body { display: flex; flex-direction: column; max-height: 90vh; }
.adtm-header {
  padding: 12px 16px; border-bottom: 1px solid #333;
  display: flex; align-items: center; justify-content: space-between;
  gap: 8px;
  background: linear-gradient(90deg, #1a2a4a, #1e1e1e);
}
.adtm-title { font-size: 14px; font-weight: 600; margin: 0; }
.adtm-subtitle {
  font-size: 11px; color: #aaa; padding: 8px 16px 0;
}
.adtm-header-actions { display: flex; gap: 8px; align-items: center; }
.adtm-close {
  background: transparent; color: #aaa; border: none;
  font-size: 18px; cursor: pointer; padding: 0 4px;
}
.adtm-close:hover { color: #fff; }
.adtm-banner {
  margin: 8px 16px 0; padding: 8px 10px;
  background: #2a1f1f; border: 1px solid #5a3030; border-radius: 4px;
  color: #f0c0a0; font-size: 11px; line-height: 1.45;
}
.adtm-banner--info {
  background: #1f1f2a; border-color: #303a5a; color: #a0c0f0;
}
.adtm-content {
  padding: 12px 16px; overflow: hidden; flex: 1;
  display: flex; flex-direction: column; gap: 10px; min-height: 0;
}
.adtm-columns {
  display: flex; gap: 12px; flex: 1; min-height: 0;
}
.adtm-col {
  display: flex; flex-direction: column; gap: 6px; min-height: 0;
}
.adtm-col--list   { flex: 0 0 40%; }
.adtm-col--detail { flex: 1 1 60%; }
.adtm-label {
  font-size: 11px; color: #aaa; text-transform: uppercase;
  letter-spacing: .04em;
}
.adtm-list-host {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  background: #161616; border: 1px solid #2a2a2a; border-radius: 4px;
  padding: 4px;
}
.adtm-list-empty {
  padding: 16px; text-align: center;
  font-size: 12px; color: #888; font-style: italic;
}
.adtm-list-row {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 10px; border-radius: 3px;
  cursor: pointer; border: 1px solid transparent;
  margin-bottom: 2px;
}
.adtm-list-row:hover { background: #1f1f1f; border-color: #2a2a2a; }
.adtm-list-row.adtm-list-row--selected {
  background: #1a2a4a; border-color: #3a4a6a;
}
.adtm-list-row-id {
  font-size: 10px; color: #888;
  font-family: ui-monospace, Menlo, Consolas, monospace;
}
.adtm-list-row-name {
  font-size: 12px; color: #e0e0e0; font-weight: 500;
}
.adtm-list-row-meta {
  font-size: 10px; color: #aaa; display: flex; gap: 10px;
}
.adtm-detail-host {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  background: #161616; border: 1px solid #2a2a2a; border-radius: 4px;
  padding: 12px;
  display: flex; flex-direction: column; gap: 10px;
}
.adtm-detail-empty {
  flex: 1 1 auto; display: flex; align-items: center;
  justify-content: center; text-align: center; padding: 16px;
  font-size: 12px; color: #888; font-style: italic;
}
.adtm-section-title {
  font-size: 11px; color: #aaa; text-transform: uppercase;
  letter-spacing: .04em; margin: 0;
  padding-bottom: 4px; border-bottom: 1px solid #2a2a2a;
}
.adtm-data-table {
  display: grid; grid-template-columns: 180px 1fr;
  gap: 4px 12px; font-size: 12px;
}
.adtm-data-key {
  color: #aaa;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px;
}
.adtm-data-val {
  color: #e0e0e0; word-break: break-word;
}
.adtm-data-val--mono {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 11px; color: #c0e0c0;
}
.adtm-rooms-table {
  width: 100%; border-collapse: collapse; font-size: 11px;
}
.adtm-rooms-table th, .adtm-rooms-table td {
  text-align: left; padding: 6px 8px;
  border-bottom: 1px solid #2a2a2a;
}
.adtm-rooms-table th {
  font-weight: 500; color: #aaa; text-transform: uppercase;
  letter-spacing: .04em; font-size: 10px;
  background: #1a1a1a; position: sticky; top: 0;
}
.adtm-rooms-table td.adtm-rooms-col-id {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 10px; color: #888;
}
.adtm-rooms-empty {
  padding: 12px; text-align: center;
  font-size: 11px; color: #888; font-style: italic;
}
.adtm-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding-top: 8px; border-top: 1px solid #2a2a2a;
}
.adtm-btn {
  background: #6600ff; color: #fff; border: none; border-radius: 4px;
  padding: 6px 14px; font-size: 12px; cursor: pointer; font-weight: 500;
}
.adtm-btn:hover { background: #7a1aff; }
.adtm-btn--secondary { background: #333; color: #e0e0e0; }
.adtm-btn--secondary:hover { background: #444; }
.adtm-readonly-pill {
  display: inline-block; padding: 2px 6px;
  font-size: 9px; text-transform: uppercase; letter-spacing: .05em;
  background: #2a1f3a; color: #c0a0f0; border-radius: 3px;
  border: 1px solid #4a3a6a; font-weight: 500;
}
`;
