/**
 * §FEAT-CONSTRUCTION-BOUNDARY-LINE (L-7941) — THE COPIED CONSTANT IS COMPARED.
 * C105 §3.3 · C84 EI-8 (one vocabulary per concept) · C84 EI-9 (one answer per question).
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * ⭐ WHY THIS FILE EXISTS
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * `BOUNDARY_LINE_FAMILY_RULES` (L2, `@pryzm/geometry-boundary-line`) carries a
 * `moveVerb` string per family. `MOVE_COMMAND_BY_TYPE` (L7, `elementMove.ts`) is *the
 * ONE table of "which bus command moves element type X"*. The first COPIES from the
 * second, because L2 may not import L7.
 *
 * A hand-copied constant is the defect this repository logs more often than any other
 * — every correction box in `CLAUDE.md` is one. The mitigation is not "be careful": it
 * is to ship the COMPARISON in the same commit as the copy, at the only layer that can
 * see both. That is this file.
 *
 * ⚠ IT COMPARES IN BOTH DIRECTIONS AND AS SETS, never as a count. A count can be right
 * while a member is wrong — the exact failure `check-contract-index-equivalence.ts`
 * was built to stop happening to the contract suite.
 */

import { describe, expect, it } from 'vitest';
import {
    BOUNDARY_LINE_FAMILY_RULES,
    boundaryLineRuleFor,
} from '@pryzm/geometry-boundary-line';
import {
    MOVE_COMMAND_BY_TYPE,
    MOVE_UNSUPPORTED_REASON,
    moveCommandFor,
    normaliseMoveType,
} from '@app/engine/transforms/elementMove';

const MOVE_TABLE = MOVE_COMMAND_BY_TYPE as Readonly<Record<string, string>>;

describe('§FEAT-CONSTRUCTION-BOUNDARY-LINE — the two move tables agree', () => {
    it('AG-1: ⭐ EVERY DECLARED `moveVerb` IS THE VERB `elementMove.ts` NAMES FOR THAT FAMILY', () => {
        // Direction one: nothing in the boundary-line table invents a verb, and nothing
        // quotes a stale one. A row that named `slab.updatePolygon` (the DTO-store
        // handler `elementMove.ts` explicitly routes AROUND) would pass a shape check
        // and move nothing a user can see.
        for (const r of BOUNDARY_LINE_FAMILY_RULES) {
            if (r.moveVerb === undefined) continue;
            expect(
                moveCommandFor(r.family),
                `${r.family}: the boundary-line table says "${r.moveVerb}"`,
            ).toBe(r.moveVerb);
        }
    });

    it('AG-2: every family key is spelled the way `normaliseMoveType()` spells it', () => {
        // The keys are the join between the two tables. A capitalised or padded key
        // would look right in a diff and match nothing at runtime.
        for (const r of BOUNDARY_LINE_FAMILY_RULES) {
            expect(normaliseMoveType(r.family), `${r.family} must already be normalised`).toBe(r.family);
        }
    });

    it('AG-3: ⭐ EVERY FAMILY `elementMove.ts` CAN MOVE HAS A BOUNDARY-LINE VERDICT', () => {
        // Direction two, and the one that catches an OMISSION rather than an error. A
        // family the product can already translate, with no row here, would arrive at
        // `planBoundaryLineMove` as `unclassified` — which is the C84 EI-PROP-a defect
        // (a family added without deciding whether it follows a host).
        const missing = Object.keys(MOVE_TABLE).filter((f) => !boundaryLineRuleFor(f));
        expect(
            missing,
            `movable families with no boundary-line verdict: ${missing.join(', ')}`,
        ).toEqual([]);
    });

    it('AG-4: ⭐ LIGHTING — the ONE deliberate asymmetry, asserted so it cannot rot', () => {
        // ⚠ THIS CASE RECORDS A CORRECTION. The boundary-line table's first draft
        // REFUSED lighting, quoting `MOVE_UNSUPPORTED_REASON.lighting` verbatim. That
        // sentence is TRUE — of the BUS. It is FALSE of the command layer, where
        // `MoveLightingCommand` exists and writes the lighting store.
        //
        // `MoveBoundaryLineCommand` dispatches COMMANDS, not bus verbs, so a light
        // attached to a boundary line follows it. The row therefore says PROPAGATES and
        // carries NO `moveVerb` — and the absence is the honest statement that lighting
        // still has no bus route. Both halves are pinned here so a later reader cannot
        // "fix" either one into agreement with the other.
        expect(MOVE_TABLE['lighting']).toBeUndefined();
        expect(MOVE_UNSUPPORTED_REASON['lighting']).toMatch(/no move command on any surface/i);

        const rule = boundaryLineRuleFor('lighting')!;
        expect(rule.verdict).toBe('PROPAGATES');
        expect(rule.moveVerb).toBeUndefined();
    });

    it('AG-5: ⛔ no family is claimed by BOTH a PROPAGATES verdict and a REFUSES one', () => {
        // C84 EI-9 — one answer per question. Two rows for one family would make the
        // verdict depend on iteration order, which is the worst possible property for a
        // table whose whole job is to be predictable.
        const seen = new Map<string, string>();
        for (const r of BOUNDARY_LINE_FAMILY_RULES) {
            const prior = seen.get(r.family);
            expect(prior, `${r.family} appears twice (${prior} and ${r.verdict})`).toBeUndefined();
            seen.set(r.family, r.verdict);
        }
    });
});
