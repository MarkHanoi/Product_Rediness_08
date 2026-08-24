/**
 * §CANVAS2D-SUBJECT-DELETE-SEAM (L-10340)
 *
 * ONE dispatch point for the Canvas2D subjects that are selectable but are NOT
 * THREE `Object3D`s — annotation (L-703), grid (L-1107) and level (L-1109).
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 * Four hand-copied copies of the same eleven lines had accumulated across two
 * files and three lanes: `initUI.deleteSelected` grew an arm per subject (the
 * grid arm's own comment says it "mirrors the annotation arm above", and the
 * level arm says it mirrors both), and `ContextualEditBar._deleteSelectedGrid`
 * independently grew a fourth copy of the grid one. Two lanes writing the same
 * route twice is a genuine defect on its own terms — one operation must have one
 * route (C84 EI-4a) — and copying an arm to make the next one is what drove the
 * shrink-only P6 ratchet in `tools/ga-gate/check-no-commandmanager.ts` BACKWARDS
 * without any lane intending a new bypass.
 *
 * Callers keep what legitimately differs — WHICH command, WHICH sentence the
 * user is shown, WHICH panes to clear. This seam owns only "dispatch it, and
 * normalise the refusal", so a refused delete can never be reported as a
 * completed one (C16 CA-18 / C84 EI-2).
 *
 * ── ⚠ Why this is NOT `runtime.bus.executeCommand` — MEASURED, not assumed ──
 * The BIM-element arm of `deleteSelected` DOES use the bus
 * (`await bus.executeCommand('element.delete', …)`, reading `EventRecord.refusal`).
 * The choice here therefore tracks CAPABILITY, not convenience:
 *
 *   • annotation — `annotation.delete` EXISTS but deletes from
 *     `ctx.stores.annotation`, while these annotations live in the ADR-0119
 *     SUBSYSTEM `annotationStore`. Routing there is precisely the L-703 defect:
 *     `canExecute` answers "annotation not found" and the user is told that a
 *     refused delete succeeded.
 *   • grid — `grid.delete` EXISTS (`plugins/grid/src/handlers/DeleteGrid.ts`)
 *     but writes the plain `GridsState` record, NOT the `gridStore` that the
 *     renderer and `selectedGridInAnyPane()` read. `initBusHandlers.ts` bridges
 *     `grid.update` and `grid.add` — and no `grid.delete`.
 *   • level — no `level.delete` verb exists anywhere in the repo.
 *
 * All three are one root: ADR-0318 store-unification debt. Until a verb writes
 * the store the UI reads AND returns its refusal synchronously, this seam is the
 * only route that can keep these deletes honest. `CommandBus.executeCommand` is
 * additionally `async` and THROWS its refusal rather than returning it, while
 * every caller below is synchronous and two of them return a verdict to their
 * own caller.
 *
 * When those verbs land, this ONE function changes — not four call sites.
 */

/** The normalised outcome of a Canvas2D subject delete. */
export interface CanvasSubjectDeleteOutcome {
    readonly ok: boolean;
    /** The command's OWN sentence, so the caller can name the real reason. */
    readonly reason?: string;
}

/**
 * Dispatch a Canvas2D subject delete command and normalise its verdict.
 *
 * Never throws: an absent command system and a refusing command are both
 * reported as `{ ok: false }` carrying a sentence the caller can show.
 */
export function dispatchCanvasSubjectDelete(cmd: unknown): CanvasSubjectDeleteOutcome {
    const cm = window.commandManager as unknown as
        | { execute(c: unknown): { success?: boolean; info?: string[]; error?: string } | undefined }
        | undefined;
    if (!cm || typeof cm.execute !== 'function') {
        return { ok: false, reason: 'the command system is not ready' };
    }
    const res = cm.execute(cmd);
    if (res && res.success === false) {
        return { ok: false, reason: res.error ?? res.info?.join('; ') ?? 'the model refused the delete' };
    }
    return { ok: true };
}
