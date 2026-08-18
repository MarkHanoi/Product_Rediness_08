/**
 * §L-990 §MEASURE — WHOSE opening is the move-reweld cascade refusing on?
 *
 * ── THE REPORT (founder, production, 2026-08-18) ─────────────────────────────
 * A wall move on level 3 was refused, and the refusal said two things that
 * cannot both be true of one subject:
 *
 *   "That position is clear of every opening, but the junction re-weld it
 *    depends on cannot be done soundly …"
 *   "[OCC_CROSSES_HOSTED_OPENING] this wall cannot be placed here: it would pass
 *    straight through the window el-…-2-9-2 on wall wall-…-2-9 — that window
 *    occupies 4.000–5.000 m along the wall and this wall would occupy
 *    4.937–5.180 m, overlapping by 0.063 m."
 *
 * …where `wall-…-2-9` is THE WALL THE FOUNDER DRAGGED. Read literally that is a
 * wall colliding with its own hosted window, which hosting makes impossible.
 *
 * ── WHAT THIS FILE MEASURES, AND WHY MEASUREMENT WAS NEEDED ──────────────────
 * `wallCrossesOpeningRefusalText` never names the CANDIDATE — it says "this
 * wall" — and `CascadeWallBaselineCommand.canExecute`'s C83 arm pushes that
 * sentence WITHOUT prefixing the entry id (its sibling `OPENING_DOES_NOT_FIT`
 * arm does prefix it). So from the message alone it is UNDECIDABLE whether the
 * candidate is the mover or a cascaded partner. That undecidability is itself
 * the second defect; this file settles the first by asking the production
 * pre-flight and reading the typed result rather than the prose.
 *
 * Every case drives the REAL `previewMoveReweld` → `computeMoveReweldPlan` →
 * `CascadeWallBaselineCommand.canExecute` → `evaluateWallPlacement` chain. No
 * mock predicate, no re-derived rule.
 *
 * @file packages/command-registry/__tests__/L990MoveReweldHostIdentity.measure.test.ts
 */

import { describe, it, expect } from 'vitest';
import type { WallData } from '@pryzm/geometry-wall';
import { evaluateWallPlacement } from '@pryzm/geometry-wall';
import { previewMoveReweld, type PreflightWallStoreRef } from '../src/walls/moveReweldPreflight';

const LEVEL = 'level-3';
/** The founder's crossing span is 0.243 m wide — a perpendicular wall's thickness. */
const T = 0.243;

let seq = 0;
function wall(
    id: string,
    a: [number, number],
    b: [number, number],
    openings: unknown[] = [],
): WallData {
    return {
        id, type: 'wall', levelId: LEVEL, properties: {}, childrenIds: [],
        baseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
        _sourceBaseLine: [{ x: a[0], y: 0, z: a[1] }, { x: b[0], y: 0, z: b[1] }],
        height: 3, thickness: T, baseOffset: 0, openings,
        metadata: { createdAt: ++seq },
    } as unknown as WallData;
}

/** A window occupying exactly 4.000–5.000 m along its host, as the report states. */
const WINDOW = {
    id: 'op-2-9-2',
    elementId: 'el-2-9-2',
    type: 'window',
    offset: 4.0,
    width: 1.0,
    height: 1.4,
    sillHeight: 0.9,
};

function storeOf(walls: WallData[]): PreflightWallStoreRef {
    return {
        getById: (id) => walls.find(w => w.id === id),
        getAll: () => walls,
        getByLevel: () => walls,
    };
}

/**
 * THE FOUNDER'S SHAPE, reconstructed from the two numbers the refusal carries:
 * a mover `M` hosting a window at 4.000–5.000, and a stem `S` terminating on
 * M's BODY whose 0.243 m footprint lands at 4.937–5.180 — 0.063 m into the
 * window's tail. The stem is a §L-926 dependent: it FOLLOWS the mover by rule.
 */
function founderFixture() {
    const M = wall('M', [0, 0], [10, 0], [WINDOW]);
    const S = wall('S', [5.0585, 0], [5.0585, 4]);
    return { M, S, walls: [M, S] };
}

describe('§L-990 — the cascade refusal names no candidate; who is it?', () => {
    it('§A — MEASURED: the move is refused, and the violated HOST is the mover itself', () => {
        const { walls } = founderFixture();
        const r = previewMoveReweld({
            wallStore: storeOf(walls),
            wallId: 'M',
            prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] as never,
            newBaseLine: [{ x: 0, y: 0, z: -1 }, { x: 10, y: 0, z: -1 }] as never,
            joinedWallIds: ['S'],
            junctions: [{ wallId: 'S', junctionType: 'T', junctionDegree: 2 }],
        });

        // eslint-disable-next-line no-console
        console.log('§L-990 §A', JSON.stringify({
            allowed: r.allowed, ok: r.ok, reason: r.reason,
            entries: r.entries.map(e => e.wallId),
            incumbents: r.incumbentWallIds,
            blockingIssues: r.blockingIssues,
        }, null, 2));

        expect(r.entries.map(e => e.wallId)).toEqual(['S']);

        // ── AT `4455be2c`, BEFORE THIS LANE — the RED measurement ────────────
        //   ok:             false
        //   reason:         'OCC_CROSSES_HOSTED_OPENING'
        //   blockingIssues: ['[OCC_CROSSES_HOSTED_OPENING] this wall cannot be
        //                    placed here: it would pass straight through the
        //                    window el-2-9-2 on wall M — that window occupies
        //                    4.000–5.000 m along the wall and this wall would
        //                    occupy 4.937–5.180 m, overlapping by 0.063 m …']
        // The founder's sentence, to the digit, with NO candidate named: the
        // candidate is the cascaded stem S and the host is the wall M they
        // dragged, which is why it read as a wall hitting its own window.
        //
        // ── AFTER §L-990 ────────────────────────────────────────────────────
        // The crossing is UNCHANGED by the move (§B proves it was already
        // standing), so it is REPORTED, NOT REFUSED, and the gesture proceeds.
        expect(r.ok).toBe(true);
        expect(r.allowed).toBe(true);
        expect(r.reason).toBeUndefined();
        expect(r.blockingIssues ?? []).toEqual([]);

        // The fact still reaches the user - it is carried, not suppressed.
        const reported = (r.preExistingIssues ?? []).join('\n');
        expect(reported).toContain('on wall M');
        // ...and it now NAMES ITS SUBJECT: the candidate is the stem, not the mover.
        expect(reported.startsWith('S: ')).toBe(true);
    });

    it('§C — a NEW crossing still hard-refuses, and names the candidate', () => {
        // The attribution arm must not become a licence. Here the stem `S` is
        // clear of everything TODAY; moving `M` south drags S's welded end past
        // a THIRD wall `H` and straight through H's window. That crossing does
        // not exist before the gesture, so it is the gesture's, and it refuses.
        const M = wall('M', [0, 0], [10, 0]);
        const S = wall('S', [2, 0], [2, 4]);
        const H = wall('H', [0, -1], [10, -1], [{ ...WINDOW, id: 'op-h', elementId: 'el-h', offset: 1.5 }]);
        const walls = [M, S, H];
        const r = previewMoveReweld({
            wallStore: storeOf(walls),
            wallId: 'M',
            prevBaseLine: [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }] as never,
            newBaseLine: [{ x: 0, y: 0, z: -2.5 }, { x: 10, y: 0, z: -2.5 }] as never,
            joinedWallIds: ['S'],
            junctions: [{ wallId: 'S', junctionType: 'T', junctionDegree: 2 }],
        });

        // eslint-disable-next-line no-console
        console.log('§L-990 §C', JSON.stringify({
            allowed: r.allowed, ok: r.ok, reason: r.reason,
            entries: r.entries.map(e => e.wallId),
            blockingIssues: r.blockingIssues,
            preExistingIssues: r.preExistingIssues,
        }, null, 2));

        expect(r.entries.map(e => e.wallId)).toContain('S');
        expect(r.ok).toBe(false);
        expect(r.reason).toBe('OCC_CROSSES_HOSTED_OPENING');
        // §L-990 - the candidate is NAMED, first, before any prose.
        expect((r.blockingIssues ?? []).some(i => i.startsWith('S: '))).toBe(true);
        expect((r.blockingIssues ?? []).join('\n')).toContain('on wall H');
    });

    it('§B — the SAME violation is already true BEFORE the move: the gesture changed nothing', () => {
        const { M, S, walls } = founderFixture();
        // The stem where it stands TODAY, against the model as it stands TODAY.
        const before = evaluateWallPlacement(
            {
                id: S.id,
                levelId: S.levelId,
                thickness: S.thickness as number,
                baseLine: [S.baseLine[0], S.baseLine[1]],
            },
            walls,
        );

        // eslint-disable-next-line no-console
        console.log('§L-990 §B pre-move verdict', JSON.stringify({
            valid: before.valid,
            hosts: before.violations.map(v => v.hostWallId),
            spans: before.violations.map(v => [v.openingSpanM, v.crossingSpanM, v.overlapM]),
        }, null, 2));

        expect(M.id).toBe('M');
        // If this is false the overlap is a CONSEQUENCE of the move; if true it
        // is a PRE-EXISTING condition the move merely re-tests.
        expect(before.valid).toBe(false);
        expect(before.violations[0]?.hostWallId).toBe('M');
    });
});
