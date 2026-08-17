#!/usr/bin/env tsx
/**
 * GA Gate: check-sync-disposition — W5-3.
 *
 * Contract: C08 (collaboration) · C66 §1.1 (a claim and a measurement must not be
 * written the same way) · P8 (explicit sync conflicts) · Principle idiom borrowed
 * from `check-declared-project-scopes.ts` (declaration-vs-code, born-declared or
 * born-failing).
 *
 * ─── WHAT THIS GATE EXISTS TO STOP ──────────────────────────────────────────
 *
 * Before W5-3, `YjsDocAdapter.applyCommand()` replicated a payload only when it
 * carried a top-level `id` key. Every `*.create` verb does; essentially no
 * property-mutation verb does — they key `wallId`, `elementId`, `slabId`,
 * `ceilingId`. So `wall.updateDimensions` hit `if (!elementId) return;` and
 * vanished. Nothing logged, nothing failed, nothing counted it. A collaborator's
 * document did not go BLANK — it kept the height from element creation, forever,
 * confidently. Failure and staleness had the same observable value.
 *
 * The class of defect is not "a property was forgotten". It is that FORGETTING
 * WAS INVISIBLE. So the fix is not a longer list inside the adapter; it is an
 * external declaration — `packages/sync-client/src/syncDisposition.ts` — plus
 * this gate, which makes an undeclared property verb a BUILD FAILURE rather than
 * a quiet non-replication discovered by two users disagreeing about a wall.
 *
 * ─── THE CHECKS ─────────────────────────────────────────────────────────────
 *
 *   S1  DECLARED-OR-FAILING. Every registered CommandBus handler whose type
 *       names a property mutation carries a disposition — a path into the CRDT
 *       document, or an explicit NOT-SYNCED with a written reason. This is the
 *       whole gate; S2-S5 stop the declaration from being hollowed out.
 *
 *   S2  A NOT-SYNCED REASON IS A REASON. Rejects placeholders and near-empty
 *       strings. "not-synced: TODO" would restore the silence with extra steps.
 *
 *   S3  SILENCE IS DECLARED, NEVER DEFAULTED (P8). A property declared
 *       `last-writer-wins` MUST carry `lwwReason`. P8 forbids a merge that loses
 *       data being silent; `last-writer-wins` is the documented exception, and an
 *       exception without a reason is just the default wearing a label.
 *
 *   S4  DECLARATION MATCHES CODE. An `element-property` declaration's `subject`
 *       key must actually appear in the handler source that registers that
 *       command type. This is the check that fails when a handler renames
 *       `wallId` → `hostId`: without it the declaration keeps claiming a path
 *       while `extractElementProperties` silently resolves nothing.
 *
 *   S5  NO DEAD DECLARATIONS. A declared type with no handler and no dispatch
 *       site in source is reported (as a NOTE — creation verbs and future types
 *       legitimately predate their handlers).
 *
 *   S6  CROSS-GATE AGREEMENT. The discovered handler set is compared against the
 *       GENERATED artefact of `check-verb-register.ts`
 *       (`docs/04-reference/API-VERB-REGISTER.md`). A verb the register lists and
 *       THIS gate cannot see is a HARD FAILURE — that is precisely the defect
 *       below, recurring. The reverse (this gate sees a verb the register lacks)
 *       is a NOTE, because a stale register is `check-verb-register`'s own hard
 *       failure and double-reporting it would teach people to ignore one of them.
 *
 *   S7  RUNTIME PARITY. Every discovered handler type — not merely the ones whose
 *       NAME looks like a property mutation — carries a disposition, because the
 *       RUNTIME holds every dispatched type to one. See §FIX-SYNC-GATE-NAME-SCOPED
 *       below; this is the arm whose absence let the gate print ✓ while production
 *       logged the exact defect the gate exists to catch.
 *
 * ─── §FIX-SYNC-GATE-NAME-SCOPED (2026-08-17, L-937) — GREEN WHILE PRODUCTION WARNED ───
 *
 * The founder hit this twice in one live session:
 *
 *     [YjsDocAdapter] W5-3: command type 'generation.rooms' has NO sync disposition.
 *     [YjsDocAdapter] W5-3: command type 'stair.createRailing' has NO sync disposition.
 *
 * …while THIS GATE EXITED 0. Not a discovery gap this time — S6 proved the handler
 * set agreed with the register at 326 verbs, both directions. A SUBJECT gap:
 *
 *   • the RUNTIME (`YjsDocAdapter._applyDeclaredProperties`) warns for EVERY command
 *     type it is handed, and `CommandBus` hands it every successful dispatch;
 *   • the GATE held only the 185 verbs matching `PROPERTY_VERB_RE`, a NAME-SHAPE
 *     heuristic. The other 141 were never asked for a disposition at all.
 *
 * `generation.rooms` fails the regex on its second segment; `stair.createRailing`
 * fails it because "createRailing" begins with `create`. Neither was a hard case —
 * they were simply OUTSIDE THE GATE'S SUBJECT, and a gate whose subject is a strict
 * subset of the runtime's can be green while the runtime warns, forever. That is
 * roadmap §7B.5 — A GATE THAT CLASSIFIES BY NAME CAN BE SATISFIED BY RENAMING —
 * in its purest form: `wall.updateHeight` is held, `wall.heightUpdate` would not be.
 *
 * S7 closes it by making the gate's subject IDENTICAL to the runtime's: the whole
 * discovered handler set. `isPropertyVerb` survives only as a REPORTING split, so
 * the "property verbs" statistic the register cites stays comparable — it is no
 * longer what decides whether a verb must be declared.
 *
 * ─── §FIX-SYNC-GATE-UNDERSCOPED (2026-08-11) — this gate's OWN first draft ───
 *
 * Discovery originally matched the OBJECT-LITERAL handler form only
 * (`type: '…'` within N chars of `affectedStores`). Most handlers in this repo
 * are CLASSES — `readonly type = 'wall.create';` — so the gate saw **60** of the
 * **320** registered handler types (19%) and printed "✓ Every property-mutation
 * command type declares its sync disposition" over 39 property verbs when there
 * are 184. Its `propertyVerbs.length < 20` floor could not catch it: 60 clears 20.
 *
 * That is verbatim the defect `check-chat-capability-coverage.ts` records having
 * had in ITS first draft ("saw 102 of the ~300 … confidently wrong"), and it was
 * found here the same way — by a THIRD gate (`check-verb-register.ts`) measuring
 * the same subject and disagreeing. The fix is the same route those two took:
 * one shared declaration regex that matches BOTH forms, the same `handlerish`
 * evidence rule, a floor set against the real subject, and S6 above so that a
 * future narrowing is caught by measurement rather than by a reader noticing.
 *
 * Every number in this header is a FREEZE, not a live reading. The gate prints
 * its own measurements on every run — read those (C64 §2.13 / C69 §0.1).
 *
 * Exit 0 → green. Exit 1 → HARD FAIL, merge blocked. Exit 2 → MISCONFIGURED
 * (the scan could not establish its own subject; see the floors below).
 */

import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { walk, relPath, scanFiles } from './lib/sourceScan.js';
import {
  SYNC_DISPOSITIONS,
  type SyncDisposition,
} from '../../packages/sync-client/src/syncDisposition';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

/**
 * Directories that register CommandBus handlers. IDENTICAL to
 * `check-verb-register.ts`'s `HANDLER_ROOTS` — the two gates measure the same
 * subject, so a difference in roots would be a difference in answers that nobody
 * could attribute. S6 checks the resulting sets actually agree.
 */
const HANDLER_DIRS = ['plugins', 'apps/editor/src/engine', 'packages/command-registry/src'];

/** The artefact `check-verb-register.ts` generates. S6's independent source. */
const REGISTER_PATH = 'docs/04-reference/API-VERB-REGISTER.md';

/**
 * ⚠ HONESTY FLOORS (lib/sourceScan.ts idiom). Below any of these the walk has not
 * established its subject and MUST NOT report a pass — exit 2 (MISCONFIGURED),
 * never 0 and never 1. These are misconfiguration detectors, NOT targets: never
 * raise one to make the gate green, and never lower one either — a floor beneath
 * the real subject detects nothing, which is exactly how the old
 * `propertyVerbs < 20` floor sat under a real set of 184 and saw 39.
 *
 * Frozen 2026-08-11 well below the reading of the day (1229 files / 320 handler
 * types / 184 property verbs), because the reading moves — five agents were
 * authoring verbs in this tree while this was written. The gate PRINTS all three
 * on every run; read the run output, never these constants.
 */
const MIN_FILES = 900;
const MIN_HANDLER_TYPES = 250;
const MIN_PROPERTY_VERBS = 150;

/**
 * Which command types are PROPERTY MUTATIONS.
 *
 * Deliberately a shape rule on the verb, not a hand-maintained list: a
 * hand-maintained list of things-that-must-be-declared is the same artefact as
 * the declaration it polices, and would be updated in the same commit that
 * forgets the declaration. Creation and deletion verbs are excluded — creates
 * are declared anyway (so an update merges onto the same record), deletes are a
 * different lifecycle question W5-3 does not address.
 */
const PROPERTY_VERB_RE =
  /^[a-z][\w-]*\.(update|set|add|remove|replace|rename|move|modify|cascade)[A-Z\w.-]*$/;

/** True when the type is a property mutation this gate holds to a declaration. */
function isPropertyVerb(type: string): boolean {
  if (!type.includes('.')) return false;              // legacy SCREAMING_CASE ids
  if (/\.(create|delete|batch\.create)$/.test(type)) return false;
  return PROPERTY_VERB_RE.test(type);
}

const failures: string[] = [];
const notes: string[] = [];

// ── Subject discovery: registered CommandBus handler types ──────────────────
//
// ⚠ BOTH HANDLER FORMS. The regex and the `handlerish()` evidence rule below are
// the SAME ones `check-verb-register.ts` uses, deliberately, because these two
// gates and `check-chat-capability-coverage.ts` measure ONE subject and a third
// private idea of "what a handler is" is how this family produces confidently-
// wrong gates. Cited rather than invented; S6 proves the answers still agree.
//
//    object literal / BridgeSpec →  `type: 'roof.update',`
//    class handler              →  `readonly type = 'wall.create';`
//                                  `readonly type: CommandType = 'wall.create';`
//
// Tests are excluded: they fabricate handler types on purpose.
const TYPE_DECL_RE = new RegExp(
  String.raw`(?:^|\n)\s*(?:public\s+|readonly\s+|static\s+)*type\s*` +
  String.raw`(?::\s*'([a-z][\w-]*(?:\.[\w-]+)*)'|(?::\s*[^=\n;]+)?=\s*'([a-z][\w-]*(?:\.[\w-]+)*)')`,
  'g',
);

/**
 * Is this `type` declaration a bus-command registration?
 *
 * STRICT evidence is a declared store list — `affectedStores` for a bus handler,
 * `stores` for an `initBusHandlers` BridgeSpec — or, in the editor engine only,
 * the `validate` + `run`/`fn` spec shape used by `_generationCmds` /
 * `_projectOriginCmds`, which register through the bus without naming a store.
 *
 * WEAK evidence is the file's location: a plugin's `src/handlers/` directory.
 * A DOTLESS verb requires STRICT evidence, because weak evidence alone admits
 * ordinary discriminated-union tags (`type: 'floor'` inside an element literal)
 * — which is exactly the noise that put 'door', 'rectangular' and 'sitsOn' into
 * the OLD handler table here.
 */
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

const handlerTypes = new Map<string, string>();   // type → first declaring file
let filesRead = 0;

for (const dir of HANDLER_DIRS) {
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
      // The slice runs to the NEXT declaration, so evidence cannot leak in from
      // an unrelated handler further down the same file.
      const slice = src.slice(hits[i]!.at, hits[i + 1]?.at ?? src.length);
      if (!handlerish(hits[i]!.verb, slice, rel)) continue;
      if (!handlerTypes.has(hits[i]!.verb)) handlerTypes.set(hits[i]!.verb, rel);
    }
  }
}

function misconfigured(msg: string): never {
  console.error(
    `\n[check-sync-disposition] MISCONFIGURED (exit 2) — ${msg}\n` +
    `  Root: ${ROOT}\n  Dirs: ${HANDLER_DIRS.join(', ')}\n` +
    `  This is NOT a pass, and it is NOT a failure either. A gate that could not\n` +
    `  establish its own subject has no property verbs to hold to a declaration, and\n` +
    `  reporting that as "all declared" is exactly the invisible-gap failure this gate\n` +
    `  exists to prevent. Exit 2 and exit 1 are different facts and MUST NOT alias.`,
  );
  process.exit(2);
}

if (filesRead < MIN_FILES) {
  misconfigured(`the handler walk READ only ${filesRead} file(s); floor is ${MIN_FILES}.`);
}
if (handlerTypes.size < MIN_HANDLER_TYPES) {
  misconfigured(
    `the walk read ${filesRead} files but discovered only ${handlerTypes.size} handler ` +
    `type(s); floor is ${MIN_HANDLER_TYPES}. The declaration regex or handlerish() ` +
    `evidence rule stopped matching — this is the §FIX-SYNC-GATE-UNDERSCOPED defect ` +
    `recurring, and it is the reason this floor is set against the REAL subject.`,
  );
}

const propertyVerbs = [...handlerTypes.keys()].filter(isPropertyVerb).sort();
if (propertyVerbs.length < MIN_PROPERTY_VERBS) {
  misconfigured(
    `the walk read ${filesRead} files and ${handlerTypes.size} handler types but classified ` +
    `only ${propertyVerbs.length} property verb(s); floor is ${MIN_PROPERTY_VERBS}. ` +
    `PROPERTY_VERB_RE stopped matching.`,
  );
}

// ── S1 / S7 — declared or failing ───────────────────────────────────────────
//
// ONE loop over the WHOLE handler set, because that is the runtime's subject
// (§FIX-SYNC-GATE-NAME-SCOPED). `isPropertyVerb` now only labels the failure so
// the two populations stay legible in the report; it no longer gates whether a
// verb must be declared. Do NOT re-narrow this loop to `propertyVerbs`.
let undeclaredCount = 0;          // property verbs — the S1 population
let undeclaredOtherCount = 0;     // every other handler type — the S7 population
for (const type of [...handlerTypes.keys()].sort()) {
  if (Object.prototype.hasOwnProperty.call(SYNC_DISPOSITIONS, type)) continue;
  if (isPropertyVerb(type)) {
    undeclaredCount += 1;
    failures.push(
      `S1 ${type} (${handlerTypes.get(type)}): a property-mutation command with NO sync ` +
      `disposition. Its payload does not reach the CRDT document, and nothing anywhere ` +
      `says so — a collaborator keeps the previous value, confidently. Declare it in ` +
      `packages/sync-client/src/syncDisposition.ts: either an { kind: 'element-property' } ` +
      `path, or { kind: 'not-synced', reason } saying why replication is wrong here.`,
    );
  } else {
    undeclaredOtherCount += 1;
    failures.push(
      `S7 ${type} (${handlerTypes.get(type)}): a registered handler type with NO sync ` +
      `disposition. Its name does not look like a property mutation, but the RUNTIME does ` +
      `not classify by name — YjsDocAdapter._applyDeclaredProperties warns for EVERY ` +
      `dispatched type, and CommandBus hands it every successful dispatch. This is the ` +
      `L-937 shape: gate green, production warning. Declare it in ` +
      `packages/sync-client/src/syncDisposition.ts: either an { kind: 'element-property' } ` +
      `path, or { kind: 'not-synced', reason } saying why replication is wrong here.`,
    );
  }
}

// ── S2 / S3 / S4 — the declaration must not be hollow ───────────────────────
const PLACEHOLDER_RE = /^(todo|tbd|n\/a|na|none|-+|\?+|later|fixme)\b/i;

for (const [type, d] of Object.entries(SYNC_DISPOSITIONS) as Array<[string, SyncDisposition]>) {
  if (d.kind === 'not-synced') {
    // S2 — a reason is a reason.
    if (d.reason.trim().length < 30 || PLACEHOLDER_RE.test(d.reason.trim())) {
      failures.push(
        `S2 ${type}: not-synced needs a real reason, not "${d.reason}". A placeholder ` +
        `restores the original silence with an extra step — the point of the declaration ` +
        `is that someone had to write down why.`,
      );
    }
    continue;
  }

  // S3 — silence is declared, never defaulted (P8).
  if (d.conflict === 'last-writer-wins') {
    if (!d.lwwReason || d.lwwReason.trim().length < 30) {
      failures.push(
        `S3 ${type}: conflict 'last-writer-wins' requires \`lwwReason\`. P8 forbids a merge ` +
        `that loses a user's edit being silent; LWW is the DOCUMENTED exception, and an ` +
        `exception with no documentation is the default wearing a label.`,
      );
    }
  }

  // S4 — the declared subject key must exist in the handler that owns the type.
  const owner = handlerTypes.get(type);
  if (!owner) continue;                      // covered by S5 as a note
  let src: string;
  try { src = readFileSync(path.join(ROOT, owner), 'utf8'); } catch { continue; }
  if (!new RegExp(`\\b${d.subject}\\b`).test(src)) {
    failures.push(
      `S4 ${type}: declares subject key '${d.subject}', which does not appear in its ` +
      `handler ${owner}. The payload key was renamed and the declaration was not. ` +
      `\`extractElementProperties\` will resolve nothing and the property will stop ` +
      `replicating — exactly the pre-W5-3 behaviour, restored by drift.`,
    );
  }
  if (d.nested !== undefined && !new RegExp(`\\b${d.nested}\\b`).test(src)) {
    failures.push(
      `S4 ${type}: declares nested property bag '${d.nested}', absent from ${owner}.`,
    );
  }
}

// ── S5 — dead declarations (NOTE, not a failure) ────────────────────────────
//
// A declared type with no handler is not necessarily wrong: creation verbs are
// dispatched from batch paths, and a declaration may legitimately land before
// its handler. Reported so the table cannot quietly accumulate fiction.
const dispatchScan = scanFiles({
  root: ROOT,
  dirs: ['plugins', 'packages', 'apps'],
  pattern: /executeCommand\(\s*'([A-Za-z0-9_.-]+)'/,
  minFiles: MIN_FILES,
  label: 'check-sync-disposition/dispatch',
  exclude: (rel) => /\.(test|spec)\.tsx?$/.test(rel) || rel.includes('/__tests__/'),
});
const dispatched = new Set(dispatchScan.matches.map(m => m.groups[0]).filter(Boolean) as string[]);
const orphaned = Object.keys(SYNC_DISPOSITIONS)
  .filter(t => !handlerTypes.has(t) && !dispatched.has(t))
  .sort();
if (orphaned.length > 0) {
  notes.push(
    `S5 ${orphaned.length} declared type(s) have neither a handler nor a dispatch site: ` +
    `${orphaned.join(', ')}. Confirm each is a forward declaration, not fiction.`,
  );
}

// ── S6 — cross-gate agreement on the handler set ────────────────────────────
//
// The subject of this gate is also the subject of `check-verb-register.ts`, and
// the whole §FIX-SYNC-GATE-UNDERSCOPED defect was ONE gate quietly holding a
// smaller idea of it than its siblings. So the sets are compared against that
// gate's GENERATED artefact — an independent source, not a transcribed number.
//
//   • register lists a verb this gate cannot see  → HARD FAILURE. Discovery has
//     narrowed again; that is the defect, and it must be loud.
//   • this gate sees a verb the register lacks    → NOTE. That means the
//     register is STALE, which `check-verb-register.ts` already hard-fails;
//     failing here too would just teach people to ignore one of the two.
//   • the artefact is absent                      → NOTE, same reason.
let registerVerbs: Set<string> | null = null;
const registerAbs = path.join(ROOT, REGISTER_PATH);
if (existsSync(registerAbs)) {
  const md = readFileSync(registerAbs, 'utf8');
  registerVerbs = new Set([...md.matchAll(/^\| `([a-z][\w.-]+)` \|/gm)].map(m => m[1]!));
}
if (registerVerbs === null || registerVerbs.size === 0) {
  notes.push(
    `S6 ${REGISTER_PATH} is absent or has no rows — the cross-gate agreement check ` +
    `did NOT run. This gate's handler set is therefore unverified against its sibling. ` +
    `Regenerate: npx tsx tools/ga-gate/check-verb-register.ts --write`,
  );
} else {
  const invisible = [...registerVerbs].filter(v => !handlerTypes.has(v)).sort();
  const unlisted = [...handlerTypes.keys()].filter(v => !registerVerbs!.has(v)).sort();
  if (invisible.length > 0) {
    failures.push(
      `S6 ${invisible.length} verb(s) are in ${REGISTER_PATH} but INVISIBLE to this gate's ` +
      `discovery: ${invisible.join(', ')}. A verb this gate cannot see is a verb it cannot ` +
      `hold to a sync declaration, so a PASS would cover a smaller set than the headline ` +
      `claims — §FIX-SYNC-GATE-UNDERSCOPED, recurring. Widen discovery; do NOT narrow the ` +
      `register.`,
    );
  }
  if (unlisted.length > 0) {
    notes.push(
      `S6 ${unlisted.length} verb(s) are visible here but absent from ${REGISTER_PATH}: ` +
      `${unlisted.join(', ')}. That is a STALE register — check-verb-register.ts hard-fails ` +
      `on it; regenerate with --write.`,
    );
  }
  if (invisible.length === 0 && unlisted.length === 0) {
    notes.push(
      `S6 handler sets AGREE with ${REGISTER_PATH}: ${handlerTypes.size} verb(s), both directions.`,
    );
  }
}

// ── Report ──────────────────────────────────────────────────────────────────
const declared = Object.values(SYNC_DISPOSITIONS);
const wired = declared.filter(d => d.kind === 'element-property').length;
const notSynced = declared.filter(d => d.kind === 'not-synced').length;
const lww = declared.filter(d => d.kind === 'element-property' && d.conflict === 'last-writer-wins').length;

const bar = '─'.repeat(78);
console.log(bar);
console.log('W5-3 §SYNC-DISPOSITION-DECLARED — every REGISTERED verb declares its sync fate');
console.log(bar);
console.log(`Handler files read                   : ${filesRead}  (floor ${MIN_FILES})`);
console.log(`Registered handler types found       : ${handlerTypes.size}  (floor ${MIN_HANDLER_TYPES})`);
console.log(`  …ALL of them must declare (S7)     : ${handlerTypes.size}  ← the RUNTIME's subject`);
console.log(`  …UNDECLARED, whole set             : ${undeclaredCount + undeclaredOtherCount}`);
console.log(`  …classified as property mutations  : ${propertyVerbs.length}  (floor ${MIN_PROPERTY_VERBS})`);
console.log(`     …of those, UNDECLARED (S1)      : ${undeclaredCount}`);
console.log(`  …NOT name-shaped as properties     : ${handlerTypes.size - propertyVerbs.length}`);
console.log(`     …of those, UNDECLARED (S7)      : ${undeclaredOtherCount}`);
console.log(`Declarations                         : ${declared.length}`);
console.log(`  …with a CRDT path (element-property): ${wired}  (${lww} declared last-writer-wins)`);
console.log(`  …declared NOT-SYNCED with a reason : ${notSynced}`);
console.log(bar);
console.log(
  'NOTE (C66 §1.1): "declared with a CRDT path" means the payload reaches the CRDT\n' +
  'document and a receiving document can read the property back. It does NOT mean a\n' +
  'receiving CLIENT re-renders. A read-back path now EXISTS (ElementSyncReader,\n' +
  '2026-08-11) but is UNPROVEN LIVE — proven in node against a store stand-in, never\n' +
  'in a browser. And it does NOT mean production replicates: no CRDT transport is\n' +
  'deployed (L-391), so two real users still do not see each other\'s edits. This\n' +
  'gate measures the document path only.\n' +
  '\n' +
  'SCOPE (§FIX-SYNC-GATE-UNDERSCOPED, closed 2026-08-11): discovery matches BOTH the\n' +
  'object-literal AND the class handler form, using check-verb-register.ts\'s regex\n' +
  'and evidence rule verbatim, and S6 above proves the two gates agree on the verb\n' +
  'set each run. The earlier draft matched object literals only and saw 19% of the\n' +
  'subject while printing this same ✓ line; that is why the floors are now set\n' +
  'against the real subject and why S6 exists. What is STILL not measured: a verb\n' +
  'whose `type` is assembled at runtime from a template literal (none known, none\n' +
  'findable by a source scan), and whether a declared element-property path is the\n' +
  'RIGHT mapping — S4 proves the subject key exists in the handler, not that the\n' +
  'remaining payload keys are genuinely properties of that element.',
);
for (const n of notes) console.log(`\n   ℹ ${n}`);

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} failure(s):\n`);
  for (const f of failures) console.error(`   • ${f}\n`);
  process.exit(1);
}
console.log(
  `\n✓ All ${handlerTypes.size} registered command types declare a sync disposition — the ` +
  `same subject\n  the runtime holds (S7), not just the ${propertyVerbs.length} whose NAME reads as a property mutation.\n`,
);
process.exit(0);
