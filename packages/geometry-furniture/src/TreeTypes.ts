/**
 * @file TreeTypes.ts
 *
 * Parametric tree library — 25 species (Arbol T-01 … T-25) grouped into
 * 12 visual archetypes.  Each archetype has a single 3D builder method in
 * `ParametricTreeEngine` and a single 2D plan-symbol method in
 * `TreePlanSymbolBuilder`.  Per-species variation (height, crown radius,
 * foliage colour, density) is driven by `TREE_SPECIES_TABLE`.
 *
 * Contract:
 *  - Pure DTO module — no THREE.js, no store logic, no side effects.
 *  - 03-BIM §1.1 — no `any`.
 *  - 13-PROJECT-SAVE-LOAD — all params are JSON-serialisable primitives.
 */

// ── Visual archetypes ────────────────────────────────────────────────────

/**
 * The 12 distinct visual families used by the tree library.  Each archetype
 * owns one 3D mesh builder and one plan-view symbol builder.  Adding a new
 * archetype requires implementing both builders + extending this union.
 */
export type TreeArchetype =
    | 'round_dense'        // Solid round canopy + radial branch spikes (T-1, T-6, T-7, T-16)
    | 'round_open'         // Round + sparse scattered dots — open foliage (T-3, T-11, T-17)
    | 'round_dotted'       // Round + uniform dotted fill (T-2, T-20, T-24, T-25)
    | 'topiary'            // Formal concentric ring + crosshair (T-4, T-5)
    | 'branchy'            // Round + visible structural branches radiating (T-12, T-15)
    | 'conifer_columnar'   // Tall narrow pencil — Italian-cypress-like (T-10)
    | 'conifer_pyramid'    // Conical conifer with broader base (T-8)
    | 'conifer_starburst'  // Sharp radial needles, pine character (T-13, T-22)
    | 'palm'               // Long radial fronds at top of clear trunk (T-18, T-23)
    | 'willow'             // Round canopy with drooping streamer foliage (T-14)
    | 'flowering'          // Round canopy + scattered colour-flecked flowers (T-9, T-21)
    | 'multi_lobed';       // Overlapping multi-blob organic canopy (T-19)

// ── Species identifiers ──────────────────────────────────────────────────

export type TreeSpeciesId =
    | 'arbol_t_01' | 'arbol_t_02' | 'arbol_t_03' | 'arbol_t_04' | 'arbol_t_05'
    | 'arbol_t_06' | 'arbol_t_07' | 'arbol_t_08' | 'arbol_t_09' | 'arbol_t_10'
    | 'arbol_t_11' | 'arbol_t_12' | 'arbol_t_13' | 'arbol_t_14' | 'arbol_t_15'
    | 'arbol_t_16' | 'arbol_t_17' | 'arbol_t_18' | 'arbol_t_19' | 'arbol_t_20'
    | 'arbol_t_21' | 'arbol_t_22' | 'arbol_t_23' | 'arbol_t_24' | 'arbol_t_25';

// ── Per-species definition ───────────────────────────────────────────────

export interface TreeSpeciesDef {
    /** Canonical species id (matches FurnitureType). */
    readonly id: TreeSpeciesId;
    /** Carousel label, e.g. "Arbol T-01 — Cipres". */
    readonly label: string;
    /** Architectural Spanish-language species name (sub-label). */
    readonly speciesName: string;
    /** Visual archetype (drives both 3D and plan-symbol builders). */
    readonly archetype: TreeArchetype;
    /** Total tree height in metres (trunk + canopy). */
    readonly height: number;
    /** Outer canopy radius in metres (the "footprint" radius). */
    readonly crownRadius: number;
    /** Trunk radius at ground in metres. */
    readonly trunkRadius: number;
    /** Hex foliage colour for the 3D canopy. */
    readonly foliageColor: string;
    /** Hex secondary/accent foliage colour (used by flowering / open archetypes). */
    readonly accentColor?: string;
    /** Hex trunk colour. */
    readonly trunkColor: string;
    /** Optional density multiplier (0.5 = sparse, 1 = default, 1.5 = dense). */
    readonly density?: number;
}

// ── Species table ────────────────────────────────────────────────────────

/**
 * Authoritative per-species table.  Heights and crown radii are based on
 * mature-specimen averages (rounded to 0.5 m steps); colours are tuned for
 * the architectural palette in the reference plates.
 */
export const TREE_SPECIES_TABLE: Readonly<Record<TreeSpeciesId, TreeSpeciesDef>> = {
    arbol_t_01: {
        id: 'arbol_t_01', label: 'Arbol T-01', speciesName: 'Generic Deciduous',
        archetype: 'round_dense',
        height: 8.0,  crownRadius: 3.0, trunkRadius: 0.18,
        foliageColor: '#94b86b', trunkColor: '#5a4632', density: 1.0,
    },
    arbol_t_02: {
        id: 'arbol_t_02', label: 'Arbol T-02', speciesName: 'Generic Round',
        archetype: 'round_dotted',
        height: 7.0,  crownRadius: 2.6, trunkRadius: 0.16,
        foliageColor: '#a8c47a', trunkColor: '#634a35', density: 1.0,
    },
    arbol_t_03: {
        id: 'arbol_t_03', label: 'Arbol T-03', speciesName: 'A_CEDRO',
        archetype: 'round_open',
        height: 12.0, crownRadius: 3.4, trunkRadius: 0.22,
        foliageColor: '#9bbf6c', accentColor: '#c9d8a3',
        trunkColor: '#4a3826', density: 0.7,
    },
    arbol_t_04: {
        id: 'arbol_t_04', label: 'Arbol T-04', speciesName: 'A_GUAYACAN AMARILLO',
        archetype: 'topiary',
        height: 9.0,  crownRadius: 3.0, trunkRadius: 0.18,
        foliageColor: '#c8c25a', accentColor: '#e0c93a',
        trunkColor: '#5a3f24', density: 1.0,
    },
    arbol_t_05: {
        id: 'arbol_t_05', label: 'Arbol T-05', speciesName: 'A_URAPAN',
        archetype: 'topiary',
        height: 10.0, crownRadius: 3.2, trunkRadius: 0.20,
        foliageColor: '#a4c372', trunkColor: '#5a4632', density: 1.1,
    },
    arbol_t_06: {
        id: 'arbol_t_06', label: 'Arbol T-06', speciesName: 'A_CIPRES',
        archetype: 'round_dense',
        height: 10.0, crownRadius: 2.8, trunkRadius: 0.18,
        foliageColor: '#5b8a4f', trunkColor: '#4a3826', density: 1.4,
    },
    arbol_t_07: {
        id: 'arbol_t_07', label: 'Arbol T-07', speciesName: 'A_NOGAL',
        archetype: 'round_dotted',
        height: 11.0, crownRadius: 3.6, trunkRadius: 0.24,
        foliageColor: '#90b167', trunkColor: '#5a3e22', density: 1.0,
    },
    arbol_t_08: {
        id: 'arbol_t_08', label: 'Arbol T-08', speciesName: 'A_ALAMO',
        archetype: 'conifer_pyramid',
        height: 14.0, crownRadius: 2.4, trunkRadius: 0.20,
        foliageColor: '#5a8a3e', trunkColor: '#5a4030', density: 1.2,
    },
    arbol_t_09: {
        id: 'arbol_t_09', label: 'Arbol T-09', speciesName: 'A_CASCO DE BUEY',
        archetype: 'flowering',
        height: 8.0,  crownRadius: 3.4, trunkRadius: 0.18,
        foliageColor: '#9ab368', accentColor: '#d4a3c5',
        trunkColor: '#5a4030', density: 1.0,
    },
    arbol_t_10: {
        id: 'arbol_t_10', label: 'Arbol T-10', speciesName: 'A_PINO COLOMBIANO',
        archetype: 'conifer_columnar',
        height: 16.0, crownRadius: 1.4, trunkRadius: 0.22,
        foliageColor: '#4f7a3a', trunkColor: '#5a3826', density: 1.5,
    },
    arbol_t_11: {
        id: 'arbol_t_11', label: 'Arbol T-11', speciesName: 'A_ALISO',
        archetype: 'round_open',
        height: 9.0,  crownRadius: 3.0, trunkRadius: 0.18,
        foliageColor: '#a3c074', accentColor: '#c9b0a1',
        trunkColor: '#4a3826', density: 0.6,
    },
    arbol_t_12: {
        id: 'arbol_t_12', label: 'Arbol T-12', speciesName: 'A_TULIPAN AFRICANO',
        archetype: 'branchy',
        height: 10.0, crownRadius: 3.4, trunkRadius: 0.22,
        foliageColor: '#7fa84d', trunkColor: '#5a3826', density: 1.1,
    },
    arbol_t_13: {
        id: 'arbol_t_13', label: 'Arbol T-13', speciesName: 'A_PINO',
        archetype: 'conifer_starburst',
        height: 12.0, crownRadius: 2.0, trunkRadius: 0.18,
        foliageColor: '#5b8a4f', trunkColor: '#4a3022', density: 1.3,
    },
    arbol_t_14: {
        id: 'arbol_t_14', label: 'Arbol T-14', speciesName: 'A_MOLLE COSTEÑO',
        archetype: 'willow',
        height: 8.0,  crownRadius: 3.6, trunkRadius: 0.22,
        foliageColor: '#6f9a4a', trunkColor: '#5a4030', density: 1.0,
    },
    arbol_t_15: {
        id: 'arbol_t_15', label: 'Arbol T-15', speciesName: 'A_MURALLA EXOTICA',
        archetype: 'branchy',
        height: 6.0,  crownRadius: 2.4, trunkRadius: 0.14,
        foliageColor: '#8eb158', trunkColor: '#5a4030', density: 1.4,
    },
    arbol_t_16: {
        id: 'arbol_t_16', label: 'Arbol T-16', speciesName: 'A_TILO',
        archetype: 'round_dense',
        height: 9.0,  crownRadius: 3.0, trunkRadius: 0.20,
        foliageColor: '#9fbf6b', trunkColor: '#5a4030', density: 1.0,
    },
    arbol_t_17: {
        id: 'arbol_t_17', label: 'Arbol T-17', speciesName: 'A_ROBLE',
        archetype: 'round_open',
        height: 11.0, crownRadius: 3.6, trunkRadius: 0.26,
        foliageColor: '#a3c074', trunkColor: '#5a3826', density: 0.8,
    },
    arbol_t_18: {
        id: 'arbol_t_18', label: 'Arbol T-18', speciesName: 'A_PALMA DE CERA',
        archetype: 'palm',
        height: 18.0, crownRadius: 2.2, trunkRadius: 0.14,
        foliageColor: '#6a9a4a', trunkColor: '#7a5a3a', density: 1.0,
    },
    arbol_t_19: {
        id: 'arbol_t_19', label: 'Arbol T-19', speciesName: 'A_CEREZO',
        archetype: 'multi_lobed',
        height: 7.0,  crownRadius: 3.0, trunkRadius: 0.18,
        foliageColor: '#94b86b', accentColor: '#bdd29a',
        trunkColor: '#5a4030', density: 1.0,
    },
    arbol_t_20: {
        id: 'arbol_t_20', label: 'Arbol T-20', speciesName: 'A_SANGRE DE GRADO',
        archetype: 'round_dotted',
        height: 9.0,  crownRadius: 3.2, trunkRadius: 0.20,
        foliageColor: '#8db35a', trunkColor: '#5a3826', density: 1.0,
    },
    arbol_t_21: {
        id: 'arbol_t_21', label: 'Arbol T-21', speciesName: 'A_JACARANDA',
        archetype: 'flowering',
        height: 10.0, crownRadius: 3.6, trunkRadius: 0.22,
        foliageColor: '#9ab368', accentColor: '#7a64b4',
        trunkColor: '#4a3826', density: 1.0,
    },
    arbol_t_22: {
        id: 'arbol_t_22', label: 'Arbol T-22', speciesName: 'A_PINO CANDELABRO',
        archetype: 'conifer_starburst',
        height: 12.0, crownRadius: 2.4, trunkRadius: 0.20,
        foliageColor: '#5b8a4f', trunkColor: '#5a3826', density: 1.2,
    },
    arbol_t_23: {
        id: 'arbol_t_23', label: 'Arbol T-23', speciesName: 'A_PALMA CUBANA',
        archetype: 'palm',
        height: 14.0, crownRadius: 2.6, trunkRadius: 0.18,
        foliageColor: '#7aa44a', trunkColor: '#7a5a3a', density: 1.2,
    },
    arbol_t_24: {
        id: 'arbol_t_24', label: 'Arbol T-24', speciesName: 'A_FICUS ORNAMENTAL',
        archetype: 'round_dotted',
        height: 8.0,  crownRadius: 3.0, trunkRadius: 0.18,
        foliageColor: '#94b86b', trunkColor: '#5a4030', density: 1.1,
    },
    arbol_t_25: {
        id: 'arbol_t_25', label: 'Arbol T-25', speciesName: 'A_SAUCE',
        archetype: 'round_dotted',
        height: 9.0,  crownRadius: 3.4, trunkRadius: 0.20,
        foliageColor: '#a8c47a', trunkColor: '#5a4030', density: 1.0,
    },
};

/** Ordered list of species ids — used for carousel registration. */
export const TREE_SPECIES_ORDER: ReadonlyArray<TreeSpeciesId> = [
    'arbol_t_01','arbol_t_02','arbol_t_03','arbol_t_04','arbol_t_05',
    'arbol_t_06','arbol_t_07','arbol_t_08','arbol_t_09','arbol_t_10',
    'arbol_t_11','arbol_t_12','arbol_t_13','arbol_t_14','arbol_t_15',
    'arbol_t_16','arbol_t_17','arbol_t_18','arbol_t_19','arbol_t_20',
    'arbol_t_21','arbol_t_22','arbol_t_23','arbol_t_24','arbol_t_25',
];

/** Returns true when the FurnitureType string is one of the parametric tree species. */
export function isTreeSpeciesId(t: string): t is TreeSpeciesId {
    return Object.prototype.hasOwnProperty.call(TREE_SPECIES_TABLE, t);
}
