/**
 * @file src/core/rendering/ExportQualityPresets.ts
 * @description Export quality preset table used by ExportStudioPanel.
 *
 * CONTRACT (01-BIM-ENGINE-CORE-CONTRACT §4.3):
 *  - Pure data module — no side effects, no store mutations.
 *  - Imported read-only by ExportStudioPanel and any future batch-render logic.
 *
 * Three tiers (Option A mapping from RENDER-SIMPLIFICATION-FEASIBILITY.md §5.1):
 *  - Draft          : 50 spl / 1080p  / standard quality / ~5–15 sec
 *  - Architectural  : 600 spl / 4K    / ultra quality    / ~1–5 min
 *  - Photorealistic : 1500 spl / 4K   / ultra + path tracer / ~5–20 min
 */

export interface ExportQualityPreset {
    id:               'draft' | 'architectural' | 'photorealistic';
    label:            string;
    description:      string;
    icon:             string;
    samples:          number;
    sampleRange:      [number, number];
    width:            number;
    height:           number;
    usePathTracer:    boolean;
    enhancementLevel: 'standard' | 'high' | 'ultra';
    estimatedTime:    string;
    resolutionLabel:  string;
}

export const EXPORT_QUALITY_PRESETS: ReadonlyArray<ExportQualityPreset> = [
    {
        id:               'draft',
        label:            'Draft',
        description:      'Quick preview for design review',
        icon:             '⚡',
        samples:          50,
        sampleRange:      [50, 50],
        width:            1920,
        height:           1080,
        usePathTracer:    false,
        enhancementLevel: 'standard',
        estimatedTime:    '~5–15 sec',
        resolutionLabel:  '1080p',
    },
    {
        id:               'architectural',
        label:            'Architectural',
        description:      'Balanced quality for client presentations',
        icon:             '🏛',
        samples:          600,
        sampleRange:      [200, 1000],
        width:            3840,
        height:           2160,
        usePathTracer:    false,
        enhancementLevel: 'ultra',
        estimatedTime:    '~1–5 min',
        resolutionLabel:  '4K',
    },
    {
        id:               'photorealistic',
        label:            'Photorealistic',
        description:      'Maximum quality — global illumination',
        icon:             '✨',
        samples:          1500,
        sampleRange:      [1000, 2000],
        width:            3840,
        height:           2160,
        usePathTracer:    true,
        enhancementLevel: 'ultra',
        estimatedTime:    '~5–20 min',
        resolutionLabel:  '4K',
    },
] as const;

export function getPresetById(id: string): ExportQualityPreset | undefined {
    return EXPORT_QUALITY_PRESETS.find(p => p.id === id);
}
