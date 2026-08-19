import { HandrailBalusterShape, HandrailFillType, HandrailRailProfile } from './HandrailTypes';

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

export class HandrailTypeStore {
    private types: Map<string, HandrailTypeDefinition> = new Map();

    constructor() {
        BUILT_IN_TYPES.forEach(t => this.types.set(t.id, { ...t }));
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
