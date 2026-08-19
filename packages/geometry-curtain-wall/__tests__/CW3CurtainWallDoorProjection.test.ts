/**
 * §CW-3 / C87 §13.5 — the curtain-wall door projection, and the ONE flag that is
 * a finding rather than a convenience.
 *
 * The arm that matters is `usingDefaults`. A panel typed `SystemPanel_Door` with no
 * `hostedDoor` record RENDERS as a correct door — `buildDoorObject` spreads
 * `DEFAULT_HOSTED_DOOR` at build time — while storing nothing, so a schedule that
 * reported those defaults as authored values would report numbers nobody chose.
 * A test asserting only "the door appears in the list" would pass against that.
 */
import { describe, it, expect } from 'vitest';
import {
    collectCurtainWallDoors,
    countCurtainWallDoors,
    isCurtainWallDoorPanel,
} from '../src/curtainWallDoors';
import { DEFAULT_HOSTED_DOOR } from '../src/CurtainPanelTypes';
import type { CurtainPanelData } from '../src/CurtainPanelTypes';

function panel(over: Partial<CurtainPanelData> & { id: string }): CurtainPanelData {
    return {
        type: 'curtain-panel',
        curtainWallId: 'cw-1',
        cellIndex: [0, 0],
        panelType: 'SystemPanel_Glass',
        ...over,
    } as CurtainPanelData;
}

describe('§CW-3 — curtain-wall doors are panels, and there is ONE enumerator', () => {
    it('finds only the door-typed cells', () => {
        const panels = [
            panel({ id: 'p0', cellIndex: [0, 0] }),
            panel({ id: 'p1', cellIndex: [1, 0], panelType: 'SystemPanel_Door' }),
            panel({ id: 'p2', cellIndex: [2, 0], panelType: 'SystemPanel_Opaque' }),
        ];
        const doors = collectCurtainWallDoors(panels);
        expect(doors.map(d => d.panelId)).toEqual(['p1']);
        expect(countCurtainWallDoors(panels)).toBe(1);
        expect(isCurtainWallDoorPanel(panels[0])).toBe(false);
        expect(isCurtainWallDoorPanel(panels[1])).toBe(true);
    });

    it('⭐ flags a door-typed cell with NO authored record as usingDefaults', () => {
        const [d] = collectCurtainWallDoors([
            panel({ id: 'p1', panelType: 'SystemPanel_Door' }),
        ]);
        expect(d.usingDefaults).toBe(true);
        // The values are still complete — a consumer never receives a partial door —
        // but it is told they were nobody's choice.
        expect(d.door).toEqual(DEFAULT_HOSTED_DOOR);
    });

    it('does NOT flag a door that carries an authored record, and fills its gaps', () => {
        const [d] = collectCurtainWallDoors([
            panel({
                id: 'p1',
                panelType: 'SystemPanel_Door',
                hostedDoor: { ...DEFAULT_HOSTED_DOOR, hingesSide: 'right', sillHeight: 0.4 },
            }),
        ]);
        expect(d.usingDefaults).toBe(false);
        expect(d.door.hingesSide).toBe('right');
        expect(d.door.sillHeight).toBe(0.4);
        // Untouched axes keep the default rather than becoming undefined.
        expect(d.door.frameThickness).toBe(DEFAULT_HOSTED_DOOR.frameThickness);
    });

    it('orders deterministically by wall, then column, then row — never by map order', () => {
        const panels = [
            panel({ id: 'b', curtainWallId: 'cw-2', cellIndex: [0, 0], panelType: 'SystemPanel_Door' }),
            panel({ id: 'a2', curtainWallId: 'cw-1', cellIndex: [1, 3], panelType: 'SystemPanel_Door' }),
            panel({ id: 'a1', curtainWallId: 'cw-1', cellIndex: [1, 0], panelType: 'SystemPanel_Door' }),
            panel({ id: 'a0', curtainWallId: 'cw-1', cellIndex: [0, 9], panelType: 'SystemPanel_Door' }),
        ];
        expect(collectCurtainWallDoors(panels).map(d => d.panelId))
            .toEqual(['a0', 'a1', 'a2', 'b']);
        // Same model, shuffled input, same rows.
        expect(collectCurtainWallDoors([...panels].reverse()).map(d => d.panelId))
            .toEqual(['a0', 'a1', 'a2', 'b']);
    });

    it('scopes the count to one wall when asked', () => {
        const panels = [
            panel({ id: 'a', curtainWallId: 'cw-1', panelType: 'SystemPanel_Door' }),
            panel({ id: 'b', curtainWallId: 'cw-2', cellIndex: [1, 0], panelType: 'SystemPanel_Door' }),
        ];
        expect(countCurtainWallDoors(panels, 'cw-1')).toBe(1);
        expect(countCurtainWallDoors(panels, 'cw-9')).toBe(0);
        expect(countCurtainWallDoors(panels)).toBe(2);
    });
});
