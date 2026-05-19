/**
 * @file server/namingValidator.js
 * @description ISO 19650-2 Annex A — Structured name validation for PRYZM.
 *
 * CONTRACT (17-ISO-19650-CDE-IMPLEMENTATION-PLAN Phase 3 §3.3):
 *  - All version saves with a structured_name MUST pass validateStructuredName().
 *  - Invalid names are rejected with HTTP 400 and a field-level error array.
 *  - Published names are immutable — cannot be changed once a version reaches 'shared'.
 *  - The revision and suitability fields are system-controlled, not user-input.
 *
 * ISO 19650-2 Annex A field rules:
 *   project      1–6  uppercase alphanumeric
 *   originator   1–6  uppercase alphanumeric
 *   volume       1–4  uppercase alphanumeric
 *   level        1–4  uppercase alphanumeric
 *   type         from ALLOWED_TYPE_CODES
 *   role         from ALLOWED_ROLE_CODES
 *   number       exactly 4 digits, zero-padded
 *   revision     system-assigned: P01–P99, C01–C99 (validated format only)
 *   suitability  from ALLOWED_SUITABILITY_CODES
 */

'use strict';

// ── Allowed code lists (ISO 19650-2 Annex A + common extensions) ──────────────

export const ALLOWED_TYPE_CODES = Object.freeze([
    'M3',   // 3D model
    'M2',   // 2D model
    'DR',   // Drawing
    'SP',   // Specification
    'CA',   // Calculation
    'CO',   // Correspondence
    'CP',   // Cost plan
    'CR',   // Clash report
    'FI',   // File (generic)
    'HS',   // Health & safety
    'IE',   // Information exchange
    'IN',   // Information note
    'MI',   // Minutes
    'MR',   // Material request
    'MS',   // Method statement
    'PM',   // Programme
    'PR',   // Presentation
    'QB',   // Quotation/bid
    'RD',   // Request for document
    'RF',   // Requirement form
    'RI',   // Request for information
    'RP',   // Report
    'RQ',   // Requisition
    'SA',   // Schedule A
    'SH',   // Sheet set
    'SK',   // Sketch
    'SN',   // Site note
    'TP',   // Test plan
    'TR',   // Transmittal register
    'VI',   // Visualisation / render
    'WI',   // Work instruction
    'ZZ',   // Not defined / other
]);

export const ALLOWED_ROLE_CODES = Object.freeze([
    'A',    // Architecture
    'B',    // Building surveying
    'C',    // Civil engineering
    'D',    // Drainage / hydraulics
    'E',    // Electrical
    'F',    // Façade engineering
    'G',    // Geotechnical
    'H',    // Health & safety
    'I',    // Interior design
    'J',    // Geomatics / surveying
    'K',    // Landscape
    'L',    // Lighting
    'M',    // Mechanical / HVAC
    'P',    // Acoustics
    'Q',    // Quantity surveying
    'R',    // Structural
    'S',    // Systems integration
    'T',    // Transport planning
    'U',    // Urban design
    'W',    // Environmental / sustainability
    'X',    // Fire engineering
    'Y',    // Information management
    'Z',    // General / multi-discipline
    'ZZ',   // Not defined
]);

export const ALLOWED_SUITABILITY_CODES = Object.freeze([
    'S0',   // Work in progress — not for use
    'S1',   // Suitable for coordination
    'S2',   // Suitable for information
    'S3',   // Suitable for construction
    'S4',   // Suitable for post-contract use
    'D1',   // Preliminary design
    'D2',   // Developed design
    'D3',   // Technical design
    'CR',   // Client review
    'A',    // Approved for construction
    'B',    // Approved with comments
]);

// ── Revision code format ─────────────────────────────────────────────────────
// P01–P99 (preliminary), C01–C99 (contract), A–Z (alpha variant)
const REVISION_PATTERN = /^(P\d{2}|C\d{2}|[A-Z])$/;

// ── Field validators ──────────────────────────────────────────────────────────

/**
 * Validates all fields of a StructuredName object.
 * Returns an array of error strings. Empty array = valid.
 *
 * @param {Object} name - StructuredName object (all fields required)
 */
export function validateStructuredName(name) {
    if (!name || typeof name !== 'object') return ['structured_name must be an object'];
    const errors = [];

    if (!/^[A-Z0-9]{1,6}$/.test(name.project ?? '')) {
        errors.push('project: 1–6 uppercase alphanumeric characters required');
    }
    if (!/^[A-Z0-9]{1,6}$/.test(name.originator ?? '')) {
        errors.push('originator: 1–6 uppercase alphanumeric characters required');
    }
    if (!/^[A-Z0-9]{1,4}$/.test(name.volume ?? '')) {
        errors.push('volume: 1–4 uppercase alphanumeric characters required (use ZZ for whole building)');
    }
    if (!/^[A-Z0-9]{1,4}$/.test(name.level ?? '')) {
        errors.push('level: 1–4 uppercase alphanumeric characters required (use ZZ for all levels)');
    }
    if (!ALLOWED_TYPE_CODES.includes(name.type ?? '')) {
        errors.push(`type: must be one of [${ALLOWED_TYPE_CODES.join(', ')}]`);
    }
    if (!ALLOWED_ROLE_CODES.includes(name.role ?? '')) {
        errors.push(`role: must be one of [${ALLOWED_ROLE_CODES.join(', ')}]`);
    }
    if (!/^\d{4}$/.test(name.number ?? '')) {
        errors.push('number: exactly 4 digits required (e.g. 0001)');
    }
    if (name.revision && !REVISION_PATTERN.test(name.revision)) {
        errors.push('revision: must match P01–P99, C01–C99, or a single uppercase letter');
    }
    if (name.suitability && !ALLOWED_SUITABILITY_CODES.includes(name.suitability)) {
        errors.push(`suitability: must be one of [${ALLOWED_SUITABILITY_CODES.join(', ')}]`);
    }

    return errors;
}

/**
 * Assembles the ISO 19650 filename string from a validated StructuredName.
 * Format: {project}–{originator}–{volume}–{level}–{type}–{role}–{number}–{revision}–{suitability}
 */
export function assembleFilename(name) {
    const parts = [
        name.project,
        name.originator,
        name.volume,
        name.level,
        name.type,
        name.role,
        name.number,
        name.revision ?? 'P01',
        name.suitability ?? 'S0',
    ];
    return parts.join('-');
}

/**
 * Auto-increments a revision code.
 * P01 → P02, P09 → P10, C01 → C02, etc.
 * Returns null if incrementing is not possible.
 */
export function incrementRevision(current) {
    if (!current) return 'P01';
    const prelim = /^P(\d{2})$/.exec(current);
    if (prelim) return `P${String(parseInt(prelim[1], 10) + 1).padStart(2, '0')}`;
    const contract = /^C(\d{2})$/.exec(current);
    if (contract) return `C${String(parseInt(contract[1], 10) + 1).padStart(2, '0')}`;
    // Alpha series: A → B, Z → null
    if (/^[A-Y]$/.test(current)) return String.fromCharCode(current.charCodeAt(0) + 1);
    return null;
}

/**
 * Express middleware: validates req.body.structured_name if present.
 * Attaches errors to req; responds 400 if invalid.
 */
export function validateNameMiddleware(req, res, next) {
    const name = req.body?.structured_name;
    if (!name) return next(); // optional — not all version saves include a structured name
    const errors = validateStructuredName(name);
    if (errors.length > 0) {
        return res.status(400).json({ error: 'Invalid structured name', details: errors });
    }
    next();
}
