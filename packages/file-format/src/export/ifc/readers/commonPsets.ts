/**
 * Standard IFC `Pset_*Common` construction for NATIVELY-AUTHORED elements.
 *
 * ## The gap this closes (L-8540)
 *
 * Every reader in Pipeline A wrote its `Pset_*Common` like this:
 *
 *     if (wall.ifcData?.psetCommon) { ... }
 *
 * — a pure passthrough of data that only exists on elements IMPORTED from an IFC
 * file. `WallData.ifcData` is declared as `{ guid, ifcClass }` and nothing else;
 * `psetCommon` is stapled on during import. So a model drawn entirely in PRYZM
 * exported **no `Pset_WallCommon`, no `Pset_SlabCommon`, no `Pset_DoorCommon`,
 * no `Pset_WindowCommon`, no `Pset_ColumnCommon` at all** — the property sets a
 * downstream consultant's checker looks for first.
 *
 * ## What this does NOT do, deliberately
 *
 * ⛔ It does not invent values. The audit's sibling finding on materials applies
 * here in full: emitting a standard property with a fabricated source is worse
 * than absence, because the consumer cannot tell the difference. Several
 * `Pset_WallCommon` properties — `IsExternal`, `LoadBearing`,
 * `ThermalTransmittance`, `AcousticRating`, `Combustible`, `Compartmentation`,
 * `SurfaceSpreadOfFlame`, `ExtendToStructure` — have **no source field anywhere
 * in the PRYZM element schemas** (verified against
 * `packages/schemas/src/elements/Wall.ts` and
 * `packages/geometry-wall/src/WallTypes.ts`). They are therefore NOT emitted, and
 * that is the correct behaviour until the schema carries them.
 *
 * ⚠ This corrects the brief's framing of the same defect in Pipeline B. It reads
 * *"The writers are already correct — the callers starve them. Plumb the real
 * element data."* For `fireRating` and `Status` that is exactly right and they
 * are plumbed below. For the other nine `Pset_WallCommon` properties the caller
 * is not starving the writer — **there is nothing on the element to pass**. The
 * fix for those is a schema change, not a plumbing change, and it is logged
 * rather than faked.
 */

import { PropertySet, PropertyValue } from '../IntermediateModel';

/** `PEnum_ElementStatus` — the four values `Pset_*Common.Status` may take. */
export type ElementStatus = 'NEW' | 'EXISTING' | 'DEMOLISH' | 'TEMPORARY';

/**
 * Map `CoreElement.properties.phase` onto `Pset_*Common.Status`.
 *
 * PRYZM's phase vocabulary is `'Existing' | 'Demolition' | 'New Construction' |
 * 'Future'` (`packages/core-app-model/src/CoreElement.ts`). Three map cleanly.
 *
 * ⚠ `'Future'` has NO correct target. `TEMPORARY` means a temporary works item,
 * not a future phase, so mapping it there would be a lie with an enum's
 * authority. `'Future'` therefore yields `undefined` and the property is omitted.
 */
export function statusFromPhase(phase: unknown): ElementStatus | undefined {
    switch (phase) {
        case 'New Construction': return 'NEW';
        case 'Existing':         return 'EXISTING';
        case 'Demolition':       return 'DEMOLISH';
        default:                 return undefined;
    }
}

/** The element shape this module reads. Every field is optional. */
export interface CommonPsetSource {
    properties?: { mark?: string; phase?: string; [k: string]: unknown } | undefined;
    systemTypeId?: string | undefined;
    fireRating?: string | undefined;
    ifcData?: unknown;
}

/**
 * Build a standard `Pset_*Common` for a natively-authored element.
 *
 * @param psetName  e.g. `'Pset_WallCommon'`.
 * @param element   The element as the reader has it.
 * @param extra     Additional REAL properties the caller can vouch for.
 * @returns The pset, or `null` when nothing truthful could be said.
 */
export function buildNativeCommonPset(
    psetName: string,
    element: CommonPsetSource,
    extra: Record<string, string | number | boolean | undefined> = {},
): PropertySet | null {
    const properties: PropertyValue[] = [];

    // Status — always emitted. An authoring tool's default really is new
    // construction, and `Pset_*Common.Status` is the one property downstream
    // checkers treat as mandatory. This is the same default Pipeline B applies.
    const status = statusFromPhase(element.properties?.phase) ?? 'NEW';
    properties.push({ name: 'Status', value: status, type: 'label' });

    // Reference — the TYPE reference. `systemTypeId` is the authored wall/slab
    // system; `properties.mark` is the instance mark. Prefer the type.
    const reference = element.systemTypeId ?? element.properties?.mark;
    if (typeof reference === 'string' && reference.length > 0) {
        properties.push({ name: 'Reference', value: reference, type: 'label' });
    }

    // FireRating — real on Door and Window (`fireRating`), absent on Wall.
    if (typeof element.fireRating === 'string' && element.fireRating.length > 0) {
        properties.push({ name: 'FireRating', value: element.fireRating, type: 'label' });
    }

    for (const [name, value] of Object.entries(extra)) {
        if (value === undefined || value === null) continue;
        properties.push({
            name,
            value,
            type: typeof value === 'boolean' ? 'boolean'
                : typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'real')
                : 'label',
        });
    }

    return properties.length > 0 ? { name: psetName, properties } : null;
}

/**
 * Resolve the `Pset_*Common` for an element that may be imported OR native.
 *
 * An imported element's round-tripped `psetCommon` WINS — losing a property a
 * consultant authored upstream would be a round-trip regression. Native
 * properties fill the gaps it leaves rather than replacing it, so an import that
 * carried only `IsExternal` still gains a `Status`.
 */
export function resolveCommonPset(
    psetName: string,
    element: CommonPsetSource,
    extra: Record<string, string | number | boolean | undefined> = {},
): PropertySet | null {
    const native = buildNativeCommonPset(psetName, element, extra);
    const imported = (element.ifcData as { psetCommon?: Record<string, unknown> } | undefined)?.psetCommon;

    if (!imported || Object.keys(imported).length === 0) return native;

    const merged: PropertyValue[] = [];
    const seen = new Set<string>();
    for (const [name, value] of Object.entries(imported)) {
        if (value === undefined || value === null || typeof value === 'object') continue;
        seen.add(name);
        merged.push({
            name,
            value: value as string | number | boolean,
            type: typeof value === 'boolean' ? 'boolean'
                : typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'real')
                : 'label',
        });
    }
    for (const p of native?.properties ?? []) {
        if (!seen.has(p.name)) merged.push(p);
    }

    return merged.length > 0 ? { name: psetName, properties: merged } : null;
}
