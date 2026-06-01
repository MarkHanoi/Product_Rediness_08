// @vitest-environment happy-dom
//
// C27 INS-α-5 — Model Tree Test Modal smoke tests.
//
// Scope:
//   • The open → close cycle does not throw.
//   • The dialog mounts the live `.pmt-tree` (canonical Master Tree root)
//     inside the modal's tree host.
//
// The modal is a thin shell around `ModelTreeComponent`; the component
// itself has full coverage in `modelTree.test.ts`.  These tests only
// validate the WIRING — the dialog opens, mounts a real tree, and tears
// down cleanly on close.
//
// happy-dom does not implement the native <dialog> `showModal()` / `close()`
// state machine perfectly; we shim them so the dialog still raises the
// `close` event and the cleanup branch runs.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { openModelTreeTestModal } from '../src/ui/dev/modelTreeTestModal.js';
import type { ModelTreeRuntime } from '../src/ui/inspect/ModelTree.js';

// ── happy-dom <dialog> shim ──────────────────────────────────────────────────
// happy-dom 14 lacks a full <dialog> implementation; patch the prototype so
// `showModal()` simply marks the element open, and `close()` raises the
// 'close' event the modal listens for.
beforeEach(() => {
    const proto = HTMLDialogElement?.prototype;
    if (!proto) return;
    if (typeof proto.showModal !== 'function' || !('__pryzmShim' in proto.showModal)) {
        const shim = function (this: HTMLDialogElement): void {
            this.setAttribute('open', '');
        };
        (shim as unknown as { __pryzmShim: true }).__pryzmShim = true;
        proto.showModal = shim;
    }
    if (typeof proto.close !== 'function' || !('__pryzmShim' in proto.close)) {
        const shim = function (this: HTMLDialogElement): void {
            this.removeAttribute('open');
            this.dispatchEvent(new Event('close'));
        };
        (shim as unknown as { __pryzmShim: true }).__pryzmShim = true;
        proto.close = shim;
    }
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe('openModelTreeTestModal — open + close', () => {
    it('mounts a dialog containing the canonical .pmt-tree root', () => {
        const runtime: ModelTreeRuntime = {
            projectContext: { projectName: 'Smoke Test Project', projectId: 'proj-1' },
        };
        openModelTreeTestModal(runtime);

        const dialog = document.body.querySelector<HTMLDialogElement>('dialog.mttm-dialog');
        expect(dialog).not.toBeNull();
        // The live ModelTreeComponent renders its root <ul class="pmt-tree">.
        const tree = dialog!.querySelector('.pmt-tree');
        expect(tree).not.toBeNull();
        // Cleanup
        dialog!.close();
    });

    it('removes the dialog from the DOM on close', () => {
        const runtime: ModelTreeRuntime = {
            projectContext: { projectName: 'Smoke Test Project', projectId: 'proj-1' },
        };
        openModelTreeTestModal(runtime);

        const dialog = document.body.querySelector<HTMLDialogElement>('dialog.mttm-dialog');
        expect(dialog).not.toBeNull();

        // Close → cleanup branch fires → dialog removed.
        const unmountSpy = vi.fn();
        // Spy via 'close' event ordering — if unmount throws the test fails.
        dialog!.addEventListener('close', unmountSpy);
        dialog!.close();

        expect(unmountSpy).toHaveBeenCalled();
        expect(document.body.querySelector('dialog.mttm-dialog')).toBeNull();
    });
});
