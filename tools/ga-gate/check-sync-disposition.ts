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
 * Exit 0 → green. Exit 1 → HARD FAIL, merge blocked. Exit 2 → MISCONFIGURED
 * (the scan could not establish its own subject; see the minFiles floor).
 */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { walk, relPath, scanFiles } from './lib/sourceScan.js';
import {
  SYNC_DISPOSITIONS,
  type SyncDisposition,
} from '../../packages/sync-client/src/syncDisposition';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

/** Directories that register CommandBus handlers. */
const HANDLER_DIRS = ['plugins', 'apps/editor/src/engine', 'packages/command-registry/src'];

/**
 * ⚠ HONESTY FLOOR (lib/sourceScan.ts). A walk that reaches fewer files than this
 * has not established its subject and MUST NOT report a pass. It is a
 * misconfiguration detector — NEVER raise it to make the gate green.
 */
const MIN_FILES = 400;

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
// A handler is an object literal carrying BOTH `type:` and `affectedStores` —
// `CommandBus.register()` throws without the latter, so it is a reliable marker
// and cannot be satisfied by a passing mention of a command name in a comment.
// Tests are excluded: they fabricate handler types on purpose.
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
    // `type` before `affectedStores`, and the reverse ordering, both occur.
    for (const re of [
      /type:\s*'([A-Za-z0-9_.-]+)'[\s\S]{0,900}?affectedStores/g,
      /affectedStores[\s\S]{0,400}?type:\s*'([A-Za-z0-9_.-]+)'/g,
    ]) {
      for (const m of src.matchAll(re)) {
        if (!handlerTypes.has(m[1]!)) handlerTypes.set(m[1]!, rel);
      }
    }
  }
}

if (filesRead < MIN_FILES) {
  console.error(
    `\n[check-sync-disposition] MISCONFIGURED (exit 2) — the handler walk READ only ` +
    `${filesRead} file(s); floor is ${MIN_FILES}.\n` +
    `  Root: ${ROOT}\n  Dirs: ${HANDLER_DIRS.join(', ')}\n` +
    `  This is NOT a pass. A gate that enumerated no handlers has no property verbs\n` +
    `  to hold to a declaration, and reporting that as "all declared" is exactly the\n` +
    `  invisible-gap failure this gate exists to prevent.`,
  );
  process.exit(2);
}

const propertyVerbs = [...handlerTypes.keys()].filter(isPropertyVerb).sort();
if (propertyVerbs.length < 20) {
  console.error(
    `\n[check-sync-disposition] MISCONFIGURED (exit 2) — the walk read ${filesRead} files ` +
    `but classified only ${propertyVerbs.length} property verbs (expected ≥ 20).\n` +
    `  Either the handler-discovery regex or PROPERTY_VERB_RE stopped matching. A gate\n` +
    `  whose subject collapsed silently would report "all declared" over an empty set.`,
  );
  process.exit(2);
}

// ── S1 — declared or failing ────────────────────────────────────────────────
for (const type of propertyVerbs) {
  if (Object.prototype.hasOwnProperty.call(SYNC_DISPOSITIONS, type)) continue;
  failures.push(
    `S1 ${type} (${handlerTypes.get(type)}): a property-mutation command with NO sync ` +
    `disposition. Its payload does not reach the CRDT document, and nothing anywhere ` +
    `says so — a collaborator keeps the previous value, confidently. Declare it in ` +
    `packages/sync-client/src/syncDisposition.ts: either an { kind: 'element-property' } ` +
    `path, or { kind: 'not-synced', reason } saying why replication is wrong here.`,
  );
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

// ── Report ──────────────────────────────────────────────────────────────────
const declared = Object.values(SYNC_DISPOSITIONS);
const wired = declared.filter(d => d.kind === 'element-property').length;
const notSynced = declared.filter(d => d.kind === 'not-synced').length;
const lww = declared.filter(d => d.kind === 'element-property' && d.conflict === 'last-writer-wins').length;

const bar = '─'.repeat(78);
console.log(bar);
console.log('W5-3 §SYNC-DISPOSITION-DECLARED — every property verb declares its sync fate');
console.log(bar);
console.log(`Handler files read                   : ${filesRead}  (floor ${MIN_FILES})`);
console.log(`Registered handler types found       : ${handlerTypes.size}`);
console.log(`  …classified as property mutations  : ${propertyVerbs.length}`);
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
  '⚠ THIS GATE IS ITSELF UNDER-SCOPED (found 2026-08-11 by check-verb-register):\n' +
  'discovery matches the OBJECT-LITERAL handler form, but most handlers here are\n' +
  'CLASSES (`readonly type = \'...\'`), so it sees ~60 handler types where the chat\n' +
  'gate sees 321 — about 19% of the real set. Its own property-verb regex over the\n' +
  'full registered set finds 181 property verbs, 137 undeclared. The MIN floor of 20\n' +
  'cannot catch this, because 60 clears 20. Until discovery is widened, a PASS here\n' +
  'means "every property verb THIS GATE CAN SEE is declared" — a weaker claim than\n' +
  'the headline. Same defect check-chat-capability-coverage records in its own first\n' +
  'draft: "saw 102 of the ~300, confidently wrong."',
);
for (const n of notes) console.log(`\n   ℹ ${n}`);

if (failures.length > 0) {
  console.error(`\n✗ ${failures.length} failure(s):\n`);
  for (const f of failures) console.error(`   • ${f}\n`);
  process.exit(1);
}
console.log('\n✓ Every property-mutation command type declares its sync disposition.\n');
process.exit(0);
