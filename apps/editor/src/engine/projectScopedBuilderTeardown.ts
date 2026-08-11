/**
 * projectScopedBuilderTeardown — §C13-BUILDER-SCENE-CLEAR.
 *
 * ONE named owner for "detach every builder-held root from the THREE scene at a
 * project switch" (C13 §3.8 / §3.10).
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 *
 * The `bim-project-cleared` sweep in `initTools.ts` disposed FOUR builders — the
 * wall, floor-finish, handrail and stair-railing builders (§FIX-BUILDER-ISOLATION-LEAK,
 * L-320). Nineteen builders are constructed in `initBuilders.ts`. The other fifteen
 * were swept only INDIRECTLY, by the per-element `bim-*-removed` events that
 * `ClearProjectCommand` fires while emptying the stores — a path that L-320 already
 * documented as abortable mid-teardown. When it aborts, or when a builder holds a
 * root the store never knew about, the geometry stays parented to the scene and the
 * next project inherits it. That is the founder's report: a project with
 * `massing rendered: 0 wall(s)` still showing black plan linework and floating grey
 * boxes on the site.
 *
 * ── WHY NOT JUST CALL dispose() ON ALL OF THEM ──────────────────────────────
 *
 * Because `dispose()` means two different things in this codebase, and calling the
 * wrong one would have introduced a WORSE bug than the one being fixed:
 *
 *   • geometry-only, re-buildable    — FloorPanelBuilder, CeilingPanelBuilder
 *   • TERMINAL, drops subscriptions  — StairMeshBuilder (`_disposers`),
 *     LiftMeshBuilder (`_disposers`), LightingFragmentBuilder (`_unsubDayNight`),
 *     SlabFragmentBuilder (`_unsubscribeViews`)
 *   • neither — removes NO roots at all: FurnitureFragmentBuilder.dispose() frees a
 *     material cache and leaves every placed item in the scene
 *
 * Builders are application singletons: the SAME instance serves the next project. A
 * terminal dispose at a project switch therefore leaves the INCOMING project with a
 * dead listener — precisely the L-224 failure mode, re-created one layer down.
 *
 * So the verb is `clearProjectGeometry()`: non-terminal, idempotent, geometry only.
 * Every builder that parents roots into the shared scene now implements it, and this
 * module is the single place that calls them.
 *
 * ── HONESTY (§CONTEXT-DATA-HONESTY) ─────────────────────────────────────────
 *
 * A builder that is absent, or that exposes no clear API, is REPORTED — never
 * silently skipped. "Nothing to clear" and "I could not clear it" are the same
 * value otherwise, and this family of bug has already been produced four times by
 * failing to distinguish them.
 */

/** The uniform, non-terminal project-switch clear every builder must expose. */
export interface SceneClearingBuilder {
    clearProjectGeometry?: () => void;
    /** Legacy geometry-only clears kept for builders that already had one. */
    removeAll?: () => void;
    dispose?: () => void;
}

/** One builder in the sweep, named so the report can blame it precisely. */
export interface BuilderTeardownEntry {
    /** Stable name used in the report + log line, e.g. `furnitureBuilder`. */
    readonly name: string;
    readonly builder: unknown;
    /**
     * The method to call. Defaults to `clearProjectGeometry`. Only set this to
     * `'dispose'` for a builder whose `dispose()` is PROVEN non-terminal — see the
     * header; a terminal dispose here is a new L-224.
     */
    readonly via?: 'clearProjectGeometry' | 'removeAll' | 'dispose';
}

export interface BuilderTeardownReport {
    /** Builders whose clear ran without throwing. */
    readonly cleared: readonly string[];
    /** Entries whose `builder` was null/undefined at sweep time. */
    readonly absent: readonly string[];
    /** Entries present but exposing no callable clear method — a REAL coverage hole. */
    readonly noApi: readonly string[];
    /** Clears that threw. Each is isolated; one failure never stops the others. */
    readonly failed: ReadonlyArray<{ name: string; error: string }>;
}

/**
 * Run the C13 scene-clear across every registered builder.
 *
 * Pure with respect to this module: takes the entries, returns the report, logs
 * nothing. The caller (`initBuilders.ts`) owns the logging so the sweep itself stays
 * unit-testable without a console spy.
 */
export function clearProjectScopedBuilderGeometry(
    entries: readonly BuilderTeardownEntry[],
): BuilderTeardownReport {
    const cleared: string[] = [];
    const absent: string[] = [];
    const noApi: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    for (const entry of entries) {
        const b = entry.builder as SceneClearingBuilder | null | undefined;
        if (b == null) { absent.push(entry.name); continue; }

        const method = entry.via ?? 'clearProjectGeometry';
        const fn = b[method];
        if (typeof fn !== 'function') { noApi.push(`${entry.name}.${method}`); continue; }

        try {
            fn.call(b);
            cleared.push(entry.name);
        } catch (e) {
            failed.push({ name: entry.name, error: e instanceof Error ? e.message : String(e) });
        }
    }

    return { cleared, absent, noApi, failed };
}

/**
 * Render the report as ONE console line.
 *
 * The line always states what could NOT be cleared. A sweep that prints only its
 * successes reads as a clean teardown whether or not it actually swept anything —
 * the exact defect C13 §3.10 names.
 */
export function formatBuilderTeardownReport(r: BuilderTeardownReport): string {
    const total = r.cleared.length + r.absent.length + r.noApi.length + r.failed.length;
    const parts = [`${r.cleared.length}/${total} builder(s) cleared`];
    if (r.absent.length) parts.push(`${r.absent.length} absent [${r.absent.join(', ')}]`);
    if (r.noApi.length) parts.push(`⚠ ${r.noApi.length} with NO clear API — NOT SWEPT [${r.noApi.join(', ')}]`);
    if (r.failed.length) parts.push(`⚠ ${r.failed.length} FAILED [${r.failed.map(f => `${f.name}: ${f.error}`).join('; ')}]`);
    return `[ProjectIsolation] §C13-BUILDER-SCENE-CLEAR — ${parts.join(', ')}.`;
}
