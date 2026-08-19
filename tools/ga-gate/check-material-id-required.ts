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
 * ─── The SIX arms ───────────────────────────────────────────────────────────
 *   ARM A — an L0 SCHEMA declaring a COLOUR field and NO material id.  C100 §2.1:
 *           "a hex is not a material… an element carrying only a hex has
 *           irreversibly lost the name."
 *   ARM B — a `materialId` STRING LITERAL in production source that does not
 *           resolve against `MATERIAL_CATALOG`.  A stored id naming nothing is
 *           C100 §5's unresolved state, minted at author time.
 *   ARM C — a family producer that mints a material key without routing its
 *           colour slot through the master resolver.  This is the reachability
 *           axis: §COMMITTED-IS-NOT-REACHABLE.
 *   ARM D — a per-family SERIALIZER that does not persist the id it holds.
 *   ARM E — a serializer that WRITES an id which `ProjectLoader` never READS back.
 *           Added 2026-08-19 (S15) out of declared debt; found `slab` on its first
 *           run.  Declared debt nobody converts into an arm is indistinguishable
 *           from debt nobody found.
 *   ARM F — the RUNTIME store type: an id named at L0 and absent from the record
 *           persistence actually reads, or a runtime record carrying a colour and
 *           no id at all.  Added 2026-08-19 (MT3) out of the blind spot C100 §9.7
 *           declared and left unbuilt.  ⭐ It is NOT ARM A one layer down: ARM D's
 *           correction established that "the serializer drops it" and "there is no
 *           field to drop" are different defects with different fixes, and ARM D
 *           can only ever see the first.
 *
 * All six are SHRINK-ONLY ratchets baselined at the 2026-08-19 measurement.
 * A baseline is not permission (C68).
 *
 * ⚠ EVERY arm here matches `[A-Za-z]*[Mm]aterialId`, never one spelling.  ARM D
 * manufactured FOUR false findings out of six by testing `body.includes('materialId')`
 * — one spelling, direct body only — and ARM A carried the identical defect until
 * 2026-08-19, unable to see `mullionMaterialId` or `frameMaterialId`.  ⭐ A gate that
 * checks one spelling of a thing does not check the thing, and a gate satisfiable by
 * only ONE field name is a gate dictating the data model.
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
const BASELINE_B_UNRESOLVABLE_IDS = 0; // 8 -> 0, L-1038 S14 (2026-08-19): all eight were dot-case ids types-builtin minted; reconciled to master ids, plus one genuinely-missing master row (steel-grating). HARD ZERO now — this arm has no debt left to shrink.
const BASELINE_C_UNROUTED_PRODUCERS = 13; // 17 -> 13 over L-1038 S16 (2026-08-19): `ceiling`, `stair`, `handrail`, `roof`. Stair and handrail had NO COLOUR SLOT AT ALL (stair's bridge picked by SLOT; handrail's `colorOfHandrailMaterialKey(_key)` ignored its own ARGUMENT), so both gained one with a legacy-shape fallback. Roof resolves the SHINGLE slot only - deck/trim/interior stay canonical on purpose (§9.6.b), and the test pins that they did NOT move. Each landed with a test asserting the MASTER's hex, verified to FAIL without its fix. Thirteen to go, one at a time - a shared harness would repeat the C100 §9.3 retraction.
const BASELINE_D_SERIALIZERS_DROPPING_ID = 3; // 5 -> 3, L-1038 S15 (2026-08-19): stair (deepStrip), handrail (delegated) and curtain-wall (prefixed ids) were FALSE POSITIVES of a one-spelling test, not fixes. The three that remain are real, and are ARM A's shape one layer down, at the runtime store type.
const BASELINE_E_IDS_NEVER_READ_BACK = 1; // ARM E, new 2026-08-19: `slab`. The serializer writes materialId + materialColor; ProjectLoader's CreateSlabCommand payload lists neither, so a slab's material dies on reload. Owned by the persistence/slab lane (C100 §9.6.c step 2) - MEASURED here, fixed there.
const BASELINE_F_RUNTIME_RECORDS_WITHOUT_ID = 5; // ARM F, new 2026-08-19 (MT3): `beam`, `furniture`, `lighting`, `plumbing`, `stair` - every one of them F.1, the sharp shape: the L0 schema names a materialId and the RUNTIME record, which is what persistence reads, has none. C100 §9.7 declared this arm and left it unbuilt; built, it reproduces the four families §9.7 named BY HAND and finds a FIFTH - `lighting`, which §9.1 files under "never persisted at all". NOT a serializer defect and NOT fixable in one: each needs a field on its runtime record AND a command that writes it.

// Subject floors — if we scan fewer than this, we are misconfigured.
const FLOOR_SCHEMAS = 20;
const FLOOR_ID_SITES = 40;
const FLOOR_PRODUCERS = 8;
const FLOOR_SERIALIZERS = 8;
const FLOOR_ID_WRITERS = 4; // ARM E: fewer id-writing serializers than this means the scan broke.
const FLOOR_RUNTIME_PAIRS = 12; // ARM F: fewer declared L0<->runtime pairs than this means the map was gutted rather than corrected.

const CATALOG_REL = 'packages/schemas/src/materials/materialCatalog.ts';
const SCHEMA_DIR_REL = 'packages/schemas/src/elements';
const PRODUCER_DIR_REL = 'packages/geometry-kernel/src/producers';
const SERIALIZER_REL = 'apps/editor/src/engine/persistence/ProjectSerializer.ts';
const LOADER_REL = 'apps/editor/src/engine/persistence/ProjectLoader.ts';

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
/**
 * ⭐ ARM A HAD ARM D's DEFECT, and it is the FOURTH recurrence of one shape in this
 * contract (C100 §0.3's counting hole, §9.7's `#rrggbb`-only projection arm, ARM D's
 * `body.includes('materialId')`, and this).
 *
 * This used to be `/^\s{2,}materialId\s*:/m` — ONE spelling. It could not see
 * `mullionMaterialId` / `glazingMaterialId`, the shape C100 §9.7 explicitly ruled
 * CORRECT for a family with more than one material surface, and it could not see the
 * `frameMaterialId` / `leafMaterialId` pairing a door needs for the same reason.
 * ⭐ **A gate that checks one spelling of a thing does not check the thing** — and a
 * gate that can only be satisfied by ONE field name is a gate dictating the data
 * model, which is how a two-surface family gets an id that names half of it.
 *
 * ⚠ Widening it was MEASURED not to hide anything, before it was widened: a
 * multi-spelling census of all 21 colour-or-id-bearing schemas in
 * `packages/schemas/src/elements/` returned **exactly Door and Window** as the only
 * two with a colour field and no id of any spelling — the same two the narrow regex
 * reported. So this is a hole closed, not a count reduced.
 */
const MATERIAL_ID_FIELD_RE = /^\s{2,}[A-Za-z]*[Mm]aterialId\s*:/m;

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


  /**
   * Does this serializer body persist a material reference?
   *
   * ⚠ THREE WAYS IT CAN, and the first version of this arm saw only ONE.
   * Re-measured 2026-08-19 (L-1038 S15): the literal `body.includes('materialId')`
   * test flagged SIX serializers and was WRONG about THREE of them, in three
   * different ways. A proxy that is wrong in half its findings is not a
   * measurement, and every one of the three failed in the direction that
   * manufactures work.
   *
   *  1. LITERAL, possibly PREFIXED. `serializeCurtainWall` writes
   *     `mullionMaterialId` and `glazingMaterialId` — capital M, so a
   *     case-sensitive `materialId` substring test misses both. The curtain
   *     WALL record has no plain `materialId` to write; its panel ids live on
   *     the panel store and persist separately. Match `[Ww]?materialId` on a
   *     word boundary instead of one spelling. ⭐ The same defect shape as
   *     C100 §9.7's `#rrggbb`-only arm: a gate that checks one spelling of a
   *     name does not check the name.
   *  2. DELEGATED. `serializeHandrail` is `return serializeHandrailRecord(h)`.
   *     The id is persisted — one module away, by the ONE save/load pair
   *     L-1102 built. Follow the call into the module that exports it.
   *  3. WHOLE-OBJECT. `serializeStair` is `return deepStrip(s)`, a recursive
   *     copy of every own key. It cannot drop a field it never enumerates.
   *
   * ⛔ CASE 3 IS WHY THIS ARM IS NAMED FOR THE WRITE SIDE ONLY. `deepStrip`
   * writes whatever the record holds — which for `StairData` is NOTHING, because
   * the live stair record has no `materialId` at all (`SetStairMaterial.ts:57`
   * refuses with exactly that). "The serializer drops it" and "there is no field
   * to drop" are DIFFERENT DEFECTS with different fixes, and ARM D can only see
   * the first. The second is ARM A's shape one layer down, at the runtime store
   * type, where no arm looks yet.
   */
  const DELEGATION_RE = /return\s+(serialize[A-Za-z0-9_]*Record|[a-z][A-Za-z0-9_]*Payload)\s*\(/;
  /**
   * A body that copies EVERY own key of its input rather than listing fields.
   * Two shapes exist here: `deepStrip(x)` (ProjectSerializer) and an
   * `Object.entries(src)` loop with a TRANSIENT deny-list
   * (`serializeHandrailRecord`, whose own header says "every other key survives,
   * including keys this file has never heard of").
   *
   * ⚠ THE RESIDUAL RISK, stated rather than hidden: this cannot tell a
   * whole-object copy from a partial one that happens to iterate. It is the
   * looser half of this arm. It is accepted because the alternative measured
   * WORSE — the literal test called `serializeStair` and `serializeHandrail`
   * defects when neither is one, and a gate that manufactures four false
   * findings out of six teaches people to ignore it.
   */
  const WHOLE_OBJECT_RE = /return\s+deepStrip\s*\(|Object\.(entries|keys)\s*\(/;
  const ID_TOKEN_RE = /[A-Za-z]*[Mm]aterialId[^A-Za-z0-9_]/;

  const delegateSources = new Map<string, string>();
  const collectDelegates = (dir: string, depth = 0): void => {
    if (depth > 4) return;
    let entries: string[];
    try { entries = readdirSync(dir); } catch { return; }
    for (const e of entries) {
      if (e === 'node_modules' || e === 'dist' || e === '__tests__') continue;
      const full = join(dir, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) collectDelegates(full, depth + 1);
      else if (e.endsWith('.ts') && !e.endsWith('.d.ts') && /[Pp]ersistence|[Ss]erial/.test(e)) {
        try { delegateSources.set(full, readFileSync(full, 'utf8')); } catch { /* unreadable */ }
      }
    }
  };
  collectDelegates(join(REPO_ROOT, 'packages', 'core-app-model', 'src'));
  collectDelegates(join(REPO_ROOT, 'packages', 'persistence-client', 'src'));

  const persistsAnId = (body: string, family: string): boolean => {
    if (ID_TOKEN_RE.test(body)) return true;
    if (WHOLE_OBJECT_RE.test(body)) return true;
    const d = DELEGATION_RE.exec(body);
    if (d) {
      const callee = d[1]!;
      for (const [, src] of delegateSources) {
        const at = src.indexOf(`function ${callee}`);
        if (at < 0) continue;
        // The delegate's own body, brace-matched from its opening `{`.
        const open = src.indexOf('{', at);
        if (open < 0) continue;
        let depth = 0;
        for (let k = open; k < src.length; k++) {
          const ch = src[k];
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              const dbody = src.slice(open, k + 1);
              return ID_TOKEN_RE.test(dbody) || WHOLE_OBJECT_RE.test(dbody);
            }
          }
        }
      }
      misconfigured.push(
        `ARM D: serialize${family}() delegates to ${callee}() and the gate could not find its body — ` +
          `refusing to guess (a delegated persist must be READ, never assumed).`,
      );
    }
    return false;
  };

  let dropping = 0;
  for (let i = 0; i < marks.length; i++) {
    const body = bodyOf(marks[i]!.at);
    if (body.length === 0) {
      misconfigured.push(`ARM D: could not brace-match serialize${marks[i]!.family}()`);
      return 0;
    }
    if (persistsAnId(body, marks[i]!.family)) continue;
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
/**
 * A rebuild block may not name the field itself: `snapshot.roofs` is rebuilt by
 * `migrateRoofSnapshotToCommand(roof)`, a same-file helper 1000 lines earlier
 * that carries `materialId: roof.materialId`. Measured, not assumed - ARM E
 * called roof a defect on its first run and roof was READING the id correctly.
 *
 * ⛔ ONE HOP ONLY, DELIBERATELY. Following an arbitrary call graph would let
 * this arm answer "read" from a mention anywhere in the file, which is the
 * whole-file grep ARM D's header rejects. One hop covers the shape that exists
 * (loop -> per-family builder) and refuses to guess past it.
 */
function readsViaHelper(load: string, block: string, idTok: RegExp): boolean {
  const called = new Set<string>();
  for (const m of block.matchAll(/([a-z][A-Za-z0-9_]*)\s*\(/g)) called.add(m[1]!);
  for (const name of called) {
    const at = load.indexOf(`function ${name}(`);
    if (at < 0) continue;
    const open = load.indexOf('{', at);
    if (open < 0) continue;
    let depth = 0;
    for (let k = open; k < load.length; k++) {
      if (load[k] === '{') depth++;
      else if (load[k] === '}') {
        depth--;
        if (depth === 0) {
          if (idTok.test(load.slice(open, k + 1))) return true;
          break;
        }
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// ARM E - the READ side of the round trip
// ---------------------------------------------------------------------------
/**
 * C100 §9.7 names this as an axis the gate does NOT check, in its own words:
 * *"it does not check `ProjectLoader`'s read side, only the write side."*
 * That is this arm, and it was not theoretical - it found a live loss on its
 * first run.
 *
 * ⛔ WHY THE WRITE SIDE ALONE IS NOT THE MEASUREMENT. §COMMITTED-IS-NOT-REACHABLE.
 * A serializer that faithfully writes `materialId` into the snapshot, paired with
 * a loader that rebuilds the element from a hand-listed set of fields NOT
 * including it, loses the material exactly as completely as a serializer that
 * never wrote it - and loses it INVISIBLY, because the file on disk looks
 * correct. Open the JSON, find the id, conclude the material persisted. It did
 * not. The user's evidence is the reload, never the file.
 *
 * The subject is the PAIRING, not either file: for every family whose
 * `serialize<Family>()` explicitly persists a `*materialId`, `ProjectLoader`
 * must mention one inside the block that rebuilds that family.
 *
 * ⚠ WHAT THIS ARM DOES NOT PROVE, so it is never read as coverage: that the
 * loader hands the id to a command that STORES it, that the store feeds a
 * producer, or that any of it reaches a pixel. It proves the id is READ. That is
 * ONE link, and naming it as one link is the point - the write-side arm proved
 * one link and was quoted as though it proved the chain.
 */
function armE(): number {
  const serAbs = join(REPO_ROOT, SERIALIZER_REL);
  const loadAbs = join(REPO_ROOT, LOADER_REL);
  if (!existsSync(serAbs) || !existsSync(loadAbs)) {
    misconfigured.push(`ARM E: serializer or loader not found (${SERIALIZER_REL} / ${LOADER_REL})`);
    return 0;
  }
  const ser = readFileSync(serAbs, 'utf8');
  const load = readFileSync(loadAbs, 'utf8');
  const idTok = /[A-Za-z]*[Mm]aterialId[^A-Za-z0-9_]/;

  // Families whose WRITE side persists an id - only these can be lost on read.
  const writers: string[] = [];
  const re = /function\s+serialize([A-Z][A-Za-z0-9_]*)\s*\(/g;
  const marks: Array<{ family: string; at: number }> = [];
  for (const m of ser.matchAll(re)) marks.push({ family: m[1]!, at: m.index! });
  if (marks.length < FLOOR_SERIALIZERS) {
    misconfigured.push(`ARM E subject floor: ${marks.length} serializers, expected >= ${FLOOR_SERIALIZERS}`);
    return 0;
  }
  for (let i = 0; i < marks.length; i++) {
    const open = ser.indexOf('{', marks[i]!.at);
    let depth = 0;
    let body = '';
    for (let k = open; k < ser.length; k++) {
      if (ser[k] === '{') depth++;
      else if (ser[k] === '}') { depth--; if (depth === 0) { body = ser.slice(open, k + 1); break; } }
    }
    // Only an EXPLICIT id write makes a family a subject here. A whole-object
    // copy is NOT evidence the record holds an id (`StairData` holds none), so
    // pairing a loader against one would invent a defect rather than find one.
    if (idTok.test(body)) writers.push(marks[i]!.family);
  }
  if (writers.length < FLOOR_ID_WRITERS) {
    misconfigured.push(
      `ARM E subject floor: only ${writers.length} serializers write an id, expected >= ${FLOOR_ID_WRITERS}`,
    );
    return 0;
  }

  /**
   * The loader's per-family block, located by the collection it iterates and
   * bounded by the NEXT `snapshot.<other>` reference - not by a fixed window, so
   * a long block is never truncated and a short one never borrows its
   * neighbour's mention. That span defect has already been paid for once in ARM
   * D, where two cheap bounds each under-reported by exactly one and both
   * produced a plausible number.
   */
  const COLLECTION: Readonly<Record<string, string>> = Object.freeze({
    Wall: 'walls', Slab: 'slabs', Column: 'columns', Roof: 'roofs',
    CurtainWall: 'curtainWalls', Handrail: 'handrails', Stair: 'stairs',
    Beam: 'beams', Furniture: 'furniture', Plumbing: 'plumbing',
  });
  const bounds: Array<{ name: string; at: number }> = [];
  for (const m of load.matchAll(/snapshot\.([A-Za-z]+)/g)) {
    bounds.push({ name: m[1]!, at: m.index! });
  }

  let missing = 0;
  for (const family of writers) {
    const coll = COLLECTION[family];
    if (!coll) {
      misconfigured.push(
        `ARM E: serialize${family}() writes an id but no loader collection is mapped for it - ` +
          `map it, or the arm silently ignores the family.`,
      );
      return 0;
    }
    const loopRe = new RegExp(`for\\s*\\(\\s*const\\s+\\w+\\s+of\\s+snapshot\\.${coll}[^A-Za-z0-9_]`);
    const lm = loopRe.exec(load);
    if (!lm) {
      misconfigured.push(`ARM E: no rebuild loop found for snapshot.${coll} - cannot measure ${family}.`);
      return 0;
    }
    const start = lm.index;
    const next = bounds.find((b) => b.at > start + 40 && b.name !== coll);
    const block = load.slice(start, next ? next.at : Math.min(load.length, start + 6000));
    if (idTok.test(block) || readsViaHelper(load, block, idTok)) continue;
    missing++;
    errors.push(
      `  x [ARM E] ${SERIALIZER_REL} serialize${family}() WRITES a materialId and ` +
        `${LOADER_REL} never READS one back for snapshot.${coll} - the id is in the saved ` +
        `file and the reloaded element does not have it (C100 §2.1; §COMMITTED-IS-NOT-REACHABLE).`,
    );
  }
  console.log(`  · [ARM E] ${writers.length} serializers write an id, ${writers.length - missing} are read back`);
  return missing;
}


// ---------------------------------------------------------------------------
// ARM F - the RUNTIME store type: the vocabulary persistence actually reads
// ---------------------------------------------------------------------------
/**
 * C100 §9.7 DECLARED THIS BLIND SPOT AND LEFT IT UNBUILT, in the same breath as
 * correcting ARM D:
 *
 *   > "No arm inspects the RUNTIME store types ... ARM A reads the L0 Zod schemas,
 *   >  which §9 records as having NO PERSISTENCE CONSUMER AT ALL. So `stair`,
 *   >  `beam`, `furniture` and `plumbing` - whose live records carry no
 *   >  `materialId` - are invisible to ARM A *and* mis-described by ARM D.
 *   >  **That is an ARM F, and it is unbuilt.**"
 *
 * Declared debt nobody converts into an arm is indistinguishable from debt nobody
 * found - the same sentence ARM E was built on, which cost one arm and caught a
 * live loss. So this is that arm.
 *
 * IT IS NOT ARM A ONE LAYER DOWN, and that distinction is the whole value. ARM D's
 * correction established that "the serializer drops it" and "there is no field to
 * drop" are DIFFERENT DEFECTS WITH DIFFERENT FIXES, and that ARM D can only ever
 * see the first. ARM F measures the second, and its sharpest form is a MISMATCH
 * rather than an absence:
 *
 *   F.1 - the L0 schema declares a material id and the RUNTIME record does not.
 *   The id exists exactly where nothing persists and is missing exactly where
 *   everything does. `SetStairMaterial.ts:57` refuses in precisely those words while
 *   `packages/schemas/src/elements/Stair.ts` carries a `materialId` two packages
 *   away - a family that looks materialled from L0 and cannot hold a material at all.
 *
 *   F.2 - the runtime record declares a COLOUR and no id of any spelling. ARM A's
 *   shape, on the type persistence reads. C100 §2.1: "an element carrying only a hex
 *   has irreversibly lost the name."
 *
 * THE MAP IS DECLARED, NEVER INFERRED. Guessing a runtime file from a schema name
 * would make an unmapped family invisible - the failure mode this arm exists to end.
 * A family whose pairing is not listed is REPORTED in the arm's own output line, so
 * a new element kind shows up as unmapped rather than as silently clean.
 *
 * Matched with `[A-Za-z]*[Mm]aterialId` from the outset. A one-spelling test is what
 * made ARM D manufacture four false findings out of six and what made ARM A unable
 * to see a two-surface family; C100 §9.7 calls that recurrence out by name.
 */
interface RuntimePair {
  readonly family: string;
  /** The L0 element schema, relative to the repo root. */
  readonly l0: string;
  /** The RUNTIME record type - the shape the store holds and the serializer reads. */
  readonly runtime: string;
}

const RUNTIME_PAIRS: ReadonlyArray<RuntimePair> = Object.freeze([
  { family: 'Beam',        l0: 'packages/schemas/src/elements/Beam.ts',        runtime: 'packages/core-app-model/src/stores/BeamTypes.ts' },
  { family: 'Ceiling',     l0: 'packages/schemas/src/elements/Ceiling.ts',     runtime: 'packages/core-app-model/src/stores/CeilingTypes.ts' },
  { family: 'Column',      l0: 'packages/schemas/src/elements/Column.ts',      runtime: 'packages/core-app-model/src/stores/ColumnTypes.ts' },
  { family: 'CurtainWall', l0: 'packages/schemas/src/elements/CurtainWall.ts', runtime: 'packages/geometry-curtain-wall/src/CurtainWallTypes.ts' },
  { family: 'Door',        l0: 'packages/schemas/src/elements/Door.ts',        runtime: 'packages/geometry-door/src/DoorTypes.ts' },
  { family: 'Floor',       l0: 'packages/schemas/src/elements/Floor.ts',       runtime: 'packages/core-app-model/src/stores/FloorTypes.ts' },
  { family: 'Furniture',   l0: 'packages/schemas/src/elements/Furniture.ts',   runtime: 'packages/core-app-model/src/stores/FurnitureTypes.ts' },
  { family: 'Handrail',    l0: 'packages/schemas/src/elements/Handrail.ts',    runtime: 'packages/core-app-model/src/stores/HandrailTypes.ts' },
  { family: 'Lighting',    l0: 'packages/schemas/src/elements/Lighting.ts',    runtime: 'packages/core-app-model/src/stores/LightingTypes.ts' },
  { family: 'Plumbing',    l0: 'packages/schemas/src/elements/Plumbing.ts',    runtime: 'packages/core-app-model/src/stores/PlumbingTypes.ts' },
  { family: 'Roof',        l0: 'packages/schemas/src/elements/Roof.ts',        runtime: 'packages/core-app-model/src/stores/RoofTypes.ts' },
  { family: 'Slab',        l0: 'packages/schemas/src/elements/Slab.ts',        runtime: 'packages/geometry-slab/src/SlabTypes.ts' },
  { family: 'Stair',       l0: 'packages/schemas/src/elements/Stair.ts',       runtime: 'packages/core-app-model/src/stores/StairTypes.ts' },
  { family: 'Wall',        l0: 'packages/schemas/src/elements/Wall.ts',        runtime: 'packages/geometry-wall/src/WallTypes.ts' },
  { family: 'Window',      l0: 'packages/schemas/src/elements/Window.ts',      runtime: 'packages/geometry-window/src/WindowTypes.ts' },
]);

const ANY_MATERIAL_ID_RE = /^\s{2,}[A-Za-z]*[Mm]aterialId\s*[:?]/m;

function armF(): number {
  if (RUNTIME_PAIRS.length < FLOOR_RUNTIME_PAIRS) {
    misconfigured.push(
      `ARM F subject floor: ${RUNTIME_PAIRS.length} declared pairs, expected >= ${FLOOR_RUNTIME_PAIRS}`,
    );
    return 0;
  }

  let count = 0;
  let read = 0;
  for (const pair of RUNTIME_PAIRS) {
    const l0Abs = join(REPO_ROOT, pair.l0);
    const rtAbs = join(REPO_ROOT, pair.runtime);
    if (!existsSync(l0Abs) || !existsSync(rtAbs)) {
      // A declared pair that no longer exists is a MISCONFIGURATION, not a pass: a
      // renamed file must move the map, never silently drop a family.
      misconfigured.push(
        `ARM F: declared pair ${pair.family} points at a missing file ` +
          `(${existsSync(l0Abs) ? pair.runtime : pair.l0}) - update the map.`,
      );
      return 0;
    }
    read++;
    const l0Src = readFileSync(l0Abs, 'utf8');
    const rtSrc = readFileSync(rtAbs, 'utf8');
    const l0HasId = ANY_MATERIAL_ID_RE.test(l0Src);
    const rtHasId = ANY_MATERIAL_ID_RE.test(rtSrc);

    // F.1 - the sharp one: named at L0, absent where persistence reads.
    if (l0HasId && !rtHasId) {
      count++;
      errors.push(
        `  x [ARM F] ${pair.runtime} is ${pair.family}'s RUNTIME record and declares NO ` +
          `materialId, while ${pair.l0} does. The id exists where nothing persists and is ` +
          `absent where everything does - "the serializer drops it" and "there is no field ` +
          `to drop" are different defects with different fixes (C100 §9.7).`,
      );
      continue;
    }

    // F.2 - ARM A's shape, on the type persistence reads.
    if (!rtHasId) {
      const colours = [...rtSrc.matchAll(COLOUR_FIELD_RE)].map((m) => m[1]!);
      if (colours.length > 0) {
        count++;
        errors.push(
          `  x [ARM F] ${pair.runtime} is ${pair.family}'s RUNTIME record and declares colour ` +
            `field(s) [${[...new Set(colours)].join(', ')}] and NO materialId of any spelling - ` +
            `C100 §2.1: "an element carrying only a hex has irreversibly lost the name".`,
        );
      }
    }
  }

  const schemaDirF = join(REPO_ROOT, SCHEMA_DIR_REL);
  const allSchemas = existsSync(schemaDirF)
    ? readdirSync(schemaDirF).filter(
        (f) => f.endsWith('.ts') && !ANNOTATION_SCHEMAS.has(f.replace(/\.ts$/, '')),
      )
    : [];
  const mapped = new Set(RUNTIME_PAIRS.map((pr) => pr.l0.split('/').pop()));
  const unmapped = allSchemas.filter((f) => !mapped.has(f));
  console.log(
    `  · [ARM F] ${read} declared L0<->runtime pairs read, ${read - count} carry the id on BOTH sides` +
      ` · ${unmapped.length} element schema(s) have no declared runtime pair` +
      (unmapped.length > 0 ? ` (${unmapped.map((f) => f.replace(/\.ts$/, '')).join(', ')})` : ''),
  );
  return count;
}

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
  const e = armE();
  const f = armF();

  if (misconfigured.length > 0) {
    for (const m of misconfigured) console.error(`  ! MISCONFIGURED: ${m}`);
    return EXIT_MISCONFIGURED;
  }

  for (const e of errors) console.error(e);

  const over =
    a > BASELINE_A_COLOUR_WITHOUT_ID ||
    b > BASELINE_B_UNRESOLVABLE_IDS ||
    c > BASELINE_C_UNROUTED_PRODUCERS ||
    d > BASELINE_D_SERIALIZERS_DROPPING_ID ||
    e > BASELINE_E_IDS_NEVER_READ_BACK ||
    f > BASELINE_F_RUNTIME_RECORDS_WITHOUT_ID;

  const line =
    `ARM A colour-without-id ${a}/${BASELINE_A_COLOUR_WITHOUT_ID} · ` +
    `ARM B unresolvable-ids ${b}/${BASELINE_B_UNRESOLVABLE_IDS} · ` +
    `ARM C unrouted-producers ${c}/${BASELINE_C_UNROUTED_PRODUCERS} · ` +
    `ARM D serializers-dropping-id ${d}/${BASELINE_D_SERIALIZERS_DROPPING_ID} · ` +
    `ARM E ids-never-read-back ${e}/${BASELINE_E_IDS_NEVER_READ_BACK} · ` +
    `ARM F runtime-records-without-id ${f}/${BASELINE_F_RUNTIME_RECORDS_WITHOUT_ID}`;

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
    d < BASELINE_D_SERIALIZERS_DROPPING_ID ||
    e < BASELINE_E_IDS_NEVER_READ_BACK ||
    f < BASELINE_F_RUNTIME_RECORDS_WITHOUT_ID
  ) {
    console.log(`[material-id-required] OK — BELOW baseline: ${line}`);
    console.log('  Lower the baseline in this file in the same commit (gate-debt rule 2).');
    return EXIT_OK;
  }

  console.log(`[material-id-required] OK: ${line}`);
  return EXIT_OK;
}

process.exit(main());
