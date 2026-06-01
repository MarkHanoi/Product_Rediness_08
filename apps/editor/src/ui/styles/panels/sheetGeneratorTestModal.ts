// C24 SHT-α-5 — Sheet Generator Test Modal styles.
//
// Surfaces the buildSheetFromRooms helper + sheetToSvgWithContent composer
// as a dev-only modal so a user can preview a generated sheet without
// DevTools. Visual parity with the sibling dev modals (`mttm-*`,
// `fpmtm-*`, `vltm-*`).
//
// Runtime CSS lives here as a string constant + is injected once by
// AppTheme.injectAppTheme(); no independent <style> tags. Class prefix
// `sgtm-` (Sheet Generator Test Modal).

export const SHEET_GENERATOR_TEST_MODAL_STYLES = `
dialog.sgtm-dialog {
  width: 1080px; max-width: 96vw; max-height: 90vh;
  padding: 0; border: 1px solid #444; border-radius: 8px;
  background: #1e1e1e; color: #e0e0e0;
  font-family: var(--app-font, system-ui, sans-serif);
  box-shadow: 0 8px 32px rgba(0,0,0,.6);
}
dialog.sgtm-dialog::backdrop { background: rgba(0,0,0,.5); }
.sgtm-body { display: flex; flex-direction: column; max-height: 90vh; }
.sgtm-header {
  padding: 12px 16px; border-bottom: 1px solid #333;
  display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(90deg, #1a2a4a, #1e1e1e);
}
.sgtm-title { font-size: 14px; font-weight: 600; margin: 0; }
.sgtm-close {
  background: transparent; color: #aaa; border: none;
  font-size: 18px; cursor: pointer; padding: 0 4px;
}
.sgtm-close:hover { color: #fff; }
.sgtm-content {
  padding: 12px 16px; overflow: hidden; flex: 1;
  display: flex; flex-direction: column; gap: 10px; min-height: 0;
}
.sgtm-form-row {
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
  padding: 8px 10px; background: #161616; border: 1px solid #2a2a2a;
  border-radius: 4px;
}
.sgtm-field { display: flex; flex-direction: column; gap: 3px; }
.sgtm-field-label {
  font-size: 10px; color: #aaa; text-transform: uppercase;
  letter-spacing: .04em;
}
.sgtm-select {
  background: #111; color: #e0e0e0; border: 1px solid #333;
  border-radius: 3px; padding: 4px 8px; font-size: 12px;
  font-family: var(--app-font, system-ui, sans-serif);
  min-width: 120px;
}
.sgtm-select:focus { outline: 1px solid #6600ff; border-color: #6600ff; }
.sgtm-status {
  flex: 1 1 auto; font-size: 11px; color: #888;
  text-align: right; padding-right: 4px; min-width: 0;
}
.sgtm-svg-host {
  flex: 1 1 auto; min-height: 320px; overflow: auto;
  background: #2a2a2a; border: 1px solid #2a2a2a; border-radius: 4px;
  padding: 16px; display: flex; align-items: center; justify-content: center;
}
.sgtm-svg-host > svg { max-width: 100%; max-height: 78vh; background: #fff; }
.sgtm-svg-host-empty {
  font-size: 12px; color: #888; font-style: italic; text-align: center;
}
.sgtm-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding-top: 8px; border-top: 1px solid #2a2a2a;
}
.sgtm-btn {
  background: #6600ff; color: #fff; border: none; border-radius: 4px;
  padding: 6px 14px; font-size: 12px; cursor: pointer; font-weight: 500;
}
.sgtm-btn:hover { background: #7a1aff; }
.sgtm-btn--secondary { background: #333; color: #e0e0e0; }
.sgtm-btn--secondary:hover { background: #444; }
.sgtm-btn:disabled { opacity: 0.55; cursor: default; }
`;
