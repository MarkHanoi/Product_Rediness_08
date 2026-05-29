// Apartment Layout modal styles (SPEC §11, A5-modal).
// CONTRACT §05 §2.1 — runtime CSS lives here as a string constant + is injected
// once by AppTheme.injectAppTheme(); no independent <style> tags. `alm-` prefix.

export const APARTMENT_LAYOUT_MODAL_STYLES = `
.alm-overlay {
  position: fixed; inset: 0; z-index: 4000;
  background: rgba(15, 23, 42, 0.55);
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
}
.alm-panel {
  background: #ffffff; color: #0f172a;
  border-radius: 12px; box-shadow: 0 20px 60px rgba(0,0,0,0.35);
  width: min(960px, 96vw); max-height: 88vh; display: flex; flex-direction: column;
  overflow: hidden; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
.alm-header {
  padding: 16px 20px; font-size: 16px; font-weight: 650;
  border-bottom: 1px solid #e2e8f0; display: flex; align-items: baseline; gap: 8px;
}
.alm-header small { font-size: 12px; font-weight: 500; color: #64748b; }
.alm-grid {
  padding: 16px 20px; overflow-y: auto;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 16px;
}
.alm-card {
  border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;
  display: flex; flex-direction: column; gap: 10px; background: #f8fafc;
  transition: border-color .12s, box-shadow .12s;
}
.alm-card:hover { border-color: #6600FF; box-shadow: 0 4px 16px rgba(102,0,255,0.12); }
.alm-thumb {
  background: #ffffff; border: 1px solid #eef2f7; border-radius: 8px;
  height: 120px; display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.alm-thumb svg { width: 100%; height: 100%; }
.alm-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.alm-title { font-weight: 600; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.alm-overall { font-weight: 700; font-size: 18px; color: #6600FF; }
.alm-overall small { font-size: 11px; font-weight: 500; color: #94a3b8; }
.alm-bars { display: flex; flex-direction: column; gap: 4px; }
.alm-bar { display: grid; grid-template-columns: 72px 1fr 28px; align-items: center; gap: 6px; }
.alm-bar-label { font-size: 11px; color: #64748b; }
.alm-bar-track { height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; }
.alm-bar-fill { display: block; height: 100%; background: #6600FF; border-radius: 3px; }
.alm-bar-pct { font-size: 11px; color: #475569; text-align: right; }
.alm-meta { font-size: 11px; color: #64748b; }
.alm-rooms { list-style: none; margin: 0; padding: 0; max-height: 132px; overflow-y: auto;
  display: flex; flex-direction: column; gap: 2px; }
.alm-room { display: grid; grid-template-columns: 1fr auto auto; gap: 8px; font-size: 11px;
  padding: 2px 0; border-bottom: 1px dashed #eef2f7; }
.alm-room-name { font-weight: 500; }
.alm-room-type { color: #94a3b8; }
.alm-room-area { color: #475569; }
.alm-select {
  margin-top: auto; padding: 8px 12px; border: none; border-radius: 8px; cursor: pointer;
  background: #6600FF; color: #ffffff; font-weight: 600; font-size: 12px;
}
.alm-select:hover { background: #5200cc; }
.alm-footer { padding: 12px 20px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; }
.alm-cancel {
  padding: 8px 16px; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer;
  background: #ffffff; color: #334155; font-weight: 600; font-size: 12px;
}
.alm-cancel:hover { background: #f1f5f9; }
.alm-empty { padding: 32px 20px; text-align: center; color: #64748b; }

/* §MODAL-DYNAMIC (2026-05-29) — inline program-edit form + busy overlay. */
.alm-program {
  padding: 12px 20px; border-bottom: 1px solid #e2e8f0; background: #f8fafc;
  display: flex; flex-direction: column; gap: 8px;
}
.alm-program-row {
  display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
}
.alm-program-checks { color: #334155; }
.alm-program-num {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: #334155;
}
.alm-program-num input[type="number"] {
  width: 56px; padding: 4px 6px; font: inherit; color: inherit;
  border: 1px solid #cbd5e1; border-radius: 6px; background: #ffffff;
}
.alm-program-num input[type="number"]:focus {
  outline: 2px solid #6600FF; outline-offset: -1px; border-color: #6600FF;
}
.alm-program-chk {
  display: inline-flex; align-items: center; gap: 6px; font-size: 12px; cursor: pointer;
}
.alm-program-chk input[type="checkbox"] { cursor: pointer; }
.alm-program-hint {
  font-size: 11px; color: #64748b; font-style: italic;
}
/* §MODAL-DYNAMIC busy state — dims the grid + shows a pulse. */
.alm-busy .alm-grid { opacity: 0.55; pointer-events: none; transition: opacity .15s; }
.alm-busy .alm-program-hint { color: #6600FF; font-style: normal; font-weight: 600; }

/* §MODAL-DYNAMIC part-3 (2026-05-29) — occupancy legend. */
.alm-legend {
  padding: 8px 20px; border-bottom: 1px solid #e2e8f0; background: #ffffff;
  display: flex; align-items: center; gap: 12px; flex-wrap: wrap;
}
.alm-legend-item {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; color: #475569;
}
.alm-legend-swatch {
  display: inline-block; width: 12px; height: 12px; border-radius: 3px;
  border: 1px solid rgba(15, 23, 42, 0.12);
}
.alm-legend-label { white-space: nowrap; }
`;
