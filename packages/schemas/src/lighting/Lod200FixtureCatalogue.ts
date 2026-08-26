/**
 * @file Lod200FixtureCatalogue.ts
 * §FEAT-LOD200-LUMINAIRES (L-1330, 2026-08-19)
 *
 * The LOD-200 luminaire matrix: a set of generic fixture families, each authored as
 * a SHORT ROW OF INDEPENDENT FACTS with every other field DERIVED.
 *
 * ── Why a matrix and not N hand-written definitions ─────────────────────────
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
 * Adding the NEXT luminaire is ONE ROW. It cannot arrive missing a field,
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
 * ── Why this lives in `packages/schemas` (L0), not beside the renderer ─────
 *
 * ⭐ Moved here 2026-08-19 (L-1331) to CLOSE A CLASS, not to tidy.
 *
 * `packages/schemas/src/elements/Lighting.ts` must validate the fixture family a
 * caller asks for. While this matrix sat at L2, the schema could not read it —
 * schemas may not import upward — so it carried a HAND-TRANSCRIBED five-value
 * enum instead, and that transcription is precisely what refused thirty of the
 * thirty-two families the UI offers (C96 §9.1 / EI-3).
 *
 * A five-value enum transcribing a vocabulary that is derived from a row array is
 * the SAME remembered-not-derived defect this file exists to eliminate, one layer
 * down. Moving the vocabulary to the lowest layer that needs it lets the schema
 * DERIVE its accepted set from the same array, so a thirty-third fixture widens
 * the union AND the schema together and cannot reopen the gap.
 *
 * ── Purity ─────────────────────────────────────────────────────────────────
 *
 * No THREE, no DOM, no I/O, no Zod. The single import is the material catalogue,
 * a sibling pure-data module. P5-clean, which is what makes L0 a legal home.
 */

import { findMaterialRecord } from '../materials/index.js';

// ── Vocabulary ──────────────────────────────────────────────────────────────

/**
 * The LOD-200 generic MASS a fixture is drawn as. This is the only geometry
 * input a row carries: `LightingFragmentBuilder` has one builder per archetype,
 * so the families share a handful of masses rather than needing one bespoke
 * builder each (which would be the enumerated-list defect wearing a different hat).
 *
 * ⛔ Cite `LOD200_FIXTURE_ROWS.length`, never a count written in prose here — the
 * counts in this file have already been wrong once (§LIGHT102 added five rows).
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
 *
 * ── §LIGHT102 (L-11500, 2026-08-26) — three DECORATIVE masses ───────────────
 *
 *   dome    — a WIDE SPHERICAL-CAP bowl with an EXPOSED GLOBE hanging beneath its
 *             mouth. ⛔ NOT `cone`: a truncated cone and a spherical cap are
 *             different surfaces of revolution, and the difference is the whole
 *             read of the fixture. ⛔ NOT `disc` either — the globe is a separate
 *             visible mass, which is what makes ~300° of emission truthful.
 *   capsule — a vertical PILL: hemispherical shoulder, cylindrical body, and a
 *             near-hemispherical bottom cut to leave a small mouth with the lens
 *             recessed inside it. The recessed mouth is why it is opaque AND
 *             narrow-beam; a `can` would draw the lens flush at the mouth and the
 *             optic would be a lie.
 *   tube    — an OPEN, TRANSPARENT cylinder shade with the lamp visible inside.
 *             The first transparent shade in the matrix (see
 *             {@link lod200BodyAppearance}, which now carries opacity through).
 *
 * ── §OUTDOOR112 (2026-08-26) — three SITE masses, measured against the eight ──
 *
 *   bollard    — vertical cylinder whose head is a LATERAL luminous band under a
 *                flat cap, optionally sliced by horizontal louvre slats
 *                (`louvres` on the row; 0/absent = a clean diffuser band).
 *                ⛔ NOT `post`: `post` draws a DOWN-facing lens concealed under
 *                its cap (a full-cut-off optic — the legacy `bollard_light`
 *                keeps it, untouched); the founder's bollards have a VISIBLE
 *                side-emitting band, which is a different luminous body and a
 *                different distribution, not a parameter of the old one.
 *   globe_post — base + cylindrical post/pole + a GLOWING TRANSLUCENT SPHERE at
 *                the top (`headMm` diameter, `headMaterialId` translucency).
 *                `louvres > 0` draws the founder's louvre stack + flat cap
 *                inside/atop the globe (the mini-bollard); `louvres` absent
 *                draws a visible lamp inside instead (the park post light).
 *                ⛔ NOT `dome` (its globe hangs UNDER an open bowl) and NOT
 *                `tube` (an open cylinder) — a closed sphere atop a post is a
 *                third surface, and the glow IS the fixture.
 *   street_arm — pole + CANTILEVERED horizontal arm (`stemMm` = arm reach, the
 *                same "projection off the mount" meaning `yoke` gives it) + a
 *                flat, slightly-raked rectangular LED head (`lMm × wMm`) with a
 *                down-facing lens. Nothing existing cantilevers: `yoke` is a
 *                wall bracket aimed along +Z, not a pole-top arm.
 *
 * ⚠ ADDING AN ARCHETYPE IS NOT FREE — read this before minting another.
 * `LightingFragmentBuilder` holds TWO exhaustive switches over this union
 * (`_buildLod200` and `_lod200EmitterOffset`), and the second one RETURNS from
 * every arm with no `default`. A new member therefore returns `undefined`, the
 * emitter falls back to the group origin, and the ROOT `tsc` gate fails. Lane
 * LIGHT99 hit exactly that and reverted. Both switches are updated here; grep
 * `\.archetype` before adding another (measured 2026-08-26, §OUTDOOR112: those
 * two switches plus the set membership in `efficacyClassFor` below are the only
 * consumers in the repo).
 */
export type Lod200Archetype =
    | 'can' | 'bar' | 'disc' | 'cone' | 'post' | 'arms' | 'yoke' | 'sign'
    | 'dome' | 'capsule' | 'tube'
    | 'bollard' | 'globe_post' | 'street_arm';

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
    /**
     * Projection off the mount, mm — `can` on a track (stem below the ceiling),
     * `yoke` (bracket off the wall), `street_arm` (§OUTDOOR112 — the cantilever
     * arm's horizontal reach off the pole top). One field because it is one
     * concept: how far the luminous head stands off the thing that carries it.
     */
    readonly stemMm?: number;

    // ── §OUTDOOR112 (2026-08-26) — SITE-fixture head details, not families ────
    /**
     * Horizontal louvre-slat count in the luminous head (`bollard`,
     * `globe_post`). 0/absent = no louvres: a clean diffuser band (`bollard`) or
     * a bare globe with a visible lamp (`globe_post`).
     *
     * ⭐ C84 EI-9 — the louvred bollard and the diffuser-band bollard are the
     * SAME generic mass with a head-profile detail, exactly as `endChamferMm` is
     * a profile detail of `bar`. Minting a second archetype for the slats would
     * put two masses in the builder for one construction.
     */
    readonly louvres?: number;
    /**
     * Luminous head (globe) diameter, mm — `globe_post` only. The pole is `lMm`
     * wide and the globe is `headMm` wide; deriving one from the other would tie
     * a 60 mm park-light pole to a 400 mm globe by a magic ratio no datasheet has.
     */
    readonly headMm?: number;
    /**
     * Master-catalogue material id for the TRANSLUCENT luminous head (`globe_post`).
     * Resolved through {@link lod200BodyAppearance} so the globe's opacity /
     * transparency come from the C100 master row (the L-11501 carriage), never a
     * hand-typed alpha. The EMITTED colour stays kelvin-derived like every lens.
     * Absent → the head draws as an opaque emissive lens (the pre-existing look).
     */
    readonly headMaterialId?: string;

    // ── §LIGHT102 (L-11500) — two MOUNTING/PROFILE details, not families ─────
    /**
     * Visible ceiling-rose (canopy) depth, mm. 0/absent = no drawn canopy.
     *
     * ⭐ C84 EI-9 — ONE VOCABULARY. The founder's seventh reference fixture is
     * "the flat disc pendant, but with a visible canopy". A canopy is where a
     * suspended fixture MEETS ITS CEILING; it is a mounting detail of the same
     * luminaire, exactly as `dropMm` is. Minting a second family for it would
     * put two rows in the schedule for one product and force every downstream
     * consumer (photometry, picker, vocabulary, serialiser) to carry the
     * duplicate forever. So it is a FIELD, overridable per instance via
     * `Lod200OverrideParams.canopyMm` — set it to 0 for the bare disc.
     */
    readonly canopyMm?: number;
    /**
     * End-chamfer depth on a `bar`, mm. 0/absent = square-cut ends.
     *
     * Authored per ROW rather than per archetype because ten families share
     * `bar`: chamfering all of them would re-shape a 600 × 600 troffer and a
     * plaster-in slot, which are square-cut by construction. Only the suspended
     * linear pendant carries it.
     */
    readonly endChamferMm?: number;
}

// ── The rows ────────────────────────────────────────────────────────────────

/**
 * §FEAT-LOD200-LUMINAIRES — the families. Cite `LOD200_FIXTURE_ROWS.length`.
 *
 * ── Why THESE twenty (the original 2026-08-19 set) ─────────────────────────
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
        // ⭐ §LIGHT102 (L-11500) — the founder's reference fixture #2, "linear bar
        // with an uplight", is THIS ROW. It was already `face: 'updown'` (a real
        // up-facing lens, not a mirrored down one), already on a 700 mm drop with
        // two suspension cables, already 4000 K / CRI 90 / 110°. Minting a second
        // linear pendant would have produced two rows for one product — the exact
        // duplication C84 EI-9 forbids and the reason lane LIGHT99 mapped it as
        // REUSE. The ONE thing genuinely missing was the chamfered end profile, so
        // that is the ONE thing added: `endChamferMm`, geometry only.
        //
        // ⛔ NOT ONE PHOTOMETRIC VALUE CHANGED. These numbers are already on disk in
        // every project that has ever placed a linear pendant; re-tuning them to
        // "match the founder's photo" would silently re-light existing scenes.
        id: 'linear_pendant', name: 'Linear Pendant',
        use: 'Suspended direct/indirect linear over a desk run or a long dining table.',
        archetype: 'bar', mount: 'ceiling', face: 'updown', dropMm: 700, location: 'interior',
        lumens: 4200, watts: 38, kelvin: 4000, cri: 90, beamAngleDeg: 110, ipRating: 20,
        bodyMaterialId: 'aluminium-powder-coated-white', lMm: 1500, wMm: 70, dMm: 70,
        endChamferMm: 25,
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

    // ── §LIGHT102 (L-11500, 2026-08-26) — the founder's DECORATIVE PENDANTS ──
    //
    // Five rows closing six of the founder's seven reference fixtures (#2 is the
    // `linear_pendant` row above, reused; #7 is #6 with its canopy, which is a
    // field on this row, not a family — see `canopyMm`).
    //
    // ⭐ WHY THE MATRIX AND NOT FIVE HAND-WRITTEN FAMILIES. Lane LIGHT99 measured
    // the cost: a hand-written family touches TWENTY files (a union member in
    // three copies of `LightingTypes.ts`, a `*_DEFAULTS` const, a photometry row,
    // a `BUILT_IN_LIGHTING_TYPES` row, a builder method, an emitter case, a
    // vocabulary entry…) and can arrive missing any one of them. A matrix row
    // touches FOUR, three of which are tests. These five are rows.
    //
    // ── THE NUMBERS, AND WHAT EACH ONE STANDS ON ────────────────────────────
    //
    // ⛔ NOT COPIED FROM A NEIGHBOUR. A bare-globe dome, a clear-glass cylinder
    // and a recessed-lens cylinder spot genuinely differ on every photometric
    // axis, and copying one row's numbers into the next is how a catalogue ends
    // up with five fixtures that light identically. Each row's basis is stated at
    // the row. Where a figure is genuinely the SAME as an existing row (the disc
    // pendant's 120° diffuser), it says so and says why, rather than being
    // perturbed to look independent.
    //
    // ⚠ NOT MANUFACTURER DATA. Every figure below is an ORDINARY MID-MARKET
    // PRODUCT-CLASS value for the family named — the kind of number that appears
    // on a generic datasheet for that class. LOD 200 is generic families, not
    // products (see the file header), and no IES distribution exists here.

    {
        // FOUNDER #1 — wide dome/bowl with an EXPOSED GLOBE beneath its mouth.
        //
        // lumens 1100 — ONE E27 decorative globe LED lamp. The G125 globe class is
        //   declared at ~1055 lm (the 75 W-incandescent replacement rung); 1100 is
        //   that rung, and because the globe is EXPOSED almost none of it is
        //   absorbed before it leaves the fixture. That is also why this row is
        //   BRIGHTER than the shaded `pendant_conical` (900 lm) despite a similar
        //   lamp — the bowl reflects rather than encloses.
        // watts 13 — the same lamp class draws 11–13 W; 13 W is the fixture figure
        //   including driver. 84.6 lm/W, high for a decorative row precisely
        //   BECAUSE the source is exposed (nothing to absorb).
        // kelvin 2700 — decorative/dining warm white, the residential norm and the
        //   same CCT the twelve hand-authored pendants already use.
        // cri 90 — it hangs over a dining table, where food and faces are the
        //   subject; Ra 90 is the specification norm for that duty.
        // beam 300° — a bare globe below an open bowl radiates almost fully, blocked
        //   only by the bowl above it. (`pendant_conical`, whose shade encloses the
        //   lamp, is 150° — the axis that makes these two different fixtures.)
        // drop 900 — a dining pendant's canopy-to-shade drop putting the shade
        //   mouth ~1.55 m above the floor under a 2.6 m ceiling.
        id: 'pendant_dome_globe', name: 'Dome Pendant (Exposed Globe)',
        use: 'Wide spun bowl over a dining table with a large exposed globe lamp hanging beneath its mouth.',
        archetype: 'dome', mount: 'ceiling', face: 'down', dropMm: 900, location: 'interior',
        lumens: 1100, watts: 13, kelvin: 2700, cri: 90, beamAngleDeg: 300, ipRating: 20,
        bodyMaterialId: 'aluminium-powder-coated-white', lMm: 450, wMm: 450, dMm: 210,
        canopyMm: 60,
    },
    {
        // FOUNDER #3 — slim opaque CAPSULE/PILL over an island or a bar.
        //
        // lumens 900 — an integrated-LED pendant downlight of this aperture puts
        //   the same flux on a worktop as the 10 W recessed downlight already in
        //   this matrix (900 lm): it is the SAME optic in a suspended body, which
        //   is the honest reason the figure matches rather than a copy.
        // watts 12 — 75 lm/W, LOWER than the flush downlight's 90 because a deep
        //   opaque tube with a recessed lens absorbs at the mouth. That loss is the
        //   price of the narrow beam and it is why this row is `decorative`.
        // kelvin 3000 — task/island lighting; the residential task norm.
        // cri 90 — over a food-preparation surface.
        // beam 60° — the mouth is recessed inside the lower hemisphere, so the
        //   cut-off is sharp. This is the row's defining optic.
        // drop 800 — pendant bottom ~1.5 m above the floor over a 0.9 m worktop.
        id: 'pendant_capsule', name: 'Capsule Pendant',
        use: 'Slim opaque pill pendant with hemispherical ends and a recessed lens — kitchen islands and bars.',
        archetype: 'capsule', mount: 'ceiling', face: 'down', dropMm: 800, location: 'interior',
        lumens: 900, watts: 12, kelvin: 3000, cri: 90, beamAngleDeg: 60, ipRating: 20,
        bodyMaterialId: 'aluminium-powder-coated-dark', lMm: 120, wMm: 120, dMm: 320,
        canopyMm: 60,
    },
    {
        // FOUNDER #4 — CLEAR-GLASS CYLINDER with the lamp visible inside.
        //   ⭐ The first TRANSPARENT shade in the matrix.
        //
        // lumens 800 — one E27 LED lamp at the 60 W-replacement rung (declared
        //   806 lm in the EU energy-label class). Clear glass transmits ~90%, so
        //   the FIXTURE figure and the LAMP figure are within rounding of each
        //   other — which is exactly what a clear shade means and why this row is
        //   not simply the dome's number scaled.
        // watts 9 — that lamp class is 7–9 W; 9 W with driver. 88.9 lm/W.
        // kelvin 2700 — decorative bar/dining warm white.
        // cri 80 — ⭐ DELIBERATELY NOT the 90 of its neighbours. A decorative lamp
        //   behind clear glass is the mass-market Ra 80 class; specifying Ra 90
        //   here would be inventing a precision this family does not have.
        // beam 340° — a clear cylinder emits almost fully spherically; only the
        //   metal top cap and the cable interrupt it. (`pendant` — an opaque
        //   cylinder — is 180°. Same mass, different material, 160° apart.)
        // drop 900 — bar/dining hanging height.
        id: 'pendant_glass_cylinder', name: 'Clear Glass Cylinder Pendant',
        use: 'Open clear-glass cylinder shade with the lamp visible inside — bars, counters and dining.',
        archetype: 'tube', mount: 'ceiling', face: 'down', dropMm: 900, location: 'interior',
        lumens: 800, watts: 9, kelvin: 2700, cri: 80, beamAngleDeg: 340, ipRating: 20,
        bodyMaterialId: 'glass-clear', lMm: 120, wMm: 120, dMm: 280,
        canopyMm: 50,
    },
    {
        // FOUNDER #5 — CYLINDER SPOT on a suspension rod.
        //   ⭐ ZERO NEW GEOMETRY: the existing `can` archetype already draws a
        //   cylindrical body on a rod with a lens at the mouth. This row is the
        //   whole fixture.
        //
        //   ⚠ It uses `dropMm`, NOT `stemMm`. `suspended` is DERIVED from the drop,
        //   and `constructionFormFor` reads `suspended` — a pendant authored on a
        //   stem would have classified as a flush DOWNLIGHT in every schedule.
        //   `_lod200Can` now adds drop and stem, so `track_head` (stem 90, drop 0)
        //   is untouched.
        //
        // lumens 1000 — an architectural cylinder spot of this aperture. Slightly
        //   under the 1100 lm retail `track_head` because a domestic/hospitality
        //   accent cylinder is specified softer than a shop-floor track head.
        // watts 12 — 83.3 lm/W, an ordinary architectural figure.
        // kelvin 3000 — accent lighting in a residential/hospitality room.
        // cri 90 — ⭐ NOT 95. Ra 95 is reserved for `track_head`, whose duty is
        //   gallery and merchandise rendering; flattening the two would erase the
        //   one axis that distinguishes them.
        // beam 36° — the middle rung of the standard 24/36/60 architectural beam
        //   ladder: narrower than a wall washer, wider than the 24° gimbal.
        // drop 900 — rod-suspended over a counter or a feature.
        id: 'pendant_cylinder_spot', name: 'Cylinder Spot Pendant',
        use: 'Suspended cylindrical spot on a rod, aiming a medium beam at a counter, island or feature.',
        archetype: 'can', mount: 'ceiling', face: 'down', dropMm: 900, location: 'interior',
        lumens: 1000, watts: 12, kelvin: 3000, cri: 90, beamAngleDeg: 36, ipRating: 20,
        bodyMaterialId: 'steel-blackened', lMm: 90, wMm: 90, dMm: 160,
        canopyMm: 40,
    },
    {
        // FOUNDER #6 **AND** #7 — the FLAT DISC pendant, and the flat disc pendant
        // WITH A VISIBLE CANOPY. ⭐ ONE ROW (C84 EI-9). See `canopyMm` on
        // `Lod200FixtureRow`: a canopy is where a suspended fixture meets its
        // ceiling, not a second product. `canopyMm: 80` ships the founder's #7 by
        // default; `lod200Params.canopyMm = 0` gives #6 bare.
        //
        //   ⭐ ZERO NEW GEOMETRY: the existing `disc` archetype draws it. `disc`
        //   simply never honoured `dropMm` (its only row was a flush oyster);
        //   it does now, guarded on `drop > 0` so that row is untouched.
        //
        // lumens 2400 — a 500 mm edge-lit LED disc pendant. Sized from the duty,
        //   not from a neighbour: EN 12464-1 asks ~300 lx on a dining/work surface;
        //   a ~1.6 m² table needs ~480 lm ON the surface, and a diffuse pendant at
        //   0.9 m delivers roughly 20–25% of fixture flux there, so ~2000–2400 lm
        //   is the honest fixture rating for that task.
        // watts 24 — 100 lm/W, the ordinary figure for a modern LED disc.
        // kelvin 3000 — residential dining/work amenity.
        // cri 90 — over a dining or work surface.
        // beam 120° — ⭐ THE SAME NUMBER as `surface_ceiling_disc`, on purpose and
        //   said out loud: it is the same flat diffuser optic in a suspended body.
        //   Perturbing it to look independently derived would be the dishonest move.
        // drop 900 — dining hanging height.
        id: 'pendant_disc', name: 'Disc Pendant',
        use: 'Slim flat disc suspended over a dining table or desk, with a visible ceiling canopy.',
        archetype: 'disc', mount: 'ceiling', face: 'down', dropMm: 900, location: 'interior',
        lumens: 2400, watts: 24, kelvin: 3000, cri: 90, beamAngleDeg: 120, ipRating: 20,
        bodyMaterialId: 'aluminium-powder-coated-white', lMm: 500, wMm: 500, dMm: 40,
        canopyMm: 80,
    },

    // ── §OUTDOOR112 (2026-08-26) — the founder's five OUTDOOR SITE fixtures ──
    //
    // All five are `mount: 'floor'`, `location: 'exterior'`: they stand on the
    // ground plane and seat through the SAME floor datum every floor fixture
    // uses. ⚠ SITE-PLACEMENT TRUTH, stated rather than implied: nothing in this
    // repository seats an element on TERRAIN — the placement tool raycasts
    // floor/slab surfaces and the seating authority resolves level + floor
    // finishes. A bollard placed outside any slab lands on the level datum
    // plane, not on a terrain surface. That is a named limitation, not a
    // capability these rows can claim.
    //
    // ⚠ THE ONE-SCALAR BEAM LIMIT, named per row (the L-11423 uplight
    // precedent): `beamAngleDeg` is a single full-angle. A louvred bollard's
    // toroidal band (360° azimuth × a louvre-clamped vertical slice) and a
    // street head's asymmetric forward throw (IES Type II/III: road-side
    // reach, house-side cutoff) are NOT expressible in it. Each row below
    // authors the half that IS expressible and says which half is not.

    {
        // FOUNDER OUTDOOR #1 — GLOBE MINI-BOLLARD: short dark post, louvre
        // stack under a flat cap, all wrapped in a GLOWING translucent sphere.
        //
        // lumens 350 — a decorative garden mini-bollard: a 4–6 W integrated
        //   module behind a frosted globe delivers 300–450 lm; 350 is the class
        //   mid-figure. Deliberately the DIMMEST of the five: its duty is to
        //   mark a path edge and glow, not to light an area.
        // watts 6 — 58.3 lm/W. The frosted globe absorbs ~20–30% before the
        //   flux leaves the fixture — the construction fact that puts
        //   `globe_post` in the decorative lm/W band, where 58 is a real
        //   number and not a typo.
        // kelvin 3000 — the exterior residential amenity norm, matching the
        //   pre-existing exterior rows (bollard_light, step_marker_light).
        // cri 80 — garden/amenity class near the eye.
        // beam 300° — a glowing globe radiates almost fully; the louvre stack
        //   and post below block the lower cone. SAME construction reasoning as
        //   the `dome` row's exposed globe (300°), and said so rather than
        //   perturbed to look independent.
        // IP65 — exterior floor fixture; the ground-level minimum.
        id: 'bollard_globe_mini', name: 'Globe Mini Bollard',
        use: 'Short dark post with a glowing frosted globe over a louvre stack — path edges and planting beds.',
        archetype: 'globe_post', mount: 'floor', face: 'down', location: 'exterior',
        lumens: 350, watts: 6, kelvin: 3000, cri: 80, beamAngleDeg: 300, ipRating: 65,
        bodyMaterialId: 'aluminium-powder-coated-dark', lMm: 100, wMm: 100, dMm: 400,
        headMm: 180, headMaterialId: 'glass-frosted', louvres: 3,
    },
    {
        // FOUNDER OUTDOOR #2 — LOUVRED BOLLARD ("+ lumen": the photometry row
        // he asked to be real). Black ~0.9 m cylinder, 4 horizontal louvre
        // slats with the white diffuser visible between them, flat cap.
        //
        // lumens 600 — DELIVERED fixture lumens, not module lumens: a louvred
        //   optic costs 30–40% of a ~900–1000 lm module, and 500–700 lm out is
        //   what mid-market 0.9 m louvred bollards declare. Authoring the
        //   module figure here would overstate the fixture by a third.
        // watts 10 — 60 lm/W. LOW ON PURPOSE and judged in the decorative
        //   band: the louvre stack sits in the light path by construction.
        //   Judged architectural ([65,170]) this true number would fail as a
        //   typo — which is exactly why efficacy class derives from archetype.
        // kelvin 3000 · cri 80 — residential/park exterior amenity.
        // beam 150° — the EXPRESSIBLE half: the louvres clamp emission to a
        //   band from the horizon downward (glare cut-off above horizontal,
        //   ULOR ≈ 0 — the point of a louvred bollard). ⛔ NOT EXPRESSIBLE:
        //   that this 150° band runs the FULL 360° of azimuth — the toroidal
        //   distribution has no field, and no number here should be read as a
        //   downward cone.
        // IP65 — exterior ground-level fixture.
        id: 'bollard_louvred', name: 'Louvred Bollard',
        use: 'Path bollard with horizontal louvre slats over a white diffuser — glare-free route lighting.',
        archetype: 'bollard', mount: 'floor', face: 'down', location: 'exterior',
        lumens: 600, watts: 10, kelvin: 3000, cri: 80, beamAngleDeg: 150, ipRating: 65,
        bodyMaterialId: 'aluminium-powder-coated-dark', lMm: 160, wMm: 160, dMm: 900,
        louvres: 4,
    },
    {
        // FOUNDER OUTDOOR #3 — DIFFUSER-BAND BOLLARD: dark grey ~1 m cylinder,
        // clean WHITE cylindrical diffuser band under a flat cap.
        //
        // lumens 550 — an opal-band bollard: the full-height band transmits
        //   more evenly but no more efficiently than the louvred head's optic;
        //   400–600 lm delivered is the class band and 550 sits in it. NOT the
        //   louvred row's 600 copied — a different module behind a different
        //   optic, and the two differing by less than 10% is what two same-duty
        //   bollards genuinely look like on datasheets.
        // watts 8 — 68.75 lm/W, decorative band (the band is in the path).
        // kelvin 3000 · cri 80 — as its siblings; same duty, same class.
        // beam 300° — the EXPRESSIBLE half: an unshielded band radiates nearly
        //   omnidirectionally, blocked only by the cap above and shaft below —
        //   the same cap-and-shaft reasoning as the globe rows. WIDER than the
        //   louvred row's 150° because nothing clamps it: that ordering (open
        //   diffuser > louvred) is the one photometric fact separating the two.
        // IP65 — exterior ground-level fixture.
        id: 'bollard_diffuser', name: 'Diffuser Bollard',
        use: 'Minimal dark-grey bollard with a clean white diffuser band under a flat cap — paths and forecourts.',
        archetype: 'bollard', mount: 'floor', face: 'down', location: 'exterior',
        lumens: 550, watts: 8, kelvin: 3000, cri: 80, beamAngleDeg: 300, ipRating: 65,
        bodyMaterialId: 'steel-powder-coated-dark', lMm: 140, wMm: 140, dMm: 1000,
    },
    {
        // FOUNDER OUTDOOR #4 — GLOBE POST LIGHT: thin ~2.7 m pole on a small
        // cylindrical base, glowing translucent sphere with a visible lamp
        // inside at the top.
        //
        // lumens 1600 — a park opal-globe post-top: a ~2000 lm integrated
        //   module behind an opal globe (~80% transmission) declares
        //   1200–2500 lm; 1600 is the mid rung.
        // watts 18 — 88.9 lm/W, the top of what an opal post-top honestly
        //   reaches; still decorative-band because the globe is in the path.
        // kelvin 3000 — dark-sky-era park lighting: municipalities now specify
        //   ≤3000 K outdoors, and a residential-adjacent globe is exactly the
        //   fixture that rule governs.
        // cri 70 — ⭐ NOT the 80 of the garden bollards: area/park amenity is
        //   specified at Ra ≥ 70 (EN 13201 territory), and this is an AREA
        //   fixture at 2.7 m, not a garden accent at knee height.
        // beam 320° — a globe on a THIN pole is blocked only by the fitting
        //   beneath it: wider than the mini-bollard's 300°, whose thick head
        //   stack shadows more of the lower sphere. The ordering is the
        //   construction speaking, not a perturbation.
        // IP65 — sealed modern post-top.
        id: 'globe_post_light', name: 'Globe Post Light',
        use: 'Slender park post with a glowing frosted globe and visible lamp — squares, gardens and courtyards.',
        archetype: 'globe_post', mount: 'floor', face: 'down', location: 'exterior',
        lumens: 1600, watts: 18, kelvin: 3000, cri: 70, beamAngleDeg: 320, ipRating: 65,
        bodyMaterialId: 'aluminium-powder-coated-dark', lMm: 60, wMm: 60, dMm: 2700,
        headMm: 400, headMaterialId: 'glass-frosted',
    },
    {
        // FOUNDER OUTDOOR #5 — STREET / AREA LUMINAIRE: grey ~5 m pole,
        // cantilevered arm, flat slightly-raked rectangular LED head.
        //
        // lumens 8000 — the M3/M4 residential-street class: modern flat LED
        //   heads for 5–6 m mounting declare 6,000–12,000 lm; 8,000 is the
        //   ordinary residential-street rung (a 10–12 klm head is a main-road
        //   spec, a 4 klm head is a footpath one).
        // watts 60 — 133 lm/W: the honest modern street-LED figure (120–160 on
        //   current datasheets) and the ONE architectural-band row of the five —
        //   an open flat optic loses almost nothing, unlike its shaded siblings.
        // kelvin 4000 — the street norm (visibility duty, not amenity warmth).
        // cri 70 — road lighting class; EN 13201 does not ask for more, and
        //   claiming Ra 80 for a street head would be decorating the row.
        // beam 140° — the EXPRESSIBLE half: the total downward spread of a flat
        //   LED street optic. ⛔ NOT EXPRESSIBLE: the ASYMMETRY — a street head
        //   is an IES Type II/III optic throwing forward across the road with a
        //   house-side cutoff, and one scalar cannot carry direction. Until the
        //   schema has an asymmetric-distribution field, this row lights
        //   symmetrically and says so, rather than faking a bias.
        // IP66 — street-luminaire sealing class, above the exterior floor of 65.
        id: 'street_area_luminaire', name: 'Street / Area Luminaire',
        use: 'Pole-top luminaire on a cantilevered arm with a flat raked LED head — streets, parking and site roads.',
        archetype: 'street_arm', mount: 'floor', face: 'down', location: 'exterior',
        lumens: 8000, watts: 60, kelvin: 4000, cri: 70, beamAngleDeg: 140, ipRating: 66,
        bodyMaterialId: 'steel-galvanised', lMm: 620, wMm: 260, dMm: 5000,
        stemMm: 800,
    },

    // ── §LIGHT121 (L-11904, 2026-08-26) — the founder's INTERIOR FLOOR family ──
    //
    // Every existing `mount: 'floor'` row is `location: 'exterior'` (the five
    // §OUTDOOR112 site fixtures plus the legacy `bollard_light`) — there was no
    // INDOOR floor-standing luminaire in the whole matrix. The founder's ask,
    // "floor lighting" — uplighters, floor-recessed spots, plinth/cove LED — is
    // exactly that gap, on the SAME `mount: 'floor'` vocabulary the site fixtures
    // already prove out, reusing the existing `can` and `bar` archetypes rather
    // than minting new ones (C84 EI-9: an uplighter is optically a downlight
    // pointed the other way, not a new mass).
    //
    // ⚠ THE ONE THING THAT WAS NOT ALREADY TRUE FOR THESE ARCHETYPES: `_lod200Can`
    // and `_lod200Bar` (and their `_lod200EmitterOffset` arms) hard-assumed a
    // CEILING mount — local +Y is "away from the room" there, so a `can` recessed
    // body sits at +D/2 and a non-recessed one hangs at −D/2. For a FLOOR mount
    // the room is on the OPPOSITE side of the local origin (+Y is INTO the room,
    // −Y is the void below the slab), so reusing that code unmodified would have
    // built an uplighter with its body and lens on the wrong side of the floor —
    // invisible or emitting into the slab. `LightingFragmentBuilder` gained an
    // explicit `mount === 'floor'` arm in both places, sign-mirrored from the
    // ceiling arm, exactly as `mount === 'wall'` already has its own arm there.
    // See `floorMountFixtures.test.ts` for the measurement (emitter Y ≥ 0 for all
    // four; the non-recessed row's whole body sits at y ≥ 0 too).
    {
        // #1 — RECESSED IN-GROUND UPLIGHTER: a walk-over puck flush with the
        // floor, washing a nearby column or feature wall from below.
        //
        // lumens 400 / watts 6 → 66.7 lm/W — architectural band, low end: the
        //   walk-over lens (toughened, sealed to IP67) costs a few % of
        //   transmission a plain trim ring does not, distinct from #2's 71.4.
        // kelvin 2700 — warm accent wash, the architectural-feature norm.
        // cri 90 — feature/accent duty, matching the ceiling accent rows
        //   (`adjustable_downlight`, `wall_washer_recessed`) rather than the
        //   70–80 of an amenity/area fixture.
        // beam 30° — a WASH, wider than #3's precision spot, narrower than a
        //   general downlight: the fixture lights a surface, not the floor
        //   around it.
        // IP67 — in-ground walk-over sealing (EN 60598-2-13), the recessed
        //   floor-fixture floor — distinct from a merely splash-rated surface
        //   puck (#2).
        id: 'floor_uplighter_recessed', name: 'Recessed Floor Uplighter',
        use: 'In-ground recessed uplighter, flush with the floor, washing a column or feature wall from below.',
        archetype: 'can', mount: 'floor', face: 'up', recessed: true, location: 'interior',
        lumens: 400, watts: 6, kelvin: 2700, cri: 90, beamAngleDeg: 30, ipRating: 67,
        bodyMaterialId: 'steel-stainless-brushed', lMm: 100, wMm: 100, dMm: 90,
    },
    {
        // #2 — SURFACE FLOOR UPLIGHTER: a squat puck standing proud of the
        // floor beside a column, plant stand or display plinth.
        //
        // lumens 500 / watts 7 → 71.4 lm/W — no walk-over sealing overhead
        //   (it is not driven over), so slightly ahead of #1's in-ground figure.
        // kelvin 3000 — general accent, a touch cooler than the in-ground
        //   feature wash.
        // beam 40° — WIDER than #1: a surface puck typically carries a simpler,
        //   less collimated optic than a recessed in-ground unit.
        // IP44 — indoor surface accent, splash-protected for floor cleaning,
        //   not walk-over rated (it is not flush, so nothing walks ON it).
        id: 'floor_uplighter_surface', name: 'Surface Floor Uplighter',
        use: 'Surface-standing puck uplighter beside a column or plinth, washing it from floor level.',
        archetype: 'can', mount: 'floor', face: 'up', location: 'interior',
        lumens: 500, watts: 7, kelvin: 3000, cri: 90, beamAngleDeg: 40, ipRating: 44,
        bodyMaterialId: 'aluminium-powder-coated-dark', lMm: 90, wMm: 90, dMm: 70,
    },
    {
        // #3 — RECESSED FLOOR SPOT: a narrow-beam in-ground spot grazing
        // artwork or a textured wall from low level — a precision accent, not
        // a wash.
        //
        // lumens 480 / watts 7 → 68.6 lm/W — between #1 and #2: a narrower
        //   optic than #1's wash costs a little more transmission for the
        //   tighter control, distinct from both rather than sitting on either.
        // kelvin 3000 · cri 90 — matches the ceiling spot family
        //   (`track_head`, `adjustable_downlight`) it is the floor-level
        //   sibling of.
        // beam 20° — genuinely narrower than #1's 30° wash: the "spot" vs
        //   "uplighter" distinction is this field, not the name.
        // IP67 — in-ground walk-over, the same duty as #1.
        id: 'floor_recessed_spot', name: 'Recessed Floor Spot',
        use: 'Narrow-beam in-ground spot grazing a nearby wall, column or artwork from low level.',
        archetype: 'can', mount: 'floor', face: 'up', recessed: true, location: 'interior',
        lumens: 480, watts: 7, kelvin: 3000, cri: 90, beamAngleDeg: 20, ipRating: 67,
        bodyMaterialId: 'steel-stainless-brushed', lMm: 95, wMm: 95, dMm: 100,
    },
    {
        // #4 — PLINTH / COVE LED STRIP: a linear LED strip recessed into a
        // skirting/plinth groove, washing the floor indirectly along a wall run.
        //
        // ⭐ THE SAME LINEAR ARCHETYPE AS `cove_indirect` (its ceiling sibling),
        // reused rather than re-invented (C84 EI-9) — a plinth cove and a
        // ceiling cove are the SAME product family, mounted at the opposite
        // skirting.
        // lumens 900 / watts 9 → 100 lm/W — a genuinely different absolute
        //   pair from `cove_indirect`'s 1100/11 (also 100 lm/W): the SAME
        //   linear-LED-strip efficacy class, a shorter run at a lower total
        //   output, not that row's numbers copied across.
        // kelvin 2700 — matches `cove_indirect`'s warm indirect wash.
        // cri 90 — matches the architectural cove family.
        // beam 110° — a touch narrower than `cove_indirect`'s 120°: recessed
        //   in a plinth groove rather than an open ceiling channel, the groove
        //   itself clips a few degrees off the edge of the wash.
        // IP44 — recessed in a floor-level groove, exposed to routine floor
        //   cleaning; not walk-over (the groove sets it back from the floor
        //   surface a person would stand on).
        id: 'plinth_cove_led', name: 'Plinth / Cove LED Strip',
        use: 'Linear LED strip recessed into a skirting/plinth groove, washing the floor indirectly along a wall run.',
        archetype: 'bar', mount: 'floor', face: 'up', recessed: true, location: 'interior',
        lumens: 900, watts: 9, kelvin: 2700, cri: 90, beamAngleDeg: 110, ipRating: 44,
        bodyMaterialId: 'aluminium-anodised-silver', lMm: 900, wMm: 35, dMm: 35,
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
/**
 * §LIGHT102 (L-11500) — the DECORATIVE archetypes, as a set rather than a chain
 * of `||`s, so the rule stays one readable statement as the union grows.
 *
 * A decorative luminaire is one whose SHADE OR SOURCE is part of the design and
 * therefore sits in the light path: an arm-and-cup chandelier, a spun bowl over a
 * bare globe, an opaque pill with a recessed mouth, a glass cylinder around a
 * visible lamp. Each of those construction facts costs flux (or, for the exposed
 * globe, costs the ability to control it), which is why they are judged against
 * the wider `decorative` lm/W band and not the architectural one.
 *
 * ⛔ Membership is by ARCHETYPE — a construction fact the row cannot choose for
 * itself — never by a flag on the row. A row that could name its own class could
 * name the lenient one to excuse its own numbers, which is the whole failure
 * `efficacyClassFor` exists to prevent.
 *
 * ⚠ `can` and `disc` are deliberately ABSENT even though `pendant_cylinder_spot`
 * and `pendant_disc` are decorative-looking pendants: those archetypes are shared
 * with `recessed_downlight` and `surface_ceiling_disc`, and both new rows are
 * genuinely architectural LED luminaires (83 and 100 lm/W). Widening the set to
 * cover them would hand the lenient band to every recessed downlight in the
 * matrix — the exact thing this function refuses to allow.
 */
/**
 * §OUTDOOR112 — `bollard` and `globe_post` join by the same CONSTRUCTION test:
 * a louvre stack / opal band / frosted globe sits in the light path and costs
 * 20–40% of the module flux, so a louvred bollard's true 60 lm/W must be judged
 * where 60 is a real number, not where it reads as a typo. "Decorative" here
 * has always meant "optically lossy by construction", not "ornamental" — the
 * set's own definition above says shade-or-source-in-the-path, and a bollard's
 * band is exactly that. `street_arm` is deliberately ABSENT: an open flat LED
 * optic loses almost nothing and belongs in the architectural band, where its
 * 133 lm/W is checked against street-LED reality.
 */
const DECORATIVE_ARCHETYPES: ReadonlySet<Lod200Archetype> =
    new Set<Lod200Archetype>(['arms', 'dome', 'capsule', 'tube', 'bollard', 'globe_post']);

export function efficacyClassFor(row: Lod200FixtureRow): Lod200EfficacyClass {
    if (row.isEmergency || row.archetype === 'sign') return 'signalling';
    if (DECORATIVE_ARCHETYPES.has(row.archetype)) return 'decorative';
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
 *
 * ⭐ §LIGHT102 (L-11500) — `opacity` and `transparent` are now carried too.
 *
 * They were being DROPPED, and until this lane nothing noticed because every
 * LOD-200 row named an opaque material. `pendant_glass_cylinder` names
 * `glass-clear`, whose master row is `opacity: 0.3, transparent: true` — read
 * through the old three-field projection it would have rendered as an OPAQUE pale
 * blue tube. That is a C100 §2.1 identity break wearing the costume of a finish:
 * the material would have been correctly resolved and incorrectly applied, and
 * the UI would still have reported it as applied. A projection must map the
 * master faithfully or say it cannot (C84 §1.3).
 */
export function lod200BodyAppearance(
    bodyMaterialId: string,
): { color: string; metalness: number; roughness: number; opacity: number; transparent: boolean } | null {
    const rec = findMaterialRecord(bodyMaterialId);
    if (!rec) return null;
    return {
        color: rec.color,
        metalness: rec.metalness,
        roughness: rec.roughness,
        opacity: rec.opacity,
        transparent: rec.transparent,
    };
}

/**
 * §PHOTOMETRY-DERIVED — the photometry rows, computed from the matrix.
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
    // type: the keys come from the rows one-for-one, so the assertion is a
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
 * than restating the names, so a row added to the matrix is SELECTABLE in the
 * properties panel by construction. The mount value is the row's own, so it
 * cannot disagree with `FLOOR_MOUNTED_FIXTURES` — the classic silent placement
 * bug this shape removes.
 */
export function lod200TypeDefinitionRows(): readonly {
    id: string; name: string; description: string;
    mount: 'ceiling' | 'floor' | 'table' | 'wall'; isBuiltIn: true;
    location: Lod200Location;
}[] {
    return LOD200_FIXTURE_ROWS.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.use,
        mount: r.mount,
        isBuiltIn: true as const,
        // §OUTDOOR112 — the row's own installation location, carried so the
        // create palette can offer an "Outdoor & Site" section DERIVED from the
        // registry (exterior + floor-standing) instead of a hand list of ids.
        location: r.location,
    }));
}
