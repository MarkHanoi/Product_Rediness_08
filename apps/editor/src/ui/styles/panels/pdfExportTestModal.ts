// C29 PDF-α-2 — PDF Export Test Modal styles.
//
// Surfaces `sheetToPdfBytes` (from @pryzm/pdf-export) as a dev-only modal so
// a user can generate + download a vector PDF for the project's rooms without
// DevTools. Visual parity with the sibling dev modal `sgtm-*`
// (sheetGeneratorTestModal).
//
// Runtime CSS lives here as a string constant + is injected once by
// AppTheme.injectAppTheme(); no independent <style> tags. Class prefix
// `pdftm-` (PDF Test Modal).

export const PDF_EXPORT_TEST_MODAL_STYLES = `
dialog.pdftm-dialog {
  width: 560px; max-width: 96vw; max-height: 90vh;
  padding: 0; border: 1px solid #444; border-radius: 8px;
  background: #1e1e1e; color: #e0e0e0;
  font-family: var(--app-font, system-ui, sans-serif);
  box-shadow: 0 8px 32px rgba(0,0,0,.6);
}
dialog.pdftm-dialog::backdrop { background: rgba(0,0,0,.5); }
.pdftm-body { display: flex; flex-direction: column; max-height: 90vh; }
.pdftm-header {
  padding: 12px 16px; border-bottom: 1px solid #333;
  display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(90deg, #1a2a4a, #1e1e1e);
}
.pdftm-title { font-size: 14px; font-weight: 600; margin: 0; }
.pdftm-close {
  background: transparent; color: #aaa; border: none;
  font-size: 18px; cursor: pointer; padding: 0 4px;
}
.pdftm-close:hover { color: #fff; }
.pdftm-content {
  padding: 12px 16px; overflow: auto; flex: 1;
  display: flex; flex-direction: column; gap: 10px; min-height: 0;
}
.pdftm-form-row {
  display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap;
  padding: 10px; background: #161616; border: 1px solid #2a2a2a;
  border-radius: 4px;
}
.pdftm-field { display: flex; flex-direction: column; gap: 3px; }
.pdftm-field--grow { flex: 1 1 180px; min-width: 0; }
.pdftm-field-label {
  font-size: 10px; color: #aaa; text-transform: uppercase;
  letter-spacing: .04em;
}
.pdftm-select, .pdftm-input {
  background: #111; color: #e0e0e0; border: 1px solid #333;
  border-radius: 3px; padding: 4px 8px; font-size: 12px;
  font-family: var(--app-font, system-ui, sans-serif);
  min-width: 120px;
}
.pdftm-input { min-width: 200px; }
.pdftm-select:focus, .pdftm-input:focus {
  outline: 1px solid #6600ff; border-color: #6600ff;
}
.pdftm-status-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 12px; padding: 8px 10px;
  background: #161616; border: 1px solid #2a2a2a; border-radius: 4px;
}
.pdftm-status {
  font-size: 11px; color: #888;
  font-family: var(--app-font, system-ui, sans-serif);
  min-width: 0; flex: 1 1 auto;
}
.pdftm-status--ok { color: #6cd66c; }
.pdftm-status--err { color: #ff6b6b; }
.pdftm-status--busy { color: #ffd166; }
.pdftm-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding-top: 8px; border-top: 1px solid #2a2a2a;
}
.pdftm-btn {
  background: #6600ff; color: #fff; border: none; border-radius: 4px;
  padding: 6px 14px; font-size: 12px; cursor: pointer; font-weight: 500;
}
.pdftm-btn:hover { background: #7a1aff; }
.pdftm-btn--secondary { background: #333; color: #e0e0e0; }
.pdftm-btn--secondary:hover { background: #444; }
.pdftm-btn:disabled { opacity: 0.55; cursor: default; }
`;
