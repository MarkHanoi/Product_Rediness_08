/**
 * @file BedFactory.ts
 *
 * Variant-preset registry for the parametric BedEngine.
 *
 * Maps the three Japanese bed FurnitureType strings
 * (`japanese_platform_bed`, `japanese_float_bed`, `japanese_walnut_bed`)
 * to fully-resolved BedEngineConfig objects, applying the catalogue's
 * default palette / proportions while still honouring per-instance overrides
 * coming from FurnitureData (width / length / height / colour).
 *
 * Pure data-mapping module — no THREE.js imports, no store mutation.
 * Compliant with 04-BIM §3.8 (builder-layer purity) and 03-BIM §1.1 (no `any`).
 */

import { BedEngineConfig, BedPalette, BedVariant } from '../engines/BedEngine';
import { FurnitureData } from '../FurnitureTypes';

// ──────────────────────────────────────────────────────────────────────────────
//  Variant string → engine variant
// ──────────────────────────────────────────────────────────────────────────────

const TYPE_TO_VARIANT: Readonly<Record<string, BedVariant>> = {
    japanese_platform_bed: 'platform',
    japanese_float_bed:    'float',
    japanese_walnut_bed:   'walnut',
    nordic_bed:            'nordic',
    solid_wood_bed:        'solid_wood',
};

export const JAPANESE_BED_TYPES = Object.keys(TYPE_TO_VARIANT);

export function variantForBedType(type: string): BedVariant | null {
    return TYPE_TO_VARIANT[type] ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
//  Variant defaults
// ──────────────────────────────────────────────────────────────────────────────

interface BedPreset {
    readonly variant: BedVariant;
    readonly defaultWidth:  number;
    readonly defaultLength: number;
    readonly defaultHeight: number;
    readonly palette: BedPalette;
}

const PRESETS: Readonly<Record<BedVariant, BedPreset>> = {
    platform: {
        variant: 'platform',
        defaultWidth:  2.00,
        defaultLength: 2.20,
        defaultHeight: 0.45,
        palette: {
            wood:     0xc8a878,   // light oak
            mattress: 0xf2ead7,   // cream
            sheet:    0xf7f4ec,   // off-white
            throw_:   0xc88a5a,   // warm terracotta
            pillow:   0xece4d2,
            accent:   0x6b4a2b,
        },
    },
    float: {
        variant: 'float',
        // Queen mattress (1.60 × 2.10) + 20 cm deck overhang on the sides
        // and foot end → 2.00 × 2.30 deck footprint.
        defaultWidth:  2.00,
        defaultLength: 2.30,
        defaultHeight: 0.45,
        palette: {
            wood:     0x6b3f25,   // warm medium-dark walnut (reference photo)
            mattress: 0xf2ead7,
            sheet:    0xfafafa,   // crisp white duvet
            throw_:   0x2c4773,   // (unused for float — kept for API parity)
            pillow:   0x3b5a8a,   // navy / dotted-blue pillow body
            accent:   0x14100c,   // deep shadow gap under floating deck
        },
    },
    nordic: {
        variant: 'nordic',
        // Queen mattress (1.60 × 2.10), thin walnut frame, 4 turned legs.
        // Total height ≈ leg + frame + mattress ≈ 0.18 + 0.10 + 0.22.
        defaultWidth:  1.80,
        defaultLength: 2.20,
        defaultHeight: 0.50,
        palette: {
            wood:     0x6b4023,   // warm walnut (mid-century / Scandinavian)
            mattress: 0xf5efde,
            sheet:    0xfafafa,   // crisp white sheet
            throw_:   0xc69773,   // camel / tan throw blanket
            pillow:   0xece4d2,   // warm off-white linen pillow
            accent:   0xb78a64,   // tan accent (camel pillow / stripes)
        },
    },
    solid_wood: {
        variant: 'solid_wood',
        // Queen mattress (1.55 × 2.05) inside a thin walnut rail frame on
        // four mid-century splayed legs.  Tall paneled headboard.
        defaultWidth:  1.75,
        defaultLength: 2.20,
        defaultHeight: 0.55,
        palette: {
            wood:     0x8a5a3a,   // warm mid-walnut
            mattress: 0xf5efde,
            sheet:    0xfafafa,   // crisp white quilted bedding
            throw_:   0xeeeae0,   // (unused — kept for API parity)
            pillow:   0xfafafa,   // white pillows
            accent:   0x5a3923,   // darker walnut accent (panel grooves)
        },
    },
    walnut: {
        variant: 'walnut',
        defaultWidth:  1.80,
        defaultLength: 2.00,
        defaultHeight: 0.50,
        palette: {
            wood:     0x4a2e1d,   // dark walnut
            mattress: 0xefe7d4,
            sheet:    0xf7f4ec,
            throw_:   0x8a4b2c,
            pillow:   0xe8e0cb,
            accent:   0x2a1a10,
        },
    },
};

// ──────────────────────────────────────────────────────────────────────────────
//  Public factory entry point
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Resolve a FurnitureData record into a BedEngineConfig for the given
 * bed variant.  Per-instance dimensions on FurnitureData win over preset
 * defaults; `data.color` (when supplied) overrides the preset wood tone.
 *
 * @throws Error  Hard-fails (07-BIM §7.2) if the variant is unknown — a
 *                misconfigured factory entry would otherwise silently produce
 *                an empty group.
 */
export function buildBedConfig(variant: BedVariant, data: FurnitureData): BedEngineConfig {
    const preset = PRESETS[variant];
    if (!preset) {
        throw new Error(`[BedFactory] Unknown bed variant '${variant}'`);
    }

    const width  = isPositive(data.width)  ? data.width  : preset.defaultWidth;
    const length = isPositive(data.length) ? data.length : preset.defaultLength;
    const height = isPositive(data.height) ? data.height : preset.defaultHeight;

    // data.color (if any) drives the wood tone; rest of palette is preserved
    const palette: BedPalette = data.color
        ? { ...preset.palette, wood: parseHexColor(data.color, preset.palette.wood) }
        : preset.palette;

    // Allow data.hasHeadboard to suppress the headboard explicitly
    const hasHeadboard = data.hasHeadboard ?? true;

    return {
        variant,
        width,
        length,
        height,
        hasHeadboard,
        palette,
        lo3: data.lo3,
    };
}

// ──────────────────────────────────────────────────────────────────────────────
//  Helpers
// ──────────────────────────────────────────────────────────────────────────────

function isPositive(n: number | undefined): n is number {
    return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

function parseHexColor(input: string, fallback: number): number {
    const cleaned = input.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(cleaned)) return fallback;
    return parseInt(cleaned, 16);
}
