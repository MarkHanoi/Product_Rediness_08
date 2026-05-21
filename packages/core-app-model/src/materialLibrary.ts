import * as THREE from "@pryzm/renderer-three/three";

export enum VisualStyle {
    CONSISTENT_COLORS = "consistent",
    TEXTURES = "textures",
    REALISTIC = "realistic",
    SCHEMATIC = "schematic",
}

export type MaterialCategory =
    | "Concrete"
    | "Metal"
    | "Wood"
    | "Glass"
    | "Masonry"
    | "Plastic & Polymer"
    | "Gypsum & Plaster"
    | "Insulation"
    | "Membrane & Waterproofing"
    | "Stone"
    | "Ceramic & Tile"
    | "Timber Engineered"
    | "Fabric & Soft"
    | "Paint & Coating"
    | "Roofing"
    | "Landscape & Ground"
    | "Specialty Surfaces";

export type StandardMaterialDef = {
    id: string;
    label: string;
    category: MaterialCategory;
    params: THREE.MeshStandardMaterialParameters;
    textures?: {
        color?: THREE.Texture;
        normal?: THREE.Texture;
        roughness?: THREE.Texture;
    };
};

/**
 * STANDARD_MATERIAL_LIBRARY — Master material library for PRYZM.
 *
 * All entries use solid MeshStandard colours.  Textures can be added by:
 *   1. Placing .jpg/.png files in public/textures/
 *   2. Loading them lazily with THREE.TextureLoader on first material use.
 *
 * This library is exposed as a read-only "Materials Library" schedule in the
 * Data Panel (SchedulePanel → Materials Schedule).
 */
export const STANDARD_MATERIAL_LIBRARY: StandardMaterialDef[] = [

    // ── CONCRETE ──────────────────────────────────────────────────────────────
    {
        id: "concrete-smooth",
        label: "Concrete · Smooth",
        category: "Concrete",
        params: { color: new THREE.Color("#c8c8c4"), metalness: 0, roughness: 0.85 },
    },
    {
        id: "concrete-rough",
        label: "Concrete · Rough",
        category: "Concrete",
        params: { color: new THREE.Color("#b0b0aa"), metalness: 0, roughness: 0.95 },
    },
    {
        id: "concrete-reinforced",
        label: "Concrete · Reinforced",
        category: "Concrete",
        params: { color: new THREE.Color("#b8b8b2"), metalness: 0, roughness: 0.88 },
    },
    {
        id: "concrete-precast",
        label: "Concrete · Precast",
        category: "Concrete",
        params: { color: new THREE.Color("#d0d0ca"), metalness: 0, roughness: 0.75 },
    },
    {
        id: "concrete-exposed",
        label: "Concrete · Exposed (Board-Marked)",
        category: "Concrete",
        params: { color: new THREE.Color("#a8a8a2"), metalness: 0, roughness: 0.92 },
    },
    {
        id: "concrete-burnished",
        label: "Concrete · Burnished",
        category: "Concrete",
        params: { color: new THREE.Color("#d4d4ce"), metalness: 0.05, roughness: 0.45 },
    },
    {
        id: "concrete-white",
        label: "Concrete · White Cement",
        category: "Concrete",
        params: { color: new THREE.Color("#e8e8e2"), metalness: 0, roughness: 0.80 },
    },

    // ── METAL ─────────────────────────────────────────────────────────────────
    {
        id: "steel-structural",
        label: "Steel · Structural (Hot-Rolled)",
        category: "Metal",
        params: { color: new THREE.Color("#9aa0a8"), metalness: 1.0, roughness: 0.35 },
    },
    {
        id: "steel-stainless-brushed",
        label: "Steel · Stainless Brushed",
        category: "Metal",
        params: { color: new THREE.Color("#c8cdd4"), metalness: 1.0, roughness: 0.25 },
    },
    {
        id: "steel-stainless-polished",
        label: "Steel · Stainless Polished",
        category: "Metal",
        params: { color: new THREE.Color("#dce0e8"), metalness: 1.0, roughness: 0.05 },
    },
    {
        id: "steel-galvanised",
        label: "Steel · Galvanised",
        category: "Metal",
        params: { color: new THREE.Color("#b4bac4"), metalness: 0.8, roughness: 0.40 },
    },
    {
        id: "steel-corten",
        label: "Steel · Corten (Weathering)",
        category: "Metal",
        params: { color: new THREE.Color("#8c4a2c"), metalness: 0.5, roughness: 0.80 },
    },
    {
        id: "aluminium-anodised-silver",
        label: "Aluminium · Anodised Silver",
        category: "Metal",
        params: { color: new THREE.Color("#c0c4c8"), metalness: 0.9, roughness: 0.20 },
    },
    {
        id: "aluminium-powder-coated-white",
        label: "Aluminium · Powder-Coated White",
        category: "Metal",
        params: { color: new THREE.Color("#f0f0f0"), metalness: 0.0, roughness: 0.55 },
    },
    {
        id: "aluminium-powder-coated-dark",
        label: "Aluminium · Powder-Coated Dark Grey",
        category: "Metal",
        params: { color: new THREE.Color("#3c3c3c"), metalness: 0.0, roughness: 0.55 },
    },
    {
        id: "copper-new",
        label: "Copper · New (Bright)",
        category: "Metal",
        params: { color: new THREE.Color("#b87333"), metalness: 1.0, roughness: 0.20 },
    },
    {
        id: "copper-patinated",
        label: "Copper · Patinated (Green)",
        category: "Metal",
        params: { color: new THREE.Color("#4a8a6a"), metalness: 0.3, roughness: 0.70 },
    },
    {
        id: "zinc-natural",
        label: "Zinc · Natural Standing Seam",
        category: "Metal",
        params: { color: new THREE.Color("#7a8090"), metalness: 0.7, roughness: 0.50 },
    },
    {
        id: "brass-polished",
        label: "Brass · Polished",
        category: "Metal",
        params: { color: new THREE.Color("#c8a840"), metalness: 1.0, roughness: 0.10 },
    },
    {
        id: "cast-iron",
        label: "Cast Iron",
        category: "Metal",
        params: { color: new THREE.Color("#3a3a3a"), metalness: 0.8, roughness: 0.60 },
    },

    // ── WOOD ──────────────────────────────────────────────────────────────────
    {
        id: "wood-oak",
        label: "Wood · Oak (Light)",
        category: "Wood",
        params: { color: new THREE.Color("#c8a96e"), metalness: 0, roughness: 0.60 },
    },
    {
        id: "wood-walnut",
        label: "Wood · Walnut (Dark)",
        category: "Wood",
        params: { color: new THREE.Color("#5a3a28"), metalness: 0, roughness: 0.65 },
    },
    {
        id: "wood-pine",
        label: "Wood · Pine (Natural)",
        category: "Wood",
        params: { color: new THREE.Color("#deb887"), metalness: 0, roughness: 0.70 },
    },
    {
        id: "wood-birch",
        label: "Wood · Birch (Pale)",
        category: "Wood",
        params: { color: new THREE.Color("#e8d8a8"), metalness: 0, roughness: 0.60 },
    },
    {
        id: "wood-teak",
        label: "Wood · Teak",
        category: "Wood",
        params: { color: new THREE.Color("#a0724a"), metalness: 0, roughness: 0.55 },
    },
    {
        id: "wood-ash",
        label: "Wood · Ash",
        category: "Wood",
        params: { color: new THREE.Color("#d4c498"), metalness: 0, roughness: 0.62 },
    },
    {
        id: "wood-reclaimed",
        label: "Wood · Reclaimed / Weathered",
        category: "Wood",
        params: { color: new THREE.Color("#907868"), metalness: 0, roughness: 0.90 },
    },
    {
        id: "wood-painted-white",
        label: "Wood · Painted White",
        category: "Wood",
        params: { color: new THREE.Color("#f5f5f0"), metalness: 0, roughness: 0.50 },
    },

    // ── TIMBER ENGINEERED ─────────────────────────────────────────────────────
    {
        id: "timber-plywood",
        label: "Plywood · Birch Face",
        category: "Timber Engineered",
        params: { color: new THREE.Color("#e0c890"), metalness: 0, roughness: 0.72 },
    },
    {
        id: "timber-clt",
        label: "CLT · Cross-Laminated Timber",
        category: "Timber Engineered",
        params: { color: new THREE.Color("#c0a070"), metalness: 0, roughness: 0.80 },
    },
    {
        id: "timber-glulam",
        label: "Glulam · Glued Laminated Timber",
        category: "Timber Engineered",
        params: { color: new THREE.Color("#c8a060"), metalness: 0, roughness: 0.68 },
    },
    {
        id: "timber-bamboo",
        label: "Bamboo · Strand-Woven",
        category: "Timber Engineered",
        params: { color: new THREE.Color("#d4bc78"), metalness: 0, roughness: 0.55 },
    },
    {
        id: "timber-mdf",
        label: "MDF · Medium-Density Fibreboard",
        category: "Timber Engineered",
        params: { color: new THREE.Color("#c8b890"), metalness: 0, roughness: 0.85 },
    },

    // ── GLASS ─────────────────────────────────────────────────────────────────
    {
        id: "glass-clear",
        label: "Glass · Clear Float",
        category: "Glass",
        params: { color: new THREE.Color(0.85, 0.9, 1), metalness: 0, roughness: 0.05, transparent: true, opacity: 0.30 },
    },
    {
        id: "glass-frosted",
        label: "Glass · Frosted",
        category: "Glass",
        params: { color: new THREE.Color(0.9, 0.9, 0.95), metalness: 0, roughness: 0.60, transparent: true, opacity: 0.55 },
    },
    {
        id: "glass-tinted-bronze",
        label: "Glass · Tinted Bronze",
        category: "Glass",
        params: { color: new THREE.Color("#c0a060"), metalness: 0, roughness: 0.05, transparent: true, opacity: 0.40 },
    },
    {
        id: "glass-tinted-grey",
        label: "Glass · Tinted Grey",
        category: "Glass",
        params: { color: new THREE.Color("#808090"), metalness: 0, roughness: 0.05, transparent: true, opacity: 0.35 },
    },
    {
        id: "glass-low-e",
        label: "Glass · Low-E (Solar Control)",
        category: "Glass",
        params: { color: new THREE.Color(0.8, 0.88, 0.95), metalness: 0.1, roughness: 0.03, transparent: true, opacity: 0.30 },
    },
    {
        id: "glass-structural",
        label: "Glass · Structural / Toughened",
        category: "Glass",
        params: { color: new THREE.Color(0.9, 0.95, 1), metalness: 0, roughness: 0.02, transparent: true, opacity: 0.25 },
    },
    {
        id: "glass-reflective",
        label: "Glass · Reflective (Curtain Wall)",
        category: "Glass",
        params: { color: new THREE.Color(0.7, 0.8, 0.9), metalness: 0.5, roughness: 0.05, transparent: true, opacity: 0.55 },
    },

    // ── MASONRY ───────────────────────────────────────────────────────────────
    {
        id: "brick-red",
        label: "Brick · Red Facing",
        category: "Masonry",
        params: { color: new THREE.Color("#9a4a34"), metalness: 0, roughness: 0.92 },
    },
    {
        id: "brick-buff",
        label: "Brick · Buff / Sand Lime",
        category: "Masonry",
        params: { color: new THREE.Color("#d4bc8a"), metalness: 0, roughness: 0.90 },
    },
    {
        id: "brick-grey",
        label: "Brick · Grey Engineering",
        category: "Masonry",
        params: { color: new THREE.Color("#7a7a7a"), metalness: 0, roughness: 0.88 },
    },
    {
        id: "brick-dark",
        label: "Brick · Dark / Charcoal",
        category: "Masonry",
        params: { color: new THREE.Color("#3c3028"), metalness: 0, roughness: 0.90 },
    },
    {
        id: "blockwork-dense",
        label: "Blockwork · Dense Concrete",
        category: "Masonry",
        params: { color: new THREE.Color("#a0a09a"), metalness: 0, roughness: 0.88 },
    },
    {
        id: "blockwork-lightweight",
        label: "Blockwork · Lightweight (Aircrete)",
        category: "Masonry",
        params: { color: new THREE.Color("#d0d0c8"), metalness: 0, roughness: 0.82 },
    },

    // ── STONE ─────────────────────────────────────────────────────────────────
    {
        id: "stone-limestone-light",
        label: "Stone · Limestone (Light)",
        category: "Stone",
        params: { color: new THREE.Color("#d8d0b8"), metalness: 0, roughness: 0.88 },
    },
    {
        id: "stone-limestone-grey",
        label: "Stone · Limestone (Grey)",
        category: "Stone",
        params: { color: new THREE.Color("#b0a898"), metalness: 0, roughness: 0.88 },
    },
    {
        id: "stone-sandstone",
        label: "Stone · Sandstone",
        category: "Stone",
        params: { color: new THREE.Color("#c8a878"), metalness: 0, roughness: 0.90 },
    },
    {
        id: "stone-granite-grey",
        label: "Stone · Granite (Grey Polished)",
        category: "Stone",
        params: { color: new THREE.Color("#888888"), metalness: 0.05, roughness: 0.15 },
    },
    {
        id: "stone-granite-black",
        label: "Stone · Granite (Black Polished)",
        category: "Stone",
        params: { color: new THREE.Color("#242424"), metalness: 0.05, roughness: 0.10 },
    },
    {
        id: "stone-marble-white",
        label: "Stone · Marble (White)",
        category: "Stone",
        params: { color: new THREE.Color("#f0ede8"), metalness: 0, roughness: 0.12 },
    },
    {
        id: "stone-slate",
        label: "Stone · Slate",
        category: "Stone",
        params: { color: new THREE.Color("#484c50"), metalness: 0.05, roughness: 0.80 },
    },
    {
        id: "stone-travertine",
        label: "Stone · Travertine",
        category: "Stone",
        params: { color: new THREE.Color("#d8c8a0"), metalness: 0, roughness: 0.75 },
    },

    // ── CERAMIC & TILE ────────────────────────────────────────────────────────
    {
        id: "tile-white-gloss",
        label: "Ceramic Tile · White Gloss",
        category: "Ceramic & Tile",
        params: { color: new THREE.Color("#f8f8f8"), metalness: 0, roughness: 0.05 },
    },
    {
        id: "tile-grey-matt",
        label: "Ceramic Tile · Grey Matt",
        category: "Ceramic & Tile",
        params: { color: new THREE.Color("#909090"), metalness: 0, roughness: 0.75 },
    },
    {
        id: "tile-terracotta",
        label: "Ceramic Tile · Terracotta",
        category: "Ceramic & Tile",
        params: { color: new THREE.Color("#c06040"), metalness: 0, roughness: 0.80 },
    },
    {
        id: "tile-porcelain",
        label: "Porcelain Tile · Light Stone",
        category: "Ceramic & Tile",
        params: { color: new THREE.Color("#ddd8d0"), metalness: 0, roughness: 0.30 },
    },

    // ── PLASTIC & POLYMER ────────────────────────────────────────────────────
    {
        id: "plastic-white",
        label: "Plastic · White",
        category: "Plastic & Polymer",
        params: { color: new THREE.Color("#ffffff"), metalness: 0.0, roughness: 0.40 },
    },
    {
        id: "plastic-grey",
        label: "Plastic · Dark Grey",
        category: "Plastic & Polymer",
        params: { color: new THREE.Color("#505050"), metalness: 0.0, roughness: 0.50 },
    },
    {
        id: "plastic-transparent",
        label: "Plastic · Polycarbonate / Clear",
        category: "Plastic & Polymer",
        params: { color: new THREE.Color(0.95, 0.95, 1.0), metalness: 0, roughness: 0.10, transparent: true, opacity: 0.75 },
    },
    {
        id: "plastic-epdm",
        label: "EPDM Rubber",
        category: "Plastic & Polymer",
        params: { color: new THREE.Color("#202020"), metalness: 0, roughness: 0.95 },
    },

    // ── GYPSUM & PLASTER ─────────────────────────────────────────────────────
    {
        id: "gypsum-plasterboard",
        label: "Plasterboard · Standard",
        category: "Gypsum & Plaster",
        params: { color: new THREE.Color("#f0eeea"), metalness: 0, roughness: 0.92 },
    },
    {
        id: "gypsum-acoustic",
        label: "Plasterboard · Acoustic",
        category: "Gypsum & Plaster",
        params: { color: new THREE.Color("#eceae6"), metalness: 0, roughness: 0.92 },
    },
    {
        id: "gypsum-skim",
        label: "Plaster · Skim Coat (Painted)",
        category: "Gypsum & Plaster",
        params: { color: new THREE.Color("#f5f5f0"), metalness: 0, roughness: 0.88 },
    },
    {
        id: "gypsum-venetian",
        label: "Plaster · Venetian (Polished)",
        category: "Gypsum & Plaster",
        params: { color: new THREE.Color("#e8e4d8"), metalness: 0.05, roughness: 0.25 },
    },

    // ── INSULATION ────────────────────────────────────────────────────────────
    {
        id: "insulation-mineral-wool",
        label: "Insulation · Mineral Wool",
        category: "Insulation",
        params: { color: new THREE.Color("#f0d080"), metalness: 0, roughness: 1.0 },
    },
    {
        id: "insulation-pir",
        label: "Insulation · PIR Foam Board",
        category: "Insulation",
        params: { color: new THREE.Color("#c0d840"), metalness: 0, roughness: 0.95 },
    },
    {
        id: "insulation-eps",
        label: "Insulation · EPS (White Foam)",
        category: "Insulation",
        params: { color: new THREE.Color("#f8f8f8"), metalness: 0, roughness: 0.95 },
    },
    {
        id: "insulation-xps",
        label: "Insulation · XPS (Blue/Pink Board)",
        category: "Insulation",
        params: { color: new THREE.Color("#8888e0"), metalness: 0, roughness: 0.90 },
    },

    // ── MEMBRANE & WATERPROOFING ──────────────────────────────────────────────
    {
        id: "membrane-dpm",
        label: "Membrane · DPM (Black Polythene)",
        category: "Membrane & Waterproofing",
        params: { color: new THREE.Color("#101010"), metalness: 0.1, roughness: 0.90 },
    },
    {
        id: "membrane-bitumen",
        label: "Membrane · Bitumen Felt",
        category: "Membrane & Waterproofing",
        params: { color: new THREE.Color("#1a1a1a"), metalness: 0, roughness: 0.95 },
    },
    {
        id: "membrane-tpo",
        label: "Membrane · TPO Roofing",
        category: "Membrane & Waterproofing",
        params: { color: new THREE.Color("#d8d8d8"), metalness: 0, roughness: 0.85 },
    },

    // ── FABRIC & SOFT ─────────────────────────────────────────────────────────
    {
        id: "fabric-acoustic-panel",
        label: "Fabric · Acoustic Panel",
        category: "Fabric & Soft",
        params: { color: new THREE.Color("#8898a8"), metalness: 0, roughness: 1.0 },
    },
    {
        id: "fabric-awning",
        label: "Fabric · Awning / PTFE Canopy",
        category: "Fabric & Soft",
        params: { color: new THREE.Color("#f0f0ec"), metalness: 0, roughness: 0.90, transparent: true, opacity: 0.85 },
    },
    { id: "concrete-polished-light", label: "Concrete · Polished Light Grey", category: "Concrete", params: { color: new THREE.Color("#d7d5cf"), metalness: 0, roughness: 0.28 } },
    { id: "concrete-polished-dark", label: "Concrete · Polished Charcoal", category: "Concrete", params: { color: new THREE.Color("#555753"), metalness: 0, roughness: 0.22 } },
    { id: "concrete-terrazzo-fine", label: "Concrete · Fine Terrazzo", category: "Concrete", params: { color: new THREE.Color("#d8d2c4"), metalness: 0, roughness: 0.34 } },
    { id: "concrete-terrazzo-dark", label: "Concrete · Dark Terrazzo", category: "Concrete", params: { color: new THREE.Color("#4d4a45"), metalness: 0, roughness: 0.36 } },
    { id: "concrete-formwork-oiled", label: "Concrete · Oiled Formwork Cast", category: "Concrete", params: { color: new THREE.Color("#ada99f"), metalness: 0, roughness: 0.72 } },
    { id: "concrete-brutalist-weathered", label: "Concrete · Brutalist Weathered", category: "Concrete", params: { color: new THREE.Color("#8d8e88"), metalness: 0, roughness: 0.96 } },
    { id: "concrete-shotcrete", label: "Concrete · Shotcrete / Sprayed", category: "Concrete", params: { color: new THREE.Color("#9e9d96"), metalness: 0, roughness: 0.98 } },
    { id: "concrete-lightweight-aac", label: "Concrete · AAC Lightweight Block", category: "Concrete", params: { color: new THREE.Color("#d9d8cf"), metalness: 0, roughness: 0.88 } },
    { id: "steel-blue-tempered", label: "Steel · Blue Tempered", category: "Metal", params: { color: new THREE.Color("#526579"), metalness: 1, roughness: 0.32 } },
    { id: "steel-blackened", label: "Steel · Blackened Waxed", category: "Metal", params: { color: new THREE.Color("#1d1f20"), metalness: 0.9, roughness: 0.48 } },
    { id: "steel-painted-red-oxide", label: "Steel · Red Oxide Primer", category: "Metal", params: { color: new THREE.Color("#8f3328"), metalness: 0.1, roughness: 0.74 } },
    { id: "steel-painted-intumescent-white", label: "Steel · White Intumescent Coating", category: "Metal", params: { color: new THREE.Color("#f1f0ec"), metalness: 0, roughness: 0.62 } },
    { id: "aluminium-brushed-dark", label: "Aluminium · Brushed Dark Anodised", category: "Metal", params: { color: new THREE.Color("#474d52"), metalness: 0.9, roughness: 0.24 } },
    { id: "aluminium-bronze-anodised", label: "Aluminium · Bronze Anodised", category: "Metal", params: { color: new THREE.Color("#9d724c"), metalness: 0.85, roughness: 0.26 } },
    { id: "zinc-preweathered-bluegrey", label: "Zinc · Pre-Weathered Blue Grey", category: "Metal", params: { color: new THREE.Color("#66717c"), metalness: 0.62, roughness: 0.55 } },
    { id: "lead-aged-sheet", label: "Lead · Aged Sheet", category: "Metal", params: { color: new THREE.Color("#5d6268"), metalness: 0.7, roughness: 0.68 } },
    { id: "bronze-aged", label: "Bronze · Aged Architectural", category: "Metal", params: { color: new THREE.Color("#7b5d38"), metalness: 0.85, roughness: 0.38 } },
    { id: "metal-mesh-expanded", label: "Metal Mesh · Expanded Aluminium", category: "Metal", params: { color: new THREE.Color("#aeb4b8"), metalness: 0.9, roughness: 0.42 } },
    { id: "wood-oak-smoked", label: "Wood · Smoked Oak", category: "Wood", params: { color: new THREE.Color("#6b523a"), metalness: 0, roughness: 0.58 } },
    { id: "wood-oak-whitewashed", label: "Wood · Whitewashed Oak", category: "Wood", params: { color: new THREE.Color("#d8cdb8"), metalness: 0, roughness: 0.64 } },
    { id: "wood-maple", label: "Wood · Maple", category: "Wood", params: { color: new THREE.Color("#e0c795"), metalness: 0, roughness: 0.56 } },
    { id: "wood-cedar-red", label: "Wood · Red Cedar", category: "Wood", params: { color: new THREE.Color("#a65e3d"), metalness: 0, roughness: 0.70 } },
    { id: "wood-cherry", label: "Wood · Cherry", category: "Wood", params: { color: new THREE.Color("#8f4f35"), metalness: 0, roughness: 0.52 } },
    { id: "wood-mahogany", label: "Wood · Mahogany", category: "Wood", params: { color: new THREE.Color("#5a241b"), metalness: 0, roughness: 0.50 } },
    { id: "wood-ebony", label: "Wood · Ebony", category: "Wood", params: { color: new THREE.Color("#1f1a16"), metalness: 0, roughness: 0.46 } },
    { id: "wood-charred-shou-sugi-ban", label: "Wood · Charred Shou Sugi Ban", category: "Wood", params: { color: new THREE.Color("#171615"), metalness: 0, roughness: 0.88 } },
    { id: "wood-thermowood", label: "Wood · Thermowood Cladding", category: "Wood", params: { color: new THREE.Color("#8c5735"), metalness: 0, roughness: 0.78 } },
    { id: "timber-osb", label: "OSB · Oriented Strand Board", category: "Timber Engineered", params: { color: new THREE.Color("#c89d5f"), metalness: 0, roughness: 0.86 } },
    { id: "timber-chipboard", label: "Chipboard · Raw", category: "Timber Engineered", params: { color: new THREE.Color("#b89461"), metalness: 0, roughness: 0.90 } },
    { id: "timber-hdf-black", label: "HDF · Black Core", category: "Timber Engineered", params: { color: new THREE.Color("#24221f"), metalness: 0, roughness: 0.70 } },
    { id: "timber-veneer-oak", label: "Veneer · Oak Panel", category: "Timber Engineered", params: { color: new THREE.Color("#c49b62"), metalness: 0, roughness: 0.48 } },
    { id: "glass-ultra-clear", label: "Glass · Ultra Clear Low Iron", category: "Glass", params: { color: new THREE.Color("#eef8ff"), metalness: 0, roughness: 0.015, transparent: true, opacity: 0.18 } },
    { id: "glass-laminated", label: "Glass · Laminated Safety", category: "Glass", params: { color: new THREE.Color("#dcecf3"), metalness: 0, roughness: 0.04, transparent: true, opacity: 0.32 } },
    { id: "glass-reeded", label: "Glass · Reeded / Fluted", category: "Glass", params: { color: new THREE.Color("#dbe9ef"), metalness: 0, roughness: 0.42, transparent: true, opacity: 0.50 } },
    { id: "glass-channel-u", label: "Glass · U-Channel Translucent", category: "Glass", params: { color: new THREE.Color("#d7e8ef"), metalness: 0, roughness: 0.50, transparent: true, opacity: 0.58 } },
    { id: "glass-spandrel-white", label: "Glass · White Spandrel", category: "Glass", params: { color: new THREE.Color("#e9eef0"), metalness: 0.2, roughness: 0.18, transparent: true, opacity: 0.72 } },
    { id: "glass-spandrel-black", label: "Glass · Black Spandrel", category: "Glass", params: { color: new THREE.Color("#1f2328"), metalness: 0.25, roughness: 0.16, transparent: true, opacity: 0.78 } },
    { id: "brick-handmade-red", label: "Brick · Handmade Red Multi", category: "Masonry", params: { color: new THREE.Color("#a24e39"), metalness: 0, roughness: 0.96 } },
    { id: "brick-stock-yellow", label: "Brick · London Stock Yellow", category: "Masonry", params: { color: new THREE.Color("#c9aa70"), metalness: 0, roughness: 0.94 } },
    { id: "brick-white-glazed", label: "Brick · White Glazed", category: "Masonry", params: { color: new THREE.Color("#f4f1ea"), metalness: 0, roughness: 0.12 } },
    { id: "brick-blue-engineering", label: "Brick · Blue Engineering", category: "Masonry", params: { color: new THREE.Color("#2e3540"), metalness: 0, roughness: 0.50 } },
    { id: "brick-clinker-dark", label: "Brick · Dark Clinker", category: "Masonry", params: { color: new THREE.Color("#32231c"), metalness: 0, roughness: 0.92 } },
    { id: "blockwork-split-face", label: "Blockwork · Split Face Concrete", category: "Masonry", params: { color: new THREE.Color("#8d8b82"), metalness: 0, roughness: 0.98 } },
    { id: "terra-cotta-rainscreen", label: "Terracotta · Rainscreen Panel", category: "Masonry", params: { color: new THREE.Color("#b85d3d"), metalness: 0, roughness: 0.72 } },
    { id: "stone-basalt", label: "Stone · Basalt", category: "Stone", params: { color: new THREE.Color("#2d3030"), metalness: 0.03, roughness: 0.58 } },
    { id: "stone-quartzite", label: "Stone · Quartzite", category: "Stone", params: { color: new THREE.Color("#c6c1b4"), metalness: 0.02, roughness: 0.32 } },
    { id: "stone-marble-carrara", label: "Stone · Marble Carrara", category: "Stone", params: { color: new THREE.Color("#f2f0eb"), metalness: 0, roughness: 0.10 } },
    { id: "stone-marble-nero-marquina", label: "Stone · Marble Nero Marquina", category: "Stone", params: { color: new THREE.Color("#161616"), metalness: 0, roughness: 0.12 } },
    { id: "stone-onyx-honey", label: "Stone · Honey Onyx", category: "Stone", params: { color: new THREE.Color("#d8aa57"), metalness: 0, roughness: 0.20, transparent: true, opacity: 0.84 } },
    { id: "stone-soapstone", label: "Stone · Soapstone", category: "Stone", params: { color: new THREE.Color("#4d5b55"), metalness: 0.03, roughness: 0.42 } },
    { id: "stone-blue-stone", label: "Stone · Blue Stone Honed", category: "Stone", params: { color: new THREE.Color("#5d6970"), metalness: 0.02, roughness: 0.48 } },
    { id: "tile-zellige-white", label: "Tile · White Zellige", category: "Ceramic & Tile", params: { color: new THREE.Color("#f5f0e8"), metalness: 0, roughness: 0.18 } },
    { id: "tile-zellige-green", label: "Tile · Emerald Zellige", category: "Ceramic & Tile", params: { color: new THREE.Color("#1f735c"), metalness: 0, roughness: 0.20 } },
    { id: "tile-subway-white", label: "Tile · White Subway Gloss", category: "Ceramic & Tile", params: { color: new THREE.Color("#faf8f2"), metalness: 0, roughness: 0.08 } },
    { id: "tile-encaustic-pattern-base", label: "Tile · Encaustic Cement", category: "Ceramic & Tile", params: { color: new THREE.Color("#8f8a7d"), metalness: 0, roughness: 0.78 } },
    { id: "tile-mosaic-glass", label: "Tile · Glass Mosaic", category: "Ceramic & Tile", params: { color: new THREE.Color("#85aeb8"), metalness: 0.1, roughness: 0.12, transparent: true, opacity: 0.70 } },
    { id: "tile-quarry-red", label: "Tile · Quarry Red", category: "Ceramic & Tile", params: { color: new THREE.Color("#93432d"), metalness: 0, roughness: 0.84 } },
    { id: "paint-matte-white", label: "Paint · Matte White", category: "Paint & Coating", params: { color: new THREE.Color("#f7f5ef"), metalness: 0, roughness: 0.88 } },
    { id: "paint-eggshell-warm", label: "Paint · Warm Eggshell", category: "Paint & Coating", params: { color: new THREE.Color("#eee4d2"), metalness: 0, roughness: 0.42 } },
    { id: "paint-satin-charcoal", label: "Paint · Satin Charcoal", category: "Paint & Coating", params: { color: new THREE.Color("#303236"), metalness: 0, roughness: 0.36 } },
    { id: "paint-limewash-cream", label: "Paint · Limewash Cream", category: "Paint & Coating", params: { color: new THREE.Color("#e9ddc8"), metalness: 0, roughness: 0.96 } },
    { id: "paint-microcement-warm-grey", label: "Coating · Microcement Warm Grey", category: "Paint & Coating", params: { color: new THREE.Color("#bcb5aa"), metalness: 0, roughness: 0.64 } },
    { id: "coating-epoxy-white", label: "Coating · White Epoxy Floor", category: "Paint & Coating", params: { color: new THREE.Color("#f1f2ee"), metalness: 0, roughness: 0.18 } },
    { id: "coating-epoxy-grey-flake", label: "Coating · Grey Epoxy Flake", category: "Paint & Coating", params: { color: new THREE.Color("#8a8c88"), metalness: 0, roughness: 0.28 } },
    { id: "plaster-clay-natural", label: "Plaster · Natural Clay", category: "Gypsum & Plaster", params: { color: new THREE.Color("#c6aa8b"), metalness: 0, roughness: 0.94 } },
    { id: "plaster-tadelakt", label: "Plaster · Tadelakt", category: "Gypsum & Plaster", params: { color: new THREE.Color("#d2c1a5"), metalness: 0.02, roughness: 0.24 } },
    { id: "gypsum-fire-rated-pink", label: "Plasterboard · Fire Rated Pink", category: "Gypsum & Plaster", params: { color: new THREE.Color("#e5b4ad"), metalness: 0, roughness: 0.90 } },
    { id: "gypsum-moisture-green", label: "Plasterboard · Moisture Resistant Green", category: "Gypsum & Plaster", params: { color: new THREE.Color("#b8c9b2"), metalness: 0, roughness: 0.90 } },
    { id: "insulation-cellulose", label: "Insulation · Blown Cellulose", category: "Insulation", params: { color: new THREE.Color("#bca57d"), metalness: 0, roughness: 1.0 } },
    { id: "insulation-hemp", label: "Insulation · Hemp Fibre", category: "Insulation", params: { color: new THREE.Color("#b8a66c"), metalness: 0, roughness: 1.0 } },
    { id: "insulation-wood-fibre", label: "Insulation · Wood Fibre Board", category: "Insulation", params: { color: new THREE.Color("#c6a66a"), metalness: 0, roughness: 0.96 } },
    { id: "insulation-aerogel-blanket", label: "Insulation · Aerogel Blanket", category: "Insulation", params: { color: new THREE.Color("#e6e4df"), metalness: 0, roughness: 0.82 } },
    { id: "membrane-vapour-blue", label: "Membrane · Blue Vapour Barrier", category: "Membrane & Waterproofing", params: { color: new THREE.Color("#4276b6"), metalness: 0, roughness: 0.48, transparent: true, opacity: 0.82 } },
    { id: "membrane-green-roof-root", label: "Membrane · Root Barrier", category: "Membrane & Waterproofing", params: { color: new THREE.Color("#202b22"), metalness: 0, roughness: 0.78 } },
    { id: "membrane-liquid-grey", label: "Membrane · Liquid Applied Grey", category: "Membrane & Waterproofing", params: { color: new THREE.Color("#7b7d7d"), metalness: 0, roughness: 0.66 } },
    { id: "roofing-slate-natural", label: "Roofing · Natural Slate", category: "Roofing", params: { color: new THREE.Color("#3f4449"), metalness: 0.02, roughness: 0.74 } },
    { id: "roofing-clay-tile-red", label: "Roofing · Red Clay Tile", category: "Roofing", params: { color: new THREE.Color("#b55436"), metalness: 0, roughness: 0.84 } },
    { id: "roofing-concrete-tile-grey", label: "Roofing · Grey Concrete Tile", category: "Roofing", params: { color: new THREE.Color("#6e7170"), metalness: 0, roughness: 0.82 } },
    { id: "roofing-standing-seam-dark", label: "Roofing · Dark Standing Seam Metal", category: "Roofing", params: { color: new THREE.Color("#262c31"), metalness: 0.65, roughness: 0.50 } },
    { id: "roofing-thatch", label: "Roofing · Natural Thatch", category: "Roofing", params: { color: new THREE.Color("#c49b55"), metalness: 0, roughness: 0.98 } },
    { id: "roofing-green-sedum", label: "Roofing · Sedum Green Roof", category: "Roofing", params: { color: new THREE.Color("#617d42"), metalness: 0, roughness: 0.95 } },
    { id: "fabric-wool-felt-grey", label: "Fabric · Wool Felt Grey", category: "Fabric & Soft", params: { color: new THREE.Color("#747873"), metalness: 0, roughness: 1.0 } },
    { id: "fabric-boucle-cream", label: "Fabric · Bouclé Cream", category: "Fabric & Soft", params: { color: new THREE.Color("#e3d8c2"), metalness: 0, roughness: 1.0 } },
    { id: "fabric-velvet-navy", label: "Fabric · Velvet Navy", category: "Fabric & Soft", params: { color: new THREE.Color("#172a4b"), metalness: 0, roughness: 0.62 } },
    { id: "fabric-canvas-natural", label: "Fabric · Natural Canvas", category: "Fabric & Soft", params: { color: new THREE.Color("#cbbd9e"), metalness: 0, roughness: 0.98 } },
    { id: "rubber-speckled-gym", label: "Rubber · Speckled Gym Flooring", category: "Plastic & Polymer", params: { color: new THREE.Color("#303432"), metalness: 0, roughness: 0.88 } },
    { id: "vinyl-lvt-oak", label: "Vinyl · LVT Oak Plank", category: "Plastic & Polymer", params: { color: new THREE.Color("#b88a55"), metalness: 0, roughness: 0.46 } },
    { id: "vinyl-linoleum-green", label: "Linoleum · Muted Green", category: "Plastic & Polymer", params: { color: new THREE.Color("#6f8163"), metalness: 0, roughness: 0.70 } },
    { id: "polycarbonate-opal", label: "Polycarbonate · Opal Multiwall", category: "Plastic & Polymer", params: { color: new THREE.Color("#e5edf1"), metalness: 0, roughness: 0.34, transparent: true, opacity: 0.66 } },
    { id: "acrylic-clear", label: "Acrylic · Clear Sheet", category: "Plastic & Polymer", params: { color: new THREE.Color("#edf8ff"), metalness: 0, roughness: 0.04, transparent: true, opacity: 0.35 } },
    { id: "landscape-grass-short", label: "Landscape · Short Grass", category: "Landscape & Ground", params: { color: new THREE.Color("#4f7d38"), metalness: 0, roughness: 0.95 } },
    { id: "landscape-soil-dark", label: "Landscape · Dark Loam Soil", category: "Landscape & Ground", params: { color: new THREE.Color("#3f3024"), metalness: 0, roughness: 1.0 } },
    { id: "landscape-gravel-light", label: "Landscape · Light Pea Gravel", category: "Landscape & Ground", params: { color: new THREE.Color("#b9b3a6"), metalness: 0, roughness: 0.98 } },
    { id: "landscape-gravel-basalt", label: "Landscape · Basalt Gravel", category: "Landscape & Ground", params: { color: new THREE.Color("#45484a"), metalness: 0, roughness: 0.96 } },
    { id: "landscape-sand", label: "Landscape · Sand", category: "Landscape & Ground", params: { color: new THREE.Color("#d2b982"), metalness: 0, roughness: 1.0 } },
    { id: "landscape-asphalt-new", label: "Ground · New Asphalt", category: "Landscape & Ground", params: { color: new THREE.Color("#202326"), metalness: 0, roughness: 0.78 } },
    { id: "landscape-asphalt-worn", label: "Ground · Worn Asphalt", category: "Landscape & Ground", params: { color: new THREE.Color("#474a4a"), metalness: 0, roughness: 0.92 } },
    { id: "special-mirror-silver", label: "Special · Silver Mirror", category: "Specialty Surfaces", params: { color: new THREE.Color("#dfe3e8"), metalness: 1, roughness: 0.0 } },
    { id: "special-black-gloss", label: "Special · Piano Black Gloss", category: "Specialty Surfaces", params: { color: new THREE.Color("#050505"), metalness: 0, roughness: 0.02 } },
    { id: "special-white-solid-surface", label: "Special · White Solid Surface", category: "Specialty Surfaces", params: { color: new THREE.Color("#f3f1ec"), metalness: 0, roughness: 0.30 } },
    { id: "special-corian-warm-grey", label: "Special · Warm Grey Solid Surface", category: "Specialty Surfaces", params: { color: new THREE.Color("#b9b0a6"), metalness: 0, roughness: 0.32 } },
    { id: "special-carbon-fibre", label: "Special · Carbon Fibre Composite", category: "Specialty Surfaces", params: { color: new THREE.Color("#111416"), metalness: 0.2, roughness: 0.28 } },
    { id: "special-cork", label: "Special · Natural Cork", category: "Specialty Surfaces", params: { color: new THREE.Color("#b9874f"), metalness: 0, roughness: 0.94 } },
];

// ------------------------------------------------------------------
// Wall material factories
// ------------------------------------------------------------------
export function createWallSchematicMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color:     0xe8e8e8,
        roughness: 0.9,
        metalness: 0.0,
    });
}

export function createWallRealisticMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
        color:     0xf5f5f5,
        roughness: 0.85,
        metalness: 0.0,
    });
}

export const WALL_SCHEMATIC_MATERIAL = {
    color:     0xe8e8e8,
    roughness: 0.9,
    metalness: 0.0,
};

export const WALL_REALISTIC_MATERIAL = {
    color:     0xf5f5f5,
    roughness: 0.85,
    metalness: 0.0,
};

export function disposeLibraryTextures(): void {
    STANDARD_MATERIAL_LIBRARY.forEach(def => {
        def.textures?.color?.dispose();
        def.textures?.normal?.dispose();
        def.textures?.roughness?.dispose();
    });
}
