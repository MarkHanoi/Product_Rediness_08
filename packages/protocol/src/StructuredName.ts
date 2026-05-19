/**
 * @file src/cde/StructuredName.ts
 * @description ISO 19650-2 Annex A — Structured name type definitions for PRYZM.
 *
 * CONTRACT (17-ISO-19650-CDE-IMPLEMENTATION-PLAN Phase 3 §3.1):
 *  - StructuredName is the ONLY valid format for version names in CDE-compliant projects.
 *  - The `revision` and `suitability` fields are SYSTEM-ASSIGNED — the UI must not
 *    let users type into these fields directly.
 *  - Once a version is in 'shared' state, the structured name is immutable.
 *
 * ISO 19650-2 Annex A full format:
 *   {project}–{originator}–{volume}–{level}–{type}–{role}–{number}–{revision}–{suitability}
 *
 * Example: PRJ-ABC-ZZ-L01-M3-A-0001-P02-S2
 *
 * Pure data — no UI imports, no DOM access, no side effects.
 * Contract compliance: §01 — No BIM engine access, §05 — No CSS or DOM here.
 */

// ── ISO 19650 type codes ──────────────────────────────────────────────────────

export const TYPE_CODES = [
    'M3', 'M2', 'DR', 'SP', 'CA', 'CO', 'CP', 'CR', 'FI', 'HS', 'IE', 'IN',
    'MI', 'MR', 'MS', 'PM', 'PR', 'QB', 'RD', 'RF', 'RI', 'RP', 'RQ', 'SA',
    'SH', 'SK', 'SN', 'TP', 'TR', 'VI', 'WI', 'ZZ',
] as const;

export type TypeCode = typeof TYPE_CODES[number];

// ── ISO 19650 role/discipline codes ───────────────────────────────────────────

export const ROLE_CODES = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M',
    'P', 'Q', 'R', 'S', 'T', 'U', 'W', 'X', 'Y', 'Z', 'ZZ',
] as const;

export type RoleCode = typeof ROLE_CODES[number];

// ── ISO 19650 suitability codes ───────────────────────────────────────────────

export const SUITABILITY_CODES = [
    'S0', 'S1', 'S2', 'S3', 'S4', 'D1', 'D2', 'D3', 'CR', 'A', 'B',
] as const;

export type SuitabilityCode = typeof SUITABILITY_CODES[number];

// ── ISO 19650 CDE states ──────────────────────────────────────────────────────

export type CDEState = 'wip' | 'shared' | 'published' | 'archived';

// ── ISO 19650 roles ───────────────────────────────────────────────────────────

export type CDERole =
    | 'appointing_party'
    | 'lead_appointed'
    | 'team_manager'
    | 'team_member'
    | 'viewer';

export const CDE_ROLE_LABELS: Record<CDERole, string> = {
    appointing_party: 'Appointing Party',
    lead_appointed:   'Lead Appointed',
    team_manager:     'Team Manager',
    team_member:      'Team Member',
    viewer:           'Viewer',
};

// ── Structured name ───────────────────────────────────────────────────────────

/**
 * ISO 19650-2 Annex A structured information container name.
 * All user-editable fields are required. `revision` and `suitability`
 * are system-assigned and optional at input time.
 */
export interface StructuredName {
    /** 1–6 uppercase alphanumeric — short project identifier */
    project:     string;
    /** 1–6 uppercase alphanumeric — authoring organisation code */
    originator:  string;
    /** 1–4 uppercase alphanumeric — building volume or MEP system ('ZZ' = whole) */
    volume:      string;
    /** 1–4 uppercase alphanumeric — floor or zone ('ZZ' = all) */
    level:       string;
    /** ISO 19650 type code */
    type:        TypeCode;
    /** ISO 19650 discipline/role code */
    role:        RoleCode;
    /** 4-digit zero-padded sequential number */
    number:      string;
    /** System-assigned revision code (P01, P02, C01…) — immutable once published */
    revision?:   string;
    /** System-assigned suitability code — immutable once in shared state */
    suitability?: SuitabilityCode;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface NameValidationError {
    field: keyof StructuredName;
    message: string;
}

/**
 * Client-side structured name validator.
 * Mirrors the server-side validateStructuredName() in server/namingValidator.js.
 */
export function validateStructuredName(name: Partial<StructuredName>): NameValidationError[] {
    const errors: NameValidationError[] = [];

    if (!name.project || !/^[A-Z0-9]{1,6}$/.test(name.project)) {
        errors.push({ field: 'project', message: '1–6 uppercase alphanumeric characters' });
    }
    if (!name.originator || !/^[A-Z0-9]{1,6}$/.test(name.originator)) {
        errors.push({ field: 'originator', message: '1–6 uppercase alphanumeric characters' });
    }
    if (!name.volume || !/^[A-Z0-9]{1,4}$/.test(name.volume)) {
        errors.push({ field: 'volume', message: '1–4 uppercase alphanumeric (ZZ = whole building)' });
    }
    if (!name.level || !/^[A-Z0-9]{1,4}$/.test(name.level)) {
        errors.push({ field: 'level', message: '1–4 uppercase alphanumeric (ZZ = all levels)' });
    }
    if (!name.type || !(TYPE_CODES as readonly string[]).includes(name.type)) {
        errors.push({ field: 'type', message: `Must be a valid type code (e.g. M3, DR, SP)` });
    }
    if (!name.role || !(ROLE_CODES as readonly string[]).includes(name.role)) {
        errors.push({ field: 'role', message: `Must be a valid discipline code (e.g. A, S, M)` });
    }
    if (!name.number || !/^\d{4}$/.test(name.number)) {
        errors.push({ field: 'number', message: 'Exactly 4 digits, zero-padded (e.g. 0001)' });
    }

    return errors;
}

/**
 * Assembles the ISO 19650 filename string from a StructuredName.
 */
export function assembleFilename(name: StructuredName): string {
    return [
        name.project,
        name.originator,
        name.volume,
        name.level,
        name.type,
        name.role,
        name.number,
        name.revision  ?? 'P01',
        name.suitability ?? 'S0',
    ].join('-');
}

// ── State display ─────────────────────────────────────────────────────────────

export interface StateDisplay {
    label:       string;
    color:       string;
    bg:          string;
    description: string;
}

export const CDE_STATE_DISPLAY: Record<CDEState, StateDisplay> = {
    wip:       { label: 'WIP',       color: '#f59e42', bg: '#fff7ed', description: 'Work in Progress — editing allowed' },
    shared:    { label: 'Shared',    color: '#3b82f6', bg: '#eff6ff', description: 'Released for coordination — snapshot locked' },
    published: { label: 'Published', color: '#16a34a', bg: '#f0fdf4', description: 'Formal submission — read-only' },
    archived:  { label: 'Archived',  color: '#6b7280', bg: '#f9fafb', description: 'Superseded or withdrawn — immutable' },
};
