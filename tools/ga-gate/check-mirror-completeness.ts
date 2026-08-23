#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-mirror-completeness.ts
 *
 * §MIRROR-COMPLETENESS (L-9940) — **a bus verb whose `affectedStores` names a
 * PLUGIN DTO STORE must have a `CommandEventBridge` case, or a NAMED exemption
 * that says why it does not need one.** Target exit: an empty debt file.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ ONE ZERO EXPLAINS AN ENTIRE DEFECT CLASS, AND THIS GATE IS THAT ZERO'S
 *    DETECTOR.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *     grep -c "\.created'"  apps/editor/src/engine/initTools.ts   -> 17
 *     grep -c "\.updated'"  apps/editor/src/engine/initTools.ts   ->  0
 *
 * Every element family can be CREATED and reach the render layer. **None can be
 * UPDATED and reach it.** That single asymmetry is the mechanical cause of:
 *
 *   · 217 of 351 registered verbs (61.8 %) that cannot name the store they write
 *     (`check-verb-register.ts`, measured 2026-08-23);
 *   · all 13 `*.setMaterial` verbs sitting at `REFUSES` with store `NONE`
 *     (§FIX-MATERIAL-DEAD-DISPATCH, ADR-0117, `plugins/slab/src/handlers/SetSlabMaterial.ts:28-56`);
 *   · the lift that committed 19 records and rendered 1 of 16 members (C104 §13);
 *   · the founder's swimming pool and boundary line, both of which validated,
 *     executed, mutated their DTO store, returned a `PatchPair`, reported success
 *     — and were never seen again.
 *
 * ─── WHY A GATE AND NOT ANOTHER FIX ────────────────────────────────────────
 * `CommandEventBridge.ts` already concedes the point in its own `default:` arm:
 *
 *     "⭐ THAT DESCRIBES `pool.create` TODAY, and the balcony case above already
 *      said so in prose … A comment is not a detector: the lift shipped
 *      afterwards with the identical defect and the identical silence."
 *
 * That branch then MECHANISED exactly one sub-case — a runtime warning for a
 * MULTI-store compound (`path.length === 2`, ≥2 stores). Three things it cannot do:
 *
 *   1. It only fires **when a user dispatches the verb**. A verb nobody has
 *      exercised since it was authored is silent until a founder finds it.
 *   2. It only sees COMPOUNDS. `boundaryLine.create` writes ONE store, so
 *      `stores.size > 1` is false and the detector never speaks — which is why
 *      the boundary line is the un-mechanised residue of that very fix.
 *   3. It cannot see UPDATES at all. A `replace` patch is not an `add`, and the
 *      warning only indexes `op === 'add'`.
 *
 * This gate is static, sees every verb whether or not anyone has run it, sees
 * single-store verbs, and sees updates. It is the generalisation the bridge's
 * own comment asks for.
 *
 * ─── WHAT IT CHECKS, PRECISELY ─────────────────────────────────────────────
 * ARM A — MIRROR COVERAGE (the shrink-only ratchet).
 *   For every verb discovered in the handler roots whose `affectedStores` names
 *   at least one PLUGIN DTO STORE KEY (measured from `plugins/*​/src/store.ts`,
 *   never hard-coded), the verb must satisfy ONE of:
 *     (a) a `case '<verb>':` arm in `packages/runtime-composer/src/CommandEventBridge.ts`;
 *     (b) a row in `mirror-debt.json` carrying a REASON.
 *   Anything else is a NEW uncovered verb -> FAIL.
 *
 * ARM B — PAID DEBT MUST LEAVE (the other direction).
 *   A verb ON the debt file that now HAS a bridge case, or that no longer
 *   touches a plugin DTO store, or that no longer exists, must be deleted from
 *   the file in the same commit. Otherwise the ledger rots into a list of things
 *   that are secretly fine — `gate-debt.json` rule 2, applied one level down.
 *   This is the failure `check-verb-register.ts` records as "5 baseline UNKNOWN
 *   verbs no longer qualify — paid debt that did not leave the baseline".
 *
 * ARM C — EXEMPTIONS MUST BE REASONED, hard-0.
 *   Every debt row needs a non-empty `reason` and a `kind` from the closed
 *   vocabulary below. A blank reason is how a ledger becomes a rubber stamp.
 *
 * ⭐ THE DEBT FILE IS THE MIGRATION BACKLOG. AUDIT-B recommendation #8
 *   (single-representation migration) says in as many words: *"you cannot
 *   migrate what you cannot enumerate; the mirror gate's debt file IS the
 *   migration backlog."* Read `mirror-debt.json` as a work list, not as absolution.
 *
 * ─── WHAT IT DOES **NOT** ESTABLISH — stated, not implied ──────────────────
 * ⛔ A bridge `case` is a DECLARED channel, not an executed proof. This gate
 *    cannot tell you the case emits the right event, that a subscriber exists in
 *    `initTools.ts`, that the legacy record is well-formed, or that a mesh
 *    appears. C16 §5.1 CA-21 demands an executed read-back from a
 *    RENDER/PERSIST/EXPORT store; `LiftCompoundReachesTheMesh.test.ts` and
 *    `BeamMasterMaterialReachesMesh.test.ts` are what that looks like. A green
 *    reading here means "the drop is not SILENT", never "the element renders".
 * ⛔ It does not check the serializer. `boundaryLine` had a third break — zero
 *    occurrences in either `ProjectSerializer` — and no arm here would have seen
 *    it. That is a sibling gate somebody still has to write.
 *
 * ─── Honesty floors ────────────────────────────────────────────────────────
 * Three, each exiting 2 (never 0), because "scanned nothing and passed" is the
 * documented way this repo produces a confidently-green gate:
 *   · the handler walk must read ≥ MIN_FILES files;
 *   · it must discover ≥ MIN_VERBS verbs;
 *   · `plugins/*​/src/store.ts` must yield ≥ MIN_STORE_KEYS store keys AND the
 *     bridge file must yield ≥ MIN_BRIDGE_CASES case arms. A regex that stopped
 *     matching would otherwise report "every verb is covered" or "no verb needs
 *     covering", both of which read as success.
 *
 * ─── Governance ────────────────────────────────────────────────────────────
 * C16 §5.1 CA-17 (a handler declares the stores it writes) and CA-21 (read back
 * from the store the user's result depends on) · C68 §5.a (verb liveness) ·
 * C11 §5.2 (the create pipeline's family events) · C69 (the generated verb
 * register, whose `affectedStores` extractor this reuses by construction) ·
 * C84 EI-1 (one authority per family, and it is NAMED).
 *
 * Exit codes:
 *   0 = within the named ledger, both directions clean
 *   1 = ledger violated (a new uncovered verb, or paid debt still listed)
 *   2 = the scan could not form an opinion (a floor tripped)
 *
 * Flags: `--write` rewrites `mirror-debt.json` from the current reading. Use it
 * ONLY to seed the file the first time, or with an explicit decision — it is how
 * a ratchet is silently loosened.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { walk, relPath } from './lib/sourceScan.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GA_GATE_REPO_ROOT ?? path.resolve(HERE, '..', '..');
const LABEL = 'mirror-completeness';
const WRITE = process.argv.includes('--write');

const DEBT_PATH = path.join(HERE, 'mirror-debt.json');
const BRIDGE_REL = 'packages/runtime-composer/src/CommandEventBridge.ts';

/**
 * The same roots `check-verb-register.ts` walks. Deliberately identical: a
 * mirror gate built on a SMALLER subject than the register would report "all
 * covered" for verbs the register knows about and this gate never saw.
 */
const HANDLER_ROOTS = ['plugins', 'apps/editor/src/engine', 'packages/command-registry/src'];

/** Where plugin DTO store keys come from. Measured, never enumerated by hand. */
const PLUGIN_STORE_GLOB_DIR = 'plugins';

const MIN_FILES = 900;
const MIN_VERBS = 250;
const MIN_STORE_KEYS = 20;
const MIN_BRIDGE_CASES = 20;

/**
 * Verb-declaration regex, copied in shape from `check-verb-register.ts` for the
 * same reason it is written that way there: a first draft matching only the
 * class form saw a third of the verbs.
 *
 *    object literal / BridgeSpec →  `type: 'roof.update',`
 *    class handler              →  `readonly type = 'wall.create';`
 *                                  `readonly type: CommandType = 'wall.create';`
 */
const TYPE_DECL_RE = new RegExp(
  String.raw`(?:^|\n)\s*(?:public\s+|readonly\s+|static\s+)*type\s*` +
  String.raw`(?::\s*'([a-z][\w-]*(?:\.[\w-]+)*)'|(?::\s*[^=\n;]+)?=\s*'([a-z][\w-]*(?:\.[\w-]+)*)')`,
  'g',
);

const STRICT_RE = /\b(affectedStores|stores)\s*[:=]/;
const SPEC_RE = /\bvalidate\s*:/;
const SPEC_BODY_RE = /\b(run|fn)\s*:/;

function handlerish(verb: string, slice: string, rel: string): boolean {
  const head = slice.slice(0, 900);
  const strict = STRICT_RE.test(head)
    || (rel.startsWith('apps/editor/src/engine/') && SPEC_RE.test(head) && SPEC_BODY_RE.test(head));
  if (strict) return true;
  if (!verb.includes('.')) return false;
  return /\/src\/handlers\//.test(rel);
}

/** `affectedStores: ['pool', 'wall', …]` → `['pool','wall',…]`. */
function storesOf(slice: string): string[] {
  const head = slice.slice(0, 900);
  const m = /\b(?:affectedStores|stores)\s*(?::[^=[]*)?[:=]\s*\[([^\]]*)\]/.exec(head);
  if (m === null) return [];
  return [...m[1]!.matchAll(/'([A-Za-z0-9_.-]+)'/g)].map((x) => x[1]!);
}

// ── refusal predicates, LIFTED VERBATIM from check-verb-register.ts ──────────
// Same shape on purpose. A verb the register grades REFUSES and this gate grades
// UNMIRRORED would be two gates disagreeing about one subject, which CLAUDE.md
// records three times over as the way a number stops meaning anything.
function refusesInCanExecute(slice: string): boolean {
  const at = slice.indexOf('canExecute');
  if (at === -1) return false;
  const after = slice.slice(at);
  const end = after.search(/\n\s{2}(?:async\s+)?execute\s*[(<]/);
  const body = end === -1 ? after : after.slice(0, end);
  if (!/valid:\s*false/.test(body)) return false;
  return !/valid:\s*true/.test(body);
}

const CA18_SHAPE =
  /forward:\s*\[\s*\]\s*,\s*inverse:\s*\[\s*\]\s*,\s*(?:\/\/[^\n]*\n\s*)*refusal:\s*\S/;

function refusesByValue(slice: string): boolean {
  const at = slice.search(/\n\s{2}(?:async\s+)?execute\s*[(<]/);
  if (at === -1) return false;
  const body = slice.slice(at);
  if (!CA18_SHAPE.test(body)) return false;
  return !/\b(?:forward|inverse):\s*\[\s*[^\]\s]/.test(body);
}

function refuses(slice: string): boolean {
  return refusesInCanExecute(slice) || refusesByValue(slice);
}

/**
 * The closed exemption vocabulary. A free-text `kind` would let the next lane
 * invent a category that means "I did not want to think about it".
 *
 *  · `no-render`     — the verb's store slice reaches no builder BY DESIGN
 *                      (view state, schedules, BCF topics). Nothing to mirror.
 *  · `refuses`       — the handler's `canExecute` cannot return valid; the verb
 *                      is deliberately dead (§FIX-DEAD-VERB-REFUSE). It must NOT
 *                      acquire a mirror while it refuses.
 *  · `legacy-direct` — the handler writes the LEGACY geometry store itself (via
 *                      `commandManager` or a direct store call), so the render
 *                      path is already reached without a bridge relay.
 *  · `mirrored-elsewhere` — a DIFFERENT channel already carries it (e.g. a
 *                      compound's member events, or `element.level-changed`).
 *  · `UNMIRRORED`    — ⛔ the real backlog. The verb writes a plugin DTO store,
 *                      nothing relays it, and the element will not update on
 *                      screen. This is a DEFECT with a row, not an exemption.
 */
const EXEMPT_KINDS = new Set(['no-render', 'refuses', 'legacy-direct', 'mirrored-elsewhere', 'UNMIRRORED']);

interface DebtRow {
  readonly verb: string;
  readonly kind: string;
  readonly stores: readonly string[];
  readonly reason: string;
}

interface DebtFile {
  readonly $schema?: string;
  readonly note?: string;
  readonly rows: readonly DebtRow[];
}

function fail2(msg: string): never {
  console.error(`[${LABEL}] ⛔ CANNOT FORM AN OPINION: ${msg}`);
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. The plugin DTO store keys — MEASURED from the store files themselves.
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠ The key is the string a `Store` subclass hands to `super(...)`, because that
// is the key `PluginRegistry` binds and therefore the key `affectedStores` must
// name. It is NOT the plugin directory name and it is NOT the class name: the
// curtain-wall plugin lives at `plugins/curtain-wall` and its key is
// `curtainwall`, unhyphenated — one character, and it is exactly the character
// that made the lift's mirror census read `0 subscribers` for a live channel
// ([[grep-silence-has-three-causes]]).
function pluginStoreKeys(): { keys: Set<string>; files: number; classes: number } {
  const keys = new Set<string>();
  let files = 0;
  let classes = 0;
  for (const abs of walk(path.join(ROOT, PLUGIN_STORE_GLOB_DIR))) {
    const rel = relPath(ROOT, abs);
    if (!/^plugins\/[^/]+\/src\/store\.ts$/.test(rel)) continue;
    let src: string;
    try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    files++;
    classes += [...src.matchAll(/\bextends\s+Store\b/g)].length;
    for (const m of src.matchAll(/super\('([A-Za-z0-9_-]+)'\)/g)) keys.add(m[1]!);
  }
  return { keys, files, classes };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. The bridge's case arms.
// ─────────────────────────────────────────────────────────────────────────────
//
// ⛔ MATCHED ON A LINE THAT IS A REAL `case`, NOT ON A SUBSTRING. Both the
// balcony and the lift cases contain the literal text `case 'pool.(create|delete)'`
// INSIDE A COMMENT, as part of the grep recipe that proves those cases are
// ABSENT. A bare substring search over this file reports the exact opposite of
// the truth — the bridge says so itself, twice, in as many words. Comments are
// stripped before matching for that reason.
function bridgeCases(): { cases: Set<string>; lines: number } {
  const abs = path.join(ROOT, BRIDGE_REL);
  if (!existsSync(abs)) fail2(`the bridge file is missing: ${BRIDGE_REL}`);
  const src = readFileSync(abs, 'utf8');
  const cases = new Set<string>();
  let lines = 0;
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    // Strip anything that starts a comment: `//`, `/*`, `*` continuation.
    if (line.startsWith('//') || line.startsWith('*') || line.startsWith('/*')) continue;
    const m = /^case\s+'([A-Za-z0-9_.-]+)'\s*:/.exec(line);
    if (m === null) continue;
    cases.add(m[1]!);
    lines++;
  }
  return { cases, lines };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Discovery — verbs and the stores they declare.
// ─────────────────────────────────────────────────────────────────────────────
interface VerbRow {
  readonly verb: string;
  readonly stores: readonly string[];
  readonly files: readonly string[];
  /** MEASURED: `canExecute` can never return valid, or the CA-18 refusal shape. */
  readonly refuses: boolean;
}

function discoverVerbs(): { rows: Map<string, VerbRow>; filesRead: number } {
  const rows = new Map<string, { stores: Set<string>; files: Set<string>; refuses: boolean }>();
  let filesRead = 0;
  for (const dir of HANDLER_ROOTS) {
    for (const abs of walk(path.join(ROOT, dir))) {
      const rel = relPath(ROOT, abs);
      if (/\.(test|spec)\.tsx?$/.test(rel)) continue;
      if (rel.includes('/__tests__/')) continue;
      let src: string;
      try { src = readFileSync(abs, 'utf8'); } catch { continue; }
      filesRead++;
      TYPE_DECL_RE.lastIndex = 0;
      const hits: { verb: string; at: number }[] = [];
      let m: RegExpExecArray | null;
      while ((m = TYPE_DECL_RE.exec(src)) !== null) hits.push({ verb: (m[1] ?? m[2])!, at: m.index });
      for (let i = 0; i < hits.length; i += 1) {
        const slice = src.slice(hits[i]!.at, hits[i + 1]?.at ?? src.length);
        if (!handlerish(hits[i]!.verb, slice, rel)) continue;
        const cur = rows.get(hits[i]!.verb) ?? { stores: new Set<string>(), files: new Set<string>(), refuses: false };
        for (const s of storesOf(slice)) cur.stores.add(s);
        cur.files.add(rel);
        // ⚠ OR, not AND, across sites: a verb registered at two sites where ONE
        // refuses is not a live verb — the refusing declaration is the one the
        // bus holds if it registered first, and grading it live would put a
        // dead verb in the backlog as if a mirror would fix it.
        cur.refuses = cur.refuses || refuses(slice);
        rows.set(hits[i]!.verb, cur);
      }
    }
  }
  const out = new Map<string, VerbRow>();
  for (const [verb, v] of rows) {
    out.set(verb, { verb, stores: [...v.stores].sort(), files: [...v.files].sort(), refuses: v.refuses });
  }
  return { rows: out, filesRead };
}

/**
 * The level-change channel — §L-946, `element.level-changed`.
 *
 * ⭐ A `*.changeLevel` verb genuinely does NOT need a `case` in the create
 * switch: `emitLevelChange()` runs BEFORE that switch, in its own try/catch, and
 * `elementLevelChangedMirror` moves the LEGACY record. So these verbs are
 * `mirrored-elsewhere` by MEASUREMENT — read out of the L1 register that is the
 * one authority on the question (C84 EI-9) — and not by a lane's assurance.
 */
function levelChangeVerbs(): Set<string> {
  const abs = path.join(ROOT, 'packages/command-bus/src/levelChangeVerbs.ts');
  const out = new Set<string>();
  if (!existsSync(abs)) return out;
  const src = readFileSync(abs, 'utf8');
  for (const raw of src.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('//') || line.startsWith('*')) continue;
    const m = /^verb:\s*'([A-Za-z0-9_.-]+)'/.exec(line);
    if (m !== null) out.add(m[1]!);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────
const { keys: STORE_KEYS, files: storeFiles, classes: storeClasses } = pluginStoreKeys();
if (STORE_KEYS.size < MIN_STORE_KEYS) {
  fail2(`only ${STORE_KEYS.size} plugin DTO store key(s) found across ${storeFiles} store file(s); floor is ${MIN_STORE_KEYS}. The \`super('key')\` regex stopped matching.`);
}
if (storeClasses !== STORE_KEYS.size) {
  // Not fatal on its own, but say it out loud: a `Store` subclass with no
  // literal super key is a store this gate cannot name, and a store it cannot
  // name is a store whose verbs it will silently declare exempt.
  console.warn(`[${LABEL}] ⚠ ${storeClasses} \`extends Store\` class(es) but ${STORE_KEYS.size} literal key(s). A class whose key is not a literal is INVISIBLE to this gate.`);
}

const { cases: BRIDGE_CASES, lines: bridgeCaseLines } = bridgeCases();
if (BRIDGE_CASES.size < MIN_BRIDGE_CASES) {
  fail2(`only ${BRIDGE_CASES.size} case arm(s) parsed out of ${BRIDGE_REL}; floor is ${MIN_BRIDGE_CASES}. The case regex or the comment strip is wrong.`);
}

const LEVEL_CHANGE = levelChangeVerbs();

const { rows: VERBS, filesRead } = discoverVerbs();
if (filesRead < MIN_FILES) fail2(`the handler walk READ only ${filesRead} file(s); floor is ${MIN_FILES}. Roots: ${HANDLER_ROOTS.join(', ')}`);
if (VERBS.size < MIN_VERBS) fail2(`the walk read ${filesRead} files but discovered only ${VERBS.size} verb(s); floor is ${MIN_VERBS}. The declaration regex stopped matching.`);

/** Verbs that NEED a mirror: they declare at least one plugin DTO store. */
const NEEDS = new Map<string, VerbRow>();
for (const [verb, row] of VERBS) {
  if (row.stores.some((s) => STORE_KEYS.has(s))) NEEDS.set(verb, row);
}

const COVERED = new Set<string>();
const UNCOVERED = new Map<string, VerbRow>();
for (const [verb, row] of NEEDS) {
  if (BRIDGE_CASES.has(verb)) COVERED.add(verb);
  else UNCOVERED.set(verb, row);
}

// ── the ledger ──────────────────────────────────────────────────────────────
let debt: DebtFile = { rows: [] };
if (existsSync(DEBT_PATH)) {
  try { debt = JSON.parse(readFileSync(DEBT_PATH, 'utf8')) as DebtFile; }
  catch (err) { fail2(`mirror-debt.json did not parse: ${String(err)}`); }
}
if (!Array.isArray(debt.rows)) fail2('mirror-debt.json has no `rows` array.');

const debtByVerb = new Map<string, DebtRow>();
for (const r of debt.rows) debtByVerb.set(r.verb, r);

// ARM C — every row reasoned, hard-0.
const armC: string[] = [];
for (const r of debt.rows) {
  if (typeof r.verb !== 'string' || r.verb.length === 0) armC.push('a row has no `verb`');
  if (!EXEMPT_KINDS.has(r.kind)) armC.push(`${r.verb}: kind '${r.kind}' is not in the closed vocabulary {${[...EXEMPT_KINDS].join(', ')}}`);
  if (typeof r.reason !== 'string' || r.reason.trim().length < 20) armC.push(`${r.verb}: reason is missing or too short to be a reason`);
}

// ARM A — new uncovered verbs not on the ledger.
const armA: VerbRow[] = [];
for (const [verb, row] of UNCOVERED) {
  if (!debtByVerb.has(verb)) armA.push(row);
}

// ARM B — paid debt that did not leave.
const armB: Array<{ verb: string; why: string }> = [];
for (const r of debt.rows) {
  if (!VERBS.has(r.verb)) { armB.push({ verb: r.verb, why: 'the verb no longer exists in any handler root' }); continue; }
  if (!NEEDS.has(r.verb)) { armB.push({ verb: r.verb, why: 'the verb no longer declares a plugin DTO store' }); continue; }
  if (BRIDGE_CASES.has(r.verb)) { armB.push({ verb: r.verb, why: `it now HAS a \`case '${r.verb}'\` in ${BRIDGE_REL} — paid debt must leave the ledger` }); }
}

// ARM D — a CLASSIFICATION that no longer holds. `refuses` and
// `mirrored-elsewhere` are the two kinds this gate can MEASURE, so it does.
// A row that says `refuses` about a handler that now validates is the exact
// shape of "a comment is not a detector", written into the ledger instead.
const armD: Array<{ verb: string; why: string }> = [];
for (const r of debt.rows) {
  const row = VERBS.get(r.verb);
  if (!row) continue; // ARM B already owns this
  if (r.kind === 'refuses' && !row.refuses) {
    armD.push({ verb: r.verb, why: 'the ledger says `refuses`, but `canExecute` can now return valid and no CA-18 refusal value is returned — it MUTATES, so it needs a mirror or a different reason' });
  }
  if (r.kind === 'mirrored-elsewhere' && LEVEL_CHANGE.has(r.verb) === false && /\.changeLevel$/.test(r.verb)) {
    armD.push({ verb: r.verb, why: 'the ledger says `mirrored-elsewhere` via the level-change channel, but the verb is not in packages/command-bus/src/levelChangeVerbs.ts' });
  }
}

// ── --write (seeding only) ──────────────────────────────────────────────────
if (WRITE) {
  const rows: DebtRow[] = [...UNCOVERED.values()]
    .map((row) => {
      const prior = debtByVerb.get(row.verb);
      // ⭐ CLASSIFY BY MEASUREMENT WHERE MEASUREMENT IS POSSIBLE. A file of 170
      // rows all reading `UNMIRRORED` would be a backlog nobody can act on, and
      // worse, it would grade a deliberately-dead verb (§FIX-DEAD-VERB-REFUSE)
      // as a render defect that a bridge case would fix. It would not.
      let kind = prior?.kind;
      let reason = prior?.reason;
      if (kind === undefined) {
        if (row.refuses) {
          kind = 'refuses';
          reason =
            'MEASURED: `canExecute` cannot return valid on any path, or the handler returns the C16 CA-18 ' +
            'refusal-as-a-value shape beside an empty patch pair. The verb is deliberately dead ' +
            '(§FIX-DEAD-VERB-REFUSE). It MUST NOT acquire a mirror while it refuses — a mirror would relay a ' +
            'mutation the handler never makes. It leaves this file when the refusal is lifted.';
        } else if (LEVEL_CHANGE.has(row.verb)) {
          kind = 'mirrored-elsewhere';
          reason =
            'MEASURED: carried by the §L-946 `element.level-changed` channel, which `emitLevelChange()` fires ' +
            'BEFORE the create switch and in its own try/catch, so `elementLevelChangedMirror` moves the legacy ' +
            'record without a case here. Row cited from packages/command-bus/src/levelChangeVerbs.ts — the one ' +
            'authority on the question (C84 EI-9).';
        } else {
          kind = 'UNMIRRORED';
          reason =
            'SEEDED BACKLOG — writes a plugin DTO store, has no CommandEventBridge case, and does not refuse. ' +
            'Nothing relays it to the legacy geometry store the fragment builders, the 2-D plan projector, the ' +
            'IFC exporter and ProjectSerializer read, so it commits, reports success, and changes nothing the ' +
            'user can see. Fix = a case in CommandEventBridge.ts + a subscriber in initTools.ts, OR replace ' +
            'this text with the measured reason it needs neither.';
        }
      }
      return {
        verb: row.verb,
        kind,
        stores: row.stores.filter((s) => STORE_KEYS.has(s)),
        reason: reason!,
      };
    })
    .sort((a, b) => a.verb.localeCompare(b.verb));
  const next: DebtFile = {
    $schema: 'https://pryzm.dev/schemas/mirror-debt.json',
    note:
      'THE MIGRATION BACKLOG. Every row is a bus verb that writes a plugin DTO store and has no ' +
      'CommandEventBridge case. SHRINK-ONLY: a verb leaves this file in the same commit that gives it a ' +
      'bridge case (or removes its plugin-store write). Rows with kind "UNMIRRORED" are DEFECTS with a ' +
      'row, not exemptions. See tools/ga-gate/check-mirror-completeness.ts.',
    rows,
  };
  writeFileSync(DEBT_PATH, JSON.stringify(next, null, 2) + '\n', 'utf8');
  console.log(`[${LABEL}] --write: mirror-debt.json now carries ${rows.length} row(s).`);
}

// ── report ──────────────────────────────────────────────────────────────────
console.log(`[${LABEL}] subject: ${filesRead} handler file(s) · ${VERBS.size} verb(s) · ` +
  `${STORE_KEYS.size} plugin DTO store key(s) from ${storeFiles} store file(s) · ` +
  `${BRIDGE_CASES.size} bridge case arm(s) (${bridgeCaseLines} line(s)) in ${BRIDGE_REL}`);
console.log(`[${LABEL}] verbs that WRITE a plugin DTO store: ${NEEDS.size} ` +
  `— ${COVERED.size} with a bridge case, ${UNCOVERED.size} without.`);

const unmirroredRows = debt.rows.filter((r) => r.kind === 'UNMIRRORED');
console.log(`[${LABEL}] ledger: ${debt.rows.length} row(s) — ${unmirroredRows.length} kind=UNMIRRORED ` +
  `(the BACKLOG: these will not update on screen), ` +
  `${debt.rows.length - unmirroredRows.length} declared-exempt.`);

// ⭐ The census this gate exists because of. Printed EVERY run, gated by nothing
// here — it is the number AUDIT-B §2.4 calls "the whole §FIX-MATERIAL-DEAD-DISPATCH
// family, mechanically", and it belongs where a person will see it.
const initToolsAbs = path.join(ROOT, 'apps/editor/src/engine/initTools.ts');
if (existsSync(initToolsAbs)) {
  const it = readFileSync(initToolsAbs, 'utf8');
  const created = [...it.matchAll(/'[a-zA-Z.-]+\.created'/g)].length;
  const updated = [...it.matchAll(/'[a-zA-Z.-]+\.updated'/g)].length;
  console.log(`[${LABEL}] census (initTools.ts): ${created} '*.created' mirror(s) · ${updated} '*.updated' mirror(s).` +
    (updated === 0
      ? ' ⛔ ZERO update mirrors — every family can be CREATED and reach the render layer; none can be UPDATED and reach it.'
      : ''));
}

let rc = 0;

if (armC.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM C — ${armC.length} malformed ledger row(s). An exemption with no reason is a rubber stamp:`);
  for (const m of armC) console.error(`    · ${m}`);
}

if (armA.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM A — ${armA.length} NEW verb(s) write a plugin DTO store with NO CommandEventBridge case and NO ledger row.`);
  console.error('    Each will commit, report success, and change nothing the user can see — the worst failure mode in a BIM system.');
  for (const r of armA.sort((a, b) => a.verb.localeCompare(b.verb))) {
    console.error(`    · ${r.verb}  stores=[${r.stores.filter((s) => STORE_KEYS.has(s)).join(', ')}]  ${r.files[0]}`);
  }
  console.error(`    FIX: add a \`case '<verb>'\` to ${BRIDGE_REL} (\`case 'lift.create'\` is the worked idiom),`);
  console.error('    or add a ledger row to tools/ga-gate/mirror-debt.json saying WHY it needs none.');
}

if (armB.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM B — ${armB.length} ledger row(s) are PAID DEBT that did not leave the file.`);
  console.error('    A ledger that keeps closed rows rots into a list of things that are secretly fine.');
  for (const r of armB.sort((a, b) => a.verb.localeCompare(b.verb))) {
    console.error(`    · ${r.verb} — ${r.why}`);
  }
}

if (armD.length > 0) {
  rc = 1;
  console.error(`
[${LABEL}] ⛔ ARM D — ${armD.length} ledger row(s) whose CLASSIFICATION no longer holds.`);
  console.error('    A stale reason is a comment pretending to be a measurement.');
  for (const r of armD.sort((a, b) => a.verb.localeCompare(b.verb))) {
    console.error(`    · ${r.verb} — ${r.why}`);
  }
}

if (rc === 0) {
  console.log(`\n[${LABEL}] ✓ within the named ledger (${UNCOVERED.size} uncovered / ${debt.rows.length} listed), both directions clean.`);
  console.log(`[${LABEL}] ⚠ NOT ESTABLISHED: that any covered verb's event reaches a subscriber, a legacy record, or a mesh.`);
  console.log(`[${LABEL}]   A bridge case is a DECLARED channel. C16 §5.1 CA-21 wants an executed read-back —`);
  console.log(`[${LABEL}]   see LiftCompoundReachesTheMesh.test.ts / BeamMasterMaterialReachesMesh.test.ts.`);
}
process.exit(rc);
