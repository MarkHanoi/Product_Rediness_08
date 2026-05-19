/**
 * server/stripeMiddleware.js
 * Middleware factory to protect premium routes based on the user's server-side plan.
 *
 * Usage:
 *   import { requirePlan } from './stripeMiddleware.js';
 *
 *   // Only Architect and above:
 *   app.get('/api/premium/export', authMiddleware, requirePlan('architect'), handler);
 *
 *   // Only Studio and above:
 *   app.get('/api/premium/collab', authMiddleware, requirePlan('studio'), handler);
 *
 * Plan hierarchy (low → high):
 *   free → architect → studio → firm → enterprise → owner
 *
 * Contract: §07-BIM-SECURITY-CONTRACT §4 — plan checked server-side via planStore.
 * NEVER check the plan client-side and rely on it for access control.
 */

'use strict';

import { getUserPlan } from './planStore.js';

const PLAN_ORDER = ['free', 'architect', 'studio', 'firm', 'enterprise', 'owner'];

/**
 * Returns true if `userPlan` meets or exceeds `requiredPlan`.
 * 'owner' always passes.
 */
function isPlanSufficient(userPlan, requiredPlan) {
    if (userPlan === 'owner') return true;
    const userIdx = PLAN_ORDER.indexOf(userPlan);
    const reqIdx  = PLAN_ORDER.indexOf(requiredPlan === 'owner' ? 'enterprise' : requiredPlan);
    return userIdx >= reqIdx;
}

/**
 * Middleware factory — returns an Express middleware that rejects requests
 * from users whose plan is below `minPlan`.
 *
 * @param {string} minPlan — minimum plan required ('architect'|'studio'|'firm'|'enterprise')
 * @returns {function} Express middleware
 */
export function requirePlan(minPlan) {
    return function planGate(req, res, next) {
        const userId   = req.auth?.userId ?? 'anonymous';
        const userPlan = getUserPlan(userId);

        if (isPlanSufficient(userPlan, minPlan)) {
            return next();
        }

        // Plan is insufficient — return 403 with upgrade hint
        const planLabel = minPlan.charAt(0).toUpperCase() + minPlan.slice(1);
        res.status(403).json({
            error:    `This feature requires the ${planLabel} plan or higher.`,
            required: minPlan,
            current:  userPlan,
            upgradeUrl: '/pricing',
        });
    };
}

/**
 * Middleware that requires any paid plan (architect or above).
 * Convenience shortcut for requirePlan('architect').
 */
export const requirePaidPlan = requirePlan('architect');
