// §FIX-OFFICE-ENVELOPE-NOT-DISPOSED (L-321) — guard: after an office build, the 3D view is pinned to
// full detail so the massing-LOD "grey envelope" is OFF (the detailed floors are the only geometry).
//
// Tooth: WITHOUT the fix the office pipeline leaves the level-cull mode UNSET → a tall heavy tower
// (≥ 15 storeys, ≥ 1000 elements) auto-escalates to 'massing' and renders as a grey block envelope.
// WITH the fix, `showOfficeFullDetail()` calls the culling service's `setMode('all')`, the documented
// explicit override that forces full detail at any scale. This spec proves the office helper drives
// exactly that override (mocking the rendering service so the test is THREE-free and fast).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the shared rendering service so we assert the office helper's contract (it must force 'all')
// without importing THREE / the massing renderer.
const setMode = vi.fn<(mode: string) => void>();
vi.mock('@pryzm/core-app-model/rendering', () => ({
    levelScoped3DCullingService: {
        setMode: (m: string) => setMode(m),
    },
}));

import { showOfficeFullDetail } from '../src/ui/office-building/officeShowFullDetail.js';

describe('§FIX-OFFICE-ENVELOPE-NOT-DISPOSED — office 3D view pinned to full detail', () => {
    beforeEach(() => {
        setMode.mockClear();
    });

    it("pins the 3D detail mode to 'all' (massing LOD OFF) so the detailed tower is shown, not the grey envelope", () => {
        showOfficeFullDetail();
        expect(setMode).toHaveBeenCalledTimes(1);
        // The tooth: it MUST be 'all' — 'massing'/'scoped' would keep the grey envelope over the tower.
        expect(setMode).toHaveBeenCalledWith('all');
    });

    it('never throws when the rendering service errors (a hiccup must not fail the build)', () => {
        setMode.mockImplementationOnce(() => { throw new Error('boom'); });
        expect(() => showOfficeFullDetail()).not.toThrow();
    });
});
