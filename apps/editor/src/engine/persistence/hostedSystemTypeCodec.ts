/**
 * hostedSystemTypeCodec — §TYPE-SNAPSHOT-CODEC for door + window types (C65 §3.1)
 * ===============================================================================
 *
 * The door/window sibling of `wallSystemTypeCodec.ts`, and it exists for the same
 * reason: ONE codec used by BOTH `ProjectSerializer` and `ProjectLoader`, so save
 * and load cannot drift field-by-field. Before this file the save side wrote
 * `structuredClone(t)` (the whole record) and the load side spread `{ ...raw,
 * isBuiltIn: false }` after checking only `id` and `name` — nearly symmetric, but
 * stated in two places, with the validation and the isBuiltIn policy owned by
 * neither. C65 declares authoring for a family only against a shared codec, so
 * door/window get theirs before the "Duplicate Type…" entry ships.
 *
 * SHAPE POLICY — whole-record carrier, not a field list. A hosted-opening type is
 * a finish/dimension record (`DoorSystemType` / `WindowSystemType`) whose optional
 * ride-along fields (dimensions, defaultSegments, sidelight, tags, ifcTypeName)
 * all round-trip verbatim. A hand-written field list here would recreate the
 * `function`-drop defect (L-285) one field at a time; the codec instead carries
 * everything and OWNS the identity policy:
 *   - `isBuiltIn` is FORCED false on decode — a snapshot may not smuggle a record
 *     into the immutable built-in tier (built-ins are factory data, C05).
 *   - `metadata` is carried verbatim when present (provenance is user data).
 *
 * §CONTEXT-DATA-HONESTY — `decodeHostedSystemType` returns `null` for a record
 * that cannot be trusted as a type of its family, and does NOT repair it into a
 * plausible default. The caller reports the skip; the doors referencing it then
 * surface the explicit missing-type state (C65 §3.4), never a silent fallback.
 */

// §OUTLINE81 (SPEC-WINDOW-CUSTOM-OUTLINE D6) — THE one ring predicate + its tolerant reader,
// from the pure subpath (L-11261 import discipline). The codec asks the same question every
// other surface asks; it does not re-derive what a valid ring is.
import { resolveCustomOutlineInput, validateCustomOutline } from '@pryzm/geometry-wall/opening-profile';

/** The two hosted-opening families this codec serves. */
export type HostedTypeFamily = 'door' | 'window';

/**
 * §OUTLINE81 (D6/D12) — which families may carry a `customOutline` shape TEMPLATE on the type.
 * Doors are excluded by decision (D12: a door is a floor notch; `notchWalk` assumes two feet),
 * so a door-type snapshot carrying a ring is malformed data, not a future feature.
 */
const SUPPORTS_OUTLINE_TEMPLATE: Record<HostedTypeFamily, boolean> = {
    door:   false,
    window: true,
};

/**
 * The finish slots a record MUST carry to be usable by its family's builder.
 * (Door: frame + leaf. Window: frame + sill. Glazing is an opacity, not a slot.)
 */
const REQUIRED_FINISH_KEYS: Record<HostedTypeFamily, readonly string[]> = {
    door:   ['frameFinish', 'leafFinish'],
    window: ['frameFinish', 'sillFinish'],
};

/**
 * SAVE side. Projects a live store record onto the snapshot wire shape.
 * Whole-record: everything a user can author (or a duplicate can carry) rides.
 * structuredClone — store records may be frozen; the snapshot owns mutable copies.
 */
export function encodeHostedSystemType(type: { id: string; name: string }): Record<string, unknown> {
    return structuredClone(type) as unknown as Record<string, unknown>;
}

/**
 * LOAD side. Validates and projects a snapshot record onto the shape the
 * family's store `add()` accepts (a full record carrying its own id).
 *
 * Returns `null` — and does NOT repair — when the record cannot be trusted.
 */
export function decodeHostedSystemType(
    raw: unknown,
    family: HostedTypeFamily,
): Record<string, unknown> | null {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const r = raw as Record<string, any>;

    if (typeof r.id !== 'string' || r.id.length === 0)     return null;
    if (typeof r.name !== 'string' || r.name.length === 0) return null;

    for (const key of REQUIRED_FINISH_KEYS[family]) {
        const finish = r[key];
        if (!finish || typeof finish !== 'object' || typeof finish.materialColor !== 'string') {
            return null;
        }
    }
    // Present-but-wrong is malformed; absent is allowed (the builder defaults).
    if (r.glazingOpacity !== undefined && typeof r.glazingOpacity !== 'number') return null;

    // §OUTLINE81 (D6) — same policy for the shape template: absent is allowed; present must be
    // a ring THE one predicate accepts (a snapshot may not smuggle in a ring the type editor's
    // own commit gate would refuse), and only on a family that supports the template (D12).
    if (r.customOutline !== undefined) {
        if (!SUPPORTS_OUTLINE_TEMPLATE[family]) return null;
        if (validateCustomOutline(resolveCustomOutlineInput(r.customOutline)) !== null) return null;
    }

    return {
        ...(structuredClone(raw) as Record<string, unknown>),
        // Identity policy: a snapshot record is ALWAYS a custom (T2) type.
        isBuiltIn: false,
    };
}
