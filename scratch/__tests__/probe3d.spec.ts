import { describe, it, expect } from 'vitest';
import { describePaneViewOptions } from '../../apps/editor/src/engine/views/paneViewOptions';

describe('PROBE — what state does bim-3d actually get?', () => {
    it('prints every option state for the founder\'s live layout', () => {
        const layout = { left: 'site-map-2d', right: 'site-3d' } as never;
        for (const mountable of [
            undefined,
            new Set(['maplibre', 'cesium']),
            new Set(['maplibre', 'cesium', 'canvas2d']),
            new Set(['maplibre', 'cesium', 'canvas2d', 'webgpu-three']),
        ]) {
            const opts = describePaneViewOptions({
                layout, paneId: 'left',
                mountableKinds: mountable as never,
            });
            const row = opts.find((o) => o.viewType === 'bim-3d');
            console.log(`mountable=${mountable ? [...mountable].join(',') : 'ALL(undefined)'} → `
                + `state=${row?.state} enabled=${row?.enabled} route=${(row as never as {fullScreenRoute?:string})?.fullScreenRoute}`);
        }
        expect(true).toBe(true);
    });
});
