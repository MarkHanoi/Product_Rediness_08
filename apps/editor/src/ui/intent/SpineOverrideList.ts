/**
 * @file src/ui/intent/SpineOverrideList.ts
 *
 * Wave 2 — A7
 * Renders the unified per-element override list shown inside the Properties-
 * panel intent spine. The list folds together every visibility override and
 * every graphic override on a `ViewIntentInstance.localOverrides`, grouped by
 * target, and exposes a per-row Revert action plus a bulk "Clear all"
 * affordance.
 *
 * Mutations are dispatched through CommandManager only (Contract §01 §2):
 *   - Per-row revert  → `ClearOverrideCommand(viewId, targetKind, targetId)`
 *   - Clear all       → `ClearAllOverridesCommand(viewId)`
 *
 * Module is presentational and stateless — callers re-invoke `renderSpineOverrideList`
 * to refresh after a command roundtrips.
 */

import type { OverrideLayer, OverrideTargetKind } from '@pryzm/core-app-model';
import { ICON_EYE_OFF, ICON_ISOLATE, ICON_FILL, ICON_REVERT, makeIcon } from '../icons/ViewerIconSet';

export interface SpineOverrideListOptions {
    viewId: string;
    layer: OverrideLayer | null | undefined;
    /** Called after a revert/clear command succeeds, so the host can re-render. */
    onChanged?: () => void;
}

interface RowDescriptor {
    targetKind: OverrideTargetKind;
    targetId:   string;
    actions:    string[];   // human-readable list of what is overridden
    icon:       string;     // primary glyph for the row
}

/** Public entry point — returns a complete <div class="vi-overrides"> ready to mount. */
export function renderSpineOverrideList(opts: SpineOverrideListOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime renderSpineOverrideList */): HTMLElement {
    void runtime; /* B-runtime-void renderSpineOverrideList — TODO(C.3.x): once runtime.bus.executeCommand is wired, replace the commandManager dispatches in this module with runtime.bus.executeCommand('vg.clearOverride', payload) — Phase E.5.x */
    const { viewId, layer, onChanged } = opts;

    const root = document.createElement('div');
    root.className = 'vi-overrides';

    const rows = collectRows(layer);

    // ── Header ─────────────────────────────────────────────────────────────
    const header = document.createElement('div');
    header.className = 'vi-overrides__header';

    const title = document.createElement('span');
    title.className = 'vi-overrides__title';
    title.textContent = rows.length === 0
        ? 'No overrides'
        : rows.length === 1 ? '1 override' : `${rows.length} overrides`;
    header.appendChild(title);

    if (rows.length > 0) {
        const clearBtn = document.createElement('button');
        clearBtn.type      = 'button';
        clearBtn.className = 'vi-overrides__clear-all';
        clearBtn.textContent = 'Clear all';
        clearBtn.title       = 'Revert this view to pure intent';
        clearBtn.addEventListener('click', () => {
            (window as any).runtime?.bus
                ?.executeCommand('view.clearAllOverrides', { viewId })
                ?.catch((e: Error) => console.error('[SpineOverrideList] view.clearAllOverrides failed', e));
            onChanged?.();
        });
        header.appendChild(clearBtn);
    }
    root.appendChild(header);

    if (rows.length === 0) return root;

    // ── Body ───────────────────────────────────────────────────────────────
    const body = document.createElement('ul');
    body.className = 'vi-overrides__list';

    rows.forEach((r) => {
        const li = document.createElement('li');
        li.className = 'vi-overrides__row';

        li.appendChild(makeIcon(r.icon, { className: 'vi-overrides__row-icon' }));

        const text = document.createElement('span');
        text.className = 'vi-overrides__row-text';
        const target = formatTarget(r.targetKind, r.targetId);
        text.textContent = `${target} — ${r.actions.join(', ')}`;
        text.title = text.textContent;
        li.appendChild(text);

        const revertBtn = document.createElement('button');
        revertBtn.type      = 'button';
        revertBtn.className = 'vi-overrides__revert';
        revertBtn.title     = `Revert override for ${target}`;
        revertBtn.setAttribute('aria-label', `Revert override for ${target}`);
        revertBtn.appendChild(makeIcon(ICON_REVERT));
        revertBtn.addEventListener('click', () => {
            (window as any).runtime?.bus
                ?.executeCommand('view.clearOverride', { viewId, targetKind: r.targetKind, targetId: r.targetId })
                ?.catch((e: Error) => console.error('[SpineOverrideList] view.clearOverride failed', e));
            onChanged?.();
        });
        li.appendChild(revertBtn);

        body.appendChild(li);
    });
    root.appendChild(body);

    return root;
}

/** Pure helper — fold visibility + graphic overrides into one row per target. */
export function collectRows(layer: OverrideLayer | null | undefined): RowDescriptor[] {
    if (!layer) return [];
    const map = new Map<string, RowDescriptor>();

    for (const v of layer.visibilityOverrides) {
        const key = `${v.targetKind}:${v.targetId}`;
        const action = v.action === 'hide' ? 'Hidden'
            : v.action === 'isolate' ? 'Isolated'
            : `Ghost (${v.ghostStyle ?? 'fade'})`;
        const icon = v.action === 'isolate' ? ICON_ISOLATE : ICON_EYE_OFF;
        const existing = map.get(key);
        if (existing) {
            existing.actions.push(action);
        } else {
            map.set(key, { targetKind: v.targetKind, targetId: v.targetId, actions: [action], icon });
        }
    }

    for (const g of layer.graphicOverrides) {
        const key = `${g.targetKind}:${g.targetId}`;
        const fields: string[] = [];
        if (g.patch.line) fields.push('line');
        if (g.patch.fill) fields.push('fill');
        const action = `Style (${g.state}${fields.length ? ': ' + fields.join('+') : ''})`;
        const existing = map.get(key);
        if (existing) {
            existing.actions.push(action);
        } else {
            map.set(key, { targetKind: g.targetKind, targetId: g.targetId, actions: [action], icon: ICON_FILL });
        }
    }

    return Array.from(map.values()).sort((a, b) => {
        if (a.targetKind !== b.targetKind) return a.targetKind.localeCompare(b.targetKind);
        return a.targetId.localeCompare(b.targetId);
    });
}

function formatTarget(kind: OverrideTargetKind, id: string): string {
    if (kind === 'element') {
        // Element ids are UUIDs / fragment ids — show first 8 chars to keep rows scannable.
        return `Element ${id.length > 10 ? id.slice(0, 8) + '…' : id}`;
    }
    if (kind === 'elementType') return `Type · ${id}`;
    return `Category · ${id}`;
}
