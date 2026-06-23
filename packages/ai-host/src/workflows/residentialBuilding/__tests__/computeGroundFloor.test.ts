// Residential building (multi-family) — §RESI-GROUND-FLOOR — computeGroundFloor unit test.
//
// Proves the PURE ground-floor descriptor helper:
//   - puts the entrance on the façade NEAREST the core (shorter lobby run);
//   - builds a lobby band that reaches from that façade to the core, core-width-centred;
//   - centres the entrance door on the lobby's X span;
//   - is exposed on the orchestrator result (status:'ok').

import { describe, it, expect } from 'vitest';
import {
    computeGroundFloor,
    orchestrateResidentialBuilding,
    type ResidentialBuildingOrchestratorInput,
} from '../residentialBuildingOrchestrator';
import type { Pt, Rect } from '../../apartmentLayout/tgl/rectDecomposition';

const plate: Rect = { x0: 0, z0: 0, x1: 30, z1: 18 };

describe('computeGroundFloor — §RESI-GROUND-FLOOR (pure)', () => {
    it('hosts the entrance on the NEARER Z-façade (core nearer z0 ⇒ entranceEdge=z0)', () => {
        // Core shifted toward z0 → the front gap (to z0) is smaller than the back gap.
        const core: Rect = { x0: 12, z0: 3, x1: 18, z1: 7 };
        const gf = computeGroundFloor(plate, core, 1.6);
        expect(gf.entranceEdge).toBe('z0');
        // Entrance centre sits ON the z0 façade, at the core's X-centre.
        expect(gf.entranceCenter.z).toBeCloseTo(0, 6);
        expect(gf.entranceCenter.x).toBeCloseTo(15, 6);
    });

    it('hosts the entrance on z1 when the core is nearer the back façade', () => {
        const core: Rect = { x0: 12, z0: 11, x1: 18, z1: 15 };
        const gf = computeGroundFloor(plate, core, 1.6);
        expect(gf.entranceEdge).toBe('z1');
        expect(gf.entranceCenter.z).toBeCloseTo(18, 6);
    });

    it('lobby band reaches from the chosen façade to the core, centred on the core X-centre', () => {
        const core: Rect = { x0: 12, z0: 3, x1: 18, z1: 7 };
        const gf = computeGroundFloor(plate, core, 1.6);
        const coreCx = (core.x0 + core.x1) / 2; // 15
        // Band is corridorWidth wide, centred on coreCx.
        expect(gf.lobby.x0).toBeCloseTo(coreCx - 0.8, 6);
        expect(gf.lobby.x1).toBeCloseTo(coreCx + 0.8, 6);
        // Band spans the façade (z0=0) to the core near edge (z0=3).
        expect(gf.lobby.z0).toBeCloseTo(0, 6);
        expect(gf.lobby.z1).toBeCloseTo(3, 6);
    });

    it('entrance width is wide but never exceeds the lobby band width', () => {
        const core: Rect = { x0: 12, z0: 3, x1: 18, z1: 7 };
        const wide = computeGroundFloor(plate, core, 2.0);
        expect(wide.entranceWidthM).toBeGreaterThanOrEqual(1.2);
        expect(wide.entranceWidthM).toBeLessThanOrEqual(1.8);
        const narrow = computeGroundFloor(plate, core, 1.2);
        // corridor 1.2 → entrance clamps to corridor−0.1 = 1.1 → floored at 1.2 min.
        expect(narrow.entranceWidthM).toBeGreaterThanOrEqual(1.1);
        expect(narrow.entranceWidthM).toBeLessThanOrEqual(narrow.lobby.x1 - narrow.lobby.x0 + 1e-6);
    });

    it('orchestrate exposes groundFloor on the ok result', () => {
        const input: ResidentialBuildingOrchestratorInput = {
            footprint: [
                { x: 0, z: 0 }, { x: 30, z: 0 }, { x: 30, z: 18 }, { x: 0, z: 18 },
            ] as Pt[],
            upperLevels: 3,
            coreWidthM: 6,
            coreDepthM: 5,
            corridorWidthM: 1.5,
            minApartmentAreaM2: 45,
            maxApartmentAreaM2: 120,
            typologies: { T1: false, T2: true, T3: true, T4: false },
        };
        const r = orchestrateResidentialBuilding(input);
        expect(r.status).toBe('ok');
        if (r.status !== 'ok') return;
        expect(r.groundFloor).toBeTruthy();
        expect(['x0', 'x1', 'z0', 'z1']).toContain(r.groundFloor.entranceEdge);
        expect(r.groundFloor.entranceWidthM).toBeGreaterThan(1);
        // The lobby is a real (positive-area) band.
        expect(r.groundFloor.lobby.x1).toBeGreaterThan(r.groundFloor.lobby.x0);
        expect(r.groundFloor.lobby.z1).toBeGreaterThan(r.groundFloor.lobby.z0);
    });
});
