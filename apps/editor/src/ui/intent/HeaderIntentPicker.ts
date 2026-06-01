/**
 * HeaderIntentPicker — Wave 3 / Stage S4 of the Visibility-Intent master plan
 * (docs/03-execution/status/intent-analysis/MASTER-IMPLEMENTATION-PLAN.md §6).
 *
 * A small dropdown that lives on the right side of the per-view header toolbar
 * (ViewHeaderButtons.ts). Lets the user bind / rebind a view to a Visibility
 * Intent without opening the Properties panel.
 *
 * Reality notes (recorded in §19.4 → §19.8):
 *   • The plan refers to a `BindViewIntentCommand({ keepOverrides: false })`.
 *     That command does not exist; the actual command is the existing
 *     `AssignViewIntentCommand({ viewId, intentId })`. The `keepOverrides`
 *     flag is part of Wave 6 / A6 and lands later.
 *   • `VisibilityIntent` has no `intentScope` field, so the
 *     "filter intentScope !== 'view-local'" step in the plan is a no-op for
 *     now. We list every intent in the store and rely on `isSystem` only for
 *     visual labelling.
 *
 * Contract compliance:
 *   §05 — pure DOM factory; no Three.js.
 *   §25 — every mutation flows through CommandManager.
 */

import { visibilityIntentStore } from '@pryzm/core-app-model/presentation';
import { viewIntentInstanceStore } from '@pryzm/core-app-model/presentation';

export interface HeaderIntentPickerOptions {
    /** ViewDefinition id this picker mutates the binding for. */
    viewId: string;
}

export interface HeaderIntentPickerHandle {
    /** Root element to insert into the toolbar. */
    el: HTMLElement;
    /** The underlying <select> element. Exposed for back-compat with the
     *  deprecated `intentSelect` field on ViewHeaderButtonsHandle. */
    select: HTMLSelectElement;
    /** Force a re-read of the bound intent + intent list. Safe to call any
     *  number of times. */
    sync: () => void;
    /** Detach the global event listener installed by this picker. */
    destroy: () => void;
}

export function createHeaderIntentPicker(opts: HeaderIntentPickerOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime createHeaderIntentPicker */): HeaderIntentPickerHandle {
    // B-runtime: runtime.events consumed for vi:instance-updated migration (F.events.2b).
    // Remaining runtime slots land in Phase C.3.x.
    const { viewId } = opts;

    const el = document.createElement('label');
    el.className = 'vh-intent-picker';
    el.title = 'Visibility Intent — bind this view to an intent';

    const labelText = document.createElement('span');
    labelText.className = 'vh-intent-picker__label';
    labelText.textContent = 'Intent';
    el.appendChild(labelText);

    const select = document.createElement('select');
    select.className = 'vh-intent-picker__select';
    select.setAttribute('aria-label', 'Bind this view to a Visibility Intent');
    el.appendChild(select);

    function rebuildOptions(): void {
        const instance = viewIntentInstanceStore.get(viewId);
        const intents  = visibilityIntentStore.getAll();

        select.innerHTML = '';

        if (!instance) {
            const placeholder = document.createElement('option');
            placeholder.value = '';
            placeholder.textContent = '— pick an intent —';
            placeholder.disabled = true;
            placeholder.selected = true;
            select.appendChild(placeholder);
        }

        intents.forEach((intent) => {
            const opt = document.createElement('option');
            opt.value = intent.id;
            opt.textContent = intent.isSystem ? `${intent.name} (system)` : intent.name;
            if (intent.id === instance?.intentId) opt.selected = true;
            select.appendChild(opt);
        });
    }

    function onChange(): void {
        const intentId = select.value;
        if (!intentId) return;

        const current = viewIntentInstanceStore.get(viewId);
        if (current?.intentId === intentId) return; // no-op rebind

        (window as any).runtime?.bus
            ?.executeCommand('vg.assignIntent', { viewId, intentId })
            ?.catch((e: Error) => {
                console.error('[HeaderIntentPicker] vg.assignIntent failed', e);
                rebuildOptions();
            });
        // The store dispatches `vi:instance-updated`, which our listener
        // below picks up and calls rebuildOptions(); no manual refresh needed.
    }

    select.addEventListener('change', onChange);

    // vi:instance-updated migrated to runtime.events (F.events.2b).
    // Payload is always typed { viewId: string; instanceId: string } — rebuilds only for matching view.
    const _viInstanceDisposable = runtime?.events?.on(
        'vi:instance-updated',
        ({ viewId: evViewId }) => { if (evViewId === viewId) rebuildOptions(); },
    ) ?? null; // F.events.2b

    rebuildOptions();

    return {
        el,
        select,
        sync: rebuildOptions,
        destroy: () => {
            _viInstanceDisposable?.dispose(); // F.events.2b — was window.removeEventListener('vi:instance-updated', ...)
        },
    };
}
