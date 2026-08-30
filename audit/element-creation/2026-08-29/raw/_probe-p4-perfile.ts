// AUDIT PROBE — read-only. Reuses the gate's own scanner so the numbers are the ENFORCED ones.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { scanFiles, scanFilesStripped, tallyBy } from '../../../../tools/ga-gate/lib/sourceScan.js';

const ROOT = process.cwd();
const isTest = (rel: string) =>
  /(^|\/)(__tests__|__fixtures__|__mocks__)\//.test(rel) || /\.(spec|test)\.tsx?$/.test(rel);

function run(name: string, dirs: string[], pattern: RegExp, excludeTests: boolean, minFiles: number) {
  const d = dirs.filter((x) => existsSync(resolve(ROOT, x)));
  const cfg = {
    root: ROOT, dirs: d, pattern, minFiles,
    exclude: (rel: string) =>
      rel.endsWith('.d.ts')
      || (excludeTests && isTest(rel))
      || rel === 'tools/ga-gate/check-cast-count.ts'
      || rel.startsWith('audit/'),
    label: name,
  };
  const stripped = scanFilesStripped(cfg);
  const raw = scanFiles(cfg);
  console.log(`\n### ${name} · dirs=${d.join(',')} · files=${stripped.filesScanned}`);
  console.log(`### stripped(code-only)=${stripped.matches.length}  raw(incl comments)=${raw.matches.length}  prose=${raw.matches.length - stripped.matches.length}`);
  const per = tallyBy(stripped.matches, (m) => m.file);
  console.log(`### distinct files with code matches = ${per.length}`);
  for (const [f, n] of per) console.log(`${String(n).padStart(4)}  ${f}`);
}

run('P4-A repo-wide (window as any) [gate spelling, tests excluded]',
  ['src','apps','packages','plugins','server','tools'], /\(\s*window\s+as\s+any\s*\)/, true, 3000);
run('P4-B strict scope (window as any) [tests INCLUDED, as the gate does]',
  ['src','apps/editor/src/engine'], /\(\s*window\s+as\s+any\s*\)/, false, 100);
run('P4-C EVASION: window as unknown as [repo-wide, tests excluded]',
  ['src','apps','packages','plugins','server','tools'], /window\s+as\s+unknown\s+as/, true, 3000);
run('P4-D EVASION: (globalThis as any) [repo-wide, tests excluded]',
  ['src','apps','packages','plugins','server','tools'], /\(\s*globalThis\s+as\s+any\s*\)/, true, 3000);
run('P4-E EVASION: globalThis as unknown as [repo-wide, tests excluded]',
  ['src','apps','packages','plugins','server','tools'], /globalThis\s+as\s+unknown\s+as/, true, 3000);
run('P4-F BLIND SPOT: (window as any) in scripts/ [NOT in gate repo-wide dirs]',
  ['scripts'], /\(\s*window\s+as\s+any\s*\)/, true, 1);
