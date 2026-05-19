/**
 * intentUsageCount — Master Implementation Plan Wave 5 / Stage A8.
 *
 * Per journeys §13 A8, the Visibility Intent spine block (top of the
 * Properties panel) needs to show "Used by 12 views" or "Used by 1 view
 * (this one)" beneath the bound intent name.
 *
 * The selector walks `viewIntentInstanceStore.getAll()` and counts instances
 * whose `intentId` matches. Pure read, O(N) over instances.
 */

import { viewIntentInstanceStore } from '../ViewIntentInstanceStore.js';

export interface IntentUsageSummary {
    count:        number;
    onlyThisView: boolean;
    viewIds:      string[];
}

/**
 * Returns a usage summary for the given intent across the entire instance store.
 */
export function intentUsageCount(intentId: string, thisViewId?: string): IntentUsageSummary {
    if (!intentId) {
        return { count: 0, onlyThisView: false, viewIds: [] };
    }
    const viewIds: string[] = [];
    for (const instance of viewIntentInstanceStore.getAll()) {
        if (instance.intentId === intentId) {
            viewIds.push(instance.viewId);
        }
    }
    viewIds.sort();
    const count = viewIds.length;
    const onlyThisView = !!thisViewId && count === 1 && viewIds[0] === thisViewId;
    return { count, onlyThisView, viewIds };
}

/**
 * Convenience formatter for the spine label.
 */
export function formatIntentUsageLabel(summary: IntentUsageSummary): string {
    if (summary.count === 0) return 'Not in use';
    if (summary.count === 1) {
        return summary.onlyThisView ? 'Used by 1 view (this one)' : 'Used by 1 view';
    }
    return `Used by ${summary.count} views`;
}
