// IFC/Revit element metadata — the canonical durable shape (S55 / A.R.3).
//
// This is the L0 home the plugin-side `IFCElementMeta` (plugins/ifc-export,
// plugins/ifc-import) was always meant to bind against — its own type comment
// reads: "S55 will land an `IFCMetaStore` in `@pryzm/stores` whose entries match
// this shape verbatim". Lifting the shape to L0 lets the durable `IfcMetaStore`
// (@pryzm/stores, L3) and both interop plugins (L7) share ONE definition, and
// keeps the meta serialisable into `.pryzm` persistence so a Revit round-trip
// survives reload (the highest-leverage unlock per the 2026-06-02 interop audit
// — see master-execution-tracker §12.6 A.R.3).
//
// P5 — pure schema: zero I/O, zero THREE, zero DOM. Zod only.
//
// Aligns with `IfcData {guid, ifcClass}` (base/primitives.ts): an element's
// inline `ifc` field is the minimal round-trip anchor (guid≡globalId,
// ifcClass≡typeName); this richer meta carries the psets/quantities/tier the
// exporter needs to reconstruct the original IFC entity.

import { z } from 'zod';

/** Scalar allowed inside an IFC Pset (`IfcPropertySingleValue.NominalValue`). */
export const PsetValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type PsetValue = z.infer<typeof PsetValue>;

/** A single IFC property set (key = property name → scalar). */
export const Pset = z.record(z.string(), PsetValue);
export type Pset = z.infer<typeof Pset>;

/** A single IFC quantity set (key = quantity name → numeric measure). */
export const Qset = z.record(z.string(), z.number());
export type Qset = z.infer<typeof Qset>;

/**
 * Round-trip fidelity tier (ADR-008):
 *   1 = native editable (wall/slab/door/window/column/beam)
 *   2 = transform-only proxy (furniture/MEP — immutable geometry)
 *   3 = dropped (post-GA scope)
 */
export const IfcElementTier = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type IfcElementTier = z.infer<typeof IfcElementTier>;

/**
 * Durable side-car metadata describing the IFC/Revit origin of a PRYZM element.
 * Field names match the plugin-side `IFCElementMeta` verbatim so the plugins can
 * re-point to this definition without a data migration.
 */
export const IfcElementMeta = z.object({
    /** PRYZM element id (`wall_<ulid>`, …) — the join key. */
    pryzmElementId: z.string().min(1),
    /** Original IFC `GloballyUniqueId` (22-char base64). Preserved across round-trips. */
    globalId: z.string().min(1),
    /** Original IFC entity type, e.g. `IFCWALLSTANDARDCASE`. */
    typeName: z.string().min(1),
    name: z.string().optional(),
    description: z.string().optional(),
    /** Tier-2 proxies stash their baked-geometry hash here (cache key recovery). */
    objectType: z.string().optional(),
    /** Every `IfcPropertySet` that referenced this element on import. */
    psets: z.record(z.string(), Pset).default({}),
    /** Every `IfcElementQuantity` set that referenced this element on import. */
    quantities: z.record(z.string(), Qset).optional(),
    tier: IfcElementTier,
});
export type IfcElementMeta = z.infer<typeof IfcElementMeta>;

/**
 * Serialised form of the whole meta-store — the unit persisted into `.pryzm`
 * v1 and re-hydrated on project load. Versioned so the format can evolve.
 */
export const IfcMetaStoreSnapshot = z.object({
    version: z.literal(1),
    elements: z.record(z.string(), IfcElementMeta),
});
export type IfcMetaStoreSnapshot = z.infer<typeof IfcMetaStoreSnapshot>;
