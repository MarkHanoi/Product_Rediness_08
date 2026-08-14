#!/usr/bin/env tsx
// ─── GATE · check-conflict-surfacing  (C70 K-INV-2 · C08 §3.1/§3.3 · P8) ─────
//
// THE INVARIANT (C70 K-INV-2):
//   **Any merge discarding a user's authored state produces an explicit,
//     resolvable conflict artefact. No silent substitution.**
//
// BIM30-GAP-REGISTER row **CB-04** recorded, and left OPEN for want of an
// instrument:
//
//   "Conflict-surfacing has no gate at all. C70 K-INV-2 is unmeasured by
//    anything. `fb7cd4a0` ('the CRDT stops silently eating your edits')
//    addresses a loss mechanism, NOT the K-INV-2 conflict artefact."
//
// This gate is that instrument. It is the OTHER half of P8: `fb7cd4a0`
// (§RIVAL-MINT, YjsDocAdapter.ts) stopped disjoint properties being EATEN by a
// rival-container race; nothing measured whether a merge that legitimately
// discards one side's value SAYS SO. Convergence and disclosure are different
// facts and this repository has been bitten every time two different facts were
// allowed to print the same value (C75 §1.2).
//
// ─── WHAT IT COUNTS: REACHED BEHAVIOUR, NEVER ARTEFACTS ─────────────────────
// A gate that counts FILES can be satisfied by writing a file. So this one
// counts MERGES IT DROVE ITSELF. Every subject in the floor block below is a
// real `YjsDocAdapter` pair, a real `applyCommand` through the production
// `SYNC_DISPOSITIONS` table, a real `Y.encodeStateAsUpdate` → `applyUpdate`
// merge, and a real `onConflict` subscription. Nothing is inferred from source
// shape except ARM A's declaration audit, which is explicitly labelled static.
//
// The classes of the run are:
//   DISCARD   — after the merge, the two documents AGREE (they converged) and
//               the converged value is NOT the value one side authored. That
//               side's authored state was discarded. Measured, per property.
//   ARTEFACT  — that same side's `onConflict` handler received a `CRDTConflict`
//               naming exactly that (elementId, property).
//   SILENT    — DISCARD ∧ ¬ARTEFACT. This is the K-INV-2 violation, and it is
//               the finding class. Every one is NAMED
//               `<scenario>::<commandType>::<elementId>.<property>`.
//
// ─── THE FOUR ARMS ──────────────────────────────────────────────────────────
//
//   ARM A · DECLARATION AUDIT (static, and labelled so). Reads the production
//           `SYNC_DISPOSITIONS` table — imported, never re-typed from the
//           register's prose — and requires every `last-writer-wins`
//           declaration to carry an `lwwReason`. A property may be silently
//           converged BY DECLARATION; it may never be silently converged BY
//           OMISSION. An lww entry with no stated reason is a finding.
//
//   ARM B · EXECUTED MERGES (reached behaviour). For EVERY replicated
//           element-property disposition, three scenarios are DRIVEN:
//
//             S1 DIRECT      — two peers, partitioned, author DIFFERENT values
//                              for the same property; merge. The loser's value
//                              is discarded, so K-INV-2 demands an artefact.
//             S2 INTERVENING — identical to S1, except an UNRELATED third
//                              peer's edit reaches the loser FIRST. This is not
//                              an exotic case: it is what a hub topology does
//                              every time any other collaborator touches
//                              anything while your edit is in flight.
//             S3 AGREEING    — both peers author the SAME value. Nothing is
//                              discarded, so an artefact is NOT required and
//                              the correct reading is 0 findings. S3 is the
//                              CLEAN CORPUS: it is the state in which the SAME
//                              detector reads zero (control C3, L-716
//                              satisfiability).
//
//   ARM C · CONTROLS, executed every run, in BOTH directions (C70 §5.6). A
//           detector never watched going red publishes no verdict. Five
//           controls run before any finding is reported; a control failure
//           exits 2 MISCONFIGURED and is NEVER absorbable as debt. C2 is the
//           PLANTED SILENT MERGE: a genuinely-discarding merge on a property
//           the table declares `last-writer-wins`, driven through the same
//           detector, which must FLAG IT BY NAME. C3 is the clean corpus.
//
//   ARM D · SUBSCRIBER REACHABILITY (static). `emitConflict` fires handlers
//           registered through `onConflict`. If production registers none, the
//           artefact is emitted into a room with nobody in it and K-INV-2's
//           word RESOLVABLE is unmet however many conflicts fire. Counted from
//           source, comment-stripped, outside `packages/sync-client`.
//
// ─── THE FIRST HONEST READING (2026-08-14, this gate's own run) ─────────────
// S1 surfaces correctly for every disclosing disposition. **S2 does not.**
// `YjsDocAdapter._discloseOverwrittenLocalWrites` ends with
// `this._localPendingWrites.delete(docKey)` — it clears the WHOLE doc's pending
// bookkeeping after ANY merge, including edits that were still in flight and had
// not yet met their concurrent rival. The next merge discards them with nothing
// to compare against, so no artefact is emitted. The value is gone and the user
// is never told. That is precisely K-INV-2.
//
// This is a defect that PREDATES the gate: nothing measured it, so nobody chose
// it. It is therefore pinned in `tools/ga-gate/gate-newly-measured.json` with an
// exitCondition and a reviewBy, not on `gate-debt.json`.
//
// ─── EXIT CODES ─────────────────────────────────────────────────────────────
// Taken from the ONE shared contract, `../contract.js` — `reportGate`. This gate
// hand-rolls nothing. (`check-two-client-convergence.ts` DOES hand-roll its four
// constants inside this same directory; that is a standing finding under C70
// §7.2 and is not copied here.)
//
// ─── WHAT THIS GATE DOES NOT PROVE — named, never green ─────────────────────
// See the UNPROVEN block printed at the end of every run.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reportGate, type Floor, EXIT_MISCONFIGURED } from '../contract.js';
import { YjsDocAdapter, type CRDTConflict } from '@pryzm/sync-client';
import {
  SYNC_DISPOSITIONS,
  type SyncDisposition,
} from '../../../../packages/sync-client/src/syncDisposition.js';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const LEDGER_PATH = join(HERE, 'conflict-surfacing-ledger.json');

type Scenario = 'S1-DIRECT' | 'S2-INTERVENING' | 'S3-AGREEING';

interface MergeOutcome {
  /**
   * `<scenario>::<commandType>::<property>` — the stable key.
   *
   * The element id is deliberately NOT in it. Ids here are harness-local
   * (`cs-r17`) and their ordinal shifts the moment a disposition is added to the
   * production table, which would re-key every ledger row below it and turn a
   * one-line table edit into a suite-wide stale-ledger failure. What the ledger
   * declares is a MERGE PATH, not an element.
   */
  key: string;
  scenario: Scenario;
  commandType: string;
  property: string;
  /** the two docs agree after the merge */
  converged: boolean;
  /** the converged value is not what the losing side authored */
  discarded: boolean;
  /** the losing side received a CRDTConflict naming this (element, property) */
  artefact: boolean;
}

interface Ledger {
  gate: string;
  note: string;
  silentMerges: { key: string; why: string }[];
}

// ── The driver — real adapters, real merges ─────────────────────────────────

const PROBE_PROP = 'probeSurfacing';

/**
 * Build the payload the production table expects for `d`, carrying exactly one
 * probe property. The SHAPE is derived from the disposition itself (subject key,
 * `nested` bag) rather than guessed per command — a hand-written payload per
 * verb is how a harness quietly stops replicating and reports "no divergence".
 */
function payloadFor(d: Extract<SyncDisposition, { kind: 'element-property' }>,
                    elementId: string, value: unknown): Record<string, unknown> {
  const props: Record<string, unknown> = { [PROBE_PROP]: value };
  if (d.nested !== undefined) return { [d.subject]: elementId, [d.nested]: props };
  return { [d.subject]: elementId, ...props };
}

/** A conflict sink that records (elementId, property) pairs it was told about. */
function sink(adapter: YjsDocAdapter): Set<string> {
  const seen = new Set<string>();
  adapter.onConflict((c: CRDTConflict) => seen.add(`${c.elementId}.${c.property}`));
  return seen;
}

/**
 * Drive ONE merge scenario for ONE disposition and report what actually
 * happened. No assertion here — the caller classifies.
 *
 * Y.Map resolves concurrent per-key writes in favour of the HIGHER clientID, so
 * the peers are ordered before the run and `LOSER` is the one whose authored
 * value the CRDT will discard. Discovering the loser rather than assuming it is
 * what stops this arm from silently measuring the winner and reading clean.
 */
function driveScenario(
  commandType: string,
  d: Extract<SyncDisposition, { kind: 'element-property' }>,
  scenario: Scenario,
  room: string,
): MergeOutcome | { misconfigured: string } {
  const elementId = `cs-${room}`;
  let loser = new YjsDocAdapter(room);
  let winner = new YjsDocAdapter(room);
  if (loser.doc.clientID > winner.doc.clientID) { const t = loser; loser = winner; winner = t; }
  const third = new YjsDocAdapter(room);

  const loserSaw = sink(loser);

  // A COMMON BASE, so both peers hold the element before they diverge. Without
  // it the "divergence" would be two first-touches and the run would be
  // measuring creation, not merge.
  loser.applyCommand(commandType, payloadFor(d, elementId, 'base'));
  const base = loser.encodeStateAsUpdate();
  winner.applyUpdate(base);
  third.applyUpdate(base);
  // The base write is now common knowledge; whatever it left pending has met
  // its exchange. Clear the record so only the divergence below is measured.
  loserSaw.clear();

  const loserValue = 'authored-by-loser';
  const winnerValue = scenario === 'S3-AGREEING' ? loserValue : 'authored-by-winner';

  loser.applyCommand(commandType, payloadFor(d, elementId, loserValue));
  winner.applyCommand(commandType, payloadFor(d, elementId, winnerValue));

  if (scenario === 'S2-INTERVENING') {
    // An UNRELATED third peer touches a DIFFERENT property of the same element,
    // and its update reaches the loser BEFORE the rival edit does. Nothing about
    // this is exotic: it is what any hub topology does when a second
    // collaborator is active while your edit is in flight.
    //
    // It touches a DIFFERENT PROPERTY KEY (`unrelatedProbe`) and never
    // `PROBE_PROP`. That is load-bearing, and this gate's first draft got it
    // wrong: an intervening edit that writes the SAME property is itself a rival
    // and discloses on arrival, which masked the defect on 66 of 103
    // dispositions and would have published a SMALLER number than the one that
    // exists. The intervening peer must be genuinely unrelated.
    const unrelated: Record<string, unknown> = d.nested !== undefined
      ? { [d.subject]: elementId, [d.nested]: { unrelatedProbe: 'x' } }
      : { [d.subject]: elementId, unrelatedProbe: 'x' };
    third.applyCommand(commandType, unrelated);
    loser.applyUpdate(third.encodeStateAsUpdate());
  }

  loser.applyUpdate(winner.encodeStateAsUpdate());
  winner.applyUpdate(loser.encodeStateAsUpdate());

  const onLoser = loser.readElementProperty(elementId, PROBE_PROP);
  const onWinner = winner.readElementProperty(elementId, PROBE_PROP);
  if (onLoser === undefined || onWinner === undefined) {
    return {
      misconfigured:
        `${commandType}/${scenario}: the probe property never reached the document ` +
        `(loser=${String(onLoser)}, winner=${String(onWinner)}) — this disposition replicated ` +
        'nothing, so no verdict about its merge behaviour can be published.',
    };
  }

  const converged = JSON.stringify(onLoser) === JSON.stringify(onWinner);
  const discarded = converged && JSON.stringify(onLoser) !== JSON.stringify(loserValue);
  const artefact = loserSaw.has(`${elementId}.${PROBE_PROP}`);

  return {
    key: `${scenario}::${commandType}::${PROBE_PROP}`,
    scenario, commandType, property: PROBE_PROP,
    converged, discarded, artefact,
  };
}

/** SILENT = the merge discarded authored state and nobody was told. */
function isSilent(o: MergeOutcome): boolean { return o.discarded && !o.artefact; }

// ── ARM D · subscriber reachability, from source ────────────────────────────

function stripCommentsAndStrings(src: string): string {
  const out = src.split('');
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  while (i < src.length) {
    const c = src[i], dd = src[i + 1];
    if (c === '/' && dd === '/') { let j = i; while (j < src.length && src[j] !== '\n') j++; blank(i, j); i = j; continue; }
    if (c === '/' && dd === '*') { const j = src.indexOf('*/', i + 2); const end = j < 0 ? src.length : j + 2; blank(i, end); i = end; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length) { if (src[j] === '\\') { j += 2; continue; } if (src[j] === c) break; j++; }
      blank(i + 1, j); i = Math.min(j + 1, src.length); continue;
    }
    i++;
  }
  return out.join('');
}

function walk(dir: string, acc: string[]): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist' || e === '.git' || e === 'build') continue;
    const p = join(dir, e);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, acc);
    else if ((e.endsWith('.ts') || e.endsWith('.tsx')) && !e.endsWith('.d.ts')) acc.push(p);
  }
  return acc;
}

interface Subscriber { relPath: string; line: number }

function findSubscribers(): { subs: Subscriber[]; scanned: number } {
  const files: string[] = [];
  for (const r of ['packages', 'apps', 'plugins', 'src']) {
    const dpath = join(REPO, r);
    if (existsSync(dpath)) walk(dpath, files);
  }
  const subs: Subscriber[] = [];
  for (const abs of files) {
    const rel = relative(REPO, abs).split(sep).join('/');
    // The DECLARING package is not a subscriber to itself.
    if (rel.startsWith('packages/sync-client/')) continue;
    if (rel.includes('__tests__') || rel.includes('.test.') || rel.includes('.spec.')) continue;
    let raw: string;
    try { raw = readFileSync(abs, 'utf8'); } catch { continue; }
    if (!raw.includes('onConflict')) continue;
    const src = stripCommentsAndStrings(raw);
    const re = /\.\s*onConflict\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      subs.push({ relPath: rel, line: src.slice(0, m.index).split('\n').length });
    }
  }
  return { subs, scanned: files.length };
}

// ── ARM C · controls ────────────────────────────────────────────────────────

/** A disclosing disposition used as the canary. Verified to exist by C0. */
const CANARY = 'wall.updateDimensions';
/** A disposition the table itself declares `last-writer-wins`. C2 plants here. */
function firstLwwType(): string | undefined {
  for (const [t, d] of Object.entries(SYNC_DISPOSITIONS)) {
    if (d.kind === 'element-property' && d.conflict === 'last-writer-wins') return t;
  }
  return undefined;
}

function runControls(): { ok: boolean; lines: string[]; ran: number } {
  const out: string[] = [];
  let ok = true;
  let ran = 0;
  const check = (name: string, pass: boolean, detail: string) => {
    ran++;
    out.push(`  ${pass ? '✓' : '❌'} ${name} — ${detail}`);
    if (!pass) ok = false;
  };

  // C0 — the SUBJECT exists. The table is imported, so a rename that emptied it
  //      would otherwise read as "no silent merges" over nothing.
  const canary = SYNC_DISPOSITIONS[CANARY];
  const lwwType = firstLwwType();
  check('C0 subject exists',
    canary !== undefined && canary.kind === 'element-property' &&
    canary.conflict === 'disclose' && lwwType !== undefined,
    `canary '${CANARY}' is ${canary?.kind ?? 'ABSENT'}/${(canary as { conflict?: string })?.conflict ?? '—'} (want element-property/disclose) · ` +
    `a declared last-writer-wins entry exists: ${lwwType ?? 'NONE'}`);
  if (!ok) return { ok, lines: out, ran };

  const cd = canary as Extract<SyncDisposition, { kind: 'element-property' }>;

  // C1 POSITIVE, watched GREEN — the detector sees an artefact when one is
  //    emitted. S1 on the canary: the loser's value IS discarded AND the
  //    production disclosure path DOES fire.
  const c1 = driveScenario(CANARY, cd, 'S1-DIRECT', 'ctl-c1');
  const c1ok = !('misconfigured' in c1) && c1.converged && c1.discarded && c1.artefact;
  check('C1 positive (artefact seen)', c1ok,
    'misconfigured' in c1 ? c1.misconfigured
      : `S1/${CANARY}: converged=${c1.converged} discarded=${c1.discarded} artefact=${c1.artefact} (want true/true/true)`);

  // C2 PLANTED SILENT MERGE, watched RED BY NAME (C70 §5.6) — a genuinely
  //    discarding merge on a property the table declares last-writer-wins emits
  //    NOTHING by design. The detector must not merely count it: it must NAME
  //    it. A detector that cannot produce the key is a detector whose zero
  //    means nothing.
  const lwwDisp = SYNC_DISPOSITIONS[lwwType!] as Extract<SyncDisposition, { kind: 'element-property' }>;
  const c2 = driveScenario(lwwType!, lwwDisp, 'S1-DIRECT', 'ctl-c2');
  const c2ok = !('misconfigured' in c2) && c2.discarded && !c2.artefact && isSilent(c2) &&
    c2.key === `S1-DIRECT::${lwwType!}::${PROBE_PROP}`;
  check('C2 planted silent merge FLAGGED BY NAME', c2ok,
    'misconfigured' in c2 ? c2.misconfigured
      : `planted on declared-lww '${lwwType}': discarded=${c2.discarded} artefact=${c2.artefact} ` +
        `silent=${isSilent(c2)} key='${c2.key}' (want discarded/no-artefact/silent and the exact key)`);

  // C3 CLEAN CORPUS reads 0 (L-716 satisfiability) — the SAME detector over a
  //    corpus with nothing to disclose must report zero silent merges, so a
  //    state in which this gate exits 0 demonstrably exists.
  const c3 = driveScenario(CANARY, cd, 'S3-AGREEING', 'ctl-c3');
  const c3ok = !('misconfigured' in c3) && c3.converged && !c3.discarded && !isSilent(c3);
  check('C3 clean corpus → 0 (satisfiability)', c3ok,
    'misconfigured' in c3 ? c3.misconfigured
      : `S3/${CANARY}: converged=${c3.converged} discarded=${c3.discarded} silent=${isSilent(c3)} (want true/false/false)`);

  // C4 THE DISCARD DETECTOR IS NOT VACUOUS. A "no discard" reading must come
  //    from the values agreeing with the author, never from the probe never
  //    landing. Both directions in one comparison.
  const c4ok = c1ok && c3ok && !('misconfigured' in c1) && !('misconfigured' in c3) &&
    c1.discarded !== c3.discarded;
  check('C4 discard detector both directions', c4ok,
    `divergent merge discarded=${('misconfigured' in c1) ? '—' : c1.discarded}, ` +
    `agreeing merge discarded=${('misconfigured' in c3) ? '—' : c3.discarded} (want true and false)`);

  // C5 THE SINK IS NOT DEAF. C1 proved it hears; this proves silence is a real
  //    observation and not an unsubscribed handler: the same run's S3 sink saw
  //    nothing while C1's saw something, from identical wiring.
  check('C5 sink discriminates', c1ok && !('misconfigured' in c3) && c3.artefact === false,
    `artefact on divergent=${('misconfigured' in c1) ? '—' : c1.artefact}, ` +
    `on agreeing=${('misconfigured' in c3) ? '—' : c3.artefact} (want true and false)`);

  return { ok, lines: out, ran };
}

// ── main ────────────────────────────────────────────────────────────────────

function main(): number {
  const lines: string[] = [];

  // ARM C first: a gate whose detector is unverified publishes no verdict.
  lines.push('ARM C — CONTROLS (executed this run, both directions · C70 §5.6, L-716):');
  const ctl = runControls();
  lines.push(...ctl.lines);
  if (!ctl.ok) {
    console.log('\n── check-conflict-surfacing ──────────────────────────────');
    for (const l of lines) console.log('   ' + l);
    console.log('   → [2] MISCONFIGURED — a control failed. The detector is not trustworthy, so no verdict is published. NEVER absorbable as debt.');
    return EXIT_MISCONFIGURED;
  }
  lines.push('');

  // ARM A — declaration audit (STATIC, and labelled).
  const elementProps = Object.entries(SYNC_DISPOSITIONS)
    .filter(([, d]) => d.kind === 'element-property') as
      [string, Extract<SyncDisposition, { kind: 'element-property' }>][];
  const notSynced = Object.entries(SYNC_DISPOSITIONS).filter(([, d]) => d.kind === 'not-synced');
  const disclosing = elementProps.filter(([, d]) => d.conflict === 'disclose');
  const lww = elementProps.filter(([, d]) => d.conflict === 'last-writer-wins');
  const undeclaredLww = lww.filter(([, d]) =>
    typeof d.lwwReason !== 'string' || d.lwwReason.trim().length < 20);

  lines.push('ARM A — DECLARATION AUDIT (static; the production table, imported, never re-typed):');
  lines.push(`  ${Object.keys(SYNC_DISPOSITIONS).length} declared command type(s) — ${elementProps.length} replicated element-property, ${notSynced.length} not-synced.`);
  lines.push(`  conflict policy: ${disclosing.length} disclose · ${lww.length} last-writer-wins.`);
  for (const [t, d] of lww) {
    const okReason = typeof d.lwwReason === 'string' && d.lwwReason.trim().length >= 20;
    lines.push(`  ${okReason ? '·' : '⛔'} ${t} — last-writer-wins, reason ${okReason ? 'STATED' : 'MISSING'}`);
  }
  lines.push('  a property may be silently converged BY DECLARATION; never BY OMISSION.');
  lines.push('');

  // ARM B — executed merges over every replicated disposition.
  lines.push('ARM B — EXECUTED MERGES (real YjsDocAdapter pairs, real applyCommand/applyUpdate — reached behaviour, not files):');
  const outcomes: MergeOutcome[] = [];
  const unreplicated: string[] = [];
  const scenarios: Scenario[] = ['S1-DIRECT', 'S2-INTERVENING', 'S3-AGREEING'];
  let n = 0;
  for (const [t, d] of disclosing) {
    for (const s of scenarios) {
      const r = driveScenario(t, d, s, `r${n++}`);
      if ('misconfigured' in r) { unreplicated.push(r.misconfigured); continue; }
      outcomes.push(r);
    }
  }

  const drove = outcomes.length;
  const discards = outcomes.filter(o => o.discarded);
  const artefacts = outcomes.filter(o => o.artefact);
  const silent = outcomes.filter(isSilent);
  const byScenario = (s: Scenario) => outcomes.filter(o => o.scenario === s);

  for (const s of scenarios) {
    const set = byScenario(s);
    const dsc = set.filter(o => o.discarded).length;
    const sil = set.filter(isSilent).length;
    lines.push(`  ${sil === 0 ? '·' : '⛔'} ${s}: ${set.length} merge(s) driven · ${dsc} discarded authored state · ${set.filter(o => o.artefact).length} produced an artefact · ${sil} SILENT`);
  }
  if (unreplicated.length > 0) {
    lines.push(`  ⚠ ${unreplicated.length} disposition(s) replicated no probe property and were NOT scored (named below, never folded into a clean count):`);
    for (const u of unreplicated.slice(0, 8)) lines.push(`     ◌ ${u}`);
  }
  lines.push('');

  // ARM D — subscriber reachability.
  const { subs, scanned } = findSubscribers();
  lines.push('ARM D — SUBSCRIBER REACHABILITY (static): an artefact emitted to nobody is not RESOLVABLE.');
  lines.push(`  ${subs.length} production \`onConflict(\` subscription site(s) outside packages/sync-client, across ${scanned} scanned file(s):`);
  for (const s of subs) lines.push(`  · ${s.relPath}:${s.line}`);
  if (subs.length === 0) {
    lines.push('  ⛔ NONE. `emitConflict` fires into an empty handler set — K-INV-2\'s word RESOLVABLE is unmet however many conflicts are emitted.');
  }
  lines.push('');

  // ── Findings ─────────────────────────────────────────────────────────────
  const findings: { key: string; why: string }[] = [];
  for (const o of silent) {
    findings.push({ key: o.key, why: `${o.scenario}: the merge discarded the loser's authored value and emitted no CRDTConflict naming ${o.property}` });
  }
  for (const [t] of undeclaredLww) {
    findings.push({ key: `UNDECLARED-LWW::${t}`, why: 'declared last-writer-wins with no lwwReason — silent convergence by omission' });
  }
  if (subs.length === 0) {
    findings.push({ key: 'NO-SUBSCRIBER::onConflict', why: 'no production onConflict subscriber — the artefact reaches no user' });
  }

  // ── The ledger, both directions ──────────────────────────────────────────
  let ledger: Ledger | null = null;
  try { ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8')) as Ledger; } catch { ledger = null; }
  const declaredKeys = new Set((ledger?.silentMerges ?? []).map(r => r.key));
  const measuredKeys = new Set(findings.map(f => f.key));
  const stale: string[] = [];

  lines.push(`FINDINGS: ${findings.length} against a NAMED ledger of ${ledger?.silentMerges.length ?? 0}.`);
  for (const f of findings) {
    lines.push(`  ${declaredKeys.has(f.key) ? '·' : '⛔ UNLEDGERED'} ${f.key} — ${f.why}`);
  }
  for (const r of ledger?.silentMerges ?? []) {
    if (!measuredKeys.has(r.key)) {
      stale.push(r.key);
      lines.push(`  ⚠ STALE LEDGER ROW: "${r.key}" is declared silent but is no longer measured that way — strike it in the commit that fixes it (C70 §5.4).`);
    }
  }
  lines.push('');
  lines.push('UNPROVEN — named, never green:');
  lines.push('  ◌ THE WIRE IS SIMULATED. Updates cross by Y.encodeStateAsUpdate/applyUpdate, not a socket. Latency, reordering, loss and server linearisation are NOT measured. `tools/ga-gate/check-collab-graph-integrity.ts` owns the transport question.');
  lines.push('  ◌ THE STORE LEG IS NOT MEASURED HERE. This gate reads the CRDT document. Whether the disclosed value reaches the authoritative store is `check-two-client-convergence`\'s subject.');
  lines.push('  ◌ THE ARTEFACT IS COUNTED, NOT ITS QUALITY. That a CRDTConflict names the element and property is measured; that the DIALOG renders it, that a user can act on it, and that acting restores the value are NOT.');
  lines.push('  ◌ ONE PROBE PROPERTY PER DISPOSITION. Real payloads carry many properties and real conflicts may be multi-property; a per-property loss inside a multi-property merge is out of scope.');
  lines.push('  ◌ STRUCTURAL LOSS IS OUT OF SCOPE. This measures per-key scalar convergence. Deletes, array reorderings and the §RIVAL-MINT container race (closed by fb7cd4a0) are different mechanisms.');
  lines.push('  ◌ ARM D IS NAME-SHAPED. A subscriber registered through an alias or a wrapper not spelled `.onConflict(` is invisible to it.');

  const floors: Floor[] = [
    { what: 'replicated element-property dispositions (the SUBJECT)', measured: elementProps.length, min: 100 },
    { what: 'merges DRIVEN end-to-end (reached behaviour)', measured: drove, min: 300 },
    { what: 'merges that genuinely DISCARDED authored state', measured: discards.length, min: 100 },
    { what: 'conflict artefacts observed (the detector is not deaf)', measured: artefacts.length, min: 50 },
    { what: 'source files scanned for onConflict subscribers', measured: scanned, min: 500 },
    { what: 'controls proven in-run, both directions', measured: ctl.ran, min: 6 },
  ];

  return reportGate({
    gate: 'check-conflict-surfacing (C70 K-INV-2 · C08 §3.1/§3.3 · P8 · CB-04)',
    floors,
    lines,
    findings: findings.length,
    declared: ledger?.silentMerges.length ?? 0,
    findingNames: findings.map(f => f.key),
    stale,
  });
}

process.exit(main());
