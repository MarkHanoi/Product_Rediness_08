import { readFileSync, existsSync, writeFileSync } from 'node:fs';
const S = JSON.parse(readFileSync('audit/full-stack/2026-08-31/_p5/scan.json', 'utf8'));
const M = JSON.parse(readFileSync('audit/full-stack/2026-08-31/_p5/families-map.json', 'utf8')).map;

const dirLayer = {};
for (const [n, v] of Object.entries(S.package_layers)) dirLayer[v.dir] = { pkg: n, layer: v.layer };

const inDirs = (file, dirs) => dirs.some(d => file === d || file.startsWith(d + '/'));

const rows = {};
for (const [fam, dirs] of Object.entries(M)) {
  const present = dirs.map(d => ({ dir: d, exists: existsSync(d), pkg: dirLayer[d]?.pkg ?? null, layer: dirLayer[d]?.layer ?? null }));
  const up = S.violations.filter(v => inDirs(v.file, dirs));
  const by = S.sdkBypass.filter(v => inDirs(v.file, dirs));
  const rs = S.restricted.filter(v => inDirs(v.file, dirs));
  // who imports INTO this family upward (i.e. this family is the TARGET of a violation)
  const upIn = S.violations.filter(v => inDirs(v.target, dirs));
  rows[fam] = {
    packages_participating: present,
    upward_imports: { count: up.length, sites: up.map(v => `${v.file}:${v.line} -> ${v.spec} [${v.fromLayer} -> ${v.toLayer}]`) },
    upward_imports_INTO_family: { count: upIn.length, sites: upIn.map(v => `${v.file}:${v.line} -> ${v.spec} [${v.fromLayer} -> ${v.toLayer}]`) },
    sdk_bypasses: { count: by.length, by_target: by.reduce((a, v) => (a[v.target] = (a[v.target] || 0) + 1, a), {}), sites: by.map(v => `${v.file}:${v.line} -> ${v.spec} [L6 -> ${v.toLayer}]`) },
    banned_third_party: { count: rs.length, sites: rs.map(v => `${v.file}:${v.line} -> ${v.mod}`) },
  };
}
// residual: rows NOT attributed to any family
const allDirs = [...new Set(Object.values(M).flat())];
const resid = (arr) => arr.filter(v => !inDirs(v.file, allDirs));
const residual = {
  upward_imports: resid(S.violations).map(v => `${v.file}:${v.line} -> ${v.spec} [${v.fromLayer} -> ${v.toLayer}]`),
  sdk_bypasses: resid(S.sdkBypass).map(v => `${v.file}:${v.line} -> ${v.spec} [L6 -> ${v.toLayer}]`),
  banned_third_party: resid(S.restricted).map(v => `${v.file}:${v.line} -> ${v.mod}`),
};
writeFileSync('audit/full-stack/2026-08-31/_p5/attribution.json', JSON.stringify({ rows, residual, totals: S.totals }, null, 1));
for (const [f, r] of Object.entries(rows)) console.log(f.padEnd(14), 'up', String(r.upward_imports.count).padStart(3), 'in', String(r.upward_imports_INTO_family.count).padStart(3), 'bypass', String(r.sdk_bypasses.count).padStart(3), '3p', String(r.banned_third_party.count).padStart(3));
console.log('RESIDUAL up', residual.upward_imports.length, 'bypass', residual.sdk_bypasses.length, '3p', residual.banned_third_party.length);
