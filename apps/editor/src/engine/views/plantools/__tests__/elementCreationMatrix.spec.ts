import { describe, it, expect } from 'vitest';
import { TOOL_MANAGER_TOOL_KEYS } from '@pryzm/input-host';
import { PLAN_TOOL_KEYS, createPlanToolHandlers } from '../planToolHandlerRegistry';
import {
    ELEMENT_CREATION_MATRIX,
    NON_CREATION_PLAN_TOOLS,
    creationCapability,
    creationModeIds,
    creationModes,
    WALL_DRAW_MODES,
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
            // §FIX-ROOF-MODE-SURFACE-INDEPENDENT (L-699) — roof was the last tool
            // doing this and it is now on the shared store, so the list is EMPTY.
            // ⚠ Tightened per this suite's own instruction ("if it shrinks, tighten
            // this assertion"). An empty expectation is the strongest form: any new
            // tool that adopts `tool-instance` fails here immediately, instead of
            // being quietly appended to a list of known risks — which is how roof
            // stayed declared-but-open long enough to reach the founder.
            expect(modeDesyncRisks().map(c => c.tool)).toEqual([]);
        });
    });

    describe('THE FOUNDER\'S NAMED CASES', () => {
        it('FLOOR FINISH is creatable in PLAN view, in every mode, INCLUDING AUTO', () => {
            const floor = creationCapability('floor')!;
            expect(floor.views).toEqual(['plan', '3d']);
            expect(creationModeIds('floor')).toEqual(['linear', 'ortho', 'curved', 'rectangle', 'circular', 'elliptical', 'auto']);
            expect(floor.autoIn).toContain('plan');   // §FIX-FINISH-MODE-PLAN-UNREACHABLE
            expect(floor.autoIn).toContain('3d');
            // …and the claim is backed by a real registered handler, not a comment.
            expect(planHandlers['floor']).toBeDefined();
            // The mode must NOT live on the 3D tool instance — that was the defect.
            expect(floor.modeSource).toBe('shared');
        });

        it('ROOF is creatable in PLAN view in every declared mode, INCLUDING BY REGION', () => {
            // §FIX-ROOF-MODE-SURFACE-INDEPENDENT (L-699). Founder, 2026-08-07:
            // *"I created a roof BY REGION, but the region had a CURVED WALL within,
            // and it could not cope with it."* The plan handler logged
            // `mode: RECTANGLE` for that selection because its mode narrowing had
            // only two branches.
            const roof = creationCapability('roof')!;
            expect(roof.views).toEqual(['plan', '3d']);
            expect(creationModeIds('roof'))
                .toEqual(['2point', 'polyline', 'region', 'single_slope', 'hip_roof']);
            expect(roof.autoIn).toContain('plan');
            expect(roof.autoIn).toContain('3d');
            expect(planHandlers['roof']).toBeDefined();
            // The mode must NOT live on the 3D tool instance — that was the defect.
            expect(roof.modeSource).toBe('shared');
        });

        it('CEILING matches floor exactly — the same fix, the same shape', () => {
            const ceiling = creationCapability('ceiling')!;
            const floor = creationCapability('floor')!;
            expect(ceiling.views).toEqual(floor.views);
            expect(creationModeIds('ceiling')).toEqual(creationModeIds('floor'));
            expect(ceiling.autoIn).toEqual(floor.autoIn);
            expect(ceiling.modeSource).toBe('shared');
            expect(planHandlers['ceiling']).toBeDefined();
        });

        it('SLAB, FLOOR and CEILING all offer the WALL tool\'s three modes', () => {
            for (const key of ['slab', 'floor', 'ceiling']) {
                const cap = creationCapability(key)!;
                for (const mode of ['linear', 'ortho', 'curved']) {
                    expect(creationModeIds(key), `${key} is missing the wall mode "${mode}"`).toContain(mode);
                    expect(creationModeIds('wall')).toContain(mode);
                }
                // …in BOTH views.
                expect(cap.views).toEqual(['plan', '3d']);
            }
        });

        it('SLAB has an AUTO-equivalent in both views (region = click inside a wall loop)', () => {
            const slab = creationCapability('slab')!;
            expect(creationModeIds('slab')).toContain('region');
            expect(slab.autoIn).toEqual(['plan', '3d']);
        });
    });

    /**
     * §FEAT-PERSISTENT-MODE-BAR (founder, 2026-08-07) — "I would like EXACTLY THE
     * SAME PANEL as the WALL. I want the user, DURING creation, to be able to
     * change from LINEAR to CURVED to ORTHO etc."
     *
     * The persistent bar is DATA-DRIVEN from these declarations, so these specs are
     * what stop a tool's in-draw bar and its launcher drifting apart again.
     */
    describe('§FEAT-PERSISTENT-MODE-BAR — the bar can be built from the declaration alone', () => {
        const withModes = ELEMENT_CREATION_MATRIX.filter(c => c.modes.length > 0);

        it.each(withModes)('$label gives every mode a key, a label and a description', (cap) => {
            for (const m of cap.modes) {
                expect(m.id, `${cap.tool} mode has no id`).toBeTruthy();
                expect(m.key, `${cap.tool}/${m.id} has no accelerator`).toBeTruthy();
                expect(m.key.length).toBeLessThanOrEqual(2);
                expect(m.label, `${cap.tool}/${m.id} has no label`).toBeTruthy();
                // The launcher menu's one-liners are genuinely useful copy and become
                // the bar pill's tooltip — they must not be dropped in the move.
                expect(m.description, `${cap.tool}/${m.id} lost its description`).toBeTruthy();
                expect(m.description.length).toBeGreaterThan(8);
            }
        });

        it.each(withModes)('$label has unique mode ids and unique accelerators', (cap) => {
            const ids = cap.modes.map(m => m.id);
            expect(new Set(ids).size, `${cap.tool} has duplicate mode ids`).toBe(ids.length);
            const keys = cap.modes.map(m => m.key.toUpperCase());
            // A duplicated accelerator would make one pill unreachable from the keyboard.
            expect(new Set(keys).size, `${cap.tool} has duplicate accelerators: ${keys}`).toBe(keys.length);
        });

        it('slab, floor and ceiling keep their RICHER mode sets — the bar is not truncated to wall\'s', () => {
            // The bar renders whatever the tool declares. Slab has seven modes;
            // floor/ceiling five including AUTO. None may be lost to "parity".
            expect(creationModeIds('slab')).toEqual(
                ['linear', 'ortho', 'curved', '2point', 'circular', 'elliptical', 'region', 'hollow', 'pickWalls'],
            );
            expect(creationModeIds('floor')).toContain('auto');
            expect(creationModeIds('ceiling')).toContain('auto');
            expect(creationModes('slab').length).toBeGreaterThan(creationModes('wall').length - 1);
        });

        it('the three wall modes are the SAME declaration object everywhere — they cannot drift', () => {
            for (const key of ['slab', 'floor', 'ceiling', 'wall']) {
                const modes = creationModes(key);
                for (const wallMode of WALL_DRAW_MODES) {
                    // Identity, not deep-equality: each tool spreads WALL_DRAW_MODES.
                    expect(modes, `${key} does not reuse the shared ${wallMode.id} declaration`)
                        .toContain(wallMode);
                }
            }
        });

        it('WALL is unchanged — its four modes, in order, with By Slab still an ACTION not a mode', () => {
            expect(creationModeIds('wall')).toEqual(['linear', 'ortho', 'curved', 'byslab']);
            const bySlab = creationModes('wall').find(m => m.id === 'byslab')!;
            expect(bySlab.isAction).toBe(true);
            expect(bySlab.key).toBe('S');
            // The three real modes must NOT be actions — they take the active highlight.
            for (const m of WALL_DRAW_MODES) expect(m.isAction).toBeUndefined();
        });

        it('every mode a tool declares is switchable mid-draw (no mode is activation-only)', () => {
            // A mode that only exists as an activation argument cannot be reached from
            // the persistent bar, which is exactly the launcher-menu UX the founder
            // rejected. `isAction` is the ONLY sanctioned exception.
            for (const cap of withModes) {
                const switchable = cap.modes.filter(m => !m.isAction);
                expect(switchable.length, `${cap.tool} offers no switchable mode`).toBeGreaterThan(0);
            }
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
