/**
 * §GRID-CONTEXTUAL-EDIT (SV2) — the grid edit-capability MATRIX.
 *
 * The first test PRINTS the whole matrix. That is the artefact, not a side effect: the
 * question "what may a contextual edit bar offer for a grid, and why not the rest?" should
 * be answerable by running this file, not by reading three commands and a store.
 *
 * Pattern and rationale copied from
 * `packages/geometry-wall/__tests__/WPE1WallProfileVariantMatrix.test.ts` (lane WPE1).
 */

import { describe, it, expect } from 'vitest';
import {
    GRID_EDIT_AXES,
    gridEditActiveAxes,
    gridEditAvailability,
    type GridEditSubject,
} from './GridEditVariants';

const orthogonal: GridEditSubject = { id: 'g1', name: 'A', mode: 'orthogonal' };
const linear: GridEditSubject = { id: 'g2', name: 'B', mode: 'linear' };
const pinned: GridEditSubject = { id: 'g3', name: 'C', mode: 'orthogonal', isPinned: true };
const pinnedLinear: GridEditSubject = { id: 'g4', name: 'D', mode: 'linear', isPinned: true };

describe('§GRID-CONTEXTUAL-EDIT — the matrix', () => {
    it('prints what a selected grid may be offered today', () => {
        const rows = [
            ['orthogonal', orthogonal],
            ['linear', linear],
            ['orthogonal + pinned', pinned],
            ['linear + pinned', pinnedLinear],
        ] as const;
        const lines = rows.map(([label, g]) => {
            const move = gridEditAvailability(g, 'move');
            const del = gridEditAvailability(g, 'delete');
            return `  ${label.padEnd(20)} move=${move.ok ? 'AVAILABLE' : `blocked(${move.blockedBy.join('+')})`}`
                + `  delete=${del.ok ? 'AVAILABLE' : `blocked(${del.blockedBy.join('+')})`}`;
        });
        console.log(['', 'GRID EDIT MATRIX', ...lines, ''].join('\n'));
        expect(lines.length).toBe(4);
    });

    it('DELETE is available for every grid shape — the command exists with undo', () => {
        for (const g of [orthogonal, linear, pinned, pinnedLinear]) {
            expect(gridEditAvailability(g, 'delete').ok, `delete blocked for ${g.name}`).toBe(true);
        }
    });

    it('MOVE is blocked for EVERY grid, because interactive drag is unbuilt', () => {
        // ⭐ The assertion that keeps a dead button from shipping. A wall's contextual
        // Move activates a plan-view move TOOL; there is no grid arm in that registry, so
        // an ENABLED Move button for a grid would do nothing and say nothing.
        for (const g of [orthogonal, linear, pinned, pinnedLinear]) {
            const v = gridEditAvailability(g, 'move');
            expect(v.ok, `move wrongly offered for ${g.name}`).toBe(false);
            expect(v.blockedBy).toContain('interactive-drag');
        }
    });

    it('the refusal always names a way to move the grid TODAY, where one exists', () => {
        // C16 CA-18 — a refusal that leaves the user with no next move is half a refusal.
        // An ORTHOGONAL grid genuinely can be moved right now, so its sentence must say how.
        const v = gridEditAvailability(orthogonal, 'move');
        expect(v.reason).toMatch(/Position/);
        expect(v.reason).toMatch(/Grid Properties|dimension/);
    });

    it('a LINEAR grid is refused harder — the numeric escape hatch does not exist for it', () => {
        // `UpdateGridPayload.updates` cannot express startX/startZ/endX/endZ, so a linear
        // grid cannot be moved by ANY route. Folding this into the drag row would have
        // offered the user an escape hatch that is not there.
        const v = gridEditAvailability(linear, 'move');
        expect(v.blockedBy).toContain('linear');
        expect(v.reason).toMatch(/not supported at all yet/);
    });

    it('PINNED dominates: the sentence the user can ACT on comes first', () => {
        // 'user-resolvable' outranks 'unbuilt'. The user can unpin right now; they cannot
        // make us build a drag tool. Leading with "not built yet" would bury their move.
        const v = gridEditAvailability(pinned, 'move');
        expect(v.status).toBe('user-resolvable');
        expect(v.reason!.indexOf('PINNED')).toBeLessThan(v.reason!.indexOf('not built yet'));
    });

    it('an absent mode is treated as orthogonal, matching GridStore.add defaults', () => {
        // GridStore.add defaults `mode` to 'orthogonal'. If this predicate disagreed, a
        // grid created before the field existed would be refused as linear.
        expect(gridEditActiveAxes({ id: 'g5' })).not.toContain('linear');
    });

    it('every row carries a reason, so no cell can refuse without saying why', () => {
        for (const row of GRID_EDIT_AXES) {
            if (row.status === 'available') continue;
            expect(row.reason, `axis "${row.axis}" refuses with no sentence`).toBeTruthy();
        }
    });

    it('every UNBUILT row names an owner, so the row says who is holding it', () => {
        for (const row of GRID_EDIT_AXES) {
            if (row.status !== 'unbuilt') continue;
            expect(row.owner, `unbuilt axis "${row.axis}" names no owner`).toBeTruthy();
        }
    });
});
