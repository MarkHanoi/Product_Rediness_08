#!/usr/bin/env tsx
/**
 * tools/rac-conformance/probe-categories-1-5.ts — THE SCORECARD, categories 1–5.
 *
 * Answers the founder's question — "can PRYZM RELIABLY do this?" — for the ~53
 * named operations in PROJECT/STRUCTURE, WALLS, OPENINGS, SLABS and ROOFS, as
 * SEVEN INDEPENDENT VERDICTS each. "It worked" is seven different claims;
 * collapsing them is the defect the 2026-08-11 audit named repeatedly.
 *
 * The seven verdicts, the PASS/FAIL/UNPROVEN discipline and the shared ladder
 * are documented in `./ladder.ts`. This file adds only:
 *   • the operation table (`./operations-1-5.ts`) — real sentences, not intents
 *   • payload assertions, so V2 is "the right command WITH the right numbers"
 *   • paraphrase robustness, because "reliably" is not one sentence
 *   • the adversarial pass, because a read-only question must never mutate
 *
 * WHAT THIS PROCESS CANNOT REACH, stated once so it is never re-litigated per
 * row: V3–V6 need a live runtime. `composeRuntime()` (P1) wires renderer,
 * persistence client and sync against the DOM/WebGL, and the authoritative
 * element stores are reached through it. There is no headless composition root,
 * so every V3–V6 cell is UNPROVEN with that reason — never PASS, never FAIL.
 * The exact product-side diff that would close it is handed over in the
 * scorecard document, not applied here.
 *
 * Re-run:
 *   npx tsx tools/rac-conformance/probe-categories-1-5.ts          # markdown
 *   npx tsx tools/rac-conformance/probe-categories-1-5.ts --json   # machine
 *   npx tsx tools/rac-conformance/probe-geometry.ts                # cat-5 mm
 * Exit code is always 0: this is a MEASUREMENT, not a gate. A red row is the
 * deliverable, and a harness that fails CI would be pressured into going green.
 */

import { OPERATIONS, ADVERSARIAL, type OperationRow } from './operations-1-5.js';
import {
  ladder, ctx, sel, STUB_SCOPE, intentOf, mutates, commandTypesOf,
  type Verdict, type ZeroTokenResolution,
} from './ladder.js';
import { allChatCapabilities } from '../../packages/ai-host/src/capabilities/ChatCapabilityRegistry.js';
import { CHAT_CLASSIFIED } from '../../packages/ai-host/src/capabilities/ChatCommandClassification.js';

const CAP_IDS = new Set(allChatCapabilities().map((c) => c.id));

/** The ONE reason string for every runtime-gated cell — written once so it can
 *  never quietly decay into a weaker, per-row excuse. */
const NO_RUNTIME =
  'V3–V6 need a live runtime: composeRuntime() requires DOM/WebGL, so the authoritative store, the serializer and the sync doc are all unreachable from Node';

interface Cell { readonly v: Verdict; readonly why?: string }
type Key = 'V1' | 'V2' | 'V3' | 'V4' | 'V5' | 'V6' | 'V7';
interface Scored {
  readonly row: OperationRow;
  readonly utterance: string;
  readonly observed: string;
  readonly v: Record<Key, Cell>;
}

/** Payloads, with values — `commandTypesOf` deliberately drops them, and V2 is
 *  "the right command carrying the right NUMBERS", not merely the right verb. */
function payloadsOf(r: ZeroTokenResolution): Record<string, unknown>[] {
  return r.kind === 'commands'
    ? (r.commands as readonly { payload?: Record<string, unknown> }[]).map((c) => ({ ...(c.payload ?? {}) }))
    : [];
}

/** Full transcript line, payloads included. */
function describeFull(r: ZeroTokenResolution): string {
  switch (r.kind) {
    case 'commands':
      return `commands[tier ${String((r as { tier?: unknown }).tier)}] intent=${r.intent} → ` +
        (r.commands as readonly { type?: string; payload?: unknown }[])
          .map((c) => `${c.type}(${JSON.stringify(c.payload)})`).join(' + ');
    case 'local':
      return `local intent=${r.intent} action=${String((r as { action?: unknown }).action)}`;
    case 'refusal':
      return `refusal intent=${r.intent} :: ${refusalText(r)}`;
    default:
      return 'MISS — no rung of the deterministic ladder resolved it';
  }
}

/** The refusal's user-facing text. The type calls it `reason`; older shapes
 *  used `message`. Both are read, because scoring V7 on the WRONG field would
 *  silently mark every refusal generic. */
function refusalText(r: ZeroTokenResolution): string {
  const o = r as unknown as { reason?: string; message?: string };
  return o.reason ?? o.message ?? '';
}

function contextFor(row: OperationRow) {
  return ctx(
    (row.selection ?? []).flatMap((k, i) => sel(k, 1).map((s) => ({ ...s, elementId: `rac-${k}-${i}` }))),
    row.scoped === true ? STUB_SCOPE : undefined,
  );
}

function payloadMismatch(row: OperationRow, payloads: Record<string, unknown>[]): string | null {
  const want = row.expectPayload;
  if (want === undefined || Object.keys(want).length === 0) return null;
  for (const [k, expected] of Object.entries(want)) {
    const found = payloads.map((p) => p[k]).find((v) => v !== undefined);
    if (found === undefined) return `payload carries no "${k}" — got ${JSON.stringify(payloads)}`;
    if (expected instanceof RegExp) {
      if (!expected.test(String(found))) return `payload.${k}=${JSON.stringify(found)} does not match ${String(expected)}`;
    } else if (typeof expected === 'number') {
      if (typeof found !== 'number' || Math.abs(found - expected) > 1e-6) {
        return `payload.${k}=${JSON.stringify(found)}, expected ${expected}`;
      }
    } else if (found !== expected) {
      return `payload.${k}=${JSON.stringify(found)}, expected ${JSON.stringify(expected)}`;
    }
  }
  return null;
}

function score(row: OperationRow): Scored {
  const utt = row.utterances[0]!;

  if (utt.startsWith('(no utterance')) {
    const u: Cell = { v: 'UNPROVEN', why: 'a save/reload cycle, not an utterance — nothing for the resolver to do' };
    const rt: Cell = { v: 'UNPROVEN', why: NO_RUNTIME };
    return { row, utterance: utt, observed: 'n/a — persistence cycle', v: { V1: u, V2: u, V3: rt, V4: rt, V5: rt, V6: rt, V7: u } };
  }

  const r = ladder(utt, contextFor(row));
  const observed = describeFull(r);
  const got = intentOf(r);
  const types = commandTypesOf(r);

  let V1: Cell;
  let V2: Cell;

  if (row.expectRefusal === true) {
    // A refusal is the CORRECT answer. A dispatch is the failure.
    if (r.kind === 'refusal') {
      V1 = { v: 'PASS', why: 'refused, as required' };
      V2 = { v: 'PASS', why: 'no command dispatched' };
    } else if (r.kind === 'miss') {
      V1 = { v: 'UNPROVEN', why: 'the ladder MISSED rather than refusing — non-mutating (safe), but the user gets no refusal code, so we cannot say the system KNOWS this is impossible (C68 §5.g)' };
      V2 = { v: 'PASS', why: 'no command dispatched' };
    } else {
      V1 = { v: 'FAIL', why: `must refuse; instead produced ${r.kind}` };
      V2 = { v: 'FAIL', why: `dispatched ${types.join(', ') || r.kind} for an ask that has no valid answer — this is silent substitution` };
    }
  } else if (row.expectCapability === null) {
    // NOT-OFFERED row. A miss/refusal is HONEST; a dispatch would be a lie.
    if (r.kind === 'miss') {
      V1 = { v: 'FAIL', why: 'NOT OFFERED — no capability resolves this operation at all' };
      V2 = { v: 'FAIL', why: 'no bus command is reachable by sentence' };
    } else if (r.kind === 'refusal') {
      V1 = { v: 'FAIL', why: `NOT OFFERED — refused: ${JSON.stringify(refusalText(r).slice(0, 100))}` };
      V2 = { v: 'FAIL', why: 'refused; no dispatch' };
    } else {
      V1 = { v: 'FAIL', why: `MIS-RESOLVE — nothing should claim this ask, but "${got}" did. A capability answering an ask it cannot perform is the ElementCapabilities lie (C68 §2.2)` };
      V2 = { v: 'FAIL', why: `dispatched ${types.join(', ')} for an operation with no route` };
    }
  } else if (got !== row.expectCapability) {
    V1 = { v: 'FAIL', why: r.kind === 'miss'
      ? `expected "${row.expectCapability}", got a MISS — the sentence is not in the grammar`
      : `expected "${row.expectCapability}", got "${got}" (${r.kind}) — a RIVAL grammar captured the utterance` };
    V2 = { v: 'FAIL', why: 'V1 failed — dispatch is not assessable against the intended command' };
  } else if (r.kind === 'refusal') {
    V1 = { v: 'PASS', why: 'landed on the intended capability' };
    V2 = { v: 'FAIL', why: `right capability, but it REFUSED: ${JSON.stringify(refusalText(r).slice(0, 100))}` };
  } else {
    V1 = { v: 'PASS' };
    if (row.expectBusCommand === null) {
      V2 = r.kind === 'local'
        ? { v: 'PASS', why: 'local action — no bus command by design' }
        : { v: 'FAIL', why: `expected a local action, got commands ${types.join(', ')}` };
    } else if (!types.includes(row.expectBusCommand)) {
      V2 = { v: 'FAIL', why: `expected "${row.expectBusCommand}", dispatched ${types.length > 0 ? types.join(', ') : `kind=${r.kind}`}` };
    } else {
      const bad = payloadMismatch(row, payloadsOf(r));
      V2 = bad === null ? { v: 'PASS' } : { v: 'FAIL', why: bad };
    }
  }

  // V3–V6. Where there is no route at all there is also nothing to observe —
  // that is a DIFFERENT unprovenness from "we lack a runtime", and saying so
  // keeps "not built" and "not measured" apart.
  const noRoute = row.expectCapability === null && row.expectRefusal !== true && V1.v === 'FAIL';
  const runtime: Cell = noRoute
    ? { v: 'UNPROVEN', why: 'nothing to observe — the operation has no route, so there is no state change to verify' }
    : { v: 'UNPROVEN', why: NO_RUNTIME };

  // V7 is scoreable ONLY where the ladder itself IS the transcript.
  let V7: Cell;
  if (r.kind === 'refusal') {
    const text = refusalText(r);
    const concrete = /\d/.test(text) || /\b(wall|door|window|slab|roof|level|ceiling|room|select)/i.test(text);
    V7 = text.length === 0
      ? { v: 'FAIL', why: 'refusal carries NO user-facing text at all' }
      : concrete
        ? { v: 'PASS', why: 'refusal names the concrete thing it refused over' }
        : { v: 'FAIL', why: 'refusal text is generic — it names no value and no code (C68 §5.g)' };
  } else if (r.kind === 'miss') {
    V7 = { v: 'FAIL', why: 'a MISS yields the "I\'m not sure how to help with that yet" answer — it does not distinguish "not built" from "misunderstood", which IS the c1902a5a user experience (C68 §2.1)' };
  } else {
    V7 = { v: 'UNPROVEN', why: 'the success sentence is read off the command\'s runtime report — ' + NO_RUNTIME };
  }

  return { row, utterance: utt, observed, v: { V1, V2, V3: runtime, V4: runtime, V5: runtime, V6: runtime, V7 } };
}

/** "Reliably" is not one sentence. Every declared paraphrase is driven. */
function paraphrase(row: OperationRow): { total: number; agreeing: number; detail: string[] } {
  const detail: string[] = [];
  let agreeing = 0;
  const alts = row.utterances.filter((u) => !u.startsWith('(no utterance'));
  for (const u of alts) {
    const r = ladder(u, contextFor(row));
    const ok = row.expectRefusal === true
      ? !mutates(r)
      : row.expectCapability === null
        ? false
        : intentOf(r) === row.expectCapability && r.kind !== 'refusal';
    if (ok) agreeing += 1;
    else detail.push(`  - \`${u}\` → ${describeFull(r)}`);
  }
  return { total: alts.length, agreeing, detail };
}

// ─── Run ─────────────────────────────────────────────────────────────────────
const scored = OPERATIONS.map(score);
const adversarial = ADVERSARIAL.map((a) => {
  const r = ladder(a.utterance, ctx(sel('wall')));
  return { ...a, mutated: mutates(r), observed: describeFull(r) };
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({
    generated: new Date().toISOString().slice(0, 10),
    capabilities: CAP_IDS.size,
    classifiedUnchatted: Object.keys(CHAT_CLASSIFIED).length,
    operations: scored.map((s) => ({ id: s.row.id, category: s.row.category, name: s.row.name, utterance: s.utterance, observed: s.observed, authoritative: s.row.authoritative, verdicts: s.v })),
    adversarial,
  }, null, 1));
} else {
  const V = (c: Cell) => (c.v === 'PASS' ? 'PASS' : c.v === 'FAIL' ? 'FAIL' : 'UNPR');
  console.log('## Scorecard — categories 1–5, seven verdicts each\n');
  console.log('| # | operation | utterance driven | V1 | V2 | V3 | V4 | V5 | V6 | V7 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|');
  for (const s of scored) {
    console.log(`| ${s.row.id} | ${s.row.name} | \`${s.utterance.replace(/\|/g, '\\|')}\` | ${V(s.v.V1)} | ${V(s.v.V2)} | ${V(s.v.V3)} | ${V(s.v.V4)} | ${V(s.v.V5)} | ${V(s.v.V6)} | ${V(s.v.V7)} |`);
  }

  console.log('\n## Every non-PASS cell that is not simply "no runtime", with its reason\n');
  for (const s of scored) {
    const bad = (Object.entries(s.v) as [Key, Cell][]).filter(([, c]) => c.v !== 'PASS' && c.why !== NO_RUNTIME);
    if (bad.length === 0) continue;
    console.log(`\n### ${s.row.id} — ${s.row.name}\n`);
    console.log(`- **utterance**: \`${s.utterance}\``);
    console.log(`- **observed**: \`${s.observed}\``);
    console.log(`- **expected authoritative property**: ${s.row.authoritative}`);
    for (const [k, c] of bad) console.log(`- **${k} ${c.v}**: ${c.why}`);
    if (s.row.note !== undefined) console.log(`- note: ${s.row.note}`);
  }

  console.log('\n## Paraphrase robustness — "reliably" is not one sentence\n');
  console.log('| # | operation | phrasings landing correctly |');
  console.log('|---|---|---|');
  const partial: string[] = [];
  for (const s of scored) {
    if (s.utterance.startsWith('(no utterance')) continue;
    const p = paraphrase(s.row);
    const flag = p.agreeing === p.total ? '' : p.agreeing === 0 ? ' — none' : ' ⚠ PARTIAL';
    console.log(`| ${s.row.id} | ${s.row.name} | ${p.agreeing} / ${p.total}${flag} |`);
    if (p.agreeing > 0 && p.agreeing < p.total) {
      partial.push(`**${s.row.id} ${s.row.name}** — ${p.agreeing}/${p.total} understood; these are not:\n${p.detail.join('\n')}`);
    }
  }
  if (partial.length > 0) {
    console.log('\n### Half-understood operations — the primary sentence works, a paraphrase does not\n');
    for (const t of partial) console.log(t + '\n');
  }

  console.log('\n## Adversarial corpus — a read-only question must never mutate\n');
  console.log('| utterance | why adversarial | mutated? | observed |');
  console.log('|---|---|---|---|');
  for (const a of adversarial) {
    console.log(`| \`${a.utterance.replace(/\|/g, '\\|')}\` | ${a.why} | ${a.mutated ? '**YES — FAIL**' : 'no'} | ${a.observed.replace(/\|/g, '\\|').slice(0, 110)} |`);
  }

  console.log('\n## Tally\n');
  console.log('| verdict | PASS | FAIL | UNPROVEN |');
  console.log('|---|---:|---:|---:|');
  for (const k of ['V1', 'V2', 'V3', 'V4', 'V5', 'V6', 'V7'] as const) {
    const t = { PASS: 0, FAIL: 0, UNPROVEN: 0 };
    for (const s of scored) t[s.v[k].v] += 1;
    console.log(`| ${k} | ${t.PASS} | ${t.FAIL} | ${t.UNPROVEN} |`);
  }
  console.log(`\n- operations scored: **${scored.length}**`);
  console.log(`- chat capabilities in the registry: **${CAP_IDS.size}**`);
  console.log(`- bus commands deliberately classified as un-chatted: **${Object.keys(CHAT_CLASSIFIED).length}**`);
  console.log(`- adversarial utterances that mutated: **${adversarial.filter((a) => a.mutated).length} of ${adversarial.length}**`);
}
