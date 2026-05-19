// family-editor-no-window — §13 quality gate (S52 D3).
//
// Per the rewrite plan §13: no `(window as any)` or `globalThis.<x>`
// outside `app/AppShell.ts` and `app/hotkeys.ts`.  The allow-list is
// for the two files that legitimately need to attach app-wide event
// listeners or expose a debug handle.
//
// What this rule prevents:
//   • Module state hidden in the global object (defeats SSR, breaks
//     module-replacement, makes test isolation impossible).
//   • Type-system escape hatches (`as any`) used to silently mutate
//     globals.
//
// Property READS like `window.matchMedia(...)` or `globalThis.crypto`
// are fine — only assignment + `as any` casts are forbidden.

import { describe, expect, it } from 'vitest';
import { loadAllSrcFiles } from './_walk.js';

const ALLOWED_FILES: ReadonlySet<string> = new Set([
  'src/app/AppShell.ts',
  'src/app/hotkeys.ts',
]);

const WINDOW_AS_ANY = /\bwindow\s+as\s+any\b/;
const GLOBALTHIS_AS_ANY = /\bglobalThis\s+as\s+any\b/;
const GLOBALTHIS_ASSIGN = /\bglobalThis\.\w+\s*=/;
const WINDOW_ASSIGN = /\(\s*window\s+as\s+\w+\s*\)\s*\.\w+\s*=/;

describe('family-editor-no-window — §13 quality gate (S52 D3)', () => {
  it('forbids `window as any` outside the allow-list', async () => {
    const files = await loadAllSrcFiles();
    const violators: string[] = [];
    for (const f of files) {
      if (ALLOWED_FILES.has(f.relPath)) continue;
      if (WINDOW_AS_ANY.test(f.stripped)) violators.push(f.relPath);
    }
    expect(violators, `window-as-any in: ${violators.join(', ') || '(none)'}`).toEqual([]);
  });

  it('forbids `globalThis as any` outside the allow-list', async () => {
    const files = await loadAllSrcFiles();
    const violators: string[] = [];
    for (const f of files) {
      if (ALLOWED_FILES.has(f.relPath)) continue;
      if (GLOBALTHIS_AS_ANY.test(f.stripped)) violators.push(f.relPath);
    }
    expect(violators, `globalThis-as-any in: ${violators.join(', ') || '(none)'}`).toEqual([]);
  });

  it('forbids assignment to globalThis.<id> outside the allow-list', async () => {
    const files = await loadAllSrcFiles();
    const violators: string[] = [];
    for (const f of files) {
      if (ALLOWED_FILES.has(f.relPath)) continue;
      if (GLOBALTHIS_ASSIGN.test(f.stripped)) violators.push(f.relPath);
    }
    expect(
      violators,
      `globalThis assignment in: ${violators.join(', ') || '(none)'}`,
    ).toEqual([]);
  });

  it('forbids `(window as X).foo = …` mutation outside the allow-list', async () => {
    const files = await loadAllSrcFiles();
    const violators: string[] = [];
    for (const f of files) {
      if (ALLOWED_FILES.has(f.relPath)) continue;
      if (WINDOW_ASSIGN.test(f.stripped)) violators.push(f.relPath);
    }
    expect(
      violators,
      `window.<x> = mutation in: ${violators.join(', ') || '(none)'}`,
    ).toEqual([]);
  });
});
