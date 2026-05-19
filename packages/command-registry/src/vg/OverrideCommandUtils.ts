import { viewIntentInstanceStore } from '@pryzm/core-app-model';
import type { OverrideLayer } from '@pryzm/core-app-model';

export function cloneOverrideLayer(value: OverrideLayer): OverrideLayer {
    // VIEW-SYSTEM-AUDIT-2026 F5.1-B — structuredClone over JSON round-trip.
    return structuredClone(value);
}

export function getOrCreateOverrideLayer(viewId: string): OverrideLayer | null {
    const existing = viewIntentInstanceStore.get(viewId) ?? viewIntentInstanceStore.assign(viewId);
    return existing ? cloneOverrideLayer(existing.localOverrides) : null;
}

export function applyOverrideLayer(viewId: string, overrides: OverrideLayer): boolean {
    return viewIntentInstanceStore.updateOverrides(viewId, cloneOverrideLayer(overrides)) !== null;
}

export function restoreOverrideLayer(viewId: string, overrides: OverrideLayer | null): boolean {
    if (!overrides) return viewIntentInstanceStore.clearOverrides(viewId) !== null;
    return viewIntentInstanceStore.updateOverrides(viewId, cloneOverrideLayer(overrides)) !== null;
}