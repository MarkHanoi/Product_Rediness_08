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
// RAC U7.2 — the catalogue-family table (window / door / slab / ceiling).
import {
  CATALOGUE_FAMILIES,
  catalogueFamilyTargets,
} from '../src/intents/CatalogueFamilies.js';

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
      'set-sill-height': ['window'],
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
      // L-620: a family may only dispatch a *Batch verb — never a plugin
      // `*.setType`, which writes a detached DTO store.
      expect(family.busCommand.endsWith('SystemTypeBatch'), family.intent).toBe(true);
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
    expect(r!.reason).toContain('I can change door height, width and door type.');
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
