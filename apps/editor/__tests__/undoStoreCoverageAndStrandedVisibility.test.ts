// @vitest-environment happy-dom
//
// §EI-7c (C84 §3) — NO FAMILY MAY BE SILENTLY UN-UNDOABLE.
//
// THE DEFECT THESE PIN. `buildUndoStoreMap()` has no entry for `structural`,
// `dimension`, `section`, `sheet`, `schedule`, `view`, `selection` — or
// `active-view`, an EIGHTH the contract did not name and this sweep found.
// Their handlers ARE registered in production (`engineLauncher.ts:588,606,619,622`).
// `_covered()` therefore reports "not covered", `performUndo` does not step the
// ring-buffer cursor, the legacy stack has nothing to fall back to, and Ctrl+Z is
// a TOTAL NO-OP. `performUndo` diagnosed it correctly as `{status:'stranded'}`
// from the day it was written — and `initUI`'s keydown handler, `BimService.undo`
// and the HUD button all DISCARD the return value, so the diagnosis reached
// nobody. A correctly-diagnosed failure that is invisible is still a silent
// failure (C03 §4.6 U-4 — the rule this repo has closed a dozen times elsewhere:
// "failure and emptiness are not the same value").
//
// TWO ARMS, and neither fakes coverage:
//
//   ARM 1 — DECLARED. Every `affectedStores` key any bus handler declares must be
//     either MAPPED (an adapter exists) or DECLARED in `UNMAPPED_BUS_STORE_KEYS`
//     with an owner and a reason. This is C84 §5's `check-undo-store-coverage.ts`
//     invariant, executed. It does NOT assert the stranded families are undoable
//     — they are not. It asserts nobody can add a ninth without saying so.
//
//   ARM 2 — VISIBLE. A stranded keypress must reach the USER, not just the
//     console. Carries a NEGATIVE CONTROL: a COVERED store must undo normally and
//     raise NO message, so a green arm cannot mean "it always warns".

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Hoisted so the dynamic `import('@app/ui/platform/PlatformToastSystem')` inside
// `_reportStranded` resolves to this spy.
const { showToast } = vi.hoisted(() => ({ showToast: vi.fn() }));
vi.mock('@app/ui/platform/PlatformToastSystem', () => ({ showToast }));

import { buildUndoStoreMap, performUndo, UNMAPPED_BUS_STORE_KEYS } from '../src/engine/undo/performUndoRedo.js';
import {
  measureAssignedStoreGlobals,
  installStoreGlobals,
  clearStoreGlobals,
} from './support/productionStoreGlobals.js';

/** The monorepo root, found by walking up to `pnpm-workspace.yaml` — independent
 *  of whether vitest was invoked from `apps/editor` or from the repo root.
 *  (`import.meta.url` is not usable here: happy-dom replaces `URL`, which rejects
 *  a file: scheme.) */
const REPO_ROOT = (() => {
  let d = resolve(process.cwd());
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, 'pnpm-workspace.yaml'))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error(`could not locate the monorepo root from ${process.cwd()}`);
})();

// ─────────────────────────────────────────────────────────────────────────────
// ARM 1 — the source sweep.
// ─────────────────────────────────────────────────────────────────────────────

function tsFilesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    let entries: string[];
    try { entries = readdirSync(d); } catch { return; }
    for (const e of entries) {
      const p = join(d, e);
      let s;
      try { s = statSync(p); } catch { continue; }
      if (s.isDirectory()) {
        if (e === 'node_modules' || e === 'dist' || e === '__tests__') continue;
        walk(p);
      } else if (/\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/** BOTH declaration forms — `affectedStores = [...]` (class field) and
 *  `affectedStores: [...]` (handler descriptor object). Missing the second is how
 *  an earlier count of this same set came back short by `view` and `active-view`. */
const DECL = /affectedStores\s*(?::\s*(?:readonly\s+)?[A-Za-z0-9_<>[\]'"| .]*?)?\s*[:=]\s*\[([^\]]*)\]/g;

function declaredKeysIn(files: readonly string[]): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const f of files) {
    const text = readFileSync(f, 'utf8');
    DECL.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = DECL.exec(text))) {
      // Skip commented-out declarations (`// affectedStores: ['view']`).
      const lineStart = text.lastIndexOf('\n', m.index) + 1;
      if (/^\s*(\/\/|\*)/.test(text.slice(lineStart, m.index))) continue;
      for (const k of [...m[1]!.matchAll(/['"]([^'"]+)['"]/g)].map(x => x[1]!)) {
        const rel = f.slice(REPO_ROOT.length + 1).split('\\').join('/');
        if (!found.has(k)) found.set(k, []);
        if (!found.get(k)!.includes(rel)) found.get(k)!.push(rel);
      }
    }
  }
  return found;
}

/**
 * §L-980 (2026-08-18) — "MAPPED" MEANS AN ADAPTER EXISTS, NOT THAT A KEY EXISTS.
 *
 * This arm used to compute `mapped` as `new Set(Object.keys(buildUndoStoreMap()))`
 * — key PRESENCE. `adaptElementStoreMap` stores `undefined` for any key whose
 * backing `window.*Store` is unassigned, so `pool: undefined` and `water:
 * undefined` scored as covered here for months while `_covered()` read them as
 * uncovered at runtime. A gate that cannot distinguish "there is an adapter" from
 * "there is a key" cannot detect the defect it exists to detect.
 *
 * `mappedKeys()` now requires a working `applyPatch`, which means the window
 * globals must be installed first — and installed from a MEASUREMENT of the real
 * init sources rather than a hand-list, because the hand-list is the other half of
 * how L-980 hid. See `./support/productionStoreGlobals.ts`.
 */
function mappedKeys(): Set<string> {
  return new Set(
    Object.entries(buildUndoStoreMap())
      .filter(([, adapter]) => typeof adapter?.applyPatch === 'function')
      .map(([k]) => k),
  );
}

describe('§EI-7c ARM 1 — every bus store key is MAPPED or DECLARED', () => {
  const handlerFiles = tsFilesUnder(join(REPO_ROOT, 'plugins'))
    .filter(f => f.split('\\').join('/').includes('/handlers/'));
  const declared = declaredKeysIn(handlerFiles);
  const productionGlobals = measureAssignedStoreGlobals();

  beforeEach(() => { installStoreGlobals(productionGlobals); });
  afterEach(() => { clearStoreGlobals(productionGlobals); });

  it('the sweep actually swept something (guards against a vacuously green arm)', () => {
    expect(handlerFiles.length).toBeGreaterThan(100);
    expect(declared.size).toBeGreaterThan(20);
    // The key whose absence made the corrupting curtain-wall undo route at all.
    expect(declared.has('curtainwall')).toBe(true);
    // §L-980 — and the store fixture swept something too. Without this, an empty
    // `productionGlobals` would make EVERY key unmapped and the arm below would
    // demand a declaration for all of them, which is a different failure wearing
    // the same colour.
    expect(productionGlobals.size, 'no window.*Store assignments measured').toBeGreaterThan(15);
    expect(mappedKeys().size, 'no key resolved to a working adapter').toBeGreaterThan(20);
  });

  it('no bus store key is silently un-undoable', () => {
    const mapped = mappedKeys();
    const undeclared = [...declared.keys()]
      .filter(k => !mapped.has(k) && UNMAPPED_BUS_STORE_KEYS[k] === undefined)
      .sort();
    expect(
      undeclared,
      `These bus store keys have no buildUndoStoreMap() adapter AND no entry in ` +
      `UNMAPPED_BUS_STORE_KEYS. Ctrl+Z is a silent no-op for them (C84 §3 EI-7c). ` +
      `Wire an adapter, or declare the gap with its reason:\n` +
      undeclared.map(k => `  ${k} — ${declared.get(k)!.slice(0, 2).join(', ')}`).join('\n'),
    ).toEqual([]);
  });

  it('names the TEN stranded families the sweep measured — including the two the key-set arm could not see', () => {
    const mapped = mappedKeys();
    const stranded = [...declared.keys()]
      .filter(k => !mapped.has(k) && UNMAPPED_BUS_STORE_KEYS[k]?.owner === 'nothing')
      .sort();
    // §L-980 — was eight. `pool` and `water` join not because anything changed at
    // runtime (their adapters were already `undefined`) but because this arm now
    // asks whether an ADAPTER exists rather than whether a KEY exists. The two are
    // a different SHAPE of stranded from the other eight and the table says so:
    // pool.create cannot execute at all (CommandBus.buildContext throws on the
    // missing store), so no ring entry is minted and no keypress strands. They are
    // declared because the map claimed them, not because Ctrl+Z fails today.
    expect(stranded).toEqual(
      // §L-7310..L-7312 (2026-08-23) added balcony / lift / liftPart to the declared
      // stranded set; this literal was not moved with them and read RED for two days.
      // §L-11160 (2026-08-25): boundaryLine is NOT here — it gained a real adapter.
      ['active-view', 'balcony', 'dimension', 'lift', 'liftPart', 'pool', 'schedule', 'section', 'selection', 'sheet', 'structural', 'view', 'water'],
    );
  });

  it('every declared gap carries a REASON — a bare listing is not a declaration', () => {
    for (const [key, entry] of Object.entries(UNMAPPED_BUS_STORE_KEYS)) {
      expect(entry.reason.length, `${key} has no reason`).toBeGreaterThan(30);
      expect(['legacy-stack', 'nothing']).toContain(entry.owner);
    }
  });

  it('the three legacy-stack exemptions are exactly door / window / level', () => {
    const legacyOwned = Object.entries(UNMAPPED_BUS_STORE_KEYS)
      .filter(([, v]) => v.owner === 'legacy-stack').map(([k]) => k).sort();
    expect(legacyOwned).toEqual(['door', 'level', 'window']);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ARM 2 — the stranded keypress must reach the user.
// ─────────────────────────────────────────────────────────────────────────────

function installRingBuffer(affectedStores: readonly string[], applied: boolean): void {
  const pair = {
    affectedStores,
    timestamp: Date.now(),
    gestureId: 'g1',
    forward: { ops: [] as unknown[] },
    inverse: { ops: [{ op: 'remove', path: '/el-1' }] as unknown[] },
  };
  (window as unknown as Record<string, unknown>).runtime = {
    bus: {
      ringBuffer: {
        canUndo: () => true,
        canRedo: () => false,
        current: () => pair,
        peek: () => pair,
        undoPatch: () => (applied ? pair.inverse : null),
        redoPatch: () => null,
      },
    },
  };
}

describe('§EI-7c ARM 2 — a stranded Ctrl+Z is visible, not just logged', () => {
  beforeEach(() => {
    showToast.mockClear();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    delete (globalThis as Record<string, unknown>).commandManager;
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete (window as unknown as Record<string, unknown>).runtime;
    delete (window as unknown as Record<string, unknown>).wallStore;
  });

  it('a `dimension` entry strands AND tells the user the change is still there', async () => {
    installRingBuffer(['dimension'], false);
    const out = performUndo();
    expect(out.status).toBe('stranded');
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    const [msg, kind] = showToast.mock.calls[0]!;
    expect(msg).toContain('dimension');
    expect(msg).toContain('still there');   // the user's WORK, named — not a code
    expect(kind).toBe('error');
  });

  it('NEGATIVE CONTROL — a COVERED store undoes normally and raises no message', async () => {
    // `wall` is mapped, so this entry is applied rather than stranded. If the
    // message fired here too, ARM 1's arm above would be measuring nothing.
    const el = { id: 'el-1' };
    const map = new Map([['el-1', el]]);
    (window as unknown as Record<string, unknown>).wallStore = {
      add: (e: { id: string }) => map.set(e.id, e),
      remove: (id: string) => { map.delete(id); },
      update: () => {},
      getById: (id: string) => map.get(id),
    };
    installRingBuffer(['wall'], true);

    const out = performUndo();
    expect(out.status).toBe('undone');
    expect(map.has('el-1')).toBe(false);            // it really reverted
    await new Promise(r => setTimeout(r, 0));       // let any pending import() settle
    expect(showToast).not.toHaveBeenCalled();
  });

  it('an entry declaring NO stores strands with the C03 §4.6 U-2 reason', async () => {
    installRingBuffer([], false);
    const out = performUndo();
    expect(out.status).toBe('stranded');
    await vi.waitFor(() => expect(showToast).toHaveBeenCalledTimes(1));
    expect(showToast.mock.calls[0]![0]).toContain('could not revert');
  });
});
