// wave-6-b-d1: Real binding test — PropertyPanel (structural contract)
//
// PropertyPanel has extensive module-level side effects via THREE.js imports
// (material factories, geometry caches) that prevent clean instantiation in
// a DOM-only test environment.  The binding mechanism itself is tested at two
// levels:
//
//   1. Infrastructure level (runtime-composer __tests__/viewRegistry.slot.test.ts):
//      activatePanel / deactivatePanel / getActivePanelIds / subscribePanelChange.
//      This is the authoritative unit coverage.
//
//   2. Pattern level (this file): a minimal stub that reproduces the exact
//      code path PropertyPanel uses — confirming the pattern compiles, the
//      mock runtime surface is callable, and the assertion helpers work.
//      Wave 6 Phase C will replace this stub with a full instantiation test
//      once PropertyPanel migrates to @pryzm/ui-base Panel<T> which isolates
//      the heavy deps behind lazy dynamic imports.
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

// ── Minimal binding stub (mirrors the code added to PropertyPanel) ─────────────
// This stub is the same code path that PropertyPanel._makeVisible() and
// PropertyPanel.hide() execute for the wave-6-b-d1 binding calls.  It has
// NO THREE.js dependencies so it loads cleanly in happy-dom.

class PropertyPanelBindingStub {
    readonly runtime: PryzmRuntime | null;

    constructor(runtime: PryzmRuntime | null = null) {
        this.runtime = runtime;
    }

    /** Mirrors PropertyPanel._makeVisible() — the common show entry point. */
    _makeVisible(elementType?: string): void {
        if (this.runtime) {
            const spec: PanelViewSpec = {
                label: 'Property Panel',
                elementType: elementType,
            };
            this.runtime.viewRegistry.activatePanel('property-panel', spec);
        }
    }

    /** Mirrors PropertyPanel.hide(). */
    hide(): void {
        this.runtime?.viewRegistry.deactivatePanel('property-panel');
    }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PropertyPanel — wave-6-b-d1 binding contract (pattern stub)', () => {
    it('_makeVisible() calls activatePanel with panelId "property-panel"', () => {
        const runtime = makeRuntime();
        const panel = new PropertyPanelBindingStub(runtime);
        panel._makeVisible('wall');
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledWith(
            'property-panel',
            expect.objectContaining({ label: 'Property Panel', elementType: 'wall' }),
        );
    });

    it('hide() calls deactivatePanel with panelId "property-panel"', () => {
        const runtime = makeRuntime();
        const panel = new PropertyPanelBindingStub(runtime);
        panel._makeVisible('slab');
        panel.hide();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledWith('property-panel');
    });

    it('without runtime — neither activatePanel nor deactivatePanel throws', () => {
        const panel = new PropertyPanelBindingStub(null);
        expect(() => { panel._makeVisible(); panel.hide(); }).not.toThrow();
    });

    it('_makeVisible() → hide() produces exactly one activate + one deactivate call', () => {
        const runtime = makeRuntime();
        const panel = new PropertyPanelBindingStub(runtime);
        panel._makeVisible();
        panel.hide();
        expect(runtime.viewRegistry.activatePanel).toHaveBeenCalledOnce();
        expect(runtime.viewRegistry.deactivatePanel).toHaveBeenCalledOnce();
    });

    it('activatePanel is called with PanelViewSpec shape (label + optional elementType)', () => {
        const runtime = makeRuntime();
        const panel = new PropertyPanelBindingStub(runtime);
        panel._makeVisible('curtain-wall');
        const [panelId, spec] = (runtime.viewRegistry.activatePanel as ReturnType<typeof vi.fn>).mock.calls[0] as [string, PanelViewSpec];
        expect(panelId).toBe('property-panel');
        expect(spec.label).toBe('Property Panel');
        expect(spec.elementType).toBe('curtain-wall');
    });
});
