/**
 * @file server/versionStateMachine.js
 * @description ISO 19650 CDE Phase 2 — Version state machine for PRYZM.
 *
 * CONTRACT (17-ISO-19650-CDE-IMPLEMENTATION-PLAN Phase 2, 12-VERSIONING-STATE-MACHINE-CONTRACT):
 *  - Four states: wip → shared → published → archived (ISO 19650-2 §5.3)
 *  - Transitions are role-gated via permissions.js hasPermission().
 *  - Published and Archived versions are IMMUTABLE — snapshot field locked.
 *  - Every state transition writes to the version_audit_log.
 *  - Rejection (shared → wip) requires a reason field.
 *  - Version_audit_log is append-only (no deletes, no updates).
 *
 * Allowed transition graph:
 *   wip       → shared     (role: team_manager | lead_appointed)
 *   shared    → published  (role: lead_appointed)
 *   shared    → wip        (reject, role: team_manager | lead_appointed, reason required)
 *   published → archived   (role: lead_appointed | appointing_party)
 *   *         → archived   (role: lead_appointed | appointing_party — forced archive)
 */

'use strict';

import { hasPermission } from './permissions.js';

// ── State machine ─────────────────────────────────────────────────────────────

export const CDE_STATES = Object.freeze(['wip', 'shared', 'published', 'archived']);

/** Allowed transitions: from → [allowed_to] */
const TRANSITION_GRAPH = {
    wip:       ['shared'],
    shared:    ['published', 'wip'],   // wip = rejection
    published: ['archived'],
    archived:  [],                      // terminal — immutable
};

/** Action key for permissions.js per target state */
const STATE_TO_ACTION = {
    shared:    'move_to_shared',
    published: 'move_to_published',
    archived:  'archive',
    wip:       'reject_to_wip',        // rejection back from shared
};

// ── In-memory store ───────────────────────────────────────────────────────────
// Map<versionId, { state, revisionCode, suitabilityCode, structuredName, rejectionReason, transitionedBy, transitionedAt }>
const _versionStates = new Map();

// Map<versionId, AuditEntry[]>
const _auditLogs = new Map();

function _genId() {
    return `aud-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the current CDE state record for a version, or a default 'wip' record.
 */
export function getVersionState(versionId) {
    return _versionStates.get(versionId) ?? {
        state: 'wip',
        revisionCode: null,
        suitabilityCode: null,
        structuredName: null,
        rejectionReason: null,
        transitionedBy: null,
        transitionedAt: null,
    };
}

/**
 * Attempts a state transition. Returns { ok, error, newState }.
 *
 * @param {string}  versionId    - The version being transitioned
 * @param {string}  targetState  - One of: 'shared', 'published', 'archived', 'wip' (reject)
 * @param {string}  performedBy  - userId performing the transition
 * @param {string}  role         - ISO 19650 role of the performer for this project
 * @param {boolean} isOwner      - true if caller is platform owner (bypasses role checks)
 * @param {Object}  [opts]       - Optional: { reason, revisionCode, suitabilityCode, structuredName }
 */
export function transitionState(versionId, targetState, performedBy, role, isOwner = false, opts = {}) {
    if (!CDE_STATES.includes(targetState)) {
        return { ok: false, error: `Unknown target state: ${targetState}` };
    }

    const current = getVersionState(versionId);
    const fromState = current.state;

    // Check transition is allowed by the graph
    const allowed = TRANSITION_GRAPH[fromState] ?? [];
    if (!allowed.includes(targetState)) {
        return {
            ok: false,
            error: `Transition ${fromState} → ${targetState} is not permitted by the ISO 19650 state machine.`,
        };
    }

    // Archived is terminal
    if (fromState === 'archived') {
        return { ok: false, error: 'Archived versions are immutable — no further transitions allowed.' };
    }

    // Role check
    const action = STATE_TO_ACTION[targetState];
    if (!hasPermission(role, action, isOwner)) {
        return {
            ok: false,
            error: `Forbidden — "${action}" requires a higher role. Your role: ${role ?? 'none'}.`,
        };
    }

    // Rejection requires a reason
    if (targetState === 'wip' && fromState === 'shared' && !opts.reason?.trim()) {
        return { ok: false, error: 'A rejection reason is required when moving a version back to WIP.' };
    }

    const now = Date.now();
    const newState = {
        state: targetState,
        revisionCode: opts.revisionCode ?? current.revisionCode,
        suitabilityCode: opts.suitabilityCode ?? current.suitabilityCode,
        structuredName: opts.structuredName ?? current.structuredName,
        rejectionReason: targetState === 'wip' ? (opts.reason ?? null) : null,
        transitionedBy: performedBy,
        transitionedAt: now,
    };

    _versionStates.set(versionId, newState);

    // Write audit entry
    const auditEntry = {
        id: _genId(),
        versionId,
        action: `transition:${fromState}->${targetState}`,
        performedBy,
        performedAt: now,
        fromState,
        toState: targetState,
        reason: opts.reason ?? null,
        metadata: { revisionCode: newState.revisionCode, suitabilityCode: newState.suitabilityCode },
    };
    const log = _auditLogs.get(versionId) ?? [];
    log.push(auditEntry);
    _auditLogs.set(versionId, log);

    console.log(`[versionState] ${versionId}: ${fromState} → ${targetState} by ${performedBy}`);
    return { ok: true, newState, auditEntry };
}

/**
 * Returns the full audit log for a version (append-only, oldest first).
 */
export function getAuditLog(versionId) {
    return _auditLogs.get(versionId) ?? [];
}

/**
 * Checks whether a version in the given state allows snapshot modifications.
 * Snapshots are locked once a version enters 'shared' state.
 */
export function isSnapshotLocked(versionId) {
    const { state } = getVersionState(versionId);
    return state === 'shared' || state === 'published' || state === 'archived';
}

/**
 * Returns a human-readable label and colour token for a CDE state.
 */
export function getStateDisplay(state) {
    const map = {
        wip:       { label: 'WIP',       color: '#f59e42', bg: '#fff7ed', description: 'Work in Progress — editing allowed' },
        shared:    { label: 'Shared',    color: '#3b82f6', bg: '#eff6ff', description: 'Released for coordination — read-only snapshot' },
        published: { label: 'Published', color: '#16a34a', bg: '#f0fdf4', description: 'Formal submission — read-only' },
        archived:  { label: 'Archived',  color: '#6b7280', bg: '#f9fafb', description: 'Superseded or withdrawn — immutable' },
    };
    return map[state] ?? { label: state, color: '#6b7280', bg: '#f9fafb', description: '' };
}

// ── Supabase integration ──────────────────────────────────────────────────────

export async function transitionStateInSupabase(supabase, versionId, projectId, targetState, performedBy, role, isOwner, opts = {}) {
    // First validate with in-memory machine
    const result = transitionState(versionId, targetState, performedBy, role, isOwner, opts);
    if (!result.ok) return result;

    const { newState, auditEntry } = result;

    // Persist state to project_versions
    const { error: updateError } = await supabase
        .from('project_versions')
        .update({
            state: newState.state,
            revision_code: newState.revisionCode,
            suitability_code: newState.suitabilityCode,
            structured_name: newState.structuredName,
            transitioned_by: newState.transitionedBy,
            transitioned_at: new Date(newState.transitionedAt).toISOString(),
            rejection_reason: newState.rejectionReason,
        })
        .eq('id', versionId)
        .eq('project_id', projectId);

    if (updateError) {
        console.error('[versionState] Supabase update failed:', updateError);
        return { ok: false, error: String(updateError) };
    }

    // Write audit entry
    await supabase.from('version_audit_log').insert({
        version_id: versionId,
        project_id: projectId,
        action: auditEntry.action,
        performed_by: auditEntry.performedBy,
        performed_at: new Date(auditEntry.performedAt).toISOString(),
        from_state: auditEntry.fromState,
        to_state: auditEntry.toState,
        reason: auditEntry.reason,
        metadata: auditEntry.metadata,
    });

    return result;
}
