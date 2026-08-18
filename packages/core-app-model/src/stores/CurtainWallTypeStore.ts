/**
 * CurtainWallTypeStore — §FEAT-CURTAIN-WALL-TYPE-CATALOGUE (L-958)
 * ================================================================
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 *
 * The property panel said, verbatim: *"Curtain walls have no published type
 * catalogue — edit the grid and panels directly."* That sentence was honest —
 * `ElementTypeCatalogRegistry` declares a family EITHER with a catalogue OR with
 * the reason it has none — but it was the wrong side of the fork. The catalogue
 * MECHANISM has shipped for every other family; curtain wall simply never
 * published one. This is that publication.
 *
 * ── WHY HERE, AND NOT `@pryzm/types-builtin/curtain-wall` ───────────────────
 *
 * ⚠ MEASURED, not assumed. `packages/types-builtin/src/curtain-wall/index.ts`
 * already holds four `CurtainWallSystemType` presets and three sub-catalogues,
 * authored and never wired. Extending THAT file was the obvious move and it was
 * rejected on evidence: `packages/types-builtin/package.json` carries
 * `"deprecated": "Wave-12 DROP: @pryzm/types-builtin had 0 importers at Wave 8
 * close. Verdict: DROP"`. Publishing the founder's flagship catalogue into a
 * package with a standing deletion verdict would hand the next lane a catalogue
 * that disappears on a scheduled cleanup.
 *
 * So this store lives where the SHIPPED type catalogues live and takes the shape
 * the registry already consumes — `HandrailTypeStore` in this same directory,
 * beat for beat: an inline `BUILT_IN_TYPES` array, a constructor-seeded `Map`, a
 * module singleton, and a `projectScopeRegistry` clear hook that wipes CUSTOM
 * types only. Nothing here is a rival mechanism; it is the same mechanism, used.
 * `types-builtin` is left untouched — deleting it is not this lane's call.
 *
 * ── WHAT A TYPE MAY AND MAY NOT CARRY ───────────────────────────────────────
 *
 * A type is HEIGHT-AGNOSTIC. It declares a mullion PITCH and, optionally, a
 * transom COURSE; it never declares a `gridYSpacing`. The reason is arithmetic:
 * `migrateToGridSystem()` computes `numV = max(1, floor(height / gridYSpacing))`
 * (`CurtainGridSystem.ts:90`), so "top and bottom rails only, no horizontal
 * intermediate mullion" holds ONLY when `gridYSpacing >= the wall's own height`.
 * A type that baked in a sentinel (`gridYSpacing: 9999`) would be a lie the
 * moment anyone read the record, and would break the instant a rule compared it
 * against a real dimension. `transomCourse: undefined` states the INTENT — no
 * intermediate transom — and the swap handler resolves it against the wall it is
 * being applied to. Intent lives in the type; the number is derived per wall.
 *
 * ⛔ NO PANEL MATERIAL YET, AND THAT IS DELIBERATE (§L-958 Phase A).
 * Every type below glazes in plain architectural glass, because the layer that
 * decides a panel's appearance —
 * `CurtainWallInstanceManager._getPanelMaterial(panelType)` — takes
 * `PANEL_TYPE_DEFAULTS[panelType]` and nothing else, and its caller
 * `buildInstancedMeshes(cells, panels, mullionSize, panelThickness)` is not even
 * PASSED the curtain wall. Publishing a "Copper" or "Mirror Green" type before
 * that is fixed would mint an affordance with no implementation behind it
 * (`WallRake.ts:50-62`) — types that read as twelve and render as four. The
 * MULLION half is a different story and IS live today
 * (`CurtainWallBuilder._getMullionMaterial`, library map injected at
 * `initUI.ts:2241`), which is why `mullionMaterialId` is a first-class field
 * here and `panelMaterialId` is absent rather than present-and-ignored.
 *
 * ── MATERIALS ARE REFERENCES, NEVER VOCABULARY ──────────────────────────────
 *
 * `mullionMaterialId` is a C100 master-catalogue id resolved through
 * `STANDARD_MATERIAL_LIBRARY` — the SAME map the mullion path already resolves
 * successfully. C84 EI-8 forbids a sixth material vocabulary and this file mints
 * none: `mullionColor` is a fallback TINT for the no-library case, exactly as
 * `CurtainWallData.mullionColor` has always been, not a colour system.
 */

import { projectScopeRegistry } from '../persistence/ProjectScopeRegistry';

export interface CurtainWallTypeDefinition {
    /** Stable id — written to `CurtainWallData.systemTypeId`. */
    id: string;
    name: string;
    description: string;
    isBuiltIn: boolean;
    /**
     * Vertical-mullion PITCH in metres — the spacing of the vertical members
     * along the wall's length. Maps to `CurtainWallData.gridXSpacing`.
     */
    mullionPitch: number;
    /**
     * Horizontal transom COURSE in metres, or `undefined` for "top and bottom
     * rails only — no horizontal intermediate mullion", which is what all twelve
     * of the founder's types specify.
     *
     * ⚠ Never write `gridYSpacing` here. See the height-agnostic note in the
     * header: the swap handler derives it from the wall's own height so the
     * intent survives on a wall of ANY height.
     */
    transomCourse?: number;
    /** Mullion cross-section size in metres → `CurtainWallData.mullionSize`. */
    mullionSize: number;
    /** Panel thickness in metres → `CurtainWallData.panelThickness`. */
    panelThickness: number;
    /** C100 master-catalogue id for the frame. Resolved to PBR by the builder. */
    mullionMaterialId?: string;
    /** Fallback frame tint when no library map is injected. Not a vocabulary. */
    mullionColor?: string;
    /**
     * §FEAT-CURTAIN-WALL-PANEL-MATERIAL (L-958 Slice B) — the C100 master-catalogue id
     * every panel of this type is made of. `undefined` means "leave the panels alone",
     * which is what the plain-glazed types 1-4 want: they render the
     * `PANEL_TYPE_DEFAULTS.SystemPanel_Glass` appearance that shipped before this field.
     *
     * Applying a type writes this to BOTH the wall (`CurtainWallData.glazingMaterialId`,
     * the wall's default) and to every existing panel (`CurtainPanelData.materialId`).
     * Both writes are needed and neither is redundant: the per-panel write is what the
     * renderer reads TODAY, and the wall-level default is what newly generated cells
     * inherit when the grid changes — without it a stone facade silently reverts to glass
     * on the next spacing nudge.
     */
    panelMaterialId?: string;
    /**
     * A visible, user-facing note when `panelMaterialId` is a STAND-IN for a material the
     * master catalogue does not yet carry (founder ruling, L-958: green mirror, grey
     * shiny mirror and white satin are absent; use the nearest existing row for now).
     *
     * ⚠ It is appended to the type's `detail` line in the picker, so the substitution is
     * VISIBLE. A type called "Mirror Green" that quietly renders as reflective glass is
     * the silent-substitution defect this session keeps finding; "for now" has to be
     * something the user can read, not something only the commit message knows.
     */
    substitutionNote?: string;
}

/**
 * The founder's types 1–4 (L-958), verbatim in their varying axis: they differ
 * ONLY by vertical pitch, all glaze in glass, all take the default mullion, and
 * all share "no horizontal intermediate mullion — top and bottom rails only".
 *
 * Pitch is the ONE axis measured to cross the create bridge intact
 * (`bayWidth → gridXSpacing`, `initTools.ts:1461`), which is exactly why these
 * four ship first and the material-varying eight wait for the panel path.
 */
const BUILT_IN_TYPES: CurtainWallTypeDefinition[] = [
    {
        id: 'cw.glazed.pitch-1000',
        name: 'Glazed — 1.0 m pitch',
        description:
            'Full-height glazing on a 1.0 m vertical mullion pitch. Top and bottom rails only, ' +
            'no intermediate transom. The general-purpose office curtain wall.',
        isBuiltIn: true,
        mullionPitch: 1.0,
        transomCourse: undefined,
        mullionSize: 0.05,
        panelThickness: 0.024,
        mullionMaterialId: 'aluminium-anodised-silver',
        mullionColor: '#8c8f92',
    },
    {
        id: 'cw.glazed.pitch-500',
        name: 'Glazed — 0.5 m pitch',
        description:
            'Narrow 0.5 m vertical pitch — a fine, close-ribbed glazed facade. Top and bottom ' +
            'rails only, no intermediate transom.',
        isBuiltIn: true,
        mullionPitch: 0.5,
        transomCourse: undefined,
        mullionSize: 0.05,
        panelThickness: 0.024,
        mullionMaterialId: 'aluminium-anodised-silver',
        mullionColor: '#8c8f92',
    },
    {
        id: 'cw.glazed.pitch-750',
        name: 'Glazed — 0.75 m pitch',
        description:
            'A 0.75 m vertical pitch, between the fine and the general-purpose ribbing. ' +
            'Top and bottom rails only, no intermediate transom.',
        isBuiltIn: true,
        mullionPitch: 0.75,
        transomCourse: undefined,
        mullionSize: 0.05,
        panelThickness: 0.024,
        mullionMaterialId: 'aluminium-anodised-silver',
        mullionColor: '#8c8f92',
    },
    {
        id: 'cw.glazed.pitch-2000',
        name: 'Glazed — 2.0 m pitch',
        description:
            'Wide 2.0 m vertical pitch for large-format glazing with minimal visible framing. ' +
            'Top and bottom rails only, no intermediate transom.',
        isBuiltIn: true,
        mullionPitch: 2.0,
        transomCourse: undefined,
        mullionSize: 0.06,
        panelThickness: 0.028,
        mullionMaterialId: 'aluminium-anodised-silver',
        mullionColor: '#8c8f92',
    },
];

export class CurtainWallTypeStore {
    private types: Map<string, CurtainWallTypeDefinition> = new Map();

    constructor() {
        BUILT_IN_TYPES.forEach(t => this.types.set(t.id, { ...t }));
    }

    getAll(): CurtainWallTypeDefinition[] {
        return Array.from(this.types.values());
    }

    getById(id: string): CurtainWallTypeDefinition | undefined {
        return this.types.get(id);
    }

    getBuiltIn(): CurtainWallTypeDefinition[] {
        return this.getAll().filter(t => t.isBuiltIn);
    }

    getCustom(): CurtainWallTypeDefinition[] {
        return this.getAll().filter(t => !t.isBuiltIn);
    }

    add(definition: Omit<CurtainWallTypeDefinition, 'isBuiltIn'>): void {
        if (this.types.has(definition.id)) {
            throw new Error(`Curtain wall type ${definition.id} already exists`);
        }
        this.types.set(definition.id, { ...definition, isBuiltIn: false });
    }

    update(id: string, updates: Partial<Omit<CurtainWallTypeDefinition, 'id' | 'isBuiltIn'>>): void {
        const existing = this.types.get(id);
        if (!existing) throw new Error(`Curtain wall type ${id} not found`);
        if (existing.isBuiltIn) throw new Error(`Cannot modify built-in curtain wall type: ${id}`);
        this.types.set(id, { ...existing, ...updates });
    }

    remove(id: string): void {
        const existing = this.types.get(id);
        if (!existing) throw new Error(`Curtain wall type ${id} not found`);
        if (existing.isBuiltIn) throw new Error(`Cannot remove built-in curtain wall type: ${id}`);
        this.types.delete(id);
    }

    /** Contract 45 — wipe USER-defined curtain wall types only. Built-ins preserved. */
    clearCustomTypes(): void {
        for (const [id, t] of [...this.types.entries()]) {
            if (!t.isBuiltIn) {
                this.types.delete(id);
            }
        }
    }
}

export const curtainWallTypeStore = new CurtainWallTypeStore();

projectScopeRegistry.register({
    scopeName: 'curtainWallTypeStore',
    clear: () => curtainWallTypeStore.clearCustomTypes(),
});

/**
 * Resolve a type into the `Partial<CurtainWallData>` patch that applies it.
 *
 * ONE place, deliberately — the §FIX-STAIR-RAILING-TYPE-PICKER lesson: when the
 * catalogue→record projection lives in the widget, the AI plane and
 * collaboration replay each re-derive it and drift. Every caller that has a type
 * id and a wall height gets the identical patch from here.
 *
 * `height` is REQUIRED, and that is the height-agnostic rule made executable: a
 * type with no `transomCourse` resolves `gridYSpacing` to the wall's own height,
 * which is the smallest value that makes `floor(height / gridYSpacing)` equal 1
 * — top and bottom rails, nothing between — on a wall of any size.
 *
 * `gridSystem: undefined` is not tidiness. `CurtainWallBuilder` reads
 * `cw.gridSystem ?? migrateToGridSystem(...)` (`:1121-1122`), so a wall that has
 * ever had a grid line added carries an explicit `gridSystem` that WINS over the
 * new spacings. Without clearing it, applying a type would silently change
 * nothing visible — a dead control wearing a working one's clothes.
 */
export function resolveCurtainWallTypeFields(
    def: CurtainWallTypeDefinition,
    height: number,
): Record<string, unknown> {
    const safeHeight = Number.isFinite(height) && height > 0 ? height : 3;
    return {
        systemTypeId: def.id,
        gridXSpacing: def.mullionPitch,
        gridYSpacing: def.transomCourse ?? safeHeight,
        mullionSize: def.mullionSize,
        panelThickness: def.panelThickness,
        ...(def.mullionMaterialId !== undefined ? { mullionMaterialId: def.mullionMaterialId } : {}),
        ...(def.mullionColor !== undefined ? { mullionColor: def.mullionColor } : {}),
        // §FEAT-CURTAIN-WALL-PANEL-MATERIAL (L-958 Slice B) — the wall's DEFAULT panel
        // material, inherited by any cell the grid generates later.
        //
        // ⚠ THE FIELD IS `glazingMaterialId`, AND THE NAME IS NOW A MISNOMER. It is
        // reused rather than replaced deliberately: it already exists on
        // `CurtainWallData`, already round-trips through both serializers and
        // `CreateCurtainWallPayload`, and — until this slice — was read by exactly one
        // function that production never reaches (`_getFallbackPanelMaterial`, live only
        // when a wall has zero panels, which `CurtainPanelSyncHandler` guarantees never
        // happens). Adding a second wall-level panel-material field beside a dead one
        // would be two answers to one question (C84 EI-9). So the dead field is REVIVED
        // and now means "the wall's default panel material" — which for stone, concrete
        // and ceramic panels the name describes badly. Renaming it touches persistence
        // and both serializers; logged as debt rather than smuggled into this slice.
        //
        // ALWAYS WRITTEN, including as `undefined`: `CurtainWallStore.update` MERGES
        // (:365-369), so omitting the key would leave a previous type's material behind
        // when swapping to a plain-glazed one — the same merge-cannot-delete trap that
        // Slice A's `systemTypeId` undo hit.
        glazingMaterialId: def.panelMaterialId,
        gridSystem: undefined,
    };
}

/**
 * The per-panel patch that applies a type's panel material.
 *
 * Separate from {@link resolveCurtainWallTypeFields} because it targets a DIFFERENT
 * store — `CurtainPanelStore`, not `CurtainWallStore` — and the caller must write both.
 * `materialId` is what `CurtainWallInstanceManager._getPanelMaterial` resolves; the
 * wall-level default alone would render nothing differently, because the renderer reads
 * the PANEL.
 *
 * `materialOverride` is deliberately NOT touched. It is an authored per-panel hex tint
 * and a published type has no business silently discarding one a user set by hand.
 */
export function resolveCurtainWallTypePanelFields(
    def: CurtainWallTypeDefinition,
): Record<string, unknown> {
    return { materialId: def.panelMaterialId };
}
