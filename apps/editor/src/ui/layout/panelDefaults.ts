/**
 * @file apps/editor/src/ui/layout/panelDefaults.ts
 *
 * §UX1-PANEL-DEFAULTS — the SINGLE authority for which editor chrome surfaces are
 * on screen, in which PHASE of the app, and the one place the "reset panel layout"
 * verb lives.
 *
 * ── Why this exists (founder report, 2026-08-18) ─────────────────────────────
 * A fresh project opened with seven chrome surfaces already on screen, several
 * overlapping, one panel's ✕ sitting on another panel's content. The canvas,
 * which is the product, was the smallest thing on screen.
 *
 * The defaults that produced that were three unrelated literals in three files
 * (`envelopeCardHidden = false` in GISAreaLayout, `_userHidden = false` in
 * FormaSiteAnalysisControls, an unconditional `renderPanel()` in
 * SitePlanOverlayController). Nothing enumerated them, so nobody could see the
 * total. This module IS that enumeration.
 *
 * ── Why it has a PHASE axis (founder report, 2026-08-19) ─────────────────────
 * The follow-up report — standing on the PRYZM Earth globe during onboarding,
 * before any canvas exists — boxed three groups as unwanted AT THAT MOMENT: the
 * floating launcher pills, the `VIEW PROPERTIES — Environment & Camera` panel,
 * and the `Ground +0.000 m` level stepper. None of those three is *wrong*; they
 * are wrong THERE. `VIEW PROPERTIES` configures shadows and post-processing for a
 * model that does not exist yet; the level stepper steps through levels that do
 * not exist yet; the launcher pills re-open panels about a site not yet chosen.
 *
 * So a panel's default is not one boolean — it is a function of WHERE THE USER
 * IS. The table below therefore carries one column per {@link AppPhase}.
 *
 * ⛔ The thing this module exists to prevent is a scatter of `if (onGlobe)`
 * conditionals at each panel. That is precisely the defect the 2026-08-18 pass
 * removed — the total becomes uncountable again, one file at a time. One
 * declaration, one place, phase as a column.
 *
 * ── The three legal states, and why they are exactly three (C82 §1.1) ───────
 * {@link PanelPhaseState} deliberately mirrors C82's three legal control states:
 *
 *   · `open`   — rendered and visible.
 *   · `closed` — not visible, but its REOPEN CONTROL is on screen in this phase.
 *                The capability is one click away. (C82: DISABLED-WITH-REASON's
 *                spirit — the product still offers the verb.)
 *   · `absent` — not rendered, and its reopen control is not rendered either.
 *                C82 §1.1 says absence is always legal; what is NOT legal is
 *                absence that is permanent. A row may be `absent` in one phase
 *                only if it is `open` or `closed` in another — asserted by the
 *                spec, so "hidden during onboarding" can never quietly become
 *                "unreachable".
 *
 * There is no fourth state, and the fourth state this forbids is the one the
 * founder reported twice: a panel on screen that answers a question nobody asked.
 *
 * ── The persistence rule, DECLARED (so there is one answer, not two) ────────
 * **Panel open/closed state is SESSION-SCOPED and is NOT persisted.** Every app
 * start and every project open restores the table. Within one page load the state
 * survives view switches and project switches, which is what makes "I opened Site
 * analysis, switched to 3D, came back" behave.
 *
 * This is a deliberate choice over "remember the user's last layout":
 *   · the founder's ask is specifically about the STARTING state, and a persisted
 *     layout re-creates the reported defect for any user who ever opened a panel;
 *   · a half-persisted world — some panels remembering, some not — is the EI-9
 *     defect (one question, two answers).
 * If persistence is wanted later it goes HERE, for ALL rows at once, behind
 * {@link PANEL_LAYOUT_PERSISTENCE} — never per panel.
 *
 * ── Contracts ───────────────────────────────────────────────────────────────
 * · C82 §1.1 / §1.2 — three legal states; ABSENT is legal, a control that leads
 *   nowhere is not. The reopen column is this contract's obligation.
 * · C06 §7.2 — no-overlap layout policy; C06 §6 — visual tokens are CSS custom
 *   properties (see `styles/tokens.ts`, `--pryzm-panel-*`).
 * · C43 — reopen controls stay ≥ 24 px (WCAG 2.2 AA SC 2.5.8).
 * · C60 / PRYZM-EARTH-ONBOARDING-PRD §4.1 — the phase names below are the
 *   coarse UI split, NOT a rival to C60's `SiteEntryStage` machine. C60 models
 *   world → country → city → parcel; this models "is there a BIM canvas yet".
 *   They are different questions and must not be merged.
 */

/**
 * Where the user is, coarsely, for the purpose of deciding what chrome belongs
 * on screen. Deliberately TWO values, not five: this is not a rival to C60's
 * `SiteEntryStage` (world/country/city/parcel), which answers a different
 * question. Adding a phase here means adding a column to every row below — that
 * cost is the point, and it is what stops this becoming a second state machine.
 */
export type AppPhase =
    /** PRYZM Earth / the Cesium globe + the guided setup flow. No BIM canvas yet. */
    | 'onboarding-globe'
    /** The white BIM canvas: a project model exists and is being authored. */
    | 'canvas';

export const APP_PHASES: readonly AppPhase[] = ['onboarding-globe', 'canvas'] as const;

/** The three legal states of a chrome surface in a phase. See the header. */
export type PanelPhaseState = 'open' | 'closed' | 'absent';

/** Every chrome surface that can occupy the viewport in either phase. */
export type PanelId =
    // ── site/GIS panels: reopened from the launcher rail ──
    | 'site-analysis'
    | 'buildable-envelope'
    | 'site-plan-overlay'
    // ── model chrome: meaningless before a model exists ──
    | 'view-properties'
    | 'level-stepper'
    // ── the reopen surface itself, and the escape hatch ──
    | 'launcher-rail'
    | 'renderer-backend-toggle'
    // ── always-on shell ──
    | 'viewport'
    | 'platform-toolbar'
    | 'left-icon-strip'
    | 'right-tools-spine'
    // ── task-scoped chrome ──
    | 'onboarding-wizard'
    | 'boundary-draw-chrome'
    | 'view-mode-bars';

export interface PanelDescriptor {
    readonly id: PanelId;
    /** The title as the user reads it on screen. */
    readonly title: string;
    /** Screen region owned, in C06 §7.2 terms. */
    readonly region: string;
    /**
     * The state of this surface in each phase. THE table. A row that is `closed`
     * in a phase MUST have a `reopen` control that is itself present in that
     * phase; a row that is `absent` in a phase must be non-absent in another.
     */
    readonly byPhase: Readonly<Record<AppPhase, PanelPhaseState>>;
    /**
     * TRUE ⇒ shell chrome the user may not dismiss. Named here so "stays open" is
     * a recorded judgement with a reason, never an implicit leftover. Essential
     * surfaces are not governed by {@link setPanelOpen}.
     */
    readonly essential: boolean;
    /**
     * The visible control that opens this surface again, as a `data-testid`.
     * MUST be non-empty for every row that is `closed` in some phase (C82 §1.1).
     */
    readonly reopen: string;
    /**
     * WHICH SURFACE HOSTS that reopen control — `'self'` when the panel keeps its
     * own always-present header row.
     *
     * This exists so the reachability rule can be checked mechanically instead of
     * being re-reasoned every time a row changes. The rule: **if a panel is
     * `closed` in a phase, its reopen host must not be `absent` in that phase.**
     * Without this field the rule is a human obligation, and the failure it
     * guards against is silent — hide the launcher rail on the globe, leave a
     * panel `closed` there, and the capability is gone with nothing to notice.
     */
    readonly reopenHost: PanelId | 'self' | null;
    /** Why these defaults. Prose, because the reason is the point of the table. */
    readonly why: string;
}

const ALWAYS = (s: PanelPhaseState): Readonly<Record<AppPhase, PanelPhaseState>> =>
    ({ 'onboarding-globe': s, canvas: s });

/**
 * THE TABLE. Read it as the answer to "what is on screen, where, and why".
 *
 * Measured before this module (2026-08-18, by reading the three initialisers):
 * `site-analysis` OPEN · `buildable-envelope` OPEN · `site-plan-overlay` OPEN, in
 * every phase. Measured on the globe (2026-08-19, founder screenshots):
 * `launcher-rail`, `renderer-backend-toggle`, `view-properties` and
 * `level-stepper` all on screen before any canvas existed.
 */
export const PANEL_REGISTRY: readonly PanelDescriptor[] = [
    {
        id: 'site-analysis',
        title: 'Site analysis',
        region: 'viewport · right edge, bottom slot of the declared column',
        byPhase: { 'onboarding-globe': 'absent', canvas: 'closed' },
        essential: false,
        reopen: 'site-analysis-launcher',
        reopenHost: 'launcher-rail',
        why:
            'Sun & shadow, weather, wind rose and the analysis heatmap are an ANALYSIS task the ' +
            'user chooses to start — none of them is needed to draw a boundary or place an ' +
            'element. ABSENT on the globe because its own reopen pill is absent there (the whole ' +
            'launcher rail is), and a pill that opens a panel about a site not yet chosen is ' +
            'chrome pretending to be a capability.',
    },
    {
        id: 'buildable-envelope',
        title: 'Buildable envelope',
        region: 'viewport · right edge, top slot of the declared column',
        byPhase: { 'onboarding-globe': 'absent', canvas: 'closed' },
        essential: false,
        reopen: 'envelope-card-launcher',
        reopenHost: 'launcher-rail',
        why:
            'A jurisdiction READ-OUT — paragraphs of ordinance prose and citations about a parcel ' +
            'the user has not necessarily committed. It is also the panel that physically ' +
            'overlapped Site analysis (L-1021). The massing GEOMETRY toggle it hosts is a ' +
            'separate flag (`formaEnvelopeVisible`) and is unaffected by this row.',
    },
    {
        id: 'site-plan-overlay',
        title: 'Site plan overlay',
        region: 'viewport · right edge (2D boundary-draw map only)',
        byPhase: { 'onboarding-globe': 'closed', canvas: 'closed' },
        essential: false,
        reopen: 'site-overlay-reopen',
        reopenHost: 'self',
        why:
            'An IMPORT tool — upload a PDF/scan and calibrate it under the map, used once per ' +
            'project at most. It is `closed` rather than `absent` even on the globe because it is ' +
            'reached by collapsing to its own header row, which lives inside the draw surface it ' +
            'belongs to; there is nowhere else for that route to be. Importing a survey IS part ' +
            'of defining a site (PRD §4.2 names it as one of the three site-definition methods), ' +
            'so removing it during onboarding would remove a step of the flow.',
    },
    {
        id: 'view-properties',
        title: 'View properties — Environment & Camera',
        region: 'screen · right edge, inboard of the tools spine',
        byPhase: { 'onboarding-globe': 'absent', canvas: 'open' },
        essential: false,
        // Never `closed` in any phase, so it owes no reopen control. Declaring a
        // testid here that nothing renders would be the C82 §7.b defect — an
        // artefact standing in for a reachable control.
        reopen: '',
        reopenHost: null,
        why:
            'Sun settings, climate/heat, wind, population density, shadows and post-processing — ' +
            'every one of them a property of a RENDERED MODEL. On the globe there is no model, so ' +
            'the panel is answering a question nobody has asked yet and is ABSENT. On the canvas ' +
            'it is left OPEN: it is the primary view-configuration surface there, and this lane ' +
            'has not measured a canvas-phase reopen route for it (a named gap, L-1025) — closing a ' +
            'panel whose route back is unproven is exactly the defect C82 §1.1 forbids, so it ' +
            'stays open until that route is measured rather than assumed.',
    },
    {
        id: 'level-stepper',
        title: 'Level stepper (Ground +0.000 m)',
        region: 'viewport · top-centre',
        byPhase: { 'onboarding-globe': 'absent', canvas: 'open' },
        essential: false,
        // Never `closed` in any phase — see the note on `view-properties`.
        reopen: '',
        reopenHost: null,
        why:
            'Steps the active level up and down. On the globe there are no levels — the control ' +
            'renders a real value ("Ground +0.000 m") for a stack that does not exist, which is ' +
            'the failure-and-emptiness-are-the-same-value shape: it looks like a reading. ABSENT ' +
            'there. On the canvas it is core authoring chrome and stays OPEN. NB the level stack ' +
            'itself is another lane’s subject; this row governs the CHROME’S VISIBILITY only and ' +
            'must not be read as a claim about level behaviour.',
    },
    {
        id: 'launcher-rail',
        title: 'Launcher rail (bottom-left pills + Reset panel layout)',
        region: 'screen · bottom-left corner (C06 §7.2 declared column)',
        byPhase: { 'onboarding-globe': 'absent', canvas: 'open' },
        essential: false,
        reopen: '',
        reopenHost: null,
        why:
            'THE REOPEN SURFACE for the three site panels, which is why it is `open` on the canvas ' +
            'and why closing it there would be strictly worse than clutter. It is ABSENT on the ' +
            'globe — and that is only sound because every panel it re-opens is ALSO absent in that ' +
            'phase. The rail and its dependants move together; the spec asserts exactly that, so ' +
            'the rail can never be hidden in a phase where something still needs it.',
    },
    {
        id: 'renderer-backend-toggle',
        title: 'GPU backend toggle (bottom-left readout)',
        region: 'screen · bottom-left corner, below the launcher rail',
        byPhase: { 'onboarding-globe': 'absent', canvas: 'open' },
        essential: false,
        reopen: '',
        reopenHost: null,
        why:
            'The WebGPU/WebGL escape hatch (ADR-0076/0077): on a machine where device-loss kills ' +
            'the renderer, this pill is how the user gets back to a working viewport. That hazard ' +
            'is a property of the THREE.js BIM canvas — the globe is Cesium and does not go ' +
            'through the swap path — so the hatch is absent exactly where it cannot help and ' +
            'present exactly where it can. It is deliberately NOT hidden on the canvas: putting ' +
            'the escape hatch behind a panel that needs a working renderer is a bootstrap trap.',
    },
    {
        id: 'viewport',
        title: 'Viewport (globe / 3D / plan canvas)',
        region: 'viewport · whole',
        byPhase: ALWAYS('open'),
        essential: true,
        reopen: '',
        reopenHost: null,
        why: 'It is the product. Everything else in this table is chrome around it.',
    },
    {
        id: 'platform-toolbar',
        title: 'Top bar (Author / Inspect / Data)',
        region: 'screen · top edge',
        byPhase: ALWAYS('open'),
        essential: true,
        reopen: '',
        reopenHost: null,
        why:
            'The primary command surface (C82), and named explicitly by the founder as one of the ' +
            'three things to KEEP in both phases. Hiding it would make most of the product’s verbs ' +
            'unreachable in one move — the defect C82 §1.2 forbids.',
    },
    {
        id: 'left-icon-strip',
        title: 'Left icon strip (Browser · Physics · Documents · AI · Camera · Levels · GIS · Inspect)',
        region: 'screen · left edge (52 px)',
        byPhase: ALWAYS('open'),
        essential: true,
        reopen: '',
        reopenHost: null,
        why:
            'Primary navigation, and named by the founder as KEEP. It is a 52px RAIL, not a panel — ' +
            'it occludes nothing. Its FLYOUTS are already closed by default. NB the surface is ' +
            '`ProjectBrowserPanel`’s `vb-panel`; the `LeftNavRail` class is constructed and then ' +
            'deliberately NOT mounted (NavigationAreaLayout), so its `bim-lnr-*` storage keys are ' +
            'dead. Naming the wrong one here would make this table describe a rail nobody sees.',
    },
    {
        id: 'right-tools-spine',
        title: 'Right tools spine (Architecture · Structure · Interiors · …)',
        region: 'screen · right edge (52 px)',
        byPhase: ALWAYS('open'),
        essential: true,
        reopen: '',
        reopenHost: null,
        why:
            'The mirror of the left strip and the entry point to the element tools, named by the ' +
            'founder as KEEP. Its floating rail panel (`tpr-panel`) is already closed by default ' +
            'and opens from a spine button — the pattern this whole change generalises.',
    },
    {
        id: 'onboarding-wizard',
        title: 'Set up your project (guided flow)',
        region: 'viewport · centre',
        byPhase: { 'onboarding-globe': 'open', canvas: 'absent' },
        essential: false,
        reopen: '',
        reopenHost: null,
        why:
            'The ACTIVE TASK during onboarding — the one surface the user is being asked to act ' +
            'on — so it is open in that phase and would strand the flow if closed. It is ABSENT ' +
            'on the canvas because the flow is over by then; that is completion, not concealment. ' +
            'Its SIZE, not its presence, was the founder’s complaint (D7).',
    },
    {
        id: 'boundary-draw-chrome',
        title: 'Boundary-draw HUD (instruction chip · basemap toggle · mode strip · geocode box)',
        region: 'viewport · 2D site map, while the draw tool is active',
        byPhase: { 'onboarding-globe': 'open', canvas: 'absent' },
        essential: true,
        reopen: '',
        reopenHost: null,
        why:
            'TOOL chrome, not panels: it belongs to the boundary-draw tool that is running, it ' +
            'disappears with the tool, and the instruction chip is the only thing telling the user ' +
            'what the two clicks they are about to make will do. Enumerated so the answer to ' +
            '"what is on screen" is complete, but deliberately governed by its tool, not by this ' +
            'mechanism: a HUD that outlives its tool, and a tool with no HUD, are both worse than ' +
            'the clutter.',
    },
    {
        id: 'view-mode-bars',
        title: 'View toggles (result view 2D/3D · Forma sub-mode bar)',
        region: 'viewport · top-centre, stacked at 64 px and 108 px',
        byPhase: ALWAYS('open'),
        essential: true,
        reopen: '',
        reopenHost: null,
        why:
            'These switch WHICH VIEW the pane renders — closing them would strand a user in ' +
            'whatever view they happened to be in, with no route out. They are also why the ' +
            'right-edge column starts at 148px rather than the envelope card’s old 108px: the ' +
            'card was anchored at exactly the sub-bar’s offset.',
    },
] as const;

/**
 * Declared persistence policy for panel open/closed state. `'session'` means: not
 * written to storage, not written to the project, restored to the table above on
 * every app start and project open. Change this in ONE place or not at all — a
 * per-panel exception is the EI-9 defect this module exists to prevent.
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The app starts on the globe. This is the honest default for the shipping entry
 * path (New Project → guided onboarding → PRYZM Earth) AND the safe one: getting
 * the phase wrong in this direction hides chrome that is about to be needed and
 * is corrected the moment {@link setAppPhase} fires, whereas defaulting to
 * `canvas` would show model chrome over a globe with no model — the exact thing
 * reported. A surface that never calls `setAppPhase` therefore degrades to
 * "quiet", not to "wrong".
 */
let currentPhase: AppPhase = 'onboarding-globe';

type PhaseListener = (phase: AppPhase) => void;
const phaseListeners = new Set<PhaseListener>();

/** Where the user is now. */
export function appPhase(): AppPhase {
    return currentPhase;
}

/**
 * Declare the phase. Idempotent — re-declaring the current phase notifies nobody,
 * so a caller may fire this defensively on every view change without causing a
 * re-layout storm. Returns TRUE when the phase actually changed.
 */
export function setAppPhase(phase: AppPhase): boolean {
    if (phase === currentPhase) return false;
    currentPhase = phase;
    for (const cb of [...phaseListeners]) {
        try { cb(phase); } catch (e) { console.warn('[panelDefaults] phase listener threw (non-fatal):', e); }
    }
    return true;
}

/**
 * Subscribe to phase changes. The callback must re-apply {@link panelState} to its
 * own DOM — this module owns the DECISION, never the nodes. Returns a disposer.
 *
 * Every surface with a phase-dependent row MUST subscribe. A surface that reads
 * its default once at construction and never again would be correct only if it
 * happened to be built after the phase settled — which is the null-at-mount race
 * this codebase has already paid for.
 */
export function onAppPhaseChanged(cb: PhaseListener): () => void {
    phaseListeners.add(cb);
    return () => { phaseListeners.delete(cb); };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-panel state
// ─────────────────────────────────────────────────────────────────────────────

/** The DECLARED state of a panel in a phase (the table, not the live state). */
export function panelPhaseDefault(id: PanelId, phase: AppPhase = currentPhase): PanelPhaseState {
    return panelDescriptor(id).byPhase[phase];
}

/** Convenience: TRUE when the table says this panel is visible in this phase. */
export function panelDefaultOpen(id: PanelId, phase: AppPhase = currentPhase): boolean {
    return panelPhaseDefault(id, phase) === 'open';
}

/**
 * TRUE when the surface must not be rendered at all in this phase — neither the
 * panel nor its reopen control. Callers use this to skip MOUNTING, not merely to
 * set `display: none`: an absent surface should not be built, subscribed or
 * queried, because a hidden panel that is still listening is still paying.
 */
export function panelAbsent(id: PanelId, phase: AppPhase = currentPhase): boolean {
    return panelPhaseDefault(id, phase) === 'absent';
}

/** Every row this mechanism actually governs (non-essential). */
export function governedPanels(): readonly PanelDescriptor[] {
    return PANEL_REGISTRY.filter((p) => !p.essential);
}

/** Rows that are `closed` in at least one phase — i.e. that owe a reopen control. */
export function panelsNeedingReopen(): readonly PanelDescriptor[] {
    return PANEL_REGISTRY.filter((p) => APP_PHASES.some((ph) => p.byPhase[ph] === 'closed'));
}

/**
 * Live, session-scoped visibility overrides, keyed by panel. Absent from the map
 * ⇒ "follow the table for the current phase". Cleared on a phase change, which is
 * deliberate: a user who opened Site analysis on the canvas has said nothing
 * about what should happen on the globe, and carrying the override across would
 * be inventing an intent they never expressed.
 */
const sessionOverride = new Map<PanelId, boolean>();

/** The live state of a panel: `absent` always wins; otherwise override, else table. */
export function panelState(id: PanelId): PanelPhaseState {
    const declared = panelPhaseDefault(id);
    if (declared === 'absent') return 'absent';
    const override = sessionOverride.get(id);
    if (override === undefined) return declared;
    return override ? 'open' : 'closed';
}

/** TRUE when the panel is currently visible. Essential panels always read TRUE. */
export function isPanelOpen(id: PanelId): boolean {
    const d = panelDescriptor(id);
    if (d.essential) return d.byPhase[currentPhase] === 'open';
    return panelState(id) === 'open';
}

/**
 * Record a panel's open/closed state for the rest of this phase.
 *
 * No-op for essential panels and for panels the table declares ABSENT in this
 * phase — in both cases silently accepting the write would let a caller believe
 * it had opened something the user cannot see, which is worse than a refusal.
 */
export function setPanelOpen(id: PanelId, open: boolean): void {
    const d = panelDescriptor(id);
    if (d.essential) return;
    if (d.byPhase[currentPhase] === 'absent') return;
    sessionOverride.set(id, open);
}

type ResetListener = () => void;
const resetListeners = new Set<ResetListener>();

/**
 * Subscribe to `Reset panel layout`. The callback must re-apply {@link panelState}
 * to its own DOM. Returns a disposer.
 */
export function onPanelLayoutReset(cb: ResetListener): () => void {
    resetListeners.add(cb);
    return () => { resetListeners.delete(cb); };
}

/**
 * `Reset panel layout` — drop every session override so the current phase's
 * declared defaults apply again, and tell the surfaces to re-apply. Also the
 * recovery route when a panel has been dragged or resized somewhere unusable:
 * listeners clear their own geometry in the same callback.
 *
 * Returns the ids that CHANGED, so a caller can report honestly — an empty array
 * means "already at defaults", which is a different fact from "reset failed".
 */
export function resetPanelLayout(): readonly PanelId[] {
    const changed: PanelId[] = [];
    for (const p of PANEL_REGISTRY) {
        if (p.essential) continue;
        const before = panelState(p.id);
        sessionOverride.delete(p.id);
        if (panelState(p.id) !== before) changed.push(p.id);
    }
    for (const cb of [...resetListeners]) {
        try { cb(); } catch (e) { console.warn('[panelDefaults] reset listener threw (non-fatal):', e); }
    }
    return changed;
}

// Overrides do not survive a phase change — see `sessionOverride`.
onAppPhaseChanged(() => { sessionOverride.clear(); });

/**
 * TEST-ONLY seam. Restores the module to its initial state WITHOUT notifying
 * listeners, so a spec can start from a known point without simulating a user.
 */
export function __resetPanelSessionStateForTests(): void {
    sessionOverride.clear();
    resetListeners.clear();
    currentPhase = 'onboarding-globe';
}
