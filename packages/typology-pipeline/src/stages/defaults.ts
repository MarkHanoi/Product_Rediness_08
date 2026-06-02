// A.1 (Phase A · Sprint 1) — Default stage handlers.
//
// Every stage except Stage 4 (generative) has a sensible default:
//   - briefCapture:        echoes input.brief as `ValidatedBrief` unchanged
//   - siteContext:         echoes the site snapshot, `derived: {}`
//   - constraintResolution: empty rule set
//   - validators:          pass-through (plan unchanged)
//   - cognition:           empty evaluation array
//   - bimEmit:             empty command list (means "no commands")
//
// A typology pack overrides only the stages it cares about — every pack
// MUST supply its own generative stage.
//
// Strategic context: docs/03-execution/plans/typology-expansion-roadmap.md §6.

import type {
    BriefStage,
    SiteStage,
    ConstraintsStage,
    ValidatorsStage,
    CognitionStage,
    BimEmitStage,
} from '../types.js';

export const defaultBriefStage: BriefStage = (brief) => ({
    ok: true,
    artifact: { raw: brief, normalised: { ...brief.metadata } },
});

export const defaultSiteStage: SiteStage = ({ site }) => ({
    ok: true,
    artifact: { snapshot: site, derived: {} },
});

export const defaultConstraintsStage: ConstraintsStage = () => ({
    ok: true,
    artifact: { programRules: {}, regulatory: {} },
});

export const defaultValidatorsStage: ValidatorsStage = ({ plan }) => ({
    ok: true,
    artifact: plan,
});

export const defaultCognitionStage: CognitionStage = () => ({
    ok: true,
    artifact: [],
});

export const defaultBimEmitStage: BimEmitStage = () => ({
    ok: true,
    artifact: [],
});
