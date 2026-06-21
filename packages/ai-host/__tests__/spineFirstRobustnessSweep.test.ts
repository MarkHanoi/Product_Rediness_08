// §SPINE-FIRST P3 — measure the spine-first core (subdivideViaSpine) against the SAME plate set the
// area-first §CIRCULATION-ROBUSTNESS-SWEEP measured (area-first = ~53% fully sound). Reports the
// fraction of (shell × program) combos where spine-first satisfies BOTH invariants with no drops:
//   I1 every room shares a ≥0.8 m corridor wall · I2 every window room touches the façade.
// This is the head-to-head that justifies the rebuild before any live wiring.

import { describe, expect, it } from 'vitest';
import { buildBubbleGraph } from '../src/workflows/apartmentLayout/tgl/bubbleGraph.js';
import { subdivideViaSpine } from '../src/workflows/apartmentLayout/tgl/subdivideViaSpine.js';
import type { Pt, Rect } from '../src/workflows/apartmentLayout/tgl/rectDecomposition.js';
import type { ApartmentProgram } from '../src/workflows/apartmentLayout/types.js';

const DOOR = 0.8;
function sharedWallM(a: Rect, b: Rect): number {
    const eps = 0.05;
    if (Math.abs(a.x1 - b.x0) < eps || Math.abs(b.x1 - a.x0) < eps) {
        const ov = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0); if (ov > eps) return ov;
    }
    if (Math.abs(a.z1 - b.z0) < eps || Math.abs(b.z1 - a.z0) < eps) {
        const ov = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0); if (ov > eps) return ov;
    }
    return 0;
}
function touchesFacade(r: Rect, shell: Rect): boolean {
    const e = 0.05;
    return Math.abs(r.x0 - shell.x0) < e || Math.abs(r.x1 - shell.x1) < e ||
           Math.abs(r.z0 - shell.z0) < e || Math.abs(r.z1 - shell.z1) < e;
}
const rectPoly = (w: number, d: number): Pt[] => [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: d }, { x: 0, z: d }];

describe('§SPINE-FIRST P3 — subdivideViaSpine robustness vs the area-first 53%', () => {
    it('satisfies I1+I2 on the broad plate set far more often than area-first', () => {
        const aspects = [1.0, 1.35, 1.75];
        const areaScales = [0.92, 1.05, 1.18];
        const programs: ApartmentProgram[] = [
            { bedrooms: 1, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true,  livingRoom: true, entranceHall: true },
            { bedrooms: 2, bathrooms: 1, masterEnSuite: true,  openPlanKitchenDining: true,  livingRoom: true, entranceHall: true },
            { bedrooms: 3, bathrooms: 2, masterEnSuite: true,  openPlanKitchenDining: false, livingRoom: true, entranceHall: true },
            { bedrooms: 2, bathrooms: 1, masterEnSuite: false, openPlanKitchenDining: true,  livingRoom: true, entranceHall: false },
        ];
        const targetAreaOf = (p: ApartmentProgram): number => 58 + p.bedrooms * 34;

        let total = 0, produced = 0, sound = 0, i1Fail = 0, i2Fail = 0, dropFail = 0;
        for (const prog of programs) for (const a of aspects) for (const scale of areaScales) {
            total++;
            const area = targetAreaOf(prog) * scale;
            const w = Math.sqrt(area / a), d = w * a;
            const poly = rectPoly(w, d);
            const shell: Rect = { x0: 0, z0: 0, x1: w, z1: d };
            let res;
            try {
                const graph = buildBubbleGraph(prog, area, poly, { envelopeFitGrowth: false });
                const winMap = new Map(graph.rooms.map(r => [r.id, r.needsWindow]));
                res = subdivideViaSpine(poly, graph);
                if (!res) continue;
                produced++;
                const i1ok = res.rooms.every(p => sharedWallM(p.rect, res!.corridor) >= DOOR);
                const i2ok = res.rooms.every(p => !winMap.get(p.roomId) || touchesFacade(p.rect, shell));
                const noDrop = res.dropped.length === 0;
                if (!i1ok) i1Fail++;
                if (!i2ok) i2Fail++;
                if (!noDrop) dropFail++;
                if (i1ok && i2ok && noDrop) sound++;
            } catch { /* count as not-sound */ }
        }

        const pct = (n: number): string => `${((n / total) * 100).toFixed(0)}%`;
        // eslint-disable-next-line no-console
        console.log(
            `\n[§SPINE-FIRST P3] subdivideViaSpine over ${total} (shell × program) combos:\n` +
            `  produced a layout:       ${produced}/${total} (${pct(produced)})\n` +
            `  I1+I2 sound (no drops):  ${sound}/${total} (${pct(sound)})   (area-first baseline ≈ 53%)\n` +
            `  fail breakdown: I1(off-corridor)=${i1Fail}  I2(no-façade)=${i2Fail}  dropped=${dropFail}\n`,
        );

        expect(total).toBeGreaterThanOrEqual(30);
        // Spine-first MUST beat the area-first 53% baseline on the same set — that is the rebuild's
        // entire justification. Pin a floor well above it; raise as P3 residual cases land.
        expect(sound / total).toBeGreaterThan(0.8);
    });
});
