/**
 * server/__tests__/schemaIndexCoverage.test.ts
 *
 * §FIX-HOT-QUERY-INDEX-COVERAGE (L-788) — assert the schema carries an index
 * capable of SERVING each hot query's shape, not merely an index that mentions
 * the right table.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * `project_versions` was indexed on `(project_id)` alone while the three hottest
 * reads in the product all run:
 *
 *     WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1
 *
 * — `listProjects`' LATERAL (once per project row, ×50 per hub load),
 *   `getProjectStatus`, and `getLatestVersionSnapshot`, which is THE PROJECT-OPEN
 *   PATH. A single-column index satisfies the equality and then makes Postgres
 *   read and sort every remaining version row for that project — each carrying a
 *   TOASTed multi-megabyte `snapshot` column.
 *
 * The failure mode this guards is subtle and is why the assertion is on SHAPE
 * rather than on existence: `idx_project_versions_project_id` DID exist, was
 * plainly named after the table's hot column, and looked like coverage. An
 * index that is present but cannot serve the ORDER BY is indistinguishable from
 * one that can, until you read an EXPLAIN — so a human reviewing the schema sees
 * "indexed" and moves on. This test encodes the ORDER BY.
 *
 * WHAT IT DOES NOT PROVE
 * ----------------------
 * That the planner actually chooses these indexes, or what they are worth. That
 * needs `EXPLAIN ANALYZE` against production-shaped data and is tracked
 * separately (L-800). This test proves only that the DDL cannot silently lose
 * the composite shape again — a regression guard, not a benchmark.
 *
 * Contract: C05 §1.3 (schema is owned by dbMigrate.js).
 */

import { describe, it, expect } from 'vitest';
import { SCHEMA_SQL } from '../dbMigrate.js';

/** One parsed `CREATE INDEX` statement from the schema DDL. */
interface ParsedIndex {
    readonly name: string;
    readonly table: string;
    /** Column expressions in index order, lower-cased, e.g. `['project_id', 'created_at desc']`. */
    readonly columns: readonly string[];
}

/**
 * Parse every `CREATE INDEX [IF NOT EXISTS] <name> ON <table> (<cols>)` out of
 * the schema. Deliberately permissive about whitespace and newlines because the
 * DDL is hand-formatted and several statements wrap across lines.
 */
function parseIndexes(sql: string): ParsedIndex[] {
    const re =
        /CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(\w+)\s*\(([^)]*)\)/gis;
    const out: ParsedIndex[] = [];
    for (const m of sql.matchAll(re)) {
        out.push({
            name: m[1]!,
            table: m[2]!.toLowerCase(),
            columns: m[3]!
                .split(',')
                .map(c => c.trim().toLowerCase().replace(/\s+/g, ' '))
                .filter(Boolean),
        });
    }
    return out;
}

/**
 * True when `idx` can serve `WHERE <eq> = $1 ORDER BY <sortCol> <dir>` — i.e.
 * the equality column is the LEADING column and the sort column comes next with
 * a matching direction.
 *
 * Leading-column order is the whole point: an index on `(created_at DESC,
 * project_id)` contains the same columns and cannot serve this query.
 */
function servesEqualityThenSort(
    idx: ParsedIndex,
    eqColumn: string,
    sortColumn: string,
    direction: 'asc' | 'desc',
): boolean {
    if (idx.columns[0] !== eqColumn) return false;
    const second = idx.columns[1];
    if (!second) return false;
    // Postgres defaults to ASC when no direction is written.
    const [col, dir = 'asc'] = second.split(' ');
    return col === sortColumn && dir === direction;
}

describe('§FIX-HOT-QUERY-INDEX-COVERAGE (L-788) — hot queries have a usable index', () => {
    const indexes = parseIndexes(SCHEMA_SQL);

    it('parses the schema DDL at all (guards the parser itself)', () => {
        // If this fails the regex has drifted from the DDL's formatting and every
        // other assertion below would pass vacuously.
        expect(indexes.length).toBeGreaterThan(15);
        expect(indexes.map(i => i.table)).toContain('project_versions');
    });

    it('project_versions serves "WHERE project_id = $1 ORDER BY created_at DESC"', () => {
        // Serves: getLatestVersionSnapshot (PROJECT OPEN), getProjectStatus,
        // and listProjects' LEFT JOIN LATERAL.
        const usable = indexes.filter(
            i =>
                i.table === 'project_versions' &&
                servesEqualityThenSort(i, 'project_id', 'created_at', 'desc'),
        );
        expect(
            usable,
            'project_versions needs (project_id, created_at DESC). A single-column ' +
                '(project_id) index satisfies the equality and then sorts every ' +
                'version row for the project — each holding a TOASTed multi-MB snapshot.',
        ).not.toHaveLength(0);
    });

    it('projects serves "WHERE owner_id = $1 ORDER BY updated_at DESC"', () => {
        // Serves: listProjects, the hub's first query on every load.
        const usable = indexes.filter(
            i =>
                i.table === 'projects' &&
                servesEqualityThenSort(i, 'owner_id', 'updated_at', 'desc'),
        );
        expect(
            usable,
            'projects needs (owner_id, updated_at DESC) — listProjects filters on ' +
                'owner_id and orders by updated_at.',
        ).not.toHaveLength(0);
    });

    it('project_members can be looked up BY USER, not only by project', () => {
        // The UNIQUE (project_id, user_id) constraint gives a leading-project_id
        // index for free, which serves "who is on this project?". It does NOT
        // serve "which projects is this user on?" — the direction L-336's access
        // gate and the project-list query need once membership is wired.
        const byUser = indexes.filter(
            i => i.table === 'project_members' && i.columns[0] === 'user_id',
        );
        expect(
            byUser,
            'project_members needs a (user_id, project_id) index. UNIQUE ' +
                '(project_id, user_id) only covers the project→members direction; ' +
                'L-336 needs user→projects.',
        ).not.toHaveLength(0);
    });
});
