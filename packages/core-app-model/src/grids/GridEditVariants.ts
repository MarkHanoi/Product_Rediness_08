/**
 * GridEditVariants — WHAT A CONTEXTUAL EDIT AFFORDANCE MAY OFFER FOR A SELECTED GRID.
 *
 * §GRID-CONTEXTUAL-EDIT (SV2) — the founder asked for Move and Delete on a selected
 * grid, "like a wall has". This module is the COMMAND-SIDE half of that answer, and it
 * exists so the BUTTON half cannot be written before the answer is known.
 *
 * WHY A DATA TABLE AND NOT AN `if` CHAIN
 * ──────────────────────────────────────
 * Copied deliberately from `packages/geometry-wall/src/WallProfileVariants.ts` (lane
 * WPE1), including its reasoning: these cells open at different times, by different
 * lanes, and a hard-coded chain gets rewritten every time one of them flips. A table
 * gets ONE ROW changed by the lane that measured it, and the row names who holds it.
 *
 * The rule it enforces is the one `ContextualEditBar` states in its own comment, written
 * after floor and ceiling shipped a profile button that did nothing:
 *
 *     Three states, and only the third lies: SHOWN+ENABLED (the capability exists),
 *     SHOWN+DISABLED with the reason as its tooltip, HIDDEN (no editor at all).
 *
 * A refusal is a correct answer. A button that does nothing is not even a refusal,
 * because the user is never told anything (C16 CA-18, C84 EI-2; L-1065 was closed for
 * exactly this shape).
 *
 * ⚠ NO IMPORTS, BY CONSTRUCTION. The subject is typed STRUCTURALLY so this module pulls
 * in nothing — no store, no THREE, no DOM. It is a pure predicate any layer may call,
 * and it cannot participate in a barrel cycle.
 */

/** The slice of a `Grid` the availability rules read. Structural on purpose — see header. */
export interface GridEditSubject {
    readonly id?: string;
    readonly name?: string;
    readonly isPinned?: boolean;
    readonly mode?: 'orthogonal' | 'linear';
}

/**
 * How closed a closed cell is.
 *
 * ⚠ THE THIRD MEMBER IS NOT `impossible` (which is what the wall table uses), and the
 * difference is load-bearing. `unbuilt` means WE have not built it and the user can only
 * wait. `user-resolvable` means the capability EXISTS and the user's own model state is
 * what is in the way — they have a move to make right now. Collapsing the two would make
 * every refusal read "wait for us", which is the opposite of actionable (C80 §3.2 — a
 * refusal that cannot say what it protects cannot be acted on).
 */
export type GridEditStatus = 'available' | 'unbuilt' | 'user-resolvable';

/** The independent AXES a grid edit can be blocked on. */
export type GridEditAxis = 'interactive-drag' | 'linear' | 'pinned';

/** The operations a contextual edit bar can offer for a grid. */
export type GridEditOperation = 'move' | 'delete';

export interface GridEditAxisRow {
    readonly axis: GridEditAxis;
    /** Which operations this axis has an opinion about. An axis silent on an op does not block it. */
    readonly governs: readonly GridEditOperation[];
    readonly status: GridEditStatus;
    /** True when this axis applies to EVERY grid, not just those in a particular state. */
    readonly alwaysActive?: boolean;
    /** The sentence the user reads. Names WHAT is in the way and WHAT they can do instead. */
    readonly reason?: string;
    /** The lane / tag that will flip this row, so the row says who is holding it. */
    readonly owner?: string;
}

/**
 * THE TABLE. Measured 2026-08-19 (SV2) against the real commands.
 *
 * FOR THE RECORD — there is no class named `MoveGridCommand` anywhere in the repo, and
 * there does not need to be: for an orthogonal grid `position` IS its location
 * (`BimKernel.ts` — "axis='X' → line at x=position"), so the move is
 * `UpdateGridCommand({ gridId, updates: { position } })`, which four live surfaces
 * already drive. What does NOT exist is an INTERACTIVE one — see the first row.
 */
export const GRID_EDIT_AXES: ReadonlyArray<GridEditAxisRow> = [
    {
        axis: 'interactive-drag',
        governs: ['move'],
        status: 'unbuilt',
        alwaysActive: true,
        // ⭐ THE ROW THAT STOPS A DEAD BUTTON SHIPPING. A wall's contextual Move
        // activates a plan-view move TOOL (`MovePlanToolHandler`). There is no grid arm
        // in that registry and no grid drag anywhere in `PlanViewInteraction` — the only
        // interactive grid edit is `_openGridDimInlineEditor`, which lets the user TYPE
        // an absolute position. So a contextual Move button wired like a wall's would
        // activate a tool that ignores grids: pressed, nothing happens, nothing is said.
        //
        // The capability is therefore SHOWN+DISABLED with this sentence, not hidden —
        // moving a grid IS possible today, just not by dragging, and the reason says how.
        reason: 'Dragging a grid to move it is not built yet. You can move this grid now by '
            + 'editing its Position in Grid Properties, or by clicking its dimension in plan '
            + 'and typing a new one.',
        owner: 'SV2 — a grid arm in the plan-view move tool',
    },
    {
        axis: 'linear',
        governs: ['move'],
        status: 'unbuilt',
        // A `mode: 'linear'` grid is defined by startX/startZ → endX/endZ, and `position`
        // is meaningless for it. `UpdateGridPayload.updates` is
        // `Partial<Pick<Grid, 'name'|'position'|'axis'|'extentMin'|'extentMax'|'isVisible'|'color'|'isPinned'>>`
        // — the four endpoint fields are NOT in it, so the move is not EXPRESSIBLE, not
        // merely unwired. `GridStore.update` would accept them (they are in its GEOM_KEYS);
        // the command's payload type is the gap. So even the numeric escape hatch offered
        // by the row above does not exist for a linear grid, which is why this row is
        // separate rather than folded into it.
        reason: 'This is a linear (two-point) grid, and moving one is not supported at all yet — '
            + 'its endpoints cannot be edited through the grid update command.',
        owner: 'SV2 — widen UpdateGridPayload to the endpoint fields',
    },
    {
        axis: 'pinned',
        governs: ['move'],
        status: 'user-resolvable',
        // §GRID-PIN-REPORTED-SUCCESS-AND-MOVED-NOTHING (L-1175). Until that fix, this cell
        // was the worst kind: the move REPORTED SUCCESS and changed nothing, because
        // GridStore stripped the geometry keys and UpdateGridCommand never asked. The
        // command now refuses; this row is what stops the BUTTON offering it at all, so
        // the user reads the reason BEFORE acting rather than after.
        reason: 'This grid is PINNED, so it cannot be moved. Unpin it first — its name, '
            + 'colour and visibility can still be edited while pinned.',
    },
];

export interface GridEditVerdict {
    readonly ok: boolean;
    readonly blockedBy: ReadonlyArray<GridEditAxis>;
    readonly status?: GridEditStatus;
    /** Ready to show in a disabled-control tooltip. Absent when `ok`. */
    readonly reason?: string;
}

/** The axes ACTIVE for this grid — the ones whose status can block it. */
export function gridEditActiveAxes(g: GridEditSubject): GridEditAxis[] {
    const axes: GridEditAxis[] = GRID_EDIT_AXES.filter((r) => r.alwaysActive).map((r) => r.axis);
    // `mode` defaults to 'orthogonal' in GridStore.add, so an absent mode is orthogonal.
    if ((g.mode ?? 'orthogonal') === 'linear') axes.push('linear');
    if (g.isPinned === true) axes.push('pinned');
    return axes;
}

/**
 * Can `op` be offered for this grid? Conjunction over the ACTIVE axes that GOVERN it.
 *
 * `user-resolvable` dominates `unbuilt` when both apply: if the user can clear the
 * blockage themselves, that is the sentence worth putting first.
 */
export function gridEditAvailability(g: GridEditSubject, op: GridEditOperation): GridEditVerdict {
    const active = gridEditActiveAxes(g);
    const blocked = GRID_EDIT_AXES.filter(
        (row) => active.includes(row.axis) && row.governs.includes(op) && row.status !== 'available',
    );
    if (blocked.length === 0) return { ok: true, blockedBy: [] };

    const resolvableFirst = [...blocked].sort(
        (a, b) => Number(b.status === 'user-resolvable') - Number(a.status === 'user-resolvable'),
    );
    const dominant = resolvableFirst[0]!;
    const sentences = resolvableFirst.map((r) => r.reason).filter((s): s is string => !!s);
    return {
        ok: false,
        blockedBy: blocked.map((r) => r.axis),
        status: dominant.status,
        reason: sentences.join(' '),
    };
}

/**
 * ⚠ A DIVERGENCE THIS TABLE DECLARES RATHER THAN RESOLVES.
 *
 * Whether a PINNED grid may be DELETED has two live answers today:
 *   • `RemoveGridCommand.canExecute()` does NOT check `isPinned` — the command allows it.
 *   • `PropertyPanelAnnotations.showGrid()` blocks it by hand with an `alert()` before
 *     dispatching.
 *
 * That is two authorities for one question (C84 EI-1), and resolving it is a PRODUCT
 * decision, not a measurement: a pin that prevents only accidental MOVEMENT is a
 * defensible design, and so is one that prevents deletion too (Revit's does). Guessing
 * would silently ratify one of them repo-wide, so the `pinned` row above governs `'move'`
 * ONLY, delete keeps its current command-level answer, and the disagreement is named here
 * for whoever decides it.
 */
export const GRID_PINNED_DELETE_IS_UNDECIDED =
    'RemoveGridCommand permits deleting a pinned grid; the Grid Properties panel blocks it by hand. '
    + 'One of the two is wrong, and the decision is a product call, not a measurement.';
