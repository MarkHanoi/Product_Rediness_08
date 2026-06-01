// C27 INS-α-4 — Model Tree component styles.
// CONTRACT C27 §1.2 (single tree component) + §2 (master-tree hierarchy 0..6).
//
// Runtime CSS lives here as a string constant + is injected once by
// AppTheme.injectAppTheme(); no independent <style> tags.  Class prefix
// `pmt-` (PRYZM Model Tree).
//
// Slice INS-α-4 scope: visual skeleton for L0..L4 (project / building /
// level / apartment / room).  Element-type + element-instance rows + the
// isolation animator land in INS-α-5.

export const MODEL_TREE_STYLES = `
.pmt-tree {
  list-style: none; margin: 0; padding: 4px 0;
  font: 12px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: #0f172a; background: #ffffff;
}
.pmt-children {
  list-style: none; margin: 0; padding: 0 0 0 14px;
}
.pmt-node {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 8px; cursor: pointer; user-select: none;
  border-left: 2px solid transparent;
  transition: background-color .12s, border-color .12s;
}
.pmt-node:hover { background: #f1f5f9; }
.pmt-node:focus { outline: none; border-left-color: #6600FF; background: #f8fafc; }
.pmt-node:focus-visible { outline: none; border-left-color: #6600FF; background: #f8fafc; }
.pmt-node--selected { background: #ede9fe; border-left-color: #6600FF; }
.pmt-node--selected:hover { background: #ddd6fe; }
.pmt-toggle {
  display: inline-flex; align-items: center; justify-content: center;
  width: 14px; height: 14px; flex-shrink: 0;
  font-size: 10px; line-height: 1; color: #64748b;
  background: transparent; border: none; padding: 0; cursor: pointer;
}
.pmt-toggle--leaf { visibility: hidden; }
.pmt-icon {
  display: inline-block; width: 16px; text-align: center; flex-shrink: 0;
  font-size: 12px; color: #475569;
}
.pmt-label {
  flex: 1 1 auto; min-width: 0;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.pmt-count {
  flex-shrink: 0; padding: 1px 6px;
  font-size: 10px; font-weight: 500; color: #64748b;
  background: #f1f5f9; border-radius: 999px;
}
.pmt-node--selected .pmt-count { background: #ffffff; color: #6600FF; }
`;
