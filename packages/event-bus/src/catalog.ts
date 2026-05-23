/**
 * EventCatalog — the canonical discriminated union of all PRYZM custom event
 * names mapped to their payload types.
 *
 * This is the single source of truth for typed event communication.
 * Listeners and emitters that use `EventCatalog` get full type-safety; the
 * legacy `new CustomEvent(name)` call-sites are migrated in TASK-10 through // TODO(TASK-15)
 * TASK-17 to use `runtime.events.emit(name, payload)` instead.
 *
 * Categories:
 *   bim.*       — BIM element mutations (geometry layer)
 *   ui.*        — UI panel activation / selection / tab events
 *   ai.*        — AI pipeline proposals and model updates
 *   pvw.*       — Preview (AI proposal preview) events
 *   vi.*        — View-intent collaborative sync events
 *   vpt.*       — Viewport (3-D view port) mode changes
 *   svp.*       — Section-view plane events
 *   underlay.*  — Floor-plan underlay tool events
 *   split.*     — Split-view layout events
 *   bam.*       — BAM (Building Analysis Module) events
 *   pryzm.*     — Platform lifecycle events
 *   rq.*        — Remote job queue events
 *   stair-path.*— Stair path tool events
 *   tool.*      — Generic tool activation events
 */

export interface EventCatalog {
  // Index signature required so EventCatalog satisfies Record<string, unknown>
  // (the constraint on IEventBus<TMap>). All specific property types extend
  // unknown, so no type-narrowing is lost.
  [key: string]: unknown;

  // ── BIM geometry mutations ────────────────────────────────────────────────
  'bim-canvas-mouse-move':    { x?: number; y?: number; worldPoint?: { x: number; y: number; z: number } };
  'bim-canvas-world-click':   { x?: number; y?: number; z?: number; worldPoint?: { x: number; y: number; z: number }; elementId?: string | null; elementType?: string | null };
  'bim-ceiling-added':        { id: string };
  'bim-ceiling-removed':      { id: string };
  'bim-ceiling-updated':      { id: string };
  'bim-clipboard-updated':    { hasContent?: boolean; elementType?: string };
  'bim-copy-requested':       { ids: string[] };
  'bim-curtainwall-added':    { id: string };
  'bim-curtainwall-removed':  { id?: string; ids?: string[] };
  'bim-door-added':           { id: string };
  'bim-door-removed':         { id: string };
  'bim-door-updated':         { id: string };
  'bim-floor-added':          { id: string };
  'bim-floor-removed':        { id: string };
  'bim-floor-updated':        { id: string };
  'bim-furniture-added':      { id: string };
  'bim-furniture-removed':    { id: string };
  'bim-furniture-updated':    { id: string };
  'bim-handrail-added':       { id: string };
  'bim-handrail-removed':     { id: string };
  'bim-handrail-updated':     { id: string };
  'bim-hover-changed':        { id?: string | null; object?: unknown };
  'bim-ifc-model-removed':    { modelId: string };
  'bim-level-added':          { id: string; elevation?: number };
  'bim-level-removed':        { id: string };
  'bim-level-updated':        { id: string };
  'bim-lighting-added':       { id: string };
  'bim-lighting-placed':      { id: string; fixtureType?: string };
  'bim-lighting-removed':     { id: string };
  'bim-lighting-updated':     { id: string };
  'bim-model-changed':        Record<string, never>;
  'bim-model-healed':         Record<string, never>;
  'bim-opening-added':        { id: string };
  'bim-opening-removed':      { id: string };
  'bim-opening-updated':      { id: string };
  'bim-operation-cancelled':  { operationId?: string };
  'bim-operation-completed':  { operationId?: string };
  'bim-operation-error':      { message?: string; msg?: string };
  'bim-operation-instructions': { text?: string; msg?: string | null; operationId?: string };
  'bim-operation-state-changed': { state?: string; operationId?: string; active?: boolean };
  'bim-plumbing-added':       { id: string };
  'bim-plumbing-removed':     { id: string };
  'bim-plumbing-updated':     { id: string };
  'bim-project-cleared':      Record<string, never>;
  'bim-railing-updated':      { id: string };
  'bim-roof-added':           { id: string };
  'bim-roof-removed':         { id: string };
  'bim-roof-updated':         { id: string };
  'bim-room-bounding-line-added':   { id: string };
  'bim-room-bounding-line-removed': { id: string };
  'bim-room-bounding-line-updated': { id: string };
  'bim-scene-mutated':        Record<string, never>;
  'bim-select-element':       { id: string };
  'bim-selection-changed':    { ids?: readonly string[]; object?: unknown };
  'bim-slab-added':           { id: string };
  'bim-slab-removed':         { id: string };
  'bim-slab-updated':         { id: string };
  'bim-stair-added':          { id: string };
  'bim-stair-geometry-updated': { id: string };
  'bim-stair-landing-added':  { id: string };
  'bim-stair-landing-removed': { id: string };
  'bim-stair-landing-updated': { id: string };
  'bim-stair-railing-added':  { id: string };
  'bim-stair-railing-created': { id: string };
  'bim-stair-railing-proposal': { id?: string; stairId?: string; proposedRailings?: unknown[] };
  'bim-stair-railing-removed': { id: string };
  'bim-stair-railing-updated': { id: string };
  'bim-stair-removed':        { id: string };
  'bim-stair-type-added':     { id: string };
  'bim-stair-type-removed':   { id: string };
  'bim-stair-updated':        { id: string };
  'bim-store-mutated':        Record<string, never>;
  'bim-subscriber-error':     { message: string; source?: string; error?: string; event?: string; columnId?: string; slabId?: string; wallId?: string; beamId?: string };
  'bim-tool-changed':         { tool: string | null };
  'bim-wall-added':           { id: string };
  'bim-wall-cut-requested':   { wallId: string };
  'bim-wall-join-requested':  { wallId: string };
  'bim-wall-mutation-committed': Record<string, never>;
  'bim-wall-system-error':    { message?: string; name?: string; error?: unknown; source?: string; code?: string; batchSize?: number };
  'bim-wall-removed':         { id: string };
  'bim-wall-updated':         { id: string };
  'wall-updated':             { id: string };
  'beam-store-update':        { action?: string; beam?: unknown };

  // ── AI events ────────────────────────────────────────────────────────────
  'ai-model-update':          { model?: string; source?: string; action?: string; elementType?: string; elementId?: string };
  'ai-proposal-added':        { proposalId?: string; proposal?: unknown; count?: number };
  'ai-switch-tab':            { tab: string };

  // ── Preview (AI proposal preview) ────────────────────────────────────────
  'pvw-element-accept-fallback': { elementId: string; reason?: string };
  'pvw-proposals-accepted':   { proposalIds: string[] };
  'pvw-proposals-declined':   Record<string, never>;
  'pvw-proposal-shown':       { proposalId: string };

  // ── View-intent collaborative sync ────────────────────────────────────────
  'vi:instance-remote-synced': { instanceId: string };
  'vi:instance-updated':       { instanceId: string };
  'vi:intent-remote-synced':   { intentId: string };
  'vi:overrides-remote-cleared': { intentId: string };
  'vi:remote-override-set':    { intentId: string; overrideKey: string };

  // ── Viewport mode ─────────────────────────────────────────────────────────
  'vpt-mode-changed':         { active: boolean };

  // ── Section-view plane ────────────────────────────────────────────────────
  'svp:drawing-refreshed':    { viewId: string };
  'svp:tool-blur':            Record<string, never>;
  'svp:tool-focus':           Record<string, never>;

  // ── Underlay tool ─────────────────────────────────────────────────────────
  'underlay:delete-requested':         Record<string, never>;
  'underlay:deselected':               Record<string, never>;
  'underlay:move-activated':           Record<string, never>;
  'underlay:reference-rotate-activate': Record<string, never>;
  'underlay:reference-rotate-done':    Record<string, never>;
  'underlay:reference-scale-activate': Record<string, never>;
  'underlay:reference-scale-done':     Record<string, never>;
  'underlay:rotation-applied':         { degrees?: number; deltaRad?: number; deltaDeg?: number; pivot?: unknown };
  'underlay:scale-applied':            { scale?: number; factor?: number; source?: string };
  'underlay:selected':                 { id?: string };
  'underlay:transform-changed':        Record<string, never>;
  'pryzm:underlay-hud:dismiss':        Record<string, never>;
  'pryzm:underlay-hud:show':           Record<string, unknown>;

  // ── Split-view ────────────────────────────────────────────────────────────
  'split-view-activated':      Record<string, never>;
  'split-view-deactivated':    Record<string, never>;
  'split-view-layout-changed': { layout: string };
  'split-view-view-changed':   { viewId: string };

  // ── BAM (Building Analysis Module) ────────────────────────────────────────
  'bam:day-night-changed':     { mode: 'day' | 'night' };
  'bam:reset-view-controls':   Record<string, never>;
  'bam:wall-cut-mode-changed': { active: boolean };

  // ── Requirement / asset-catalog domain events ────────────────────────────
  'pryzm-requirement-changed':   { operation: string; id: string };
  'pryzm-asset-catalog-changed': { operation: string; id: string };

  // ── Physics / Constraints ─────────────────────────────────────────────────
  'pryzm-constraints-updated':  { errors?: number; warnings?: number; results?: unknown; constraints?: unknown };
  'pryzm-physics-mode-changed': { mode: string };
  'pryzm-physics-updated':      { roomId?: string; result?: unknown; data?: unknown };

  // ── Auth events ───────────────────────────────────────────────────────────
  'pryzm:auth:signedOut': Record<string, never>;
  // §AUTH-SESSION-LEAK-2 — fired by AuthClient.persistSession when a NEW identity
  // is established on a browser that still holds a DIFFERENT user's cached state
  // (account switch / new account without signing out first). Consumers MUST purge
  // all user-scoped client caches + reload so the new account never sees the
  // previous user's projects.
  'pryzm:auth:identity-changed': { previousUserId: string; userId: string };

  // ── Room tool events ──────────────────────────────────────────────────────
  'pryzm-audit-room-select':      { roomId: string; source: string };
  'pryzm-room-tool-mode-changed': { mode: string | null };
  'pryzm-workbench-select':       { id: string; type?: string; nodeId?: string; nodeType?: string; source?: string };

  // ── IFC events ────────────────────────────────────────────────────────────
  'pryzm-ifc-conversion-report-updated': Record<string, unknown>;
  'pryzm-ifc-element-removed': { modelId?: string; elementId: string; expressID?: number };

  // ── Platform lifecycle ────────────────────────────────────────────────────
  'fw-mode-changed':                       { active: boolean };
  'model-updated':                         Record<string, never>;
  'presentation-mode-changed':             { mode: string };
  'pryzm-ambient-observation':             Record<string, unknown>;
  'pryzm-dep-cascade':                     { tasks?: unknown; triggerElementId?: string; operation?: string };
  'pryzm-dxf-restore-overlays':            { layers?: string[]; overlays?: unknown };
  'pryzm-element-selected':                { id: string | null };
  'pryzm-floor-plan-underlay-placed':      { id: string };
  'pryzm-hosted-reval':                    { elementId?: string; triggerElementId?: string; operation?: string };
  'pryzm-ifc-imported':                    { result: unknown };
  'pryzm-ifc-native-conversion-complete':  { report: unknown };
  'pryzm-ifc-ready':                       { treeData: unknown };
  'pryzm-ifc-tree-updated':               Record<string, never>;
  'pryzm-navigate-to':                     { elementId: string };
  'pryzm-presence-added':                  { userId: string };
  'pryzm-presence-cleared':               Record<string, never>;
  'pryzm-presence-removed':               { userId: string };
  'pryzm-project-cleared':               Record<string, never>;
  'pryzm-project-isolation-leak':          Record<string, unknown>;
  'pryzm-remote-command':                  { data: unknown };
  'pryzm-rendering-state-changed':         { hdriPresetId?: string; enhancementLevel?: string; realSunEnabled?: boolean; realSunHour?: number };
  'pryzm-rhino-imported':                  { result: unknown };
  'pryzm-room-reval':                      { roomId?: string; triggerElementId?: string; operation?: string };
  'pryzm-room-sync-state-changed':         { nodeId?: string; state?: string };
  'pryzm-structural-cascade':              { elementId?: string; triggerElementId?: string; operation?: string };
  'pryzm-sync-state-changed':              { source?: string };
  'pryzm-toggle-workbench':               Record<string, never>;
  'pryzm-ui-pref-changed':                 { key: string; value: unknown };
  'pryzm-upgrade-required':               { minVersion: string };
  'pryzm-visibility-command':              { action: string; target: string; value?: string };
  'plan-view-unavailable':                { reason: string };

  // ── IFC file operations ───────────────────────────────────────────────────
  'export-ifc':   { options?: unknown };
  'import-ifc':   Record<string, never>;

  // ── View / viewpoint events ───────────────────────────────────────────────
  'plan-view-added':      { viewId: string };
  'update-project-ui':    Record<string, never>;
  'update-view-browser':  Record<string, never>;
  'update-viewpoints':    Record<string, never>;
  'update-views':         Record<string, never>;
  'view-activated':       { viewId: string };
  'view-selected':        { view: unknown };

  // ── Window/Door/Room geometry events ──────────────────────────────────────
  'bim-window-added':         { id: string };
  'bim-window-removed':       { id: string };
  'bim-window-updated':       { id: string };
  'bim-room-added':           { id: string; levelId?: string };
  'bim-room-removed':         { id: string; levelId?: string };
  'bim-room-updated':         { id: string; levelId?: string };

  // ── Rendering quality events ──────────────────────────────────────────────
  'pipeline-phase-changed': { phase: string; webGpuActive?: boolean };
  'render-status-notice':  { message: string };
  'rsc-sun-updated':       Record<string, never>;
  'ssgi-state-changed':    { enabled: boolean };
  'traa-state-changed':    { enabled: boolean };
  'vd:lighting-changed':   { viewId?: string; lighting?: unknown };
  'vd:projection-stale':   Record<string, never>;

  // ── Remote job queue ──────────────────────────────────────────────────────
  'rq-job-complete':   { jobId: string; result: unknown };
  'rq-job-error':      { jobId: string; error: string };
  'rq-job-progress':   { jobId: string; progress: number };
  'rq-job-start':      { jobId: string };

  // ── Stair path tool ───────────────────────────────────────────────────────
  'stair-path:shape-hint':     { hint: string };
  'stair-path-tool:activated': Record<string, never>;
  'stair-path-tool:deactivated': Record<string, never>;

  // ── Generic tool events ───────────────────────────────────────────────────
  'tool:activated':   { toolId: string };
  'tool:deactivated': { toolId: string };

  // ── Grid events ───────────────────────────────────────────────────────────
  'grid-added':   { id: string };
  'grid-removed': { id: string };
  'grid-updated': { id: string };

  // ── Misc UI events ────────────────────────────────────────────────────────
  'actions':           Record<string, never>;
  'align':             Record<string, never>;
  'room':              { id: string };
  'save':              Record<string, never>;
  'semantic:tags-changed': { tags?: string[]; elementId?: string };
  'spatial-authority-reconcile': { levelId?: string; delta?: number };
  'stacked':           Record<string, never>;
  'switch-tab':        { tab: string };
  'tpr-rail-toggled':  { enabled: boolean };
  've-recording-complete': Record<string, never>;
  've-recording-started':  Record<string, never>;
  'wardrobe_cabinet':  Record<string, never>;
}

/** Union of all typed event names. */
export type EventName = keyof EventCatalog;
