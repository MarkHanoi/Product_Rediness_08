/**
 * SemanticTagRegistry — Canonical vocabulary of semantic tags for BIM elements.
 *
 * Contract compliance:
 *   §03 §1.1  — Pure data module; no DOM, no Three.js, no store imports.
 *   §01 §2    — Tags are applied via TagElementCommand (command-first rule).
 *   §04       — AI may read the vocabulary; AI may not write tags directly.
 *
 * This file is intentionally import-free (zero dependencies).
 * It defines the controlled vocabulary that SemanticIndex and AI agents use.
 *
 * Categories:
 *   structural   — load path, material, fire resistance
 *   discipline   — design discipline assignment
 *   code         — regulatory and compliance classification
 *   phase        — construction timeline / phase
 *   analysis     — simulation and performance analysis flags
 *   custom       — project-specific user-defined tags (open-ended, not enumerated here)
 */

export type SemanticTagCategory =
    | 'structural'
    | 'discipline'
    | 'code'
    | 'phase'
    | 'analysis';

export interface SemanticTagDefinition {
    tag:         string;
    category:    SemanticTagCategory;
    description: string;
    appliesTo:   string[];    // Element types this tag is meaningful for ('*' = all)
}

export const SEMANTIC_TAG_DEFINITIONS: ReadonlyArray<SemanticTagDefinition> = [
    // ── Structural ───────────────────────────────────────────────────────────
    {
        tag: 'load-bearing',
        category: 'structural',
        description: 'Element carries vertical or lateral load.',
        appliesTo: ['wall', 'column', 'beam', 'slab', 'roof'],
    },
    {
        tag: 'non-structural',
        category: 'structural',
        description: 'Element is partitioning or cladding only; carries no structural load.',
        appliesTo: ['wall', 'curtain-wall', 'curtain-panel', 'slab'],
    },
    {
        tag: 'primary-structure',
        category: 'structural',
        description: 'Element is part of the primary structural frame.',
        appliesTo: ['column', 'beam', 'slab', 'wall'],
    },
    {
        tag: 'secondary-structure',
        category: 'structural',
        description: 'Element is part of a secondary structural system (e.g., purlins, secondary beams).',
        appliesTo: ['beam', 'slab'],
    },
    {
        tag: 'fire-rated',
        category: 'structural',
        description: 'Element has a certified fire-resistance rating.',
        appliesTo: ['wall', 'slab', 'column', 'beam', 'door'],
    },
    {
        tag: 'insulated',
        category: 'structural',
        description: 'Element contains thermal or acoustic insulation.',
        appliesTo: ['wall', 'slab', 'roof', 'curtain-wall'],
    },
    {
        tag: 'composite',
        category: 'structural',
        description: 'Element is a composite section (e.g., composite steel-concrete beam).',
        appliesTo: ['beam', 'slab', 'column'],
    },
    {
        tag: 'post-tensioned',
        category: 'structural',
        description: 'Element is post-tensioned concrete.',
        appliesTo: ['slab', 'beam'],
    },

    // ── Discipline ───────────────────────────────────────────────────────────
    {
        tag: 'architectural',
        category: 'discipline',
        description: 'Element is in the architectural discipline.',
        appliesTo: ['*'],
    },
    {
        tag: 'structural-discipline',
        category: 'discipline',
        description: 'Element is in the structural engineering discipline.',
        appliesTo: ['*'],
    },
    {
        tag: 'mep',
        category: 'discipline',
        description: 'Element is in the MEP (mechanical, electrical, plumbing) discipline.',
        appliesTo: ['plumbing', 'furniture'],
    },
    {
        tag: 'interior',
        category: 'discipline',
        description: 'Element is an interior design element.',
        appliesTo: ['wall', 'furniture', 'door', 'window', 'stair', 'handrail'],
    },
    {
        tag: 'exterior',
        category: 'discipline',
        description: 'Element is on the building exterior / envelope.',
        appliesTo: ['wall', 'curtain-wall', 'curtain-panel', 'window', 'door', 'roof'],
    },

    // ── Code / Regulatory ────────────────────────────────────────────────────
    {
        tag: 'egress',
        category: 'code',
        description: 'Element is on or forms part of a required egress route.',
        appliesTo: ['door', 'stair', 'handrail', 'wall', 'opening'],
    },
    {
        tag: 'accessible',
        category: 'code',
        description: 'Element meets accessibility requirements (ADA / Part M).',
        appliesTo: ['door', 'stair', 'handrail', 'plumbing', 'opening'],
    },
    {
        tag: 'historic',
        category: 'code',
        description: 'Element is part of a historically protected structure.',
        appliesTo: ['*'],
    },
    {
        tag: 'listed',
        category: 'code',
        description: 'Element is part of a listed building.',
        appliesTo: ['*'],
    },

    // ── Phase / Construction ─────────────────────────────────────────────────
    {
        tag: 'existing',
        category: 'phase',
        description: 'Element existed before current project scope.',
        appliesTo: ['*'],
    },
    {
        tag: 'new-construction',
        category: 'phase',
        description: 'Element is new work within the current project.',
        appliesTo: ['*'],
    },
    {
        tag: 'demolition',
        category: 'phase',
        description: 'Element is scheduled for demolition.',
        appliesTo: ['*'],
    },
    {
        tag: 'temporary',
        category: 'phase',
        description: 'Element is a temporary installation (formwork, hoarding, shoring).',
        appliesTo: ['*'],
    },

    // ── Analysis / Performance ───────────────────────────────────────────────
    {
        tag: 'clash-flag',
        category: 'analysis',
        description: 'Element has an unresolved clash detection conflict.',
        appliesTo: ['*'],
    },
    {
        tag: 'thermal-envelope',
        category: 'analysis',
        description: 'Element forms part of the building thermal envelope.',
        appliesTo: ['wall', 'roof', 'slab', 'window', 'door', 'curtain-wall', 'curtain-panel'],
    },
    {
        tag: 'acoustic-separation',
        category: 'analysis',
        description: 'Element is required to provide acoustic separation.',
        appliesTo: ['wall', 'slab', 'door'],
    },
    {
        tag: 'review-required',
        category: 'analysis',
        description: 'Element requires human review before coordination.',
        appliesTo: ['*'],
    },
    {
        tag: 'design-intent',
        category: 'analysis',
        description: 'Element is a design intent placeholder awaiting detailed design.',
        appliesTo: ['*'],
    },
];

const _tagMap = new Map<string, SemanticTagDefinition>();
for (const def of SEMANTIC_TAG_DEFINITIONS) {
    _tagMap.set(def.tag, def);
}

export const SEMANTIC_TAGS: ReadonlyArray<string> =
    SEMANTIC_TAG_DEFINITIONS.map(d => d.tag);

export const SEMANTIC_TAGS_BY_CATEGORY: Readonly<Record<SemanticTagCategory, string[]>> = (() => {
    const grouped: Record<string, string[]> = {};
    for (const def of SEMANTIC_TAG_DEFINITIONS) {
        if (!grouped[def.category]) grouped[def.category] = [];
        grouped[def.category]!.push(def.tag);
    }
    return grouped as Record<SemanticTagCategory, string[]>;
})();

export function isRecognizedTag(tag: string): boolean {
    return _tagMap.has(tag);
}

export function getTagDefinition(tag: string): SemanticTagDefinition | undefined {
    return _tagMap.get(tag);
}

export function getTagCategory(tag: string): SemanticTagCategory | undefined {
    return _tagMap.get(tag)?.category;
}

export function getTagsForElementType(elementType: string): string[] {
    return SEMANTIC_TAG_DEFINITIONS
        .filter(d => d.appliesTo.includes('*') || d.appliesTo.includes(elementType))
        .map(d => d.tag);
}
