/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Side System (Persistence) — NEW FILE
 * Phase:             Phase 3 — MigrationEngine (schema versioning)
 * Files Modified:    MigrationEngine.ts (new)
 * Classification:    A
 *
 * Impact Assessment:
 *   Store Reads:      NO — operates only on already-parsed plain-JS objects
 *   Store Writes:     NO — pure data transformation
 *   Event Bus:        NO
 *   Builder Calls:    NO
 *   Command Dispatch: NO
 *
 * Risk Level:   Low (no side effects — reads and returns plain objects)
 * Rationale:
 *   Closes the silent data-loss gap in ProjectSerializer.parse().
 *   When a stored snapshot has a lower schemaVersion than the current
 *   SNAPSHOT_SCHEMA_VERSION, MigrationEngine.migrate() runs each numbered
 *   migration step in order, upgrading the snapshot in-place before it
 *   reaches the loader. Forward-compatibility (stored version is HIGHER
 *   than current) is handled with a console.warn and a pass-through.
 *
 * Contract compliance:
 *   §06 §1  — No BIM engine imports; no DOM access.
 *   §01 §2.1 — Pure data transformation; no store mutations, no side effects.
 */

import { SNAPSHOT_SCHEMA_VERSION, ProjectSnapshot } from './ProjectSerializer';

type MigrationFn = (snapshot: any) => any;

// ── Migration registry ────────────────────────────────────────────────────────

/**
 * Registry of migration functions.
 * Key = the schemaVersion number this function PRODUCES.
 * e.g. MIGRATIONS[1] upgrades a v0 snapshot to v1.
 *
 * Rules for authors:
 *  • Each function must be a PURE transformation — no side effects.
 *  • Never remove a migration entry — it must stay in the registry forever
 *    so that arbitrarily old snapshots can still be upgraded in one pass.
 *  • When adding schemaVersion N, increment SNAPSHOT_SCHEMA_VERSION in
 *    ProjectSerializer.ts and register MIGRATIONS[N].
 */
const MIGRATIONS: Readonly<Record<number, MigrationFn>> = {
    /**
     * v0 → v1
     *
     * "v0" covers all snapshots created before schemaVersion was introduced
     * (the field is absent, undefined, or 0). This migration:
     *   • Sets schemaVersion = 1
     *   • Ensures every required array field exists (defaults to [])
     *   • Ensures scalar fields have valid fallback values
     *   • Recomputes elementCount if it was missing
     */
    1: (snap: any): any => {
        const s: any = { ...snap };

        s.schemaVersion = 1;

        // ── Required array fields ─────────────────────────────────────────────
        const arrayFields = [
            'walls', 'slabs', 'furniture', 'levels', 'grids',
            'windows', 'doors', 'columns', 'stairs', 'beams',
            'curtainWalls', 'roofs', 'handrails', 'plumbing', 'openings',
        ] as const;

        for (const field of arrayFields) {
            if (!Array.isArray(s[field])) s[field] = [];
        }

        // ── Required scalar fields ────────────────────────────────────────────
        if (typeof s.projectName !== 'string' || !s.projectName) {
            s.projectName = 'Untitled Project';
        }
        if (typeof s.timestamp !== 'number' || !Number.isFinite(s.timestamp)) {
            s.timestamp = Date.now();
        }

        // ── elementCount recompute ────────────────────────────────────────────
        if (typeof s.elementCount !== 'number' || !Number.isFinite(s.elementCount)) {
            s.elementCount =
                s.walls.length + s.slabs.length + s.columns.length +
                s.stairs.length + s.beams.length + s.curtainWalls.length +
                s.roofs.length + s.furniture.length + s.handrails.length +
                s.plumbing.length;
        }

        return s;
    },

    /**
     * v1 → v2  (Data Platform — Phase 4)
     *
     * Adds three optional Data Platform blocks with safe empty defaults.
     * Any snapshot loaded without these fields is treated as having an empty
     * hierarchy, zero templates, and no element codes — which is correct for
     * all projects created before Phase 4 was deployed.
     *
     * Rules:
     *  • Never overwrite existing data — only fill in absent fields.
     *  • Pure data transformation; no side effects.
     */
    2: (snapshot: any): any => {
        const s: any = { ...snapshot };
        s.schemaVersion = 2;

        if (!s.hierarchy) {
            s.hierarchy = { version: 1, nodes: [] };
        }
        if (!s.templates) {
            s.templates = { version: 1, templates: [], assignments: [] };
        }
        if (!s.elementCodes) {
            s.elementCodes = { version: 1, codes: [], counters: {} };
        }

        return s;
    },

    /**
     * v2 → v3  (Semantic Graph — Phase D-1)
     *
     * Adds an empty semanticGraph block to snapshots created before Phase D.
     * The SemanticGraph will be rebuilt from wall/door/room creation events
     * as the user works. Existing projects start with no relationships, which
     * is correct — the graph is populated incrementally.
     *
     * Rules:
     *  • Never overwrite existing data — only fill in absent fields.
     *  • Pure data transformation; no side effects.
     */
    3: (snapshot: any): any => {
        const s: any = { ...snapshot };
        s.schemaVersion = 3;

        if (!s.semanticGraph) {
            s.semanticGraph = { version: 1, relationships: [] };
        }

        return s;
    },

    /**
     * v3 → v4  (Temporal Graph + Intent Layer — Phase G-1)
     *
     * Adds two new blocks to the snapshot:
     *   temporalGraph   — append-only record of relationship and element mutations
     *   decisionRecords — architect rationale records (Phase G-3)
     *
     * Both start empty for pre-G snapshots, which is correct — the temporal
     * graph is built incrementally from live command execution; historical
     * projects do not get retroactively re-recorded.
     *
     * Rules:
     *  • Never overwrite existing data — only fill in absent fields.
     *  • Pure data transformation; no side effects.
     */
    4: (snapshot: any): any => {
        const s: any = { ...snapshot };
        s.schemaVersion = 4;

        if (!s.temporalGraph) {
            s.temporalGraph = {
                version:   1,
                edges:     [],
                mutations: [],
                sessionId: 'migrated',
            };
        }

        if (!s.decisionRecords) {
            s.decisionRecords = {
                version: 1,
                records: [],
            };
        }

        return s;
    },

    /**
     * v4 → v5  (Lifecycle Intelligence — Phase L-1/L-2)
     *
     * Adds the lifecycle block to the snapshot:
     *   lifecycle.phase       — project phase state machine (design by default)
     *   lifecycle.maintenance — maintenance event log (empty by default)
     *
     * Rules:
     *  • Never overwrite existing data — only fill in absent fields.
     *  • Pure data transformation; no side effects.
     */
    5: (snapshot: any): any => {
        const s: any = { ...snapshot };
        s.schemaVersion = 5;

        if (!s.lifecycle) {
            s.lifecycle = {
                phase: {
                    version:     1,
                    currentPhase: 'design',
                    transitions:  [],
                    checkpoints:  [],
                },
                maintenance: {
                    version: 1,
                    events:  [],
                },
            };
        }

        return s;
    },
};

// ── Public API ────────────────────────────────────────────────────────────────

export class MigrationEngine {
    /**
     * Upgrade a raw parsed snapshot to the current SNAPSHOT_SCHEMA_VERSION
     * by running all registered migration steps in ascending order.
     *
     * @param raw - The output of JSON.parse(storedJson). Untyped.
     * @returns   A ProjectSnapshot at SNAPSHOT_SCHEMA_VERSION.
     *
     * Forward compatibility: if storedVersion > SNAPSHOT_SCHEMA_VERSION the
     * snapshot is returned unchanged with a warning — the caller should still
     * attempt to load it (graceful degradation).
     */
    static migrate(raw: any): ProjectSnapshot {
        let snap: any = { ...raw };

        const storedVersion: number =
            typeof snap.schemaVersion === 'number' && Number.isFinite(snap.schemaVersion)
                ? snap.schemaVersion
                : 0;

        if (storedVersion > SNAPSHOT_SCHEMA_VERSION) {
            console.warn(
                `[MigrationEngine] Snapshot schemaVersion ${storedVersion} is newer than ` +
                `the current client version ${SNAPSHOT_SCHEMA_VERSION}. ` +
                `Loading without migration — some fields may be ignored or unsupported.`
            );
            return snap as ProjectSnapshot;
        }

        if (storedVersion === SNAPSHOT_SCHEMA_VERSION) {
            return snap as ProjectSnapshot;
        }

        // Run migrations from (storedVersion + 1) up to SNAPSHOT_SCHEMA_VERSION
        for (let targetV = storedVersion + 1; targetV <= SNAPSHOT_SCHEMA_VERSION; targetV++) {
            const fn = MIGRATIONS[targetV];
            if (typeof fn !== 'function') {
                console.warn(
                    `[MigrationEngine] No migration registered for v${targetV}. ` +
                    `Skipping — snapshot may be partially upgraded.`
                );
                continue;
            }
            snap = fn(snap);
            console.log(`[MigrationEngine] Applied migration: v${targetV - 1} → v${targetV}`);
        }

        return snap as ProjectSnapshot;
    }

    /**
     * Returns true when the raw snapshot needs at least one migration step.
     * Safe to call before migrate() to decide whether to show a "Project
     * was automatically upgraded" notification in the UI.
     */
    static needsMigration(raw: any): boolean {
        const v = typeof raw?.schemaVersion === 'number' ? raw.schemaVersion : 0;
        return v < SNAPSHOT_SCHEMA_VERSION;
    }

    /**
     * Returns the schemaVersion of a raw snapshot (0 if absent).
     * Useful for telemetry / debugging without calling the full migrate path.
     */
    static getStoredVersion(raw: any): number {
        const v = typeof raw?.schemaVersion === 'number' ? raw.schemaVersion : 0;
        return v;
    }
}
