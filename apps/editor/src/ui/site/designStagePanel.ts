// §RESI-ORCH-STAGE-PANEL (lane RESI-ORCH, 2026-09-04) — STR §21: *"the right panel exposes the
// controls relevant to the current stage"*, and STR §14: *"the panel EVOLVES with the stage."*
//
// ── WHAT THIS DECIDES, AND WHAT IT DOES NOT ─────────────────────────────────────────────────
// `designStageModel.ts` decides WHERE the project is (derived, never stored). This module decides
// what the envelope card DOES with that answer: which of its sections LEAD, which are merely
// present, and which are GATED — rendered greyed WITH the stage's own reason printed beside them,
// the `SiteEntryPanel` disable-or-explain pattern copied rather than reinvented.
//
// It decides ORDER and RELEVANCE only. It never hides a section, never opens a fold, never
// changes a number. Hiding would be the wrong fix twice over: a user at the massing stage still
// has every right to see that "Designed vs permitted" says *nothing authored yet* — that sentence
// IS the honest answer to §14's *"what am I proposing?"* — and a section that vanishes and
// reappears with the stage is a card the user cannot learn.
//
// ── ⛔ WHY GATED SECTIONS STILL RENDER THEIR OWN ARMS ────────────────────────────────────────
// Every section this module gates already has a `data-state` arm for the state that makes it
// irrelevant (`nothing-authored`, `measure-failed`, …), pinned by `envelopeCardSections.spec.ts`.
// The gate ADDS a stage-level reason in front of that arm; it never replaces the arm. Two
// readings of one fact that AGREE is fine (C06 §13.3 forbids two PRODUCERS, not two renderers of
// one producer's answer). The gate reason comes from the SAME `DesignStageStatus` the strip
// prints, so the pill and the section cannot disagree about why a stage is unreached.
//
// PURE: no store, no DOM, no I/O. Never throws.

import { trace } from '@opentelemetry/api';
import type { DesignStage, DesignStageStatus } from './designStageModel';

const _tracer = trace.getTracer('pryzm.site.designStagePanel');

/**
 * The sections of the envelope card that this module may order. CLOSED: a new section is added
 * HERE with its stage, and the type error at the card's section map is the feature.
 *
 * The order of this tuple is the CANONICAL order — the order the card rendered in before stages
 * existed, and the tiebreak inside every relevance group so a re-render never shuffles peers.
 */
export type EnvelopeCardSection =
    | 'designed-vs-permitted'
    | 'how-measured'
    | 'per-level'
    | 'site-data'
    | 'target-area'
    | 'cost'
    | 'why';

export const ENVELOPE_CARD_SECTIONS: readonly EnvelopeCardSection[] = Object.freeze([
    'designed-vs-permitted',
    'how-measured',
    'per-level',
    'site-data',
    'target-area',
    'cost',
    'why',
] as const);

/**
 * Which design stage each section SERVES. `null` = the parcel/law layer, which every stage
 * stands on and which is therefore never gated and never leads — it is the floor.
 *
 * ⚠ The three measurement folds serve BIM because their SUBJECT is authored elements: until a
 * storey carries one, they can only say so. The two proposal sections serve massing because their
 * subject is the permitted envelope and what the user wants inside it.
 */
export const ENVELOPE_CARD_SECTION_STAGE: Readonly<Record<EnvelopeCardSection, DesignStage | null>> =
    Object.freeze({
        'designed-vs-permitted': 'bim',
        'how-measured': 'bim',
        'per-level': 'bim',
        'site-data': null,
        'target-area': 'massing',
        'cost': 'massing',
        'why': null,
    });

/** What a section is called when the gate names it. */
export const ENVELOPE_CARD_SECTION_LABEL: Readonly<Record<EnvelopeCardSection, string>> = Object.freeze({
    'designed-vs-permitted': 'Designed vs permitted',
    'how-measured': 'How these were measured',
    'per-level': 'Built area by storey',
    'site-data': 'Full site & massing data',
    'target-area': 'Target ground-floor area',
    'cost': 'Indicative cost',
    'why': 'Why these numbers?',
});

/**
 * `lead`    — the section's stage is where the user IS (current) or what they can do NEXT
 *             (available). Rendered first.
 * `neutral` — the section's stage is behind the user (done), or it is the parcel/law floor.
 * `gated`   — the section's stage is unreached and not the next step. Rendered last, greyed,
 *             WITH the stage's reason printed. Never hidden.
 */
export type EnvelopeCardSectionRelevance = 'lead' | 'neutral' | 'gated';

export interface EnvelopeCardSectionPresentation {
    readonly section: EnvelopeCardSection;
    readonly relevance: EnvelopeCardSectionRelevance;
    /** The stage this section serves; `null` for the parcel/law floor. */
    readonly stage: DesignStage | null;
    /**
     * Non-empty exactly when `relevance === 'gated'`: the stage's OWN reason, verbatim from the
     * strip's `DesignStageStatus`, so pill and section cannot disagree. `null` otherwise.
     */
    readonly reason: string | null;
}

export interface EnvelopeCardPlan {
    /** Every section exactly once: lead → neutral → gated, canonical order inside each group. */
    readonly order: readonly EnvelopeCardSection[];
    readonly byId: Readonly<Record<EnvelopeCardSection, EnvelopeCardSectionPresentation>>;
    /** The stage whose sections lead, or `null` when no stage is reached or offered. */
    readonly leadStage: DesignStage | null;
}

const GROUP_RANK: Readonly<Record<EnvelopeCardSectionRelevance, number>> = Object.freeze({
    lead: 0,
    neutral: 1,
    gated: 2,
});

/**
 * THE plan. Pure; total; never throws. Handed the strip's statuses, hands back what the card does.
 *
 * ⭐ `stages` may be EMPTY (the card's stage computation failed and rendered no strip). Then no
 * stage is known, and the honest plan is the canonical order with NOTHING gated: gating a section
 * on a stage PRYZM could not compute would print a reason it does not have.
 */
export function describeEnvelopeCardSections(
    stages: readonly DesignStageStatus[],
): EnvelopeCardPlan {
    const span = _tracer.startSpan('pryzm.site.describeEnvelopeCardSections');
    try {
        const status = new Map<DesignStage, DesignStageStatus>();
        for (const s of stages) status.set(s.stage, s);

        const byId = {} as Record<EnvelopeCardSection, EnvelopeCardSectionPresentation>;
        for (const section of ENVELOPE_CARD_SECTIONS) {
            const stage = ENVELOPE_CARD_SECTION_STAGE[section];
            const st = stage === null ? null : status.get(stage) ?? null;
            let relevance: EnvelopeCardSectionRelevance = 'neutral';
            let reason: string | null = null;
            if (st !== null) {
                if (st.state === 'current' || st.state === 'available') relevance = 'lead';
                else if (st.state === 'unavailable') {
                    relevance = 'gated';
                    reason = st.reason;
                }
                // 'done' stays neutral: behind the user, still present, never greyed.
            }
            byId[section] = Object.freeze({ section, relevance, stage, reason });
        }

        const order = [...ENVELOPE_CARD_SECTIONS].sort((a, b) => {
            const ra = GROUP_RANK[byId[a].relevance];
            const rb = GROUP_RANK[byId[b].relevance];
            if (ra !== rb) return ra - rb;
            return ENVELOPE_CARD_SECTIONS.indexOf(a) - ENVELOPE_CARD_SECTIONS.indexOf(b);
        });

        const lead = order.find((s) => byId[s].relevance === 'lead');
        const leadStage = lead === undefined ? null : byId[lead].stage;

        span.setAttribute('pryzm.designStage.leadStage', leadStage ?? 'none');
        span.setAttribute(
            'pryzm.designStage.gatedSections',
            order.filter((s) => byId[s].relevance === 'gated').length,
        );
        return Object.freeze({ order: Object.freeze(order), byId: Object.freeze(byId), leadStage });
    } finally {
        span.end();
    }
}

/**
 * Where the strip's "do this next" pill can SEND the user, per stage.
 *
 * `onCard: true` means a control on the envelope card carries `data-stage-control="<stage>"` and
 * the pill jumps to it. `onCard: false` means the artefact is produced somewhere else, and the
 * pill says WHERE instead of pretending — a pill that reads "Layout ›" and does nothing is the
 * dead click again.
 *
 * ⚠ THE HINTS NAME REAL SURFACES, measured 2026-09-04: the programme table is
 * `dataworkbench/ProgrammePanel.ts` (F3); layouts come from `house-layout/` and
 * `apartment-layout/`; BIM from the generators or the wall tools. If one of those moves, the
 * hint is wrong and its test will not catch it — which is why each hint says WHAT, not a path.
 */
export const DESIGN_STAGE_CARD_CONTROL: Readonly<Record<DesignStage, { readonly onCard: boolean; readonly hint: string }>> =
    Object.freeze({
        massing: {
            onCard: true,
            hint: 'Type a target ground-floor area (or, when no envelope resolves, a study height) on this card.',
        },
        requirements: {
            onCard: false,
            hint: 'The programme table lives in the Data Workbench (F3), not on this card.',
        },
        layout: {
            onCard: false,
            hint: 'Layouts come from the House and Apartment generators, which compare alternatives before committing.',
        },
        bim: {
            onCard: false,
            hint: 'Building elements come from a generator or from drawing walls in the editor — not from this card.',
        },
        detail: {
            onCard: false,
            hint: 'Materials, openings and finishes are edited on the model itself.',
        },
    });

/** The attribute a card control carries so the strip can find it. One name, both sides. */
export const DESIGN_STAGE_CONTROL_ATTR = 'data-stage-control';
