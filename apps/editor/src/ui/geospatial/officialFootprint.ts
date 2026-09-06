// ─────────────────────────────────────────────────────────────────────────────
// §OFFICIAL-FOOTPRINTS — client (L-12939, 2026-09-05, lane ES-CATASTRO-FOOTPRINTS)
//
// Reads the national-register facts a `footprints=official` bake writes into the buildings tiles,
// and decides which surface draws which feature.
//
// THE PROBLEM. Spain's Dirección General del Catastro publishes one **BuildingPart per volume**,
// each with its own storey count — that is what the Catastro "Visor 3D" draws, and it is what the
// founder asked for on 2026-09-05 looking at his own house (CL Isla Lanzarote 4, Córdoba, refcat
// 1950501UG4915S: four parts at 0, 2, 3 and 2 storeys under one 320 m² outline). The bake emits
// BOTH: one feature per part AND one whole-building outline. If both are drawn in the same place
// they z-fight, and the outline — a single prism at max(parts) — flattens exactly the per-volume
// articulation the parts were fetched for.
//
// So the two surfaces want OPPOSITE halves of the same data, and the split is not a preference:
//   • The **3D massing** wants the PARTS. A 2-storey wing beside a 3-storey block must read as two
//     volumes. Drawing the outline too would bury them inside one 3-storey box.
//   • The **2D plan** wants the OUTLINE. A plan drawn from parts shows the internal division lines
//     of every building as if they were separate structures — a masterplan drawing full of seams
//     that do not exist on the ground.
//
// PURE + framework-free ON PURPOSE: no cesium, no maplibre, no three. Both viewports call the same
// two functions, so the halves can never drift into drawing the same footprint twice.
//
// ⚠ WHAT THIS MODULE DOES NOT DO. It does not resolve a HEIGHT. The register publishes storey
// COUNTS, and the bake writes them to `building:levels` — deliberately NOT to `height`, because
// `resolveHeightWithProvenance` reads a `height` tag as provenance `tagged` ("a surveyed-ish
// number") and a floors-derived metre value is not a survey (C58 §1.4). An official part therefore
// resolves through the EXISTING `derived-levels` rung with the client's single METRES_PER_LEVEL
// constant, exactly like an OSM footprint carrying `building:levels`. One storey constant in the
// renderer, one provenance ladder, no special case.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The tag keys an official footprint carries. MIRRORS `OFFICIAL_TAGS` in
 * `tools/context-bake/footprints/officialFootprints.mjs` — the producing half. Both sides hold
 * their own copy (one is `.mjs` build tooling, one is client TypeScript; neither can import the
 * other), and `officialFootprint.test.ts` pins this table against the bake's so a rename that
 * reaches only one side fails a test rather than silently shipping tiles nothing reads.
 */
export const OFFICIAL_TAGS = {
    source: 'pryzm:source',
    ref: 'pryzm:ref',
    part: 'pryzm:part',
    floorsKind: 'pryzm:floors_kind',
    heightM: 'pryzm:height_floors_m',
    heightKind: 'pryzm:height_kind',
    built: 'pryzm:built',
    condition: 'pryzm:condition',
} as const;

/** Which national register a footprint came from. Never a bare "official". */
export type OfficialFootprintSource = 'es_catastro' | 'fr_bdtopo';

/**
 * HOW the storey count was arrived at.
 * - `register`     — read from the register's own field (Catastro BuildingPart).
 * - `max-of-parts` — DERIVED by the bake as the max over the building's parts, because Catastro
 *                    publishes `numberOfFloorsAboveGround` as nil on every Building. A derived
 *                    number, labelled as one; never presented as a register field.
 */
export type OfficialFloorsKind = 'register' | 'max-of-parts';

export interface OfficialFootprintFacts {
    readonly source: OfficialFootprintSource;
    /** The register's own identifier — ES: the 14-character cadastral reference. */
    readonly ref?: string;
    /** `true` = one volume of a building; `false` = the whole-building outline. */
    readonly part: boolean;
    /** Storey count above ground. **`0` is a REAL value** (a patio), never "unknown". */
    readonly floors?: number;
    readonly floorsBelow?: number;
    readonly floorsKind?: OfficialFloorsKind;
    /** The bake's own `floors × 3.0` metres. Labelled by `heightKind`; NOT a measurement. */
    readonly heightM?: number;
    readonly heightKind?: string;
    readonly built?: number;
    readonly condition?: string;
}

const num = (v: string | undefined): number | undefined => {
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
};

const isSource = (v: string | undefined): v is OfficialFootprintSource =>
    v === 'es_catastro' || v === 'fr_bdtopo';

/**
 * Read the official-register facts off a tile feature's tags, or `undefined` when the footprint is
 * not from a register (an OSM footprint, which is the overwhelming majority everywhere the swap
 * has not run — and the honest answer for the Basque foral cadastres and Navarra, which publish no
 * ES.SDGC feed at all). PURE.
 *
 * ⚠ An UNRECOGNISED source value returns `undefined` rather than being passed through. A tag we
 * cannot name is not a provenance, and presenting one as if it were is how "official" becomes a
 * word that means nothing.
 */
export function readOfficialFootprint(
    tags: Record<string, string> | undefined,
): OfficialFootprintFacts | undefined {
    if (!tags) return undefined;
    const source = tags[OFFICIAL_TAGS.source];
    if (!isSource(source)) return undefined;
    const floorsKind = tags[OFFICIAL_TAGS.floorsKind];
    return {
        source,
        ...(tags[OFFICIAL_TAGS.ref] ? { ref: tags[OFFICIAL_TAGS.ref] } : {}),
        // The bake writes 'true' / 'false' explicitly. Anything else is treated as an OUTLINE,
        // which is the safe default: an unrecognised feature drawn on the plan is visible and
        // wrong-looking, where one silently promoted to a 3D part would just vanish into a mass.
        part: tags[OFFICIAL_TAGS.part] === 'true',
        // §FLOORS-FROM-LEVELS — the count lives on the standard `building:levels` tag, so the
        // existing height ladder consumes it with no special case. Read it from there, not from a
        // PRYZM-specific key, or the two could disagree about the same building.
        ...(num(tags['building:levels']) !== undefined ? { floors: num(tags['building:levels']) } : {}),
        ...(num(tags['building:levels:underground']) !== undefined
            ? { floorsBelow: num(tags['building:levels:underground']) } : {}),
        ...(floorsKind === 'register' || floorsKind === 'max-of-parts' ? { floorsKind } : {}),
        ...(num(tags[OFFICIAL_TAGS.heightM]) !== undefined ? { heightM: num(tags[OFFICIAL_TAGS.heightM]) } : {}),
        ...(tags[OFFICIAL_TAGS.heightKind] ? { heightKind: tags[OFFICIAL_TAGS.heightKind] } : {}),
        ...(num(tags[OFFICIAL_TAGS.built]) !== undefined ? { built: num(tags[OFFICIAL_TAGS.built]) } : {}),
        ...(tags[OFFICIAL_TAGS.condition] ? { condition: tags[OFFICIAL_TAGS.condition] } : {}),
    };
}

/** A feature carrying just enough for the two draw predicates. */
export interface OfficialTagged {
    readonly official?: OfficialFootprintFacts;
}

/**
 * Should the 3D massing extrude this footprint?
 *
 * NOT official → yes (every OSM footprint behaves exactly as it always has).
 * Official PART → yes — this is the per-volume articulation the register was fetched for.
 * Official OUTLINE → **no**, because its own parts are being drawn instead. Drawing both puts a
 * single max(parts)-tall prism over the parts: z-fighting, and the articulation flattened.
 *
 * ⚠ THE ONE EXCEPTION, AND IT IS NOT COSMETIC. A building with NO parts (`hasParts` false) must
 * still be extruded from its outline — otherwise it disappears from the 3D scene entirely. A
 * missing neighbour silently deletes a shadow, a party wall and a view obstruction from a study,
 * which is worse than drawing it slightly wrong. Callers pass `hasParts` from the actual feature
 * set they hold, never from an assumption that every outline has parts.
 */
export function shouldExtrudeInMassing(
    facts: OfficialFootprintFacts | undefined,
    hasParts: boolean,
): boolean {
    if (!facts) return true;
    if (facts.part) return true;
    return !hasParts;
}

/**
 * Should the 2D plan draw this footprint? Official OUTLINES and OSM footprints, never official
 * PARTS — a plan drawn from parts shows every building's internal divisions as separate structures.
 */
export function shouldDrawInPlan(facts: OfficialFootprintFacts | undefined): boolean {
    return !facts || !facts.part;
}

/**
 * The set of refs for which at least one PART exists. Callers build it once per collection and
 * pass membership into `shouldExtrudeInMassing`, so the "no parts ⇒ still extrude the outline"
 * rule is answered from the data rather than assumed.
 */
export function refsWithParts(items: readonly OfficialTagged[]): Set<string> {
    const refs = new Set<string>();
    for (const it of items) {
        const f = it.official;
        if (f?.part && f.ref) refs.add(f.ref);
    }
    return refs;
}

/**
 * The one-line summary the founder reads to know the register actually landed. Counts are
 * SEPARATED BY SOURCE (C57 §1.9) — "N official part(s) of M building(s) + K OSM-only" — because a
 * single total cannot distinguish "the swap worked" from "we are still drawing OSM".
 */
export function summariseOfficialFootprints(items: readonly OfficialTagged[]): {
    parts: number; buildings: number; osmOnly: number; sources: string[]; line: string;
} {
    let parts = 0, buildings = 0, osmOnly = 0;
    const sources = new Set<string>();
    for (const it of items) {
        const f = it.official;
        if (!f) { osmOnly++; continue; }
        sources.add(f.source);
        if (f.part) parts++; else buildings++;
    }
    const src = [...sources].sort();
    return {
        parts, buildings, osmOnly, sources: src,
        line: `${parts} official part(s) of ${buildings} building(s) + ${osmOnly} OSM-only`
            + (src.length ? ` [${src.join(', ')}]` : ''),
    };
}
