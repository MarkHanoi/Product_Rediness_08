/**
 * §SECTION-2-MIRRORS-ITS-OWN-DETERMINATION + §ENVELOPE-CREATION-IS-A-STAGE-02-VERB (L-13202)
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * ⭐ THE DEFECT THIS FILE EXISTS TO STOP COMING BACK
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * Founder 2026-09-07, with a screenshot: question 2's collapsed digest read **"no determination
 * held"** while, in the same shot, the tab quoted `Maximum levels 6 storeys` and `Maximum height
 * 22.4 m` — cited to PGM Art. 242.2. **A section reporting EMPTY while holding real data**, about
 * someone's land, which is a data-integrity defect and not a layout one.
 *
 * ⛔ THE MEASURED CAUSE WAS NOT ANY OF THE THREE THEORIES PUT TO THE LANE. Not the authored
 * envelope (C114) overwriting the solved determination (C58); not a C06 §13.3 two-producer
 * collision; not a digest computed from a source the body does not render. All SEVEN of question
 * 2's probes were emitted only by `buildParcelLawFacts`'s `wantLaw` arm, and `27d3c93b` deleted
 * that rendering (as a duplicate of the card's own fold) while leaving the probes pointing at it.
 * The digest could not have mirrored anything, on any parcel, in any state.
 *
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 * ⛔ WHAT EACH ARM WOULD HAVE CAUGHT, AND HOW IT CAN FAIL
 * ═════════════════════════════════════════════════════════════════════════════════════════════
 *   ARM 1 — the digest mirrors a DETERMINED body. Fails on the shipped code (it read
 *           "no determination held" against the founder's own numbers). Fails again if a lane
 *           re-points the probes at anything question 2 does not render.
 *   ARM 2 — ⭐ THE REGRESSION HE REPORTED: **author an envelope, and question 2 STILL reports its
 *           determination.** The create block now lives in question 2, so this drives the REAL
 *           block, in the REAL group body, through a REAL dispatch, and re-reads the digest after.
 *   ARM 3 — ⛔ NOT VACUOUS. An UNDETERMINED body still reads "no determination held", and a
 *           `not derived` ceiling is never mistaken for a value. Without this arm, a digest
 *           hard-coded to any non-empty string would pass ARMs 1 and 2.
 *   ARM 4 — question 3's digest moved with the rendering it mirrors (`C115-100`): it reads the
 *           ledger's verdicts, never the departed authoring status.
 *   ARM 5 — PR-H-01 / `C115-29`: every `data-*` a probe depends on is in the MutationObserver's
 *           filter. A digest keyed on an unwatched attribute renders once and then FREEZES.
 *   ARM 6 — §ONE-TYPE-BASE: the relocated block adopts the panel's base instead of its 15 inline
 *           `px` literals, 12 of which sat below the C43 / WCAG 2.2 AA floor.
 *
 * ⚠ WHAT THIS FILE DOES NOT ESTABLISH. Nothing here has been seen in a browser. The bus and the
 * space-envelope store are FAKES OF THE SEAM; the envelope card's markup is the REAL
 * `buildCeilingHeadlineHtml` output rather than the card mounted by `GISAreaLayout`, which needs a
 * live site store. So this proves the DIGEST reads what the card RENDERS — not that the card
 * mounted. `parcelLawTab.spec.ts` covers the mount; C114 §14d/§14e still applies to the 3-D leg.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    buildQuestionGroup,
    resetQuestionGroupOpenState,
    PARCEL_LAW_QUESTION_GROUPS,
    QUESTION_GROUP_CONFIDENCE_ATTR,
    QUESTION_GROUP_DIGEST_TESTID_PREFIX,
    type QuestionGroupSpec,
} from '../parcelLawQuestionGroup';
import {
    buildCeilingHeadlineHtml,
    CARD_ROW_VALUE_CLASS,
    CEILING_HEADLINE_DERIVED_ATTR,
    CEILING_HEADLINE_TESTID,
} from '../../site/ceilingHeadlineSection';
import { describeSiteHighlightAvailability } from '../../site/siteGeometryHighlight';
import { collectIntendedAreas } from '../../site/intendedAreaChannel';
import {
    AUTHORING_CREATE_BTN_TESTID,
    AUTHORING_STATUS_TESTID,
    AUTHORING_STOREYS_INPUT_TESTID,
    mountParcelLawEnvelopeAuthoring,
    type ParcelLawEnvelopeAuthoringDeps,
} from '../parcelLawEnvelopeAuthoring';
import { buildIntentAgainstCeilingSection } from '../parcelLawIntentAgainstCeiling';
import { buildIntentAgainstCeiling } from '../../site/intentAgainstCeilingModel';
import type { ParcelLawModel } from '../../site/parcel/parcelLawModel';
import { __resetTargetFootprintProposalForTests } from '../../site/targetFootprintAreaState';
import { PLAW_SCALE_BASE_PX } from '../parcelLawTypeScale';

// ═════════════════════════════════════════════════════════════════════════════════════════════
// FIXTURES — ⭐ THE FOUNDER'S OWN NUMBERS, from the screenshot that opened this lane.
// ⛔ Transcribed, not invented: 6 storeys · 22.4 m · 452 m² implantation · 2,711 m² buildable.
// A fixture chosen to make the assertion convenient could not have reproduced his report.
// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⛔ THE REAL AVAILABILITY RULE, not a hand-built record. A fake built from the header cannot
// falsify the header ([[fake-more-capable-than-real]]), and this record decides whether the four
// ceilings render as CONTROLS or as text-with-reason — which is exactly what the digest reads past.
const AVAIL = describeSiteHighlightAvailability({
    parcelRingLength: 4,
    edgeClassifications: ['front', 'side', 'rear', 'side'],
    footprintRingLength: 3,
    maxHeightM: 22.4,
    gfaM2: 2711,
});

/** The card's ceiling headline, as question 2's body actually renders it. */
function determinedHeadlineHtml(): string {
    return buildCeilingHeadlineHtml({
        maxFloors: 6,
        maxHeightM: 22.4,
        footprintM2: 452,
        gfaM2: 2711,
        avail: AVAIL,
        active: null,
    });
}

/** The same headline for a parcel whose rule pack derived NOTHING — all four absent. */
function undeterminedHeadlineHtml(): string {
    return buildCeilingHeadlineHtml({
        maxFloors: null,
        maxHeightM: null,
        footprintM2: null,
        gfaM2: null,
        avail: AVAIL,
        active: null,
    });
}

const specOf = (id: string): QuestionGroupSpec => {
    const s = PARCEL_LAW_QUESTION_GROUPS.find((g) => g.id === id);
    expect(s, `question group "${id}" is gone`).toBeDefined();
    return s!;
};

const digestOf = (el: HTMLElement, id: string): string =>
    el.querySelector(`[data-testid="${QUESTION_GROUP_DIGEST_TESTID_PREFIX}${id}"]`)?.textContent ?? '';

const RING = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 0, z: 10 }];

/** A model shaped like the founder's parcel, for the authoring block's own reads. */
function lawModel(): ParcelLawModel {
    return {
        identity: null,
        identityAbsence: 'none',
        committedAreaM2: 1200,
        geometry: {
            areaM2: 1200, perimeterM: 140, bboxWidthM: 40, bboxDepthM: 30,
            edgeCount: 4, frontageClause: 'x', frontEdgeCount: 1,
        },
        geometryAbsence: null,
        envelopeState: 'full',
        refusal: null,
        ordinance: {
            zoneCode: 'generic-urban', buildableDepthM: null, depthIsBlockGranular: false,
            depthTerm: 'depth', alignmentOffsetM: null, maxHeightM: 22.4, maxFloors: 6,
            maxFAR: 2711 / 1200, maxCoveragePct: 50, setbackFrontM: null, setbackSideM: null,
            setbackRearM: null, citation: null, sourceId: null,
        },
        massing: {
            footprintM2: 452, footprintIsUpperBound: false, coveragePct: 37.7,
            footprintPerimeterM: 90, gfaM2: 2711, studyVolumeM3: null,
        },
        perStorey: null,
        capacity: null,
        confidence: null,
        determinedAtIso: null,
    } as unknown as ParcelLawModel;
}

/** The seam the create button dispatches through — a fake BUS and a fake STORE, nothing else. */
function authoringHarness(): {
    deps: ParcelLawEnvelopeAuthoringDeps;
    executed: { type: string; payload: unknown }[];
} {
    const executed: { type: string; payload: unknown }[] = [];
    const state = new Map<string, unknown>();
    const listeners: (() => void)[] = [];
    const runtime = {
        bus: {
            executeCommand: (type: string, payload: unknown) => {
                executed.push({ type, payload });
                const p = payload as {
                    envelopes: { spaceEnvelopeId: string; levelId: string; name?: string }[];
                    supersedes?: string[];
                };
                for (const id of p.supersedes ?? []) state.delete(id);
                for (const e of p.envelopes) {
                    state.set(e.spaceEnvelopeId, {
                        id: e.spaceEnvelopeId, levelId: e.levelId, role: 'level',
                        name: e.name, footprintAreaM2: 452, withinId: null,
                    });
                }
                for (const l of listeners) l();
            },
        },
        stores: {
            spaceEnvelope: {
                getState: () => state,
                subscribeDirty: (fn: () => void) => { listeners.push(fn); return () => { /* noop */ }; },
            },
        },
    };
    let idn = 0;
    return {
        executed,
        deps: {
            runtime: () => runtime as never,
            readLevels: () => [
                { id: 'lvl-0', name: 'Ground', elevation: 0, height: 3 },
                { id: 'lvl-1', name: 'Level 1', elevation: 3, height: 3 },
                { id: 'lvl-2', name: 'Level 2', elevation: 6, height: 3 },
            ],
            readModel: () => lawModel(),
            readEnvelopeRing: () => RING,
            mintId: () => `se-${++idn}`,
            capabilityHost: {
                spaceEnvelopeTool: {
                    enterProfileEditMode: vi.fn(),
                    profileEditAvailability: () => ({ ok: true }),
                },
            },
        } as unknown as ParcelLawEnvelopeAuthoringDeps,
    };
}

/** Resolve every `em` up the chain to the root's px base — the size a reader actually gets. */
function effectivePx(node: HTMLElement, root: HTMLElement): number {
    const chain: HTMLElement[] = [];
    for (let n: HTMLElement | null = node; n !== null; n = n.parentElement) {
        chain.push(n);
        if (n === root) break;
    }
    let px = Number.parseFloat(root.style.fontSize);
    for (const n of chain.reverse()) {
        const fs = n.style.fontSize;
        if (n === root || fs.length === 0) continue;
        const em = /^([\d.]+)em$/.exec(fs);
        if (em) px *= Number.parseFloat(em[1]!);
        else px = Number.parseFloat(fs);
    }
    return px;
}

beforeEach(() => {
    resetQuestionGroupOpenState();
    document.body.replaceChildren();
    __resetTargetFootprintProposalForTests();
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM 0 — ⛔ THE PROOF THAT THE FIX WAS A FIX: the OLD probes cannot see this body', () => {
    it('the four selectors that shipped resolve to NOTHING against a fully determined question 2', () => {
        // ⭐ THE INVERSION, RUN RATHER THAN REASONED. This rebuilds the EXACT probe set that
        // shipped — the four `buildParcelLawFacts` `wantLaw` hooks — and puts the founder's own
        // determined body under it. If this ever starts passing, the law-scope rendering has come
        // back into question 2 and `C115-125`'s restoration half has landed: re-read §12.1 before
        // touching the live probes, do not simply delete this arm.
        const shipped: QuestionGroupSpec = {
            id: 'law-as-shipped-2026-09-07',
            ordinal: 2,
            question: 'What can I build here?',
            hint: '(the probe set this lane replaced)',
            open: true,
            headlineProbes: Object.freeze([
                { selector: '[data-testid="parcel-law-fact-footprint"] .anl-plaw-val' },
                { selector: '[data-testid="parcel-law-fact-max-height"] .anl-plaw-val' },
                { selector: '.anl-plaw-refusal-headline' },
                { selector: '[data-testid="parcel-law-envelope-absent"]' },
            ]),
            confidenceProbes: Object.freeze([
                { selector: '.anl-plaw-refusal', attr: 'data-refusal-code' },
                { selector: '.anl-plaw-group-source' },
                { selector: '[data-testid="parcel-law-determined-at"]' },
            ]),
            emptyDigest: 'no determination held',
        };
        const g = buildQuestionGroup(shipped);
        document.body.appendChild(g.element);
        const card = document.createElement('div');
        card.innerHTML = determinedHeadlineHtml();
        g.body.appendChild(card);
        g.refreshDigest();

        // ⛔ THIS IS THE FOUNDER'S SCREENSHOT, REPRODUCED. Six storeys, 22.4 m, 452 m² and
        // 2,711 m² are all in the body; the digest states none of them.
        expect(card.textContent).toContain('22.4 m');
        expect(digestOf(g.element, shipped.id)).toContain('no determination held');
        g.dispose();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM 1 — question 2\'s digest states the determination its own body holds', () => {
    it('mirrors the founder\'s numbers instead of "no determination held"', () => {
        const g = buildQuestionGroup(specOf('law'));
        document.body.appendChild(g.element);
        // Exactly what the envelope card puts in this body — the REAL producer, not a stand-in.
        const card = document.createElement('div');
        card.innerHTML = determinedHeadlineHtml();
        g.body.appendChild(card);
        g.refreshDigest();

        const digest = digestOf(g.element, 'law');
        // ⛔ THE ASSERTION THE SHIPPED CODE FAILED. This is the founder's screenshot, in words.
        expect(digest, 'question 2 is reporting EMPTY while holding a real determination')
            .not.toContain('no determination held');
        expect(digest).toContain('max levels');
        expect(digest).toContain('6');
        // C58 §1.2 — the figure and its confidence travel together, never one without the other.
        expect(digest).toContain('4 of 4 derived');
        expect(g.element.getAttribute(QUESTION_GROUP_CONFIDENCE_ATTR)).toBe('4 of 4 derived');
        g.dispose();
    });

    it('the value hook it reads is the card\'s own, and it carries the figure WITHOUT the label', () => {
        // ⛔ Reading the whole ROW would give `"Maximum levels ⓘ 6"` — a caption, not a figure, and
        // it would silently start including any affordance a later lane adds to the label cell.
        const host = document.createElement('div');
        host.innerHTML = determinedHeadlineHtml();
        const val = host.querySelector(`[data-ceiling="height"] .${CARD_ROW_VALUE_CLASS}`);
        expect(val, 'the card row lost its value hook — question 2\'s digest goes blind').not.toBeNull();
        expect(val!.textContent!.trim()).toBe('22.4 m');
        expect(host.querySelector(`[data-testid="${CEILING_HEADLINE_TESTID}"]`)!
            .getAttribute(CEILING_HEADLINE_DERIVED_ATTR)).toBe('4 of 4 derived');
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM 2 — ⭐ AUTHORING AN ENVELOPE DOES NOT COST QUESTION 2 ITS DETERMINATION', () => {
    it('creates 3 storeys from inside question 2 and the digest still states the ceiling', () => {
        const g = buildQuestionGroup(specOf('law'));
        document.body.appendChild(g.element);
        const card = document.createElement('div');
        card.innerHTML = determinedHeadlineHtml();
        g.body.appendChild(card);

        // ⭐ THE RELOCATED BLOCK, IN THE GROUP THAT NOW HOSTS IT. The founder's report was
        // "after having created the massing envelope", so the gesture happens HERE, beside the
        // determination, exactly as it now does on his screen.
        const authoringHost = document.createElement('div');
        g.body.appendChild(authoringHost);
        const h = authoringHarness();
        const authoring = mountParcelLawEnvelopeAuthoring(authoringHost, h.deps);

        g.refreshDigest();
        const before = digestOf(g.element, 'law');
        expect(before).toContain('max levels');

        const input = authoringHost
            .querySelector<HTMLInputElement>(`[data-testid="${AUTHORING_STOREYS_INPUT_TESTID}"]`)!;
        input.value = '3';
        input.dispatchEvent(new Event('input'));
        authoringHost
            .querySelector<HTMLButtonElement>(`[data-testid="${AUTHORING_CREATE_BTN_TESTID}"]`)!
            .click();

        // The gesture really happened — otherwise this arm would prove nothing about authoring.
        expect(h.executed.map((e) => e.type)).toContain('spaceEnvelope.batch.create');
        const status = authoringHost
            .querySelector(`[data-testid="${AUTHORING_STATUS_TESTID}"]`)!;
        expect(status.getAttribute('data-state')).toBe('done');

        // ⛔ AND THE DETERMINATION IS STILL THERE, BOTH IN THE BODY AND IN THE DIGEST. C80 forbids
        // a generator destroying authored work; the inverse holds exactly as hard — an AUTHORED
        // envelope (C114, `confidence: 'authored'`) may not erase the SOLVED determination (C58).
        // They are two different facts about one parcel and both must survive.
        g.refreshDigest();
        const after = digestOf(g.element, 'law');
        expect(after, 'authoring an envelope blanked question 2\'s determination')
            .not.toContain('no determination held');
        expect(after).toBe(before);
        expect(g.body.querySelector(`[data-testid="${CEILING_HEADLINE_TESTID}"]`)).not.toBeNull();

        authoring.dispose();
        g.dispose();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM 3 — ⛔ THE ARM THAT PROVES ARMS 1 AND 2 CAN FAIL', () => {
    it('an EMPTY body still says "no determination held"', () => {
        const g = buildQuestionGroup(specOf('law'));
        document.body.appendChild(g.element);
        g.refreshDigest();
        expect(digestOf(g.element, 'law')).toContain('no determination held');
        // ⛔ …and it states NO confidence, rather than inventing one for a figure it does not have.
        expect(g.element.getAttribute(QUESTION_GROUP_CONFIDENCE_ATTR)).toBe('none');
        g.dispose();
    });

    it('a body whose four ceilings are all "not derived" is an ABSENCE, never a value', () => {
        // ⭐ THE TRAP THE `[data-derived="yes"]` PREDICATE EXISTS TO AVOID. Without it the first
        // row resolves and the digest reads *"max levels not derived"* — a sentence that looks
        // like an answer. `not derived` is a MISSING LOOKUP, not a finding about the land
        // (C58 §1.4), and the two demand opposite next actions from a reader.
        const g = buildQuestionGroup(specOf('law'));
        document.body.appendChild(g.element);
        const card = document.createElement('div');
        card.innerHTML = undeterminedHeadlineHtml();
        g.body.appendChild(card);
        g.refreshDigest();
        const digest = digestOf(g.element, 'law');
        expect(digest).not.toContain('not derived');
        expect(digest).toContain('no determination held');
        // The confidence half still reports what the headline knows: nothing was derived.
        expect(g.element.getAttribute(QUESTION_GROUP_CONFIDENCE_ATTR)).toBe('0 of 4 derived');
        g.dispose();
    });

    it('a PARTLY derived parcel states the first ceiling that IS derived, in the body\'s own order', () => {
        const g = buildQuestionGroup(specOf('law'));
        document.body.appendChild(g.element);
        const card = document.createElement('div');
        card.innerHTML = buildCeilingHeadlineHtml({
            maxFloors: null, maxHeightM: 22.4, footprintM2: 452, gfaM2: null,
            avail: AVAIL, active: null,
        });
        g.body.appendChild(card);
        g.refreshDigest();
        expect(digestOf(g.element, 'law')).toContain('max height 22.4 m');
        expect(g.element.getAttribute(QUESTION_GROUP_CONFIDENCE_ATTR)).toBe('2 of 4 derived');
        g.dispose();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM 4 — question 3\'s digest moved with the rendering it mirrors (C115-100)', () => {
    /**
     * ⛔ THE REAL PRODUCERS, THROUGH A FAKE STORE. `collectIntendedAreas` is the ONE reader of
     * declared intent and `buildIntentAgainstCeiling` is the ONE verdict; a hand-built snapshot
     * would let this arm agree with a shape that the production path never produces.
     */
    const ledger = (declaredStoreys: number, ceilingStoreys: number | null): HTMLElement => {
        const law = lawModel();
        (law.ordinance as { maxFloors: number | null }).maxFloors = ceilingStoreys;
        const state = new Map<string, unknown>();
        const levels: { id: string; name: string; elevation: number }[] = [];
        for (let i = 0; i < declaredStoreys; i++) {
            levels.push({ id: `lvl-${i}`, name: `Storey ${i}`, elevation: i * 3 });
            state.set(`se-${i}`, {
                id: `se-${i}`, levelId: `lvl-${i}`, role: 'level',
                footprintAreaM2: 100, height: 3, baseOffset: 0, withinId: null,
            });
        }
        const snapshot = collectIntendedAreas({ getState: () => state } as never, levels);
        return buildIntentAgainstCeilingSection(buildIntentAgainstCeiling(snapshot, law), law);
    };

    it('an EXCEEDED ceiling pre-empts every other verdict in the collapsed digest', () => {
        const g = buildQuestionGroup(specOf('intent'));
        document.body.appendChild(g.element);
        g.body.appendChild(ledger(9, 6)); // nine storeys declared against a six-storey ceiling
        g.refreshDigest();
        expect(g.element.getAttribute(QUESTION_GROUP_CONFIDENCE_ATTR)).toBe('exceeds');
        expect(digestOf(g.element, 'intent')).not.toContain('nothing declared yet');
        g.dispose();
    });

    it('does NOT read the authoring status — that block is in question 2 now', () => {
        const g = buildQuestionGroup(specOf('intent'));
        document.body.appendChild(g.element);
        // ⛔ THE ARM THAT WOULD HAVE CAUGHT D-10 REPEATING IN QUESTION 3. Plant the block's old
        // headline probe in this body: if the spec still pointed at it, this digest would resolve
        // from a node the founder's question 3 does not contain.
        const decoy = document.createElement('div');
        decoy.setAttribute('data-testid', AUTHORING_STATUS_TESTID);
        decoy.setAttribute('data-state', 'done');
        decoy.textContent = 'DECOY — the authoring status lives in question 2';
        g.body.appendChild(decoy);
        g.refreshDigest();
        expect(digestOf(g.element, 'intent')).not.toContain('DECOY');
        expect(g.element.getAttribute(QUESTION_GROUP_CONFIDENCE_ATTR)).not.toBe('done');
        g.dispose();
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM 5 — PR-H-01 / C115-29: every attribute a digest depends on is WATCHED', () => {
    it('the MutationObserver filter covers every data-* the probes read or select on', () => {
        const src = readFileSync(resolve(__dirname, '../parcelLawQuestionGroup.ts'), 'utf8');
        const block = /attributeFilter:\s*\[([\s\S]*?)\]/.exec(src);
        expect(block, 'the observer no longer declares an attributeFilter').not.toBeNull();
        const watched = new Set([...block![1]!.matchAll(/'([^']+)'/g)].map((m) => m[1]!));

        // ⛔ `data-testid` is deliberately exempt: it is an identity, not a state — nothing mutates
        // one in place, and watching it would add churn without adding truth.
        const needed = new Set<string>();
        for (const g of PARCEL_LAW_QUESTION_GROUPS) {
            for (const p of [...g.headlineProbes, ...g.confidenceProbes]) {
                if (p.attr && p.attr.startsWith('data-')) needed.add(p.attr);
                for (const m of p.selector.matchAll(/\[(data-[a-z-]+)/g)) needed.add(m[1]!);
            }
        }
        needed.delete('data-testid');

        const missing = [...needed].filter((a) => !watched.has(a)).sort();
        expect(
            missing,
            'a digest reads these attributes but the observer does not watch them — the digest '
            + 'would render once and then freeze, which looks answered and is stale',
        ).toEqual([]);
    });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('ARM 6 — §ONE-TYPE-BASE: the relocated block adopts the panel\'s base (C115 §4.3)', () => {
    /**
     * ⚠ SCOPE, STATED. This measures the block's FIXED CHROME on a cold mount — the heading, the
     * source line, the storey entry, the create button, the status/advisory/intent lines and the
     * discard button. The per-storey rows built by `renderCreated()` (*Edit perimeter* / *Drag
     * face*) still carry `px` literals; that region is the FACE-DRAG lane's and is handed to it
     * rather than edited under it. Recording the exclusion is the point — an arm that quietly
     * skipped them would report a whole-file claim it had not measured.
     */
    const mountCold = (): { root: HTMLElement; dispose: () => void } => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        // ⛔ THE PRODUCTION PLACEMENT. The tab passes `lawCheckHost` (question 5's allowance slot),
        // so the BRUT/NET ledger — `buildBrutAllocationHtml`'s markup, governed by ITS own file —
        // is not inside this section at all. Mounting without it would measure another module's
        // typography here and report it as this lane's, which is the opposite of an honest arm.
        const ledgerHost = document.createElement('div');
        document.body.appendChild(ledgerHost);
        const h = authoringHarness();
        const handle = mountParcelLawEnvelopeAuthoring(host, h.deps, { lawCheckHost: ledgerHost });
        return { root: handle.element, dispose: () => handle.dispose() };
    };

    it('A — the root declares the base in px and NOTHING in the fixed chrome does', () => {
        const { root, dispose } = mountCold();
        expect(root.style.fontSize).toBe(`${PLAW_SCALE_BASE_PX}px`);
        for (const n of root.querySelectorAll<HTMLElement>('*')) {
            const fs = n.style.fontSize;
            if (fs.length === 0) continue;
            expect(fs, `${n.tagName}.${n.className} still carries a px literal`).not.toMatch(/px$/);
        }
        dispose();
    });

    it('B — every element resolves to 10 px or more, em-compounding included (C43 / WCAG 2.2 AA)', () => {
        // ⛔ THE ARM THAT SEES WHAT ARM A CANNOT. `0.87em` is legal everywhere; on a child of an
        // already-stepped element it lands at 8.7 px. Only resolving the chain finds that.
        const { root, dispose } = mountCold();
        for (const n of root.querySelectorAll<HTMLElement>('*')) {
            const px = effectivePx(n, root);
            expect(Number.isFinite(px), `${n.className} has no resolvable size`).toBe(true);
            expect(px, `${n.className} renders at ${px}px — below the 10px floor`).toBeGreaterThanOrEqual(10);
        }
        dispose();
    });

    it('C — the module\'s base EQUALS question 3\'s declared base, so the panel is set once', () => {
        // ⛔ Three declarations exist today (this module, `parcelLawFacts.ts`,
        // `parcelLawIntentAgainstCeiling.ts`). `parcelLawFacts.spec.ts` arm C pins those two to
        // each other; this pins the module to them, so the third copy cannot drift either.
        // Collapsing all three onto the module is the follow-up handed to the §1 lane.
        const intentSrc = readFileSync(resolve(__dirname, '../parcelLawIntentAgainstCeiling.ts'), 'utf8');
        const m = /const SCALE_BASE_PX = ([\d.]+);/.exec(intentSrc);
        expect(m, 'question 3 no longer declares a base — re-point this assertion, do not delete it')
            .not.toBeNull();
        expect(PLAW_SCALE_BASE_PX).toBe(Number.parseFloat(m![1]!));
    });

    it('D — form controls keep an explicit font-family, because they do not inherit one', () => {
        // Replacing `font:600 11px system-ui` with longhands drops `font-family` unless it is
        // restated: an input or button that omits it renders in the UA's own face beside prose
        // that does not, which is the inconsistency this lane was asked to remove.
        const { root, dispose } = mountCold();
        for (const n of root.querySelectorAll<HTMLElement>('input, button')) {
            expect(n.style.fontFamily, `${n.tagName} lost its font-family`).not.toBe('');
        }
        dispose();
    });
});
