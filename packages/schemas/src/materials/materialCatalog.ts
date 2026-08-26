// C84 §1.1 — MATERIAL_CATALOG: the T1 built-in material vocabulary.
//
// Seeded with 204 rows, transcribed MECHANICALLY (never by hand) from the array literal that
// used to live in `packages/core-app-model/src/materialLibrary.ts`, which now
// DERIVES its THREE-typed view from this file and holds no data of its own
// (C84 §1.3). Rekeying 204 rows by hand would have been the seventh source.
//
// ⚠ COLOUR FIDELITY, measured rather than asserted (ADR-0333 §Consequences):
// 198 of the 204 used `new THREE.Color('#rrggbb')` and are bit-identical here.
// The other 6 (glass-clear, glass-frosted, glass-low-e, glass-structural,
// glass-reflective, plastic-transparent) used the float-triplet form
// `new THREE.Color(0.85, 0.9, 1)`, which has NO exact 8-bit hex. They were
// converted through this repository's own THREE r183 and the worst-case shift is
// 0.951 of ONE 8-bit sRGB step — below the quantisation the display pipeline
// already applies, i.e. not observable. NOT zero, though: calling the move
// "lossless" would have been false, so it is written down instead.
//
// GROWTH LOG (do not delete — a count in prose rots; this says WHY it moved):
//  +1 2026-08-19 `steel-grating` (L-1038 S14). `packages/types-builtin/src/stair`
//     referenced `steel.grate` for the industrial stair, which resolved to NOTHING.
//     The nearest existing row was `metal-mesh-expanded` — expanded ALUMINIUM mesh,
//     the wrong metal and the wrong product. Mapping a real material onto a wrong
//     one to satisfy a gate is how the rival vocabularies got written in the first
//     place (C100 §1.1), so the MASTER gained the material instead. Cite
//     `MATERIAL_CATALOG.length`, never a number from this comment.
//  +1 2026-08-23 `steel-powder-coated-dark` (L-7703). The `wt-steel-crittal` window
//     preset's frame is a DARK POWDER-COATED STEEL at `#444444`, and the master had
//     no such row: the nearest metals were `aluminium-powder-coated-dark` (right
//     finish, WRONG METAL) and `steel-blackened` (#1d1f20, right metal, a different
//     product and far darker). Per the `steel-grating` precedent immediately above —
//     mapping a real material onto a wrong one to satisfy a wiring job is how the
//     rival vocabularies got written (C100 §1.1) — the MASTER gained the material.
//     Its hex is the preset's own `#444444`, so seeding the reference recoloured
//     nothing for this row.
//
// TO ADD A MATERIAL: add a row HERE. Never beside it, and never in a projection —
// a projection maps the master, it never extends it (C84 §1.3).

import type { MaterialRecord } from './materialRecord.js';
// §MATERIAL-CARBON-FACTS (L-3101) — the factor VALUES are authored in their own
// file so each row can carry a full citation without turning a catalogue line
// into a paragraph. They are merged ONTO the record below, so a consumer still
// reads ONE record shape and there is no rival material-keyed table (C100 §1.1).
import { CARBON_FACTOR_TABLE } from './carbonFactorTable.js';

/** The T1 built-in catalogue. Cite `MATERIAL_CATALOG.length`, never a transcribed count. */
export const MATERIAL_CATALOG: readonly MaterialRecord[] = ([
  { source: 'builtin' as const, id: 'concrete-smooth', label: "Concrete · Smooth", category: 'Concrete', color: '#c8c8c4', metalness: 0, roughness: 0.85 },
  { source: 'builtin' as const, id: 'concrete-rough', label: "Concrete · Rough", category: 'Concrete', color: '#b0b0aa', metalness: 0, roughness: 0.95 },
  { source: 'builtin' as const, id: 'concrete-reinforced', label: "Concrete · Reinforced", category: 'Concrete', color: '#b8b8b2', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'concrete-precast', label: "Concrete · Precast", category: 'Concrete', color: '#d0d0ca', metalness: 0, roughness: 0.75 },
  { source: 'builtin' as const, id: 'concrete-exposed', label: "Concrete · Exposed (Board-Marked)", category: 'Concrete', color: '#a8a8a2', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'concrete-burnished', label: "Concrete · Burnished", category: 'Concrete', color: '#d4d4ce', metalness: 0.05, roughness: 0.45 },
  { source: 'builtin' as const, id: 'concrete-white', label: "Concrete · White Cement", category: 'Concrete', color: '#e8e8e2', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'steel-structural', label: "Steel · Structural (Hot-Rolled)", category: 'Metal', color: '#9aa0a8', metalness: 1, roughness: 0.35 },
  { source: 'builtin' as const, id: 'steel-stainless-brushed', label: "Steel · Stainless Brushed", category: 'Metal', color: '#c8cdd4', metalness: 1, roughness: 0.25 },
  { source: 'builtin' as const, id: 'steel-stainless-polished', label: "Steel · Stainless Polished", category: 'Metal', color: '#dce0e8', metalness: 1, roughness: 0.05 },
  { source: 'builtin' as const, id: 'steel-galvanised', label: "Steel · Galvanised", category: 'Metal', color: '#b4bac4', metalness: 0.8, roughness: 0.4 },
  { source: 'builtin' as const, id: 'steel-corten', label: "Steel · Corten (Weathering)", category: 'Metal', color: '#8c4a2c', metalness: 0.5, roughness: 0.8 },
  { source: 'builtin' as const, id: 'steel-powder-coated-dark', label: "Steel · Powder-Coated Dark Grey", category: 'Metal', color: '#444444', metalness: 0.35, roughness: 0.55 },
  { source: 'builtin' as const, id: 'aluminium-anodised-silver', label: "Aluminium · Anodised Silver", category: 'Metal', color: '#c0c4c8', metalness: 0.9, roughness: 0.2 },
  { source: 'builtin' as const, id: 'aluminium-powder-coated-white', label: "Aluminium · Powder-Coated White", category: 'Metal', color: '#f0f0f0', metalness: 0, roughness: 0.55 },
  { source: 'builtin' as const, id: 'aluminium-powder-coated-dark', label: "Aluminium · Powder-Coated Dark Grey", category: 'Metal', color: '#3c3c3c', metalness: 0, roughness: 0.55 },
  { source: 'builtin' as const, id: 'copper-new', label: "Copper · New (Bright)", category: 'Metal', color: '#b87333', metalness: 1, roughness: 0.2 },
  { source: 'builtin' as const, id: 'copper-patinated', label: "Copper · Patinated (Green)", category: 'Metal', color: '#4a8a6a', metalness: 0.3, roughness: 0.7 },
  { source: 'builtin' as const, id: 'zinc-natural', label: "Zinc · Natural Standing Seam", category: 'Metal', color: '#7a8090', metalness: 0.7, roughness: 0.5 },
  { source: 'builtin' as const, id: 'brass-polished', label: "Brass · Polished", category: 'Metal', color: '#c8a840', metalness: 1, roughness: 0.1 },
  { source: 'builtin' as const, id: 'cast-iron', label: "Cast Iron", category: 'Metal', color: '#3a3a3a', metalness: 0.8, roughness: 0.6 },
  { source: 'builtin' as const, id: 'wood-oak', label: "Wood · Oak (Light)", category: 'Wood', color: '#c8a96e', metalness: 0, roughness: 0.6 },
  { source: 'builtin' as const, id: 'wood-walnut', label: "Wood · Walnut (Dark)", category: 'Wood', color: '#5a3a28', metalness: 0, roughness: 0.65 },
  { source: 'builtin' as const, id: 'wood-pine', label: "Wood · Pine (Natural)", category: 'Wood', color: '#deb887', metalness: 0, roughness: 0.7 },
  { source: 'builtin' as const, id: 'wood-birch', label: "Wood · Birch (Pale)", category: 'Wood', color: '#e8d8a8', metalness: 0, roughness: 0.6 },
  { source: 'builtin' as const, id: 'wood-teak', label: "Wood · Teak", category: 'Wood', color: '#a0724a', metalness: 0, roughness: 0.55 },
  { source: 'builtin' as const, id: 'wood-ash', label: "Wood · Ash", category: 'Wood', color: '#d4c498', metalness: 0, roughness: 0.62 },
  { source: 'builtin' as const, id: 'wood-reclaimed', label: "Wood · Reclaimed / Weathered", category: 'Wood', color: '#907868', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'wood-painted-white', label: "Wood · Painted White", category: 'Wood', color: '#f5f5f0', metalness: 0, roughness: 0.5 },
  { source: 'builtin' as const, id: 'timber-plywood', label: "Plywood · Birch Face", category: 'Timber Engineered', color: '#e0c890', metalness: 0, roughness: 0.72 },
  { source: 'builtin' as const, id: 'timber-clt', label: "CLT · Cross-Laminated Timber", category: 'Timber Engineered', color: '#c0a070', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'timber-glulam', label: "Glulam · Glued Laminated Timber", category: 'Timber Engineered', color: '#c8a060', metalness: 0, roughness: 0.68 },
  { source: 'builtin' as const, id: 'timber-bamboo', label: "Bamboo · Strand-Woven", category: 'Timber Engineered', color: '#d4bc78', metalness: 0, roughness: 0.55 },
  { source: 'builtin' as const, id: 'timber-mdf', label: "MDF · Medium-Density Fibreboard", category: 'Timber Engineered', color: '#c8b890', metalness: 0, roughness: 0.85 },
  { source: 'builtin' as const, id: 'glass-clear', label: "Glass · Clear Float", category: 'Glass', color: '#edf3ff', metalness: 0, roughness: 0.05, opacity: 0.3, transparent: true },
  { source: 'builtin' as const, id: 'glass-frosted', label: "Glass · Frosted", category: 'Glass', color: '#f3f3f9', metalness: 0, roughness: 0.6, opacity: 0.55, transparent: true },
  { source: 'builtin' as const, id: 'glass-tinted-bronze', label: "Glass · Tinted Bronze", category: 'Glass', color: '#c0a060', metalness: 0, roughness: 0.05, opacity: 0.4, transparent: true },
  { source: 'builtin' as const, id: 'glass-tinted-grey', label: "Glass · Tinted Grey", category: 'Glass', color: '#808090', metalness: 0, roughness: 0.05, opacity: 0.35, transparent: true },
  { source: 'builtin' as const, id: 'glass-low-e', label: "Glass · Low-E (Solar Control)", category: 'Glass', color: '#e7f1f9', metalness: 0.1, roughness: 0.03, opacity: 0.3, transparent: true },
  { source: 'builtin' as const, id: 'glass-structural', label: "Glass · Structural / Toughened", category: 'Glass', color: '#f3f9ff', metalness: 0, roughness: 0.02, opacity: 0.25, transparent: true },
  { source: 'builtin' as const, id: 'glass-reflective', label: "Glass · Reflective (Curtain Wall)", category: 'Glass', color: '#dae7f3', metalness: 0.5, roughness: 0.05, opacity: 0.55, transparent: true },
  { source: 'builtin' as const, id: 'brick-red', label: "Brick · Red Facing", category: 'Masonry', color: '#9a4a34', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'brick-buff', label: "Brick · Buff / Sand Lime", category: 'Masonry', color: '#d4bc8a', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'brick-grey', label: "Brick · Grey Engineering", category: 'Masonry', color: '#7a7a7a', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'brick-dark', label: "Brick · Dark / Charcoal", category: 'Masonry', color: '#3c3028', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'blockwork-dense', label: "Blockwork · Dense Concrete", category: 'Masonry', color: '#a0a09a', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'blockwork-lightweight', label: "Blockwork · Lightweight (Aircrete)", category: 'Masonry', color: '#d0d0c8', metalness: 0, roughness: 0.82 },
  { source: 'builtin' as const, id: 'stone-limestone-light', label: "Stone · Limestone (Light)", category: 'Stone', color: '#d8d0b8', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'stone-limestone-grey', label: "Stone · Limestone (Grey)", category: 'Stone', color: '#b0a898', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'stone-sandstone', label: "Stone · Sandstone", category: 'Stone', color: '#c8a878', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'stone-granite-grey', label: "Stone · Granite (Grey Polished)", category: 'Stone', color: '#888888', metalness: 0.05, roughness: 0.15 },
  { source: 'builtin' as const, id: 'stone-granite-black', label: "Stone · Granite (Black Polished)", category: 'Stone', color: '#242424', metalness: 0.05, roughness: 0.1 },
  { source: 'builtin' as const, id: 'stone-marble-white', label: "Stone · Marble (White)", category: 'Stone', color: '#f0ede8', metalness: 0, roughness: 0.12 },
  { source: 'builtin' as const, id: 'stone-slate', label: "Stone · Slate", category: 'Stone', color: '#484c50', metalness: 0.05, roughness: 0.8 },
  { source: 'builtin' as const, id: 'stone-travertine', label: "Stone · Travertine", category: 'Stone', color: '#d8c8a0', metalness: 0, roughness: 0.75 },
  { source: 'builtin' as const, id: 'tile-white-gloss', label: "Ceramic Tile · White Gloss", category: 'Ceramic & Tile', color: '#f8f8f8', metalness: 0, roughness: 0.05 },
  { source: 'builtin' as const, id: 'tile-grey-matt', label: "Ceramic Tile · Grey Matt", category: 'Ceramic & Tile', color: '#909090', metalness: 0, roughness: 0.75 },
  { source: 'builtin' as const, id: 'tile-terracotta', label: "Ceramic Tile · Terracotta", category: 'Ceramic & Tile', color: '#c06040', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'tile-porcelain', label: "Porcelain Tile · Light Stone", category: 'Ceramic & Tile', color: '#ddd8d0', metalness: 0, roughness: 0.3 },
  { source: 'builtin' as const, id: 'plastic-white', label: "Plastic · White", category: 'Plastic & Polymer', color: '#ffffff', metalness: 0, roughness: 0.4 },
  { source: 'builtin' as const, id: 'plastic-grey', label: "Plastic · Dark Grey", category: 'Plastic & Polymer', color: '#505050', metalness: 0, roughness: 0.5 },
  { source: 'builtin' as const, id: 'plastic-transparent', label: "Plastic · Polycarbonate / Clear", category: 'Plastic & Polymer', color: '#f9f9ff', metalness: 0, roughness: 0.1, opacity: 0.75, transparent: true },
  { source: 'builtin' as const, id: 'plastic-epdm', label: "EPDM Rubber", category: 'Plastic & Polymer', color: '#202020', metalness: 0, roughness: 0.95 },
  { source: 'builtin' as const, id: 'gypsum-plasterboard', label: "Plasterboard · Standard", category: 'Gypsum & Plaster', color: '#f0eeea', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'gypsum-acoustic', label: "Plasterboard · Acoustic", category: 'Gypsum & Plaster', color: '#eceae6', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'gypsum-skim', label: "Plaster · Skim Coat (Painted)", category: 'Gypsum & Plaster', color: '#f5f5f0', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'gypsum-venetian', label: "Plaster · Venetian (Polished)", category: 'Gypsum & Plaster', color: '#e8e4d8', metalness: 0.05, roughness: 0.25 },
  { source: 'builtin' as const, id: 'insulation-mineral-wool', label: "Insulation · Mineral Wool", category: 'Insulation', color: '#f0d080', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'insulation-pir', label: "Insulation · PIR Foam Board", category: 'Insulation', color: '#c0d840', metalness: 0, roughness: 0.95 },
  { source: 'builtin' as const, id: 'insulation-eps', label: "Insulation · EPS (White Foam)", category: 'Insulation', color: '#f8f8f8', metalness: 0, roughness: 0.95 },
  { source: 'builtin' as const, id: 'insulation-xps', label: "Insulation · XPS (Blue/Pink Board)", category: 'Insulation', color: '#8888e0', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'membrane-dpm', label: "Membrane · DPM (Black Polythene)", category: 'Membrane & Waterproofing', color: '#101010', metalness: 0.1, roughness: 0.9 },
  { source: 'builtin' as const, id: 'membrane-bitumen', label: "Membrane · Bitumen Felt", category: 'Membrane & Waterproofing', color: '#1a1a1a', metalness: 0, roughness: 0.95 },
  { source: 'builtin' as const, id: 'membrane-tpo', label: "Membrane · TPO Roofing", category: 'Membrane & Waterproofing', color: '#d8d8d8', metalness: 0, roughness: 0.85 },
  { source: 'builtin' as const, id: 'fabric-acoustic-panel', label: "Fabric · Acoustic Panel", category: 'Fabric & Soft', color: '#8898a8', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'fabric-awning', label: "Fabric · Awning / PTFE Canopy", category: 'Fabric & Soft', color: '#f0f0ec', metalness: 0, roughness: 0.9, opacity: 0.85, transparent: true },
  { source: 'builtin' as const, id: 'concrete-polished-light', label: "Concrete · Polished Light Grey", category: 'Concrete', color: '#d7d5cf', metalness: 0, roughness: 0.28 },
  { source: 'builtin' as const, id: 'concrete-polished-dark', label: "Concrete · Polished Charcoal", category: 'Concrete', color: '#555753', metalness: 0, roughness: 0.22 },
  { source: 'builtin' as const, id: 'concrete-terrazzo-fine', label: "Concrete · Fine Terrazzo", category: 'Concrete', color: '#d8d2c4', metalness: 0, roughness: 0.34 },
  { source: 'builtin' as const, id: 'concrete-terrazzo-dark', label: "Concrete · Dark Terrazzo", category: 'Concrete', color: '#4d4a45', metalness: 0, roughness: 0.36 },
  { source: 'builtin' as const, id: 'concrete-formwork-oiled', label: "Concrete · Oiled Formwork Cast", category: 'Concrete', color: '#ada99f', metalness: 0, roughness: 0.72 },
  { source: 'builtin' as const, id: 'concrete-brutalist-weathered', label: "Concrete · Brutalist Weathered", category: 'Concrete', color: '#8d8e88', metalness: 0, roughness: 0.96 },
  { source: 'builtin' as const, id: 'concrete-shotcrete', label: "Concrete · Shotcrete / Sprayed", category: 'Concrete', color: '#9e9d96', metalness: 0, roughness: 0.98 },
  { source: 'builtin' as const, id: 'concrete-lightweight-aac', label: "Concrete · AAC Lightweight Block", category: 'Concrete', color: '#d9d8cf', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'steel-blue-tempered', label: "Steel · Blue Tempered", category: 'Metal', color: '#526579', metalness: 1, roughness: 0.32 },
  { source: 'builtin' as const, id: 'steel-blackened', label: "Steel · Blackened Waxed", category: 'Metal', color: '#1d1f20', metalness: 0.9, roughness: 0.48 },
  { source: 'builtin' as const, id: 'steel-painted-red-oxide', label: "Steel · Red Oxide Primer", category: 'Metal', color: '#8f3328', metalness: 0.1, roughness: 0.74 },
  { source: 'builtin' as const, id: 'steel-painted-intumescent-white', label: "Steel · White Intumescent Coating", category: 'Metal', color: '#f1f0ec', metalness: 0, roughness: 0.62 },
  { source: 'builtin' as const, id: 'aluminium-brushed-dark', label: "Aluminium · Brushed Dark Anodised", category: 'Metal', color: '#474d52', metalness: 0.9, roughness: 0.24 },
  { source: 'builtin' as const, id: 'aluminium-bronze-anodised', label: "Aluminium · Bronze Anodised", category: 'Metal', color: '#9d724c', metalness: 0.85, roughness: 0.26 },
  { source: 'builtin' as const, id: 'zinc-preweathered-bluegrey', label: "Zinc · Pre-Weathered Blue Grey", category: 'Metal', color: '#66717c', metalness: 0.62, roughness: 0.55 },
  { source: 'builtin' as const, id: 'lead-aged-sheet', label: "Lead · Aged Sheet", category: 'Metal', color: '#5d6268', metalness: 0.7, roughness: 0.68 },
  { source: 'builtin' as const, id: 'bronze-aged', label: "Bronze · Aged Architectural", category: 'Metal', color: '#7b5d38', metalness: 0.85, roughness: 0.38 },
  { source: 'builtin' as const, id: 'metal-mesh-expanded', label: "Metal Mesh · Expanded Aluminium", category: 'Metal', color: '#aeb4b8', metalness: 0.9, roughness: 0.42 },
  { source: 'builtin' as const, id: 'steel-grating', label: "Steel · Open Grating (Galvanised)", category: 'Metal', color: '#a8aeb4', metalness: 0.85, roughness: 0.55 },
  { source: 'builtin' as const, id: 'wood-oak-smoked', label: "Wood · Smoked Oak", category: 'Wood', color: '#6b523a', metalness: 0, roughness: 0.58 },
  { source: 'builtin' as const, id: 'wood-oak-whitewashed', label: "Wood · Whitewashed Oak", category: 'Wood', color: '#d8cdb8', metalness: 0, roughness: 0.64 },
  { source: 'builtin' as const, id: 'wood-maple', label: "Wood · Maple", category: 'Wood', color: '#e0c795', metalness: 0, roughness: 0.56 },
  { source: 'builtin' as const, id: 'wood-cedar-red', label: "Wood · Red Cedar", category: 'Wood', color: '#a65e3d', metalness: 0, roughness: 0.7 },
  { source: 'builtin' as const, id: 'wood-cherry', label: "Wood · Cherry", category: 'Wood', color: '#8f4f35', metalness: 0, roughness: 0.52 },
  { source: 'builtin' as const, id: 'wood-mahogany', label: "Wood · Mahogany", category: 'Wood', color: '#5a241b', metalness: 0, roughness: 0.5 },
  { source: 'builtin' as const, id: 'wood-ebony', label: "Wood · Ebony", category: 'Wood', color: '#1f1a16', metalness: 0, roughness: 0.46 },
  { source: 'builtin' as const, id: 'wood-charred-shou-sugi-ban', label: "Wood · Charred Shou Sugi Ban", category: 'Wood', color: '#171615', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'wood-thermowood', label: "Wood · Thermowood Cladding", category: 'Wood', color: '#8c5735', metalness: 0, roughness: 0.78 },
  { source: 'builtin' as const, id: 'timber-osb', label: "OSB · Oriented Strand Board", category: 'Timber Engineered', color: '#c89d5f', metalness: 0, roughness: 0.86 },
  { source: 'builtin' as const, id: 'timber-chipboard', label: "Chipboard · Raw", category: 'Timber Engineered', color: '#b89461', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'timber-hdf-black', label: "HDF · Black Core", category: 'Timber Engineered', color: '#24221f', metalness: 0, roughness: 0.7 },
  { source: 'builtin' as const, id: 'timber-veneer-oak', label: "Veneer · Oak Panel", category: 'Timber Engineered', color: '#c49b62', metalness: 0, roughness: 0.48 },
  { source: 'builtin' as const, id: 'glass-ultra-clear', label: "Glass · Ultra Clear Low Iron", category: 'Glass', color: '#eef8ff', metalness: 0, roughness: 0.015, opacity: 0.18, transparent: true },
  { source: 'builtin' as const, id: 'glass-laminated', label: "Glass · Laminated Safety", category: 'Glass', color: '#dcecf3', metalness: 0, roughness: 0.04, opacity: 0.32, transparent: true },
  { source: 'builtin' as const, id: 'glass-reeded', label: "Glass · Reeded / Fluted", category: 'Glass', color: '#dbe9ef', metalness: 0, roughness: 0.42, opacity: 0.5, transparent: true },
  { source: 'builtin' as const, id: 'glass-channel-u', label: "Glass · U-Channel Translucent", category: 'Glass', color: '#d7e8ef', metalness: 0, roughness: 0.5, opacity: 0.58, transparent: true },
  { source: 'builtin' as const, id: 'glass-spandrel-white', label: "Glass · White Spandrel", category: 'Glass', color: '#e9eef0', metalness: 0.2, roughness: 0.18, opacity: 0.72, transparent: true },
  { source: 'builtin' as const, id: 'glass-spandrel-black', label: "Glass · Black Spandrel", category: 'Glass', color: '#1f2328', metalness: 0.25, roughness: 0.16, opacity: 0.78, transparent: true },
  { source: 'builtin' as const, id: 'brick-handmade-red', label: "Brick · Handmade Red Multi", category: 'Masonry', color: '#a24e39', metalness: 0, roughness: 0.96 },
  { source: 'builtin' as const, id: 'brick-stock-yellow', label: "Brick · London Stock Yellow", category: 'Masonry', color: '#c9aa70', metalness: 0, roughness: 0.94 },
  { source: 'builtin' as const, id: 'brick-white-glazed', label: "Brick · White Glazed", category: 'Masonry', color: '#f4f1ea', metalness: 0, roughness: 0.12 },
  { source: 'builtin' as const, id: 'brick-blue-engineering', label: "Brick · Blue Engineering", category: 'Masonry', color: '#2e3540', metalness: 0, roughness: 0.5 },
  { source: 'builtin' as const, id: 'brick-clinker-dark', label: "Brick · Dark Clinker", category: 'Masonry', color: '#32231c', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'blockwork-split-face', label: "Blockwork · Split Face Concrete", category: 'Masonry', color: '#8d8b82', metalness: 0, roughness: 0.98 },
  { source: 'builtin' as const, id: 'terra-cotta-rainscreen', label: "Terracotta · Rainscreen Panel", category: 'Masonry', color: '#b85d3d', metalness: 0, roughness: 0.72 },
  { source: 'builtin' as const, id: 'stone-basalt', label: "Stone · Basalt", category: 'Stone', color: '#2d3030', metalness: 0.03, roughness: 0.58 },
  { source: 'builtin' as const, id: 'stone-quartzite', label: "Stone · Quartzite", category: 'Stone', color: '#c6c1b4', metalness: 0.02, roughness: 0.32 },
  { source: 'builtin' as const, id: 'stone-marble-carrara', label: "Stone · Marble Carrara", category: 'Stone', color: '#f2f0eb', metalness: 0, roughness: 0.1 },
  { source: 'builtin' as const, id: 'stone-marble-nero-marquina', label: "Stone · Marble Nero Marquina", category: 'Stone', color: '#161616', metalness: 0, roughness: 0.12 },
  { source: 'builtin' as const, id: 'stone-onyx-honey', label: "Stone · Honey Onyx", category: 'Stone', color: '#d8aa57', metalness: 0, roughness: 0.2, opacity: 0.84, transparent: true },
  { source: 'builtin' as const, id: 'stone-soapstone', label: "Stone · Soapstone", category: 'Stone', color: '#4d5b55', metalness: 0.03, roughness: 0.42 },
  { source: 'builtin' as const, id: 'stone-blue-stone', label: "Stone · Blue Stone Honed", category: 'Stone', color: '#5d6970', metalness: 0.02, roughness: 0.48 },
  { source: 'builtin' as const, id: 'tile-zellige-white', label: "Tile · White Zellige", category: 'Ceramic & Tile', color: '#f5f0e8', metalness: 0, roughness: 0.18 },
  { source: 'builtin' as const, id: 'tile-zellige-green', label: "Tile · Emerald Zellige", category: 'Ceramic & Tile', color: '#1f735c', metalness: 0, roughness: 0.2 },
  { source: 'builtin' as const, id: 'tile-subway-white', label: "Tile · White Subway Gloss", category: 'Ceramic & Tile', color: '#faf8f2', metalness: 0, roughness: 0.08 },
  { source: 'builtin' as const, id: 'tile-encaustic-pattern-base', label: "Tile · Encaustic Cement", category: 'Ceramic & Tile', color: '#8f8a7d', metalness: 0, roughness: 0.78 },
  { source: 'builtin' as const, id: 'tile-mosaic-glass', label: "Tile · Glass Mosaic", category: 'Ceramic & Tile', color: '#85aeb8', metalness: 0.1, roughness: 0.12, opacity: 0.7, transparent: true },
  { source: 'builtin' as const, id: 'tile-quarry-red', label: "Tile · Quarry Red", category: 'Ceramic & Tile', color: '#93432d', metalness: 0, roughness: 0.84 },
  { source: 'builtin' as const, id: 'paint-matte-white', label: "Paint · Matte White", category: 'Paint & Coating', color: '#f7f5ef', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'paint-eggshell-warm', label: "Paint · Warm Eggshell", category: 'Paint & Coating', color: '#eee4d2', metalness: 0, roughness: 0.42 },
  { source: 'builtin' as const, id: 'paint-satin-charcoal', label: "Paint · Satin Charcoal", category: 'Paint & Coating', color: '#303236', metalness: 0, roughness: 0.36 },
  { source: 'builtin' as const, id: 'paint-limewash-cream', label: "Paint · Limewash Cream", category: 'Paint & Coating', color: '#e9ddc8', metalness: 0, roughness: 0.96 },
  { source: 'builtin' as const, id: 'paint-microcement-warm-grey', label: "Coating · Microcement Warm Grey", category: 'Paint & Coating', color: '#bcb5aa', metalness: 0, roughness: 0.64 },
  { source: 'builtin' as const, id: 'coating-epoxy-white', label: "Coating · White Epoxy Floor", category: 'Paint & Coating', color: '#f1f2ee', metalness: 0, roughness: 0.18 },
  { source: 'builtin' as const, id: 'coating-epoxy-grey-flake', label: "Coating · Grey Epoxy Flake", category: 'Paint & Coating', color: '#8a8c88', metalness: 0, roughness: 0.28 },
  { source: 'builtin' as const, id: 'plaster-clay-natural', label: "Plaster · Natural Clay", category: 'Gypsum & Plaster', color: '#c6aa8b', metalness: 0, roughness: 0.94 },
  { source: 'builtin' as const, id: 'plaster-tadelakt', label: "Plaster · Tadelakt", category: 'Gypsum & Plaster', color: '#d2c1a5', metalness: 0.02, roughness: 0.24 },
  { source: 'builtin' as const, id: 'gypsum-fire-rated-pink', label: "Plasterboard · Fire Rated Pink", category: 'Gypsum & Plaster', color: '#e5b4ad', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'gypsum-moisture-green', label: "Plasterboard · Moisture Resistant Green", category: 'Gypsum & Plaster', color: '#b8c9b2', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'insulation-cellulose', label: "Insulation · Blown Cellulose", category: 'Insulation', color: '#bca57d', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'insulation-hemp', label: "Insulation · Hemp Fibre", category: 'Insulation', color: '#b8a66c', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'insulation-wood-fibre', label: "Insulation · Wood Fibre Board", category: 'Insulation', color: '#c6a66a', metalness: 0, roughness: 0.96 },
  { source: 'builtin' as const, id: 'insulation-aerogel-blanket', label: "Insulation · Aerogel Blanket", category: 'Insulation', color: '#e6e4df', metalness: 0, roughness: 0.82 },
  { source: 'builtin' as const, id: 'membrane-vapour-blue', label: "Membrane · Blue Vapour Barrier", category: 'Membrane & Waterproofing', color: '#4276b6', metalness: 0, roughness: 0.48, opacity: 0.82, transparent: true },
  { source: 'builtin' as const, id: 'membrane-green-roof-root', label: "Membrane · Root Barrier", category: 'Membrane & Waterproofing', color: '#202b22', metalness: 0, roughness: 0.78 },
  { source: 'builtin' as const, id: 'membrane-liquid-grey', label: "Membrane · Liquid Applied Grey", category: 'Membrane & Waterproofing', color: '#7b7d7d', metalness: 0, roughness: 0.66 },
  { source: 'builtin' as const, id: 'roofing-slate-natural', label: "Roofing · Natural Slate", category: 'Roofing', color: '#3f4449', metalness: 0.02, roughness: 0.74 },
  { source: 'builtin' as const, id: 'roofing-clay-tile-red', label: "Roofing · Red Clay Tile", category: 'Roofing', color: '#b55436', metalness: 0, roughness: 0.84 },
  { source: 'builtin' as const, id: 'roofing-concrete-tile-grey', label: "Roofing · Grey Concrete Tile", category: 'Roofing', color: '#6e7170', metalness: 0, roughness: 0.82 },
  { source: 'builtin' as const, id: 'roofing-standing-seam-dark', label: "Roofing · Dark Standing Seam Metal", category: 'Roofing', color: '#262c31', metalness: 0.65, roughness: 0.5 },
  { source: 'builtin' as const, id: 'roofing-thatch', label: "Roofing · Natural Thatch", category: 'Roofing', color: '#c49b55', metalness: 0, roughness: 0.98 },
  { source: 'builtin' as const, id: 'roofing-green-sedum', label: "Roofing · Sedum Green Roof", category: 'Roofing', color: '#617d42', metalness: 0, roughness: 0.95 },
  { source: 'builtin' as const, id: 'fabric-wool-felt-grey', label: "Fabric · Wool Felt Grey", category: 'Fabric & Soft', color: '#747873', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'fabric-boucle-cream', label: "Fabric · Bouclé Cream", category: 'Fabric & Soft', color: '#e3d8c2', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'fabric-velvet-navy', label: "Fabric · Velvet Navy", category: 'Fabric & Soft', color: '#172a4b', metalness: 0, roughness: 0.62 },
  { source: 'builtin' as const, id: 'fabric-canvas-natural', label: "Fabric · Natural Canvas", category: 'Fabric & Soft', color: '#cbbd9e', metalness: 0, roughness: 0.98 },
  { source: 'builtin' as const, id: 'rubber-speckled-gym', label: "Rubber · Speckled Gym Flooring", category: 'Plastic & Polymer', color: '#303432', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'vinyl-lvt-oak', label: "Vinyl · LVT Oak Plank", category: 'Plastic & Polymer', color: '#b88a55', metalness: 0, roughness: 0.46 },
  { source: 'builtin' as const, id: 'vinyl-linoleum-green', label: "Linoleum · Muted Green", category: 'Plastic & Polymer', color: '#6f8163', metalness: 0, roughness: 0.7 },
  { source: 'builtin' as const, id: 'polycarbonate-opal', label: "Polycarbonate · Opal Multiwall", category: 'Plastic & Polymer', color: '#e5edf1', metalness: 0, roughness: 0.34, opacity: 0.66, transparent: true },
  { source: 'builtin' as const, id: 'acrylic-clear', label: "Acrylic · Clear Sheet", category: 'Plastic & Polymer', color: '#edf8ff', metalness: 0, roughness: 0.04, opacity: 0.35, transparent: true },
  { source: 'builtin' as const, id: 'landscape-grass-short', label: "Landscape · Short Grass", category: 'Landscape & Ground', color: '#4f7d38', metalness: 0, roughness: 0.95 },
  { source: 'builtin' as const, id: 'landscape-soil-dark', label: "Landscape · Dark Loam Soil", category: 'Landscape & Ground', color: '#3f3024', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'landscape-gravel-light', label: "Landscape · Light Pea Gravel", category: 'Landscape & Ground', color: '#b9b3a6', metalness: 0, roughness: 0.98 },
  { source: 'builtin' as const, id: 'landscape-gravel-basalt', label: "Landscape · Basalt Gravel", category: 'Landscape & Ground', color: '#45484a', metalness: 0, roughness: 0.96 },
  { source: 'builtin' as const, id: 'landscape-sand', label: "Landscape · Sand", category: 'Landscape & Ground', color: '#d2b982', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'landscape-asphalt-new', label: "Ground · New Asphalt", category: 'Landscape & Ground', color: '#202326', metalness: 0, roughness: 0.78 },
  { source: 'builtin' as const, id: 'landscape-asphalt-worn', label: "Ground · Worn Asphalt", category: 'Landscape & Ground', color: '#474a4a', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'landscape-grass-lawn', label: "Landscape · Mown Lawn", category: 'Landscape & Ground', color: '#436f2c', metalness: 0, roughness: 0.96 },
  { source: 'builtin' as const, id: 'landscape-grass-ryegrass', label: "Landscape · Ryegrass Turf", category: 'Landscape & Ground', color: '#3d6b31', metalness: 0, roughness: 0.95 },
  { source: 'builtin' as const, id: 'landscape-grass-fescue-fine', label: "Landscape · Fine Fescue (Blue-Green)", category: 'Landscape & Ground', color: '#4a7050', metalness: 0, roughness: 0.96 },
  { source: 'builtin' as const, id: 'landscape-grass-meadow', label: "Landscape · Wildflower Meadow", category: 'Landscape & Ground', color: '#6b7a3c', metalness: 0, roughness: 0.98 },
  { source: 'builtin' as const, id: 'landscape-grass-tall-ornamental', label: "Landscape · Tall Ornamental Grass", category: 'Landscape & Ground', color: '#8a8a4e', metalness: 0, roughness: 0.98 },
  { source: 'builtin' as const, id: 'landscape-grass-dry', label: "Landscape · Drought-Dormant Grass", category: 'Landscape & Ground', color: '#a2914f', metalness: 0, roughness: 0.99 },
  { source: 'builtin' as const, id: 'landscape-grass-artificial', label: "Landscape · Artificial Turf", category: 'Landscape & Ground', color: '#4e8438', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'landscape-moss', label: "Landscape · Moss", category: 'Landscape & Ground', color: '#4c6330', metalness: 0, roughness: 0.99 },
  { source: 'builtin' as const, id: 'landscape-groundcover-shrub', label: "Landscape · Low Shrub Groundcover", category: 'Landscape & Ground', color: '#37542c', metalness: 0, roughness: 0.97 },
  { source: 'builtin' as const, id: 'landscape-topsoil', label: "Landscape · Screened Topsoil", category: 'Landscape & Ground', color: '#4a3a2b', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'landscape-soil-clay', label: "Landscape · Clay Subsoil", category: 'Landscape & Ground', color: '#6d4834', metalness: 0, roughness: 0.98 },
  { source: 'builtin' as const, id: 'landscape-soil-sandy-loam', label: "Landscape · Sandy Loam", category: 'Landscape & Ground', color: '#8a6f4c', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'landscape-bark-mulch', label: "Landscape · Bark Mulch", category: 'Landscape & Ground', color: '#5b3a26', metalness: 0, roughness: 0.99 },
  { source: 'builtin' as const, id: 'landscape-compost-dressing', label: "Landscape · Compost Dressing", category: 'Landscape & Ground', color: '#33291f', metalness: 0, roughness: 1 },
  { source: 'builtin' as const, id: 'ground-decomposed-granite', label: "Ground · Compacted Decomposed Granite", category: 'Landscape & Ground', color: '#ab8f68', metalness: 0, roughness: 0.97 },
  { source: 'builtin' as const, id: 'ground-hoggin-path', label: "Ground · Bound Hoggin Path", category: 'Landscape & Ground', color: '#9c8256', metalness: 0, roughness: 0.95 },
  { source: 'builtin' as const, id: 'ground-paving-granite', label: "Ground · Sawn Granite Paving", category: 'Landscape & Ground', color: '#8e8f8c', metalness: 0, roughness: 0.55 },
  { source: 'builtin' as const, id: 'ground-paving-sandstone', label: "Ground · Sandstone Flag Paving", category: 'Landscape & Ground', color: '#c3a983', metalness: 0, roughness: 0.74 },
  { source: 'builtin' as const, id: 'ground-paving-limestone', label: "Ground · Limestone Flag Paving", category: 'Landscape & Ground', color: '#cdc7b6', metalness: 0, roughness: 0.68 },
  { source: 'builtin' as const, id: 'ground-cobble-setts', label: "Ground · Granite Cobble Setts", category: 'Landscape & Ground', color: '#6e6b66', metalness: 0, roughness: 0.72 },
  { source: 'builtin' as const, id: 'ground-brick-paver', label: "Ground · Clay Brick Paver", category: 'Landscape & Ground', color: '#9c5a41', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'ground-concrete-path', label: "Ground · Broom-Finished Concrete Path", category: 'Landscape & Ground', color: '#c2beb6', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'ground-concrete-paver-grey', label: "Ground · Grey Concrete Paver", category: 'Landscape & Ground', color: '#a8a7a2', metalness: 0, roughness: 0.86 },
  { source: 'builtin' as const, id: 'ground-resin-bound-gravel', label: "Ground · Resin-Bound Gravel", category: 'Landscape & Ground', color: '#9a8a6f', metalness: 0, roughness: 0.62 },
  { source: 'builtin' as const, id: 'ground-timber-decking', label: "Ground · Timber Deck Boards", category: 'Landscape & Ground', color: '#9a7c55', metalness: 0, roughness: 0.82 },
  { source: 'builtin' as const, id: 'ground-stepping-stone', label: "Ground · Stepping Stones in Turf", category: 'Landscape & Ground', color: '#8a8781', metalness: 0, roughness: 0.76 },
  { source: 'builtin' as const, id: 'special-mirror-silver', label: "Special · Silver Mirror", category: 'Specialty Surfaces', color: '#dfe3e8', metalness: 1, roughness: 0 },
  { source: 'builtin' as const, id: 'special-black-gloss', label: "Special · Piano Black Gloss", category: 'Specialty Surfaces', color: '#050505', metalness: 0, roughness: 0.02 },
  { source: 'builtin' as const, id: 'special-white-solid-surface', label: "Special · White Solid Surface", category: 'Specialty Surfaces', color: '#f3f1ec', metalness: 0, roughness: 0.3 },
  { source: 'builtin' as const, id: 'special-corian-warm-grey', label: "Special · Warm Grey Solid Surface", category: 'Specialty Surfaces', color: '#b9b0a6', metalness: 0, roughness: 0.32 },
  { source: 'builtin' as const, id: 'special-carbon-fibre', label: "Special · Carbon Fibre Composite", category: 'Specialty Surfaces', color: '#111416', metalness: 0.2, roughness: 0.28 },
  { source: 'builtin' as const, id: 'special-cork', label: "Special · Natural Cork", category: 'Specialty Surfaces', color: '#b9874f', metalness: 0, roughness: 0.94 },
  // ─── BEGIN GENERATED: textured materials (emit-catalog-rows.mjs) ───────────
  //
  // 16 rows derived from tools/texture-pipeline/textures.manifest.json.
  // ⛔ DO NOT HAND-EDIT between these markers — re-run
  //    `node tools/texture-pipeline/emit-catalog-rows.mjs`.
  //
  // These are the first rows in this catalogue to carry PATTERN. C100 §10.3.a
  // measured five finish families at LITERALLY ZERO — shingle, parquet, carpet,
  // external render/stucco, fibre-cement cladding — and §10.3.b explains why no
  // number of flat-colour rows could have closed them: parquet IS pattern, and a
  // row without a map is a brown rectangle. Four of the five are closed here.
  //
  // Every map path is LOGICAL and starts with the catalogue prefix `/items/`;
  // `resolveCatalogAssetUrl` rewrites it to the object-storage base at fetch
  // time, so a project saved today keeps loading after the bucket moves.
  //
  // Licences: all CC0-1.0 (ambientCG), verified mechanically by acquire.mjs
  // before any network call. Provenance, SHA-256s and retrieval dates are in the
  // manifest — cited, never re-transcribed (C69 §0.1).
  // ambientCG 'Carpet 015' (Carpet015), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: deep red loop-pile carpet.
  { source: 'builtin' as const, id: 'carpet-tile-red-015', label: "Carpet · Tile Red 015", category: 'Fabric & Soft', color: '#8c3a34', metalness: 0, roughness: 0.96, maps: { color: '/items/textures/carpet-tile-red-015/color.webp', normal: '/items/textures/carpet-tile-red-015/normal.webp', roughness: '/items/textures/carpet-tile-red-015/roughness.webp', ao: '/items/textures/carpet-tile-red-015/ao.webp', displacement: '/items/textures/carpet-tile-red-015/displacement.webp' }, tiling: { realWorldSizeM: [0.4, 0.4] }, surfaces: ['floor'], upstream: 'ambientcg' },
  // ambientCG 'Carpet 016' (Carpet016), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: undyed wool beige.
  { source: 'builtin' as const, id: 'carpet-wool-beige-016', label: "Carpet · Wool Beige 016", category: 'Fabric & Soft', color: '#cbbba4', metalness: 0, roughness: 0.96, maps: { color: '/items/textures/carpet-wool-beige-016/color.webp', normal: '/items/textures/carpet-wool-beige-016/normal.webp', roughness: '/items/textures/carpet-wool-beige-016/roughness.webp', ao: '/items/textures/carpet-wool-beige-016/ao.webp', displacement: '/items/textures/carpet-wool-beige-016/displacement.webp' }, tiling: { realWorldSizeM: [1.7, 1.7] }, surfaces: ['floor'], upstream: 'ambientcg' },
  // ambientCG 'Plaster 003' (Plaster003), CC0-1.0. Tile size: estimate. Base colour AUTHORED: white gypsum plaster.
  { source: 'builtin' as const, id: 'plaster-rough-white-003', label: "Plaster · Rough White 003", category: 'Gypsum & Plaster', color: '#ece9e3', metalness: 0, roughness: 0.92, maps: { color: '/items/textures/plaster-rough-white-003/color.webp', normal: '/items/textures/plaster-rough-white-003/normal.webp', roughness: '/items/textures/plaster-rough-white-003/roughness.webp', displacement: '/items/textures/plaster-rough-white-003/displacement.webp' }, tiling: { realWorldSizeM: [2, 2] }, surfaces: ['wall', 'ceiling'], upstream: 'ambientcg' },
  // ambientCG 'Concrete 034' (Concrete034), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: grey skim plaster.
  { source: 'builtin' as const, id: 'plaster-smooth-grey-034', label: "Plaster · Smooth Light Grey 034", category: 'Gypsum & Plaster', color: '#c9c7c2', metalness: 0, roughness: 0.85, maps: { color: '/items/textures/plaster-smooth-grey-034/color.webp', normal: '/items/textures/plaster-smooth-grey-034/normal.webp', roughness: '/items/textures/plaster-smooth-grey-034/roughness.webp', displacement: '/items/textures/plaster-smooth-grey-034/displacement.webp' }, tiling: { realWorldSizeM: [1.1, 0.55] }, surfaces: ['wall', 'ceiling'], upstream: 'ambientcg' },
  // ambientCG 'Plaster 001' (Plaster001), CC0-1.0. Tile size: estimate. Base colour AUTHORED: off-white monocapa render.
  { source: 'builtin' as const, id: 'render-stucco-rough-001', label: "External Render · Rough Stucco 001", category: 'Gypsum & Plaster', color: '#ddd6c8', metalness: 0, roughness: 0.95, maps: { color: '/items/textures/render-stucco-rough-001/color.webp', normal: '/items/textures/render-stucco-rough-001/normal.webp', roughness: '/items/textures/render-stucco-rough-001/roughness.webp', displacement: '/items/textures/render-stucco-rough-001/displacement.webp' }, tiling: { realWorldSizeM: [2, 2] }, surfaces: ['wall', 'outdoor'], upstream: 'ambientcg' },
  // ambientCG 'Roofing Tiles 012 A' (RoofingTiles012A), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: terracotta clay tile.
  { source: 'builtin' as const, id: 'roof-tile-clay-012', label: "Roof Tile · Clay 012", category: 'Roofing', color: '#a8563a', metalness: 0, roughness: 0.82, maps: { color: '/items/textures/roof-tile-clay-012/color.webp', normal: '/items/textures/roof-tile-clay-012/normal.webp', roughness: '/items/textures/roof-tile-clay-012/roughness.webp', ao: '/items/textures/roof-tile-clay-012/ao.webp', displacement: '/items/textures/roof-tile-clay-012/displacement.webp' }, tiling: { realWorldSizeM: [2.9, 2.9] }, surfaces: ['roof'], upstream: 'ambientcg' },
  // ambientCG 'Roofing Tiles 015 A' (RoofingTiles015A), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: grey-engobed clay tile.
  { source: 'builtin' as const, id: 'roof-tile-clay-grey-015', label: "Roof Tile · Grey Clay 015", category: 'Roofing', color: '#8a8b88', metalness: 0, roughness: 0.82, maps: { color: '/items/textures/roof-tile-clay-grey-015/color.webp', normal: '/items/textures/roof-tile-clay-grey-015/normal.webp', roughness: '/items/textures/roof-tile-clay-grey-015/roughness.webp', ao: '/items/textures/roof-tile-clay-grey-015/ao.webp', displacement: '/items/textures/roof-tile-clay-grey-015/displacement.webp' }, tiling: { realWorldSizeM: [2.9, 2.9] }, surfaces: ['roof'], upstream: 'ambientcg' },
  // ambientCG 'Wood Siding 013' (WoodSiding013), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: weathered cedar shingle.
  { source: 'builtin' as const, id: 'shingle-timber-weathered-013', label: "Shingle · Weathered Timber 013", category: 'Roofing', color: '#8c8175', metalness: 0, roughness: 0.88, maps: { color: '/items/textures/shingle-timber-weathered-013/color.webp', normal: '/items/textures/shingle-timber-weathered-013/normal.webp', roughness: '/items/textures/shingle-timber-weathered-013/roughness.webp', ao: '/items/textures/shingle-timber-weathered-013/ao.webp', displacement: '/items/textures/shingle-timber-weathered-013/displacement.webp' }, tiling: { realWorldSizeM: [1.4, 1.4] }, surfaces: ['roof', 'wall', 'outdoor'], upstream: 'ambientcg' },
  // ambientCG 'Tiles 139' (Tiles139), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: glazed cream chequer.
  { source: 'builtin' as const, id: 'tile-chequer-cream-139', label: "Tile · Chequerboard Cream 139", category: 'Ceramic & Tile', color: '#ddd6c6', metalness: 0, roughness: 0.32, maps: { color: '/items/textures/tile-chequer-cream-139/color.webp', normal: '/items/textures/tile-chequer-cream-139/normal.webp', roughness: '/items/textures/tile-chequer-cream-139/roughness.webp', displacement: '/items/textures/tile-chequer-cream-139/displacement.webp' }, tiling: { realWorldSizeM: [2, 2] }, surfaces: ['floor'], upstream: 'ambientcg' },
  // ambientCG 'Tiles 074' (Tiles074), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: polished white marble.
  { source: 'builtin' as const, id: 'tile-marble-floor-074', label: "Tile · Marble Floor 074", category: 'Ceramic & Tile', color: '#e2e0da', metalness: 0, roughness: 0.22, maps: { color: '/items/textures/tile-marble-floor-074/color.webp', normal: '/items/textures/tile-marble-floor-074/normal.webp', roughness: '/items/textures/tile-marble-floor-074/roughness.webp', displacement: '/items/textures/tile-marble-floor-074/displacement.webp' }, tiling: { realWorldSizeM: [2.1, 2.1] }, surfaces: ['floor'], upstream: 'ambientcg' },
  // ambientCG 'Tiles 069' (Tiles069), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: glazed pool-blue mosaic.
  { source: 'builtin' as const, id: 'tile-mosaic-pool-hex-069', label: "Mosaic · Hexagon Pool Blue 069", category: 'Ceramic & Tile', color: '#4f9ec4', metalness: 0, roughness: 0.28, maps: { color: '/items/textures/tile-mosaic-pool-hex-069/color.webp', normal: '/items/textures/tile-mosaic-pool-hex-069/normal.webp', roughness: '/items/textures/tile-mosaic-pool-hex-069/roughness.webp', ao: '/items/textures/tile-mosaic-pool-hex-069/ao.webp', displacement: '/items/textures/tile-mosaic-pool-hex-069/displacement.webp' }, tiling: { realWorldSizeM: [0.6, 0.6] }, surfaces: ['floor', 'wall'], upstream: 'ambientcg' },
  // ambientCG 'Tiles 141' (Tiles141), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: matt beige porcelain.
  { source: 'builtin' as const, id: 'tile-rectangular-beige-141', label: "Tile · Rectangular Beige 141", category: 'Ceramic & Tile', color: '#d8cfc0', metalness: 0, roughness: 0.34, maps: { color: '/items/textures/tile-rectangular-beige-141/color.webp', normal: '/items/textures/tile-rectangular-beige-141/normal.webp', roughness: '/items/textures/tile-rectangular-beige-141/roughness.webp', displacement: '/items/textures/tile-rectangular-beige-141/displacement.webp' }, tiling: { realWorldSizeM: [2, 2] }, surfaces: ['floor', 'wall'], upstream: 'ambientcg' },
  // ambientCG 'Wood Floor 051' (WoodFloor051), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: light lacquered oak.
  { source: 'builtin' as const, id: 'wood-parquet-light-modern-051', label: "Parquet · Light Modern Plank 051", category: 'Wood', color: '#c19a6b', metalness: 0, roughness: 0.48, maps: { color: '/items/textures/wood-parquet-light-modern-051/color.webp', normal: '/items/textures/wood-parquet-light-modern-051/normal.webp', roughness: '/items/textures/wood-parquet-light-modern-051/roughness.webp', ao: '/items/textures/wood-parquet-light-modern-051/ao.webp', displacement: '/items/textures/wood-parquet-light-modern-051/displacement.webp' }, tiling: { realWorldSizeM: [1.8, 1.8] }, surfaces: ['floor'], upstream: 'ambientcg' },
  // ambientCG 'Wood Floor 057' (WoodFloor057), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: mid-tone oak panel.
  { source: 'builtin' as const, id: 'wood-parquet-panel-057', label: "Parquet · Panel 057", category: 'Wood', color: '#a87f52', metalness: 0, roughness: 0.52, maps: { color: '/items/textures/wood-parquet-panel-057/color.webp', normal: '/items/textures/wood-parquet-panel-057/normal.webp', roughness: '/items/textures/wood-parquet-panel-057/roughness.webp', ao: '/items/textures/wood-parquet-panel-057/ao.webp', displacement: '/items/textures/wood-parquet-panel-057/displacement.webp' }, tiling: { realWorldSizeM: [3.2, 3.2] }, surfaces: ['floor'], upstream: 'ambientcg' },
  // ambientCG 'Wood Floor 040' (WoodFloor040), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: natural oak plank.
  { source: 'builtin' as const, id: 'wood-parquet-plank-040', label: "Parquet · Plank 040", category: 'Wood', color: '#b58a5c', metalness: 0, roughness: 0.5, maps: { color: '/items/textures/wood-parquet-plank-040/color.webp', normal: '/items/textures/wood-parquet-plank-040/normal.webp', roughness: '/items/textures/wood-parquet-plank-040/roughness.webp', ao: '/items/textures/wood-parquet-plank-040/ao.webp', displacement: '/items/textures/wood-parquet-plank-040/displacement.webp' }, tiling: { realWorldSizeM: [1.9, 1.9] }, surfaces: ['floor'], upstream: 'ambientcg' },
  // ambientCG 'Wood Floor 043' (WoodFloor043), CC0-1.0. Tile size: source-metadata. Base colour AUTHORED: darker oiled oak plank.
  { source: 'builtin' as const, id: 'wood-parquet-plank-043', label: "Parquet · Plank 043", category: 'Wood', color: '#9d7047', metalness: 0, roughness: 0.52, maps: { color: '/items/textures/wood-parquet-plank-043/color.webp', normal: '/items/textures/wood-parquet-plank-043/normal.webp', roughness: '/items/textures/wood-parquet-plank-043/roughness.webp', ao: '/items/textures/wood-parquet-plank-043/ao.webp', displacement: '/items/textures/wood-parquet-plank-043/displacement.webp' }, tiling: { realWorldSizeM: [1.3, 0.65] }, surfaces: ['floor'], upstream: 'ambientcg' },
  // ─── END GENERATED ────────────────────────────────────────────────────────
  // ─── BEGIN GENERATED: procedural patterns (emit-catalog-rows.mjs) ─────────
  //
  // 34 rows generated from @pryzm/procedural-textures' preset list.
  // ⛔ DO NOT HAND-EDIT between these markers — re-run
  //    `node tools/texture-pipeline/emit-catalog-rows.mjs`.
  //
  // ⭐ The `maps` values are GENERATOR IDS, not paths. `MaterialResolver` forks
  // on `isProceduralId` ahead of the file-shaped path, so a generated pattern
  // never touches a URL, an extension or a bucket. That is why these reach a
  // user with no asset hosting at all, while the file-backed rows above depend
  // on R2 — and it is why the founder's "wooden parquet, proper tiling floors"
  // has an answer that cannot 404.
  //
  // All three channels name the SAME id: one generator produces albedo, normal
  // and roughness together, and the resolver maps albedo -> color. Listing the
  // id once per channel keeps `MaterialMaps` a plain per-channel record instead
  // of growing a second, generator-shaped arm nothing else would use.
  // Generated by @pryzm/procedural-textures 'procedural:parquet-oak-herringbone'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'parquet-oak-herringbone', label: "Parquet · Oak Herringbone (70 × 350)", category: 'Wood', color: '#c8a96e', metalness: 0, roughness: 0.55, maps: { color: 'procedural:parquet-oak-herringbone', normal: 'procedural:parquet-oak-herringbone', roughness: 'procedural:parquet-oak-herringbone' }, tiling: { realWorldSizeM: [0.7, 0.7] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:parquet-walnut-herringbone'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'parquet-walnut-herringbone', label: "Parquet · Walnut Herringbone (70 × 280)", category: 'Wood', color: '#5a3a28', metalness: 0, roughness: 0.5, maps: { color: 'procedural:parquet-walnut-herringbone', normal: 'procedural:parquet-walnut-herringbone', roughness: 'procedural:parquet-walnut-herringbone' }, tiling: { realWorldSizeM: [0.56, 0.56] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:parquet-smoked-oak-herringbone-wide'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'parquet-smoked-oak-herringbone-wide', label: "Parquet · Smoked Oak Herringbone (100 × 500)", category: 'Wood', color: '#7a5c3e', metalness: 0, roughness: 0.55, maps: { color: 'procedural:parquet-smoked-oak-herringbone-wide', normal: 'procedural:parquet-smoked-oak-herringbone-wide', roughness: 'procedural:parquet-smoked-oak-herringbone-wide' }, tiling: { realWorldSizeM: [1, 1] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:parquet-oak-chevron-45'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'parquet-oak-chevron-45', label: "Parquet · Oak Chevron 45° (90 × 600)", category: 'Wood', color: '#c8a96e', metalness: 0, roughness: 0.55, maps: { color: 'procedural:parquet-oak-chevron-45', normal: 'procedural:parquet-oak-chevron-45', roughness: 'procedural:parquet-oak-chevron-45' }, tiling: { realWorldSizeM: [0.848528137423857, 0.38183766184073564] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:parquet-oak-hungarian-point-60'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'parquet-oak-hungarian-point-60', label: "Parquet · Oak Hungarian Point 60° (90 × 600)", category: 'Wood', color: '#c8a96e', metalness: 0, roughness: 0.55, maps: { color: 'procedural:parquet-oak-hungarian-point-60', normal: 'procedural:parquet-oak-hungarian-point-60', roughness: 'procedural:parquet-oak-hungarian-point-60' }, tiling: { realWorldSizeM: [0.6000000000000001, 0.5399999999999999] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:parquet-walnut-chevron-45'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'parquet-walnut-chevron-45', label: "Parquet · Walnut Chevron 45° (70 × 490)", category: 'Wood', color: '#5a3a28', metalness: 0, roughness: 0.5, maps: { color: 'procedural:parquet-walnut-chevron-45', normal: 'procedural:parquet-walnut-chevron-45', roughness: 'procedural:parquet-walnut-chevron-45' }, tiling: { realWorldSizeM: [0.6929646455628166, 0.3959797974644666] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:parquet-oak-basket-weave'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'parquet-oak-basket-weave', label: "Parquet · Oak Basket Weave (3 × 70)", category: 'Wood', color: '#c8a96e', metalness: 0, roughness: 0.55, maps: { color: 'procedural:parquet-oak-basket-weave', normal: 'procedural:parquet-oak-basket-weave', roughness: 'procedural:parquet-oak-basket-weave' }, tiling: { realWorldSizeM: [0.42, 0.42] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:parquet-ash-basket-weave-double'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'parquet-ash-basket-weave-double', label: "Parquet · Ash Basket Weave (2 × 90)", category: 'Wood', color: '#d9c9a4', metalness: 0, roughness: 0.58, maps: { color: 'procedural:parquet-ash-basket-weave-double', normal: 'procedural:parquet-ash-basket-weave-double', roughness: 'procedural:parquet-ash-basket-weave-double' }, tiling: { realWorldSizeM: [0.36, 0.36] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:parquet-oak-versailles'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'parquet-oak-versailles', label: "Parquet · Oak Versailles Panel (900 mm)", category: 'Wood', color: '#c8a96e', metalness: 0, roughness: 0.55, maps: { color: 'procedural:parquet-oak-versailles', normal: 'procedural:parquet-oak-versailles', roughness: 'procedural:parquet-oak-versailles' }, tiling: { realWorldSizeM: [0.9, 0.9] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:floor-oak-plank-wide'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'floor-oak-plank-wide', label: "Timber Floor · Oak Plank 189 × 1860 (1/3 bond)", category: 'Wood', color: '#c8a96e', metalness: 0, roughness: 0.55, maps: { color: 'procedural:floor-oak-plank-wide', normal: 'procedural:floor-oak-plank-wide', roughness: 'procedural:floor-oak-plank-wide' }, tiling: { realWorldSizeM: [1.86, 1.134] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:floor-ash-plank-narrow'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'floor-ash-plank-narrow', label: "Timber Floor · Ash Board 120 × 1200 (1/2 bond)", category: 'Wood', color: '#d9c9a4', metalness: 0, roughness: 0.58, maps: { color: 'procedural:floor-ash-plank-narrow', normal: 'procedural:floor-ash-plank-narrow', roughness: 'procedural:floor-ash-plank-narrow' }, tiling: { realWorldSizeM: [1.2, 0.72] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:floor-smoked-oak-plank'. Colour, roughness and tile
  // size are READ from the generator, not authored. parquet.
  { source: 'builtin' as const, id: 'floor-smoked-oak-plank', label: "Timber Floor · Smoked Oak Plank 220 × 2200 (1/4 bond)", category: 'Wood', color: '#7a5c3e', metalness: 0, roughness: 0.55, maps: { color: 'procedural:floor-smoked-oak-plank', normal: 'procedural:floor-smoked-oak-plank', roughness: 'procedural:floor-smoked-oak-plank' }, tiling: { realWorldSizeM: [2.2, 1.76] }, surfaces: ['floor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-porcelain-600-stack'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-porcelain-600-stack', label: "Tile · Porcelain 600 × 600, stack bond, 3 mm grout", category: 'Ceramic & Tile', color: '#eeece6', metalness: 0, roughness: 0.22, maps: { color: 'procedural:tile-porcelain-600-stack', normal: 'procedural:tile-porcelain-600-stack', roughness: 'procedural:tile-porcelain-600-stack' }, tiling: { realWorldSizeM: [1.206, 1.206] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-marble-600-stack'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-marble-600-stack', label: "Tile · Marble 600 × 600, stack bond, 2 mm grout", category: 'Ceramic & Tile', color: '#e9e8e4', metalness: 0, roughness: 0.16, maps: { color: 'procedural:tile-marble-600-stack', normal: 'procedural:tile-marble-600-stack', roughness: 'procedural:tile-marble-600-stack' }, tiling: { realWorldSizeM: [1.204, 1.204] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-slate-300-offset'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-slate-300-offset', label: "Tile · Slate 600 × 300, half bond, 4 mm grout", category: 'Ceramic & Tile', color: '#3b3f42', metalness: 0, roughness: 0.62, maps: { color: 'procedural:tile-slate-300-offset', normal: 'procedural:tile-slate-300-offset', roughness: 'procedural:tile-slate-300-offset' }, tiling: { realWorldSizeM: [1.208, 1.216] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-metro-white-subway'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-metro-white-subway', label: "Tile · Metro 200 × 100 white, half bond, 3 mm grout", category: 'Ceramic & Tile', color: '#eeece6', metalness: 0, roughness: 0.22, maps: { color: 'procedural:tile-metro-white-subway', normal: 'procedural:tile-metro-white-subway', roughness: 'procedural:tile-metro-white-subway' }, tiling: { realWorldSizeM: [0.406, 0.824] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-metro-white-third'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-metro-white-third', label: "Tile · Metro 200 × 100 white, third bond, 3 mm grout", category: 'Ceramic & Tile', color: '#eeece6', metalness: 0, roughness: 0.22, maps: { color: 'procedural:tile-metro-white-third', normal: 'procedural:tile-metro-white-third', roughness: 'procedural:tile-metro-white-third' }, tiling: { realWorldSizeM: [0.203, 0.618] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-metro-herringbone'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-metro-herringbone', label: "Tile · Metro 103 × 309 herringbone, 3 mm grout", category: 'Ceramic & Tile', color: '#eeece6', metalness: 0, roughness: 0.22, maps: { color: 'procedural:tile-metro-herringbone', normal: 'procedural:tile-metro-herringbone', roughness: 'procedural:tile-metro-herringbone' }, tiling: { realWorldSizeM: [0.618, 0.618] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-terracotta-basket-weave'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-terracotta-basket-weave', label: "Tile · Terracotta basket weave (2 × 150), 5 mm grout", category: 'Ceramic & Tile', color: '#b56a4a', metalness: 0, roughness: 0.72, maps: { color: 'procedural:tile-terracotta-basket-weave', normal: 'procedural:tile-terracotta-basket-weave', roughness: 'procedural:tile-terracotta-basket-weave' }, tiling: { realWorldSizeM: [0.62, 0.62] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-hexagon-200-white'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-hexagon-200-white', label: "Tile · Hexagon 200 mm white, 3 mm grout", category: 'Ceramic & Tile', color: '#eeece6', metalness: 0, roughness: 0.22, maps: { color: 'procedural:tile-hexagon-200-white', normal: 'procedural:tile-hexagon-200-white', roughness: 'procedural:tile-hexagon-200-white' }, tiling: { realWorldSizeM: [0.406, 0.35160631393648206] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-hexagon-100-cement'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-hexagon-100-cement', label: "Tile · Hexagon 100 mm cement grey, 2 mm grout", category: 'Ceramic & Tile', color: '#b7b4ae', metalness: 0, roughness: 0.68, maps: { color: 'procedural:tile-hexagon-100-cement', normal: 'procedural:tile-hexagon-100-cement', roughness: 'procedural:tile-hexagon-100-cement' }, tiling: { realWorldSizeM: [0.306, 0.353338364744051] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-terracotta-300-stack'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-terracotta-300-stack', label: "Tile · Terracotta 300 × 300, stack bond, 6 mm grout", category: 'Ceramic & Tile', color: '#b56a4a', metalness: 0, roughness: 0.72, maps: { color: 'procedural:tile-terracotta-300-stack', normal: 'procedural:tile-terracotta-300-stack', roughness: 'procedural:tile-terracotta-300-stack' }, tiling: { realWorldSizeM: [0.918, 0.918] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-cement-200-stack'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-cement-200-stack', label: "Tile · Cement 200 × 200, stack bond, 2 mm grout", category: 'Ceramic & Tile', color: '#b7b4ae', metalness: 0, roughness: 0.68, maps: { color: 'procedural:tile-cement-200-stack', normal: 'procedural:tile-cement-200-stack', roughness: 'procedural:tile-cement-200-stack' }, tiling: { realWorldSizeM: [0.808, 0.808] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:tile-mosaic-50-white'. Colour, roughness and tile
  // size are READ from the generator, not authored. tile.
  { source: 'builtin' as const, id: 'tile-mosaic-50-white', label: "Tile · Mosaic 50 × 50 white, 2 mm grout", category: 'Ceramic & Tile', color: '#eeece6', metalness: 0, roughness: 0.22, maps: { color: 'procedural:tile-mosaic-50-white', normal: 'procedural:tile-mosaic-50-white', roughness: 'procedural:tile-mosaic-50-white' }, tiling: { realWorldSizeM: [0.416, 0.416] }, surfaces: ['floor', 'wall'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:roof-shingle-asphalt-charcoal'. Colour, roughness and tile
  // size are READ from the generator, not authored. roofing.
  { source: 'builtin' as const, id: 'roof-shingle-asphalt-charcoal', label: "Roof Shingle · Asphalt Charcoal (333 tab × 143 exposure, half bond)", category: 'Roofing', color: '#3a3a3c', metalness: 0, roughness: 0.95, maps: { color: 'procedural:roof-shingle-asphalt-charcoal', normal: 'procedural:roof-shingle-asphalt-charcoal', roughness: 'procedural:roof-shingle-asphalt-charcoal' }, tiling: { realWorldSizeM: [0.999, 1.716] }, surfaces: ['roof'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:roof-shingle-asphalt-slate-grey'. Colour, roughness and tile
  // size are READ from the generator, not authored. roofing.
  { source: 'builtin' as const, id: 'roof-shingle-asphalt-slate-grey', label: "Roof Shingle · Asphalt Slate Grey (333 tab × 143 exposure, half bond)", category: 'Roofing', color: '#6c6f73', metalness: 0, roughness: 0.95, maps: { color: 'procedural:roof-shingle-asphalt-slate-grey', normal: 'procedural:roof-shingle-asphalt-slate-grey', roughness: 'procedural:roof-shingle-asphalt-slate-grey' }, tiling: { realWorldSizeM: [0.999, 1.716] }, surfaces: ['roof'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:roof-shingle-asphalt-weathered-brown'. Colour, roughness and tile
  // size are READ from the generator, not authored. roofing.
  { source: 'builtin' as const, id: 'roof-shingle-asphalt-weathered-brown', label: "Roof Shingle · Asphalt Weathered Brown (333 tab × 143 exposure, half bond)", category: 'Roofing', color: '#5a4636', metalness: 0, roughness: 0.95, maps: { color: 'procedural:roof-shingle-asphalt-weathered-brown', normal: 'procedural:roof-shingle-asphalt-weathered-brown', roughness: 'procedural:roof-shingle-asphalt-weathered-brown' }, tiling: { realWorldSizeM: [0.999, 1.716] }, surfaces: ['roof'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:roof-shingle-architectural-charcoal'. Colour, roughness and tile
  // size are READ from the generator, not authored. roofing.
  { source: 'builtin' as const, id: 'roof-shingle-architectural-charcoal', label: "Roof Shingle · Architectural Charcoal (400 tab × 146 exposure, third bond)", category: 'Roofing', color: '#3a3a3c', metalness: 0, roughness: 0.95, maps: { color: 'procedural:roof-shingle-architectural-charcoal', normal: 'procedural:roof-shingle-architectural-charcoal', roughness: 'procedural:roof-shingle-architectural-charcoal' }, tiling: { realWorldSizeM: [1.2, 1.314] }, surfaces: ['roof'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:roof-slate-natural-500'. Colour, roughness and tile
  // size are READ from the generator, not authored. roofing.
  { source: 'builtin' as const, id: 'roof-slate-natural-500', label: "Roof Slate · Natural 500 × 250 at 200 gauge, half bond", category: 'Roofing', color: '#4a4f55', metalness: 0, roughness: 0.7, maps: { color: 'procedural:roof-slate-natural-500', normal: 'procedural:roof-slate-natural-500', roughness: 'procedural:roof-slate-natural-500' }, tiling: { realWorldSizeM: [1.008, 1.616] }, surfaces: ['roof'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:roof-shingle-cedar'. Colour, roughness and tile
  // size are READ from the generator, not authored. roofing.
  { source: 'builtin' as const, id: 'roof-shingle-cedar', label: "Roof Shingle · Western Red Cedar (150 × 125 exposure, third bond)", category: 'Roofing', color: '#8a6b4a', metalness: 0, roughness: 0.86, maps: { color: 'procedural:roof-shingle-cedar', normal: 'procedural:roof-shingle-cedar', roughness: 'procedural:roof-shingle-cedar' }, tiling: { realWorldSizeM: [0.462, 1.161] }, surfaces: ['roof'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:roof-shingle-cedar-silvered'. Colour, roughness and tile
  // size are READ from the generator, not authored. roofing.
  { source: 'builtin' as const, id: 'roof-shingle-cedar-silvered', label: "Roof Shingle · Cedar Silvered (150 × 125 exposure, third bond)", category: 'Roofing', color: '#9a958c', metalness: 0, roughness: 0.86, maps: { color: 'procedural:roof-shingle-cedar-silvered', normal: 'procedural:roof-shingle-cedar-silvered', roughness: 'procedural:roof-shingle-cedar-silvered' }, tiling: { realWorldSizeM: [0.462, 1.161] }, surfaces: ['roof'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:decking-oak-145'. Colour, roughness and tile
  // size are READ from the generator, not authored. decking.
  { source: 'builtin' as const, id: 'decking-oak-145', label: "Decking · Oak Board 145 × 1800, 5 mm gap, half bond", category: 'Wood', color: '#c8a96e', metalness: 0, roughness: 0.74, maps: { color: 'procedural:decking-oak-145', normal: 'procedural:decking-oak-145', roughness: 'procedural:decking-oak-145' }, tiling: { realWorldSizeM: [1.8, 0.9] }, surfaces: ['floor', 'outdoor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:decking-thermo-ash-120'. Colour, roughness and tile
  // size are READ from the generator, not authored. decking.
  { source: 'builtin' as const, id: 'decking-thermo-ash-120', label: "Decking · Thermo-Ash Board 120 × 1800, 6 mm gap, third bond", category: 'Wood', color: '#8e7355', metalness: 0, roughness: 0.74, maps: { color: 'procedural:decking-thermo-ash-120', normal: 'procedural:decking-thermo-ash-120', roughness: 'procedural:decking-thermo-ash-120' }, tiling: { realWorldSizeM: [1.8, 0.756] }, surfaces: ['floor', 'outdoor'], upstream: 'pryzm-procedural' },
  // Generated by @pryzm/procedural-textures 'procedural:decking-composite-grey-140'. Colour, roughness and tile
  // size are READ from the generator, not authored. decking.
  { source: 'builtin' as const, id: 'decking-composite-grey-140', label: "Decking · Composite Grey Board 140 × 2000, 5 mm gap, half bond", category: 'Timber Engineered', color: '#7c7a76', metalness: 0, roughness: 0.8, maps: { color: 'procedural:decking-composite-grey-140', normal: 'procedural:decking-composite-grey-140', roughness: 'procedural:decking-composite-grey-140' }, tiling: { realWorldSizeM: [2, 0.87] }, surfaces: ['floor', 'outdoor'], upstream: 'pryzm-procedural' },
  // ─── END GENERATED PROCEDURAL ─────────────────────────────────────────────

  // ═══ §MICROCEMENT-PAINT-AND-TILE-RANGE (L-1900..L-1902, lane MAT2, 2026-08-21) ═══
  //
  // Founder, verbatim: *"I need 20 microcement colours — from red, blue, green, dark
  // grey… many greys, all possible colours"*, *"30 different colour paints"*, and
  // *"30+ types of tiles for kitchen and toilets — with different sizes, colours,
  // shine finishes"*. Measured before writing a row: the master held exactly ONE
  // microcement and FOUR paints.
  //
  // ⛔ THREE THINGS ARE DELIBERATELY ABSENT FROM EVERY NAME BELOW, AND THE REASON IS
  //    MEASURED, NOT STYLISTIC (C100 §10.11):
  //
  //  1. NO SIZE ("600 × 600", "200 × 100"). A size only reads if the surface carries
  //     METRE UVs, and `WallFragmentBuilder.ts` calls
  //     `applyMaterialMaps(params, matDef, uvSpaceOfGeometry(null))` — literally
  //     `null` — so every wall resolves `UV_NONE` and `resolveMaterialTextures`
  //     returns `state: 'no-uvs'`. A row called "Metro 200 × 100" paints a FLAT
  //     wall. These rows are for walls, so they claim no size.
  //  2. NO BOND / GROUT / PATTERN word ("half bond", "3 mm grout", "herringbone").
  //     Same mechanism: pattern is a MAP, and no map binds to a wall body today.
  //  3. NO RAL / NCS NUMBER. A RAL code is a PROCUREMENT claim — someone orders paint
  //     by it. We cannot verify our hex against a physical standard, and a wrong RAL
  //     number is an ordering error, not a rendering error. Naming the pigment and
  //     NOT the code is the honest half of that pair (C100 §10.11.c).
  //
  // ⭐ WHAT THEY DO CARRY IS REAL: `color` renders on every wall arm, and `roughness`
  //    renders since L-1905 wired the finish's shine through both arms. Gloss / satin
  //    / matt in a name below is therefore a claim the renderer HONOURS.
  //
  // ⛔ ADD A COLOUR BY ADDING A ROW HERE. No alias is needed for it to be reachable
  //    from chat: `finishRef.finishRefCandidates` matches the MASTER'S OWN LABELS by
  //    token subset, so a new row is chat-nameable with no edit in `ai-host`. Every
  //    label below was checked for uniqueness against all 245 prior rows by an
  //    exhaustive 1-and-2-token sweep before it was committed.

  // ── Microcement, 20 pigments (L-1900). A cementitious coating: matt-to-satin, so
  //    roughness sits 0.60–0.70 and metalness is 0 for every one.
  { source: 'builtin' as const, id: 'coating-microcement-natural-white', label: "Coating · Microcement Natural White", category: 'Paint & Coating', color: '#ece9e2', metalness: 0, roughness: 0.6 },
  { source: 'builtin' as const, id: 'coating-microcement-pearl-grey', label: "Coating · Microcement Pearl Grey", category: 'Paint & Coating', color: '#d5d3ce', metalness: 0, roughness: 0.62 },
  { source: 'builtin' as const, id: 'coating-microcement-ash-grey', label: "Coating · Microcement Ash Grey", category: 'Paint & Coating', color: '#b6b8b4', metalness: 0, roughness: 0.64 },
  { source: 'builtin' as const, id: 'coating-microcement-cool-grey', label: "Coating · Microcement Cool Grey", category: 'Paint & Coating', color: '#a8adb1', metalness: 0, roughness: 0.64 },
  { source: 'builtin' as const, id: 'coating-microcement-mid-grey', label: "Coating · Microcement Mid Grey", category: 'Paint & Coating', color: '#8e9296', metalness: 0, roughness: 0.66 },
  { source: 'builtin' as const, id: 'coating-microcement-graphite-grey', label: "Coating · Microcement Graphite Grey", category: 'Paint & Coating', color: '#5d6165', metalness: 0, roughness: 0.66 },
  { source: 'builtin' as const, id: 'coating-microcement-anthracite', label: "Coating · Microcement Anthracite", category: 'Paint & Coating', color: '#3d4146', metalness: 0, roughness: 0.68 },
  { source: 'builtin' as const, id: 'coating-microcement-carbon-black', label: "Coating · Microcement Carbon Black", category: 'Paint & Coating', color: '#25272a', metalness: 0, roughness: 0.7 },
  { source: 'builtin' as const, id: 'coating-microcement-bone', label: "Coating · Microcement Bone", category: 'Paint & Coating', color: '#e2dccf', metalness: 0, roughness: 0.62 },
  { source: 'builtin' as const, id: 'coating-microcement-sand', label: "Coating · Microcement Sand", category: 'Paint & Coating', color: '#d5c5a9', metalness: 0, roughness: 0.66 },
  { source: 'builtin' as const, id: 'coating-microcement-taupe', label: "Coating · Microcement Taupe", category: 'Paint & Coating', color: '#a99c8c', metalness: 0, roughness: 0.66 },
  { source: 'builtin' as const, id: 'coating-microcement-mushroom', label: "Coating · Microcement Mushroom", category: 'Paint & Coating', color: '#b9aea1', metalness: 0, roughness: 0.66 },
  { source: 'builtin' as const, id: 'coating-microcement-amber', label: "Coating · Microcement Amber", category: 'Paint & Coating', color: '#d0912c', metalness: 0, roughness: 0.6 },
  { source: 'builtin' as const, id: 'coating-microcement-ochre', label: "Coating · Microcement Ochre", category: 'Paint & Coating', color: '#bf8a37', metalness: 0, roughness: 0.64 },
  { source: 'builtin' as const, id: 'coating-microcement-terracotta', label: "Coating · Microcement Terracotta", category: 'Paint & Coating', color: '#b2604a', metalness: 0, roughness: 0.66 },
  { source: 'builtin' as const, id: 'coating-microcement-oxide-red', label: "Coating · Microcement Oxide Red", category: 'Paint & Coating', color: '#8f3b32', metalness: 0, roughness: 0.66 },
  { source: 'builtin' as const, id: 'coating-microcement-petrol-blue', label: "Coating · Microcement Petrol Blue", category: 'Paint & Coating', color: '#2f5d6b', metalness: 0, roughness: 0.62 },
  { source: 'builtin' as const, id: 'coating-microcement-indigo-blue', label: "Coating · Microcement Indigo Blue", category: 'Paint & Coating', color: '#38507f', metalness: 0, roughness: 0.62 },
  { source: 'builtin' as const, id: 'coating-microcement-sage-green', label: "Coating · Microcement Sage Green", category: 'Paint & Coating', color: '#9aa88f', metalness: 0, roughness: 0.64 },
  { source: 'builtin' as const, id: 'coating-microcement-forest-green', label: "Coating · Microcement Forest Green", category: 'Paint & Coating', color: '#375441', metalness: 0, roughness: 0.64 },

  // ── Paint, 30 colours (L-1901). Eight PASTELS because the founder asked for
  //    "Blue pastel paint" by that word; the rest span saturated architectural
  //    colours and the neutral/grey range. Matt emulsion reads 0.90–0.94; the
  //    deeper colours are eggshell at 0.84–0.88, which is how they are actually sold.
  { source: 'builtin' as const, id: 'paint-pastel-blue', label: "Paint · Pastel Blue", category: 'Paint & Coating', color: '#b9cfe1', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'paint-pastel-green', label: "Paint · Pastel Green", category: 'Paint & Coating', color: '#c3d9be', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'paint-pastel-pink', label: "Paint · Pastel Pink", category: 'Paint & Coating', color: '#efd0d3', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'paint-pastel-yellow', label: "Paint · Pastel Yellow", category: 'Paint & Coating', color: '#f2e6b9', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'paint-pastel-lilac', label: "Paint · Pastel Lilac", category: 'Paint & Coating', color: '#d4cce2', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'paint-pastel-peach', label: "Paint · Pastel Peach", category: 'Paint & Coating', color: '#f3d6c0', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'paint-pastel-mint', label: "Paint · Pastel Mint", category: 'Paint & Coating', color: '#c5e1d6', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'paint-pastel-grey', label: "Paint · Pastel Grey", category: 'Paint & Coating', color: '#d9dbdc', metalness: 0, roughness: 0.92 },
  { source: 'builtin' as const, id: 'paint-deep-navy', label: "Paint · Deep Navy", category: 'Paint & Coating', color: '#1f2d45', metalness: 0, roughness: 0.84 },
  { source: 'builtin' as const, id: 'paint-cobalt-blue', label: "Paint · Cobalt Blue", category: 'Paint & Coating', color: '#2b52a6', metalness: 0, roughness: 0.84 },
  { source: 'builtin' as const, id: 'paint-sky-blue', label: "Paint · Sky Blue", category: 'Paint & Coating', color: '#8fbcd9', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'paint-teal', label: "Paint · Teal", category: 'Paint & Coating', color: '#1f6b6b', metalness: 0, roughness: 0.84 },
  { source: 'builtin' as const, id: 'paint-sage-green', label: "Paint · Sage Green", category: 'Paint & Coating', color: '#9caa93', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'paint-olive-green', label: "Paint · Olive Green", category: 'Paint & Coating', color: '#6d7448', metalness: 0, roughness: 0.86 },
  { source: 'builtin' as const, id: 'paint-forest-green', label: "Paint · Forest Green", category: 'Paint & Coating', color: '#2f4f3e', metalness: 0, roughness: 0.84 },
  { source: 'builtin' as const, id: 'paint-emerald-green', label: "Paint · Emerald Green", category: 'Paint & Coating', color: '#1f7355', metalness: 0, roughness: 0.84 },
  { source: 'builtin' as const, id: 'paint-terracotta', label: "Paint · Terracotta", category: 'Paint & Coating', color: '#b3624a', metalness: 0, roughness: 0.86 },
  { source: 'builtin' as const, id: 'paint-oxide-red', label: "Paint · Oxide Red", category: 'Paint & Coating', color: '#8e3b31', metalness: 0, roughness: 0.84 },
  { source: 'builtin' as const, id: 'paint-burnt-orange', label: "Paint · Burnt Orange", category: 'Paint & Coating', color: '#c2622c', metalness: 0, roughness: 0.86 },
  { source: 'builtin' as const, id: 'paint-mustard-yellow', label: "Paint · Mustard Yellow", category: 'Paint & Coating', color: '#d3a02c', metalness: 0, roughness: 0.86 },
  { source: 'builtin' as const, id: 'paint-plum', label: "Paint · Plum", category: 'Paint & Coating', color: '#6b4157', metalness: 0, roughness: 0.84 },
  { source: 'builtin' as const, id: 'paint-blush-pink', label: "Paint · Blush Pink", category: 'Paint & Coating', color: '#e4c0bb', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'paint-brilliant-white', label: "Paint · Brilliant White", category: 'Paint & Coating', color: '#fafaf7', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'paint-chalk-white', label: "Paint · Chalk White", category: 'Paint & Coating', color: '#f2efe8', metalness: 0, roughness: 0.94 },
  { source: 'builtin' as const, id: 'paint-greige', label: "Paint · Greige", category: 'Paint & Coating', color: '#cfc7ba', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'paint-light-grey', label: "Paint · Light Grey", category: 'Paint & Coating', color: '#d2d4d3', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'paint-mid-grey', label: "Paint · Mid Grey", category: 'Paint & Coating', color: '#9ea3a5', metalness: 0, roughness: 0.9 },
  { source: 'builtin' as const, id: 'paint-slate-grey', label: "Paint · Slate Grey", category: 'Paint & Coating', color: '#6d757b', metalness: 0, roughness: 0.88 },
  { source: 'builtin' as const, id: 'paint-anthracite-grey', label: "Paint · Anthracite Grey", category: 'Paint & Coating', color: '#43484d', metalness: 0, roughness: 0.86 },
  { source: 'builtin' as const, id: 'paint-soft-black', label: "Paint · Soft Black", category: 'Paint & Coating', color: '#242628', metalness: 0, roughness: 0.86 },

  // ── Ceramic tile, 34 colour × sheen (L-1902), for kitchen splashbacks and
  //    bathroom walls. THE SHEEN IS THE POINT and it is the axis that renders:
  //    gloss 0.06 · satin 0.35 · matt 0.80. `materialMaps.ts` is explicit that sheen
  //    is expressed THROUGH roughness and never as a new PBR lobe, so these three
  //    bands are the whole vocabulary — there is no rival `sheen` field to add.
  { source: 'builtin' as const, id: 'tile-gloss-ivory', label: "Ceramic Tile · Ivory Gloss", category: 'Ceramic & Tile', color: '#f2ece0', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-sky-blue', label: "Ceramic Tile · Sky Blue Gloss", category: 'Ceramic & Tile', color: '#a8ccdf', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-cobalt', label: "Ceramic Tile · Cobalt Gloss", category: 'Ceramic & Tile', color: '#2b5aa0', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-navy', label: "Ceramic Tile · Navy Gloss", category: 'Ceramic & Tile', color: '#23344f', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-sage', label: "Ceramic Tile · Sage Gloss", category: 'Ceramic & Tile', color: '#a6b8a3', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-emerald', label: "Ceramic Tile · Emerald Gloss", category: 'Ceramic & Tile', color: '#1f6b52', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-olive', label: "Ceramic Tile · Olive Gloss", category: 'Ceramic & Tile', color: '#737a4c', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-mustard', label: "Ceramic Tile · Mustard Gloss", category: 'Ceramic & Tile', color: '#d3a233', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-amber', label: "Ceramic Tile · Amber Gloss", category: 'Ceramic & Tile', color: '#cf8a2a', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-coral', label: "Ceramic Tile · Coral Gloss", category: 'Ceramic & Tile', color: '#e0715c', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-burgundy', label: "Ceramic Tile · Burgundy Gloss", category: 'Ceramic & Tile', color: '#6d2733', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-blush', label: "Ceramic Tile · Blush Gloss", category: 'Ceramic & Tile', color: '#eec9c4', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-charcoal', label: "Ceramic Tile · Charcoal Gloss", category: 'Ceramic & Tile', color: '#3a3d40', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-obsidian', label: "Ceramic Tile · Obsidian Gloss", category: 'Ceramic & Tile', color: '#1c1c1e', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-pistachio', label: "Ceramic Tile · Pistachio Gloss", category: 'Ceramic & Tile', color: '#c3d3a0', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-gloss-buttermilk', label: "Ceramic Tile · Buttermilk Gloss", category: 'Ceramic & Tile', color: '#f0e3bf', metalness: 0, roughness: 0.06 },
  { source: 'builtin' as const, id: 'tile-satin-white', label: "Ceramic Tile · White Satin", category: 'Ceramic & Tile', color: '#f0efea', metalness: 0, roughness: 0.35 },
  { source: 'builtin' as const, id: 'tile-satin-greige', label: "Ceramic Tile · Greige Satin", category: 'Ceramic & Tile', color: '#cdc5b8', metalness: 0, roughness: 0.35 },
  { source: 'builtin' as const, id: 'tile-satin-taupe', label: "Ceramic Tile · Taupe Satin", category: 'Ceramic & Tile', color: '#a89c8d', metalness: 0, roughness: 0.35 },
  { source: 'builtin' as const, id: 'tile-satin-duck-egg', label: "Ceramic Tile · Duck Egg Satin", category: 'Ceramic & Tile', color: '#bdd6d2', metalness: 0, roughness: 0.35 },
  { source: 'builtin' as const, id: 'tile-satin-clay', label: "Ceramic Tile · Clay Satin", category: 'Ceramic & Tile', color: '#b57a5f', metalness: 0, roughness: 0.35 },
  { source: 'builtin' as const, id: 'tile-satin-graphite', label: "Ceramic Tile · Graphite Satin", category: 'Ceramic & Tile', color: '#4d5154', metalness: 0, roughness: 0.35 },
  { source: 'builtin' as const, id: 'tile-satin-rose', label: "Ceramic Tile · Rose Satin", category: 'Ceramic & Tile', color: '#dcb2ad', metalness: 0, roughness: 0.35 },
  { source: 'builtin' as const, id: 'tile-satin-moss', label: "Ceramic Tile · Moss Satin", category: 'Ceramic & Tile', color: '#7d8a63', metalness: 0, roughness: 0.35 },
  { source: 'builtin' as const, id: 'tile-matt-bone', label: "Ceramic Tile · Bone Matt", category: 'Ceramic & Tile', color: '#e6e0d4', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'tile-matt-sand', label: "Ceramic Tile · Sand Matt", category: 'Ceramic & Tile', color: '#d6c6a9', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'tile-matt-pearl', label: "Ceramic Tile · Pearl Matt", category: 'Ceramic & Tile', color: '#ded9d1', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'tile-matt-cement', label: "Ceramic Tile · Cement Matt", category: 'Ceramic & Tile', color: '#a9abaa', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'tile-matt-stone', label: "Ceramic Tile · Stone Matt", category: 'Ceramic & Tile', color: '#b0aaa2', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'tile-matt-anthracite', label: "Ceramic Tile · Anthracite Matt", category: 'Ceramic & Tile', color: '#3e4247', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'tile-matt-ink-blue', label: "Ceramic Tile · Ink Blue Matt", category: 'Ceramic & Tile', color: '#2b3a4e', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'tile-matt-forest-green', label: "Ceramic Tile · Forest Green Matt", category: 'Ceramic & Tile', color: '#33513f', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'tile-matt-rust', label: "Ceramic Tile · Rust Matt", category: 'Ceramic & Tile', color: '#9c4f33', metalness: 0, roughness: 0.8 },
  { source: 'builtin' as const, id: 'tile-matt-almond', label: "Ceramic Tile · Almond Matt", category: 'Ceramic & Tile', color: '#dcc3b6', metalness: 0, roughness: 0.8 },
  // ── §SLABTYPES117 (2026-08-26) — eight rows the SLAB catalogue needed and the master lacked.
  // Founder: "30+ types of slab … many colours". Four through-coloured (pigmented) concretes, an
  // exposed-aggregate finish, a white marble-chip terrazzo and two coloured epoxy floors. Per the
  // `steel-grating` / `steel-powder-coated-dark` precedents above: mapping a real product onto the
  // nearest wrong row (microcement for pigmented concrete, a paint for a resin) is how the rival
  // vocabularies got written, so the MASTER gained the rows. Scalars only, no maps, pryzm-authored.
  { source: 'builtin' as const, id: 'concrete-pigmented-terracotta', label: "Concrete · Pigmented Terracotta", category: 'Concrete', color: '#b5654a', metalness: 0, roughness: 0.6, surfaces: ['floor'] },
  { source: 'builtin' as const, id: 'concrete-pigmented-ochre', label: "Concrete · Pigmented Ochre", category: 'Concrete', color: '#c9a35a', metalness: 0, roughness: 0.6, surfaces: ['floor'] },
  { source: 'builtin' as const, id: 'concrete-pigmented-slate-blue', label: "Concrete · Pigmented Slate Blue", category: 'Concrete', color: '#5c6b7a', metalness: 0, roughness: 0.6, surfaces: ['floor'] },
  { source: 'builtin' as const, id: 'concrete-pigmented-charcoal', label: "Concrete · Pigmented Charcoal", category: 'Concrete', color: '#3a3a3c', metalness: 0, roughness: 0.55, surfaces: ['floor'] },
  { source: 'builtin' as const, id: 'concrete-exposed-aggregate', label: "Concrete · Exposed Aggregate", category: 'Concrete', color: '#a89f90', metalness: 0, roughness: 0.97, surfaces: ['floor', 'outdoor'] },
  { source: 'builtin' as const, id: 'concrete-terrazzo-white-marble', label: "Concrete · White Marble-Chip Terrazzo", category: 'Concrete', color: '#e6e2d8', metalness: 0, roughness: 0.3, surfaces: ['floor'] },
  { source: 'builtin' as const, id: 'coating-epoxy-petrol-blue', label: "Coating · Petrol Blue Epoxy Floor", category: 'Paint & Coating', color: '#2f5f6e', metalness: 0, roughness: 0.18, surfaces: ['floor'] },
  { source: 'builtin' as const, id: 'coating-epoxy-oxide-red', label: "Coating · Oxide Red Epoxy Floor", category: 'Paint & Coating', color: '#8a3a2e', metalness: 0, roughness: 0.18, surfaces: ['floor'] },
] as Array<Omit<MaterialRecord, 'opacity' | 'transparent'> & { opacity?: number; transparent?: boolean }>)
  .map((m) => ({
    ...m,
    opacity: m.opacity ?? 1,
    transparent: m.transparent ?? false,
    // §MATERIAL-CARBON-FACTS — the merge. `CARBON_FACTOR_TABLE` covers a small,
    // named subset; every other row gets `undefined`, which is the answer
    // "NOT MEASURED" and is NEVER rendered as a zero downstream.
    carbon: CARBON_FACTOR_TABLE[m.id],
  }));

/** id -> record. Built once; the library shipped no lookup, so 21 importers hand-rolled `.find()`. */
const BY_ID: ReadonlyMap<string, MaterialRecord> = new Map(MATERIAL_CATALOG.map((m) => [m.id, m]));


/**
 * C100 §2.1 / L-1038 S14 — legacy ids that were NEVER in the master, mapped to the
 * master row they meant.
 *
 * ⚠ THIS IS NOT A FALLBACK, AND THE DISTINCTION IS THE WHOLE POINT. A fallback
 * answers ANY miss with a plausible colour, which is exactly what {@link findMaterialRecord}
 * refuses to do (C84 §5). This is a CLOSED, ENUMERATED set of eight strings that
 * `packages/types-builtin` shipped in dot-case while the master has always been
 * kebab-case, so projects saved before 2026-08-19 carry them on real elements. A
 * mistyped or deleted id still misses, still returns `undefined`, and still surfaces
 * as a NAMED unresolved state.
 *
 * ⛔ DO NOT GROW THIS MAP for a new drift. A new rival id is the defect C100
 * exists to stop; fix the producer, do not alias it. The map is closed at eight.
 */
const LEGACY_MATERIAL_ID_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'plaster.painted': 'paint-matte-white',
  'gypsum.standard': 'gypsum-plasterboard',
  'acoustic.tile': 'gypsum-acoustic',
  'wood.oak': 'wood-oak',
  'steel.painted': 'steel-painted-intumescent-white',
  'steel.galvanised': 'steel-galvanised',
  'concrete.precast': 'concrete-precast',
  'steel.grate': 'steel-grating',
});

/**
 * Look up a built-in material by id. `undefined` on a miss — NEVER a substitute.
 *
 * C84 §5 / C65 §3.4: a miss must stay distinguishable from a hit, so callers can
 * surface a NAMED unresolved state. Returning a plausible default here would make
 * "this material was lost" and "this element is beige" the same value, which is the
 * §CONTEXT-DATA-HONESTY failure this whole contract exists to remove.
 */
export function findMaterialRecord(id: string): MaterialRecord | undefined {
  return BY_ID.get(id) ?? BY_ID.get(LEGACY_MATERIAL_ID_ALIASES[id] ?? '\u0000');
}

/** Resolve an id to '#rrggbb'. `undefined` on a miss — see {@link findMaterialRecord}. */
export function materialHex(id: string): string | undefined {
  return findMaterialRecord(id)?.color;
}
