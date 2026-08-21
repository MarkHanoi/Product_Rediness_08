#!/usr/bin/env node
/**
 * emit-catalog-rows.mjs — §MATERIAL-MAPS-AND-TILING (L-1704).
 *
 * Writes the `MaterialRecord` rows for MAT-2's published textures INTO
 * `packages/schemas/src/materials/materialCatalog.ts`, between the two markers
 * this script owns.
 *
 * ─── WHY THE ROWS ARE GENERATED INTO THE CATALOGUE, NOT IMPORTED FROM IT ────
 *
 * Two constraints point the same way and neither is negotiable:
 *
 *  1. `textures.manifest.json` is the SINGLE SOURCE for `tiling.realWorldSizeM`
 *     (ambientCG publishes dimensionX/Y in centimetres, so 14 of 16 sizes are
 *     AUTHORITATIVE) and for the logical map paths. Hand-transcribing 16 rows x
 *     5 paths would be C100 §0.3's *"a count in prose rots"* applied to 80
 *     strings — and this repository has minted six rival material vocabularies
 *     exactly that way.
 *
 *  2. ⛔ `tools/ga-gate/check-material-single-source.ts` ARM A brace-matches the
 *     `MATERIAL_CATALOG` array literal **inside `materialCatalog.ts`** to extract
 *     ids. Rows living in a sibling file and spread into the array would be
 *     INVISIBLE to it — *"an id a grep cannot see is an id a gate cannot
 *     govern"*, in the gate's own words. So the rows must be text in that file.
 *
 * Generated-in-place satisfies both: the manifest stays the source, and the gate
 * still governs every row.
 *
 * ─── ⛔ THE ONE THING THIS SCRIPT AUTHORS RATHER THAN DERIVES ───────────────
 *
 * `color`. The manifest carries no average colour, and the published WebPs live
 * on R2 rather than in the repo (`.gitignore`d by design), so it CANNOT be
 * measured here. Each hex below is therefore AUTHORED, and it is written down as
 * authored rather than presented as derived. It matters because it is the
 * fallback the material renders from when a map has not arrived or cannot load
 * (C100 §5) — so it must read as the right family, and a wrong-family hex is a
 * visible defect, not a cosmetic one. When a decoded average becomes available,
 * replace `BASE` with it and re-run.
 *
 * `roughness` is authored on the same footing: it is the material's SHEEN
 * (C100 §10.2.c), and the roughness MAP modulates it per texel rather than
 * replacing it.
 *
 * Usage:  node tools/texture-pipeline/emit-catalog-rows.mjs [--check]
 *         --check exits 1 if the file would change (for CI / a gate arm).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const MANIFEST = resolve(HERE, 'textures.manifest.json');
const CATALOG = resolve(REPO, 'packages/schemas/src/materials/materialCatalog.ts');

const BEGIN = '  // ─── BEGIN GENERATED: textured materials (emit-catalog-rows.mjs) ───────────';
const END = '  // ─── END GENERATED ────────────────────────────────────────────────────────';

/**
 * AUTHORED base colour + sheen per material id. See the header for why these are
 * authored and not derived, and what would replace them.
 *
 * `basis` is recorded per row so the next lane can tell a considered value from
 * a placeholder — an unexplained constant is how a table starts drifting.
 */
const BASE = {
  'carpet-tile-red-015':          { color: '#8c3a34', roughness: 0.96, basis: 'deep red loop-pile carpet' },
  'carpet-wool-beige-016':        { color: '#cbbba4', roughness: 0.96, basis: 'undyed wool beige' },
  'plaster-rough-white-003':      { color: '#ece9e3', roughness: 0.92, basis: 'white gypsum plaster' },
  'plaster-smooth-grey-034':      { color: '#c9c7c2', roughness: 0.85, basis: 'grey skim plaster' },
  'render-stucco-rough-001':      { color: '#ddd6c8', roughness: 0.95, basis: 'off-white monocapa render' },
  'roof-tile-clay-012':           { color: '#a8563a', roughness: 0.82, basis: 'terracotta clay tile' },
  'roof-tile-clay-grey-015':      { color: '#8a8b88', roughness: 0.82, basis: 'grey-engobed clay tile' },
  'shingle-timber-weathered-013': { color: '#8c8175', roughness: 0.88, basis: 'weathered cedar shingle' },
  'tile-chequer-cream-139':       { color: '#ddd6c6', roughness: 0.32, basis: 'glazed cream chequer' },
  'tile-marble-floor-074':        { color: '#e2e0da', roughness: 0.22, basis: 'polished white marble' },
  'tile-mosaic-pool-hex-069':     { color: '#4f9ec4', roughness: 0.28, basis: 'glazed pool-blue mosaic' },
  'tile-rectangular-beige-141':   { color: '#d8cfc0', roughness: 0.34, basis: 'matt beige porcelain' },
  'wood-parquet-light-modern-051':{ color: '#c19a6b', roughness: 0.48, basis: 'light lacquered oak' },
  'wood-parquet-panel-057':       { color: '#a87f52', roughness: 0.52, basis: 'mid-tone oak panel' },
  'wood-parquet-plank-040':       { color: '#b58a5c', roughness: 0.50, basis: 'natural oak plank' },
  'wood-parquet-plank-043':       { color: '#9d7047', roughness: 0.52, basis: 'darker oiled oak plank' },
};

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
const CHANNELS = ['color', 'normal', 'roughness', 'metalness', 'ao', 'displacement'];

const rows = [];
for (const mat of manifest.materials) {
  const base = BASE[mat.id];
  if (!base) {
    console.error(
      `REFUSING: manifest material '${mat.id}' has no authored base colour in BASE.\n` +
      '  A generated row cannot invent one, and a wrong-family fallback is a visible defect\n' +
      '  (C100 §5). Add it to BASE with its basis and re-run.',
    );
    process.exit(1);
  }
  const published = mat.published?.maps ?? {};
  const maps = CHANNELS
    .filter((c) => published[c]?.logicalPath)
    .map((c) => `${c}: '${published[c].logicalPath}'`);
  if (maps.length === 0) {
    console.error(`REFUSING: '${mat.id}' has no published maps — a textured row with no textures.`);
    process.exit(1);
  }
  const [w, h] = mat.tiling.realWorldSizeM;
  const origin = mat.tiling.sizeOrigin;
  const label = mat.label.replace(/'/g, "\\'");
  rows.push(
    `  // ${mat.provenance.libraryName} '${mat.provenance.sourceAssetName}' (${mat.provenance.sourceAssetId}), ` +
      `${mat.provenance.licence}. Tile size: ${origin}. Base colour AUTHORED: ${base.basis}.\n` +
      `  { source: 'builtin' as const, id: '${mat.id}', label: "${label}", category: '${mat.category}', ` +
      `color: '${base.color}', metalness: 0, roughness: ${base.roughness}, ` +
      `maps: { ${maps.join(', ')} }, ` +
      `tiling: { realWorldSizeM: [${w}, ${h}] } },`,
  );
}

const block = [
  BEGIN,
  '  //',
  `  // ${rows.length} rows derived from tools/texture-pipeline/textures.manifest.json.`,
  '  // ⛔ DO NOT HAND-EDIT between these markers — re-run',
  '  //    `node tools/texture-pipeline/emit-catalog-rows.mjs`.',
  '  //',
  '  // These are the first rows in this catalogue to carry PATTERN. C100 §10.3.a',
  '  // measured five finish families at LITERALLY ZERO — shingle, parquet, carpet,',
  '  // external render/stucco, fibre-cement cladding — and §10.3.b explains why no',
  '  // number of flat-colour rows could have closed them: parquet IS pattern, and a',
  '  // row without a map is a brown rectangle. Four of the five are closed here.',
  '  //',
  '  // Every map path is LOGICAL and starts with the catalogue prefix `/items/`;',
  '  // `resolveCatalogAssetUrl` rewrites it to the object-storage base at fetch',
  '  // time, so a project saved today keeps loading after the bucket moves.',
  '  //',
  '  // Licences: all CC0-1.0 (ambientCG), verified mechanically by acquire.mjs',
  '  // before any network call. Provenance, SHA-256s and retrieval dates are in the',
  '  // manifest — cited, never re-transcribed (C69 §0.1).',
  ...rows,
  END,
].join('\n');

const src = readFileSync(CATALOG, 'utf8');
const b = src.indexOf(BEGIN);
const e = src.indexOf(END);
let next;
if (b >= 0 && e > b) {
  next = src.slice(0, b) + block + src.slice(e + END.length);
} else {
  // First run: insert immediately before the array's closing bracket.
  const marker = '\n] as Array<Omit<MaterialRecord';
  const at = src.indexOf(marker) >= 0 ? src.indexOf(marker) : src.lastIndexOf('\n]');
  if (at < 0) {
    console.error('MISCONFIGURED: cannot find the end of the MATERIAL_CATALOG array literal');
    process.exit(2);
  }
  next = src.slice(0, at) + '\n' + block + src.slice(at);
}

if (next === src) {
  console.log(`[emit-catalog-rows] up to date — ${rows.length} rows.`);
  process.exit(0);
}
if (process.argv.includes('--check')) {
  console.error('[emit-catalog-rows] STALE: materialCatalog.ts does not match the manifest. Re-run without --check.');
  process.exit(1);
}
writeFileSync(CATALOG, next, 'utf8');
console.log(`[emit-catalog-rows] wrote ${rows.length} textured rows into ${CATALOG}`);
