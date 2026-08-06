// ─── §FIX-TYPE-SWAP-ALL-FAMILIES (L-623) — the railing/handrail type swap ────────
//
// THE DEFECT THIS PINS: `HandrailTypeStore` has shipped five built-in railing types since
// it was authored, and NOTHING in the product could select one — no property-panel widget,
// no bus verb, no `element.changeType` branch (authored-but-unwired, the pattern L-621
// found for ceilings). `HandrailData` carries no `typeId`, so a railing type is
// MATERIALISED into the record; UpdateHandrailCommand is the command that owns the geometry
// `handrailStore` the fragment builder + plan projector + persistence read, but its payload
// could only express height / thickness / baseOffset / fillType / railProfile /
// materialColor — it had NO railDiameter and NO postSpacing, both of which every
// HandrailTypeDefinition declares and HandrailData stores. Applying a type through it would
// have produced a PARTIAL type: the right profile with the previous type's rail diameter
// and post spacing, silently.
//
// Asserted here:
//   (1) a built-in type is materialised WHOLE onto the record — every field the definition
//       declares reaches the store the builder reads;
//   (2) the element id is stable across the swap (in place, never delete+recreate);
//   (3) undo restores the EXACT prior record;
//   (4) the command REFUSES a non-finite / negative rail diameter or post spacing rather
//       than writing NaN geometry, while still allowing postSpacing === 0 (the built-in
//       "Stair Handrail" declares exactly that — no posts).

import { describe, it, expect, beforeEach } from 'vitest';
import { handrailTypeStore } from '@pryzm/core-app-model';
import { UpdateHandrailCommand } from '../src/handrails/UpdateHandrailCommand';
import type { CommandContext } from '../src/types';

const RAIL_ID = 'test-railing-typeswap-1';

function makeRailing(): Record<string, unknown> {
    return {
        id: RAIL_ID,
        type: 'handrail',
        levelId: 'L0',
        baseLine: [{ x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }],
        height: 0.9,
        thickness: 0.04,
        baseOffset: 0,
        fillType: 'open',
        railProfile: 'round',
        railDiameter: 0.04,
        postSpacing: 0,
        materialColor: '#888888',
    };
}

/** Faithful in-memory handrailStore stub — merge on update, verbatim on restoreSnapshot. */
function makeCtx(): { ctx: CommandContext; read: () => Record<string, unknown> } {
    const map = new Map<string, Record<string, unknown>>([[RAIL_ID, makeRailing()]]);
    const handrailStore = {
        getById: (id: string) => map.get(id),
        update: (id: string, updates: Record<string, unknown>) => {
            const cur = map.get(id);
            if (!cur) return undefined;
            map.set(id, { ...cur, ...updates });
            return map.get(id);
        },
        restoreSnapshot: (id: string, record: Record<string, unknown>) => { map.set(id, record); },
    };
    return {
        ctx: { stores: { handrailStore } } as unknown as CommandContext,
        read: () => map.get(RAIL_ID)!,
    };
}

describe('railing type swap — §FIX-TYPE-SWAP-ALL-FAMILIES (L-623)', () => {
    let env: ReturnType<typeof makeCtx>;
    beforeEach(() => { env = makeCtx(); });

    it('the catalogue can express a swap (more than one built-in railing type exists)', () => {
        expect(handrailTypeStore.getAll().length).toBeGreaterThan(1);
    });

    it('materialises a built-in type WHOLE onto the geometry record, id stable', () => {
        const def = handrailTypeStore.getById('glass-guardrail')!;
        expect(def).toBeDefined();

        const before = env.read();
        const cmd = new UpdateHandrailCommand({
            id:            RAIL_ID,
            height:        def.height,
            thickness:     def.thickness,
            baseOffset:    def.baseOffset,
            fillType:      def.fillType,
            railProfile:   def.railProfile,
            railDiameter:  def.railDiameter,
            postSpacing:   def.postSpacing,
            materialColor: def.materialColor,
        });
        expect(cmd.canExecute(env.ctx).ok).toBe(true);
        expect(cmd.execute(env.ctx).success).toBe(true);

        const after = env.read();
        expect(after.height).toBe(def.height);
        expect(after.thickness).toBe(def.thickness);
        expect(after.fillType).toBe(def.fillType);
        expect(after.railProfile).toBe(def.railProfile);
        expect(after.materialColor).toBe(def.materialColor);
        // (1) the two fields the payload could not previously carry — a partial type is
        // exactly the silent half-swap this fix exists to prevent.
        expect(after.railDiameter).toBe(def.railDiameter);
        expect(after.postSpacing).toBe(def.postSpacing);
        // (2) in place — same id, and the geometry (baseLine) is untouched by a TYPE change.
        expect(after.id).toBe(RAIL_ID);
        expect(after.baseLine).toEqual(before.baseLine);
    });

    it('undo restores the EXACT prior record', () => {
        const before = structuredClone(env.read());
        const def = handrailTypeStore.getById('timber-baluster')!;
        const cmd = new UpdateHandrailCommand({
            id: RAIL_ID, height: def.height, thickness: def.thickness,
            fillType: def.fillType, railProfile: def.railProfile,
            postSpacing: def.postSpacing, materialColor: def.materialColor,
        });
        cmd.execute(env.ctx);
        expect(env.read().fillType).toBe('baluster');

        expect(cmd.undo(env.ctx).success).toBe(true);
        expect(env.read()).toEqual(before);
    });

    it('accepts postSpacing === 0 (the built-in "Stair Handrail" has no posts)', () => {
        const def = handrailTypeStore.getById('stair-handrail')!;
        expect(def.postSpacing).toBe(0);
        const cmd = new UpdateHandrailCommand({ id: RAIL_ID, postSpacing: def.postSpacing });
        expect(cmd.canExecute(env.ctx).ok).toBe(true);
    });

    it('REFUSES a non-finite / non-positive railDiameter instead of writing NaN geometry', () => {
        for (const bad of [Number.NaN, 0, -0.02]) {
            const cmd = new UpdateHandrailCommand({ id: RAIL_ID, railDiameter: bad });
            expect(cmd.canExecute(env.ctx).ok).toBe(false);
        }
        expect(env.read().railDiameter).toBe(0.04);   // untouched by the refusal
    });

    it('REFUSES a negative postSpacing', () => {
        const cmd = new UpdateHandrailCommand({ id: RAIL_ID, postSpacing: -1 });
        expect(cmd.canExecute(env.ctx).ok).toBe(false);
    });
});
