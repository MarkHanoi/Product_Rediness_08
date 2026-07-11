/**
 * ProjectIsolationAudit — L-224 §AUDIT-PROJECT-ISOLATION-E2E.
 *
 * Unit-tests the PURE `detectLeaks()` core: the audit now runs on EVERY load and
 * compares live state against the loaded snapshot's expected element-id set, so
 * it must (a) stay silent on a legitimately-populated load (zero false positives)
 * and (b) fire on cross-project leftovers (the "open another project" case).
 */

import { describe, it, expect } from 'vitest';
import { detectLeaks, type AuditInput } from './ProjectIsolationAudit';

function base(partial: Partial<AuditInput>): AuditInput {
    return {
        projectId: 'B',
        expectedIds: new Set<string>(),
        sceneObjects: [],
        storeElements: [],
        globals: [],
        ...partial,
    };
}

describe('detectLeaks — populated load (zero false positives)', () => {
    it('is CLEAN when every live element id is in the expected set', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1', 'slab_B2']),
            sceneObjects: [
                { userData: { elementId: 'wall_B1', elementType: 'wall' } },
                { userData: { elementId: 'slab_B2', elementType: 'slab' } },
            ],
            storeElements: [
                { store: 'wallStore', ids: ['wall_B1'] },
                { store: 'slabStore', ids: ['slab_B2'] },
            ],
        }));
        expect(report).toBeNull();
    });
});

describe('detectLeaks — cross-project leftovers (the founder case)', () => {
    it('FLAGS a foreign element in a store (id not in expected set)', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1']),
            storeElements: [{ store: 'wallStore', ids: ['wall_B1', 'furniture_A9'] }],
        }));
        expect(report).not.toBeNull();
        const surf = report!.findings.map(f => f.surface);
        expect(surf).toContain('store.foreignElement');
        expect(report!.findings.find(f => f.surface === 'store.foreignElement')!.count).toBe(1);
    });

    it('FLAGS a foreign element left in the THREE scene', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1']),
            sceneObjects: [{ userData: { elementId: 'plumbing_A1', elementType: 'plumbing' } }],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('scene.foreignElement');
    });

    it('empty project (empty expected set) flags ANY surviving element', () => {
        const report = detectLeaks(base({
            expectedIds: new Set<string>(),
            storeElements: [{ store: 'wallStore', ids: ['wall_A1'] }],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('store.foreignElement');
    });
});

describe('detectLeaks — always-junk surfaces (independent of ids)', () => {
    it('FLAGS an underlay mesh even when ids all match', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1']),
            sceneObjects: [
                { userData: { elementId: 'wall_B1', elementType: 'wall' } },
                { name: 'FloorPlanUnderlay_1', userData: {} },
            ],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('scene.underlay');
    });

    it('FLAGS a surviving window singleton', () => {
        const report = detectLeaks(base({
            expectedIds: new Set(['wall_B1']),
            globals: ['window.floorPlanUnderlayTool is non-null'],
        }));
        expect(report!.findings.map(f => f.surface)).toContain('window.globals');
    });
});

describe('detectLeaks — unknown expectation degrades safely', () => {
    it('does NOT flag store/element ids when expectedIds is null, but still flags junk', () => {
        const report = detectLeaks(base({
            expectedIds: null, // loader bypassed → expectation unknown
            storeElements: [{ store: 'wallStore', ids: ['wall_A1'] }],
            sceneObjects: [{ userData: { isIfcGroup: true } }],
        }));
        const surf = report!.findings.map(f => f.surface);
        expect(surf).toContain('scene.ifc');            // always-junk still fires
        expect(surf).not.toContain('store.foreignElement'); // id checks suppressed
        expect(surf).not.toContain('scene.foreignElement');
    });
});
