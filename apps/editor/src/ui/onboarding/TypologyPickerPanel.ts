/**
 * A.6.b (Phase A · IP-A3 Sprint 3) — L5 TypologyPicker panel.
 *
 * The user-facing surface of the L3 `buildPickerCards` model. Renders
 * the typology cards from `@pryzm/typology-pipeline` grouped by phase
 * gate (GA · Beta · Alpha · Community) per C50 §5.3. Locked cards are
 * shown WITH a lock badge, never filtered out — the user must see the
 * upgrade path.
 *
 * Layer:      UI — L5 (vanilla DOM, mirrors AIPanel + ProvenanceTab)
 * Contract:   C50 §5.3 (picker must show every registered pack +
 *             annotate, not hide); C39 §1.x (plan-tier gating)
 * CSS prefix: tp- (TypologyPicker)
 *
 * Data flow:
 *   registry.list() + userTier
 *     → buildPickerCards(registry, userTier)        — L3 model
 *     → groupByPhaseGate(cards)                      — L3 model
 *     → render groups + cards                        — this panel
 *     → onPick(typologyId)                           — caller dispatches
 *
 * No module-load DOM access. The constructor builds elements lazily so
 * happy-dom unit tests can drive the lifecycle without a global stub.
 */

import {
    buildPickerCards,
    groupByPhaseGate,
    summarizePickerCards,
    type PickerCard,
    type PhaseGateGroup,
} from '@pryzm/typology-pipeline';
import type { TypologyRegistry } from '@pryzm/typology-pipeline';
import type { PlanTier } from '@pryzm/schemas';

// ─── pure helpers (exported for unit tests) ──────────────────────────────────

const PHASE_GATE_LABEL: Readonly<Record<PickerCard['phaseGate'], string>> = {
    ga: 'Generally available',
    beta: 'Beta',
    alpha: 'Alpha',
    'community-marketplace': 'Community',
};

const PHASE_GATE_CLASS: Readonly<Record<PickerCard['phaseGate'], string>> = {
    ga: 'tp-badge--ga',
    beta: 'tp-badge--beta',
    alpha: 'tp-badge--alpha',
    'community-marketplace': 'tp-badge--community',
};

/** Display label for the phase-gate chip — exported for tests. */
export function labelForPhaseGate(gate: PickerCard['phaseGate']): string {
    return PHASE_GATE_LABEL[gate];
}

/** CSS class for the phase-gate chip — exported for tests. */
export function phaseGateClass(gate: PickerCard['phaseGate']): string {
    return PHASE_GATE_CLASS[gate];
}

/** Format a star rating as "★ 4.6 (12)" or "—" if unrated. */
export function formatRating(card: PickerCard): string {
    if (card.averageRating === null) return '—';
    const stars = card.averageRating.toFixed(1);
    const count = card.reviewCount ?? 0;
    return `★ ${stars} (${count})`;
}

// ─── panel options + class ───────────────────────────────────────────────────

export interface TypologyPickerPanelOptions {
    readonly registry: TypologyRegistry;
    readonly userTier: PlanTier;
    /** Fired when the user clicks an UNLOCKED card. Locked cards
     *  surface a tooltip-style hint and do NOT fire onPick. */
    readonly onPick?: (typologyId: string) => void;
}

/**
 * Stateful picker panel. Caller lifecycle:
 *
 *   const picker = new TypologyPickerPanel({ registry, userTier, onPick });
 *   container.appendChild(picker.build());
 *   // … registry mutates → caller calls picker.refresh()
 *   picker.dispose();
 */
export class TypologyPickerPanel {
    private readonly registry: TypologyRegistry;
    private readonly userTier: PlanTier;
    private readonly onPick?: (typologyId: string) => void;

    private root: HTMLElement | null = null;
    private summaryEl: HTMLElement | null = null;
    private groupsEl: HTMLElement | null = null;
    private unsubscribe: (() => void) | null = null;

    constructor(opts: TypologyPickerPanelOptions) {
        this.registry = opts.registry;
        this.userTier = opts.userTier;
        this.onPick = opts.onPick;
    }

    /** Build the root element and return it for mounting. */
    build(): HTMLElement {
        if (this.root) return this.root;

        const root = document.createElement('section');
        root.className = 'tp-panel';
        root.setAttribute('data-testid', 'tp-panel');
        root.setAttribute('aria-label', 'PRYZM project type picker');
        this.root = root;

        const header = document.createElement('header');
        header.className = 'tp-header';
        const title = document.createElement('h2');
        title.className = 'tp-title';
        title.textContent = 'Choose a project type';
        const summary = document.createElement('span');
        summary.className = 'tp-summary';
        summary.setAttribute('data-testid', 'tp-summary');
        this.summaryEl = summary;
        header.appendChild(title);
        header.appendChild(summary);
        root.appendChild(header);

        const groups = document.createElement('div');
        groups.className = 'tp-groups';
        groups.setAttribute('data-testid', 'tp-groups');
        this.groupsEl = groups;
        root.appendChild(groups);

        // Subscribe so the picker reacts to runtime pack registration
        // (per C50 §3.1).
        this.unsubscribe = this.registry.subscribe(() => this.render());

        this.render();
        return root;
    }

    /** Force a re-render against the current registry state. */
    refresh(): void {
        this.render();
    }

    /** Detach DOM + drop subscription. Idempotent. */
    dispose(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.root && this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
        this.root = null;
        this.summaryEl = null;
        this.groupsEl = null;
    }

    // ── internals ────────────────────────────────────────────────────────

    private render(): void {
        if (!this.root || !this.groupsEl || !this.summaryEl) return;

        const cards = buildPickerCards(this.registry, this.userTier);
        const groups = groupByPhaseGate(cards);

        const summary = summarizePickerCards(cards);
        this.summaryEl.textContent = `${summary.total} pack${summary.total === 1 ? '' : 's'} · ${summary.unlocked} unlocked`;

        this.groupsEl.innerHTML = '';
        if (groups.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'tp-empty';
            empty.setAttribute('data-testid', 'tp-empty');
            empty.textContent = 'No typology packs are registered.';
            this.groupsEl.appendChild(empty);
            return;
        }

        for (const group of groups) {
            this.groupsEl.appendChild(this.renderGroup(group));
        }
    }

    private renderGroup(group: PhaseGateGroup): HTMLElement {
        const section = document.createElement('section');
        section.className = 'tp-group';
        section.setAttribute('data-testid', `tp-group-${group.phaseGate}`);

        const heading = document.createElement('h3');
        heading.className = 'tp-group-heading';
        heading.textContent = labelForPhaseGate(group.phaseGate);
        section.appendChild(heading);

        const grid = document.createElement('div');
        grid.className = 'tp-grid';
        for (const card of group.cards) {
            grid.appendChild(this.renderCard(card));
        }
        section.appendChild(grid);
        return section;
    }

    private renderCard(card: PickerCard): HTMLElement {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `tp-card ${card.locked ? 'tp-card--locked' : 'tp-card--unlocked'}`;
        el.setAttribute('data-testid', `tp-card-${card.id}`);
        el.setAttribute('data-typology-id', card.id);
        el.setAttribute('data-locked', String(card.locked));
        if (card.locked) {
            el.disabled = true;
            el.setAttribute('aria-disabled', 'true');
            el.title = card.lockReason;
        }
        el.addEventListener('click', () => {
            if (card.locked) return;
            this.onPick?.(card.id);
        });

        const top = document.createElement('div');
        top.className = 'tp-card-top';
        const name = document.createElement('div');
        name.className = 'tp-card-name';
        name.textContent = card.displayName;
        const gateBadge = document.createElement('span');
        gateBadge.className = `tp-badge ${phaseGateClass(card.phaseGate)}`;
        gateBadge.setAttribute('data-testid', `tp-gate-${card.id}`);
        gateBadge.textContent = labelForPhaseGate(card.phaseGate);
        top.appendChild(name);
        top.appendChild(gateBadge);
        el.appendChild(top);

        const desc = document.createElement('div');
        desc.className = 'tp-card-desc';
        desc.textContent = card.description;
        el.appendChild(desc);

        const meta = document.createElement('dl');
        meta.className = 'tp-card-meta';
        meta.appendChild(makeMetaRow('Category', card.category));
        meta.appendChild(makeMetaRow('Version', card.version));
        meta.appendChild(makeMetaRow('Author', card.author));
        if (card.isMarketplace) {
            meta.appendChild(makeMetaRow('Rating', formatRating(card)));
        }
        el.appendChild(meta);

        if (card.locked) {
            const lock = document.createElement('div');
            lock.className = 'tp-card-lock';
            lock.setAttribute('data-testid', `tp-lock-${card.id}`);
            lock.textContent = `🔒 ${card.lockReason}`;
            el.appendChild(lock);
        }
        return el;
    }
}

function makeMetaRow(label: string, value: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'tp-card-meta-row';
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    row.appendChild(dt);
    row.appendChild(dd);
    return row;
}
