/**
 * PlanConfig — PRYZM Monetization Layer 1
 *
 * Single source of truth for plan definitions, feature limits, and pricing.
 * Pure data — no UI imports, no DOM access, no side effects.
 *
 * Contract compliance:
 *   §01 — No BIM engine access
 *   §05 — No CSS or DOM here
 *   §06 — No platform UI imports
 */

// ── Plan & Status types ───────────────────────────────────────────────────────

export type Plan = 'free' | 'architect' | 'studio' | 'firm' | 'enterprise' | 'owner';
export type PlanStatus = 'active' | 'trialing' | 'past_due' | 'cancelled';

// ── Feature enum ─────────────────────────────────────────────────────────────

export enum Feature {
    IFC_EXPORT           = 'IFC_EXPORT',
    GLB_EXPORT           = 'GLB_EXPORT',
    AI_DESIGN_ADVISOR    = 'AI_DESIGN_ADVISOR',
    AI_FLOOR_PLAN        = 'AI_FLOOR_PLAN',
    AI_ELEMENT_CREATOR   = 'AI_ELEMENT_CREATOR',
    AI_WARDROBE          = 'AI_WARDROBE',
    CESIUM_GIS           = 'CESIUM_GIS',
    COLLABORATION        = 'COLLABORATION',
    VERSION_HISTORY      = 'VERSION_HISTORY',
    UNLIMITED_PROJECTS   = 'UNLIMITED_PROJECTS',
    PDF_EXPORT           = 'PDF_EXPORT',
    ADDITIONAL_SEATS     = 'ADDITIONAL_SEATS',
    API_ACCESS           = 'API_ACCESS',
    SSO                  = 'SSO',
    AI_ACTIONS           = 'AI_ACTIONS',
}

// ── Plan limits ───────────────────────────────────────────────────────────────

export interface PlanLimits {
    maxProjects: number;           // -1 = unlimited
    aiActionsPerMonth: number;     // -1 = unlimited
    maxVersionsPerProject: number; // -1 = unlimited; 0 = none
    maxSeats: number;              // -1 = unlimited
    hasIFCExport: boolean;
    hasGLBExport: boolean;
    hasCesium: boolean;
    hasCollaboration: boolean;
    hasVersionHistory: boolean;
    hasAllAITools: boolean;
    hasPDFExport: boolean;
    hasAPIAccess: boolean;
    hasSSO: boolean;
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
    owner: {
        maxProjects: -1,
        aiActionsPerMonth: -1,
        maxVersionsPerProject: -1,
        maxSeats: -1,
        hasIFCExport: true,
        hasGLBExport: true,
        hasCesium: true,
        hasCollaboration: true,
        hasVersionHistory: true,
        hasAllAITools: true,
        hasPDFExport: true,
        hasAPIAccess: true,
        hasSSO: true,
    },
    free: {
        maxProjects: 3,
        aiActionsPerMonth: 5,
        maxVersionsPerProject: 1,
        maxSeats: 1,
        hasIFCExport: false,
        hasGLBExport: false,
        hasCesium: false,
        hasCollaboration: false,
        hasVersionHistory: true,
        hasAllAITools: false,
        hasPDFExport: false,
        hasAPIAccess: false,
        hasSSO: false,
    },
    architect: {
        maxProjects: -1,
        aiActionsPerMonth: 50,
        maxVersionsPerProject: 15,
        maxSeats: 1,
        hasIFCExport: true,
        hasGLBExport: true,
        hasCesium: true,
        hasCollaboration: false,
        hasVersionHistory: true,
        hasAllAITools: true,
        hasPDFExport: true,
        hasAPIAccess: false,
        hasSSO: false,
    },
    studio: {
        maxProjects: -1,
        aiActionsPerMonth: 200,
        maxVersionsPerProject: -1,
        maxSeats: 8,
        hasIFCExport: true,
        hasGLBExport: true,
        hasCesium: true,
        hasCollaboration: true,
        hasVersionHistory: true,
        hasAllAITools: true,
        hasPDFExport: true,
        hasAPIAccess: false,
        hasSSO: false,
    },
    firm: {
        maxProjects: -1,
        aiActionsPerMonth: 500,
        maxVersionsPerProject: -1,
        maxSeats: 25,
        hasIFCExport: true,
        hasGLBExport: true,
        hasCesium: true,
        hasCollaboration: true,
        hasVersionHistory: true,
        hasAllAITools: true,
        hasPDFExport: true,
        hasAPIAccess: true,
        hasSSO: true,
    },
    enterprise: {
        maxProjects: -1,
        aiActionsPerMonth: -1,
        maxVersionsPerProject: -1,
        maxSeats: -1,
        hasIFCExport: true,
        hasGLBExport: true,
        hasCesium: true,
        hasCollaboration: true,
        hasVersionHistory: true,
        hasAllAITools: true,
        hasPDFExport: true,
        hasAPIAccess: true,
        hasSSO: true,
    },
};

// ── Pricing data ──────────────────────────────────────────────────────────────

export interface PlanPricing {
    monthlyUSD: number | null;
    annualUSD: number | null;
    label: string;
    tagline: string;
    ctaLabel: string;
    highlighted: boolean;
}

export const PLAN_PRICING: Record<Plan, PlanPricing> = {
    owner: {
        monthlyUSD: null,
        annualUSD: null,
        label: 'Platform Owner',
        tagline: 'Super-owner — unlimited access to all features',
        ctaLabel: 'Owner',
        highlighted: false,
    },
    free: {
        monthlyUSD: 0,
        annualUSD: 0,
        label: 'Free Forever',
        tagline: 'For students and early evaluators',
        ctaLabel: 'Get started free',
        highlighted: false,
    },
    architect: {
        monthlyUSD: 59,
        annualUSD: 590,
        label: 'Architect',
        tagline: 'For solo practitioners and freelancers',
        ctaLabel: 'Start Architect',
        highlighted: false,
    },
    studio: {
        monthlyUSD: 149,
        annualUSD: 1490,
        label: 'Studio',
        tagline: 'For small architecture firms, up to 8 seats',
        ctaLabel: 'Start Studio',
        highlighted: true,
    },
    firm: {
        monthlyUSD: 349,
        annualUSD: 3490,
        label: 'Firm',
        tagline: 'For established firms, up to 25 seats',
        ctaLabel: 'Start Firm',
        highlighted: false,
    },
    enterprise: {
        monthlyUSD: null,
        annualUSD: null,
        label: 'Enterprise',
        tagline: 'Custom pricing · SaaS or bespoke deployment',
        ctaLabel: 'Contact sales',
        highlighted: false,
    },
};

// ── Feature → required plan mapping ──────────────────────────────────────────

export const FEATURE_REQUIRED_PLAN: Record<Feature, Plan> = {
    [Feature.AI_ACTIONS]:           'free',    // free gets 5, paid gets more
    [Feature.AI_DESIGN_ADVISOR]:    'free',    // Design Advisor teaser on free
    [Feature.AI_FLOOR_PLAN]:        'architect',
    [Feature.AI_ELEMENT_CREATOR]:   'architect',
    [Feature.AI_WARDROBE]:          'architect',
    [Feature.IFC_EXPORT]:           'architect',
    [Feature.GLB_EXPORT]:           'architect',
    [Feature.PDF_EXPORT]:           'architect',
    [Feature.CESIUM_GIS]:           'architect',
    [Feature.VERSION_HISTORY]:      'architect',
    [Feature.UNLIMITED_PROJECTS]:   'architect',
    [Feature.COLLABORATION]:        'studio',
    [Feature.ADDITIONAL_SEATS]:     'studio',
    [Feature.API_ACCESS]:           'firm',
    [Feature.SSO]:                  'firm',
};

const PLAN_ORDER: Plan[] = ['free', 'architect', 'studio', 'firm', 'enterprise', 'owner'];

export function isPlanAtLeast(userPlan: Plan, requiredPlan: Plan): boolean {
    // 'owner' supersedes every plan
    if (userPlan === 'owner') return true;
    const userIdx = PLAN_ORDER.indexOf(userPlan);
    const reqIdx = PLAN_ORDER.indexOf(requiredPlan === 'owner' ? 'enterprise' : requiredPlan);
    return userIdx >= reqIdx;
}

export function suggestedUpgradePlan(currentPlan: Plan, feature: Feature): Plan {
    const required = FEATURE_REQUIRED_PLAN[feature];
    if (isPlanAtLeast(currentPlan, required)) return currentPlan;
    return required;
}

export function getPlanDisplayName(plan: Plan): string {
    return PLAN_PRICING[plan].label;
}

export function formatPrice(usd: number | null): string {
    if (usd === null) return 'Custom';
    if (usd === 0) return 'Free';
    return `$${usd}`;
}
