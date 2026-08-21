/**
 * linkedModelScope — §C13-LINKED-MODEL-OWNER. The named owner of every LINKED
 * MODEL scene mount (C13 §3.13, ADR-0346 D2, L-2900).
 *
 * ── THE PROBLEM THIS MODULE EXISTS TO SOLVE ─────────────────────────────────
 *
 * A linked model puts ANOTHER PROJECT'S geometry into the active scene. That is,
 * by construction, the exact shape `ProjectIsolationAudit` was written to fail —
 * and it should be, for everything except this one sanctioned case. C13 §3.10 is
 * unambiguous about what makes a stateful surface legal:
 *
 *   "Every stateful surface reset on a project switch MUST have exactly one NAMED
 *    OWNER … the audit enumerates OWNERS, not symptoms."
 *
 * and C13 §3.10 is equally unambiguous about what is NOT an acceptable answer:
 *
 *   "a clean verdict that never looked is worse than no verdict, because it
 *    manufactures confidence."
 *
 * So this feature does **not** ship an allowlist that makes the audit blind. It
 * ships an OWNER that can be ASKED. This module is that owner.
 *
 * ── THE PATTERN, AND WHERE IT COMES FROM ─────────────────────────────────────
 *
 * This is `apps/editor/src/engine/views/mountedDrawingScope.ts` applied to a
 * second surface, and that is deliberate: C13 §7.5 names `views.mountedDrawing`
 * as THE model for "a declared probe per producer" for scene content that no
 * element-keyed sweep can recognise. The shape:
 *
 *   · a MODULE, not an instance — a module can always answer, including "I have
 *     mounted nothing", which is provably clean. An instance cannot answer on
 *     behalf of an instance that was never built (`declaredProjectScopes.ts`
 *     header: THE OWNER OF PROJECT-SCOPED STATE IS THE MODULE, NOT THE INSTANCE).
 *   · registers at module scope as an import side effect ⇒ `presence:'module-scope'`
 *     ⇒ absence is PROVEN clean rather than merely unobserved.
 *   · holds NO THREE import (P2). The detach closure is supplied by the renderer,
 *     which is already the THREE lifetime owner.
 *
 * ── THE ONE THING THAT IS DIFFERENT HERE, AND IT IS THE WHOLE DESIGN ─────────
 *
 * The probe answers the **HOST** project id — the project that created the link —
 * NOT the source project whose geometry is on screen.
 *
 * That is not a dodge. The host OWNS THE ACT OF LINKING: the `LinkedModelRef` is
 * host state, persisted in the host's file, created by a host command. The
 * geometry is foreign; the MOUNT is not. Stamping the host id means a link left
 * mounted after a project switch reads as a leak AUTOMATICALLY, through the
 * ordinary `scope.foreignProject` arm (`ProjectIsolationAudit.ts:672-682`), with
 * no new detector and no exception. Stamping the SOURCE id would have made every
 * correctly-mounted link report as a permanent violation, which trains people to
 * ignore the audit — the failure mode that is worse than no audit at all.
 *
 * ── AND THE SUBTREE IS STILL COUNTED ─────────────────────────────────────────
 *
 * Being owned is not the same as being invisible. `describeLinks()` enumerates
 * every live link BY ID in every report, clean or not, per C13 §3.13 rule 4; and
 * the scene arm `scene.linkedModel` in `ProjectIsolationAudit` independently
 * catches a link root whose `pryzmLinkHostProjectId` is not the loaded project.
 * Two independent readings of the same fact, which is what §7.4 rule 2's
 * "positive control" discipline asks for.
 */

import { projectScopeRegistry, registerProjectScopeProbe } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer';
import { resolveActiveProjectId } from '../../ui/site/siteDispatch';

/** What the module remembers about one mounted link. No THREE types (P2). */
interface MountedLinkRecord {
    /** The link's own id (`lnk_…`). */
    readonly linkId: string;
    /** The project whose geometry this is. Foreign, and that is the point. */
    readonly sourceProjectId: string;
    /** The project that OWNS the link. Stamped at mount time. THIS is what the probe answers. */
    readonly hostProjectId: string | null;
    /** Detaches + disposes the subtree. Supplied by the renderer (the THREE owner). */
    readonly detach: () => void;
    /** Diagnostics: how many instances the mount drew. */
    readonly bandCount: number;
}

const _mounted = new Map<string, MountedLinkRecord>();

/**
 * Resolve the active project through the ONE canonical resolver, exactly as
 * `mountedDrawingScope.ts:88-103` does. A second, quietly-divergent copy of this
 * lookup is how attribution rots.
 */
function activeProjectId(): string | null {
    try {
        const rt = (typeof window !== 'undefined' ? window.runtime : undefined) as
            PryzmRuntime | undefined;
        return rt ? resolveActiveProjectId(rt) : null;
    } catch {
        // Ownership stamping must never break a mount. A null stamp is reported
        // HONESTLY by the probe below — it is never folded into "clean".
        return null;
    }
}

/**
 * Record that a link's subtree is now parented to the live scene, and how to take
 * it out again. Called by the renderer immediately after `scene.add(...)`.
 *
 * Replacing an existing record for the same `linkId` is correct — a re-anchor or a
 * display-mode change remounts — but the OLD subtree must be detached first by the
 * caller, or it strands. The renderer does that; this module does not guess.
 */
export function noteLinkMounted(
    linkId: string,
    sourceProjectId: string,
    detach: () => void,
    bandCount: number,
): void {
    _mounted.set(linkId, {
        linkId,
        sourceProjectId,
        hostProjectId: activeProjectId(),
        detach,
        bandCount,
    });
}

/** Record that a link's subtree was detached by the normal unlink/hide path. */
export function noteLinkUnmounted(linkId: string): void {
    _mounted.delete(linkId);
}

/**
 * Detach ONE link's subtree. Idempotent and non-throwing; the handle is dropped in
 * `finally`, so a throwing detach can never leave this module permanently convinced
 * it still owns a subtree it does not — the §L-676-B discipline.
 */
export function clearMountedLink(linkId: string): void {
    const record = _mounted.get(linkId);
    if (record === undefined) return;
    try {
        record.detach();
    } catch (e) {
        console.warn(
            `[linkedModelScope] §C13-LINKED-MODEL-OWNER detach failed for ${linkId} (non-fatal):`, e,
        );
    } finally {
        _mounted.delete(linkId);
    }
}

/**
 * C13 teardown — detach EVERY mounted link.
 *
 * Synchronous, idempotent, non-throwing (the `projectScopeRegistry` contract). The
 * iteration snapshots the keys first because `clearMountedLink` mutates the map.
 */
export function clearMountedLinks(): void {
    for (const linkId of [..._mounted.keys()]) {
        clearMountedLink(linkId);
    }
    _mounted.clear();
}

/**
 * ADR-0298 probe — whose links are currently in the scene.
 *
 * `null` means "nothing is mounted", which is always clean. A mount whose host
 * project could not be resolved answers `'<link-host-unresolved>'` rather than
 * `null`: §CONTEXT-DATA-HONESTY — "I hold nothing" and "I hold something I cannot
 * attribute" must never share a value, which is precisely the mistake L-713 made
 * the fourth time this family appeared.
 *
 * When several links are mounted under DIFFERENT hosts — which should be
 * impossible and is therefore exactly what a probe is for — the FOREIGN one is
 * reported in preference to the matching one, because the audit's job is to
 * surface the anomaly, not to average it away.
 */
export function getLinkedModelsOwningProjectId(): string | null {
    if (_mounted.size === 0) return null;
    const active = activeProjectId();
    let firstResolved: string | null = null;
    for (const rec of _mounted.values()) {
        if (rec.hostProjectId === null) return '<link-host-unresolved>';
        if (active !== null && rec.hostProjectId !== active) return rec.hostProjectId;
        if (firstResolved === null) firstResolved = rec.hostProjectId;
    }
    return firstResolved;
}

/**
 * What is being held, for the leak report. Never throws.
 *
 * C13 §3.13 rule 4 — every report enumerates live links BY ID even when clean. An
 * audit that stops REPORTING a sanctioned exception has been made blind, and being
 * sanctioned is not a reason to stop counting.
 */
export function describeLinkedModels(): Record<string, unknown> {
    return {
        mountedLinkCount: _mounted.size,
        links: [..._mounted.values()].map(r => ({
            linkId: r.linkId,
            sourceProjectId: r.sourceProjectId,
            hostProjectId: r.hostProjectId,
            bands: r.bandCount,
        })),
    };
}

/** True iff this link currently has a subtree in the scene. */
export function isLinkMounted(linkId: string): boolean {
    return _mounted.has(linkId);
}

/** Test hook — drop the records WITHOUT detaching (no scene in a unit test). */
export function _resetLinkedModelScopeForTest(): void {
    _mounted.clear();
}

// ── Registration: module scope, as an import side effect (ADR-0298 D6) ───────
projectScopeRegistry.register({
    scopeName: 'links.linkedModels',
    clear: () => { clearMountedLinks(); },
});

registerProjectScopeProbe({
    scope: 'links.linkedModels',
    owningProjectId: () => getLinkedModelsOwningProjectId(),
    describe: () => describeLinkedModels(),
});
