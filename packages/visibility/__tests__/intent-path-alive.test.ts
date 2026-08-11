// PROBE — "is the visibility-intent path actually alive?" (W3-1, P7 / C01 §1 P7)
//
// WHAT THIS PROBE REFUSES TO ACCEPT AS EVIDENCE
// ─────────────────────────────────────────────────────────────────────────────
// Not `success === true`. Not "the handler was found". Not a count of anything.
// Those all pass against a handler whose entire body is `console.debug(...)`,
// which is exactly what all five of these handlers were.
//
// The only thing that proves an element is hidden is the AUTHORITATIVE RESOLVED
// VISIBILITY: run the same 11-wave chain the renderer runs, and read
// `.get(elementId).visible`. Wave-9 turns `hiddenElementIds` into `false`; wave-8
// turns `temporaryIsolation` into `false` for everything outside the set. If a
// handler genuinely expressed intent, that boolean flips. If it logged to the
// console, it does not.
//
// So each test below has the same shape:
//   1. assert the element is visible BEFORE (guards against a probe that would
//      have "passed" on an element that was never visible in the first place —
//      a false negative and a true negative must not look alike),
//   2. dispatch the command through the handler,
//   3. assert resolved visibility flipped, and assert the REASON string, so a
//      coincidental hide from a different wave cannot masquerade as success.

// ── §P7-INTENT-IS-DOMAIN (2026-08-11) — why this file MOVED ──────────────────
// This probe was authored at W3-1 in `plugins/visibility-intent/__tests__/`,
// because that is where the (dead) handlers lived. W3-2 moved the handlers down
// to `packages/visibility/src/intents/` and the plugin stopped re-exporting them,
// which left this file importing `buildVisibilityIntentHandlerSet` from a barrel
// that no longer had it: all 8 tests failed with
// `TypeError: buildVisibilityIntentHandlerSet is not a function`.
//
// The test follows the code it tests. Re-adding the re-export to the plugin so
// this import kept working would have reinstated the exact L6 facade W3-2 removed
// — and would have needed `@pryzm/visibility` as a dependency of a plugin that
// deliberately has none. Moving the file is the fix; imports are now relative and
// the plugin needs nothing.

import { describe, it, expect } from 'vitest';
import {
  buildVisibilityIntentHandlerSet,
  createViewVisibilityIntentStore,
  evaluateViewVisibility,
  type VisibilityElement,
  type VisibilityView,
} from '../src/index.js';

const VIEW_ID = 'vd-sys-plan-l0';

const ELEMENTS: readonly VisibilityElement[] = [
  { id: 'wall-1', category: 'wall', levelId: 'L0' },
  { id: 'wall-2', category: 'wall', levelId: 'L0' },
  { id: 'door-1', category: 'door', levelId: 'L0' },
];

function baseView(): VisibilityView {
  return {
    id: VIEW_ID,
    visibleLevels: new Set(['L0']),
    unlevelScoped: false,
    categoryVisibility: new Map(),
  };
}

/** Resolve visibility exactly as the renderer would, through the intent store. */
function resolve(store: ReturnType<typeof createViewVisibilityIntentStore>) {
  return evaluateViewVisibility(ELEMENTS, store.applyToView(baseView()));
}

function handlerFor(
  store: ReturnType<typeof createViewVisibilityIntentStore>,
  commandType: string,
) {
  const set = buildVisibilityIntentHandlerSet({ store, activeViewId: () => VIEW_ID });
  const h = set.find((x) => x.commandType === commandType);
  if (!h) throw new Error(`no handler registered for '${commandType}'`);
  return h;
}

describe('W3-1 — the visibility-intent handlers must reach authoritative state', () => {
  it('hide.selection actually hides the element in resolved visibility', () => {
    const store = createViewVisibilityIntentStore();

    // BEFORE — the element must be genuinely visible, or a later `false` proves nothing.
    expect(resolve(store).get('wall-1')?.visible).toBe(true);

    handlerFor(store, 'visibility.hide.selection').handle({ elementIds: ['wall-1'] });

    const after = resolve(store);
    expect(after.get('wall-1')?.visible).toBe(false);
    expect(after.get('wall-1')?.reason).toBe('element-hidden-in-view');
    // ...and it must hide ONLY what was asked for.
    expect(after.get('wall-2')?.visible).toBe(true);
    expect(after.get('door-1')?.visible).toBe(true);
  });

  it('isolate.selection hides everything outside the isolated set', () => {
    const store = createViewVisibilityIntentStore();
    expect(resolve(store).get('wall-2')?.visible).toBe(true);

    handlerFor(store, 'visibility.isolate.selection').handle({ elementIds: ['door-1'] });

    const after = resolve(store);
    expect(after.get('door-1')?.visible).toBe(true);
    expect(after.get('wall-1')?.visible).toBe(false);
    expect(after.get('wall-2')?.visible).toBe(false);
    expect(after.get('wall-1')?.reason).toBe('isolated-excluded');
  });

  it('reveal.all clears BOTH a hide and an isolation', () => {
    const store = createViewVisibilityIntentStore();
    handlerFor(store, 'visibility.hide.selection').handle({ elementIds: ['wall-1'] });
    handlerFor(store, 'visibility.isolate.selection').handle({ elementIds: ['door-1'] });
    expect(resolve(store).get('wall-2')?.visible).toBe(false);

    handlerFor(store, 'visibility.reveal.all').handle({});

    const after = resolve(store);
    for (const e of ELEMENTS) expect(after.get(e.id)?.visible).toBe(true);
  });

  it('set.transparency records opacity against the element', () => {
    const store = createViewVisibilityIntentStore();
    handlerFor(store, 'visibility.set.transparency').handle({
      elementIds: ['wall-1'],
      opacity: 0.25,
    });
    expect(store.get(VIEW_ID).transparency.get('wall-1')).toBe(0.25);
  });

  it('edge.toggle records the edge state', () => {
    const store = createViewVisibilityIntentStore();
    expect(store.get(VIEW_ID).edgesEnabled).toBe(true);
    handlerFor(store, 'visibility.edge.toggle').handle({ enabled: false });
    expect(store.get(VIEW_ID).edgesEnabled).toBe(false);
  });

  it('a hide SURVIVES a serialize/deserialize round trip (persistence)', () => {
    const store = createViewVisibilityIntentStore();
    handlerFor(store, 'visibility.hide.selection').handle({ elementIds: ['wall-1'] });

    const reloaded = createViewVisibilityIntentStore();
    reloaded.deserialize(JSON.parse(JSON.stringify(store.serialize())));

    expect(resolve(reloaded).get('wall-1')?.visible).toBe(false);
  });

  it('isolation does NOT survive persistence — it is per-session by contract (w08)', () => {
    const store = createViewVisibilityIntentStore();
    handlerFor(store, 'visibility.isolate.selection').handle({ elementIds: ['door-1'] });

    const reloaded = createViewVisibilityIntentStore();
    reloaded.deserialize(JSON.parse(JSON.stringify(store.serialize())));

    // Everything visible again — a stuck isolation must not be resurrected on load.
    expect(resolve(reloaded).get('wall-1')?.visible).toBe(true);
  });

  it('isolating an EMPTY set hides everything — absence ≠ emptiness (w08 bug #8901)', () => {
    const store = createViewVisibilityIntentStore();
    handlerFor(store, 'visibility.isolate.selection').handle({ elementIds: [] });

    const after = resolve(store);
    for (const e of ELEMENTS) expect(after.get(e.id)?.visible).toBe(false);
    // and this is distinguishable from "never isolated"
    expect(store.get(VIEW_ID).temporaryIsolation).not.toBeNull();
    expect(createViewVisibilityIntentStore().get(VIEW_ID).temporaryIsolation).toBeNull();
  });
});
