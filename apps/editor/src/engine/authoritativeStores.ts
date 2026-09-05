/**
 * authoritativeStores — §MT-05 / ADR-0318 I-1: ONE hand-off, TWO consumers.
 *
 * ─── What this closes ───────────────────────────────────────────────────────
 * `engineLauncher` used to describe the same store to its two downstream
 * consumers with two DIFFERENT expressions:
 *
 *     registerAllStores({ …, columnStore: columnStoreInstance, … })            // registry
 *     initPersistence({ stores: { …, columnStore: window.columnStore
 *                                              ?? columnStoreInstance, … } })  // serializer
 *
 * Two expressions can evaluate to two objects. When they do, ADR-0318 I-1
 * ("the instance `runtime.stores.elements.get(k)` returns IS the instance the
 * serializer reads") is false for that kind, and the project silently
 * serialises from a store nobody is writing — the ADR's own §"Named residual
 * risks" bullet. A runtime guard could only *detect* that at bootstrap; it
 * could not make it impossible.
 *
 * This module makes it impossible BY CONSTRUCTION. The launcher builds ONE
 * `AuthoritativeStores` record. Both consumer bundles are derived from that
 * one record by property read, so for every key both consumers receive, they
 * receive the SAME REFERENCE — not by convention, not by a guard that has to
 * run, but because there is only one binding to read.
 *
 * ─── Why this shape and not `initPersistence` reading the registry ──────────
 * Deriving the serializer bundle from `storeRegistry.getStoreForType(k)` is
 * the stronger end state (the serializer would then read the registry itself)
 * and is recorded as the follow-on. It is NOT done here because it would move
 * persistence onto a `BimStore | undefined` duck type and make a missing
 * registration a silent `undefined` at save time — trading a construction
 * hazard for a nullability hazard. This form keeps the concrete types.
 *
 * ─── The probe ──────────────────────────────────────────────────────────────
 * `__tests__/mt05StoreIdentityHeap.spec.ts` drives THESE functions with
 * sentinel objects, runs the real `registerAllStores` and the real
 * `ProjectSerializer.serialize`, and asserts with `toBe` that the object the
 * registry holds is the object the serializer actually called `getAll()` on.
 * That is a heap assertion over the production hand-off, not a string pin.
 *
 * Layer: engine (L7 app). Pure — no I/O, no THREE, no DOM, no side effects.
 */

import type { AllStores } from './initStores';
import type { ProjectStores } from './persistence/ProjectSerializer';

/**
 * Every authoritative element-store instance the engine owns, in one record.
 *
 * Extends `ProjectStores` (the serializer's shape) and adds the kinds only the
 * StoreRegistry receives. Typed as `unknown` for the registry-only kinds for
 * the same reason `AllStores` is: the registry casts to its own `BimStore`
 * duck type and nothing here needs the concrete classes.
 */
export interface AuthoritativeStores extends ProjectStores {
    stairLandingStore: unknown;
    stairRailingStore: unknown;
    stairTypeStore?:   unknown;
    liftStore?:        unknown;
    liftTypeStore?:    unknown;
    /**
     * §L-1057 — CONCRETE, not `unknown`, and it is the one exception to the rule
     * stated above. That rule's reason — "nothing here needs the concrete classes"
     * — stopped being true when `ProjectSerializer` began reading this store to
     * collect sparse panel overrides (C87 §13.1 CW-P). `ProjectStores` types it
     * concretely, and an `unknown` here makes `AuthoritativeStores` fail to extend
     * it. Typing it is the honest fix; widening `ProjectStores` back to `unknown`
     * would hand the serializer a store it cannot call.
     */
    curtainPanelStore: import('@pryzm/geometry-curtain-wall').CurtainPanelStore;
    doorStore:         unknown;
    windowStore:       unknown;
    lightingStore?:    unknown;
    annotationStore:   unknown;
}

/**
 * The keys BOTH consumers receive — the exact set over which "registry
 * identity ≡ serializer identity" is a claim. The heap probe iterates this
 * list, so a kind added to both bundles below without being added here is
 * caught by the probe's own completeness arm rather than going unasserted.
 *
 * (Registry-only kinds — door, window, curtain-panel, the stair/lift type
 * stores, lighting, annotation — and serializer-only kinds — the four
 * system-type stores — are outside the claim by construction: only one
 * consumer ever sees them, so they cannot diverge between the two.)
 */
export const SHARED_STORE_KEYS = [
    'wallStore',
    'slabStore',
    'columnStore',
    'gridStore',
    'stairStore',
    'beamStore',
    'curtainWallStore',
    // §L-1057 / C87 §13.1 CW-P — added in lock-step with the SERIALIZER half, not
    // after it. `8b3ec6e8` put `curtainPanelStore` into `toSerializerBundle` (it was
    // already in `toRegistryBundle`), which made it a kind BOTH consumers receive —
    // and a kind both receive is exactly what this list exists to assert identity
    // for. Leaving it off meant ARM A of mt05StoreIdentityHeap asserted identity for
    // fourteen kinds and silently not for the fifteenth; ARM C is the completeness
    // arm that caught it, and its message says the fix is to WIDEN this list, never
    // to narrow the bundles.
    'curtainPanelStore',
    'roofStore',
    'plumbingStore',
    'furnitureStore',
    'handrailStore',
    'openingStore',
    'roomStore',
    'ceilingStore',
    'floorStore',
] as const;

export type SharedStoreKey = (typeof SHARED_STORE_KEYS)[number];

/**
 * The StoreRegistry's view of the record (ADR-0318 §3.2 / I-1).
 *
 * Every value is a property read off `s` — never a construction, never a
 * global read, never a fallback. That is the whole point.
 */
export function toRegistryBundle(s: AuthoritativeStores): AllStores {
    return {
        wallStore:         s.wallStore,
        slabStore:         s.slabStore,
        columnStore:       s.columnStore,
        beamStore:         s.beamStore,
        stairStore:        s.stairStore,
        stairLandingStore: s.stairLandingStore,
        stairRailingStore: s.stairRailingStore,
        stairTypeStore:    s.stairTypeStore,
        liftStore:         s.liftStore,
        liftTypeStore:     s.liftTypeStore,
        curtainWallStore:  s.curtainWallStore,
        curtainPanelStore: s.curtainPanelStore,
        doorStore:         s.doorStore,
        windowStore:       s.windowStore,
        roofStore:         s.roofStore,
        plumbingStore:     s.plumbingStore,
        furnitureStore:    s.furnitureStore,
        lightingStore:     s.lightingStore,
        handrailStore:     s.handrailStore,
        openingStore:      s.openingStore,
        gridStore:         s.gridStore,
        roomStore:         s.roomStore,
        ceilingStore:      s.ceilingStore,
        floorStore:        s.floorStore,
        annotationStore:   s.annotationStore,
    };
}

/**
 * The ProjectSerializer's view of the same record.
 *
 * Same rule: every value is a property read off `s`. `columnStore` and
 * `curtainWallStore` in particular no longer read `window.*` — that read is
 * what MT-05 named, and deleting it is what makes divergence unreachable
 * rather than merely unobserved. The `window.columnStore` /
 * `window.curtainWallStore` globals still exist for the ~40 legacy UI readers
 * (TASK-08); the launcher's §MT-05 guard is what keeps THOSE honest, and it is
 * now the only thing that global identity is load-bearing for.
 */
export function toSerializerBundle(s: AuthoritativeStores): ProjectStores {
    return {
        wallStore:              s.wallStore,
        slabStore:              s.slabStore,
        columnStore:            s.columnStore,
        gridStore:              s.gridStore,
        stairStore:             s.stairStore,
        beamStore:              s.beamStore,
        curtainWallStore:       s.curtainWallStore,
        // §L-1057 / C87 §13.1 CW-P — the panel AUTHORITY. Absent from this bundle
        // until 2026-08-19, so `ProjectSerializer` had no store to read per-panel
        // authoring from and every authored panel was destroyed on save.
        curtainPanelStore:      s.curtainPanelStore,
        roofStore:              s.roofStore,
        plumbingStore:          s.plumbingStore,
        furnitureStore:         s.furnitureStore,
        handrailStore:          s.handrailStore,
        openingStore:           s.openingStore,
        roomStore:              s.roomStore,
        slabSystemTypeStore:    s.slabSystemTypeStore,
        wallSystemTypeStore:    s.wallSystemTypeStore,
        ceilingStore:           s.ceilingStore,
        ceilingSystemTypeStore: s.ceilingSystemTypeStore,
        floorStore:             s.floorStore,
        floorSystemTypeStore:   s.floorSystemTypeStore,
    };
}
