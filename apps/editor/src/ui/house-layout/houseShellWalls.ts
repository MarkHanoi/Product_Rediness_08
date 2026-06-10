// §DIAG-EXEC-WINDOWS support — per-level SHELL (perimeter) wall-id set.
//
// THE PROBLEM (founder v106): §DIAG-EXEC-WINDOWS flagged ⚠ WINDOW-ON-PARTITION for
// windows that are genuinely on the SHELL perimeter walls. The diagnostic decided
// "shell vs partition" purely from `facadeOrientationService.getFacades(levelId)`
// `isExterior`, which returned false/unknown for real shell walls on this plate →
// false positives (the entrance-door + façade-window walls were flagged as interior
// partitions).
//
// THE ROBUST SEAM: the HouseLayoutExecutor ALREADY knows, per storey, the authoritative
// shell wall id set — `gatherShellWalls(levelId)` on the ground (the drawn shell that
// hosts the entrance door + façade windows) and `perimeter.shellWalls` on the upper
// storeys (the minted footprint ring). It records those ids here; the diagnostics pass
// (`houseExecDiagnostics`, which runs LATER from the naming pass and does NOT have the
// executor's shell list) reads them back. A window whose host wall is in this set is
// NEVER a partition — so WINDOW-ON-PARTITION only fires for a window genuinely on an
// interior partition. This mirrors `houseStairRects` exactly (the same record/read seam).
//
// Cleared at the start of every build so a re-generate never carries a stale set.
// Pure data — no behaviour change (read by logging only). ADR-0061 determinism.

const shellWallIdsByLevel = new Map<string, Set<string>>();

/** Clear all recorded shell wall ids (call once at the start of a house build). */
export function resetShellWalls(): void {
    shellWallIdsByLevel.clear();
}

/** Record the authoritative shell (perimeter) wall ids for a level. */
export function recordShellWalls(levelId: string, wallIds: readonly string[]): void {
    let set = shellWallIdsByLevel.get(levelId);
    if (!set) { set = new Set<string>(); shellWallIdsByLevel.set(levelId, set); }
    for (const id of wallIds) set.add(id);
}

/** The shell (perimeter) wall ids recorded for a level (empty set if none). */
export function getShellWalls(levelId: string): ReadonlySet<string> {
    return shellWallIdsByLevel.get(levelId) ?? new Set<string>();
}
