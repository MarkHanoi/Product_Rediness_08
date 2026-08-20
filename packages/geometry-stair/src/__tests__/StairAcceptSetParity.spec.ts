// @vitest-environment happy-dom
//
// A DOM is needed only to IMPORT `@pryzm/command-registry`: its barrel reaches
// `geometry-slab/SlabTool`, which pulls `@thatopen/ui` and touches `document` at
// module load. Nothing under test uses the DOM. (That module-load DOM touch in a
// command barrel is itself worth a look — it is not this spec's subject.)

/**
 * §STAIR-ONE-LIMIT-AUTHORITY (L-1430) — THE TWO ACCEPT-SETS ARE ONE SET.
 *
 * THE DEFECT, from the founder's production log, verbatim:
 *
 *   [StairPathToolController] Cannot finish: invalid — Run too short — tread 218 mm (min 220 mm)
 *   [CommandManager] REFUSED CREATE_STAIR: Tread depth 222mm is below minimum 250mm
 *
 * The sketch tool blessed a stair at 222 mm; the command threw it away. C84 EI-3
 * says what the UI offers, the pipeline must accept.
 *
 * ⛔ THIS SPEC DOES NOT ASSERT THAT A SHARED FUNCTION WAS CALLED. That would pass
 * against a tool that imports the constant and then ignores it. It drives the two
 * REAL layers end to end —
 *
 *   layer A: `new StairSolver2D(...).solve(polyline).isValid`   (the tool's verdict)
 *   layer B: `new CreateStairCommand(input).canExecute(ctx)`     (the pipeline's)
 *
 * — over a swept grid of run lengths, and asserts their verdicts agree on every
 * sample. A number edited in one layer and not the other fails this spec.
 *
 * The bridge between them is the production `StairPathAdapter`, so the payload
 * layer B judges is the payload layer A would really have sent.
 */

import { describe, it, expect } from 'vitest';
import { StairSolver2D, type SolverResult2D } from '../stairPath/StairSolver2D';
import { StairPathAdapter } from '../stairPath/StairPathAdapter';
import { resolveStairGeometryLimits, checkStairGeometry } from '../StairGeometryLimits';
import { STAIR_CONSTRAINTS } from '../StairTypes';
import { CreateStairCommand } from '@pryzm/command-registry';

const BASE_LEVEL = 'level-0';
const TOP_LEVEL = 'level-1';
const FLOOR_TO_FLOOR = 3.0;

const LIMITS = resolveStairGeometryLimits();

/**
 * The minimum `ctx` `CreateStairCommand.canExecute` reads: the level table (via
 * `wallStore.getLevels()`) and nothing else on the geometry axis. `stairTypeStore`
 * is deliberately absent so the DEFAULT limits are the ones under test.
 */
function makeCtx(topElevation: number = FLOOR_TO_FLOOR): any {
    return {
        projectContext: { activeLevelId: BASE_LEVEL },
        stores: {
            wallStore: {
                getLevels: () => [
                    { id: BASE_LEVEL, elevation: 0 },
                    { id: TOP_LEVEL, elevation: topElevation },
                ],
            },
            stairStore: { getAll: () => [], getStairConnectingLevels: () => undefined },
        },
    };
}

function makeAdapter(topElevation: number = FLOOR_TO_FLOOR): StairPathAdapter {
    return new StairPathAdapter({
        baseLevelId: BASE_LEVEL,
        topLevelId: TOP_LEVEL,
        baseLevelElevation: 0,
        topLevelElevation: topElevation,
    });
}

/** Straight run of `len` metres along +X. */
function straight(len: number): { x: number; z: number }[] {
    return [{ x: 0, z: 0 }, { x: len, z: 0 }];
}

/** L-shape: `a` metres along +X, then `b` metres along +Z — the shape whose
 *  landing consumption made the tool's per-run tread differ from the committed
 *  scalar tread, i.e. the case where the two layers disagreed about the
 *  DEFINITION and not merely about the threshold. */
function ell(a: number, b: number): { x: number; z: number }[] {
    return [{ x: 0, z: 0 }, { x: a, z: 0 }, { x: a, z: b }];
}

/**
 * Layer B's verdict on the geometry axis ONLY. `canExecute` also refuses on level
 * identity and total-height mismatch; those are real refusals but they are not
 * this spec's subject, so they are filtered out by refusal text rather than
 * silently swallowed.
 */
const GEOMETRY_REFUSAL = /(Riser height|Tread depth|tread depth|in one flight)/i;

function commandGeometryRefusals(result: SolverResult2D, topElevation: number = FLOOR_TO_FLOOR): string[] {
    // The adapter refuses to build an input for an invalid result — correct in
    // production, useless here, because the whole question is what the PIPELINE
    // would have said about a payload the TOOL considered fine or not. Forcing
    // `isValid` builds the payload without touching any of the geometry the
    // command judges.
    const input = makeAdapter(topElevation).toCreateStairInput({ ...result, isValid: true });
    if (!input) return ['ADAPTER-PRODUCED-NO-INPUT'];
    const verdict = new CreateStairCommand(input).canExecute(makeCtx(topElevation));
    return (verdict.blockingIssues ?? []).filter(m => GEOMETRY_REFUSAL.test(m));
}

describe('§STAIR-ONE-LIMIT-AUTHORITY — tool and command share ONE accept-set', () => {

    it('the founder’s case: a stair whose committed tread is under the minimum is refused BY THE TOOL', () => {
        // 3.0 m floor-to-floor at the 175 mm comfort default -> 17 risers.
        // A 4.0 m run therefore commits 4.0/17 = 235 mm treads: comfortably over
        // the tool's OLD 220 mm limit, comfortably under the command's 250 mm.
        // Before this fix the tool said "valid" and the command said "REFUSED".
        const solver = new StairSolver2D({ totalHeight: FLOOR_TO_FLOOR, width: 1.0 });
        const result = solver.solve(straight(4.0));

        const committed = 4.0 / result.totalSteps;
        expect(committed).toBeLessThan(LIMITS.minTreadDepth);
        expect(committed).toBeGreaterThan(0.220); // the tool's retired private limit

        expect(result.isValid).toBe(false);
        expect(result.validationMessage).toMatch(/250mm/);
        expect(commandGeometryRefusals(result).length).toBeGreaterThan(0);
    });

    it('a straight stair the tool accepts is accepted by the command, and vice versa, across a swept run length', () => {
        const disagreements: string[] = [];

        for (let len = 2.0; len <= 8.0; len += 0.1) {
            const result = new StairSolver2D({ totalHeight: FLOOR_TO_FLOOR, width: 1.0 })
                .solve(straight(Number(len.toFixed(2))));
            const toolAccepts = result.isValid;
            const cmdRefusals = commandGeometryRefusals(result);
            const cmdAccepts = cmdRefusals.length === 0;

            // A tool refusal may be for a NON-geometry reason (segment too short
            // to be a meaningful run); that is a drawing limit with no counterpart
            // in the command, declared as such in StairSolver2D. Only geometry
            // refusals are compared.
            const toolRefusedOnGeometry =
                !toolAccepts && GEOMETRY_REFUSAL.test(result.validationMessage);

            if (toolAccepts && !cmdAccepts) {
                disagreements.push(
                    `len=${len.toFixed(2)}m TOOL ACCEPTED but COMMAND REFUSED: ${cmdRefusals.join('; ')}`,
                );
            }
            if (toolRefusedOnGeometry && cmdAccepts) {
                disagreements.push(
                    `len=${len.toFixed(2)}m TOOL REFUSED (${result.validationMessage}) but COMMAND ACCEPTED`,
                );
            }
        }

        expect(disagreements).toEqual([]);
    });

    it('an L-shape agrees too — the shape whose landing consumption forked the DEFINITION', () => {
        const disagreements: string[] = [];

        for (let a = 2.0; a <= 5.0; a += 0.25) {
            for (let b = 2.0; b <= 5.0; b += 0.25) {
                const result = new StairSolver2D({ totalHeight: FLOOR_TO_FLOOR, width: 1.0 })
                    .solve(ell(Number(a.toFixed(2)), Number(b.toFixed(2))));
                const cmdRefusals = commandGeometryRefusals(result);

                if (result.isValid && cmdRefusals.length > 0) {
                    disagreements.push(
                        `L(${a.toFixed(2)},${b.toFixed(2)}) TOOL ACCEPTED but COMMAND REFUSED: ${cmdRefusals.join('; ')}`,
                    );
                }
                if (!result.isValid
                    && GEOMETRY_REFUSAL.test(result.validationMessage)
                    && cmdRefusals.length === 0) {
                    disagreements.push(
                        `L(${a.toFixed(2)},${b.toFixed(2)}) TOOL REFUSED (${result.validationMessage}) but COMMAND ACCEPTED`,
                    );
                }
            }
        }

        expect(disagreements).toEqual([]);
    });

    it('the tool holds NO private tread or riser constant that could drift', async () => {
        // The mechanism guard: a future edit that re-introduces a local number is
        // caught here even if it happens to agree with the authority on the day.
        const fs = await import('node:fs');
        const path = await import('node:path');
        const src = fs.readFileSync(
            path.resolve(__dirname, '../stairPath/StairSolver2D.ts'), 'utf-8',
        );
        const declarations = src.match(/^\s*(private static readonly|const)\s+(MIN|MAX)_(TREAD|RISER)\w*\s*=/gm);
        expect(declarations).toBeNull();
    });
});

// ─── §L-1434 — THE FLIGHT-RISE CAP ────────────────────────────────────────────
//
// `MAX_RISERS_PER_FLIGHT: 16` was declared in three files and read by nobody.
// ⭐ The first case below is the reason it could not simply be switched on: an
// ORDINARY 3.0 m storey solves to SEVENTEEN risers, so a hard count of 16 refuses
// the most common stair in the product. Enforcing the declared number would have
// shipped a worse defect than the one it closes — and only trying to enforce it
// reveals that. The cap is therefore measured as RISE, derived from the constants
// that already exist, which is the quantity building codes actually regulate.

describe('§L-1434 — one flight may not climb more than the derived rise', () => {

    it('⭐ an ORDINARY 3.0 m storey (17 risers) is ACCEPTED — the count form would have refused it', () => {
        const result = new StairSolver2D({ totalHeight: FLOOR_TO_FLOOR, width: 1.0 })
            .solve(straight(5.0));

        expect(result.totalSteps, 'the case a 16-riser cap would break').toBe(17);
        expect(result.isValid).toBe(true);
        expect(commandGeometryRefusals(result)).toEqual([]);
    });

    it('a Ground→L2 span drawn as ONE run is refused by BOTH layers, naming both numbers and the action', () => {
        // Two storeys in a single flight: 34 risers, 6.0 m of unbroken rise.
        const result = new StairSolver2D({ totalHeight: 6.0, width: 1.0 }).solve(straight(9.0));
        expect(result.totalSteps).toBeGreaterThan(30);

        expect(result.isValid).toBe(false);
        expect(result.validationMessage).toMatch(/in one flight/);
        expect(result.validationMessage).toMatch(/add a landing/);

        // The level table must really span 6.0 m, or the command would be
        // refusing for a height MISMATCH and this case would prove nothing.
        const cmdRefusals = commandGeometryRefusals(result, 6.0);
        expect(cmdRefusals.length).toBeGreaterThan(0);
        expect(cmdRefusals.join(' ')).toMatch(/in one flight/);
    });

    it('the refusal states the ACTUAL rise and the MAXIMUM — a user told only one of them cannot act', () => {
        const limits = resolveStairGeometryLimits();
        const refusals = checkStairGeometry(
            { riserHeight: 0.1765, flights: [{ riserCount: 34 }] },
            limits,
        );
        expect(refusals).toHaveLength(1);
        expect(refusals[0].code).toBe('STAIR-FLIGHT-RISE-TOO-TALL');
        expect(refusals[0].message).toContain('6.00 m');                       // what they drew
        expect(refusals[0].message).toContain(limits.maxFlightRise.toFixed(2)); // the ceiling
    });

    it('the cap is DERIVED from the declared constants — no new number was invented', () => {
        const limits = resolveStairGeometryLimits();
        expect(limits.maxFlightRise).toBeCloseTo(STAIR_CONSTRAINTS.MAX_RISERS_PER_FLIGHT * limits.maxRiserHeight, 9);
        // Derived this way it can never refuse anything the declared (unread) count
        // would have allowed — enforcement cannot regress a previously-legal project.
        expect(limits.maxFlightRise).toBeGreaterThanOrEqual(
            STAIR_CONSTRAINTS.MAX_RISERS_PER_FLIGHT * limits.minRiserHeight,
        );
    });
});
