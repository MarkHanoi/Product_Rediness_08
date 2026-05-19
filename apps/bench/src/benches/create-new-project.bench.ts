// Bench: `persistence.openProject.new-project-hint` — < 5 ms p95.
//
// Flow-9 named-verifier proxy.  Spec at
// `docs/03_PRYZM3/04-PLAN-FORWARD/04-END-TO-END-FLOWS-AND-COVERAGE.md`
// §1 Flow 9 (Project Hub "+ New project" → workspace mount).
//
// What this bench protects
// ------------------------
// The `{ isNewProject: true }` hint travels through FOUR hops on every
// hub-create gesture:
//
//   1. `ProjectHub._createViaRuntime`
//        → `this.openProject(id, name, { isNewProject: true })`
//   2. `PlatformRouter.launchWorkspace(id, name, opts)`
//        → `_openProjectViaRuntime(id, name, opts)`
//        → `runtime.persistence.openProject(id, { isNewProject: true })`
//   3. `buildPersistence.openProject(id, hint)`
//        → `attachedWorkspace.show(id, name, hint)`
//   4. `src/main.ts workspaceMount.show(id, name, opts)`
//        → `window.platformShell.setProjectContext(id, name, opts)`
//   5. `PlatformShell.setProjectContext(id, name, opts)`
//        → `opts.isNewProject` branch (PlatformShell.ts:289) skips a
//          full `loadLatestVersionFromServer` round-trip.
//
// Every TYPE signature in that chain has always declared the
// `{ isNewProject?: boolean }` slot.  Until 2026-04-30g the
// IMPLEMENTATIONS at hops 2, 3, 4 silently dropped the hint
// (`PlatformRouter.ts:387` had a `void opts; // forwarded ... once
// C.3.01-followup widens the signature` comment documenting the
// dead-plumbing TODO).  Result: every brand-new project paid one
// extra `loadLatestVersionFromServer` network round-trip even though
// we KNOW the project we just created has zero saved versions.
//
// This bench reproduces hops 3-4 in process and HARD-ASSERTS, on
// every sample, that the hint reaches the bridge intact.  A future
// regression that re-drops the hint at any layer would flip this
// assertion red instead of producing a silent perf regression visible
// only in production network waterfalls.
//
// Methodology
// -----------
// • Build a real `runtime.persistence` slot via `buildPersistenceSlot`
//   (the same factory the production composition root uses).
// • Stub the `PersistenceClientLike` so `controller.refresh()` returns
//   exactly one summary — no network, no IndexedDb.  This keeps the
//   bench wall-clock measuring what we want (the hint-propagation
//   plumbing) and not network jitter.
// • Attach a probe `workspace bridge (D.4)` whose `show()` records the
//   third `opts` argument.  Assert it equals `{ isNewProject: true }`
//   on every `openProject` call, AND `undefined` when the deep-link
//   path omits the hint.
//
// Budget: warnMs 2.5, budgetMs 5.0 — generous because the bench
// rebuilds the persistence slot every sample (the realistic gesture
// envelope; we don't share the slot across samples since `openProject`
// is stateful).
//
// Spec-vs-actual reconciliation
// -----------------------------
// • The flows-doc §1 Flow 9 row writes the bench id as
//   `persistence.openProject.new-project-hint`.  This file emits two
//   measurements under that namespace — `…hint-undefined` (deep-link
//   path) and `…hint-isnew` (Hub-create path) — so a regression at
//   either branch surfaces in `apps/bench/baseline.json` as a distinct
//   sample rather than aliasing into a single average.
// • The dedicated `create-new-project-e2e.bench.ts` (full
//   `composeRuntime` + JSDOM + click-the-button gesture, ≤ 1.5 s) lands
//   in the Wave 13 NFT batch alongside `create-300-walls`.  This file
//   is the per-handler envelope verifier — same pattern as
//   `wall-handlers.bench.ts:1-10` and `curtain-wall-handlers.bench.ts:1-10`.

import { describe, expect, it } from 'vitest';
import {
  buildPersistenceSlot,
  EventBus,
  type PersistenceClientLike,
  type ProjectContextSlot,
  type RuntimeAudit,
} from '@pryzm/runtime-composer';
import { measure } from '../timing.js';
import { writeBenchSample } from '../save-baseline.js';

// ── Stubs ──────────────────────────────────────────────────────────────
//
// A `PersistenceClientLike` whose `list()` returns a single summary
// matching the project id we will open.  No other methods are exercised
// by `openProject` — they throw if called so we surface accidental
// scope creep loudly instead of silently no-op'ing.
function buildStubClient(projectId: string, projectName: string): PersistenceClientLike {
  const summary = {
    id: projectId,
    name: projectName,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const notImpl = (method: string) => () => {
    throw new Error(`[bench/stubClient] ${method}() should not be called by openProject`);
  };
  return {
    list:         async () => [summary],
    create:       notImpl('create'),
    delete:       notImpl('delete'),
    rename:       notImpl('rename'),
    patch:        notImpl('patch'),
    duplicate:    notImpl('duplicate'),
    signOut:      notImpl('signOut'),
    getAuthToken: () => null,
    members: {
      list:    notImpl('members.list'),
      invite:  notImpl('members.invite'),
      remove:  notImpl('members.remove'),
      setRole: notImpl('members.setRole'),
    },
    auth: {
      signInWithGoogle:    notImpl('auth.signInWithGoogle'),
      signInWithMicrosoft: notImpl('auth.signInWithMicrosoft'),
      signInWithEmail:     notImpl('auth.signInWithEmail'),
      signUpWithEmail:     notImpl('auth.signUpWithEmail'),
      signOut:             () => undefined,
      getCurrentUser:      () => null,
      getToken:            () => null,
      isSignedIn:          () => false,
    },
  };
}

// Minimal `ProjectContextSlot` mirroring `composeRuntime.buildProjectContextStub`.
// We don't import that helper because it's not exported (intentional —
// composition-root only).
function buildStubContext(audit: RuntimeAudit): ProjectContextSlot {
  let projectId: string | null = null;
  let projectName: string | null = null;
  let levelId: string | null = null;
  return {
    get projectId() { return projectId; },
    get projectName() { return projectName; },
    get levelId() { return levelId; },
    set(next) {
      projectId = next.projectId;
      projectName = next.projectName;
      (audit as { projectId: string }).projectId = next.projectId;
    },
    setLevelId(id) { levelId = id; },
    clear() { projectId = null; projectName = null; levelId = null; },
    subscribe() { return () => undefined; },
  };
}

// Wave 7 (2026-05-01): workspace bridge (D.4) deleted.  The bench probe now
// instruments the two typed replacement legs:
//   • attachEngineBootstrap({ ensure }) — counts ensure() calls
//   • attachWorkspaceSurface(surface)   — observes setProjectContext() calls
interface BridgeProbe {
  ensureCalls: number;
  showCalls: Array<{
    projectId: string;
    projectName: string;
    opts: { isNewProject?: boolean; prefetchedVersion?: unknown } | undefined;
  }>;
}
function buildProbeBridge(): { probe: BridgeProbe } {
  const probe: BridgeProbe = { ensureCalls: 0, showCalls: [] };
  return { probe };
}
function attachProbe(
  slot: Awaited<ReturnType<typeof buildPersistenceSlot>>,
  probe: BridgeProbe,
): void {
  slot.attachEngineBootstrap({ ensure: async () => { probe.ensureCalls++; } });
  slot.attachWorkspaceSurface({
    setProjectContext: (
      projectId: string,
      projectName: string,
      opts?: { isNewProject?: boolean; prefetchedVersion?: unknown },
    ) => {
      probe.showCalls.push({ projectId, projectName, opts });
    },
  } as Parameters<typeof slot.attachWorkspaceSurface>[0]);
}

const PROJECT_ID = 'proj-1719000000000-BENCHFLOW9';
const PROJECT_NAME = 'Flow-9 bench project';

// ── Bench ──────────────────────────────────────────────────────────────

describe('persistence.openProject.new-project-hint', () => {
  it('forwards `{ isNewProject: true }` end-to-end on every Hub-create open', async () => {
    let regressionDetected = false;
    let lastObservedOpts: { isNewProject?: boolean } | undefined = { isNewProject: true };

    const sample = await measure(
      'persistence.openProject.new-project-hint.hint-isnew',
      async () => {
        const audit: RuntimeAudit = { actorId: 'bench', projectId: '', clientId: 'bench' };
        const events = new EventBus();
        const projectContext = buildStubContext(audit);
        const slot = await buildPersistenceSlot({
          audit,
          events,
          projectContext,
          client: buildStubClient(PROJECT_ID, PROJECT_NAME),
        });
        const { probe } = buildProbeBridge();
        attachProbe(slot, probe);

        await slot.openProject(PROJECT_ID, { isNewProject: true });

        // Capture the LAST sample's observation for the post-loop assertion.
        // We don't `expect()` inside the hot loop because the per-call
        // throw cost would skew the percentile maths.
        const last = probe.showCalls[probe.showCalls.length - 1];
        lastObservedOpts = last?.opts;
        if (
          probe.showCalls.length !== 1 ||
          last?.opts?.isNewProject !== true ||
          last?.projectId !== PROJECT_ID ||
          last?.projectName !== PROJECT_NAME
        ) {
          regressionDetected = true;
        }
      },
      { samples: 50, warmup: 5, warnMs: 2.5, budgetMs: 5.0 },
    );
    writeBenchSample(sample);

    // Hard assertion outside the hot loop — preserves percentile fidelity
    // while still failing the bench loud and clear if any sample regressed.
    expect(regressionDetected).toBe(false);
    // Wave 7: opts shape now includes `prefetchedVersion` (new typed tier leg).
    // We assert on the flag we care about — `isNewProject: true` was forwarded.
    expect(lastObservedOpts?.isNewProject).toBe(true);
    expect(sample.p95).toBeGreaterThan(0);
  });

  it('forwards `undefined` on deep-link opens (no hint passed by caller)', async () => {
    let regressionDetected = false;
    let lastObservedOpts: { isNewProject?: boolean; prefetchedVersion?: unknown } | undefined = undefined;

    const sample = await measure(
      'persistence.openProject.new-project-hint.hint-undefined',
      async () => {
        const audit: RuntimeAudit = { actorId: 'bench', projectId: '', clientId: 'bench' };
        const events = new EventBus();
        const projectContext = buildStubContext(audit);
        const slot = await buildPersistenceSlot({
          audit,
          events,
          projectContext,
          client: buildStubClient(PROJECT_ID, PROJECT_NAME),
        });
        const { probe } = buildProbeBridge();
        attachProbe(slot, probe);

        // Deep-link path — the URL router calls openProject with no hint.
        await slot.openProject(PROJECT_ID);

        const last = probe.showCalls[probe.showCalls.length - 1];
        lastObservedOpts = last?.opts;
        if (
          probe.showCalls.length !== 1 ||
          last?.opts !== undefined ||
          last?.projectId !== PROJECT_ID ||
          last?.projectName !== PROJECT_NAME
        ) {
          regressionDetected = true;
        }
      },
      { samples: 50, warmup: 5, warnMs: 2.5, budgetMs: 5.0 },
    );
    writeBenchSample(sample);

    expect(regressionDetected).toBe(false);
    expect(lastObservedOpts).toBeUndefined();
    expect(sample.p95).toBeGreaterThan(0);
  });
});
