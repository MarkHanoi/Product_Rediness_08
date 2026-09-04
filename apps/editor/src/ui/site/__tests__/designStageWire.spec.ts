/**
 * §RESI-ORCH-STAGE-WIRE (STR-RESIDENTIAL-DESIGN-ORCHESTRATOR §21) — THE PANEL CHANGES WITH THE
 * STAGE, AND THE "DO THIS NEXT" PILL ACTUALLY GOES SOMEWHERE.
 *
 * ⭐ WHAT THIS SUITE IS FOR. `designStageModel.spec.ts` proves the ladder (where am I, why is a
 * stage unreached). It asserts nothing about the CARD. Meanwhile `describeEnvelopeCardSections`
 * and `wireDesignStageStrip` shipped in `28df89be` with **zero production callers** — the
 * [[authored-but-unwired-is-the-bottleneck]] shape, one hop below [[committed-is-not-reachable]].
 * This suite closes both halves at once: it renders the REAL strip, mounts the REAL card markup,
 * CLICKS the pill, and asserts the control it landed on is the one the card actually emits.
 *
 * ⛔ It never builds its own button and then finds it. Every element under test comes out of the
 * shipped builders, and the source pins at the end prove `GISAreaLayout` calls them.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
    describeEnvelopeCardSections,
    ENVELOPE_CARD_SECTIONS,
    ENVELOPE_CARD_SECTION_STAGE,
    DESIGN_STAGE_CARD_CONTROL,
    DESIGN_STAGE_CONTROL_ATTR,
    type EnvelopeCardSection,
} from '../designStagePanel';
import {
    wireDesignStageStrip,
    jumpToStageControl,
    DESIGN_STAGE_JUMP_ATTR,
    DESIGN_STAGE_JUMP_STATUS_TESTID,
} from '../designStageStripControl';
import { describeDesignStages, type DesignStageInputs } from '../designStageModel';
import {
    buildDesignStageStripHtml,
    buildStagedSectionsHtml,
    buildTargetAreaEntryHtml,
    buildIntendedAreaFold,
    STAGE_GATE_ATTR,
    TARGET_AREA_ADOPT_BTN_TESTID,
    TARGET_AREA_ADOPT_STATUS_TESTID,
    INTENDED_AREA_SECTION_TESTID,
} from '../envelopeCardSections';
import { collectIntendedAreas } from '../intendedAreaChannel';

afterEach(() => {
    document.body.innerHTML = '';
});

/** A parcel with a solved envelope and nothing authored — the founder's slice-1 state. */
const AT_MASSING: DesignStageInputs = {
    hasCommittedParcel: true,
    hasResolvedEnvelope: true,
    hasMassingProposal: false,
    hasProgramme: null,
    designedStoreyCount: 0,
    hasRooms: false,
    measurementFailed: false,
};

const NOTHING_YET: DesignStageInputs = { ...AT_MASSING, hasResolvedEnvelope: false };

// ─────────────────────────────────────────────────────────────────────────────
// The section plan — ORDER and GATE, never HIDE
// ─────────────────────────────────────────────────────────────────────────────

describe('describeEnvelopeCardSections — the panel reacts to the stage', () => {
    it('returns EVERY section exactly once, whatever the stage', () => {
        for (const inputs of [AT_MASSING, NOTHING_YET, { ...AT_MASSING, designedStoreyCount: 2 }]) {
            const plan = describeEnvelopeCardSections(describeDesignStages(inputs));
            expect([...plan.order].sort()).toEqual([...ENVELOPE_CARD_SECTIONS].sort());
        }
    });

    it('at massing: the massing sections LEAD and the BIM measurement folds are GATED', () => {
        const plan = describeEnvelopeCardSections(describeDesignStages(AT_MASSING));
        expect(plan.leadStage).toBe('massing');
        expect(plan.byId['target-area'].relevance).toBe('lead');
        expect(plan.byId.cost.relevance).toBe('lead');
        expect(plan.byId['intended-area'].relevance).toBe('lead');
        expect(plan.byId['designed-vs-permitted'].relevance).toBe('gated');
        expect(plan.byId['per-level'].relevance).toBe('gated');
        // The massing sections come FIRST in the rendered order.
        expect(plan.order.indexOf('target-area'))
            .toBeLessThan(plan.order.indexOf('designed-vs-permitted'));
    });

    it('a gated section carries a NON-EMPTY reason; a lead/neutral one carries none', () => {
        const plan = describeEnvelopeCardSections(describeDesignStages(AT_MASSING));
        for (const s of ENVELOPE_CARD_SECTIONS) {
            const p = plan.byId[s];
            if (p.relevance === 'gated') expect(p.reason, s).toBeTruthy();
            else expect(p.reason, s).toBeNull();
        }
    });

    it('once a storey is authored, the measurement folds stop being gated', () => {
        const plan = describeEnvelopeCardSections(
            describeDesignStages({ ...AT_MASSING, designedStoreyCount: 2 }),
        );
        expect(plan.byId['designed-vs-permitted'].relevance).not.toBe('gated');
        expect(plan.byId['per-level'].relevance).not.toBe('gated');
    });

    it('⛔ the parcel/law FLOOR is never gated — it is what every stage stands on', () => {
        for (const inputs of [AT_MASSING, NOTHING_YET, { ...AT_MASSING, measurementFailed: true }]) {
            const plan = describeEnvelopeCardSections(describeDesignStages(inputs));
            for (const s of ENVELOPE_CARD_SECTIONS) {
                if (ENVELOPE_CARD_SECTION_STAGE[s] === null) {
                    expect(plan.byId[s].relevance, s).not.toBe('gated');
                }
            }
        }
    });

    it('⛔ NO stages (the computation failed) ⇒ canonical order, NOTHING gated', () => {
        const plan = describeEnvelopeCardSections([]);
        expect(plan.order).toEqual(ENVELOPE_CARD_SECTIONS);
        expect(plan.leadStage).toBeNull();
        for (const s of ENVELOPE_CARD_SECTIONS) expect(plan.byId[s].relevance, s).not.toBe('gated');
    });

    it('⛔ INTENDED serves MASSING, not BIM — it is the one area channel that speaks before BIM', () => {
        expect(ENVELOPE_CARD_SECTION_STAGE['intended-area']).toBe('massing');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The rendered sections — greyed WITH the reason, never removed
// ─────────────────────────────────────────────────────────────────────────────

describe('buildStagedSectionsHtml', () => {
    const HTML: Partial<Record<EnvelopeCardSection, string>> = {
        'designed-vs-permitted': '<div id="dvp">designed</div>',
        'per-level': '<div id="pl">per level</div>',
        'target-area': '<div id="ta">target</div>',
        'site-data': '<div id="sd">site</div>',
    };

    it('⛔ a gated section is STILL RENDERED — greyed, with its reason, never hidden', () => {
        const plan = describeEnvelopeCardSections(describeDesignStages(AT_MASSING));
        const html = buildStagedSectionsHtml(plan, HTML);
        document.body.innerHTML = html;
        // present
        expect(document.querySelector('#dvp')).not.toBeNull();
        // and wrapped in a gate that carries the reason
        const gate = document.querySelector(`[${STAGE_GATE_ATTR}="designed-vs-permitted"]`);
        expect(gate).not.toBeNull();
        expect(gate!.textContent ?? '').toContain('authored building element');
    });

    it('a lead/neutral section is rendered WITHOUT a gate wrapper', () => {
        const plan = describeEnvelopeCardSections(describeDesignStages(AT_MASSING));
        document.body.innerHTML = buildStagedSectionsHtml(plan, HTML);
        expect(document.querySelector(`[${STAGE_GATE_ATTR}="target-area"]`)).toBeNull();
        expect(document.querySelector('#ta')).not.toBeNull();
    });

    it('the DOM order follows the plan order, not the object key order', () => {
        const plan = describeEnvelopeCardSections(describeDesignStages(AT_MASSING));
        document.body.innerHTML = buildStagedSectionsHtml(plan, HTML);
        const text = document.body.innerHTML;
        expect(text.indexOf('id="ta"')).toBeLessThan(text.indexOf('id="dvp"'));
    });

    it('⛔ a section the card did not build is SKIPPED — no gate note over an absent section', () => {
        const plan = describeEnvelopeCardSections(describeDesignStages(AT_MASSING));
        document.body.innerHTML = buildStagedSectionsHtml(plan, { ...HTML, 'per-level': '' });
        expect(document.querySelector(`[${STAGE_GATE_ATTR}="per-level"]`)).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// The strip's next-step affordance — a real jump, or a sentence. Never a dead button.
// ─────────────────────────────────────────────────────────────────────────────

describe('buildDesignStageStripHtml — the "do this next" pill', () => {
    it('emits a REAL button when the available stage is controlled on this card', () => {
        const stages = describeDesignStages(AT_MASSING);
        const next = stages.find((s) => s.state === 'available');
        expect(next?.stage).toBe('requirements'); // massing is already REACHED here
        // Force the on-card case: a project with no envelope offers `massing`, whose control is
        // on the card by `DESIGN_STAGE_CARD_CONTROL`.
        const onCard = describeDesignStages(NOTHING_YET);
        expect(onCard.find((s) => s.state === 'available')?.stage).toBe('massing');
        expect(DESIGN_STAGE_CARD_CONTROL.massing.onCard).toBe(true);
        document.body.innerHTML = buildDesignStageStripHtml(onCard);
        const btn = document.querySelector(`button[${DESIGN_STAGE_JUMP_ATTR}="massing"]`);
        expect(btn).not.toBeNull();
        expect(document.querySelector(`[data-testid="${DESIGN_STAGE_JUMP_STATUS_TESTID}"]`)).not.toBeNull();
    });

    it('⛔ emits a SENTENCE, never a button, when the control lives on another surface', () => {
        document.body.innerHTML = buildDesignStageStripHtml(describeDesignStages(AT_MASSING));
        expect(document.querySelector(`button[${DESIGN_STAGE_JUMP_ATTR}]`)).toBeNull();
        const say = document.querySelector('[data-design-stage-elsewhere="requirements"]');
        expect(say).not.toBeNull();
        expect(say!.textContent ?? '').toContain('Data Workbench');
    });

    it('offers NOTHING when no stage is available (no parcel — the fix is upstream of this strip)', () => {
        const stages = describeDesignStages({ ...NOTHING_YET, hasCommittedParcel: false });
        document.body.innerHTML = buildDesignStageStripHtml(stages);
        expect(document.querySelector(`button[${DESIGN_STAGE_JUMP_ATTR}]`)).toBeNull();
        expect(document.querySelector('[data-design-stage-elsewhere]')).toBeNull();
    });

    it('every pill still carries its reason in a title — reached or not', () => {
        document.body.innerHTML = buildDesignStageStripHtml(describeDesignStages(AT_MASSING));
        const pills = [...document.querySelectorAll('[data-design-stage]')];
        expect(pills.length).toBe(5);
        for (const p of pills) expect(p.getAttribute('title') ?? '', p.outerHTML).not.toBe('');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE CLICK. The pill, the real card control, and the jump between them.
// ─────────────────────────────────────────────────────────────────────────────

describe('wireDesignStageStrip — click it', () => {
    /** The strip plus the REAL target-area control, inside a closed fold, as the card emits them. */
    function mountCardWithControl(): HTMLElement {
        const host = document.createElement('div');
        host.innerHTML =
            buildDesignStageStripHtml(describeDesignStages(NOTHING_YET))
            + `<details data-testid="fold">`
            + `<summary>s</summary>`
            + buildTargetAreaEntryHtml(400, null, false, null)
            + `</details>`;
        document.body.appendChild(host);
        return host;
    }

    it('the REAL target-area entry carries the jump target attribute', () => {
        document.body.innerHTML = buildTargetAreaEntryHtml(400, null, false, null);
        expect(document.querySelector(`[${DESIGN_STAGE_CONTROL_ATTR}="massing"]`)).not.toBeNull();
    });

    it('clicking the pill opens the fold, marks the control and clears the status line', () => {
        const host = mountCardWithControl();
        expect(wireDesignStageStrip(host)).toBe(1);
        const fold = host.querySelector<HTMLDetailsElement>('details[data-testid="fold"]')!;
        expect(fold.open).toBe(false);
        host.querySelector<HTMLButtonElement>(`button[${DESIGN_STAGE_JUMP_ATTR}="massing"]`)!.click();
        expect(fold.open).toBe(true);
        expect(
            host.querySelector(`[${DESIGN_STAGE_CONTROL_ATTR}="massing"]`)!.getAttribute('data-stage-jumped'),
        ).toBe('1');
        expect(
            host.querySelector(`[data-testid="${DESIGN_STAGE_JUMP_STATUS_TESTID}"]`)!.textContent,
        ).toBe('');
    });

    it('⛔ a jump with NO target on this arm PRINTS A SENTENCE — never a click that evaporates', () => {
        const host = document.createElement('div');
        host.innerHTML = buildDesignStageStripHtml(describeDesignStages(NOTHING_YET));
        document.body.appendChild(host);
        wireDesignStageStrip(host);
        expect(jumpToStageControl(host, 'massing')).toBe(false);
        const status = host.querySelector(`[data-testid="${DESIGN_STAGE_JUMP_STATUS_TESTID}"]`)!;
        expect(status.textContent ?? '').not.toBe('');
    });

    it('wires nothing, and does not throw, when no pill is present', () => {
        const host = document.createElement('div');
        host.innerHTML = '<div>no strip here</div>';
        expect(wireDesignStageStrip(host)).toBe(0);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §RESI-ORCH-ADOPT — the CONFIRM affordance is offered only when there is something to keep
// ─────────────────────────────────────────────────────────────────────────────

describe('buildTargetAreaEntryHtml — the adopt (keep) step', () => {
    it('⛔ NO adopt button when there is no live proposal — withheld, not disabled', () => {
        document.body.innerHTML = buildTargetAreaEntryHtml(400, null, false, null, null);
        expect(document.querySelector(`[data-testid="${TARGET_AREA_ADOPT_BTN_TESTID}"]`)).toBeNull();
    });

    it('offers the button, and says what it will record, when a proposal is live', () => {
        document.body.innerHTML = buildTargetAreaEntryHtml(
            400, 'Fitted 118 m².', false, 120, { statement: null, failed: false },
        );
        const btn = document.querySelector(`[data-testid="${TARGET_AREA_ADOPT_BTN_TESTID}"]`);
        expect(btn).not.toBeNull();
        expect(btn!.textContent).toContain('level envelope');
        expect(document.body.textContent ?? '').toContain('not a permit');
    });

    it('⛔ a failed adopt renders in the REFUSAL arm, carried — never sniffed out of the prose', () => {
        document.body.innerHTML = buildTargetAreaEntryHtml(
            400, 'Fitted 118 m².', false, 120,
            { statement: 'This project has no storeys yet.', failed: true },
        );
        const st = document.querySelector(`[data-testid="${TARGET_AREA_ADOPT_STATUS_TESTID}"]`)!;
        expect(st.getAttribute('data-state')).toBe('refused');
    });

    it('a successful adopt renders in the DONE arm', () => {
        document.body.innerHTML = buildTargetAreaEntryHtml(
            400, 'Fitted 118 m².', false, 120,
            { statement: 'Created — one undo removes it.', failed: false },
        );
        expect(
            document.querySelector(`[data-testid="${TARGET_AREA_ADOPT_STATUS_TESTID}"]`)!
                .getAttribute('data-state'),
        ).toBe('done');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §RESI-ORCH-INTENDED — the THIRD area channel, never summed into the other two
// ─────────────────────────────────────────────────────────────────────────────

describe('buildIntendedAreaFold', () => {
    const arm = (): string | null =>
        document.querySelector(`[data-testid="${INTENDED_AREA_SECTION_TESTID}"]`)?.getAttribute('data-state')
        ?? null;

    it('⛔ NO STORE is an admission about PRYZM, not a finding that nothing is intended', () => {
        document.body.innerHTML = buildIntendedAreaFold(collectIntendedAreas(null, []));
        expect(arm()).toBe('unreadable');
        expect(document.body.textContent ?? '').toContain('NOT a finding');
    });

    it('a readable, EMPTY store is a FINDING — a different arm from unreadable', () => {
        const store = { getState: () => new Map<string, unknown>() };
        document.body.innerHTML = buildIntendedAreaFold(collectIntendedAreas(store, []));
        expect(arm()).toBe('none-declared');
    });

    it('a throwing store is `unreadable`, never empty', () => {
        const store = { getState: () => { throw new Error('boom'); } };
        document.body.innerHTML = buildIntendedAreaFold(collectIntendedAreas(store, []));
        expect(arm()).toBe('unreadable');
    });

    it('⛔ ROOM envelopes alone never produce an area — a room sits WITHIN a level', () => {
        const store = {
            getState: () => new Map<string, unknown>([
                ['a', { role: 'room', levelId: 'L1', footprintAreaM2: 40 }],
            ]),
        };
        document.body.innerHTML = buildIntendedAreaFold(collectIntendedAreas(store, []));
        expect(arm()).toBe('rooms-only');
        expect(document.body.textContent ?? '').not.toContain('40 m²');
    });

    it('sums LEVEL envelopes per storey and names the storey when the level store knows it', () => {
        const store = {
            getState: () => new Map<string, unknown>([
                ['a', { role: 'level', levelId: 'L1', footprintAreaM2: 118 }],
                ['b', { role: 'level', levelId: 'L1', footprintAreaM2: 22 }],
                ['c', { role: 'level', levelId: 'L2', footprintAreaM2: 90 }],
            ]),
        };
        document.body.innerHTML = buildIntendedAreaFold(collectIntendedAreas(store, [
            { id: 'L1', name: 'Ground', elevation: 0 },
            { id: 'L2', name: 'First', elevation: 3 },
        ]));
        expect(arm()).toBe('declared');
        const text = document.body.textContent ?? '';
        expect(text).toContain('Ground');
        expect(text).toContain('140 m²');
        expect(text).toContain('230 m²'); // the total
        // The rider states the C114 §3a rule in the user's words.
        expect(text).toContain('does not add them together');
    });

    it('⛔ an envelope naming a storey the project does not have is SHOWN, never dropped', () => {
        const store = {
            getState: () => new Map<string, unknown>([
                ['a', { role: 'level', levelId: 'GHOST', footprintAreaM2: 55 }],
            ]),
        };
        document.body.innerHTML = buildIntendedAreaFold(collectIntendedAreas(store, []));
        expect(document.querySelector('[data-dangling-level="GHOST"]')).not.toBeNull();
        expect(document.body.textContent ?? '').toContain('55 m²');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// THE SOURCE PINS — the card must CALL these, or every test above certifies a shelf
// ─────────────────────────────────────────────────────────────────────────────

describe('GISAreaLayout actually calls the wires', () => {
    const card = readFileSync(
        resolve(__dirname, '../../layout/GISAreaLayout.ts'),
        'utf8',
    );

    it('orders its sections through buildStagedSectionsHtml on BOTH card arms', () => {
        expect(card.split('buildStagedSectionsHtml(sectionPlan').length - 1).toBe(2);
        expect(card).toContain('describeEnvelopeCardSections(designStages)');
    });

    it('wires the stage strip on BOTH card arms', () => {
        expect(card.split('wireDesignStageStrip(panel)').length - 1).toBe(2);
    });

    it('renders the intended-area channel and wires the adopt button', () => {
        expect(card).toContain('buildIntendedAreaFold(collectIntendedAreas(');
        expect(card).toContain('wireTargetAreaAdopt(panel)');
    });

    it('⛔ speaks the ONE batch create verb and mints the id ITSELF (C16 CA-2 / C114 §6a)', () => {
        expect(card).toContain("createId('spaceEnvelope')");
        expect(card).toContain('buildAdoptProposalPlan(');
        // The command string never appears as a literal here — it travels on the plan, so the
        // card cannot drift from the verb the plugin registered.
        expect(card).not.toContain("executeCommand('spaceEnvelope");
        expect(card).toContain('bus.executeCommand(plan.command, plan.payload)');
    });
});
