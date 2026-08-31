// Copy/paste handlers — §FIX-COPY-PASTE (V1-LAUNCH-READINESS-AUDIT L-84).
//
// Proves the reported bug is fixed: copying a selected element then pasting
// re-creates a NEW element (new id) of the same type, via the paste port.
// Also covers the empty-selection / empty-clipboard rejection paths so the
// handlers surface typed feedback instead of silently no-op'ing.

import { describe, expect, it } from 'vitest';
import { CommandBus, PatchEmitter, UndoStack } from '@pryzm/plugin-sdk';
import { SelectionStore } from '@pryzm/plugin-sdk';
// NB: import the handlers + clipboard DIRECTLY (not via the plugin barrel) so
// this suite does not transitively load @pryzm/command-registry → core-app-model
// (which touches `window` at module load). Same isolation the sibling tests use.
import { CopySelectionHandler } from '../../src/handlers/CopySelectionHandler.js';
import { PasteClipboardHandler } from '../../src/handlers/PasteClipboardHandler.js';
import {
  SelectionClipboard,
  type ClipboardEntry,
  type SelectionPastePort,
// §SEL-STORE-IDENTITY (W4d) — this was '../../src/handlers/clipboard.js', a path that
// has NEVER existed (clipboard.ts lives at src/clipboard.ts). The file therefore failed
// COLLECTION on every run and its five copy/paste cases had NEVER EXECUTED: the plugin
// suite reported "4 files / 9 tests, all green" while this one silently did not load.
// Fixed rather than left dark — [[committed-is-not-reachable]], [[grep-silence-has-three-causes]].
} from '../../src/clipboard.js';

/** Fake port — records paste calls and mints a distinct id per paste. */
function makeFakePort() {
  const created: Array<{ entry: ClipboardEntry; newId: string; offset: unknown }> = [];
  let n = 0;
  const port: SelectionPastePort = {
    canCopy: (kind) => kind === 'wall' || kind === 'furniture',
    paste: (entry, opts) => {
      created.push({ entry, newId: opts.newId, offset: opts.offset });
      n += 1;
      return { newId: opts.newId };
    },
  };
  return { port, created, get calls() { return n; } };
}

function buildEnv(port: SelectionPastePort | null) {
  const selection = new SelectionStore();
  const clipboard = new SelectionClipboard();
  const bus = new CommandBus({
    audit: { actorId: 'test', projectId: 'p1', clientId: 't1' },
    emitter: new PatchEmitter(),
    undoStack: new UndoStack({ maxSize: 50 }),
    storesProvider: () => ({ selection }),
  });
  bus.register(new CopySelectionHandler(clipboard, port));
  bus.register(new PasteClipboardHandler(clipboard, port));
  return { selection, clipboard, bus };
}

describe('copy-selection / paste-clipboard (§FIX-COPY-PASTE, L-84)', () => {
  it('copy captures the selected element; paste re-creates it with a NEW id + same type', async () => {
    const { port, created } = makeFakePort();
    const { selection, clipboard, bus } = buildEnv(port);

    // User selects a wall.
    selection.select([{ id: 'wall-src', kind: 'wall' }]);

    // Copy → clipboard holds the source element.
    await bus.executeCommand('copy-selection', {});
    expect(clipboard.size).toBe(1);
    expect(clipboard.get()[0]).toMatchObject({ sourceId: 'wall-src', kind: 'wall' });

    // Paste → a new element is created via the port.
    await bus.executeCommand('paste-clipboard', {});
    expect(created).toHaveLength(1);
    const paste = created[0]!;
    // Same type/params (carried by the source reference), NEW id, real offset.
    expect(paste.entry).toMatchObject({ sourceId: 'wall-src', kind: 'wall' });
    expect(paste.newId).not.toBe('wall-src');
    expect(paste.newId.length).toBeGreaterThan(0);
    expect(paste.offset).toMatchObject({ x: expect.any(Number), z: expect.any(Number) });
  });

  it('copy skips non-copyable kinds; multi-select pastes every copyable element with distinct new ids', async () => {
    const { port, created } = makeFakePort();
    const { selection, clipboard, bus } = buildEnv(port);

    selection.select([
      { id: 'wall-a', kind: 'wall' },
      { id: 'chair-b', kind: 'furniture' },
      { id: 'room-c', kind: 'room' }, // not copyable in Phase 1
    ]);

    await bus.executeCommand('copy-selection', {});
    expect(clipboard.get().map((e) => e.sourceId).sort()).toEqual(['chair-b', 'wall-a']);

    await bus.executeCommand('paste-clipboard', {});
    expect(created).toHaveLength(2);
    const ids = created.map((c) => c.newId);
    expect(new Set(ids).size).toBe(2); // distinct new ids
    expect(ids).not.toContain('wall-a');
    expect(ids).not.toContain('chair-b');
  });

  it('copy with nothing selected rejects (no silent no-op)', async () => {
    const { port } = makeFakePort();
    const { bus } = buildEnv(port);
    await expect(bus.executeCommand('copy-selection', {})).rejects.toThrow(/Nothing selected/i);
  });

  it('paste with an empty clipboard rejects', async () => {
    const { port, created } = makeFakePort();
    const { bus } = buildEnv(port);
    await expect(bus.executeCommand('paste-clipboard', {})).rejects.toThrow(/Clipboard is empty/i);
    expect(created).toHaveLength(0);
  });

  it('paste with no port wired rejects (feedback, not a crash)', async () => {
    const { selection, clipboard, bus } = buildEnv(null);
    selection.select([{ id: 'wall-x', kind: 'wall' }]);
    await bus.executeCommand('copy-selection', {});
    expect(clipboard.size).toBe(1);
    await expect(bus.executeCommand('paste-clipboard', {})).rejects.toThrow(/not available/i);
  });
});
