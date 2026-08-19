/**
 * §CW-3 / C87 §13.5 — authoring a curtain-wall door REACHES THE PANEL RECORD.
 *
 * ⭐ THE ARM THAT MATTERS IS THE SECOND ONE, AND IT IS THE L-1057 SHAPE.
 * `buildDoorObject` spreads `DEFAULT_HOSTED_DOOR` at BUILD time
 * (`CurtainPanelFactory.ts:299`). So a cell switched to `SystemPanel_Door` with no
 * `hostedDoor` record RENDERS as a perfectly correct door — and stores nothing.
 * `isAuthoredPanel` then sees `hostedDoor === undefined`, the sparse-override
 * writer records only the `panelType`, and the six door fields never reach the
 * file. The defect is invisible at the pixel and fatal at the save, which is
 * precisely why the assertion here is on the RECORD and not on the render.
 */
import { describe, it, expect } from 'vitest';
import { ReplacePanelTypeCommand } from '../src/curtainwall/ReplacePanelTypeCommand';
import { DEFAULT_HOSTED_DOOR, isCurtainWallDoorPanel } from '@pryzm/geometry-curtain-wall';

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

describe('§CW-3 — hosted door authoring', () => {
    it('⭐ materialises DEFAULT_HOSTED_DOOR when a cell becomes a door with no config', () => {
        const store = makeStore(seedPanel());
        const cmd = new ReplacePanelTypeCommand({ panelId: 'cw-1::2:1', newPanelType: 'SystemPanel_Door' });
        expect(cmd.canExecute(ctxFor(store)).ok).toBe(true);
        expect(cmd.execute(ctxFor(store)).success).toBe(true);

        const p = store.map.get('cw-1::2:1');
        expect(isCurtainWallDoorPanel(p)).toBe(true);
        // Without this the door would render correctly and save as nothing.
        expect(p.hostedDoor).toEqual(DEFAULT_HOSTED_DOOR);
    });

    it('MERGES a partial door config onto the defaults rather than blanking the rest', () => {
        const store = makeStore(seedPanel());
        new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Door',
            hostedDoor: { hingesSide: 'right' },
        }).execute(ctxFor(store));

        const d = store.map.get('cw-1::2:1').hostedDoor;
        expect(d.hingesSide).toBe('right');
        expect(d.swingDirection).toBe(DEFAULT_HOSTED_DOOR.swingDirection);
        expect(d.frameThickness).toBe(DEFAULT_HOSTED_DOOR.frameThickness);
    });

    it('MERGES onto what the panel ALREADY has, so a second edit keeps the first', () => {
        const store = makeStore(seedPanel({
            panelType: 'SystemPanel_Door',
            hostedDoor: { ...DEFAULT_HOSTED_DOOR, hingesSide: 'right', sillHeight: 0.9 },
        }));
        new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Door',
            hostedDoor: { swingDirection: 'outward' },
        }).execute(ctxFor(store));

        const d = store.map.get('cw-1::2:1').hostedDoor;
        expect(d.swingDirection).toBe('outward');
        expect(d.hingesSide).toBe('right');
        expect(d.sillHeight).toBe(0.9);
    });

    it('undo restores the PREVIOUS door — including back to absent', () => {
        const store = makeStore(seedPanel());
        const cmd = new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Door',
            hostedDoor: { hingesSide: 'right' },
        });
        cmd.execute(ctxFor(store));
        expect(store.map.get('cw-1::2:1').hostedDoor).toBeDefined();

        cmd.undo(ctxFor(store));
        const p = store.map.get('cw-1::2:1');
        expect(p.panelType).toBe('SystemPanel_Glass');
        expect(p.hostedDoor).toBeUndefined();
    });

    it('does NOT touch hostedDoor on a dispatch that never mentions it (no silent revert)', () => {
        const authored = { ...DEFAULT_HOSTED_DOOR, hingesSide: 'right' as const };
        const store = makeStore(seedPanel({ panelType: 'SystemPanel_Door', hostedDoor: authored }));
        const cmd = new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Glass',
        });
        cmd.execute(ctxFor(store));
        // Deliberate: leaving the sub-record lets a change of mind restore the user's
        // hinge side rather than the factory defaults. It is inert on a glass panel.
        expect(store.map.get('cw-1::2:1').hostedDoor).toEqual(authored);

        cmd.undo(ctxFor(store));
        expect(store.map.get('cw-1::2:1').hostedDoor).toEqual(authored);
    });

    it('clears the door when explicitly passed null', () => {
        const store = makeStore(seedPanel({
            panelType: 'SystemPanel_Door', hostedDoor: { ...DEFAULT_HOSTED_DOOR },
        }));
        new ReplacePanelTypeCommand({
            panelId: 'cw-1::2:1',
            newPanelType: 'SystemPanel_Glass',
            hostedDoor: null,
        }).execute(ctxFor(store));
        expect(store.map.get('cw-1::2:1').hostedDoor).toBeUndefined();
    });
});
