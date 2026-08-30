// W4 probe — measures convergence boolean #2's SUCCESSOR scope with the same
// method check-cast-count.ts uses (scanFilesStripped, .d.ts excluded).
// Audit-only. Not production code. Not registered anywhere.
import { scanFilesStripped, scanFiles } from '../../../../tools/ga-gate/lib/sourceScan.js';

const ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
for (const dir of ['apps/editor/src/ui', 'src', 'apps/editor/src/engine']) {
  const strict = scanFilesStripped({
    root: ROOT, dirs: [dir], pattern: /\(\s*window\s+as\s+any\s*\)/,
    minFiles: 1, exclude: (rel: string) => rel.endsWith('.d.ts'), label: 'w4-probe',
  });
  const raw = scanFiles({
    root: ROOT, dirs: [dir], pattern: /\(\s*window\s+as\s+any\s*\)/,
    minFiles: 1, exclude: (rel: string) => rel.endsWith('.d.ts'), label: 'w4-probe',
  });
  console.log(`${dir}: filesScanned=${strict.filesScanned} strictMatches=${strict.matches.length} rawMatches=${raw.matches.length} proseOnly=${raw.matches.length - strict.matches.length}`);
}
