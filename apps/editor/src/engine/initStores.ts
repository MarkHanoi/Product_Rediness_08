/**
 * initStores — Phase F-1 subsystem initializer.
 *
 * Registers all 21 element stores in the central StoreRegistry.
 *
 * Must be called after all stores have been instantiated (i.e. after
 * EngineBootstrap has created every store instance) and before any
 * consumer queries storeRegistry.getStoreForType() or getStoreForElement().
 *
 * Extracted from EngineBootstrap.ts (Phase F-1).
 * Corresponds to lines 3015–3041 of the original monolithic bootstrap.
 *
 * Contract:
 *   §01-BIM-ENGINE-CORE-CONTRACT §3.2 — all stores registered here; this
 *     is the single authoritative registration point.
 *   §03-BIM-SEMANTIC-MODEL-CONTRACT — stores are registered (read-only
 *     reference passing), never mutated by this module.
 *   §05-BIM-UI-ARCHITECTURE-CONTRACT — engine-layer only; must not be
 *     imported by UI components.
 *
 * Future F-1 work: store instantiation will also migrate here once the
 * builder/tool coupling is disentangled (subsequent extractions).
 */

import { storeRegistry, BimStore } from '@pryzm/core-app-model';

// ── AllStores ─────────────────────────────────────────────────────────────────
/**
 * Typed bag of all 21 element store instances.
 *
 * Fields are typed as `unknown` to avoid requiring EngineBootstrap to import
 * BimStore for casts — the `as unknown as BimStore` casts are consolidated
 * inside registerAllStores() where StoreRegistry is the only consumer.
 *
 * Keys match the canonical element-type strings used throughout the platform
 * (§01-BIM-ENGINE-CORE-CONTRACT §3.2).
 */
export interface AllStores {
    wallStore:         unknown;
    slabStore:         unknown;
    columnStore:       unknown;
    beamStore:         unknown;
    stairStore:        unknown;
    stairLandingStore: unknown;
    stairRailingStore: unknown;
    /**
     * §STAIR-AUDIT-2026 F2 / F23 fix (FIXED 2026-04-25): registering the
     * stair-type store gives the Property Inspector / Schedule Extractor /
     * IFC Exporter a discoverable handle on custom-type CRUD instead of
     * forcing them to import the singleton directly.  The store now also
     * publishes on the standard window + storeEventBus channels.
     */
    stairTypeStore?:   unknown;
    curtainWallStore:  unknown;
    curtainPanelStore: unknown;
    doorStore:         unknown;
    windowStore:       unknown;
    roofStore:         unknown;
    plumbingStore:     unknown;
    furnitureStore:    unknown;
    handrailStore:     unknown;
    openingStore:      unknown;
    gridStore:         unknown;
    roomStore:         unknown;
    ceilingStore:      unknown;
    floorStore:        unknown;
    annotationStore:   unknown;
}

// ── registerAllStores ─────────────────────────────────────────────────────────
/**
 * Register every element store in the StoreRegistry under its canonical type key.
 *
 * Registration is idempotent for the same instance; re-registering a different
 * instance for the same type emits a StoreRegistry warning and replaces the old
 * one (this should never happen in normal bootstrap flow).
 *
 * @param stores - All 21 store instances produced by EngineBootstrap.
 */
export function registerAllStores(stores: AllStores): void {
    const r = (type: string, store: unknown): void =>
        storeRegistry.register(type, store as unknown as BimStore);

    r('wall',          stores.wallStore);
    r('slab',          stores.slabStore);
    r('column',        stores.columnStore);
    r('beam',          stores.beamStore);
    r('stair',         stores.stairStore);
    r('stair-landing', stores.stairLandingStore);
    r('stair-railing', stores.stairRailingStore);
    // §STAIR-AUDIT-2026 F23 fix (FIXED 2026-04-25): register the stair-type
    // store under its canonical type key so any consumer can resolve it via
    // StoreRegistry.getStoreForType('stair-type').  Optional — older
    // bootstraps that don't supply the instance simply skip this line.
    if (stores.stairTypeStore) r('stair-type', stores.stairTypeStore);
    r('curtainwall',   stores.curtainWallStore);
    r('curtain-panel', stores.curtainPanelStore);
    r('door',          stores.doorStore);
    r('window',        stores.windowStore);
    r('roof',          stores.roofStore);
    r('plumbing',      stores.plumbingStore);
    r('furniture',     stores.furnitureStore);
    r('handrail',      stores.handrailStore);
    r('opening',       stores.openingStore);
    r('grid',          stores.gridStore);
    r('room',          stores.roomStore);
    r('ceiling',       stores.ceilingStore);
    r('floor',         stores.floorStore);
    r('annotation',    stores.annotationStore);

    console.log(
        `[initStores] StoreRegistry: ${storeRegistry.count()} stores registered —`,
        storeRegistry.getRegisteredTypes().join(', ')
    );
}
