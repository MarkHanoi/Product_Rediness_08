// @vitest-environment happy-dom
//
// A.31.e iteration 5.2.b — right-click menu + tab orchestrator tests.
//
// Drives the orchestrator independently of ModelTree (we synthesise the
// `onContextMenu` payload directly to keep these tests focused).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProvenanceStore } from '@pryzm/stores';
import type { AIArtefact } from '@pryzm/schemas/provenance';
import type { InspectSelection } from '@pryzm/schemas';
import { ProvenanceMenuOrchestrator } from '../src/ui/inspect/ProvenanceMenuOrchestrator';
import type { ModelTreeContextMenuPayload } from '../src/ui/inspect/ModelTree';

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
        promptPreviewRedacted: 'prompt preview',
        contextHash: SHA64,
        contextSnapshotId: CS_ID,
        redactionRecordId: null,
        inputTokens: 100,
        outputTokens: 100,
        costUsd: 0.001,
        durationMs: 1000,
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

function elementInstancePayload(
    elementId: string,
    overrides: Partial<ModelTreeContextMenuPayload> = {},
): ModelTreeContextMenuPayload {
    const selection: InspectSelection = {
        kind: 'elementInstance',
        id: elementId,
        elementType: 'wall',
    } as InspectSelection;
    return {
        selection,
        clientX: 100,
        clientY: 200,
        ...overrides,
    };
}

function nonElementPayload(): ModelTreeContextMenuPayload {
    const selection: InspectSelection = {
        kind: 'project',
        id: 'prj_x',
    } as InspectSelection;
    return { selection, clientX: 0, clientY: 0 };
}

describe('ProvenanceMenuOrchestrator — openMenu', () => {
    let store: ProvenanceStore;
    let host: HTMLElement;
    let orchestrator: ProvenanceMenuOrchestrator;

    beforeEach(() => {
        store = new ProvenanceStore();
        host = document.createElement('div');
        document.body.appendChild(host);
        orchestrator = new ProvenanceMenuOrchestrator({
            store,
            projectId: 'prj_test',
            hostContainer: host,
        });
    });

    afterEach(() => {
        orchestrator.dispose();
        host.remove();
    });

    it('renders a menu when right-clicking an elementInstance node', () => {
        orchestrator.openMenu(elementInstancePayload('el_wall_42'));
        const menu = host.querySelector('[data-testid="provenance-menu"]');
        expect(menu).not.toBeNull();
        expect(orchestrator.isMenuOpen()).toBe(true);
    });

    it('does NOT render the menu for non-element selections', () => {
        orchestrator.openMenu(nonElementPayload());
        expect(host.querySelector('[data-testid="provenance-menu"]')).toBeNull();
        expect(orchestrator.isMenuOpen()).toBe(false);
    });

    it('positions the menu at the supplied client coords', () => {
        orchestrator.openMenu(
            elementInstancePayload('el_wall_42', { clientX: 250, clientY: 300 }),
        );
        const menu = host.querySelector(
            '[data-testid="provenance-menu"]',
        ) as HTMLElement;
        expect(menu.style.left).toBe('250px');
        expect(menu.style.top).toBe('300px');
        expect(menu.style.position).toBe('fixed');
    });

    it('renders the "Show AI provenance" action item', () => {
        orchestrator.openMenu(elementInstancePayload('el_wall_42'));
        const item = host.querySelector(
            '[data-action="show-ai-provenance"]',
        ) as HTMLElement;
        expect(item).not.toBeNull();
        expect(item.textContent).toBe('Show AI provenance');
        expect(item.getAttribute('role')).toBe('menuitem');
    });

    it('replaces a prior open menu when reopened', () => {
        orchestrator.openMenu(elementInstancePayload('el_a'));
        orchestrator.openMenu(elementInstancePayload('el_b'));
        const menus = host.querySelectorAll('[data-testid="provenance-menu"]');
        expect(menus.length).toBe(1);
    });
});

describe('ProvenanceMenuOrchestrator — menu dismissal', () => {
    let store: ProvenanceStore;
    let host: HTMLElement;
    let orchestrator: ProvenanceMenuOrchestrator;

    beforeEach(() => {
        store = new ProvenanceStore();
        host = document.createElement('div');
        document.body.appendChild(host);
        orchestrator = new ProvenanceMenuOrchestrator({
            store,
            projectId: 'prj_test',
            hostContainer: host,
        });
    });

    afterEach(() => {
        orchestrator.dispose();
        host.remove();
    });

    it('closeMenu() removes the menu DOM', () => {
        orchestrator.openMenu(elementInstancePayload('el_wall_42'));
        orchestrator.closeMenu();
        expect(host.querySelector('[data-testid="provenance-menu"]')).toBeNull();
        expect(orchestrator.isMenuOpen()).toBe(false);
    });

    it('Escape key dismisses the menu', () => {
        orchestrator.openMenu(elementInstancePayload('el_wall_42'));
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        expect(orchestrator.isMenuOpen()).toBe(false);
    });

    it('closeMenu() is idempotent', () => {
        orchestrator.openMenu(elementInstancePayload('el_wall_42'));
        orchestrator.closeMenu();
        expect(() => orchestrator.closeMenu()).not.toThrow();
    });
});

describe('ProvenanceMenuOrchestrator — action → tab', () => {
    let store: ProvenanceStore;
    let host: HTMLElement;
    let orchestrator: ProvenanceMenuOrchestrator;

    beforeEach(() => {
        store = new ProvenanceStore();
        // Seed an artefact that produced the target element.
        store.addArtefact(
            makeArtefact({
                id: 'aia_a',
                producedElementIds: ['el_wall_42'],
            }),
        );
        host = document.createElement('div');
        document.body.appendChild(host);
        orchestrator = new ProvenanceMenuOrchestrator({
            store,
            projectId: 'prj_test',
            hostContainer: host,
        });
    });

    afterEach(() => {
        orchestrator.dispose();
        host.remove();
    });

    it('clicking "Show AI provenance" mounts the Provenance tab', () => {
        orchestrator.openMenu(elementInstancePayload('el_wall_42'));
        const item = host.querySelector(
            '[data-action="show-ai-provenance"]',
        ) as HTMLElement;
        item.click();
        expect(orchestrator.isProvenanceTabOpen()).toBe(true);
        const tab = host.querySelector('[data-testid="provenance-tab"]');
        expect(tab).not.toBeNull();
    });

    it('mounted tab shows the artefact card for the selected element', () => {
        orchestrator.openMenu(elementInstancePayload('el_wall_42'));
        const item = host.querySelector(
            '[data-action="show-ai-provenance"]',
        ) as HTMLElement;
        item.click();
        const cards = host.querySelectorAll('[data-testid="pv-artefact-card"]');
        expect(cards.length).toBe(1);
    });

    it('the menu closes after the action fires', () => {
        orchestrator.openMenu(elementInstancePayload('el_wall_42'));
        const item = host.querySelector(
            '[data-action="show-ai-provenance"]',
        ) as HTMLElement;
        item.click();
        expect(orchestrator.isMenuOpen()).toBe(false);
    });

    it('right-clicking a SECOND element swaps the tab selection without re-mounting', () => {
        store.addArtefact(
            makeArtefact({
                id: 'aia_b',
                producedElementIds: ['el_door_99'],
            }),
        );
        orchestrator.openMenu(elementInstancePayload('el_wall_42'));
        (host.querySelector(
            '[data-action="show-ai-provenance"]',
        ) as HTMLElement).click();
        orchestrator.openMenu(elementInstancePayload('el_door_99'));
        (host.querySelector(
            '[data-action="show-ai-provenance"]',
        ) as HTMLElement).click();
        // Same tab element, new selection.
        const tabs = host.querySelectorAll('[data-testid="provenance-tab"]');
        expect(tabs.length).toBe(1);
        const cards = host.querySelectorAll('[data-testid="pv-artefact-card"]');
        // Now showing the artefact that produced el_door_99.
        expect(cards.length).toBe(1);
    });

    it('Enter key on the focused menu item fires the action', () => {
        orchestrator.openMenu(elementInstancePayload('el_wall_42'));
        const item = host.querySelector(
            '[data-action="show-ai-provenance"]',
        ) as HTMLElement;
        // happy-dom dispatches keydown; the orchestrator wires Enter+Space.
        item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(orchestrator.isProvenanceTabOpen()).toBe(true);
    });
});

describe('ProvenanceMenuOrchestrator — dispose', () => {
    it('dispose() closes both menu + tab', () => {
        const store = new ProvenanceStore();
        store.addArtefact(makeArtefact({ producedElementIds: ['el_a'] }));
        const host = document.createElement('div');
        document.body.appendChild(host);
        const orchestrator = new ProvenanceMenuOrchestrator({
            store,
            projectId: 'prj_test',
            hostContainer: host,
        });
        orchestrator.openMenu(elementInstancePayload('el_a'));
        (host.querySelector(
            '[data-action="show-ai-provenance"]',
        ) as HTMLElement).click();
        // Both should be present.
        expect(orchestrator.isProvenanceTabOpen()).toBe(true);
        // Open another menu so both are mounted simultaneously.
        orchestrator.openMenu(elementInstancePayload('el_a'));
        expect(orchestrator.isMenuOpen()).toBe(true);
        orchestrator.dispose();
        expect(orchestrator.isMenuOpen()).toBe(false);
        expect(orchestrator.isProvenanceTabOpen()).toBe(false);
        host.remove();
    });

    it('dispose() is idempotent', () => {
        const store = new ProvenanceStore();
        const host = document.createElement('div');
        const orchestrator = new ProvenanceMenuOrchestrator({
            store,
            projectId: 'prj_test',
            hostContainer: host,
        });
        orchestrator.dispose();
        expect(() => orchestrator.dispose()).not.toThrow();
    });

    it('openMenu after dispose is a no-op', () => {
        const store = new ProvenanceStore();
        const host = document.createElement('div');
        document.body.appendChild(host);
        const orchestrator = new ProvenanceMenuOrchestrator({
            store,
            projectId: 'prj_test',
            hostContainer: host,
        });
        orchestrator.dispose();
        orchestrator.openMenu(elementInstancePayload('el_a'));
        expect(orchestrator.isMenuOpen()).toBe(false);
        host.remove();
    });
});

describe('ProvenanceMenuOrchestrator — defaults', () => {
    it('mounts into document.body when no hostContainer supplied', () => {
        const store = new ProvenanceStore();
        store.addArtefact(makeArtefact({ producedElementIds: ['el_a'] }));
        const orchestrator = new ProvenanceMenuOrchestrator({
            store,
            projectId: 'prj_test',
        });
        try {
            orchestrator.openMenu(elementInstancePayload('el_a'));
            const menu = document.body.querySelector(
                '[data-testid="provenance-menu"]',
            );
            expect(menu).not.toBeNull();
        } finally {
            orchestrator.dispose();
        }
    });
});
