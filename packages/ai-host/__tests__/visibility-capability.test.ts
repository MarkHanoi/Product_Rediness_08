// §GATE-VIS-INTENT / §GATE-QUERYENGINE-READ-ONLY (VIS-CLASS, 2026-08-11)
// =============================================================================
//
// The read-only/visibility capability CLASS — the structural half left open at
// 6b538355. Four capabilities ride the composeRuntime §4d-bis intent path:
//
//   hide-selection      → visibility.hide.selection    (local 'applyVisibilityIntent')
//   isolate-selection   → visibility.isolate.selection (local 'applyVisibilityIntent')
//   reveal-all          → visibility.reveal.all        (local 'applyVisibilityIntent')
//   visibility-query    → NOTHING — it ANSWERS          (local 'answer', readOnly)
//
// What this suite pins, in order:
//  1. the selection-scoped grammars resolve and carry the RIGHT bus command;
//  2. the 6b538355 misread regressions stay fixed (hide level 2 is a MISS that
//     reaches the legacy QueryEngine handler; show level 2 still navigates);
//  3. the read-only question resolves to the READ-ONLY capability and mutates
//     NOTHING — no commands, no visibility dispatch payload, and unreadable
//     state is never reported as empty;
//  4. the registry declares the class honestly (readOnly ⇒ answers only; the
//     mutating three say "view-only / not undoable" out loud).

import { describe, it, expect } from 'vitest';
import {
  resolveUtterance,
  type ResolverContext,
  type ZeroTokenResolution,
} from '../src/intents/ZeroTokenResolver.js';
import { visibilityAskClass, visibilityMisreadReason } from '../src/capabilities/CapabilityRefusal.js';
import { allChatCapabilities, resolveChatCapability } from '../src/capabilities/ChatCapabilityRegistry.js';

let seq = 0;
const ctxOf = (overrides: Partial<ResolverContext> = {}): ResolverContext => ({
  selection: [],
  levels: [
    { id: 'L0', name: 'Level 0', elevation: 0 },
    { id: 'L1', name: 'Level 1', elevation: 3 },
    { id: 'L2', name: 'Level 2', elevation: 6 },
  ],
  activeLevelId: 'L0',
  mintId: () => `vis-${++seq}`,
  ...overrides,
});

const sel = (elementType: string, elementId = `${elementType}-1`) => ({
  selection: [{ elementId, elementType }],
});

type LocalRes = Extract<ZeroTokenResolution, { kind: 'local' }>;

function expectLocal(r: ZeroTokenResolution): LocalRes {
  expect(r.kind).toBe('local');
  return r as LocalRes;
}

// ─── 1. The mutating grammars carry the right dispatch ───────────────────────

describe('§GATE-VIS-INTENT — hide / isolate / reveal resolve onto the intent path', () => {
  it('"hide this wall" → visibility.hide.selection with the selected id', () => {
    const r = expectLocal(resolveUtterance('hide this wall', ctxOf(sel('wall', 'w1'))));
    expect(r.intent).toBe('hide-selection');
    expect(r.action).toBe('applyVisibilityIntent');
    expect(r.visibility).toEqual({ busCommand: 'visibility.hide.selection', elementIds: ['w1'] });
    // HONESTY — the summary must not imply durability that does not exist.
    expect(r.summary).toMatch(/not undoable/);
    expect(r.summary).toMatch(/not saved/);
  });

  it('a multi-selection hides every selected id in ONE dispatch', () => {
    const ctx = ctxOf({
      selection: [
        { elementId: 'w1', elementType: 'wall' },
        { elementId: 'w2', elementType: 'wall' },
      ],
    });
    const r = expectLocal(resolveUtterance('hide the selected walls', ctx));
    expect(r.visibility?.elementIds).toEqual(['w1', 'w2']);
  });

  it('"isolate this room" → visibility.isolate.selection', () => {
    const r = expectLocal(resolveUtterance('isolate this room', ctxOf(sel('room', 'r1'))));
    expect(r.intent).toBe('isolate-selection');
    expect(r.visibility).toEqual({ busCommand: 'visibility.isolate.selection', elementIds: ['r1'] });
  });

  it('"reveal all" / "exit isolation" / "show everything" → visibility.reveal.all', () => {
    for (const u of ['reveal all', 'exit isolation', 'show everything', 'unhide everything']) {
      const r = expectLocal(resolveUtterance(u, ctxOf()));
      expect(r.intent, u).toBe('reveal-all');
      expect(r.visibility, u).toEqual({ busCommand: 'visibility.reveal.all', elementIds: [] });
    }
  });

  it('a noun mismatch refuses whole — "hide the selected walls" over a door hides nothing', () => {
    const r = resolveUtterance('hide the selected walls', ctxOf(sel('door')));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.reason).toContain('door');
    expect(r.reason).toContain('Nothing was changed');
  });

  it('an empty selection refuses honestly, never a silent no-op', () => {
    for (const u of ['hide this wall', 'isolate the selection']) {
      const r = resolveUtterance(u, ctxOf());
      expect(r.kind, u).toBe('refusal');
    }
  });

  it('per-element unhide has NO bus carrier and refuses offering "reveal all"', () => {
    const r = resolveUtterance('unhide this wall', ctxOf(sel('wall')));
    expect(r.kind).toBe('refusal');
    if (r.kind !== 'refusal') return;
    expect(r.intent).toBe('reveal-all');
    expect(r.reason).toContain('per-element unhide');
    expect(r.suggestions).toContain('reveal all');
  });
});

// ─── 2. The 6b538355 regressions stay fixed ──────────────────────────────────

describe('§FIX-CHAT-HIDE-IS-NOT-NAVIGATE — the legacy-path asks stay honest misses', () => {
  it.each([
    // Level and category visibility belong to the LIVE legacy QueryEngine
    // handlers (pryzm-visibility-command → UnifiedBrowserPanel) — the new
    // per-element intent path must NOT claim them (see applyVisibilityIntent's
    // routing-decision header: no per-element unhide verb exists, so a level
    // hide here would be a one-way trap only "reveal all" exits).
    'hide level 2',
    'hide all elements on level 2',
    'turn off level 2',
    'isolate level 2',
    'hide all walls',
    'isolate all doors',
    'isolate doors higher than 2 meters',
    'highlight walls taller than 3m',
    'hide walls', // bare PLURAL = the category ask, legacy-served
  ])('"%s" stays a miss at tier 0/1', (u) => {
    expect(resolveUtterance(u, ctxOf(sel('wall'))).kind).toBe('miss');
  });

  it('"show level 2" is still navigation — THE CONTROL from SECTION D', () => {
    const r = expectLocal(resolveUtterance('show level 2', ctxOf()));
    expect(r.intent).toBe('go-to-level');
    expect(r.action).toBe('setActiveLevel');
  });

  it('the visibility-change class may reach ONLY the visibility capabilities', () => {
    expect(visibilityAskClass('hide this wall')).toBe('visibility-change');
    expect(visibilityMisreadReason('hide this wall', 'hide-selection')).toBeNull();
    expect(visibilityMisreadReason('hide this wall', 'go-to-level')).toBe('visibility');
    expect(visibilityMisreadReason('isolate the tall doors', 'set-height')).toBe('visibility');
    // view-navigation keeps its allowlist AND gains reveal-all.
    expect(visibilityMisreadReason('show level 2', 'go-to-level')).toBeNull();
    expect(visibilityMisreadReason('show everything', 'reveal-all')).toBeNull();
    // read-only-query openers may reach the read-only capability.
    expect(visibilityMisreadReason('list the hidden elements', 'visibility-query')).toBeNull();
  });
});

// ─── 3. The read-only question mutates NOTHING ───────────────────────────────

describe('§GATE-QUERYENGINE-READ-ONLY — visibility-query answers and cannot mutate', () => {
  const READ_ONLY_ASKS = [
    'what is hidden',
    "what's hidden in this view?",
    'which elements are hidden in this view',
    'list the hidden elements',
    'am I in isolation mode?',
    'what levels are visible',
  ];

  it.each(READ_ONLY_ASKS)('"%s" resolves to visibility-query with NO dispatch payload', (u) => {
    const r = expectLocal(resolveUtterance(
      u,
      ctxOf({ visibility: { hiddenCount: 3, isolationActive: true, isolationCount: 2 } }),
    ));
    expect(r.intent).toBe('visibility-query');
    expect(r.action).toBe('answer');
    // The mutation-impossibility proof at the resolution level: an 'answer'
    // carries no bus commands and no visibility dispatch — there is nothing
    // the bridge COULD execute. (The executor-side half — the bridge's
    // 'answer' arm dispatches nothing — is pinned in
    // apps/editor/src/ui/ai/__tests__/VisibilityChatRoute.spec.ts, and the
    // bus→store half in composeRuntime.visibilityIntent.test.ts.)
    expect(r.visibility).toBeUndefined();
    expect('commands' in r).toBe(false);
  });

  it('answers with the REAL counts when the snapshot is readable', () => {
    const r = expectLocal(resolveUtterance(
      'what is hidden',
      ctxOf({ visibility: { hiddenCount: 3, isolationActive: true, isolationCount: 2 } }),
    ));
    expect(r.summary).toContain('3 elements are explicitly hidden');
    expect(r.summary).toContain('isolation over 2 elements');
  });

  it('EMPTY and UNREADABLE are different answers (§CONTEXT-DATA-HONESTY)', () => {
    const empty = expectLocal(resolveUtterance(
      'what is hidden',
      ctxOf({ visibility: { hiddenCount: 0, isolationActive: false, isolationCount: 0 } }),
    ));
    expect(empty.summary).toContain('Nothing is hidden in this view');

    const unreadable = expectLocal(resolveUtterance('what is hidden', ctxOf()));
    expect(unreadable.summary).toContain('cannot read the visibility state');
    expect(unreadable.summary).not.toContain('Nothing is hidden');
  });

  it('"what levels are visible" answers from the level list and states its limit', () => {
    const r = expectLocal(resolveUtterance('what levels are visible', ctxOf()));
    expect(r.summary).toContain('Level 0, Level 1, Level 2');
    expect(r.summary).toContain('Level 0 is active');
    // It must NOT claim to know the per-level toggles it cannot read.
    expect(r.summary).toContain('will not guess');
  });

  it('SPECIFIC-target questions are NOT claimed — the snapshot cannot answer them', () => {
    for (const u of ['is level 2 hidden?', 'tell me which walls are hidden on level 2']) {
      expect(resolveUtterance(u, ctxOf()).kind, u).toBe('miss');
    }
  });
});

// ─── 4. The registry declares the class honestly ─────────────────────────────

describe('the registry: readOnly is the safety opt-in, and the class is declared', () => {
  it('visibility-query is the first readOnly capability, and readOnly ⇒ answers only', () => {
    const q = resolveChatCapability('visibility-query');
    expect(q).not.toBeNull();
    expect(q!.readOnly).toBe(true);
    for (const cap of allChatCapabilities()) {
      if (cap.readOnly !== true) continue;
      // Per the declared contract: busCommand null AND no local action that
      // changes document or view state — 'answer' is the only legal action.
      expect(cap.busCommand, cap.id).toBeNull();
      expect(cap.localAction, cap.id).toBe('answer');
      expect(cap.destructive, cap.id).toBe(false);
    }
  });

  it('absent readOnly means MUTATING — no capability relies on a default', () => {
    // The inversion pinned: only the DECLARED read-only capabilities carry the
    // flag, and every OTHER capability is treated as mutating (same direction as
    // QueryPattern.readOnly in QueryEngine — safety is opt-in).
    //
    // §FEAT-RAC-PROPERTY-QUERY (L-2210) — `property-query` joined
    // `visibility-query` as the second member. The list is written as a SET, not
    // as a count, and it is deliberately still a hand-written literal: a
    // capability acquiring `readOnly: true` must be a conscious act, because the
    // flag is what lets a sentence bypass the "questions never execute" rung.
    // The obligations that make the flag safe are asserted in the test above and
    // hold for both members.
    const readOnly = allChatCapabilities().filter((c) => c.readOnly === true).map((c) => c.id);
    expect([...readOnly].sort()).toEqual(['property-query', 'visibility-query']);
  });

  it('the three mutating visibility capabilities declare the local dispatch action and say "view-only"', () => {
    for (const id of ['hide-selection', 'isolate-selection', 'reveal-all']) {
      const cap = resolveChatCapability(id);
      expect(cap, id).not.toBeNull();
      expect(cap!.localAction, id).toBe('applyVisibilityIntent');
      expect(cap!.busCommand, id).toBeNull();
      expect(cap!.description, id).toMatch(/view-only/);
      expect(cap!.destructive, id).toBe(false);
    }
  });
});
