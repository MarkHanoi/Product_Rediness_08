// ─── GATE · check-source-verified-invariants ─────────────────────────────────
//
// C71 §5 (GR-15) · C72 §4.1/§4.3 (PR-05) · C72 §4.2 (PR-06) ·
// C72 §5.1–§5.2 (PR-07) · C72 §0.3 (PR-13) · C70 §5 exit-code contract.
//
// ─── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
// Five rows of the BIM 3.0 register were CLOSED by a **source verification** —
// a human read the file, saw the fix, and wrote the row green. The register
// itself names that class as the weaker half of its evidence
// (`BIM30-MASTER-COMPLETION-TRACKER.md` §1.0, "10 by an executed source
// census … it is the weaker half and is named as such"), and `bim30-status`
// prints all five as **CARRIED — no runnable gate decides these**: their status
// is inherited from prose and is not evidence at HEAD.
//
// That is the L-809/L-812 defect shape exactly: a document describing a control
// that no runner can execute. A source verification is not weak because it reads
// source — `check-graph-persistence` reads source and is one of the strongest
// gates in the suite. It is weak because it happened ONCE, by hand, at a SHA
// nobody can re-run. This file makes the same five readings **executable**.
//
// ─── WHAT IT DOES NOT ESTABLISH (stated, never inferred) ─────────────────────
// Every arm here is STATIC. None of them executes a command, drives a gesture,
// or reads a live store. Concretely:
//   • SV1 proves the `measuredAt` writer CALLS the declared signature. It does
//     NOT prove the call is ever REACHED at runtime — `graphruntime.cert` (H5)
//     owns reachability, and `measuredAt` is not one of the edges it drives.
//   • SV2 proves the pause is released in a `finally`. It does NOT prove the
//     observer resumes correctly, only that no throw path skips the call.
//   • SV3 proves `RECONCILABLE_TYPES` has a consumer and that the consumer is
//     itself called. It does NOT prove the reconcile is correct for the two
//     types it names — C72 §5's exit condition is a wider claim than this arm.
//   • SV4 counts FILES. Two authorities inside one file would pass it.
//   • SV5 counts CALL SITES. A caller behind a dead guard counts as present —
//     this is the identical blindness `check-graph-write-coverage` declares
//     about writers, and CE-05 is the row that owns it.
//
// ─── THE FIVE ARMS ───────────────────────────────────────────────────────────
//  SV1 · GR-15 — `measuredAt`'s writer must call `SemanticGraph.addRelationship`
//        with ONE OBJECT. Until 2026-08-11 it passed FOUR POSITIONAL arguments
//        (`addRelationship(roomId, nodeId, 'measuredAt', {…})`), which compiled
//        only because `window.semanticGraphManager` was typed `any`, and wrote a
//        junk edge for five months. The declared arity is read from
//        `SemanticGraph.ts` rather than hard-coded, so the arm tracks the
//        contract instead of a remembered number.
//        ⚠ The subject file DOCUMENTS the old defect verbatim in a docblock.
//        An arm that grepped raw text would fire on the comment forever. Comment
//        stripping is therefore not a nicety here, it is the arm — and control
//        C1b drives that exact shape every run.
//  SV2 · PR-06 — every `.pause()` in `initPersistence.ts` must have its matching
//        `.resume()` INSIDE a `finally` block. A throw inside `ProjectLoader.load`
//        must not leave topology observation and sync-state recompute off for the
//        rest of the session, silently, with the project looking fine.
//  SV3 · PR-07 — `RECONCILABLE_TYPES` must have at least one PRODUCTION consumer
//        (not its own declaration, not a bare re-export), and that consumer must
//        itself be called. "Exported with zero consumers" is the defect; a
//        consumer nothing calls is the same defect wearing a function.
//  SV4 · PR-13 — `ColumnStore` / `DoorStore` / `WindowStore` must each resolve to
//        EXACTLY ONE production authority file repo-wide. Two stores means any
//        cascade wired to one is blind to the other.
//  SV5 · PR-05 — the suppression RELEASE (`clearGraphAuthoritative`) must have at
//        least one production CALL SITE. ⭐ This arm exists precisely because
//        `check-suppression-is-reversible` S1 **cannot see it**: S1 counts callers
//        OUTSIDE the defining file by design (§PR-05-ONE-RELEASE-AUTHORITY) and
//        the only release is same-file, so S1 stays at 41/41 whether the caller
//        is there or not. Blind by design is still blind; this arm is the eye.
//
// ─── EXECUTED CONTROLS, BOTH DIRECTIONS, EVERY RUN (C70 §5.6) ────────────────
// A control that cannot fail is not a control, and an arm never watched failing
// is UNPROVEN. `selfTest()` drives every detector over synthetic sources: the
// planted DEFECT — spelled as the corpus actually spelled it — must be detected,
// and the planted FIX must not be. A control that fails exits 2 (MISCONFIGURED),
// never 0: a blind comparator does not publish a verdict.

import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor } from '../contract.js';
import { collectSources, type SourceFile } from './scan.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../../../..');

const GATE = 'check-source-verified-invariants';

const PHYSICS_FILE = 'packages/physics-host/src/PhysicsEngine.ts';
const GRAPH_FILE = 'packages/core-app-model/src/SemanticGraph.ts';
const PERSIST_FILE = 'apps/editor/src/engine/initPersistence.ts';
const SPATIAL_FILE = 'packages/core-app-model/src/SpatialAuthority.ts';
const OBSERVER_FILE = 'packages/room-topology/src/RoomTopologyObserver.ts';

const SCAN_ROOTS = ['apps', 'packages', 'plugins', 'src', 'server'];

/* ─────────────────────────── shared primitives ─────────────────────────── */

/**
 * Remove `//` and block comments. Deliberately simple and deliberately NOT
 * string-aware: every subject below is TypeScript whose string literals do not
 * contain comment openers, and a heavier parser would be a dependency this gate
 * refuses (§FIX-GATE-NEEDS-RIPGREP — a gate that needs a binary CI never
 * installed is a gate that does not run).
 */
export function stripComments(text: string): string {
  // Block comments are BLANKED, not deleted: collapsing them would shift every
  // later line number and this gate reports call sites by line. A finding that
  // points at the wrong line is a finding a reader cannot check.
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/** Brace-match forward from the `{` at or after `from`. Returns the body, or ''. */
function blockAt(text: string, from: number): string {
  const open = text.indexOf('{', from);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) return text.slice(open + 1, i);
    }
  }
  return '';
}

/** Every `finally { … }` body in `text`, comments already stripped. */
function finallyBodies(text: string): string[] {
  const out: string[] = [];
  const re = /\bfinally\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const body = blockAt(text, m.index);
    if (body) out.push(body);
  }
  return out;
}

function readSubject(rel: string): string | null {
  const p = resolve(REPO, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

/* ─────────────────────────── SV1 · GR-15 ─────────────────────────── */

/** The declared parameter count of `addRelationship` on the graph class. */
export function declaredAddRelationshipArity(graphSrc: string): number | null {
  const m = stripComments(graphSrc).match(/\baddRelationship\s*\(([^)]*)\)\s*:/);
  if (!m) return null;
  const params = m[1].trim();
  if (!params) return 0;
  // Top-level commas only — `Omit<Relationship, 'id' | 'createdAt'>` contains one.
  let depth = 0;
  let count = 1;
  for (const ch of params) {
    if ('<([{'.includes(ch)) depth++;
    else if ('>)]}'.includes(ch)) depth--;
    else if (ch === ',' && depth === 0) count++;
  }
  return count;
}

export interface Sv1Reading { calls: number; positional: string[] }

/**
 * Every `addRelationship(` CALL in the subject must open with `{`. A call whose
 * first argument is not an object literal is passing positionally against a
 * one-object signature — GR-15's defect.
 */
export function sv1(physicsSrc: string): Sv1Reading {
  const src = stripComments(physicsSrc);
  const re = /\.addRelationship\s*\(/g;
  const positional: string[] = [];
  let calls = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    calls++;
    const after = src.slice(m.index + m[0].length).replace(/^\s+/, '');
    if (!after.startsWith('{')) {
      positional.push(`${PHYSICS_FILE}: .addRelationship(${after.slice(0, 40).split('\n')[0]}…`);
    }
  }
  return { calls, positional };
}

/* ─────────────────────────── SV2 · PR-06 ─────────────────────────── */

export interface Sv2Reading { paused: string[]; unreleased: string[] }

/**
 * Receiver of each `.pause()`, and whether a `.resume()` on the same receiver
 * appears inside SOME `finally` body in the file.
 */
export function sv2(persistSrc: string): Sv2Reading {
  const src = stripComments(persistSrc);
  const fin = finallyBodies(src).join('\n');
  const re = /([A-Za-z_$][\w$]*)\s*\??\s*\.\s*pause\s*\(\s*\)/g;
  const paused: string[] = [];
  const unreleased: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    const recv = m[1];
    paused.push(recv);
    const resumed = new RegExp(`${recv}\\s*\\??\\s*\\.\\s*resume\\s*\\(`).test(fin);
    if (!resumed) unreleased.push(`${PERSIST_FILE}: ${recv}.pause() with no ${recv}.resume() in any finally block`);
  }
  return { paused: [...new Set(paused)], unreleased };
}

/* ─────────────────────────── SV3 · PR-07 ─────────────────────────── */

export interface Sv3Reading { consumers: number; guardCalls: number }

/**
 * `RECONCILABLE_TYPES` references that are neither its own declaration nor a
 * bare re-export, plus calls to the guard that reads it. Both must be > 0:
 * a consumer nothing calls is "exported with zero consumers" wearing a function.
 */
export function sv3(spatialSrc: string): Sv3Reading {
  const src = stripComments(spatialSrc);
  let consumers = 0;
  for (const line of src.split('\n')) {
    if (!line.includes('RECONCILABLE_TYPES')) continue;
    if (/\b(const|let|var|type|interface)\s+RECONCILABLE_TYPES\b/.test(line)) continue;
    if (/^\s*export\s*\{[^}]*RECONCILABLE_TYPES/.test(line)) continue;
    consumers++;
  }
  const all = (src.match(/\bisReconcilable\s*\(/g) ?? []).length;
  const defs = (src.match(/\bfunction\s+isReconcilable\s*\(/g) ?? []).length;
  return { consumers, guardCalls: Math.max(0, all - defs) };
}

/* ─────────────────────────── SV4 · PR-13 ─────────────────────────── */

const STORE_FAMILIES = ['ColumnStore', 'DoorStore', 'WindowStore'] as const;

export interface Sv4Reading { counts: Record<string, string[]> }

export function sv4(files: readonly { rel: string }[]): Sv4Reading {
  const counts: Record<string, string[]> = {};
  for (const fam of STORE_FAMILIES) {
    counts[fam] = files.filter((f) => basename(f.rel) === `${fam}.ts`).map((f) => f.rel);
  }
  return { counts };
}

/* ─────────────────────────── SV5 · PR-05 ─────────────────────────── */

export interface Sv5Reading { callSites: string[] }

/** CALL sites only — a definition is not preceded by a dot. */
export function sv5(files: readonly SourceFile[]): Sv5Reading {
  const callSites: string[] = [];
  for (const f of files) {
    const src = stripComments(f.text);
    for (const [i, line] of src.split('\n').entries()) {
      if (/\.\s*clearGraphAuthoritative\s*\(/.test(line)) callSites.push(`${f.rel}:${i + 1}`);
    }
  }
  return { callSites };
}

/* ─────────────────────────── executed controls ─────────────────────────── */

interface Control { id: string; what: string; pass: boolean }

function selfTest(): Control[] {
  const c: Control[] = [];

  // C1a — the defect as the corpus actually spelled it, in CODE.
  c.push({
    id: 'C1a', what: 'SV1 detects a four-positional addRelationship call',
    pass: sv1(`sgm.addRelationship(roomId, nodeId, 'measuredAt', { computedAt });`).positional.length === 1,
  });
  // C1b — the SAME defect inside a docblock. The live subject contains this
  // verbatim; an arm that fired on it would be red forever and worthless.
  c.push({
    id: 'C1b', what: 'SV1 ignores the defect quoted inside a comment',
    pass: sv1(`/** was: addRelationship(roomId, nodeId, 'measuredAt', {…}) */\nsgm.addRelationship({ type: 'measuredAt' });`).positional.length === 0,
  });
  c.push({
    id: 'C1c', what: 'SV1 reads a one-object declared arity from a signature',
    pass: declaredAddRelationshipArity(`addRelationship(rel: Omit<Relationship, 'id' | 'createdAt'>): string {`) === 1,
  });
  c.push({
    id: 'C1d', what: 'SV1 reads a FOUR-parameter declared arity as 4 (the arity is measured, not assumed)',
    pass: declaredAddRelationshipArity(`addRelationship(a: string, b: string, t: RelationshipType, m: Meta): string {`) === 4,
  });

  // C2 — pause released outside a finally is the defect; inside is the fix.
  c.push({
    id: 'C2a', what: 'SV2 detects a pause whose resume is not in a finally',
    pass: sv2(`obs.pause();\nload();\nobs.resume();`).unreleased.length === 1,
  });
  c.push({
    id: 'C2b', what: 'SV2 accepts a pause released in a finally',
    pass: sv2(`obs.pause();\ntry { load(); } finally { obs.resume(); }`).unreleased.length === 0,
  });
  c.push({
    id: 'C2c', what: 'SV2 accepts optional-chained receivers (window.x?.pause())',
    pass: sv2(`window.obs?.pause();\ntry { load(); } finally { window.obs?.resume(); }`).unreleased.length === 0,
  });

  // C3 — declaration + re-export only is "zero consumers".
  c.push({
    id: 'C3a', what: 'SV3 reads declaration-plus-re-export as zero consumers',
    pass: sv3(`const RECONCILABLE_TYPES = new Set(['Wall']);\nexport { RECONCILABLE_TYPES };`).consumers === 0,
  });
  c.push({
    id: 'C3b', what: 'SV3 counts a real read of the set, and a call of its guard',
    pass: (() => {
      const r = sv3(`const RECONCILABLE_TYPES = new Set(['Wall']);\nfunction isReconcilable(k){ return RECONCILABLE_TYPES.has(k); }\nif (isReconcilable(kind)) go();`);
      return r.consumers === 1 && r.guardCalls === 1;
    })(),
  });
  c.push({
    id: 'C3c', what: 'SV3 does not credit a guard that is defined and never called',
    pass: sv3(`const RECONCILABLE_TYPES = new Set(['Wall']);\nfunction isReconcilable(k){ return RECONCILABLE_TYPES.has(k); }`).guardCalls === 0,
  });

  // C4 — a duplicated store authority.
  c.push({
    id: 'C4a', what: 'SV4 detects two ColumnStore authorities',
    pass: sv4([{ rel: 'packages/geometry-column/src/ColumnStore.ts' }, { rel: 'packages/core-app-model/src/ColumnStore.ts' }]).counts.ColumnStore.length === 2,
  });
  c.push({
    id: 'C4b', what: 'SV4 does not count a same-named file in another family',
    pass: sv4([{ rel: 'a/ColumnStore.ts' }, { rel: 'b/ColumnStoreAdapter.ts' }]).counts.ColumnStore.length === 1,
  });

  // C5 — a release with a definition and a comment mention but no call.
  c.push({
    id: 'C5a', what: 'SV5 reads definition-plus-comment as zero call sites',
    pass: sv5([{ path: '', rel: 'x.ts', text: `// see clearGraphAuthoritative\n  clearGraphAuthoritative(levelId: string): void { }` }]).callSites.length === 0,
  });
  c.push({
    id: 'C5b', what: 'SV5 counts a same-file this.clearGraphAuthoritative(…) call',
    pass: sv5([{ path: '', rel: 'x.ts', text: `  clearGraphAuthoritative(l: string): void { }\n  f() { this.clearGraphAuthoritative(w.levelId); }` }]).callSites.length === 1,
  });

  return c;
}

/* ─────────────────────────── main ─────────────────────────── */

function main(): void {
  const controls = selfTest();
  const controlsPassed = controls.filter((x) => x.pass).length;

  const physics = readSubject(PHYSICS_FILE);
  const graph = readSubject(GRAPH_FILE);
  const persist = readSubject(PERSIST_FILE);
  const spatial = readSubject(SPATIAL_FILE);
  const observer = readSubject(OBSERVER_FILE);

  const files = collectSources(REPO, SCAN_ROOTS);

  const arity = graph ? declaredAddRelationshipArity(graph) : null;
  const r1 = physics ? sv1(physics) : { calls: 0, positional: [] };
  const r2 = persist ? sv2(persist) : { paused: [], unreleased: [] };
  const r3 = spatial ? sv3(spatial) : { consumers: 0, guardCalls: 0 };
  const r4 = sv4(files);
  const r5 = sv5(files);

  const findings: string[] = [];
  findings.push(...r1.positional.map((s) => `SV1(GR-15) ${s}`));
  findings.push(...r2.unreleased.map((s) => `SV2(PR-06) ${s}`));
  if (r3.consumers === 0) findings.push(`SV3(PR-07) RECONCILABLE_TYPES is exported with ZERO consumers in ${SPATIAL_FILE}`);
  if (r3.guardCalls === 0) findings.push(`SV3(PR-07) isReconcilable() is defined and never called — a consumer nothing calls`);
  for (const fam of STORE_FAMILIES) {
    const hits = r4.counts[fam];
    if (hits.length > 1) findings.push(`SV4(PR-13) ${fam} has ${hits.length} authority files: ${hits.join(' · ')}`);
  }
  if (r5.callSites.length === 0) {
    findings.push(`SV5(PR-05) clearGraphAuthoritative has ZERO production call sites — every generated level keeps its rooms suppressed for the session`);
  }

  const lines: string[] = [
    `SV1 · GR-15  addRelationship declared arity ${arity ?? 'NOT FOUND'} · ${r1.calls} call site(s) in ${PHYSICS_FILE} · positional ${r1.positional.length}`,
    `SV2 · PR-06  ${r2.paused.length} paused receiver(s) in ${PERSIST_FILE} [${r2.paused.join(', ')}] · unreleased ${r2.unreleased.length}`,
    `SV3 · PR-07  RECONCILABLE_TYPES consumers ${r3.consumers} · isReconcilable() call sites ${r3.guardCalls}`,
    `SV4 · PR-13  ${STORE_FAMILIES.map((f) => `${f}=${r4.counts[f].length}`).join(' · ')}`,
    `SV5 · PR-05  clearGraphAuthoritative production call sites ${r5.callSites.length}${r5.callSites.length ? ` [${r5.callSites.join(', ')}]` : ''}`,
    '',
    `executed controls (C70 §5.6 — an arm never watched failing is UNPROVEN): ${controlsPassed}/${controls.length}`,
    ...controls.map((x) => `   ${x.pass ? '✓' : '❌'} ${x.id} ${x.what}`),
    '',
    'NOT MEASURED BY THIS GATE, and never to be cited for it: runtime REACHABILITY of any',
    'of the five call sites (H5 graphruntime.cert owns the graph half; CE-05 owns the',
    'gesture half) · whether the reconcile is CORRECT for Wall/Slab · a second authority',
    'living inside an existing store file · a caller sitting behind a dead guard.',
  ];

  // A missing subject is MISCONFIGURED, not a pass: if `PhysicsEngine.ts` moved,
  // this gate measured nothing and must say so rather than report 0 findings.
  const floors: Floor[] = [
    { what: 'executed controls passed', measured: controlsPassed, min: controls.length },
    { what: 'production sources scanned', measured: files.length, min: 1500 },
    { what: `subject files located (of ${5})`, measured: [physics, graph, persist, spatial, observer].filter(Boolean).length, min: 5 },
    { what: 'declared addRelationship arity resolved', measured: arity === 1 ? 1 : 0, min: 1 },
    { what: `addRelationship call sites in ${basename(PHYSICS_FILE)}`, measured: r1.calls, min: 1 },
    { what: `pause() receivers in ${basename(PERSIST_FILE)}`, measured: r2.paused.length, min: 1 },
    { what: 'ColumnStore/DoorStore/WindowStore authorities located', measured: STORE_FAMILIES.filter((f) => r4.counts[f].length >= 1).length, min: 3 },
  ];

  process.exit(reportGate({ gate: GATE, floors, lines, findings: findings.length, declared: 0, findingNames: findings }));
}

main();
