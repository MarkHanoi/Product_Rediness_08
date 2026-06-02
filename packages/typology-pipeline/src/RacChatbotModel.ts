// A.5.a (Phase A · Sprint 2) — RAC chatbot L3 conversation-state-machine.
//
// The PURE state machine the L5 React `RACChatbot.tsx` (apps/editor)
// wraps with the Claude streaming UI. Holds the multi-turn interview
// state, validates user input at each phase, emits the prompt the UI
// should display next, and emits the final `PipelineBrief` when the
// interview is complete (caller dispatches via
// `runtime.typology.router.dispatch(brief)`).
//
// Pure reducer + helpers: `(state, event) → next state`. No React, no
// DOM, no Claude API, no I/O. Tests this file standalone; the L5
// component supplies the Claude calls + DOM affordances per the MIAW
// reference (`./MasterMiawW/artifacts/miaw/src/components/ConversationCanvas.tsx`
// — translate patterns, not code; @workspace/* namespace).
//
// Strategic context:
//   - docs/01-strategy/product-vision.md §5 Step 2 (the chatbot is the
//     editor's onboarding surface)
//   - docs/03-execution/plans/typology-expansion-roadmap.md §2 (RAC =
//     Role · Architecture · Context capture)
//   - docs/03-execution/plans/master-execution-tracker.md A.5

import type { TypologyRegistry } from './TypologyRegistry.js';
import type { PipelineBrief, UserRole } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Public types — conversation turns, state, events, transition result.
// ─────────────────────────────────────────────────────────────────────────────

/** One message in the conversation transcript. */
export interface RacTurn {
    readonly speaker: 'user' | 'assistant';
    readonly text: string;
    /** UTC ISO-8601 — the caller supplies via the event `now` field so
     *  the model stays pure (no `Date.now()` inside the reducer). */
    readonly timestamp: string;
}

/**
 * The 6 phases of the interview. UI surfaces a per-phase indicator
 * (progress dots) keyed on this field.
 */
export type RacPhase =
    | 'intro'                 // greeting; awaiting first user message
    | 'awaiting-role'         // captured nothing; need user role
    | 'awaiting-typology'     // role captured; need project typology
    | 'awaiting-brief'        // role + typology captured; gathering brief metadata
    | 'ready'                 // brief complete; UI may dispatch
    | 'cancelled';            // user cancelled mid-interview

/**
 * The captured-data sub-state. Each field becomes populated as the
 * matching phase completes. When `phase === 'ready'`, all fields are
 * non-null and `toBrief()` returns a dispatchable PipelineBrief.
 */
export interface RacCaptured {
    readonly role: UserRole | null;
    readonly typologyId: string | null;
    /** Free-form metadata captured during the brief phase — keyed by
     *  the questions the assistant asked (eg `bedrooms`, `targetArea`,
     *  `style`). Pure JSON-safe primitives. */
    readonly brief: Record<string, unknown>;
}

/** The full conversation state — the single object the reducer maps. */
export interface RacConversationState {
    readonly phase: RacPhase;
    readonly turns: readonly RacTurn[];
    readonly captured: RacCaptured;
    /** Snapshot of available typologies at the time the conversation
     *  started — drives the inline picker the UI may surface in the
     *  typology phase. */
    readonly availableTypologies: readonly string[];
    /** Per-phase error to surface (eg "I didn't catch that — could you
     *  rephrase?"). Cleared on the next successful event. */
    readonly errorMessage: string | null;
}

/**
 * The events the L5 caller feeds into the reducer. `user-message` is
 * the raw text the user typed; the reducer attempts to extract a
 * role / typology / brief-key as appropriate to the current phase.
 * `capture-*` events are the explicit-form siblings — UI uses them
 * when the user picks from a quick-action (button / card click)
 * rather than typing.
 */
export type RacEvent =
    | { readonly type: 'restart' }
    | { readonly type: 'cancel' }
    | {
          readonly type: 'user-message';
          readonly text: string;
          readonly now: string;
      }
    | {
          readonly type: 'assistant-message';
          readonly text: string;
          readonly now: string;
      }
    | { readonly type: 'capture-role'; readonly role: UserRole }
    | { readonly type: 'capture-typology'; readonly typologyId: string }
    | {
          readonly type: 'capture-brief-field';
          readonly key: string;
          readonly value: unknown;
      }
    | { readonly type: 'mark-brief-complete' };

// ─────────────────────────────────────────────────────────────────────────────
// Initial state + lifecycle helpers.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Construct a fresh conversation state. `availableTypologies` is
 * snapshotted at construction time — the UI may re-create the state
 * when the registry changes (per C50 §3.1 subscription).
 */
export function createInitialState(
    registry: TypologyRegistry,
): RacConversationState {
    return {
        phase: 'intro',
        turns: [],
        captured: { role: null, typologyId: null, brief: {} },
        availableTypologies: registry.listIds(),
        errorMessage: null,
    };
}

/**
 * `state → PipelineBrief | null`. Returns a dispatchable brief only
 * when the conversation has reached the `ready` phase with all
 * captured fields. Otherwise returns `null`.
 */
export function toBrief(state: RacConversationState): PipelineBrief | null {
    if (state.phase !== 'ready') return null;
    const { role, typologyId, brief } = state.captured;
    if (!role || !typologyId) return null;
    return {
        typologyId: typologyId as PipelineBrief['typologyId'],
        role,
        metadata: brief,
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure text parsers — best-effort role / typology extraction.
//
// Architecturally these stay simple regex + literal-match — the
// canonical NLP path runs in the L5 React component via Claude API;
// these helpers are the offline / pre-LLM fallback so a user can type
// `architect` or `apartment` and get a deterministic capture.
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_ROLES: readonly UserRole[] = [
    'architect',
    'engineer',
    'developer',
    'contractor',
    'owner',
    'student',
];

/**
 * Extract a `UserRole` from free-form user text. Returns the first
 * known-role word that appears (case-insensitive). Returns `null` when
 * no known role is detected — the L5 caller falls back to an LLM
 * extraction or re-prompts the user.
 */
export function parseRoleFromText(text: string): UserRole | null {
    if (!text) return null;
    const lower = text.toLowerCase();
    for (const role of KNOWN_ROLES) {
        // Word-boundary match WITH optional plural `s` so "contractors"
        // catches as `contractor`, "owners" catches as `owner`. The
        // word-boundary still excludes substring matches: "developmental"
        // would NOT match "developer".
        const pattern = new RegExp(`\\b${role}s?\\b`);
        if (pattern.test(lower)) return role;
    }
    return null;
}

/**
 * Extract a typology id from free-form text against the registry's
 * `listIds()` snapshot. Tries:
 *   1. Exact id match (case-insensitive, slug already)
 *   2. Hyphen-tolerant match (`small office` → `small-office`)
 *   3. First id whose display-name slug appears as a word in the text
 *
 * Returns `null` when no match. Architecturally simple — the LLM path
 * in the L5 component handles fuzzy phrasing ("I'm working on a flat"
 * → `apartment` via Claude).
 */
export function parseTypologyIdFromText(
    text: string,
    availableIds: readonly string[],
): string | null {
    if (!text) return null;
    const lower = text.toLowerCase().trim();
    // 1. exact match
    for (const id of availableIds) {
        if (id.toLowerCase() === lower) return id;
    }
    // 2. hyphen-tolerant (turn spaces into hyphens for comparison)
    const slugified = lower.replace(/\s+/g, '-');
    for (const id of availableIds) {
        if (id.toLowerCase() === slugified) return id;
    }
    // 3. word-boundary match — first id whose slug appears in text
    for (const id of availableIds) {
        const pattern = new RegExp(`\\b${id.toLowerCase()}\\b`);
        if (pattern.test(lower)) return id;
    }
    return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// The reducer — pure (state, event) → state.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pure conversation reducer. Every call returns a NEW state object —
 * never mutates `state`. Idempotent on no-op events (returns the same
 * reference).
 *
 * Phase transitions:
 *   intro                 → awaiting-role         on first user-message
 *   awaiting-role         → awaiting-typology     on capture-role
 *   awaiting-role         → (stay) + errorMessage on user-message that
 *                                                 doesn't extract a role
 *   awaiting-typology     → awaiting-brief        on capture-typology
 *   awaiting-brief        → ready                 on mark-brief-complete
 *   any                   → intro                 on restart
 *   any                   → cancelled             on cancel
 */
export function racReducer(
    state: RacConversationState,
    event: RacEvent,
): RacConversationState {
    switch (event.type) {
        case 'restart':
            return {
                ...state,
                phase: 'intro',
                turns: [],
                captured: { role: null, typologyId: null, brief: {} },
                errorMessage: null,
            };

        case 'cancel':
            return { ...state, phase: 'cancelled', errorMessage: null };

        case 'assistant-message':
            return {
                ...state,
                turns: [
                    ...state.turns,
                    {
                        speaker: 'assistant',
                        text: event.text,
                        timestamp: event.now,
                    },
                ],
            };

        case 'user-message': {
            const turnsWithUser: readonly RacTurn[] = [
                ...state.turns,
                {
                    speaker: 'user',
                    text: event.text,
                    timestamp: event.now,
                },
            ];

            // Phase-specific extraction attempt.
            switch (state.phase) {
                case 'intro': {
                    // First user message moves us to awaiting-role; we
                    // also TRY to extract a role from the same message
                    // (architect-types often introduce themselves as
                    // "Hi, I'm Maria, an architect…").
                    const role = parseRoleFromText(event.text);
                    if (role) {
                        return {
                            ...state,
                            phase: 'awaiting-typology',
                            turns: turnsWithUser,
                            captured: { ...state.captured, role },
                            errorMessage: null,
                        };
                    }
                    return {
                        ...state,
                        phase: 'awaiting-role',
                        turns: turnsWithUser,
                        errorMessage: null,
                    };
                }
                case 'awaiting-role': {
                    const role = parseRoleFromText(event.text);
                    if (role) {
                        return {
                            ...state,
                            phase: 'awaiting-typology',
                            turns: turnsWithUser,
                            captured: { ...state.captured, role },
                            errorMessage: null,
                        };
                    }
                    return {
                        ...state,
                        turns: turnsWithUser,
                        errorMessage:
                            "I didn't catch your role — try architect / engineer / developer / owner / contractor / student.",
                    };
                }
                case 'awaiting-typology': {
                    const typologyId = parseTypologyIdFromText(
                        event.text,
                        state.availableTypologies,
                    );
                    if (typologyId) {
                        return {
                            ...state,
                            phase: 'awaiting-brief',
                            turns: turnsWithUser,
                            captured: { ...state.captured, typologyId },
                            errorMessage: null,
                        };
                    }
                    return {
                        ...state,
                        turns: turnsWithUser,
                        errorMessage:
                            `I didn't recognise that typology. Available: ${state.availableTypologies.join(', ')}.`,
                    };
                }
                case 'awaiting-brief':
                case 'ready':
                case 'cancelled':
                    // In the brief phase the LLM is in charge of
                    // structured extraction — the reducer just records
                    // the turn. UI dispatches `capture-brief-field`
                    // separately once Claude returns structured JSON.
                    return { ...state, turns: turnsWithUser };
            }
            return state;
        }

        case 'capture-role':
            return {
                ...state,
                phase:
                    state.phase === 'cancelled' ? state.phase : 'awaiting-typology',
                captured: { ...state.captured, role: event.role },
                errorMessage: null,
            };

        case 'capture-typology':
            if (!state.availableTypologies.includes(event.typologyId)) {
                return {
                    ...state,
                    errorMessage:
                        `Typology '${event.typologyId}' is not in the current registry`,
                };
            }
            return {
                ...state,
                phase:
                    state.phase === 'cancelled' ? state.phase : 'awaiting-brief',
                captured: { ...state.captured, typologyId: event.typologyId },
                errorMessage: null,
            };

        case 'capture-brief-field':
            return {
                ...state,
                captured: {
                    ...state.captured,
                    brief: { ...state.captured.brief, [event.key]: event.value },
                },
                errorMessage: null,
            };

        case 'mark-brief-complete':
            if (
                !state.captured.role ||
                !state.captured.typologyId
            ) {
                return {
                    ...state,
                    errorMessage:
                        'Cannot mark brief complete: role or typologyId is missing',
                };
            }
            return { ...state, phase: 'ready', errorMessage: null };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// UI helpers — derive the assistant's next prompt from the current phase.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The canonical prompt the assistant should show for the given phase.
 * The L5 React component uses this as the default if the LLM-streamed
 * response is not yet available (skeleton state).
 */
export function defaultPromptForPhase(state: RacConversationState): string {
    switch (state.phase) {
        case 'intro':
            return "Welcome to PRYZM. What's your role, and what are you designing today?";
        case 'awaiting-role':
            return 'What is your role? (Architect, Engineer, Developer, Owner, Contractor, Student.)';
        case 'awaiting-typology':
            return `What type of project? Available: ${state.availableTypologies.join(', ')}.`;
        case 'awaiting-brief':
            return 'Tell me about the project — size, bedrooms, style, anything you want me to know.';
        case 'ready':
            return "Got it — I'll generate options now.";
        case 'cancelled':
            return 'Conversation ended.';
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// A.5.a.next — summarizeCapturedState
//
// Pure helper that turns the captured state into a single-line human-
// readable summary the L5 React component can echo back to the user
// ("OK: architect · apartment · 2-bed · 70m² target"). Lets the chatbot
// confirm capture before dispatching the brief downstream + lets the
// audit log record what the user committed to without re-traversing
// the captured object.
//
// Pairs with formatLayoutSummary (ai-host) — same separator, same
// determinism, same architect-readable spirit.
// ─────────────────────────────────────────────────────────────────────────────

const ROLE_LABEL: Readonly<Record<UserRole, string>> = {
    architect: 'architect',
    engineer: 'engineer',
    developer: 'developer',
    contractor: 'contractor',
    owner: 'owner',
    student: 'student',
    unknown: 'unknown role',
};

const BRIEF_KEYS_ORDER: readonly string[] = [
    'bedrooms',
    'bathrooms',
    'targetArea',
    'style',
    'budget',
    'timeline',
];

function formatBriefValue(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number') {
        // Integer counts render bare; floats round to 1 decimal.
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    if (typeof value === 'string') return value.trim();
    // Objects + arrays render as JSON.
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function formatBriefField(key: string, value: unknown): string | null {
    const formatted = formatBriefValue(value);
    if (formatted === '') return null;
    switch (key) {
        case 'bedrooms':
            return `${formatted}-bed`;
        case 'bathrooms':
            return `${formatted}-bath`;
        case 'targetArea': {
            // Strip "m²" if the user already wrote it.
            const cleaned = formatted.replace(/m²?$/i, '').trim();
            return `${cleaned}m² target`;
        }
        default:
            return `${key} ${formatted}`;
    }
}

/**
 * Build a single-line summary of what's been captured so far.
 *
 *   `'OK: architect · apartment · 2-bed · 70m² target · style modern'`
 *
 * When nothing is captured yet returns `'nothing captured yet'`. The
 * L5 caller can re-format for the active locale; this is the canonical
 * machine-readable shape for logs + audit + chatbot echo.
 *
 * Field rendering rules:
 *   - role          → bare lowercase label (`architect`)
 *   - typology      → bare typologyId (`apartment`)
 *   - bedrooms: N   → `N-bed`
 *   - bathrooms: N  → `N-bath`
 *   - targetArea: N → `Nm² target` (strips trailing "m²" if user wrote it)
 *   - any other key → `{key} {value}` (string / number / json fallback)
 *
 * Brief fields render in the order `BRIEF_KEYS_ORDER` (bedrooms first,
 * then bathrooms, area, style, budget, timeline). Unknown keys append
 * alphabetically after.
 */
export function summarizeCapturedState(
    captured: RacCaptured,
): string {
    const parts: string[] = [];

    if (captured.role) parts.push(ROLE_LABEL[captured.role]);
    if (captured.typologyId) parts.push(captured.typologyId);

    const briefKeys = Object.keys(captured.brief);
    const knownKeysFirst = BRIEF_KEYS_ORDER.filter((k) => briefKeys.includes(k));
    const restAlpha = briefKeys
        .filter((k) => !BRIEF_KEYS_ORDER.includes(k))
        .sort();
    for (const k of [...knownKeysFirst, ...restAlpha]) {
        const formatted = formatBriefField(k, captured.brief[k]);
        if (formatted) parts.push(formatted);
    }

    if (parts.length === 0) return 'nothing captured yet';
    return `OK: ${parts.join(' · ')}`;
}
