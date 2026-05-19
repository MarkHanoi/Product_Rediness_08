// S70 D8 — Deletion guard for src/lifecycle/.
// Spec: SPEC-27 §4.3 + ADR-030 Part D + ADR-0052 §B.7.
//
// Two assertions:
//   1. The directory `src/lifecycle/` does not exist.
//   2. No `.ts`/`.tsx`/`.js` file repo-wide imports from `src/lifecycle/`
//      (catches re-introduction via copy-paste).

import { describe, it, expect } from 'vitest';
import { promises as fs } from 'node:fs';
import { resolve, relative, sep } from 'node:path';

const REPO_ROOT = resolve(__dirname, '../..');
const LIFECYCLE_DIR = resolve(REPO_ROOT, 'src', 'lifecycle');

const SCAN_ROOTS = [
  'src',
  'apps',
  'packages',
  'plugins',
  'tools',
  'tests',
];

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const IGNORE_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', '__snapshots__']);
// Files that are ALLOWED to mention "src/lifecycle/" because they're documentation
// of the deletion (the migration plan, ADRs, and this guard test itself).
const DOC_ALLOWLIST = new Set<string>([
  resolve(__dirname, 'lifecycle-deletion-guard.test.ts'),
]);

async function* walk(dir: string): AsyncGenerator<string> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw err;
  }
  for (const e of entries) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const full = resolve(dir, e.name);
    if (e.isDirectory()) {
      yield* walk(full);
    } else if (e.isFile()) {
      yield full;
    }
  }
}

describe('S70 D8 — src/lifecycle/ deletion guard (ADR-0052 §B.7)', () => {
  it('the directory src/lifecycle/ does not exist', async () => {
    let exists = false;
    try {
      const stat = await fs.stat(LIFECYCLE_DIR);
      exists = stat.isDirectory();
    } catch {
      exists = false;
    }
    expect(exists).toBe(false);
  });

  it('no module repo-wide imports from src/lifecycle/', async () => {
    const offenders: { file: string; lineNo: number; line: string }[] = [];
    // Match: `from '../../lifecycle/Foo'` OR `from "src/lifecycle/Foo"` OR
    // dynamic `import('...lifecycle/Foo')` — anywhere src/lifecycle/ is the
    // resolution target.  The conservative regex matches the SUBSTRING
    // 'lifecycle/' inside any quoted import specifier that traverses through
    // ../../lifecycle/ or src/lifecycle/.
    const importRe = /(?:from\s+|import\(\s*)["']([^"']+)["']/g;

    for (const root of SCAN_ROOTS) {
      const rootAbs = resolve(REPO_ROOT, root);
      for await (const file of walk(rootAbs)) {
        const ext = file.slice(file.lastIndexOf('.'));
        if (!SCAN_EXTENSIONS.has(ext)) continue;
        if (DOC_ALLOWLIST.has(file)) continue;
        const text = await fs.readFile(file, 'utf8');
        importRe.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = importRe.exec(text)) !== null) {
          const spec = m[1] ?? '';
          // Match resolved targets that land inside src/lifecycle/.
          // Patterns: "../../lifecycle/Foo", "../lifecycle/Foo",
          //          "src/lifecycle/Foo", "/lifecycle/Foo" (relative-from-src),
          //          "../../../lifecycle/Foo".
          // We DO NOT flag matches like "apps/editor/src/sunset/" or
          // "plugins/lifecycle/" — only the legacy src/lifecycle/.
          const isLegacy =
            /^(?:\.{1,2}\/)+lifecycle\//.test(spec) ||
            /(?:^|\/)src\/lifecycle\//.test(spec);
          if (!isLegacy) continue;
          // Find the line for a friendly error.
          const upTo = text.slice(0, m.index);
          const lineNo = upTo.split('\n').length;
          const line = (text.split('\n')[lineNo - 1] ?? '').trim();
          offenders.push({ file: relative(REPO_ROOT, file).split(sep).join('/'), lineNo, line });
        }
      }
    }

    if (offenders.length > 0) {
      const msg = offenders.map(o => `  ${o.file}:${o.lineNo}  ${o.line}`).join('\n');
      throw new Error(`Found ${offenders.length} legacy import(s) from src/lifecycle/:\n${msg}`);
    }
    expect(offenders).toEqual([]);
  });
});
