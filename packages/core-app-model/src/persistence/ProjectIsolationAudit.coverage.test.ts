/**
 * §C13-SCENE-ROOT-COVERAGE — the audit must say what it COULD NOT SEE.
 *
 * THE FOUNDER'S REPRODUCTION (2026-08-10): a fresh project on a 251 m² Barcelona
 * parcel, `massing rendered: 0 wall(s) across 0 storey(s)`, and a viewport showing a
 * whole black plan-linework drawing plus several floating grey boxes. The console
 * said:
 *
 *   [C13 VIOLATION] … 1 finding(s): [scene.foreignElement×1]
 *
 * One. The audit was not lying about that element — it simply could not see any of
 * the rest, because every scene check is gated on `userData.id`/`elementId` + a type,
 * and linework groups, label sprites and GLB fallback boxes carry neither. A count of
 * 1 over a scene full of foreign geometry reads as "almost clean", which is worse
 * than no count at all (C13 §3.10).
 *
 * These tests pin the repair: the audit reports its own COVERAGE next to its verdict,
 * on the clean path and the violation path alike, and it names the roots it cannot
 * attribute rather than inventing violations for lights and helpers.
 */

import { describe, it, expect } from 'vitest';
import {
    summariseSceneCoverage,
    formatSceneCoverage,
    detectLeaks,
    type SceneObjectLike,
} from './ProjectIsolationAudit';

const root = (o: Partial<SceneObjectLike>): SceneObjectLike => ({ isRoot: true, ...o });

describe('§C13-SCENE-ROOT-COVERAGE — summariseSceneCoverage', () => {
    it('counts only DIRECT scene children as roots', () => {
        const c = summariseSceneCoverage([
            root({ type: 'Group', name: 'wall-1', userData: { id: 'w1', elementType: 'wall' } }),
            // A child mesh of that wall — not a root, must not inflate the denominator.
            { isRoot: false, type: 'Mesh', name: 'wall-1-part', userData: { id: 'w1' } },
        ]);
        expect(c.rootCount).toBe(1);
    });

    it('treats an id-carrying root as ATTRIBUTED (the BIM half the audit already checks)', () => {
        const c = summariseSceneCoverage([
            root({ type: 'Group', name: 'wall-1', userData: { id: 'w1', elementType: 'wall' } }),
        ]);
        expect(c.unattributed).toEqual([]);
    });

    it('does NOT accuse lights, cameras or helpers — an audit that cries wolf gets muted', () => {
        const c = summariseSceneCoverage([
            root({ type: 'DirectionalLight', name: 'sun' }),
            root({ type: 'HemisphereLight' }),
            root({ type: 'PerspectiveCamera' }),
            root({ type: 'GridHelper', name: 'grid' }),
        ]);
        expect(c.rootCount).toBe(4);
        expect(c.unattributed).toEqual([]);
    });

    it('does NOT accuse the declared exempt singletons (origin datum, previews, hit proxies)', () => {
        const c = summariseSceneCoverage([
            root({ type: 'Mesh', name: 'ProjectOrigin', userData: { isProjectOrigin: true } }),
            root({ type: 'Group', name: 'wall-preview', userData: { isPreview: true } }),
            root({ type: 'Mesh', userData: { role: 'hit-proxy' } }),
        ]);
        expect(c.unattributed).toEqual([]);
    });

    it('NAMES the geometry-bearing roots it cannot attribute — the founder case', () => {
        const c = summariseSceneCoverage([
            // The black plan linework: a LineSegments group with no element id.
            root({ type: 'LineSegments', name: 'technical-drawing-plan-L0' }),
            // The floating grey boxes: GLB-fallback furniture proxies, no id stamped.
            root({ type: 'Mesh', name: 'furniture-fallback-box' }),
            root({ type: 'Group' }),
        ]);
        expect(c.rootCount).toBe(3);
        expect(c.unattributed).toEqual([
            'LineSegments "technical-drawing-plan-L0"',
            'Mesh "furniture-fallback-box"',
            'Group (unnamed)',
        ]);
    });
});

describe('§C13-SCENE-ROOT-COVERAGE — formatSceneCoverage', () => {
    it('distinguishes "no scene to inspect" from "an empty scene"', () => {
        // The L-713 mistake in miniature: these two must never share a string.
        expect(formatSceneCoverage({ rootCount: 0, unattributed: [] }))
            .toContain('NO roots to inspect');
        expect(formatSceneCoverage({ rootCount: 5, unattributed: [] }))
            .toContain('all 5 scene root(s) attributable');
    });

    it('states the unattributed fraction and refuses to call it clean', () => {
        const s = formatSceneCoverage({ rootCount: 9, unattributed: ['Group "a"', 'Mesh "b"'] });
        expect(s).toContain('2/9');
        expect(s).toContain('UNATTRIBUTED');
        expect(s).toContain('neither proven clean nor proven leaked');
        expect(s).toContain('Group "a"');
    });

    it('caps the named list so a large leak cannot flood the console line', () => {
        const many = Array.from({ length: 20 }, (_, i) => `Mesh "m${i}"`);
        const s = formatSceneCoverage({ rootCount: 20, unattributed: many });
        expect(s).toContain('+12 more');
        expect(s).not.toContain('m9"');
    });
});

describe('§STARTUP-C13-IDENTITY — a finding names its culprit', () => {
    it('scene.foreignElement carries "<id> ⇐ <type> \\"name\\"" identities', () => {
        const report = detectLeaks({
            projectId: 'proj-B',
            expectedIds: new Set<string>(),
            sceneObjects: [
                // Copied from WallFragmentBuilder.ts:822 — the shape the world really produces.
                { name: 'wall-w1', userData: { id: 'w1', elementType: 'wall', type: 'wall', selectable: true } },
            ],
            storeElements: [],
            globals: [],
        });
        expect(report).not.toBeNull();
        const finding = report!.findings.find(f => f.surface === 'scene.foreignElement')!;
        expect(finding.count).toBe(1);
        expect(finding.identities).toEqual(['w1 ⇐ wall "wall-w1"']);
        // `details` keeps its bare-id shape — pinned by downstream consumers.
        expect(finding.details).toEqual(['w1']);
    });

    it('dedupes a root and its part meshes into ONE named element', () => {
        const report = detectLeaks({
            projectId: 'proj-B',
            expectedIds: new Set<string>(),
            sceneObjects: [
                { name: 'wall-w1', userData: { id: 'w1', elementType: 'wall' } },
                { name: 'wall-w1-layer0', userData: { id: 'w1', elementType: 'wall' } },
                { name: 'wall-w1-layer1', userData: { id: 'w1', elementType: 'wall' } },
            ],
            storeElements: [],
            globals: [],
        });
        const finding = report!.findings.find(f => f.surface === 'scene.foreignElement')!;
        expect(finding.count).toBe(1);
        expect(finding.identities).toEqual(['w1 ⇐ wall "wall-w1"']);
    });
});
