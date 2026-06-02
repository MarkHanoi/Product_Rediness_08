// A.5.a (Phase A · Sprint 2) — RAC chatbot state machine tests.

import { describe, expect, it } from 'vitest';
import { TypologyManifestSchema } from '@pryzm/schemas';
import { createTypologyRegistry } from '../src/TypologyRegistry.js';
import {
    createInitialState,
    racReducer,
    toBrief,
    parseRoleFromText,
    parseTypologyIdFromText,
    defaultPromptForPhase,
    type RacConversationState,
} from '../src/RacChatbotModel.js';
import type {
    RegisteredTypologyPack,
    GenerativeStage,
} from '../src/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────────────

const noopGenerative: GenerativeStage = () => ({
    ok: true,
    artifact: { engine: 'deterministic', payload: null },
});

function makePack(id: string): RegisteredTypologyPack {
    const manifest = TypologyManifestSchema.parse({
        id,
        displayName: id,
        category: 'residential',
        version: '1.0.0',
        description: 'test',
        thumbnail: 'thumb.webp',
        author: 'PRYZM',
        cognitionLayers: ['L1-environmental'],
        programRulesEntry: 'p.json',
        deterministicEngineEntry: 'det.js',
        roomTypes: ['living'],
    });
    return { manifest, stages: { generative: noopGenerative } };
}

function setupRegistry(ids: readonly string[]) {
    const r = createTypologyRegistry();
    for (const id of ids) r.register(makePack(id));
    return r;
}

const NOW = '2026-06-01T12:00:00.000Z';

// ─────────────────────────────────────────────────────────────────────────────
// createInitialState
// ─────────────────────────────────────────────────────────────────────────────

describe('createInitialState', () => {
    it('returns an empty intro state', () => {
        const state = createInitialState(setupRegistry(['apartment']));
        expect(state.phase).toBe('intro');
        expect(state.turns).toEqual([]);
        expect(state.captured.role).toBeNull();
        expect(state.captured.typologyId).toBeNull();
        expect(state.captured.brief).toEqual({});
        expect(state.errorMessage).toBeNull();
    });

    it('snapshots the registry ids at construction time', () => {
        const state = createInitialState(
            setupRegistry(['apartment', 'house', 'gym']),
        );
        // Sort is alphabetical via TypologyRegistry.listIds().
        expect(state.availableTypologies).toEqual(['apartment', 'gym', 'house']);
    });

    it('snapshot does NOT live-update when the registry changes', () => {
        const registry = setupRegistry(['apartment']);
        const state = createInitialState(registry);
        registry.register(makePack('house'));
        expect(state.availableTypologies).toEqual(['apartment']);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseRoleFromText
// ─────────────────────────────────────────────────────────────────────────────

describe('parseRoleFromText', () => {
    it('matches single-word role', () => {
        expect(parseRoleFromText('architect')).toBe('architect');
        expect(parseRoleFromText('Architect')).toBe('architect');
    });

    it('matches role embedded in a sentence', () => {
        expect(parseRoleFromText("Hi, I'm Maria, an architect.")).toBe(
            'architect',
        );
        expect(parseRoleFromText('We are general contractors')).toBe('contractor');
    });

    it('returns null when no known role', () => {
        expect(parseRoleFromText('I make pottery')).toBeNull();
        expect(parseRoleFromText('')).toBeNull();
    });

    it('matches each of the 6 known roles', () => {
        for (const role of [
            'architect',
            'engineer',
            'developer',
            'contractor',
            'owner',
            'student',
        ] as const) {
            expect(parseRoleFromText(`I'm a ${role}`)).toBe(role);
        }
    });

    it('does NOT match a substring without word boundary', () => {
        // 'developmental' should NOT match 'developer'
        expect(parseRoleFromText('I research developmental psychology')).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// parseTypologyIdFromText
// ─────────────────────────────────────────────────────────────────────────────

describe('parseTypologyIdFromText', () => {
    const ids = ['apartment', 'house', 'small-office'];

    it('exact match (case-insensitive)', () => {
        expect(parseTypologyIdFromText('apartment', ids)).toBe('apartment');
        expect(parseTypologyIdFromText('Apartment', ids)).toBe('apartment');
    });

    it('hyphen-tolerant: spaces → hyphens', () => {
        expect(parseTypologyIdFromText('small office', ids)).toBe('small-office');
        expect(parseTypologyIdFromText('Small Office', ids)).toBe('small-office');
    });

    it('word-boundary match in a sentence', () => {
        expect(
            parseTypologyIdFromText('I want to design an apartment', ids),
        ).toBe('apartment');
    });

    it('returns null when no match', () => {
        expect(parseTypologyIdFromText('I want to design a yurt', ids)).toBeNull();
        expect(parseTypologyIdFromText('', ids)).toBeNull();
    });

    it('returns null when registry is empty', () => {
        expect(parseTypologyIdFromText('apartment', [])).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// racReducer — phase transitions
// ─────────────────────────────────────────────────────────────────────────────

function initial(): RacConversationState {
    return createInitialState(
        setupRegistry(['apartment', 'house', 'small-office']),
    );
}

describe('racReducer — intro → awaiting-role', () => {
    it('first user-message without role moves to awaiting-role', () => {
        const after = racReducer(initial(), {
            type: 'user-message',
            text: 'Hello',
            now: NOW,
        });
        expect(after.phase).toBe('awaiting-role');
        expect(after.turns).toHaveLength(1);
        expect(after.turns[0]?.text).toBe('Hello');
    });

    it('first user-message WITH role skips to awaiting-typology', () => {
        const after = racReducer(initial(), {
            type: 'user-message',
            text: "Hi, I'm an architect",
            now: NOW,
        });
        expect(after.phase).toBe('awaiting-typology');
        expect(after.captured.role).toBe('architect');
    });
});

describe('racReducer — awaiting-role → awaiting-typology', () => {
    it('captures the role from user-message text', () => {
        const s = racReducer(initial(), {
            type: 'user-message',
            text: 'hi',
            now: NOW,
        });
        const after = racReducer(s, {
            type: 'user-message',
            text: 'engineer',
            now: NOW,
        });
        expect(after.phase).toBe('awaiting-typology');
        expect(after.captured.role).toBe('engineer');
    });

    it('emits errorMessage when no role detected', () => {
        const s = racReducer(initial(), {
            type: 'user-message',
            text: 'hi',
            now: NOW,
        });
        const after = racReducer(s, {
            type: 'user-message',
            text: 'I make sushi',
            now: NOW,
        });
        expect(after.phase).toBe('awaiting-role');
        expect(after.errorMessage).toMatch(/role/i);
    });
});

describe('racReducer — awaiting-typology → awaiting-brief', () => {
    function withRole(): RacConversationState {
        const s = racReducer(initial(), {
            type: 'user-message',
            text: 'architect',
            now: NOW,
        });
        return s;
    }

    it('captures the typology id from text', () => {
        const after = racReducer(withRole(), {
            type: 'user-message',
            text: 'I want an apartment',
            now: NOW,
        });
        expect(after.phase).toBe('awaiting-brief');
        expect(after.captured.typologyId).toBe('apartment');
    });

    it('handles hyphen-tolerant typology id from text', () => {
        const after = racReducer(withRole(), {
            type: 'user-message',
            text: 'small office',
            now: NOW,
        });
        expect(after.phase).toBe('awaiting-brief');
        expect(after.captured.typologyId).toBe('small-office');
    });

    it('errors on unknown typology', () => {
        const after = racReducer(withRole(), {
            type: 'user-message',
            text: 'yurt',
            now: NOW,
        });
        expect(after.phase).toBe('awaiting-typology');
        expect(after.errorMessage).toMatch(/Available/i);
    });
});

describe('racReducer — brief phase + ready', () => {
    function withRoleAndTypology(): RacConversationState {
        let s = racReducer(initial(), {
            type: 'user-message',
            text: 'architect',
            now: NOW,
        });
        s = racReducer(s, {
            type: 'user-message',
            text: 'apartment',
            now: NOW,
        });
        return s;
    }

    it('captures brief fields one at a time', () => {
        let s = withRoleAndTypology();
        s = racReducer(s, {
            type: 'capture-brief-field',
            key: 'bedrooms',
            value: 2,
        });
        s = racReducer(s, {
            type: 'capture-brief-field',
            key: 'targetAreaM2',
            value: 75,
        });
        expect(s.captured.brief).toEqual({ bedrooms: 2, targetAreaM2: 75 });
        expect(s.phase).toBe('awaiting-brief'); // not ready yet
    });

    it('mark-brief-complete moves to ready', () => {
        let s = withRoleAndTypology();
        s = racReducer(s, {
            type: 'capture-brief-field',
            key: 'bedrooms',
            value: 2,
        });
        s = racReducer(s, { type: 'mark-brief-complete' });
        expect(s.phase).toBe('ready');
    });

    it('mark-brief-complete WITHOUT role/typology errors out', () => {
        const s = racReducer(initial(), { type: 'mark-brief-complete' });
        expect(s.phase).toBe('intro');
        expect(s.errorMessage).toMatch(/role.*typologyId/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Explicit capture events (quick-action button flow)
// ─────────────────────────────────────────────────────────────────────────────

describe('racReducer — explicit capture events', () => {
    it('capture-role sets role + moves to awaiting-typology', () => {
        const s = racReducer(initial(), {
            type: 'capture-role',
            role: 'architect',
        });
        expect(s.phase).toBe('awaiting-typology');
        expect(s.captured.role).toBe('architect');
    });

    it('capture-typology sets typology + moves to awaiting-brief', () => {
        let s = racReducer(initial(), {
            type: 'capture-role',
            role: 'architect',
        });
        s = racReducer(s, {
            type: 'capture-typology',
            typologyId: 'apartment',
        });
        expect(s.phase).toBe('awaiting-brief');
        expect(s.captured.typologyId).toBe('apartment');
    });

    it('capture-typology errors when id is not in the snapshot', () => {
        const s = racReducer(initial(), {
            type: 'capture-typology',
            typologyId: 'gym',
        });
        expect(s.errorMessage).toMatch(/not in the current registry/i);
        expect(s.captured.typologyId).toBeNull();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// restart + cancel
// ─────────────────────────────────────────────────────────────────────────────

describe('racReducer — lifecycle', () => {
    it('restart wipes turns + captured + errorMessage', () => {
        let s = racReducer(initial(), {
            type: 'user-message',
            text: 'architect',
            now: NOW,
        });
        s = racReducer(s, {
            type: 'capture-brief-field',
            key: 'bedrooms',
            value: 2,
        });
        s = racReducer(s, { type: 'restart' });
        expect(s.phase).toBe('intro');
        expect(s.turns).toEqual([]);
        expect(s.captured.role).toBeNull();
        expect(s.captured.brief).toEqual({});
    });

    it('cancel moves to cancelled phase', () => {
        const s = racReducer(initial(), { type: 'cancel' });
        expect(s.phase).toBe('cancelled');
    });

    it('assistant-message appends a turn without changing phase', () => {
        const s = racReducer(initial(), {
            type: 'assistant-message',
            text: 'Hi!',
            now: NOW,
        });
        expect(s.phase).toBe('intro');
        expect(s.turns).toHaveLength(1);
        expect(s.turns[0]?.speaker).toBe('assistant');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// toBrief — exit shape
// ─────────────────────────────────────────────────────────────────────────────

describe('toBrief', () => {
    it('returns null until phase=ready', () => {
        let s = initial();
        expect(toBrief(s)).toBeNull();
        s = racReducer(s, { type: 'capture-role', role: 'architect' });
        expect(toBrief(s)).toBeNull();
        s = racReducer(s, { type: 'capture-typology', typologyId: 'apartment' });
        expect(toBrief(s)).toBeNull();
    });

    it('returns dispatchable PipelineBrief when ready', () => {
        let s = initial();
        s = racReducer(s, { type: 'capture-role', role: 'architect' });
        s = racReducer(s, { type: 'capture-typology', typologyId: 'apartment' });
        s = racReducer(s, {
            type: 'capture-brief-field',
            key: 'bedrooms',
            value: 2,
        });
        s = racReducer(s, { type: 'mark-brief-complete' });
        const brief = toBrief(s);
        expect(brief).not.toBeNull();
        expect(brief?.typologyId).toBe('apartment');
        expect(brief?.role).toBe('architect');
        expect(brief?.metadata).toEqual({ bedrooms: 2 });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// defaultPromptForPhase
// ─────────────────────────────────────────────────────────────────────────────

describe('defaultPromptForPhase', () => {
    it('returns a non-empty prompt for every phase', () => {
        const base = initial();
        for (const phase of [
            'intro',
            'awaiting-role',
            'awaiting-typology',
            'awaiting-brief',
            'ready',
            'cancelled',
        ] as const) {
            const prompt = defaultPromptForPhase({ ...base, phase });
            expect(prompt.length).toBeGreaterThan(0);
        }
    });

    it('typology prompt lists the available ids', () => {
        const s = { ...initial(), phase: 'awaiting-typology' as const };
        expect(defaultPromptForPhase(s)).toMatch(/apartment/);
        expect(defaultPromptForPhase(s)).toMatch(/house/);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// summarizeCapturedState (A.5.a.next)
// ─────────────────────────────────────────────────────────────────────────────

import { summarizeCapturedState } from '../src/RacChatbotModel.js';

describe('summarizeCapturedState', () => {
    it('returns "nothing captured yet" for an empty captured state', () => {
        expect(
            summarizeCapturedState({ role: null, typologyId: null, brief: {} }),
        ).toBe('nothing captured yet');
    });

    it('renders just the role when only role is captured', () => {
        expect(
            summarizeCapturedState({
                role: 'architect',
                typologyId: null,
                brief: {},
            }),
        ).toBe('OK: architect');
    });

    it('renders role · typology when both are captured', () => {
        expect(
            summarizeCapturedState({
                role: 'engineer',
                typologyId: 'apartment',
                brief: {},
            }),
        ).toBe('OK: engineer · apartment');
    });

    it('renders bedrooms with -bed suffix', () => {
        expect(
            summarizeCapturedState({
                role: 'architect',
                typologyId: 'apartment',
                brief: { bedrooms: 2 },
            }),
        ).toBe('OK: architect · apartment · 2-bed');
    });

    it('renders bathrooms with -bath suffix', () => {
        expect(
            summarizeCapturedState({
                role: 'architect',
                typologyId: 'apartment',
                brief: { bedrooms: 2, bathrooms: 1 },
            }),
        ).toBe('OK: architect · apartment · 2-bed · 1-bath');
    });

    it('renders targetArea with m² target suffix', () => {
        expect(
            summarizeCapturedState({
                role: 'architect',
                typologyId: 'apartment',
                brief: { targetArea: 70 },
            }),
        ).toBe('OK: architect · apartment · 70m² target');
    });

    it('strips trailing "m²" if the user already wrote it', () => {
        expect(
            summarizeCapturedState({
                role: 'architect',
                typologyId: 'apartment',
                brief: { targetArea: '70m²' },
            }),
        ).toBe('OK: architect · apartment · 70m² target');
    });

    it('respects the canonical key order (bedrooms before bathrooms before area)', () => {
        // Insert in REVERSE order — output should still be canonical.
        const out = summarizeCapturedState({
            role: 'architect',
            typologyId: 'apartment',
            brief: { targetArea: 70, bathrooms: 1, bedrooms: 2 },
        });
        const bedIdx = out.indexOf('2-bed');
        const bathIdx = out.indexOf('1-bath');
        const areaIdx = out.indexOf('70m²');
        expect(bedIdx).toBeLessThan(bathIdx);
        expect(bathIdx).toBeLessThan(areaIdx);
    });

    it('appends unknown keys alphabetically after canonical ones', () => {
        const out = summarizeCapturedState({
            role: 'architect',
            typologyId: 'apartment',
            brief: { zStyle: 'modern', aTimeline: '2027', bedrooms: 2 },
        });
        const bedIdx = out.indexOf('2-bed');
        const aIdx = out.indexOf('aTimeline');
        const zIdx = out.indexOf('zStyle');
        expect(bedIdx).toBeLessThan(aIdx);
        expect(aIdx).toBeLessThan(zIdx);
    });

    it('renders numbers as integers when whole, 1dp otherwise', () => {
        const intOut = summarizeCapturedState({
            role: null,
            typologyId: null,
            brief: { targetArea: 70 },
        });
        expect(intOut).toContain('70m²');
        const floatOut = summarizeCapturedState({
            role: null,
            typologyId: null,
            brief: { targetArea: 70.42 },
        });
        expect(floatOut).toContain('70.4m²');
    });

    it('renders booleans as yes/no', () => {
        const out = summarizeCapturedState({
            role: null,
            typologyId: null,
            brief: { masterEnSuite: true },
        });
        expect(out).toBe('OK: masterEnSuite yes');
    });

    it('renders trimmed strings', () => {
        const out = summarizeCapturedState({
            role: null,
            typologyId: null,
            brief: { style: '  modern  ' },
        });
        expect(out).toBe('OK: style modern');
    });

    it('skips fields with empty / null / undefined values', () => {
        const out = summarizeCapturedState({
            role: 'architect',
            typologyId: 'apartment',
            brief: { style: '', timeline: null, bedrooms: 2 },
        });
        expect(out).toBe('OK: architect · apartment · 2-bed');
    });

    it('JSON-stringifies objects + arrays as a fallback', () => {
        const out = summarizeCapturedState({
            role: null,
            typologyId: null,
            brief: { tags: ['modern', 'small'] },
        });
        expect(out).toContain('tags ["modern","small"]');
    });

    it('full example: architect + apartment + 2-bed + area + style', () => {
        const out = summarizeCapturedState({
            role: 'architect',
            typologyId: 'apartment',
            brief: {
                bedrooms: 2,
                bathrooms: 1,
                targetArea: 70,
                style: 'modern',
            },
        });
        expect(out).toBe(
            'OK: architect · apartment · 2-bed · 1-bath · 70m² target · style modern',
        );
    });
});
