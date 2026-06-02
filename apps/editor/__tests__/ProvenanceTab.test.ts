// @vitest-environment happy-dom
//
// A.31.e (IP-A5 iteration 5.2) — Provenance tab unit tests.
//
// Drives the tab against a real ProvenanceStore + fixture artefacts.
// Verifies: rendering shape, empty states, store-subscription re-render
// on artefact append, selection swap, dispose hygiene.

import { describe, it, expect, beforeEach } from 'vitest';
import { ProvenanceStore } from '@pryzm/stores';
import type { AIArtefact } from '@pryzm/schemas/provenance';
import {
    ProvenanceTab,
    selectArtefactsForElement,
    formatApprovalStatus,
    approvalStatusClass,
    formatCostUsd,
    formatTimestamp,
    renderArtefactCard,
} from '../src/ui/inspect/ProvenanceTab';

// ── Fixtures ───────────────────────────────────────────────────────────

const SHA64 = '0'.repeat(64);
const SESSION = '550e8400-e29b-41d4-a716-446655440000';
const CS_ID = 'cs_12345678-1234-1234-1234-123456789012';

function makeArtefact(overrides: Partial<AIArtefact> = {}): AIArtefact {
    const idSuffix = (overrides.id ?? 'aia_default-uuid-shape-1234-567890abcdef')
        .replace('aia_', '')
        .padEnd(36, '0')
        .slice(0, 36);
    return {
        id: `aia_${idSuffix}`,
        idempotencyKey: SHA64,
        timestamp: '2026-06-02T12:00:00.000Z',
        sessionId: SESSION,
        userId: 'usr_alice',
        projectId: 'prj_test',
        model: 'claude-haiku-4-5-20251014',
        workflowKind: 'apartment-layout-generate',
        workflowVersion: 'apartment-layout-v3.2',
        promptSha: SHA64,
        promptPreviewRedacted: 'Generate a 2-bed apartment layout …',
        contextHash: SHA64,
        contextSnapshotId: CS_ID,
        redactionRecordId: null,
        inputTokens: 1200,
        outputTokens: 800,
        costUsd: 0.012,
        durationMs: 4200,
        cacheStatus: 'miss',
        reproducibility: 'non-deterministic',
        seed: null,
        approvalStatus: 'pending',
        parentArtefactIds: [],
        producedElementIds: [],
        outputSemanticFingerprint: null,
        outputClusterId: null,
        ...overrides,
    } as AIArtefact;
}

// ── Pure helpers ───────────────────────────────────────────────────────

describe('selectArtefactsForElement', () => {
    it('returns only artefacts whose producedElementIds includes the target', () => {
        const a = makeArtefact({ id: 'aia_a', producedElementIds: ['el_wall_1'] });
        const b = makeArtefact({ id: 'aia_b', producedElementIds: ['el_door_2'] });
        const c = makeArtefact({
            id: 'aia_c',
            producedElementIds: ['el_wall_1', 'el_wall_3'],
        });
        const out = selectArtefactsForElement([a, b, c], 'el_wall_1');
        expect(out.length).toBe(2);
        expect(out.map((x) => x.id.slice(0, 5))).toEqual(['aia_a', 'aia_c']);
    });

    it('returns empty when no artefacts produced the element', () => {
        const a = makeArtefact({ producedElementIds: ['el_other'] });
        expect(selectArtefactsForElement([a], 'el_target')).toEqual([]);
    });

    it('returns empty when input list is empty', () => {
        expect(selectArtefactsForElement([], 'el_x')).toEqual([]);
    });
});

describe('formatApprovalStatus + approvalStatusClass', () => {
    it('maps every status to a non-empty label + a CSS class', () => {
        const statuses = [
            'auto-applied',
            'user-approved',
            'user-rejected',
            'pending',
            'never-applied',
        ] as const;
        for (const s of statuses) {
            expect(formatApprovalStatus(s).length).toBeGreaterThan(0);
            expect(approvalStatusClass(s)).toMatch(/^pv-badge--/);
        }
    });

    it('uses semantic classes for approved + rejected', () => {
        expect(approvalStatusClass('user-approved')).toBe('pv-badge--success');
        expect(approvalStatusClass('user-rejected')).toBe('pv-badge--error');
        expect(approvalStatusClass('pending')).toBe('pv-badge--warning');
    });
});

describe('formatCostUsd', () => {
    it('renders free when zero', () => {
        expect(formatCostUsd(0)).toBe('free');
    });
    it('renders 4 decimals when < $0.01', () => {
        expect(formatCostUsd(0.0012)).toBe('$0.0012');
    });
    it('renders 3 decimals when < $1', () => {
        expect(formatCostUsd(0.234)).toBe('$0.234');
    });
    it('renders 2 decimals when ≥ $1', () => {
        expect(formatCostUsd(1.5)).toBe('$1.50');
    });
    it('renders em-dash for negative / NaN', () => {
        expect(formatCostUsd(-1)).toBe('—');
        expect(formatCostUsd(NaN)).toBe('—');
    });
});

describe('formatTimestamp', () => {
    it('reformats an ISO string to short UTC display', () => {
        expect(formatTimestamp('2026-06-02T12:00:00.000Z')).toBe(
            '2026-06-02 12:00:00 UTC',
        );
    });
    it('passes through malformed input', () => {
        expect(formatTimestamp('not-a-date')).toBe('not-a-date');
    });
});

describe('renderArtefactCard', () => {
    it('renders the workflow kind in the title', () => {
        const card = renderArtefactCard(
            makeArtefact({ workflowKind: 'apartment-layout-generate' }),
        );
        expect(card.querySelector('.pv-card-title')?.textContent).toBe(
            'apartment-layout-generate',
        );
    });

    it('renders an approval badge with the status class', () => {
        const card = renderArtefactCard(
            makeArtefact({ approvalStatus: 'user-approved' }),
        );
        const badge = card.querySelector(
            '[data-testid="pv-approval-badge"]',
        ) as HTMLElement;
        expect(badge).not.toBeNull();
        expect(badge.classList.contains('pv-badge--success')).toBe(true);
        expect(badge.textContent).toBe('Approved by you');
    });

    it('renders model + cost + tokens rows', () => {
        const card = renderArtefactCard(
            makeArtefact({
                model: 'claude-sonnet-4-6-20260201',
                costUsd: 0.05,
                inputTokens: 500,
                outputTokens: 200,
            }),
        );
        expect(
            (card.querySelector('[data-testid="pv-row-model"]') as HTMLElement)
                ?.textContent,
        ).toBe('claude-sonnet-4-6-20260201');
        expect(
            (card.querySelector('[data-testid="pv-row-cost"]') as HTMLElement)
                ?.textContent,
        ).toBe('$0.050');
        expect(
            (card.querySelector('[data-testid="pv-row-tokens"]') as HTMLElement)
                ?.textContent,
        ).toBe('500 in · 200 out');
    });

    it('renders the seed for deterministic artefacts', () => {
        const card = renderArtefactCard(
            makeArtefact({ reproducibility: 'deterministic', seed: 42 }),
        );
        const repro = card.querySelector(
            '[data-testid="pv-row-repro"]',
        ) as HTMLElement;
        expect(repro.textContent).toContain('Deterministic');
        expect(repro.textContent).toContain('42');
    });

    it('renders a redacted prompt preview in a <details> block', () => {
        const card = renderArtefactCard(
            makeArtefact({ promptPreviewRedacted: 'lorem ipsum redacted prompt' }),
        );
        const details = card.querySelector('details.pv-card-preview');
        expect(details).not.toBeNull();
        const pre = card.querySelector('pre.pv-card-preview-text');
        expect(pre?.textContent).toBe('lorem ipsum redacted prompt');
    });
});

// ── ProvenanceTab integration ──────────────────────────────────────────

describe('ProvenanceTab — empty states', () => {
    let store: ProvenanceStore;
    let tab: ProvenanceTab;

    beforeEach(() => {
        store = new ProvenanceStore();
        tab = new ProvenanceTab({ store, projectId: 'prj_test' });
    });

    it('renders the "no selection" empty state by default', () => {
        const root = tab.build();
        expect(
            root.querySelector('[data-testid="pv-empty-no-selection"]'),
        ).not.toBeNull();
    });

    it('renders the "no provenance" empty state when an element has none', () => {
        tab.build();
        tab.setSelectedElement('el_unknown');
        const root = tab.build();
        expect(
            root.querySelector('[data-testid="pv-empty-no-provenance"]'),
        ).not.toBeNull();
    });

    it('does not render the card list when empty', () => {
        const root = tab.build();
        expect(root.querySelector('[data-testid="pv-card-list"]')).toBeNull();
    });
});

describe('ProvenanceTab — populated', () => {
    let store: ProvenanceStore;

    beforeEach(() => {
        store = new ProvenanceStore();
        store.addArtefact(
            makeArtefact({
                id: 'aia_one',
                producedElementIds: ['el_wall_42'],
                workflowKind: 'apartment-layout-generate',
                approvalStatus: 'user-approved',
            }),
        );
        store.addArtefact(
            makeArtefact({
                id: 'aia_two',
                timestamp: '2026-06-02T13:00:00.000Z',
                producedElementIds: ['el_wall_42', 'el_door_99'],
                workflowKind: 'plan-critique',
                approvalStatus: 'auto-applied',
            }),
        );
        store.addArtefact(
            makeArtefact({
                id: 'aia_three',
                producedElementIds: ['el_other'],
                workflowKind: 'should-not-appear',
            }),
        );
    });

    it('renders one card per artefact that produced the selected element', () => {
        const tab = new ProvenanceTab({ store, projectId: 'prj_test' });
        const root = tab.build();
        tab.setSelectedElement('el_wall_42');
        const cards = root.querySelectorAll('[data-testid="pv-artefact-card"]');
        expect(cards.length).toBe(2);
    });

    it('omits cards for artefacts that produced other elements', () => {
        const tab = new ProvenanceTab({ store, projectId: 'prj_test' });
        const root = tab.build();
        tab.setSelectedElement('el_wall_42');
        const cards = Array.from(
            root.querySelectorAll('[data-testid="pv-artefact-card"]'),
        );
        const titles = cards.map((c) =>
            c.querySelector('.pv-card-title')?.textContent,
        );
        expect(titles).not.toContain('should-not-appear');
    });

    it('shows "2 artefacts" in the header count chip', () => {
        const tab = new ProvenanceTab({
            store,
            projectId: 'prj_test',
            initialElementId: 'el_wall_42',
        });
        const root = tab.build();
        const count = root.querySelector(
            '[data-testid="pv-tab-count"]',
        ) as HTMLElement;
        expect(count.textContent).toBe('2 artefacts');
    });

    it('shows "1 artefact" (singular) when only one matches', () => {
        const tab = new ProvenanceTab({
            store,
            projectId: 'prj_test',
            initialElementId: 'el_door_99',
        });
        const root = tab.build();
        const count = root.querySelector(
            '[data-testid="pv-tab-count"]',
        ) as HTMLElement;
        expect(count.textContent).toBe('1 artefact');
    });
});

describe('ProvenanceTab — live updates', () => {
    it('re-renders when a new artefact is added to the store', () => {
        const store = new ProvenanceStore();
        const tab = new ProvenanceTab({
            store,
            projectId: 'prj_test',
            initialElementId: 'el_target',
        });
        const root = tab.build();
        // Initially empty.
        expect(
            root.querySelector('[data-testid="pv-empty-no-provenance"]'),
        ).not.toBeNull();
        // Add an artefact that includes the target.
        store.addArtefact(
            makeArtefact({ producedElementIds: ['el_target'] }),
        );
        // Re-render fired → card list now present, empty state gone.
        expect(root.querySelector('[data-testid="pv-card-list"]')).not.toBeNull();
        expect(
            root.querySelector('[data-testid="pv-empty-no-provenance"]'),
        ).toBeNull();
    });

    it('re-renders when the selected element id changes', () => {
        const store = new ProvenanceStore();
        store.addArtefact(makeArtefact({ producedElementIds: ['el_a'] }));
        const tab = new ProvenanceTab({ store, projectId: 'prj_test' });
        const root = tab.build();
        // No selection → empty-no-selection.
        expect(
            root.querySelector('[data-testid="pv-empty-no-selection"]'),
        ).not.toBeNull();
        // Select el_a → card appears.
        tab.setSelectedElement('el_a');
        expect(
            root.querySelector('[data-testid="pv-artefact-card"]'),
        ).not.toBeNull();
        // Switch to a different element → no-provenance empty.
        tab.setSelectedElement('el_b');
        expect(
            root.querySelector('[data-testid="pv-empty-no-provenance"]'),
        ).not.toBeNull();
    });
});

describe('ProvenanceTab — lifecycle', () => {
    it('build() is idempotent — returns the same root', () => {
        const store = new ProvenanceStore();
        const tab = new ProvenanceTab({ store, projectId: 'prj_test' });
        const root1 = tab.build();
        const root2 = tab.build();
        expect(root1).toBe(root2);
    });

    it('dispose() releases the store subscription so later writes are no-ops', () => {
        const store = new ProvenanceStore();
        const tab = new ProvenanceTab({
            store,
            projectId: 'prj_test',
            initialElementId: 'el_target',
        });
        const root = tab.build();
        expect(
            root.querySelector('[data-testid="pv-empty-no-provenance"]'),
        ).not.toBeNull();
        tab.dispose();
        // After dispose: store writes should NOT cause the panel to update.
        store.addArtefact(makeArtefact({ producedElementIds: ['el_target'] }));
        // Panel root is still the empty state from before dispose.
        expect(
            root.querySelector('[data-testid="pv-empty-no-provenance"]'),
        ).not.toBeNull();
    });

    it('dispose() is idempotent', () => {
        const store = new ProvenanceStore();
        const tab = new ProvenanceTab({ store, projectId: 'prj_test' });
        tab.build();
        tab.dispose();
        expect(() => tab.dispose()).not.toThrow();
    });

    it('setSelectedElement after dispose is a no-op', () => {
        const store = new ProvenanceStore();
        const tab = new ProvenanceTab({ store, projectId: 'prj_test' });
        tab.build();
        tab.dispose();
        expect(() => tab.setSelectedElement('el_anything')).not.toThrow();
        expect(tab.getSelectedElement()).toBeNull();
    });
});

describe('ProvenanceTab — accessibility', () => {
    it('exposes role + aria-label on the root', () => {
        const store = new ProvenanceStore();
        const tab = new ProvenanceTab({ store, projectId: 'prj_test' });
        const root = tab.build();
        expect(root.getAttribute('role')).toBe('region');
        expect(root.getAttribute('aria-label')).toMatch(/AI provenance/);
    });
});
