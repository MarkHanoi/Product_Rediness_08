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
 * Usage:  npx tsx tools/texture-pipeline/emit-catalog-rows.mjs [--check]
 *
 * ⚠ tsx, not bare node: since the procedural rows landed this script imports
 *   @pryzm/procedural-textures, whose entry point is TypeScript source. Running it
 *   under node exits with a module-resolution error rather than doing nothing, so
 *   the failure is at least loud.
 *         --check exits 1 if the file would change (for CI / a gate arm).
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const MANIFEST = resolve(HERE, 'textures.manifest.json');
const CATALOG = resolve(REPO, 'packages/schemas/src/materials/materialCatalog.ts');

const BEGIN = '  // ─── BEGIN GENERATED: textured materials (emit-catalog-rows.mjs) ───────────';
const END = '  // ─── END GENERATED ────────────────────────────────────────────────────────';
const PROC_BEGIN = '  // ─── BEGIN GENERATED: procedural patterns (emit-catalog-rows.mjs) ─────────';
const PROC_END = '  // ─── END GENERATED PROCEDURAL ─────────────────────────────────────────────';

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
  // §MATERIAL-DECLARED-SURFACES (L-9702). The manifest has carried `surfaces` for
  // every one of these rows since 2026-08-21 and there was NO FIELD AT L0 TO PUT
  // IT IN, so it was written and dropped on the floor at every emit. That is
  // AUTHORED-BUT-UNWIRED in its quietest form: the data was right, the pipeline
  // was right, and the destination did not exist. It does now, so it is carried.
  //
  // REFUSE rather than emit a row with no declared surfaces. An absent `surfaces`
  // means NOT DECLARED, so silently generating that for a material whose source
  // file DOES declare one would make "we never said" and "we said and lost it"
  // the same value.
  if (!Array.isArray(mat.surfaces) || mat.surfaces.length === 0) {
    console.error(
      "REFUSING: manifest material '" + mat.id + "' declares no surfaces.\n" +
      '  Add them in tools/texture-pipeline/sources/materials.json and re-acquire.',
    );
    process.exit(1);
  }
  const surfaceLiteral = mat.surfaces.map((x) => "'" + x + "'").join(', ');
  const label = mat.label.replace(/'/g, "\\'");
  rows.push(
    `  // ${mat.provenance.libraryName} '${mat.provenance.sourceAssetName}' (${mat.provenance.sourceAssetId}), ` +
      `${mat.provenance.licence}. Tile size: ${origin}. Base colour AUTHORED: ${base.basis}.\n` +
      `  { source: 'builtin' as const, id: '${mat.id}', label: "${label}", category: '${mat.category}', ` +
      `color: '${base.color}', metalness: 0, roughness: ${base.roughness}, ` +
      `maps: { ${maps.join(', ')} }, ` +
      `tiling: { realWorldSizeM: [${w}, ${h}] }, ` +
      `surfaces: [${surfaceLiteral}], upstream: '${mat.provenance.library}' },`,
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

// ═══ THE PROCEDURAL ROWS ═════════════════════════════════════════════════════
//
// ⭐ ZERO ASSETS, AND THEREFORE ZERO HOSTING RISK. `@pryzm/procedural-textures`
// generates these patterns arithmetically: they cannot 404, cannot fail CORS and
// cannot be blocked on a decoder. C100 §10.7 sequenced the pattern families
// behind the object-storage dependency (§10.6); this half of the answer does not
// have that dependency at all.
//
// ⭐ AND UNLIKE THE FILE-BACKED ROWS ABOVE, NOTHING HERE IS AUTHORED. The base
// `color` is the generator's own `surface.faceColor`, the `roughness` is its
// `surface.faceRoughness`, and the tile size is `proceduralRealWorldSizeM` —
// every value read from the party that computes it. A transcription would have
// been the seventh rival material vocabulary (C100 §1.1).
// ⚠ Imported by SOURCE PATH, not by package specifier. This script lives inside the
// repo and runs under tsx; a bare specifier resolves only where node_modules is
// linked for THIS directory, which it is not, and the fallback that used to be here
// printed a loud ERR_MODULE_NOT_FOUND on every successful run — a script that
// reports a failure while succeeding is the honesty defect in miniature.
const proc = await import(pathToFileURL(resolve(REPO, 'packages/procedural-textures/src/index.ts')).href);

const FAMILY_CATEGORY = { parquet: 'Wood', tile: 'Ceramic & Tile', roofing: 'Roofing', decking: 'Wood' };

/**
 * §MATERIAL-DECLARED-SURFACES (L-9702) — which surface slots each generated family
 * is DECLARED suitable for.
 *
 * DECLARED, NOT DERIVED FROM USAGE, and the two are different facts (C100 §10.13.b).
 * The Material Schedule's element axis measures what a family REFERENCES; this
 * states what the product SUITS. A roof shingle suits a roof whether or not any
 * roof in any project currently names it.
 *
 * `decking` gets ['floor', 'outdoor'] and NOT 'wall': a deck board CAN be used as
 * cladding, but it is a different product when it is — different profile, different
 * fixing — and a picker that offers decking for an interior wall is making a
 * specification claim we would have to defend.
 */
const FAMILY_SURFACES = {
  parquet: ['floor'],
  tile: ['floor', 'wall'],
  roofing: ['roof'],
  decking: ['floor', 'outdoor'],
};

/**
 * Per-generator category overrides, where the FAMILY category would be a lie.
 *
 * One entry, and it earns its place: a wood-plastic composite deck board is not
 * timber. Filing it under `Wood` would put a polymer product in the timber column of
 * every schedule and every carbon takeoff, which is a data defect rather than a
 * cosmetic one. `Timber Engineered` is the master's own existing category for
 * manufactured board products.
 */
const ID_CATEGORY = {
  'procedural:decking-composite-grey-140': 'Timber Engineered',
};

const procRows = [];
for (const g of proc.listProceduralGenerators()) {
  const spec = proc.findProceduralSpec(g.id);
  if (!spec) {
    console.error(`REFUSING: generator '${g.id}' is listed but has no spec.`);
    process.exit(1);
  }
  const category = ID_CATEGORY[g.id] ?? FAMILY_CATEGORY[g.family];
  const surfaceList = FAMILY_SURFACES[g.family];
  if (!surfaceList) {
    console.error(
      "REFUSING: generator family '" + g.family + "' declares no surfaces.\n" +
      '  Add it to FAMILY_SURFACES. Emitting a row with none would mean NOT DECLARED,\n' +
      '  and "we did not classify it" must never be produced by a generator that could.',
    );
    process.exit(1);
  }
  if (!category) {
    console.error(
      `REFUSING: generator family '${g.family}' has no catalogue category.\n` +
      '  Guessing one would mint a category the master does not declare (C100 §1.1).',
    );
    process.exit(1);
  }
  // The catalogue id drops the scheme: `procedural:` marks a MAP SOURCE, not a
  // material. The material is a normal catalogue row whose maps happen to be
  // generated — which is the whole point of putting the fork in the resolver.
  const id = g.id.slice(proc.PROCEDURAL_ID_PREFIX.length);
  const [w, h] = proc.proceduralTilingFor(g.id).realWorldSizeM;
  const label = g.label.replace(/"/g, '\\"');
  procRows.push(
    `  // Generated by @pryzm/procedural-textures '${g.id}'. Colour, roughness and tile\n` +
    `  // size are READ from the generator, not authored. ${g.family}.\n` +
    `  { source: 'builtin' as const, id: '${id}', label: "${label}", category: '${category}', ` +
    `color: '${spec.surface.faceColor}', metalness: 0, roughness: ${spec.surface.faceRoughness}, ` +
    `maps: { color: '${g.id}', normal: '${g.id}', roughness: '${g.id}' }, ` +
    `tiling: { realWorldSizeM: [${w}, ${h}] }, ` +
    `surfaces: [${surfaceList.map((x) => "'" + x + "'").join(', ')}], upstream: 'pryzm-procedural' },`,
  );
}

const procBlock = [
  PROC_BEGIN,
  '  //',
  `  // ${procRows.length} rows generated from @pryzm/procedural-textures' preset list.`,
  '  // ⛔ DO NOT HAND-EDIT between these markers — re-run',
  '  //    `node tools/texture-pipeline/emit-catalog-rows.mjs`.',
  '  //',
  '  // ⭐ The `maps` values are GENERATOR IDS, not paths. `MaterialResolver` forks',
  '  // on `isProceduralId` ahead of the file-shaped path, so a generated pattern',
  '  // never touches a URL, an extension or a bucket. That is why these reach a',
  '  // user with no asset hosting at all, while the file-backed rows above depend',
  '  // on R2 — and it is why the founder\'s "wooden parquet, proper tiling floors"',
  '  // has an answer that cannot 404.',
  '  //',
  '  // All three channels name the SAME id: one generator produces albedo, normal',
  '  // and roughness together, and the resolver maps albedo -> color. Listing the',
  '  // id once per channel keeps `MaterialMaps` a plain per-channel record instead',
  '  // of growing a second, generator-shaped arm nothing else would use.',
  ...procRows,
  PROC_END,
].join('\n');

const src = readFileSync(CATALOG, 'utf8');
function splice(text, beginMark, endMark, body) {
  const b = text.indexOf(beginMark);
  const e = text.indexOf(endMark);
  if (b >= 0 && e > b) return text.slice(0, b) + body + text.slice(e + endMark.length);
  const marker = '\n] as Array<Omit<MaterialRecord';
  const at = text.indexOf(marker);
  if (at < 0) {
    console.error('MISCONFIGURED: cannot find the end of the MATERIAL_CATALOG array literal');
    process.exit(2);
  }
  return text.slice(0, at) + '\n' + body + text.slice(at);
}

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

next = splice(next, PROC_BEGIN, PROC_END, procBlock);

if (next === src) {
  console.log(`[emit-catalog-rows] up to date — ${rows.length} file-backed + ${procRows.length} procedural rows.`);
  process.exit(0);
}
if (process.argv.includes('--check')) {
  console.error('[emit-catalog-rows] STALE: materialCatalog.ts does not match the manifest. Re-run without --check.');
  process.exit(1);
}
writeFileSync(CATALOG, next, 'utf8');
console.log(`[emit-catalog-rows] wrote ${rows.length} file-backed + ${procRows.length} procedural rows into ${CATALOG}`);
