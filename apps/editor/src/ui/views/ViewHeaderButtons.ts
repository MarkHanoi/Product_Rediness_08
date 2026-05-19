/**
 * ViewHeaderButtons — Stage S1 + S4 of the View Intent System plan (doc 10).
 *
 * Shared factory for the per-view header toolbar used by:
 *   - PlanViewManager (primary plan/section/elevation viewport header)
 *   - SplitViewManager (secondary split-pane header)
 *
 * Stage S4 consolidation: the legacy V/G button, the Overrides button and
 * the inline Intent <select> dropdown have been collapsed into a single
 * "V/G" button that opens the unified Visibility & Graphics panel
 * (src/ui/OverridePanel.ts).
 *
 * The handle still exposes `intentSelect` and `syncIntentSelect` for
 * backward compatibility with consumers that read those fields, but the
 * select element is now a hidden, no-op stub kept only to preserve the
 * public surface.
 *
 * Contract compliance:
 *   §05 — pure DOM factory; no Three.js.
 *   §25 — every mutation flows through viewIntentInstanceStore via the
 *         unified panel.
 */

import { ifcProjectionStore } from '@pryzm/core-app-model';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';
import { OverridePanel } from '../OverridePanel';
import { createHeaderIntentPicker } from '../intent/HeaderIntentPicker';

export interface ViewHeaderButtonsOptions {
    viewId: string;
    viewName?: string;
    onGridToggle?: () => void;
    onClose?: () => void;
    initialGridOn?: boolean;
    showClose?: boolean;
    showRange?: boolean;
}

export interface ViewHeaderButtonsHandle {
    toolbar: HTMLElement;
    isolateBanner: HTMLElement;
    gridBtn: HTMLButtonElement;
    ifcBtn: HTMLButtonElement;
    /**
     * Single unified Visibility & Graphics button.
     * Replaces the previous separate V/G + Overrides controls.
     */
    vgBtn: HTMLButtonElement;
    /**
     * @deprecated Stage S4 consolidated overrides into vgBtn.
     * Kept as an alias of vgBtn so legacy callers don't break.
     */
    overridesBtn: HTMLButtonElement;
    /**
     * Wave 3 / Stage S4 — replaced the deprecated hidden stub with the live
     * Visibility-Intent picker. The field is the underlying <select> element
     * inside the picker so legacy callers that read `.value` still work.
     */
    intentSelect: HTMLSelectElement;
    syncIfcState: () => void;
    /** Refreshes the V/G "customised" indicator AND the header Intent picker. */
    syncIntentSelect: () => void;
}

function ensureUnifiedPanel(): OverridePanel {
    if (!window.overridePanel) window.overridePanel = new OverridePanel();
    return window.overridePanel as OverridePanel;
}

function isCustomised(viewId: string): boolean {
    const layer = viewIntentInstanceStore.get(viewId)?.localOverrides;
    return Boolean(layer && (layer.isolateActive || layer.visibilityOverrides.length > 0 || layer.graphicOverrides.length > 0));
}

export function buildViewHeaderToolbar(opts: ViewHeaderButtonsOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime buildViewHeaderToolbar */): ViewHeaderButtonsHandle {
    // B-runtime: runtime.events consumed for vi:instance-updated migration (F.events.2b).
    // Remaining runtime slots (persistence, etc.) land in Phase C.3.x.
    const toolbar = document.createElement('div');
    toolbar.className = 'svp-plan-view-toolbar vh-toolbar';

    // ── Grid ───────────────────────────────────────────────────────────────
    const gridOn = !!opts.initialGridOn;
    const gridBtn = document.createElement('button');
    gridBtn.className = 'svp-pv-btn svp-pv-btn--grid' + (gridOn ? ' svp-pv-btn--active' : '');
    gridBtn.title = gridOn ? 'Hide grid' : 'Show grid';
    gridBtn.setAttribute('aria-pressed', String(gridOn));
    gridBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M0 4.67h14M0 9.33h14M4.67 0v14M9.33 0v14"/></svg><span>Grid</span>`;
    if (opts.onGridToggle) gridBtn.addEventListener('click', opts.onGridToggle);

    // ── IFC ────────────────────────────────────────────────────────────────
    //
    // Wave 11 / Stage S7 — the IFC toggle is now **per-view**, not global.
    //
    // Previously this handler called `setGlobal(...)`, which silently
    // mutated the store-wide default and surprised users by hiding IFC
    // in every other view as well. With per-view storage, each view
    // owns its IFC state, and Shift+Click resets to the global default
    // (lets `IFCProjectionStore` fall back to either the inheritance
    // veto or the global flag, restoring the legacy "follow project"
    // behaviour for that view).
    //
    // The displayed state still reads through `shouldIncludeIFC` so the
    // intent-system veto + parent-chain inheritance from Wave 10 remain
    // authoritative — the click handler only writes the per-view flag.
    const ifcEnabled = ifcProjectionStore.shouldIncludeIFC(opts.viewId);
    const ifcBtn = document.createElement('button');
    ifcBtn.className = 'svp-pv-btn svp-pv-btn--ifc' + (ifcEnabled ? ' svp-pv-btn--active' : '');
    ifcBtn.title = ifcEnabled
        ? 'IFC: visible (per-view) — Shift+Click to follow project default'
        : 'IFC: hidden (per-view) — Shift+Click to follow project default';
    ifcBtn.setAttribute('aria-pressed', String(ifcEnabled));
    ifcBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1" y="3" width="12" height="8" rx="1"/><path d="M4 3V1.5M10 3V1.5M1 6.5h12"/></svg><span>IFC</span>`;
    ifcBtn.addEventListener('click', (ev) => {
        if ((ev as MouseEvent).shiftKey) {
            // Reset to global / inheritance default for this view.
            ifcProjectionStore.setForView(opts.viewId, null);
        } else {
            const next = !ifcProjectionStore.shouldIncludeIFC(opts.viewId);
            ifcProjectionStore.setForView(opts.viewId, next);
        }
        syncIfcState();
    });
    function syncIfcState(): void {
        const en = ifcProjectionStore.shouldIncludeIFC(opts.viewId);
        ifcBtn.classList.toggle('svp-pv-btn--active', en);
        ifcBtn.setAttribute('aria-pressed', String(en));
        ifcBtn.title = en
            ? 'IFC: visible (per-view) — Shift+Click to follow project default'
            : 'IFC: hidden (per-view) — Shift+Click to follow project default';
    }
    // Wave 11 — keep the per-view button in sync with intent / inheritance
    // updates so a parent view binding change is reflected immediately.
    window.addEventListener('ifc-projection-changed', syncIfcState);
    // vi:instance-updated migrated to runtime.events (F.events.2b).
    runtime?.events?.on('vi:instance-updated', () => syncIfcState()); // F.events.2b

    // ── Unified Visibility & Graphics ─────────────────────────────────────
    const vgBtn = document.createElement('button');
    vgBtn.className = 'svp-pv-btn';
    vgBtn.title = 'Visibility & Graphics — Intent, overrides, isolate';
    vgBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="7" cy="7" r="3"/><path d="M1 7c1.5-4 9.5-4 12 0-2.5 4-10.5 4-12 0Z"/></svg><span>V/G</span>`;
    vgBtn.addEventListener('click', () => ensureUnifiedPanel().toggle(opts.viewId));

    function syncVgBtn(): void {
        vgBtn.classList.toggle('svp-pv-btn--active', isCustomised(opts.viewId));
    }
    syncVgBtn();
    runtime?.events?.on('vi:instance-updated', () => syncVgBtn()); // F.events.2b
    window.addEventListener('vi:overrides-cleared', syncVgBtn); // vi:overrides-cleared DOM listener kept (not yet typed)

    // ── Header Intent picker (Wave 3 / S4) ─────────────────────────────────
    // Lets the user bind / rebind a Visibility Intent without opening the
    // Properties panel. Self-syncs via `vi:instance-updated`.
    // Phase B.35 (S73-WIRE) — thread runtime to createHeaderIntentPicker so
    // its store reads (intentRegistry / viewInstanceStore → F.6.x) can be
    // migrated in named phases without re-touching the call site.
    const intentPicker = createHeaderIntentPicker({ viewId: opts.viewId }, runtime /* B-runtime-thread createHeaderIntentPicker */);
    const intentSelect = intentPicker.select; // back-compat alias for handle

    // ── Range ──────────────────────────────────────────────────────────────
    const rangeBtn = document.createElement('button');
    rangeBtn.className = 'svp-pv-btn';
    rangeBtn.title = 'View Properties & Range';
    rangeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1" y="1" width="12" height="12" rx="1.5"/><path d="M1 5h12M4 1v4"/></svg><span>Range</span>`;
    rangeBtn.addEventListener('click', () => {
        const vpp = window.viewPropertiesPanel; // TODO(F.6.5): panel-host registry bridge — destruction in F.6.5 — Phase F.6.5
        if (vpp) {
            const def = window.viewDefinitionStore?.get?.(opts.viewId); // TODO(F.6.x): replace with runtime.stores.viewDefinition — Phase F.6.x — Phase F.6.x
            if (typeof vpp.showFromDefinition === 'function' && def) vpp.showFromDefinition(def);
            else if (typeof vpp.show === 'function') vpp.show(def);
        }
    });

    // ── Close ──────────────────────────────────────────────────────────────
    const closeBtn = document.createElement('button');
    closeBtn.className = 'svp-pv-btn svp-pv-btn--close';
    closeBtn.title = 'Close';
    closeBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 2l10 10M12 2L2 12"/></svg>`;
    if (opts.onClose) closeBtn.addEventListener('click', opts.onClose);

    toolbar.appendChild(gridBtn);
    toolbar.appendChild(ifcBtn);
    toolbar.appendChild(vgBtn);
    toolbar.appendChild(intentPicker.el);
    if (opts.showRange !== false) toolbar.appendChild(rangeBtn);
    if (opts.showClose !== false) toolbar.appendChild(closeBtn);

    // ── Isolate banner ─────────────────────────────────────────────────────
    const isolateBanner = document.createElement('div');
    isolateBanner.className = 'svp-isolate-banner';
    isolateBanner.style.display = 'none';
    isolateBanner.innerHTML = `<span>Isolate active</span><button type="button">Exit Isolate</button>`;
    isolateBanner.querySelector('button')?.addEventListener('click', () => {
        (window as any).runtime?.bus
            ?.executeCommand('view.clearAllOverrides', { viewId: opts.viewId })
            ?.catch((e: Error) => console.error('[ViewHeaderButtons] view.clearAllOverrides failed', e));
    });

    return {
        toolbar,
        isolateBanner,
        gridBtn,
        ifcBtn,
        vgBtn,
        overridesBtn: vgBtn,    // alias for back-compat
        intentSelect,           // underlying <select> from the header picker
        syncIfcState,
        syncIntentSelect: () => {
            syncVgBtn();
            intentPicker.sync();
        },
    };
}
