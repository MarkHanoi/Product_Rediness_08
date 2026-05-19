/**
 * @file server/planStore.js
 * @description Server-side plan authority for PRYZM.
 *
 * CONTRACT (07-BIM-SECURITY-CONTRACT §C4):
 *  - This module is the ONLY authoritative source of a user's plan on the server.
 *  - Client-reported plan values (e.g. from localStorage) MUST NOT be trusted.
 *  - Plans are set exclusively via verified Stripe webhook events (§4).
 *  - When Supabase is configured, plans are persisted to the `user_plans` table.
 *  - When Supabase is NOT configured but Replit PG IS configured, plans are
 *    persisted to PG's `user_plans` table (this is the current active path).
 *  - Without any DB, plans are held in-memory (reset on server restart).
 *  - All AI proxy calls MUST pass through enforceAIQuota() before forwarding.
 *
 * Persistence strategy:
 *  - maybeAutoGrantOwner() is called on every authenticated request.
 *  - _loadFromDb() pre-loads the user's plan from DB into the in-memory
 *    cache on first access (idempotent via _loadedSet).
 *  - All synchronous reads (getUserPlan, enforceAIQuota) operate on the in-memory
 *    cache — no async latency on the hot path.
 *  - All writes fire-and-forget to DB in the background.
 *
 * CDE Phase 1 additions:
 *  - 'owner' tier with Infinity limits for all quotas
 *  - PRYZM_OWNER_EMAIL bypass: any user authenticating with the owner email
 *    is automatically granted 'owner' plan via maybeAutoGrantOwner()
 */

'use strict';

import { getSupabaseClient } from './supabaseClient.js';

// ── Plan tiers and their server-side AI limits ────────────────────────────────
const PLAN_AI_LIMITS = {
    free:       5,
    architect:  100,
    studio:     500,
    firm:       2000,
    enterprise: Infinity,
    owner:      Infinity,   // CDE Phase 1: super-owner tier
};

// ── In-memory stores (source of truth for sync reads; backed by DB when configured) ─
// Map<userId, { plan: string, aiCallsThisPeriod: number, periodStart: Date }>
const _userPlans = new Map();

// Tracks which userIds have had their record loaded from DB into memory.
// Prevents redundant DB reads on every request.
const _loadedSet = new Set();

// ── Period reset helper ───────────────────────────────────────────────────────

function _resetPeriodIfNeeded(record) {
    const now = new Date();
    const start = new Date(record.periodStart);
    const sameMonth =
        now.getFullYear() === start.getFullYear() &&
        now.getMonth() === start.getMonth();
    if (!sameMonth) {
        record.aiCallsThisPeriod = 0;
        record.periodStart = now;
    }
}

function _getRecord(userId) {
    if (!_userPlans.has(userId)) {
        _userPlans.set(userId, {
            plan: 'free',
            aiCallsThisPeriod: 0,
            periodStart: new Date(),
        });
    }
    const record = _userPlans.get(userId);
    _resetPeriodIfNeeded(record);
    return record;
}

// ── DB row → in-memory helper ─────────────────────────────────────────────────

function _applyDbRow(userId, row) {
    const now = new Date();
    const periodStart = new Date(row.period_start ?? row.created_at ?? now);
    const sameMonth =
        now.getFullYear() === periodStart.getFullYear() &&
        now.getMonth() === periodStart.getMonth();

    const aiCalls = sameMonth ? (row.ai_calls_this_period ?? 0) : 0;

    _userPlans.set(userId, {
        plan: row.plan ?? 'free',
        aiCallsThisPeriod: aiCalls,
        periodStart: sameMonth ? periodStart : now,
    });

    console.log(`[planStore] Loaded plan for ${userId}: ${row.plan} (${aiCalls} AI calls this period)`);
}

// ── Supabase persistence helpers ──────────────────────────────────────────────

async function _loadFromSupabase(userId, sb) {
    try {
        const { data, error } = await sb
            .from('user_plans')
            .select('plan, ai_calls_this_period, period_start')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            console.warn(`[planStore] Supabase load failed for ${userId}:`, error.message);
            return false;
        }

        if (!data) return false; // No record yet — defaults apply

        _applyDbRow(userId, data);
        return true;
    } catch (err) {
        console.error('[planStore] Unexpected error loading from Supabase:', err.message);
        return false;
    }
}

async function _persistToSupabase(userId, record, sb) {
    try {
        const { error } = await sb.from('user_plans').upsert({
            user_id: userId,
            plan: record.plan,
            ai_calls_this_period: record.aiCallsThisPeriod,
            period_start: record.periodStart instanceof Date
                ? record.periodStart.toISOString()
                : record.periodStart,
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        if (error) {
            console.warn(`[planStore] Supabase persist failed for ${userId}:`, error.message);
        }
    } catch (err) {
        console.error('[planStore] Unexpected error persisting to Supabase:', err.message);
    }
}

// ── Replit PG persistence helpers ─────────────────────────────────────────────
// Used as the primary persistence backend when Supabase is not configured.
// Loads plan records from the user_plans table written by authStore.js.

async function _loadFromPg(userId) {
    try {
        const { getPgPool } = await import('./pgClient.js');
        const pool = getPgPool();
        if (!pool) return false;

        const result = await pool.query(
            `SELECT plan, ai_calls_this_period, period_start
             FROM user_plans WHERE user_id = $1 LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            // No user_plans row yet — check pryzm_users as fallback
            const userResult = await pool.query(
                `SELECT plan FROM pryzm_users WHERE id = $1 LIMIT 1`,
                [userId]
            );
            if (userResult.rows.length === 0) return false;

            const plan = userResult.rows[0].plan ?? 'free';
            _userPlans.set(userId, {
                plan,
                aiCallsThisPeriod: 0,
                periodStart: new Date(),
            });
            console.log(`[planStore] Loaded plan for ${userId} from pryzm_users: ${plan}`);
            return true;
        }

        _applyDbRow(userId, result.rows[0]);
        return true;
    } catch (err) {
        console.error('[planStore] Unexpected error loading from PG:', err.message);
        return false;
    }
}

async function _persistToPg(userId, record) {
    try {
        const { getPgPool } = await import('./pgClient.js');
        const pool = getPgPool();
        if (!pool) return;

        await pool.query(
            `INSERT INTO user_plans (user_id, plan, plan_status, ai_calls_this_period, period_start, updated_at)
             VALUES ($1, $2, 'active', $3, $4, NOW())
             ON CONFLICT (user_id) DO UPDATE
             SET plan                  = EXCLUDED.plan,
                 ai_calls_this_period  = EXCLUDED.ai_calls_this_period,
                 period_start          = EXCLUDED.period_start,
                 updated_at            = NOW()`,
            [
                userId,
                record.plan,
                record.aiCallsThisPeriod,
                record.periodStart instanceof Date
                    ? record.periodStart.toISOString()
                    : record.periodStart,
            ]
        );
    } catch (err) {
        console.error('[planStore] Unexpected error persisting to PG:', err.message);
    }
}

// ── Unified load / persist (picks Supabase or PG automatically) ────────────────

/**
 * Loads a user's plan record from the configured DB into the in-memory cache.
 * Tries Supabase first; falls back to Replit PG.
 * No-op if already loaded — idempotent via _loadedSet.
 */
async function _loadFromDb(userId) {
    if (_loadedSet.has(userId)) return;

    // Mark as attempted immediately to prevent concurrent duplicate loads.
    _loadedSet.add(userId);

    const sb = await getSupabaseClient();
    if (sb) {
        await _loadFromSupabase(userId, sb);
        return;
    }

    // Supabase not configured — try Replit PG
    await _loadFromPg(userId);
}

/**
 * Persists a user's current in-memory record to the configured DB.
 * Fire-and-forget — call without await from synchronous quota paths.
 */
async function _persistToDb(userId, record) {
    const sb = await getSupabaseClient();
    if (sb) {
        await _persistToSupabase(userId, record, sb);
        return;
    }

    await _persistToPg(userId, record);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the server-authoritative plan for a user.
 * Reads from in-memory cache — always synchronous after maybeAutoGrantOwner() pre-load.
 * Defaults to 'free' for unknown or anonymous users.
 */
export function getUserPlan(userId) {
    if (!userId || userId === 'anonymous') return 'free';
    return _getRecord(userId).plan;
}

/**
 * CDE Phase 1: If the given email matches PRYZM_OWNER_EMAIL, automatically
 * elevate the userId to the 'owner' plan.
 *
 * This function is async because it pre-loads the user's plan from the DB
 * into the in-memory cache (for ALL authenticated users, not just the owner).
 * It is called in authMiddleware (which is already async) and MUST be awaited
 * there so the cache is populated before any synchronous reads downstream.
 *
 * Safe to call on every request — the DB load is idempotent.
 *
 * @param {string} userId
 * @param {string | null} email
 */
export async function maybeAutoGrantOwner(userId, email) {
    if (!userId || userId === 'anonymous') return;

    // Pre-load plan from DB into in-memory cache (no-op if already loaded).
    // This ensures getUserPlan(), enforceAIQuota() etc. see the persisted plan.
    await _loadFromDb(userId);

    const ownerEmail = process.env.PRYZM_OWNER_EMAIL;
    if (!ownerEmail || !email) return;
    if (email.toLowerCase().trim() !== ownerEmail.toLowerCase().trim()) return;

    const record = _getRecord(userId);
    if (record.plan !== 'owner') {
        record.plan = 'owner';
        console.log(`[planStore] Owner email matched — elevated ${userId} to 'owner' plan`);
        _persistToDb(userId, record).catch(err =>
            console.error('[planStore] persist error after owner grant:', err.message));
    }
}

/**
 * Sets a user's plan. Should only be called from the verified Stripe
 * webhook handler or the owner-only admin endpoint. Never expose this
 * via a user-facing API endpoint.
 *
 * Writes synchronously to in-memory cache and fire-and-forgets to DB.
 */
export function setUserPlan(userId, plan) {
    if (!userId || userId === 'anonymous') return;
    const validPlans = Object.keys(PLAN_AI_LIMITS);
    if (!validPlans.includes(plan)) {
        console.warn(`[planStore] Attempted to set unknown plan "${plan}" for ${userId}`);
        return;
    }
    const record = _getRecord(userId);
    const previous = record.plan;
    record.plan = plan;
    console.log(`[planStore] Plan updated: ${userId} ${previous} → ${plan}`);

    _persistToDb(userId, record).catch(err =>
        console.error('[planStore] persist error after setUserPlan:', err.message));
}

/**
 * Checks whether a user has AI quota remaining and, if so, increments their
 * counter. Returns { allowed: boolean, remaining: number, limit: number }.
 *
 * This is the server-side enforcement gate (§C4 / §6.2).
 * Caller must abort the AI proxy request when allowed === false.
 *
 * Synchronous — reads from in-memory cache pre-populated by maybeAutoGrantOwner().
 * Writes the incremented counter to DB fire-and-forget (no latency on hot path).
 *
 * CDE Phase 1: 'owner' plan has Infinity limit — always allowed.
 */
export function enforceAIQuota(userId) {
    const effectiveId = userId && userId !== 'anonymous' ? userId : 'anonymous';
    const record = effectiveId === 'anonymous'
        ? (() => {
            if (!_userPlans.has('anonymous')) {
                _userPlans.set('anonymous', { plan: 'free', aiCallsThisPeriod: 0, periodStart: new Date() });
            }
            const r = _userPlans.get('anonymous');
            _resetPeriodIfNeeded(r);
            return r;
        })()
        : _getRecord(effectiveId);

    const limit = PLAN_AI_LIMITS[record.plan] ?? PLAN_AI_LIMITS.free;

    // CDE Phase 1: owner plan is always allowed regardless of count
    if (record.plan === 'owner') {
        record.aiCallsThisPeriod += 1;
        if (effectiveId !== 'anonymous') {
            _persistToDb(effectiveId, record).catch(err =>
                console.error('[planStore] persist error after quota increment:', err.message));
        }
        return { allowed: true, remaining: Infinity, limit: Infinity, plan: record.plan };
    }

    const remaining = Math.max(0, limit - record.aiCallsThisPeriod);

    if (record.aiCallsThisPeriod >= limit) {
        return { allowed: false, remaining: 0, limit, plan: record.plan };
    }

    record.aiCallsThisPeriod += 1;

    // Persist incremented counter to DB — fire-and-forget (no await)
    if (effectiveId !== 'anonymous') {
        _persistToDb(effectiveId, record).catch(err =>
            console.error('[planStore] persist error after quota increment:', err.message));
    }

    return { allowed: true, remaining: remaining - 1, limit, plan: record.plan };
}

/**
 * Returns current AI usage stats for a user (read-only, no increment).
 */
export function getAIUsageStats(userId) {
    const effectiveId = userId && userId !== 'anonymous' ? userId : 'anonymous';
    const record = _getRecord(effectiveId);
    const limit = PLAN_AI_LIMITS[record.plan] ?? PLAN_AI_LIMITS.free;
    return {
        plan: record.plan,
        aiCallsThisPeriod: record.aiCallsThisPeriod,
        limit,
        remaining: record.plan === 'owner' ? Infinity : Math.max(0, limit - record.aiCallsThisPeriod),
        periodStart: record.periodStart,
    };
}
