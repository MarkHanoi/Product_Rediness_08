/**
 * AmbientIntelligence — Phase K-3
 *
 * Phase:   K-3 (World Model Plan V3 — Ambient Intelligence System)
 * Contract: docs/00_PRZYM/PRYZM_World_Model_Plan_V3_Complete.md §K-3
 *
 * Architecture:
 *   StoreEventBus events (throttled — max 1 AI call per 30 seconds) // TODO(TASK-08)
 *     → AmbientIntelligence.analyseState()
 *     → Run deterministic checks FIRST (no AI call):
 *         - New constraint violations since last run?
 *         - Programme deviation > 20%?
 *         - Room with no template?
 *         - Physics anomaly (RT60 or daylight out of range)?
 *     → If deterministic triggers → fire AmbientIndicator.show() directly
 *     → If AI warranted AND throttle window clear:
 *         POST /api/ai/ambient/analyse
 *         → AmbientIndicator.show(observation)
 *
 * Rate limiting (non-negotiable):
 *   - Maximum 1 AI call per 30 seconds per user session
 *   - Deterministic checks run first — AI only called when deterministic rules don't fire
 *   - AI is NEVER called for purely geometric commands (wall draw, move, rotate)
 *   - Dismissal is remembered per session: same observation won't repeat for 60s
 *
 * @pryzm/ai-host Sprint AJ extraction note:
 *   UiPreferences (src/ui/UiPreferences.ts) is a UI-layer singleton that cannot
 *   be imported from a @pryzm/* package.  The dependency is broken via the
 *   configureAmbientIntelligence() injection point below.  The editor shell
 *   calls this once at boot after UiPreferences is initialised.
 */

const AI_THROTTLE_MS  = 30_000;
const DISMISS_COOLDOWN = 60_000;
const AMBIENT_ENDPOINT = '/api/ai/ambient/analyse';

// Command types considered purely geometric (never trigger AI)
const GEOMETRIC_COMMAND_TYPES = new Set([
    'CreateWallCommand', 'UpdateWallCommand', 'DeleteWallCommand',
    'MoveElementCommand', 'RotateElementCommand', 'ScaleElementCommand',
    'UpdateSlabCommand', 'UpdateColumnCommand', 'UpdateBeamCommand',
]);

// Commands that ARE worth analysing for AI insights
const SEMANTIC_COMMAND_TYPES = new Set([
    'ReDetectRoomsCommand', 'AssignTemplateToNodeCommand', 'UnassignTemplateCommand',
    'UpdateRoomCommand', 'CreateRoomCommand', 'DeleteRoomCommand',
    'CreateWallOpeningCommand',
]);

// ── UI Preferences injection ───────────────────────────────────────────────────

/**
 * Minimal interface for the subset of UiPreferences consumed by AmbientIntelligence.
 * Injected via configureAmbientIntelligence() so the package does not import the
 * UI-layer singleton directly.
 */
export interface AmbientUiPrefsProvider {
    get(key: 'showRoomComplianceMessages' | 'showRoomDataHints'): boolean;
}

/** Default provider: both preferences off until the editor shell injects the real one. */
let _uiPrefs: AmbientUiPrefsProvider = { get: () => false };

/**
 * Inject the UiPreferences provider from the editor shell.
 * Must be called once during app boot before any ambient events can fire.
 *
 * @example
 *   import { UiPreferences } from '../ui/UiPreferences';
 *   import { configureAmbientIntelligence } from '@pryzm/ai-host';
 *   configureAmbientIntelligence({ uiPrefs: UiPreferences });
 */
export function configureAmbientIntelligence(config: { uiPrefs: AmbientUiPrefsProvider }): void {
    _uiPrefs = config.uiPrefs;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AmbientObservation {
    text:       string;
    severity:   'info' | 'warning' | 'error';
    elementId?: string;
    source:     'deterministic' | 'ai';
}

type ObservationListener = (obs: AmbientObservation) => void;

// ── Implementation ────────────────────────────────────────────────────────────

class AmbientIntelligenceImpl {
    private _lastAICallAt  = 0;
    private _lastViolationKeys = new Set<string>();
    private _dismissedTexts    = new Map<string, number>(); // text → dismissedAt
    private _listeners         = new Set<ObservationListener>();
    private _analyseDebounce: ReturnType<typeof setTimeout> | null = null;
    private _lastCommandType = '';
    // PERF-FIX (Apr 2026, extended Phase 2 of PROJECT-LOAD-PERFORMANCE plan):
    // While a project is loading the ConstraintEngine fires dozens of
    // pryzm-constraints-updated events back-to-back. Each one used to schedule
    // an analysis and ultimately a 404 POST to /api/ai/ambient/analyse.
    //
    // Two listeners cooperate to keep the analyser quiet during a load:
    //   • pryzm-project-switch  → re-arms _quietUntil to +Infinity. This fires
    //     when PlatformShell starts loading a *new* project (every load after
    //     the first), so subsequent project switches are also protected. Without
    //     this the bug returned the moment the user opened a second project.
    //   • pryzm-project-loaded  → releases the gate 2 s after the load is fully
    //     reconciled, giving the topology/wallRebuild flush time to settle
    //     before the first AI call ever fires.
    //
    // The instance starts at +Infinity so the very first project load is also
    // protected (no AI calls before the first pryzm-project-loaded ever fires).
    private _quietUntil = Number.POSITIVE_INFINITY;

    constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('pryzm-project-switch', () => {
                this._quietUntil = Number.POSITIVE_INFINITY;
            });
            window.addEventListener('pryzm-project-loaded', () => {
                this._quietUntil = Date.now() + 2000;
            });
        }
    }

    subscribe(fn: ObservationListener): () => void {
        this._listeners.add(fn);
        return () => this._listeners.delete(fn);
    }

    recordDismissal(text: string): void {
        this._dismissedTexts.set(text, Date.now());
    }

    /** Called by initDataPlatform after each constraint run. */
    onConstraintsUpdated(results: unknown[]): void {
        this._scheduleAnalyse('constraint', results);
    }

    /** Called by initDataPlatform when a semantic command completes. */
    onSemanticCommand(commandType: string): void {
        this._lastCommandType = commandType;
        if (SEMANTIC_COMMAND_TYPES.has(commandType)) {
            this._scheduleAnalyse('command', null);
        }
    }

    private _scheduleAnalyse(trigger: string, payload: unknown): void {
        if (this._analyseDebounce) return; // one queued analysis at a time
        // PERF-FIX (Apr 2026): drop events fired during the project-load window.
        if (Date.now() < this._quietUntil) return;
        this._analyseDebounce = setTimeout(async () => {
            this._analyseDebounce = null;
            await this._analyse(trigger, payload as unknown[] | null);
        }, 1200); // short debounce so rapid events coalesce
    }

    private async _analyse(trigger: string, constraintResults: unknown[] | null): Promise<void> {
        // Gate entire analysis pipeline: if both compliance and design hints are off,
        // there is nothing to show so skip all work including AI calls.
        const complianceOn  = _uiPrefs.get('showRoomComplianceMessages');
        const designHintsOn = _uiPrefs.get('showRoomDataHints');
        if (!complianceOn && !designHintsOn) return;

        // 1. Deterministic checks (no AI call)
        const obs = this._runDeterministicChecks(constraintResults);
        if (obs) {
            this._emit(obs);
            return;
        }

        // 2. AI call — only if warranted AND throttle window clear AND not geometric
        // AND at least one relevant preference is enabled.
        if (!complianceOn && !designHintsOn) return;
        const now = Date.now();
        if (now - this._lastAICallAt < AI_THROTTLE_MS) return;
        if (GEOMETRIC_COMMAND_TYPES.has(this._lastCommandType)) return;
        if (trigger !== 'command' && trigger !== 'constraint') return;

        // Don't call AI if no project loaded
        const roomStore = (window as unknown as Record<string, unknown>)['roomStore'] as { getAll(): unknown[] } | undefined;
        if (!roomStore || roomStore.getAll().length === 0) return;

        this._lastAICallAt = now;
        await this._callAI();
    }

    private _runDeterministicChecks(results: unknown[] | null): AmbientObservation | null {
        // Check for new constraint violations since last run
        if (results && results.length > 0) {
            const currentKeys = new Set(
                results.map((r) => {
                    const rec = r as Record<string, string>;
                    return `${rec['ruleId']}:${rec['elementId']}`;
                })
            );
            const newKeys = [...currentKeys].filter(k => !this._lastViolationKeys.has(k));
            this._lastViolationKeys = currentKeys;

            if (newKeys.length > 0 && _uiPrefs.get('showRoomComplianceMessages')) {
                const first = results.find((r) => {
                    const rec = r as Record<string, string>;
                    return newKeys.includes(`${rec['ruleId']}:${rec['elementId']}`);
                }) as Record<string, string> | undefined;
                if (first) {
                    const text = first['message'] + (first['suggestion'] ? ` ${first['suggestion']}` : '');
                    if (!this._isDismissedRecently(text)) {
                        return {
                            text,
                            severity:  first['severity'] === 'error' ? 'error' : 'warning',
                            ...(first['elementId'] !== undefined ? { elementId: first['elementId'] as string } : {}),
                            source:    'deterministic',
                        };
                    }
                }
            }
        }

        // Check for rooms with no template
        if (_uiPrefs.get('showRoomComplianceMessages')) {
            const win = window as unknown as Record<string, unknown>;
            const roomStore           = win['roomStore'] as { getAll(): Array<{ id: string; name?: string }> } | undefined;
            const templateAssignStore = win['templateAssignmentStore'] as { getAll(): Array<{ nodeId: string }> } | undefined;
            if (roomStore && templateAssignStore) {
                const rooms       = roomStore.getAll();
                const assignments = templateAssignStore.getAll();
                const assignedIds = new Set(assignments.map(a => a.nodeId));
                const unassigned  = rooms.filter(r => !assignedIds.has(r.id));
                if (unassigned.length > 0 && unassigned.length <= 3) {
                    const names = unassigned.map(r => r.name ?? r.id).join(', ');
                    const text  = `${unassigned.length} room${unassigned.length !== 1 ? 's' : ''} ${unassigned.length !== 1 ? 'have' : 'has'} no template assigned: ${names}`;
                    if (!this._isDismissedRecently(text)) {
                        return { text, severity: 'info', source: 'deterministic' };
                    }
                }
            }
        }

        // Check for programme deviation > 20% — only when compliance messages are enabled
        if (_uiPrefs.get('showRoomComplianceMessages')) {
            const progStore = (window as unknown as Record<string, unknown>)['programmeStore'] as
                { getAll(): Array<{ deviation?: number; name?: string }> } | undefined;
            if (progStore?.getAll) {
                const deviations = progStore.getAll().filter(p => Math.abs(p.deviation ?? 0) > 0.20);
                if (deviations.length > 0) {
                    const worst   = deviations[0]!;
                    const pct     = ((worst.deviation ?? 0) * 100).toFixed(0);
                    const text    = `Programme deviation of ${pct}% detected${worst.name ? ` on "${worst.name}"` : ''}.`;
                    if (!this._isDismissedRecently(text)) {
                        return { text, severity: 'warning', source: 'deterministic' };
                    }
                }
            }
        }

        return null;
    }

    private _isDismissedRecently(text: string): boolean {
        const t = this._dismissedTexts.get(text);
        if (!t) return false;
        if (Date.now() - t < DISMISS_COOLDOWN) return true;
        this._dismissedTexts.delete(text);
        return false;
    }

    private async _callAI(): Promise<void> {
        try {
            const win = window as unknown as Record<string, unknown>;
            const worldModelAdapter = win['worldModelAdapter'] as {
                toPromptContext(mode: string): string;
                getComplianceContext?(): unknown;
                getProgrammeContext?(): unknown;
            } | undefined;
            const commandManager  = win['commandManager'] as {
                getHistory(): Array<{ command?: { constructor?: { name?: string } } }>;
            } | undefined;
            const constraintEngine = win['constraintEngine'] as {
                getLastResults(): Array<{ ruleId: string; message: string; severity: string }>;
            } | undefined;

            const context    = worldModelAdapter ? worldModelAdapter.toPromptContext('full') : '';
            const compliance = worldModelAdapter?.getComplianceContext?.() ?? null;
            const programme  = worldModelAdapter?.getProgrammeContext?.() ?? null;

            const recentCommands = commandManager
                ? commandManager.getHistory().slice(-10).map(e => e.command?.constructor?.name ?? 'Unknown')
                : [];
            const violations = constraintEngine
                ? constraintEngine.getLastResults().map(r => ({
                    ruleId:   r.ruleId,
                    message:  r.message,
                    severity: r.severity,
                  }))
                : [];

            const res = await fetch(AMBIENT_ENDPOINT, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ context, recentCommands, constraints: violations, compliance, programme }),
            });

            if (!res.ok) return;

            const data = await res.json() as { observation?: string; severity?: string; elementId?: string };
            if (
                data?.observation &&
                !this._isDismissedRecently(data.observation) &&
                (_uiPrefs.get('showRoomComplianceMessages') || _uiPrefs.get('showRoomDataHints'))
            ) {
                this._emit({
                    text:      data.observation,
                    severity:  (data.severity as AmbientObservation['severity']) ?? 'info',
                    ...(data.elementId !== undefined ? { elementId: data.elementId } : {}),
                    source:    'ai',
                });
            }
        } catch (err) {
            console.warn('[AmbientIntelligence] AI call failed:', err);
        }
    }

    private _emit(obs: AmbientObservation): void {
        this._listeners.forEach(fn => fn(obs));
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('pryzm-ambient-observation', { detail: obs })); // TODO(TASK-15)
        }
    }
}

export const ambientIntelligence = new AmbientIntelligenceImpl();
