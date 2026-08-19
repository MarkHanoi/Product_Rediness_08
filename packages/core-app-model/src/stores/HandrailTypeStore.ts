import { HandrailBalusterShape, HandrailFillType, HandrailRailProfile } from './HandrailTypes';
// §FEAT-HANDRAIL-BAR-GUARD-MATRIX (C100 §2.1) — the MASTER catalogue. The bar-guard
// matrix below REFERENCES ids from it and mints nothing; the label is read from here so a
// preset can never advertise a material name the catalogue does not agree with.
// L0 data package — plain scalars, no THREE, no DOM.
import { MATERIAL_CATALOG } from '@pryzm/schemas/materials';

export interface HandrailTypeDefinition {
    id: string;
    name: string;
    description: string;
    isBuiltIn: boolean;
    height: number;
    thickness: number;
    baseOffset: number;
    fillType: HandrailFillType;
    railProfile: HandrailRailProfile;
    railDiameter?: number;
    postSpacing?: number;
    /**
     * §C100-HANDRAIL-MATERIAL-ID (C100 §2.1) — the MASTER material this type is
     * made of, REFERENCED by id from `MATERIAL_CATALOG` (`@pryzm/schemas/materials`).
     *
     * ⛔ THIS REPLACES `materialColor` ON EVERY BUILT-IN, and the replacement is
     * not cosmetic. C100 §2.1: *"a family MUST NOT store only a hex and call it a
     * material … an element carrying only a hex has irreversibly lost the name —
     * no schedule can count it, no IFC export can classify it, and no library edit
     * can reach it."* Worse than losing the name: `resolveMaterialColour` treats a
     * stored hex as an explicit USER OVERRIDE, which by C100 §2.2 a library edit is
     * *not allowed* to reach — so shipping both would have silently opted every
     * railing placed from the catalogue OUT of the master library, permanently.
     */
    materialId?: string;
    /**
     * ⚠ AN EXPLICIT USER OVERRIDE ONLY — C100 §2.1's one legal role for a hex.
     *
     * ⛔ MUST remain `undefined` on every BUILT-IN type (asserted by
     * `handrailTypeMaterialC100.test.ts`). A user-authored type may set it; when
     * set it SHADOWS `materialId`, and the UI must show it as an override
     * (C100 §6.1 — an invisible override is indistinguishable from a stale copy).
     */
    materialColor?: string;
    /**
     * §FIX-STAIR-RAILING-TYPE-PICKER — the NAMED material this type is made of.
     *
     * `materialColor` is a render tint; it is not a material. The stair-railing
     * family (`StairRailingBuilder.makeMaterial`) is driven by a NAME
     * ('steel' | 'chrome' | 'wood' | 'timber' | 'concrete' | 'glass') because the
     * name carries roughness / metalness / transparency, not just a hue. Until this
     * field existed the catalogue could not express "this railing is timber", so a
     * catalogue type applied to a stair railing kept the previous material and only
     * its geometry changed — a half-applied type. Additive and optional: every
     * existing consumer that reads `materialColor` is unaffected.
     */
    materialName?: 'steel' | 'chrome' | 'wood' | 'timber' | 'concrete' | 'glass';
    /**
     * §FEAT-HANDRAIL-TYPE-LIBRARY-20 (C95 D5) — the infill members, so a catalogue
     * type can describe a BALUSTRADE and not merely "something with balusters".
     * All four reach `HandrailData` unchanged through `CreateHandrailCommand` and
     * are read by `HandrailFragmentBuilder`.
     */
    balusterShape?: HandrailBalusterShape;
    balusterWidth?: number;
    balusterSpacing?: number;
    /**
     * Maximum CLEAR opening between adjacent balusters, in metres — the code rule
     * ("a 100 mm sphere must not pass" -> 0.099). See `HandrailData.infillMaxGap`:
     * this is the CONSTRAINT, `balusterSpacing` is the resulting centre pitch, and
     * the builder derives the pitch from it only when no explicit pitch is given.
     */
    infillMaxGap?: number;
}

const BUILT_IN_TYPES: HandrailTypeDefinition[] = [
    {
        id: 'glass-guardrail',
        name: 'Glass Guardrail',
        description: 'Full-height glass panel guardrail, 1100 mm, suitable for balconies and terraces.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.012,
        baseOffset: 0.0,
        fillType: 'glass',
        railProfile: 'round',
        railDiameter: 0.04,
        postSpacing: 1.5,
        materialId: 'glass-structural',
        materialName: 'steel'
    },
    {
        id: 'stainless-handrail',
        name: 'Stainless Steel Handrail',
        description: 'Circular stainless-steel handrail at 900 mm, for stairs and ramps.',
        isBuiltIn: true,
        height: 0.9,
        thickness: 0.04,
        baseOffset: 0.0,
        fillType: 'open',
        railProfile: 'round',
        railDiameter: 0.04,
        postSpacing: 1.2,
        materialId: 'steel-stainless-brushed',
        materialName: 'chrome'
    },
    {
        id: 'timber-baluster',
        name: 'Timber Baluster Railing',
        description: 'Timber posts with rectangular baluster infill at 1000 mm.',
        isBuiltIn: true,
        height: 1.0,
        thickness: 0.05,
        baseOffset: 0.0,
        fillType: 'baluster',
        railProfile: 'rectangular',
        postSpacing: 1.8,
        balusterShape: 'rectangular',
        balusterWidth: 0.02,
        infillMaxGap: 0.099,
        // ⛔ §FIX-HANDRAIL-INFILLMAXGAP-DEAD (C95 §15.16) — `balusterSpacing` IS THE
        // FIX, AND ITS ABSENCE WAS A CHILD-SAFETY DEFECT. `HandrailFragmentBuilder`
        // resolves the pitch as `balusterSpacing ?? postSpacing ?? (infillMaxGap + width)`,
        // so this type — which set `postSpacing` and omitted `balusterSpacing` — NEVER
        // REACHED `infillMaxGap`: its balusters were built at the POST spacing. The
        // description below has always claimed a 100 mm-sphere-compliant pitch; measured,
        // it shipped a clear opening of over a metre. The pitch is now stated explicitly
        // as `infillMaxGap + balusterWidth`, which is the identity the rule defines.
        balusterSpacing: 0.119,
        materialId: 'wood-oak',
        materialName: 'timber'
    },
    {
        id: 'steel-guardrail',
        name: 'Steel Guardrail',
        description: 'Heavy-duty steel guardrail at 1100 mm for industrial and commercial use.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.05,
        baseOffset: 0.0,
        fillType: 'open',
        railProfile: 'rectangular',
        postSpacing: 1.5,
        materialId: 'steel-structural',
        materialName: 'steel'
    },
    {
        id: 'stair-handrail',
        name: 'Stair Handrail',
        description: 'Compact handrail for stair landings and stairwells at 900 mm.',
        isBuiltIn: true,
        height: 0.9,
        thickness: 0.04,
        baseOffset: 0.0,
        fillType: 'open',
        railProfile: 'round',
        railDiameter: 0.04,
        postSpacing: 0,
        materialId: 'steel-stainless-brushed',
        materialName: 'steel'
    },

    // -------------------------------------------------------------------------
    // §FEAT-HANDRAIL-TYPE-LIBRARY-20 (founder 2026-08-18; C95 D5)
    //
    // THE FOUNDER, in substance: "the railing is conceptually really similar to the
    // wall element ... the user could select from a number of railings (please
    // create 20 types)". Wall's catalogue is `WallSystemTypeStore`; this is its
    // handrail twin, and -- exactly as there -- the CREATION panel reads THIS store,
    // so the pre-draw dropdown can never list a set the property panel does not
    // offer (C84 EI-9: one question, one answer).
    //
    // THE FIVE TYPES ABOVE ARE NOT REPLACED. They keep their ids because saved
    // projects reference them; deleting an id to make room for a nicer name would be
    // a silent data loss (C84 EI-6 -- absence must be loud). The library is the 5
    // pre-existing plus 15 new = 20.
    //
    // -- WHAT A TYPE CAN AND CANNOT SAY, MEASURED, NOT ASSUMED ------------------
    // `HandrailFragmentBuilder` implements FOUR infills: `glass` (transparent
    // sheet), `panel` (solid sheet), `baluster` (repeated vertical members) and
    // `open` (nothing, deliberately). Several real railing families have an infill
    // outside that set, and a catalogue that pretended otherwise would be an
    // affordance with no implementation (C65 §3.9 / C84 EI-3). They are mapped to
    // the nearest BUILDABLE infill and the substitution is stated in the description
    // the user reads, never hidden:
    //
    //   * CABLE            -> `open`.  Posts and graspable rail are real; the
    //                        horizontal strands are NOT modelled. `infillMaxGap`
    //                        still carries the code constraint for schedules.
    //   * MESH/PERFORATED  -> `panel`. A solid board stands in for the sheet; the
    //                        weave / perforation pattern is not modelled.
    //   * PIPE mid-rails   -> `open`.  Intermediate horizontal rails not modelled.
    //
    // These three substitutions are recorded in C95 §12 as DECLARED refusals.
    //
    // -- `thickness` IS THE RAIL SECTION, NOT THE GLASS -------------------------
    // Measured in `HandrailFragmentBuilder`: the rectangular top rail is
    // `BoxGeometry(len, 0.05, handrail.thickness)`, i.e. `thickness` is the rail's
    // cross-section DEPTH; the glass infill's depth is a hard-coded 0.01 and a solid
    // panel's is `thickness * 0.4`. A glass type therefore cannot express "17.6 mm
    // laminated" -- recorded in C95 §12, not faked here.
    //
    // -- GRASPABLE-RAIL PROFILE -------------------------------------------------
    // The founder's list names a "graspable-rail profile". It is deliberately NOT
    // minted as a new field: `railProfile` plus (`railDiameter` | `thickness`)
    // ALREADY IS the graspable rail's profile and section, and a second vocabulary
    // for one fact is exactly what C84 EI-8 forbids. Circular graspable rails here
    // are 0.040-0.050 m diameter, the range the common codes require.
    // -------------------------------------------------------------------------

    {
        id: 'metal-balustrade-square',
        name: 'Metal Balustrade -- Square Bar',
        description: 'Square-bar steel balusters at a 100 mm-sphere-compliant pitch under a flat capping rail, 1100 mm.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.05,
        baseOffset: 0.0,
        fillType: 'baluster',
        railProfile: 'rectangular',
        postSpacing: 1.5,
        balusterShape: 'rectangular',
        balusterWidth: 0.016,
        infillMaxGap: 0.099,
        // ⛔ §FIX-HANDRAIL-INFILLMAXGAP-DEAD (C95 §15.16) — `balusterSpacing` IS THE
        // FIX, AND ITS ABSENCE WAS A CHILD-SAFETY DEFECT. `HandrailFragmentBuilder`
        // resolves the pitch as `balusterSpacing ?? postSpacing ?? (infillMaxGap + width)`,
        // so this type — which set `postSpacing` and omitted `balusterSpacing` — NEVER
        // REACHED `infillMaxGap`: its balusters were built at the POST spacing. The
        // description below has always claimed a 100 mm-sphere-compliant pitch; measured,
        // it shipped a clear opening of over a metre. The pitch is now stated explicitly
        // as `infillMaxGap + balusterWidth`, which is the identity the rule defines.
        balusterSpacing: 0.115,
        materialId: 'steel-structural',
        materialName: 'steel'
    },
    {
        id: 'metal-balustrade-round',
        name: 'Metal Balustrade -- Round Bar',
        description: 'Round-bar steel balusters with a 42 mm circular graspable rail, 1100 mm.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.042,
        baseOffset: 0.0,
        fillType: 'baluster',
        railProfile: 'round',
        railDiameter: 0.042,
        postSpacing: 1.5,
        balusterShape: 'round',
        balusterWidth: 0.016,
        infillMaxGap: 0.099,
        // ⛔ §FIX-HANDRAIL-INFILLMAXGAP-DEAD (C95 §15.16) — `balusterSpacing` IS THE
        // FIX, AND ITS ABSENCE WAS A CHILD-SAFETY DEFECT. `HandrailFragmentBuilder`
        // resolves the pitch as `balusterSpacing ?? postSpacing ?? (infillMaxGap + width)`,
        // so this type — which set `postSpacing` and omitted `balusterSpacing` — NEVER
        // REACHED `infillMaxGap`: its balusters were built at the POST spacing. The
        // description below has always claimed a 100 mm-sphere-compliant pitch; measured,
        // it shipped a clear opening of over a metre. The pitch is now stated explicitly
        // as `infillMaxGap + balusterWidth`, which is the identity the rule defines.
        balusterSpacing: 0.115,
        materialId: 'steel-structural',
        materialName: 'steel'
    },
    {
        id: 'glass-frameless',
        name: 'Frameless Glass Balustrade',
        description: 'Structural glass with no intermediate posts under a slim circular cap rail, 1100 mm. Glass thickness is not modelled -- see the type-library note.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.042,
        baseOffset: 0.0,
        fillType: 'glass',
        railProfile: 'round',
        railDiameter: 0.042,
        postSpacing: 0,
        materialId: 'glass-structural',
        materialName: 'glass'
    },
    {
        id: 'glass-clamped',
        name: 'Clamped Glass Balustrade',
        description: 'Point-fixed glass on stainless posts at 1200 mm centres with a circular cap rail, 1100 mm.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.042,
        baseOffset: 0.0,
        fillType: 'glass',
        railProfile: 'round',
        railDiameter: 0.042,
        postSpacing: 1.2,
        materialId: 'glass-clear',
        materialName: 'chrome'
    },
    {
        id: 'glass-channel',
        name: 'Channel-Fixed Glass Balustrade',
        description: 'Glass set in a continuous base shoe (30 mm base offset), no intermediate posts, rectangular cap, 1100 mm.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.05,
        baseOffset: 0.03,
        fillType: 'glass',
        railProfile: 'rectangular',
        postSpacing: 0,
        materialId: 'glass-structural',
        materialName: 'glass'
    },
    {
        id: 'cable-stainless',
        name: 'Stainless Cable Railing',
        description: 'Stainless posts at 1070 mm with a 48 mm circular rail, 1070 mm high. The horizontal cable strands are NOT modelled -- posts and rail only.',
        isBuiltIn: true,
        height: 1.07,
        thickness: 0.048,
        baseOffset: 0.0,
        fillType: 'open',
        railProfile: 'round',
        railDiameter: 0.048,
        postSpacing: 1.07,
        infillMaxGap: 0.089,
        materialId: 'steel-stainless-brushed',
        materialName: 'chrome'
    },
    {
        id: 'timber-picket',
        name: 'Timber Picket Railing',
        description: 'Sawn timber pickets at a 100 mm-sphere-compliant pitch between 1800 mm posts, 1000 mm.',
        isBuiltIn: true,
        height: 1.0,
        thickness: 0.07,
        baseOffset: 0.0,
        fillType: 'baluster',
        railProfile: 'rectangular',
        postSpacing: 1.8,
        balusterShape: 'rectangular',
        balusterWidth: 0.038,
        infillMaxGap: 0.099,
        // ⛔ §FIX-HANDRAIL-INFILLMAXGAP-DEAD (C95 §15.16) — `balusterSpacing` IS THE
        // FIX, AND ITS ABSENCE WAS A CHILD-SAFETY DEFECT. `HandrailFragmentBuilder`
        // resolves the pitch as `balusterSpacing ?? postSpacing ?? (infillMaxGap + width)`,
        // so this type — which set `postSpacing` and omitted `balusterSpacing` — NEVER
        // REACHED `infillMaxGap`: its balusters were built at the POST spacing. The
        // description below has always claimed a 100 mm-sphere-compliant pitch; measured,
        // it shipped a clear opening of over a metre. The pitch is now stated explicitly
        // as `infillMaxGap + balusterWidth`, which is the identity the rule defines.
        balusterSpacing: 0.137,
        materialId: 'wood-pine',
        materialName: 'timber'
    },
    {
        id: 'timber-glass-hybrid',
        name: 'Timber & Glass Balustrade',
        description: 'Mixed construction -- glass infill between timber posts under a timber capping rail, 1100 mm.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.07,
        baseOffset: 0.0,
        fillType: 'glass',
        railProfile: 'rectangular',
        postSpacing: 1.5,
        materialId: 'wood-oak',
        materialName: 'timber'
    },
    {
        id: 'wrought-iron-classic',
        name: 'Wrought Iron Balustrade',
        description: 'Slim round wrought-iron bars under a flat iron capping rail, 1000 mm.',
        isBuiltIn: true,
        height: 1.0,
        thickness: 0.04,
        baseOffset: 0.0,
        fillType: 'baluster',
        railProfile: 'rectangular',
        postSpacing: 1.5,
        balusterShape: 'round',
        balusterWidth: 0.014,
        infillMaxGap: 0.099,
        // ⛔ §FIX-HANDRAIL-INFILLMAXGAP-DEAD (C95 §15.16) — `balusterSpacing` IS THE
        // FIX, AND ITS ABSENCE WAS A CHILD-SAFETY DEFECT. `HandrailFragmentBuilder`
        // resolves the pitch as `balusterSpacing ?? postSpacing ?? (infillMaxGap + width)`,
        // so this type — which set `postSpacing` and omitted `balusterSpacing` — NEVER
        // REACHED `infillMaxGap`: its balusters were built at the POST spacing. The
        // description below has always claimed a 100 mm-sphere-compliant pitch; measured,
        // it shipped a clear opening of over a metre. The pitch is now stated explicitly
        // as `infillMaxGap + balusterWidth`, which is the identity the rule defines.
        balusterSpacing: 0.113,
        materialId: 'cast-iron',
        materialName: 'steel'
    },
    {
        id: 'wrought-iron-ornamental',
        name: 'Ornamental Wrought Iron Guard',
        description: 'Close-pitched square iron bars to a 90 mm sphere rule, 1100 mm. Scrollwork is not modelled.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.045,
        baseOffset: 0.0,
        fillType: 'baluster',
        railProfile: 'rectangular',
        postSpacing: 1.2,
        balusterShape: 'rectangular',
        balusterWidth: 0.014,
        infillMaxGap: 0.089,
        // ⛔ §FIX-HANDRAIL-INFILLMAXGAP-DEAD (C95 §15.16) — `balusterSpacing` IS THE
        // FIX, AND ITS ABSENCE WAS A CHILD-SAFETY DEFECT. `HandrailFragmentBuilder`
        // resolves the pitch as `balusterSpacing ?? postSpacing ?? (infillMaxGap + width)`,
        // so this type — which set `postSpacing` and omitted `balusterSpacing` — NEVER
        // REACHED `infillMaxGap`: its balusters were built at the POST spacing. The
        // description below has always claimed a 100 mm-sphere-compliant pitch; measured,
        // it shipped a clear opening of over a metre. The pitch is now stated explicitly
        // as `infillMaxGap + balusterWidth`, which is the identity the rule defines.
        balusterSpacing: 0.103,
        materialId: 'cast-iron',
        materialName: 'steel'
    },
    {
        id: 'steel-picket-flat',
        name: 'Flat-Bar Steel Picket Railing',
        description: 'Flat-bar steel pickets on edge under a rectangular capping rail, 1100 mm.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.05,
        baseOffset: 0.0,
        fillType: 'baluster',
        railProfile: 'rectangular',
        postSpacing: 1.5,
        balusterShape: 'rectangular',
        balusterWidth: 0.012,
        infillMaxGap: 0.099,
        // ⛔ §FIX-HANDRAIL-INFILLMAXGAP-DEAD (C95 §15.16) — `balusterSpacing` IS THE
        // FIX, AND ITS ABSENCE WAS A CHILD-SAFETY DEFECT. `HandrailFragmentBuilder`
        // resolves the pitch as `balusterSpacing ?? postSpacing ?? (infillMaxGap + width)`,
        // so this type — which set `postSpacing` and omitted `balusterSpacing` — NEVER
        // REACHED `infillMaxGap`: its balusters were built at the POST spacing. The
        // description below has always claimed a 100 mm-sphere-compliant pitch; measured,
        // it shipped a clear opening of over a metre. The pitch is now stated explicitly
        // as `infillMaxGap + balusterWidth`, which is the identity the rule defines.
        balusterSpacing: 0.111,
        materialId: 'steel-structural',
        materialName: 'steel'
    },
    {
        id: 'mesh-infill',
        name: 'Woven Mesh Infill Guard',
        description: 'Woven stainless mesh between steel posts, 1100 mm. Modelled as a solid infill panel -- the weave is not modelled.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.05,
        baseOffset: 0.0,
        fillType: 'panel',
        railProfile: 'rectangular',
        postSpacing: 1.5,
        materialId: 'steel-stainless-brushed',
        materialName: 'steel'
    },
    {
        id: 'perforated-panel',
        name: 'Perforated Metal Panel Guard',
        description: 'Perforated sheet infill between posts, 1100 mm. Modelled as a solid infill panel -- the perforation pattern is not modelled.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.05,
        baseOffset: 0.0,
        fillType: 'panel',
        railProfile: 'rectangular',
        postSpacing: 1.5,
        materialId: 'aluminium-anodised-silver',
        materialName: 'steel'
    },
    {
        id: 'industrial-pipe',
        name: 'Industrial Pipe Guardrail',
        description: '48.3 mm tubular steel guardrail on 1500 mm posts, 1100 mm. Intermediate horizontal mid-rails are NOT modelled.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.0483,
        baseOffset: 0.0,
        fillType: 'open',
        railProfile: 'round',
        railDiameter: 0.0483,
        postSpacing: 1.5,
        materialId: 'steel-galvanised',
        materialName: 'steel'
    },
    {
        id: 'cw-integrated-glass',
        name: 'Curtain-Wall Integrated Glass Guard',
        description: 'Glass guard set into a curtain-wall spandrel line -- no posts, rectangular transom cap, 1100 mm.',
        isBuiltIn: true,
        height: 1.1,
        thickness: 0.05,
        baseOffset: 0.0,
        fillType: 'glass',
        railProfile: 'rectangular',
        postSpacing: 0,
        materialId: 'glass-structural',
        materialName: 'glass'
    },
];

// ===========================================================================
// §FEAT-HANDRAIL-BAR-GUARD-MATRIX (C95 §15.16) — VERTICAL-BAR GUARDS, DERIVED
// FROM THE C100 MASTER CATALOGUE RATHER THAN HAND-WRITTEN.
//
// Founder: "Please create +20 more handrail types — with 5 to 10 cm vertical
// bars, in all possible materials including metal, copper… etc."
//
// --- ⚠ THE AMBIGUITY, RESOLVED IN THE OPEN --------------------------------
// "5 to 10 cm vertical bars" has two readings: bar WIDTH 50-100 mm, or bars
// EVERY 50-100 mm. This set reads it as BAR WIDTH, because that is what the
// words say, and because a bar every 50 mm with any real section is a
// near-solid screen rather than a balustrade.
//
// ⭐ THE READING IS ENCODED IN EVERY TYPE NAME — "Copper - New (Bright) — Bar
// Guard 60 mm" — so the founder sees which axis the number landed on the moment
// he opens the picker, and can correct it in one sentence. A silent guess on a
// 24-type batch is 24 wrong types.
//
// --- WHY A MATRIX AND NOT 24 LITERAL ROWS ---------------------------------
// This week's recurring defect in this repo is an ENUMERATED list that must be
// REMEMBERED rather than DERIVED: the hand-written shadow-freeze list that froze
// the viewport with eleven families missing (L-1189), and the `bim-railing-*`
// dead key that made handrails unpickable in 3D (L-1190). A 24-row literal is
// that defect with a picker attached — the next material silently falls out.
//
// So ONE row here is a (material, bar size, section shape) triple, and
// EVERYTHING else — name, description, height, thickness, rail profile, rail
// diameter, post spacing, end condition, baluster pitch, the legacy material
// name — is DERIVED. Adding a material is one line, and it cannot arrive
// missing a field.
//
// --- ⛔ NOT ONE NEW MATERIAL IS MINTED ------------------------------------
// Lane HR4 measured that ONE circular gesture minted 93 materials and the device
// dies near 100. Every row below REFERENCES an existing `MATERIAL_CATALOG` id
// (C100 §2.1), and `handrailBarGuardTypes.spec.ts` fails the build if any id is
// absent from the live catalogue. Nothing here carries a hex: a hex resolves
// FIRST and would make every later material pick a silent no-op (C100 §2.1,
// L-1196).
//
// MEASURED BEFORE DESIGNING, because "all possible materials" means all the ones
// that EXIST: the catalogue holds 24 Metal rows, including `copper-new` AND
// `copper-patinated`, `brass-polished`, `bronze-aged`, `cast-iron`, seven steels,
// two zincs and five aluminiums. The founder's "including metal, copper" is
// fully servable from what already exists, so NO master material needed minting.
// That is the finding, not a shortcut.
//
// --- ⭐ SAFETY: THE PITCH IS COMPUTED, NEVER TYPED ------------------------
// A barred guard is a child-safety element. The governing rule is that a 100 mm
// sphere must not pass through it. `infillMaxGap` is the CONSTRAINT and
// `balusterSpacing` is the resulting CENTRE pitch, related by
//
//     clear gap = pitch - bar width   =>   pitch = gap + bar width
//
// and this file computes the pitch from that identity on every row. A preset
// therefore cannot be internally inconsistent, and a bar size cannot be changed
// without the pitch following it.
//
// ⛔ AND `balusterSpacing` IS SET EXPLICITLY, WHICH IS LOAD-BEARING — see
// §FIX-HANDRAIL-INFILLMAXGAP-DEAD on the built-ins above. `HandrailFragmentBuilder`
// resolves the pitch as `balusterSpacing ?? postSpacing ?? (infillMaxGap + width)`,
// so a type that sets `postSpacing` and omits `balusterSpacing` NEVER REACHES
// `infillMaxGap` — its balusters land at the POST spacing.
//
// The 90 mm gap used here sits under the 100 mm sphere rule with margin rather
// than on the 99 mm line, because a shipped preset should not be one rounding
// away from non-compliant.
//
// ⚠ ADVISORY, NOT ENFORCED, AND THE DIFFERENCE IS MEASURED. NO layer in this
// repository evaluates a guard or balustrade rule. `packages/ordinance-extraction`
// is the PLANNING/zoning layer (envelopes, setbacks, heights) and says nothing
// about guards; `StairValidationAuthority` is region-aware (AS-1657 / EUROPEAN /
// IBC-USA) but contains ZERO references to railing, guard, baluster or handrail.
// The 100 mm sphere rule therefore lives in this repo only as prose and as the
// arithmetic below. These presets are code-PLAUSIBLE as shipped and tested to
// stay that way; they are NOT a compliance verdict, and the real verdict belongs
// to a jurisdiction authority that does not yet see this family.
// `StairValidationAuthority` is the precedent shape when one is built.
// ===========================================================================

/** The clear opening every shipped barred guard is built to, in metres. */
const BAR_GUARD_CLEAR_GAP_M = 0.09;

/** Guard height for a barred balustrade, in metres. */
const BAR_GUARD_HEIGHT_M = 1.1;

/** Cap-rail diameter for a ROUND-profile guard, in metres. */
const BAR_GUARD_ROUND_RAIL_DIA_M = 0.042;

/** One row of the matrix: a material, a bar size, and the bar's section shape. */
interface BarGuardRow {
    /** A `MATERIAL_CATALOG` id (C100 §2.1). Verified against the live catalogue. */
    readonly materialId: string;
    /** Bar width across the flat, or bar diameter, in MILLIMETRES — the founder's axis. */
    readonly barMm: number;
    readonly shape: HandrailBalusterShape;
}

/**
 * THE MATRIX. Bar sizes span the founder's 50-100 mm, and the size on each row is
 * an architectural judgement about the material rather than a filler value:
 *   - soft decorative metals (copper, brass, bronze) carry more section;
 *   - structural and stainless steels read better slimmer;
 *   - cast iron is traditionally chunky;
 *   - aluminium needs more section than steel for the same stiffness;
 *   - timber needs the most.
 */
const BAR_GUARD_ROWS: readonly BarGuardRow[] = [
    // -- Copper, brass, bronze — the founder named copper by name ----------
    { materialId: 'copper-new',                    barMm: 60,  shape: 'round' },
    { materialId: 'copper-patinated',              barMm: 60,  shape: 'round' },
    { materialId: 'brass-polished',                barMm: 50,  shape: 'round' },
    { materialId: 'bronze-aged',                   barMm: 60,  shape: 'rectangular' },
    { materialId: 'aluminium-bronze-anodised',     barMm: 70,  shape: 'rectangular' },

    // -- Steels ------------------------------------------------------------
    { materialId: 'steel-structural',              barMm: 50,  shape: 'rectangular' },
    { materialId: 'steel-blackened',               barMm: 50,  shape: 'rectangular' },
    { materialId: 'steel-blackened',               barMm: 80,  shape: 'rectangular' },
    { materialId: 'steel-stainless-brushed',       barMm: 50,  shape: 'round' },
    { materialId: 'steel-stainless-polished',      barMm: 50,  shape: 'round' },
    { materialId: 'steel-galvanised',              barMm: 60,  shape: 'rectangular' },
    { materialId: 'steel-corten',                  barMm: 80,  shape: 'rectangular' },
    { materialId: 'steel-blue-tempered',           barMm: 50,  shape: 'rectangular' },
    { materialId: 'steel-painted-red-oxide',       barMm: 60,  shape: 'rectangular' },
    { materialId: 'cast-iron',                     barMm: 80,  shape: 'round' },

    // -- Zinc --------------------------------------------------------------
    { materialId: 'zinc-natural',                  barMm: 70,  shape: 'rectangular' },
    { materialId: 'zinc-preweathered-bluegrey',    barMm: 70,  shape: 'rectangular' },

    // -- Aluminium ---------------------------------------------------------
    { materialId: 'aluminium-anodised-silver',     barMm: 60,  shape: 'round' },
    { materialId: 'aluminium-brushed-dark',        barMm: 70,  shape: 'rectangular' },
    { materialId: 'aluminium-powder-coated-dark',  barMm: 80,  shape: 'rectangular' },
    { materialId: 'aluminium-powder-coated-white', barMm: 80,  shape: 'rectangular' },

    // -- Timber — the "etc." -----------------------------------------------
    { materialId: 'wood-oak',                      barMm: 90,  shape: 'rectangular' },
    { materialId: 'wood-walnut',                   barMm: 90,  shape: 'rectangular' },
    { materialId: 'wood-teak',                     barMm: 100, shape: 'rectangular' },
];

/**
 * The LEGACY `materialName` vocabulary (`StairRailingBuilder.makeMaterial`), derived
 * by RULE rather than typed per row so it cannot drift from `materialId`.
 *
 * ⚠ This is one of the rival material vocabularies C100 is unifying. It is populated
 * here only so a bar guard applied to a STAIR railing does not keep the previous
 * material (the half-applied-type defect). When C100's unification lands, this
 * function is the single place to delete.
 */
function legacyMaterialName(materialId: string): NonNullable<HandrailTypeDefinition['materialName']> {
    if (materialId.startsWith('wood-')) return 'timber';
    if (materialId.endsWith('-polished')) return 'chrome';
    return 'steel';
}

/** Round to 4 dp so a derived pitch is a clean number rather than float noise. */
function round4(v: number): number {
    return Math.round(v * 1e4) / 1e4;
}

/**
 * Expand one matrix row into a COMPLETE `HandrailTypeDefinition`.
 *
 * ⭐ EVERY FIELD IS SET. C95 §15.15 records that applying a type MATERIALISES its
 * fields onto the record, and a user cannot see which value came from the type and
 * which from a builder default — so a preset that leaves a field implicit is a
 * preset whose result nobody can predict.
 *
 * `railDiameter` is the ONE deliberate omission, and only on rectangular profiles:
 * `HandrailFragmentBuilder` does not read it there (a rectangular cap rail is sized
 * from `thickness` and a fixed 0.05 depth), so setting it would ship a field that
 * looks authoritative and changes nothing.
 */
function expandBarGuard(row: BarGuardRow, label: string): HandrailTypeDefinition {
    const barWidth = round4(row.barMm / 1000);
    // clear gap = pitch - bar width  =>  pitch = gap + bar width. Computed, never typed.
    const balusterSpacing = round4(barWidth + BAR_GUARD_CLEAR_GAP_M);
    const isRound = row.shape === 'round';
    const isTimber = row.materialId.startsWith('wood-');
    const sectionWord = isRound ? 'round bar' : 'square bar';

    return {
        id: `bar-guard-${row.materialId}-${row.barMm}`,
        name: `${label} — Bar Guard ${row.barMm} mm`,
        description:
            `${row.barMm} mm ${sectionWord} vertical balusters at ${Math.round(balusterSpacing * 1000)} mm centres — a `
            + `${Math.round(BAR_GUARD_CLEAR_GAP_M * 1000)} mm clear opening, under the 100 mm sphere rule. `
            + `${Math.round(BAR_GUARD_HEIGHT_M * 1000)} mm guard height. Material referenced from the master catalogue.`,
        isBuiltIn: true,
        height: BAR_GUARD_HEIGHT_M,
        // The cap rail's section. Timber caps are broader than metal ones.
        thickness: isTimber ? 0.07 : 0.05,
        baseOffset: 0.0,
        fillType: 'baluster',
        railProfile: isRound ? 'round' : 'rectangular',
        ...(isRound ? { railDiameter: BAR_GUARD_ROUND_RAIL_DIA_M } : {}),
        // Structural post spacing — timber spans further between posts by convention.
        postSpacing: isTimber ? 1.8 : 1.5,
        // ⚠ `postEndCondition` IS DELIBERATELY ABSENT, AND THIS IS THE ONE PLACE THE
        // "no implicit defaults" rule above is knowingly broken — because setting it
        // would be WORSE than omitting it.
        //
        // `HandrailTypeDefinition` does not carry the field, and `resolveHandrailTypeFields`
        // does not project it (it moves thirteen fields; this is not one of them). Adding
        // it to the type would therefore ship a field that is authored on the preset and
        // MATERIALISES NOWHERE — the authored-but-unwired defect this lane has now hit
        // three times (L-1190's dead event key, L-1196's four-of-twenty-nine panel).
        //
        // Absent means `'redistribute'`, which is exactly the intent: the pitch is treated
        // as a MAXIMUM and the run divides into equal bays that never exceed it. On a
        // child-safety guard that is the only correct convention — `'fixed'` would leave
        // one short end bay, which is harmless, but nothing here should silently choose a
        // convention. ⛔ To make it authorable, widen the PROJECTION first, then the type.
        balusterShape: row.shape,
        balusterWidth: barWidth,
        // ⛔ EXPLICIT ON PURPOSE — see §FIX-HANDRAIL-INFILLMAXGAP-DEAD. Omitting it
        // lets the builder fall through to `postSpacing`, putting the balusters
        // 1.5 m apart on a child-safety guard.
        balusterSpacing,
        infillMaxGap: BAR_GUARD_CLEAR_GAP_M,
        materialId: row.materialId,
        materialName: legacyMaterialName(row.materialId),
    };
}

/**
 * The bar-guard family, built from the matrix.
 *
 * The display name comes from the CATALOGUE's own label, so a type can never
 * advertise a material name the catalogue does not agree with. An id absent from the
 * catalogue is a HARD THROW at module load rather than a row named `undefined`: a
 * preset naming a missing material renders grey and silently (L-1203's exact
 * symptom), so it must never reach a picker.
 */
function buildBarGuardTypes(): HandrailTypeDefinition[] {
    return BAR_GUARD_ROWS.map((row) => {
        const record = MATERIAL_CATALOG.find((m) => m.id === row.materialId);
        if (!record) {
            throw new Error(
                '[HandrailTypeStore] §FEAT-HANDRAIL-BAR-GUARD-MATRIX bar-guard row references materialId '
                + `'${row.materialId}', which is not in MATERIAL_CATALOG. A preset naming a missing `
                + 'material renders grey with no error (C100 §5).',
            );
        }
        return expandBarGuard(row, record.label);
    });
}

/**
 * §FEAT-HANDRAIL-BAR-GUARD-MATRIX — the built-in set the store seeds from.
 *
 * Kept as ONE exported array so `HandrailTypeStore`'s constructor and
 * `clearCustomTypes()` keep their existing single source, and so a test can sweep
 * every shipped preset without knowing how the set was assembled.
 */
const ALL_BUILT_IN_TYPES: HandrailTypeDefinition[] = [
    ...BUILT_IN_TYPES,
    ...buildBarGuardTypes(),
];

export class HandrailTypeStore {
    private types: Map<string, HandrailTypeDefinition> = new Map();

    constructor() {
        // §FEAT-HANDRAIL-BAR-GUARD-MATRIX — the hand-authored built-ins PLUS the derived
        // bar-guard matrix. Built-ins are CODE, re-seeded on every construction and
        // preserved by `clearCustomTypes()`, so a preset cannot be lost by a save/load or a
        // project switch; and `add()` throws on an id collision, so a founder's custom type
        // can never silently shadow one of these (nor the reverse).
        ALL_BUILT_IN_TYPES.forEach(t => this.types.set(t.id, { ...t }));
    }

    getAll(): HandrailTypeDefinition[] {
        return Array.from(this.types.values());
    }

    getById(id: string): HandrailTypeDefinition | undefined {
        return this.types.get(id);
    }

    getBuiltIn(): HandrailTypeDefinition[] {
        return this.getAll().filter(t => t.isBuiltIn);
    }

    getCustom(): HandrailTypeDefinition[] {
        return this.getAll().filter(t => !t.isBuiltIn);
    }

    add(definition: Omit<HandrailTypeDefinition, 'isBuiltIn'>): void {
        if (this.types.has(definition.id)) {
            throw new Error(`Handrail type ${definition.id} already exists`);
        }
        this.types.set(definition.id, { ...definition, isBuiltIn: false });
    }

    update(id: string, updates: Partial<Omit<HandrailTypeDefinition, 'id' | 'isBuiltIn'>>): void {
        const existing = this.types.get(id);
        if (!existing) throw new Error(`Handrail type ${id} not found`);
        if (existing.isBuiltIn) throw new Error(`Cannot modify built-in handrail type: ${id}`);
        this.types.set(id, { ...existing, ...updates });
    }

    remove(id: string): void {
        const existing = this.types.get(id);
        if (!existing) throw new Error(`Handrail type ${id} not found`);
        if (existing.isBuiltIn) throw new Error(`Cannot remove built-in handrail type: ${id}`);
        this.types.delete(id);
    }

    /** Contract 45 — wipe USER-defined handrail types only. Built-ins preserved. */
    clearCustomTypes(): void {
        for (const [id, t] of [...this.types.entries()]) {
            if (!t.isBuiltIn) {
                this.types.delete(id);
            }
        }
    }
}

export const handrailTypeStore = new HandrailTypeStore();

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';
projectScopeRegistry.register({
    scopeName: 'handrailTypeStore',
    clear: () => handrailTypeStore.clearCustomTypes(),
});
