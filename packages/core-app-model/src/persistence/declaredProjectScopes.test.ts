// ADR-0298 §PROBE-SET-DECLARED — the declared expected probe set, and the audit
// behaviour that depends on it.
//
// The whole point of ADR-0298 is that the audit's POPULATION stops being "whatever
// registered". These tests state that difference behaviourally: the same world,
// audited with and without a declaration, must produce different verdicts.

import { describe, it, expect } from 'vitest';
import {
    DECLARED_PROJECT_SCOPES,
    DECLARED_PROJECT_SCOPE_NAMES,
    DECLARED_SCOPES_REQUIRING_PRESENCE,
    LOAD_DERIVED_ELEMENT_TYPES,
} from './declaredProjectScopes';
import { detectLeaks } from './ProjectIsolationAudit';

const PROJECT_B = 'proj-1786046957876-bafedec3560a'; // the founder's 096e12b4 project

describe('ADR-0298 §2 — a DECLARED owner that did not register is a FINDING, not an absence', () => {
    /** The founder's 096e12b4 world: gis.areaLayout answered, gis.cesiumViewport did not. */
    const world = {
        projectId: PROJECT_B,
        expectedIds: new Set<string>(),
        sceneObjects: [],
        storeElements: [],
        globals: [],
        scopeProbes: [
            { scope: 'site.model', owningProjectId: null },
            { scope: 'site.dispatch', owningProjectId: null },
            { scope: 'site.neighbourFootprints', owningProjectId: null },
            { scope: 'gis.areaLayout', owningProjectId: null },
            // gis.cesiumViewport: NOT PRESENT. The viewport was never constructed —
            // or its registration was skipped. Those are the same value here, which
            // is the entire defect.
        ],
    };

    it('THE FAILING ASSERTION FIRST: with a DISCOVERED population this world audits CLEAN', () => {
        // Pre-ADR-0298 behaviour, reproduced by omitting `declaredScopes`. This is
        // the `✓ loaded clean` the founder's log printed while one owner was missing.
        expect(detectLeaks(world)).toBeNull();
    });

    it('with the DECLARED population it raises scope.probeMissing and names the owner', () => {
        const report = detectLeaks({ ...world, declaredScopes: DECLARED_SCOPES_REQUIRING_PRESENCE });
        expect(report).not.toBeNull();
        const finding = report!.findings.find(f => f.surface === 'scope.probeMissing');
        expect(finding).toBeDefined();
        expect(finding!.count).toBe(1);
        expect(JSON.stringify(finding!.details)).toContain('gis.cesiumViewport');
    });

    it('is exactly as loud as a registered probe reporting foreign state (same report, same channel)', () => {
        const missing = detectLeaks({ ...world, declaredScopes: DECLARED_SCOPES_REQUIRING_PRESENCE })!;
        const foreign = detectLeaks({
            ...world,
            scopeProbes: [...world.scopeProbes, { scope: 'gis.cesiumViewport', owningProjectId: 'proj-A' }],
            declaredScopes: DECLARED_SCOPES_REQUIRING_PRESENCE,
        })!;
        expect(missing.findings.length).toBeGreaterThan(0);
        expect(foreign.findings.length).toBeGreaterThan(0);
        expect(missing.projectId).toBe(foreign.projectId);
    });

    it('every declared owner answering clean IS clean — zero false positives', () => {
        const report = detectLeaks({
            ...world,
            scopeProbes: DECLARED_PROJECT_SCOPE_NAMES.map(scope => ({ scope, owningProjectId: null })),
            declaredScopes: DECLARED_SCOPES_REQUIRING_PRESENCE,
        });
        expect(report).toBeNull();
    });

    it('a probe that answers with the JUST-LOADED project is clean, not foreign', () => {
        const report = detectLeaks({
            ...world,
            scopeProbes: DECLARED_PROJECT_SCOPE_NAMES.map(scope => ({ scope, owningProjectId: PROJECT_B })),
            declaredScopes: DECLARED_SCOPES_REQUIRING_PRESENCE,
        });
        expect(report).toBeNull();
    });
});

describe('ADR-0298 open question, DECIDED — the declaration carries WHAT each owner resets', () => {
    it('every declared scope names at least one reset and one counted identifier', () => {
        for (const d of DECLARED_PROJECT_SCOPES) {
            expect(d.resets.length, `${d.scope}.resets`).toBeGreaterThan(0);
            expect(d.counts.length, `${d.scope}.counts`).toBeGreaterThan(0);
        }
    });

    it('L-694b RULE: resets ⊆ counts ∪ uncounted — a reset field is counted, or justified in writing', () => {
        for (const d of DECLARED_PROJECT_SCOPES) {
            const counted = new Set(d.counts);
            for (const id of d.resets) {
                const ok = counted.has(id) || Object.prototype.hasOwnProperty.call(d.uncounted, id);
                expect(ok, `${d.scope}: "${id}" is reset but neither counted nor justified`).toBe(true);
            }
        }
    });

    it('every justification is a real sentence, not a placeholder', () => {
        for (const d of DECLARED_PROJECT_SCOPES) {
            for (const [id, reason] of Object.entries(d.uncounted)) {
                expect(d.resets, `${d.scope}.uncounted["${id}"] is not a reset field`).toContain(id);
                expect(reason.length, `${d.scope}.uncounted["${id}"]`).toBeGreaterThan(20);
            }
        }
    });

    it('gis.cesiumViewport COUNTS the camera seat — the field L-694b proved it must', () => {
        const cesium = DECLARED_PROJECT_SCOPES.find(d => d.scope === 'gis.cesiumViewport')!;
        expect(cesium.counts).toContain('cameraSeatedAt');
        expect(cesium.resets).toContain('cameraSeatedAt');
    });

    it('gis.areaLayout COUNTS lastGeocodeFrame — the sole surviving source of Barcelona in L-694a', () => {
        const layout = DECLARED_PROJECT_SCOPES.find(d => d.scope === 'gis.areaLayout')!;
        expect(layout.counts).toContain('lastGeocodeFrame');
        expect(layout.resets).toContain('lastGeocodeFrame');
    });

    it('scope names are unique — one name, one owner (C13 §3.10)', () => {
        expect(new Set(DECLARED_PROJECT_SCOPE_NAMES).size).toBe(DECLARED_PROJECT_SCOPE_NAMES.length);
    });
});

describe('§L-711 — the load-derived exclusion list is short, explicit and countable', () => {
    it('contains only types with no snapshot array of their own', () => {
        // Every name here is a surface the render-side audit stops policing, so the
        // list is pinned: growing it must be a deliberate, reviewed edit.
        expect([...LOAD_DERIVED_ELEMENT_TYPES].sort()).toEqual([
            'annotation', 'curtain-panel', 'opening', 'room', 'stair-landing', 'stair-railing',
        ]);
    });

    it('does NOT contain lighting — lighting is authored, serialized and restored one-for-one', () => {
        // §L-711: the fix was to add `snapshot.lighting` to the loader's expected-id
        // set, NOT to excuse lighting from the check. Excusing it would have been the
        // shortcut: it would have silenced the false alarm and the real one together.
        expect(LOAD_DERIVED_ELEMENT_TYPES).not.toContain('lighting');
    });
});
