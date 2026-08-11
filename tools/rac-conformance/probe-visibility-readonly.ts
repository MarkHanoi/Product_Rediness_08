#!/usr/bin/env tsx
/**
 * tools/rac-conformance/probe-visibility-readonly.ts (VIS-CLASS, 2026-08-11)
 *
 * §GATE-QUERYENGINE-READ-ONLY — PROBE BEFORE FIX, on the REAL store.
 *
 * The claim under test: "the read-only visibility question resolves to the
 * READ-ONLY capability and mutates NOTHING", asserted ON STORE STATE — the
 * real `ViewVisibilityIntentStore` behind the real handler set
 * (`buildVisibilityIntentHandlerSet`), the exact pair `composeRuntime` §4d-bis
 * registers. The unit suites prove the resolver and the bridge halves
 * separately; this probe closes the loop by running BOTH against the
 * authoritative store:
 *
 *   1. "what is hidden" → local/'answer' → ZERO handler invocations → store
 *      state BYTE-IDENTICAL before and after (serialize() compared).
 *   2. "hide this wall" → local/'applyVisibilityIntent' → its declared payload
 *      dispatched through the handler set → the store NOW hides the id
 *      (positive control: the harness can SEE a mutation, so a clean read in
 *      step 1 is evidence, not blindness — [[probe-can-be-wrong-three-ways]]).
 *   3. "reveal all" → the store's hide set is empty again.
 *
 * Exit 0 = all assertions hold · 1 = any failed (printed with the evidence).
 */

import { resolveUtterance } from '../../packages/ai-host/src/intents/ZeroTokenResolver.js';
import type { ResolverContext, ZeroTokenResolution } from '../../packages/ai-host/src/intents/ZeroTokenResolver.js';
import { createViewVisibilityIntentStore } from '../../packages/visibility/src/intents/ViewVisibilityIntentStore.js';
import { buildVisibilityIntentHandlerSet } from '../../packages/visibility/src/intents/visibilityIntentCommands.js';

const VIEW_ID = 'probe-view';

const store = createViewVisibilityIntentStore();
const handlers = new Map(
  buildVisibilityIntentHandlerSet({ store, activeViewId: () => VIEW_ID })
    .map((h) => [h.commandType, h] as const),
);

/** The mini-bus: exactly what composeRuntime's adapter routes — the handler
 *  set, keyed by command type. Unknown verbs throw, as CommandBus would. */
function dispatch(type: string, payload: unknown): void {
  const h = handlers.get(type);
  if (h === undefined) throw new Error(`no handler registered: ${type}`);
  h.handle(payload);
}

const ctx = (selection: ResolverContext['selection']): ResolverContext => ({
  selection,
  levels: [{ id: 'L0', name: 'Level 0', elevation: 0 }],
  activeLevelId: 'L0',
  mintId: () => 'probe',
  visibility: {
    hiddenCount: store.get(VIEW_ID).hiddenElementIds.size,
    isolationActive: store.get(VIEW_ID).temporaryIsolation?.active ?? false,
    isolationCount: store.get(VIEW_ID).temporaryIsolation?.elementIds.size ?? 0,
  },
});

/** Execute a resolution the way the bridge's runLocal does — dispatch the
 *  visibility payload iff the action asks for it, NOTHING for 'answer'. */
function execute(r: ZeroTokenResolution): void {
  if (r.kind !== 'local') return;
  const local = r as { action?: string; visibility?: { busCommand: string; elementIds: readonly string[] } };
  if (local.action !== 'applyVisibilityIntent' || local.visibility === undefined) return;
  const v = local.visibility;
  dispatch(v.busCommand, v.busCommand === 'visibility.reveal.all' ? {} : { elementIds: [...v.elementIds] });
}

function stateSnapshot(): string {
  const s = store.get(VIEW_ID);
  return JSON.stringify({
    hidden: [...s.hiddenElementIds].sort(),
    isolation: s.temporaryIsolation === null
      ? null
      : { active: s.temporaryIsolation.active, ids: [...s.temporaryIsolation.elementIds].sort() },
    wire: store.serialize(),
  });
}

let failed = 0;
function check(label: string, ok: boolean, detail: string): void {
  console.log(`${ok ? '✅' : '❌'} ${label}${ok ? '' : ` — ${detail}`}`);
  if (!ok) failed += 1;
}

// ── 1. The read-only question mutates NOTHING (store-state assertion) ────────
{
  const before = stateSnapshot();
  const r = resolveUtterance('what is hidden', ctx([]));
  execute(r);
  const after = stateSnapshot();
  const local = r as { kind: string; intent?: string; action?: string };
  check(
    '"what is hidden" resolves to the READ-ONLY capability',
    r.kind === 'local' && local.intent === 'visibility-query' && local.action === 'answer',
    `got ${JSON.stringify(r)}`,
  );
  check(
    'store state is BYTE-IDENTICAL after the read-only question',
    before === after,
    `before=${before} after=${after}`,
  );
}

// ── 2. Positive control: the harness can SEE a mutation ──────────────────────
{
  const r = resolveUtterance('hide this wall', ctx([{ elementId: 'w1', elementType: 'wall' }]));
  execute(r);
  const s = store.get(VIEW_ID);
  check(
    'positive control — "hide this wall" reaches the store through the real handler set',
    s.hiddenElementIds.has('w1'),
    `hidden set = ${JSON.stringify([...s.hiddenElementIds])}`,
  );
}

// ── 3. The read-only question reports the REAL count, still without writing ──
{
  const before = stateSnapshot();
  const r = resolveUtterance('what is hidden', ctx([]));
  execute(r);
  const summary = (r as { summary?: string }).summary ?? '';
  check(
    'the answer carries the real count (1 hidden) read from the store snapshot',
    summary.includes('1 element is explicitly hidden'),
    `summary = "${summary}"`,
  );
  check('and still writes nothing', before === stateSnapshot(), 'state moved on a question');
}

// ── 4. reveal-all clears the hide through the same path ──────────────────────
{
  const r = resolveUtterance('reveal all', ctx([]));
  execute(r);
  const s = store.get(VIEW_ID);
  check(
    '"reveal all" empties the hide set and drops isolation',
    s.hiddenElementIds.size === 0 && s.temporaryIsolation === null,
    stateSnapshot(),
  );
}

console.log(failed === 0
  ? '\n>>> READ-ONLY STORE-STATE PROBE: all assertions hold.'
  : `\n>>> READ-ONLY STORE-STATE PROBE: ${failed} FAILED.`);
process.exit(failed === 0 ? 0 : 1);
