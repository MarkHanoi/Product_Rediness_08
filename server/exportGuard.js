/**
 * @file server/exportGuard.js
 * @description Server-side export authorization for PRYZM.
 *
 * CONTRACT (07-BIM-SECURITY-CONTRACT §3 / H5):
 *  - All export operations (IFC, GLB, PDF) MUST fetch a server-issued authorization
 *    token before executing the client-side export function.
 *  - The server checks the caller's plan via planStore.getUserPlan() — never trusts
 *    the client's claimed plan from localStorage.
 *  - Export tokens are single-use, time-limited (60 seconds), and tied to the userId
 *    and export type. They are stored in an in-memory set that is purged on expiry.
 *  - Token generation and validation are the only public exports of this module.
 */

import { getUserPlan } from './planStore.js';

// ── Plan-to-export-rights mapping (mirrors PlanConfig.ts PLAN_LIMITS) ─────────
// This is the server-side source of truth. Must stay in sync with PlanConfig.ts.
const EXPORT_RIGHTS = {
    free:       { ifc: false, glb: false, pdf: false },
    architect:  { ifc: true,  glb: true,  pdf: true  },
    studio:     { ifc: true,  glb: true,  pdf: true  },
    firm:       { ifc: true,  glb: true,  pdf: true  },
    enterprise: { ifc: true,  glb: true,  pdf: true  },
    owner:      { ifc: true,  glb: true,  pdf: true  },  // CDE Phase 1: super-owner
};

const VALID_TYPES = ['ifc', 'glb', 'pdf'];
const TOKEN_TTL_MS = 60_000;

// ── In-memory token store: Map<token, { userId, type, expiresAt }> ────────────
const _tokens = new Map();

function _purgeExpired() {
    const now = Date.now();
    for (const [token, meta] of _tokens) {
        if (meta.expiresAt < now) _tokens.delete(token);
    }
}

/**
 * Checks whether the user's server-side plan allows the requested export type.
 * Returns { authorized: boolean, reason?: string, token?: string }.
 * On success, issues a single-use 60-second token the client must send back.
 */
export function authorizeExport(userId, exportType) {
    _purgeExpired();

    if (!VALID_TYPES.includes(exportType)) {
        return { authorized: false, reason: `Unknown export type: ${exportType}` };
    }

    const plan = getUserPlan(userId);
    const rights = EXPORT_RIGHTS[plan] ?? EXPORT_RIGHTS.free;

    if (!rights[exportType]) {
        return {
            authorized: false,
            reason: `Export type "${exportType}" is not available on the "${plan}" plan.`,
            plan,
        };
    }

    const token = `exp-${crypto.randomUUID()}`;
    _tokens.set(token, { userId, type: exportType, expiresAt: Date.now() + TOKEN_TTL_MS });
    console.log(`[exportGuard] Export authorized — user: ${userId} type: ${exportType}`);

    return { authorized: true, plan, token };
}

/**
 * Validates a previously issued export token (single-use).
 * Deletes the token on first use regardless of validity result.
 */
export function validateExportToken(token, expectedUserId, expectedType) {
    _purgeExpired();

    const meta = _tokens.get(token);
    _tokens.delete(token);

    if (!meta) return { valid: false, reason: 'Token not found or expired.' };
    if (meta.expiresAt < Date.now()) return { valid: false, reason: 'Token expired.' };
    if (meta.userId !== expectedUserId) return { valid: false, reason: 'Token user mismatch.' };
    if (meta.type !== expectedType) return { valid: false, reason: 'Token type mismatch.' };

    return { valid: true };
}
