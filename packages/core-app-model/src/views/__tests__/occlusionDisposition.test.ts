/**
 * §FEAT-VIEW-OCCLUSION-DISPOSITION (L-279) — closes the FIRST OPEN CELL of C09 §4.6.7.
 *
 * WHAT WAS MISSING, AND WHY IT WAS AN HONEST GAP RATHER THAN A BUG
 * ---------------------------------------------------------------
 * C09 §4.6.5(b) says a VIEW must be able to choose what happens to an OCCLUDED line:
 *   'remove'  the span is deleted — the drawing shows only what you could actually see.
 *   'demote'  the span survives, reclassified to HIDDEN — and HIDDEN is the ONE zone that
 *             dashes (§4.6.4). You get a dashed ghost of what lies behind the solid.
 *
 * The engine ALREADY honoured whatever it was handed, and `ViewScope` already carried a
 * sensible default PER VIEW TYPE (elevation 'demote' — a recessed wing behind the front
 * plane should read as a dashed ghost, L-190; plan and section 'remove').
 *
 * But there was NO FIELD ON THE VIEW ITSELF. The plumbing stopped one inch short of the
 * user: the contract mandated a choice that nobody could make. The agent that landed L-277
 * recorded exactly that in §4.6.7 as an OPEN CELL — "recorded, not faked" — rather than
 * quietly implying the feature existed. This closes it.
 *
 * WHAT THESE TESTS GUARD, AND WHY EACH ONE EARNS ITS PLACE
 * -------------------------------------------------------
 *  O-1  A view with NO opinion inherits its TYPE's default. This is the one that protects
 *       every existing drawing: `undefined` must mean "behave exactly as you do today".
 *       A resolver that substituted its own preference here would be the `DetailLevelResolver`
 *       bug again — it re-forked DEFAULT_DETAIL_LEVEL = 'medium' against the schema's
 *       'fine', and the two disagreed silently for months.
 *  O-2  An EXPLICIT choice on the view WINS over the type default — in BOTH directions.
 *       Testing only one direction would miss a resolver that ignores the field whenever
 *       it happens to agree with the default.
 *  O-3  The founder's actual use case: a PLAN (whose type default is 'remove') set to
 *       'demote' — "I want to SEE the pipe behind the wall, dashed, not lose it."
 *  O-4  THE FAILURE MODE I ACTUALLY FEAR. The projector must resolve THROUGH the resolver,
 *       never straight off `viewScope.occlusionDisposition`. If it reads the scope directly,
 *       the control exists, persists, appears in the panel — AND DOES NOTHING. That is
 *       strictly worse than not shipping it, and it is precisely the shape of the Rotate
 *       button that was enabled, capability-gated ON, and silently inert (L-267).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { resolveViewScope, resolveOcclusionDisposition } from '../ViewScope';

const _here = dirname(fileURLToPath(import.meta.url));
const EPS_SRC = resolve(_here, '../../../../../apps/editor/src/engine/views/EdgeProjectorService.ts');

describe('§FEAT-VIEW-OCCLUSION-DISPOSITION — a view may choose what happens to an occluded line (L-279)', () => {
    it('O-1: a view with NO opinion inherits its TYPE default — existing drawings must not move', () => {
        const plan = resolveViewScope('plan');
        const elevation = resolveViewScope('elevation');
        const section = resolveViewScope('section');

        // undefined output → the type default, unchanged.
        expect(resolveOcclusionDisposition(undefined, plan)).toBe(plan.occlusionDisposition);
        expect(resolveOcclusionDisposition({}, plan)).toBe(plan.occlusionDisposition);
        expect(resolveOcclusionDisposition({ occlusionDisposition: undefined }, plan))
            .toBe(plan.occlusionDisposition);

        // And the type defaults themselves are the documented ones (C09 §4.6.5(b), L-190):
        // an elevation DEMOTES (the recessed wing behind the front plane reads as a dashed
        // ghost); a plan and a section REMOVE.
        expect(elevation.occlusionDisposition).toBe('demote');
        expect(plan.occlusionDisposition).toBe('remove');
        expect(section.occlusionDisposition).toBe('remove');
    });

    it('O-2: an EXPLICIT choice on the view WINS — in BOTH directions', () => {
        const plan = resolveViewScope('plan');            // default 'remove'
        const elevation = resolveViewScope('elevation');  // default 'demote'

        // Override AGAINST the default…
        expect(resolveOcclusionDisposition({ occlusionDisposition: 'demote' }, plan)).toBe('demote');
        expect(resolveOcclusionDisposition({ occlusionDisposition: 'remove' }, elevation)).toBe('remove');

        // …and WITH it. This direction matters: a resolver that only "works" when the value
        // differs from the default is a resolver that is ignoring the field and getting
        // lucky. Both must be honoured explicitly.
        expect(resolveOcclusionDisposition({ occlusionDisposition: 'remove' }, plan)).toBe('remove');
        expect(resolveOcclusionDisposition({ occlusionDisposition: 'demote' }, elevation)).toBe('demote');
    });

    it("O-3: the founder's case — a PLAN set to 'demote' shows the pipe behind the wall, dashed", () => {
        const plan = resolveViewScope('plan');
        expect(plan.occlusionDisposition).toBe('remove'); // by default it would be LOST

        // One explicit act of intent on ONE view — not a global toggle, not a hack in the
        // projector. The occluded span survives, is reclassified to HIDDEN, and HIDDEN is
        // the only zone that dashes (C09 §4.6.4).
        expect(resolveOcclusionDisposition({ occlusionDisposition: 'demote' }, plan)).toBe('demote');
    });

    it('O-4: the PROJECTOR resolves through the resolver — a setting that does NOTHING is worse than no setting', () => {
        const src = readFileSync(EPS_SRC, 'utf8');
        const code = src
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/^\s*\/\/.*$/gm, '');

        // It must go through the resolver…
        expect(code).toMatch(/resolveOcclusionDisposition\(/);

        // …and must NOT read the scope's raw default, which would silently discard the
        // user's per-view override. The control would exist, persist, show in the panel —
        // and do nothing. Exactly the Rotate button of L-267.
        expect(code).not.toMatch(/disposition:\s*viewScope\.occlusionDisposition/);
    });
});
