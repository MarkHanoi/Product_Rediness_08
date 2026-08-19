/**
 * §FEAT-HANDRAIL-TYPE-PROJECTION (L-1105, C95 §15.12) — WHAT IT MEANS TO APPLY A
 * RAILING TYPE, SAID ONCE.
 *
 * ─── THE PROBLEM THIS CLOSES ────────────────────────────────────────────────
 * `HandrailData` carries no `typeId`. A railing type is therefore MATERIALISED —
 * applying "Frameless Glass Balustrade" means reading the definition and copying
 * THIRTEEN fields onto the record. That projection existed in exactly one place:
 * inside `RailingTypeSelectorWidget`, a DOM widget's click handler.
 *
 * So the capability was reachable from the property panel and from nowhere else.
 * The bus verb `element.changeType` had a railing branch, but it forwarded only
 * the fields a caller happened to name — which means chat, collaboration replay
 * and any future automation had to re-derive the same thirteen fields themselves
 * to say the thing a user says in four words: *"make it frameless glass"*. A
 * second derivation is a second answer, and the two drift (C84 EI-9).
 *
 * ─── THE SHAPE, AND WHY THIS ONE ────────────────────────────────────────────
 * ⭐ THIS IS `resolveStairRailingTypeFields` (geometry-stair), APPLIED TO
 * HANDRAIL. That function already turns ONE `HandrailTypeDefinition` into the
 * construction-form fields a stair railing needs, and `initBusHandlers`' stair
 * branch resolves from `newTypeId` ALONE because of it. Handrail now does the
 * same, so two closely-related families share one idiom instead of each having
 * its own (C84 EI-8). The alternative — materialising thirteen fields into a chat
 * payload — puts the catalogue's meaning in the caller, where it cannot be kept
 * true.
 *
 * The payload for a type change is now `{ elementId, elementType, newTypeId }`.
 * Explicit fields still override, so a caller may adjust ONE dimension without
 * inventing a type.
 *
 * ⛔ THE `null` IN `materialColor` IS LOAD-BEARING. DO NOT "TIDY" IT TO
 * `undefined`, AND DO NOT DROP IT WHEN THE DEFINITION IS SILENT.
 * `UpdateHandrailCommand` treats `undefined` as *"leave this field alone"* and
 * `null` as *"CLEAR it"*. A catalogue type carries a `materialId` and NO hex
 * (C100 §2.1 forbids the hex by name — this family shipped that breach once, at
 * 10513bf4). If a railing is carrying a user's hex override and the projection
 * omits `materialColor`, the override SURVIVES the retype and permanently shadows
 * the new type's material: the user asks for frameless glass, the record says
 * frameless glass, and the render stays the old colour forever. That is a silent
 * wrong answer, the worst class. `?? null` is what makes the retype actually
 * change what the user sees.
 *
 * CONTRACTS: C100 §2.1 (a type REFERENCES a material, never carries a hex) ·
 * C84 EI-4a (one route per intent) / EI-8 / EI-9 (one vocabulary, one answer) ·
 * C95 §15.9 (panel and RAC, one authority per capability) · C16 (command
 * authoring).
 */

/**
 * The shape this projection reads. Structural, not an import of the store's
 * class, so the function stays a pure mapping with no store dependency — and so
 * a test can hand it a definition without booting a catalogue.
 */
export interface HandrailTypeLike {
    readonly id: string;
    readonly name?: string;
    readonly height: number;
    readonly thickness: number;
    readonly baseOffset: number;
    readonly fillType?: string;
    readonly railProfile?: string;
    readonly railDiameter?: number;
    readonly postSpacing?: number;
    readonly balusterShape?: 'rectangular' | 'round';
    readonly balusterWidth?: number;
    readonly balusterSpacing?: number;
    readonly infillMaxGap?: number;
    readonly materialId?: string;
    readonly materialColor?: string;
}

/**
 * The record fields a railing type materialises into.
 *
 * `materialColor` is `string | null` and NEVER optional — see the header. Every
 * other field mirrors `HandrailData`'s own optionality: a definition that is
 * silent about `railDiameter` leaves the railing's alone.
 */
export interface HandrailTypeFields {
    typeId: string;
    height: number;
    thickness: number;
    baseOffset: number;
    fillType?: string;
    railProfile?: string;
    railDiameter?: number;
    postSpacing?: number;
    balusterShape?: 'rectangular' | 'round';
    balusterWidth?: number;
    balusterSpacing?: number;
    infillMaxGap?: number;
    materialId?: string;
    /**
     * ⛔ `null` CLEARS a user's hex override. NOT optional, NOT `undefined`.
     * See the module header — dropping this makes the old colour shadow the new
     * material forever.
     */
    materialColor: string | null;
}

/**
 * THE ONE PROJECTION: a railing type definition → the fields that ARE that type
 * on a `HandrailData` record.
 *
 * Every caller that applies a railing type — the property panel widget, the
 * `element.changeType` bus branch, RAC, collaboration replay — calls this. There
 * is deliberately no second copy to keep in sync.
 */
export function resolveHandrailTypeFields(def: HandrailTypeLike): HandrailTypeFields {
    return {
        typeId: def.id,
        height: def.height,
        thickness: def.thickness,
        baseOffset: def.baseOffset,
        fillType: def.fillType,
        railProfile: def.railProfile,
        railDiameter: def.railDiameter,
        postSpacing: def.postSpacing,
        balusterShape: def.balusterShape,
        balusterWidth: def.balusterWidth,
        balusterSpacing: def.balusterSpacing,
        infillMaxGap: def.infillMaxGap,
        // §C100-HANDRAIL-MATERIAL-ID — the type moves the REFERENCE …
        materialId: def.materialId,
        // … and CLEARS the override, so the reference is what the render resolves.
        materialColor: def.materialColor ?? null,
    };
}

/**
 * The field names this projection writes, for tests and for anything that has to
 * enumerate them (a diff, a conflict report). Derived from one call rather than
 * hand-listed, so it cannot fall behind the projection itself.
 */
export const HANDRAIL_TYPE_FIELD_NAMES: ReadonlyArray<keyof HandrailTypeFields> = Object.keys(
    resolveHandrailTypeFields({ id: '', height: 0, thickness: 0, baseOffset: 0 }),
) as Array<keyof HandrailTypeFields>;
