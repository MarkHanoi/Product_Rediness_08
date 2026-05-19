/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    UI — Canvas Overlay (Phase G-3)
 * File:             src/ui/canvas/IntentPrompt.ts
 * Contract:         docs/00_PRZYM/PRYZM_WORLD_MODEL_MASTER_PLAN_2026.md § G-3
 *
 * IntentPrompt — Non-blocking design rationale capture toast.
 *
 * Shows a floating, non-modal toast at the bottom of the BIM canvas whenever
 * the architect makes a non-standard decision:
 *   1. A room area drops below its template minimum (deviation)
 *   2. A compliance constraint is explicitly overridden (override)
 *
 * The toast is intentionally lightweight — it does NOT block command execution.
 * The architect can continue working while it is visible.
 *
 * Lifecycle:
 *   show(options)     → creates and mounts the toast
 *   auto-dismiss      → after 12 seconds (dismissed flag set on record)
 *   [Record] click    → stores rationale, fires pryzm-decision-recorded
 *   [Dismiss] click   → stores record with dismissed: true, hides toast
 *
 * DOM:
 *   Appended to #container (the Three.js canvas wrapper).
 *   Falls back to document.body if #container is not present.
 *   CSS prefix: ip- (intent-prompt)
 *
 * Events dispatched:
 *   pryzm-decision-recorded  { detail: DecisionRecord }
 *
 * Events consumed (window):
 *   pryzm-intent-prompt  { detail: IntentPromptOptions }   — fired by initDataPlatform
 */

import { decisionRecordStore } from '@pryzm/core-app-model';
import type { DecisionRecord } from '@pryzm/core-app-model';
import { UiPreferences } from '../UiPreferences';
import { semanticGraphManager } from '@pryzm/core-app-model';


// ── Public API types ──────────────────────────────────────────────────────────

export interface IntentPromptOptions {
    elementId:               string;
    elementType:             string;
    commandId:               string;
    decisionType:            DecisionRecord['decisionType'];
    context:                 string;
    templateRequirementId?:  string;
    constraintRuleId?:       string;
    triggeredAt:             number;
}

// ── Active state ──────────────────────────────────────────────────────────────

let _activeToast: HTMLElement | null = null;
let _activeTimer: ReturnType<typeof setInterval> | null = null;
let _autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Phase B.39 (S73-WIRE) — module-load singleton runtime injection.
 *
 * IntentPrompt is exported as `intentPrompt = { show }`, an in-module
 * singleton consumed at boot by `initDataPlatform` (which mounts the
 * window-level event listener).  Per the established singleton pattern
 * (PanelManager / UiPreferences / gridDrawingHUD / dataCommandCenter /
 * syncStateDetailDrawer), the runtime is injected once via `wireRuntime()`
 * after `composeRuntime()` completes, and is later consumed when
 * `runtime.intent.recordDecision` lands in C-phase.
 */
let _runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null;
export function wireRuntime(rt: import('@pryzm/runtime-composer/types').PryzmRuntime | null): void {
    _runtime = rt;
}
export function getRuntime(): import('@pryzm/runtime-composer/types').PryzmRuntime | null {
    return _runtime;
}

const AUTO_DISMISS_MS = 12_000;

function resolveUserId(): string {
    try {
        const raw = localStorage.getItem('bim-auth-token');
        if (!raw) return 'anonymous';
        const payload = JSON.parse(atob(raw.split('.')[1] ?? 'e30='));
        return payload?.sub ?? 'anonymous';
    } catch { return 'anonymous'; }
}

function clearActive(): void {
    if (_activeTimer) { clearInterval(_activeTimer); _activeTimer = null; }
    if (_autoDismissTimer) { clearTimeout(_autoDismissTimer); _autoDismissTimer = null; }
    if (_activeToast) {
        _activeToast.remove();
        _activeToast = null;
    }
}

// ── Core show function ────────────────────────────────────────────────────────

function show(opts: IntentPromptOptions, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime intentPrompt.show */): void {
    void (runtime ?? _runtime); /* B-runtime-void intentPrompt.show — TODO(C.3.x): once runtime.intent.recordDecision lands, route saveRecord() through runtime.intent instead of decisionRecordStore + pryzm-decision-recorded event */
    if (!UiPreferences.get('showRoomDataHints')) return;

    clearActive();

    const container = document.getElementById('container') ?? document.body;
    if (getComputedStyle(container).position === 'static') {
        (container as HTMLElement).style.position = 'relative';
    }

    const badgeLabel: Record<DecisionRecord['decisionType'], string> = {
        deviation: 'Deviation',
        override:  'Override',
        preference: 'Preference',
        external:  'External',
    };
    const badgeText = badgeLabel[opts.decisionType] ?? 'Decision';

    const toast = document.createElement('div');
    toast.className = 'ip-toast';
    toast.innerHTML = `
      <div class="ip-header">
        <span class="ip-icon">💡</span>
        <span class="ip-title">Why did you make this choice?</span>
        <span class="ip-badge">${badgeText}</span>
      </div>
      <div class="ip-context">${opts.context}</div>
      <textarea class="ip-input" rows="2" placeholder="Enter a one-line rationale (optional)…" maxlength="300"></textarea>
      <div class="ip-actions">
        <span class="ip-timer">Auto-dismisses in 12s</span>
        <button class="ip-btn-dismiss">Dismiss</button>
        <button class="ip-btn-record">Record</button>
      </div>
    `;

    container.appendChild(toast);
    _activeToast = toast;

    const textarea  = toast.querySelector('.ip-input') as HTMLTextAreaElement;
    const timerEl   = toast.querySelector('.ip-timer') as HTMLSpanElement;
    const dismissBtn = toast.querySelector('.ip-btn-dismiss') as HTMLButtonElement;
    const recordBtn  = toast.querySelector('.ip-btn-record') as HTMLButtonElement;

    let remaining = Math.round(AUTO_DISMISS_MS / 1000);

    _activeTimer = setInterval(() => {
        remaining -= 1;
        if (timerEl) timerEl.textContent = `Auto-dismisses in ${remaining}s`;
        if (remaining <= 0) clearInterval(_activeTimer!);
    }, 1000);

    function saveRecord(dismissed: boolean): void {
        clearActive();
        const record: DecisionRecord = {
            id:                    crypto.randomUUID(),
            elementId:             opts.elementId,
            commandId:             opts.commandId,
            decision:              dismissed ? '' : (textarea.value.trim() || ''),
            decisionType:          opts.decisionType,
            templateRequirementId: opts.templateRequirementId,
            constraintRuleId:      opts.constraintRuleId,
            triggeredAt:           opts.triggeredAt,
            recordedAt:            Date.now(),
            recordedBy:            resolveUserId(),
            dismissed,
            sessionId:             window.temporalGraphManager?.sessionId ?? 'session-unknown', // TODO(D.4): legacy temporalGraphManager — replace with runtime.scene.temporal-graph manager
        };
        decisionRecordStore.add(record);

        try {
            semanticGraphManager.addRelationship({
                sourceId:  opts.elementId,
                targetId:  record.id,
                type:      'decidedBy',
                createdBy: record.recordedBy ?? 'system',
                metadata: {
                    decisionType: record.decisionType,
                    dismissed:    String(record.dismissed),
                },
            });
        } catch (e) {
            console.warn('[IntentPrompt] SemanticGraph wiring skipped:', e);
        }

        window.runtime?.events?.emit('pryzm-decision-recorded', record as unknown as { readonly [key: string]: unknown }); // F.events.16

        if (!dismissed) {
            console.log(
                `[IntentPrompt] Decision recorded — element: ${opts.elementId}` +
                ` type: ${opts.decisionType}` +
                ` rationale: "${record.decision}"`
            );
        }
    }

    recordBtn.addEventListener('click', () => saveRecord(false));
    dismissBtn.addEventListener('click', () => saveRecord(true));

    _autoDismissTimer = setTimeout(() => saveRecord(true), AUTO_DISMISS_MS);

    textarea.focus();
}

// ── Exported singleton-like interface ─────────────────────────────────────────

export const intentPrompt = { show };

// ── Violation tracker (for auto-triggering on new constraint violations) ──────

const _knownViolations = new Set<string>();

function violationKey(elementId: string, ruleId: string): string {
    return `${elementId}::${ruleId}`;
}

/**
 * Called by initDataPlatform when ConstraintEngine broadcasts results.
 * Detects NEW violations for elements (those not seen in the prior run)
 * and triggers the intent prompt for them.
 *
 * Skips rules that are not meaningful for decision capture (info-level,
 * or rules unrelated to template/programme constraints).
 */
export function handleConstraintResults(results: Array<{
    ruleId:      string;
    severity:    'error' | 'warning' | 'info';
    elementId:   string;
    elementType: string;
    message:     string;
    suggestion?: string;
}>, runtime: import('@pryzm/runtime-composer/types').PryzmRuntime | null = null /* B-runtime handleConstraintResults */): void {
    void (runtime ?? _runtime); /* B-runtime-void handleConstraintResults — TODO(C.3.x): once runtime.intent.recordDecision lands, forward runtime to show(opts, runtime) so the prompt records through the typed runtime path */
    if (!UiPreferences.get('showRoomComplianceMessages')) return;
    const CAPTURABLE_RULES = new Set([
        'ROOM_MIN_AREA',
        'HABITABLE_NEEDS_WINDOW',
        'ROOM_NEEDS_DOOR',
        'STAIR_HEADROOM',
        'DOOR_WIDTH_vs_CIRCULATION',
        'ACCESSIBLE_ROUTE',
        'FIRE_COMPARTMENT_AREA',
        'MEANS_OF_ESCAPE_COUNT',
        'CORRIDOR_WIDTH',
    ]);

    const currentKeys = new Set<string>();
    const newViolations: typeof results = [];

    for (const r of results) {
        if (r.severity === 'info') continue;
        if (!CAPTURABLE_RULES.has(r.ruleId)) continue;
        const key = violationKey(r.elementId, r.ruleId);
        currentKeys.add(key);
        if (!_knownViolations.has(key)) {
            newViolations.push(r);
        }
    }

    _knownViolations.clear();
    for (const k of currentKeys) _knownViolations.add(k);

    if (newViolations.length === 0) return;

    const first = newViolations[0];
    const decisionType: DecisionRecord['decisionType'] =
        first.ruleId === 'ROOM_MIN_AREA' ? 'deviation' : 'override';

    show({
        elementId:    first.elementId,
        elementType:  first.elementType,
        commandId:    'system',
        decisionType,
        context:      first.message + (first.suggestion ? ` — ${first.suggestion}` : ''),
        constraintRuleId: first.ruleId,
        triggeredAt:  Date.now(),
    });
}
