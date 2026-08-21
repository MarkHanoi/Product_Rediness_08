// ADR-0313 §Capability-driven resolution — registry TRUTH tests.
//
// The registry's whole value is that it does not lie. `ElementCapabilities.ts`
// in packages/input-host advertises Mirror / Offset / Scale on seven element
// families whose commands are wall-only and refuse at canExecute; that table
// was never checked against the commands it described, and it drifted. These
// tests are the check that table never had, run against the SAME
// `applySemanticIntent` the chat runs.
//
// The gate `tools/ga-gate/check-chat-capability-coverage.ts` performs the same
// probe plus the source-anchored half in CI. Both exist on purpose: the gate
// blocks the merge, the spec fails the package suite where the change is made.

import { describe, it, expect } from 'vitest';
import {
  allChatCapabilities,
  capabilitiesForElement,
  capabilityAppliesTo,
  capabilityBusCommands,
  chatUnavailableReason,
  commandProofsOf,
  normalizeElementKind,
  resolveChatCapability,
  CHAT_UNAVAILABLE,
  GENERIC_PARAMETER_TARGETS,
  PROBE_ELEMENT_KINDS,
} from '../src/capabilities/ChatCapabilityRegistry.js';
import {
  CHAT_CLASSIFIED,
  classificationBreakdown,
} from '../src/capabilities/ChatCommandClassification.js';
// §L-1032 — the LEVEL-CHANGE REGISTER (L1). Imported so the matrix row for
// `move-to-level` is DERIVED from the same rows the capability derives from,
// rather than transcribed into a literal that rots the next time a family
// moves between the movable and refused halves.
import { LEVEL_CHANGE_VERBS } from '@pryzm/command-bus';
import {
  capabilityGapRefusal,
  describeCapabilitiesFor,
  nonImperativeReason,
  unconnectedTopicCommands,
  unconnectedTopics,
} from '../src/capabilities/CapabilityRefusal.js';
import {
  applySemanticIntent,
  type ResolverContext,
} from '../src/intents/ZeroTokenResolver.js';
// RAC U7.1 — the property vocabulary. Imported HERE (and never by the registry
// module itself, which the vocabulary depends on) so the "targets === routes"
// drift check exists without a module-load cycle.
import {
  allPropertyEntries,
  propertyTargets,
} from '../src/intents/PropertyVocabulary.js';
// RAC U7.2 — the catalogue-family table (window / door / slab / ceiling / the
// two stair families).
import {
  CATALOGUE_FAMILIES,
  catalogueFamilyTargets,
} from '../src/intents/CatalogueFamilies.js';
// §GATE-FANOUT-RATCHET (L-1445) — the spec table, so the fan-out count is taken
// over EVERY capability rather than only the ones a given family table declares.
import { EXECUTION_SPECS } from '../src/intents/CapabilityExecutionSpec.js';

const ctxSelecting = (kind: string): ResolverContext => ({
  selection: [{ elementId: `probe-${kind}`, elementType: kind }],
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
  activeLevelId: 'L0',
  mintId: () => 'probe-level',
});

describe('registry shape', () => {
  it('ids are unique and match the SemanticIntent they are reached by', () => {
    const ids = allChatCapabilities().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const cap of allChatCapabilities()) {
      expect(cap.probe.intent, `${cap.id}'s probe uses a different intent`).toBe(cap.id);
    }
  });

  it('every capability declares a description, a verb and at least one example', () => {
    for (const cap of allChatCapabilities()) {
      expect(cap.description.length, cap.id).toBeGreaterThan(0);
      expect(cap.verbs.length, cap.id).toBeGreaterThan(0);
      expect(cap.examples.length, cap.id).toBeGreaterThan(0);
    }
  });

  it('every required parameter names a value SOURCE, not just a type', () => {
    for (const cap of allChatCapabilities()) {
      for (const p of cap.parameters) {
        expect(p.valueSource, `${cap.id}.${p.name}`).toBeTruthy();
        expect(p.example.length, `${cap.id}.${p.name}`).toBeGreaterThan(0);
      }
    }
  });

  it('a capability dispatches a bus command, declares a local action, or composes others — never nothing', () => {
    for (const cap of allChatCapabilities()) {
      // §PLAN (RAC U6) — a COMPOSITE capability (`execute-plan`) dispatches the
      // commands of the capabilities it sequences, so it declares none of its
      // own. Every other null-busCommand capability is the "does nothing"
      // defect and still fails here and in the gate.
      const wired = cap.busCommand !== null || cap.localAction !== undefined || cap.composite === true;
      expect(wired, `${cap.id} does nothing`).toBe(true);
      if (cap.composite === true) {
        expect(cap.busCommand, `${cap.id} is composite and must claim no command of its own`).toBeNull();
      }
    }
  });

  it('the wall-type capability sources its parameter from the project catalogue', () => {
    const cap = resolveChatCapability('set-wall-type');
    expect(cap).not.toBeNull();
    expect(cap!.busCommand).toBe('wall.updateSystemTypeBatch');
    expect(cap!.parameters[0]!.valueSource).toBe('wall-system-types');
    expect(cap!.targets).toEqual(['wall']);
  });
});

// ─── The anti-ElementCapabilities probe ──────────────────────────────────────

describe('targets are PROVEN against the live guard, not merely declared', () => {
  for (const cap of allChatCapabilities()) {
    if (cap.targets === 'global') continue;
    it(`${cap.id}: accepted kinds === declared kinds, exactly`, () => {
      const accepted: string[] = [];
      for (const kind of PROBE_ELEMENT_KINDS) {
        if (applySemanticIntent(cap.probe, ctxSelecting(kind)).kind !== 'refusal') accepted.push(kind);
      }
      const declared = PROBE_ELEMENT_KINDS.filter((k) => capabilityAppliesTo(cap, k));
      // Both directions matter: a declared-but-refused target is a lie to the
      // user; an accepted-but-undeclared kind is silent over-reach that the
      // refusal generator would never mention.
      expect(accepted.sort()).toEqual([...declared].sort());
    });
  }

  it('set-height claims what UpdateElementParameterCommand can route, plus the proven ceiling route', () => {
    const cap = resolveChatCapability('set-height')!;
    // §PROP-BEAM-HEIGHT-LIE (RAC U7.1) — beam is EXCLUDED although
    // resolveStore() routes it: BeamData has no `height` field and
    // BeamFragmentBuilder builds from width × depth, so the write was a
    // silent no-op reported as success.
    expect([...(cap.targets as readonly string[])].sort())
      .toEqual([...GENERIC_PARAMETER_TARGETS.filter((k) => k !== 'beam'), 'ceiling'].sort());
    expect(capabilityAppliesTo(cap, 'beam')).toBe(false);
    // …and NOT the kinds whose store lookup falls through to `default: null`
    // and which have no dedicated height command wired.
    for (const kind of ['room', 'floor', 'lighting', 'plumbing']) {
      expect(capabilityAppliesTo(cap, kind), kind).toBe(false);
    }
  });

  // §FEAT-CHAT-SYMMETRY — the capability × kind MATRIX, spelled out as a
  // literal so drift is visible in the diff, not just in a probe failure.
  it('the element-scoped capability matrix matches the declared literal', () => {
    const expected: Record<string, readonly string[]> = {
      'zoom-selected': [...PROBE_ELEMENT_KINDS],
      'delete-selected': [...PROBE_ELEMENT_KINDS],
      // §GATE-VIS-INTENT (VIS-CLASS) — visibility is id-keyed and kind-agnostic
      // by construction (the intent store never consults a per-kind store), so
      // every kind is a legitimate target — the zoom-selected argument.
      'hide-selection': [...PROBE_ELEMENT_KINDS],
      'isolate-selection': [...PROBE_ELEMENT_KINDS],
      'set-height': [...GENERIC_PARAMETER_TARGETS.filter((k) => k !== 'beam'), 'ceiling'],
      'set-thickness': ['wall', 'slab', 'roof'],
      // RAC U7.1 — column / beam / furniture joined as metadata only.
      'set-width': ['door', 'window', 'stair', 'column', 'beam', 'furniture'],
      // RAC U7.1 — the PROPERTY VOCABULARY capabilities.
      'set-depth': ['beam', 'column'],
      'set-length': ['furniture'],
      'set-base-offset': ['wall', 'slab', 'column', 'roof', 'curtain-wall', 'furniture', 'handrail'],
      // RAC U7.3 — the extension proof: four properties added as table rows +
      // registry metadata, zero resolver lines.
      // RAC U9.2 — the four generated scoped-delete families.
      'delete-furniture-scoped': ['furniture'],
      'delete-windows-scoped': ['window'],
      'delete-doors-scoped': ['door'],
      'delete-columns-scoped': ['column'],
      'set-mullion-size': ['curtain-wall'],
      'set-panel-thickness': ['curtain-wall'],
      'set-baluster-spacing': ['handrail'],
      'set-baluster-width': ['handrail'],
      // §FEAT-DOOR-SILL-DECLARED — 'door' added 2026-08-17. NOT a widening for
      // convenience: DoorData.sillHeight is a required field, DoorBuilder reads it
      // (`elevation + door.sillHeight + door.height / 2`), the door panel edits it,
      // and `UpdateElementParameterCommand` already routes 'door' writes through
      // the same generic arm as 'window'. The store could always do it; only this
      // declaration refused.
      'set-sill-height': ['window', 'door'],
      'set-riser-height': ['stair'],
      'set-tread-depth': ['stair'],
      'set-room-height-offset': ['room'],
      'set-wall-type': ['wall'],
      'set-wall-color': ['wall'],
      // §FEAT-WALL-RAKE-BATCH (ADR-0315) — "make all walls angled by 120 degrees".
      'set-wall-rake': ['wall'],
      // §FEAT-WINDOW-TYPE-BATCH (ADR-0315) — "change the window type to …".
      'set-window-type': ['window'],
      // §FEAT-DOOR-TYPE-BATCH (RAC U4.3) — "change the door type to …" (the
      // spec-arm extension proof: metadata only, zero new case code).
      'set-door-type': ['door'],
      // RAC U7.2 — the two catalogue families generated from CatalogueFamilies.ts.
      'set-slab-type': ['slab'],
      'set-ceiling-type': ['ceiling'],
      // §FEAT-WALL-LAYER-ADD-BATCH (ADR-0315) — "add a 10mm plaster layer …".
      'add-wall-layer': ['wall'],
      // §FEAT-WALL-SIDE-FINISH — "make all inner finishes walls in ground floor
      // to X". Wall-only: `sideFinishes` is a WallData field, and the
      // 'interior'/'exterior' side vocabulary is the wall LAYER-function axis.
      'set-wall-side-finish': ['wall'],
      // §FEAT-WINDOW-PARAMETRIC-CREATE (ADR-0315) — "a window in every wall segment".
      'create-windows-parametric': ['wall'],
      'set-roof-pitch': ['roof'],
      // §PROP-OVERHANG (VERBS-CAP) — the eave. Roof-only: `overhang` is a
      // RoofData field and no other kind carries it.
      'set-overhang': ['roof'],
      'rename-room': ['room'],
      'set-room-number': ['room'],
      // §FEAT-CHAT-ROOM-OCCUPANCY — the founder's "a bathroom in room 001".
      'set-room-occupancy': ['room'],
      // §FEAT-BULK-DIMENSIONS (L-949) — the three generated bulk-dimension
      // families. One kind each, by construction: a family's scope resolves
      // through `{kind:'all', elementKind}` and its carrier addresses that kind
      // and no other.
      // §FEAT-FLOOR-SURFACE-FINISH (L-1881) — floor-only, by construction: the
      // grammar REFUSES any sentence naming another family's noun, because
      // floor-vs-slab is a decision and not a coin-flip (CatalogueFamilies.ts).
      'set-floor-finish': ['floor'],
      'set-wall-dimensions': ['wall'],
      'set-window-dimensions': ['window'],
      'set-door-dimensions': ['door'],
      // §L-1032 — DERIVED, not literal, and the difference is the whole point.
      //
      // Every other row above is a HAND-WRITTEN claim, and this test exists so
      // that widening one is a conscious act. `move-to-level` has no
      // hand-written claim to widen: its targets ARE `LEVEL_CHANGE_VERBS`, the
      // L1 register the property panel and the event bridge read, mapped
      // through the same `normalizeElementKind` this file already imports.
      //
      // A literal here would have gone RED on 2026-08-19, when L-1087 demoted
      // beam / furniture / lighting / plumbing out of the register (their meshes
      // are seated at a stored absolute Y, so a storey change would leave them
      // hovering at the old floor) — reporting a TRUE change to the register as
      // a capability regression, which is the alarm nobody should learn to
      // ignore. What is pinned instead, by EXECUTION, is in moveToLevel.test.ts:
      // every declared target really dispatches its own verb, and every family
      // the register refuses really refuses, with the register's own sentence.
      // §FEAT-CHAT-STAIR-TYPES (L-1441) — two families, two kinds, and the
      // pair is the assertion: a stair and its railings are DIFFERENT elements
      // and neither may claim the other's kind.
      'set-stair-dimensions': ['stair'],
      'set-stair-type': ['stair'],
      'set-stair-railing-type': ['stair-railing'],
      'move-to-level': [
        ...new Set(
          Object.values(LEVEL_CHANGE_VERBS).flatMap((s) => s.panelTypes.map(normalizeElementKind)),
        ),
      ],
    };
    for (const cap of allChatCapabilities()) {
      if (cap.targets === 'global') continue;
      expect(expected[cap.id], `capability ${cap.id} missing from the matrix literal`).toBeDefined();
      expect([...cap.targets].sort(), cap.id).toEqual([...expected[cap.id]!].sort());
    }
  });

  // ── RAC U7.2 — the catalogue families are the single source of their claims ─
  it('every catalogue family declares exactly its own element kind, and a live batch verb', () => {
    for (const family of CATALOGUE_FAMILIES) {
      const cap = resolveChatCapability(family.intent);
      expect(cap, `${family.intent} has a family entry but no registry metadata`).not.toBeNull();
      expect([...(cap!.targets as readonly string[])], family.intent)
        .toEqual([...catalogueFamilyTargets(family.intent)]);
      expect(cap!.busCommand, family.intent).toBe(family.busCommand);
      // ⭐⭐ §FIX-BATCH-GATE-CHECKED-THE-NAME (L-1441, 2026-08-20) — THIS GATE
      // ASSERTED A NAMING CONVENTION AND CALLED IT AN INVARIANT.
      //
      // It read `expect(family.busCommand.endsWith('SystemTypeBatch')).toBe(true)`
      // under the comment *"L-620: a family may only dispatch a *Batch verb —
      // never a plugin `*.setType`, which writes a detached DTO store."*
      //
      // THE COMMENT NAMES THE REAL RULE AND THE ASSERTION DOES NOT CHECK IT.
      // L-620's finding is about WHERE A VERB WRITES — the detached plugin DTO
      // stores nothing renders, exports or persists. The suffix `SystemTypeBatch`
      // was a PROXY for that, true of the four families that existed, and a
      // proxy that classifies by NAME can be satisfied by RENAMING and defeated
      // by not renaming. A plugin handler called `wall.setSystemTypeBatch` would
      // have passed this gate while writing a detached store; `stair.updateParameters`
      // fails it while writing the geometry store the builders read.
      //
      // Both halves of that are live facts, not hypotheticals — CLAUDE.md
      // records the same name-blindness for the commandManager gates, where
      // "a gate that classifies by NAME can be satisfied by RENAMING" produced
      // three rival counters disagreeing about one subject.
      //
      // So the gate now checks the two things L-620 actually cares about:
      //
      //   (a) THE VERB IS NOT A PLUGIN DTO `*.setType`. That family of verbs is
      //       the named anti-pattern, and it is checkable directly.
      //   (b) THE REGISTRY CARRIES A commandProof FOR THE ROUTE. That is the
      //       artefact that records WHERE the verb writes, and the separate
      //       `commandProof` gate below re-reads the cited file and asserts it
      //       still mentions the store and command named. A family that cannot
      //       produce that proof cannot ship, which is a stronger bar than any
      //       spelling of its verb.
      //
      // ⚠ THE BATCH PROPERTY ITSELF IS NOT DISCARDED — it is DECLARED instead of
      // spelled. A family without a batch verb must set `fanOutPerId`, which
      // costs it the one-undo property and says so out loud through
      // `dispatchCommands` ("undo with Ctrl+Z (N steps)"). So "is this one undo
      // step?" is still answered for every family; it is answered by a field the
      // author had to choose rather than by the shape of a string.
      expect(/\.set(Type|SystemType)$/.test(family.busCommand), `${family.intent} dispatches a plugin DTO setType verb`)
        .toBe(false);
      expect(cap!.commandProof, `${family.intent} has no commandProof naming where its verb writes`)
        .toBeDefined();
      // A family that is NOT a batch verb must have declared the fan-out, so the
      // undo granularity is a stated trade rather than an accident.
      if (!family.busCommand.endsWith('Batch')) {
        expect(family.fanOutPerId, `${family.intent} is not a batch verb and must declare fanOutPerId`)
          .toBe(true);
      }
    }
  });

  it('an unknown type ref refuses by LISTING the real catalogue names', () => {
    const ctx: ResolverContext = {
      ...ctxSelecting('slab'),
      catalogues: {
        slab: {
          resolve: () => null,
          names: ['RC Slab – Monolithic 200mm', 'Composite Deck – 300mm'],
        },
      },
    };
    const r = applySemanticIntent(
      { intent: 'set-slab-type', typeRef: 'unobtainium', scope: 'selection' },
      ctx,
    );
    expect(r.kind).toBe('refusal');
    if (r.kind === 'refusal') {
      expect(r.reason).toContain('RC Slab – Monolithic 200mm');
      expect(r.reason).toContain('Composite Deck – 300mm');
    }
  });

  // ── RAC U7.1 — the vocabulary is the single source of the property claims ──
  it('every property capability declares exactly the kinds its ROUTES serve', () => {
    for (const entry of allPropertyEntries()) {
      const cap = resolveChatCapability(entry.id);
      expect(cap, `${entry.id} has a vocabulary entry but no registry metadata`).not.toBeNull();
      expect([...(cap!.targets as readonly string[])].sort(), entry.id)
        .toEqual([...propertyTargets(entry.id)].sort());
    }
  });

  it('every property route names a live bus command the capability declares', () => {
    for (const entry of allPropertyEntries()) {
      const cap = resolveChatCapability(entry.id)!;
      const declared = new Set([cap.busCommand, ...(cap.alsoDispatches ?? [])]);
      for (const route of entry.routes) {
        expect(declared.has(route.busCommand), `${entry.id} → ${route.busCommand}`).toBe(true);
      }
    }
  });

  it('declared targets are in normalized form and inside the probed universe', () => {
    for (const cap of allChatCapabilities()) {
      if (cap.targets === 'global') continue;
      for (const t of cap.targets) {
        expect(normalizeElementKind(t)).toBe(t);
        expect(PROBE_ELEMENT_KINDS).toContain(t);
      }
    }
  });

  it('element-scoped capabilities carry a source-anchored commandProof per route', () => {
    for (const cap of allChatCapabilities()) {
      if (cap.targets === 'global') continue;
      const proofs = commandProofsOf(cap);
      expect(proofs.length, `${cap.id} has no commandProof`).toBeGreaterThan(0);
      for (const proof of proofs) {
        expect(proof.mustMention.length, `${cap.id}: ${proof.file}`).toBeGreaterThan(0);
      }
    }
  });
});

// ─── Refusal generation ──────────────────────────────────────────────────────

describe('capability-aware refusals', () => {
  it('names the gap AND what is possible — for a kind whose colour is still unconnected', () => {
    // §FEAT-WALL-COLOR-BATCH (ADR-0314): WALL colour is live now, so the
    // founder's original example moved to the DOOR — whose colour route
    // (door.setFrameColor) is still deliberately deferred.
    const r = capabilityGapRefusal('paint the door blue', []);
    expect(r).not.toBeNull();
    expect(r!.reason).toContain("Door colour isn't connected to chat yet.");
    // RAC U4.3 — the offer list grew truthfully: set-door-type is live now.
    // §FEAT-DOOR-SILL-DECLARED — 'sill height' joins the offer because
    // `set-sill-height` now declares 'door'. This string is GENERATED from the
    // registry, never hand-written, so it moving is the evidence the declaration
    // reached the sentence the user actually reads.
    expect(r!.reason).toContain('I can change door height, width, sill height and door type.');
  });

  it('does NOT manufacture a colour refusal for walls — wall colour is a live capability', () => {
    // The topic excludes 'wall' (excludeKinds): a wall-colour ask the grammar
    // couldn't parse is a MISS for the LLM, never a false "isn't connected".
    expect(capabilityGapRefusal('paint the wall blue', [])).toBeNull();
    expect(capabilityGapRefusal('change the colour', ['wall'])).toBeNull();
  });

  it('falls back to the SELECTION when the utterance names no element kind', () => {
    const r = capabilityGapRefusal('change the colour', ['slab']);
    expect(r?.reason).toContain('Slab colour');
  });

  it('the offer is generated from the registry, so it can never offer a refused ability', () => {
    for (const kind of PROBE_ELEMENT_KINDS) {
      const sentence = describeCapabilitiesFor(kind);
      for (const cap of capabilitiesForElement(kind)) {
        if (cap.refusalLabel === undefined) continue;
        expect(sentence, `${kind} / ${cap.id}`).toContain(cap.refusalLabel);
        // …and the offer is honoured: the guard accepts this kind.
        expect(applySemanticIntent(cap.probe, ctxSelecting(kind)).kind).not.toBe('refusal');
      }
    }
  });

  it('an ask we have no command for stays a MISS — a refusal must not be a guess', () => {
    expect(capabilityGapRefusal('make it cozier', ['wall'])).toBeNull();
    expect(capabilityGapRefusal('generate a layout', ['wall'])).toBeNull();
    // A topic with no identifiable element kind is also a miss.
    expect(capabilityGapRefusal('change the colour', [])).toBeNull();
  });

  it('never refuses a question, a negation or a hypothetical — those are the LLM\'s', () => {
    expect(capabilityGapRefusal('what colour is this wall?', ['wall'])).toBeNull();
    expect(capabilityGapRefusal("don't paint the wall", ['wall'])).toBeNull();
    expect(capabilityGapRefusal('I was thinking about painting the wall', ['wall'])).toBeNull();
  });

  it('nonImperativeReason distinguishes a request from a question', () => {
    expect(nonImperativeReason('could you make this wall 3m tall?')).toBeNull();
    expect(nonImperativeReason('how tall is this wall?')).toBe('interrogative');
    expect(nonImperativeReason("don't change the height")).toBe('negated');
    expect(nonImperativeReason('I was thinking about changing the height')).toBe('hypothetical');
    // §FIX-CHAT-REPORT-PASTEBACK (founder P0) — a DESCRIPTION of what already
    // happened is never an instruction, however command-shaped it reads.
    expect(
      nonImperativeReason(
        'Built 6 floors — 18 apartments, 3 per apartment floor on average (apartments 72% of the plate)',
      ),
    ).toBe('descriptive');
    expect(nonImperativeReason('Built 6 floors')).toBe('descriptive');
    expect(nonImperativeReason('3 per apartment floor on average')).toBe('descriptive');
    expect(nonImperativeReason('add a level at 9m')).toBeNull();
    expect(nonImperativeReason('build a wall from (0,0) to (5,0)')).toBeNull();
  });

  it('no unconnected topic collides with a live capability (no manufactured refusals)', () => {
    // ADR-0314: a topic word MAY coexist with a live capability ONLY when the
    // topic excludes every element kind that capability targets — the refusal
    // then never fires for a kind the resolver actually serves ('colour' is
    // live for walls, still a gap for everything else).
    for (const topic of unconnectedTopics()) {
      for (const cap of allChatCapabilities()) {
        const words = new Set([...cap.verbs, ...cap.aliases, cap.refusalLabel ?? '']);
        if (!words.has(topic.label)) continue;
        expect(cap.targets, `topic "${topic.label}" collides with GLOBAL capability ${cap.id}`)
          .not.toBe('global');
        for (const t of cap.targets as readonly string[]) {
          expect(
            topic.excludeKinds?.includes(t) ?? false,
            `topic "${topic.label}" fires for kind "${t}" that capability ${cap.id} serves — manufactured refusal`,
          ).toBe(true);
        }
      }
    }
  });

  it('every topic the language table refuses is also declared in CHAT_UNAVAILABLE', () => {
    for (const cmd of unconnectedTopicCommands()) {
      expect(chatUnavailableReason(cmd), `${cmd} missing from CHAT_UNAVAILABLE`).toBeDefined();
    }
  });

  it('§FIX-CHAT-DEAD-ROUTES — no capability dispatches a known dead plugin-DTO-store verb', () => {
    // These verbs' handlers produceCommand against DETACHED plugin DTO stores
    // (fresh PluginRegistry instances; no committer bridges updates back —
    // §FIX-MATERIAL-DEAD-DISPATCH). A capability dispatching one reports
    // success while changing nothing. The chat shipped exactly that for eight
    // verbs before the ADR-0315 liveness audit; this pin keeps them out.
    const DEAD_VERBS = [
      'window.setSize', 'window.setSillHeight', 'door.setWidth',
      'slab.setThickness', 'roof.setThickness', 'roof.setPitch',
      'stair.setWidth', 'ceiling.setHeight',
      'wall.setColor', 'wall.bulkSetVisuals',
      // ADR-0315 P1 — the ex-class-F verbs the liveness audit found dead.
      'stair.setRiserHeight', 'stair.setTreadCount', 'slab.setBaseOffset',
      'roof.setOverhang', 'lighting.setIntensity',
    ];
    const dispatched = new Set(capabilityBusCommands());
    for (const dead of DEAD_VERBS) {
      expect(dispatched.has(dead), `capability dispatches DEAD verb ${dead}`).toBe(false);
    }
  });
});

// ─── The honest half ─────────────────────────────────────────────────────────

describe('CHAT_UNAVAILABLE is the honest half, not a dumping ground', () => {
  it('every deferral states a reason a user could read', () => {
    for (const [cmd, reason] of CHAT_UNAVAILABLE) {
      expect(reason.length, cmd).toBeGreaterThan(25);
      expect(reason.endsWith('.'), `${cmd}: "${reason}"`).toBe(true);
    }
  });

  it('nothing is both exposed and deferred', () => {
    for (const cmd of capabilityBusCommands()) {
      expect(CHAT_UNAVAILABLE.has(cmd), `${cmd} is both a capability and deferred`).toBe(false);
    }
  });
});

// ─── The classification roadmap (ADR-0313 §No silent gaps) ───────────────────

describe('CHAT_CLASSIFIED is a roadmap, not a dumping ground', () => {
  it('every entry has a class and a falsifiable reason', () => {
    for (const [cmd, c] of CHAT_CLASSIFIED) {
      expect(['B', 'C', 'D', 'E'].concat('F').includes(c.cls), cmd).toBe(true);
      expect(c.reason.trim().length, cmd).toBeGreaterThanOrEqual(40);
    }
  });

  it('the three declaration surfaces are disjoint', () => {
    const covered = new Set(capabilityBusCommands());
    for (const cmd of CHAT_CLASSIFIED.keys()) {
      expect(covered.has(cmd), `${cmd} is both a capability dispatch and classified`).toBe(false);
      expect(CHAT_UNAVAILABLE.has(cmd), `${cmd} is both deferred and classified`).toBe(false);
    }
  });

  it('every class is populated (the breakdown is real, not vestigial)', () => {
    const b = classificationBreakdown();
    for (const cls of ['B', 'C', 'D', 'E', 'F'] as const) {
      expect(b[cls], cls).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⭐⭐ §GATE-FANOUT-RATCHET (L-1445) — FAN-OUT IS A DEBT, NOT A DESIGN
// ─────────────────────────────────────────────────────────────────────────────
//
// ── WHAT THIS REPLACES, AND WHY THE REPLACEMENT NEEDED A CEILING ────────────
//
// Until L-1441 the catalogue-family gate asserted
// `busCommand.endsWith('SystemTypeBatch')`. That was a SPELLING test — a plugin
// handler named `wall.setSystemTypeBatch` passes it while writing a detached
// DTO store, and `stair.updateParameters` fails it while writing the store the
// builders read; it scored the two cases exactly backwards from what its own
// comment said it was for. It was replaced by three checks on what L-620
// actually cares about (not a plugin DTO setType · a commandProof naming where
// the verb writes, re-read by the sibling gate · a non-batch verb must declare
// `fanOutPerId`).
//
// ⚠ BUT THE OLD TEST DID GUARANTEE ONE REAL THING BY CONSTRUCTION: a `*Batch`
// verb is ONE dispatch, therefore ONE undo entry. The replacement keeps that
// property DECLARABLE rather than REQUIRED — and nothing capped how many
// families take the exit. The cheapest path for every future family is to
// declare `fanOutPerId` and move on, and in a year "N undo steps" would be the
// norm nobody chose. That is precisely how a baseline becomes a ceiling in this
// repository, which is why the exit now has a number on it.
//
// ── ⛔ THE CONTRACT POSITION, STATED PLAINLY: THIS IS A BREACH ──────────────
//
// **C78 §12.1 is a MUST: "One user gesture — the cause and every consequence the
// plan bound to it — is ONE undo unit."** A fan-out family dispatches N commands
// for one sentence, and C78 §12.2 explains why the failure is quiet rather than
// loud: gesture identity is causal, "absence is not membership", so commands
// carrying no gesture id "degrade to chronological undo, silently".
//
// ⭐ SO N-STEPS IS NOT A PERMITTED EXCEPTION. It is a §12.1 breach that the chat
// DISCLOSES ("undo with Ctrl+Z (N steps)"), and a disclosure is not a
// dispensation. Calling it a "disclosed trade" — as `fanOutPerId`'s own doc
// comment did when `set-room-occupancy` shipped — described the honesty of the
// reply, not the compliance of the behaviour, and the two were being conflated.
//
// ⭐ THE COMPLIANT FIX IS NAMED BY THE CONTRACT ITSELF, and it is not "wait for
// a batch verb". C78 §12.3 provides the mechanism: commands may be bound into
// one gesture by threading `gestureId` through `executeCommand`'s
// `opts.gestureId` or `CommandMetadata.gestureId`. A fan-out that stamped one
// gestureId across its N commands would be ONE undo unit and §12.1-compliant
// WITHOUT any new bus verb.
//
// It is NOT done here, and the reason is a seam, not a doubt: `BusCommandRef` is
// `{type, payload}` with no metadata channel, and the half that would have to
// pass it is the editor bridge's dispatch loop. Adding the field on this side
// alone would be a channel with nobody reading it — authored-but-unwired, this
// repository's standing bottleneck. It is logged as a two-lane job instead.
//
// ⚠ AND THE BREACH IS OLDER THAN THESE FAMILIES. `set-room-occupancy` has
// carried it since §FEAT-CHAT-ROOM-OCCUPANCY shipped, under the same
// "disclosed trade" wording and with no contract citation attached. This gate
// counts it too. ⛔ The number is SHRINK-ONLY: a family leaving fan-out lowers
// it; a family joining must edit it deliberately, in the same commit, with a
// reason — never by default.

describe('§GATE-FANOUT-RATCHET — the number of families that undo in N steps', () => {
  /**
   * ⛔ SHRINK-ONLY. Raising this number is a decision about C78 §12.1
   * compliance, not a bookkeeping edit. Read the block above before you touch
   * it — and prefer threading a gestureId (§12.3) or minting the batch verb,
   * either of which LOWERS it.
   */
  const FANOUT_CEILING = 3;

  it(`no more than ${FANOUT_CEILING} capabilities dispatch one command per element`, () => {
    const fanOut = Object.entries(EXECUTION_SPECS)
      .filter(([, spec]) => (spec as { fanOutPerId?: true }).fanOutPerId === true)
      .map(([id]) => id)
      .sort();
    expect(
      fanOut.length,
      `fan-out families are now [${fanOut.join(', ')}]. `
      + 'Each one is a C78 §12.1 breach (one gesture MUST be one undo unit) that the reply '
      + 'discloses rather than fixes. If you added one, say why in the same commit and raise '
      + 'the ceiling deliberately; if you removed one, lower it.',
    ).toBeLessThanOrEqual(FANOUT_CEILING);
  });

  it('every fan-out family names a SINGULAR id field — a plural one would be a batch verb', () => {
    // The two are not interchangeable: `idsField` carries the resolved list for
    // a batch verb and ONE id for a fan-out verb. A fan-out spec with a plural
    // field would stamp the whole list into every command.
    for (const [id, spec] of Object.entries(EXECUTION_SPECS)) {
      const s = spec as { fanOutPerId?: true; idsField: string };
      if (s.fanOutPerId !== true) continue;
      expect(s.idsField.endsWith('Ids'), `${id} fans out but names a plural id field`).toBe(false);
    }
  });
});
