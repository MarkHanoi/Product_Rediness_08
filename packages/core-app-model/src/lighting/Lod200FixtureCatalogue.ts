/**
 * @file Lod200FixtureCatalogue.ts
 * §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19)
 *
 * The LOD-200 luminaire matrix: twenty generic fixture families, each authored as
 * a SHORT ROW OF INDEPENDENT FACTS with every other field DERIVED.
 *
 * ── Why a matrix and not twenty hand-written definitions ────────────────────
 *
 * The twelve pre-existing fixture families are spelled out four times over — a
 * union member in `LightingTypes.ts` (×3 duplicate copies), a `*_DEFAULTS`
 * const, a `LIGHTING_FIXTURE_PHOTOMETRY` row, and a `BUILT_IN_LIGHTING_TYPES`
 * row — so a thirteenth family added by hand can arrive missing any one of them
 * and nothing says so until a renderer reads `undefined`. That is this repo's
 * most-repeated defect shape: AN ENUMERATED LIST THAT MUST BE REMEMBERED RATHER
 * THAN DERIVED.
 *
 * This file is the HR5 handrail resolution applied to luminaires. A row states
 * only what cannot be computed:
 *
 *     id · name · use · archetype · mount · location · lumens · watts ·
 *     kelvin · cri · beamAngleDeg · ipRating · bodyMaterialId · dimensions
 *
 * and EVERYTHING else falls out of it:
 *
 *   • `reachM`            ← inverse-square from `lumens` (see {@link reachForLumens})
 *   • `form`              ← plan aspect ratio of the emitting face
 *   • `efficacyLmPerW`    ← `lumens / watts`
 *   • `efficacyClass`     ← archetype + emergency duty + size + output
 *   • construction form   ← `constructionFormFor()` (already derived, unchanged)
 *   • floor-mounted set   ← `mount === 'floor'`
 *   • the photometry row  ← {@link photometryRowsForLod200}
 *   • the catalogue row   ← {@link lod200TypeDefinitionRows}
 *   • the 3-D mass        ← `archetype` + dimensions, in LightingFragmentBuilder
 *
 * Adding a twenty-first luminaire is ONE ROW. It cannot arrive missing a field,
 * because there are no other fields to miss.
 *
 * ── LOD 200, stated as a limit rather than implied ──────────────────────────
 *
 * LOD 200 is "a generic system with approximate quantities, size, shape, location
 * and orientation". These rows are therefore GENERIC FAMILIES — a recessed
 * downlight, a troffer, a bollard — not manufacturer products. Consequences that
 * are deliberate, not omissions:
 *
 *   ⛔ NO IES / photometric data file. There is no such field, no such loader and
 *      no such capability anywhere in this repository. A beam angle and a lumen
 *      output are the LOD-200 photometric facts; an IES distribution is LOD 350+
 *      and claiming one would be a capability that does not exist.
 *   ⛔ NO glare rating (UGR), no maintenance factor, no lamp-lumen depreciation,
 *      no driver/dimming protocol, no circuit or emergency-battery duration.
 *      NOT YET — the schema has no field for any of them.
 *
 * ── Materials: referenced, never minted, never a hand-typed hex ─────────────
 *
 * Every row names an EXISTING `MATERIAL_CATALOG` id (C100/C84 §1.1). No row
 * carries a hex colour: a hand-typed hex resolves BEFORE the material id in
 * every builder in this repo, which silently turns every later material pick
 * into a no-op that the UI still reports as applied. The body colour is
 * therefore RESOLVED from the catalogue at build time by
 * {@link lod200BodyColor}, and a row naming a non-existent id fails a test.
 *
 * ── Purity ─────────────────────────────────────────────────────────────────
 *
 * No THREE, no DOM, no I/O. The single import is the material catalogue, which
 * is itself a pure L0 data module.
 */

import { findMaterialRecord } from '@pryzm/schemas/materials';

// ── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * The LOD-200 generic MASS a fixture is drawn as. This is the only geometry
 * input a row carries: `LightingFragmentBuilder` has one builder per archetype,
 * so twenty families share seven masses rather than needing twenty bespoke
 * builders (which would be the enumerated-list defect wearing a different hat).
 *
 *   can    — cylindrical body, optional trim ring, lens at the mouth; optionally
 *            recessed into its host plane and optionally on a short stem.
 *   bar    — rectangular body with a lens face; the workhorse. Covers recessed
 *            slots, surface battens, panels, coves (face up), under-cabinet
 *            strips, suspended linears and wall boxes, by varying the face
 *            direction, the recess flag and the drop.
 *   disc   — shallow flush disc/oyster with a domed lens.
 *   cone   — truncated-cone reflector (high bay).
 *   post   — vertical cylinder with a luminous head band (bollard).
 *   arms   — canopy + stem + N radial arms carrying small lenses (chandelier).
 *   yoke   — base plate + U-bracket + barrel (adjustable floodlight).
 *   sign   — flat internally-illuminated panel (exit sign).
 */
export type Lod200Archetype = 'can' | 'bar' | 'disc' | 'cone' | 'post' | 'arms' | 'yoke' | 'sign';

/**
 * Which way the luminous face points, in the fixture's own frame. Drives where
 * the lens mesh and the emitter anchor sit; `up` is what makes a cove read as
 * indirect rather than as an upside-down batten.
 */
export type Lod200Face = 'down' | 'up' | 'updown' | 'front';

/**
 * Where the fixture may be installed. This DERIVES the minimum acceptable IP
 * rating (see {@link minIpForLocation}) rather than being checked by eye, which
 * is the field most likely to be silently wrong.
 */
export type Lod200Location = 'interior' | 'wet' | 'exterior';

/**
 * The lm/W band a fixture is judged against — DERIVED, never authored, so a row
 * cannot pick the flattering band for its own numbers. See {@link EFFICACY_BANDS}.
 */
export type Lod200EfficacyClass = 'architectural' | 'decorative' | 'miniature' | 'signalling';

/**
 * ONE authored row. Everything not on this interface is derived from it.
 *
 * ⚠ `readonly` throughout and the table is `Object.freeze`d: these are shared
 * definitions read by the renderer on every fixture build.
 */
export interface Lod200FixtureRow {
    /** The `LightingFixtureType` id this row mints. snake_case, stable, persisted. */
    readonly id: string;
    /** Human name for the type picker. */
    readonly name: string;
    /** One line: what an architect specifies this for. Becomes the description. */
    readonly use: string;
    /** The generic LOD-200 mass. */
    readonly archetype: Lod200Archetype;
    /** Mount plane — the SAME four-value vocabulary as `LightingMountClass`. */
    readonly mount: 'ceiling' | 'wall' | 'floor' | 'table';
    /** Which way the luminous face points. */
    readonly face: Lod200Face;
    /** True when the body sits INSIDE its host plane (ceiling void / wall build-up). */
    readonly recessed?: boolean;
    /** Cable/rod drop below the mount plane, mm. 0/absent = flush or surface. */
    readonly dropMm?: number;
    /** Where it may be installed — derives the minimum IP. */
    readonly location: Lod200Location;

    // ── Photometry: the datasheet facts ────────────────────────────────────
    /** Fixture luminous flux, lumens. The number on the box — NOT lamp lumens. */
    readonly lumens: number;
    /** Circuit watts, including driver. `lumens / watts` is the honesty check. */
    readonly watts: number;
    /** Correlated colour temperature, kelvin. */
    readonly kelvin: number;
    /** Colour Rendering Index, Ra. */
    readonly cri: number;
    /** Full beam angle, degrees. 360 = omnidirectional. */
    readonly beamAngleDeg: number;
    /** IP rating as a two-digit integer (20, 44, 65, 66…). */
    readonly ipRating: number;
    /**
     * ISO 30061 / EN 1838 emergency DUTY. Carried as a flag, never folded into
     * the construction taxonomy — a maintained-emergency downlight is still a
     * downlight (see `constructionFormFor`).
     */
    readonly isEmergency?: boolean;

    // ── Body: a catalogue id, never a colour ───────────────────────────────
    /** An EXISTING `MATERIAL_CATALOG` id. Never a hex. Never a new material. */
    readonly bodyMaterialId: string;

    // ── Generic size, millimetres ──────────────────────────────────────────
    /** Length, or DIAMETER for `can` / `disc` / `cone` / `post`. */
    readonly lMm: number;
    /** Width across the emitting face. Equals `lMm` for round archetypes. */
    readonly wMm: number;
    /** Depth/height of the body (into the ceiling for a recessed fixture). */
    readonly dMm: number;
    /** Radial arm count — `arms` archetype only. */
    readonly arms?: number;
    /** Stem length below the mount plane, mm — `can` on a track, `yoke` bracket. */
    readonly stemMm?: number;
}

// ── The twenty rows ─────────────────────────────────────────────────────────

/**
 * §FEAT-LOD200-LUMINAIRES — the twenty families.
 *
 * ── Why THESE twenty ───────────────────────────────────────────────────────
 *
 * The set is chosen to complete the way fixtures are actually SPECIFIED, given
 * what the catalogue already had. The twelve pre-existing families are almost
 * entirely DECORATIVE residential pieces — six pendants, three floor lamps, a
 * table lamp, a vanity strip and one surface canister. The catalogue could not
 * describe a single recessed fixture, had no panel, no track, no cove, no
 * exterior fixture and no life-safety fixture at all. So these twenty are the
 * ARCHITECTURAL and CODE-GOVERNED half that was missing, not more of the same.
 *
 * ── What was deliberately LEFT OUT, and why ────────────────────────────────
 *
 *   • pendant, linear pendant cluster, chandelier-adjacent decoratives, floor
 *     lamps, table lamps, vanity/mirror strips — ALREADY IN THE CATALOGUE
 *     (twelve families). Duplicating them at LOD 200 would create rival rows
 *     for one fixture, which is the exact drift this file exists to prevent.
 *   • TRACK RUN (as distinct from `track_head`) — a run is an ASSEMBLY: a track
 *     extrusion of user-chosen length carrying N heads at user-chosen positions.
 *     At LOD 200 that is N `track_head` instances plus a length parameter the
 *     placement tool has no UI for, and no layer in this repo composes multi-part
 *     luminaire assemblies. NOT YET — shipping it would be a row that nothing can
 *     place correctly.
 *   • Pool/immersion lights, in-ground uplights, gobo projectors, fibre-optic and
 *     neon-flex, tape light sold by the metre — specialist families whose defining
 *     parameter (immersion depth, run length by the metre) the schema has no field
 *     for. NOT YET, for the same reason.
 *
 * ── The numbers ────────────────────────────────────────────────────────────
 *
 * Every row is an ordinary mid-market LED luminaire, and every one is checked by
 * `Lod200FixtureCatalogue.test.ts` for a plausible lm/W band, a plausible CCT, a
 * plausible CRI and an IP rating adequate for its location. The efficacy check is
 * the one that matters: it is what makes a 6 W downlight rated at 3000 lm fail
 * the build instead of shipping.
 */
export const LOD200_FIXTURE_ROWS: readonly Lod200FixtureRow[] = Object.freeze([
    // ── Recessed architectural: the fixtures the catalogue could not describe ──
    {
        id: 'recessed_downlight', name: 'Recessed Downlight',
        use: 'Fixed recessed downlight — the general-lighting workhorse of any ceiling void.',
        archetype: 'can', mount: 'ceiling', face: 'down', recessed: true, location: 'interior',
        lumens: 900, watts: 10, kelvin: 3000, cri: 90, beamAngleDeg: 38, ipRating: 20,
        bodyMaterialId: 'aluminium-powder-coated-white', lMm: 100, wMm: 100, dMm: 90,
    },
    {
        id: 'adjustable_downlight', name: 'Adjustable Downlight',
        use: 'Gimbal recessed downlight aimed at art, joinery or a feature wall.',
        archetype: 'can', mount: 'ceiling', face: 'down', recessed: true, location: 'interior',
        lumens: 850, watts: 11, kelvin: 3000, cri: 90, beamAngleDeg: 24, ipRating: 20,
        bodyMaterialId: 'aluminium-powder-coated-dark', lMm: 100, wMm: 100, dMm: 110,
    },
    {
        id: 'wall_washer_recessed', name: 'Recessed Wall Washer',
        use: 'Asymmetric recessed downlight that grazes a wall evenly from top to bottom.',
        archetype: 'can', mount: 'ceiling', face: 'down', recessed: true, location: 'interior',
        lumens: 1200, watts: 14, kelvin: 3000, cri: 90, beamAngleDeg: 60, ipRating: 20,
        bodyMaterialId: 'aluminium-powder-coated-white', lMm: 110, wMm: 110, dMm: 110,
    },
    {
        id: 'recessed_linear', name: 'Recessed Linear Slot',
        use: 'Plaster-in linear slot — a continuous line of light with no visible housing.',
        archetype: 'bar', mount: 'ceiling', face: 'down', recessed: true, location: 'interior',
        lumens: 2800, watts: 24, kelvin: 4000, cri: 80, beamAngleDeg: 100, ipRating: 20,
        bodyMaterialId: 'aluminium-anodised-silver', lMm: 1200, wMm: 55, dMm: 75,
    },
    {
        id: 'troffer_panel', name: 'Troffer / Modular Panel',
        use: 'Recessed 600 × 600 modular panel for suspended-grid ceilings; the office staple.',
        archetype: 'bar', mount: 'ceiling', face: 'down', recessed: true, location: 'interior',
        lumens: 3600, watts: 30, kelvin: 4000, cri: 80, beamAngleDeg: 110, ipRating: 20,
        bodyMaterialId: 'aluminium-powder-coated-white', lMm: 600, wMm: 600, dMm: 30,
    },

    // ── Surface & suspended architectural ─────────────────────────────────────
    {
        id: 'surface_linear', name: 'Surface Linear Batten',
        use: 'Surface-mounted linear batten where there is no ceiling void — plant, stores, garages.',
        archetype: 'bar', mount: 'ceiling', face: 'down', location: 'interior',
        lumens: 3600, watts: 30, kelvin: 4000, cri: 80, beamAngleDeg: 120, ipRating: 20,
        bodyMaterialId: 'aluminium-powder-coated-white', lMm: 1500, wMm: 60, dMm: 60,
    },
    {
        id: 'linear_pendant', name: 'Linear Pendant',
        use: 'Suspended direct/indirect linear over a desk run or a long dining table.',
        archetype: 'bar', mount: 'ceiling', face: 'updown', dropMm: 700, location: 'interior',
        lumens: 4200, watts: 38, kelvin: 4000, cri: 90, beamAngleDeg: 110, ipRating: 20,
        bodyMaterialId: 'aluminium-powder-coated-white', lMm: 1500, wMm: 70, dMm: 70,
    },
    {
        id: 'surface_ceiling_disc', name: 'Surface Ceiling Disc',
        use: 'Flush circular oyster for corridors, utility rooms and low ceilings.',
        archetype: 'disc', mount: 'ceiling', face: 'down', location: 'wet',
        lumens: 1600, watts: 16, kelvin: 3000, cri: 80, beamAngleDeg: 120, ipRating: 44,
        bodyMaterialId: 'plastic-white', lMm: 300, wMm: 300, dMm: 60,
    },
    {
        id: 'cove_indirect', name: 'Cove / Indirect Uplight',
        use: 'Concealed uplight in a perimeter cove — lights the ceiling, never the eye.',
        archetype: 'bar', mount: 'ceiling', face: 'up', location: 'interior',
        lumens: 1100, watts: 11, kelvin: 2700, cri: 90, beamAngleDeg: 120, ipRating: 20,
        bodyMaterialId: 'aluminium-anodised-silver', lMm: 1000, wMm: 35, dMm: 35,
    },
    {
        id: 'undercabinet_strip', name: 'Under-Cabinet Strip',
        use: 'Task strip under a wall unit, lighting the worktop rather than the room.',
        archetype: 'bar', mount: 'wall', face: 'down', location: 'interior',
        lumens: 550, watts: 6, kelvin: 3000, cri: 90, beamAngleDeg: 120, ipRating: 20,
        bodyMaterialId: 'aluminium-anodised-silver', lMm: 600, wMm: 25, dMm: 20,
    },
    {
        id: 'track_head', name: 'Track Head',
        use: 'Adjustable track spot for retail, gallery and kitchen accenting.',
        archetype: 'can', mount: 'ceiling', face: 'down', stemMm: 90, location: 'interior',
        lumens: 1100, watts: 13, kelvin: 3000, cri: 95, beamAngleDeg: 25, ipRating: 20,
        bodyMaterialId: 'steel-blackened', lMm: 65, wMm: 65, dMm: 130,
    },
    {
        id: 'high_bay', name: 'High Bay',
        use: 'Industrial high-bay reflector for double-height plant, warehouse and garage volumes.',
        archetype: 'cone', mount: 'ceiling', face: 'down', dropMm: 500, location: 'exterior',
        lumens: 22000, watts: 150, kelvin: 5000, cri: 80, beamAngleDeg: 90, ipRating: 65,
        bodyMaterialId: 'aluminium-anodised-silver', lMm: 400, wMm: 400, dMm: 220,
    },

    // ── Wall-mounted ─────────────────────────────────────────────────────────
    {
        id: 'wall_sconce_up_down', name: 'Up/Down Wall Sconce',
        use: 'Architectural wall box throwing a cone up and a cone down — stairs, terraces, halls.',
        archetype: 'bar', mount: 'wall', face: 'updown', location: 'wet',
        lumens: 700, watts: 8, kelvin: 3000, cri: 90, beamAngleDeg: 60, ipRating: 44,
        bodyMaterialId: 'aluminium-powder-coated-dark', lMm: 90, wMm: 90, dMm: 100,
    },
    {
        id: 'chandelier_decorative', name: 'Decorative Chandelier',
        use: 'Multi-arm decorative centrepiece for a stair void, dining room or reception.',
        archetype: 'arms', mount: 'ceiling', face: 'down', dropMm: 700, location: 'interior',
        lumens: 2400, watts: 36, kelvin: 2700, cri: 90, beamAngleDeg: 360, ipRating: 20,
        bodyMaterialId: 'brass-polished', lMm: 700, wMm: 700, dMm: 500, arms: 6,
    },

    // ── Life safety — EN 1838 / ISO 30061 duty; see §Advisory below ──────────
    {
        id: 'emergency_downlight', name: 'Emergency Downlight (Maintained)',
        use: 'Maintained emergency downlight on an escape route; runs on its own battery on mains failure.',
        archetype: 'can', mount: 'ceiling', face: 'down', recessed: true, location: 'interior',
        lumens: 180, watts: 4, kelvin: 6500, cri: 70, beamAngleDeg: 100, ipRating: 20,
        isEmergency: true,
        bodyMaterialId: 'aluminium-powder-coated-white', lMm: 90, wMm: 90, dMm: 100,
    },
    {
        id: 'exit_sign', name: 'Exit Sign (Internally Illuminated)',
        use: 'Internally illuminated escape-route sign carrying the ISO 7010 running-man pictogram.',
        archetype: 'sign', mount: 'ceiling', face: 'front', dropMm: 120, location: 'interior',
        lumens: 60, watts: 3, kelvin: 6500, cri: 70, beamAngleDeg: 180, ipRating: 20,
        isEmergency: true,
        bodyMaterialId: 'plastic-white', lMm: 340, wMm: 180, dMm: 30,
    },

    // ── Exterior ─────────────────────────────────────────────────────────────
    {
        id: 'step_marker_light', name: 'Step / Marker Light',
        use: 'Small recessed marker in a wall or riser, washing a stair tread or a path edge.',
        archetype: 'bar', mount: 'wall', face: 'down', recessed: true, location: 'exterior',
        lumens: 90, watts: 2, kelvin: 3000, cri: 80, beamAngleDeg: 60, ipRating: 65,
        bodyMaterialId: 'steel-stainless-brushed', lMm: 75, wMm: 75, dMm: 60,
    },
    {
        id: 'bollard_light', name: 'Bollard Light',
        use: 'Free-standing path bollard lighting a landscape route without lighting the sky.',
        archetype: 'post', mount: 'floor', face: 'down', location: 'exterior',
        lumens: 700, watts: 9, kelvin: 3000, cri: 80, beamAngleDeg: 120, ipRating: 65,
        bodyMaterialId: 'aluminium-powder-coated-dark', lMm: 110, wMm: 110, dMm: 900,
    },
    {
        id: 'exterior_wall_pack', name: 'Exterior Wall Pack',
        use: 'Building-mounted amenity/security light over a door, bin store or service yard.',
        archetype: 'bar', mount: 'wall', face: 'down', location: 'exterior',
        lumens: 2200, watts: 20, kelvin: 4000, cri: 70, beamAngleDeg: 120, ipRating: 65,
        bodyMaterialId: 'aluminium-powder-coated-dark', lMm: 250, wMm: 160, dMm: 130,
    },
    {
        id: 'flood_spot', name: 'Floodlight / Exterior Spot',
        use: 'Aimable floodlight on a yoke for façade washing, signage or a sports/parking apron.',
        archetype: 'yoke', mount: 'wall', face: 'front', stemMm: 60, location: 'exterior',
        lumens: 4500, watts: 40, kelvin: 4000, cri: 80, beamAngleDeg: 30, ipRating: 66,
        bodyMaterialId: 'aluminium-powder-coated-dark', lMm: 220, wMm: 180, dMm: 80,
    },
] as const satisfies readonly Lod200FixtureRow[]);

/**
 * The fixture ids this catalogue mints, as a UNION derived from the rows.
 *
 * This is what makes the whole thing one-line-extensible: `LightingFixtureType`
 * widens itself when a row is added, so the exhaustiveness test in
 * `FixturePhotometry.test.ts` (photometry table === fixture union) can never be
 * satisfied by a row that forgot its photometry — there is only one row.
 */
export type Lod200FixtureId = (typeof LOD200_FIXTURE_ROWS)[number]['id'];

/** Every LOD-200 id, as a runtime array. */
export const LOD200_FIXTURE_IDS: readonly Lod200FixtureId[] =
    Object.freeze(LOD200_FIXTURE_ROWS.map((r) => r.id as Lod200FixtureId));

/** Row lookup by id. `undefined` for the twelve pre-existing named families. */
export function lod200Row(id: string): Lod200FixtureRow | undefined {
    return LOD200_FIXTURE_ROWS.find((r) => r.id === id);
}

/**
 * DERIVED — the LOD-200 ids that stand on the floor, so
 * `FLOOR_MOUNTED_FIXTURES` never has to remember a new one. A bollard added to
 * the matrix seats itself on the floor plane; it cannot be silently hung from
 * the ceiling because someone forgot a second list.
 */
export const LOD200_FLOOR_MOUNTED_IDS: readonly Lod200FixtureId[] = Object.freeze(
    LOD200_FIXTURE_ROWS.filter((r) => r.mount === 'floor').map((r) => r.id as Lod200FixtureId),
);

// ── Derivations ─────────────────────────────────────────────────────────────

/**
 * §REACH-DERIVED — useful reach in metres, from luminous flux alone.
 *
 * A fixture's "reach" is the distance at which it still contributes usefully.
 * For an omnidirectional emitter, `E = I / d²` and `I = lm / 4π`, so the distance
 * at which illuminance falls to a chosen floor `E_min` is `d = √(lm / 4π·E_min)`.
 *
 * `E_min = 2 lx` is the floor used here: it is well below any amenity minimum
 * (EN 12464-1's lowest interior task figures start at 50 lx) but above the point
 * where a contribution stops being visible in a dark room, so it answers "where
 * does this luminaire stop mattering" rather than "where is it adequate".
 *
 * Clamped to [2.5 m, 9 m]: below 2.5 m a fixture would fail to light the room it
 * is standing in, and above 9 m the point light's attenuation window costs more
 * than it contributes. Rounded to 0.5 m so the value is legible in a schedule.
 *
 * Sanity against the twelve HAND-AUTHORED pre-existing rows, which this rule was
 * checked against rather than fitted to: 650 lm → 5.0 (authored 5.0), 800 lm →
 * 5.5 (authored 5.0–6.0), 450 lm → 4.0 (authored 3.5). It reproduces them to
 * within half a metre, which is why it is trusted for the new rows — but it is
 * NOT retro-applied to the old ones, because that would silently change the
 * render of every existing project.
 */
export function reachForLumens(lumens: number): number {
    const raw = Math.sqrt(Math.max(0, lumens) / (4 * Math.PI * 2));
    return Math.min(9, Math.max(2.5, Math.round(raw * 2) / 2));
}

/**
 * §FORM-DERIVED — a fixture is optically LINEAR when its emitting face is at
 * least three times longer than it is wide. That is the real property (an
 * extended luminous line casts a soft, wide-edged shadow where a compact source
 * casts a hard one), and it is what `constructionFormFor` classifies as a
 * `'strip'`. Deriving it means a 1.5 m batten cannot be authored as a point
 * source by an oversight.
 */
export function formForFace(lMm: number, wMm: number): 'point' | 'linear' {
    const long = Math.max(lMm, wMm);
    const short = Math.max(1, Math.min(lMm, wMm));
    return long / short >= 3 ? 'linear' : 'point';
}

/** Luminous efficacy, lm/W. The honesty check — see {@link EFFICACY_BANDS}. */
export function efficacyLmPerW(row: Lod200FixtureRow): number {
    return row.lumens / Math.max(0.1, row.watts);
}

/**
 * §EFFICACY-CLASS-DERIVED — which lm/W band this fixture is judged against.
 *
 * DERIVED from the row's own construction, never authored, so a row cannot
 * choose the lenient band to excuse its own numbers. The ordering is
 * deliberate: duty first (an emergency luminaire's efficacy is dominated by
 * battery charging, whatever its shape), then decorative construction (a fabric
 * or glass shade absorbs a third of the flux before it leaves the fixture), then
 * miniature optics (a 2 W step light's driver overhead swamps the LED), and
 * everything else is a straightforward architectural luminaire.
 */
export function efficacyClassFor(row: Lod200FixtureRow): Lod200EfficacyClass {
    if (row.isEmergency || row.archetype === 'sign') return 'signalling';
    if (row.archetype === 'arms') return 'decorative';
    if (Math.max(row.lMm, row.wMm) <= 100 && row.lumens < 200) return 'miniature';
    return 'architectural';
}

/**
 * §EFFICACY-BANDS — the plausible lm/W range per class, inclusive.
 *
 * These are ordinary mid-market LED figures. The point of the band is NOT to
 * grade a design; it is to catch the typo — a 6 W downlight authored at 3000 lm
 * (500 lm/W) is roughly twice the theoretical maximum efficacy of white light
 * and about four times any product on sale, so it is not a fixture, it is a
 * mistake, and the test fails the build rather than shipping it.
 *
 * ⚠ ADVISORY, not compliance. This is a plausibility bound on the FIXTURE, not
 * an energy-code check: nothing in this repository evaluates a lighting power
 * density limit, a code-mandated efficacy floor, or any other guard rule
 * (measured 2026-08-19 — no layer evaluates a compliance rule for any element
 * family). Do not read a passing test as conformance with any standard.
 */
export const EFFICACY_BANDS: Readonly<Record<Lod200EfficacyClass, readonly [number, number]>> =
    Object.freeze({
        /** General LED luminaires: driver + optic losses on a 120–200 lm/W package. */
        architectural: [65, 170],
        /** Shaded/decorative: the shade absorbs before the flux leaves the fixture. */
        decorative: [30, 110],
        /** Small-aperture optics where driver overhead dominates a low output. */
        miniature: [30, 95],
        /** Emergency + signage: battery charging and a tiny optic; low BY DESIGN. */
        signalling: [8, 50],
    });

/**
 * §IP-DERIVED — the minimum IP rating a location demands.
 *
 * IEC 60529 two-digit form. `interior` is a dry room (IP20 = finger-safe, no
 * water protection); `wet` is a bathroom/kitchen zone or a covered soffit (IP44 =
 * splashing water from any direction); `exterior` is fully weather-exposed
 * (IP65 = dust-tight and protected against jets).
 *
 * ⚠ ADVISORY. Real IP selection is zonal and jurisdictional — a bathroom zone 1
 * versus zone 2 differs, and the zone boundaries are set by national wiring
 * regulations (e.g. BS 7671 Section 701), none of which this repository holds or
 * evaluates. This function states a defensible FLOOR so a row cannot author an
 * IP20 bollard; it does not decide a real installation.
 */
export function minIpForLocation(location: Lod200Location): number {
    switch (location) {
        case 'exterior': return 65;
        case 'wet': return 44;
        default: return 20;
    }
}

/**
 * §MATERIAL-RESOLVED — the fixture body's colour, resolved from the C100 master
 * catalogue by id.
 *
 * ⛔ Never a hand-typed hex. In every builder in this repository an explicit
 * colour resolves BEFORE the material id, so a hex authored beside a material id
 * makes the material a silent no-op that the UI still reports as applied. The
 * row therefore carries ONLY the id and the colour is looked up here.
 *
 * Returns `null` when the id names nothing — the caller must then render the
 * C100 §5 unresolved marker rather than invent a colour. `Lod200FixtureCatalogue.test.ts`
 * asserts this never happens for a shipped row, against the LIVE catalogue.
 */
export function lod200BodyColor(bodyMaterialId: string): string | null {
    const rec = findMaterialRecord(bodyMaterialId);
    return rec ? rec.color : null;
}

/**
 * §GENERAL-LIGHTING-DERIVED — does this family's job involve LIGHTING A SPACE?
 *
 * ⭐ Why this predicate has to exist, and why it is DERIVED.
 *
 * Several long-standing invariants in this codebase are written as "EVERY fixture
 * family must be at least 2× the legacy flat intensity" / "every fixture must
 * dominate the scene's ambient floor". Those were true — and only true — while
 * every family in the catalogue was a room light of ≥ 450 lm.
 *
 * The LOD-200 set introduces the first fixtures whose PURPOSE is to be dim:
 *
 *   • `signalling` — maintained emergency luminaires and internally illuminated
 *     exit signs. EN 1838 asks for on the order of 1 lx on an escape-route centre
 *     line, roughly two orders of magnitude below an amenity level. An emergency
 *     luminaire bright enough to clear a general-lighting floor would be the
 *     DEFECT, not the fix.
 *   • `miniature`  — small-aperture MARKER optics such as a 2 W step light. Its
 *     job is to mark a position, not to illuminate the volume it sits in.
 *
 * So the invariants are re-scoped rather than relaxed: they still bind for every
 * fixture they were written about, and the excluded families get the assertion
 * that is actually true of them (they emit, and they emit LESS).
 *
 * ⚠ DERIVED from `efficacyClassFor`, never a lumen threshold chosen to make a test
 * pass — which is exactly how such an exclusion would rot into a place to hide a
 * family that simply came out too dim by mistake. The twelve pre-existing named
 * families have no LOD-200 row and are all room lights, so the original population
 * is preserved exactly.
 */
export function isGeneralLightingFixture(fixtureType: string): boolean {
    const row = lod200Row(fixtureType);
    if (!row) return true;
    const cls = efficacyClassFor(row);
    return cls === 'architectural' || cls === 'decorative';
}

/**
 * §MATERIAL-RESOLVED — the body's full PBR appearance from the C100 master row.
 *
 * Colour alone is not what makes a brushed-aluminium track head read differently
 * from a white plastic oyster; `metalness` and `roughness` are, and the master
 * catalogue already carries both. Taking all three from the one row means a
 * luminaire body cannot drift from the material it claims to be made of, and
 * that nothing here has to invent a shading value.
 *
 * Returns `null` for an unknown id — the caller renders the C100 §5 unresolved
 * marker rather than inventing an appearance.
 */
export function lod200BodyAppearance(
    bodyMaterialId: string,
): { color: string; metalness: number; roughness: number } | null {
    const rec = findMaterialRecord(bodyMaterialId);
    if (!rec) return null;
    return { color: rec.color, metalness: rec.metalness, roughness: rec.roughness };
}

/**
 * §PHOTOMETRY-DERIVED — the twenty photometry rows, computed from the matrix.
 *
 * Returned as a plain record so `LIGHTING_FIXTURE_PHOTOMETRY` can spread it
 * beside the twelve hand-authored families. Shape-compatible with
 * `FixturePhotometry` by construction; `FixturePhotometry.ts` owns the type and
 * asserts the assignment, so a drift in either direction is a compile error.
 */
export interface Lod200PhotometryRow {
    readonly lumens: number;
    readonly kelvin: number;
    readonly beamAngleDeg: number;
    readonly reachM: number;
    readonly mount: 'ceiling' | 'wall' | 'floor' | 'table';
    readonly form: 'point' | 'linear';
    readonly suspended?: boolean;
    readonly watts: number;
    readonly cri: number;
    readonly ipRating: number;
    readonly isEmergency?: boolean;
}

export function photometryRowsForLod200(): Record<Lod200FixtureId, Lod200PhotometryRow> {
    // Keyed as a loose record while it is built, then returned at the EXACT union
    // type: the twenty keys come from the twenty rows, so the assertion is a
    // statement about the loop, not a hole. The exhaustiveness of the result is
    // what lets `LIGHTING_FIXTURE_PHOTOMETRY` spread it and still typecheck as a
    // total `Record<LightingFixtureType, …>`.
    const out: Record<string, Lod200PhotometryRow> = {};
    for (const r of LOD200_FIXTURE_ROWS) {
        out[r.id] = {
            lumens: r.lumens,
            kelvin: r.kelvin,
            beamAngleDeg: r.beamAngleDeg,
            reachM: reachForLumens(r.lumens),
            mount: r.mount,
            form: formForFace(r.lMm, r.wMm),
            // Suspended is a DERIVED placement fact: it hangs if it has a drop.
            ...((r.dropMm ?? 0) > 0 ? { suspended: true } : {}),
            watts: r.watts,
            cri: r.cri,
            ipRating: r.ipRating,
            ...(r.isEmergency ? { isEmergency: true } : {}),
        };
    }
    return out as Record<Lod200FixtureId, Lod200PhotometryRow>;
}

/**
 * §DEFINITIONS-DERIVED — the type-picker rows, computed from the matrix.
 *
 * `LightingTypeDefinitions.BUILT_IN_LIGHTING_TYPES` concatenates these rather
 * than restating twenty names, so a row added to the matrix is SELECTABLE in the
 * properties panel by construction. The mount value is the row's own, so it
 * cannot disagree with `FLOOR_MOUNTED_FIXTURES` — the classic silent placement
 * bug this shape removes.
 */
export function lod200TypeDefinitionRows(): readonly {
    id: string; name: string; description: string;
    mount: 'ceiling' | 'floor' | 'table' | 'wall'; isBuiltIn: true;
}[] {
    return LOD200_FIXTURE_ROWS.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.use,
        mount: r.mount,
        isBuiltIn: true as const,
    }));
}
