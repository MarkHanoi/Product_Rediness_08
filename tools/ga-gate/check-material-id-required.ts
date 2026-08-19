#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-material-id-required.ts
 * @description C100 §2.1 — an element REFERENCES a material by `materialId`.
 *
 * Anchor: docs/02-decisions/contracts/C100-MASTER-MATERIAL-DATABASE.md §2.1, §9
 * Peer:   tools/ga-gate/check-material-single-source.ts (C100 §7 — ONE vocabulary)
 *
 * ─── Why this gate exists, and why it is NOT the §7 gate ────────────────────
 * `check-material-single-source.ts` asks *"is there more than one material
 * table?"*.  It says so itself, in §7.1: it **cannot** tell that a `materialId`
 * an element stores actually EXISTS in the catalogue, and it does **not** verify
 * that a family USES the master — only that it mints no rival.
 *
 * Those two unchecked axes are exactly where the product was losing the user's
 * material, measured 2026-08-19 (C100 §9):
 *
 *   • `composeMaterialKey` — the ONLY function that resolves `materialId`
 *     against `MATERIAL_CATALOG` on the render path — was called by ONE family
 *     (wall).  `composeFamilyMaterialKey`, written to extend that resolution to
 *     the rest, had ZERO callers.  Sixteen families carried a `materialId`
 *     through the key and dropped it before the pixel.
 *   • Every `materialId` in the repo's own parity fixtures was ABSENT from the
 *     master.  Nobody noticed because nobody resolved them: an id no one looks
 *     up is an id no one validates.
 *
 * C100 §2.1's MUST NOT shipped violated.  §MT-4: a rule with no gate is a wish.
 *
 * ─── The three arms ─────────────────────────────────────────────────────────
 *   ARM A — a schema declaring a COLOUR field and NO `materialId`.  C100 §2.1:
 *           "a hex is not a material… an element carrying only a hex has
 *           irreversibly lost the name."
 *   ARM B — a `materialId` STRING LITERAL in production source that does not
 *           resolve against `MATERIAL_CATALOG`.  A stored id naming nothing is
 *           C100 §5's unresolved state, minted at author time.
 *   ARM C — a family producer that mints a material key without routing its
 *           colour slot through the master resolver.  This is the reachability
 *           axis: §COMMITTED-IS-NOT-REACHABLE.
 *
 * All three are SHRINK-ONLY ratchets baselined at the 2026-08-19 measurement.
 * A baseline is not permission (C68).
 *
 * ─── Subject floor (§RATCHET-R5) ────────────────────────────────────────────
 * Each arm asserts it actually looked at something.  A scan that finds nothing
 * must FAIL, never pass quietly (L-950).
 *
 * Exit: 0 = within baseline · 2 = MISCONFIGURED (could not measure)
 *       · 3 = ratchet exceeded.  These three never alias.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const REPO_ROOT = process.env.GA_GATE_REPO_ROOT ?? process.cwd();

const EXIT_OK = 0;
const EXIT_MISCONFIGURED = 2;
const EXIT_RATCHET = 3;

// ── Baselines — measured 2026-08-19. SHRINK-ONLY. ──────────────────────────
const BASELINE_A_COLOUR_WITHOUT_ID = 2; // Door, Window
const BASELINE_B_UNRESOLVABLE_IDS = 8;
const BASELINE_C_UNROUTED_PRODUCERS = 17;
const BASELINE_D_SERIALIZERS_DROPPING_ID = 5;

// Subject floors — if we scan fewer than this, we are misconfigured.
const FLOOR_SCHEMAS = 20;
const FLOOR_ID_SITES = 40;
const FLOOR_PRODUCERS = 8;
const FLOOR_SERIALIZERS = 8;

const CATALOG_REL = 'packages/schemas/src/materials/materialCatalog.ts';
const SCHEMA_DIR_REL = 'packages/schemas/src/elements';
const PRODUCER_DIR_REL = 'packages/geometry-kernel/src/producers';
const SERIALIZER_REL = 'apps/editor/src/engine/persistence/ProjectSerializer.ts';

/**
 * Families whose elements are ANNOTATION, not building fabric: they carry a
 * presentation colour and legitimately name no material.  C100 §2.1 governs
 * "every element family that HAS a material"; a dimension does not have one.
 *
 * Kept as a NAMED list rather than a heuristic so that adding a real element
 * family here is a visible, arguable act rather than a silent exemption.
 */
const ANNOTATION_SCHEMAS = new Set([
  'Annotation', // leader/text colour
  'Dimension',
  'Grid',
  'Schedule',
  'Section',
  'Sheet',
  'View',
  'Project',
  'ProjectOrigin',
  'index',
]);

/** Field names that are a presentation colour on an element schema. */
const COLOUR_FIELD_RE =
  /^\s{2,}(materialColor|color|colour|frameColor|leafColor|finishColor|railColor|fillColor|strokeColor)\s*:/gm;
const MATERIAL_ID_FIELD_RE = /^\s{2,}materialId\s*:/m;

/**
 * A `materialId` bound to a string literal.  Deliberately anchored on the field
 * name so it cannot drift onto unrelated identifiers.
 */
const MATERIAL_ID_LITERAL_RE = /materialId["']?\s*[:=]\s*['"]([A-Za-z0-9_.-]+)['"]/g;

const errors: string[] = [];
const misconfigured: string[] = [];

const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

function walk(dirAbs: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dirAbs);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '.git') continue;
    const p = join(dirAbs, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (e.endsWith('.ts') || e.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Test-ish paths are excluded from ARM B: a fixture may name a deliberate miss. */
function isTestPath(rel: string): boolean {
  const p = rel.split(sep).join('/');
  return (
    p.includes('/__tests__/') ||
    p.includes('/__configs__/') ||
    p.startsWith('tests/') ||
    p.includes('/test/') ||
    /\.(test|spec)\.tsx?$/.test(p) ||
    p.includes('/__mocks__/')
  );
}

// ───────────────────────────────────────────────────────────────────────────
// The master catalogue
// ───────────────────────────────────────────────────────────────────────────
function loadMasterIds(): Set<string> {
  if (!existsSync(join(REPO_ROOT, CATALOG_REL))) {
    misconfigured.push(`master catalogue not found at ${CATALOG_REL}`);
    return new Set();
  }
  const src = read(CATALOG_REL);
  const ids = new Set<string>();
  for (const m of src.matchAll(/\bid:\s*'([^']+)'/g)) ids.add(m[1]!);
  return ids;
}

// ───────────────────────────────────────────────────────────────────────────
// ARM A — a colour with no materialId
// ───────────────────────────────────────────────────────────────────────────
function armA(): number {
  const dirAbs = join(REPO_ROOT, SCHEMA_DIR_REL);
  if (!existsSync(dirAbs)) {
    misconfigured.push(`schema dir not found: ${SCHEMA_DIR_REL}`);
    return 0;
  }
  const files = readdirSync(dirAbs).filter((f) => f.endsWith('.ts'));
  if (files.length < FLOOR_SCHEMAS) {
    misconfigured.push(
      `ARM A subject floor: scanned ${files.length} schemas, expected >= ${FLOOR_SCHEMAS}`,
    );
    return 0;
  }
  let count = 0;
  for (const f of files.sort()) {
    const name = f.replace(/\.ts$/, '');
    if (ANNOTATION_SCHEMAS.has(name)) continue;
    const src = readFileSync(join(dirAbs, f), 'utf8');
    const colours = [...src.matchAll(COLOUR_FIELD_RE)].map((m) => m[1]!);
    if (colours.length === 0) continue;
    if (MATERIAL_ID_FIELD_RE.test(src)) continue;
    count++;
    errors.push(
      `  x [ARM A] ${SCHEMA_DIR_REL}/${f} declares colour field(s) ` +
        `[${[...new Set(colours)].join(', ')}] and NO materialId — C100 §2.1: ` +
        `"a hex is not a material; it is one attribute of one".`,
    );
  }
  return count;
}

// ───────────────────────────────────────────────────────────────────────────
// ARM B — a stored materialId that names nothing in the master
// ───────────────────────────────────────────────────────────────────────────
function armB(master: Set<string>): number {
  const roots = ['packages', 'plugins', 'apps'];
  const unresolved = new Map<string, string[]>();
  let sites = 0;

  for (const root of roots) {
    const abs = join(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    for (const fileAbs of walk(abs)) {
      const rel = relative(REPO_ROOT, fileAbs);
      if (isTestPath(rel)) continue;
      // The catalogue itself and the resolver are not consumers.
      if (rel.split(sep).join('/') === CATALOG_REL) continue;
      let src: string;
      try {
        src = readFileSync(fileAbs, 'utf8');
      } catch {
        continue;
      }
      if (!src.includes('materialId')) continue;
      for (const m of src.matchAll(MATERIAL_ID_LITERAL_RE)) {
        const id = m[1]!;
        sites++;
        // A single-char / obviously-placeholder id in production is still a
        // miss and is reported; only an EMPTY id is skipped (means "none").
        if (master.has(id)) continue;
        const loc = rel.split(sep).join('/');
        if (!unresolved.has(id)) unresolved.set(id, []);
        if (!unresolved.get(id)!.includes(loc)) unresolved.get(id)!.push(loc);
      }
    }
  }

  if (sites < FLOOR_ID_SITES) {
    misconfigured.push(
      `ARM B subject floor: found ${sites} materialId literal sites, expected >= ${FLOOR_ID_SITES}`,
    );
    return 0;
  }

  for (const [id, locs] of [...unresolved].sort()) {
    errors.push(
      `  x [ARM B] materialId '${id}' resolves to NOTHING in MATERIAL_CATALOG ` +
        `(${locs.length} file(s), e.g. ${locs[0]}) — C100 §2.1 / §5.`,
    );
  }
  return unresolved.size;
}

// ───────────────────────────────────────────────────────────────────────────
// ARM C — a producer that mints a material key without the master resolver
// ───────────────────────────────────────────────────────────────────────────
function armC(): number {
  const abs = join(REPO_ROOT, PRODUCER_DIR_REL);
  if (!existsSync(abs)) {
    misconfigured.push(`producer dir not found: ${PRODUCER_DIR_REL}`);
    return 0;
  }
  const minters: Array<{ rel: string; routed: boolean }> = [];
  for (const fileAbs of walk(abs)) {
    const rel = relative(REPO_ROOT, fileAbs).split(sep).join('/');
    if (isTestPath(rel)) continue;
    // The resolver itself is not a consumer of itself.
    if (rel.endsWith('/_internal/composeMaterialKey.ts')) continue;
    let src: string;
    try {
      src = readFileSync(fileAbs, 'utf8');
    } catch {
      continue;
    }
    // A minter is a file that CONSTRUCTS a material key.
    const mints = /asMaterialKey\(\s*`/.test(src) || /return\s+`[a-z-]+\|/.test(src);
    if (!mints) continue;
    // Routed = it imports the ONE resolution authority. Import, not comment:
    // door.ts named `composeMaterialKey` in a comment while minting its own key
    // with a hard-coded empty materialId, and a substring match called it green.
    const routed =
      /^\s*import\s[^;]*\bcompose(Family)?MaterialKey\b/m.test(src) ||
      /^\s*import\s[^;]*\bresolveMaterialColorSlot\b/m.test(src);
    minters.push({ rel, routed });
  }

  if (minters.length < FLOOR_PRODUCERS) {
    misconfigured.push(
      `ARM C subject floor: found ${minters.length} key-minting producers, expected >= ${FLOOR_PRODUCERS}`,
    );
    return 0;
  }

  const unrouted = minters.filter((m) => !m.routed);
  for (const m of unrouted.sort((a, b) => a.rel.localeCompare(b.rel))) {
    errors.push(
      `  x [ARM C] ${m.rel} mints a MaterialKey but does not import the master ` +
        `resolver — the stored materialId cannot reach the rendered colour (C100 §9).`,
    );
  }
  // ⚠ `wall` does not appear here and that is not a miss: wall has no minter of
  // its own — its key is minted BY the resolver (`composeMaterialKey`), which is
  // why wall is the one family whose materialId reaches the screen (C100 §9).
  console.log(
    `  · [ARM C] ${minters.length} key-minting producers, ` +
      `${minters.length - unrouted.length} route their colour slot through the master`,
  );
  return unrouted.length;
}


// ---------------------------------------------------------------------------
// ARM D - persistence round-trip
// ---------------------------------------------------------------------------
/**
 * The axis `check-material-single-source.ts` named as NOT CHECKED, and the one
 * where the losses in L-1038 actually live.
 *
 * L-1038's structural finding: there are TWO parallel element vocabularies and
 * only one is persisted. The L0 Zod schemas have no persistence consumer; the
 * serializer reads the RUNTIME store types. **So a `materialId` declared in the
 * schema that the serializer does not write cannot round-trip** - a material
 * renders correctly all session and is gone after save/load. That is strictly
 * worse than never rendering, because the user believes it was recorded.
 *
 * Keying on the per-family `serialize<Family>` functions is deliberate: a
 * whole-file grep for `materialId` passes on this file today (wall, slab,
 * column, roof and handrail all write it) while five families silently drop it.
 * A file-level check would have reported green over the defect.
 *
 * ⚠ READ-ONLY. `ProjectSerializer.ts` is owned by a concurrent lane (CW1) at the
 * time of writing; this gate measures it and never edits it.
 */
function armD(): number {
  const abs = join(REPO_ROOT, SERIALIZER_REL);
  if (!existsSync(abs)) {
    misconfigured.push(`serializer not found: ${SERIALIZER_REL}`);
    return 0;
  }
  const src = readFileSync(abs, 'utf8');
  const re = /function\s+serialize([A-Z][A-Za-z0-9_]*)\s*\(/g;
  const marks: Array<{ family: string; at: number }> = [];
  for (const m of src.matchAll(re)) marks.push({ family: m[1]!, at: m.index! });

  if (marks.length < FLOOR_SERIALIZERS) {
    misconfigured.push(
      `ARM D subject floor: found ${marks.length} serialize<Family> functions, expected >= ${FLOOR_SERIALIZERS}`,
    );
    return 0;
  }

  /**
   * Extract a function body by BRACE MATCHING from its opening `{`.
   *
   * ⚠ Two cheaper spans were tried and both under-reported by exactly one.
   * Bounding at the next `serialize<Family>` and bounding at the next top-level
   * `function ` each left the LAST serializer running to end-of-file, where it
   * inherited a `materialId` mention from a comment 270 lines away and reported
   * itself compliant. `serializePlumbing` writes `color: p.color` and no id.
   *
   * ⭐ Both wrong spans produced a plausible number, which is why the span is now
   * exact rather than approximate: a gate that measures the wrong region is the
   * defect it exists to catch, and it fails GREEN.
   */
  const bodyOf = (from: number): string => {
    const open = src.indexOf('{', from);
    if (open < 0) return '';
    let depth = 0;
    for (let k = open; k < src.length; k++) {
      const ch = src[k];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return src.slice(open, k + 1);
      }
    }
    return src.slice(open);
  };

  let dropping = 0;
  for (let i = 0; i < marks.length; i++) {
    const body = bodyOf(marks[i]!.at);
    if (body.length === 0) {
      misconfigured.push(`ARM D: could not brace-match serialize${marks[i]!.family}()`);
      return 0;
    }
    if (body.includes('materialId')) continue;
    dropping++;
    errors.push(
      `  x [ARM D] ${SERIALIZER_REL} serialize${marks[i]!.family}() writes no materialId - ` +
        `the material renders this session and is GONE after save/load (C100 §2.1: ` +
        `materialId is PERSIST-OR-LOSE).`,
    );
  }
  console.log(
    `  · [ARM D] ${marks.length} per-family serializers, ${marks.length - dropping} persist materialId`,
  );
  return dropping;
}

// ---------------------------------------------------------------------------
function main(): number {
  console.log('[material-id-required] C100 §2.1 — elements REFERENCE materials by id');

  const master = loadMasterIds();
  if (master.size === 0 && misconfigured.length === 0) {
    misconfigured.push('parsed 0 ids out of the master catalogue');
  }
  if (misconfigured.length > 0) {
    for (const m of misconfigured) console.error(`  ! MISCONFIGURED: ${m}`);
    return EXIT_MISCONFIGURED;
  }
  console.log(`  · master catalogue: ${master.size} ids`);

  const a = armA();
  const b = armB(master);
  const c = armC();
  const d = armD();

  if (misconfigured.length > 0) {
    for (const m of misconfigured) console.error(`  ! MISCONFIGURED: ${m}`);
    return EXIT_MISCONFIGURED;
  }

  for (const e of errors) console.error(e);

  const over =
    a > BASELINE_A_COLOUR_WITHOUT_ID ||
    b > BASELINE_B_UNRESOLVABLE_IDS ||
    c > BASELINE_C_UNROUTED_PRODUCERS ||
    d > BASELINE_D_SERIALIZERS_DROPPING_ID;

  const line =
    `ARM A colour-without-id ${a}/${BASELINE_A_COLOUR_WITHOUT_ID} · ` +
    `ARM B unresolvable-ids ${b}/${BASELINE_B_UNRESOLVABLE_IDS} · ` +
    `ARM C unrouted-producers ${c}/${BASELINE_C_UNROUTED_PRODUCERS} · ` +
    `ARM D serializers-dropping-id ${d}/${BASELINE_D_SERIALIZERS_DROPPING_ID}`;

  if (over) {
    console.error(`[material-id-required] RATCHET EXCEEDED: ${line}`);
    console.error(
      '  A baseline is not permission (C68). Fix the new site; never raise the ceiling.',
    );
    return EXIT_RATCHET;
  }

  if (
    a < BASELINE_A_COLOUR_WITHOUT_ID ||
    b < BASELINE_B_UNRESOLVABLE_IDS ||
    c < BASELINE_C_UNROUTED_PRODUCERS ||
    d < BASELINE_D_SERIALIZERS_DROPPING_ID
  ) {
    console.log(`[material-id-required] OK — BELOW baseline: ${line}`);
    console.log('  Lower the baseline in this file in the same commit (gate-debt rule 2).');
    return EXIT_OK;
  }

  console.log(`[material-id-required] OK: ${line}`);
  return EXIT_OK;
}

process.exit(main());
