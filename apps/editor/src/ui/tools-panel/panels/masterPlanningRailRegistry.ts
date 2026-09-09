// masterPlanningRailRegistry — the ONE registry behind the `Master planning` rail
// category. ADR-0384 D7 · C116 · C82.
//
// ═══════════════════════════════════════════════════════════════════════════════
// ⭐ WHY THIS IS A REGISTRY AND NOT A HARD-CODED TOOL LIST
// ═══════════════════════════════════════════════════════════════════════════════
//
// ADR-0384 D7 rules that "Master planning" is ONE category with ONE registry,
// CO-OWNED with ADR-0383 (massing groups): laying out a site is placing BUILDINGS
// (that ADR) and placing THE GROUND BETWEEN THEM (this one). Its words:
//
//   ⛔ "So this ADR does not mint a 'Roads' rail. It mints ONE `Master planning`
//      category, backed by a data-driven entry registry, and this family registers
//      three entries into it. ADR-0383's lane adds its entries to the SAME registry
//      — a row, never a second rail."
//
// ⭐ THE ALTERNATIVE IS C82'S MEASURED DISASTER IN MINIATURE: the ribbon census found
// 267 of 280 toolbar pairs SILENTLY DEAD. Two rails both called "Master planning"
// is that failure at its first instant, and it is cheaper to refuse now than to
// reconcile later ([[view-region-one-owner]]: one owner per region, adopted BEFORE
// the second writer exists rather than after).
//
// ⚠ REPORTED HONESTLY, BECAUSE THE ADR OVERSTATES IT: **ADR-0383 carries no
// reciprocal ruling.** Measured 2026-09-09 —
// `grep -n -i "rail\|category\|registry"` over
// `ADR-0383-massing-groups-master-planning.md` returns NO OUTPUT, and its landed code
// (`massingGroupRoster.ts`, `massingGroupSelectionState.ts`) adds no rail entry. Its
// decisions are D1 group-as-nested-value … D7 "every mutation is a command", and
// none of them is about a rail. So D7's claim that the category is "CO-OWNED from its
// first commit" describes an obligation that exists in ONE of the two documents.
// This file is built as the registry that lane can join WITHOUT touching
// `CreateRailPanel`; whether ADR-0383 is amended to carry the reciprocal row is the
// orchestrator's call, and it is named here rather than assumed.

/** One entry on the Master planning rail. Deliberately UI-shaped and tiny. */
export interface MasterPlanningToolEntry {
    /** Stable key — used for de-duplication and for tests. Never shown to the user. */
    readonly key: string;
    /** The user-facing label. ⚠ Must have a row in `creationToolShortcuts.ts`. */
    readonly label: string;
    /** An iconify name or an inline SVG string, as the rail's tool renderer accepts. */
    readonly icon: string;
    /** What pressing it does. ⛔ Must dispatch through the bus — P6, never a store write. */
    readonly action: () => void;
    /** Optional disable predicate, evaluated at render time. */
    readonly disabled?: () => boolean;
}

const ENTRIES: MasterPlanningToolEntry[] = [];

/**
 * Add one entry to the Master planning category.
 *
 * ⭐ IDEMPOTENT ON `key`. The rail is rebuilt on every discipline switch and plugins
 * may register more than once across a re-compose; a registry that appended blindly
 * would show the same tool three times and nobody would know which one they pressed.
 * Re-registering a key REPLACES the entry rather than adding a rival — one owner per
 * key, which is the same rule [[view-region-one-owner]] states for a view region.
 */
export function registerMasterPlanningTool(entry: MasterPlanningToolEntry): void {
    const i = ENTRIES.findIndex((e) => e.key === entry.key);
    if (i >= 0) ENTRIES[i] = entry;
    else ENTRIES.push(entry);
}

/** The entries, in registration order. The rail reads this and nothing else. */
export function masterPlanningTools(): readonly MasterPlanningToolEntry[] {
    return ENTRIES;
}

/** Test seam only — the rail never calls this. */
export function __resetMasterPlanningToolsForTest(): void {
    ENTRIES.length = 0;
}
