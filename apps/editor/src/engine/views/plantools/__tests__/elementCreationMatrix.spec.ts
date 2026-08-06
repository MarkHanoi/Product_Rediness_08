import { describe, it, expect } from 'vitest';
import { TOOL_MANAGER_TOOL_KEYS } from '@pryzm/input-host';
import { PLAN_TOOL_KEYS, createPlanToolHandlers } from '../planToolHandlerRegistry';
import {
    ELEMENT_CREATION_MATRIX,
    NON_CREATION_PLAN_TOOLS,
    creationCapability,
    dualViewGaps,
    modeDesyncRisks,
} from '../elementCreationMatrix';

/**
 * §FEAT-DUAL-VIEW-CREATION-MATRIX (founder, 2026-08-06)
 *
 *   "ALL ELEMENTS SHOULD BE CAPABLE OF BEING CREATED BOTH IN PLAN VIEW AND IN 3D
 *    VIEW, BY ANY MODE — INCLUDING AUTO."
 *
 * These are the specs that make that a CHECKED invariant instead of a claim. They
 * are deliberately table-driven over the two real registries, so a newly added
 * element type cannot silently ship plan-only or 3D-only: it either declares its
 * capability in `elementCreationMatrix.ts` or a spec here fails by name.
 *
 * NOTE ON HONESTY: these specs do NOT assert that every gap is closed — several are
 * open and named. They assert that no gap is UNDECLARED, that no declaration is a
 * lie about a registry, and that the founder's specific cases (floor finish, slab
 * modes) are actually served.
 */
describe('§FEAT-DUAL-VIEW-CREATION-MATRIX — the creation matrix is real, not folklore', () => {
    const planHandlers = createPlanToolHandlers();
    const planKeys = new Set(Object.keys(planHandlers));
    const toolManagerKeys = new Set(TOOL_MANAGER_TOOL_KEYS);

    describe('the declaration matches the PLAN registry', () => {
        it.each(ELEMENT_CREATION_MATRIX.filter(c => c.views.includes('plan')))(
            '$label declares plan support and HAS a plan handler',
            (cap) => {
                expect(planKeys.has(cap.tool)).toBe(true);
                expect(planHandlers[cap.tool]).toBeDefined();
            },
        );

        it.each(ELEMENT_CREATION_MATRIX.filter(c => !c.views.includes('plan')))(
            '$label does NOT claim plan support, and indeed has no plan handler',
            (cap) => {
                expect(planKeys.has(cap.tool)).toBe(false);
            },
        );

        it('every plan tool key is either a declared creation tool or an explicit non-creation tool', () => {
            const accounted = new Set<string>([
                ...ELEMENT_CREATION_MATRIX.map(c => c.tool),
                ...NON_CREATION_PLAN_TOOLS,
            ]);
            const orphans = PLAN_TOOL_KEYS.filter(k => !accounted.has(k));
            // A new plan tool must be classified. Falling between the two lists is
            // exactly how a capability goes missing without anyone noticing.
            expect(orphans).toEqual([]);
        });

        it('the registry and its key list agree (no handler without a key, no key without a handler)', () => {
            expect([...planKeys].sort()).toEqual([...PLAN_TOOL_KEYS].sort());
        });
    });

    describe('the declaration matches the 3D registry (ToolManager)', () => {
        it.each(ELEMENT_CREATION_MATRIX.filter(c => c.views.includes('3d')))(
            '$label declares 3D support and ToolManager publishes its key',
            (cap) => {
                expect(toolManagerKeys.has(cap.tool)).toBe(true);
            },
        );

        it.each(ELEMENT_CREATION_MATRIX.filter(c => !c.views.includes('3d')))(
            '$label does NOT claim 3D support, and ToolManager indeed publishes no key',
            (cap) => {
                expect(toolManagerKeys.has(cap.tool)).toBe(false);
            },
        );

        it('every ToolManager creation key is declared in the matrix', () => {
            const accounted = new Set<string>([
                ...ELEMENT_CREATION_MATRIX.map(c => c.tool),
                ...NON_CREATION_PLAN_TOOLS,
            ]);
            expect(TOOL_MANAGER_TOOL_KEYS.filter(k => !accounted.has(k))).toEqual([]);
        });
    });

    describe('every gap is NAMED — "not implemented" and "not applicable" are different answers', () => {
        it.each(ELEMENT_CREATION_MATRIX)(
            '$label states a reason whenever it serves fewer than both views',
            (cap) => {
                if (cap.views.length < 2) {
                    expect(cap.gap, `${cap.tool} is single-view with no justification`).toBeTruthy();
                    expect(cap.gap!.length).toBeGreaterThan(20);
                }
            },
        );

        it.each(ELEMENT_CREATION_MATRIX)(
            '$label states a reason whenever AUTO is missing or asymmetric',
            (cap) => {
                const symmetric = cap.autoIn.length === 0 || cap.autoIn.length === cap.views.length;
                if (!symmetric || (cap.autoIn.length === 0 && !cap.gap)) {
                    expect(cap.gap, `${cap.tool} has an unexplained AUTO gap`).toBeTruthy();
                }
            },
        );

        it('AUTO is never claimed in a view the tool cannot be driven from at all', () => {
            for (const cap of ELEMENT_CREATION_MATRIX) {
                for (const v of cap.autoIn) {
                    expect(cap.views, `${cap.tool} claims AUTO in ${v} but not ${v} itself`).toContain(v);
                }
            }
        });

        it('reports the OPEN dual-view holes (the founder\'s remaining work)', () => {
            const gaps = dualViewGaps().map(c => c.tool).sort();
            // Exactly two elements are single-view today, and they fail in OPPOSITE
            // directions — lift is 3D-only, lighting is plan-only. Both are named in
            // the matrix with a justification. If this list grows, a regression
            // shipped; if it shrinks, tighten this assertion.
            expect(gaps).toEqual(['lift', 'lighting']);
        });

        it('reports the LATENT mode-desync risks (the shape of the founder\'s AUTO bug)', () => {
            // A mode kept on a 3D tool instance is invisible to the plan handler.
            // Roof is the last creation tool still doing this.
            expect(modeDesyncRisks().map(c => c.tool)).toEqual(['roof']);
        });
    });

    describe('THE FOUNDER\'S NAMED CASES', () => {
        it('FLOOR FINISH is creatable in PLAN view, in every mode, INCLUDING AUTO', () => {
            const floor = creationCapability('floor')!;
            expect(floor.views).toEqual(['plan', '3d']);
            expect(floor.modes).toEqual(['linear', 'ortho', 'curved', 'rectangle', 'auto']);
            expect(floor.autoIn).toContain('plan');   // §FIX-FINISH-MODE-PLAN-UNREACHABLE
            expect(floor.autoIn).toContain('3d');
            // …and the claim is backed by a real registered handler, not a comment.
            expect(planHandlers['floor']).toBeDefined();
            // The mode must NOT live on the 3D tool instance — that was the defect.
            expect(floor.modeSource).toBe('shared');
        });

        it('CEILING matches floor exactly — the same fix, the same shape', () => {
            const ceiling = creationCapability('ceiling')!;
            const floor = creationCapability('floor')!;
            expect(ceiling.views).toEqual(floor.views);
            expect(ceiling.modes).toEqual(floor.modes);
            expect(ceiling.autoIn).toEqual(floor.autoIn);
            expect(ceiling.modeSource).toBe('shared');
            expect(planHandlers['ceiling']).toBeDefined();
        });

        it('SLAB, FLOOR and CEILING all offer the WALL tool\'s three modes', () => {
            const wall = creationCapability('wall')!;
            for (const key of ['slab', 'floor', 'ceiling']) {
                const cap = creationCapability(key)!;
                for (const mode of ['linear', 'ortho', 'curved']) {
                    expect(cap.modes, `${key} is missing the wall mode "${mode}"`).toContain(mode);
                    expect(wall.modes).toContain(mode);
                }
                // …in BOTH views.
                expect(cap.views).toEqual(['plan', '3d']);
            }
        });

        it('SLAB has an AUTO-equivalent in both views (region = click inside a wall loop)', () => {
            const slab = creationCapability('slab')!;
            expect(slab.modes).toContain('region');
            expect(slab.autoIn).toEqual(['plan', '3d']);
        });
    });

    describe('matrix hygiene', () => {
        it('has no duplicate tool keys', () => {
            const keys = ELEMENT_CREATION_MATRIX.map(c => c.tool);
            expect(new Set(keys).size).toBe(keys.length);
        });

        it('no tool is classified as BOTH a creation tool and a non-creation tool', () => {
            const creation = new Set(ELEMENT_CREATION_MATRIX.map(c => c.tool));
            expect(NON_CREATION_PLAN_TOOLS.filter(t => creation.has(t))).toEqual([]);
        });

        it('every entry declares at least one view — an element creatable nowhere is a bug, not a gap', () => {
            for (const cap of ELEMENT_CREATION_MATRIX) {
                expect(cap.views.length, `${cap.tool} is creatable in no view at all`).toBeGreaterThan(0);
            }
        });
    });
});
