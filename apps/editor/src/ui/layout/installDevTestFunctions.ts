/**
 * installDevTestFunctions.ts — the DEV-ONLY half of what used to be one
 * unconditional `installPryzmTestFunctions()` call in `mountAIArea`
 * (the C74-class unguarded-dev-tools defect, fixed 2026-08-14).
 *
 * Installs the `window.__pryzm*` DevTools helpers ONLY in dev mode, via the
 * repo's canonical dev-check (`import.meta.env.DEV` — see
 * `apps/editor/src/engine/engineLauncher.ts` Wave 5 Day 10 and
 * `window-shim.ts` Pattern D). The dev module is loaded by DYNAMIC import so
 * the production chunk graph never references `src/dev/` at all.
 *
 * `isDev` is a parameter (defaulting to the canonical check) so the guard is
 * testable under vitest, where `import.meta.env.DEV` is fixed for the whole
 * run — see `__tests__/devToolsInstallGuard.test.ts`.
 *
 * The PRODUCTION graph wiring that used to ride on the same installer
 * (provideLiveGraphSources / UBG hook / graph overlays) lives in
 * `installLiveGraphWiring.ts` beside this file and is called unconditionally.
 */

/**
 * Install the `window.__pryzm*` DevTools test helpers if (and only if) the
 * editor is running in dev mode. Resolves once installation has completed
 * (or immediately, in production, having done nothing).
 */
export async function installDevTestFunctions(
    isDev: boolean = import.meta.env.DEV,
): Promise<void> {
    if (!isDev) return;
    try {
        const { installPryzmTestFunctions } = await import(
            '../../dev/installPryzmTestFunctions'
        );
        installPryzmTestFunctions();
    } catch (err) {
        // Dev convenience must never take the AI area down with it.
        console.warn('[installDevTestFunctions] dev helpers unavailable:', err);
    }
}
