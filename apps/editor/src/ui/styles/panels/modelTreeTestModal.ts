// C27 INS-α-5 — Model Tree Test Modal styles.
//
// CONTRACT: C27-BIM3-INSPECT-MODEL.md §1.2 / §2 — surfaces the live
// ModelTreeComponent as a dev-only modal so a user can exercise the
// master tree (and its onSelectNode payload) without DevTools.
//
// Runtime CSS lives here as a string constant + is injected once by
// AppTheme.injectAppTheme(); no independent <style> tags.  Class prefix
// `mttm-` (Model Tree Test Modal).  Visual parity with the sibling
// dev-only test modals (`fpmtm-*` familyPlatformTestModal,
// `vltm-*` validateLayoutTestModal) — dark surface, scoped via dialog
// element selectors so the modal does not affect anything else.

export const MODEL_TREE_TEST_MODAL_STYLES = `
dialog.mttm-dialog {
  width: 920px; max-width: 94vw; max-height: 86vh;
  padding: 0; border: 1px solid #444; border-radius: 8px;
  background: #1e1e1e; color: #e0e0e0;
  font-family: var(--app-font, system-ui, sans-serif);
  box-shadow: 0 8px 32px rgba(0,0,0,.6);
}
dialog.mttm-dialog::backdrop { background: rgba(0,0,0,.5); }
.mttm-body { display: flex; flex-direction: column; max-height: 86vh; }
.mttm-header {
  padding: 12px 16px; border-bottom: 1px solid #333;
  display: flex; align-items: center; justify-content: space-between;
  background: linear-gradient(90deg, #1a2a4a, #1e1e1e);
}
.mttm-title { font-size: 14px; font-weight: 600; margin: 0; }
.mttm-subtitle {
  font-size: 11px; color: #aaa; padding: 8px 16px 0;
}
.mttm-close {
  background: transparent; color: #aaa; border: none;
  font-size: 18px; cursor: pointer; padding: 0 4px;
}
.mttm-close:hover { color: #fff; }
.mttm-content {
  padding: 12px 16px; overflow: hidden; flex: 1;
  display: flex; flex-direction: column; gap: 10px; min-height: 0;
}
.mttm-columns {
  display: flex; gap: 12px; flex: 1; min-height: 0;
}
.mttm-col {
  display: flex; flex-direction: column; gap: 6px; min-height: 0;
}
.mttm-col--tree { flex: 0 0 60%; }
.mttm-col--sel  { flex: 1 1 40%; }
.mttm-label {
  font-size: 11px; color: #aaa; text-transform: uppercase;
  letter-spacing: .04em;
}
.mttm-tree-host {
  flex: 1 1 auto; min-height: 0; overflow: auto;
  background: #ffffff; color: #0f172a;
  border: 1px solid #2a2a2a; border-radius: 4px;
  padding: 4px 0;
}
.mttm-selection-empty {
  flex: 1 1 auto; min-height: 0;
  display: flex; align-items: center; justify-content: center;
  text-align: center; padding: 16px;
  font-size: 12px; color: #888; font-style: italic;
  background: #0a0a0a; border: 1px dashed #2a2a2a; border-radius: 4px;
}
.mttm-selection-json {
  flex: 1 1 auto; min-height: 0; margin: 0;
  background: #0a0a0a; color: #c0e0c0;
  border: 1px solid #2a2a2a; border-radius: 4px;
  padding: 10px; font-size: 11px; line-height: 1.45;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  overflow: auto; white-space: pre-wrap; word-break: break-word;
}
.mttm-footer {
  display: flex; justify-content: flex-end; gap: 8px;
  padding-top: 8px; border-top: 1px solid #2a2a2a;
}
.mttm-btn {
  background: #6600ff; color: #fff; border: none; border-radius: 4px;
  padding: 6px 14px; font-size: 12px; cursor: pointer; font-weight: 500;
}
.mttm-btn:hover { background: #7a1aff; }
.mttm-btn--secondary { background: #333; color: #e0e0e0; }
.mttm-btn--secondary:hover { background: #444; }
`;
