/**
 * §INSPECT-OPENINGS-PARTICIPATE (L-2030) / hit-proxy (L-2031) — lane INSP1, 2026-08-21.
 *
 * Pins the founder's report of 2026-08-21 (production `071a7b2c`, WebGL):
 *   *"in Inspect mode, some windows render in black … clearly not part of the
 *   colour mapping."*
 *
 * ⛔ THE FALSIFIABLE CLAIM. Before this change,
 * `DiagnosticMaterialManager._applyGhostToNonRoomMesh()` walked the parent chain
 * and `return false`d — applied NO GHOST MATERIAL — for any mesh under a group
 * whose `userData.elementType` was 'door' or 'window'. Doors and windows were
 * therefore the ONLY families keeping their authored, fully opaque materials
 * while every other surface became 4–10% translucent.
 *
 * These tests drive the PURE decision (`resolveGhostRole`) rather than the THREE
 * scene, because that is the thing that was wrong: the decision, not the drawing.
 * `case 1` fails on the old code — it returned no role for a window sub-mesh.
 */

import { describe, it, expect } from 'vitest';
import {
    resolveGhostRole,
    ghostOpacityForRole,
    roleIsGhosted,
    GHOST_OPENING_OPACITY,
    GHOST_STRUCTURAL_OPACITY,
    GHOST_NON_STRUCTURAL_OPACITY,
    type GhostSubject,
} from '../src/engine/inspect/ghostParticipation';

const subject = (over: Partial<GhostSubject> = {}): GhostSubject => ({
    selfType: null,
    ancestorTypes: [],
    role: null,
    isRoom: false,
    isShaderMaterial: false,
    ...over,
});

describe('§INSPECT-OPENINGS-PARTICIPATE — openings are part of the colour mapping', () => {
    it('1. a window SUB-MESH (type only on its ancestor group) is GHOSTED, not skipped', () => {
        // WindowBuilder.buildVisuals() adds frame / mullion / pane meshes with no
        // elementType of their own; the type lives on the parent THREE.Group.
        const role = resolveGhostRole(subject({ ancestorTypes: ['window', null] }));
        expect(role).toBe('opening');
        expect(roleIsGhosted(role)).toBe(true);
        expect(ghostOpacityForRole(role)).toBe(GHOST_OPENING_OPACITY);
    });

    it('2. a door SUB-MESH is ghosted too — the same skip covered both families', () => {
        const role = resolveGhostRole(subject({ ancestorTypes: ['door'] }));
        expect(role).toBe('opening');
        expect(roleIsGhosted(role)).toBe(true);
    });

    it('3. a window mesh that DOES carry its own elementType is ghosted', () => {
        expect(resolveGhostRole(subject({ selfType: 'window' }))).toBe('opening');
    });

    it('4. the opening weight is per ELEMENT: 12 stacked sub-boxes ≈ a 2-mesh wall', () => {
        // The "ghost profile" defect the old blanket skip over-corrected for was
        // ACCUMULATION: 12 sub-meshes at the flat non-structural alpha stack to a
        // bright blob. State that as arithmetic so a future edit to either
        // constant has to face it.
        const stacked = (alpha: number, n: number) => 1 - Math.pow(1 - alpha, n);
        const windowFine = stacked(GHOST_OPENING_OPACITY, 12);
        const wall       = stacked(GHOST_STRUCTURAL_OPACITY, 2);
        const oldBehaviour = stacked(GHOST_NON_STRUCTURAL_OPACITY, 12);

        expect(windowFine).toBeLessThan(wall);            // never louder than a wall
        expect(windowFine).toBeGreaterThan(wall * 0.5);   // but genuinely present
        expect(oldBehaviour).toBeGreaterThan(wall * 1.5); // the blob it replaces
    });

    it('5. structural / non-structural classification is unchanged', () => {
        expect(resolveGhostRole(subject({ selfType: 'wall' }))).toBe('structural');
        expect(resolveGhostRole(subject({ selfType: 'structural-wall' }))).toBe('structural');
        expect(resolveGhostRole(subject({ selfType: 'slab' }))).toBe('structural');
        expect(resolveGhostRole(subject({ selfType: 'column' }))).toBe('structural');
        expect(resolveGhostRole(subject({ selfType: 'furniture' }))).toBe('non-structural');
        expect(resolveGhostRole(subject({ selfType: null }))).toBe('non-structural');
    });

    it('6. the ShaderMaterial guard still out-ranks everything (OBC SimpleGrid uZoom crash)', () => {
        const role = resolveGhostRole(subject({ selfType: 'wall', isShaderMaterial: true }));
        expect(role).toBe('skip-shader');
        expect(roleIsGhosted(role)).toBe(false);
    });

    it('7. L-2031 — an invisible hit-proxy is NEVER a ghost subject', () => {
        // WindowBuilder._convertGroupToInstances leaves one `colorWrite:false`
        // proxy per window purely so raycast selection still resolves the group.
        // Ghosting it turns a selection helper into a visible box.
        const role = resolveGhostRole(subject({ role: 'hit-proxy', ancestorTypes: ['window'] }));
        expect(role).toBe('skip-hit-proxy');
        expect(roleIsGhosted(role)).toBe(false);
    });

    it('8. room volumes and overlays stay the caller’s business', () => {
        expect(resolveGhostRole(subject({ isRoom: true }))).toBe('room');
        expect(roleIsGhosted('room')).toBe(false);
    });
});
