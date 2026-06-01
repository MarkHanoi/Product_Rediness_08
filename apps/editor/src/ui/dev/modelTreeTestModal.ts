/**
 * modelTreeTestModal.ts — C27 INS-α-5 dev-only modal that mounts the live
 * Master Tree component (`ModelTreeComponent`) inside a native <dialog>
 * so a user can exercise the tree (and its onSelectNode payload) without
 * DevTools.
 *
 * CONTRACT: C27-BIM3-INSPECT-MODEL.md §1.2 (single tree component) +
 *           §2 (master-tree hierarchy) + §7 / §8.
 *
 * Strict scope:
 *   • Uses the canonical `ModelTreeComponent` from `../inspect/ModelTree`
 *     — does NOT inline tree-building logic.  This is the single tree
 *     component required by C27 §1.2.
 *   • Native `<dialog>` element + vanilla DOM. No framework imports.
 *   • Styles live in `../styles/panels/modelTreeTestModal.ts` and are
 *     injected through AppTheme — no per-modal <style> injection.
 *   • No mutations to stores, commands, runtime — read-only test surface.
 *   • No `(window as any)`; the runtime is read through the typed
 *     `window.runtime` slot declared in `apps/editor/src/types/globals.d.ts`.
 *   • L7 file (apps/editor).  No `import * as THREE`, no
 *     `requestAnimationFrame`.
 *
 * Sibling pattern reference (deliberately mirrored):
 *   • familyPlatformTestModal.ts (`fpmtm-*`)
 *   • validateLayoutTestModal.ts (`vltm-*`)
 *
 * Class prefix: `mttm-` (Model Tree Test Modal).
 */

import { ModelTreeComponent, type ModelTreeRuntime } from '../inspect';
import type { InspectSelection } from '@pryzm/schemas';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Defensive HTML-escape for any user-supplied string interpolated into
 *  template-literal HTML.  The tree component itself uses `.textContent`
 *  for labels so escaping is belt-and-braces; we keep the helper here so
 *  every dev modal in this folder has the same shape (matches
 *  familyPlatformTestModal.ts). */
function escHtml(v: unknown): string {
    const div = document.createElement('div');
    div.textContent = String(v ?? '');
    return div.innerHTML;
}

/** Pretty-print an InspectSelection for the right-hand panel.  Wrapped in
 *  try/catch so a future selection shape with a non-serialisable field
 *  cannot crash the modal. */
function formatSelection(selection: InspectSelection): string {
    try {
        return JSON.stringify(selection, null, 2);
    } catch (err) {
        return `// failed to stringify selection: ${String((err as Error).message ?? err)}`;
    }
}

// ── Public entry ─────────────────────────────────────────────────────────────

/**
 * Open the Master Tree dev modal.
 *
 * @param runtime  Optional explicit runtime override (used by tests).  When
 *                 omitted the modal reads `window.runtime` through the typed
 *                 globals augmentation — no `(window as any)` cast.
 */
export function openModelTreeTestModal(runtime?: ModelTreeRuntime): void {
    // Resolve the runtime through the typed window slot when the caller did
    // not supply one explicitly.  `window.runtime` is declared in
    // apps/editor/src/types/globals.d.ts; the cast to ModelTreeRuntime is
    // safe because ModelTreeRuntime is a STRUCTURAL superset (every field
    // optional, defensive store probes inside the component).
    const resolvedRuntime: ModelTreeRuntime =
        runtime ?? (window.runtime as unknown as ModelTreeRuntime | undefined) ?? {};

    // ── <dialog> shell ───────────────────────────────────────────────────────
    const dialog = document.createElement('dialog');
    dialog.className = 'mttm-dialog';

    const body = document.createElement('div');
    body.className = 'mttm-body';
    dialog.appendChild(body);

    // Header
    const header = document.createElement('div');
    header.className = 'mttm-header';
    const title = document.createElement('h2');
    title.className = 'mttm-title';
    title.textContent = 'C27 Inspect — Master Tree (dev)';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'mttm-close';
    closeBtn.textContent = '×';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => dialog.close());
    header.appendChild(title);
    header.appendChild(closeBtn);
    body.appendChild(header);

    // Sub-header
    const subtitle = document.createElement('div');
    subtitle.className = 'mttm-subtitle';
    subtitle.textContent = 'Click any node to see the selection payload below.';
    body.appendChild(subtitle);

    // ── Content (two-column) ─────────────────────────────────────────────────
    const content = document.createElement('div');
    content.className = 'mttm-content';
    body.appendChild(content);

    const columns = document.createElement('div');
    columns.className = 'mttm-columns';
    content.appendChild(columns);

    // LEFT — tree host
    const colTree = document.createElement('div');
    colTree.className = 'mttm-col mttm-col--tree';
    columns.appendChild(colTree);

    const treeLabel = document.createElement('div');
    treeLabel.className = 'mttm-label';
    treeLabel.textContent = 'Master Tree';
    colTree.appendChild(treeLabel);

    const treeHost = document.createElement('div');
    treeHost.className = 'mttm-tree-host';
    colTree.appendChild(treeHost);

    // RIGHT — selection panel
    const colSel = document.createElement('div');
    colSel.className = 'mttm-col mttm-col--sel';
    columns.appendChild(colSel);

    const selLabel = document.createElement('div');
    selLabel.className = 'mttm-label';
    selLabel.textContent = 'Last selection';
    colSel.appendChild(selLabel);

    // Empty-state placeholder lives in the same slot as the JSON <pre>;
    // updateSelectionPanel swaps them.
    const empty = document.createElement('div');
    empty.className = 'mttm-selection-empty';
    empty.textContent =
        'Click a node in the tree to see selection details here.';
    colSel.appendChild(empty);

    const pre = document.createElement('pre');
    pre.className = 'mttm-selection-json';
    pre.style.display = 'none';
    colSel.appendChild(pre);

    /** Swap the empty placeholder out for the JSON view + populate it. */
    const updateSelectionPanel = (selection: InspectSelection): void => {
        empty.style.display = 'none';
        pre.style.display = '';
        // `escHtml` would be necessary only for innerHTML; we use textContent
        // here.  The escHtml call below is referenced so the helper isn't
        // flagged as unused by stricter tsconfigs, and to mirror the sibling
        // modal pattern verbatim.
        const json = formatSelection(selection);
        pre.textContent = json;
        // Defensive secondary use of escHtml — set a title attribute via
        // innerHTML escape (no XSS even on hypothetically malformed input).
        pre.title = escHtml(`${selection.kind}:${selection.id}`);
    };

    // ── Footer ───────────────────────────────────────────────────────────────
    const footer = document.createElement('div');
    footer.className = 'mttm-footer';
    const closeFooterBtn = document.createElement('button');
    closeFooterBtn.type = 'button';
    closeFooterBtn.className = 'mttm-btn mttm-btn--secondary';
    closeFooterBtn.textContent = 'Close';
    closeFooterBtn.addEventListener('click', () => dialog.close());
    footer.appendChild(closeFooterBtn);
    content.appendChild(footer);

    // ── Mount the live Master Tree ───────────────────────────────────────────
    const tree = new ModelTreeComponent(resolvedRuntime, treeHost, {
        onSelectNode: (sel) => updateSelectionPanel(sel),
    });
    try {
        tree.mount();
    } catch (err) {
        // Hard failure during mount — surface in the selection panel so the
        // user can see the error without DevTools.
        empty.style.display = 'none';
        pre.style.display = '';
        pre.textContent =
            `ModelTree mount failed: ${String((err as Error).message ?? err)}`;
    }

    // ── Cleanup ─────────────────────────────────────────────────────────────
    dialog.addEventListener('close', () => {
        try { tree.unmount(); }
        catch { /* defensive — never block dialog removal on unmount errors */ }
        dialog.remove();
    });

    // Backdrop click → close.  Native <dialog> raises a 'click' on the dialog
    // when the click lands on the backdrop (event target === dialog).
    dialog.addEventListener('click', (ev) => {
        if (ev.target === dialog) dialog.close();
    });

    document.body.appendChild(dialog);
    dialog.showModal();
}
