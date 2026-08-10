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

/** The two hosted-opening families this codec serves. */
export type HostedTypeFamily = 'door' | 'window';

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

    return {
        ...(structuredClone(raw) as Record<string, unknown>),
        // Identity policy: a snapshot record is ALWAYS a custom (T2) type.
        isBuiltIn: false,
    };
}
