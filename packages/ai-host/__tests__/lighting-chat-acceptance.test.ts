// @pryzm/ai-host — §FEAT-CHAT-LIGHTING-TYPES (L-10220) · lane RACLIGHT16
// =============================================================================
//
// ⭐ THE FOUNDER'S SENTENCE, VERBATIM:
//
//     "change all lightings in ground level to 'X'"
//
// Two independent things had to be true for that to work, and only ONE of them
// was about lighting.
//
// ── 1. THE FAMILY (publication, not implementation) ─────────────────────────
//
// `CatalogueFamilies.ts`' own header already said the machinery was there:
// `element.changeType` has routed SIXTEEN families with ring-buffer undo parity
// since L-623, lighting among them, and the properties panel has offered the
// picker since §FEAT-ELEMENT-TYPE-PICKER-REGISTRY. Only the CHAT had never been
// told. So the family cost one table row.
//
// ── 2. THE LEVEL SCOPE (and this one was NOT a lighting bug) ────────────────
//
// MEASURED 2026-08-24, before the fix, on the founder's literal:
//
//     typeRef = "in ground level to recessed downlight" · scope = 'all'
//
// `makeHostedTypeParser` carried the FIFTH hand-written spelling of the scope
// tail (`on` ⇒ level, `in the` ⇒ room, bare `in` understood by nothing), so the
// place phrase leaked into the type reference AND the project-wide scope
// survived. window / door / slab / ceiling / stair / stair-railing were all
// broken identically. ⛔ THE SECOND HALF IS THE DANGEROUS ONE: had the ref
// resolved, the sentence would have retyped every fixture in the building. **A
// level scope that silently widens is worse than no level scope**, which is why
// the negative — a fixture on ANOTHER level is untouched — is asserted here as
// hard as the positive.
//
// ── WHAT THIS FILE PROVES, AND AT WHICH LAYER ───────────────────────────────
//
// C16 §5.1 CA-21 wants an executed read-back, never a `success: true`. So the
// last describe block drives the REAL `UpdateLightingParametersCommand` — the
// command `element.changeType`'s lighting branch dispatches — and reads the
// fixture back OUT of the store the fragment builder reads, and asserts the
// builder was asked to rebuild that record and only that record.
//
// ⚠ STATED HONESTLY: this suite cannot execute `initBusHandlers`' branch itself
// (apps/editor, L7, above this package). What it does instead is assert the
// branch's OWN GUARD against the id the chat produces —
// `getLightingTypeDefinition(id)` must be defined — so a resolution that would
// hit that branch's `console.warn(... ignored)` path fails HERE rather than
// silently on screen.

import { describe, expect, it } from 'vitest';
import {
  applySemanticIntent,
  resolveUtteranceIntent,
  type ResolverContext,
  type SemanticIntent,
} from '../src/intents/ZeroTokenResolver.js';
import { CATALOGUE_FAMILIES } from '../src/intents/CatalogueFamilies.js';
import { publishedLightingTypeCatalogue } from '../src/intents/publishedCatalogues.js';
import {
  BUILT_IN_LIGHTING_TYPES,
  getLightingTypeDefinition,
} from '@pryzm/geometry-lighting';
import { UpdateLightingParametersCommand } from '@pryzm/command-registry';
import type { CommandContext } from '@pryzm/command-registry';

// ─── The project ─────────────────────────────────────────────────────────────
//
// Two levels, three fixtures: two on Ground, one on Level 1. The one upstairs
// is the whole point of the negative assertion.

const GROUND = { id: 'L0', name: 'Ground', elevation: 0 };
const FIRST = { id: 'L1', name: 'Level 1', elevation: 3 };

interface Fixture {
  id: string;
  type: string;
  levelId: string;
  fixtureType: string;
  position: { x: number; y: number; z: number };
}

function project(): Map<string, Fixture> {
  return new Map<string, Fixture>([
    ['light-g1', { id: 'light-g1', type: 'lighting', levelId: 'L0', fixtureType: 'pendant', position: { x: 0, y: 2.6, z: 0 } }],
    ['light-g2', { id: 'light-g2', type: 'lighting', levelId: 'L0', fixtureType: 'pendant', position: { x: 2, y: 2.6, z: 0 } }],
    ['light-u1', { id: 'light-u1', type: 'lighting', levelId: 'L1', fixtureType: 'pendant', position: { x: 0, y: 5.6, z: 0 } }],
  ]);
}

/**
 * The scope resolver, reproducing the EDITOR BRIDGE's lighting arm rather than
 * inventing one: a lighting record carries its own `levelId`, so
 * `isHostDerivedKind` is false there and the bridge filters
 * `getAll().filter(e => e.levelId === level.id)` (ZeroTokenChatBridge.ts, the
 * §FIX-HOSTED-LEVEL-SCOPE branch). `findLevel`'s trailing-noun strip is what
 * makes "ground level" find "Ground".
 */
function scopeResolverOver(store: Map<string, Fixture>): ResolverContext['resolveScope'] {
  return ((descriptor: Record<string, unknown>) => {
    const rows = [...store.values()];
    if (descriptor['kind'] === 'all') {
      const ids = rows.map((r) => r.id);
      return { ids, kindCounts: { lighting: ids.length }, skipped: [], diagnostics: [] };
    }
    if (descriptor['kind'] === 'level') {
      const q = String(descriptor['levelQuery']).toLowerCase()
        .replace(/\s*(?:levels?|floors?|storeys?|stor(?:y|ies))$/, '').trim();
      const level = [GROUND, FIRST].find((l) => l.name.toLowerCase() === q);
      if (level === undefined) {
        return { error: `No level called "${String(descriptor['levelQuery'])}".` };
      }
      const ids = rows.filter((r) => r.levelId === level.id).map((r) => r.id);
      return { ids, kindCounts: { lighting: ids.length }, skipped: [], diagnostics: [level.name] };
    }
    return { error: 'unsupported scope in this fixture' };
  }) as never;
}

function ctxOver(store: Map<string, Fixture>): ResolverContext {
  return {
    selection: [],
    levels: [GROUND, FIRST],
    activeLevelId: 'L0',
    mintId: () => 'id-1',
    resolveScope: scopeResolverOver(store),
  } as unknown as ResolverContext;
}

interface DispatchedCommand {
  readonly type: string;
  readonly payload: Record<string, unknown>;
}

function commandsOf(app: unknown): readonly DispatchedCommand[] {
  return (app as { commands?: readonly DispatchedCommand[] }).commands ?? [];
}

// ─────────────────────────────────────────────────────────────────────────────
// A — the catalogue is NAMED, not an enum, and it is the route's own table
// ─────────────────────────────────────────────────────────────────────────────

describe('A — lighting has a real named catalogue', () => {
  it('the published lookup is non-empty and every entry carries a display NAME', () => {
    const lookup = publishedLightingTypeCatalogue();
    expect(lookup, 'lighting publishes no catalogue at all').not.toBeNull();
    expect(lookup!.names.length).toBe(BUILT_IN_LIGHTING_TYPES.length);
    expect(lookup!.names.length).toBeGreaterThan(1);
    for (const n of lookup!.names) expect(n.trim().length).toBeGreaterThan(0);
    // ⭐ NOT the stair shape: this source is the WHOLE accepted set, so it must
    // carry no "these are only the built-ins" caveat. A note here would state a
    // limit that does not exist, which is the same defect as omitting one that
    // does (§CONTEXT-DATA-HONESTY).
    expect(lookup!.note).toBeUndefined();
  });

  it('⭐ every name it resolves is an id element.changeType would ACCEPT', () => {
    const lookup = publishedLightingTypeCatalogue()!;
    for (const name of lookup.names) {
      const hit = lookup.resolve(name);
      expect(hit, `"${name}" does not resolve through its own catalogue`).not.toBeNull();
      // The lighting branch's own guard, run against the chat's output.
      expect(
        getLightingTypeDefinition(hit!.id),
        `element.changeType would console.warn and IGNORE "${hit!.id}"`,
      ).toBeDefined();
    }
  });

  it('a forgiving reference resolves — case, hyphen and spacing all collapse', () => {
    const lookup = publishedLightingTypeCatalogue()!;
    expect(lookup.resolve('recessed downlight')?.id).toBe('recessed_downlight');
    expect(lookup.resolve('RECESSED  DOWNLIGHT')?.id).toBe('recessed_downlight');
    expect(lookup.resolve('linear-pendant')?.id).toBe('linear_pendant');
    // The id itself is the first rung of the ladder.
    expect(lookup.resolve('pendant_cluster')?.name).toBe('Pendant Cluster');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B — the founder's sentence: it resolves, at a LEVEL scope
// ─────────────────────────────────────────────────────────────────────────────

describe("B — the founder's sentence", () => {
  const FOUNDER = "change all lightings in ground level to recessed downlight";

  it('⭐ resolves to set-lighting-type with the type ref INTACT', () => {
    const si = resolveUtteranceIntent(FOUNDER, ctxOver(project()));
    expect(si, 'the founder\'s sentence is unclaimed').not.toBeNull();
    expect(si!.intent).toBe('set-lighting-type');
    // ⭐ Before §FIX-HOSTED-TYPE-SCOPE-TAIL this was the whole tail:
    // "in ground level to recessed downlight".
    expect((si as { typeRef: string }).typeRef).toBe('recessed downlight');
  });

  it('⭐⭐ carries a LEVEL scope — not the whole project', () => {
    const si = resolveUtteranceIntent(FOUNDER, ctxOver(project()))!;
    const scope = (si as { scope: unknown }).scope as { kind?: string; levelQuery?: string };
    expect(scope, JSON.stringify(scope)).not.toBe('all');
    expect(scope.kind).toBe('level');
    expect(scope.levelQuery).toBe('ground level');
  });

  it('dispatches element.changeType ONCE PER FIXTURE ON GROUND, with the resolved id', () => {
    const store = project();
    const si = resolveUtteranceIntent(FOUNDER, ctxOver(store))!;
    const app = applySemanticIntent(si, ctxOver(store));
    expect(app.kind, JSON.stringify(app)).toBe('commands');
    const cmds = commandsOf(app);
    expect(cmds.length).toBe(2);
    expect(cmds.map((c) => c.payload['elementId']).sort()).toEqual(['light-g1', 'light-g2']);
    for (const c of cmds) {
      expect(c.type).toBe('element.changeType');
      expect(c.payload['elementType']).toBe('lighting');
      expect(c.payload['newTypeId']).toBe('recessed_downlight');
      // The branch's own guard, again — a resolution it would ignore fails here.
      expect(getLightingTypeDefinition(String(c.payload['newTypeId']))).toBeDefined();
    }
  });

  it('⛔ THE NEGATIVE — the fixture on Level 1 is never in the dispatch', () => {
    const store = project();
    const si = resolveUtteranceIntent(FOUNDER, ctxOver(store))!;
    const app = applySemanticIntent(si, ctxOver(store));
    const targets = commandsOf(app).map((c) => c.payload['elementId']);
    expect(targets).not.toContain('light-u1');
  });

  it('the summary names the LEVEL back, so the user sees the reading before consenting', () => {
    const store = project();
    const si = resolveUtteranceIntent(FOUNDER, ctxOver(store))!;
    const app = applySemanticIntent(si, ctxOver(store));
    const summary = (app as { summary?: string }).summary ?? '';
    expect(summary.toLowerCase(), summary).toContain('ground');
    expect(summary, summary).toContain('Recessed Downlight');
  });

  it('every preposition the shared tail knows reads the same level', () => {
    for (const s of [
      'change all lightings in ground level to recessed downlight',
      'change all lights on the ground floor to recessed downlight',
      'change all lights in the ground floor to recessed downlight',
      'make all the lights on level 1 recessed downlight',
      'change all lights at ground level to recessed downlight',
    ]) {
      const si = resolveUtteranceIntent(s, ctxOver(project()));
      expect(si, `unclaimed: ${s}`).not.toBeNull();
      expect(si!.intent, s).toBe('set-lighting-type');
      const scope = (si as { scope: unknown }).scope as { kind?: string };
      expect(scope.kind, `${s} → ${JSON.stringify(scope)}`).toBe('level');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// C — the unscoped and selection sentences still work, and the guards hold
// ─────────────────────────────────────────────────────────────────────────────

describe('C — the rest of the family', () => {
  it('a sentence with no place phrase is project-wide, exactly as before', () => {
    const si = resolveUtteranceIntent('change all lights to pendant', ctxOver(project()));
    expect(si!.intent).toBe('set-lighting-type');
    expect((si as { scope: unknown }).scope).toBe('all');
  });

  it('the nouns the product actually uses all reach the family', () => {
    for (const s of [
      'change all lights to pendant',
      'change all lightings to pendant',
      'change all lamps to pendant',
      'change all luminaires to pendant',
      'make all the light fixtures pendant',
      'change the lighting type to pendant',
    ]) {
      const si = resolveUtteranceIntent(s, ctxOver(project()));
      expect(si, `unclaimed: ${s}`).not.toBeNull();
      expect(si!.intent, s).toBe('set-lighting-type');
    }
  });

  it("⛔ switching and dimming are ANOTHER capability's sentences — declined, not refused", () => {
    for (const s of [
      'turn all the lights off',
      'turn all the lights on',
      'make all lights brighter',
      'set all lights to dim',
    ]) {
      const si = resolveUtteranceIntent(s, ctxOver(project()));
      const intent = si === null ? null : si.intent;
      expect(intent, `${s} was claimed as ${String(intent)}`).not.toBe('set-lighting-type');
    }
  });

  it('⭐ a fixture name CONTAINING a reject word still resolves — whole-ref, never substring', () => {
    // "Emergency Downlight (Maintained)" and "Up/Down Wall Sconce" are real
    // catalogue names. A substring reject would deny type names this family
    // exists to accept (C68 §3.d, one layer earlier).
    const si = resolveUtteranceIntent(
      'change all lights to emergency downlight (maintained)', ctxOver(project()),
    );
    expect(si, 'unclaimed').not.toBeNull();
    expect(si!.intent).toBe('set-lighting-type');
    const app = applySemanticIntent(si!, ctxOver(project()));
    expect(app.kind, JSON.stringify(app)).toBe('commands');
    expect(commandsOf(app)[0]!.payload['newTypeId']).toBe('emergency_downlight');
  });

  it('⛔ "change all ceiling lights to X" is a MISS, never a wrong ceiling-type refusal', () => {
    const app = resolveUtteranceIntent('change all ceiling lights to downlight', ctxOver(project()));
    // The ceiling family declines it (rejectRef) and the lighting family cannot
    // claim it (its nouns must follow the scope word). A miss is the honest
    // answer: "ceiling lights" is a real ask nothing serves yet.
    expect(app === null || app.intent !== 'set-ceiling-type', JSON.stringify(app)).toBe(true);
  });

  it('an unresolvable level DECLINES the sentence — it never widens to the project', () => {
    const store = project();
    const si = resolveUtteranceIntent(
      'change all lights on level 9 to pendant', ctxOver(store),
    )!;
    expect((si as { scope: { kind?: string } }).scope.kind).toBe('level');
    const app = applySemanticIntent(si, ctxOver(store));
    expect(app.kind).toBe('refusal');
    expect(commandsOf(app).length).toBe(0);
  });

  it('⛔⛔ A FLOOR LAMP IS A FIXTURE, NOT A FLOOR FINISH — the measured mis-claim', () => {
    // MEASURED 2026-08-24 while adding this family: three of the twelve named
    // fixtures are FLOOR lamps, and `set-floor-finish` claimed every sentence
    // naming one, because `FLOOR_NOUN` matched the word "floor" inside the
    // FIXTURE NAME:
    //
    //   "change all lights to brass arc floor lamp" → set-floor-finish, ref "brass"
    //
    // ⛔ Not a miss — a DESTRUCTIVE mis-claim: it would have repainted every
    // floor in the project brass while the user was talking about luminaires.
    for (const s of [
      'change all lights to brass arc floor lamp',
      'change all lights to wood post floor lamp',
      'change all lights to black tripod floor lamp',
      'change all lights to terracotta table lamp',
      'make all the lights brass arc floor lamp',
      'change the lighting type to brass arc floor lamp',
    ]) {
      const si = resolveUtteranceIntent(s, ctxOver(project()));
      expect(si, `unclaimed: ${s}`).not.toBeNull();
      expect(si!.intent, `${s} → ${JSON.stringify(si)}`).toBe('set-lighting-type');
      expect((si as { typeRef: string }).typeRef, s).toContain('lamp');
    }
  });

  it('⭐ and "light oak" is STILL a floor finish — the guard did not narrow that family', () => {
    // The control. `light` / `lights` are deliberately NOT in the floor
    // grammar's other-family list: "light" is an adjective on a real finish
    // (`Wood · Oak (Light)`), and rejecting on it would break the capability in
    // order to protect it. A fix that passes by narrowing fails here.
    const si = resolveUtteranceIntent('change all floors to light oak', ctxOver(project()));
    expect(si, 'the floor finish sentence became unclaimed').not.toBeNull();
    expect(si!.intent).toBe('set-floor-finish');
  });

  it('the family declares only the spatial kinds it can answer', () => {
    const family = CATALOGUE_FAMILIES.find((f) => f.intent === 'set-lighting-type')!;
    expect(family.spatialKinds).toEqual(['level', 'room']);
    // A luminaire has no facade; the arm's orientation descriptor returns WALLS.
    expect(family.spatialKinds).not.toContain('orientation');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// D — ⭐⭐ THE READ-BACK. C16 §5.1 CA-21: never a `success: true`.
// ─────────────────────────────────────────────────────────────────────────────

describe('D — the change reaches the record the fragment builder reads', () => {
  /** The store surface `UpdateLightingParametersCommand` declares, over the
   *  same three-fixture project. */
  function env(store: Map<string, Fixture>) {
    const rebuilt: string[] = [];
    const lightingStore = {
      has: (id: string) => store.has(id),
      get: (id: string) => store.get(id),
      update: (id: string, patch: Record<string, unknown>) => {
        const cur = store.get(id);
        if (cur === undefined) return;
        store.set(id, { ...cur, ...patch, id } as Fixture);
      },
    };
    // ⚠ A MEASURED PROPERTY OF THE COMMAND, not test scaffolding.
    // `UpdateLightingParametersCommand` reads `window.lightingStore` as its
    // fallback and `window.lightingFragmentBuilder` UNGUARDED — both are bare
    // `window` references (its own `// TODO(TASK-08)`), so in a non-DOM runtime
    // it throws a ReferenceError that its try/catch converts into
    // `{ success: false, error: "window is not defined" }`. That is harmless in
    // the browser it ships to and it is the reason this line exists; recording
    // it here beats discovering it from a silent `success:false` later.
    const w = globalThis as unknown as Record<string, unknown>;
    w['window'] = w['window'] ?? w;
    w['lightingStore'] = lightingStore;
    w['lightingFragmentBuilder'] = {
      update: (d: { id: string }) => { rebuilt.push(d.id); },
    };
    return { ctx: { stores: { lightingStore } } as unknown as CommandContext, rebuilt };
  }

  it('⭐ two fixtures on Ground carry the new fixtureType; the one upstairs does NOT', () => {
    const store = project();
    const si = resolveUtteranceIntent(
      "change all lightings in ground level to recessed downlight", ctxOver(store),
    )!;
    const app = applySemanticIntent(si, ctxOver(store));
    const cmds = commandsOf(app);
    const { ctx, rebuilt } = env(store);

    // The translation `element.changeType`'s lighting branch performs, and the
    // guard it performs FIRST. If the chat ever produced an id outside the
    // catalogue, that branch warns and returns — so it is asserted, not assumed.
    for (const c of cmds) {
      const newTypeId = String(c.payload['newTypeId']);
      expect(getLightingTypeDefinition(newTypeId)).toBeDefined();
      const result = new UpdateLightingParametersCommand({
        elementId: String(c.payload['elementId']),
        patch: { fixtureType: newTypeId as never },
      }).execute(ctx);
      expect(result.success, JSON.stringify(result)).toBe(true);
    }

    // ⭐ THE READ-BACK, out of the store the builders read — not a return value.
    expect(store.get('light-g1')!.fixtureType).toBe('recessed_downlight');
    expect(store.get('light-g2')!.fixtureType).toBe('recessed_downlight');
    // ⛔ THE NEGATIVE, at the store rather than at the payload.
    expect(store.get('light-u1')!.fixtureType).toBe('pendant');

    // And the mesh: a fixture's whole geometry switches on its type, so the
    // builder must have been asked to rebuild — twice, and never for L1.
    expect(rebuilt.sort()).toEqual(['light-g1', 'light-g2']);
  });

  it('the swap is IN PLACE — id, level and position survive it', () => {
    const store = project();
    const before = { ...store.get('light-g1')! };
    const { ctx } = env(store);
    new UpdateLightingParametersCommand({
      elementId: 'light-g1',
      patch: { fixtureType: 'linear_pendant' as never },
    }).execute(ctx);
    const after = store.get('light-g1')!;
    expect(after.id).toBe(before.id);
    expect(after.levelId).toBe(before.levelId);
    expect(after.position).toEqual(before.position);
    expect(after.fixtureType).toBe('linear_pendant');
  });

  it('undo restores the prior fixture type exactly (C84 EI-7)', () => {
    const store = project();
    const { ctx } = env(store);
    const cmd = new UpdateLightingParametersCommand({
      elementId: 'light-g1',
      patch: { fixtureType: 'recessed_downlight' as never },
    });
    cmd.execute(ctx);
    expect(store.get('light-g1')!.fixtureType).toBe('recessed_downlight');
    cmd.undo(ctx);
    expect(store.get('light-g1')!.fixtureType).toBe('pendant');
  });
});
