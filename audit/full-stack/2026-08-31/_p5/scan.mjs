// P5 AXIS 7 — replica of tools/ga-gate/check-layer-boundaries.ts scan, but emitting
// FULL file:line detail so the repo-wide numbers can be ATTRIBUTED per element family.
// Imports the SAME layer table from eslint.config.js (never a copy).
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { layerElements as ELEMENTS, allowedDependencies as ALLOW } from '../../../../eslint.config.js';

const BS = String.fromCharCode(92);

// line-preserving comment strip (the gate collapses block comments to one space;
// we keep newlines so file:LINE is exact. Aggregate counts are cross-checked below.)
function strip(src) {
  let out = ''; let q = null;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i], prev = src[i - 1];
    if (q) { out += ch; if (ch === q && prev !== BS) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; out += ch; continue; }
    if (ch === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; out += '\n'; continue; }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2); const seg = src.slice(i, end === -1 ? src.length : end + 2);
      out += seg.replace(/[^\n]/g, ' '); i = end === -1 ? src.length : end + 1; continue;
    }
    out += ch;
  }
  return out;
}

function gitls(cmd) { return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).split('\n').map(s => s.trim()).filter(Boolean); }

const pkgs = new Map();
for (const f of gitls('git ls-files --cached --others --exclude-standard -- "packages/*/package.json" "plugins/*/package.json" "apps/*/package.json"')) {
  try { const n = JSON.parse(readFileSync(f, 'utf8')).name; if (n) pkgs.set(n, dirname(f).replace(/\\/g, '/')); } catch { /* ignore */ }
}

function patternToRe(p) {
  const esc = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '').replace(/\*/g, '[^/]*').replace(//g, '.*');
  return new RegExp(`^${esc}$`);
}
const COMPILED = ELEMENTS.map(e => ({ type: e.type, re: patternToRe(e.pattern), pattern: e.pattern }));
function layerOf(p) { for (const c of COMPILED) if (c.re.test(p)) return c.type; return null; }

const ALLOW_MAP = new Map();
for (const rule of ALLOW) {
  const fr = Array.isArray(rule.from) ? rule.from : [rule.from];
  for (const f of fr) { const s = ALLOW_MAP.get(f) ?? new Set(); for (const a of rule.allow) s.add(a); ALLOW_MAP.set(f, s); }
}
function isAllowed(from, to) { if (from === to) return true; const a = ALLOW_MAP.get(from); if (!a) return true; return a.has('*') || a.has(to); }

const RESTRICTED = [
  { mod: '@thatopen/components-front', allowed: ['plugins/ifc-import/'] },
  { mod: '@thatopen/components', allowed: ['plugins/ifc-import/'] },
  { mod: 'express', allowed: ['apps/sync-server/', 'apps/bake-worker/', 'apps/api-gateway/', 'apps/marketplace-api/'] },
];

const files = gitls('git ls-files --cached --others --exclude-standard -- "packages/**/*.ts" "plugins/**/*.ts" "apps/**/*.ts" "packages/**/*.tsx" "apps/**/*.tsx"')
  .filter(f => !f.includes('__tests__') && !f.endsWith('.d.ts') && !f.includes('/dist/'));

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[\s\S]{0,400}?from\s*['"]([^'"]+)['"]|(?:^|[^.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)|(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g;

const violations = [], sdkBypass = [], restricted = [];
let unreadable = 0;
for (const file of files) {
  const fromLayer = layerOf(file);
  if (!fromLayer) continue;
  let src; try { src = strip(readFileSync(file, 'utf8')); } catch { unreadable++; continue; }
  const lineOf = (idx) => src.slice(0, idx).split('\n').length;
  IMPORT_RE.lastIndex = 0; let m;
  while ((m = IMPORT_RE.exec(src)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3]; if (!spec) continue;
    const line = lineOf(m.index + m[0].length - 1);
    for (const r of RESTRICTED) {
      if (spec !== r.mod && !spec.startsWith(r.mod + '/')) continue;
      if (r.allowed.some(a => file.startsWith(a))) break;
      restricted.push({ file, line, mod: r.mod, spec }); break;
    }
    let targetPath = null;
    if (spec.startsWith('@pryzm/')) {
      const base = spec.split('/').slice(0, 2).join('/');
      const dir = pkgs.get(base) ?? pkgs.get(spec);
      if (dir) targetPath = `${dir}/src/index.ts`;
    } else if (spec.startsWith('.')) { targetPath = join(dirname(file), spec).replace(/\\/g, '/'); }
    if (!targetPath) continue;
    const toLayer = layerOf(targetPath); if (!toLayer) continue;
    if (fromLayer === 'L6' && toLayer !== 'L5' && toLayer !== 'L6') {
      sdkBypass.push({ file, line, spec, target: targetPath.replace(/\/src\/index\.ts$/, ''), fromLayer, toLayer });
    }
    if (!isAllowed(fromLayer, toLayer)) violations.push({ file, line, spec, fromLayer, toLayer, target: targetPath.replace(/\/src\/index\.ts$/, '') });
  }
}

const unclassified = [];
for (const [name, dir] of pkgs) { if (!layerOf(`${dir}/src/index.ts`)) unclassified.push({ name, dir }); }

const out = {
  head: execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim(),
  totals: {
    scanned_files: files.length, workspace_packages: pkgs.size, unreadable,
    upward_imports: violations.length, sdk_bypasses: sdkBypass.length,
    banned_third_party: restricted.length, unclassified: unclassified.length,
  },
  violations, sdkBypass, restricted, unclassified,
  package_layers: Object.fromEntries([...pkgs].map(([n, d]) => [n, { dir: d, layer: layerOf(`${d}/src/index.ts`) }])),
};
process.stdout.write(JSON.stringify(out, null, 1));
