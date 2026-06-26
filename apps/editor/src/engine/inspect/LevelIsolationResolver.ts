/**
 * LevelIsolationResolver — §ISOLATE-ALL-ELEMENTS-WIRED (2026-06-26)
 *
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Builder/inspect layer (read-only visibility derivation —
 *                    no store, registry, or semantic-graph mutation)
 * Architectural Classification: A (view-only)
 *
 * Impact Assessment: Semantic No · Constraint No · Graph No · Topology No ·
 *                    Store-Registry No (READS elementRegistry only) · Undo No.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Floor isolation ("Active Level Only" / solo level) previously filtered the
 * scene with a raw `scene.traverse()` that hid any object whose stamped
 * `userData.levelId` did not equal the active level. That path is fragile in
 * two ways the founder hit directly:
 *
 *   1. HARDCODED-COVERAGE GAP — it depends on EACH element root self-stamping
 *      `userData.levelId`. If a builder forgets it (or a child mesh lacks it),
 *      that element silently falls OUT of isolation. The reported symptom was a
 *      stair showing on the isolated Ground Floor while its RAILING vanished.
 *
 *   2. SPAN-ELEMENT GAP — stairs and lifts span TWO levels (base → top). Keying
 *      on a single `levelId` hides a Ground→L1 stair (and its railing) when L1
 *      is isolated even though the stair physically occupies L1.
 *
 * FIX: enumerate every placed element from the ONE authoritative registry
 * (`elementRegistry.getAllRoots()` — every Create-command / builder registers its root
 * there) instead of trusting a per-object scene tag. Every element type is then
 * covered BY CONSTRUCTION; a new element type that registers a root is isolated
 * automatically. Span elements show when EITHER their base or top level is the
 * isolated one, and a railing/handrail follows its host stair's span.
 *
 * Pure derivation: returns a visibility DECISION map. The caller
 * (BottomActionMenu) owns the `_originalVisibility` capture/restore and the
 * actual `obj.visible` write, so no view-state is baked into this layer (P7).
 */

import type * as THREE from '@pryzm/renderer-three/three';
import { elementRegistry, type StoreType } from '@pryzm/core-app-model/element-registry';
import { trace } from '@opentelemetry/api';

const _tracer = trace.getTracer('pryzm-engine');

/** Store types whose element physically spans base→top levels. A railing /
 *  handrail hosted on such an element inherits the host's span (resolved via
 *  base/topLevelId stamped on its root, falling back to the host stair root). */
const SPAN_STORE_TYPES: ReadonlySet<StoreType> = new Set<StoreType>([
    'stair',
    'verticalCirculation',
]);

/** userData fields a root may carry to declare its span endpoints. */
interface LevelStamps {
    levelId?: string;
    baseLevelId?: string;
    topLevelId?: string;
    stairId?: string;
    elementType?: string;
    type?: string;
}

/** Decision for one root: should it stay visible while `activeLevelId` is isolated? */
export interface RootLevelDecision {
    readonly root: THREE.Object3D;
    readonly id: string;
    readonly storeType: StoreType | undefined;
    /** Levels this root belongs to (1 for normal elements, ≤2 for span elements). */
    readonly levels: ReadonlySet<string>;
    /** True ⇒ keep visible under isolation; false ⇒ hide (belongs to other level(s) only). */
    readonly visibleInIsolation: boolean;
}

function readStamps(root: THREE.Object3D): LevelStamps {
    return (root.userData ?? {}) as LevelStamps;
}

function isRailingOrHandrail(storeType: StoreType | undefined, stamps: LevelStamps): boolean {
    if (storeType === 'stair-railing' || storeType === 'handrail') return true;
    const et = String(stamps.elementType ?? stamps.type ?? '').toLowerCase();
    return et === 'stair-railing' || et === 'handrail';
}

/** Resolves a host stair root by id — defaults to the global element registry,
 *  overridable so the decision pass can resolve hosts from its own snapshot. */
export type HostResolver = (hostId: string) => THREE.Object3D | undefined;

const _registryHostResolver: HostResolver = (id) => elementRegistry.getRoot(id);

/**
 * Resolve the set of levels a single registered root occupies.
 *
 * · Normal element → its `levelId` (one level).
 * · Span element (stair / lift) → base AND top level (so it shows when either is
 *   isolated, since it physically crosses both).
 * · Railing / handrail → its own `levelId`, PLUS — when its host stair is a
 *   span — the host stair's base/top, resolved from this root's own
 *   base/topLevelId if stamped, else from the host stair root via `stairId`.
 */
export function resolveRootLevels(
    root: THREE.Object3D,
    storeType: StoreType | undefined,
    hostResolver: HostResolver = _registryHostResolver,
): Set<string> {
    const stamps = readStamps(root);
    const levels = new Set<string>();
    const add = (v: unknown) => { if (v) levels.add(String(v)); };

    add(stamps.levelId);

    const span = (storeType && SPAN_STORE_TYPES.has(storeType))
        || (!storeType && isSpanByStamp(stamps));
    if (span) {
        add(stamps.baseLevelId);
        add(stamps.topLevelId);
    }

    // A railing/handrail must follow its host stair's span so it never falls out
    // of an isolated level its stair is visible on.
    if (isRailingOrHandrail(storeType, stamps)) {
        add(stamps.baseLevelId);
        add(stamps.topLevelId);
        const hostId = stamps.stairId;
        if (hostId) {
            const host = hostResolver(String(hostId));
            if (host) {
                const hs = readStamps(host);
                add(hs.levelId);
                add(hs.baseLevelId);
                add(hs.topLevelId);
            }
        }
    }

    return levels;
}

function isSpanByStamp(stamps: LevelStamps): boolean {
    const et = String(stamps.elementType ?? stamps.type ?? '').toLowerCase();
    return et === 'stair' || et === 'verticalcirculation';
}

/** One enumerated registered root (the shape elementRegistry.getAllRoots yields). */
export interface RegisteredRoot {
    readonly id: string;
    readonly root: THREE.Object3D;
    readonly storeType: StoreType | undefined;
}

/**
 * §ISOLATE-ALL-ELEMENTS-WIRED — pure decision over an EXPLICIT root list.
 *
 * Separated from the registry read so the span/coverage logic is unit-testable
 * without standing up the singleton. {@link resolveLevelIsolation} feeds this the
 * authoritative `elementRegistry.getAllRoots()` snapshot.
 */
export function decideLevelIsolation(
    roots: ReadonlyArray<RegisteredRoot>,
    activeLevelId: string | null,
): RootLevelDecision[] {
    // Self-contained host resolution: a railing's host stair is resolved from
    // THIS snapshot first (so the decision is consistent within one pass), then
    // the global registry as a fallback.
    const byId = new Map<string, THREE.Object3D>();
    for (const r of roots) byId.set(r.id, r.root);
    const hostResolver: HostResolver = (id) => byId.get(id) ?? elementRegistry.getRoot(id);

    return roots.map(({ id, root, storeType }) => {
        const levels = resolveRootLevels(root, storeType, hostResolver);
        // No isolation, or root has no resolvable level → leave visible
        // (never hide an element we cannot place — fail open, not dark).
        const visibleInIsolation =
            !activeLevelId || levels.size === 0 || levels.has(activeLevelId);
        return { root, id, storeType, levels, visibleInIsolation };
    });
}

/**
 * §ISOLATE-ALL-ELEMENTS-WIRED — single-source-of-truth isolation pass.
 *
 * Enumerates EVERY registered element root and decides, for each, whether it
 * stays visible while `activeLevelId` is the isolated floor. Coverage is by
 * construction: any element type that registers a root participates.
 *
 * @param activeLevelId  the isolated level; `null` ⇒ no isolation (everything
 *                       returns `visibleInIsolation: true`).
 * @returns one decision per registered root.
 */
export function resolveLevelIsolation(activeLevelId: string | null): RootLevelDecision[] {
    return _tracer.startActiveSpan('pryzm.isolate.resolveLevels', (span) => {
        try {
            // §ISOLATE-ALL-ELEMENTS-WIRED — the ONE source of truth. Guard the
            // method's presence so a stale resolved copy of the registry (e.g. a
            // worktree whose node_modules points at an older package build)
            // degrades to "no decisions" rather than throwing.
            const getAll = (elementRegistry as { getAllRoots?: () => RegisteredRoot[] }).getAllRoots;
            const roots: RegisteredRoot[] = typeof getAll === 'function'
                ? getAll.call(elementRegistry)
                : [];
            const decisions = decideLevelIsolation(roots, activeLevelId);

            const hidden = decisions.filter(d => !d.visibleInIsolation).length;
            span.setAttribute('pryzm.isolate.active_level', activeLevelId ?? 'none');
            span.setAttribute('pryzm.isolate.roots', decisions.length);
            span.setAttribute('pryzm.isolate.hidden', hidden);
            span.end();
            return decisions;
        } catch (err) {
            span.recordException(err as Error);
            span.end();
            // Fail open — never let an isolation-derivation error blank the model.
            return [];
        }
    });
}
