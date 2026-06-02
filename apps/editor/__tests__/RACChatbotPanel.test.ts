// @vitest-environment happy-dom
//
// A.5.b (Phase A · IP-A3 Sprint 3) — RACChatbotPanel L5 tests.
//
// Drives the panel against a real TypologyRegistry + racReducer.
// Asserts: build shape, transcript rendering, phase-chip update,
// chip-button capture, onBriefReady firing, dispose hygiene, plus the
// pure helpers (labelForPhase, formatTurnLine).

import { describe, it, expect, beforeEach } from 'vitest';
import { TypologyManifestSchema } from '@pryzm/schemas';
import {
    createTypologyRegistry,
    type RegisteredTypologyPack,
    type GenerativeStage,
} from '@pryzm/typology-pipeline';
import {
    RACChatbotPanel,
    labelForPhase,
    formatTurnLine,
} from '../src/ui/onboarding/RACChatbotPanel';

// ── fixtures ────────────────────────────────────────────────────────────

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

function makeRegistry(ids: readonly string[] = ['apartment', 'house']) {
    const r = createTypologyRegistry();
    for (const id of ids) r.register(makePack(id));
    return r;
}

const FIXED_NOW = () => '2026-06-02T12:00:00.000Z';

// ── pure helpers ────────────────────────────────────────────────────────

describe('labelForPhase', () => {
    it('returns a non-empty label for every phase', () => {
        const phases = ['intro', 'awaiting-role', 'awaiting-typology', 'awaiting-brief', 'ready', 'cancelled'] as const;
        for (const p of phases) {
            expect(labelForPhase(p).length).toBeGreaterThan(0);
        }
    });

    it('uses a distinct label per phase', () => {
        const labels = new Set([
            labelForPhase('intro'),
            labelForPhase('awaiting-role'),
            labelForPhase('awaiting-typology'),
            labelForPhase('awaiting-brief'),
            labelForPhase('ready'),
            labelForPhase('cancelled'),
        ]);
        expect(labels.size).toBe(6);
    });
});

describe('formatTurnLine', () => {
    it('prefixes user turns with "You: "', () => {
        const line = formatTurnLine({ speaker: 'user', text: 'hi', timestamp: FIXED_NOW() });
        expect(line).toBe('You: hi');
    });

    it('prefixes assistant turns with "PRYZM: "', () => {
        const line = formatTurnLine({ speaker: 'assistant', text: 'welcome', timestamp: FIXED_NOW() });
        expect(line).toBe('PRYZM: welcome');
    });
});

// ── panel lifecycle ─────────────────────────────────────────────────────

describe('RACChatbotPanel build()', () => {
    let panel: RACChatbotPanel;

    beforeEach(() => {
        panel = new RACChatbotPanel({ registry: makeRegistry(), now: FIXED_NOW });
    });

    it('returns an HTMLElement with the rac-panel test id', () => {
        const el = panel.build();
        expect(el).toBeInstanceOf(HTMLElement);
        expect(el.getAttribute('data-testid')).toBe('rac-panel');
    });

    it('renders the phase chip + transcript + suggestions + input row', () => {
        const el = panel.build();
        expect(el.querySelector('[data-testid="rac-phase-chip"]')).not.toBeNull();
        expect(el.querySelector('[data-testid="rac-transcript"]')).not.toBeNull();
        expect(el.querySelector('[data-testid="rac-suggestions"]')).not.toBeNull();
        expect(el.querySelector('[data-testid="rac-input"]')).not.toBeNull();
        expect(el.querySelector('[data-testid="rac-send"]')).not.toBeNull();
    });

    it('initial phase chip says "Welcome" (intro)', () => {
        const el = panel.build();
        const chip = el.querySelector<HTMLElement>('[data-testid="rac-phase-chip"]')!;
        expect(chip.textContent).toBe('Welcome');
        expect(chip.getAttribute('data-phase')).toBe('intro');
    });

    it('initial transcript is the default intro prompt', () => {
        const el = panel.build();
        const transcript = el.querySelector('[data-testid="rac-transcript"]')!;
        expect(transcript.textContent).toContain("What's your role");
    });

    it('initial suggestions are the 6 role chips', () => {
        const el = panel.build();
        const chips = el.querySelectorAll('[data-testid="rac-suggestions"] .rac-chip');
        expect(chips.length).toBe(6);
    });

    it('returns the same element on a second build() call (idempotent)', () => {
        const first = panel.build();
        const second = panel.build();
        expect(second).toBe(first);
    });
});

describe('RACChatbotPanel dispatch()', () => {
    it('renders a user turn for a user-message event', () => {
        const panel = new RACChatbotPanel({ registry: makeRegistry(), now: FIXED_NOW });
        const el = panel.build();
        panel.dispatch({ type: 'user-message', text: 'I am an architect', now: FIXED_NOW() });
        const userTurn = el.querySelector('[data-testid="rac-turn-user"]');
        expect(userTurn).not.toBeNull();
        expect(userTurn!.textContent).toContain('I am an architect');
    });

    it('updates the phase chip after capture-role', () => {
        const panel = new RACChatbotPanel({ registry: makeRegistry(), now: FIXED_NOW });
        const el = panel.build();
        panel.dispatch({ type: 'capture-role', role: 'architect' });
        const chip = el.querySelector<HTMLElement>('[data-testid="rac-phase-chip"]')!;
        expect(chip.textContent).toBe('Project type');
        expect(chip.getAttribute('data-phase')).toBe('awaiting-typology');
    });

    it('updates the summary line after capture-role + capture-typology', () => {
        const panel = new RACChatbotPanel({ registry: makeRegistry(), now: FIXED_NOW });
        const el = panel.build();
        panel.dispatch({ type: 'capture-role', role: 'architect' });
        panel.dispatch({ type: 'capture-typology', typologyId: 'apartment' });
        const summary = el.querySelector('[data-testid="rac-summary"]')!;
        expect(summary.textContent).toContain('architect');
        expect(summary.textContent).toContain('apartment');
    });

    it('clicking a role chip dispatches capture-role', () => {
        const panel = new RACChatbotPanel({ registry: makeRegistry(), now: FIXED_NOW });
        const el = panel.build();
        const architectChip = el.querySelector<HTMLButtonElement>('[data-testid="rac-chip-architect"]')!;
        architectChip.click();
        expect(panel.getState().captured.role).toBe('architect');
        expect(panel.getState().phase).toBe('awaiting-typology');
    });

    it('clicking a typology chip dispatches capture-typology', () => {
        const panel = new RACChatbotPanel({ registry: makeRegistry(), now: FIXED_NOW });
        const el = panel.build();
        panel.dispatch({ type: 'capture-role', role: 'architect' });
        const apartmentChip = el.querySelector<HTMLButtonElement>('[data-testid="rac-chip-apartment"]')!;
        expect(apartmentChip).not.toBeNull();
        apartmentChip.click();
        expect(panel.getState().captured.typologyId).toBe('apartment');
        expect(panel.getState().phase).toBe('awaiting-brief');
    });

    it('fires onBriefReady when the conversation reaches ready', () => {
        let captured: { typologyId: string } | null = null;
        const panel = new RACChatbotPanel({
            registry: makeRegistry(),
            now: FIXED_NOW,
            onBriefReady: (brief) => { captured = { typologyId: brief.typologyId }; },
        });
        panel.build();
        panel.dispatch({ type: 'capture-role', role: 'architect' });
        panel.dispatch({ type: 'capture-typology', typologyId: 'apartment' });
        panel.dispatch({ type: 'mark-brief-complete' });
        expect(captured).not.toBeNull();
        expect(captured!.typologyId).toBe('apartment');
    });

    it('disables the input once the conversation is ready', () => {
        const panel = new RACChatbotPanel({ registry: makeRegistry(), now: FIXED_NOW });
        const el = panel.build();
        panel.dispatch({ type: 'capture-role', role: 'architect' });
        panel.dispatch({ type: 'capture-typology', typologyId: 'apartment' });
        panel.dispatch({ type: 'mark-brief-complete' });
        const input = el.querySelector<HTMLInputElement>('[data-testid="rac-input"]')!;
        expect(input.disabled).toBe(true);
    });

    it('shows the error bar when reducer surfaces an errorMessage', () => {
        const panel = new RACChatbotPanel({ registry: makeRegistry(), now: FIXED_NOW });
        const el = panel.build();
        panel.dispatch({ type: 'user-message', text: 'banana', now: FIXED_NOW() });
        panel.dispatch({ type: 'user-message', text: 'pineapple', now: FIXED_NOW() });
        const error = el.querySelector<HTMLElement>('[data-testid="rac-error"]')!;
        expect(error.hidden).toBe(false);
        expect(error.textContent).toContain('role');
    });
});

describe('RACChatbotPanel dispose()', () => {
    it('detaches the root from its parent', () => {
        const panel = new RACChatbotPanel({ registry: makeRegistry(), now: FIXED_NOW });
        const el = panel.build();
        document.body.appendChild(el);
        expect(el.parentNode).toBe(document.body);
        panel.dispose();
        expect(el.parentNode).toBeNull();
    });

    it('is idempotent — second dispose() is a no-op', () => {
        const panel = new RACChatbotPanel({ registry: makeRegistry(), now: FIXED_NOW });
        panel.build();
        panel.dispose();
        expect(() => panel.dispose()).not.toThrow();
    });
});
