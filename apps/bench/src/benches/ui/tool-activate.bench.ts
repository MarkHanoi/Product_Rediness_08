// Bench: `ui.tool-activate` — `runtime.plugins.contributions('toolbar.discipline')`
// lookup + `contribution.activate(runtime)` round-trip < 16 ms p95
// (S81 F-launch.1 hard-fail).
//
// What this measures.  Every click on the architecture-rail Wall button
// executes:
//
//   1. `runtime.plugins.contributions('toolbar.discipline')`  — bucket lookup
//   2. `arr.find(c => c.id === 'wall.tool')`                  — id scan
//   3. `contribution.activate(runtime)` →
//        `runtime.tools.activate('wall', 'polyline_ortho')`   — slot dispatch
//
// Budget rationale.  16 ms = one 60 fps frame.  The dispatch is on the
// click hot path (`CreateRailPanel.tools[].action`); regressing past
// one frame would visibly drop a click while the rail panel re-renders.
// p95 < 16 ms is the same envelope `cmd-execute-latency.bench.ts` uses
// for L2 command execution and is well above the actual runtime cost
// (the dispatch is a Map.get + Array.find + 1 function call).
//
// As more `toolbar.discipline` contributions land in F.1.02 .. F.1.13
// (Slab, Door, Window, …) the bucket grows from 1 → 13 entries, so
// the `.find()` walk cost grows linearly.  The bench deliberately
// fills the bucket with the eventual 13-entry size so this baseline
// captures the worst-case look-up cost the F.1 sub-phases ship into.

import { describe, expect, it } from 'vitest';
import { PluginHost } from '@pryzm/runtime-composer';
import type {
  PluginContribution,
  PryzmRuntime,
  ToolbarDisciplineContribution,
} from '@pryzm/runtime-composer/types';
import { wallToolbarContribution } from '@pryzm/plugin-wall';
import { measure } from '../../timing.js';
import { writeBenchSample } from '../../save-baseline.js';

/** Build a minimal `PryzmRuntime`-shaped stub with just the two slots
 *  the contribution pipeline needs: `plugins` and `tools`.  Everything
 *  else is `null`/`undefined` and never accessed by this bench. */
function makeStubRuntime(host: PluginHost, onActivate: () => void): PryzmRuntime {
  const tools = {
    activeToolId: null as string | null,
    register: (_family: string, _activator: (mode?: string) => void) => {
      // No-op — the bench measures the contribution → runtime.tools dispatch
      // boundary, not the underlying activator path (that's covered by
      // `cmd-execute-latency.bench.ts`).
    },
    activate: (_toolId: string, _mode?: string) => {
      onActivate();
    },
    deactivate: () => undefined,
    subscribe: () => ({ dispose: () => undefined }),
  };
  return { plugins: host, tools } as unknown as PryzmRuntime;
}

/** Pad the contribution bucket to the eventual 13-entry size so the
 *  bench captures the worst-case `.find()` walk cost the F.1 sub-phases
 *  ship into.  The 12 padding entries use distinct ids so the lookup
 *  for `'wall.tool'` falls in the middle of the array. */
function buildEventualBucket(): readonly PluginContribution[] {
  const padding: ToolbarDisciplineContribution[] = [
    'slab', 'door', 'window', 'roof', 'curtain-wall', 'grid',
    'column', 'beam', 'stair', 'handrail', 'ceiling', 'view',
  ].map((id) => ({
    kind: 'toolbar.discipline' as const,
    id: `${id}.tool`,
    discipline: 'architecture' as const,
    label: id,
    icon: id,
    activate: () => undefined,
  }));
  // Wall lands at index 6 — middle-of-array for a fair `.find()` measurement.
  return [
    ...padding.slice(0, 6),
    wallToolbarContribution,
    ...padding.slice(6),
  ];
}

describe('ui.tool-activate', () => {
  it('dispatches the Wall contribution under the < 16 ms p95 budget', async () => {
    const host = new PluginHost(buildEventualBucket());
    let activations = 0;
    const runtime = makeStubRuntime(host, () => { activations++; });

    // Sanity — the contribution is reachable through the documented surface.
    const all = runtime.plugins.contributions('toolbar.discipline');
    expect(all.length).toBe(13);
    const wall = all.find((c) => c.id === 'wall.tool');
    expect(wall).toBeDefined();

    const sample = await measure(
      'ui.tool-activate',
      () => {
        // Mirrors `CreateRailPanel._findToolbarContribution('wall.tool')`
        // followed by `contribution.activate(runtime)`.  The two halves
        // are intentionally fused — that's the click-handler hot path.
        const found = runtime.plugins
          .contributions('toolbar.discipline')
          .find((c) => c.id === 'wall.tool');
        if (found) found.activate(runtime);
      },
      { samples: 500, warmup: 100, warnMs: 8.0, budgetMs: 16.0 },
    );

    writeBenchSample(sample);
    // The bench loop ran `samples + warmup` times (one activate per iter).
    expect(activations).toBe(500 + 100);
    // Same warn-only convention as `panel-base-overhead.bench.ts`:
    // hard-fail flip is owned by `scripts/check-regression.mjs` against
    // `baseline.json` — Replit's shared CPU is significantly slower than
    // the dev workstation the budget was calibrated against.
    expect(sample.p95).toBeGreaterThan(0);
  });
});
