// A.1 (Phase A · Sprint 1) — Stage 3 helpers: constraintResolution.
//
// Stage 3 joins the pack's program-rules JSON (loaded from the .pryzm-typology
// ZIP at `programRulesEntry`) with site-derived regulatory overlays (setbacks
// per C19 §1.6, FAR caps per C19 §1.6, climate-driven envelope rules per C21).
//
// This file ships the pure JOIN helper.  Each typology pack composes its own
// Stage 3 handler that wraps `joinProgramRulesWithRegulatory()` after running
// its pack-specific rule-validation.

/**
 * Shallow-merge two record objects.  Keys in `regulatory` win on conflict —
 * regulatory always trumps pack-default rules.
 */
export function joinProgramRulesWithRegulatory(
    programRules: Record<string, unknown>,
    regulatory: Record<string, unknown>,
): Record<string, unknown> {
    return { ...programRules, ...regulatory };
}
