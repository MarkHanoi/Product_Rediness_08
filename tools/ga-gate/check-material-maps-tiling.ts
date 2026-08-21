#!/usr/bin/env tsx
/**
 * §MATERIAL-MAPS-AND-TILING (L-1700..L-1704) — the gate for C100's texture facet.
 *
 * ⭐ WHY THIS EXISTS AT ALL. C100 §10.3.b named the record-SHAPE as the ceiling:
 * *"parquet, shingle and mosaic are PATTERN … a row without a map is a brown
 * rectangle."* Lifting that ceiling introduced four ways to author a row that
 * looks right and renders wrong, and every one of them is SILENT:
 *
 *   1. maps with NO tiling — the texture stretches to whatever surface it lands
 *      on, so the same product reads as a different product on every element.
 *      That is C100 §2.3's defect ("two elements both made of Oak rendering
 *      different browns") re-created inside one material.
 *   2. a map path OUTSIDE the `/items/` catalogue prefix — `resolveCatalogAssetUrl`
 *      returns such a path UNCHANGED, so in a rehosted build it never reaches the
 *      CDN and 404s. ⭐ This one is not hypothetical: the L0 doc comment shipped
 *      with `/textures/…` as its example until lane MAT-2 ran it.
 *   3. a map in a format nothing can DECODE. `.ktx2` is on the proxy's allowlist
 *      and R2 will serve it, which reads like support — but there is no
 *      KTX2Loader in this client. Delivery and decode are different facts, and
 *      the gate checks the one that determines whether a pixel appears.
 *   4. generated rows drifting from the provenance manifest they were derived
 *      from — the C100 §0.3 rot, applied to 80 asset paths.
 *
 * ⚠ ARM A DOES NOT RE-IMPLEMENT ITS RULE. It calls `materialMapsDefect()` from
 * `@pryzm/schemas/materials`, the SAME pure predicate the resolver uses, so the
 * gate and the runtime cannot disagree about what "well-formed" means (C84 EI-8:
 * one producer per question).
 *
 * ⚠ ARM C DOES NOT KEEP ITS OWN FORMAT LIST EITHER. It reads the loadable
 * extensions out of `MaterialResolver.ts`'s source text rather than importing the
 * module (which would pull THREE into a Node gate) and rather than transcribing
 * them (which would be a rival list — the exact defect C100 §1.1 traces six
 * times). If the resolver registers a new format, this gate learns it.
 *
 * Exit: 0 = clean · 1 = a violation · 2 = the scan is misconfigured.
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { MATERIAL_CATALOG, materialMapsDefect, hasAnyMap, MATERIAL_MAP_CHANNELS } from '../../packages/schemas/src/materials/index.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'material-maps-tiling';
const RESOLVER = join(REPO_ROOT, 'packages/core-app-model/src/materials/MaterialResolver.ts');
const EMITTER = join(REPO_ROOT, 'tools/texture-pipeline/emit-catalog-rows.mjs');

/** The one prefix `resolveCatalogAssetUrl` rewrites. Read from the seam, not typed here. */
const CATALOG_SEAM = join(REPO_ROOT, 'packages/core-app-model/src/catalog/catalogAssetUrl.ts');

const failures: string[] = [];
const fail = (arm: string, msg: string): void => { failures.push(`  x [ARM ${arm}] ${msg}`); };

// ── preconditions ────────────────────────────────────────────────────────────
if (!existsSync(RESOLVER) || !existsSync(CATALOG_SEAM)) {
  console.error(`MISCONFIGURED: the resolver or the asset seam is missing — this gate cannot read its own vocabulary.`);
  process.exit(2);
}
/** L-950: a collection that resolves to ~nothing must FAIL, never pass over an empty run. */
if (MATERIAL_CATALOG.length < 200) {
  console.error(`MISCONFIGURED: MATERIAL_CATALOG has ${MATERIAL_CATALOG.length} rows (floor 200) — the import, not the data, is most likely broken.`);
  process.exit(2);
}

const seamSrc = readFileSync(CATALOG_SEAM, 'utf8');
const prefixMatch = /CATALOG_LOGICAL_PREFIX\s*=\s*'([^']+)'/.exec(seamSrc);
if (!prefixMatch) {
  console.error('MISCONFIGURED: cannot read CATALOG_LOGICAL_PREFIX from the asset seam.');
  process.exit(2);
}
const PREFIX = prefixMatch[1]!;

const resolverSrc = readFileSync(RESOLVER, 'utf8');
const extBlock = /RASTER_EXTENSIONS\s*=\s*\[([^\]]*)\]/.exec(resolverSrc);
if (!extBlock) {
  console.error('MISCONFIGURED: cannot read RASTER_EXTENSIONS from MaterialResolver.ts.');
  process.exit(2);
}
const LOADABLE = [...extBlock[1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!);
if (LOADABLE.length === 0) {
  console.error('MISCONFIGURED: RASTER_EXTENSIONS parsed to an empty list.');
  process.exit(2);
}

// ── the rows under test ──────────────────────────────────────────────────────
const textured = MATERIAL_CATALOG.filter((m) => hasAnyMap(m.maps));

// ── ARM A (hard-0) — maps imply a usable real-world scale ────────────────────
for (const m of MATERIAL_CATALOG) {
  const defect = materialMapsDefect(m);
  if (defect) fail('A', defect);
}

// ── ARM B (hard-0) — every map path is a REWRITABLE catalogue path ───────────
for (const m of textured) {
  for (const channel of MATERIAL_MAP_CHANNELS) {
    const path = m.maps?.[channel];
    if (!path) continue;
    if (!path.startsWith(PREFIX)) {
      fail('B', `'${m.id}'.maps.${channel} = '${path}' is outside the catalogue prefix '${PREFIX}', so the object-storage rewriter passes it through unchanged and it 404s in production`);
    }
    if (/^[a-z]+:\/\//i.test(path) || path.startsWith('data:')) {
      fail('B', `'${m.id}'.maps.${channel} is an absolute or data URL — a persisted record must survive a bucket move (L-570)`);
    }
  }
}

// ── ARM C (hard-0) — every map is in a format this client can DECODE ─────────
for (const m of textured) {
  for (const channel of MATERIAL_MAP_CHANNELS) {
    const path = m.maps?.[channel];
    if (!path) continue;
    const dot = path.lastIndexOf('.');
    const ext = dot > path.lastIndexOf('/') ? path.slice(dot).toLowerCase() : '';
    if (!LOADABLE.includes(ext)) {
      fail('C', `'${m.id}'.maps.${channel} is '${ext || '(no extension)'}', which no registered loader can decode (loadable: ${LOADABLE.join(', ')}). Delivery and decode are different facts — .ktx2 is served and cannot be decoded here.`);
    }
  }
}

// ── ARM D (hard-0) — the generated rows match their provenance manifest ──────
if (existsSync(EMITTER)) {
  try {
    execFileSync(process.execPath, [EMITTER, '--check'], { cwd: REPO_ROOT, stdio: 'pipe' });
  } catch {
    fail('D', 'the generated catalogue rows are STALE against tools/texture-pipeline/textures.manifest.json — re-run `node tools/texture-pipeline/emit-catalog-rows.mjs`');
  }
}

// ── report ───────────────────────────────────────────────────────────────────
console.log(`[${LABEL}] §MATERIAL-MAPS-AND-TILING (C100 §10.2.c / §10.9)`);
console.log(`[${LABEL}] catalogue : ${MATERIAL_CATALOG.length} rows, ${textured.length} carrying maps`);
console.log(`[${LABEL}] prefix    : '${PREFIX}' (read from catalogAssetUrl.ts, not transcribed)`);
console.log(`[${LABEL}] loadable  : ${LOADABLE.join(', ')} (read from MaterialResolver.ts, not transcribed)`);
console.log(`[${LABEL}] NOT CHECKED (UNPROVEN per C70 §7.1, never an inherited green):`);
console.log(`[${LABEL}]   that any map FILE exists in the bucket (that is the pipeline's ARM A/B);`);
console.log(`[${LABEL}]   that CORS permits the fetch (no Node check enforces it — L-578);`);
console.log(`[${LABEL}]   that the declared real-world size matches the image (a human judgement);`);
console.log(`[${LABEL}]   that any SURFACE carries metre UVs — only slabs/floors do (§L-1703).`);

if (failures.length) {
  console.error(`\n[${LABEL}] FAIL — ${failures.length} violation(s):`);
  for (const f of failures) console.error(f);
  process.exit(1);
}
console.log(`\n[${LABEL}] PASS — every textured row has a real-world scale, a rewritable path and a decodable format. HARD-FAIL AT ZERO.`);
