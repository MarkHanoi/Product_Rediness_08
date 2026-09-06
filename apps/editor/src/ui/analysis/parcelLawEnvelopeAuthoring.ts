// §PL-ENVELOPE-AUTHORING (lane PL-ENVELOPE-AUTHORING, 2026-09-06) — the CONTROL that lets a human
// CREATE a space envelope on the Parcel Law tab, extrude it over a chosen number of floor levels,
// and watch the law check move as they do it.
//
// STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §25.2 · §25.6 · §25.11 · C114 §6a / §12 / §14 ·
// RESI-ORCHESTRATOR-PLAN §3 (R2/R5) · C19 §5.6 · C58 §1.4 · C83 §1.2 · C08 §3.1 · P4 · P6 · P8.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S SENTENCE THIS FILE ANSWERS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"I DON'T KNOW HOW TO CONTINUE — what I want to do here is CREATE THE ENVELOPES for the house /
//  residential building … then CHECK LIVE AGAINST THE LAW … to see what I can build in second
//  floor for example — the maximum area of implantation — what I used."*
//
// So this section is exactly three things, in the order he asked for them:
//   1. CREATE — a footprint, extruded over N storeys, as N `role: 'level'` space envelopes in ONE
//      `spaceEnvelope.batch.create` (C114 §6a: one gesture, one Ctrl+Z).
//   2. AUTHOR THE PERIMETER — per created storey, the SHIPPED profile editor
//      (`window.spaceEnvelopeTool.enterProfileEditMode`, C114 §14 item 7). ⛔ No second outline
//      surface is written here; C114 §10b forbids one and the join already exists.
//   3. CHECK LIVE — implantation used vs the permitted footprint, floor area used vs the total
//      BRUT allowance, and what REMAINS for the floors above, recomputed on the same store channel
//      the 3-D scene renders from.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ EVERY NUMBER ON THIS SECTION IS PRODUCED ELSEWHERE. THIS FILE COMPUTES NOTHING.
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   · the parcel / ordinance / massing figures → `resolveParcelLawModel` (§25.11 clause 1's ONE
//     model; the rail panel and the tab's fact section render the same value);
//   · which `BuildableEnvelope` is current, and its permitted RING → `resolveParcelLawEnvelope`,
//     extracted from that same reader by this lane so no second "which envelope?" rule exists;
//   · the create decision, the storey-count verdict and the height ladder →
//     `envelopeAuthoringPlan.ts` (pure, 21 cases);
//   · the BRUT / NET arithmetic and the per-storey remainder → `brutAreaAllocation.ts`, which
//     LANDED TODAY WITH NO PRODUCTION CALLER. This is its wire. ⛔ Not a re-derivation: the
//     `total − allocated` subtraction happens once, in that module;
//   · the allocation TABLE → `buildBrutAllocationHtml`, the renderer that shipped beside it;
//   · what is currently drawn → `collectIntendedAreas`, the same channel the envelope card reads.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ HOW TO READ THE LAW-CHECK TABLE, STATED BECAUSE THE WORDING CAN MISLEAD
// ══════════════════════════════════════════════════════════════════════════════════════════════
// `buildBrutAllocation` was written for a user TYPING a target per storey, so a row it refuses
// says *"Nothing was allocated here."* Here the "request" is not typed — it is the area a user has
// already DRAWN. A refused row therefore means *"the envelope on this storey is outside the
// allowance"*, NOT *"nothing exists on this storey"*, and the envelope is neither deleted nor
// clamped. The lede sentence rendered above the table says exactly that, in the open, because a
// reading the user has to infer is a reading most users get wrong. Logged as L-12988 rather than
// tidied away.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ AN UNKNOWN ORDINANCE STILL AUTHORS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// At the founder's Córdoba parcel the card correctly says PRYZM has not transcribed the
// ordenanza's buildable rules — *"no-rule-pack … not an error"*. This section keeps the CREATE
// controls live there and reports compliance as UNKNOWN: `resolveBrutAllowance` returns
// `totalBrutM2: null` with a named reason, and `buildBrutAllocationHtml` renders that as *"not
// known · PRYZM will not guess"* in the admission voice, never as `0 m² remaining`. Those two
// demand opposite next actions from a user and rendering them alike is the single most-repeated
// defect in this repo (C58 §1.4 / L-616).
//
// ⛔ P6 — THIS FILE WRITES NO STORE. The one mutation it can cause is
// `bus.executeCommand('spaceEnvelope.batch.create', …)`. ⛔ P4 — no `(window as any)`: both globals
// it needs are reached through a typed, injectable host. ⛔ C08 §3.1 — every control it BUILDS is
// built with `createElement` + `textContent`; the single `innerHTML` sink takes the string from
// `buildBrutAllocationHtml`, which is the existing card renderer and escapes its own values.

import { trace } from '@opentelemetry/api';
import { createId } from '@pryzm/schemas';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';
import { collectIntendedAreas, type IntendedAreaSnapshot } from '../site/intendedAreaChannel';
import { readLevelCandidates, type AdoptLevelCandidate } from '../site/adoptProposalAsEnvelope';
import {
    buildEnvelopeAuthoringPlan,
    type EnvelopeAuthoringResult,
} from '../site/envelopeAuthoringPlan';
import {
    buildBrutAllocation,
    resolveBrutAllowance,
    type AllocationRequest,
} from '../site/brutAreaAllocation';
import { buildBrutAllocationHtml } from '../site/envelopeCardSections';
import {
    resolveParcelLawEnvelope,
    resolveParcelLawModel,
} from '../site/parcel/resolveParcelLawModel';
import type { ParcelLawModel } from '../site/parcel/parcelLawModel';
import { resolveLiveTargetFootprintProposal } from '../site/targetFootprintAreaState';
import { resolveEnvelopeStore, type LiveEnvelopeStore } from './parcelLawQuantities';

const _tracer = trace.getTracer('pryzm.analysis.parcelLawEnvelopeAuthoring');

/** `data-testid` on the section root. */
export const AUTHORING_SLOT_TESTID = 'analysis-parcel-law-authoring';
/** The storey-count entry. */
export const AUTHORING_STOREYS_INPUT_TESTID = 'parcel-law-authoring-storeys';
/** The create button. */
export const AUTHORING_CREATE_BTN_TESTID = 'parcel-law-authoring-create-btn';
/** The status line — plan, refusal or confirmation. `data-state` says which. */
export const AUTHORING_STATUS_TESTID = 'parcel-law-authoring-status';
/** The line naming WHICH ring will be extruded, and what that ring is. */
export const AUTHORING_SOURCE_TESTID = 'parcel-law-authoring-source';
/** The C114 §12 storey-count ADVISORY. Present only when the ask exceeds the derived count. */
export const AUTHORING_ADVISORY_TESTID = 'parcel-law-authoring-advisory';
/** One "Edit perimeter" button per created storey. `data-space-envelope-id` names its subject. */
export const AUTHORING_EDIT_PERIMETER_ATTR = 'data-authoring-edit-perimeter';
/** The list of created storeys with their perimeter-edit buttons. */
export const AUTHORING_CREATED_TESTID = 'parcel-law-authoring-created';
/** The live BRUT/NET law-check slot. */
export const AUTHORING_LAWCHECK_TESTID = 'parcel-law-authoring-lawcheck';
/** How the law-check table must be read — see the header. */
export const AUTHORING_LAWCHECK_LEDE_TESTID = 'parcel-law-authoring-lawcheck-lede';
/** `'yes'`, or `'no:<reason>'` — whether the live store channel was subscribed. */
export const AUTHORING_SUBSCRIBED_ATTR = 'data-live-subscribed';
/** How many repaints the STORE channel has driven. Read by the liveness spec. */
export const AUTHORING_LIVE_ATTR = 'data-live-repaints';

/** How the law-check table must be read. Stated in the open — see the header. */
export const LAWCHECK_LEDE =
    'Checked against what you have DRAWN. Each storey row is the level-envelope area on that '
    + 'storey, measured against the allowance. A row PRYZM refuses means that storey is outside '
    + 'the allowance — the envelope still exists and nothing was deleted or trimmed; PRYZM is '
    + 'declining to count it as compliant, and says with which two numbers.';

/** The typed capability host. P4 — no `(window as any)` anywhere in this file. */
export interface AuthoringCapabilityHost {
    readonly spaceEnvelopeTool?: {
        enterProfileEditMode: (spaceEnvelopeId: string) => void;
        profileEditAvailability: (spaceEnvelopeId: string) => { ok: boolean; reason?: string };
    } | undefined;
}

/** One storey this gesture created, kept only so its perimeter can be opened for editing. */
interface CreatedStorey {
    readonly spaceEnvelopeId: string;
    readonly label: string;
}

export interface ParcelLawEnvelopeAuthoringDeps {
    /** Production: `() => window.runtime` — resolved per CALL, never captured (§L-545). */
    readonly runtime: () => PryzmRuntime | null | undefined;
    /** Production: `() => window.bimManager?.getLevels?.()`. Returns the raw records. */
    readonly readLevels: () => unknown;
    /** Production: `resolveParcelLawModel` — the ONE model (§25.11 clause 1). */
    readonly readModel: (rt: PryzmRuntime | null | undefined) => ParcelLawModel;
    /** Production: `resolveParcelLawEnvelope` — the SAME "which envelope is current" rule. */
    readonly readEnvelopeRing: (rt: PryzmRuntime | null | undefined) => readonly { x: number; z: number }[] | null;
    /** Production: `createId('spaceEnvelope')`. Injected so a spec can pin the ids (C16 CA-2). */
    readonly mintId: () => string;
    /** Production: `window`. */
    readonly capabilityHost: AuthoringCapabilityHost;
}

/** The production wiring. Resolved when CALLED, so a runtime composed after boot is seen. */
export function defaultParcelLawEnvelopeAuthoringDeps(): ParcelLawEnvelopeAuthoringDeps {
    const w = (typeof window !== 'undefined' ? window : {}) as unknown as
        AuthoringCapabilityHost & {
            runtime?: PryzmRuntime | null;
            bimManager?: { getLevels?: () => unknown[] };
        };
    return {
        runtime: () => w.runtime ?? null,
        readLevels: () => {
            try { return w.bimManager?.getLevels?.() ?? []; } catch { return []; }
        },
        readModel: (rt) => resolveParcelLawModel(rt),
        readEnvelopeRing: (rt) => {
            const env = resolveParcelLawEnvelope(rt).envelope;
            const ring = env?.insetPolygon ?? null;
            return Array.isArray(ring) && ring.length >= 3 ? ring : null;
        },
        mintId: () => createId('spaceEnvelope'),
        capabilityHost: w,
    };
}

export interface ParcelLawEnvelopeAuthoringHandle {
    readonly element: HTMLElement;
    /** Re-read everything and repaint. Cheap; never throws into the host. */
    repaint(): void;
    /** How many repaints the STORE channel has driven. Read by the liveness spec. */
    liveRepaintCount(): number;
    dispose(): void;
}

/** The footprint this gesture will extrude, and the honest name of where it came from. */
interface FootprintSource {
    readonly ring: readonly { x: number; z: number }[] | null;
    readonly areaM2: number | null;
    readonly label: string;
    /** The sentence rendered under the heading. Says what the ring IS and what it is not. */
    readonly text: string;
}

/**
 * Decide which ring the create gesture extrudes. PURE over its inputs.
 *
 * ⭐ THE USER'S OWN PLATE WINS OVER THE PERMITTED RING. A fitted ground-floor plate is a decision
 * the user made in the section above this one (§5 / §RESI-ORCH-TARGET-AREA); the permitted ring is
 * an upper bound PRYZM solved. Extruding the bound while a chosen plate sits on the ground would
 * silently discard the choice.
 *
 * ⚠ `footprintIsUpperBound` TRAVELS WITH THE PERMITTED RING (L-619 / C58 §1.2). When the ring is
 * the whole parcel only because the setbacks are unknown, the sentence says so — extruding it
 * without that rider would present an unknown as a permission.
 */
export function resolveFootprintSource(
    model: ParcelLawModel,
    permittedRing: readonly { x: number; z: number }[] | null,
): FootprintSource {
    const permittedAreaM2 = model.massing?.footprintM2 ?? null;
    const plate = resolveLiveTargetFootprintProposal(
        permittedAreaM2 !== null && permittedAreaM2 > 0 ? permittedAreaM2 : null,
    );
    if (plate !== null) {
        return {
            ring: plate.ring,
            areaM2: plate.achievedAreaM2,
            label: 'the ground-floor plate you fitted',
            text:
                `Extrudes the ${plate.achievedAreaM2.toFixed(0)} m² plate you fitted on the ground, inside the `
                + `${plate.permittedAreaM2.toFixed(0)} m² permitted footprint. Every storey gets this same ring; `
                + 'you can then edit any storey’s perimeter on its own.',
        };
    }
    if (permittedRing !== null && permittedAreaM2 !== null && permittedAreaM2 > 0) {
        const upperBound = model.massing?.footprintIsUpperBound === true;
        return {
            ring: permittedRing,
            areaM2: permittedAreaM2,
            label: upperBound
                ? 'the permitted footprint, which is an UPPER BOUND'
                : 'the permitted buildable footprint',
            text: upperBound
                ? `Extrudes the ${permittedAreaM2.toFixed(0)} m² permitted footprint — which for this parcel is `
                  + 'the WHOLE parcel, because PRYZM does not know the setbacks. ⚠ That is an upper bound, not a '
                  + 'buildable area: fit a ground-floor area first if you want a realistic plate.'
                : `Extrudes the ${permittedAreaM2.toFixed(0)} m² permitted buildable footprint — a STUDY, not a `
                  + 'permit. Every storey gets this same ring; you can then edit any storey’s perimeter on '
                  + 'its own.',
        };
    }
    return {
        ring: null,
        areaM2: null,
        label: 'nothing',
        text:
            'PRYZM has not solved a buildable footprint for this parcel and no ground-floor plate is fitted, so '
            + 'there is no perimeter to extrude yet. This is a gap in what PRYZM has — NOT a finding that nothing '
            + 'may be built here.',
    };
}

/**
 * ⭐ THE LIVE LAW CHECK. Turns what is DRAWN into the allocation model §25.2 specifies.
 * PURE over its inputs; the caller supplies the snapshot and the storeys.
 *
 * ⛔ The requests are the DRAWN areas, one per storey that carries at least one level envelope.
 * A storey with none gets NO request, so its row states its CEILING — which is the answer to
 * *"what can I build on the second floor?"* asked before anything is drawn there.
 */
export function buildLiveLawCheck(
    model: ParcelLawModel,
    storeys: readonly AdoptLevelCandidate[],
    snapshot: IntendedAreaSnapshot,
): ReturnType<typeof buildBrutAllocation> {
    const allowance = resolveBrutAllowance({
        permittedFootprintM2: model.massing?.footprintM2 ?? null,
        maxFAR: model.ordinance?.maxFAR ?? null,
        parcelAreaM2: model.geometry?.areaM2 ?? null,
        maxFloors: model.ordinance?.maxFloors ?? null,
    });
    const requests: AllocationRequest[] = snapshot.readable
        ? snapshot.byLevel
            .filter((l) => l.levelEnvelopeCount > 0)
            .map((l) => ({ levelId: l.levelId, requestedM2: l.intendedAreaM2 }))
        : [];
    return buildBrutAllocation(
        allowance,
        storeys.map((l) => ({ levelId: l.id, name: l.name, elevation: l.elevation })),
        requests,
    );
}

const H = (tag: string, css: string, text?: string): HTMLElement => {
    const el = document.createElement(tag);
    el.style.cssText = css;
    if (text !== undefined) el.textContent = text;
    return el;
};

/**
 * Mount the "Create the envelope" section into `host`.
 *
 * ⛔ NEVER THROWS INTO THE SURFACE. A tab that cannot build is a tab the founder cannot open, and
 * reachability is the whole point of the lane that created this tab (L-12915). Every arm that
 * fails renders a SENTENCE saying what failed, never an empty div.
 */
export function mountParcelLawEnvelopeAuthoring(
    host: HTMLElement,
    deps: ParcelLawEnvelopeAuthoringDeps = defaultParcelLawEnvelopeAuthoringDeps(),
): ParcelLawEnvelopeAuthoringHandle {
    const span = _tracer.startSpan('pryzm.analysis.mountParcelLawEnvelopeAuthoring');
    const root = document.createElement('div');
    root.className = 'anl-parcel-law-authoring';
    root.setAttribute('data-testid', AUTHORING_SLOT_TESTID);
    root.style.cssText = 'margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;min-width:0;max-width:100%;';

    let disposed = false;
    let liveRepaints = 0;
    let unsubStore: (() => void) | null = null;
    /** What the user last typed, so a live repaint never blanks their entry. */
    let typedStoreys = '';
    /** The last gesture's outcome — carried, never sniffed back out of prose. */
    let lastResult: EnvelopeAuthoringResult | null = null;
    /** Set when the dispatch itself failed (as opposed to the plan refusing). */
    let dispatchError: string | null = null;
    /** The storeys the last successful create produced — the perimeter-edit subjects. */
    let created: readonly CreatedStorey[] = [];

    // ── the fixed chrome, built ONCE (C08 §3.1 — createElement + textContent only) ────────────
    const heading = H('div', 'font-weight:700;font-size:10.5px;color:#6600FF;', 'Create the envelope');
    const sourceLine = H('div', 'margin-top:3px;color:#8a83a0;font-size:9.5px;line-height:1.4;');
    sourceLine.setAttribute('data-testid', AUTHORING_SOURCE_TESTID);

    const entryRow = H('div', 'display:flex;gap:6px;margin-top:6px;align-items:flex-end;');
    const entryCol = H('div', 'flex:1;min-width:0;');
    const label = H('label', 'display:block;font-size:9px;color:#8a83a0;', 'Number of floor levels');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '1';
    input.step = '1';
    input.setAttribute('data-testid', AUTHORING_STOREYS_INPUT_TESTID);
    input.style.cssText =
        'width:100%;box-sizing:border-box;padding:5px 6px;border-radius:6px;border:1px solid #d8d3e6;'
        + 'font:600 11px system-ui;';
    input.addEventListener('input', () => { typedStoreys = input.value; });
    entryCol.appendChild(label);
    entryCol.appendChild(input);
    const createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.textContent = 'Create envelope';
    createBtn.setAttribute('data-testid', AUTHORING_CREATE_BTN_TESTID);
    createBtn.style.cssText =
        'flex:none;appearance:none;border:1px solid #6600FF;cursor:pointer;padding:6px 10px;border-radius:8px;'
        + 'font:600 11px system-ui;background:#6600FF;color:#ffffff;';
    entryRow.appendChild(entryCol);
    entryRow.appendChild(createBtn);

    const statusLine = H('div', 'margin-top:5px;font-size:9.5px;line-height:1.45;min-height:12px;');
    statusLine.setAttribute('data-testid', AUTHORING_STATUS_TESTID);
    statusLine.setAttribute('data-state', 'idle');

    const advisoryLine = H('div', 'margin-top:5px;font-size:9.5px;line-height:1.45;');
    advisoryLine.setAttribute('data-testid', AUTHORING_ADVISORY_TESTID);
    advisoryLine.hidden = true;

    const createdList = H('div', 'margin-top:6px;');
    createdList.setAttribute('data-testid', AUTHORING_CREATED_TESTID);

    const lawLede = H('div',
        'margin-top:9px;font-size:9px;line-height:1.4;color:#8a83a0;', LAWCHECK_LEDE);
    lawLede.setAttribute('data-testid', AUTHORING_LAWCHECK_LEDE_TESTID);
    const lawSlot = H('div', 'margin-top:2px;');
    lawSlot.setAttribute('data-testid', AUTHORING_LAWCHECK_TESTID);

    root.append(heading, sourceLine, entryRow, statusLine, advisoryLine, createdList, lawLede, lawSlot);

    /** Read everything this section shows, from the ONE producer of each figure. */
    const readAll = (): {
        model: ParcelLawModel;
        source: FootprintSource;
        levels: readonly AdoptLevelCandidate[];
        snapshot: IntendedAreaSnapshot;
    } => {
        const rt = deps.runtime();
        const model = deps.readModel(rt);
        const source = resolveFootprintSource(model, deps.readEnvelopeRing(rt));
        const levels = readLevelCandidates(deps.readLevels());
        const store = resolveEnvelopeStore(rt);
        const snapshot = collectIntendedAreas(
            store as LiveEnvelopeStore | null,
            levels.map((l) => ({ id: l.id, name: l.name, elevation: l.elevation })),
        );
        return { model, source, levels, snapshot };
    };

    /** Paint the perimeter-edit buttons for whatever the last create produced. */
    const renderCreated = (): void => {
        createdList.replaceChildren();
        if (created.length === 0) return;
        const tool = deps.capabilityHost.spaceEnvelopeTool;
        const note = H('div', 'font-size:9px;color:#8a83a0;line-height:1.4;',
            tool
                ? 'Author each storey’s perimeter in the outline editor — straight, orthogonal or curved. '
                  + 'Each storey is its own element, so editing one does not move the others.'
                : 'The outline editor is not reachable in this session, so PRYZM is not offering a button that '
                  + 'would do nothing. The envelopes were still created — you can drag their faces in the 3-D view.');
        createdList.appendChild(note);
        if (!tool) return;
        for (const c of created) {
            const row = H('div', 'display:flex;gap:6px;align-items:center;margin-top:4px;min-width:0;');
            row.appendChild(H('div', 'flex:1;min-width:0;font-size:10px;color:#4b4460;overflow-wrap:break-word;', c.label));
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = 'Edit perimeter';
            btn.setAttribute(AUTHORING_EDIT_PERIMETER_ATTR, '');
            btn.setAttribute('data-space-envelope-id', c.spaceEnvelopeId);
            btn.style.cssText =
                'flex:none;appearance:none;border:1px solid #d8d3e6;cursor:pointer;padding:4px 8px;'
                + 'border-radius:6px;font:600 10px system-ui;background:#faf9fd;color:#6600FF;';
            // ⛔ THE AVAILABILITY IS ASKED OF THE TOOL, NOT GUESSED. `profileEditAvailability` is
            // the resolver's own per-element verdict, so a button that cannot work is DISABLED
            // WITH ITS REASON rather than shown and dead (§FIX-DEAD-EDIT-PROFILE-BUTTON).
            let verdict: { ok: boolean; reason?: string } = { ok: true };
            try { verdict = tool.profileEditAvailability(c.spaceEnvelopeId); }
            catch (e) { verdict = { ok: false, reason: `PRYZM could not ask the outline editor: ${String(e)}` }; }
            if (!verdict.ok) {
                btn.disabled = true;
                btn.style.cursor = 'not-allowed';
                btn.style.opacity = '0.55';
                btn.title = verdict.reason ?? 'Not available for this envelope.';
            } else {
                btn.onclick = (ev): void => {
                    ev.preventDefault();
                    ev.stopPropagation();
                    try { tool.enterProfileEditMode(c.spaceEnvelopeId); }
                    catch (e) {
                        setStatus(
                            `PRYZM could not open the outline editor: ${String((e as Error)?.message ?? e)}. `
                            + 'Nothing changed.',
                            'refused',
                        );
                    }
                };
            }
            row.appendChild(btn);
            createdList.appendChild(row);
        }
    };

    const setStatus = (text: string, state: 'idle' | 'refused' | 'done' | 'plan'): void => {
        statusLine.textContent = text;
        statusLine.setAttribute('data-state', state);
        const refused = state === 'refused';
        statusLine.style.color = refused ? '#8a5a00' : '#6b6480';
        statusLine.style.background = text === '' ? '' : refused ? '#fdf8ee' : '#faf9fd';
        statusLine.style.borderLeft = text === '' ? '' : `2px solid ${refused ? '#c9973a' : '#6600FF'}`;
        statusLine.style.padding = text === '' ? '' : '4px 6px';
        statusLine.style.borderRadius = text === '' ? '' : '0 5px 5px 0';
    };

    const render = (): void => {
        if (disposed) return;
        try {
            const { model, source, levels, snapshot } = readAll();

            sourceLine.textContent = source.text;
            input.value = typedStoreys;
            const derived = model.ordinance?.maxFloors ?? null;
            input.placeholder = derived !== null && derived > 0
                ? `e.g. ${derived}`
                : 'e.g. 2';
            label.textContent = derived !== null && derived > 0
                ? `Number of floor levels — the study derives ${derived}`
                : levels.length > 0
                    ? `Number of floor levels — this project has ${levels.length} storey${levels.length === 1 ? '' : 's'}`
                    : 'Number of floor levels';

            // ⛔ THE CONTROL IS OFFERED ONLY WHERE IT CAN WORK. A create button with no ring to
            // extrude can only ever refuse, and a control that can only fail is a dead click with
            // a label on it. The reason is already in `source.text` above it.
            const canCreate = source.ring !== null;
            createBtn.disabled = !canCreate;
            input.disabled = !canCreate;
            createBtn.style.opacity = canCreate ? '1' : '0.55';
            createBtn.style.cursor = canCreate ? 'pointer' : 'not-allowed';

            // The status line survives a repaint: it is about the user's LAST gesture, and a store
            // event is not a gesture. Only its numbers are re-read, never its verdict.
            if (dispatchError !== null) setStatus(dispatchError, 'refused');
            else if (lastResult !== null && !lastResult.ok) setStatus(lastResult.statement, 'refused');
            else if (lastResult !== null && lastResult.ok) setStatus(`Created — one undo removes it. ${lastResult.statement}`, 'done');

            const advisory = lastResult !== null && lastResult.ok ? lastResult.advisory : null;
            advisoryLine.hidden = advisory === null;
            if (advisory !== null) {
                advisoryLine.textContent = advisory.statement;
                advisoryLine.style.color = '#8a5a00';
                advisoryLine.style.background = '#fdf8ee';
                advisoryLine.style.borderLeft = '2px solid #c9973a';
                advisoryLine.style.padding = '4px 6px';
                advisoryLine.style.borderRadius = '0 5px 5px 0';
            }

            renderCreated();

            // ── THE LIVE LAW CHECK ────────────────────────────────────────────────────────────
            if (!snapshot.readable) {
                // ⛔ FAILURE IS NOT EMPTINESS. An unreadable store renders the channel's own
                // sentence, never a table of zeros that looks like a finding.
                lawSlot.replaceChildren(H('div', 'font-size:9.5px;line-height:1.45;color:#8a5a00;', snapshot.text));
            } else {
                lawSlot.innerHTML = buildBrutAllocationHtml(buildLiveLawCheck(model, levels, snapshot));
            }
        } catch (e) {
            console.warn('[analysis][parcel-law][authoring] render failed (non-fatal):', e);
            root.replaceChildren(H('div', 'font-size:9.5px;line-height:1.45;color:#8a5a00;',
                'The envelope-authoring section could not render this pass. This is a failure of THIS '
                + 'section, not a finding about your project.'));
        }
    };

    createBtn.onclick = (ev): void => {
        ev.preventDefault();
        ev.stopPropagation();
        dispatchError = null;
        created = [];
        try {
            const { model, source, levels } = readAll();
            // ⛔ THE IDS ARE MINTED HERE, NEVER IN THE HANDLER (C16 CA-2): `execute()` runs again
            // on REDO, so an id minted inside the handler would differ the second time and orphan
            // every `withinId` pointing at the first.
            const wanted = Number(typedStoreys);
            const idCount = Number.isFinite(wanted) && wanted > 0 && wanted <= 64 ? Math.floor(wanted) : 1;
            const mintedIds: string[] = [];
            for (let i = 0; i < idCount; i++) mintedIds.push(deps.mintId());

            const plan = buildEnvelopeAuthoringPlan({
                ring: source.ring,
                ringAreaM2: source.areaM2,
                ringSourceLabel: source.label,
                requestedStoreys: typedStoreys,
                ordinance: {
                    maxHeightM: model.ordinance?.maxHeightM ?? null,
                    maxFloors: model.ordinance?.maxFloors ?? null,
                },
                levels,
                mintedIds,
            });
            lastResult = plan;
            if (!plan.ok) { render(); return; }

            const bus = deps.runtime()?.bus;
            if (!bus || typeof bus.executeCommand !== 'function') {
                // An admission about PRYZM's wiring, never a statement about the user's project.
                dispatchError =
                    'This surface has no command bus, so PRYZM cannot create the envelope. Nothing was created '
                    + 'and nothing changed — this is a gap in the wiring, not a refusal about your design.';
                render();
                return;
            }
            // ⛔ P6 — the ONLY mutation path, and ONE batch verb so one gesture is one Ctrl+Z.
            bus.executeCommand(plan.command, plan.payload);
            created = plan.storeys.map((s, i) => ({
                spaceEnvelopeId: plan.payload.envelopes[i]!.spaceEnvelopeId,
                label: s.label,
            }));
        } catch (e) {
            dispatchError =
                `PRYZM could not create the envelope: ${String((e as Error)?.message ?? e)}. `
                + 'Nothing was created and nothing changed.';
            created = [];
        }
        render();
    };

    try {
        host.appendChild(root);
        render();

        // ── THE LIVE CHANNEL — the SAME one the 3-D scene renders from. ───────────────────────
        // `Store.applyPatch` notifies `subscribeDirty` on execute, undo AND redo alike, so one
        // subscription covers a create, a face drag, a footprint edit and a Ctrl+Z. RESI-
        // ORCHESTRATOR-PLAN §3: honour the existing synchronisation contract, never invent a
        // fourth update path.
        const store = resolveEnvelopeStore(deps.runtime());
        if (store && typeof store.subscribeDirty === 'function') {
            try {
                unsubStore = store.subscribeDirty(() => {
                    if (disposed || !root.isConnected) return;
                    liveRepaints += 1;
                    render();
                    root.setAttribute(AUTHORING_LIVE_ATTR, String(liveRepaints));
                });
                root.setAttribute(AUTHORING_SUBSCRIBED_ATTR, 'yes');
            } catch (e) {
                root.setAttribute(AUTHORING_SUBSCRIBED_ATTR, 'no:threw');
                console.warn('[analysis][parcel-law][authoring] subscribeDirty threw — the law check will '
                    + 'not update as envelopes change:', e);
            }
        } else {
            root.setAttribute(
                AUTHORING_SUBSCRIBED_ATTR,
                store ? 'no:store-has-no-dirty-channel' : 'no:no-store',
            );
            console.warn('[analysis][parcel-law][authoring] runtime.stores.spaceEnvelope '
                + (store ? 'exposes no subscribeDirty' : 'is not reachable')
                + ' — the law check will not update live this session.');
        }
        span.setAttribute('pryzm.analysis.parcelLawAuthoring.mounted', true);
    } catch (e) {
        span.setAttribute('pryzm.analysis.parcelLawAuthoring.mounted', false);
        console.warn('[analysis][parcel-law][authoring] mount failed (non-fatal):', e);
    } finally {
        span.end();
    }

    return {
        element: root,
        repaint: render,
        liveRepaintCount: () => liveRepaints,
        dispose(): void {
            if (disposed) return;
            disposed = true;
            try { unsubStore?.(); } catch { /* teardown is best-effort */ }
            unsubStore = null;
            root.remove();
        },
    };
}
