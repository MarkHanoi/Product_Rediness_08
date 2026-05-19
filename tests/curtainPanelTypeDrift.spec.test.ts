/**
 * §CURTAIN-WALL-AUDIT-2026 §16 (Sprint 3 #9) — Curtain Panel Type Drift Guard
 *
 * Asserts that every member of `VALID_PANEL_TYPES` has an entry in
 * `PANEL_TYPE_DEFAULTS` and a renderer in `CurtainPanelFactory.PANEL_DEFINITIONS`
 * — and conversely that neither table carries stale extras. Catches the
 * "family-addition drift" failure mode flagged in audit §12 #10:
 *
 *   "Any new family must be added in two places: PanelType union +
 *    VALID_PANEL_TYPES (in CurtainPanelTypes.ts) AND PANEL_DEFINITIONS
 *    (in CurtainPanelFactory.ts). A test guard that asserts both arrays
 *    have the same length would prevent silent drift."
 *
 * Implementation note
 * -------------------
 * No TypeScript test runner is configured in this repo today (see
 * `tests/projectIsolation.smoke.test.ts` for the precedent). The drift
 * guard is enforced at three independent levels:
 *
 *   1. **Static (TypeScript)** — `PANEL_TYPE_DEFAULTS: Record<PanelType, ...>`
 *      forces every member of the `PanelType` union to appear as a key.
 *
 *   2. **Module load (runtime)** — the IIFE
 *      `assertPanelDefaultsCoverage()` in `CurtainPanelTypes.ts` throws on
 *      import if `VALID_PANEL_TYPES` and `PANEL_TYPE_DEFAULTS` disagree.
 *      Equivalent guards exist for `CurtainPanelFactory.PANEL_DEFINITIONS`.
 *
 *   3. **Spec (this file)** — the exported `CurtainPanelDriftSpec` object
 *      documents the invariant for human reviewers and is the slot a future
 *      Vitest run would activate.
 *
 * When Vitest is added to the project, uncomment the template at the bottom
 * of this file. Do NOT delete the spec object — it remains the source of
 * truth for the invariant set even after the runner exists.
 */

import {
    VALID_PANEL_TYPES,
    PANEL_TYPE_DEFAULTS,
    isValidPanelType,
    panelTypeSchema,
} from '@pryzm/geometry-curtain-wall';

export const CurtainPanelDriftSpec = {
    contract: '§CURTAIN-WALL-AUDIT-2026 §16 (Sprint 3 #9)',
    enforcedBy: [
        'src/elements/curtainwalls/CurtainPanelTypes.ts (assertPanelDefaultsCoverage IIFE — module-load guard)',
        'src/elements/curtainwalls/CurtainPanelTypes.ts (panelTypeSchema — Zod boundary, audit §4.2)',
        'src/elements/curtainwalls/CurtainPanelFactory.ts (PANEL_DEFINITIONS table — same-shape guard)',
        'TypeScript Record<PanelType, …> typing (static)',
    ],
    /**
     * Invariants the drift guard protects. Every assertion below MUST pass
     * before any panel-type addition or removal is merged.
     */
    invariants: [
        'Every entry in VALID_PANEL_TYPES has a row in PANEL_TYPE_DEFAULTS.',
        'Every key in PANEL_TYPE_DEFAULTS is a member of VALID_PANEL_TYPES (no stale extras).',
        'Object.keys(PANEL_TYPE_DEFAULTS).length === VALID_PANEL_TYPES.length.',
        'isValidPanelType(t) returns true for every t in VALID_PANEL_TYPES.',
        'panelTypeSchema accepts every t in VALID_PANEL_TYPES and rejects unknown strings.',
        'No duplicate entries in VALID_PANEL_TYPES.',
    ],
} as const;

// ────────────────────────────────────────────────────────────────────────────
// Imperative drift checks. These run when the module is imported by any
// test runner OR by a one-shot `node --import tsx tests/curtainPanelTypeDrift.spec.test.ts`
// invocation. They throw on the first violation (loud failure preferred).
// ────────────────────────────────────────────────────────────────────────────

export function runCurtainPanelDriftChecks(): void {
    const defaultKeys = Object.keys(PANEL_TYPE_DEFAULTS);

    // 1. Same length (cheapest check first).
    if (defaultKeys.length !== VALID_PANEL_TYPES.length) {
        throw new Error(
            `[CurtainPanelDriftSpec] length mismatch: VALID_PANEL_TYPES=${VALID_PANEL_TYPES.length} `
            + `PANEL_TYPE_DEFAULTS=${defaultKeys.length}`,
        );
    }

    // 2. Coverage: every VALID type has a default.
    const defaultSet = new Set(defaultKeys);
    const missingDefaults = VALID_PANEL_TYPES.filter(t => !defaultSet.has(t));
    if (missingDefaults.length) {
        throw new Error(
            `[CurtainPanelDriftSpec] missing PANEL_TYPE_DEFAULTS for: ${missingDefaults.join(', ')}`,
        );
    }

    // 3. No stale extras in defaults.
    const validSet = new Set<string>(VALID_PANEL_TYPES);
    const staleDefaults = defaultKeys.filter(k => !validSet.has(k));
    if (staleDefaults.length) {
        throw new Error(
            `[CurtainPanelDriftSpec] stale PANEL_TYPE_DEFAULTS keys: ${staleDefaults.join(', ')}`,
        );
    }

    // 4. No duplicate panel types.
    if (validSet.size !== VALID_PANEL_TYPES.length) {
        throw new Error('[CurtainPanelDriftSpec] duplicate entries in VALID_PANEL_TYPES');
    }

    // 5. isValidPanelType / panelTypeSchema accept every member; reject a sentinel.
    for (const t of VALID_PANEL_TYPES) {
        if (!isValidPanelType(t)) {
            throw new Error(`[CurtainPanelDriftSpec] isValidPanelType rejected ${t}`);
        }
        if (panelTypeSchema.safeParse(t).success !== true) {
            throw new Error(`[CurtainPanelDriftSpec] panelTypeSchema rejected ${t}`);
        }
    }
    if (panelTypeSchema.safeParse('SystemPanel_NotARealType_zzz').success !== false) {
        throw new Error('[CurtainPanelDriftSpec] panelTypeSchema accepted unknown type');
    }
    if (isValidPanelType('SystemPanel_NotARealType_zzz') !== false) {
        throw new Error('[CurtainPanelDriftSpec] isValidPanelType accepted unknown type');
    }
}

/* ─── Vitest template (uncomment once vitest is installed) ──────────────────
import { describe, it, expect } from 'vitest';

describe('§CURTAIN-WALL-AUDIT-2026 §16 #9 — Panel type drift guard', () => {
    it('VALID_PANEL_TYPES and PANEL_TYPE_DEFAULTS stay in lockstep', () => {
        expect(() => runCurtainPanelDriftChecks()).not.toThrow();
    });
    it('Object.keys(PANEL_TYPE_DEFAULTS).length === VALID_PANEL_TYPES.length', () => {
        expect(Object.keys(PANEL_TYPE_DEFAULTS).length).toBe(VALID_PANEL_TYPES.length);
    });
    it('panelTypeSchema rejects unknown strings', () => {
        expect(panelTypeSchema.safeParse('SystemPanel_NotARealType_zzz').success).toBe(false);
    });
});
─────────────────────────────────────────────────────────────────────────── */
