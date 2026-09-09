// ADR-0383 S7 (lane MP-UI, 2026-09-09) — THE MASTER-PLANNING SECTION: which blocks are on this
// parcel, what each is made of, and the per-block storey control.
//
// Layer Affected:  UI — Site surface (L7). No THREE (P2), no rAF (P3), no `(window as any)` (P4),
//                  no store writes (P6 — the one mutation is a bus verb).
// Contracts:       ADR-0383 D1 / D4 / D5 / D6 / D7 · ADR-0383 §4a (the surface resolves storeys) ·
//                  C114 §6a / §12 · C115 §2.2 / §6 (question 2 is where you ACT) ·
//                  C115 §11 `C115-91` (no rival disclosure) · C58 §1.2 (a fold may not hide a
//                  warning) · C58 §1.4 · C08 §3.1 (createElement + textContent, never an HTML
//                  sink) · C16 CA-2 · C59 §2.10 · C84 EI-9 · §CONTEXT-DATA-HONESTY.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⭐ THE FOUNDER'S SENTENCE THIS SECTION ANSWERS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"then i need to be able to SELECT THE ENVELOPES (AS A GROUP FOR ALL THE LEVELS), GET THE LEVEL
//  DATA and decide ad-hoc if i want to REDUCE OR INCREASE THE LEVELS — this in 2d site / 3d site /
//  SITE PANEL INTERFACE."*
//
// Three surfaces, one subject. This is the SITE PANEL one; the 2D map and the 3D scene read the
// same selection through the same channel (ADR-0383 D6).
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ IT COMPUTES NOTHING. EVERY FIGURE AND EVERY SENTENCE COMES FROM A PRODUCER THAT ALREADY EXISTS
// ══════════════════════════════════════════════════════════════════════════════════════════════
// [[same-rule-two-implementations]] is this repository's dominant defect (seven recurrences), and
// a panel is where it usually lands, because a renderer that needs a number is one line away from
// computing it. So:
//   · *"which blocks, which storeys, how big"*  → `readMassingGroups`     (massingGroupRoster.ts)
//   · *"where do two blocks collide"*           → `findMassingGroupOverlaps`   (same file)
//   · *"how does one storey read"*              → `describeMassingGroupStorey` (same file)
//   · *"what does N storeys mean"*              → `buildMassingGroupStoreyPlan` (massingGroupStoreyPlan.ts)
//   · *"which block is selected"*               → `massingGroupSelectionState` — the ONE owner
// This file owns LAYOUT and EVENTS. Not one arithmetic operation on a user-facing figure.
//
// ⚠ AND THE ONE THAT MATTERS MOST, BECAUSE A SECOND ROSTER ALREADY NEARLY EXISTED.
// `parcelLawEnvelopeAuthoring.ts` renders a per-STOREY list of the same envelopes. Two renderings
// of "which storeys have an envelope" is the defect above. They do not diverge because
// `readMassingGroups` CALLS `readLevelEnvelopes` — the same read that list uses — so both resolve
// membership through ONE producer (C84 EI-9). That is structural, not disciplinary.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE FOUNDER HAS COMPLAINED TWICE THAT THIS PANEL IS TOO LARGE — SO THE SHAPE IS RULED
// ══════════════════════════════════════════════════════════════════════════════════════════════
// *"i want this panel to have all the text as a drop down … otherwise is taking too much space"*
// (L-13293) and *"we need to make is 20% of the space with drop down menus"* (L-13249).
//
//   1. ONE un-foldable VERDICT LINE, always visible. ⛔ It is the FIRST SENTENCE of the summary
//      `describeMassingGroupRoster` already produced, lifted by `indexOf('. ')` and NEVER
//      re-worded — `SiteScopeSlider.ts:546-549`'s rule, whose own comment explains why: *"a rival
//      sentence here is exactly the rival-solver shape"*, and a biconditional test would not catch
//      a rival that differs only in WORDING.
//   2. The ROWS fold, default CLOSED, through `buildPanelFold` — the SHARED disclosure, because
//      `C115-91` measured five rival mechanisms on this surface and forbids a sixth.
//   3. ⛔ THE OVERLAP ADVISORY DOES **NOT** FOLD. `panelFold.ts`'s own header states the limit:
//      *"It may hide EXPLANATION. It may not hide a REFUSAL, a WARNING, or a figure's confidence
//      (C58 §1.2)."* An advisory behind a closed fold is an advisory the user never reads. The
//      same applies to the UNMEASURABLE gaps: "PRYZM could not tell" is a warning, not prose.
//
// ══════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ WHY THIS IS A SIBLING MODULE AND NOT A TENTH `EnvelopeCardSection`
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Mechanical, not aesthetic. The card-section registry is rendered by a single
// `panel.innerHTML = …` (`GISAreaLayout.ts:5905`) fired by `refreshEnvelopePanel()` from 20+ call
// sites. **Any typed input inside a card section is destroyed on the next repaint** — which is
// exactly why the existing storey-count entry lives in the separately-mounted
// `mountParcelLawEnvelopeAuthoring`, carrying `typedStoreys` across repaints. A per-group storey
// control holds the same kind of state, so it takes the same shape: a `{ element, refresh,
// dispose }` module on the `mountRoomsPerLevelSection` template, mounted into question 2's body.
//
// Question 2, not 3, because the founder ruled the split twice on 2026-09-07 and C115 §2.2/§6
// carries it: **question 2 is where you ACT on the parcel; question 3 READS what you declared
// against what you are allowed.** Selecting a block and changing its storeys is ACTING.

import { trace } from '@opentelemetry/api';
import { createId } from '@pryzm/schemas';
import { buildPanelFold } from './panelFold';
import {
    readMassingGroups,
    findMassingGroupOverlaps,
    liveMassingGroupIds,
    describeMassingGroupStorey,
    type MassingGroup,
    type MassingGroupRosterResult,
    type MassingGroupOverlapScan,
} from './massingGroupRoster';
import {
    buildMassingGroupStoreyPlan,
    MASSING_GROUP_SET_STOREYS_VERB,
    type MassingGroupStoreyResult,
} from './massingGroupStoreyPlan';
import {
    setMassingGroupSelection,
    subscribeMassingGroupSelection,
    isMassingGroupSelected,
    reconcileMassingGroupSelection,
} from './massingGroupSelectionState';
import { readLevelCandidates, type AdoptLevelCandidate } from './adoptProposalAsEnvelope';
import type { SpaceEnvelopeReadHandle } from './intendedAreaChannel';

const _tracer = trace.getTracer('pryzm.site.massingGroupSection');

/** PRYZM purple — white + violet only ([[preview-color-unified-pryzm-purple]]). */
const VIOLET = '#6600FF';
const ADVISORY_INK = '#8a5a00';
const ADVISORY_EDGE = '#c9973a';
const ADVISORY_BG = '#fdf8ee';

export const MASSING_GROUP_ROOT_TESTID = 'site-massing-groups';
export const MASSING_GROUP_VERDICT_TESTID = 'site-massing-groups-verdict';
export const MASSING_GROUP_ADVISORY_TESTID = 'site-massing-groups-advisory';
export const MASSING_GROUP_GAP_TESTID = 'site-massing-groups-unmeasurable';
export const MASSING_GROUP_FOLD_ID = 'site-massing-groups-fold';
export const MASSING_GROUP_ROW_TESTID = 'site-massing-group-row';
export const MASSING_GROUP_SINGLE_TESTID = 'site-massing-groups-single';
export const MASSING_GROUP_STOREY_INPUT_TESTID = 'site-massing-group-storeys';
export const MASSING_GROUP_APPLY_TESTID = 'site-massing-group-apply';
export const MASSING_GROUP_STOREY_NOTE_TESTID = 'site-massing-group-storey-note';
/** Carries `group.id` so a test — and a future surface — can find a row without parsing its text. */
export const MASSING_GROUP_ID_ATTR = 'data-massing-group-id';

// ═════════════════════════════════════════════════════════════════════════════════════════════
// THE ONE PROSE PRODUCER
// ═════════════════════════════════════════════════════════════════════════════════════════════

/**
 * ⭐ THE SUMMARY, AND THE ONLY PLACE THIS SECTION'S WORDS ARE COMPOSED.
 *
 * The un-foldable verdict line is this string's FIRST SENTENCE, lifted mechanically. ⛔ Nothing
 * else in this file writes a summary sentence — see `SiteScopeSlider.ts:546-549` for why a second
 * one is the rival-solver shape rather than a convenience.
 *
 * Pure; total; never throws.
 */
export function describeMassingGroupRoster(
    roster: MassingGroupRosterResult,
    scan: MassingGroupOverlapScan,
): string {
    if (!roster.readable) {
        // ⛔ A FAILURE IS NOT AN EMPTY PARCEL. The reader's own text says so; it is not re-worded.
        return roster.text;
    }
    const groups = roster.groups;
    if (groups.length === 0) {
        return 'No massing envelopes on this parcel yet. Draw a perimeter and create the envelope to '
            + 'start a block.';
    }
    const named = groups.filter((g) => g.groupId !== null).length;
    const blocks = named === 0 ? 1 : named + (groups.length > named ? 1 : 0);
    const members = roster.memberCount;

    let total = 0;
    let anyArea = false;
    let anyPartial = false;
    for (const g of groups) {
        if (g.totalIntendedM2 !== null) { total += g.totalIntendedM2; anyArea = true; }
        if (g.totalIsPartial) anyPartial = true;
    }
    // ⛔ `null` TOTAL IS SAID, NOT PRINTED AS ZERO — none declared is not zero declared (C58 §1.4).
    const areaPart = !anyArea
        ? 'no readable floor area'
        : `${Math.round(total).toLocaleString('en-GB')} m² intended${anyPartial ? ' so far' : ''}`;

    const lead = `${blocks} block${blocks === 1 ? '' : 's'} · `
        + `${members} envelope${members === 1 ? '' : 's'} · ${areaPart}.`;

    const tail: string[] = [];
    if (anyPartial) {
        tail.push('At least one storey carries no readable area, so the total is a sum over some of '
            + 'the building rather than all of it.');
    }
    if (scan.overlaps.length > 0) {
        tail.push(`${scan.overlaps.length} pair${scan.overlaps.length === 1 ? '' : 's'} of blocks share `
            + 'ground on the same storey; the note below gives both numbers.');
    }
    if (scan.unmeasurable.length > 0) {
        tail.push(`PRYZM could not measure ${scan.unmeasurable.length} pair`
            + `${scan.unmeasurable.length === 1 ? '' : 's'}, which is not the same as finding them clear.`);
    }
    return tail.length === 0 ? lead : `${lead} ${tail.join(' ')}`;
}

/**
 * The verdict line: the summary's first sentence, lifted the way `SiteScopeSlider` lifts its
 * caption lead. ⛔ Never re-worded and never re-derived.
 */
export function leadSentenceOf(text: string): string {
    const dot = text.indexOf('. ');
    return dot > 0 ? text.slice(0, dot + 1) : text;
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// DEPS
// ═════════════════════════════════════════════════════════════════════════════════════════════

export interface MassingGroupSectionDeps {
    /** `runtime.stores.spaceEnvelope`, or `null` when the runtime exposes none. */
    readonly readStore: () => SpaceEnvelopeReadHandle | null;
    /**
     * The project's storeys. ⛔ `null` when they could NOT be read — never `[]` for that case: an
     * empty array means "this project has no storeys", which is a different fact.
     */
    readonly readLevels: () => readonly AdoptLevelCandidate[] | null;
    /** The ordinance figures for the height ladder's second rung. Optional; nulls when unpublished. */
    readonly readOrdinance?: () => { readonly maxHeightM: number | null; readonly maxFloors: number | null };
    /**
     * The verbs the bus actually has. ⭐ THE AVAILABILITY ORACLE — a control whose verb is not
     * registered renders DISABLED WITH ITS REASON, never as a click that does nothing
     * (`siteGeometryHighlight.ts:32-38`). `null` ⇒ PRYZM cannot tell, which is its own arm.
     */
    readonly readRegisteredCommandTypes?: () => readonly string[] | null;
    /** P6 — the ONLY mutation path this section can reach. */
    readonly dispatch?: (type: string, payload: unknown) => void;
    /** Ids minted by the CALLER (C16 CA-2). Injected so a spec can pin them. */
    readonly mintId?: () => string;
    /** The store's dirty channel; returns its own unsubscribe. */
    readonly subscribeEnvelopes?: (fn: () => void) => () => void;
}

export interface MassingGroupSectionHandle {
    readonly element: HTMLElement;
    refresh(): void;
    dispose(): void;
}

/** Structural over `PryzmRuntime`: only `stores` and `bus` are read, through ONE cast seam. */
type RuntimeLike = {
    readonly stores?: unknown;
    readonly bus?: {
        executeCommand?: (type: string, payload: unknown) => unknown;
        registeredTypes?: readonly string[];
    };
};

/** Production deps — the same reads the neighbouring surfaces make. */
export function defaultMassingGroupSectionDeps(runtimeProp?: RuntimeLike | null): MassingGroupSectionDeps {
    const w = (typeof window !== 'undefined' ? window : {}) as unknown as {
        runtime?: RuntimeLike;
        bimManager?: { getLevels?: () => unknown[] };
    };
    // ⛔ NEVER THE NULL PROP ALONE — §L-12916: a card that read the null runtime prop rendered a
    // figure that had never been created. Resolved per CALL, never captured (§L-545).
    const live = (): RuntimeLike | null => runtimeProp ?? w.runtime ?? null;
    const stores = (): Record<string, unknown> | null => {
        const s = live()?.stores;
        return s && typeof s === 'object' ? (s as Record<string, unknown>) : null;
    };
    return {
        readStore: () => (stores()?.['spaceEnvelope'] ?? null) as SpaceEnvelopeReadHandle | null,
        readLevels: () => {
            try {
                const raw = w.bimManager?.getLevels?.();
                if (raw === undefined) return null;   // no bimManager ⇒ the storeys are NOT readable
                return readLevelCandidates(raw);
            } catch {
                return null;
            }
        },
        readRegisteredCommandTypes: () => {
            const t = live()?.bus?.registeredTypes;
            return Array.isArray(t) ? t : null;
        },
        dispatch: (type, payload) => {
            const bus = live()?.bus;
            if (!bus || typeof bus.executeCommand !== 'function') {
                throw new Error('no command bus');
            }
            bus.executeCommand(type, payload);
        },
        mintId: () => createId('spaceEnvelope'),
        subscribeEnvelopes: (fn) => {
            const s = stores()?.['spaceEnvelope'] as { subscribeDirty?: (f: () => void) => (() => void) | void } | undefined;
            if (!s || typeof s.subscribeDirty !== 'function') return () => {};
            const off = s.subscribeDirty(fn);
            return typeof off === 'function' ? off : () => {};
        },
    };
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// RENDER
// ═════════════════════════════════════════════════════════════════════════════════════════════

const el = (tag: string, css: string, text?: string): HTMLElement => {
    const n = document.createElement(tag);
    n.style.cssText = css;
    if (text !== undefined) n.textContent = text;    // C08 §3.1 — no HTML sink in this file
    return n;
};

const fmtArea = (m2: number | null): string =>
    m2 === null ? 'area not readable' : `${Math.round(m2).toLocaleString('en-GB')} m²`;

/**
 * Mount the section. Renders immediately; re-renders on the envelope channel AND on the selection
 * channel (so pressing a block in the 2D map or the 3D scene lights the row here).
 */
export function mountMassingGroupSection(
    host: HTMLElement,
    deps: MassingGroupSectionDeps,
): MassingGroupSectionHandle {
    const span = _tracer.startSpan('pryzm.site.mountMassingGroupSection');
    try {
        const root = el('div', 'margin-top:9px;border-top:1px solid #efecf7;padding-top:7px;min-width:0;max-width:100%;');
        root.setAttribute('data-testid', MASSING_GROUP_ROOT_TESTID);
        host.appendChild(root);

        let disposed = false;
        /**
         * The number the user typed, per group id. ⭐ HELD ACROSS REPAINTS — the whole reason this
         * is a mounted module rather than a card section (see the header). A repaint that discarded
         * it would erase a half-typed storey count on every store event.
         */
        const typedStoreys = new Map<string, string>();
        /** The last dispatch outcome, so a failure is REPORTED rather than swallowed. */
        let dispatchNote: string | null = null;

        const render = (): void => {
            if (disposed) return;

            let roster: MassingGroupRosterResult;
            let levels: readonly AdoptLevelCandidate[] | null;
            try {
                levels = deps.readLevels();
                roster = readMassingGroups(deps.readStore(), levels ?? []);
            } catch (e) {
                // ⛔ A read that throws is reported as UNREADABLE, never as an empty project.
                console.warn('[site][massing-group] read failed (non-fatal):', e);
                levels = null;
                roster = { readable: false, reason: 'store-threw', text:
                    'Reading the space-envelope store failed, so PRYZM cannot list the massing groups. This '
                    + 'is a failure to read — NOT a finding that this parcel holds no buildings.' };
            }
            const scan = findMassingGroupOverlaps(roster);

            // ⭐ SELF-HEALING ON READ, by the caller that already read the store (ADR-0383 D6).
            // ⛔ ONLY on a READABLE roster: `liveMassingGroupIds` returns [] for a failure too, and
            // reconciling against that would silently deselect the user's building every time the
            // store hiccupped. A failure and an emptiness must not share a consequence either.
            if (roster.readable) {
                try { reconcileMassingGroupSelection(liveMassingGroupIds(roster)); } catch { /* non-fatal */ }
            }

            root.replaceChildren();

            // ── 1 · THE UN-FOLDABLE VERDICT LINE ────────────────────────────────────────────────
            const summary = describeMassingGroupRoster(roster, scan);
            const verdict = el('div',
                `font:600 10.5px/1.4 system-ui,sans-serif;color:${VIOLET};min-width:0;`,
                leadSentenceOf(summary));
            verdict.setAttribute('data-testid', MASSING_GROUP_VERDICT_TESTID);
            root.appendChild(verdict);

            if (!roster.readable) {
                // The whole honest text, on the face of the section. ⛔ NOT behind a fold: this is
                // PRYZM admitting it cannot see, which C58 §1.2 keeps visible.
                const why = el('div', 'margin-top:3px;font-size:9.5px;line-height:1.45;color:#8a5a00;',
                    roster.text);
                why.setAttribute('data-testid', `${MASSING_GROUP_ROOT_TESTID}-unreadable`);
                root.appendChild(why);
                span.setAttribute('pryzm.massingSection.arm', 'unreadable');
                return;
            }

            // ── 2 · THE ADVISORY — OUTSIDE THE FOLD (C58 §1.2) ──────────────────────────────────
            for (const o of scan.overlaps) {
                const box = el('div',
                    `margin-top:6px;padding:5px 6px;border:1px solid ${ADVISORY_EDGE};border-radius:8px;`
                    + `background:${ADVISORY_BG};font-size:9.5px;line-height:1.45;color:${ADVISORY_INK};`,
                    o.sentence);
                box.setAttribute('data-testid', MASSING_GROUP_ADVISORY_TESTID);
                root.appendChild(box);
            }
            // ⛔ AN UNMEASURABLE PAIR GETS ITS OWN SENTENCE, never merged with "no overlap".
            for (const g of scan.unmeasurable) {
                const box = el('div',
                    `margin-top:6px;padding:5px 6px;border:1px dashed ${ADVISORY_EDGE};border-radius:8px;`
                    + `background:${ADVISORY_BG};font-size:9.5px;line-height:1.45;color:${ADVISORY_INK};`,
                    g.text);
                box.setAttribute('data-testid', MASSING_GROUP_GAP_TESTID);
                root.appendChild(box);
            }

            if (roster.groups.length === 0) {
                span.setAttribute('pryzm.massingSection.arm', 'empty');
                return;
            }

            // ── 3 · ⭐ THE SINGLE-GROUP ADMISSION ────────────────────────────────────────────────
            // Today this is the ONLY state most projects can reach, and an empty-looking roster
            // wearing a confident face is worse than a stated gap. ⛔ It is an admission about
            // PRYZM's wiring, never a statement about the user's design.
            const named = roster.groups.filter((g) => g.groupId !== null);
            if (named.length === 0) {
                const note = el('div',
                    'margin-top:5px;font-size:9px;line-height:1.45;color:#8a83a0;',
                    'Every envelope on this parcel is ungrouped, so there is one block to show. PRYZM '
                    + 'cannot create a second block yet — the master-planning create path (ADR-0383 S3) '
                    + 'and the group verbs (S4) have not shipped. This is a gap in PRYZM, not a reading '
                    + 'of your parcel.');
                note.setAttribute('data-testid', MASSING_GROUP_SINGLE_TESTID);
                root.appendChild(note);
            }

            // ── 4 · THE ROWS, FOLDED, DEFAULT CLOSED ────────────────────────────────────────────
            const fold = buildPanelFold({
                id: MASSING_GROUP_FOLD_ID,
                summary: 'Blocks on this parcel',
                open: false,
            });
            // The one fact that survives collapsing (C58 §1.2 / panelFold's `summaryNote`).
            fold.setSummaryNote(`${roster.groups.length}`);
            root.appendChild(fold.el);

            const verbs = (() => {
                try { return deps.readRegisteredCommandTypes?.() ?? null; } catch { return null; }
            })();

            for (const g of roster.groups) {
                fold.body.appendChild(renderGroupRow(g, levels, verbs));
            }

            if (dispatchNote !== null) {
                const box = el('div',
                    `margin-top:6px;padding:5px 6px;border:1px solid ${ADVISORY_EDGE};border-radius:8px;`
                    + `background:${ADVISORY_BG};font-size:9.5px;line-height:1.45;color:${ADVISORY_INK};`,
                    dispatchNote);
                box.setAttribute('data-testid', `${MASSING_GROUP_ROOT_TESTID}-dispatch-note`);
                root.appendChild(box);
            }
            span.setAttribute('pryzm.massingSection.groups', roster.groups.length);
        };

        /** One block's row: identity, figures, storeys, and the storey control. */
        function renderGroupRow(
            g: MassingGroup,
            levels: readonly AdoptLevelCandidate[] | null,
            verbs: readonly string[] | null,
        ): HTMLElement {
            const selected = g.groupId !== null && isMassingGroupSelected(g.groupId);
            const row = el('div',
                'margin-top:5px;padding:5px 6px;border-radius:8px;min-width:0;'
                + `border:1px solid ${selected ? VIOLET : '#efecf7'};`
                + `background:${selected ? '#f7f3ff' : 'transparent'};`);
            row.setAttribute('data-testid', MASSING_GROUP_ROW_TESTID);
            row.setAttribute(MASSING_GROUP_ID_ATTR, g.groupId ?? '');
            row.setAttribute('aria-selected', selected ? 'true' : 'false');

            // ── the header line: the block, and pressing it selects the WHOLE block ─────────────
            // ⭐ THE FOUNDER'S UNIT OF SELECTION: *"select the envelopes AS A GROUP FOR ALL THE
            // LEVELS"*. One press, every storey.
            const head = el('div',
                'display:flex;align-items:baseline;gap:6px;min-width:0;'
                + (g.groupId === null ? 'cursor:default;' : 'cursor:pointer;'));
            const name = el('span',
                `flex:1;min-width:0;font-weight:700;font-size:10px;color:${selected ? VIOLET : '#3b3550'};`,
                g.label);
            const count = el('span', 'flex:none;font-size:9px;color:#6b6480;',
                `${g.storeyCount} storey${g.storeyCount === 1 ? '' : 's'}`);
            head.append(name, count);
            if (g.groupId !== null) {
                const id = g.groupId;
                const label = g.label;
                head.onclick = (): void => {
                    // ⛔ P6 — selecting writes NO store and dispatches NOTHING. It is attention.
                    setMassingGroupSelection({ groupId: id, label, source: 'site-panel' });
                };
            }
            row.appendChild(head);

            // ── the figures ─────────────────────────────────────────────────────────────────────
            const figures = el('div', 'margin-top:2px;font-size:9px;color:#6b6480;',
                `Ground footprint ${fmtArea(g.footprintAreaM2)} · `
                + `${g.totalIntendedM2 === null ? 'no readable intended area' : `${fmtArea(g.totalIntendedM2)} intended`}`
                + (g.totalIsPartial ? ' (some storeys carry no area)' : ''));
            row.appendChild(figures);

            // ⛔ A LABEL DRIFT IS SHOWN, NOT PAPERED OVER (ADR-0383 D1 point 3).
            if (g.labelDisagreement !== null) {
                const drift = el('div',
                    `margin-top:2px;font-size:9px;line-height:1.4;color:${ADVISORY_INK};`,
                    `This block's storeys do not all spell its name the same way: `
                    + `${g.labelDisagreement.join(' · ')}. PRYZM is using the ground storey's spelling. `
                    + 'Renaming the block rewrites every storey at once.');
                drift.setAttribute('data-testid', `${MASSING_GROUP_ROW_TESTID}-label-drift`);
                row.appendChild(drift);
            }

            // ── the level data the founder asked for ────────────────────────────────────────────
            for (const s of g.storeys) {
                row.appendChild(el('div', 'margin-top:1px;font-size:9px;color:#8a83a0;',
                    `· ${describeMassingGroupStorey(s)}`));
            }

            row.appendChild(renderStoreyControl(g, levels, verbs));
            return row;
        }

        /**
         * The per-block storey control — *"decide ad-hoc if i want to reduce or increase the levels"*.
         *
         * ⛔ AVAILABILITY IS MEASURED, AND UNAVAILABLE RENDERS WITH ITS REASON. A row with nothing
         * to act on must render as UN-CLICKABLE, WITH ITS REASON — never as a click that does
         * nothing (`siteGeometryHighlight.ts:32-38`). And the three unavailable reasons are
         * DIFFERENT facts, kept apart: the verb has not shipped · PRYZM cannot see the bus ·
         * this is the ungrouped bucket, which no group verb can address.
         */
        function renderStoreyControl(
            g: MassingGroup,
            levels: readonly AdoptLevelCandidate[] | null,
            verbs: readonly string[] | null,
        ): HTMLElement {
            const wrap = el('div', 'margin-top:4px;display:flex;align-items:center;gap:5px;flex-wrap:wrap;');

            const unavailable = ((): string | null => {
                if (g.groupId === null) {
                    return 'These envelopes are not part of a named block, so there is no group storey '
                        + 'count to change. Blocks appear when a parcel holds more than one profile.';
                }
                if (verbs === null) {
                    return 'PRYZM cannot see the command bus from this panel, so the storey control is '
                        + 'unavailable. This is a gap in the wiring — nothing about your design.';
                }
                if (!verbs.includes(MASSING_GROUP_SET_STOREYS_VERB)) {
                    return `The ${MASSING_GROUP_SET_STOREYS_VERB} verb has not shipped yet, so PRYZM cannot `
                        + 'change a block’s storey count as one action. Add or remove storeys one envelope '
                        + 'at a time in the meantime. This is a gap in PRYZM, not a refusal about your design.';
                }
                return null;
            })();

            const input = document.createElement('input');
            input.type = 'number';
            input.min = '0';
            input.setAttribute('data-testid', MASSING_GROUP_STOREY_INPUT_TESTID);
            input.setAttribute('aria-label', `Storeys for ${g.label}`);
            input.style.cssText =
                'width:52px;padding:2px 4px;border:1px solid #d9d3e8;border-radius:6px;font-size:9.5px;';
            input.value = typedStoreys.get(g.groupId ?? '') ?? String(g.storeyCount);

            const apply = document.createElement('button');
            apply.type = 'button';
            apply.setAttribute('data-testid', MASSING_GROUP_APPLY_TESTID);
            apply.textContent = 'Set storeys';
            apply.style.cssText =
                `padding:2px 7px;border-radius:6px;font-size:9.5px;border:1px solid ${VIOLET};`
                + `background:${VIOLET};color:#fff;cursor:pointer;`;

            if (unavailable !== null) {
                input.disabled = true;
                apply.disabled = true;
                apply.style.cssText =
                    'padding:2px 7px;border-radius:6px;font-size:9.5px;border:1px solid #d9d3e8;'
                    + 'background:#f4f2f9;color:#8a83a0;cursor:not-allowed;';
                wrap.append(input, apply);
                const why = el('div',
                    'flex-basis:100%;margin-top:2px;font-size:9px;line-height:1.4;color:#8a83a0;',
                    unavailable);
                why.setAttribute('data-testid', MASSING_GROUP_STOREY_NOTE_TESTID);
                wrap.appendChild(why);
                return wrap;
            }

            apply.onclick = (): void => { applyStoreys(g, levels); };
            wrap.append(input, apply);

            // The intent line BEFORE the click, the way the envelope control already does it: what
            // will happen, said in words, while it is still reversible by not pressing.
            const line = el('div',
                'flex-basis:100%;margin-top:2px;font-size:9px;line-height:1.4;color:#6b6480;');
            line.setAttribute('data-testid', MASSING_GROUP_STOREY_NOTE_TESTID);
            wrap.appendChild(line);

            // ⭐ THE INTENT LINE IS REPAINTED IN PLACE ON EVERY KEYSTROKE, AND THE SECTION IS NOT.
            // ⛔ Calling `render()` here would be the obvious move and it is wrong: `render()` does
            // `replaceChildren`, so the input the user is typing into is destroyed and refocused
            // mid-number on every character. Updating only the sentence keeps the caret where it is
            // and still answers *"what will this do?"* before the press — which is the whole point
            // of stating intent BEFORE the click rather than reporting it after.
            const paintLine = (): void => {
                const typed = Number(typedStoreys.get(g.groupId ?? '') ?? g.storeyCount);
                line.textContent = previewFor(g, levels, typed) ?? '';
            };
            input.oninput = (): void => {
                typedStoreys.set(g.groupId ?? '', input.value);
                paintLine();
            };
            paintLine();
            return wrap;
        }

        /** The plan's own sentence, plus the ring disclosure when §4a(b) says there is one. */
        function previewFor(
            g: MassingGroup,
            levels: readonly AdoptLevelCandidate[] | null,
            target: number,
        ): string | null {
            const plan = planFor(g, levels, target, false);
            if (plan === null) return null;
            if (!plan.ok) return plan.reason === 'no-change' ? null : plan.statement;
            return plan.ringAssumption === null
                ? plan.statement
                : `${plan.statement} ${plan.ringAssumption.sentence}`;
        }

        /**
         * ⛔ THE ONE PLACE THE PAYLOAD IS BUILT. Named so that a change to ADR-0383 §4a's shape is
         * ONE edit here rather than a second construction at the dispatch site.
         *
         * `mint` is false for the PREVIEW (so a repaint does not burn ids) and true for the press.
         * ⭐ C16 CA-2 — the ids are minted by this CALLER, never inside the handler: `execute()`
         * runs again on redo and an id minted there would differ the second time.
         */
        function planFor(
            g: MassingGroup,
            levels: readonly AdoptLevelCandidate[] | null,
            target: number,
            mint: boolean,
        ): MassingGroupStoreyResult | null {
            if (!Number.isFinite(target)) return null;
            const need = Math.max(0, target - g.storeyCount);
            const ids: string[] = [];
            const mintFn = deps.mintId ?? (() => createId('spaceEnvelope'));
            for (let i = 0; i < need; i += 1) ids.push(mint ? mintFn() : `preview-${i}`);
            return buildMassingGroupStoreyPlan({
                group: g,
                levels: levels ?? [],
                ordinance: deps.readOrdinance?.() ?? { maxHeightM: null, maxFloors: null },
                targetStoreys: target,
                mintedIds: ids,
            });
        }

        function applyStoreys(g: MassingGroup, levels: readonly AdoptLevelCandidate[] | null): void {
            dispatchNote = null;
            const raw = typedStoreys.get(g.groupId ?? '');
            const target = Number(raw ?? g.storeyCount);
            const plan = planFor(g, levels, target, true);
            if (plan === null || !plan.ok) {
                dispatchNote = plan === null
                    ? 'A storey count has to be a whole number of storeys, zero or more.'
                    : plan.statement;
                render();
                return;
            }
            try {
                if (!deps.dispatch) throw new Error('no dispatch');
                // ⛔ P6 — the ONLY mutation path, and ONE verb for both directions so one gesture
                // is one Ctrl+Z (ADR-0383 §4: two verbs would spend three undos on one intent).
                deps.dispatch(plan.command, plan.payload);
                typedStoreys.delete(g.groupId ?? '');
            } catch (e) {
                console.warn('[site][massing-group] setStoreys dispatch failed (non-fatal):', e);
                dispatchNote =
                    `PRYZM could not send the storey change for ${g.label}. Nothing was changed — this is a `
                    + 'gap in the wiring, not a refusal about your design.';
            }
            render();
        }

        render();

        const offs: Array<() => void> = [];
        try { if (deps.subscribeEnvelopes) offs.push(deps.subscribeEnvelopes(render)); } catch { /* host refresh still repaints */ }
        // ⭐ C59 §2.10 / ADR-0383 D6 — the SAME channel the 2D map and the 3D scene write. Pressing
        // a block in either view lights the row here, because all three read ONE owner.
        try { offs.push(subscribeMassingGroupSelection(render)); } catch { /* same */ }

        return {
            element: root,
            refresh: render,
            dispose(): void {
                if (disposed) return;
                disposed = true;
                for (const off of offs) { try { off(); } catch { /* teardown is best-effort */ } }
                root.remove();
            },
        };
    } finally {
        span.end();
    }
}
