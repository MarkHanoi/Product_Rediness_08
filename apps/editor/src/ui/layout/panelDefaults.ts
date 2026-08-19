/**
 * @file apps/editor/src/ui/layout/panelDefaults.ts
 *
 * §UX1-PANEL-DEFAULTS — the SINGLE authority for which editor chrome surfaces are
 * OPEN when the app starts, and the one place the "reset panel layout" verb lives.
 *
 * ── Why this exists (founder report, 2026-08-18) ─────────────────────────────
 * A fresh project opened with SEVEN chrome surfaces already on screen — the Site
 * plan overlay card, the Site analysis panel, the Buildable envelope card, the
 * onboarding wizard, the launcher rail, the left nav rail and the top mode bar —
 * several of them overlapping, one panel's ✕ sitting on another panel's content.
 * The canvas, which is the product, was the smallest thing on screen.
 *
 * The defaults that produced that were three unrelated literals in three files
 * (`envelopeCardHidden = false` in GISAreaLayout, `_userHidden = false` in
 * FormaSiteAnalysisControls, an unconditional `renderPanel()` in
 * SitePlanOverlayController). Nothing enumerated them, so nobody could see the
 * total. This module IS that enumeration: the table below is the answer to "what
 * is open on start-up and why", and every surface reads its default from here.
 *
 * ── The one hard constraint (C82 §1.1) ──────────────────────────────────────
 * A control the user can click is a claim the product makes; the inverse is that
 * a capability with NO control is a capability the product has withdrawn. Closing
 * a panel by default is legal ONLY because C82's ABSENT state is legal *and* the
 * capability keeps a visible route back. Every CLOSED row below therefore names
 * its {@link PanelDescriptor.reopen} control, and `panelDefaults.spec.ts` pins
 * that every non-essential panel has one. A row with no reopen route is a defect,
 * not a tidier screen.
 *
 * ── The persistence rule, DECLARED (so there is one answer, not two) ────────
 * **Panel open/closed state is SESSION-SCOPED and is NOT persisted.** Every app
 * start and every project open restores the table below. Within one page load the
 * state survives view switches and project switches (the surfaces re-read this
 * module rather than re-initialising their own flags), which is what makes
 * "I opened Site analysis, switched to 3D, came back" behave.
 *
 * This is a deliberate choice over "remember the user's last layout":
 *   · the founder's ask is specifically about the STARTING state, and a persisted
 *     layout re-creates the reported defect for any user who ever opened a panel;
 *   · a half-persisted world — some panels remembering, some not — is the EI-9
 *     defect (one question, two answers), and with 3 panels persisting through 3
 *     different mechanisms that is exactly where this was heading.
 * If persistence is wanted later it goes HERE, for ALL rows at once, behind
 * {@link PANEL_LAYOUT_PERSISTENCE} — never per panel.
 *
 * ── Contracts ───────────────────────────────────────────────────────────────
 * · C82 §1.1 / §1.2 — three legal control states; ABSENT is legal, a control that
 *   leads nowhere is not. The reopen column is this contract's obligation.
 * · C06 §7.2 — no-overlap layout policy. Closing the two right-hand panels by
 *   default is also the cheapest true fix for the reported ✕-over-content overlap.
 * · C06 §6 — visual tokens are CSS custom properties; see `styles/tokens.ts`
 *   (`--pryzm-panel-*`), which this module deliberately does NOT duplicate.
 * · C43 — reopen controls stay ≥ 24 px (WCAG 2.2 AA SC 2.5.8).
 */

/** Every chrome surface that can occupy the viewport on a fresh start. */
export type PanelId =
    // ── non-essential: CLOSED by default, reopened from the launcher rail ──
    | 'site-analysis'
    | 'buildable-envelope'
    | 'site-plan-overlay'
    // ── essential: OPEN by default, not closable from this mechanism ──
    | 'viewport'
    | 'platform-toolbar'
    | 'left-icon-strip'
    | 'right-tools-spine'
    | 'launcher-rail'
    | 'renderer-backend-toggle'
    | 'onboarding-wizard'
    | 'boundary-draw-chrome'
    | 'view-mode-bars';

export interface PanelDescriptor {
    readonly id: PanelId;
    /** The title as the user reads it on screen. */
    readonly title: string;
    /** Screen region owned, in C06 §7.2 terms. */
    readonly region: string;
    /** TRUE ⇒ open on every app start and project open. */
    readonly defaultOpen: boolean;
    /**
     * TRUE ⇒ this surface must stay open; it is named here so "stays open" is a
     * recorded judgement with a reason, never an implicit leftover. Essential
     * surfaces are NOT governed by {@link setPanelOpen}.
     */
    readonly essential: boolean;
    /**
     * The visible control that opens this surface again, as a `data-testid`.
     * MUST be non-empty for every non-essential panel (C82 §1.1) — the spec
     * beside this file fails the build if one is blank.
     */
    readonly reopen: string;
    /** Why this default. Prose, because the reason is the point of the table. */
    readonly why: string;
}

/**
 * THE TABLE. Read it as the answer to "what is on screen when the editor opens".
 *
 * Before this module (measured 2026-08-18 by reading the three initialisers):
 * `site-analysis` OPEN · `buildable-envelope` OPEN · `site-plan-overlay` OPEN.
 * After: all three CLOSED. Essential rows are unchanged in both readings.
 */
export const PANEL_REGISTRY: readonly PanelDescriptor[] = [
    {
        id: 'site-analysis',
        title: 'Site analysis',
        region: 'viewport · right edge',
        defaultOpen: false,
        essential: false,
        reopen: 'site-analysis-launcher',
        why:
            'Sun & shadow, weather, wind rose, 3D site analysis and the analysis heatmap are ' +
            'an ANALYSIS task the user chooses to start — none of them is needed to draw a ' +
            'boundary or place an element, which is what a fresh project is for. It is the ' +
            'tallest surface on screen and it opened before any of its metrics had been asked for.',
    },
    {
        id: 'buildable-envelope',
        title: 'Buildable envelope',
        region: 'viewport · right edge',
        defaultOpen: false,
        essential: false,
        reopen: 'envelope-card-launcher',
        why:
            'A jurisdiction READ-OUT — several paragraphs of ordinance prose and citations. ' +
            'It reports on a parcel the user has not necessarily committed yet, it is the ' +
            'panel that physically overlapped Site analysis, and its content is reference ' +
            'material rather than a control. Closed by default; the massing GEOMETRY toggle ' +
            'it hosts is unaffected (that is `formaEnvelopeVisible`, a separate flag).',
    },
    {
        id: 'site-plan-overlay',
        title: 'Site plan overlay',
        region: 'viewport · right edge (2D boundary-draw map only)',
        defaultOpen: false,
        essential: false,
        reopen: 'site-overlay-reopen',
        why:
            'An IMPORT tool — upload a PDF/scan and calibrate it under the map. It is used ' +
            'once per project at most, and it opened as a card in the middle of the map it ' +
            'exists to sit under. Closed to a header chip that stays anchored in its own ' +
            'region, so the route back is on screen and costs one click.',
    },
    {
        id: 'viewport',
        title: 'Viewport (3D / plan canvas)',
        region: 'viewport · whole',
        defaultOpen: true,
        essential: true,
        reopen: '',
        why: 'It is the product. Everything else in this table is chrome around it.',
    },
    {
        id: 'platform-toolbar',
        title: 'Top mode bar / platform toolbar',
        region: 'screen · top edge',
        defaultOpen: true,
        essential: true,
        reopen: '',
        why:
            'The primary command surface (C82). Hiding it would make the majority of the ' +
            "product's verbs unreachable in one move — the exact defect C82 §1.2 forbids.",
    },
    {
        id: 'left-icon-strip',
        title: 'Left icon strip (Browser · Physics · Documents · AI · Camera · Levels · GIS · Inspect)',
        region: 'screen · left edge (52 px)',
        defaultOpen: true,
        essential: true,
        reopen: '',
        why:
            'Primary navigation. It is a 52px RAIL, not a panel — it occludes nothing and it ' +
            'is the route to most other surfaces. Its FLYOUTS are already closed by default ' +
            '(ProjectBrowserPanel reads openness off `display === "flex"`), so this row is ' +
            'about the strip only. NB the surface here is `ProjectBrowserPanel`’s `vb-panel`; ' +
            'the `LeftNavRail` class is constructed and then deliberately NOT mounted ' +
            '(NavigationAreaLayout: `void leftNavRail; // suppressed — not mounted`), so its ' +
            '`bim-lnr-*` storage keys are dead. Naming the wrong one here would have made this ' +
            'table describe a rail the user never sees.',
    },
    {
        id: 'right-tools-spine',
        title: 'Right tools spine (Architecture · Structure · Interiors · …)',
        region: 'screen · right edge (52 px)',
        defaultOpen: true,
        essential: true,
        reopen: '',
        why:
            'The mirror of the left strip and the entry point to the element tools — the ' +
            'primary authoring surface (C82). Its floating rail panel (`tpr-panel`) is ALREADY ' +
            'closed by default and opens from a spine button, which is the pattern this whole ' +
            'change generalises; nothing to do here beyond recording it.',
    },
    {
        id: 'launcher-rail',
        title: 'Launcher rail (bottom-left pills)',
        region: 'screen · bottom-left corner (C06 §7.2 declared column)',
        defaultOpen: true,
        essential: true,
        reopen: '',
        why:
            'THIS IS THE REOPEN AFFORDANCE for the three closed panels above, so it is the ' +
            'one surface that must NOT be closed by this change — closing it would make the ' +
            'panels unreachable, which is strictly worse than a cluttered screen. It is ' +
            'instead made smaller and quieter (see `launcherPillStyle`).',
    },
    {
        id: 'renderer-backend-toggle',
        title: 'GPU backend toggle (bottom-left readout)',
        region: 'screen · bottom-left corner, below the launcher rail',
        defaultOpen: true,
        essential: true,
        reopen: '',
        why:
            'The stability escape hatch (ADR-0076/0077): on a machine where WebGPU device-loss ' +
            'kills the renderer, this pill is how the user gets back to a working viewport. ' +
            'Putting the escape hatch behind a panel that needs a working renderer to open is ' +
            'a bootstrap trap. Kept visible deliberately.',
    },
    {
        id: 'onboarding-wizard',
        title: 'Set up your project (guided flow)',
        region: 'viewport · bottom-centre',
        defaultOpen: true,
        essential: true,
        reopen: '',
        why:
            'CONDITIONAL, and already opt-in: it appears only inside the guided New Project ' +
            'flow the user explicitly chose, and it is the ACTIVE TASK at that moment — the ' +
            'one surface on screen the user is being asked to act on. Closing the active task ' +
            'by default would strand the flow. It already has its own dismiss control.',
    },
    {
        id: 'boundary-draw-chrome',
        title: 'Boundary-draw HUD (instruction chip · basemap toggle · mode strip · geocode box)',
        region: 'viewport · 2D site map, while the draw tool is active',
        defaultOpen: true,
        essential: true,
        reopen: '',
        why:
            'TOOL chrome, not panels: these belong to the boundary-draw tool that is running, ' +
            'they disappear with it, and the instruction chip is the only thing telling the ' +
            'user what the two clicks they are about to make will do. Enumerated here so ' +
            '"what is on screen on a fresh start" is a complete answer — but deliberately NOT ' +
            'governed by this mechanism: a HUD that outlives its tool, or a tool with no HUD, ' +
            'are both worse than the clutter. Out of scope, named rather than silently omitted.',
    },
    {
        id: 'view-mode-bars',
        title: 'View toggles (result view 2D/3D · Forma sub-mode bar)',
        region: 'viewport · top-centre, stacked at 64 px and 108 px',
        defaultOpen: true,
        essential: true,
        reopen: '',
        why:
            'These switch WHICH VIEW the pane renders — closing them would strand a user in ' +
            'whatever view they happened to be in, with no route out. They are also the reason ' +
            'the right-edge column starts at 148px rather than the envelope card’s old ' +
            '108px: the card was anchored at exactly the sub-bar’s offset.',
    },
] as const;

/**
 * Declared persistence policy for panel open/closed state. `'session'` means: not
 * written to localStorage, not written to the project, restored to the table above
 * on every app start and project open. Change this in ONE place or not at all —
 * a per-panel exception is the EI-9 defect this module exists to prevent.
 */
export const PANEL_LAYOUT_PERSISTENCE: 'session' = 'session';

const BY_ID: ReadonlyMap<PanelId, PanelDescriptor> = new Map(
    PANEL_REGISTRY.map((p) => [p.id, p] as const),
);

/** The descriptor for a panel. Throws on an unknown id — the table is the contract. */
export function panelDescriptor(id: PanelId): PanelDescriptor {
    const d = BY_ID.get(id);
    if (!d) throw new Error(`[panelDefaults] unknown panel id: ${id}`);
    return d;
}

/** The declared start-up state for a panel (the table, not the live state). */
export function panelDefaultOpen(id: PanelId): boolean {
    return panelDescriptor(id).defaultOpen;
}

/** Every non-essential panel — the set this mechanism actually governs. */
export function closablePanels(): readonly PanelDescriptor[] {
    return PANEL_REGISTRY.filter((p) => !p.essential);
}

/**
 * Live, session-scoped open/closed state. Seeded from the table; never read from
 * or written to storage (see {@link PANEL_LAYOUT_PERSISTENCE}).
 */
const sessionState = new Map<PanelId, boolean>(
    PANEL_REGISTRY.map((p) => [p.id, p.defaultOpen] as const),
);

/** TRUE when the panel is currently open. Essential panels always read TRUE. */
export function isPanelOpen(id: PanelId): boolean {
    const d = panelDescriptor(id);
    if (d.essential) return true;
    return sessionState.get(id) ?? d.defaultOpen;
}

/**
 * Record a panel's open/closed state for the rest of the session. No-op for
 * essential panels — they are not governed by this mechanism, and silently
 * accepting a `false` for one would be a lie the caller could not see.
 */
export function setPanelOpen(id: PanelId, open: boolean): void {
    const d = panelDescriptor(id);
    if (d.essential) return;
    sessionState.set(id, open);
}

type ResetListener = () => void;
const resetListeners = new Set<ResetListener>();

/**
 * Subscribe to `Reset panel layout`. The surface's callback must re-apply
 * {@link isPanelOpen} to its own DOM — this module owns the DECISION, never the
 * nodes. Returns a disposer.
 */
export function onPanelLayoutReset(cb: ResetListener): () => void {
    resetListeners.add(cb);
    return () => { resetListeners.delete(cb); };
}

/**
 * `Reset panel layout` — restore every governed panel to the table above and tell
 * the surfaces to re-apply it. Also the recovery route when a panel has been
 * dragged or resized somewhere unusable: listeners clear their own drag/size
 * offsets in the same callback.
 *
 * Returns the ids that CHANGED, so a caller can report honestly (an empty array
 * means "already at defaults", which is a different fact from "reset failed").
 */
export function resetPanelLayout(): readonly PanelId[] {
    const changed: PanelId[] = [];
    for (const p of PANEL_REGISTRY) {
        if (p.essential) continue;
        if ((sessionState.get(p.id) ?? p.defaultOpen) !== p.defaultOpen) changed.push(p.id);
        sessionState.set(p.id, p.defaultOpen);
    }
    for (const cb of [...resetListeners]) {
        try { cb(); } catch (e) { console.warn('[panelDefaults] reset listener threw (non-fatal):', e); }
    }
    return changed;
}

/**
 * TEST-ONLY seam. Restores the session map to the table WITHOUT notifying
 * listeners, so a spec can start from a known state without simulating a user
 * pressing the reset control.
 */
export function __resetPanelSessionStateForTests(): void {
    for (const p of PANEL_REGISTRY) sessionState.set(p.id, p.defaultOpen);
    resetListeners.clear();
}
