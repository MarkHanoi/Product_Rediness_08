/**
 * componentPlaceTool — Lane U1 (§COMPONENT-PLACE-TOOL) · UIUX-PLAN §U1.
 *
 * THE ONE arming function for the Component place tool. Every entry point —
 * the browser's "Place" buttons, `BimService.activateComponentTool`, a future
 * AI activation — routes through here, so the selection store and the tool
 * arming can never drift apart (the L-5709 lift lesson: a button can arm a
 * LEGACY path; one function, one path).
 *
 * Arming goes through `activatePlanOnlyToolOrExplain` — the SAME entry point
 * pool / balcony / lift / bathroom-pod use — which arms BOTH attached plan
 * surfaces (L-73/L-1380 parity), suppresses 3-D selection for the session
 * (L-7003), and puts a SENTENCE in front of the user when no plan view is open
 * (C16 CA-18) instead of arming nothing silently. The component tool is
 * plan-only while lane 4E's viewport mount is descoped (ADR-0376 D10) — see
 * the `component` row in `elementCreationMatrix.ts` for the declared exit.
 */

import {
    setActiveComponentPlacement,
    type ActiveComponentPlacement,
} from '@app/engine/views/plantools/activeComponentPlacement';
import { activatePlanOnlyToolOrExplain } from '../create/activatePlanOnlyTool';

/**
 * Record the chosen `(definitionId, typeId)` pair and arm the place tool on
 * every attached plan surface. Returns whether a surface accepted the tool
 * (false ⇒ the user was already told why, on the live toast channel).
 */
export function armComponentPlaceTool(sel: ActiveComponentPlacement): boolean {
    setActiveComponentPlacement(sel);
    return activatePlanOnlyToolOrExplain('component', 'Component');
}

export type { ActiveComponentPlacement };
