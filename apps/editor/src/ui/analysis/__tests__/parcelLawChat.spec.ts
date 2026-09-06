// §PL-CHAT — the REACHABILITY half, and THE ACCEPTANCE CRITERION OF STR §25.4.
//
// ⭐⭐ THE CASE THIS FILE EXISTS FOR is `the two paths produce the SAME command`. The founder's
// sentence is *"so user can chat via RAC OR define via data manually input"* — two alternatives,
// which is only true if they agree. So the central case drives the REAL `mountParcelLawEnvelopeAuthoring`
// twice over the same fixture: once by typing into its field and pressing its button, once by
// sending a sentence to the chat — and asserts the recorded `bus.executeCommand` payloads are
// deeply equal. Not "both succeeded"; the SAME BYTES.
//
// ⛔ WHAT A GREEN RUN HERE STILL DOES NOT ESTABLISH (stated so it is not misread): the bus and the
// space-envelope store are FAKES OF THE SEAM, and nothing here has been seen in a browser. What it
// does establish is that the language path and the field path converge on one dispatcher — which
// is the property that cannot be re-checked by reading, because it is about two code paths.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    PARCEL_LAW_CHAT_BUBBLE_TESTID,
    PARCEL_LAW_CHAT_CONFIRM_TESTID,
    PARCEL_LAW_CHAT_INPUT_TESTID,
    PARCEL_LAW_CHAT_ROUTE_ATTR,
    PARCEL_LAW_CHAT_SEND_TESTID,
    PARCEL_LAW_CHAT_TESTID,
    PARCEL_LAW_CHAT_TURNS_ATTR,
    defaultParcelLawChatDeps,
    mountParcelLawChat,
    type ParcelLawChatDeps,
    type ParcelLawChatHooks,
} from '../parcelLawChat';
import {
    AUTHORING_CREATE_BTN_TESTID,
    AUTHORING_STATUS_TESTID,
    AUTHORING_STOREYS_INPUT_TESTID,
    mountParcelLawEnvelopeAuthoring,
    type ParcelLawEnvelopeAuthoringDeps,
} from '../parcelLawEnvelopeAuthoring';
import {
    LIVE_QUANTITIES_APPLY_BTN_TESTID,
    LIVE_QUANTITIES_CURRENCY_TESTID,
    LIVE_QUANTITIES_RATE_INPUT_TESTID,
    LIVE_QUANTITIES_STATUS_TESTID,
} from '../../site/liveQuantitiesSection';
import {
    TARGET_AREA_INPUT_TESTID,
    TARGET_AREA_SOLVE_BTN_TESTID,
    TARGET_AREA_STATUS_TESTID,
} from '../../site/envelopeCardSections';
import type { ParcelLawModel } from '../../site/parcel/parcelLawModel';
import { __resetTargetFootprintProposalForTests } from '../../site/targetFootprintAreaState';

const RING = [{ x: 0, z: 0 }, { x: 20, z: 0 }, { x: 20, z: 10 }, { x: 0, z: 10 }];

/** The founder's worked example: 1,200 m² parcel · 200 m² footprint · FAR ⇒ 320 m² BRUT. */
function model(): ParcelLawModel {
    return {
        identity: null,
        identityAbsence: 'none',
        committedAreaM2: 1200,
        geometry: {
            areaM2: 1200, perimeterM: 140, bboxWidthM: 40, bboxDepthM: 30,
            edgeCount: 4, frontageClause: 'x', frontEdgeCount: 1,
        },
        geometryAbsence: null,
        envelopeState: 'determined',
        refusal: null,
        ordinance: {
            zoneCode: 'generic-urban', buildableDepthM: null, depthIsBlockGranular: false,
            depthTerm: 'depth', alignmentOffsetM: null, maxHeightM: 12, maxFloors: 4,
            maxFAR: 320 / 1200, maxCoveragePct: 50, setbackFrontM: null, setbackSideM: null,
            setbackRearM: null, citation: null, sourceId: null,
        },
        massing: {
            footprintM2: 200, footprintIsUpperBound: false, coveragePct: 16.7,
            footprintPerimeterM: 60, gfaM2: 800, studyVolumeM3: 2400,
        },
        perStorey: null, capacity: null, confidence: null, determinedAtIso: null,
    } as ParcelLawModel;
}

interface Rig {
    readonly container: HTMLElement;
    readonly executed: { type: string; payload: unknown }[];
}

/** Mount the REAL authoring section into a fresh container over a fake bus + store. */
function mountAuthoringRig(): Rig {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const executed: { type: string; payload: unknown }[] = [];
    const state = new Map<string, unknown>();
    const listeners: (() => void)[] = [];
    const runtime = {
        bus: {
            executeCommand: (type: string, payload: unknown) => {
                executed.push({ type, payload });
                const p = payload as { envelopes: { spaceEnvelopeId: string; levelId: string }[] };
                for (const e of p.envelopes) {
                    state.set(e.spaceEnvelopeId, {
                        id: e.spaceEnvelopeId, levelId: e.levelId, role: 'level',
                        footprintAreaM2: 200, withinId: null,
                    });
                }
                for (const l of listeners) l();
            },
        },
        stores: {
            spaceEnvelope: {
                getState: () => state,
                subscribeDirty: (fn: () => void) => { listeners.push(fn); return () => { }; },
            },
        },
    };
    let idn = 0;
    const deps: ParcelLawEnvelopeAuthoringDeps = {
        runtime: () => runtime as never,
        readLevels: () => [
            { id: 'lvl-0', name: 'Ground', elevation: 0, height: 3 },
            { id: 'lvl-1', name: 'Level 1', elevation: 3, height: 3 },
            { id: 'lvl-2', name: 'Level 2', elevation: 6, height: 3 },
            { id: 'lvl-3', name: 'Level 3', elevation: 9, height: 3 },
        ],
        readModel: () => model(),
        readEnvelopeRing: () => RING,
        // Deterministic, and RESTARTED per rig — so two rigs mint identical ids and a byte-for-byte
        // payload comparison is meaningful rather than defeated by an id counter.
        mintId: () => `se-${++idn}`,
        capabilityHost: {
            spaceEnvelopeTool: { enterProfileEditMode: vi.fn(), profileEditAvailability: () => ({ ok: true }) },
        },
    };
    mountParcelLawEnvelopeAuthoring(container, deps);
    return { container, executed };
}

const inRig = <T extends Element>(rig: Rig, testid: string): T =>
    rig.container.querySelector<T>(`[data-testid="${testid}"]`)!;

/** Chat deps scoped to one rig, with an injectable ladder so no real bridge is loaded. */
function chatDeps(
    rig: Rig,
    fallThrough: ParcelLawChatDeps['fallThrough'] = vi.fn(async () => false),
): ParcelLawChatDeps {
    return { ...defaultParcelLawChatDeps(() => rig.container), fallThrough };
}

beforeEach(() => {
    document.body.replaceChildren();
    __resetTargetFootprintProposalForTests();
});

describe('⭐ THE ACCEPTANCE CRITERION — typed and asked produce the SAME command', () => {
    it('dispatches byte-identical payloads for the field gesture and the sentence', async () => {
        // ── PATH A: the human types 3 into the field and presses the button. ─────────────────
        const typed = mountAuthoringRig();
        const input = inRig<HTMLInputElement>(typed, AUTHORING_STOREYS_INPUT_TESTID);
        input.value = '3';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        inRig<HTMLButtonElement>(typed, AUTHORING_CREATE_BTN_TESTID).click();

        // ── PATH B: the human says it. Fresh rig, so the ids restart identically. ────────────
        const asked = mountAuthoringRig();
        const host = document.createElement('div');
        asked.container.appendChild(host);
        const chat = mountParcelLawChat(host, chatDeps(asked));
        const route = await chat.send('create a 3 storey envelope');

        expect(route).toBe('parcel-law');
        expect(typed.executed).toHaveLength(1);
        expect(asked.executed).toHaveLength(1);
        expect(typed.executed[0]!.type).toBe('spaceEnvelope.batch.create');
        // ⭐ THE ASSERTION. Same verb, same payload, same ids, same one undo entry.
        expect(asked.executed).toEqual(typed.executed);
    });

    it('shows the value it typed IN THE FIELD, so the user can see the two paths are one', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const chat = mountParcelLawChat(host, chatDeps(rig));
        await chat.send('create a 2 storey envelope');
        expect(inRig<HTMLInputElement>(rig, AUTHORING_STOREYS_INPUT_TESTID).value).toBe('2');
    });

    it('answers with the SECTION’S OWN status sentence, never one of its own', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const chat = mountParcelLawChat(host, chatDeps(rig));
        await chat.send('create a 3 storey envelope');
        const sectionSaid = inRig(rig, AUTHORING_STATUS_TESTID).textContent!.replace(/\s+/g, ' ').trim();
        const bubbles = Array.from(host.querySelectorAll(`[data-testid="${PARCEL_LAW_CHAT_BUBBLE_TESTID}"][data-role="pryzm"]`));
        const last = bubbles[bubbles.length - 1]!.textContent ?? '';
        expect(sectionSaid.length).toBeGreaterThan(0);
        expect(last).toContain(sectionSaid);
    });
});

describe('the chat is a FRONT of the shipped ladder, not a replacement for it', () => {
    it('hands an unrecognised sentence to the ladder and reports route "ladder" when it answers', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        // Typed by hand rather than through `mock.calls`, so the assertion reads the QUERY the
        // ladder was handed rather than a tuple TypeScript has to be told the shape of.
        const handed: string[] = [];
        const ladder: ParcelLawChatDeps['fallThrough'] = async (text) => { handed.push(text); return true; };
        const chat = mountParcelLawChat(host, chatDeps(rig, ladder));
        const route = await chat.send('make all the walls 3 metres tall');
        expect(handed).toEqual(['make all the walls 3 metres tall']);
        expect(route).toBe('ladder');
        // ⛔ AND NOTHING WAS DISPATCHED HERE. A parcel-law front that also fired a create on a
        // wall sentence would be a second dispatcher with a parser in front of it.
        expect(rig.executed).toHaveLength(0);
    });

    it('says so honestly — and names what it does drive — when nobody answered', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const chat = mountParcelLawChat(host, chatDeps(rig, vi.fn(async () => false)));
        const route = await chat.send('write me a poem about setbacks');
        expect(route).toBe('unanswered');
        expect(host.textContent).toContain('I did not understand that');
        expect(host.textContent).toContain('create a 3 storey envelope');
        expect(rig.executed).toHaveLength(0);
    });

    it('reports a ladder that THREW as a wiring failure, never as an answer about the parcel', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const throwing: ParcelLawChatDeps['fallThrough'] = async () => { throw new Error('boom'); };
        const chat = mountParcelLawChat(host, chatDeps(rig, throwing));
        const route = await chat.send('make all the walls 3 metres tall');
        expect(route).toBe('unanswered');
        expect(host.textContent).toContain('wiring failure on my side, not an answer about your parcel');
    });
});

describe('ask, never guess — and never stay silent about a clause you heard', () => {
    it('asks how many levels instead of defaulting to one', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const chat = mountParcelLawChat(host, chatDeps(rig));
        const route = await chat.send('create the envelope');
        expect(route).toBe('clarify');
        expect(host.textContent).toContain('How many floor levels');
        expect(rig.executed).toHaveLength(0);
    });

    it('names an orientation clause it heard and did not act on', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const chat = mountParcelLawChat(host, chatDeps(rig));
        await chat.send('create a 3 storey envelope, south facing');
        expect(rig.executed).toHaveLength(1);
        expect(host.textContent).toContain('does not yet solve a shape TO an orientation');
    });
});

/**
 * A stand-in for a control this chat drives that lives on the SINGLETON envelope card, which the
 * rig above does not mount. It carries the REAL exported testids and records exactly what a real
 * control would observe: the value at click time, and which events it received.
 *
 * ⛔ This proves the DRIVE MECHANISM, not the card. Assigning `.value` fires nothing at all, so a
 * chat that "typed" a number without dispatching an event would look right on screen and never
 * reach the control's state — the failure this stub exists to make visible.
 */
function stubField(
    parent: HTMLElement,
    inputTestid: string, btnTestid: string, statusTestid: string, statusText: string,
): { readonly seen: string[]; readonly valueAtClick: () => string | null } {
    const seen: string[] = [];
    let valueAtClick: string | null = null;
    const input = document.createElement('input');
    input.setAttribute('data-testid', inputTestid);
    input.addEventListener('input', () => seen.push('input'));
    input.addEventListener('change', () => seen.push('change'));
    const btn = document.createElement('button');
    btn.setAttribute('data-testid', btnTestid);
    const status = document.createElement('div');
    status.setAttribute('data-testid', statusTestid);
    btn.onclick = (): void => { valueAtClick = input.value; status.textContent = statusText; };
    parent.append(input, btn, status);
    return { seen, valueAtClick: () => valueAtClick };
}

describe('the happy path of a control the chat does NOT own — the drive mechanism', () => {
    it('types the ground-floor area, fires the events, presses Solve, and quotes the answer', async () => {
        const rig = mountAuthoringRig();
        const field = stubField(
            rig.container, TARGET_AREA_INPUT_TESTID, TARGET_AREA_SOLVE_BTN_TESTID,
            TARGET_AREA_STATUS_TESTID,
            '180 m² does not fit inside the 120 m² permitted footprint.');
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const chat = mountParcelLawChat(host, chatDeps(rig));
        await chat.send('I want 180 sqm on the ground floor');
        expect(field.valueAtClick()).toBe('180');
        expect(field.seen).toEqual(['input', 'change']);
        // ⭐ THE REPLY IS THE CONTROL'S OWN REFUSAL, carried through verbatim — including the two
        // numbers. The chat has no sentence of its own to say about the law.
        expect(host.textContent).toContain('does not fit inside the 120 m² permitted footprint');
    });

    it('sets the cost rate and its NAMED currency, and never invents a currency', async () => {
        const rig = mountAuthoringRig();
        const sel = document.createElement('select');
        sel.setAttribute('data-testid', LIVE_QUANTITIES_CURRENCY_TESTID);
        for (const c of ['EUR', 'GBP']) {
            const o = document.createElement('option');
            o.value = c; o.textContent = c; sel.appendChild(o);
        }
        rig.container.appendChild(sel);
        const field = stubField(
            rig.container, LIVE_QUANTITIES_RATE_INPUT_TESTID, LIVE_QUANTITIES_APPLY_BTN_TESTID,
            LIVE_QUANTITIES_STATUS_TESTID, 'Rate set — your assumption, not a published figure.');
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const chat = mountParcelLawChat(host, chatDeps(rig));
        await chat.send('cost 1800 gbp per m2');
        expect(field.valueAtClick()).toBe('1800');
        expect(sel.value).toBe('GBP');
        expect(host.textContent).toContain('your assumption, not a published figure');

        // A currency the select does not offer is NOT forced in — the field would then show a code
        // the section cannot price in. The amount still lands.
        await chat.send('cost 2000 huf per m2');
        expect(sel.value).toBe('GBP');
        expect(field.valueAtClick()).toBe('2000');
    });
});

describe('a control that is not on the panel is an ADMISSION, not a silent no-op', () => {
    it('reports the missing ground-floor field and dispatches nothing', async () => {
        // The buildable-envelope card (which owns that field) can be held by the rail PARCEL panel
        // instead of this tab — the singleton case `parcelLawTab.ts` documents.
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const chat = mountParcelLawChat(host, chatDeps(rig));
        const route = await chat.send('180 m2 on the ground floor');
        expect(route).toBe('parcel-law');
        expect(host.textContent).toContain('I could not find the ground-floor area field');
        expect(host.textContent).toContain('not a refusal about your parcel');
        expect(rig.executed).toHaveLength(0);
    });

    it('answers a question about a section that is not rendered with a gap, not a zero', async () => {
        const bare = document.createElement('div');
        document.body.appendChild(bare);
        const host = document.createElement('div');
        bare.appendChild(host);
        const chat = mountParcelLawChat(host, { ...defaultParcelLawChatDeps(() => bare), fallThrough: vi.fn(async () => false) });
        await chat.send('what does the law allow here?');
        expect(host.textContent).toContain('is not rendered right now');
        expect(host.textContent).toContain('NOT a finding that the number is zero');
    });
});

describe('the surface itself', () => {
    it('mounts, greets, and tracks its turns and its route', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const chat = mountParcelLawChat(host, chatDeps(rig));
        const root = host.querySelector(`[data-testid="${PARCEL_LAW_CHAT_TESTID}"]`)!;
        expect(root.getAttribute(PARCEL_LAW_CHAT_TURNS_ATTR)).toBe('0');
        await chat.send('create a 3 storey envelope');
        expect(root.getAttribute(PARCEL_LAW_CHAT_TURNS_ATTR)).toBe('1');
        expect(root.getAttribute(PARCEL_LAW_CHAT_ROUTE_ATTR)).toBe('parcel-law');
    });

    it('sends on the button and on Enter, through the same one path', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        mountParcelLawChat(host, chatDeps(rig));
        const input = host.querySelector<HTMLInputElement>(`[data-testid="${PARCEL_LAW_CHAT_INPUT_TESTID}"]`)!;
        input.value = 'create a 3 storey envelope';
        host.querySelector<HTMLButtonElement>(`[data-testid="${PARCEL_LAW_CHAT_SEND_TESTID}"]`)!.click();
        await Promise.resolve();
        await Promise.resolve();
        expect(rig.executed).toHaveLength(1);
        expect(input.value).toBe('');
    });

    it('resolves an unanswered Confirm card as FALSE on dispose — a decline, never an approval', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        let answer: Promise<boolean> | null = null;
        const gate: ParcelLawChatDeps['fallThrough'] = async (_text, hooks: ParcelLawChatHooks) => {
            answer = hooks.confirm('Delete 40 walls?');
            return true;
        };
        const chat = mountParcelLawChat(host, chatDeps(rig, gate));
        await chat.send('delete everything');
        expect(host.querySelector(`[data-testid="${PARCEL_LAW_CHAT_CONFIRM_TESTID}"]`)).not.toBeNull();
        chat.dispose();
        await expect(answer!).resolves.toBe(false);
    });

    it('never throws out of a turn, whatever the resolver does', async () => {
        const rig = mountAuthoringRig();
        const host = document.createElement('div');
        rig.container.appendChild(host);
        const chat = mountParcelLawChat(host, {
            ...chatDeps(rig),
            resolve: () => { throw new Error('resolver exploded'); },
        });
        const route = await chat.send('anything');
        expect(route).toBe('unanswered');
        expect(host.textContent).toContain('failure of this chat box, not a finding about your project');
    });
});
