/**
 * WindowToolConfigStore — §FIX-DOOR-WINDOW-SYMBOL-PARITY-AND-LOD300 (L-266).
 *
 * THE ONE ANSWER TO "WHICH WINDOW DID THE ARCHITECT CHOOSE?".
 *
 * The exact mirror of `DoorToolConfigStore` (L-260 A), for the reason C15 gives:
 * doors and windows are ONE hosted-element family and must be resolved, stored and
 * drawn to ONE standard. The door got its chokepoint; the window never did, and the
 * consequences were worse:
 *
 *   | source of truth      | 3D (`WindowTool`)                 | PLAN (`WindowPlanToolHandler`)          |
 *   |----------------------|-----------------------------------|-----------------------------------------|
 *   | `windowType`         | `this.windowType`                 | `ctx.activeOpeningTool?.windowType`      |
 *   | `systemTypeId`       | `'wt-timber-casement'` (field init)| `window.windowTool?.systemTypeId` (a P4  |
 *   |                      |                                   | global read) → else the `initTools`      |
 *   |                      |                                   | bridge's OWN fallback `'wt-single-pane'` |
 *   | `width`              | `DEFAULT_SINGLE/DOUBLE_WIDTH`     | **HARD-CODED `1.2` / `2.4`**             |
 *   | `height`             | `DEFAULT_HEIGHT`                  | **HARD-CODED `1.2`**                     |
 *   | `sillHeight`         | `DEFAULT_SILL_HEIGHT`             | **HARD-CODED `1.0`**                     |
 *
 * So a window drawn in 3D was a TIMBER CASEMENT and the "same" window drawn in plan
 * was a SINGLE PANE — a different `systemTypeId`, therefore a different
 * `defaultColumnRatios`/`defaultRowRatios` (a mullion, or none), a different frame
 * finish and a different plan symbol. That is the founder's "window parity not
 * correct", and it is C11's signature failure for the EIGHTH time.
 *
 * THE CURE (L-243's, applied again): do NOT teach the plan tool to imitate the 3D
 * tool — that leaves two paths that must be kept in step by hand, and they never are.
 * Resolve the choice ONCE, BELOW the tools, and let the 3D tool, the plan tool, the
 * batch generators and the AI planes all inherit the identical truth.
 *
 * Architecture: a side-system store (tool state, NOT project data) — it is not in the
 * undo history and is never persisted, exactly like `DoorToolConfigStore`. Pure: no
 * DOM, no THREE, no `window.*` (P4). P8 — every exported function emits a span.
 */

import { trace, type Tracer } from '@opentelemetry/api';
// §OPENING-PROFILE (L-1200) — the void-SHAPE axis lives on the WALL OPENING and is owned by
// `@pryzm/geometry-wall`. The window tool does not re-declare it; it stores the architect's
// CHOICE of it, which is a different thing from owning the vocabulary.
import { type OpeningProfileKind, DEFAULT_OPENING_PROFILE } from '@pryzm/geometry-wall';

let _cachedTracer: Tracer | null = null;
function _tracer(): Tracer {
    _cachedTracer ??= trace.getTracer('@pryzm/geometry-window', '0.1.0');
    return _cachedTracer;
}

/** The two window leaf configurations the tools offer. */
export type WindowTypeChoice = 'single' | 'double';

/** The architect's resolved window choice — the ONLY source of truth for it. */
export interface WindowToolConfig {
    readonly windowType: WindowTypeChoice;
    /**
     * §OPENING-PROFILE (L-1250) — the void SHAPE the architect has chosen.
     *
     * ⭐ **A SECOND, ORTHOGONAL AXIS — NOT a third `windowType`.** `windowType` is the LEAF
     * COUNT; this is the VOID SHAPE. The founder asked for *"single / double / circular"* in one
     * place, and C86 §9 WO-Voc-4 is why that is served by TWO axes rather than one list: a flat
     * list makes `double × round-arch` — an ordinary opening — unexpressible.
     *
     * ⛔ AND IT IS NOT A WINDOW *TYPE* EITHER. The eight named types in the "Select Window Type"
     * dropdown (Timber Casement, uPVC Tilt & Turn, …) carry FRAME MATERIAL and GLAZING BUILD-UP.
     * A profile is GEOMETRY. Putting it in that dropdown would multiply eight types by four
     * profiles and re-spell the vocabulary — the enumerated-list failure C86 §10.1 exists to
     * prevent. Type and profile are independent, and both are chosen from the tool.
     */
    readonly openingProfile: OpeningProfileKind;
    /**
     * The chosen `WindowSystemType.id`. Always a non-empty string: a window with no
     * type resolves to schema-default grey with no finish and reads blank in every
     * schedule, so "no type" is not a state we allow a creation path to produce.
     */
    readonly systemTypeId: string;
}

/**
 * The canonical default.
 *
 * `'wt-timber-casement'` is the HISTORICAL `WindowTool.systemTypeId` field initialiser
 * — i.e. what the 3D path has always produced. The plan path's `'wt-single-pane'`
 * fallback (invented independently inside the `initTools` bridge) is the DIVERGENCE,
 * not the standard, so the 3D value is the one adopted. Recorded here rather than
 * decided in a code comment, because a default that lives in two files is two defaults.
 */
export const DEFAULT_WINDOW_TOOL_CONFIG: WindowToolConfig = Object.freeze({
    windowType:     'single',
    systemTypeId:   'wt-timber-casement',
    // §OPENING-PROFILE — rectangular, because that is what every window drawn before L-1250 is.
    // The default and "absent" coincide deliberately (C86 §10.1), which is what makes the whole
    // axis additive: nothing existing changes shape when this ships.
    openingProfile: DEFAULT_OPENING_PROFILE,
});

let _current: WindowToolConfig = DEFAULT_WINDOW_TOOL_CONFIG;

/** Read the architect's current window choice. Never returns a partial config. */
export function getWindowToolConfig(): WindowToolConfig {
    return _current;
}

/**
 * Patch the window choice.
 *
 * A `systemTypeId` of `undefined` / `''` is a NO-OP, never an erase. This mirrors the
 * door fix (L-260 A): `ToolManager.activateWindow(type)` is routinely called with no
 * system type, and letting that wipe the chosen type on the 3D path only is precisely
 * how the two creation paths drifted apart.
 */
export function setWindowToolConfig(patch: Partial<WindowToolConfig>): WindowToolConfig {
    return _tracer().startActiveSpan('pryzm.window.setToolConfig', (span) => {
        try {
            _current = Object.freeze({
                windowType:   patch.windowType ?? _current.windowType,
                systemTypeId: (patch.systemTypeId && patch.systemTypeId.length > 0)
                    ? patch.systemTypeId
                    : _current.systemTypeId,
                // The two axes patch INDEPENDENTLY — switching leaf count must not reset the
                // profile, and vice versa. That independence is the whole point of not
                // flattening them, and it has to hold in the store as well as in the bar.
                openingProfile: patch.openingProfile ?? _current.openingProfile,
            });
            span.setAttribute('pryzm.window.windowType', _current.windowType);
            span.setAttribute('pryzm.window.systemTypeId', _current.systemTypeId);
            span.setAttribute('pryzm.window.openingProfile', _current.openingProfile);
            span.end();
            return _current;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            throw err;
        }
    });
}

/** Restore the canonical default. Test-support + project-close. */
export function resetWindowToolConfig(): WindowToolConfig {
    _current = DEFAULT_WINDOW_TOOL_CONFIG;
    return _current;
}
