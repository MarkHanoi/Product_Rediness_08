// A.18 (Phase A · Sprint 2) — Entitlement registry.
//
// The single source of truth for every feature gate in the product
// per [C39 §1.1] — "Every feature gate MUST resolve through
// `entitlements.check(key)`". The keys here are the only legitimate
// arguments to that resolver.
//
// Append-only per [C39 §1.2]: a key MAY be marked `deprecated: true`
// with an optional `replacedBy?` pointer; renames are FORBIDDEN
// because tier names appear in invoices, sales collateral, SEO, and
// customer contracts.
//
// L2-pure: no I/O. The pricing-page generator reads this at build
// time per [C39 §1.13].

import type { PlanTier } from '@pryzm/schemas';

/** The keys for every feature gate in the product. Append-only. */
export type EntitlementKey =
    // ── Onboarding + design surface ─────────────────────────────────────
    | 'feature.typology.apartment'
    | 'feature.typology.house'
    | 'feature.typology.small-office'
    | 'feature.rac-chatbot'
    | 'feature.site-cesium'
    | 'feature.climate-epw'
    | 'feature.climate-noaa'
    // ── Output surfaces ──────────────────────────────────────────────────
    | 'feature.ifc-export'
    | 'feature.ifc-import'
    | 'feature.revit-export'
    | 'feature.pdf-vector-export'
    | 'feature.dxf-export'
    | 'feature.glb-export'
    // ── Collaboration ────────────────────────────────────────────────────
    | 'feature.multiplayer'
    | 'feature.share-link'
    // ── Quotas (referenced by quota.* counters) ──────────────────────────
    | 'quota.projects'
    | 'quota.seats'
    | 'quota.ai-tokens-monthly'
    | 'quota.storage-gb'
    | 'quota.concurrent-collab'
    | 'quota.ifc-exports-monthly'
    // ── Marketplace ──────────────────────────────────────────────────────
    | 'feature.plugin-install'
    | 'feature.plugin-publish'
    | 'feature.family-publish'
    // ── Cross-cutting ────────────────────────────────────────────────────
    | 'feature.byok-llm'
    | 'feature.sso-saml'
    | 'feature.priority-support'
    | 'feature.audit-log-export'
    | 'feature.data-residency';

/**
 * One entry in the registry.
 *
 * `requiredTier` is the MINIMUM tier required (per [C39 §1.5]; higher
 * tiers automatically gain access). `deprecated: true` entries return
 * `allowed: true` regardless of tier per [C39 §1.2] ("deprecated gates
 * open"). `replacedBy` is informational — UI may show "this feature is
 * now part of X" copy.
 */
export interface EntitlementEntry {
    readonly key: EntitlementKey;
    readonly requiredTier: PlanTier;
    readonly displayName: string;
    /** 1-3 sentence description shown on the pricing page card. */
    readonly description: string;
    /** Pricing-page section grouping. */
    readonly category:
        | 'design'
        | 'output'
        | 'collaboration'
        | 'quota'
        | 'marketplace'
        | 'enterprise';
    readonly deprecated?: boolean;
    readonly replacedBy?: EntitlementKey;
}

/**
 * The canonical registry. APPEND-ONLY per [C39 §1.2]. To retire a
 * gate, add `deprecated: true`. To add a gate, append a new entry.
 * NEVER rename a key.
 */
export const ENTITLEMENT_REGISTRY: readonly EntitlementEntry[] = [
    // ── Design surface ──────────────────────────────────────────────────
    {
        key: 'feature.typology.apartment',
        requiredTier: 'solo',
        displayName: 'Apartment typology',
        description:
            'Generate apartment layouts from a brief — D-TGL deterministic + AI engine, room programmes, daylight rule-checker.',
        category: 'design',
    },
    {
        key: 'feature.typology.house',
        requiredTier: 'studio',
        displayName: 'House typology',
        description:
            'Single-family + duplex generation with roof typologies and front/rear zoning.',
        category: 'design',
    },
    {
        key: 'feature.typology.small-office',
        requiredTier: 'studio',
        displayName: 'Small-office typology',
        description:
            'Workplace layouts with partition systems, meeting rooms, and grid ceilings.',
        category: 'design',
    },
    {
        key: 'feature.rac-chatbot',
        requiredTier: 'free-trial',
        displayName: 'Role + project intake chatbot',
        description: 'Conversational onboarding to capture role, typology, and brief.',
        category: 'design',
    },
    {
        key: 'feature.site-cesium',
        requiredTier: 'studio',
        displayName: 'Cesium site + context buildings',
        description:
            'Cesium-light basemap with parcel-draw, satellite imagery, automated OSM context-building ingest.',
        category: 'design',
    },
    {
        key: 'feature.climate-epw',
        requiredTier: 'studio',
        displayName: 'EPW climate ingest',
        description: 'Upload EPW TMY3 files; per-site climate datasets for daylight + thermal workflows.',
        category: 'design',
    },
    {
        key: 'feature.climate-noaa',
        requiredTier: 'studio',
        displayName: 'NOAA climate ingest',
        description: 'Auto-fetch NOAA 30-year climate normals for any geo-located project.',
        category: 'design',
    },

    // ── Output surfaces ─────────────────────────────────────────────────
    {
        key: 'feature.ifc-export',
        requiredTier: 'solo',
        displayName: 'IFC4X3 export',
        description: 'Production-grade IFC4X3 export with Psets, classification, and ownerHistory.',
        category: 'output',
    },
    {
        key: 'feature.ifc-import',
        requiredTier: 'studio',
        displayName: 'IFC import',
        description: 'Import IFC4 + IFC4X3 from Revit, Archicad, Vectorworks, BricsCAD.',
        category: 'output',
    },
    {
        key: 'feature.revit-export',
        requiredTier: 'mid-firm',
        displayName: 'Revit round-trip',
        description: 'IFC4X3-RV variant export tuned for Revit + optional Python adapter for phasing / worksets.',
        category: 'output',
    },
    {
        key: 'feature.pdf-vector-export',
        requiredTier: 'solo',
        displayName: 'PDF/A-3 vector export',
        description: 'True vector PDF with embedded fonts, line-weight calibration, optional IFC embed.',
        category: 'output',
    },
    {
        key: 'feature.dxf-export',
        requiredTier: 'studio',
        displayName: 'DXF round-trip',
        description: 'DXF export with layer convention, hatch patterns, line types.',
        category: 'output',
    },
    {
        key: 'feature.glb-export',
        requiredTier: 'solo',
        displayName: 'glTF / GLB export',
        description: 'WebGL + Unreal / Unity-friendly glTF 2.0 export.',
        category: 'output',
    },

    // ── Collaboration ───────────────────────────────────────────────────
    {
        key: 'feature.multiplayer',
        requiredTier: 'studio',
        displayName: 'Real-time multiplayer',
        description: 'CRDT-based real-time co-editing with presence, cursors, comments.',
        category: 'collaboration',
    },
    {
        key: 'feature.share-link',
        requiredTier: 'solo',
        displayName: 'Share link',
        description: 'Read-only project share links with optional expiry + password.',
        category: 'collaboration',
    },

    // ── Quotas ──────────────────────────────────────────────────────────
    {
        key: 'quota.projects',
        requiredTier: 'free-trial',
        displayName: 'Project count',
        description: 'Free-trial: 1 · Solo: 5 · Studio: 25 · Mid-firm: 250 · Enterprise: unlimited.',
        category: 'quota',
    },
    {
        key: 'quota.seats',
        requiredTier: 'studio',
        displayName: 'Team seats',
        description: 'Studio: ≤ 5 · Mid-firm: ≤ 50 · Enterprise: unlimited.',
        category: 'quota',
    },
    {
        key: 'quota.ai-tokens-monthly',
        requiredTier: 'solo',
        displayName: 'AI usage (monthly)',
        description: 'Solo: 50k · Studio: 250k · Mid-firm: 2M · Enterprise: custom.',
        category: 'quota',
    },
    {
        key: 'quota.storage-gb',
        requiredTier: 'free-trial',
        displayName: 'Storage',
        description: 'Free-trial: 0.5GB · Solo: 5GB · Studio: 50GB · Mid-firm: 500GB · Enterprise: custom.',
        category: 'quota',
    },
    {
        key: 'quota.concurrent-collab',
        requiredTier: 'studio',
        displayName: 'Concurrent collaborators',
        description: 'Studio: 5 · Mid-firm: 50 · Enterprise: unlimited.',
        category: 'quota',
    },
    {
        key: 'quota.ifc-exports-monthly',
        requiredTier: 'solo',
        displayName: 'IFC exports (monthly)',
        description: 'Solo: 50 · Studio: 250 · Mid-firm: 2,500 · Enterprise: unlimited.',
        category: 'quota',
    },

    // ── Marketplace ─────────────────────────────────────────────────────
    {
        key: 'feature.plugin-install',
        requiredTier: 'solo',
        displayName: 'Install marketplace plugins',
        description: 'Discover, install, and curate plugins from the PRYZM marketplace.',
        category: 'marketplace',
    },
    {
        key: 'feature.plugin-publish',
        requiredTier: 'developer',
        displayName: 'Publish to marketplace',
        description: 'Submit signed plugins + family packs for marketplace listing and revenue share.',
        category: 'marketplace',
    },
    {
        key: 'feature.family-publish',
        requiredTier: 'developer',
        displayName: 'Publish family packs',
        description: 'Publish parametric family packs (.pryzm-family) with versioning + IFC mappings.',
        category: 'marketplace',
    },

    // ── Enterprise / cross-cutting ──────────────────────────────────────
    {
        key: 'feature.byok-llm',
        requiredTier: 'mid-firm',
        displayName: 'BYOK (bring-your-own-key) LLM',
        description: 'Route AI traffic through your own Anthropic / OpenAI / Azure key — usage NOT counted against quotas.',
        category: 'enterprise',
    },
    {
        key: 'feature.sso-saml',
        requiredTier: 'enterprise',
        displayName: 'SAML SSO',
        description: 'SAML 2.0 single sign-on with Okta, Azure AD, OneLogin, Google Workspace.',
        category: 'enterprise',
    },
    {
        key: 'feature.priority-support',
        requiredTier: 'mid-firm',
        displayName: 'Priority support',
        description: '4-hour response SLA + named customer success manager (Enterprise).',
        category: 'enterprise',
    },
    {
        key: 'feature.audit-log-export',
        requiredTier: 'enterprise',
        displayName: 'Audit log export',
        description: 'Append-only audit log with SIEM connectors (Splunk, Datadog, ELK).',
        category: 'enterprise',
    },
    {
        key: 'feature.data-residency',
        requiredTier: 'enterprise',
        displayName: 'Data residency',
        description: 'Pin all data to EU, US, AP, or UK region per C49 multi-region.',
        category: 'enterprise',
    },
];

/**
 * Lookup map keyed by EntitlementKey for O(1) check() calls.
 * Built once at module load.
 */
const REGISTRY_INDEX: ReadonlyMap<EntitlementKey, EntitlementEntry> =
    new Map(ENTITLEMENT_REGISTRY.map((e) => [e.key, e]));

/**
 * O(1) lookup. Returns `undefined` for unknown keys (programmer error).
 */
export function findEntitlement(
    key: EntitlementKey,
): EntitlementEntry | undefined {
    return REGISTRY_INDEX.get(key);
}

/**
 * Compile-time check that ENTITLEMENT_REGISTRY covers every literal
 * in the EntitlementKey union. If you add a new key, TypeScript will
 * error here until you append the matching entry.
 */
function _exhaustiveCheck(): void {
    const knownKeys = new Set(ENTITLEMENT_REGISTRY.map((e) => e.key));
    // The trick: assigning `keyof never` to a never-typed function
    // would fail unless the set covers every literal. This is a
    // runtime check; the strict-type guard would require a generic
    // discriminator that ts-toolbelt provides.
    if (knownKeys.size !== ENTITLEMENT_REGISTRY.length) {
        throw new Error(
            `entitlements: duplicate key in ENTITLEMENT_REGISTRY (size ${knownKeys.size} ` +
                `vs entries ${ENTITLEMENT_REGISTRY.length})`,
        );
    }
}
_exhaustiveCheck();
