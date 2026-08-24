/**
 * §C13-ANALYSIS-GRAPH-OWNER / §C13-ANALYSIS-VIEWPORT-OWNER (L-10480).
 *
 * ⭐ THE A→B RUNTIME ISOLATION PROBE for the Analysis surface. Open project A, open
 * project B, and assert that NOTHING OF A SURVIVES.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHY THIS SHAPE, AND WHY THE OBVIOUS TEST WOULD HAVE BEEN WORTHLESS
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * ⛔ A TEST THAT ONLY CHECKS "PROJECT B LOADED CORRECTLY" PROVES NOTHING ABOUT
 * ISOLATION. B renders from B's live stores whether or not A's state is still in
 * the heap, so such a test passes identically in a clean world and a leaking one.
 * Every arm below therefore asserts on the ABSENCE OF A, by name and by count.
 *
 * ⛔ NOR IS IT ENOUGH TO CALL THE TEARDOWN DIRECTLY. `clearAnalysisGraphScope()`
 * obviously clears the thing it clears; calling it and asserting the cache is empty
 * measures a pure function, not a wiring. That is the "committed ≠ reachable"
 * defect — four fixes in one session that ran nowhere. ARM 3 therefore drives the
 * teardown ONLY through `projectScopeRegistry.clearAll()`, the path
 * `ClearProjectCommand` actually takes at priority 0 of every project load, and
 * never calls the owner's own function. If the registration at the foot of
 * `graphViewState.ts` is deleted, ARM 3 goes red; ARM 1 alone would not.
 *
 * ⚠ ARM 2 IS A PLANTED NEGATIVE CONTROL AND IT MUST FIRE. An instrument never
 * shown to fire is not evidence — the doctrine `check-no-dark-test-files.ts`
 * established and the reason `ProjectIsolationAudit.plantedLeak.test.ts` exists.
 * ARM 2 deliberately reconstructs the PRE-FIX world (A's layout still cached while
 * B is open) and asserts the probe reports A. If ARM 2 ever passes by reporting
 * `null`, the probe has gone blind and ARM 1's green means nothing.
 *
 * ⚠ ARM 5 RECORDS A KNOWN RESIDUAL WEAKNESS RATHER THAN HIDING IT — the in-flight
 * async class. Read its own comment; it is deliberately an OBSERVATION arm, and it
 * asserts the behaviour that exists today, not the behaviour that should.
 *
 * Contract: C13 §3.10 · ADR-0298 §1/§2 · ADR-0292 (no result a tool cannot verify
 * against external ground truth — here, the DECLARATION).
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';

import {
  projectScopeRegistry,
  readProjectScopeProbes,
  DECLARED_PROJECT_SCOPES,
} from '@pryzm/core-app-model';
import { projectHierarchy, type UbgEdge, type UbgNode } from '@pryzm/building-graph';

import {
  buildGraphSubject,
  _resetGraphLayoutCacheForTest,
  clearAnalysisGraphScope,
  describeAnalysisGraphScope,
  getAnalysisGraphOwningProjectId,
  graphOrbit,
} from '../graphViewState';

// ⛔ IMPORTED FOR ITS MODULE-SCOPE SIDE EFFECT, NOT ONLY FOR THESE TWO SYMBOLS.
// `analysis.graphViewport` registers as an import side effect of `widgetRenderers`,
// so a spec that never imported it would find the scope ABSENT from the registry —
// and under ADR-0298 module-scope absence is PROVEN clean ("the module never loaded
// ⇒ it holds nothing"), which is correct but untested. Production always loads it:
// `AnalysisSurface` imports `widgetRenderers` to draw the card. Importing it here is
// what makes ARM 3's reachability claim cover BOTH owners rather than one.
import {
  describeGraphViewport,
  getGraphViewportOwningProjectId,
} from '../widgetRenderers';

// ── The two scopes this file is the probe for ────────────────────────────────
const GRAPH_SCOPE = 'analysis.graphView';
const VIEWPORT_SCOPE = 'analysis.graphViewport';

const W = () => globalThis as unknown as Record<string, unknown>;

/**
 * Seat the canonical resolver on a project id, exactly as `resolveActiveProjectId`
 * reads it (`runtime.audit.projectId` is its first source).
 *
 * ⚠ THIS IS THE REAL RESOLVER, NOT A STUB. The owners under test call
 * `resolveActiveProjectId` themselves; a fake would let the probe agree with a
 * fiction. "A fake built from the header cannot falsify the header."
 */
function openProject(projectId: string): void {
  W().runtime = { audit: { projectId } };
}

function closeProject(): void {
  delete W().runtime;
}

/** A tiny two-node building graph whose node ids are unmistakably project-branded. */
function graphFor(projectId: string): { nodes: UbgNode[]; edges: UbgEdge[] } {
  const nodes: UbgNode[] = [
    { id: `${projectId}:wall-1`, kind: 'wall' },
    { id: `${projectId}:room-1`, kind: 'room' },
  ];
  const edges: UbgEdge[] = [
    { from: `${projectId}:wall-1`, to: `${projectId}:room-1`, type: 'bounds' },
  ];
  return { nodes, edges };
}

/**
 * Render the relationship card for whichever project is currently open — i.e. do
 * the one thing that populates the module-level layout cache.
 */
function renderGraphCard(projectId: string): void {
  const { nodes, edges } = graphFor(projectId);
  const projection = projectHierarchy(nodes, edges, 'topology', {});
  buildGraphSubject({
    projection,
    degrees: new Map(projection.nodes.map((n) => [n.id, 1])),
    nodeColour: () => '#6600FF',
    edgeColour: () => '#6600FF',
    focus: null,
    scale: 1,
    caption: '',
  });
}

/** What the audit would read from this surface right now. */
function probeReading(scope: string): string | null | undefined {
  return readProjectScopeProbes().find((p) => p.scope === scope)?.owningProjectId;
}

beforeEach(() => {
  _resetGraphLayoutCacheForTest();
  clearAnalysisGraphScope();
  closeProject();
});

afterEach(() => {
  closeProject();
});

// ═════════════════════════════════════════════════════════════════════════════
describe('§C13-ANALYSIS-GRAPH-OWNER — A→B isolation for the Analysis surface', () => {
  // ── ARM 0 — the declaration is the ground truth, and it names these owners ──
  //
  // ADR-0292: a tool may not report a result it cannot verify against external
  // ground truth. For this surface the external truth is `declaredProjectScopes.ts`,
  // authored separately from the owners. If someone deletes an entry to make a red
  // gate green, this arm goes red instead.
  it('ARM 0 — both Analysis scopes are DECLARED, with the analysis modules as owners', () => {
    const byScope = new Map(DECLARED_PROJECT_SCOPES.map((d) => [d.scope, d]));

    expect(byScope.get(GRAPH_SCOPE)?.module).toBe(
      'apps/editor/src/ui/analysis/graphViewState.ts',
    );
    expect(byScope.get(VIEWPORT_SCOPE)?.module).toBe(
      'apps/editor/src/ui/analysis/widgetRenderers.ts',
    );
    // Module-scope presence is what licenses the audit to treat ABSENCE as clean.
    expect(byScope.get(GRAPH_SCOPE)?.presence).toBe('module-scope');
    expect(byScope.get(VIEWPORT_SCOPE)?.presence).toBe('module-scope');
  });

  // ── ARM 1 — the probe attributes held state to the project that produced it ──
  it('ARM 1 — after rendering under A, the probe names A (not null, not B)', () => {
    openProject('proj-A');
    renderGraphCard('proj-A');

    expect(getAnalysisGraphOwningProjectId()).toBe('proj-A');
    expect(describeAnalysisGraphScope().cachedNodes).toBe(2);
    // ⛔ Differentiating: a probe that returned the LIVE project rather than the
    // STAMPED one would be useless — it could never disagree with the world.
    openProject('proj-B');
    expect(getAnalysisGraphOwningProjectId()).toBe('proj-A');
  });

  // ── ARM 2 — THE PLANTED NEGATIVE CONTROL. THIS MUST FIRE. ───────────────────
  //
  // Reconstruct the world as it was BEFORE L-10480: project B is open, and the
  // Analysis surface still holds the layout it solved for project A because nothing
  // on the switch path cleared it. The probe must report the leak, by name.
  it('ARM 2 — NEGATIVE CONTROL: A leak planted across the switch is CAUGHT and names A', () => {
    openProject('proj-A');
    renderGraphCard('proj-A');

    // The switch happens, but — as in the pre-fix world — no teardown runs.
    openProject('proj-B');

    const held = getAnalysisGraphOwningProjectId();
    expect(held).not.toBeNull();          // ⛔ if this passes as null the probe is blind
    expect(held).toBe('proj-A');          // ⛔ and it must name the RIGHT project
    expect(probeReading(GRAPH_SCOPE)).toBe('proj-A'); // …through the audit's own read path

    // And the disclosure is real: A's element ids are still resident while B is open.
    expect(describeAnalysisGraphScope().cachedNodes).toBe(2);
    expect(describeAnalysisGraphScope().stampedProjectId).toBe('proj-A');
  });

  // ── ARM 3 — REACHABILITY. The registry path must clear it, not a direct call. ─
  it('ARM 3 — projectScopeRegistry.clearAll() REACHES the owner (wiring, not function)', () => {
    openProject('proj-A');
    renderGraphCard('proj-A');
    graphOrbit().yaw = 1.234; // the reader orbited A's graph
    expect(getAnalysisGraphOwningProjectId()).toBe('proj-A');

    // ⛔ THE ONLY TEARDOWN CALL IN THIS ARM. Not `clearAnalysisGraphScope()` — the
    // real path `ClearProjectCommand` takes. Deleting the module-scope registration
    // fails HERE, which is the whole point.
    const report = projectScopeRegistry.clearAll();
    openProject('proj-B');

    expect(report.cleared).toContain(GRAPH_SCOPE);
    expect(report.cleared).toContain(VIEWPORT_SCOPE);
    expect(report.failures).toEqual([]);

    // ── ASSERT ON THE ABSENCE OF A ──
    expect(getAnalysisGraphOwningProjectId()).toBeNull();
    expect(describeAnalysisGraphScope().cachedNodes).toBe(0);
    expect(describeAnalysisGraphScope().stampedProjectId).toBeNull();
    // The camera pose the reader chose over A's graph is not seated over B's.
    expect(graphOrbit().yaw).toBe(-0.62);
    expect(describeAnalysisGraphScope().orbitSeated).toBe(false);

    // The GPU mount is released too — the surface whose refcount, per
    // `widgetRenderers`' own header, has the MAIN VIEWPORT as its eviction victim.
    expect(getGraphViewportOwningProjectId()).toBeNull();
    expect(describeGraphViewport().mounted).toBe(false);
    expect(describeGraphViewport().stampedProjectId).toBeNull();
  });

  // ── ARM 4 — an unattributable holding is NEVER reported as an empty one ──────
  //
  // §CONTEXT-DATA-HONESTY / L-713, the fourth appearance of this family: "I hold
  // nothing" and "I hold something I cannot attribute" must not share a value.
  it('ARM 4 — a layout solved with no resolvable project answers a MARKER, never null', () => {
    closeProject();               // no runtime ⇒ the stamp cannot resolve
    renderGraphCard('orphan');

    expect(getAnalysisGraphOwningProjectId()).toBe('<graph-layout-project-unresolved>');
    expect(getAnalysisGraphOwningProjectId()).not.toBeNull();
    expect(describeAnalysisGraphScope().cachedNodes).toBe(2);
  });

  // ── ARM 5 — OBSERVATION: the in-flight async class is NOT covered ────────────
  //
  // ⚠ THIS ARM ASSERTS WHAT IS TRUE TODAY, NOT WHAT SHOULD BE. It is here so the
  // gap is measured rather than believed, and so it goes red the day someone
  // closes it (at which point this arm should be inverted, not deleted).
  //
  // THE MECHANISM. The stamp is taken with `resolveActiveProjectId()` AT SOLVE
  // TIME. A render that was scheduled while A was open but whose solve LANDS after
  // the switch therefore stamps A's node positions with B's id — and the probe,
  // reading that stamp, reports the surface as clean while it holds A's element
  // ids. Every declared owner in this repo shares that shape, because none of them
  // has an epoch to compare against: measured 2026-08-24, a repo-wide search for
  // `projectEpoch|projectGeneration|loadGeneration|switchEpoch` returns ZERO hits.
  // There is no mechanism anywhere that lets an in-flight operation discover that
  // the project changed under it. See C13 §3.11 and the L-10480 register row.
  it('ARM 5 — a late solve MIS-STAMPS to B and the probe cannot see it (known gap)', () => {
    openProject('proj-A');
    // The card is built from A's graph, but the solve lands after the switch.
    const { nodes, edges } = graphFor('proj-A');
    const projection = projectHierarchy(nodes, edges, 'topology', {});

    openProject('proj-B'); // …the switch happens first…
    projectScopeRegistry.clearAll();

    buildGraphSubject({    // …and A's projection is solved afterwards.
      projection,
      degrees: new Map(projection.nodes.map((n) => [n.id, 1])),
      nodeColour: () => '#6600FF',
      edgeColour: () => '#6600FF',
      focus: null,
      scale: 1,
      caption: '',
    });

    // ⚠ MEASURED, AND IT IS THE WRONG ANSWER: the surface holds A's element ids…
    expect(describeAnalysisGraphScope().cachedNodes).toBe(2);
    // …and yet reports itself as belonging to B, so the audit sees nothing.
    expect(getAnalysisGraphOwningProjectId()).toBe('proj-B');
    expect(probeReading(GRAPH_SCOPE)).toBe('proj-B');
  });
});
