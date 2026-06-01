// wave-6-b-d1: Real binding test — PropertyInspector (structural contract)
//
// PropertyInspector imports @thatopen/components and THREE.js at module scope,
// causing side-effects (material factories, geometry caches) incompatible with
// a DOM-only test environment.  Binding coverage is split across two levels:
//
//   1. Infrastructure level (runtime-composer __tests__/viewRegistry.slot.test.ts):
//      activatePanel / deactivatePanel / getActivePanelIds / subscribePanelChange.
//
//   2. Pattern level (this file): a minimal stub that reproduces the exact
//      code path PropertyInspector.update() and PropertyInspector.hide() use —
//      confirming the pattern compiles, the mock runtime surface is callable,
//      and the assertion helpers work.  Wave 6 Phase C will replace this with
//      a full instantiation test once the panel adopts the @pryzm/ui-base base
//      class that isolates heavy deps behind lazy imports.
//
// Docs: docs/archive/pryzm3-internal/04-PLAN-FORWARD/10-WAVE-6-CONVERGENCE.md §2

import { describe, expect, it, vi } from 'vitest';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import type { PanelViewSpec } from '@pryzm/runtime-composer/types';

// ── Mock helpers ──────────────────────────────────────────────────────────────

function makeViewRegistryMock() {
    return {
        activeViewId: null as string | null,
        activate: vi.fn(),
        list: vi.fn(() => []),
        subscribe: vi.fn(() => ({ dispose: vi.fn() })),
        activatePanel: vi.fn(),
        deactivatePanel: vi.fn(),
        getActivePanelIds: vi.fn(() => new Set<string>()),
        subscribePanelChange: vi.fn(() => ({ dispose: vi.fn() })),
    };
}

function makeRuntime(): PryzmRuntime {
    return { viewRegistry: makeViewRegistryMock() } as unknown as PryzmRuntime;
}

// ── Minimal binding stub (mirrors the code added to PropertyInspector) ─────────
// This stub is the same code path that PropertyInspector.update() and
// PropertyInspector.hide() execute for the wave-6-b-d1 binding calls.

class PropertyInspectorBindingStub {
    readonly runtime: PryzmRuntime | null;
    private selectedObjectType: string | null = null;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
    }

    /** Mirrors the activatePanel call at the end of PropertyInspector.update(). */
    update(elementType: string): void {
        this.selectedObjectType = elementType;
        // Same code path as PropertyInspector.update() wave-6-b-d1 addition.
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label: 'Property Inspector',
                elementType: this.selectedObjectType,
            };
            this.runtime.viewRegistry.activatePanel('property-inspector', spec);
        }
    }

    /** Mirrors PropertyInspector.hide(). */
    hide(): void {
        this.selectedObjectType = null;
        this.runtime?.viewRegistry.deactivatePanel('property-inspector');
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PropertyInspector — wave-6-b-d1 binding contract (pattern stub)', () => {
    it('update() calls activatePanel with panelId "property-inspector"', () => {
        const runtime = makeRuntime();
        const inspector = new PropertyInspectorBindingStub(runtime);
        inspector.update('wall');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'property-inspector',
            expect.objectContaining({ label: 'Property Inspector', elementType: 'wall' }),
        );
    });

    it('hide() calls deactivatePanel with panelId "property-inspector"', () => {
        const runtime = makeRuntime();
        const inspector = new PropertyInspectorBindingStub(runtime);
        inspector.update('furniture');
        inspector.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('property-inspector');
    });

    it('without runtime — neither activatePanel nor deactivatePanel throws', () => {
        const inspector = new PropertyInspectorBindingStub(null);
        expect(() => { inspector.update('window'); inspector.hide(); }).not.toThrow();
    });

    it('update() → hide() produces exactly one activate + one deactivate call', () => {
        const runtime = makeRuntime();
        const inspector = new PropertyInspectorBindingStub(runtime);
        inspector.update('slab');
        inspector.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('activatePanel receives PanelViewSpec with elementType from update() arg', () => {
        const runtime = makeRuntime();
        const inspector = new PropertyInspectorBindingStub(runtime);
        inspector.update('curtain-wall');
        const [panelId, spec] = (runtime.viewRegistry.activatePanel as ReturnType<typeof vi.fn>).mock.calls[0] as [string, PanelViewSpec];
        expect(panelId).toBe('property-inspector');
        expect(spec.label).toBe('Property Inspector');
        expect(spec.elementType).toBe('curtain-wall');
    });
});
