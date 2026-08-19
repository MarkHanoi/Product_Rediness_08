/**
 * §FEAT-CW-PANEL-MATERIAL-CONTROL / C87 §13.4 CW-Attr-2 — a panel's C100 material
 * reaches the RECORD, and an undo reverts ONLY what the dispatch actually wrote.
 *
 * ⭐ THE ARM THAT MATTERS IS THE LAST ONE, AND IT IS THE ARM THAT WATCHES A REFUSAL
 * FIRE (C87 §13.12's red-first rule). The happy path here is nearly unfalsifiable —
 * write a field, read it back — and a suite containing only that would have passed
 * against the bug this discipline exists to prevent.
 *
 * The bug: if `previousMaterialId` were captured UNCONDITIONALLY (the older, weaker
 * pattern `previousMaterialOverride` still uses), then a dispatch that changed only
 * the PANEL TYPE would snapshot the material anyway and `undo()` would write it
 * back — silently reverting a material some OTHER command had set in between. That
 * is C84 EI-7: restoring a field you never wrote. It is invisible in every
 * single-command test and only appears when two commands interleave, which is why
 * the fourth arm below interleaves them ON PURPOSE.
 */
import { describe, it, expect } from 'vitest';
import { ReplacePanelTypeCommand } from '../src/curtainwall/ReplacePanelTypeCommand';

function makeStore(seed: any) {
    const map = new Map<string, any>([[seed.id, seed]]);
    return {
        map,
        get: (id: string) => map.get(id),
        update: (id: string, patch: any) => { map.set(id, { ...map.get(id), ...patch }); },
    };
}

function ctxFor(store: any) {
    return { stores: { curtainPanelStore: store } } as any;
}

function seedPanel(over: any = {}) {
    return {
        id: 'cw-1::2:1',
        type: 'curtain-panel',
        curtainWallId: 'cw-1',
        cellIndex: [2, 1],
        panelType: 'SystemPanel_Glass',
        ...over,
    };
}

describe('§CW-Attr-2 — per-panel material authoring', () => {
    it('writes materialId to the panel record', () => {
        const store = makeStore(seedPanel());
        const ctx = ctxFor(store);
        const cmd = new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Glass',
            materialId: 'stone-marble-carrara',
        });
        expect(cmd.execute(ctx).success).toBe(true);
        expect(store.map.get('cw-1::2:1').materialId).toBe('stone-marble-carrara');
    });

    it('clears materialId when passed null, so "Type default" is reachable', () => {
        // A dropdown whose only escape is picking a different material is a one-way
        // door. `null` is the escape, and it must reach the record as `undefined`
        // so `_getPanelMaterial` falls through to the panel type's default.
        const store = makeStore(seedPanel({ materialId: 'steel-corten' }));
        const ctx = ctxFor(store);
        new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Glass',
            materialId: null,
        }).execute(ctx);
        expect(store.map.get('cw-1::2:1').materialId).toBeUndefined();
    });

    it('undo restores the material this dispatch overwrote', () => {
        const store = makeStore(seedPanel({ materialId: 'wood-oak' }));
        const ctx = ctxFor(store);
        const cmd = new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Glass',
            materialId: 'stone-marble-carrara',
        });
        cmd.execute(ctx);
        expect(store.map.get('cw-1::2:1').materialId).toBe('stone-marble-carrara');
        cmd.undo(ctx);
        expect(store.map.get('cw-1::2:1').materialId).toBe('wood-oak');
    });

    it('⭐ undo does NOT revert a material this dispatch never wrote', () => {
        // THE RED-FIRST ARM. Command A changes only the panel TYPE and carries no
        // materialId. Command B then sets a material. Undoing A must leave B's
        // material alone — if `touchedMaterialId` were dropped and the snapshot
        // taken unconditionally, A.undo() would write `undefined` over B's work and
        // the user would watch a material vanish for no reason they can see.
        const store = makeStore(seedPanel({ materialId: 'wood-oak' }));
        const ctx = ctxFor(store);

        const a = new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Opaque',
        });
        a.execute(ctx);

        const b = new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Opaque',
            materialId: 'concrete-precast',
        });
        b.execute(ctx);
        expect(store.map.get('cw-1::2:1').materialId).toBe('concrete-precast');

        a.undo(ctx);

        // The panel type reverts, because A DID write it...
        expect(store.map.get('cw-1::2:1').panelType).toBe('SystemPanel_Glass');
        // ...and the material does NOT, because A never touched it.
        expect(store.map.get('cw-1::2:1').materialId).toBe('concrete-precast');
    });

    it('materialId and materialOverride are independent axes, not rivals', () => {
        // C100 §2.1: a hex tint cannot carry roughness/metalness/transparency, so
        // the two are different questions. Setting one must not disturb the other —
        // collapsing them would trade a rendering property for a rendering cost.
        const store = makeStore(seedPanel({ materialOverride: '#ff0000' }));
        const ctx = ctxFor(store);
        new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Glass',
            materialId: 'glass-reflective',
        }).execute(ctx);

        const p = store.map.get('cw-1::2:1');
        expect(p.materialId).toBe('glass-reflective');
        expect(p.materialOverride).toBe('#ff0000');
    });
});
