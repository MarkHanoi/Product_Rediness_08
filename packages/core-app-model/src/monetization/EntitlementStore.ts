/**
 * EntitlementStore — PRYZM Monetization Layer 2
 *
 * The single source of truth for what a user can do right now.
 * Reads from localStorage (PlatformUser.plan) and AIUsageTracker.
 * Exposes pure computed properties — no UI, no DOM, no side effects.
 *
 * Phase 4 addition:
 *   fetchPlanFromServer() — TTL-cached (5 min) call to GET /api/me/plan.
 *   When successful, persists the server-authoritative plan back to
 *   localStorage so all subsequent local checks stay consistent.
 *   Callers that do not await this method continue to use the local plan.
 *
 * Contract compliance:
 *   §01 — No BIM engine access
 *   §05 — No CSS or DOM
 *   §06 — No platform UI imports (reads localStorage directly via AuthModal exported fn)
 */

import {
    Plan,
    PlanStatus,
    Feature,
    PLAN_LIMITS,
    FEATURE_REQUIRED_PLAN,
    isPlanAtLeast,
    suggestedUpgradePlan,
} from './PlanConfig';
import { apiFetch } from '../apiFetch.js';;
import { AIUsageTracker } from './AIUsageTracker';

// ── User plan shape (matches extended PlatformUser) ───────────────────────────

interface UserPlanContext {
    plan: Plan;
    planStatus: PlanStatus;
}

const AUTH_STORAGE_KEY = 'bim-platform-user';

function loadUserPlanContext(): UserPlanContext {
    try {
        const raw = localStorage.getItem(AUTH_STORAGE_KEY);
        if (!raw) return { plan: 'free', planStatus: 'active' };
        const parsed = JSON.parse(raw);
        return {
            plan: (parsed.plan as Plan) || 'free',
            planStatus: (parsed.planStatus as PlanStatus) || 'active',
        };
    } catch {
        return { plan: 'free', planStatus: 'active' };
    }
}

// ── Phase 4 — Server plan cache ───────────────────────────────────────────────

/** Cache entry written by fetchPlanFromServer(). */
interface PlanCache {
    plan: Plan;
    planStatus: PlanStatus;
    fetchedAt: number;
}

/** In-memory cache so tab switches do not re-fetch within the TTL. */
let _planCache: PlanCache | null = null;
const PLAN_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── EntitlementStore (singleton) ──────────────────────────────────────────────

class EntitlementStoreImpl {

    // ── Plan access ───────────────────────────────────────────────────────────

    getUserPlan(): Plan {
        return loadUserPlanContext().plan;
    }

    getPlanStatus(): PlanStatus {
        return loadUserPlanContext().planStatus;
    }

    isActive(): boolean {
        const status = this.getPlanStatus();
        return status === 'active' || status === 'trialing';
    }

    // ── Project limits ────────────────────────────────────────────────────────

    getMaxProjects(): number {
        return PLAN_LIMITS[this.getUserPlan()].maxProjects;
    }

    canCreateProject(currentProjectCount: number): boolean {
        const max = this.getMaxProjects();
        if (max === -1) return true;
        return currentProjectCount < max;
    }

    // ── Version limits ────────────────────────────────────────────────────────

    getMaxVersions(): number {
        return PLAN_LIMITS[this.getUserPlan()].maxVersionsPerProject;
    }

    canSaveVersion(currentVersionCount: number): boolean {
        const max = this.getMaxVersions();
        if (max === -1) return true;
        if (max === 0) return false;
        return currentVersionCount < max;
    }

    hasVersionHistory(): boolean {
        return PLAN_LIMITS[this.getUserPlan()].hasVersionHistory;
    }

    // ── AI limits ─────────────────────────────────────────────────────────────

    getAIActionsLimit(): number {
        return PLAN_LIMITS[this.getUserPlan()].aiActionsPerMonth;
    }

    getAIActionsUsed(): number {
        const user = this.getUserId();
        return AIUsageTracker.getUsedThisPeriod(user);
    }

    getAIActionsRemaining(): number {
        const limit = this.getAIActionsLimit();
        if (limit === -1) return Infinity;
        return Math.max(0, limit - this.getAIActionsUsed());
    }

    canUseAI(): boolean {
        return this.getAIActionsRemaining() > 0;
    }

    canUseAllAITools(): boolean {
        return PLAN_LIMITS[this.getUserPlan()].hasAllAITools;
    }

    // ── Export limits ─────────────────────────────────────────────────────────

    canExportIFC(): boolean {
        return PLAN_LIMITS[this.getUserPlan()].hasIFCExport;
    }

    canExportGLB(): boolean {
        return PLAN_LIMITS[this.getUserPlan()].hasGLBExport;
    }

    canExportPDF(): boolean {
        return PLAN_LIMITS[this.getUserPlan()].hasPDFExport;
    }

    // ── Geospatial ────────────────────────────────────────────────────────────

    canUseCesium(): boolean {
        return PLAN_LIMITS[this.getUserPlan()].hasCesium;
    }

    // ── Collaboration ─────────────────────────────────────────────────────────

    canInviteMembers(): boolean {
        return PLAN_LIMITS[this.getUserPlan()].hasCollaboration;
    }

    getMaxSeats(): number {
        return PLAN_LIMITS[this.getUserPlan()].maxSeats;
    }

    // ── Gate checks ───────────────────────────────────────────────────────────

    /** Returns true when the user does NOT have access to the feature */
    needsUpgrade(feature: Feature): boolean {
        const plan = this.getUserPlan();
        const required = FEATURE_REQUIRED_PLAN[feature];
        if (!isPlanAtLeast(plan, required)) return true;

        // Special case: AI_ACTIONS — plan is sufficient but quota may be exhausted
        if (feature === Feature.AI_ACTIONS || feature === Feature.AI_ELEMENT_CREATOR ||
            feature === Feature.AI_FLOOR_PLAN || feature === Feature.AI_WARDROBE ||
            feature === Feature.AI_DESIGN_ADVISOR) {
            return !this.canUseAI();
        }

        return false;
    }

    suggestedPlan(feature: Feature): Plan {
        return suggestedUpgradePlan(this.getUserPlan(), feature);
    }

    // ── Phase 4 — Server plan synchronisation ────────────────────────────────

    /**
     * Fetches the authenticated user's plan from GET /api/me/plan and
     * persists it to localStorage so all subsequent local plan checks reflect
     * the server-authoritative value.
     *
     * Results are cached in-memory for PLAN_CACHE_TTL_MS (5 minutes) to
     * prevent a stampede of requests when multiple components mount quickly.
     *
     * Silently no-ops when:
     *   • The cache is still fresh.
     *   • The user is not authenticated (no auth token available).
     *   • The network request fails (local plan remains unchanged).
     *
     * Usage:
     *   Call fire-and-forget at app boot after the user is signed in:
     *   EntitlementStore.fetchPlanFromServer().catch(() => {});
     */
    async fetchPlanFromServer(): Promise<void> {
        if (_planCache && Date.now() - _planCache.fetchedAt < PLAN_CACHE_TTL_MS) {
            return;
        }

        try {
            const res = await apiFetch('/api/me/plan');
            if (!res.ok) {
                console.warn(`[EntitlementStore] /api/me/plan returned ${res.status} — local plan unchanged`);
                return;
            }

            const body = await res.json() as { plan?: string; planStatus?: string };
            const plan = (body.plan as Plan) || 'free';
            const planStatus = (body.planStatus as PlanStatus) || 'active';

            _planCache = { plan, planStatus, fetchedAt: Date.now() };

            const raw = localStorage.getItem(AUTH_STORAGE_KEY);
            const existing = raw ? JSON.parse(raw) : {};
            localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
                ...existing,
                plan,
                planStatus,
            }));

            console.log(`[EntitlementStore] Plan synced from server: ${plan} (${planStatus})`);
        } catch (err) {
            console.warn('[EntitlementStore] fetchPlanFromServer failed — local plan unchanged:', err);
        }
    }

    /**
     * Invalidate the in-memory plan cache (e.g. after a successful purchase
     * webhook is received so the next call gets a fresh server value).
     */
    invalidatePlanCache(): void {
        _planCache = null;
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private getUserId(): string {
        try {
            const raw = localStorage.getItem(AUTH_STORAGE_KEY);
            if (!raw) return 'anonymous';
            return JSON.parse(raw).id || 'anonymous';
        } catch {
            return 'anonymous';
        }
    }
}

export const EntitlementStore = new EntitlementStoreImpl();
