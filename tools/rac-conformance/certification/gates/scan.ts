// ─── A Node-native source walker. NO EXTERNAL BINARIES. ──────────────────────
//
// §FIX-GATE-NEEDS-RIPGREP (L-811) applies here verbatim: three ga-gate checks
// once shelled out to `rg`, which CI never installed and which is absent from a
// stock Windows dev box, and they died with `spawnSync rg ENOENT`. The fix was
// deliberately NOT to install ripgrep in the workflow — that makes CI green while
// leaving every developer machine broken, which is worse, because it hides the
// problem exactly where a contributor first meets it. So: `fs` only.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, relative } from 'node:path';

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', 'coverage', '.next', '.turbo',
  '.run-output', 'results', '.vite', 'out',
]);

export interface SourceFile { path: string; rel: string; text: string }

/** Walk `roots` collecting .ts/.tsx production sources (tests excluded). */
export function collectSources(repoRoot: string, roots: string[], opts?: { includeTests?: boolean }): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const p = join(dir, name);
      let st;
      try { st = statSync(p); } catch { continue; }
      if (st.isDirectory()) { walk(p); continue; }
      if (!/\.(ts|tsx)$/.test(name)) continue;
      if (!opts?.includeTests && /\.(test|spec|cert)\.tsx?$/.test(name)) continue;
      if (name.endsWith('.d.ts')) continue;
      try { out.push({ path: p, rel: relative(repoRoot, p).replace(/\\/g, '/'), text: readFileSync(p, 'utf8') }); }
      catch { /* unreadable file — counted by neither side, and the floor notices */ }
    }
  };
  for (const r of roots) walk(resolve(repoRoot, r));
  return out;
}
