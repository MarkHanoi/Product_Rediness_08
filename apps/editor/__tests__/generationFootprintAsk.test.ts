/**
 * @vitest-environment happy-dom
 */
// §ASK-FOOTPRINT (L-11066 · L-11200 · C106 §7.2) — a SILENT generation request
// with a usable boundary line on the active level ASKS which footprint to build
// on, and every other case does not. Proven on the runtime `composeRuntime()`
// actually produces, through the seam the chat bridge actually dispatches into.
//
// ═══════════════════════════════════════════════════════════════════════════════
// THE RULING, AND THE GAP IT WAS DESIGNED TO CLOSE
// ═══════════════════════════════════════════════════════════════════════════════
//
// The founder's standing ruling on spatial validity is ASK, NEVER AUTO-EDIT. The
// L-11066 row recorded the gap: "generate a 6-storey residential building with the
// facade as per the attached photo" names NO footprint source, and with a closed
// boundary line drawn inside the parcel the seam silently built on the PARCEL —
// the line the architect had just drawn sat unused and the transcript said
// nothing. The design was settled in that row and is what these arms pin:
//
//   · the branch lives in `resolveGenerationFootprint` (the seam's ONE footprint
//     decision, shared by all three typology arms — the house arm included, which
//     used to make its own);
//   · it fires ONLY when the choice is real — exactly when the pure
//     `resolveBoundaryLineFootprint` would return `ok` for the implicit ladder;
//   · an EXPLICIT source still wins silently, in BOTH directions ("on the boundary
//     line" AND the new "on the parcel");
//   · it asks through the ONE chat card (`AIPanel.showZeroTokenConfirm`, reached via
//     `chatConfirm`) with the buttons renamed — never a second surface;
//   · zero tokens: a deterministic branch on store state.
//
// ─── STUB LEDGER (read before trusting any green below) ─────────────────────────
//
// Nothing on the measured path is stubbed. The runtime is a real `composeRuntime`;
// the bus is its real bus; the line is written by the real `boundaryLine.create`
// handler into the real composed store; the seam is the real `generationChatSeam`
// reached through the real `window.runtime`; the question is asked through the real
// `chatConfirm` accessor and its real `ensureChatSurface` gate.
//
// TWO substitutions, both declared:
//   1. `window.projectContext.activeLevelId` — the INPUT the browser supplies and a
//      headless process does not (the same substitution
//      boundaryLineFootprintThroughComposedRuntime.test.ts makes, for the same reason).
//   2. The CHAT PROMPT HOST. `AIPanel` is not mounted here, so a recording host is
//      registered through the SAME `registerChatPromptHost` the panel calls at boot.
//      It records the card text and the button labels and answers as a person would.
//      What is therefore NOT measured is the DOM card itself — that `AIPanel`
//      renders the two renamed buttons is a browser fact. What IS measured is that
//      the question reached the host that the panel registers, with the words and
//      the answers a person needs, and that `fallbackPrompts` stayed at 0 (the ask
//      went through the real chat surface, never the failure rendering).
//
// ⚠ NOT PROVEN HERE, stated so nobody reads more into a green run: element WRITES.
// `ResidentialBuildingExecutor` needs the browser-only legacy `commandManager`
// global and refuses without it, AFTER the controller accepted the footprint — the
// same boundary J-3c in the sibling file records.

import { describe, expect, it, beforeAll, afterAll, afterEach } from 'vitest';
import { composeRuntime } from '@pryzm/runtime-composer';
import { bootstrapWithEverything } from '../src/bootstrap.everything.js';
import {
    runGenerationBuilding,
    resolveGenerationFootprint,
    ASK_FOOTPRINT_UNDO_LINE,
} from '../src/ui/generation/generationChatSeam.js';
import {
    registerChatPromptHost,
    __resetChatPromptHost,
    getSurfaceDiagnostics,
    type ChatConfirmChoices,
} from '../src/ui/ai/chatPromptHost.js';

const AUDIT = { actorId: 'askfoot69', projectId: 'askfoot69', clientId: 'node' } as const;

// ⚠ REAL BRANDED ULIDs — `defineElement('boundaryLine')` builds
// /^boundaryLine_[0-9A-HJKMNP-TV-Z]{26}$/ (Crockford base32).
const BL_NORTH = 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5H20';
const BL_SOUTH = 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5H30';
const BL_OPEN_L1 = 'boundaryLine_01ARZ3NDEKTSV4RRFFQ69G5H40';
const LEVEL = 'L0';
const OTHER_LEVEL = 'L1';

/** A CLOSED 20 × 20 m square (400 m²). Closing vertex NOT repeated. */
const NORTH_SQUARE = [
    { x: 0, y: 0, z: 0 },
    { x: 20, y: 0, z: 0 },
    { x: 20, y: 0, z: 20 },
    { x: 0, y: 0, z: 20 },
];
/** A CLOSED 30 × 10 m rectangle (300 m²), elsewhere on the same level. */
const SOUTH_RECT = [
    { x: 40, y: 0, z: 0 },
    { x: 70, y: 0, z: 0 },
    { x: 70, y: 0, z: 10 },
    { x: 40, y: 0, z: 10 },
];
/** An OPEN 3-vertex run — a setting-out line, not an envelope. */
const OPEN_RUN = [
    { x: 0, y: 0, z: 0 },
    { x: 10, y: 0, z: 0 },
    { x: 10, y: 0, z: 10 },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
let rt: any;
let priorRuntime: unknown;

beforeAll(async () => {
    rt = await composeRuntime({
        audit: AUDIT,
        canvas: null,
        bootstrapFn: bootstrapWithEverything as never,
    });
    priorRuntime = (window as unknown as { runtime?: unknown }).runtime;
    (window as unknown as { runtime?: unknown }).runtime = rt;
    (window as unknown as { projectContext?: unknown }).projectContext = { activeLevelId: LEVEL };
}, 600_000);

afterAll(() => {
    (window as unknown as { runtime?: unknown }).runtime = priorRuntime;
    __resetChatPromptHost();
    try { rt?.tearDown?.(); } catch { /* non-fatal */ }
});

afterEach(() => {
    __resetChatPromptHost();
});

interface Asked { summary: string; choices: ChatConfirmChoices | undefined }

/**
 * A person at the chat. Registered through the SAME accessor `AIPanel` uses, so
 * the seam's `chatConfirm` reaches it exactly as it would reach the panel.
 * `answer` is what the person clicks: `true` = the primary button, `false` = the
 * secondary — the card's own contract.
 */
function person(answer: boolean): { asked: Asked[]; said: string[] } {
    const asked: Asked[] = [];
    const said: string[] = [];
    registerChatPromptHost({
        say: (text) => { said.push(text); },
        confirm: async (summary, choices) => { asked.push({ summary, choices }); return answer; },
        isReady: () => true,
    });
    return { asked, said };
}

/** Collect the `pryzm-generation-report` the seam emits during `fn`. */
async function transcriptOf(fn: () => Promise<void>): Promise<{ success: boolean; info: string[] }> {
    let seen: { success: boolean; info: string[] } | null = null;
    const listener = (e: Event): void => {
        const d = (e as CustomEvent).detail as { success: boolean; info: string[] };
        seen = { success: d.success === true, info: [...(d.info ?? [])] };
    };
    window.addEventListener('pryzm-generation-report', listener);
    try { await fn(); } finally { window.removeEventListener('pryzm-generation-report', listener); }
    expect(seen, 'the seam emitted no pryzm-generation-report at all').not.toBeNull();
    return seen!;
}

const key = (p: { x: number; z: number }): string => `${p.x},${p.z}`;
const ringOf = (vs: ReadonlyArray<{ x: number; z: number }>): Set<string> => new Set(vs.map(key));

const SILENT = { typology: 'residential-building', floors: 5 } as const;

describe('§ASK-FOOTPRINT · ARM A — no boundary line at all: the parcel, and NO question', () => {
    it('A-1: silent + no line → parcel, silently (a confirmation nobody needs is its own defect)', async () => {
        const p = person(true);
        const src = await resolveGenerationFootprint(rt, SILENT);
        expect(src.ok).toBe(true);
        if (!src.ok) return;
        expect(src.source).toBe('parcel');
        expect(src.note).toBeNull();
        expect(p.asked, 'asked with nothing to choose between').toHaveLength(0);
    }, 600_000);

    it('A-2: an explicit parcel source with no line → parcel, silently', async () => {
        const p = person(true);
        const src = await resolveGenerationFootprint(rt, { ...SILENT, footprintSource: 'parcel' });
        expect(src.ok).toBe(true);
        if (!src.ok) return;
        expect(src.source).toBe('parcel');
        expect(p.asked).toHaveLength(0);
    }, 600_000);
});

describe('§ASK-FOOTPRINT · ARM B — ONE usable line on the active level: the binary ask', () => {
    it('B-0: the line is drawn through the real bus and lands in the composed store', async () => {
        await rt.bus.executeCommand('boundaryLine.create', {
            boundaryLineId: BL_NORTH,
            levelId: LEVEL,
            vertices: NORTH_SQUARE,
            closed: true,
            drawMode: 'rectangular',
            name: 'North wing',
        });
        const rec = rt.stores.boundaryLine.getState().get(BL_NORTH) as { closed: boolean } | undefined;
        expect(rec, 'the composed slot did not see the bus write').toBeDefined();
        expect(rec!.closed).toBe(true);
    });

    it('B-1: ⭐ THE ASK — silent + one usable line → a card with the numbers a person needs, answered LINE', async () => {
        const p = person(true);   // clicks the primary: "Build on the boundary line"
        const src = await resolveGenerationFootprint(rt, SILENT);

        expect(p.asked, 'the seam did not ask').toHaveLength(1);
        const { summary, choices } = p.asked[0]!;

        // THE TWO ANSWERS, in words — never "Confirm"/"Cancel".
        expect(choices?.confirmLabel).toBe('Build on the boundary line');
        expect(choices?.cancelLabel).toBe('Build on the parcel');

        // THE NUMBERS: which line, on which level, its area, and the parcel's state.
        expect(summary).toContain('North wing');
        expect(summary).toContain(`level ${LEVEL}`);
        expect(summary).toMatch(/400\s*m²/);
        expect(summary).toContain('the only closed boundary line on this level');
        // No parcel is loaded in this process — the card says so rather than
        // printing "0 m²" as if that were a measurement (§CONTEXT-DATA-HONESTY).
        expect(summary).toContain('none is loaded');
        // The undo sentence is STAGED, as the Confirm card said (L-10822) — and it
        // names Ctrl+Z, which is what stops the card appending its generic tail.
        expect(summary).toContain(ASK_FOOTPRINT_UNDO_LINE);
        expect(summary).toMatch(/ctrl\s*\+\s*z/i);

        // The answer was honoured: the LINE's ring, corner for corner.
        expect(src.ok).toBe(true);
        if (!src.ok) return;
        expect(src.source).toBe('boundary-line');
        expect(ringOf(src.footprint)).toEqual(ringOf(NORTH_SQUARE));
        // And the transcript will say it was a CHOICE, naming what was left unused.
        expect(src.note).toContain('as you chose');
        expect(src.note).toContain('North wing');
        expect(src.note).toContain('parcel was left unused');

        // Through the real chat surface — never the failure rendering.
        expect(getSurfaceDiagnostics().fallbackPrompts).toBe(0);
    }, 600_000);

    it('B-2: the SAME ask answered PARCEL → the parcel, and the transcript names the line left unused', async () => {
        const p = person(false);  // clicks the secondary: "Build on the parcel"
        const src = await resolveGenerationFootprint(rt, SILENT);
        expect(p.asked).toHaveLength(1);
        expect(src.ok).toBe(true);
        if (!src.ok) return;
        expect(src.source).toBe('parcel');
        expect(src.footprint).toHaveLength(0);   // no parcel loaded here — see A-1
        expect(src.note).toContain('as you chose');
        expect(src.note).toContain('North wing');
        expect(src.note).toContain('was left unused');
    }, 600_000);

    it('B-3: an EXPLICIT line source wins silently — no question, the line', async () => {
        const p = person(false);  // would answer "parcel" if asked — it must not be asked
        const src = await resolveGenerationFootprint(rt, { ...SILENT, footprintSource: 'boundary-line' });
        expect(p.asked, 'asked despite an explicit source').toHaveLength(0);
        expect(src.ok).toBe(true);
        if (!src.ok) return;
        expect(src.source).toBe('boundary-line');
        expect(ringOf(src.footprint)).toEqual(ringOf(NORTH_SQUARE));
    }, 600_000);

    it('B-4: an EXPLICIT parcel source wins silently — no question, the parcel, with the line right there', async () => {
        const p = person(true);   // would answer "line" if asked — it must not be asked
        const src = await resolveGenerationFootprint(rt, { ...SILENT, footprintSource: 'parcel' });
        expect(p.asked, 'asked despite an explicit source').toHaveLength(0);
        expect(src.ok).toBe(true);
        if (!src.ok) return;
        expect(src.source).toBe('parcel');
        expect(src.note).toBeNull();
    }, 600_000);

    it("B-5: ⭐ THE ENTRY POINT — the founder's sentence, silent, reaches the ask, and the answer reaches the ARM", async () => {
        // The layer the founder experiences: `generation.building` arriving at the
        // SAME exported function the ZeroTokenChatBridge dispatches to.
        //
        // Answer PARCEL. With no parcel loaded the residential arm must then refuse
        // with ITS parcel sentence — which is the proof that the choice travelled
        // all the way into the arm rather than being decided somewhere else.
        const p = person(false);
        const t = await transcriptOf(() => runGenerationBuilding({ ...SILENT }));
        expect(p.asked, 'the entry point never asked').toHaveLength(1);
        const all = t.info.join(' | ');
        expect(t.success).toBe(false);
        expect(all).toMatch(/there is no site boundary to build on/);
        expect(all).not.toMatch(/can't read the boundary-line store/);
    }, 600_000);

    it('B-5b: the same sentence answered LINE never reaches the parcel refusal — the ring went to the generator', async () => {
        const p = person(true);
        const t = await transcriptOf(() => runGenerationBuilding({ ...SILENT }));
        expect(p.asked).toHaveLength(1);
        const all = t.info.join(' | ');
        expect(all, `fell through to the parcel arm: ${all}`).not.toMatch(/there is no site boundary to build on/);
        expect(all, `the generator never received the ring: ${all}`).not.toMatch(/no footprint/);
        // What stops here is element WRITES ("no command manager") — see the header.
    }, 600_000);

    it('B-6: the HOUSE arm asks too — it no longer makes its own footprint decision', async () => {
        const p = person(false);
        await transcriptOf(() => runGenerationBuilding({ typology: 'house', floors: 2 }));
        expect(p.asked, 'the house arm bypassed the ask').toHaveLength(1);
        expect(p.asked[0]!.choices?.confirmLabel).toBe('Build on the boundary line');
    }, 600_000);
});

describe('§ASK-FOOTPRINT · ARM C — TWO usable lines (L-11200): real, not binary, not ours to pick', () => {
    it('C-0: a second closed line on the same level', async () => {
        await rt.bus.executeCommand('boundaryLine.create', {
            boundaryLineId: BL_SOUTH,
            levelId: LEVEL,
            vertices: SOUTH_RECT,
            closed: true,
            drawMode: 'rectangular',
            name: 'South wing',
        });
        expect(rt.stores.boundaryLine.getState().get(BL_SOUTH)).toBeDefined();
    });

    it("C-1: silent + two usable lines → 'Build on the parcel' / 'Stop — I'll select a line'; STOP changes nothing", async () => {
        const p = person(false);  // secondary: stop
        const src = await resolveGenerationFootprint(rt, SILENT);
        expect(p.asked).toHaveLength(1);
        const { summary, choices } = p.asked[0]!;
        expect(choices?.confirmLabel).toBe('Build on the parcel');
        expect(choices?.cancelLabel).toMatch(/^Stop/);
        expect(summary).toContain('2 closed boundary lines');
        expect(summary).toContain('North wing');
        expect(summary).toContain('South wing');
        expect(summary).toMatch(/400\s*m²/);
        expect(summary).toMatch(/300\s*m²/);
        expect(summary).toContain("I won't pick a line for you");
        // Stopping is a REFUSAL that names the route back, never a build.
        expect(src.ok).toBe(false);
        if (src.ok) return;
        expect(src.reason).toContain('select');
        expect(src.reason).toContain('North wing');
        expect(src.reason).toContain('South wing');
    }, 600_000);

    it('C-2: the same ask answered PARCEL → the parcel, naming BOTH lines left unused', async () => {
        const p = person(true);
        const src = await resolveGenerationFootprint(rt, SILENT);
        expect(p.asked).toHaveLength(1);
        expect(src.ok).toBe(true);
        if (!src.ok) return;
        expect(src.source).toBe('parcel');
        expect(src.note).toContain('2 closed boundary lines');
        expect(src.note).toContain('North wing');
        expect(src.note).toContain('South wing');
    }, 600_000);

    it('C-3: an explicit line ID picks its line silently — the ladder is untouched', async () => {
        const p = person(false);
        const src = await resolveGenerationFootprint(rt, { ...SILENT, boundaryLineId: BL_SOUTH });
        expect(p.asked).toHaveLength(0);
        expect(src.ok).toBe(true);
        if (!src.ok) return;
        expect(src.source).toBe('boundary-line');
        expect(ringOf(src.footprint)).toEqual(ringOf(SOUTH_RECT));
    }, 600_000);
});

describe('§ASK-FOOTPRINT · ARM D — a line that is NOT usable is not a choice', () => {
    it('D-1: only an OPEN line on the active level → parcel, silently (never "close it for them")', async () => {
        await rt.bus.executeCommand('boundaryLine.create', {
            boundaryLineId: BL_OPEN_L1,
            levelId: OTHER_LEVEL,
            vertices: OPEN_RUN,
            closed: false,
            drawMode: 'linear',
        });
        (window as unknown as { projectContext?: unknown }).projectContext = { activeLevelId: OTHER_LEVEL };
        try {
            const p = person(true);
            const src = await resolveGenerationFootprint(rt, SILENT);
            expect(p.asked, 'asked about a line that cannot be built on').toHaveLength(0);
            expect(src.ok).toBe(true);
            if (!src.ok) return;
            expect(src.source).toBe('parcel');
            expect(src.note).toBeNull();
        } finally {
            (window as unknown as { projectContext?: unknown }).projectContext = { activeLevelId: LEVEL };
        }
    }, 600_000);

    it("D-2: the two closed lines on L0 are not in scope from L1 — level scoping is the pure ladder's", async () => {
        (window as unknown as { projectContext?: unknown }).projectContext = { activeLevelId: OTHER_LEVEL };
        try {
            const p = person(true);
            await resolveGenerationFootprint(rt, SILENT);
            expect(p.asked).toHaveLength(0);
        } finally {
            (window as unknown as { projectContext?: unknown }).projectContext = { activeLevelId: LEVEL };
        }
    }, 600_000);
});
