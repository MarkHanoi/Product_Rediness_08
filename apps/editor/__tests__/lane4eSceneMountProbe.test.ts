/**
 * @vitest-environment happy-dom
 */
// lane4eSceneMountProbe — §COMPONENT-RENDER-MOUNT-ADOPTS-INNER ·
// §SCENE-BOOTSTRAP-SOFT-FAIL-WAS-DROPPED (audit §12 Phase 4E) · ADR-0376 D10 · P1.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT `runtime.scene.mount(canvas)` ACTUALLY WIRED, MEASURED BEFORE IT WAS
//    REPAIRED — AND WHY THE AUDIT'S PREMISE WAS TOO KIND TO IT.
// ═══════════════════════════════════════════════════════════════════════════════
//
// Audit §5.4 describes `composeRuntime`'s post-compose facade as sharing *"every
// byte of soft-fail / span / tornDown / event semantics"* with the compose-time
// path and says it *"simply has no caller"*. The first half is true — both funnel
// through one `runScene()`. The second half is true and INCOMPLETE, and the gap
// between "uncalled" and "would not have worked if called" is the whole of this
// lane's risk (R13).
//
// ─── THE THREE READINGS, BEFORE THE FIX (2026-09-02, verbatim) ───────────────
// This file was written against the BROKEN behaviour and its three ⭐ arms
// PASSED. After the repair the same three FAILED, with these messages:
//
//     × P2  AssertionError: expected 1 to be 2 // Object.is equality
//     × P3  AssertionError: expected WallCommitter{ …(9) } to be undefined
//     × P5  AssertionError: expected RendererInitError: [Renderer] canvas.getC…
//                           to be null
//
// Read them in that direction: BEFORE the fix a mount built **2** data runtimes,
// the caller's `CommitterHost` held **no** WallCommitter, and a renderer that had
// genuinely failed reported `rendererError === null`. The arms below now assert
// the post-fix values, so this file is a REGRESSION test in both directions — it
// fails if the rival runtime comes back, and it fails if the soft-fail is dropped
// again.
//
// ─── WHY IT MATTERED, IN ONE SENTENCE PER DEFECT ─────────────────────────────
//  1. `bootstrapRenderEverything` called `bootstrapWithEverything(opts)` itself,
//     so mounting a canvas built a SECOND bus, a second copy of every element
//     store and a second registration of every handler — a P1 rival composed by
//     the composition root's own render path.
//  2. It registered wall/slab/door/window on THAT runtime's host and reconciled
//     THAT host into the renderer's scene, while `bootstrapScene` returned
//     `host: input.committerHost` — the CALLER's host, on which nothing was
//     registered and to which no store was bound. A committer registered on the
//     only host the typed slot exposes could therefore never receive a delta.
//  3. `bootstrapScene`'s success branch hardcoded `rendererError: null` and never
//     read the `rendererError` the producer had always returned, so "the GPU
//     failed" and "no canvas was ever supplied" were the same value.
//
// ⛔ NOTHING HERE IS A SPY AND NOTHING READS A RETURN VALUE OF THE THING UNDER
//    TEST. `mount()` resolves to `void`; every assertion reads a property off the
//    REAL composed runtime afterwards.

import { describe, expect, it, beforeAll } from 'vitest';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';

const AUDIT = { actorId: 'lane4e', projectId: 'lane4e', clientId: 'node' } as const;
const BUDGET = 600_000;

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let marksBeforeMount = 0;
let marksAfterMount = 0;
let mountThrew: unknown = null;

beforeAll(async () => {
  rt = await composeRuntime({
    audit: AUDIT,
    canvas: null,
    bootstrapFn: bootstrapWithEverything as never,
  });

  // `bootstrapWithEverything` emits `performance.mark('pryzm:bootstrap:stores:start')`
  // exactly once per invocation (bootstrap.everything.ts, first line of its try).
  // Counting the mark is a non-invasive census of "how many data runtimes have been
  // constructed in this process" — it patches nothing and mocks nothing.
  marksBeforeMount = performance.getEntriesByName('pryzm:bootstrap:stores:start').length;

  const canvas = document.createElement('canvas');
  try {
    await rt.scene.mount(canvas, 'webgl2');
  } catch (e) {
    mountThrew = e;
  }
  marksAfterMount = performance.getEntriesByName('pryzm:bootstrap:stores:start').length;
}, BUDGET);

describe('§COMPONENT-RENDER — what runtime.scene.mount() wires', () => {
  it('P0 — the composed runtime constructed exactly ONE data runtime before mount', () => {
    expect(marksBeforeMount).toBe(1);
  });

  it('P1 — mount() resolves rather than rejecting (soft-fail path)', () => {
    expect(mountThrew).toBeNull();
  });

  it('P2 — ⭐ mount() constructs NO second data runtime (was 2 before the fix)', () => {
    expect(marksAfterMount).toBe(1);
  });

  it('P3 — ⭐ the committers land on the CALLER\'s CommitterHost', () => {
    // Before §COMPONENT-RENDER-MOUNT-ADOPTS-INNER these four read `undefined`:
    // the committers existed, on a host no caller could reach.
    const host = rt.scene.host;
    expect(host).toBeDefined();
    expect(host.get('wall')).toBeDefined();
    expect(host.get('slab')).toBeDefined();
    expect(host.get('door')).toBeDefined();
    expect(host.get('window')).toBeDefined();
  });

  it('P4 — scene.committer and scene.host are the same object (the alias holds)', () => {
    expect(rt.scene.committer).toBe(rt.scene.host);
  });

  it('P5 — ⭐ a renderer that FAILED reports its error instead of reading null', () => {
    // happy-dom has no WebGL2 context, so `Renderer.init` rejects inside
    // `bootstrapRenderEverything`, which catches it into its own `rendererError`.
    // §SCENE-BOOTSTRAP-SOFT-FAIL-WAS-DROPPED: that field is now READ and
    // forwarded, so the slot no longer looks identical to a healthy idle one.
    expect(rt.scene.renderer).toBeNull();
    expect(rt.scene.rendererError).toBeInstanceOf(Error);
    expect(String(rt.scene.rendererError?.message)).toMatch(/canvas|context|webgl/i);
  });

  it('P6 — the component store is on the composed StoresSlot, which is what a render binding binds', () => {
    // The identity that makes P3 meaningful: the mounted host now fans out from
    // the SAME runtime the caller dispatches into. A second runtime would have
    // given the renderer a different store with the same shape — the failure mode
    // that stays invisible until someone dispatches a command and watches nothing
    // happen ([[committed-is-not-reachable]]).
    expect(rt.stores.component).toBeDefined();
  });

  it('P7 — ⚠ FINDING: `runtime.stores` and the inner runtime\'s `stores` are DIFFERENT key sets', () => {
    // ⛔ Not a fix, a measurement. `bootstrapRenderEverything` reads
    // `inner.stores.wall` and THROWS by name if it is missing — and the mount
    // above succeeded, so `inner.stores.wall` exists. Yet the composed
    // `StoresSlot` this assertion reads does NOT expose `wall`.
    //
    // So the composer's typed `stores` facade and the `EverythingRuntime.stores`
    // record are two surfaces over the element stores with different key sets, and
    // a render binding written against the wrong one silently binds nothing. That
    // is L-11530's shape exactly (`readPluginStore('balcony')` resolving to
    // `undefined` because `StoresSlot` declared no such key), and it is why lane 4C
    // had to ADOPT `component` into `StoresSlot` for the serializer to see it.
    //
    // Recorded here rather than repaired: widening `StoresSlot` toward the inner
    // record is a composition-root decision with a per-family census behind it,
    // and inventing a `wall` key to make one assertion green would be a rival
    // answer to "where do stores live".
    expect(rt.stores.wall).toBeUndefined();
    expect(rt.stores.component).toBeDefined();
  });
});
