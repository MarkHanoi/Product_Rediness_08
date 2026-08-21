/**
 * activeProjectId — the ONE resolver for "which project is open right now".
 *
 * ── WHY THIS MODULE EXISTS (§LINK-ACTIVE-PID-EXTRACT, L-3160) ───────────────
 *
 * This function was defined in `ui/site/siteDispatch.ts`, and FOUR ENGINE modules
 * imported it from there for this one function alone:
 *
 *     apps/editor/src/engine/initUI.ts:68
 *     apps/editor/src/engine/ViewController.ts:54
 *     apps/editor/src/engine/views/mountedDrawingScope.ts:73
 *     apps/editor/src/engine/links/linkedModelScope.ts:65
 *
 * Two costs, both measured rather than assumed:
 *
 *   1. **DIRECTION.** `mountedDrawingScope` and `linkedModelScope` are C13 project-
 *      scope OWNERS with module-scope registration side effects. Reaching UP into a
 *      UI module to answer "whose state am I holding?" inverts the dependency for a
 *      function that needs nothing from the UI at all — it reads two runtime fields
 *      and one window global.
 *   2. **WEIGHT.** `siteDispatch` is a large dispatch surface, and importing it pulls
 *      the command graph behind it. Measured cold under vitest, `siteDispatch` alone
 *      costs ~9 s to transform, and a UI panel whose only need was this one function
 *      could not complete a real `await import(...)` inside a 120 s budget — the
 *      transform log showed the whole command registry loading behind it. After this
 *      extraction that suite runs both arms and 29 assertions in **23 s**.
 *
 * So the definition moves HERE, where it has no dependencies but the runtime type,
 * and `siteDispatch` RE-EXPORTS it. Every one of the eleven existing call sites keeps
 * working unchanged; nobody has to be repointed for correctness, and the ones that
 * benefit can be repointed as they are touched.
 *
 * ⚠ THERE MUST NEVER BE A SECOND COPY. `mountedDrawingScope.ts:89` already records
 * why — "a second, quietly-divergent copy of this lookup is how attribution rots" —
 * and the whole point of C13 §3.10's named owners is that two surfaces asking "whose
 * is this?" must not be able to get two answers. Extracting is the fix; duplicating
 * would have been the defect.
 *
 * Pure: no I/O, no THREE, no DOM construction. It reads `window` globals defensively
 * and never throws.
 */

import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

/**
 * Resolve the active project id from the most-reliable source available.
 * Order: `runtime.audit.projectId` → `runtime.projectContext.projectId` →
 * `window.__pendingProjectId` → `window.projectContext.projectId`. The Site id is
 * deterministic (`site_<projectId>`), so this MUST be consistent everywhere a Site
 * is created or read — using a different source per call site produces two Sites
 * and the climate dataset keys to the wrong one (§A.21.D39(#7)).
 *
 * §A.21.D40(#6) — DEAD-BRANCH FIX. The D39 fallback read `window.projectContext.projectId`,
 * but on the editor `window.projectContext` is the `@pryzm/core-app-model`
 * `ProjectContext` (it only exposes `activeLevelId` + `editorMode` — there is NO
 * `projectId` field), so that branch was ALWAYS `undefined` and the generate-house →
 * Forma flow (audit + runtime.projectContext both empty for a tick) still resolved
 * null → no Site → empty wind rose. The legacy `window.__pendingProjectId` global
 * (set by ProjectHub.openProject before/around the runtime audit lands) is the one
 * that IS populated on that flow, so it is the real fallback. The field-less
 * `window.projectContext.projectId` read is kept LAST purely as a future-proof
 * no-op (harmless if a projectId field is ever added there).
 */
export function resolveActiveProjectId(rt: PryzmRuntime): string | null {
    const auditPid = rt.audit?.projectId;
    if (typeof auditPid === 'string' && auditPid.length > 0) return auditPid;
    const ctxPid = rt.projectContext?.projectId;
    if (typeof ctxPid === 'string' && ctxPid.length > 0) return ctxPid;
    try {
        const win = window as unknown as {
            __pendingProjectId?: string | null;
            projectContext?: { projectId?: string | null };
        };
        // The global ProjectHub sets when opening a project — populated on the
        // house demo flow even when the runtime audit/context race empty.
        const pendingPid = win.__pendingProjectId;
        if (typeof pendingPid === 'string' && pendingPid.length > 0) return pendingPid;
        // Future-proof no-op (core-app-model ProjectContext has no projectId today).
        const winPid = win.projectContext?.projectId;
        if (typeof winPid === 'string' && winPid.length > 0) return winPid;
    } catch { /* no window / no globals */ }
    return null;
}
