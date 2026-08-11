#!/usr/bin/env tsx
/**
 * tools/rac-conformance/probe-categories-6-10.ts — RAC-2.
 *
 * Executable half of the categories 6–10 scorecard: rooms / spatial model,
 * visibility-selection-isolation, materials-metadata-properties, batch
 * operations, collaboration.
 *
 * It establishes V1 RESOLVE and V2 DISPATCH by EXECUTION (the real ladder, the
 * bridge's order) and prints, verbatim, what every utterance produced. V3–V7 are
 * NOT decided here — no renderer, no serializer, no socket in this process —
 * they are decided in the scorecard from source-anchored evidence, and are
 * UNPROVEN wherever only a runtime could settle them.
 *
 * SECTION A is the highest-severity result in RAC-2's scope: the ADVERSARIAL
 * READ-ONLY SET. Every utterance in it is a QUESTION — informational, phrased to
 * LOOK operational. Any one of them that produces commands or a local action is
 * a P0: at the audit baseline "highlight walls taller than 3m" resolved to
 * `set-height` and dispatched `wall.updateDimensions`, i.e. a read-only question
 * RESIZED THE BUILDING (fixed at fd27e513; the structural cause — no read-only
 * capability CLASS — stands).
 *
 * Run:  npx tsx tools/rac-conformance/probe-categories-6-10.ts
 * Cold start is ~3 minutes (tsx compiles the ai-host graph); everything is
 * therefore batched into ONE process.
 */

import { writeFileSync } from 'node:fs';
import {
  ctx, sel, STUB_SCOPE, ladder, describe, mutates, intentOf, commandTypesOf,
} from './ladder.js';
import { allChatCapabilities, CHAT_UNAVAILABLE } from '../../packages/ai-host/src/capabilities/ChatCapabilityRegistry.js';

interface Probe { readonly label: string; readonly utterance: string; readonly selection?: readonly { elementId: string; elementType: string }[]; readonly scoped?: boolean }
interface Result extends Probe { readonly kind: string; readonly intent: string | null; readonly commands: string[]; readonly detail: string; readonly mutated: boolean }

function run(p: Probe): Result {
  const c = ctx(p.selection ?? [], p.scoped === true ? STUB_SCOPE : undefined);
  let r;
  try { r = ladder(p.utterance, c); }
  catch (err) { return { ...p, kind: 'THREW', intent: null, commands: [], detail: String(err), mutated: false }; }
  return { ...p, kind: r.kind, intent: intentOf(r), commands: commandTypesOf(r), detail: describe(r), mutated: mutates(r) };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A — THE ADVERSARIAL READ-ONLY SET.
//
// Rule: EVERY sentence below is a question or a request for information. NONE
// of them may produce commands or a local action. They are deliberately written
// to look operational — imperative verbs ("show", "highlight", "list", "check"),
// measurements, element nouns and level names — because that is exactly the
// shape that made `set-height` fire on "highlight walls taller than 3m".
// ─────────────────────────────────────────────────────────────────────────────
const READ_ONLY: Probe[] = [
  // --- the fd27e513 family: an imperative that is really a filter query ---
  { label: 'RO-01 the original P0', utterance: 'highlight walls taller than 3m' },
  { label: 'RO-02 same, spelled out', utterance: 'highlight all walls taller than 3 metres' },
  { label: 'RO-03 show-as-filter', utterance: 'show me the walls taller than 3m' },
  { label: 'RO-04 show-as-filter, thickness', utterance: 'show me every wall thicker than 200mm' },
  { label: 'RO-05 which-question', utterance: 'which walls are taller than 3m?' },
  { label: 'RO-06 how-many', utterance: 'how many walls are taller than 3.2 m?' },
  { label: 'RO-07 find', utterance: 'find all walls over 3m tall' },
  { label: 'RO-08 list', utterance: 'list the doors wider than 900mm' },
  { label: 'RO-09 imperative+measure, windows', utterance: 'highlight the windows with a sill height above 1m' },

  // --- visibility questions: the founder's exact MUTATE vs READ distinction ---
  { label: 'RO-10 visibility read', utterance: 'what levels are visible?' },
  { label: 'RO-11 visibility read, bare', utterance: 'which levels are visible' },
  { label: 'RO-12 visibility read, negative', utterance: 'is level 2 hidden?' },
  { label: 'RO-13 visibility read, list', utterance: 'list the hidden elements' },
  { label: 'RO-14 visibility read, isolation', utterance: 'am I in isolation mode?' },
  { label: 'RO-15 visibility read, what is hidden', utterance: 'what is hidden right now?' },
  { label: 'RO-16 near-miss of a mutation', utterance: 'tell me which walls are hidden on level 2' },

  // --- property questions on a selection (must READ, never WRITE) ---
  { label: 'RO-17 property read', utterance: 'what is the height of this wall?', selection: sel('wall') },
  { label: 'RO-18 property read, thickness', utterance: 'how thick is the selected wall?', selection: sel('wall') },
  { label: 'RO-19 property read, material', utterance: 'what material is this room?', selection: sel('room') },
  { label: 'RO-20 property read, type', utterance: 'what type is this wall?', selection: sel('wall') },
  { label: 'RO-21 multi-property read', utterance: 'what are the height, thickness and type of this wall?', selection: sel('wall') },
  { label: 'RO-22 room read', utterance: 'what is the area of the kitchen?' },
  { label: 'RO-23 count read', utterance: 'how many rooms are on level 2?' },

  // --- report paste-backs: a sentence that IS a result line, re-typed ---
  { label: 'RO-24 paste-back', utterance: 'Changed 7 of 10 walls. 3 skipped: locked / invalid / not eligible.' },
  { label: 'RO-25 paste-back, level', utterance: 'Level 2 — 14 walls, 6 doors, 3 windows' },
  { label: 'RO-26 paste-back, height', utterance: 'Wall height: 3.2 m' },

  // --- hypotheticals and negations: NOT instructions ---
  { label: 'RO-27 hypothetical', utterance: 'what would happen if I made all the walls 3.2m?' },
  { label: 'RO-28 negation', utterance: 'do not change the wall height' },
  { label: 'RO-29 negation, hide', utterance: 'I do not want to hide level 2' },
  { label: 'RO-30 capability question', utterance: 'can you hide a level?' },
  { label: 'RO-31 capability question 2', utterance: 'are you able to change a room material?' },

  // --- comparisons / audits, phrased as commands ---
  { label: 'RO-32 audit', utterance: 'check whether every wall on level 2 is 3m tall' },
  { label: 'RO-33 audit 2', utterance: 'verify the exterior walls are all the same height' },
  { label: 'RO-34 compare', utterance: 'compare the wall heights on level 1 and level 2' },
  { label: 'RO-35 explain', utterance: 'why is this wall 3.2m tall?', selection: sel('wall') },
  { label: 'RO-36 summarise', utterance: 'summarise the materials used in this project' },
  { label: 'RO-37 where', utterance: 'where are the load-bearing walls?' },
  { label: 'RO-38 schedule read', utterance: 'give me a schedule of all the doors' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION B — categories 6–10 operational utterances (V1/V2 evidence).
// ─────────────────────────────────────────────────────────────────────────────
const OPERATIONAL: Probe[] = [
  // 6 — ROOMS / SPATIAL MODEL
  { label: '6.1 create room', utterance: 'create a room' },
  { label: '6.1b create room named', utterance: 'create a bedroom here' },
  { label: '6.2 detect boundary', utterance: 'detect the room boundaries' },
  { label: '6.3 rename room', utterance: 'rename this room to Kitchen', selection: sel('room') },
  { label: '6.4 change room finish', utterance: 'set the floor finish of this room to oak', selection: sel('room') },
  { label: '6.4b generate finishes', utterance: 'generate room finishes' },
  { label: '6.5 change room material (THE named defect)', utterance: 'change the material of this room to concrete', selection: sel('room') },
  { label: '6.5b room colour', utterance: 'make this room white', selection: sel('room') },
  { label: '6.6 resize room', utterance: 'make this room 4m by 5m', selection: sel('room') },
  { label: '6.6b room height offset', utterance: 'raise this room height offset to 0.2m', selection: sel('room') },
  { label: '6.7 delete room', utterance: 'delete this room', selection: sel('room') },
  { label: '6.8 room number', utterance: 'set this room number to 101', selection: sel('room') },

  // 7 — VISIBILITY / SELECTION / ISOLATION (mutating half)
  { label: '7.1 hide wall', utterance: 'hide this wall', selection: sel('wall') },
  { label: '7.1b hide walls', utterance: 'hide all the walls' },
  { label: '7.2 show wall', utterance: 'show this wall', selection: sel('wall') },
  { label: '7.3 isolate room', utterance: 'isolate the kitchen' },
  { label: '7.3b isolate selection', utterance: 'isolate the selection', selection: sel('room') },
  { label: '7.4 exit isolation', utterance: 'exit isolation' },
  { label: '7.4b reset visibility', utterance: 'unhide everything' },
  { label: '7.5 hide level', utterance: 'hide level 2' },
  { label: '7.6 show level', utterance: 'show level 2' },

  // 8 — MATERIALS / METADATA / PROPERTIES
  { label: '8.1 assign material', utterance: 'assign concrete to this wall', selection: sel('wall') },
  { label: '8.2 change material (colour route)', utterance: 'make all walls white' },
  { label: '8.2b change material, selection', utterance: 'paint the selected walls grey', selection: sel('wall', 3) },
  { label: '8.3 remove material', utterance: 'remove the material from this wall', selection: sel('wall') },
  { label: '8.4 set classification', utterance: 'set the classification of this wall to Uniclass EF_25_10', selection: sel('wall') },
  { label: '8.5 change element metadata', utterance: 'set the mark of this wall to W-12', selection: sel('wall') },
  { label: '8.6 change wall type', utterance: 'make all walls interior partition' },
  { label: '8.7 slab material', utterance: 'set the material of this slab to concrete', selection: sel('slab') },
  { label: '8.8 INVALID property → must REFUSE', utterance: 'set the flurbosity of this wall to 7', selection: sel('wall') },
  { label: '8.8b invalid property 2', utterance: 'set the acoustic rating of this wall to 52 dB', selection: sel('wall') },
  { label: '8.8c invalid value', utterance: 'make this wall minus three metres tall', selection: sel('wall') },

  // 9 — BATCH OPERATIONS (six outcome cases + undo)
  { label: '9.0 the founder utterance', utterance: 'Raise all exterior walls to 3.2 m', scoped: true },
  { label: '9.0b same, unscoped resolver', utterance: 'Raise all exterior walls to 3.2 m' },
  { label: '9.1 all eligible', utterance: 'make all walls 3.2m tall', scoped: true },
  { label: '9.2 scoped subset', utterance: 'make all walls on level 2 3.2m tall', scoped: true },
  { label: '9.3 empty selection → refusal', utterance: 'make the selected walls 3.2m tall' },
  { label: '9.4 mixed kinds selected', utterance: 'make these 3.2m tall', selection: [...sel('wall'), ...sel('door')] },
  { label: '9.5 batch delete', utterance: 'delete all furniture in the kitchen', scoped: true },
  { label: '9.6 batch retype', utterance: 'make all walls on level 2 interior partition', scoped: true },
  { label: '9.7 undo the batch', utterance: 'undo that' },

  // 10 — COLLABORATION
  { label: '10.1 height change (A→B)', utterance: 'set this wall height to 3.5m', selection: sel('wall') },
  { label: '10.2 material change (A→B)', utterance: 'make all walls white' },
  { label: '10.3 collaboration question', utterance: 'who else is editing this project?' },
  { label: '10.4 conflict question', utterance: 'are there any sync conflicts?' },
];

// ─────────────────────────────────────────────────────────────────────────────
// SECTION D — THE MISREAD REGRESSION SET (added RAC-FIX-1, 2026-08-11).
//
// Section A asks "did a QUESTION mutate?". This section asks the other half,
// and it is the half that carried both P0s: **did an INSTRUCTION resolve to the
// WRONG ACTION?** A misroute is not caught by A, because the utterances here
// are genuine imperatives — they SHOULD do something. They just did something
// else, and something the user did not ask for.
//
// Each row carries the resolution measured on `main` BEFORE the fix, verbatim,
// so this file is falsifiable rather than aspirational: if a row's `mustNotBe`
// comes back, the probe says so in the row's own words.
//
//   §1.2  "hide level 2"  → local intent=go-to-level action=setActiveLevel
//   §1.2  "show level 2"  → local intent=go-to-level action=setActiveLevel
//   §1.4  "remove the material from this wall"
//                         → commands[element.delete] intent=delete-selected
//
// `show level 2` is listed with `mustNotBe: null` DELIBERATELY. It is the
// control: `go-to-level` is the RIGHT answer for `show`, and the fix must split
// `hide` from `show` rather than blanket-refusing both. A fix that turned this
// row into a miss would have destroyed a working capability to close a bug, and
// this row is what makes that visible.
// ─────────────────────────────────────────────────────────────────────────────
interface MisreadCase extends Probe {
  /** The intent measured BEFORE the fix, which must never come back. `null`
   *  means "this row is a control — its current resolution is CORRECT". */
  readonly mustNotBe: string | null;
  readonly why: string;
}

const MISREAD_REGRESSION: MisreadCase[] = [
  {
    label: 'D-1 hide level (§1.2 founder MUTATE case)',
    utterance: 'hide level 2',
    mustNotBe: 'go-to-level',
    why: 'hiding is not navigating — it switched the active level and hid nothing',
  },
  {
    label: 'D-2 hide level, spelled',
    utterance: 'hide all elements on level 2',
    mustNotBe: 'go-to-level',
    why: 'same ask, longer phrasing — a fix that only closes the short form is a patch',
  },
  {
    label: 'D-3 isolate level (pinned MISREAD)',
    utterance: 'isolate level 2',
    mustNotBe: 'go-to-level',
    why: 'isolating is not navigating; pinned in QueryEngineDrain MISREAD since U9',
  },
  {
    label: 'D-4 turn off level',
    utterance: 'turn off level 2',
    mustNotBe: 'go-to-level',
    why: 'the hide family reached through a synonym the guard did not know',
  },
  {
    label: 'D-5 show level — THE CONTROL, must stay go-to-level',
    utterance: 'show level 2',
    mustNotBe: null,
    why: 'navigation IS what "show level 2" asks for; this must not become a miss',
  },
  {
    label: 'D-6 remove material (§1.4 destructive)',
    utterance: 'remove the material from this wall',
    mustNotBe: 'delete-selected',
    why: 'a material ask routed to a DESTRUCTIVE wall delete',
    selection: sel('wall'),
  },
  {
    label: 'D-7 remove colour',
    utterance: 'remove the colour from this wall',
    mustNotBe: 'delete-selected',
    why: 'same shape, different property — the guard must be about the SHAPE',
    selection: sel('wall'),
  },
  {
    label: 'D-8 clear the finish',
    utterance: 'clear the finish from this wall',
    mustNotBe: 'delete-selected',
    why: 'a removal synonym reaching the same destructive intent',
    selection: sel('wall'),
  },
  {
    label: 'D-9 delete selected wall — THE CONTROL, must stay delete-selected',
    utterance: 'delete the selected wall',
    mustNotBe: null,
    why: 'a real deletion ask; the property guard must not narrow the delete vocabulary',
    selection: sel('wall'),
  },
  {
    label: 'D-10 delete this room — THE CONTROL',
    utterance: 'delete this room',
    mustNotBe: null,
    why: 'a real deletion ask on another kind',
    selection: sel('room'),
  },
];

function main(): void {
  const roResults = READ_ONLY.map(run);
  const opResults = OPERATIONAL.map(run);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('RAC-2 · SECTION A — ADVERSARIAL READ-ONLY SET');
  console.log('Rule: a question must NEVER produce commands or a local action.');
  console.log('═══════════════════════════════════════════════════════════════\n');
  for (const r of roResults) {
    const flag = r.mutated ? '❌ MUTATED' : r.kind === 'refusal' ? '✅ refused ' : '✅ miss    ';
    console.log(`${flag} ${r.label.padEnd(34)} "${r.utterance}"`);
    console.log(`             → ${r.detail}`);
  }
  const violations = roResults.filter((r) => r.mutated);
  console.log(`\n>>> READ-ONLY VIOLATIONS: ${violations.length} of ${roResults.length}`);
  for (const v of violations) console.log(`    P0  "${v.utterance}" → ${v.detail}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('RAC-2 · SECTION B — CATEGORIES 6–10 OPERATIONAL UTTERANCES');
  console.log('═══════════════════════════════════════════════════════════════\n');
  for (const r of opResults) {
    console.log(`${r.kind.toUpperCase().padEnd(9)} ${r.label.padEnd(40)} "${r.utterance}"`);
    console.log(`          → ${r.detail}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('RAC-FIX-1 · SECTION D — MISREAD REGRESSION SET');
  console.log('Rule: an INSTRUCTION must not resolve to a DIFFERENT action.');
  console.log('═══════════════════════════════════════════════════════════════\n');
  let misreads = 0;
  for (const c of MISREAD_REGRESSION) {
    const r = run(c);
    const bad = c.mustNotBe !== null && r.intent === c.mustNotBe;
    if (bad) misreads++;
    const flag = bad ? '❌ MISREAD' : c.mustNotBe === null ? '✅ control' : '✅ fixed  ';
    console.log(`${flag} ${c.label.padEnd(46)} "${c.utterance}"`);
    console.log(`             → ${r.detail}`);
    if (bad) console.log(`             !! still ${c.mustNotBe}: ${c.why}`);
  }
  console.log(`\n>>> LIVE MISREADS: ${misreads} of ${MISREAD_REGRESSION.filter((c) => c.mustNotBe !== null).length}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('RAC-2 · SECTION C — DECLARATION SURFACE (static)');
  console.log('═══════════════════════════════════════════════════════════════\n');
  const caps = allChatCapabilities();
  console.log(`capabilities declared: ${caps.length}`);
  // A read-only capability CLASS would be a field on ChatCapability. There is
  // none — this prints the proof rather than asserting it.
  const readOnlyish = caps.filter((c) => (c as unknown as Record<string, unknown>)['readOnly'] === true
    || (c as unknown as Record<string, unknown>)['kind'] === 'query');
  console.log(`capabilities carrying a read-only / query marker: ${readOnlyish.length}`);
  console.log(`capabilities whose busCommand is null (LOCAL actions): ${caps.filter((c) => c.busCommand === null).map((c) => c.id).join(', ')}`);
  const visibilityCaps = caps.filter((c) => /hide|show|isolat|visib/i.test([c.id, ...c.verbs, ...c.aliases].join(' ')));
  console.log(`capabilities mentioning hide/show/isolate/visible: ${visibilityCaps.length === 0 ? '(none)' : visibilityCaps.map((c) => c.id).join(', ')}`);
  const roomCaps = caps.filter((c) => c.targets !== 'global' && (c.targets as readonly string[]).includes('room'));
  console.log(`capabilities targeting "room": ${roomCaps.map((c) => c.id).join(', ') || '(none)'}`);
  console.log(`CHAT_UNAVAILABLE entries: ${CHAT_UNAVAILABLE.size}`);
  for (const verb of ['room.setMaterial', 'wall.setColor', 'wall.bulkSetVisuals', 'slab.setMaterial', 'room.move']) {
    console.log(`  ${verb} → ${CHAT_UNAVAILABLE.get(verb) ?? '(not in CHAT_UNAVAILABLE)'}`);
  }

  writeFileSync(
    'tools/rac-conformance/.out-categories-6-10.json',
    JSON.stringify({ readOnly: roResults, operational: opResults, violations: violations.length }, null, 2),
  );
  console.log('\nwrote tools/rac-conformance/.out-categories-6-10.json');
}

main();
