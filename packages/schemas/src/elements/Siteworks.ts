// Siteworks — the L0 record for the siteworks element family:
// ROADS · PARKING AREAS · PEDESTRIAN AREAS.
// C116 · ADR-0384 · C84 · C92 (Slab, the areal precedent) · C85 (Wall, the linear
// precedent) · C100 §2.1 · C11 · C03.
//
// ═══════════════════════════════════════════════════════════════════════════════
// WHAT THIS IS
// ═══════════════════════════════════════════════════════════════════════════════
//
// A siteworks surface is an AUTHORED flat paved plane laid on the site — the
// founder's *"roads … linear design — like a wall — but of course flat — like a
// slab — with a thickness that the user can add … then parking spaces … and
// pedestrian areas"* (C116 §0, verbatim).
//
// ⭐ ONE KIND WITH A ROLE, NOT THREE KINDS (ADR-0384 D1). A road, a parking area
//    and a pedestrian area differ in nothing a geometry pipeline can see. They
//    differ in what they MEAN — who may travel on them, what the width is
//    measured against, what a code check would ask. C83 §2.1 prices the
//    alternative directly: *"A new element kind must not require 30 new
//    decisions"*, and three kinds would be three copies of one rule, which is
//    the defect this repository logs more than any other.
//    The founder's "category" is satisfied by three UI ENTRIES, not three kinds.
//
// ─── ⛔ THE FOUR THINGS IT IS NOT (C116 §0.3) ────────────────────────────────
//
// ⛔ IT IS NOT `Slab` (`./Slab.ts`). A slab is BUILDING FABRIC on a storey: it is
//    scheduled, carries a system type and layers, couples to columns and traces
//    regions from walls. A car park is not a floor plate and must never appear in
//    a floor-area schedule. ⭐ Its FIELD SPELLINGS are reused verbatim and its
//    DATUM RULE is inherited — its IDENTITY is not.
//
// ⛔ IT IS NOT THE ZONING `street_width` FAMILY
//    (`@pryzm/site-parcel-data` → `geometry/streetWidth.ts`,
//    `BCN_OFFICIAL_STREET_WIDTHS`, `MURCIA_STREET_WIDTH_AUTHORITY`). ⛔ THE SINGLE
//    MOST DANGEROUS CONFUSION IN THIS FAMILY. That subsystem MEASURES an EXISTING
//    street to resolve a LEGAL height limit — a determination with a confidence, a
//    provenance and a refusal vocabulary. This is a DESIGN the user drew. A drawn
//    road must never be read as a measured street width, or an architect raises
//    their own permitted height by widening a road they invented. C116 §12.
//
// ⛔ IT IS NOT `SpaceEnvelope` (`./SpaceEnvelope.ts`). A prism with a `height`,
//    extruded UP; this is a plate with a `thickness`, extruded DOWN. They share
//    the one-kind-with-a-role architecture and nothing else.
//
// ⛔ IT IS NOT A CONTEXT ROAD from the geospatial bake (the R2 roads layer).
//    Those are SURVEYED fabric around the site, baked as tiles, never editable.
//    This is authored inside the project. Two answers to "where is the road" would
//    be C84 EI-9, so the family carries NO `sourceFeatureId` and adopts no context
//    geometry.
//
// ─── ⚠ THE NAME ──────────────────────────────────────────────────────────────
// The kind is spelled `siteworks`. It was `siteSurface` in ADR-0384 as minted, and
// that spelling was ALREADY TAKEN by `apps/editor/src/ui/site/SiteSurface.ts` — an
// unrelated live L7 panel class that predated the contract by 5 h 46 min while
// C116 §0.1 recorded the grep as "0 files". ⛔ `siteSurface`, `road`, `surface`,
// `pavement`, `paving`, `siteslab` and `groundSurface` are FORBIDDEN spellings for
// this family (C84 EI-8). See the ORCHESTRATOR RULING at the head of C116.
//
// ─── ⚠ THE C83 §2.2 SPATIAL ROLE IS NORMATIVE INTENT, NOT A FIELD ────────────
// A siteworks surface is a `CIRCULATION_SURFACE` in C83 §2.2's SPATIAL-VALIDITY
// vocabulary, in all three of its own roles. ⛔ That is NOT declared as a field
// here, because the vocabulary DOES NOT EXIST IN CODE — re-measured 2026-09-09:
// `grep -rn "CIRCULATION_SURFACE\|SpatialRole\|OCCUPIABLE" packages plugins apps
// src --include=*.ts` → no output. Minting a field for a vocabulary with no
// consumer would be the naming-vs-behaviour defect C107 §0.2-a names. ADR-0384 D9.
//
// ─── LAYERING ────────────────────────────────────────────────────────────────
// L0-pure (P5): Zod + plain TS only. Zero I/O, zero THREE, zero DOM, no OTel span
// (a span is I/O). Enforced by `tools/ga-gate/check-domain-purity.ts`.

import { z } from 'zod';
import { defineElement } from '../base/BaseNode.js';
import { RetrofittedProvenanceSchema } from '../provenance/ValueOrigin.js';
import { RetrofittedConfidenceSchema } from '../provenance/ElementConfidence.js';
import { Vec3 } from '../base/primitives.js';

// ─────────────────────────────────────────────────────────────────────────────
// THE ROLE VOCABULARY — ADR-0384 D1, C116 §9a
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The three surfaces the founder's transmission names, as a CLOSED union with a
 * value roster so a new member is a compile error at every exhaustive switch.
 *
 * ⛔ NO `AUTHORABLE_SITEWORKS_ROLES` SUBSET IS MINTED, and the absence is
 * deliberate rather than an oversight. `SpaceEnvelope` has one because
 * `maximumBuildable` is DECLARED-AND-REFUSED there: a hand-drawn volume calling
 * itself the legal ceiling is indistinguishable from one the law produced.
 * **Nothing in this family makes a legal claim, so there is nothing to refuse**, and
 * a subset with identical membership would be a second vocabulary answering a
 * question that has exactly one answer (C84 EI-8). If a non-authorable role ever
 * appears — a road SURVEYED from context data, say — its subset arrives in the
 * SAME commit.
 */
export const SITEWORKS_ROLES = ['road', 'parking', 'pedestrian'] as const;
export type SiteworksRole = (typeof SITEWORKS_ROLES)[number];
export const SiteworksRoleSchema = z.enum(SITEWORKS_ROLES);

/**
 * ⭐ A ROLE CANNOT EXIST IN THIS CODEBASE WITHOUT AN EXPLANATION. The typed
 * `Record<>` makes that a compile error rather than a review comment — the
 * `SPACE_ENVELOPE_ROLES` property, inherited.
 */
export const SITEWORKS_ROLE_EXPLANATIONS: Record<SiteworksRole, string> = {
    road: 'A vehicular carriageway. Normally authored linearly, from a centreline and a width.',
    parking:
        'A surface for stationary vehicles. Normally authored areally, as a ring; bay layout '
        + 'and markings are NOT modelled (C116 §12).',
    pedestrian:
        'A footway, plaza or shared surface for people on foot. Either form; the width '
        + 'default is an accessibility minimum, not a design target.',
};

// ─────────────────────────────────────────────────────────────────────────────
// THE FORM VOCABULARY — ADR-0384 D2, C116 §5
// ─────────────────────────────────────────────────────────────────────────────

/**
 * HOW the surface was authored. ⭐ `form` IS ORTHOGONAL TO `role`, and the schema
 * does not pretend otherwise: a lay-by is a LINEAR parking surface and a plaza is
 * an AREAL pedestrian one. **Six combinations, all legal.** Pinning `form` to
 * `role` would be exactly the N×N table C83 §2.1 refuses, at 3×2.
 */
export const SITEWORKS_FORMS = ['linear', 'areal'] as const;
export type SiteworksForm = (typeof SITEWORKS_FORMS)[number];
export const SiteworksFormSchema = z.enum(SITEWORKS_FORMS);

export const SITEWORKS_FORM_EXPLANATIONS: Record<SiteworksForm, string> = {
    linear:
        'A centreline plus a width — the Wall shape. The swept ring is DERIVED by '
        + 'sweepCentrelineToRing and is NEVER stored (ADR-0384 D2).',
    areal:
        'A boundary ring plus holes — the Slab shape. An arbitrary parking lot is not the '
        + 'sweep of any polyline, so this form is not a convenience, it is a necessity.',
};

// ─────────────────────────────────────────────────────────────────────────────
// THE CITED DEFAULTS — ADR-0384 D6, C116 §9d
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⛔ A BARE NUMBER CANNOT SAY WHERE IT CAME FROM, AND A NUMBER THAT CANNOT SAY
 * WHERE IT CAME FROM IS [[fake-more-capable-than-real]]. A fabricated standard is
 * worse than an admitted convention, so a default is a RECORD, never a literal.
 *
 * ⭐ §CONTEXT-DATA-HONESTY (L-581 / L-616) IS ENFORCED BY THE TYPE, NOT BY A
 * COMMENT. The two arms are structurally different: the `standard` arm REQUIRES an
 * `instrument` string, and the `convention` arm REQUIRES a `whyNoInstrument`
 * sentence. **It is therefore impossible to express "there is no instrument"
 * without also saying why** — so "we looked and found none" can never be written
 * with the same shape as "we did not look", which is the exact conflation those
 * two issue rows exist to prevent.
 */
export type CitedDefault =
    | {
        readonly standing: 'standard';
        readonly valueM: number;
        /** The instrument that fixes this figure. Cite it precisely enough to find. */
        readonly instrument: string;
        readonly note: string;
    }
    | {
        readonly standing: 'convention';
        readonly valueM: number;
        /** ⭐ Structurally `null`: there is NO instrument, and the next field says why. */
        readonly instrument: null;
        /** ⛔ REQUIRED. Why no instrument fixes this figure — not "we did not check". */
        readonly whyNoInstrument: string;
        readonly note: string;
    };

/**
 * The per-role starting width in metres.
 *
 * ⛔ A DEFAULT IS NOT A CONSTRAINT. Nothing here refuses a 3 m road or a 40 m one.
 * The width is the user's; the citation explains where the STARTING number came
 * from, which is precisely what the founder asked for ("starting for a typical
 * national road two-sense wide") and no more.
 *
 * ⚠ THESE ARE JURISDICTION-ROOTED, AND THIS SAYS SO RATHER THAN IMPLYING
 * UNIVERSALITY. They are Spanish instruments because Spain is where this product's
 * jurisdiction work is deepest. A jurisdiction pack that resolves a local
 * carriageway width would make these the FALLBACK it overrides — which is why this
 * is a keyed record with a named source and not three literals in a tool file.
 */
export const SITEWORKS_DEFAULT_WIDTH_M: Record<SiteworksRole, CitedDefault> = {
    road: {
        standing: 'standard',
        valueM: 7.0,
        instrument:
            'Norma 3.1-IC "Trazado" (Orden FOM/273/2016, BOE-A-2016-2217), §7 Tabla 7.1 '
            + '"Dimensiones de la sección transversal": carril = 3,50 m for a carretera '
            + 'convencional of class C-100 / C-90 / C-80. Two-way = two lanes = 2 × 3,50 m.',
        note:
            '⭐ THIS IS THE CALZADA (carriageway) AND THE ARCENES (shoulders) ARE DELIBERATELY '
            + 'EXCLUDED. Tabla 7.1\'s C-80 section also carries 1,00 m arcenes; a shoulder is a '
            + 'different surface with a different role and a different build-up, and folding it '
            + 'into the default would inflate every paved-area figure this family ever reports by '
            + 'nearly 30 %, silently. ⚠ Cross-checked for ORDER OF MAGNITUDE only against UK DMRB '
            + 'CD 127 (two-lane single carriageway 7.3 m) — within 4 %, which is evidence the '
            + 'number is not parochial and is NOT a second citation for it.',
    },
    pedestrian: {
        standing: 'standard',
        valueM: 1.8,
        instrument:
            'Orden VIV/561/2010, art. 5.2 — an itinerario peatonal accesible has an anchura '
            + 'libre de paso of not less than 1,80 m.',
        note:
            'An ACCESSIBILITY MINIMUM, not a design target — a plaza is far wider and a garden '
            + 'path may legitimately be narrower, since art. 5.2 binds the accessible itinerary '
            + 'rather than every paved strip. ⚠ NOT MEASURED: whether its successor Orden '
            + 'TMA/851/2021 restates the figure.',
    },
    parking: {
        standing: 'convention',
        valueM: 5.0,
        instrument: null,
        whyNoInstrument:
            'There is NO Spanish national trazado instrument that fixes a parking-bay dimension. '
            + 'Bay geometry is set by municipal ordinance / PGOU, which is a per-jurisdiction fact '
            + 'this family does not resolve. ⚠ NOT MEASURED: whether any national instrument fixes '
            + 'it. ⛔ This was looked for and not found — it is NOT "not checked".',
        note:
            'One bay depth. ⛔ Shipped as an ADMITTED CONVENTION and never presented as a '
            + 'standard: the founder\'s brief forbids a fabricated standard by name, and an honest '
            + 'convention is the correct answer where no instrument exists.',
    },
};

/**
 * The starting build-up depth in metres, for every role.
 *
 * ⚠ ONE VALUE, NOT A PER-ROLE RECORD, and that is honest rather than lazy: there
 * is no instrument-backed per-role figure to differentiate them with, so three
 * numbers would imply three sources where there are none.
 */
export const SITEWORKS_DEFAULT_THICKNESS_M: CitedDefault = {
    standing: 'convention',
    valueM: 0.3,
    instrument: null,
    whyNoInstrument:
        'Spanish firme (pavement) sections ARE normalised — Norma 6.1-IC "Secciones de firme" '
        + '(Orden FOM/3460/2003) — but as a TABLE keyed on traffic category (T00–T42) and '
        + 'subgrade bearing capacity (E1–E3), which yields total depths spanning roughly '
        + '0,25–0,75 m. ⛔ This family resolves NEITHER input, so selecting one cell of that '
        + 'table and calling it the default would be citing an instrument for a number the '
        + 'instrument does not give. ⚠ NOT MEASURED: which 6.1-IC section applies to any given '
        + 'surface.',
    note:
        'A mid-to-thin flexible-pavement total depth, chosen so the surface reads as a '
        + 'CONSTRUCTION rather than a zero-depth plane. The founder asked for "a thickness that '
        + 'the user can add" — this is the starting value, and it is the user\'s to change.',
};

// ─────────────────────────────────────────────────────────────────────────────
// THE ELEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ⚠ ADR-0384 D2 SAYS "a discriminated union on `form`". THIS IS A FLAT OBJECT
 * WITH `form` AS THE DISCRIMINANT AND `.refine()` ENFORCING THE PAIRING, AND THE
 * DIVERGENCE IS RECORDED RATHER THAN SILENT.
 *
 * Two measured reasons, neither of them preference:
 *   1. **`defineElement` returns a `z.object`** — it mints the branded id regex and
 *      the `BaseNodeShape` at the object level. A `z.discriminatedUnion` of two
 *      `defineElement` calls is not a `ZodObject`, and `SCHEMA_REGISTRY` maps one
 *      kind to one schema.
 *   2. **No element schema in this repository uses `discriminatedUnion`** —
 *      measured: `grep -rn "discriminatedUnion" packages/schemas/src/elements/` →
 *      no output. Consistency with 30-odd neighbours beats a lone exception.
 *
 * ⭐ THE SEMANTICS D2 ASKED FOR ARE FULLY PRESERVED, AND ENFORCED RATHER THAN
 * DOCUMENTED: the wrong-form geometry field is REFUSED by a `.refine()`, not
 * ignored by a convention. C84 §8.d — "a comment as the synchronisation
 * mechanism" — has failed twice in this repo and is not used here.
 */
export const Siteworks = defineElement('siteworks', {
    /**
     * PV-04 / C75 §2.4 — where this element's values came from. Spelled out at
     * the point of use rather than spread from a shared constant, because
     * `check-provenance-coverage` measures the file that declares
     * `defineElement('<kind>')` and an indirection hides the field from its C3
     * retrofit-safety arm.
     */
    provenance: RetrofittedProvenanceSchema,
    /** PV-06 / C75 §1.3 — how much these values can be TRUSTED. A separate axis. */
    confidence: RetrofittedConfidenceSchema,

    /**
     * The storey this surface is seated on. `baseOffset` and `thickness` are
     * measured from that level's datum.
     *
     * ⚠ L-584 IS NOT RE-IMPORTED HERE, AND THE OMISSION IS DELIBERATE (ADR-0384
     * D5). A siteworks surface records NO TERRAIN RELATIONSHIP AT ALL. The
     * ordinance measures the rasante AT THE FAÇADE; PRYZM samples ONE terrain
     * point at the centroid. ⛔ A road that silently draped itself over a
     * one-point sample would be GEOMETRY THE USER BELIEVES — worse than a wrong
     * number in a panel, because a panel figure is read sceptically and a road is
     * not. Draping is REFUSED BY NAME today (C116 §12) and gated on a terrain
     * sampler that returns a profile rather than a point (C116 §11 item 1).
     */
    levelId: z.string().default(''),

    /** User-facing name. Never generated from the role alone. */
    name: z.string().default('Siteworks'),

    /** WHAT THIS SURFACE IS FOR. See {@link SITEWORKS_ROLE_EXPLANATIONS}. */
    role: SiteworksRoleSchema.default('road'),

    /** HOW IT WAS AUTHORED. See {@link SITEWORKS_FORM_EXPLANATIONS}. */
    form: SiteworksFormSchema.default('linear'),

    // ── LINEAR GEOMETRY — the Wall shape ────────────────────────────────────

    /**
     * The OPEN polyline the surface is swept along, on the level's XZ plane, in
     * metres. Required (≥2 points) when `form: 'linear'`; MUST BE EMPTY when
     * `form: 'areal'` — both enforced below.
     *
     * ⭐ THE SWEPT RING IS DERIVED AND IS NEVER STORED (ADR-0384 D2). This is the
     * WALL's own rule, not a new one: `Wall` stores `start`, `end` and
     * `thickness` and does not store the rectangle those three imply. Storing the
     * ring would destroy the authored intent irreversibly — "make this road 9 m
     * wide" would become an edit of forty ring vertices instead of one number —
     * and storing BOTH would be two answers to "where is this road" (C84 EI-9)
     * where the second goes stale on the next `setWidth`.
     *
     * ⚠ `y` IS REQUIRED TO BE EXACTLY 0 AND IS CHECKED. `Vec3` is used because it
     * is what `Room.boundary`, `BoundaryLine.vertices`, `SpaceEnvelope.footprint`
     * and `Slab.boundary` already share, and minting a fifth ground-plane point
     * vocabulary would be C84 EI-8.
     */
    centreline: z
        .array(Vec3)
        .default([
            { x: 0, y: 0, z: 0 },
            { x: 10, y: 0, z: 0 },
        ]),

    /**
     * Carriageway / footway width in metres, measured PERPENDICULAR to the
     * centreline. Linear form only.
     *
     * ⛔ THIS IS NOT `thickness`. They are perpendicular and both are metres,
     * which is exactly why they are two separately-named fields and two separate
     * verbs (C116 §6b) rather than one `setDimension` taking an axis.
     */
    widthM: z.number().positive().default(SITEWORKS_DEFAULT_WIDTH_M.road.valueM),

    // ── AREAL GEOMETRY — the Slab shape, spellings taken unchanged ──────────

    /**
     * The OPEN boundary ring on the level's XZ plane (the closing vertex is
     * IMPLIED and duplicating it is refused). Required (≥3) when `form: 'areal'`;
     * MUST BE EMPTY when `form: 'linear'`.
     *
     * ⭐ `boundary`, `holes`, `thickness` and `baseOffset` are `Slab`'s spellings
     * taken unchanged (C116 §9c). Two conventions for "is the ring closed?" is how
     * a polygon area comes out wrong by one triangle in exactly one consumer.
     */
    boundary: z.array(Vec3).default([]),

    /** Voids in an areal surface — a planted island in a car park. Same ring rules. */
    holes: z.array(z.array(Vec3)).default([]),

    // ── THE PLATE ───────────────────────────────────────────────────────────

    /**
     * Build-up depth in metres, hanging BELOW the finished surface. The founder's
     * *"a thickness that the user can add"*. Starting value:
     * {@link SITEWORKS_DEFAULT_THICKNESS_M}.
     *
     * ⭐ THE DATUM RULE IS MEASURED OUT OF `Slab`, NOT REASONED TO (ADR-0384 D4):
     *     worldY = level.elevation + baseOffset − thickness
     * — `packages/geometry-slab/src/SlabFragmentBuilder.ts:1090`, and `:1258`
     * `return topY - data.thickness`. The user positions the surface they will
     * STAND ON; the construction is underneath it. Had this family reasoned to
     * "roads extrude down because you drive on the top" without measuring, it
     * would have been right BY LUCK — and the next family would have reasoned to
     * the opposite, and nobody would have noticed until two surfaces at the same
     * `baseOffset` failed to meet.
     */
    thickness: z.number().positive().default(SITEWORKS_DEFAULT_THICKNESS_M.valueM),

    /** Metres above the owning level's datum at which the FINISHED surface sits. */
    baseOffset: z.number().default(0),

    // ── MATERIAL — C100 §2.1, C116 §9e (amended) ────────────────────────────

    /**
     * Reference into the master material database (C100).
     *
     * ⚠ C116 §9e AS MINTED REFUSED THIS FIELD, AND WAS AMENDED because it
     * conflated two different things. `check-material-id-required` ARM A is
     * HARD-0 on a colour field without a `materialId` — C100 §2.1: *"a hex is not
     * a material; it is one attribute of one."* `Slab.ts:60-62` declares
     * `materialId`, `materialColor` and `systemTypeId` as three separate fields,
     * which proves the C100 REFERENCE is separable from the ASSEMBLY machinery.
     *
     * ⛔ `systemTypeId` AND `layers` ARE STILL REFUSED, which is what §9e actually
     * objected to: adopting `Slab`'s system-type machinery would make a car park
     * SCHEDULABLE AS BUILDING FABRIC. A real paving build-up is C116 §11 item 6
     * and must not arrive as `Slab`'s system type.
     */
    materialId: z.string().optional(),

    /** Optional display tint. The renderer supplies the default. */
    materialColor: z.string().optional(),
})
    // ── INVARIANTS — ENFORCED, NEVER DOCUMENTED (C84 §8.d, EI-2.d) ──────────
    .refine(
        (e) => e.centreline.every((p) => p.y === 0),
        {
            message:
                'Siteworks.centreline vertices must have y === 0 — the polyline lies on the '
                + "level's XZ plane and the vertical extent is baseOffset + thickness. A "
                + 'non-zero y would be information carried in a field no consumer reads '
                + '(C84 EI-2.d).',
        },
    )
    .refine(
        (e) =>
            e.boundary.every((p) => p.y === 0)
            && e.holes.every((h) => h.every((p) => p.y === 0)),
        {
            message:
                'Siteworks.boundary and Siteworks.holes vertices must have y === 0 — same '
                + 'ground-plane rule as the centreline (C84 EI-2.d).',
        },
    )
    .refine(
        (e) => e.form !== 'linear' || e.centreline.length >= 2,
        {
            message:
                'A LINEAR siteworks surface needs a centreline of at least 2 points — one '
                + 'point is a location, not a road.',
        },
    )
    .refine(
        (e) => e.form !== 'linear' || (e.boundary.length === 0 && e.holes.length === 0),
        {
            message:
                'A LINEAR siteworks surface must not carry a boundary or holes — its ring is '
                + 'DERIVED by sweepCentrelineToRing and never stored (ADR-0384 D2). A stored '
                + 'ring is a cache, and it goes stale on the next setWidth.',
        },
    )
    .refine(
        (e) => e.form !== 'areal' || e.boundary.length >= 3,
        {
            message:
                'An AREAL siteworks surface needs a boundary ring of at least 3 points.',
        },
    )
    .refine(
        (e) => e.form !== 'areal' || e.centreline.length === 0,
        {
            message:
                'An AREAL siteworks surface must not carry a centreline — an arbitrary parking '
                + 'lot is not the sweep of any polyline, and a second geometry source would be '
                + 'two answers to "where is this surface" (C84 EI-9).',
        },
    )
    .refine(
        (e) =>
            [e.boundary, ...e.holes].every(
                (ring) =>
                    ring.length < 2
                    || !(
                        ring[0]!.x === ring[ring.length - 1]!.x
                        && ring[0]!.z === ring[ring.length - 1]!.z
                    ),
            ),
        {
            message:
                'Siteworks rings are OPEN — the closing vertex is implied and must not be '
                + 'duplicated. `Slab`\'s convention, taken unchanged: two conventions for "is '
                + 'the ring closed?" is how a polygon area comes out wrong by one triangle in '
                + 'exactly one consumer (C116 §9c).',
        },
    )
    .refine(
        (e) =>
            e.centreline.every(
                (p, i) =>
                    i === 0
                    || !(p.x === e.centreline[i - 1]!.x && p.z === e.centreline[i - 1]!.z),
            ),
        {
            message:
                'Siteworks.centreline must not contain consecutive duplicate points — a '
                + 'zero-length segment has no direction, so the sweep normal is undefined and '
                + 'sweepCentrelineToRing would emit NaN rather than refuse.',
        },
    );

export type Siteworks = z.infer<typeof Siteworks>;
