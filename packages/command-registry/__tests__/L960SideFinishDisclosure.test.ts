// L-960 STEP 3 — THE CHAT MUST NEVER ANNOUNCE A FINISH THE DRAWING DOES NOT CARRY.
//
// The founder set the interior finish of ten walls from chat, was told "Done — undo
// with Ctrl+Z", and nothing on screen changed. The write was real; the pixels were
// not. The render half is fixed in `@pryzm/geometry-wall` (§L960-WHOLE-BODY-FINISH,
// pinned by `L960WallSideFinishRenders.test.ts`). This file pins the OTHER half: the
// success sentence has to tell the truth about what the viewport will show.
//
// ⚠ WHAT SURVIVED THE FIX, STATED EXPLICITLY, BECAUSE "no refusals left" is a claim
// that has to be measured rather than assumed:
//
//   · A wall carrying ONE finish now renders it on EVERY arm — instanced, layered
//     and plain. There is no wall left to refuse for that, so the disclosure below
//     is a TRIPWIRE on those cases and `masked` stays empty. That is asserted here,
//     not narrated: if a future change re-breaks an arm, the first test goes RED.
//   · What survives is geometry, not renderer: a wall drawn as ONE solid has ONE
//     surface, so if BOTH sides carry a finish only one can be painted. That is a
//     real, permanent limit and it is disclosed IN the success sentence.

import { describe, it, expect } from 'vitest';
import { SetWallSideFinishBatchCommand } from '../src/walls/SetWallSideFinishCommand';
import { describeSingleLayerRenderLimit } from '@pryzm/geometry-wall';
import type { CommandContext } from '../src/types';

type Pt = { x: number; y: number; z: number };
const p = (x: number, z: number): Pt => ({ x, y: 0, z });

const OAK = { materialId: 'wood-oak', materialColor: '#c8a96e', materialName: 'Wood · Oak (Light)' };
const PLASTER = { materialId: 'gypsum-skim', materialColor: '#f5f5f0', materialName: 'Plaster · Skim Coat (Painted)' };

interface W {
    id: string;
    levelId: string;
    baseLine: [Pt, Pt];
    thickness: number;
    openings: unknown[];
    childrenIds: string[];
    layers?: Record<string, unknown>[];
    sideFinishes?: Record<string, unknown>;
}

/** The founder's wall: "Plain Wall", ONE layer, Structure, 100 mm. */
function wall(id: string, over: Partial<W> = {}): W {
    return {
        id,
        levelId: 'L0',
        baseLine: [p(0, 0), p(5, 0)],
        thickness: 0.1,
        openings: [],
        childrenIds: [],
        layers: [{ name: 'Layer 1', function: 'structure', thickness: 0.1 }],
        ...over,
    };
}

function makeCtx(seed: W[]): { ctx: CommandContext; map: Map<string, W> } {
    const map = new Map<string, W>(seed.map((w) => [w.id, structuredClone(w)]));
    const store = {
        getById(id: string) { return map.get(id); },
        getAll() { return [...map.values()]; },
        updateWall(next: W) { map.set(next.id, structuredClone(next)); },
        restoreSnapshot(snap: W) { map.set(snap.id, structuredClone(snap)); },
    };
    return { ctx: { stores: { wallStore: store } } as unknown as CommandContext, map };
}

describe('L-960 §L960-STEP3 — the success sentence carries the render truth', () => {
    it("THE FOUNDER'S CASE — ten 1-layer Plain Walls, interior only: no caveat, because none is owed", () => {
        // Every one of these renders its finish after §L960-WHOLE-BODY-FINISH, so the
        // honest sentence is the plain one. A caveat here would be a false warning,
        // which erodes the real one.
        const seed = Array.from({ length: 10 }, (_, i) => wall(`w${i}`));
        const { ctx } = makeCtx(seed);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK });

        expect(cmd.canExecute(ctx).ok).toBe(true);
        const r = cmd.execute(ctx);
        const summary = r.info![0]!;
        // eslint-disable-next-line no-console
        console.log(`[L-960] founder's case summary: ${summary}`);

        expect(r.success).toBe(true);
        expect(r.affectedElementIds).toHaveLength(10);
        expect(cmd.masked, 'nothing is masked — every wall renders the one finish it has').toHaveLength(0);
        expect(summary).toContain('on 10 of 10 walls');
        expect(summary, 'no caveat is attached when none is owed').not.toContain('⚠');
    });

    it('BOTH sides on a 1-layer wall — the requested side is NOT painted, and the sentence says so', () => {
        // Exterior already authored; the user now asks for the interior. Both are
        // SAVED, but one surface can only carry one, and exterior wins. Announcing
        // "Done" flat here is exactly the L-960 lie with a different cause.
        const { ctx } = makeCtx([wall('w0', { sideFinishes: { exterior: { ...PLASTER } } })]);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK });

        const r = cmd.execute(ctx);
        const summary = r.info![0]!;
        // eslint-disable-next-line no-console
        console.log(`[L-960] masked summary: ${summary}`);

        expect(r.success, 'the write still happens — the value is real and undoable').toBe(true);
        expect(cmd.masked).toEqual([{ wallId: 'w0', maskedSide: 'interior' }]);
        expect(summary, 'the caveat rides the success line, not a separate info row').toContain('⚠');
        expect(summary).toContain('will NOT show it');
        // Verbatim, from the ONE place that sentence is written (C84 EI-8).
        expect(summary).toContain(describeSingleLayerRenderLimit());
    });

    it('the value is genuinely stored even when masked — this is a disclosure, never a skip', () => {
        const { ctx, map } = makeCtx([wall('w0', { sideFinishes: { exterior: { ...PLASTER } } })]);
        new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK }).execute(ctx);
        const after = map.get('w0')!.sideFinishes as Record<string, { materialId?: string }>;
        expect(after.interior?.materialId, 'the interior finish is saved and shown in the panel').toBe('wood-oak');
        expect(after.exterior?.materialId, 'and the other side is untouched').toBe('gypsum-skim');
    });

    it('setting the EXTERIOR over an existing interior warns the OTHER way round', () => {
        // The requested side does paint here, so the sentence must not claim it does
        // not — it must say what got covered. The two are not interchangeable to the
        // person who just asked for one of them.
        const { ctx } = makeCtx([wall('w0', { sideFinishes: { interior: { ...PLASTER } } })]);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'exterior', finish: OAK });
        const summary = cmd.execute(ctx).info![0]!;
        // eslint-disable-next-line no-console
        console.log(`[L-960] exterior-over-interior summary: ${summary}`);
        expect(cmd.masked).toEqual([{ wallId: 'w0', maskedSide: 'interior' }]);
        expect(summary).toContain('covers the interior finish');
        expect(summary).not.toContain('will NOT show it');
    });

    it('a MULTI-layer wall takes both finishes with no caveat — two bands, two surfaces', () => {
        const layered = wall('w0', {
            thickness: 0.3,
            layers: [
                { name: 'ext', function: 'finish-exterior', thickness: 0.02 },
                { name: 'core', function: 'structure', thickness: 0.26 },
                { name: 'int', function: 'finish-interior', thickness: 0.02 },
            ],
            sideFinishes: { exterior: { ...PLASTER } },
        });
        const { ctx } = makeCtx([layered]);
        const cmd = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK });
        const summary = cmd.execute(ctx).info![0]!;
        expect(cmd.masked, 'a layered wall can show both').toHaveLength(0);
        expect(summary).not.toContain('⚠');
    });

    it('CONTROL — the caveat is not a constant: the SAME command text differs by wall shape', () => {
        // One command, two seeds, two different sentences. A caveat that always fires
        // (or never does) would pass a single-case assertion and tell the user nothing.
        const bare = makeCtx([wall('w0')]);
        const dressed = makeCtx([wall('w0', { sideFinishes: { exterior: { ...PLASTER } } })]);
        const s1 = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK })
            .execute(bare.ctx).info![0]!;
        const s2 = new SetWallSideFinishBatchCommand({ wallIds: 'all', side: 'interior', finish: OAK })
            .execute(dressed.ctx).info![0]!;
        expect(s1).not.toBe(s2);
        expect(s1).not.toContain('⚠');
        expect(s2).toContain('⚠');
    });
});
