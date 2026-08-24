// @pryzm/ai-host — §PLANNER (RAC U10.1): the LLM planner contract.
// =============================================================================
//
// "Put larger windows on the south-facing bedrooms."
//
// THE ONE RULE THIS MODULE EXISTS TO ENFORCE. The model may only ever produce
// the SAME validated structures the deterministic layers produce — a
// `SemanticIntent`, or an ordered list of them (the U6 `execute-plan` IR) —
// which are then handed to the EXISTING `applySemanticIntent` / plan executor.
// It may never dispatch a bus command, name a verb the registry does not
// declare, invent a parameter, bypass a capability's refusal, or skip a Confirm
// card. Free-form language in; the same hard stoppers out.
//
// That is founder doctrine written down: open language is the goal, and safety
// comes from the rule gates at the EXECUTION layer, never from narrowing what
// the user is allowed to say. So this module widens the input surface and adds
// exactly zero new authority.
//
// ── WHERE IT SITS ───────────────────────────────────────────────────────────
//
//   tier 0 grammar → tier 1 synonyms/typos → NL layer → **planner** → legacy
//
// LAST, and deliberately. Every rung above it costs ZERO tokens, and the ladder
// order is pinned by a test so a future edit cannot quietly start spending
// tokens on "make all walls white". A sentence the grammar claims never reaches
// this file.
//
// ── THE VOCABULARY IS GENERATED, NEVER HAND-MAINTAINED ──────────────────────
//
// `buildPlannerVocabulary()` renders the prompt's tool surface FROM
// `allChatCapabilities()`. A hand-written prompt list is the c1902a5a defect
// wearing a different hat: `wall.updateSystemTypeBatch` shipped, the chat's
// hand-maintained list of thirteen intents did not learn about it, and the
// founder's sentence reached nothing. A prompt list would drift the same way,
// silently, and the failure would look like "the AI is dumb" rather than "the
// list is stale". Generated from the registry, it cannot.
//
// The FIELD SHAPES are generated too, and from something stronger than a
// hand-written schema: each capability's registry `probe` (a declared,
// gate-verified well-formed intent) UNION the intents the DETERMINISTIC ladder
// itself produces for that capability's declared `examples`. So the planner's
// legal output space is, by construction, the shape space the grammar already
// produces — the architectural rule made mechanical instead of aspirational.
//
// ── WHAT THIS VALIDATOR DECIDES, AND WHAT IT DELIBERATELY DOES NOT ──────────
//
// It decides SHAPE: known capability id, known field names, right value types,
// a scope the capability declares. Anything else is REJECTED with a reason —
// never coerced into a nearby guess, because a coerced guess is how an LLM
// silently does something the user did not ask for.
//
// It does NOT decide VALUE LEGALITY ("is 'Interior – Partition' a real wall
// type?", "is 40 m a legal wall height?", "is anything selected?"). That is
// `applySemanticIntent`'s job, it already refuses by listing the real options
// (§CONTEXT-DATA-HONESTY), and re-deciding it here would mint the second source
// of truth this whole architecture exists to delete.
//
// PURITY: no DOM, no stores, no fetch. The transport is INJECTED
// (`PlannerDeps.complete`), so ai-host stays pure and the editor owns the relay.

import {
  allChatCapabilities,
  resolveChatCapability,
  type CapabilityScopeMode,
  type CapabilityValueSource,
  type ChatCapability,
} from '../capabilities/ChatCapabilityRegistry.js';
import {
  resolveUtteranceIntent,
  type ResolverContext,
  type SemanticIntent,
} from './ZeroTokenResolver.js';
import { resolveNaturalLanguage } from './LocalNaturalLanguageResolver.js';

// ─── Shapes: what a capability's intent object may legally contain ───────────

/** A structural shape, derived from OBSERVED intents (probe + examples). The
 *  union at each position is what the deterministic layers really produce. */
export type PlannerShape =
  | { readonly k: 'prim'; readonly t: 'number' | 'string' | 'boolean' | 'null' }
  | { readonly k: 'array'; readonly of: readonly PlannerShape[] }
  | { readonly k: 'object'; readonly fields: ReadonlyMap<string, readonly PlannerShape[]> };

function shapeOf(value: unknown): PlannerShape {
  if (value === null) return { k: 'prim', t: 'null' };
  if (Array.isArray(value)) return { k: 'array', of: value.map(shapeOf) };
  if (typeof value === 'object') {
    const fields = new Map<string, readonly PlannerShape[]>();
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      fields.set(k, [shapeOf(v)]);
    }
    return { k: 'object', fields };
  }
  if (typeof value === 'number') return { k: 'prim', t: 'number' };
  if (typeof value === 'boolean') return { k: 'prim', t: 'boolean' };
  return { k: 'prim', t: 'string' };
}

/** Union two shape lists, merging object field maps so an OPTIONAL field seen
 *  in one observation widens the accepted shape rather than replacing it. */
function unionShapes(a: readonly PlannerShape[], b: readonly PlannerShape[]): readonly PlannerShape[] {
  const out: PlannerShape[] = [...a];
  for (const s of b) {
    const existing = out.findIndex((o) => o.k === s.k);
    if (existing < 0) { out.push(s); continue; }
    const cur = out[existing]!;
    if (cur.k === 'prim' && s.k === 'prim') {
      if (cur.t !== s.t) out.push(s);
      continue;
    }
    if (cur.k === 'array' && s.k === 'array') {
      out[existing] = { k: 'array', of: unionShapes(cur.of, s.of) };
      continue;
    }
    if (cur.k === 'object' && s.k === 'object') {
      const fields = new Map(cur.fields);
      for (const [key, shapes] of s.fields) {
        fields.set(key, unionShapes(fields.get(key) ?? [], shapes));
      }
      out[existing] = { k: 'object', fields };
    }
  }
  return out;
}

/** Does `value` match ANY of the accepted shapes? Objects match structurally:
 *  every key present must be a known field of the matched shape (unknown keys
 *  are the rejection this function exists for), and missing keys are fine
 *  because optionality is the resolver's business, not the planner's. */
function matchesShape(value: unknown, accepted: readonly PlannerShape[]): boolean {
  return accepted.some((s) => matchesOne(value, s));
}

function matchesOne(value: unknown, s: PlannerShape): boolean {
  if (s.k === 'prim') {
    if (s.t === 'null') return value === null;
    return value !== null && typeof value === s.t;
  }
  if (s.k === 'array') {
    if (!Array.isArray(value)) return false;
    return value.every((v) => s.of.length === 0 || matchesShape(v, s.of));
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const accepted = s.fields.get(k);
    if (accepted === undefined) return false;
    if (!matchesShape(v, accepted)) return false;
  }
  return true;
}

/** The legal field shape of ONE capability: field name → accepted shapes. */
export type CapabilityFieldShapes = ReadonlyMap<string, readonly PlannerShape[]>;

const shapeCache = new Map<string, CapabilityFieldShapes>();

/** Drop the memoized shapes (tests, and a project switch that changes the
 *  catalogues an example resolves against). */
export function resetPlannerShapeCache(): void {
  shapeCache.clear();
}

/** Run ONE utterance through the deterministic single-intent ladder — the same
 *  two rungs `SemanticPlan.clauseIntent` uses, so the shapes derived here are
 *  literally the shapes the grammar produces. */
function ladderIntent(utterance: string, ctx: ResolverContext): SemanticIntent | null {
  try {
    const tier01 = resolveUtteranceIntent(utterance, ctx);
    if (tier01 !== null) return tier01;
    const nl = resolveNaturalLanguage(utterance, ctx);
    return nl.kind === 'resolved' ? nl.semanticIntent : null;
  } catch {
    // An example that crashes the resolver contributes no shape. It is the
    // acceptance suite's job to fail on that, not the planner's.
    return null;
  }
}

/**
 * Derive every capability's legal field shape from the registry: the `probe`
 * first (declared and gate-verified), then every intent the ladder produces for
 * every capability's declared `examples`, attributed to the id the ladder
 * ACTUALLY produced — never the id we hoped for, because attributing a shape to
 * a capability the sentence does not reach would be a fiction.
 */
function allFieldShapes(ctx: ResolverContext): ReadonlyMap<string, CapabilityFieldShapes> {
  if (shapeCache.size > 0) return shapeCache;
  const acc = new Map<string, Map<string, readonly PlannerShape[]>>();
  const note = (si: SemanticIntent): void => {
    const rec = acc.get(si.intent) ?? new Map<string, readonly PlannerShape[]>();
    for (const [k, v] of Object.entries(si as Record<string, unknown>)) {
      if (k === 'intent') continue;
      rec.set(k, unionShapes(rec.get(k) ?? [], [shapeOf(v)]));
    }
    acc.set(si.intent, rec);
  };
  for (const cap of allChatCapabilities()) {
    // The probe is the DECLARED witness; a capability always has one.
    acc.set(cap.id, acc.get(cap.id) ?? new Map());
    note(cap.probe);
    for (const example of cap.examples) {
      const si = ladderIntent(example, ctx);
      if (si !== null) note(si);
    }
  }
  // DECLARED scope modes widen the `scope` field. A capability's examples are
  // one phrasing family, not an enumeration of its scopes: `set-wall-color`
  // declares level/room/orientation (U3) and its examples happen to show only
  // "all"/"selection". Deriving the scope shape from examples alone would make
  // the registry's own declaration unusable by the planner — the declaration is
  // the promise, so it is what the shape is built from.
  for (const cap of allChatCapabilities()) {
    const rec = acc.get(cap.id);
    if (rec === undefined || !rec.has('scope')) continue;
    rec.set('scope', unionShapes(rec.get('scope') ?? [], declaredScopeShapes(cap)));
  }
  for (const [id, rec] of acc) shapeCache.set(id, rec);
  return shapeCache;
}

/** The scope shapes a capability's DECLARED modes permit, plus the U8.1 filter
 *  wrapper (a base scope NARROWED by predicates — available to every
 *  spec-driven capability by construction). */
function declaredScopeShapes(cap: ChatCapability): readonly PlannerShape[] {
  const out: PlannerShape[] = [];
  for (const mode of scopeModesOf(cap)) {
    switch (mode) {
      case 'all': case 'selection': case 'global':
        out.push(shapeOf(mode));
        out.push(shapeOf({ kind: mode }));
        break;
      case 'level':
        out.push(shapeOf({ kind: 'level', levelQuery: '2', elementKind: 'wall' }));
        break;
      case 'room':
        out.push(shapeOf({ kind: 'room', roomRef: 'kitchen', elementKind: 'wall' }));
        break;
      case 'orientation':
        out.push(shapeOf({ kind: 'orientation', orientation: 'S' }));
        break;
    }
  }
  const base = out.filter((s) => s.k === 'object');
  if (base.length > 0) {
    out.push(shapeOf({
      kind: 'filter',
      base: { kind: 'all' },
      filters: [{ kind: 'property', property: 'thickness', op: '>', value: 0.3, spokenUnit: 'mm' }],
    }));
    // The filter's `base` accepts every base shape, not just the sample above.
    const filter = out[out.length - 1]!;
    if (filter.k === 'object') {
      const fields = new Map(filter.fields);
      fields.set('base', unionShapes(fields.get('base') ?? [], out.slice(0, -1)));
      out[out.length - 1] = { k: 'object', fields };
    }
  }
  return out;
}

/** The legal field shape of one capability id (memoized). */
export function capabilityFieldShapes(id: string, ctx: ResolverContext): CapabilityFieldShapes {
  return allFieldShapes(ctx).get(id) ?? new Map();
}

// ─── The prompt surface ──────────────────────────────────────────────────────

/**
 * Value sources, in words the model can act on. Typed as an EXHAUSTIVE record,
 * so adding a `CapabilityValueSource` to the registry fails this file's build
 * rather than silently shipping a prompt that omits it — the drift check the
 * type system can perform for free.
 */
const VALUE_SOURCE_PHRASE: Readonly<Record<CapabilityValueSource, string>> = {
  measurement: 'a length in METRES (SI), converted from whatever unit the user said',
  angle: 'an angle in DEGREES',
  // ⭐ §FEAT-REVEAL-DIRECTION-RAC (L-3414) — a CLOSED SET OF WORDS, not a quantity. The
  // phrase deliberately tells the model the value is one of a fixed list WITHOUT naming the
  // list: the members live on the property vocabulary's own `enumSpoken` table, and a
  // second copy in a prompt string is a second place a spelling can be accepted and then
  // refused downstream. The registry's per-parameter `example` carries a concrete one.
  enumeration: "ONE WORD from a fixed set — copy the word the user said through verbatim; do not convert it or add a unit",

  'wall-system-types': "a wall type NAME from the project's wall catalogue, as the user said it",
  'window-system-types': "a window type NAME from the project's window catalogue",
  'door-system-types': "a door type NAME from the project's door catalogue",
  'slab-system-types': "a slab assembly NAME from the project's slab catalogue",
  'ceiling-system-types': "a ceiling assembly NAME from the project's ceiling catalogue",
  // §FEAT-CHAT-STAIR-TYPES (L-1441). ⭐ The wording differs from the five above
  // ON PURPOSE — it says BUILT-IN, not "the project's", because that is what
  // the source is until the editor bridge grows a stair row. A prompt that
  // over-promised here would teach the model to offer a project type the
  // resolver cannot reach.
  'stair-types': 'a BUILT-IN stair type NAME ("Monolithic Concrete", "Steel Open Riser")',
  'handrail-types': "a railing type NAME from the project's railing catalogue (\"Frameless Glass Balustrade\")",
  // §FEAT-CHAT-LIGHTING-TYPES (L-10220). ⭐ "the catalogue" and not "the
  // project's": BUILT_IN_LIGHTING_TYPES is the WHOLE accepted set here, because
  // element.changeType's lighting branch validates against that same table. The
  // stair wording above hedges because its source is a SUBSET; this one must not,
  // or the model learns to hedge about a catalogue with nothing outside it.
  'lighting-types': 'a lighting fixture type NAME from the fixture catalogue ("Recessed Downlight", "Linear Pendant", "Brass Arc Floor Lamp")',
  finish: 'a finish name ("plaster", "limewash")',
  'project-levels': 'a level reference — a name ("Level 2") or a number ("2")',
  color: 'a colour name ("white", "light grey") or a #hex string',
  'project-rooms': 'a room reference — its name or its occupancy ("the kitchen")',
  orientation: 'a compass orientation: N, E, S or W',
  'level-range': 'a level range, as the two bound references',
  'user-text': 'free user text (e.g. a room name), copied from the sentence',
  coordinates: 'a pair of plan coordinates {x, z} in metres',
};

function scopeModesOf(cap: ChatCapability): readonly CapabilityScopeMode[] {
  return cap.scopeModes ?? [cap.scope];
}

function renderShape(shapes: readonly PlannerShape[]): string {
  const parts = shapes.map((s) =>
    s.k === 'prim' ? s.t
      : s.k === 'array' ? `array<${s.of.length > 0 ? renderShape(s.of) : 'any'}>`
        : `{${[...s.fields.keys()].join(', ')}}`);
  return [...new Set(parts)].join(' | ');
}

/** One capability, as the model sees it. Everything here is READ from the
 *  registry; not one line of it is authored per capability. */
function renderCapability(cap: ChatCapability, ctx: ResolverContext): string {
  const shapes = capabilityFieldShapes(cap.id, ctx);
  const fields = [...shapes.entries()]
    .map(([name, s]) => `${name}: ${renderShape(s)}`)
    .join('; ');
  const lines = [
    `- "${cap.id}" — ${cap.description}${cap.destructive ? ' [DESTRUCTIVE: the user is shown a Confirm card first]' : ''}`,
    `  applies to: ${cap.targets === 'global' ? 'the whole view/document' : cap.targets.join(', ')}`,
    `  fields: ${fields.length > 0 ? `{ ${fields} }` : '{ } (no fields beyond "intent")'}`,
  ];
  if (cap.parameters.length > 0) {
    lines.push(`  values: ${cap.parameters
      .map((p) => `${p.name} (${p.required ? 'required' : 'optional'}) = ${VALUE_SOURCE_PHRASE[p.valueSource]}, e.g. "${p.example}"`)
      .join(' · ')}`);
  }
  lines.push(`  scope may be: ${scopeModesOf(cap).join(', ')}`);
  lines.push(`  examples: ${cap.examples.map((e) => `"${e}"`).join(' · ')}`);
  return lines.join('\n');
}

/** The whole tool surface, GENERATED. This is the planner's only vocabulary. */
export function buildPlannerVocabulary(ctx: ResolverContext): string {
  return allChatCapabilities()
    .filter((c) => c.composite !== true) // a plan is expressed as several steps
    .map((c) => renderCapability(c, ctx))
    .join('\n');
}

/** The live facts the model needs to scope correctly — read off the SAME
 *  ResolverContext the deterministic tiers use, so the two cannot disagree
 *  about what is selected or which levels exist. */
export function buildPlannerFacts(ctx: ResolverContext): string {
  const sel = ctx.selection.length === 0
    ? 'nothing is selected'
    : `${ctx.selection.length} selected: ${ctx.selection.map((s) => s.elementType).join(', ')}`;
  const levels = ctx.levels.length === 0
    ? 'no levels'
    : ctx.levels.map((l) => `${l.name}${l.elevation === undefined ? '' : ` @ ${l.elevation}m`}`).join(', ');
  const active = ctx.levels.find((l) => l.id === ctx.activeLevelId)?.name ?? 'unknown';
  const cats: string[] = [];
  if (ctx.wallSystemTypeNames?.length) cats.push(`wall types: ${ctx.wallSystemTypeNames.join(' | ')}`);
  return [
    `Selection: ${sel}`,
    `Levels: ${levels} (active: ${active})`,
    ...cats,
  ].join('\n');
}

export interface PlannerPrompt {
  readonly system: string;
  readonly user: string;
}

const RESPONSE_CONTRACT = `Reply with ONE JSON object and nothing else. Two forms only:

  {"steps":[{"intent":"<id>", ...fields}, ...], "clauses":["<the user's own words for step 1>", ...]}
  {"cannot":"<one short sentence saying what the user seems to want>"}

Rules, all of them hard:
  • "intent" MUST be one of the ids listed above. Never invent an id, a verb, a
    field name or a command string. There is no free-text command form.
  • Use ONLY the field names shown for that id, with the shown value types.
  • "scope" may only be a mode the capability lists.
  • Emit ONE step per thing the user asked for, in the order they asked. Do not
    add a step they did not ask for, and never "helpfully" finish a job.
  • "clauses" must have one entry per step: the user's OWN words for that step,
    so the confirmation can quote them back.
  • If the request does not map cleanly onto these ids, return the "cannot"
    form. A wrong-but-plausible intent is far worse than an honest miss — the
    user is shown your reading and told it is not something the editor can do.
  • You do not execute anything. Every step is re-validated and may still be
    refused, and destructive steps still require the user's confirmation.`;

/** Build the prompt. Pure: the caller sends it wherever it sends it. */
export function buildPlannerPrompt(utterance: string, ctx: ResolverContext): PlannerPrompt {
  return {
    system:
      'You translate a BIM editor user\'s sentence into the editor\'s OWN validated intent structures.\n' +
      'You are the LAST resort: the deterministic grammar already tried and did not recognise this sentence.\n\n' +
      'CAPABILITIES (this is your complete vocabulary — nothing outside it exists):\n' +
      buildPlannerVocabulary(ctx) + '\n\n' +
      RESPONSE_CONTRACT,
    user: `Current project state:\n${buildPlannerFacts(ctx)}\n\nUser said: ${utterance}`,
  };
}

// ─── Validation ──────────────────────────────────────────────────────────────

export type PlannerValidation =
  | {
      readonly kind: 'intents';
      readonly intents: readonly SemanticIntent[];
      readonly clauses: readonly string[];
    }
  | {
      readonly kind: 'rejected';
      /** Why the output is not runnable, in the words the user will read. */
      readonly reason: string;
      /** The model's own reading, when it gave one — so the reply can say
       *  "I understood it as X, but…" instead of a bare failure. */
      readonly understoodAs: string | null;
    }
  | { readonly kind: 'cannot'; readonly understoodAs: string };

/** Strip a ```json fence if the model wrapped its answer in one. */
function stripFence(raw: string): string {
  const m = raw.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (m?.[1] ?? raw).trim();
}

function describeStep(step: Record<string, unknown>): string {
  const id = typeof step['intent'] === 'string' ? step['intent'] : '(no intent)';
  const rest = Object.entries(step)
    .filter(([k]) => k !== 'intent')
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(', ');
  return rest.length > 0 ? `${id}(${rest})` : id;
}

/**
 * VALIDATE the model's raw text against the registry. This is the gate the
 * whole phase turns on: nothing reaches `applySemanticIntent` without passing
 * it, and nothing that fails it is coerced into a guess.
 */
export function validatePlannerOutput(raw: string, ctx: ResolverContext): PlannerValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripFence(raw));
  } catch {
    return {
      kind: 'rejected',
      reason: 'the planner did not return a usable answer',
      understoodAs: null,
    };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { kind: 'rejected', reason: 'the planner did not return a usable answer', understoodAs: null };
  }
  const obj = parsed as Record<string, unknown>;
  if (typeof obj['cannot'] === 'string') {
    return { kind: 'cannot', understoodAs: obj['cannot'] };
  }
  const rawSteps = obj['steps'];
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return { kind: 'rejected', reason: 'the planner did not return a usable answer', understoodAs: null };
  }
  const clauses = Array.isArray(obj['clauses'])
    ? obj['clauses'].filter((c): c is string => typeof c === 'string')
    : [];

  const intents: SemanticIntent[] = [];
  for (let i = 0; i < rawSteps.length; i++) {
    const step = rawSteps[i];
    const where = rawSteps.length > 1 ? `step ${i + 1}` : 'that';
    if (step === null || typeof step !== 'object' || Array.isArray(step)) {
      return { kind: 'rejected', reason: `${where} is not a valid instruction`, understoodAs: null };
    }
    const rec = step as Record<string, unknown>;
    const reading = describeStep(rec);
    const id = rec['intent'];
    if (typeof id !== 'string') {
      return { kind: 'rejected', reason: `${where} named no capability`, understoodAs: reading };
    }
    // (1) UNKNOWN ID — an invented verb dies here, before anything runs.
    const cap = resolveChatCapability(id);
    if (cap === null) {
      return {
        kind: 'rejected',
        reason: `"${id}" is not something this editor can do`,
        understoodAs: reading,
      };
    }
    // (2) A composite may not be emitted directly — a plan IS several steps.
    if (cap.composite === true) {
      return {
        kind: 'rejected',
        reason: `"${id}" cannot be asked for directly — a sequence is expressed as separate steps`,
        understoodAs: reading,
      };
    }
    const shapes = capabilityFieldShapes(id, ctx);
    for (const [key, value] of Object.entries(rec)) {
      if (key === 'intent') continue;
      // (3) UNKNOWN PARAMETER.
      const accepted = shapes.get(key);
      if (accepted === undefined) {
        return {
          kind: 'rejected',
          reason: `"${id}" has no "${key}" setting`,
          understoodAs: reading,
        };
      }
      // (4) WRONG VALUE SHAPE.
      if (!matchesShape(value, accepted)) {
        return {
          kind: 'rejected',
          reason: `"${key}" on "${id}" cannot be ${JSON.stringify(value)} — it must be ${renderShape(accepted)}`,
          understoodAs: reading,
        };
      }
      // (5) UNDECLARED SCOPE — a capability that never promised to work across
      // a level may not be handed one just because the model asked nicely.
      if (key === 'scope') {
        // A scope form this capability's own grammar does not speak in element
        // terms (`active-level`, `all-levels`) is not an element scope at all;
        // the shape check above already proved the capability produces it, and
        // its legality is the apply arm's business. Only ELEMENT scopes are
        // judged against the declaration.
        const mode = scopeModeOfValue(value);
        const declared = scopeModesOf(cap);
        if (mode !== null && !declared.includes(mode)) {
          return {
            kind: 'rejected',
            reason: `"${cap.description}" does not work ${scopeModeWords(mode)} — it works on: ${declared.join(', ')}`,
            understoodAs: reading,
          };
        }
      }
    }
    intents.push(rec as unknown as SemanticIntent);
  }
  return { kind: 'intents', intents, clauses };
}

/** Read the scope MODE off a scope value — `'all'` / `'selection'` / the
 *  `kind` of a spatial descriptor. A filter scope is judged by its BASE, which
 *  is what the capability actually has to support (U8.1: a filter NARROWS a
 *  base scope, it never replaces it). */
function scopeModeOfValue(value: unknown): CapabilityScopeMode | null {
  if (value === 'all' || value === 'selection' || value === 'global') return value;
  if (value === null || typeof value !== 'object') return null;
  const rec = value as Record<string, unknown>;
  const kind = rec['kind'];
  if (kind === 'filter') return scopeModeOfValue(rec['base']);
  if (kind === 'level' || kind === 'room' || kind === 'orientation' || kind === 'all' || kind === 'selection') {
    return kind;
  }
  return null;
}

function scopeModeWords(mode: CapabilityScopeMode): string {
  switch (mode) {
    case 'level': return 'across a whole level';
    case 'room': return 'on the contents of a room';
    case 'orientation': return 'by façade orientation';
    case 'all': return 'across the whole project';
    case 'selection': return 'on the selection';
    case 'global': return 'on the whole document';
  }
}

// ─── The planner ─────────────────────────────────────────────────────────────

export interface PlannerDeps {
  /**
   * The transport. Returns the model's raw text. INJECTED so this package
   * stays pure — the editor wires the relay (`createCfWorkerRelay`), tests
   * wire a canned string, and neither is a fetch inside ai-host.
   *
   * Throwing is fine and expected: a relay error becomes an honest
   * `unavailable` outcome, never a mystery 401 surfaced at the user.
   */
  complete(prompt: PlannerPrompt): Promise<string>;
  /**
   * Is an AI upstream configured at all? Production currently carries neither
   * CF_WORKER_URL nor ANTHROPIC_API_KEY, so the honest default is "no" and the
   * planner is SKIPPED cleanly rather than producing a 401. Three states, not
   * two (§CONTEXT-DATA-HONESTY): `false` is "we asked and there is none".
   */
  isConfigured(): Promise<boolean>;
}

export type PlannerOutcome =
  /** Validated structures, ready for `applySemanticIntent`. A single step is
   *  handed over as itself; several become the U6 `execute-plan` IR, which is
   *  where all-or-nothing validation and the truthful undo cost already live. */
  | {
      readonly kind: 'intent';
      readonly intent: SemanticIntent;
      readonly clauses: readonly string[];
    }
  /** The model answered, and its answer is not runnable. `reason` and
   *  `understoodAs` are both spoken: "I understood it as X, but that isn't
   *  something I can do — <reason>". */
  | { readonly kind: 'rejected'; readonly reason: string; readonly understoodAs: string | null }
  /** The model itself declined to map the sentence. */
  | { readonly kind: 'cannot'; readonly understoodAs: string }
  /** No relay is configured, or the relay failed. The caller says so out loud
   *  when the sentence needed it — never a silent fallthrough. */
  | { readonly kind: 'unavailable'; readonly reason: 'not-configured' | 'relay-failed' };

/**
 * The planner rung: prompt → model → VALIDATE → a structure the existing
 * executor runs. It never dispatches; it returns.
 *
 * TOKEN COST. This function is reached only after tier 0, tier 1 and the NL
 * layer have all missed, so every sentence the grammar understands still costs
 * zero tokens and still replies "(resolved without AI tokens)". A planner
 * result is honest about the difference and says it used the AI.
 */
export async function planUtterance(
  utterance: string,
  ctx: ResolverContext,
  deps: PlannerDeps,
): Promise<PlannerOutcome> {
  let configured = false;
  try {
    configured = await deps.isConfigured();
  } catch {
    configured = false;
  }
  if (!configured) return { kind: 'unavailable', reason: 'not-configured' };

  let raw: string;
  try {
    raw = await deps.complete(buildPlannerPrompt(utterance, ctx));
  } catch {
    return { kind: 'unavailable', reason: 'relay-failed' };
  }

  const validated = validatePlannerOutput(raw, ctx);
  if (validated.kind === 'rejected') {
    return { kind: 'rejected', reason: validated.reason, understoodAs: validated.understoodAs };
  }
  if (validated.kind === 'cannot') return { kind: 'cannot', understoodAs: validated.understoodAs };

  const { intents, clauses } = validated;
  if (intents.length === 1) {
    return { kind: 'intent', intent: intents[0]!, clauses: clauses.slice(0, 1) };
  }
  // Several steps ⇒ the U6 plan IR, unchanged. `applySemanticIntent` then
  // applies the SAME all-or-nothing validation, level projection, Confirm card
  // and undo-cost honesty a typed compound sentence gets. The step cap lives
  // there too and is deliberately not duplicated here.
  const kept = intents.map((_, i) => clauses[i] ?? utterance);
  return {
    kind: 'intent',
    intent: { intent: 'execute-plan', steps: intents, clauses: kept },
    clauses: kept,
  };
}
