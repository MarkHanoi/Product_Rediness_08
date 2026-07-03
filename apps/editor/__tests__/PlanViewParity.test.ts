// @vitest-environment happy-dom
//
// §FIX-PLAN-VIEW-PARITY (L-73) — the MAIN plan view (PlanViewToolOverlay) and the
// SPLIT-view plan pane (SvpPlanToolOverlay) must expose an IDENTICAL creation/annotation
// tool set. They used to declare two hand-maintained handler maps that drifted:
// north-arrow, scale-bar and matchline existed only in the main overlay, so those tools
// silently did nothing in split view (the founder's L-73 gap). Both overlays now build
// their map from the single shared `createPlanToolHandlers()` registry, so the capability
// set is identical BY CONSTRUCTION. This suite locks that invariant.
//
// (Hosted element move/drag — walls, doors, windows — is owned by PlanViewInteraction +
// the shared planElementDragController singleton, attached to BOTH surfaces; that
// same-command parity is pinned in core-app-model's planHostedDragParity.test.ts.)

import { describe, it, expect } from 'vitest';
import {
    createPlanToolHandlers,
    PLAN_TOOL_KEYS,
} from '../src/engine/views/plantools/planToolHandlerRegistry';

describe('§FIX-PLAN-VIEW-PARITY (L-73) — one shared plan-tool registry, no main/split drift', () => {
    it('the registry exposes exactly PLAN_TOOL_KEYS, including the previously main-only tools', () => {
        const handlers = createPlanToolHandlers();
        const keys = Object.keys(handlers).sort();
        expect(keys).toEqual([...PLAN_TOOL_KEYS].sort());

        // The three tools that used to be missing from the split-view pane.
        expect(handlers['north-arrow']).toBeDefined();
        expect(handlers['scale-bar']).toBeDefined();
        expect(handlers['matchline']).toBeDefined();

        // Sanity: every entry is a live handler object with the PlanToolHandler shape.
        for (const key of PLAN_TOOL_KEYS) {
            expect(handlers[key], `missing handler for '${key}'`).toBeDefined();
            expect(typeof handlers[key].activate).toBe('function');
        }
    });

    it('returns FRESH instances per call so the main and split panes never alias tool state', () => {
        const a = createPlanToolHandlers();
        const b = createPlanToolHandlers();
        // Same key set…
        expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
        // …but distinct instances for every tool (state isolation between the two surfaces).
        for (const key of PLAN_TOOL_KEYS) {
            expect(a[key]).not.toBe(b[key]);
        }
    });
});
