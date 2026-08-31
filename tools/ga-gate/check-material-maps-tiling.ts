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
 * ─── §FLOORED-BLIND-COMPARATOR — CORRECTED 2026-08-31 (audit W3c) ────────────
 * Lane W1b gave this gate three subject floors (MIN_CATALOG_ROWS,
 * MIN_TEXTURED_ROWS, MIN_PROCEDURAL_GENERATORS) because ARMs B, C and E iterate
 * sets that could empty silently, and "nothing to say" prints as PASS. That was
 * necessary and it was not sufficient. The audit's own words:
 *
 *     "A subject floor proves the walk FOUND FILES, never that the PREDICATE
 *      matches its subject."
 *
 * Every arm here is a hard zero and the real catalogue has been clean since the
 * day the arms were written, so NOT ONE of them had ever been watched failing.
 * A gate whose only evidence is its own green is the original defect surviving
 * inside its own fix. The floors are now ARMS THEMSELVES (F1/F2/F3) rather than
 * pre-flight `process.exit(2)` calls, and all eight arms are executed against a
 * PLANTED subject on every single run.
 *
 * ─── Negative + positive control — EXECUTED ON EVERY RUN ────────────────────
 * `selfTest()` builds two synthetic subjects and drives the SAME `analyse()` the
 * production run uses, at the SAME live thresholds and the SAME live vocabulary
 * (the `/items/` prefix read from `catalogAssetUrl.ts`, the raster extension list
 * read from `MaterialResolver.ts`, the `procedural:` scheme read from
 * `@pryzm/procedural-textures`) — not at relaxed ones, so what the control proves
 * is what production enforces:
 *   • PLANTED — a collapsed catalogue (F1), a collapsed textured set (F2), a
 *     collapsed generator registry (F3); a row with maps and no tiling and a row
 *     with a zero tiling (A); a `/textures/…` path outside the live prefix and an
 *     absolute CDN URL (B); a `.ktx2` map (C); a manifest entry with no row, a
 *     drifted tiling and a drifted logical path (D); a dead `procedural:` id, a
 *     generator/row scale disagreement and an unreferenced generator (E).
 *   • CLEAN — a catalogue sized EXACTLY at all three floors, carrying the shapes
 *     that are CORRECT and must never fire: rows with no maps at all, a row with
 *     a usable tiling and no maps yet, procedural rows (which have NO prefix and
 *     NO extension — ARMs B and C must skip them, which is the one recorded
 *     false-positive shape this gate has), a path whose DIRECTORY contains a dot
 *     (`…/oak-v1.2/color.webp` — ARM C's `lastIndexOf` guard), a multi-channel
 *     row, and catalogue rows with no manifest entry. Must read 0.
 * If any planted arm stays silent, or the clean subject reads dirty, the gate
 * exits 2 as a BLIND COMPARATOR.
 *
 * ⭐ THE CONTROLS RUN AT THE LIVE THRESHOLDS, AND THAT IS THE POINT, not a side
 * effect. Two forbidden fixes therefore ANNOUNCE THEMSELVES instead of going
 * green:
 *   • LOWERING a subject floor (the weakening direction for a floor) leaves the
 *     planted collapsed subject above it, F1/F2/F3 fall silent, and the gate
 *     exits 2. Measured 2026-08-31:
 *     `PRYZM_MAT_MIN_CATALOG_ROWS=1 PRYZM_MAT_MIN_TEXTURED_ROWS=1
 *      PRYZM_MAT_MIN_GENERATORS=1` → RC=2, "F1 did not fire", "F2 did not fire",
 *     "F3 did not fire".
 *   • WIDENING ARM C's vocabulary — adding `.ktx2` to `RASTER_EXTENSIONS` in
 *     `MaterialResolver.ts` without a KTX2Loader — disarms the planted `.ktx2`
 *     row, so ARM C falls silent and the gate exits 2 rather than reporting a
 *     format it cannot decode as supported. Measured 2026-08-31 against a copy
 *     of the two vocabulary files under `GA_GATE_REPO_ROOT` with `.ktx2`
 *     appended → RC=2, "ARM C did not name the planted '.ktx2' map".
 * RAISING a floor is caught by the real subject rather than by the control (the
 * clean fixture is SIZED FROM the floors, so it follows them up): the live
 * catalogue is 348 rows, and a floor above that trips F1 on the production
 * subject. Stated because it is the weaker of the two, not glossed.
 *
 * ⛔ STILL NOT CHECKED — ARM D IS ONE-DIRECTIONAL. Its comment below used to
 * claim a both-directions set comparison; the code walks manifest→catalogue only.
 * A catalogue row with NO manifest entry (a path with no provenance) is NOT
 * detected, and the clean control carries exactly that shape to keep the claim
 * honest rather than aspirational. Adding the second direction is a separate
 * change with its own ledger row — it is not a control.
 *
 * Exit: 0 = clean · 1 = a violation (A/B/C/D/E) · 2 = the scan is misconfigured
 * (F1/F2/F3, an unreadable vocabulary, or a blind comparator).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  MATERIAL_CATALOG,
  materialMapsDefect,
  hasAnyMap,
  MATERIAL_MAP_CHANNELS,
  type MaterialMaps,
  type MaterialTiling,
} from '../../packages/schemas/src/materials/index.js';
import { isProceduralId, listProceduralGenerators, proceduralTilingFor, PROCEDURAL_ID_PREFIX } from '../../packages/procedural-textures/src/index.js';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();
const LABEL = 'material-maps-tiling';
const RESOLVER = join(REPO_ROOT, 'packages/core-app-model/src/materials/MaterialResolver.ts');

/** The one prefix `resolveCatalogAssetUrl` rewrites. Read from the seam, not typed here. */
const CATALOG_SEAM = join(REPO_ROOT, 'packages/core-app-model/src/catalog/catalogAssetUrl.ts');
const MANIFEST = join(REPO_ROOT, 'tools/texture-pipeline/textures.manifest.json');

/**
 * Subject floors (RATCHET R5, lane W1b 2026-08-30; promoted to ARMS F1/F2/F3 by
 * lane W3c 2026-08-31).
 *
 * This gate walks three sets and every arm is a hard zero -- which is exactly the
 * shape that cannot tell "clean" from "walked nothing". Measured 2026-08-30:
 * 348 catalogue rows, 50 of them carrying maps, 34 live procedural generators.
 * The floors sit well under those readings on purpose: a floor is an HONESTY
 * TRIPWIRE that must fire when the SET COLLAPSES (a broken import, a renamed
 * export, a predicate that stops matching), never when the data merely dips.
 *
 * MIN_CATALOG_ROWS names a literal 200 that was already in the guard below; the
 * other two floors are new -- ARMs B, C and E iterate `textured` and the generator
 * list, and either could have emptied silently.
 *
 * ⚠ THE WEAKENING DIRECTION FOR A FLOOR IS DOWN, NOT UP. The env overrides exist
 * so that move can be WATCHED: the executed controls run at whatever these read,
 * so a lowered floor leaves the planted collapsed subject undetected and the gate
 * exits 2 as a blind comparator. Do not lower them to go green — the gate says so.
 */
const MIN_CATALOG_ROWS = Number(process.env.PRYZM_MAT_MIN_CATALOG_ROWS ?? 200);
const MIN_TEXTURED_ROWS = Number(process.env.PRYZM_MAT_MIN_TEXTURED_ROWS ?? 25);
const MIN_PROCEDURAL_GENERATORS = Number(process.env.PRYZM_MAT_MIN_GENERATORS ?? 15);

// ── preconditions: the VOCABULARY this gate speaks ───────────────────────────
// Read BEFORE the controls run, because the controls are driven at the LIVE
// prefix and the LIVE extension list — a control against a transcribed copy of
// either would prove nothing about what ships.
if (!existsSync(RESOLVER) || !existsSync(CATALOG_SEAM)) {
  console.error(`MISCONFIGURED: the resolver or the asset seam is missing — this gate cannot read its own vocabulary.`);
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

// ─── The subject, and the analysis over it ───────────────────────────────────

/** The only shape any arm reads off a catalogue row. */
interface Row {
  readonly id: string;
  readonly maps?: MaterialMaps;
  readonly tiling?: MaterialTiling;
}

interface ManifestEntry {
  readonly id: string;
  readonly tiling: { readonly realWorldSizeM: readonly [number, number] };
  readonly published?: { readonly maps?: Record<string, { readonly logicalPath?: string }> };
}

/**
 * Everything the arms consume, injectable ONLY so the executed controls can drive
 * the identical code path over a synthetic subject. The THRESHOLDS are
 * deliberately NOT part of this record: they are read from the module constants
 * in both cases, so a control that fires proves the arm that ships fires.
 */
interface Subject {
  readonly catalog: readonly Row[];
  readonly prefix: string;
  readonly loadable: readonly string[];
  readonly manifest: { readonly materials: readonly ManifestEntry[] } | null;
  readonly generators: readonly { readonly id: string }[];
  readonly isProcedural: (id: string) => boolean;
  readonly tilingFor: (id: string) => { readonly realWorldSizeM: readonly [number, number] } | undefined;
}

type Arm = 'F1' | 'F2' | 'F3' | 'A' | 'B' | 'C' | 'D' | 'E';
const ALL_ARMS: readonly Arm[] = ['F1', 'F2', 'F3', 'A', 'B', 'C', 'D', 'E'];

/**
 * F1/F2/F3 are MISCONFIGURED (exit 2): a collapsed subject is not a fact about
 * the catalogue, it is a fact about the scan. A/B/C/D/E are VIOLATIONS (exit 1).
 * Two facts, two codes — the exit contract is unchanged from before the controls
 * were added.
 */
type Kind = 'misconfigured' | 'violation';

interface Finding {
  readonly arm: Arm;
  readonly kind: Kind;
  readonly detail: string;
}

interface Analysis {
  readonly findings: readonly Finding[];
  readonly catalogRows: number;
  readonly texturedRows: number;
  readonly proceduralRows: number;
  readonly generatorCount: number;
  readonly referenced: ReadonlySet<string>;
}

function analyse(s: Subject): Analysis {
  const findings: Finding[] = [];
  const fail = (arm: Arm, kind: Kind, detail: string): void => { findings.push({ arm, kind, detail }); };

  // ── ARM F1 (floor) — the catalogue import itself ───────────────────────────
  // L-950: a collection that resolves to ~nothing must FAIL, never pass over an
  // empty run.
  if (s.catalog.length < MIN_CATALOG_ROWS) {
    fail('F1', 'misconfigured', `MATERIAL_CATALOG has ${s.catalog.length} rows (floor ${MIN_CATALOG_ROWS}) — the import, not the data, is most likely broken.`);
  }

  const textured = s.catalog.filter((m) => hasAnyMap(m.maps));

  // ── ARM F2 (floor) — the set ARMs B, C and E actually walk ─────────────────
  // ARMs B, C and E have NOTHING to say if this set empties, and "nothing to say"
  // prints as PASS. 50 rows today; below the floor it is hasAnyMap() or the `maps`
  // shape that changed, which is not a fact about the catalogue.
  if (textured.length < MIN_TEXTURED_ROWS) {
    fail('F2', 'misconfigured', `only ${textured.length} of ${s.catalog.length} rows carry maps (floor ${MIN_TEXTURED_ROWS}) — hasAnyMap() or the map shape has changed, so ARMs B/C/E walked almost nothing.`);
  }

  // ── ARM F3 (floor) — the generator registry ────────────────────────────────
  // ARM E's second direction (a generator with no row) walks this list. An empty
  // registry would silence half the arm while the other half still ran.
  if (s.generators.length < MIN_PROCEDURAL_GENERATORS) {
    fail('F3', 'misconfigured', `listProceduralGenerators() returned ${s.generators.length} (floor ${MIN_PROCEDURAL_GENERATORS}) — the registry import, not the catalogue, is most likely broken.`);
  }

  // ── ARM A (hard-0) — maps imply a usable real-world scale ──────────────────
  for (const m of s.catalog) {
    const defect = materialMapsDefect(m);
    if (defect) fail('A', 'violation', defect);
  }

  // ── ARM B (hard-0) — every map path is a REWRITABLE catalogue path ─────────
  for (const m of textured) {
    for (const channel of MATERIAL_MAP_CHANNELS) {
      const path = m.maps?.[channel];
      if (!path) continue;
      // A generated pattern has no URL and no bucket — ARMs B and C ask questions
      // that do not APPLY to it, and answering them anyway would be the "wrong
      // product" refusal shape. ARM E governs it instead.
      if (path.startsWith(PROCEDURAL_ID_PREFIX)) continue;
      if (!path.startsWith(s.prefix)) {
        fail('B', 'violation', `'${m.id}'.maps.${channel} = '${path}' is outside the catalogue prefix '${s.prefix}', so the object-storage rewriter passes it through unchanged and it 404s in production`);
      }
      if (/^[a-z]+:\/\//i.test(path) || path.startsWith('data:')) {
        fail('B', 'violation', `'${m.id}'.maps.${channel} is an absolute or data URL — a persisted record must survive a bucket move (L-570)`);
      }
    }
  }

  // ── ARM C (hard-0) — every map is in a format this client can DECODE ───────
  for (const m of textured) {
    for (const channel of MATERIAL_MAP_CHANNELS) {
      const path = m.maps?.[channel];
      if (!path) continue;
      if (path.startsWith(PROCEDURAL_ID_PREFIX)) continue;
      const dot = path.lastIndexOf('.');
      const ext = dot > path.lastIndexOf('/') ? path.slice(dot).toLowerCase() : '';
      if (!s.loadable.includes(ext)) {
        fail('C', 'violation', `'${m.id}'.maps.${channel} is '${ext || '(no extension)'}', which no registered loader can decode (loadable: ${s.loadable.join(', ')}). Delivery and decode are different facts — .ktx2 is served and cannot be decoded here.`);
      }
    }
  }

  // ── ARM D (hard-0) — the file-backed rows match their provenance manifest ──
  //
  // ⚠ COMPARED AS SETS, never as a count or a byte-diff. C100's own
  // contract-index gate records why: a count can be right while the membership is
  // wrong, and a byte-diff fails on a comment reflow that changes nothing. A
  // manifest entry with no row is an asset paid for and never reachable.
  //
  // ⛔ ONE DIRECTION ONLY — see the header. A catalogue ROW with no manifest
  // entry is NOT reported here; the clean control carries that shape so this
  // limitation is executed rather than merely written down.
  const byId = new Map(s.catalog.map((m) => [m.id, m]));
  if (s.manifest) {
    for (const entry of s.manifest.materials) {
      const row = byId.get(entry.id);
      if (!row) {
        fail('D', 'violation', `manifest material '${entry.id}' has NO catalogue row — an acquired, published asset that nothing can reference. Re-run \`npx tsx tools/texture-pipeline/emit-catalog-rows.mjs\`.`);
        continue;
      }
      const [mw, mh] = entry.tiling.realWorldSizeM;
      const [rw, rh] = row.tiling?.realWorldSizeM ?? [NaN, NaN];
      if (mw !== rw || mh !== rh) {
        fail('D', 'violation', `'${entry.id}' tiling drifted: manifest [${mw}, ${mh}] vs catalogue [${rw}, ${rh}] — the manifest is the source (ambientCG publishes the size).`);
      }
      for (const [channel, pub] of Object.entries(entry.published?.maps ?? {})) {
        const rowPath = row.maps?.[channel as keyof MaterialMaps];
        if (pub.logicalPath && rowPath !== pub.logicalPath) {
          fail('D', 'violation', `'${entry.id}'.maps.${channel} drifted: manifest '${pub.logicalPath}' vs catalogue '${rowPath ?? '(absent)'}'.`);
        }
      }
    }
  }

  // ── ARM E (hard-0) — every procedural map source names a LIVE generator ────
  //
  // ⭐ THE ARM THAT MAKES THE `procedural:` SCHEME SAFE TO HAVE RESERVED. A scheme
  // with no generator behind it is exactly the authored-but-unwired defect the
  // reservation was written to avoid, and an id that stops resolving after a
  // generator is renamed is the same defect arriving late. Both directions are
  // checked: a dead reference is a floor that silently loses its pattern, and a
  // generator with no row is 24 lines of arithmetic nobody can reach.
  const referenced = new Set<string>();
  for (const m of textured) {
    for (const channel of MATERIAL_MAP_CHANNELS) {
      const src = m.maps?.[channel];
      if (!src?.startsWith(PROCEDURAL_ID_PREFIX)) continue;
      referenced.add(src);
      if (!s.isProcedural(src)) {
        fail('E', 'violation', `'${m.id}'.maps.${channel} names generator '${src}', which no generator produces — the row would render a flat colour with no pattern and no file to blame`);
        continue;
      }
      const gen = s.tilingFor(src);
      const [gw, gh] = gen?.realWorldSizeM ?? [NaN, NaN];
      const [rw, rh] = m.tiling?.realWorldSizeM ?? [NaN, NaN];
      if (gw !== rw || gh !== rh) {
        fail('E', 'violation', `'${m.id}' tiling [${rw}, ${rh}] disagrees with generator '${src}' [${gw}, ${gh}] — the generator computes the size, so the row is transcribing rather than deriving`);
      }
    }
  }
  for (const g of s.generators) {
    if (!referenced.has(g.id)) {
      fail('E', 'violation', `generator '${g.id}' has no catalogue row — it can be rasterised and cannot be chosen (§AUTHORED-BUT-UNWIRED)`);
    }
  }

  const proceduralRows = textured.filter((m) =>
    MATERIAL_MAP_CHANNELS.some((c) => m.maps?.[c]?.startsWith(PROCEDURAL_ID_PREFIX)),
  ).length;

  return {
    findings,
    catalogRows: s.catalog.length,
    texturedRows: textured.length,
    proceduralRows,
    generatorCount: s.generators.length,
    referenced,
  };
}

// ─── Executed controls — an arm never watched failing is UNPROVEN ────────────

/** The historical wrong prefix from the L0 docstring — see header defect (2). */
const PLANTED_BAD_PREFIX_PATH = '/textures/planted-b/color.webp';
/** Served by R2, on the proxy allowlist, and undecodable here — header defect (3). */
const PLANTED_UNDECODABLE_PATH = '/items/textures/planted-c/color.ktx2';

const PLANTED_LIVE_GEN = `${PROCEDURAL_ID_PREFIX}planted-live`;
const PLANTED_ORPHAN_GEN = `${PROCEDURAL_ID_PREFIX}planted-orphan`;
const PLANTED_DEAD_GEN = `${PROCEDURAL_ID_PREFIX}planted-ghost`;

function plantedSubject(prefix: string): Subject {
  const ok: MaterialTiling = { realWorldSizeM: [1, 1] };
  const catalog: readonly Row[] = [
    // F1/F2 collapse: far below both floors, on purpose.
    // A — maps with no tiling at all.
    { id: 'planted-A-no-tiling', maps: { color: `${prefix}textures/planted-a/color.webp` } },
    // A — maps with a tiling that divides by zero one layer down.
    { id: 'planted-A-zero-tiling', maps: { color: `${prefix}textures/planted-a2/color.webp` }, tiling: { realWorldSizeM: [0, 0] } },
    // B — outside the LIVE prefix (read from catalogAssetUrl.ts, never typed here).
    { id: 'planted-B-outside-prefix', maps: { color: PLANTED_BAD_PREFIX_PATH }, tiling: ok },
    // B — an absolute CDN URL: a persisted record that cannot survive a bucket move.
    { id: 'planted-B-absolute', maps: { color: 'https://cdn.example.invalid/items/x/color.webp' }, tiling: ok },
    // C — a format the LIVE RASTER_EXTENSIONS list cannot decode.
    { id: 'planted-C-ktx2', maps: { color: PLANTED_UNDECODABLE_PATH }, tiling: ok },
    // D — this row's tiling and logical path are what the planted manifest disagrees with.
    { id: 'planted-D-drift', maps: { color: `${prefix}textures/planted-d/color.webp` }, tiling: ok },
    // E — a `procedural:` id no generator produces.
    { id: 'planted-E-dead-ref', maps: { color: PLANTED_DEAD_GEN }, tiling: ok },
    // E — a live generator whose scale the row transcribed wrongly.
    { id: 'planted-E-scale-drift', maps: { color: PLANTED_LIVE_GEN }, tiling: { realWorldSizeM: [9, 9] } },
    // Two untextured rows: they must contribute to NO arm.
    { id: 'planted-plain-1' },
    { id: 'planted-plain-2' },
  ];
  return {
    catalog,
    prefix,
    loadable: LOADABLE,
    manifest: {
      materials: [
        // D — a published asset nothing can reference.
        { id: 'planted-D-orphan-manifest-entry', tiling: { realWorldSizeM: [1, 1] } },
        // D — tiling drift AND logical-path drift against planted-D-drift.
        {
          id: 'planted-D-drift',
          tiling: { realWorldSizeM: [0.6, 0.6] },
          published: { maps: { color: { logicalPath: `${prefix}textures/planted-d/colour.webp` } } },
        },
      ],
    },
    // F3 collapse: 2 generators against the live floor.
    generators: [{ id: PLANTED_LIVE_GEN }, { id: PLANTED_ORPHAN_GEN }],
    isProcedural: (id) => id === PLANTED_LIVE_GEN || id === PLANTED_ORPHAN_GEN,
    tilingFor: (id) => (id === PLANTED_LIVE_GEN || id === PLANTED_ORPHAN_GEN ? { realWorldSizeM: [1, 1] } : undefined),
  };
}

/**
 * A subject sized EXACTLY at all three live floors and carrying every shape that
 * is correct and must not fire. It is sized FROM the floors rather than from
 * literals so that a floor and its control can never disagree about what "at the
 * floor" means.
 */
function cleanSubject(prefix: string): Subject {
  const loadableExt = LOADABLE[0]!;
  const genCount = Math.max(0, MIN_PROCEDURAL_GENERATORS);
  const fileBackedCount = Math.max(0, MIN_TEXTURED_ROWS - genCount);
  const plainCount = Math.max(0, MIN_CATALOG_ROWS - genCount - fileBackedCount);

  const generators: { readonly id: string; readonly size: readonly [number, number] }[] = [];
  for (let i = 0; i < genCount; i++) {
    generators.push({ id: `${PROCEDURAL_ID_PREFIX}clean-gen-${i}`, size: [0.4 + i / 1000, 0.4 + i / 1000] });
  }
  const genById = new Map(generators.map((g) => [g.id, g]));

  const catalog: Row[] = [];
  // The recorded false-positive shape: a `procedural:` source has NO catalogue
  // prefix and NO file extension. If ARMs B and C ever stop skipping it, EVERY
  // procedural row in the live catalogue (34 of 50) becomes two false findings.
  for (const g of generators) {
    catalog.push({ id: `clean-proc-${g.id}`, maps: { color: g.id }, tiling: { realWorldSizeM: g.size } });
  }
  for (let i = 0; i < fileBackedCount; i++) {
    // One of them puts a DOT IN A DIRECTORY NAME, which is ARM C's
    // `dot > lastIndexOf('/')` guard. Another carries three channels and a
    // rotation, because a multi-channel row multiplies any per-channel mistake.
    const dir = i === 0 ? 'oak-v1.2' : `clean-tex-${i}`;
    const maps: MaterialMaps = i === 1
      ? {
          color: `${prefix}textures/${dir}/color${loadableExt}`,
          normal: `${prefix}textures/${dir}/normal${loadableExt}`,
          roughness: `${prefix}textures/${dir}/roughness${loadableExt}`,
        }
      : { color: `${prefix}textures/${dir}/color${loadableExt}` };
    catalog.push({
      id: `clean-file-${i}`,
      maps,
      tiling: i === 1 ? { realWorldSizeM: [0.6, 0.6], rotationDeg: 45 } : { realWorldSizeM: [0.6, 0.6] },
    });
  }
  for (let i = 0; i < plainCount; i++) {
    // A row with a USABLE tiling and no maps YET is legal and pointless, not a
    // defect — materialMapsDefect() says so, and this asserts it does.
    catalog.push(i === 0 ? { id: 'clean-tiling-no-maps', tiling: { realWorldSizeM: [0.6, 0.6] } } : { id: `clean-plain-${i}` });
  }

  return {
    catalog,
    prefix,
    loadable: LOADABLE,
    // The manifest covers ONE row exactly; every other file-backed row has no
    // manifest entry, which ARM D does not (and does not claim to) detect.
    manifest: {
      materials: fileBackedCount > 0
        ? [{
            id: 'clean-file-0',
            tiling: { realWorldSizeM: [0.6, 0.6] },
            published: { maps: { color: { logicalPath: `${prefix}textures/oak-v1.2/color${loadableExt}` } } },
          }]
        : [],
    },
    generators: generators.map((g) => ({ id: g.id })),
    isProcedural: (id) => genById.has(id),
    tilingFor: (id) => {
      const g = genById.get(id);
      return g ? { realWorldSizeM: g.size } : undefined;
    },
  };
}

interface Control {
  readonly ok: boolean;
  readonly lines: readonly string[];
  readonly armsFired: readonly string[];
}

function selfTest(): Control {
  const lines: string[] = [];
  let armsFired: string[] = [];
  let ok = true;
  try {
    const bad = analyse(plantedSubject(PREFIX));
    const good = analyse(cleanSubject(PREFIX));

    const fired = new Set(bad.findings.map((f) => f.arm));
    armsFired = ALL_ARMS.filter((a) => fired.has(a));
    lines.push(`Negative control (planted subject): ${bad.findings.length} finding(s), arms fired [${armsFired.join(', ')}]`);
    for (const arm of ALL_ARMS) {
      const hits = bad.findings.filter((f) => f.arm === arm);
      if (hits.length > 0) {
        lines.push(`    ✓ ${arm} fired — ${hits.length} finding(s), ${hits[0]!.kind}`);
      } else {
        ok = false;
        lines.push(`    ✗ BLIND COMPARATOR — ${arm} did not fire on a deliberately planted violation.`);
      }
    }

    // ⭐ The two arms whose vocabulary is READ rather than typed must NAME what
    // they caught. Counting is not enough: if `CATALOG_LOGICAL_PREFIX` widened or
    // `RASTER_EXTENSIONS` grew a `.ktx2` entry, the arm would still fire on some
    // OTHER planted row and the count alone would hide the disarm.
    const bText = bad.findings.filter((f) => f.arm === 'B').map((f) => f.detail).join(' ');
    if (!bText.includes(PLANTED_BAD_PREFIX_PATH)) {
      ok = false;
      lines.push(`    ✗ BLIND COMPARATOR — ARM B did not name the planted out-of-prefix path '${PLANTED_BAD_PREFIX_PATH}' against the live prefix '${PREFIX}'.`);
    }
    const KTX2 = PLANTED_UNDECODABLE_PATH.slice(PLANTED_UNDECODABLE_PATH.lastIndexOf('.'));
    const cText = bad.findings.filter((f) => f.arm === 'C').map((f) => f.detail).join(' ');
    if (!cText.includes(`is '${KTX2}'`)) {
      ok = false;
      lines.push(`    ✗ BLIND COMPARATOR — ARM C did not name the planted '${KTX2}' map against the live loadable list [${LOADABLE.join(', ')}]. A format added to RASTER_EXTENSIONS with no loader behind it disarms this arm.`);
    }
    // ARM E must catch BOTH of its directions, not just whichever runs first.
    const eText = bad.findings.filter((f) => f.arm === 'E').map((f) => f.detail).join(' ');
    for (const want of [PLANTED_DEAD_GEN, PLANTED_LIVE_GEN, PLANTED_ORPHAN_GEN]) {
      if (!eText.includes(want)) {
        ok = false;
        lines.push(`    ✗ BLIND COMPARATOR — ARM E did not name '${want}'.`);
      }
    }
    lines.push(`    planted subject read: ${bad.catalogRows} row(s) · ${bad.texturedRows} textured · ${bad.generatorCount} generator(s), against the LIVE floors ${MIN_CATALOG_ROWS}/${MIN_TEXTURED_ROWS}/${MIN_PROCEDURAL_GENERATORS}, the LIVE prefix '${PREFIX}' and the LIVE loadable list [${LOADABLE.join(', ')}]`);

    lines.push(
      `Positive control (clean subject — procedural sources with no prefix and no extension, ` +
      `a dotted directory name, a multi-channel row, a tiling with no maps, rows with no manifest ` +
      `entry): ${good.findings.length} finding(s) — must be 0`,
    );
    lines.push(
      `    clean subject read: ${good.catalogRows} row(s) · ${good.texturedRows} textured ` +
      `(${good.proceduralRows} procedural) · ${good.generatorCount} generator(s) · ${good.referenced.size} referenced`,
    );
    for (const f of good.findings) {
      ok = false;
      lines.push(`    ✗ FALSE POSITIVE — [ARM ${f.arm}] ${f.detail}`);
    }
    // Sized FROM the floors: if these three do not land exactly on them, the
    // control is no longer running at the live thresholds and proves nothing.
    if (good.catalogRows !== MIN_CATALOG_ROWS || good.texturedRows !== MIN_TEXTURED_ROWS || good.generatorCount !== MIN_PROCEDURAL_GENERATORS) {
      ok = false;
      lines.push(`    ✗ MISCOUNT — the clean subject must sit EXACTLY at the three floors (${MIN_CATALOG_ROWS}/${MIN_TEXTURED_ROWS}/${MIN_PROCEDURAL_GENERATORS}); it read ${good.catalogRows}/${good.texturedRows}/${good.generatorCount}.`);
    }
  } catch (e) {
    ok = false;
    lines.push(`    ✗ self-test threw: ${(e as Error).message}`);
  }
  return { ok, lines, armsFired };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const control = selfTest();
console.log(`[${LABEL}] executed controls (an arm never watched failing is UNPROVEN):`);
for (const l of control.lines) console.log('   ' + l);

const liveManifest = existsSync(MANIFEST)
  ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as { materials: readonly ManifestEntry[] })
  : null;

const live = analyse({
  catalog: MATERIAL_CATALOG,
  prefix: PREFIX,
  loadable: LOADABLE,
  manifest: liveManifest,
  generators: listProceduralGenerators(),
  isProcedural: isProceduralId,
  tilingFor: proceduralTilingFor,
});

// ── report ───────────────────────────────────────────────────────────────────
console.log(`\n[${LABEL}] §MATERIAL-MAPS-AND-TILING (C100 §10.2.c / §10.9)`);
console.log(`[${LABEL}] catalogue : ${live.catalogRows} rows (floor ${MIN_CATALOG_ROWS}), ${live.texturedRows} carrying maps (floor ${MIN_TEXTURED_ROWS}: ${live.proceduralRows} procedural, ${live.texturedRows - live.proceduralRows} file-backed)`);
console.log(`[${LABEL}] generators: ${live.generatorCount} live (floor ${MIN_PROCEDURAL_GENERATORS}), ${live.referenced.size} referenced`);
console.log(`[${LABEL}] prefix    : '${PREFIX}' (read from catalogAssetUrl.ts, not transcribed)`);
console.log(`[${LABEL}] loadable  : ${LOADABLE.join(', ')} (read from MaterialResolver.ts, not transcribed)`);
console.log(`[${LABEL}] NOT CHECKED (UNPROVEN per C70 §7.1, never an inherited green):`);
console.log(`[${LABEL}]   that any map FILE exists in the bucket (that is the pipeline's ARM A/B);`);
console.log(`[${LABEL}]   that CORS permits the fetch (no Node check enforces it — L-578);`);
console.log(`[${LABEL}]   that the declared real-world size matches the image (a human judgement);`);
console.log(`[${LABEL}]   that any SURFACE carries metre UVs — only slabs/floors do (§L-1703);`);
console.log(`[${LABEL}]   that a catalogue ROW has a manifest entry — ARM D walks manifest→row ONLY.`);
console.log(`[${LABEL}] ⭐ the procedural rows depend on NONE of the four above: no file, no bucket,`);
console.log(`[${LABEL}]   no CORS, no decoder. They can only be wrong about SCALE, which ARM E checks.`);

// A blind comparator is a MISCONFIGURATION, not a pass and not a violation:
// exit 2, the same code the subject floors use for a scan that walked nothing.
if (!control.ok) {
  console.error(
    `\n[${LABEL}] MISCONFIGURED (exit 2) — BLIND COMPARATOR. The executed controls did not\n` +
    `  establish that this gate's arms fire. Whatever it printed about the real catalogue above\n` +
    `  is unproven: a subject floor proves the walk FOUND ROWS, never that the PREDICATE matches\n` +
    `  its subject. Check whether a floor was lowered, the catalogue prefix widened, or a format\n` +
    `  added to RASTER_EXTENSIONS with no loader behind it.`,
  );
  process.exit(2);
}

const misconfigured = live.findings.filter((f) => f.kind === 'misconfigured');
if (misconfigured.length) {
  for (const f of misconfigured) console.error(`MISCONFIGURED: [ARM ${f.arm}] ${f.detail}`);
  process.exit(2);
}

const violations = live.findings.filter((f) => f.kind === 'violation');
if (violations.length) {
  console.error(`\n[${LABEL}] FAIL — ${violations.length} violation(s):`);
  for (const f of violations) console.error(`  x [ARM ${f.arm}] ${f.detail}`);
  process.exit(1);
}
console.log(`\n[${LABEL}] PASS — every textured row has a real-world scale; every file-backed one a rewritable path and a decodable format; every procedural one a live generator that agrees about its size. HARD-FAIL AT ZERO. Controls: arms proven to fire [${control.armsFired.join(', ')}].`);
