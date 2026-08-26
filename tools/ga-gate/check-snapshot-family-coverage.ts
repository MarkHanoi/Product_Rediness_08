#!/usr/bin/env tsx
/**
 * @file tools/ga-gate/check-snapshot-family-coverage.ts
 *
 * §PERSIST103 (L-11520) — **an element family with a plugin DTO store must have a
 * DECLARED answer to "does it survive a save and a reload?", and a row claiming
 * `persisted` must name a snapshot field that really exists and is really written.**
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⭐ THIS IS THE SIBLING GATE `check-mirror-completeness.ts` ASKS FOR BY NAME.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * That gate's own §WHAT-THIS-DOES-NOT-ESTABLISH block reads:
 *
 *     "⛔ It does not check the serializer. `boundaryLine` had a third break — zero
 *      occurrences in either `ProjectSerializer` — and no arm here would have seen
 *      it. That is a sibling gate somebody still has to write."
 *
 * This is it. The mirror gate answers *"will the element appear on screen when I
 * make it?"*; this one answers *"will it still be there tomorrow?"* — and the
 * repo has now lost a whole family to the second question THREE times:
 *
 *   · §PERSIST-LIGHTING (2026-05-22) — every light fixture, silently, on reload.
 *   · §FIX-POOL-AND-BOUNDARY-LINE-INVISIBLE (L-9948, 2026-08-23) — every boundary
 *     line; `grep -c boundaryLine ProjectSerializer.ts` → 0 in BOTH copies.
 *   · §PERSIST103 (L-11520, 2026-08-26) — the founder: *"11 elements did not survive
 *     project opening — the lift for example, I can see it is not there."*
 *     Measured: `lift`, `liftPart`, `pool`, `water`, `balcony`, `structural` and
 *     `section` had ZERO occurrences as a serialized slice.
 *
 * Each fix added ONE key and left the CLASS open. Three recurrences of one defect
 * shape is the repo's own stated threshold for mechanising it (CLAUDE.md records
 * the count/range shape failing five times before a gate was written for it).
 *
 * ─── WHAT IT CHECKS, PRECISELY ─────────────────────────────────────────────
 * The SUBJECT is measured, never enumerated by hand: every `super('<key>')` in a
 * class that `extends Store` ANYWHERE under `plugins/<plugin>/src/` — not only in a
 * file called `store.ts`. See `pluginStoreKeys()` for why that widening is
 * load-bearing (it is what makes `bathroomPod` and `level` visible at all). The
 * AUTHORITY is the declared table `SNAPSHOT_FAMILY_COVERAGE` in
 * `apps/editor/src/engine/persistence/snapshotFamilyCoverage.ts`.
 *
 * ARM A — EVERY FAMILY HAS A ROW (hard-0). A `Store` subclass with no row is a
 *   family whose persistence nobody has thought about. This is the TRIPWIRE: add a
 *   store, the gate goes RED until somebody states, in writing, whether it survives
 *   a reload. Silence is the one answer it will not accept.
 *
 * ARM B — EVERY ROW HAS A FAMILY (hard-0). A row for a `super()` key that no longer
 *   exists is paid debt that did not leave, or a typo that makes ARM A blind for the
 *   real key. Compared as SETS in BOTH directions, because a count can be right while
 *   the membership is wrong — the `check-contract-index-equivalence.ts` discipline.
 *
 * ARM C — A `persisted` CLAIM MUST BE TRUE (hard-0). For every row whose status is
 *   `persisted` or `via-legacy-twin`, its `snapshotKey` must (1) be a declared field
 *   of the `ProjectSnapshot` interface AND (2) appear as a key of the object literal
 *   `serialize()` returns. A row that claims persistence the code does not deliver is
 *   WORSE than an honest `UNPERSISTED` row: it converts an open defect into a closed
 *   one on paper. This arm is why the table cannot rot into reassurance.
 *
 * ARM D — MALFORMED ROWS (hard-0). Non-empty `reason`, status from the closed
 *   vocabulary, `snapshotKey` present exactly when the status requires it.
 *
 * ARM E — THE LOSS LEDGER IS SHRINK-ONLY (ratchet). The number of `UNPERSISTED`
 *   rows may fall and never rise. Every entry is NAMED below on every run, so the
 *   backlog is a work list rather than a number.
 *
 * ─── WHAT IT DOES **NOT** ESTABLISH — stated, not implied ──────────────────
 * ⛔ A snapshot KEY is a declared slot, not a round trip. This gate cannot tell you
 *    the serializer wrote a non-empty array into it, that `ProjectLoader` reads it
 *    back, or that the restored record has its properties. C67 rule 12 wants an
 *    EXECUTED create→serialize→deserialize→read-back, and that is what
 *    `apps/editor/__tests__/SnapshotFamilyRoundTrip.test.ts` does for the five
 *    families §PERSIST103 closed. A green reading here means "the family is
 *    ACCOUNTED FOR", never "the family round-trips".
 * ⛔ It sees `plugins/**` only. A family whose store lives OUTSIDE the plugin tree
 *    (the legacy `window.*Store` geometry twins, `packages/stores/*`) is outside its
 *    subject — which is why rows exist for the twins but the SUBJECT is the plugin
 *    key. `verticalCirculation` (the LOD-200 massing lift, `packages/geometry-lift/
 *    src/LiftStore.ts`) is invisible here and is NOT persisted either: L-11525, OPEN.
 * ⛔ It reads ONE serializer — the app copy at `apps/editor/src/engine/persistence/`,
 *    which is the copy production calls (`initPersistence.ts:100`). The
 *    `packages/persistence-client` copy is a known second implementation (§PV-05
 *    records a fix landing on the wrong one) and is NOT checked here.
 *
 * ─── Honesty floors ────────────────────────────────────────────────────────
 * Each exits 2 (never 0), because "scanned nothing and passed" is the documented way
 * this repo produces a confidently-green gate:
 *   · the store walk must find ≥ MIN_STORE_KEYS `super()` keys;
 *   · the table must carry ≥ MIN_ROWS rows;
 *   · the `ProjectSnapshot` field parse must yield ≥ MIN_SNAPSHOT_FIELDS fields and
 *     the `serialize()` literal ≥ MIN_WRITTEN_KEYS keys. A regex that stopped
 *     matching would otherwise report every claim false (ARM C storm) or, worse,
 *     be widened by the next lane until it reported them all true.
 *
 * ─── Governance ────────────────────────────────────────────────────────────
 * C13 (project lifecycle — *"projects must never silently disappear"*) · C47
 * (schema evolution: additive-optional keys need no version bump) · C84 EI-6
 * (persistence is not optional; absence must be loud) · C84 EI-1 (one authority per
 * family, and it is NAMED) · C67 rule 12 (round-trip is the proof, not `success:true`).
 *
 * Exit codes:
 *   0 = every family accounted for, every `persisted` claim verified, ledger within baseline
 *   1 = an arm failed
 *   2 = the scan could not form an opinion (a floor tripped)
 */

import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { walk, relPath } from './lib/sourceScan.js';
import {
  SNAPSHOT_FAMILY_COVERAGE,
  type SnapshotFamilyRow,
} from '../../apps/editor/src/engine/persistence/snapshotFamilyCoverage.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.GA_GATE_REPO_ROOT ?? path.resolve(HERE, '..', '..');
const LABEL = 'snapshot-family-coverage';

const SERIALIZER_REL = 'apps/editor/src/engine/persistence/ProjectSerializer.ts';
const PLUGIN_STORE_GLOB_DIR = 'plugins';

/**
 * ⛔ SHRINK-ONLY. Every entry is a family whose records are DESTROYED on reload.
 * Lower it when you close one; never raise it. Raising it is how a data-loss ledger
 * becomes a data-loss policy.
 *
 * Current entries (named on every run by ARM E, so this comment cannot be the only
 * place they appear):
 *   · structural  — L-11523, OPEN — authored records destroyed on reload TODAY.
 *   · section     — L-11524, OPEN — authored records destroyed on reload TODAY.
 *   · bathroomPod — L-11527, OPEN — ⚠ PENDING, NOT A LIVE LOSS. Lane BATH102's store
 *     exists but is registered in neither `ALL_PLUGINS` nor `runtime.stores`, so no
 *     user can author a pod and nothing is being destroyed. It is on the ledger so
 *     the family cannot go live UNANSWERED — which is the whole point of ARM A.
 *     ⛔ When BATH102 registers the storeKey, this entry LEAVES and the baseline
 *     drops to 2 IN THE SAME COMMIT. The row and the key move together (the rule
 *     CLAUDE.md records failing five times for the contract range).
 */
const UNPERSISTED_BASELINE = 3;

const MIN_STORE_KEYS = 20;
const MIN_ROWS = 20;
const MIN_SNAPSHOT_FIELDS = 40;
const MIN_WRITTEN_KEYS = 30;

const VALID_STATUS = new Set(['persisted', 'via-legacy-twin', 'not-model-state', 'UNPERSISTED']);
/** The two statuses that make a POSITIVE claim ARM C must verify. */
const CLAIMS_PERSISTENCE = new Set(['persisted', 'via-legacy-twin']);

function fail2(msg: string): never {
  console.error(`[${LABEL}] ⛔ CANNOT FORM AN OPINION: ${msg}`);
  process.exit(2);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. THE SUBJECT — plugin DTO store keys, MEASURED from the store files.
// ─────────────────────────────────────────────────────────────────────────────
//
// ⚠ The key is the string a `Store` subclass hands to `super(...)` — the key
// `PluginRegistry` binds and therefore the key `affectedStores` names. It is NOT the
// plugin directory name and NOT the class name: `plugins/curtain-wall` binds
// `curtainwall` (unhyphenated) and `plugins/dimensions` binds `dimension`
// (singular). One character of that drift already made a live channel read
// "0 subscribers" once ([[grep-silence-has-three-causes]]).
//
// ⛔ THE SUBJECT IS **EVERY FILE UNDER `plugins/*​/src/`**, NOT JUST `store.ts` — AND
// THAT DIVERGENCE FROM `check-mirror-completeness.ts` IS DELIBERATE AND MEASURED.
//
// That gate scans `^plugins/<p>/src/store\.ts$` exactly. Measured 2026-08-26, while
// this gate was being written: lane BATH102 had `plugins/plumbing/src/**bathroomPodStore.ts**`
// on disk — `class BathroomPodStore extends Store<BathroomPodData>` with
// `super('bathroomPod')` — and the narrow glob DID NOT SEE IT. A gate whose whole
// purpose is "no element family gets forgotten" that cannot see a family because its
// file is named `bathroomPodStore.ts` instead of `store.ts` reproduces, in its own
// detector, the exact defect it exists to catch. A filename is not a fact about the
// model ([[grep-silence-has-three-causes]] again: the silence had a THIRD cause, and
// this time the cause was the glob).
//
// So: two gates now compute this set differently, and that is stated rather than
// smoothed over — CLAUDE.md records three times what rival denominators cost. The
// difference is one-directional and safe: this subject is a strict SUPERSET of the
// mirror gate's, so a family visible there is always visible here. The mirror gate's
// blind spot is real and is NOT this lane's to close (L-11526, OPEN).
const STORE_FILE_RE = /^plugins\/[^/]+\/src\/.*\.ts$/;
function pluginStoreKeys(): { keys: Map<string, string>; files: number; classes: number } {
  const keys = new Map<string, string>();
  let files = 0;
  let classes = 0;
  for (const abs of walk(path.join(ROOT, PLUGIN_STORE_GLOB_DIR))) {
    const rel = relPath(ROOT, abs);
    if (!STORE_FILE_RE.test(rel)) continue;
    // Tests build throwaway `Store` subclasses with sentinel keys; a fixture is not
    // a family, and counting one would put a fake on the persistence ledger.
    if (/\.(test|spec)\.tsx?$/.test(rel) || rel.includes('/__tests__/')) continue;
    let src: string;
    try { src = readFileSync(abs, 'utf8'); } catch { continue; }
    const decls = [...src.matchAll(/\bextends\s+Store\b/g)].length;
    if (decls === 0) continue;
    files++;
    classes += decls;
    for (const m of src.matchAll(/super\('([A-Za-z0-9_-]+)'\)/g)) keys.set(m[1]!, rel);
  }
  return { keys, files, classes };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. THE SNAPSHOT — its declared fields, and the keys `serialize()` really writes.
// ─────────────────────────────────────────────────────────────────────────────
//
// TWO DIFFERENT FACTS, READ SEPARATELY, because they have failed independently in
// this very file: `curtainPanels` was a declared field with no writer until L-1057,
// and §PV-05 records a `provenance` writer landing in the copy production does not
// call. A field with no writer persists nothing; a writer with no field is a
// compile error that never happened because the interface used `any`.
function snapshotSurface(): { fields: Set<string>; written: Set<string>; lines: number } {
  const abs = path.join(ROOT, SERIALIZER_REL);
  if (!existsSync(abs)) fail2(`the serializer is missing: ${SERIALIZER_REL}`);
  const src = readFileSync(abs, 'utf8');
  const lines = src.split('\n');

  // ── (a) the interface's own top-level fields ──────────────────────────────
  // Scoped to the `export interface ProjectSnapshot {` block and matched at ONE
  // level of indentation, so nested blocks (`hierarchy: { version, nodes }`,
  // `annotations: { annotations, dimensions }`) do not leak their inner keys in as
  // if they were top-level slots.
  const fields = new Set<string>();
  let depth = 0;
  let inIface = false;
  for (const raw of lines) {
    if (!inIface) {
      if (/^export interface ProjectSnapshot\s*\{/.test(raw)) { inIface = true; depth = 1; }
      continue;
    }
    const t = raw.trim();
    if (depth === 1) {
      const m = /^([A-Za-z_][A-Za-z0-9_]*)\??\s*:/.exec(t);
      if (m !== null) fields.add(m[1]!);
    }
    // Track brace depth AFTER matching, so a line that both opens a nested block
    // and declares the field (`hierarchy?: {`) still records `hierarchy`.
    for (const ch of raw) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (depth <= 0) { inIface = false; break; }
  }

  // ── (b) the keys the returned object literal actually carries ─────────────
  // Scoped to `const snapshot: ProjectSnapshot = {` … its closing `};`, and
  // comment lines are stripped first — this file DOCUMENTS ABSENT keys by QUOTING
  // them (the §PERSIST-LIGHTING and §L-9948 notes both do), so a loose match reports
  // the opposite of the truth. Exactly the discipline `check-mirror-completeness.ts`
  // had to adopt for the bridge's `case` arms.
  const written = new Set<string>();
  let inLit = false;
  let litDepth = 0;
  for (const raw of lines) {
    if (!inLit) {
      if (/^\s*const snapshot:\s*ProjectSnapshot\s*=\s*\{/.test(raw)) { inLit = true; litDepth = 1; }
      continue;
    }
    const t = raw.trim();
    const isComment = t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
    if (!isComment && litDepth === 1) {
      // `levels, grids, walls,` (shorthand) and `lighting: lighting.length ? …`
      for (const m of t.matchAll(/(?:^|,)\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?=[,:])/g)) {
        written.add(m[1]!);
      }
    }
    if (!isComment) {
      for (const ch of raw) {
        if (ch === '{') litDepth++;
        else if (ch === '}') litDepth--;
      }
    }
    if (litDepth <= 0) { inLit = false; break; }
  }

  return { fields, written, lines: lines.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// Run
// ─────────────────────────────────────────────────────────────────────────────
const { keys: STORE_KEYS, files: storeFiles, classes: storeClasses } = pluginStoreKeys();
if (STORE_KEYS.size < MIN_STORE_KEYS) {
  fail2(`only ${STORE_KEYS.size} plugin DTO store key(s) found across ${storeFiles} store file(s); floor is ${MIN_STORE_KEYS}. The \`super('key')\` regex stopped matching.`);
}
if (storeClasses !== STORE_KEYS.size) {
  console.warn(`[${LABEL}] ⚠ ${storeClasses} \`extends Store\` class(es) but ${STORE_KEYS.size} literal key(s). A class whose key is not a literal is INVISIBLE to this gate — and therefore to its persistence question.`);
}

const ROWS: readonly SnapshotFamilyRow[] = SNAPSHOT_FAMILY_COVERAGE;
if (ROWS.length < MIN_ROWS) {
  fail2(`the coverage table carries only ${ROWS.length} row(s); floor is ${MIN_ROWS}. The table was gutted or the import resolved to the wrong module.`);
}

const { fields: SNAP_FIELDS, written: SNAP_WRITTEN, lines: serLines } = snapshotSurface();
if (SNAP_FIELDS.size < MIN_SNAPSHOT_FIELDS) {
  fail2(`parsed only ${SNAP_FIELDS.size} field(s) out of \`interface ProjectSnapshot\` in ${SERIALIZER_REL} (${serLines} lines); floor is ${MIN_SNAPSHOT_FIELDS}. The interface parse is broken, so EVERY \`persisted\` claim would read false.`);
}
if (SNAP_WRITTEN.size < MIN_WRITTEN_KEYS) {
  fail2(`parsed only ${SNAP_WRITTEN.size} key(s) out of the \`const snapshot: ProjectSnapshot = {…}\` literal; floor is ${MIN_WRITTEN_KEYS}. The literal parse is broken.`);
}

// ── the arms ────────────────────────────────────────────────────────────────
const declared = new Map<string, SnapshotFamilyRow>();
const armD: string[] = [];

for (const r of ROWS) {
  if (declared.has(r.storeKey)) armD.push(`'${r.storeKey}' has TWO rows — one family, one answer.`);
  declared.set(r.storeKey, r);
  if (!VALID_STATUS.has(r.status)) {
    armD.push(`'${r.storeKey}' status '${r.status}' is outside the closed vocabulary.`);
  }
  if (typeof r.reason !== 'string' || r.reason.trim().length === 0) {
    armD.push(`'${r.storeKey}' has a blank reason — a ledger row with no reason is a rubber stamp.`);
  }
  if (CLAIMS_PERSISTENCE.has(r.status) && (r.snapshotKey === null || r.snapshotKey.length === 0)) {
    armD.push(`'${r.storeKey}' claims '${r.status}' but names no snapshotKey.`);
  }
  if (!CLAIMS_PERSISTENCE.has(r.status) && r.snapshotKey !== null) {
    armD.push(`'${r.storeKey}' is '${r.status}' but names snapshotKey '${r.snapshotKey}' — only a persistence claim may name one.`);
  }
}

/** ARM A — a measured family with no row. THE TRIPWIRE. */
const armA = [...STORE_KEYS.keys()].filter((k) => !declared.has(k)).sort();
/** ARM B — a row for a family that no longer exists. */
const armB = [...declared.keys()].filter((k) => !STORE_KEYS.has(k)).sort();

/** ARM C — a persistence claim the serializer does not deliver. */
const armC: string[] = [];
for (const r of ROWS) {
  if (!CLAIMS_PERSISTENCE.has(r.status) || r.snapshotKey === null) continue;
  if (!SNAP_FIELDS.has(r.snapshotKey)) {
    armC.push(`'${r.storeKey}' claims snapshotKey '${r.snapshotKey}', which is NOT a field of \`interface ProjectSnapshot\`.`);
  } else if (!SNAP_WRITTEN.has(r.snapshotKey)) {
    armC.push(`'${r.storeKey}' claims snapshotKey '${r.snapshotKey}': the field is DECLARED but \`serialize()\` never writes it — a slot with no writer persists nothing.`);
  }
}

/** ARM E — the shrink-only loss ledger. */
const unpersisted = ROWS.filter((r) => r.status === 'UNPERSISTED').map((r) => r.storeKey).sort();

// ── report ──────────────────────────────────────────────────────────────────
console.log(`[${LABEL}] subject: ${STORE_KEYS.size} plugin DTO store key(s) across ${storeFiles} store file(s).`);
console.log(`[${LABEL}] authority: ${ROWS.length} declared row(s) · serializer surface: ${SNAP_FIELDS.size} field(s) declared, ${SNAP_WRITTEN.size} written.`);

let rc = 0;

if (armD.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM D — ${armD.length} malformed row(s):`);
  for (const m of armD) console.error(`    · ${m}`);
}

if (armA.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM A — ${armA.length} element family/families have a store and NO row saying whether they survive a reload.`);
  console.error('    This is the tripwire. A family nobody answered for is how the lighting fixtures, the boundary');
  console.error('    lines and the founder\'s lift were each destroyed on save — three times, in this one file.');
  for (const k of armA) console.error(`    · ${k}   (${STORE_KEYS.get(k)})`);
  console.error(`    FIX: add a row to apps/editor/src/engine/persistence/snapshotFamilyCoverage.ts.`);
  console.error('    An honest `UNPERSISTED` row is ACCEPTED (it raises the ledger, which is shrink-only). Silence is not.');
}

if (armB.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM B — ${armB.length} row(s) name a store key no \`super()\` call declares.`);
  console.error('    Either the family was deleted and the row did not leave, or the key is a typo — and a typo here');
  console.error('    makes ARM A BLIND to the real family, which is the failure mode this arm exists to catch.');
  for (const k of armB) console.error(`    · ${k}`);
}

if (armC.length > 0) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM C — ${armC.length} row(s) claim persistence the serializer does not deliver.`);
  console.error('    A false `persisted` claim is WORSE than an honest `UNPERSISTED` one: it converts an open');
  console.error('    data-loss defect into a closed one on paper, and nobody looks at a closed defect again.');
  for (const m of armC) console.error(`    · ${m}`);
}

if (unpersisted.length > UNPERSISTED_BASELINE) {
  rc = 1;
  console.error(`\n[${LABEL}] ⛔ ARM E — the loss ledger GREW: ${unpersisted.length} > baseline ${UNPERSISTED_BASELINE}.`);
  console.error('    Every entry is a family whose authored records are DESTROYED on reload. This ratchet is');
  console.error('    shrink-only; raising the baseline turns a data-loss ledger into a data-loss policy.');
}

// ⭐ NAMED ON EVERY RUN, green or red. A backlog that appears only as a number is a
// backlog nobody works — the `mirror-debt.json` lesson ("read it as a work list, not
// as absolution") applied here.
if (unpersisted.length > 0) {
  console.log(`\n[${LABEL}] ⚠ ${unpersisted.length} family/families are DECLARED UNPERSISTED (baseline ${UNPERSISTED_BASELINE}) — authored records are destroyed on reload:`);
  for (const k of unpersisted) {
    console.log(`    · ${k} — ${declared.get(k)!.reason}`);
  }
}

if (rc === 0) {
  const persisted = ROWS.filter((r) => CLAIMS_PERSISTENCE.has(r.status)).length;
  console.log(`\n[${LABEL}] ✓ OK: ${STORE_KEYS.size} family/families, ${STORE_KEYS.size} row(s), sets equal in both directions.`);
  console.log(`[${LABEL}]   ${persisted} persistence claim(s) verified against the snapshot's own fields and writers · ${unpersisted.length}/${UNPERSISTED_BASELINE} declared losses.`);
  console.log(`[${LABEL}] ⚠ NOT ESTABLISHED HERE: that any family ROUND-TRIPS. A snapshot key is a declared slot, not`);
  console.log(`[${LABEL}]   a proof that a record was written into it, read back, or restored with its properties.`);
  console.log(`[${LABEL}]   C67 rule 12 wants an EXECUTED create→serialize→deserialize→read-back: that is`);
  console.log(`[${LABEL}]   apps/editor/__tests__/SnapshotFamilyRoundTrip.test.ts, for the five families L-11520 closed.`);
  console.log(`[${LABEL}] ⚠ ALSO OUT OF SUBJECT: the LOD-200 massing lift (packages/geometry-lift/src/LiftStore.ts,`);
  console.log(`[${LABEL}]   storeRegistry key 'verticalCirculation'). It has no plugins/*/src/store.ts, so no arm sees`);
  console.log(`[${LABEL}]   it — and it is NOT persisted either. L-11525, OPEN.`);
}

process.exit(rc);
