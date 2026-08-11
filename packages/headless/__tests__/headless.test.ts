/**
 * @pryzm/headless — unit tests.
 *
 * CONTRACT (C07 §1 — boolean #8).
 *
 * ⚠ 2026-08-11 — THIS FILE USED TO MOCK ITS OWN SUBJECT.
 *
 * The previous version opened with:
 *
 *     vi.mock('@pryzm/runtime-composer', () => ({
 *       composeRuntime: vi.fn().mockResolvedValue(mockRuntime),
 *     }));
 *
 * — it replaced the composition root, i.e. the ONE thing
 * `headlessRuntime()` exists to call.  It then asserted
 * `toHaveBeenCalledWith({ canvas: null })` and `toBeDefined()` against its
 * own `mockRuntime` literal.  All ten tests passed, green, for months,
 * while the shipped `1.0.0-rc.1` could not compose a runtime at all: it
 * omitted the REQUIRED `bootstrapFn`, so the real `composeRuntime` threw
 * `opts.bootstrapFn is not a function` on the first line of Phase 0.
 * A test that replaces its subject cannot fail when the subject is broken.
 * This is the L-809 class — a check that checks nothing.
 *
 * There is NO `vi.mock` in this file and there must never be one for
 * `@pryzm/runtime-composer`.  Every assertion below is against a runtime
 * produced by the real `composeRuntime`, and the assertions are on real
 * slot names and a real `bus.registry.size` — never `toBeDefined()`,
 * never a mock call count.
 *
 * Environment: `happy-dom` (see vitest.config.ts).  `composeRuntime`
 * touches `document` while wiring DOM-adjacent slots (toasts, shortcuts)
 * even with `canvas: null`.  That is a property of the composition root,
 * not of this package; the reference probe
 * `tools/rac-conformance/runtime-harness/__tests__/compose.probe.ts`
 * runs under happy-dom for the same reason.  happy-dom is the *host*, not
 * a stub of the subject.
 */

import { describe, it, expect } from 'vitest';

const AUDIT = { actorId: 'headless', projectId: 'ci', clientId: 'node' } as const;

/** Slots a headless consumer is actually buying — the data half.
 *  Asserted by NAME so a composition-root regression that drops one is a
 *  test failure, not a silently smaller object. */
const REQUIRED_DATA_SLOTS = [
  'audit',
  'bus',
  'stores',
  'selection',
  'hover',
  'projectContext',
  'tools',
  'persistence',
  'sync',
  'visibility',
  'ai',
  'plugins',
  'events',
  'undoStack',
  'viewRegistry',
  'scene',
] as const;

describe('@pryzm/headless — module exports', () => {
  it('exports headlessRuntime, composeHeadlessRuntime and minimalHeadlessBootstrap', async () => {
    const mod = await import('../src/index.js');
    expect(typeof mod.headlessRuntime).toBe('function');
    expect(typeof mod.composeHeadlessRuntime).toBe('function');
    expect(typeof mod.minimalHeadlessBootstrap).toBe('function');
  });
});

describe('@pryzm/headless — composes a REAL runtime with no browser canvas', () => {
  it('headlessRuntime() returns a runtime with every data-half slot and a REAL command bus', async () => {
    const { headlessRuntime, minimalHeadlessBootstrap } = await import('../src/index.js');

    const runtime = await headlessRuntime({
      audit: AUDIT,
      bootstrapFn: minimalHeadlessBootstrap(),
    });

    // ── Real slots, by name.  Not `toBeDefined()` on one lucky key. ──
    const slots = Object.keys(runtime).sort();
    // eslint-disable-next-line no-console
    console.log(
      `MEASURED slots=${slots.length} busRegistry=${runtime.bus.registry.size} ` +
        `renderer=${String(runtime.scene.renderer)}`,
    );
    for (const name of REQUIRED_DATA_SLOTS) {
      expect(slots, `missing runtime slot '${name}'`).toContain(name);
    }
    // The composition root exposes far more than the 16 above; a count
    // this low would mean we got a stub object, not a runtime.
    expect(slots.length).toBeGreaterThanOrEqual(45);

    // ── Real bus registry.  A stub bus has size 0. ──
    expect(runtime.bus.registry).toBeInstanceOf(Map);
    expect(runtime.bus.registry.size).toBeGreaterThan(0);

    // ── Headless is genuinely headless. ──
    expect(runtime.scene.renderer).toBeNull();

    runtime.tearDown?.();
  });

  it('composeHeadlessRuntime() composes with the same real root and a real registry', async () => {
    const { composeHeadlessRuntime, minimalHeadlessBootstrap } = await import('../src/index.js');

    const runtime = await composeHeadlessRuntime({
      bootstrapFn: minimalHeadlessBootstrap(),
    });

    expect(Object.keys(runtime).length).toBeGreaterThanOrEqual(45);
    expect(runtime.bus.registry.size).toBeGreaterThan(0);
    expect(runtime.scene.renderer).toBeNull();

    runtime.tearDown?.();
  });

  it('a caller-supplied handler is present on the REAL registry (the bus is not a stub)', async () => {
    const { headlessRuntime, minimalHeadlessBootstrap } = await import('../src/index.js');

    const before = await headlessRuntime({
      audit: AUDIT,
      bootstrapFn: minimalHeadlessBootstrap(),
    });
    const baseline = before.bus.registry.size;
    before.tearDown?.();

    const runtime = await headlessRuntime({
      audit: AUDIT,
      bootstrapFn: minimalHeadlessBootstrap({
        handlers: [
          {
            type: 'headless.probe',
            affectedStores: [],
            canExecute: () => true,
            execute: () => undefined,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        ],
      }),
    });

    expect(runtime.bus.registry.size).toBe(baseline + 1);
    expect(runtime.bus.registry.has('headless.probe')).toBe(true);

    runtime.tearDown?.();
  });
});

describe('@pryzm/headless — bootstrapFn is REQUIRED, and says so', () => {
  it('throws a named, actionable error rather than composing an empty runtime', async () => {
    const { headlessRuntime } = await import('../src/index.js');

    await expect(
      // Deliberately omitting bootstrapFn — the exact shape that shipped
      // as 1.0.0-rc.1.  It must fail loudly, not silently half-compose.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      headlessRuntime({ audit: AUDIT } as any),
    ).rejects.toThrow(/bootstrapFn/);
  });
});
