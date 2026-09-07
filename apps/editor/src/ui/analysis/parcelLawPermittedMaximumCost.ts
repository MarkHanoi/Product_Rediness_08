// §COST-ONE-PLACE (lane COST-ONE-PLACE, 2026-09-07 · L-13145 · C115 §9 / §9.1) — THE READER that
// puts the PERMITTED-MAXIMUM cost estimate under question 5, beneath the design's own cost.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ WHAT THIS FILE IS, IN ONE SENTENCE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// It is the three-line resolution `GISAreaLayout.refreshEnvelopePanel` used to do inline, moved to
// the surface that now OWNS cost — and nothing else. Every number and every sentence still comes
// from the same four functions it always came from:
//
//   `resolveParcelLawEnvelope`  (which BuildableEnvelope this session is about — ONE rule)
//     → `permittedStudyFiguresOf`  (the ONE producer of footprint + GFA, §PARCEL-LAW-MODEL)
//       → `envelopeStudyBuiltArea` (the named `'envelope-study-gfa'` proxy + its caveat)
//         → `estimateBuildingCost` (the SAME estimator the 5D tab uses; `null`, never 0)
//           → `buildIndicativeCostFold` (four `data-state` arms, one per refusal)
//
// ⛔ NOT A SECOND PRODUCER, AND THAT IS THE WHOLE POINT (C06 §13.3 · C19 §5.6 · `C115-11`).
// C115 §2.1 is explicit that a duplication is fixed by REMOVING A RENDERING, never by adding a
// computation to a new consolidated component. So this file computes nothing: no `footprint ×
// storeys`, no rate arithmetic, no second estimator. It reads the same envelope by the same rule
// and hands the same values to the same pure builder. If you ever find yourself typing a
// multiplication in here, that is the bug this header exists to prevent.
//
// ⛔ WHY IT IS A READER AND NOT A MOUNT. Question 5 already has a mount — `mountParcelLawQuantities`
// — with ONE render pass, ONE store subscription and ONE `estimateAtIndicativeRate` call. A second
// mount in the same host would be a second repaint schedule over one question, and the two would
// show different vintages of one envelope the first time a face drag landed between them. So this
// exports a pure-ish `string` producer that the existing pass calls, and a wiring helper for the
// two selects it renders. One pass, one vintage.
//
// ⛔ P6 — NO ELEMENT STORE IS WRITTEN. The one thing this writes is the per-project building-type
// choice (`buildingTypologyChoice.ts` → `localStorage`), which is a UI preference the 5D tab
// already shares; it creates, deletes and mutates nothing in the model.
// ⛔ P4 — no `(window as any)`. Every ambient read is behind an injectable dep so a spec drives
// this with plain objects.
// P8 — the exported functions open OTel spans.

import { trace } from '@opentelemetry/api';
import {
    estimateBuildingCost,
    resolveBuildingCostModels,
    type ResolvedBuildingCostModels,
} from '@pryzm/core-app-model';
import type { BuildableEnvelope } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import {
    buildIndicativeCostFold,
    envelopeStudyBuiltArea,
    ENVELOPE_COST_CORRECTION_SELECT_TESTID,
    ENVELOPE_COST_GROUP_SELECT_TESTID,
} from '../site/envelopeCostSection';
import { permittedStudyFiguresOf } from '../site/parcel/parcelLawModel';
import { resolveParcelLawEnvelope } from '../site/parcel/resolveParcelLawModel';
import {
    loadBuildingChoice,
    saveBuildingChoice,
    UNCHOSEN_BUILDING_TYPOLOGY,
    type BuildingChoice,
} from '../dataworkbench/buckets/buildingTypologyChoice';
import { currentCostJurisdiction } from '../dataworkbench/buckets/resolveCostJurisdiction';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawPermittedMaximumCost');

/**
 * The seams this reader needs, each injectable.
 *
 * ⚠ Every one of them is a READ of something that already exists somewhere else. None of them is
 * a new source of truth, and the defaults below are the production wiring the envelope card used
 * before the move — so the two surfaces cannot disagree about which envelope, which jurisdiction
 * or which typology this project is on.
 */
export interface PermittedMaximumCostDeps {
    /** Production: `() => window.runtime` — resolved per CALL, never captured (§L-545). */
    readonly runtime: () => PryzmRuntime | null | undefined;
    /** Which `BuildableEnvelope` this session is about. ONE rule, shared with the tab's other
     *  sections through `resolveParcelLawEnvelope`. `null` ⇒ nothing to price, and it says so. */
    readonly readEnvelope: (
        runtime: PryzmRuntime | null | undefined,
    ) => BuildableEnvelope | null;
    /** The cost-module ladder result for wherever this project is pinned. */
    readonly resolveModels: () => ResolvedBuildingCostModels;
    /** The per-project typology answer. Same store as the 5D tab. */
    readonly readChoice: (runtime: PryzmRuntime | null | undefined) => BuildingChoice;
    /** Persist a typology answer. Same store as the 5D tab, so an answer here shows there. */
    readonly writeChoice: (
        runtime: PryzmRuntime | null | undefined,
        choice: BuildingChoice,
    ) => void;
}

/** The production wiring. Resolved when CALLED, so a runtime composed after boot is seen. */
export function defaultPermittedMaximumCostDeps(): PermittedMaximumCostDeps {
    const w = (typeof window !== 'undefined' ? window : {}) as unknown as {
        runtime?: PryzmRuntime | null;
    };
    return {
        runtime: () => w.runtime ?? null,
        readEnvelope: (rt) => resolveParcelLawEnvelope(rt).envelope,
        resolveModels: () => resolveBuildingCostModels(currentCostJurisdiction()),
        readChoice: (rt) => loadBuildingChoice(rt),
        writeChoice: (rt, choice) => { saveBuildingChoice(rt, choice); },
    };
}

/**
 * ⭐ THE PERMITTED-MAXIMUM SECOND LINE, AS MARKUP — `C115-138` / `C115-139`, register row PR-E-51.
 *
 * Returns `''` in exactly TWO situations, and they are different from each other only in what the
 * reader would gain from a sentence:
 *
 *   · **no envelope at all.** There is no permitted determination, so there is no permitted
 *     maximum to price. ⛔ This is NOT the `no-gfa` arm — that arm exists for a determination that
 *     HAS no derived storey count and it still has something specific to say. Here the whole
 *     subject is absent, question 2 already says so in its own words, and repeating it under
 *     question 5 would be the duplication this lane exists to remove (`C115-10`).
 *   · **the read threw.** A cost second line that cannot even resolve a jurisdiction has no fact
 *     to state, and question 5's own answer — the design's cost — must never be taken down by an
 *     optional section beneath it. The throw is logged, not swallowed silently.
 *
 * ⛔ EVERY OTHER STATE RENDERS. No module, no GFA, no typology: all four arms of
 * `buildIndicativeCostFold` reach the DOM, because a refusal and an emptiness are different facts
 * (`C115-81`, L-1650 root cause 2).
 */
export function buildPermittedMaximumCostHtml(
    deps: PermittedMaximumCostDeps = defaultPermittedMaximumCostDeps(),
): string {
    const span = _tracer.startSpan('pryzm.analysis.buildPermittedMaximumCostHtml');
    try {
        const runtime = deps.runtime();
        const env = deps.readEnvelope(runtime);
        if (env === null) {
            span.setAttribute('pryzm.permittedMaximumCost.arm', 'no-envelope');
            return '';
        }
        const figures = permittedStudyFiguresOf(env);
        const area = envelopeStudyBuiltArea(figures.gfaM2, env.maxFloors, figures.footprintM2);
        const resolved = deps.resolveModels();
        const choice = deps.readChoice(runtime) ?? UNCHOSEN_BUILDING_TYPOLOGY;
        const model = resolved.models[0];
        const estimate = model
            ? estimateBuildingCost(model, choice.groupId, area, choice.correctionId)
            : null;
        span.setAttribute('pryzm.permittedMaximumCost.arm', model ? (area ? (estimate ? 'estimated' : 'no-typology') : 'no-gfa') : 'no-module');
        return buildIndicativeCostFold(resolved, area, choice, estimate);
    } catch (e) {
        console.warn('[analysis][parcel-law][cost] permitted-maximum line failed (non-fatal):', e);
        span.setAttribute('pryzm.permittedMaximumCost.arm', 'threw');
        return '';
    } finally {
        span.end();
    }
}

/**
 * Attach the two published-module selects — PR-G-18 (10 groups + *"— not chosen —"*) and PR-G-19
 * (the correction factors carrying the ordinance's verbatim wording).
 *
 * ⛔ AN EMPTY VALUE CLEARS THE CHOICE BACK TO *"not chosen"*, WHICH REMOVES THE FIGURE rather than
 * falling back to a default group. There is no default group and there must not be one:
 * Barcelona's own published table spans a factor of nine between its cheapest and dearest rows, so
 * a default would turn `estimateBuildingCost`'s honest `null` into a guess wearing a BOPB
 * citation (`C115-81`). ⚠ This paragraph is `GISAreaLayout.wireEnvelopeCostSelects`' own comment,
 * moved with the behaviour it describes rather than rewritten.
 *
 * `stopPropagation` is kept: the host is a `<details>` question group and a change event bubbling
 * out of a select inside a `<summary>`-adjacent fold has toggled a disclosure before now.
 *
 * @param root     the element the markup was written into
 * @param deps     the same deps the render used, so read and write agree on the project
 * @param onChange called after the choice is persisted, so the host repaints its ONE pass
 */
export function wirePermittedMaximumCostSelects(
    root: ParentNode,
    deps: PermittedMaximumCostDeps,
    onChange: () => void,
): void {
    const span = _tracer.startSpan('pryzm.analysis.wirePermittedMaximumCostSelects');
    try {
        const groupSel = root.querySelector<HTMLSelectElement>(
            `[data-testid="${ENVELOPE_COST_GROUP_SELECT_TESTID}"]`,
        );
        const corrSel = root.querySelector<HTMLSelectElement>(
            `[data-testid="${ENVELOPE_COST_CORRECTION_SELECT_TESTID}"]`,
        );
        span.setAttribute('pryzm.permittedMaximumCost.selectsWired', Number(!!groupSel) + Number(!!corrSel));
        if (groupSel) {
            groupSel.onchange = (ev): void => {
                ev.stopPropagation();
                const rt = deps.runtime();
                deps.writeChoice(rt, { ...deps.readChoice(rt), groupId: groupSel.value || null });
                onChange();
            };
        }
        if (corrSel) {
            corrSel.onchange = (ev): void => {
                ev.stopPropagation();
                const rt = deps.runtime();
                deps.writeChoice(rt, { ...deps.readChoice(rt), correctionId: corrSel.value || null });
                onChange();
            };
        }
    } catch (e) {
        console.warn('[analysis][parcel-law][cost] select wiring failed (non-fatal):', e);
    } finally {
        span.end();
    }
}
