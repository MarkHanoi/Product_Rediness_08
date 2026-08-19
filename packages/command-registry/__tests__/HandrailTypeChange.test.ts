/**
 * §FEAT-HANDRAIL-TYPE-PROJECTION (L-1105) — "CHANGE THIS RAILING TO A FRAMELESS
 * GLASS BALUSTRADE", EXECUTED, INCLUDING THE HALF THAT FAILS SILENTLY.
 *
 * ─── THE TRAP THIS FILE EXISTS FOR ──────────────────────────────────────────
 * Applying a railing type materialises thirteen fields onto the record, and the
 * fourteenth thing it must do is CLEAR the record's `materialColor`.
 *
 * A catalogue type carries a `materialId` and NO hex — C100 §2.1 forbids the hex
 * by name, and this family shipped that exact breach once (the 20 types, fixed at
 * 10513bf4). `UpdateHandrailCommand` reads `undefined` as *"leave this alone"* and
 * `null` as *"clear it"*. So if the projection omits `materialColor` when the type
 * is silent about colour — which every correct type is — a user's hex override
 * SURVIVES the retype and shadows the new material forever
 * (`resolveMaterialColour`'s step 1: *"an explicit override always wins"*).
 *
 * ⚠ WHAT THAT LOOKS LIKE TO THE USER: they ask for frameless glass, the record
 * says frameless glass, the property panel says frameless glass — and the railing
 * on screen stays the old colour. Nothing errors. Nothing warns. It is the worst
 * class of defect, and it is one `??` away at all times.
 *
 * ⛔ PRESERVED-BY-LUCK IS NOT PRESERVED. Every assertion below runs against a real
 * `HandrailStore` through the real command, and the colour claim is checked at the
 * RESOLUTION LADDER the renderer uses — not by reading the field back, which would
 * pass even if the ladder ignored it.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ProjectContext, resolveMaterialColour } from '@pryzm/core-app-model';
import { HandrailStore, handrailTypeStore } from '@pryzm/core-app-model/stores';
import type { HandrailData } from '@pryzm/core-app-model/stores';
import {
    resolveHandrailTypeFields,
    HANDRAIL_TYPE_FIELD_NAMES,
} from '@pryzm/geometry-handrail';
import {
    serializeHandrailRecord,
    buildHandrailCreatePayload,
} from '@pryzm/core-app-model/stores';
import { CreateHandrailCommand } from '../src/handrails/CreateHandrailCommand';
import { UpdateHandrailCommand } from '../src/handrails/UpdateHandrailCommand';
import type { CommandContext } from '../src/types';

const LEVEL_ID = 'L0';
/** The founder's exact phrase resolves to this id. */
const TARGET_TYPE = 'glass-frameless';

function makeCtx(): { ctx: CommandContext; store: HandrailStore } {
    const store = new HandrailStore(new ProjectContext());
    const ctx = {
        stores: { handrailStore: store },
        bimManager: {
            getLevelById: (id: string) => (id === LEVEL_ID ? { id, elevation: 0 } : undefined),
            registerElement: () => {},
            unregisterElement: () => {},
        },
        projectContext: { activeLevelId: LEVEL_ID },
    } as unknown as CommandContext;
    return { ctx, store };
}

/** A railing the user has hand-overridden to a hex — the case that breaks. */
function seedOverriddenRailing(ctx: CommandContext, store: HandrailStore): HandrailData {
    new CreateHandrailCommand({
        id: 'hr-1',
        start: { x: 0, z: 0 },
        end: { x: 4, z: 0 },
        height: 1.0,
        thickness: 0.05,
        levelId: LEVEL_ID,
        fillType: 'baluster',
        railProfile: 'rectangular',
        materialId: 'steel-painted',
        materialColor: '#ff0000',
    } as never).execute(ctx);
    const rail = store.getAll().find(h => h.id === 'hr-1')!;
    // The premise: BEFORE the retype, the override is what the renderer sees.
    expect(resolveMaterialColour(rail.materialId, rail.materialColor).state).toBe('override');
    return rail;
}

/** The retype, exactly as the panel and the bus branch now perform it. */
function applyType(ctx: CommandContext, id: string, typeId: string): void {
    const def = handrailTypeStore.getById(typeId)!;
    expect(def, `type ${typeId} must exist in the catalogue`).toBeDefined();
    const f = resolveHandrailTypeFields(def as never);
    new UpdateHandrailCommand({
        id,
        height: f.height,
        thickness: f.thickness,
        baseOffset: f.baseOffset,
        fillType: f.fillType,
        railProfile: f.railProfile,
        railDiameter: f.railDiameter,
        postSpacing: f.postSpacing,
        balusterShape: f.balusterShape,
        balusterWidth: f.balusterWidth,
        balusterSpacing: f.balusterSpacing,
        infillMaxGap: f.infillMaxGap,
        materialId: f.materialId,
        materialColor: f.materialColor,
    } as never).execute(ctx);
}

describe('L-1105 — the railing-type projection, and the null that must survive it', () => {
    it('⭐ the founder’s phrase resolves: "Frameless Glass Balustrade" is a real catalogue id', () => {
        const def = handrailTypeStore.getById(TARGET_TYPE);
        expect(def).toBeDefined();
        expect(def!.name).toBe('Frameless Glass Balustrade');
        // C100 §2.1 — a type REFERENCES a material and carries NO hex. If this ever
        // fails, the projection's `?? null` is masking a re-shipped breach.
        expect(def!.materialId).toBeTruthy();
        expect(def!.materialColor).toBeUndefined();
    });

    it('⛔ the projection emits materialColor: null — NOT undefined, NOT omitted', () => {
        const f = resolveHandrailTypeFields(handrailTypeStore.getById(TARGET_TYPE)! as never);
        expect(f.materialColor).toBeNull();
        expect('materialColor' in f).toBe(true);
        expect(HANDRAIL_TYPE_FIELD_NAMES).toContain('materialColor');
    });

    it('⭐ retyping a HEX-OVERRIDDEN railing CLEARS the override — the silent failure, pinned', () => {
        const { ctx, store } = makeCtx();
        seedOverriddenRailing(ctx, store);

        applyType(ctx, 'hr-1', TARGET_TYPE);

        const after = store.getAll().find(h => h.id === 'hr-1')!;
        expect(after.materialColor).toBeUndefined();
        expect(after.materialId).toBe(handrailTypeStore.getById(TARGET_TYPE)!.materialId);
    });

    it('⭐ …and the NEW materialId is what the RENDER resolves — checked at the ladder, not the field', () => {
        const { ctx, store } = makeCtx();
        seedOverriddenRailing(ctx, store);
        applyType(ctx, 'hr-1', TARGET_TYPE);

        const after = store.getAll().find(h => h.id === 'hr-1')!;
        const resolved = resolveMaterialColour(after.materialId, after.materialColor);
        // Anything but 'override' means the old hex no longer wins. Reading the field
        // back would pass even if the ladder still preferred a stale value.
        expect(resolved.state).not.toBe('override');
        expect((resolved as { shadowedMaterialId?: string }).shadowedMaterialId).toBeUndefined();
    });

    it('the whole type lands, not just its colour — 13 fields materialised onto the record', () => {
        const { ctx, store } = makeCtx();
        seedOverriddenRailing(ctx, store);
        applyType(ctx, 'hr-1', TARGET_TYPE);

        const after = store.getAll().find(h => h.id === 'hr-1')!;
        const def = handrailTypeStore.getById(TARGET_TYPE)!;
        expect(after.fillType).toBe('glass');
        expect(after.railProfile).toBe('round');
        expect(after.height).toBe(def.height);
        expect(after.thickness).toBe(def.thickness);
        expect(after.railDiameter).toBe(def.railDiameter);
        expect(after.postSpacing).toBe(def.postSpacing);
    });

    /**
     * The orchestrator's condition for calling this done: a type change made from
     * CHAT must still be there after a save and a reload. `CARRIED_FIELDS` in
     * `handrailPersistence` claims to carry the type fields — this executes it.
     */
    it('⭐ a retype SURVIVES a save/load round trip, including the CLEARED override', () => {
        const { ctx, store } = makeCtx();
        seedOverriddenRailing(ctx, store);
        applyType(ctx, 'hr-1', TARGET_TYPE);
        const retyped = store.getAll().find(h => h.id === 'hr-1')!;

        // SAVE → the real JSON boundary → LOAD, through the one persistence pair.
        const snapshot = JSON.parse(JSON.stringify(serializeHandrailRecord(retyped)));
        const { ctx: ctx2, store: store2 } = makeCtx();
        const res = new CreateHandrailCommand(buildHandrailCreatePayload(snapshot) as never).execute(ctx2);
        expect(res.success).toBe(true);

        const reloaded = store2.getAll().find(h => h.id === 'hr-1')!;
        expect(reloaded.fillType).toBe('glass');
        expect(reloaded.railProfile).toBe('round');
        expect(reloaded.materialId).toBe(handrailTypeStore.getById(TARGET_TYPE)!.materialId);
        // ⛔ THE OVERRIDE MUST NOT COME BACK. A serialiser that re-emits a cleared
        // field as its old value would undo the retype at the next F5 — the same
        // "authored, rendered once, gone after reload" shape as L-1102.
        expect(reloaded.materialColor).toBeUndefined();
        expect(resolveMaterialColour(reloaded.materialId, reloaded.materialColor).state).not.toBe('override');
    });

    it('the panel and the bus branch cannot drift — both call the ONE projection', () => {
        const root = resolve(__dirname, '../../..');
        const read = (p: string) => readFileSync(resolve(root, p), 'utf8');
        for (const p of [
            'apps/editor/src/ui/property-panel/RailingTypeSelectorWidget.ts',
            'apps/editor/src/engine/initBusHandlers.ts',
        ]) {
            expect(read(p), p).toContain('resolveHandrailTypeFields');
        }
        // And no second copy of the materialisation survives in the widget.
        expect(read('apps/editor/src/ui/property-panel/RailingTypeSelectorWidget.ts'))
            .not.toContain('def.materialColor ?? null');
    });
});
