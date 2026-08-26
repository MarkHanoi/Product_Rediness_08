/**
 * SlabTypeCatalogue — THE ONE built-in slab-type data table.
 *
 * §SLABTYPES117 (founder, 2026-08-26): *"Create 30+ types of slab to choose from —
 * many colours — even transparency — I want a GLASS slab — a GLASS STRUCTURAL slab
 * with METAL BEAMS in a different colour — fancy slabs."*
 *
 * ── WHAT THIS FILE IS, AND WHAT IT IS NOT ──────────────────────────────────────
 *
 *   · It is DATA. A slab type is an id, a name, a description, a layer stack (each
 *     layer REFERENCING a master material by id — C100 §2, never a copied hex) and,
 *     for the composite rows, an ARTICULATION on the layer that is not a solid poché
 *     (`SlabLayer.articulation`, see SlabTypes.ts). Adding a type is adding a row.
 *   · It is NOT the registry. `SlabSystemTypeStore` seeds itself from this table and
 *     is what every consumer reads (`getAll()`); the dropdown, the AI catalogue ladder
 *     and the schedules derive from the STORE, never from this file (C84 EI-9.1: a
 *     hand-written list of the rows would be a second answer to "which types exist").
 *   · It is THREE-free and DOM-free on purpose: `@pryzm/geometry-slab/type-catalogue`
 *     is a deep path the property panel imports for the group order, and a
 *     server-reachable import of the barrel kills the deploy smoke gate (L-1500).
 *
 * ── THE FOUR RULES EVERY NEW ROW OBEYS ─────────────────────────────────────────
 *
 * 1. EVERY layer names a master `materialId` and NONE carries a `materialColor`
 *    (C100 §2 — reference, never materialise). The four ORIGINAL concrete types keep
 *    their stored hexes exactly as before (byte-identical, pinned by
 *    LandscapeSlabTypeRendersMasterMaterial.test.ts); the sixty-odd rows minted since
 *    L-963 all reference.
 * 2. EVERY type has AT LEAST TWO layers. `SlabFragmentBuilder` takes its per-layer
 *    (assembly) path on `layers.length > 1`; the layered path is the one that resolves
 *    each layer's master material, and it is the one that draws the composite rows.
 * 3. BEAM COLOUR IS THE BEAM LAYER'S MATERIAL — there is deliberately NO `beamColor`
 *    attribute anywhere. "What colour are the beams?" already has one answer in this
 *    product: the material of the layer that IS the beams, editable per slab through
 *    the existing Layers editor (LayerMaterialCell) and restyled in place by
 *    §SLAB116. A second field carrying the same fact would be the two-vocabularies
 *    defect C84 EI-9 exists to stop. The founder's five beam colours are therefore
 *    five ROWS (black / white / bronze / corten / stainless), each distinct on sight
 *    in the dropdown, and any other colour is one material pick away.
 * 4. Beam DEPTH is the beam layer's `thickness` — one number, one vocabulary. The
 *    articulation carries only what the layer record does not already say: beam
 *    width, the spacing ceiling and the direction.
 *
 * ── TRANSPARENCY ───────────────────────────────────────────────────────────────
 * A glass layer references a master row whose record carries `transparent: true`
 * and an `opacity`; `materialLibrary.project()` carries both into the THREE params
 * and `SlabFragmentBuilder.resolveBodyMaterial` builds the mesh material from the
 * injected `materialMap` row (initBuilders.ts injects `STANDARD_MATERIAL_LIBRARY`).
 * Nothing in this file decides opacity — the master does. See the transparency
 * proof in `__tests__/slabTypeCatalogue.test.ts`, which reads it OFF THE MESH.
 */

import type { SlabLayer, SlabLayerArticulation, SlabLayerFunction } from './SlabTypes';
import type { SlabSystemType } from './SlabSystemTypeStore';

// ─── GROUPS — the dropdown's optgroups, in display order ─────────────────────

export const SLAB_TYPE_GROUP_ORDER = [
    'Structural Concrete',
    'Concrete Finishes',
    'Screed & Finish',
    'Timber',
    'Composite & Precast',
    'Glass',
    'Glass & Steel',
    'Roof & Terrace',
    'Fancy',
    'Landscape & Ground',
] as const;

export type SlabTypeGroup = (typeof SLAB_TYPE_GROUP_ORDER)[number];

/** The optgroup a USER-created type lands in (it carries no `group`). */
export const SLAB_TYPE_CUSTOM_GROUP = 'Custom';

// ─── FACTORY ──────────────────────────────────────────────────────────────────

function makeBuiltIn(
    id: string,
    name: string,
    description: string,
    layers: SlabLayer[],
    loadBearing?: boolean
): SlabSystemType {
    return {
        id, name, description, layers,
        totalThickness: parseFloat(layers.reduce((s, l) => s + l.thickness, 0).toFixed(6)),
        ...(loadBearing === undefined ? {} : { loadBearing }),
        createdAt: 0, modifiedAt: 0
    };
}

/** Tag every row of a section with its optgroup. */
function group(g: SlabTypeGroup, rows: SlabSystemType[]): SlabSystemType[] {
    return rows.map(r => ({ ...r, group: g }));
}

/** A layer that REFERENCES a master material (C100 §2). */
function L(
    name: string,
    thickness: number,
    fn: SlabLayerFunction,
    materialId: string,
    articulation?: SlabLayerArticulation,
): SlabLayer {
    return articulation
        ? { name, thickness, function: fn, materialId, articulation }
        : { name, thickness, function: fn, materialId };
}

// A sand-cement screed IS a smooth concrete; the master has no separate screed row
// and minting one would be a duplicate of a row that already says the right thing.
const SCREED = 'concrete-smooth';
const RC = 'concrete-reinforced';

/** The founder's headline: a walk-on glass plate on an orthogonal steel beam grid. */
const GLASS_BEAM_GRID: SlabLayerArticulation = {
    kind: 'beam-grid', beamWidth: 0.10, maxSpacing: 1.2, direction: 'both', perimeter: true,
};
/** One-way timber joists at 400 centres with a rim joist. */
const JOISTS_400: SlabLayerArticulation = {
    kind: 'beam-grid', beamWidth: 0.05, maxSpacing: 0.4, direction: 'x', perimeter: true,
};

// ═════════════════════════════════════════════════════════════════════════════
// THE FOUR ORIGINAL CONCRETE TYPES — moved here VERBATIM from SlabSystemTypeStore.ts
// (§SLABTYPES117). Stored hexes, no materialId, no loadBearing: byte-identical to the
// pre-type-system slabs and pinned as such.
// ═════════════════════════════════════════════════════════════════════════════

const LEGACY_CONCRETE: SlabSystemType[] = [
    makeBuiltIn(
        'st-monolithic-rc-200',
        'RC Slab – Monolithic 200mm',
        'Single-pour reinforced concrete slab — identical to pre-type-system slabs.',
        [
            { name: 'RC Concrete', thickness: 0.200, function: 'structure', materialColor: '#909090' }
        ]
    ),
    makeBuiltIn(
        'st-composite-deck-300',
        'Composite Deck – 300mm',
        'Structural concrete with insulation and screed finish.',
        [
            { name: 'Screed',        thickness: 0.050, function: 'screed',      materialColor: '#c8bfa8' },
            { name: 'Insulation',    thickness: 0.050, function: 'insulation',   materialColor: '#f5e07a' },
            { name: 'RC Concrete',   thickness: 0.200, function: 'structure',    materialColor: '#909090' }
        ]
    ),
    makeBuiltIn(
        'st-insulated-screed',
        'Insulated Screed – 250mm',
        'Ground-bearing slab with waterproofing, insulation, screed and finish.',
        [
            { name: 'Floor Finish',    thickness: 0.010, function: 'finish-surface', materialColor: '#e8e0d8' },
            { name: 'Screed',          thickness: 0.065, function: 'screed',         materialColor: '#c8bfa8' },
            { name: 'Insulation',      thickness: 0.075, function: 'insulation',      materialColor: '#f5e07a' },
            { name: 'Waterproofing',   thickness: 0.005, function: 'waterproofing',   materialColor: '#404040' },
            { name: 'RC Concrete',     thickness: 0.100, function: 'structure',       materialColor: '#909090' }
        ]
    ),
    makeBuiltIn(
        'st-topping-slab-150',
        'Topping Slab – 150mm',
        'Thin lightweight concrete topping over structural substrate.',
        [
            { name: 'Screed Topping', thickness: 0.050, function: 'screed',     materialColor: '#c8bfa8' },
            { name: 'Substrate',      thickness: 0.100, function: 'substrate',   materialColor: '#a0a0a0' }
        ]
    ),
];

// ═════════════════════════════════════════════════════════════════════════════
// §SLABTYPES117 — STRUCTURAL CONCRETE (the body IS the finish)
// ═════════════════════════════════════════════════════════════════════════════

const STRUCTURAL_CONCRETE: SlabSystemType[] = [
    makeBuiltIn(
        'st-rc-fairfaced-250',
        'Fair-Faced RC — Power-Floated 250mm',
        'Reinforced concrete slab with a power-floated (burnished) wearing surface — the structure is the finish.',
        [
            L('Power-Floated Surface', 0.005, 'finish-surface', 'concrete-burnished'),
            L('RC Structure',          0.245, 'structure',      RC),
        ]
    ),
    makeBuiltIn(
        'st-rc-boardmarked-250',
        'Board-Marked RC — Exposed Soffit 250mm',
        'Trowelled top over a board-marked reinforced body; the timber-formwork grain reads on the soffit.',
        [
            L('Smooth Trowelled Top', 0.015, 'finish-surface', 'concrete-smooth'),
            L('Board-Marked RC Body', 0.235, 'structure',      'concrete-exposed'),
        ]
    ),
    makeBuiltIn(
        'st-rc-white-cement-250',
        'White Cement Concrete 250mm',
        'White-cement topping cast monolithically on a reinforced grey body.',
        [
            L('White Cement Topping', 0.030, 'finish-surface', 'concrete-white'),
            L('RC Structure',         0.220, 'structure',      RC),
        ]
    ),
    makeBuiltIn(
        'st-rc-exposed-aggregate-250',
        'Exposed Aggregate Concrete 250mm',
        'Washed exposed-aggregate wearing surface on a reinforced body — external terraces and pool surrounds.',
        [
            L('Exposed Aggregate Surface', 0.020, 'finish-surface', 'concrete-exposed-aggregate'),
            L('RC Structure',              0.230, 'structure',      RC),
        ]
    ),
];

// ═════════════════════════════════════════════════════════════════════════════
// §SLABTYPES117 — CONCRETE FINISHES (polished / pigmented toppings on RC)
// ═════════════════════════════════════════════════════════════════════════════

function pigmented(id: string, colour: string, materialId: string): SlabSystemType {
    return makeBuiltIn(
        id,
        `Pigmented Concrete — ${colour} 250mm`,
        `Through-coloured ${colour.toLowerCase()} concrete topping on a reinforced grey body.`,
        [
            L(`Pigmented Topping (${colour})`, 0.050, 'finish-surface', materialId),
            L('RC Structure',                  0.200, 'structure',      RC),
        ]
    );
}

const CONCRETE_FINISHES: SlabSystemType[] = [
    makeBuiltIn(
        'st-polished-light-250',
        'Polished Concrete — Light Grey 250mm',
        'Diamond-ground and polished light-grey topping on a reinforced body.',
        [
            L('Polished Topping', 0.015, 'finish-surface', 'concrete-polished-light'),
            L('RC Structure',     0.235, 'structure',      RC),
        ]
    ),
    makeBuiltIn(
        'st-polished-charcoal-250',
        'Polished Concrete — Charcoal 250mm',
        'Diamond-ground and polished charcoal topping on a reinforced body.',
        [
            L('Polished Topping', 0.015, 'finish-surface', 'concrete-polished-dark'),
            L('RC Structure',     0.235, 'structure',      RC),
        ]
    ),
    pigmented('st-pigmented-terracotta-250', 'Terracotta', 'concrete-pigmented-terracotta'),
    pigmented('st-pigmented-ochre-250',      'Ochre',      'concrete-pigmented-ochre'),
    pigmented('st-pigmented-slate-blue-250', 'Slate Blue', 'concrete-pigmented-slate-blue'),
    pigmented('st-pigmented-charcoal-250',   'Charcoal',   'concrete-pigmented-charcoal'),
];

// ═════════════════════════════════════════════════════════════════════════════
// §SLABTYPES117 — SCREED & FINISH (finish · screed · RC)
// ═════════════════════════════════════════════════════════════════════════════

function onScreed(
    id: string, name: string, description: string,
    finishName: string, finishThickness: number, finishMaterialId: string,
): SlabSystemType {
    // Finish + screed always sum to 75 mm over a 200 mm body, so every row in this
    // group is 275 mm and the finishes are comparable at a glance.
    return makeBuiltIn(id, name, description, [
        L(finishName,          finishThickness,         'finish-surface', finishMaterialId),
        L('Sand-Cement Screed', 0.075 - finishThickness, 'screed',         SCREED),
        L('RC Structure',       0.200,                   'structure',      RC),
    ]);
}

const SCREED_AND_FINISH: SlabSystemType[] = [
    onScreed('st-terrazzo-fine-275',         'Fine Terrazzo on Screed',            'Fine-aggregate poured terrazzo, ground and sealed, on a bonded screed.',      'Fine Terrazzo',              0.015, 'concrete-terrazzo-fine'),
    onScreed('st-terrazzo-dark-275',         'Dark Terrazzo on Screed',            'Dark-matrix poured terrazzo on a bonded screed.',                             'Dark Terrazzo',              0.015, 'concrete-terrazzo-dark'),
    onScreed('st-terrazzo-white-marble-275', 'White Marble-Chip Terrazzo',         'White matrix with Carrara chips, ground and polished, on a bonded screed.',   'Marble-Chip Terrazzo',       0.015, 'concrete-terrazzo-white-marble'),
    onScreed('st-tile-porcelain-600-275',    'Large-Format Porcelain 600 × 600',   'Stack-bonded 600 × 600 porcelain on adhesive over a levelling screed.',       'Porcelain Tile 600 × 600',   0.012, 'tile-porcelain-600-stack'),
    onScreed('st-mosaic-hexagon-275',        'Hexagon Mosaic Tile',                'Hexagonal pool-blue mosaic sheets on a levelling screed.',                    'Hexagon Mosaic',             0.008, 'tile-mosaic-pool-hex-069'),
    onScreed('st-tile-encaustic-275',        'Patterned Encaustic Cement Tile',    'Hand-pressed encaustic cement tiles on a levelling screed.',                  'Encaustic Cement Tile',      0.012, 'tile-encaustic-pattern-base'),
    onScreed('st-tile-zellige-emerald-275',  'Emerald Zellige Tile',               'Hand-glazed emerald zellige on a levelling screed — every tile a different depth of green.', 'Emerald Zellige', 0.010, 'tile-zellige-green'),
    onScreed('st-oak-plank-275',             'Wide Oak Plank Boards',              '189 mm engineered oak boards on a levelling screed.',                         'Oak Plank Boards',           0.020, 'floor-oak-plank-wide'),
    onScreed('st-parquet-herringbone-275',   'Oak Herringbone Parquet',            '70 × 350 oak herringbone blocks on a levelling screed.',                      'Oak Herringbone Parquet',    0.015, 'parquet-oak-herringbone'),
    onScreed('st-stone-carrara-275',         'Polished Carrara Marble',            'Honed-and-polished Carrara slabs on a bonded screed.',                         'Carrara Marble',             0.020, 'stone-marble-carrara'),
    onScreed('st-stone-nero-marquina-275',   'Polished Nero Marquina Marble',      'Polished black Nero Marquina slabs on a bonded screed.',                       'Nero Marquina Marble',       0.020, 'stone-marble-nero-marquina'),
    onScreed('st-resin-white-275',           'Epoxy Resin Floor — White',          'Seamless self-levelling white epoxy on a bonded screed.',                      'White Epoxy Resin',          0.004, 'coating-epoxy-white'),
    onScreed('st-resin-grey-flake-275',      'Epoxy Resin Floor — Grey Flake',     'Seamless grey epoxy with decorative flake on a bonded screed.',                'Grey Flake Epoxy Resin',     0.004, 'coating-epoxy-grey-flake'),
    onScreed('st-resin-petrol-blue-275',     'Epoxy Resin Floor — Petrol Blue',    'Seamless self-levelling petrol-blue epoxy on a bonded screed.',                'Petrol Blue Epoxy Resin',    0.004, 'coating-epoxy-petrol-blue'),
    onScreed('st-resin-oxide-red-275',       'Epoxy Resin Floor — Oxide Red',      'Seamless self-levelling oxide-red epoxy on a bonded screed.',                  'Oxide Red Epoxy Resin',      0.004, 'coating-epoxy-oxide-red'),
];

// ═════════════════════════════════════════════════════════════════════════════
// §SLABTYPES117 — TIMBER (two of these are COMPOSITE rows: boards on one-way joists)
// ═════════════════════════════════════════════════════════════════════════════

const TIMBER: SlabSystemType[] = [
    makeBuiltIn(
        'st-clt-exposed-200',
        'CLT Panel — Exposed Soffit 200mm',
        'Ash boards on a cross-laminated timber panel whose soffit is left exposed.',
        [
            L('Ash Boards', 0.020, 'finish-surface', 'floor-ash-plank-narrow'),
            L('CLT Panel',  0.180, 'structure',      'timber-clt'),
        ]
    ),
    makeBuiltIn(
        'st-timber-joists-boards-242',
        'Timber Joists + Pine Boards',
        'Pine floorboards on glulam joists at 400 centres with a rim joist — the joist zone is drawn as joists, not a solid.',
        [
            L('Pine Floorboards', 0.022, 'finish-surface', 'wood-pine'),
            L('Glulam Joists',    0.220, 'structure',      'timber-glulam', JOISTS_400),
        ]
    ),
    makeBuiltIn(
        'st-oak-decking-joists-175',
        'Oak Decking on Joists',
        'Oak deck boards on thermowood joists at 450 centres with a rim joist.',
        [
            L('Oak Deck Boards',   0.025, 'finish-surface', 'decking-oak-145'),
            L('Thermowood Joists', 0.150, 'structure',      'wood-thermowood',
              { kind: 'beam-grid', beamWidth: 0.045, maxSpacing: 0.45, direction: 'x', perimeter: true }),
        ]
    ),
];

// ═════════════════════════════════════════════════════════════════════════════
// §SLABTYPES117 — COMPOSITE & PRECAST
// ═════════════════════════════════════════════════════════════════════════════

const COMPOSITE_AND_PRECAST: SlabSystemType[] = [
    makeBuiltIn(
        'st-composite-steel-deck-150',
        'Composite Steel Deck 150mm',
        'Concrete topping acting compositely with a galvanised profiled steel deck.',
        [
            L('Concrete Topping',     0.090, 'structure', 'concrete-smooth'),
            L('Galvanised Steel Deck', 0.060, 'structure', 'steel-galvanised'),
        ]
    ),
    makeBuiltIn(
        'st-precast-hollowcore-250',
        'Precast Hollowcore + Screed 250mm',
        'Structural screed on prestressed precast hollowcore planks.',
        [
            L('Structural Screed',  0.050, 'screed',    SCREED),
            L('Hollowcore Planks',  0.200, 'structure', 'concrete-precast'),
        ]
    ),
];

// ═════════════════════════════════════════════════════════════════════════════
// §SLABTYPES117 — GLASS (laminated plates; every ply references a TRANSPARENT master row)
// ═════════════════════════════════════════════════════════════════════════════

function laminated(id: string, name: string, description: string, topPly: string, bottomPly: string): SlabSystemType {
    return makeBuiltIn(id, name, description, [
        L('Top Ply',       0.019, 'structure', topPly),
        L('PVB Interlayer', 0.003, 'structure', 'plastic-transparent'),
        L('Bottom Ply',    0.019, 'structure', bottomPly),
    ]);
}

const GLASS: SlabSystemType[] = [
    laminated('st-glass-clear-041',          'Glass Slab — Clear Laminated',        'Two 19 mm clear float plies on a PVB interlayer. Transparent.',                'glass-clear',        'glass-clear'),
    laminated('st-glass-bronze-041',         'Glass Slab — Tinted Bronze',          'Two 19 mm bronze-tinted plies on a PVB interlayer. Transparent.',             'glass-tinted-bronze', 'glass-tinted-bronze'),
    laminated('st-glass-grey-041',           'Glass Slab — Tinted Grey',            'Two 19 mm grey-tinted plies on a PVB interlayer. Transparent.',               'glass-tinted-grey',  'glass-tinted-grey'),
    laminated('st-glass-frosted-041',        'Glass Slab — Frosted / Acid-Etched',  'Acid-etched top ply over a clear ply on a PVB interlayer. Translucent.',       'glass-frosted',      'glass-clear'),
    laminated('st-glass-laminated-blue-041', 'Glass Slab — Laminated Blue',         'Two 19 mm pale-blue laminated safety plies on a PVB interlayer. Transparent.', 'glass-laminated',    'glass-laminated'),
    makeBuiltIn(
        'st-glass-walk-on-060',
        'Walk-On Structural Glass (3-Ply) 60mm',
        'Three 19 mm toughened plies on two PVB interlayers — a walk-on floor plate. Transparent.',
        [
            L('Top Ply',       0.019, 'structure', 'glass-structural'),
            L('PVB Interlayer', 0.0015, 'structure', 'plastic-transparent'),
            L('Middle Ply',    0.019, 'structure', 'glass-structural'),
            L('PVB Interlayer', 0.0015, 'structure', 'plastic-transparent'),
            L('Bottom Ply',    0.019, 'structure', 'glass-structural'),
        ]
    ),
];

// ═════════════════════════════════════════════════════════════════════════════
// §SLABTYPES117 — GLASS & STEEL (the founder's headline; COMPOSITE rows)
//
// One row per beam colour — see rule 3 in the header for why these are rows and not
// a `beamColor` parameter. The beam layer's material IS the colour.
// ═════════════════════════════════════════════════════════════════════════════

function glassOnBeams(id: string, beamColour: string, beamMaterialId: string, glassMaterialId = 'glass-structural', glassLabel = 'Structural Glass'): SlabSystemType {
    return makeBuiltIn(
        id,
        `${glassLabel} on ${beamColour} Steel Beams`,
        `25 mm toughened walk-on glass plate on an orthogonal ${beamColour.toLowerCase()} steel beam grid (100 mm wide, 275 mm deep, bays ≤ 1.2 m) with a perimeter ring beam. The grid is drawn as beams, never as a solid; a wider slab gets MORE beams at the same size.`,
        [
            L('Walk-On Glass Plate',            0.025, 'structure', glassMaterialId),
            L(`${beamColour} Steel Beam Grid`,  0.275, 'structure', beamMaterialId, GLASS_BEAM_GRID),
        ]
    );
}

const GLASS_AND_STEEL: SlabSystemType[] = [
    glassOnBeams('st-glass-beams-black-300',     'Black',     'steel-blackened'),
    glassOnBeams('st-glass-beams-white-300',     'White',     'steel-painted-intumescent-white'),
    glassOnBeams('st-glass-beams-bronze-300',    'Bronze',    'bronze-aged'),
    glassOnBeams('st-glass-beams-corten-300',    'Corten',    'steel-corten'),
    glassOnBeams('st-glass-beams-stainless-300', 'Stainless', 'steel-stainless-brushed'),
    glassOnBeams('st-glass-grey-beams-black-300', 'Black',    'steel-blackened', 'glass-tinted-grey', 'Tinted Grey Glass'),
];

// ═════════════════════════════════════════════════════════════════════════════
// §SLABTYPES117 — ROOF & TERRACE (structural RC under a roof or terrace build-up)
// ═════════════════════════════════════════════════════════════════════════════

const ROOF_AND_TERRACE: SlabSystemType[] = [
    makeBuiltIn(
        'st-green-roof-sedum-435',
        'Sedum Green Roof Build-Up',
        'Sedum blanket on a substrate over a root barrier, XPS insulation and an RC deck.',
        [
            L('Sedum Blanket',        0.080, 'growing-medium', 'roofing-green-sedum'),
            L('Green Roof Substrate', 0.100, 'growing-medium', 'landscape-topsoil'),
            L('Root Barrier',         0.005, 'waterproofing',  'membrane-green-roof-root'),
            L('XPS Insulation',       0.100, 'insulation',     'insulation-xps'),
            L('RC Deck',              0.150, 'structure',      RC),
        ]
    ),
    makeBuiltIn(
        'st-gravel-ballast-roof-305',
        'Gravel Ballast Roof',
        'Pea-gravel ballast on inverted-roof XPS over a bitumen membrane and an RC deck.',
        [
            L('Gravel Ballast',    0.050, 'surfacing',     'landscape-gravel-light'),
            L('XPS Insulation',    0.100, 'insulation',    'insulation-xps'),
            L('Bitumen Membrane',  0.005, 'waterproofing', 'membrane-bitumen'),
            L('RC Deck',           0.150, 'structure',     RC),
        ]
    ),
    makeBuiltIn(
        'st-granite-paving-terrace-260',
        'Granite Paving Terrace',
        'Sawn granite paving on a sand bed over an RC terrace slab.',
        [
            L('Sawn Granite Paving', 0.030, 'finish-surface', 'ground-paving-granite'),
            L('Sand Bedding',        0.030, 'substrate',      'landscape-sand'),
            L('RC Terrace Slab',     0.200, 'structure',      RC),
        ]
    ),
];

// ═════════════════════════════════════════════════════════════════════════════
// §SLABTYPES117 — FANCY (COMPOSITE rows: a light box, an inlay border, an edge strip)
//
// ⚠ No layer here EMITS light. The master material record carries no emissive term
// (C100 §1.1), so "backlit" and "LED" describe the CONSTRUCTION — an opal diffuser
// over a light-box frame, an opal strip at the edge — not a light source. Saying
// otherwise would be a claim the render cannot keep.
// ═════════════════════════════════════════════════════════════════════════════

const FANCY: SlabSystemType[] = [
    makeBuiltIn(
        'st-onyx-backlit-230',
        'Backlit Honey Onyx (Light Box)',
        'Honey onyx veneer on an opal diffuser over a black steel light-box frame at 600 centres.',
        [
            L('Honey Onyx Veneer',      0.020, 'finish-surface', 'stone-onyx-honey'),
            L('Opal Diffuser',          0.010, 'substrate',      'polycarbonate-opal'),
            L('Light-Box Steel Frame',  0.200, 'structure',      'steel-blackened',
              { kind: 'beam-grid', beamWidth: 0.06, maxSpacing: 0.6, direction: 'both', perimeter: true }),
        ]
    ),
    makeBuiltIn(
        'st-concrete-brass-inlay-253',
        'Polished Concrete with Brass Inlay Border',
        'Light polished concrete with an 80 mm polished-brass border inlaid at every edge and around every opening.',
        [
            L('Brass Inlay Border',  0.003, 'finish-surface', 'brass-polished', { kind: 'perimeter-band', bandWidth: 0.08 }),
            L('Polished Topping',    0.015, 'finish-surface', 'concrete-polished-light'),
            L('RC Structure',        0.235, 'structure',      RC),
        ]
    ),
    makeBuiltIn(
        'st-concrete-opal-edge-262',
        'Charcoal Concrete with Opal Edge Strip',
        'Charcoal polished concrete with a 30 mm opal polycarbonate strip at every edge — the LED-strip detail, drawn as its diffuser.',
        [
            L('Opal Edge Strip',     0.012, 'finish-surface', 'polycarbonate-opal', { kind: 'perimeter-band', bandWidth: 0.03 }),
            L('Polished Topping',    0.015, 'finish-surface', 'concrete-polished-dark'),
            L('RC Structure',        0.235, 'structure',      RC),
        ]
    ),
    makeBuiltIn(
        'st-piano-black-275',
        'Piano Black Gloss',
        'High-gloss black lacquered finish on a bonded screed.',
        [
            L('Piano Black Gloss',  0.010, 'finish-surface', 'special-black-gloss'),
            L('Sand-Cement Screed', 0.065, 'screed',         SCREED),
            L('RC Structure',       0.200, 'structure',      RC),
        ]
    ),
];

// ═════════════════════════════════════════════════════════════════════════════
// §FEAT-LANDSCAPE-SLAB-TYPES (L-963) — GRASS AND SOIL — moved here VERBATIM
// ═════════════════════════════════════════════════════════════════════════════
//
// Founder: "For the slab — I need more slab types for landscape with grass
// types and soil types."
//
// ── THREE RULES THESE TEN OBEY, AND WHY ─────────────────────────────────
//
// 1. EVERY layer NAMES a master material (`materialId`) and NONE carries a
//    `materialColor`. The four concrete types above hard-code hexes; that is
//    pre-existing and left untouched, but a new type may not copy a colour
//    out of `MATERIAL_CATALOG` (C100 §2 — REFERENCE, never MATERIALISE). All
//    ids below already exist in the master's `Landscape & Ground` category:
//    THIS FEATURE ADDED ZERO MASTER ROWS.
//
// 2. EVERY type has AT LEAST TWO layers, and that is load-bearing on the
//    RENDER, not a stylistic choice. `SlabFragmentBuilder` takes its layered
//    path only on `data.layers.length > 1`; a single-layer type falls to the
//    plain path, which reads `data.materialId` — a field `UpdateSlabLayersCommand`
//    never writes (it sets layers + thickness + systemTypeId only). A
//    one-layer landscape type would therefore be stored perfectly and render
//    GREY. Soils are genuinely layered anyway, so the honest model and the
//    working one coincide.
//
// 3. `loadBearing: false` on all ten — metadata, with nothing enforcing it.
//    See the field's note on `SlabSystemType`.
//
// ⚠ FOUR grass types, not five. The founder's list named meadow AND
// wildflower; the master has ONE row for both — `landscape-grass-meadow`,
// labelled "Wildflower Meadow". Publishing two types that resolve to one
// material would put two names in the dropdown that render identically, an
// affordance with nothing behind it. One honest type instead.

const LANDSCAPE: SlabSystemType[] = [
    // ── GRASS ───────────────────────────────────────────────────────────────
    makeBuiltIn(
        'st-landscape-lawn-280',
        'Lawn — Mown Turf on Topsoil',
        'Domestic/amenity lawn: turf over a screened topsoil root zone on a free-draining gravel raft. Not structural.',
        [
            { name: 'Mown Lawn Turf',   thickness: 0.030, function: 'growing-medium', materialId: 'landscape-grass-lawn' },
            { name: 'Screened Topsoil', thickness: 0.150, function: 'growing-medium', materialId: 'landscape-topsoil' },
            { name: 'Drainage Gravel',  thickness: 0.100, function: 'drainage',       materialId: 'landscape-gravel-light' }
        ],
        false
    ),
    makeBuiltIn(
        'st-landscape-meadow-330',
        'Wildflower Meadow on Low-Nutrient Subsoil',
        'Species-rich meadow. The sward sits on a deliberately LOW-nutrient sandy loam — fertile topsoil favours coarse grasses and suppresses flowering species, so this is not "lawn with a different colour". Covers both "meadow" and "wildflower": the master catalogue holds ONE row for both. Not structural.',
        [
            { name: 'Meadow Sward',           thickness: 0.080, function: 'growing-medium', materialId: 'landscape-grass-meadow' },
            { name: 'Low-Nutrient Sandy Loam', thickness: 0.200, function: 'growing-medium', materialId: 'landscape-soil-sandy-loam' },
            { name: 'Drainage Gravel',        thickness: 0.050, function: 'drainage',       materialId: 'landscape-gravel-light' }
        ],
        false
    ),
    makeBuiltIn(
        'st-landscape-sports-turf-400',
        'Sports Turf — Ryegrass on Sand Rootzone',
        'Pitch construction: ryegrass sward on a free-draining sand rootzone over a gravel carpet. ⚠ The material REFERENCED is `landscape-grass-ryegrass` because perennial ryegrass IS the standard sports-pitch species — this is a deliberate reference, NOT a gap. Do not "fix" it by minting a "sports turf" master row; that would be a duplicate of a row that already says the right thing. Not structural.',
        [
            { name: 'Ryegrass Sward',        thickness: 0.040, function: 'growing-medium', materialId: 'landscape-grass-ryegrass' },
            { name: 'Sand Rootzone',         thickness: 0.250, function: 'growing-medium', materialId: 'landscape-sand' },
            { name: 'Gravel Drainage Carpet', thickness: 0.110, function: 'drainage',      materialId: 'landscape-gravel-basalt' }
        ],
        false
    ),
    makeBuiltIn(
        'st-landscape-turf-artificial-160',
        'Artificial Turf on Sand Blinding',
        'Synthetic turf pile on a sharp-sand blinding over a compacted sub-base. The pile is `surfacing`, not `growing-medium` — nothing grows in it. Not structural.',
        [
            { name: 'Artificial Turf Pile', thickness: 0.035, function: 'surfacing', materialId: 'landscape-grass-artificial' },
            { name: 'Sharp Sand Blinding',  thickness: 0.025, function: 'drainage',  materialId: 'landscape-sand' },
            { name: 'Compacted Sub-base',   thickness: 0.100, function: 'sub-base',  materialId: 'ground-decomposed-granite' }
        ],
        false
    ),

    // ── SOIL AND GROUND ─────────────────────────────────────────────────────
    makeBuiltIn(
        'st-landscape-topsoil-350',
        'Topsoil Planting Bed',
        'Deep screened topsoil over retained clay subsoil — the general-purpose planting bed. Not structural.',
        [
            { name: 'Screened Topsoil', thickness: 0.300, function: 'growing-medium', materialId: 'landscape-topsoil' },
            { name: 'Clay Subsoil',     thickness: 0.050, function: 'substrate',      materialId: 'landscape-soil-clay' }
        ],
        false
    ),
    makeBuiltIn(
        'st-landscape-subsoil-500',
        'Subsoil Fill — Unimproved Ground',
        'Placed subsoil with a sandy-loam transition layer: made-up ground, bunds and regrading where no planting medium is intended. Not structural.',
        [
            { name: 'Clay Subsoil',            thickness: 0.450, function: 'substrate', materialId: 'landscape-soil-clay' },
            { name: 'Sandy Loam Transition',   thickness: 0.050, function: 'substrate', materialId: 'landscape-soil-sandy-loam' }
        ],
        false
    ),
    makeBuiltIn(
        'st-landscape-gravel-200',
        'Gravel Bed on Geotextile',
        'Decorative pea-gravel dressing over a weed-suppressant geotextile on a coarse gravel sub-base. Not structural.',
        [
            { name: 'Pea Gravel Dressing',     thickness: 0.070, function: 'surfacing',  materialId: 'landscape-gravel-light' },
            { name: 'Weed-Suppressant Geotextile', thickness: 0.005, function: 'geotextile', materialId: 'membrane-green-roof-root' },
            { name: 'Coarse Gravel Sub-base',  thickness: 0.125, function: 'sub-base',   materialId: 'landscape-gravel-basalt' }
        ],
        false
    ),
    makeBuiltIn(
        'st-landscape-sand-300',
        'Sand Bed',
        'Play sand or beach-edge sand over a drainage gravel raft. Not structural.',
        [
            { name: 'Sand',            thickness: 0.200, function: 'surfacing', materialId: 'landscape-sand' },
            { name: 'Drainage Gravel', thickness: 0.100, function: 'drainage',  materialId: 'landscape-gravel-light' }
        ],
        false
    ),
    makeBuiltIn(
        'st-landscape-bark-mulch-250',
        'Bark Mulch over Topsoil',
        'Mulched shrub bed: bark dressing over a topsoil root zone. Not structural.',
        [
            { name: 'Bark Mulch',       thickness: 0.075, function: 'surfacing',      materialId: 'landscape-bark-mulch' },
            { name: 'Screened Topsoil', thickness: 0.175, function: 'growing-medium', materialId: 'landscape-topsoil' }
        ],
        false
    ),
    makeBuiltIn(
        'st-landscape-decomposed-granite-175',
        'Decomposed Granite Path',
        'Compacted self-binding decomposed granite on a gravel sub-base — informal paths and terraces. Trafficked, but not a structural slab. Not structural.',
        [
            { name: 'Compacted Decomposed Granite', thickness: 0.075, function: 'surfacing', materialId: 'ground-decomposed-granite' },
            { name: 'Gravel Sub-base',              thickness: 0.100, function: 'sub-base',  materialId: 'landscape-gravel-basalt' }
        ],
        false
    ),
];

// ─────────────────────────────────────────────────────────────────────────────

/**
 * The ids of the fourteen rows that pre-date §SLABTYPES117 (four concrete, ten
 * landscape). Exported so a test can separate "the rows this lane minted" from
 * "the rows that were already there" without a hand-copied list of either.
 */
export const SLAB_TYPE_IDS_BEFORE_SLABTYPES117: ReadonlySet<string> = new Set(
    [...LEGACY_CONCRETE, ...LANDSCAPE].map(t => t.id),
);

/**
 * THE built-in slab-type table, in dropdown order. `SlabSystemTypeStore` seeds from
 * this and is the registry every consumer reads. Cite `SLAB_TYPE_CATALOGUE.length`,
 * never a number from a comment.
 */
export const SLAB_TYPE_CATALOGUE: readonly SlabSystemType[] = [
    ...group('Structural Concrete', [...LEGACY_CONCRETE, ...STRUCTURAL_CONCRETE]),
    ...group('Concrete Finishes',   CONCRETE_FINISHES),
    ...group('Screed & Finish',     SCREED_AND_FINISH),
    ...group('Timber',              TIMBER),
    ...group('Composite & Precast', COMPOSITE_AND_PRECAST),
    ...group('Glass',               GLASS),
    ...group('Glass & Steel',       GLASS_AND_STEEL),
    ...group('Roof & Terrace',      ROOF_AND_TERRACE),
    ...group('Fancy',               FANCY),
    ...group('Landscape & Ground',  LANDSCAPE),
];

/** True iff at least one layer of the type is ARTICULATED (drawn by CompositeSlabBuilder). */
export function isCompositeSlabType(t: Pick<SlabSystemType, 'layers'>): boolean {
    return t.layers.some(l => l.articulation !== undefined);
}
