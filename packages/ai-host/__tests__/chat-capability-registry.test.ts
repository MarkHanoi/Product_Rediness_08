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
  normalizeElementKind,
  resolveChatCapability,
  CHAT_UNAVAILABLE,
  GENERIC_PARAMETER_TARGETS,
  PROBE_ELEMENT_KINDS,
} from '../src/capabilities/ChatCapabilityRegistry.js';
import {
  capabilityGapRefusal,
  describeCapabilitiesFor,
  nonImperativeReason,
  unconnectedTopicCommands,
  unconnectedTopicLabels,
} from '../src/capabilities/CapabilityRefusal.js';
import {
  applySemanticIntent,
  type ResolverContext,
} from '../src/intents/ZeroTokenResolver.js';

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

  it('a capability either dispatches a bus command or declares a local action — never neither', () => {
    for (const cap of allChatCapabilities()) {
      const wired = cap.busCommand !== null || cap.localAction !== undefined;
      expect(wired, `${cap.id} does nothing`).toBe(true);
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

  it('set-height claims exactly what UpdateElementParameterCommand can route', () => {
    const cap = resolveChatCapability('set-height')!;
    expect([...(cap.targets as readonly string[])].sort())
      .toEqual([...GENERIC_PARAMETER_TARGETS].sort());
    // …and NOT the kinds whose store lookup falls through to `default: null`.
    for (const kind of ['room', 'ceiling', 'floor', 'lighting', 'plumbing']) {
      expect(capabilityAppliesTo(cap, kind), kind).toBe(false);
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

  it('element-scoped capabilities carry a source-anchored commandProof', () => {
    for (const cap of allChatCapabilities()) {
      if (cap.targets === 'global') continue;
      expect(cap.commandProof, `${cap.id} has no commandProof`).toBeDefined();
      expect(cap.commandProof!.mustMention.length).toBeGreaterThan(0);
    }
  });
});

// ─── Refusal generation ──────────────────────────────────────────────────────

describe('capability-aware refusals', () => {
  it('names the gap AND what is possible — the founder\'s example, verbatim shape', () => {
    const r = capabilityGapRefusal('paint the wall blue', []);
    expect(r).not.toBeNull();
    expect(r!.reason).toBe(
      "Wall colour isn't connected to chat yet. I can change wall height, thickness and type.",
    );
  });

  it('falls back to the SELECTION when the utterance names no element kind', () => {
    const r = capabilityGapRefusal('change the colour', ['wall']);
    expect(r?.reason).toContain('Wall colour');
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
  });

  it('no unconnected topic collides with a live capability (no manufactured refusals)', () => {
    const liveWords = new Set(
      allChatCapabilities().flatMap((c) => [...c.verbs, ...c.aliases, c.refusalLabel ?? '']),
    );
    for (const label of unconnectedTopicLabels()) {
      expect(liveWords.has(label), `topic "${label}" is also a live capability alias`).toBe(false);
    }
  });

  it('every topic the language table refuses is also declared in CHAT_UNAVAILABLE', () => {
    for (const cmd of unconnectedTopicCommands()) {
      expect(chatUnavailableReason(cmd), `${cmd} missing from CHAT_UNAVAILABLE`).toBeDefined();
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
