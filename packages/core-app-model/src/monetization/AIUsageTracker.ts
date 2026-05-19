/**
 * AIUsageTracker — PRYZM Monetization Layer 1 (AI Usage)
 *
 * Tracks AI action consumption per billing period (calendar month) in localStorage.
 * Pure data layer — no UI, no DOM manipulation.
 *
 * Storage key pattern: bim-ai-usage-{userId}-{YYYY-MM}
 *
 * Contract compliance:
 *   §01 — No BIM engine access
 *   §05 — No CSS or DOM
 *   §06 — localStorage keys prefixed with bim-*
 */

const KEY_PREFIX = 'bim-ai-usage';

function currentPeriod(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
}

function storageKey(userId: string): string {
    return `${KEY_PREFIX}-${userId}-${currentPeriod()}`;
}

interface UsageRecord {
    count: number;
    period: string;
    lastUpdated: number;
}

class AIUsageTrackerImpl {

    /** Returns the number of AI actions used in the current billing period */
    getUsedThisPeriod(userId: string): number {
        try {
            const raw = localStorage.getItem(storageKey(userId));
            if (!raw) return 0;
            const record: UsageRecord = JSON.parse(raw);
            if (record.period !== currentPeriod()) return 0;
            return record.count || 0;
        } catch {
            return 0;
        }
    }

    /** Increments the AI usage count by 1 (call after a successful AI request) */
    increment(userId: string): void {
        try {
            const key = storageKey(userId);
            const current = this.getUsedThisPeriod(userId);
            const record: UsageRecord = {
                count: current + 1,
                period: currentPeriod(),
                lastUpdated: Date.now(),
            };
            // @project-isolation: per-user. `key` comes from storageKey(userId)
            // which interpolates the userId — never crosses user / project lines.
            localStorage.setItem(key, JSON.stringify(record));
        } catch {
            // Silently fail — tracking must never block user actions
        }
    }

    /** Resets usage for the current period (for testing / admin) */
    reset(userId: string): void {
        try {
            localStorage.removeItem(storageKey(userId));
        } catch { /* noop */ }
    }

    /** Returns usage summary for display */
    getSummary(userId: string, limitPerMonth: number): { used: number; limit: number; period: string } {
        return {
            used: this.getUsedThisPeriod(userId),
            limit: limitPerMonth,
            period: currentPeriod(),
        };
    }
}

export const AIUsageTracker = new AIUsageTrackerImpl();
