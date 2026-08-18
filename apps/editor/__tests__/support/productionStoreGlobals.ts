// §L-980 test support — WHICH `window.*Store` globals production actually assigns.
//
// Why this is measured and not listed. Every undo-coverage gate in this repo needs
// a window with the legacy element stores on it, and each one previously hand-wrote
// that list. A hand-written list is a fixture MORE CAPABLE than production the
// moment it names a store nothing assigns — which is precisely how L-980 hid:
// `performUndoRedo.test.ts` stubbed `poolStore`, `waterStore` and
// `stairLandingStore`, manufacturing the three globals whose ABSENCE was the bug,
// so every gate that used the fixture reported coverage that did not exist.
//
// So the list is read out of the real init sources at test time. If someone deletes
// an assignment, the fixture shrinks with production instead of papering over it.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

/** The monorepo root, found by walking up to `pnpm-workspace.yaml` — independent of
 *  whether vitest was invoked from `apps/editor` or from the repo root. */
export function repoRoot(): string {
  let d = resolve(process.cwd());
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, 'pnpm-workspace.yaml'))) return d;
    const up = dirname(d);
    if (up === d) break;
    d = up;
  }
  throw new Error(`could not locate the monorepo root from ${process.cwd()}`);
}

/** Every engine source that performs `window.<x>Store = …` at boot. Listing the
 *  FILES (not the store names) is what keeps this a measurement. */
export const ASSIGNMENT_SOURCES = [
  'apps/editor/src/engine/initBuilders.ts',
  'apps/editor/src/engine/initTools.ts',
  'apps/editor/src/engine/initUI.ts',
  'apps/editor/src/engine/engineLauncher.ts',
  'apps/editor/src/engine/initDataPlatform.ts',
  'apps/editor/src/engine/initProjectOrigin.ts',
] as const;

/** The `window.*Store` globals production assigns, measured from source. */
export function measureAssignedStoreGlobals(): ReadonlySet<string> {
  const root = repoRoot();
  const out = new Set<string>();
  for (const rel of ASSIGNMENT_SOURCES) {
    const text = readFileSync(join(root, rel), 'utf8');
    for (const line of text.split('\n')) {
      // Skip comment lines so a commented-out assignment is not counted as one.
      if (/^\s*(\/\/|\*)/.test(line)) continue;
      const m = /(?:^|[^.\w])window\.(\w*[Ss]tore)\s*=[^=]/.exec(line);
      if (m) out.add(m[1]!);
    }
  }
  return out;
}

/** A duck-typed stand-in for a legacy element store: exactly the mutator surface
 *  `elementUndoStoreAdapter` is documented against, and deliberately no more. Its
 *  only job in a coverage gate is to be TRUTHY so the adapter is built. */
export function stubLegacyStore(): Record<string, unknown> {
  return {
    add() { /* no-op */ },
    remove() { /* no-op */ },
    update() { /* no-op */ },
    getById() { return undefined; },
    get() { return undefined; },
    getAll() { return []; },
  };
}

const W = (): Record<string, unknown> => window as unknown as Record<string, unknown>;

/** Install a stub for each named global. Returns the names installed. */
export function installStoreGlobals(names: Iterable<string>): readonly string[] {
  const installed: string[] = [];
  for (const n of names) { W()[n] = stubLegacyStore(); installed.push(n); }
  return installed;
}

export function clearStoreGlobals(names: Iterable<string>): void {
  for (const n of names) delete W()[n];
}
