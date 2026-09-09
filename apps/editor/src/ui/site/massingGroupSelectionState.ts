// ADR-0383 S6 / D6 (lane MP-UI, 2026-09-09) — WHICH MASSING GROUP IS SELECTED, AND THE ONE PUSH
// CHANNEL THAT TELLS ALL THREE SURFACES ABOUT IT.
//
// ADR-0383 D6 · C59 §2.10 (one owner per view region) · C114 §6a · C84 EI-9 · P6 · P8.
// Row: the master-planning lane's S6.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S SENTENCE, AND WHY IT IS A CHANNEL RATHER THAN THREE PIECES OF PANEL STATE
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"then I need to be able to SELECT THE ENVELOPES (AS A GROUP FOR ALL THE LEVELS), get the level
//  data and decide ad-hoc if i want to reduce or increase the levels — THIS IN 2D SITE / 3D SITE /
//  SITE PANEL INTERFACE."*
//
// Three surfaces, one subject. ADR-0383 D6 states the decision and its evidence:
//
//   > *"⛔ Three independent selections is not a hypothetical risk here; it is this repo's measured
//   >  recurring defect. [[view-region-one-owner]]: the split-view 'mixed up' report was SIX WRITERS
//   >  of `#container.style.width` oscillating. C59 §2.10 rules one owner per view region. The same
//   >  rule is adopted here BEFORE the second writer exists rather than after."*
//
// So this module is the owner, and it is deliberately the smallest possible one: a slot, a
// listener set, one predicate. It has no opinion about rendering, dispatches nothing, and imports
// no store — exactly the shape of `spaceEnvelopeFaceDragFocusState.ts` next door, which answers
// the same kind of question ("which storey is the subject?") one axis down.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ IT STORES AN ID, NEVER A MEMBER LIST — AND THAT IS THE LOAD-BEARING DECISION
// ══════════════════════════════════════════════════════════════════════════════════════════════
// The obvious shape is `{ groupId, memberIds[] }`, and it is wrong. A group's membership lives on
// its members (ADR-0383 D1: `group` is a nested value on `SpaceEnvelope`, not a second store), so a
// member list captured at selection time is a CACHE of a store query — C84 EI-9, *"two answers to
// where is Block A"*. It goes stale the instant `spaceEnvelope.group.setStoreys` adds a storey, and
// the surface holding it would emphasise four prisms of a five-prism building while the panel
// beside it counted five.
//
// ⛔ SO: THE SELECTION IS `groupId`. Every surface resolves membership from the store, through the
// ONE reader (`massingGroupRoster.readMassingGroups`), on the same `subscribeDirty` beat that
// already drives the rest of the panel.
//
// The `label` beside it is for a SENTENCE — a refusal, a heading, a status line — and is NEVER used
// to look anything up, the same rider `SpaceEnvelopeFaceDragFocus.label` carries. ADR-0383 D1 names
// the label as the denormalised field that can drift; a channel that let a stale copy of it select
// anything would be that drift acquiring teeth.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⚠ WHAT S8 (2D + 3D rendering) MUST TAKE FROM HERE, STATED NOW SO IT IS A SMALL ADDITION
// ══════════════════════════════════════════════════════════════════════════════════════════════
//   1. `subscribeMassingGroupSelection` + `isMassingGroupSelected(groupId)` — the ONE predicate, so
//      the 2D map, the 3D scene and the panel cannot disagree about what is selected. ⛔ A surface
//      that re-derives "is this the subject?" from its own click state is the second writer this
//      module exists to prevent.
//   2. `setMassingGroupSelection({ …, source: 'site-map-2d' | 'site-3d' })` on click — the source is
//      recorded so a span can say which surface drove a selection, never so a reader can behave
//      differently by surface.
//   3. ⛔ AND THE PART S8 MUST **NOT** TAKE FROM HERE: A PER-GROUP HUE. This module deliberately
//      mints no palette. `envelopeRenderStyle.ts` already spends hue on HONESTY (confident violet ·
//      provisional grey · suggested amber · study teal), and `siteGeometryHighlight.ts` rules the
//      consequence in its own header — *"DIM WHAT IS NOT THE SUBJECT; NEVER BRIGHTEN THE SUBJECT,
//      AND NEVER CHANGE ITS HUE"*, because emphasis that recolours a solid makes an estimate read as
//      a determination (§L-616). A per-group tint that overwrote the confidence hue would launder a
//      study into a permit one colour at a time. S8's group distinction has to be carried by
//      something hue is not already spending: outline weight, a label, or dimming non-members.
//
// PURE except for one module-local slot and a listener set. No DOM, no THREE, no store, no bus,
// no I/O. Never throws. Session-only and NOT persisted — a selection is a statement about where
// this user's attention is right now, and restoring one on the next load would emphasise a building
// nobody in that session had looked at (the argument `spaceEnvelopeFaceDragFocusState.ts:31-36`
// makes about a focus, and a selection is the same kind of fact one axis out).

import { trace } from '@opentelemetry/api';
import { projectScopeRegistry, registerProjectScopeProbe } from '@pryzm/core-app-model';
import type { PryzmRuntime } from '@pryzm/runtime-composer/types';

import { resolveActiveProjectId } from '@app/engine/project/activeProjectId';

const _tracer = trace.getTracer('pryzm.site.massingGroupSelectionState');

/**
 * WHICH surface drove the selection. Closed on purpose — a fifth arm is a type error here, where
 * the decision belongs, rather than a silently unnamed string on a span.
 *
 * ⛔ NO READER MAY BRANCH ON THIS. It is provenance for a span and for a sentence ("selected from
 * the 3D Site view"), never a switch: a channel whose meaning depends on who wrote it is three
 * channels wearing one name, which is the state D6 forbids.
 */
export type MassingGroupSelectionSource = 'site-panel' | 'site-map-2d' | 'site-3d' | 'chat';

/** The massing group the user is currently working on. */
export interface MassingGroupSelection {
    /** `SpaceEnvelope.group.id` — the ONE identity axis ADR-0383 D1 adds. */
    readonly groupId: string;
    /**
     * How the group reads in a sentence, as the WRITER had it. ⛔ Never used to look anything up —
     * see the header. May be stale against a rename; the roster reader is the authority on labels
     * and reports a disagreement rather than papering over it (ADR-0383 D1 point 3).
     */
    readonly label: string;
    /** Which surface drove it. Provenance only. */
    readonly source: MassingGroupSelectionSource;
}

type Listener = () => void;

const listeners = new Set<Listener>();

/** `null` ⇒ no group is selected, and every group renders as a peer. */
let selection: MassingGroupSelection | null = null;

/**
 * C13 §3.10 / ADR-0298 — WHOSE selection this is. Stamped beside the slot, cleared with it.
 *
 * ⛔ A GROUP ID IS ONLY MEANINGFUL INSIDE ITS PROJECT. Carried across a switch, `groupId`
 * either matches nothing (three surfaces reporting "a group is selected" and emphasising
 * nothing — the exact state `setMassingGroupSelection` refuses an empty id to prevent) or, worse,
 * collides with a real group in Project B and emphasises a building nobody selected.
 * `reconcileMassingGroupSelection` cannot save this: it is driven by a caller that has already
 * read the store, and on a switch the panel is torn down before it reads anything.
 */
let _owningProjectId: string | null = null;

/**
 * The active project, through the ONE canonical resolver — never a second copy
 * (`activeProjectId.ts`: *"THERE MUST NEVER BE A SECOND COPY"*). Never throws: a selection
 * must not be refusable because ownership could not be stamped, and an unstamped hold is
 * reported honestly by the probe rather than folded into "clean".
 */
function activeProjectId(): string | null {
    try {
        const rt = (typeof window !== 'undefined' ? window.runtime : undefined) as PryzmRuntime | undefined;
        return rt ? resolveActiveProjectId(rt) : null;
    } catch {
        return null;
    }
}

function notify(): void {
    for (const fn of [...listeners]) {
        try {
            fn();
        } catch (e) {
            console.warn('[site][massing-group] ADR-0383 S6 selection listener threw (non-fatal):', e);
        }
    }
}

/** THE ONE READ. */
export function getMassingGroupSelection(): MassingGroupSelection | null {
    return selection;
}

/**
 * THE ONE WRITE. Pass `null` to deselect.
 *
 * ⛔ AN EMPTY GROUP ID IS REFUSED RATHER THAN STORED. `''` would match no envelope, so every
 * surface would render "a group is selected" while nothing was emphasised and the panel showed an
 * empty roster row — a selection that looks like it works and points at nothing. Refusing loudly is
 * the only reading of that state anyone can act on (the rule
 * `setSpaceEnvelopeFaceDragFocus` already applies to an empty envelope id).
 *
 * ⛔ P6 — THIS DISPATCHES NOTHING AND WRITES NO STORE. Selecting a group changes no geometry; the
 * mutations the panel offers on top of it are `spaceEnvelope.group.*` bus verbs (ADR-0383 D7).
 *
 * P8: `pryzm.site.setMassingGroupSelection`.
 */
export function setMassingGroupSelection(next: MassingGroupSelection | null): void {
    const span = _tracer.startSpan('pryzm.site.setMassingGroupSelection');
    try {
        if (next !== null && (typeof next.groupId !== 'string' || next.groupId.trim() === '')) {
            span.setAttribute('pryzm.massingGroup.refused', 'empty-id');
            console.warn(
                '[site][massing-group] ADR-0383 S6 refused a selection with no group id — every '
                + 'surface would report a selection and emphasise nothing. The slot is unchanged.',
            );
            return;
        }
        if (selection === next) return;
        if (selection !== null && next !== null
            && selection.groupId === next.groupId
            && selection.label === next.label
            && selection.source === next.source) return;
        selection = next;
        _owningProjectId = next === null ? null : activeProjectId();
        span.setAttribute('pryzm.massingGroup.present', next !== null);
        if (next !== null) {
            span.setAttribute('pryzm.massingGroup.id', next.groupId);
            span.setAttribute('pryzm.massingGroup.source', next.source);
        }
        notify();
    } finally {
        span.end();
    }
}

/** Subscribe a surface or panel. Returns its own unsubscribe. */
export function subscribeMassingGroupSelection(fn: Listener): () => void {
    listeners.add(fn);
    return () => {
        listeners.delete(fn);
    };
}

/** Deselect. Every group goes back to rendering as a peer. */
export function clearMassingGroupSelection(): void {
    setMassingGroupSelection(null);
}

/**
 * THE ONE PREDICATE — is THIS group the selected one?
 *
 * ⛔ `false` FOR EVERY GROUP WHEN NOTHING IS SELECTED, and that is the opposite polarity to
 * `isSpaceEnvelopeFaceDragFocusable`, deliberately. That predicate gates a RESTRICTION, so its
 * unfocused state must be permissive. This one gates EMPHASIS, so its unselected state must be
 * "nothing is emphasised" — a permissive default here would light every building at once and mean
 * the same as lighting none.
 *
 * ⭐ EVERY SURFACE ASKS THIS, so the panel row, the 2D outline and the 3D emphasis cannot disagree
 * about what is selected (C84 EI-9). A surface that compares ids itself is the second reading.
 */
export function isMassingGroupSelected(groupId: string): boolean {
    return selection !== null && selection.groupId === groupId;
}

/**
 * The selected group's id, or `null`. Sugar over `getMassingGroupSelection()` for the many callers
 * that only need the id — offered so they do not each write `?.groupId ?? null` and one of them
 * writes it wrong.
 */
export function getSelectedMassingGroupId(): string | null {
    return selection === null ? null : selection.groupId;
}

/**
 * Deselect IF the selected group is no longer in `liveGroupIds`.
 *
 * ⭐ SELF-HEALING ON READ, DRIVEN BY THE CALLER THAT ALREADY READ THE STORE — the pattern
 * `resolveLiveTargetFootprintProposal` uses, and for the same reason: the alternative is a
 * subscription at every seam that can dissolve a group (a dissolve verb, an undo, a delete of the
 * last member, a project switch), and a rule that must be remembered at N seams is a rule that will
 * be forgotten at one. ADR-0383 D2 makes this necessary rather than tidy: *"an empty group is not
 * representable"* — delete every member and the group is simply GONE, with no event that says so.
 *
 * @param liveGroupIds the group ids the store currently holds, as the roster reader returned them.
 * @returns `true` when this call dropped the selection.
 */
export function reconcileMassingGroupSelection(liveGroupIds: Iterable<string>): boolean {
    const current = selection;
    if (current === null) return false;
    for (const id of liveGroupIds) {
        if (id === current.groupId) return false;
    }
    clearMassingGroupSelection();
    return true;
}

/** Test-only reset — clears the slot and drops every subscriber. */
export function __resetMassingGroupSelectionForTests(): void {
    selection = null;
    _owningProjectId = null;
    listeners.clear();
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ C13 PROJECT SCOPE — ONE OWNER, DECLARED (ADR-0298 §PROBE-SET-DECLARED, C13 §3.10)
// ══════════════════════════════════════════════════════════════════════════════════════════════
// This module was born on 2026-09-09 holding module-level project-scoped state with NO declared
// owner, and the `check-declared-project-scopes` candidate sweep failed CI at exit 3 for it the
// same day — ADR-0298's *"born declared or born failing"*, working exactly as designed. It is
// declared here rather than baselined into `undeclaredStateCandidates`, because the state IS
// project-scoped: see `_owningProjectId` above for what a carried-over `groupId` does.

/**
 * C13 teardown — drop the selection on a project switch.
 *
 * Idempotent, synchronous, non-throwing (the `projectScopeRegistry` contract).
 *
 * ⛔ THE LISTENER SET IS DELIBERATELY NOT CLEARED, and this is the difference between this and
 * `__resetMassingGroupSelectionForTests`. A subscriber is a SURFACE's handle, not this project's
 * data: a panel that outlives the switch and had its subscription silently dropped would go deaf
 * for the rest of the session, with nothing anywhere reporting it — the
 * [[null-at-mount-runtime-event-race]] failure shape, arrived at from the other direction.
 * Surfaces unsubscribe when THEY unmount. Declared as `uncounted` with this reason.
 *
 * ⛔ IT DOES NOTIFY, and it goes THROUGH THE ONE SETTER to do it. Writing `selection = null`
 * here would be a SECOND WRITER of the slot — which `massingGroupOneOwner.spec.ts` catches by
 * counting the assignments (*"the writers are the setter, nothing else"*), and which is the exact
 * defect D6 exists to prevent, arriving through the teardown door. `clearMassingGroupSelection()`
 * already clears the stamp and notifies, so routing through it is both correct and shorter. A
 * surface still mounted across the switch must repaint without the old emphasis; a silent clear
 * would leave Project A's building outlined over Project B.
 */
export function resetMassingGroupSelectionProjectState(): void {
    clearMassingGroupSelection();
}

/**
 * ADR-0298 probe — which project's group is selected.
 *
 * `null` means "nothing is selected", which is always clean. A selection whose project could not
 * be resolved answers `'<selection-project-unresolved>'` rather than `null`:
 * §CONTEXT-DATA-HONESTY — "I hold nothing" and "I hold something I cannot attribute" must never
 * be the same value (L-713 made that mistake the fourth time this family appeared).
 */
export function getMassingGroupSelectionOwningProjectId(): string | null {
    if (selection === null) return null;
    return _owningProjectId ?? '<selection-project-unresolved>';
}

/** What is being held, for the leak report. Never throws. */
export function describeMassingGroupSelection(): Record<string, unknown> {
    return {
        selected: selection !== null,
        groupId: selection?.groupId ?? null,
        source: selection?.source ?? null,
        stampedProjectId: _owningProjectId,
        subscribers: listeners.size,
    };
}

// ── Registration: module scope, as an import side effect (ADR-0298 D6) ──────────────────
projectScopeRegistry.register({
    scopeName: 'site.massingGroupSelection',
    clear: () => { resetMassingGroupSelectionProjectState(); },
});

registerProjectScopeProbe({
    scope: 'site.massingGroupSelection',
    owningProjectId: () => getMassingGroupSelectionOwningProjectId(),
    describe: () => describeMassingGroupSelection(),
});
