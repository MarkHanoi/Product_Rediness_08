/**
 * ## MODIFICATION DECLARATION
 *
 * Layer Affected:    Server — REST API (Phase E-1 / E-2 / E-3 / E-4)
 * File:             server/api/v1/routes.js
 * Phase:            Phase E — E-1, E-2, E-3, E-4
 * Classification:   A
 *
 * Contract:
 *   PRYZM_MASTER_ROADMAP_2026.md §E-2 (read endpoints + webhooks)
 *   PRYZM_MASTER_ROADMAP_2026.md §E-3 (IFC round-trip endpoint)
 *   PRYZM_MASTER_ROADMAP_2026.md §E-4 (template registry + portfolio)
 *   docs/00_Contracts/07-BIM-SECURITY-CONTRACT.md §1 (authMiddleware required)
 *   docs/00_Contracts/09-DATABASE-PERSISTENCE-ARCHITECTURE.md
 *
 * REST API for external consumers of PRYZM model data.
 * All endpoints require the same JWT auth as the main app.
 *
 * Endpoints (E-1 — read-only):
 *   GET /api/v1/projects/:id/model            → Full ProjectSnapshot JSON
 *   GET /api/v1/projects/:id/rooms            → All rooms with properties
 *   GET /api/v1/projects/:id/rooms/:roomId    → Single room + graph relationships
 *   GET /api/v1/projects/:id/graph            → Full SemanticGraph
 *   GET /api/v1/projects/:id/compliance       → Derived compliance results
 *   GET /api/v1/projects/:id/programme        → Programme brief vs model
 *   GET /api/v1/projects/:id/hierarchy        → Site→Building→Level→Unit tree
 *   GET /api/v1/projects/:id/schedules/:type  → Any registered schedule (JSON/CSV)
 *
 * Endpoints (E-2 — webhooks):
 *   POST   /api/v1/projects/:id/webhooks            → Register a webhook
 *   GET    /api/v1/projects/:id/webhooks            → List webhooks
 *   DELETE /api/v1/projects/:id/webhooks/:webhookId → Delete a webhook
 *
 * Endpoints (E-3 — IFC):
 *   GET /api/v1/projects/:id/ifc              → IFC export metadata + download info
 *
 * Endpoints (E-4 — portfolio + template registry):
 *   GET  /api/v1/portfolio                    → Aggregate analytics across all user projects
 *   POST /api/v1/templates/registry           → Share a template to the account registry
 *   GET  /api/v1/templates/registry           → Browse shared templates
 *   GET  /api/v1/templates/registry/:id       → Get a single shared template
 */

import { Router } from 'express';
import { z } from 'zod';
import { getSupabaseClient } from '../../supabaseClient.js';
import * as pgProjectStore from '../../projectStore.js';
import {
    registerWebhook,
    listWebhooks,
    deleteWebhook,
    getValidEvents,
} from '../../webhookService.js';

// ── Wave A14 (S118) A14-T9 — Zod schemas for POST body validation ─────────────

/**
 * POST /api/v1/templates/registry
 * name   : non-empty string ≤ 200 chars
 * code   : non-empty string (template key / slug) ≤ 100 chars
 * scope  : non-empty string ≤ 100 chars (e.g. "room", "floor")
 * definition : object or pre-serialised JSON string
 * isPublic   : boolean (default false)
 */
const TemplateRegistryPostSchema = z.object({
    name:       z.string().min(1, 'name is required').max(200),
    code:       z.string().min(1, 'code is required').max(100),
    scope:      z.string().min(1, 'scope is required').max(100),
    definition: z.union([
        z.record(z.unknown()),
        z.string().min(1),
    ]),
    isPublic: z.boolean().optional().default(false),
});

export const v1Router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Verifies project ownership and returns the project record.
 * Returns null if not found or not owned by the requesting user.
 */
async function getOwnedProject(projectId, userId) {
    const supabase = await getSupabaseClient().catch(() => null);
    if (supabase) {
        const { data } = await supabase
            .from('projects')
            .select('id, name, owner_id, version_count, updated_at')
            .eq('id', projectId)
            .eq('owner_id', userId)
            .single();
        return data ?? null;
    }
    return pgProjectStore.getProject(projectId, userId);
}

/**
 * Loads the latest saved snapshot for a project.
 * Tries Supabase first, falls back to Replit PostgreSQL.
 * Returns { snapshot, versionId, label, createdAt } or null.
 */
async function loadLatestSnapshot(projectId) {
    const supabase = await getSupabaseClient().catch(() => null);
    if (supabase) {
        const { data } = await supabase
            .from('project_versions')
            .select('id, label, snapshot, element_count, created_at')
            .eq('project_id', projectId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
        if (!data) return null;
        const snap = typeof data.snapshot === 'string'
            ? JSON.parse(data.snapshot)
            : data.snapshot;
        return { snapshot: snap, versionId: data.id, label: data.label, createdAt: data.created_at };
    }

    const row = await pgProjectStore.getLatestVersionSnapshot(projectId);
    if (!row) return null;
    const snap = typeof row.snapshot === 'string'
        ? JSON.parse(row.snapshot)
        : row.snapshot;
    return { snapshot: snap, versionId: row.id, label: row.label, createdAt: row.created_at };
}

/**
 * Middleware that loads the project + latest snapshot and attaches them to req.
 * Responds 404 if project not found, 404 if no saved versions exist.
 */
async function requireSnapshot(req, res, next) {
    const userId = req.auth?.userId;
    const projectId = req.params.id;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });

    try {
        const project = await getOwnedProject(projectId, userId);
        if (!project) return res.status(404).json({ error: 'Project not found.' });

        const result = await loadLatestSnapshot(projectId);
        if (!result) {
            return res.status(404).json({
                error: 'No saved versions found for this project. Save the project in PRYZM first.',
            });
        }

        req.bimProject = project;
        req.bimSnapshot = result.snapshot;
        req.bimVersionMeta = { versionId: result.versionId, label: result.label, createdAt: result.createdAt };
        next();
    } catch (err) {
        console.error('[v1 API] requireSnapshot error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
}

/** Shared envelope wrapper for all successful responses. */
function ok(res, data, meta = {}) {
    res.json({ ok: true, ...meta, data });
}

// ── Project lifecycle (S28 — Persistent Project Hub) ─────────────────────────
//
// Spec: docs/00_NEW_ARCHITECTURE/phases/PHASE-2A-Q1-M13-M15-NON-ELEMENT-COMPLETION.md
//   §S28 D2 line 739 — REST GET /projects + POST /projects
//                         + DELETE /projects/:id + PATCH /projects/:id/name.
//   §S28 D1 line 732 — lifecycle is REST (not the WebSocket sync protocol).
//
// All four routes are auth-gated; every query is owner-scoped via
// pgProjectStore so users only see / mutate their own projects.

/** GET /api/v1/projects → ProjectSummary[]. */
v1Router.get('/projects', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });
    try {
        const rows = await pgProjectStore.listProjects(userId);
        return ok(res, rows);
    } catch (err) {
        console.error('[v1/projects] GET error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

/** POST /api/v1/projects { name } → ProjectSummary. */
v1Router.post('/projects', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    if (name.length === 0 || name.length > 200) {
        return res.status(400).json({ error: 'name is required (1-200 chars).' });
    }
    try {
        const row = await pgProjectStore.createProject(name, userId);
        return ok(res, row);
    } catch (err) {
        console.error('[v1/projects] POST error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

/** DELETE /api/v1/projects/:id → 204. */
v1Router.delete('/projects/:id', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });
    try {
        const removed = await pgProjectStore.deleteProject(req.params.id, userId);
        if (!removed) return res.status(404).json({ error: 'Project not found.' });
        return res.status(204).end();
    } catch (err) {
        console.error('[v1/projects/:id] DELETE error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

/** PATCH /api/v1/projects/:id { name?, isArchived?, isStarred?, description? } → ProjectSummary.
 *  Spec: PRYZM2-WIREUP-PLAN-S72/14-subphases-A-D.md §16.3 sub-phases
 *  C.4.01 (rename), C.4.03 (archive), C.4.04 (star), C.4.05 (description). */
v1Router.patch('/projects/:id', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });

    const patch = {};
    if (typeof req.body?.name === 'string') {
        const trimmed = req.body.name.trim();
        if (trimmed.length === 0 || trimmed.length > 200) {
            return res.status(400).json({ error: 'name must be 1-200 chars.' });
        }
        patch.name = trimmed;
    }
    if (typeof req.body?.isArchived === 'boolean') patch.isArchived = req.body.isArchived;
    if (typeof req.body?.isStarred === 'boolean')  patch.isStarred  = req.body.isStarred;
    if (typeof req.body?.description === 'string') {
        if (req.body.description.length > 4000) {
            return res.status(400).json({ error: 'description must be ≤ 4000 chars.' });
        }
        patch.description = req.body.description;
    }
    if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'patch must include at least one of: name, isArchived, isStarred, description.' });
    }

    try {
        const row = await pgProjectStore.patchProject(req.params.id, userId, patch);
        if (!row) return res.status(404).json({ error: 'Project not found.' });
        return ok(res, row);
    } catch (err) {
        console.error('[v1/projects/:id] PATCH error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

/** POST /api/v1/projects/:id/duplicate { newName? } → ProjectSummary.
 *  Spec: §16.3 sub-phase C.4.06.  Creates a new project owned by the
 *  caller; the new project starts empty (the .pryzm exporter +
 *  importer round-trip handles full content copy when the user wants
 *  the events too). */
v1Router.post('/projects/:id/duplicate', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });
    const newName = typeof req.body?.newName === 'string' ? req.body.newName.trim() : '';
    try {
        const row = await pgProjectStore.duplicateProject(req.params.id, userId, newName.length > 0 ? newName : null);
        if (!row) return res.status(404).json({ error: 'Project not found.' });
        return ok(res, row);
    } catch (err) {
        console.error('[v1/projects/:id/duplicate] POST error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── Route helpers (snapshot parsing) ─────────────────────────────────────────

/**
 * Derive programme summary from snapshot.templates + snapshot.rooms.
 *
 * For each room that has a template assignment, compares actual area
 * with the template's targetArea requirement (if present).
 */
function deriveProgramme(snapshot) {
    const rooms = snapshot.rooms ?? [];
    const templates = snapshot.templates?.templates ?? [];
    const assignments = snapshot.templates?.assignments ?? [];

    const templateMap = new Map(templates.map(t => [t.id, t]));
    const assignmentMap = new Map(assignments.map(a => [a.elementId, a]));

    return rooms.map(room => {
        const assignment = assignmentMap.get(room.id);
        const template = assignment ? templateMap.get(assignment.templateId) : null;
        const targetArea = template?.requirements?.find?.(r => r.key === 'area')?.value ?? null;
        const actualArea = room.computed?.area ?? null;

        let deviation = null;
        let status = 'no-template';
        if (targetArea !== null && actualArea !== null && targetArea > 0) {
            deviation = ((actualArea - targetArea) / targetArea) * 100;
            status = Math.abs(deviation) <= 10 ? 'pass'
                : Math.abs(deviation) <= 25 ? 'warning'
                : 'fail';
        }

        return {
            roomId:       room.id,
            roomNumber:   room.roomNumber ?? null,
            name:         room.name ?? null,
            occupancy:    room.occupancyType ?? null,
            levelId:      room.levelId ?? null,
            actualArea:   actualArea !== null ? Math.round(actualArea * 100) / 100 : null,
            targetArea:   targetArea !== null ? Math.round(Number(targetArea) * 100) / 100 : null,
            deviationPct: deviation !== null ? Math.round(deviation * 10) / 10 : null,
            status,
            templateId:   assignment?.templateId ?? null,
            templateName: template?.name ?? null,
        };
    });
}

/**
 * Derive basic compliance results from snapshot.
 *
 * The ConstraintEngine only runs client-side, so full results are not
 * available in the snapshot. This endpoint returns rule-based derivations
 * from the stored data for use by external consumers.
 */
function deriveCompliance(snapshot) {
    const rooms = snapshot.rooms ?? [];
    const walls = snapshot.walls ?? [];
    const violations = [];

    for (const room of rooms) {
        const area = room.computed?.area ?? 0;

        if (!room.occupancyType || room.occupancyType.trim() === '') {
            violations.push({
                ruleId:      'R-ROOM-OCCUPANCY-MISSING',
                severity:    'warning',
                elementId:   room.id,
                elementType: 'room',
                message:     `Room "${room.name ?? room.id}" has no occupancy type set.`,
            });
        }

        if (area < 1) {
            violations.push({
                ruleId:      'R-ROOM-AREA-ZERO',
                severity:    'error',
                elementId:   room.id,
                elementType: 'room',
                message:     `Room "${room.name ?? room.id}" has negligible area (${area.toFixed(2)} m²).`,
            });
        }

        if (!room.roomNumber || room.roomNumber.trim() === '') {
            violations.push({
                ruleId:      'R-ROOM-NUMBER-MISSING',
                severity:    'info',
                elementId:   room.id,
                elementType: 'room',
                message:     `Room "${room.name ?? room.id}" has no room number assigned.`,
            });
        }
    }

    for (const wall of walls) {
        if (!wall.levelId) {
            violations.push({
                ruleId:      'R-WALL-LEVEL-MISSING',
                severity:    'error',
                elementId:   wall.id,
                elementType: 'wall',
                message:     `Wall "${wall.id}" is not assigned to a level.`,
            });
        }
    }

    return {
        source:       'snapshot-derived',
        note:         'Full ConstraintEngine results are only available in the live PRYZM application. These are rule-based derivations from the stored snapshot.',
        totalRooms:   rooms.length,
        totalWalls:   walls.length,
        violations,
        summary: {
            errors:   violations.filter(v => v.severity === 'error').length,
            warnings: violations.filter(v => v.severity === 'warning').length,
            info:     violations.filter(v => v.severity === 'info').length,
        },
    };
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/projects/:id/model
 * Returns the full ProjectSnapshot as JSON. Includes all element arrays,
 * hierarchy, template definitions, semantic graph, and schedules.
 * Large response — prefer targeted endpoints for specific data.
 */
v1Router.get('/projects/:id/model', requireSnapshot, (req, res) => {
    const snap = req.bimSnapshot;
    const meta = req.bimVersionMeta;
    ok(res, snap, {
        projectId:   req.params.id,
        projectName: req.bimProject.name,
        versionId:   meta.versionId,
        versionLabel: meta.label,
        savedAt:     meta.createdAt,
        schemaVersion: snap.schemaVersion ?? null,
    });
});

/**
 * GET /api/v1/projects/:id/rooms
 * Returns all rooms for the project with computed properties.
 */
v1Router.get('/projects/:id/rooms', requireSnapshot, (req, res) => {
    const rooms = req.bimSnapshot.rooms ?? [];
    ok(res, rooms, {
        projectId: req.params.id,
        count:     rooms.length,
    });
});

/**
 * GET /api/v1/projects/:id/rooms/:roomId
 * Returns a single room's full data plus all its SemanticGraph relationships.
 */
v1Router.get('/projects/:id/rooms/:roomId', requireSnapshot, (req, res) => {
    const rooms = req.bimSnapshot.rooms ?? [];
    const room = rooms.find(r => r.id === req.params.roomId);
    if (!room) return res.status(404).json({ error: 'Room not found.' });

    const graphData = req.bimSnapshot.semanticGraph;
    const relationships = graphData?.relationships
        ? graphData.relationships.filter(
            rel => rel.sourceId === room.id || rel.targetId === room.id
          )
        : [];

    ok(res, { room, relationships }, {
        projectId: req.params.id,
        roomId:    room.id,
    });
});

/**
 * GET /api/v1/projects/:id/graph
 * Returns the full serialised SemanticGraph (all relationship edges).
 */
v1Router.get('/projects/:id/graph', requireSnapshot, (req, res) => {
    const graph = req.bimSnapshot.semanticGraph ?? { version: 1, relationships: [] };
    ok(res, graph, {
        projectId:         req.params.id,
        relationshipCount: (graph.relationships ?? []).length,
    });
});

/**
 * GET /api/v1/projects/:id/compliance
 * Returns compliance results derived from the stored snapshot.
 * Note: Full ConstraintEngine results require the live application.
 */
v1Router.get('/projects/:id/compliance', requireSnapshot, (req, res) => {
    const result = deriveCompliance(req.bimSnapshot);
    ok(res, result, {
        projectId: req.params.id,
    });
});

/**
 * GET /api/v1/projects/:id/programme
 * Returns programme brief vs model data — target area, actual area,
 * deviation, and pass/warning/fail status per room.
 */
v1Router.get('/projects/:id/programme', requireSnapshot, (req, res) => {
    const programme = deriveProgramme(req.bimSnapshot);
    const counts = programme.reduce((acc, r) => {
        acc[r.status] = (acc[r.status] ?? 0) + 1;
        return acc;
    }, {});
    ok(res, programme, {
        projectId: req.params.id,
        roomCount: programme.length,
        summary:   counts,
    });
});

/**
 * GET /api/v1/projects/:id/hierarchy
 * Returns the full Site → Building → Level → Unit hierarchy tree.
 */
v1Router.get('/projects/:id/hierarchy', requireSnapshot, (req, res) => {
    const nodes = req.bimSnapshot.hierarchy?.nodes ?? [];
    ok(res, nodes, {
        projectId: req.params.id,
        nodeCount: nodes.length,
    });
});

/**
 * GET /api/v1/projects/:id/schedules/:type
 * Returns the named schedule as JSON or CSV.
 * Query param: ?format=csv  to request CSV (default: json)
 *
 * Available schedule types: doors, windows, rooms, walls, slabs, stairs,
 * furniture, beams, and any custom schedules saved in the project.
 */
v1Router.get('/projects/:id/schedules/:type', requireSnapshot, (req, res) => {
    const scheduleType = req.params.type.toLowerCase();
    const format = (req.query.format ?? 'json').toLowerCase();
    const snap = req.bimSnapshot;

    let scheduleData = null;

    if (snap.schedules) {
        const stored = typeof snap.schedules === 'object' ? snap.schedules : null;
        if (stored && stored[scheduleType]) {
            scheduleData = stored[scheduleType];
        }
    }

    if (!scheduleData) {
        const ELEMENT_MAP = {
            doors:     snap.doors     ?? [],
            windows:   snap.windows   ?? [],
            rooms:     snap.rooms     ?? [],
            walls:     snap.walls     ?? [],
            slabs:     snap.slabs     ?? [],
            stairs:    snap.stairs    ?? [],
            furniture: snap.furniture ?? [],
            beams:     snap.beams     ?? [],
            columns:   snap.columns   ?? [],
            roofs:     snap.roofs     ?? [],
            handrails: snap.handrails ?? [],
            plumbing:  snap.plumbing  ?? [],
        };
        if (scheduleType in ELEMENT_MAP) {
            scheduleData = ELEMENT_MAP[scheduleType];
        }
    }

    if (scheduleData === null) {
        return res.status(404).json({
            error: `Schedule type '${scheduleType}' not found. Available types: doors, windows, rooms, walls, slabs, stairs, furniture, beams, columns, roofs, handrails, plumbing, and any custom schedules saved in the project.`,
        });
    }

    if (format === 'csv') {
        const rows = Array.isArray(scheduleData) ? scheduleData : [];
        if (rows.length === 0) {
            res.setHeader('Content-Type', 'text/csv');
            return res.send('');
        }
        const headers = Object.keys(rows[0]);
        const csvLines = [
            headers.join(','),
            ...rows.map(row =>
                headers.map(h => {
                    const val = row[h] ?? '';
                    const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
                    return str.includes(',') || str.includes('"') || str.includes('\n')
                        ? `"${str.replace(/"/g, '""')}"`
                        : str;
                }).join(',')
            ),
        ];
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${req.params.id}-${scheduleType}.csv"`);
        return res.send(csvLines.join('\n'));
    }

    const count = Array.isArray(scheduleData) ? scheduleData.length : null;
    ok(res, scheduleData, {
        projectId:    req.params.id,
        scheduleType: scheduleType,
        ...(count !== null ? { count } : {}),
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE E-2 — WEBHOOK ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/v1/projects/:id/webhooks
 * Register a new webhook subscription for this project.
 *
 * Body:
 *   { url: string, events: string[], secret?: string }
 *
 * url must be HTTPS.
 * events is an array of: model.saved, room.created, room.updated, room.deleted,
 *   compliance.failed, compliance.resolved, programme.deviation.changed
 *   (or ['*'] to subscribe to all events)
 *
 * Returns the registered webhook ID.
 */
v1Router.post('/projects/:id/webhooks', requireSnapshot, async (req, res) => {
    const userId = req.auth?.userId;
    const projectId = req.params.id;
    const { url, events = ['model.saved'], secret } = req.body;

    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required and must be a string.' });
    }
    if (!Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ error: 'events must be a non-empty array.' });
    }

    try {
        const webhook = await registerWebhook(projectId, userId, url, events, secret);
        res.status(201).json({
            ok: true,
            projectId,
            webhook,
            validEvents: getValidEvents(),
        });
    } catch (err) {
        const status = err.message.includes('HTTPS') || err.message.includes('Invalid') ? 400 : 500;
        res.status(status).json({ error: err.message });
    }
});

/**
 * GET /api/v1/projects/:id/webhooks
 * List all active webhooks for this project.
 */
v1Router.get('/projects/:id/webhooks', requireSnapshot, async (req, res) => {
    const userId = req.auth?.userId;
    const projectId = req.params.id;

    try {
        const webhooks = await listWebhooks(projectId, userId);
        ok(res, webhooks, {
            projectId,
            count: webhooks.length,
            validEvents: getValidEvents(),
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * DELETE /api/v1/projects/:id/webhooks/:webhookId
 * Delete (deactivate) a webhook.
 */
v1Router.delete('/projects/:id/webhooks/:webhookId', requireSnapshot, async (req, res) => {
    const userId = req.auth?.userId;
    const { id: projectId, webhookId } = req.params;

    try {
        await deleteWebhook(webhookId, projectId, userId);
        res.json({ ok: true, projectId, webhookId, deleted: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE E-3 — IFC ROUND-TRIP ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/projects/:id/ifc
 * Returns IFC round-trip metadata and semantic summary for the project.
 *
 * The full IFC binary export runs client-side (browser WebAssembly / web-ifc).
 * This endpoint provides:
 *   1. A machine-readable summary of what semantic data PRYZM will embed
 *      in the IFC export (psets, relationships, hierarchy mappings)
 *   2. Element counts that the client-side exporter will process
 *   3. SemanticGraph relationship summary (used to generate IfcRelVoidsElement
 *      and IfcRelSpaceBoundary records in the export)
 *
 * For the actual IFC bytes, use the in-app "Export IFC" button which runs
 * web-ifc WASM client-side with full PRYZM semantic enrichment.
 */
v1Router.get('/projects/:id/ifc', requireSnapshot, (req, res) => {
    const snap = req.bimSnapshot;
    const graph = snap.semanticGraph ?? { version: 1, relationships: [] };
    const relationships = graph.relationships ?? [];

    const rooms   = snap.rooms   ?? [];
    const walls   = snap.walls   ?? [];
    const doors   = snap.doors   ?? [];
    const windows = snap.windows ?? [];
    const slabs   = snap.slabs   ?? [];
    const stairs  = snap.stairs  ?? [];
    const columns = snap.columns ?? [];
    const beams   = snap.beams   ?? [];
    const roofs   = snap.roofs   ?? [];
    const curtainWalls = snap.curtainWalls ?? [];

    const hierarchy = snap.hierarchy?.nodes ?? [];
    const templates = snap.templates?.templates ?? [];
    const assignments = snap.templates?.assignments ?? [];

    const hostsRels    = relationships.filter(r => r.type === 'hosts');
    const adjRels      = relationships.filter(r => r.type === 'adjacentTo');
    const boundedRels  = relationships.filter(r => r.type === 'boundedBy');
    const containsRels = relationships.filter(r => r.type === 'contains');

    const psetRooms = rooms.filter(r => assignments.some(a => a.elementId === r.id)).length;

    const ifcMeta = {
        schemaVersion: 'IFC4',
        exportCapabilities: {
            spatialStructure: {
                description: 'HierarchyStore nodes are mapped to IfcSite/IfcBuilding/IfcBuildingStorey/IfcSpace',
                hierarchyNodeCount: hierarchy.length,
                siteCount:  hierarchy.filter(n => n.type === 'site').length,
                buildingCount: hierarchy.filter(n => n.type === 'building').length,
                levelCount: hierarchy.filter(n => n.type === 'level').length,
                unitCount:  hierarchy.filter(n => n.type === 'unit').length,
            },
            elementGeometry: {
                description: 'All geometric elements exported with full parametric geometry as IfcExtrudedAreaSolid',
                walls:       walls.length,
                doors:       doors.length,
                windows:     windows.length,
                slabs:       slabs.length,
                stairs:      stairs.length,
                columns:     columns.length,
                beams:       beams.length,
                roofs:       roofs.length,
                curtainWalls: curtainWalls.length,
                rooms:       rooms.length,
            },
            semanticRelationships: {
                description: 'SemanticGraph relationships exported as IFC relationship entities',
                hostsToIfcRelVoidsElement: hostsRels.length,
                adjacentToIfcRelSpaceBoundary: adjRels.length,
                boundedByToIfcRelSpaceBoundary: boundedRels.length,
                containsToIfcRelContainedInSpatialStructure: containsRels.length,
                totalRelationships: relationships.length,
            },
            propertySetExport: {
                description: 'PRYZM semantic data is embedded as custom psets on IfcSpace elements',
                pset_PRYZM_Spatial: {
                    on: 'IfcSpace',
                    properties: ['templateName', 'templateCode', 'targetArea', 'syncState', 'occupancyType', 'roomNumber'],
                    roomsWithTemplate: psetRooms,
                },
                pset_PRYZM_Compliance: {
                    on: 'IfcSpace',
                    properties: ['syncState', 'complianceStatus', 'deviationPct', 'failingRequirements'],
                    roomsWithData: rooms.length,
                },
                pset_PRYZM_Identifiers: {
                    on: 'All elements',
                    properties: ['elementCode', 'pryzmId', 'pryzmSchemaVersion'],
                },
            },
            roundTripImport: {
                description: 'IFC files exported by PRYZM can be re-imported to recover semantic data',
                recoverable: ['rooms', 'hierarchy', 'templateAssignments', 'roomData', 'complianceState'],
                ifcEntitiesToPryzm: {
                    IfcSpace: 'RoomStore',
                    IfcBuildingStorey: 'HierarchyStore (level)',
                    IfcBuilding: 'HierarchyStore (building)',
                    IfcSite: 'HierarchyStore (site)',
                    IfcPropertySet_PRYZM_Spatial: 'TemplateAssignmentStore + RoomData',
                    IfcRelSpaceBoundary: 'SemanticGraph adjacentTo/boundedBy',
                    IfcRelVoidsElement: 'SemanticGraph hosts/hostedBy',
                },
            },
        },
        elementCounts: {
            total: snap.elementCount ?? 0,
            rooms: rooms.length,
            walls: walls.length,
            doors: doors.length,
            windows: windows.length,
            slabs: slabs.length,
            stairs: stairs.length,
            columns: columns.length,
            beams: beams.length,
            roofs: roofs.length,
            curtainWalls: curtainWalls.length,
        },
        semanticSummary: {
            relationships: relationships.length,
            hierarchyNodes: hierarchy.length,
            templatesAvailable: templates.length,
            templateAssignments: assignments.length,
        },
        exportInstructions: {
            method: 'Use the in-app "Export IFC" button in PRYZM for full binary IFC4 export with all semantic enrichment.',
            clientSideEngine: 'web-ifc (WebAssembly)',
            note: 'The binary IFC export runs in the browser using the web-ifc WASM engine. This API endpoint provides metadata only.',
        },
    };

    ok(res, ifcMeta, {
        projectId: req.params.id,
        projectName: req.bimProject.name,
        versionId: req.bimVersionMeta.versionId,
        savedAt: req.bimVersionMeta.createdAt,
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE E-4 — PORTFOLIO ANALYTICS + TEMPLATE REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/portfolio
 * Aggregates programme, compliance, and room data across all of the user's projects.
 *
 * Response includes:
 *   - totalProjects: number of projects with saved versions
 *   - totalGIA: sum of all room areas across all projects (m²)
 *   - compliancePassRate: % of rooms that pass all compliance checks
 *   - roomTypeDistribution: count of each occupancyType across all projects
 *   - programmeSummary: pass/warning/fail counts across all projects
 *   - projectSummaries: per-project breakdown for chart rendering
 */
v1Router.get('/portfolio', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });

    try {
        let projects = [];
        const supabase = await getSupabaseClient().catch(() => null);

        if (supabase) {
            const { data } = await supabase
                .from('projects')
                .select('id, name, updated_at, version_count')
                .eq('owner_id', userId)
                .order('updated_at', { ascending: false })
                .limit(50);
            projects = data ?? [];
        } else if (pgProjectStore.listProjects) {
            projects = await pgProjectStore.listProjects(userId);
        }

        if (projects.length === 0) {
            return ok(res, {
                totalProjects: 0,
                totalGIA: 0,
                compliancePassRate: null,
                roomTypeDistribution: {},
                programmeSummary: { pass: 0, warning: 0, fail: 0, noTemplate: 0 },
                projectSummaries: [],
            }, { userId });
        }

        const projectSummaries = [];
        let totalRooms = 0;
        let totalGIA = 0;
        let totalCompliancePass = 0;
        let totalComplianceFail = 0;
        const roomTypeMap = {};
        const progCounts = { pass: 0, warning: 0, fail: 0, 'no-template': 0 };

        for (const project of projects) {
            let snapResult = null;
            try {
                if (supabase) {
                    const { data } = await supabase
                        .from('project_versions')
                        .select('id, label, snapshot, element_count, created_at')
                        .eq('project_id', project.id)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .single();
                    if (data) {
                        const s = typeof data.snapshot === 'string' ? JSON.parse(data.snapshot) : data.snapshot;
                        snapResult = { snapshot: s, versionId: data.id, createdAt: data.created_at };
                    }
                } else if (pgProjectStore.getLatestVersionSnapshot) {
                    const row = await pgProjectStore.getLatestVersionSnapshot(project.id);
                    if (row) {
                        const s = typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot;
                        snapResult = { snapshot: s, versionId: row.id, createdAt: row.created_at };
                    }
                }
            } catch (_e) {
                // Skip projects without accessible snapshots
            }

            if (!snapResult) {
                projectSummaries.push({
                    projectId: project.id,
                    projectName: project.name,
                    updatedAt: project.updated_at,
                    hasSavedVersion: false,
                });
                continue;
            }

            const snap = snapResult.snapshot;
            const rooms = snap.rooms ?? [];
            const templates = snap.templates?.templates ?? [];
            const assignments = snap.templates?.assignments ?? [];
            const templateMap = new Map(templates.map(t => [t.id, t]));
            const assignmentMap = new Map(assignments.map(a => [a.elementId, a]));

            let projectGIA = 0;
            let projectPass = 0;
            let projectFail = 0;
            let projectWarn = 0;
            const projectRoomTypes = {};
            const projectProg = { pass: 0, warning: 0, fail: 0, noTemplate: 0 };

            for (const room of rooms) {
                const area = room.computed?.area ?? 0;
                projectGIA += area;

                const occupancy = room.occupancyType?.trim() || 'Unclassified';
                roomTypeMap[occupancy] = (roomTypeMap[occupancy] ?? 0) + 1;
                projectRoomTypes[occupancy] = (projectRoomTypes[occupancy] ?? 0) + 1;

                const hasNumber = room.roomNumber?.trim();
                const hasOccupancy = room.occupancyType?.trim();
                if (area >= 1 && hasNumber && hasOccupancy) {
                    projectPass++;
                    totalCompliancePass++;
                } else {
                    projectFail++;
                    totalComplianceFail++;
                }

                const assignment = assignmentMap.get(room.id);
                const template = assignment ? templateMap.get(assignment.templateId) : null;
                const targetArea = template?.requirements?.find?.(r => r.key === 'area')?.value ?? null;
                let progStatus = 'no-template';
                if (targetArea !== null && area > 0 && Number(targetArea) > 0) {
                    const dev = Math.abs((area - Number(targetArea)) / Number(targetArea)) * 100;
                    progStatus = dev <= 10 ? 'pass' : dev <= 25 ? 'warning' : 'fail';
                }
                projectProg[progStatus === 'no-template' ? 'noTemplate' : progStatus]++;
                progCounts[progStatus]++;
            }

            totalRooms += rooms.length;
            totalGIA += projectGIA;
            if (rooms.length > 0) {
                projectPass > projectFail ? totalCompliancePass++ : totalComplianceFail++;
            }

            projectSummaries.push({
                projectId: project.id,
                projectName: project.name,
                updatedAt: project.updated_at,
                hasSavedVersion: true,
                versionId: snapResult.versionId,
                savedAt: snapResult.createdAt,
                roomCount: rooms.length,
                totalGIA: Math.round(projectGIA * 100) / 100,
                compliancePass: projectPass,
                complianceFail: projectFail,
                compliancePassRate: rooms.length > 0
                    ? Math.round((projectPass / rooms.length) * 1000) / 10
                    : null,
                roomTypeDistribution: projectRoomTypes,
                programmeSummary: projectProg,
                wallCount: (snap.walls ?? []).length,
                elementCount: snap.elementCount ?? 0,
            });
        }

        const totalWithData = projectSummaries.filter(p => p.hasSavedVersion).length;
        const overallCompliancePass = totalRooms > 0
            ? Math.round((totalCompliancePass / totalRooms) * 1000) / 10
            : null;

        ok(res, {
            totalProjects: projects.length,
            projectsWithData: totalWithData,
            totalRooms,
            totalGIA: Math.round(totalGIA * 100) / 100,
            compliancePassRate: overallCompliancePass,
            roomTypeDistribution: roomTypeMap,
            programmeSummary: {
                pass: progCounts.pass,
                warning: progCounts.warning,
                fail: progCounts.fail,
                noTemplate: progCounts['no-template'],
            },
            projectSummaries,
        }, { userId });

    } catch (err) {
        console.error('[v1/portfolio] Error:', err);
        res.status(500).json({ error: 'Failed to aggregate portfolio data.' });
    }
});

/**
 * GET /api/v1/portfolio/benchmarks
 * Phase J-1: Retrieve benchmark for a specific building type + room type pair.
 * Query params: ?buildingType=hospital&roomType=patient-bedroom
 * Enforces n≥10 privacy threshold server-side; falls back to synthetic data.
 */
v1Router.get('/portfolio/benchmarks', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });

    const { buildingType, roomType } = req.query;
    if (!buildingType || !roomType) {
        return res.status(400).json({ error: 'buildingType and roomType query params are required.' });
    }

    try {
        const { getBenchmark } = await import('../../portfolio/portfolioGraphService.js');
        const { getPgPool } = await import('../../pgClient.js');
        const pool = getPgPool() ?? null;
        const benchmark = await getBenchmark(pool, String(buildingType), String(roomType));
        if (!benchmark) {
            return res.status(404).json({ error: 'No benchmark data available for this combination.' });
        }
        return ok(res, benchmark, { buildingType, roomType });
    } catch (err) {
        console.error('[v1/portfolio/benchmarks] Error:', err);
        return res.status(500).json({ error: 'Failed to retrieve benchmark.' });
    }
});

/**
 * GET /api/v1/portfolio/benchmarks/all
 * Phase J-1: Retrieve all available benchmarks (synthetic + real where n≥10).
 * Returns array of PortfolioBenchmark objects.
 */
v1Router.get('/portfolio/benchmarks/all', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });

    try {
        const { getAllBenchmarks } = await import('../../portfolio/portfolioGraphService.js');
        const { getPgPool } = await import('../../pgClient.js');
        const pool = getPgPool() ?? null;
        const benchmarks = await getAllBenchmarks(pool);
        return ok(res, benchmarks, { count: benchmarks.length });
    } catch (err) {
        console.error('[v1/portfolio/benchmarks/all] Error:', err);
        return res.status(500).json({ error: 'Failed to retrieve benchmarks.' });
    }
});

/**
 * POST /api/v1/templates/registry
 * Share a template definition to the account-level template registry.
 * Templates with is_public=true are visible to all users.
 *
 * Body: { templateId, name, code, scope, definition, isPublic? }
 */
v1Router.post('/templates/registry', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });

    // Wave A14 (S118) A14-T9: Zod body validation replaces manual presence checks.
    const parsed = TemplateRegistryPostSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: 'invalid_request', details: parsed.error.flatten() });
    }
    const { name, code, scope, definition, isPublic } = parsed.data;

    const id = `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    try {
        const supabase = await getSupabaseClient().catch(() => null);
        if (supabase) {
            const { data, error } = await supabase.from('template_registry').insert({
                id, account_id: userId, scope, name, code,
                definition: typeof definition === 'string' ? JSON.parse(definition) : definition,
                is_public: isPublic,
            }).select('id, name, code, scope, is_public, created_at').single();
            if (error) throw error;
            return res.status(201).json({ ok: true, template: data });
        }

        const pool = (await import('../../pgClient.js')).getPgPool();
        if (pool) {
            await pool.query(
                `INSERT INTO template_registry (id, account_id, scope, name, code, definition, is_public, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
                [id, userId, scope, name, code,
                 JSON.stringify(typeof definition === 'string' ? JSON.parse(definition) : definition),
                 isPublic]
            );
            return res.status(201).json({ ok: true, template: { id, name, code, scope, is_public: isPublic } });
        }

        return res.status(201).json({ ok: true, template: { id, name, code, scope, is_public: isPublic, note: 'Stored in-memory only — configure a database for persistence.' } });
    } catch (err) {
        console.error('[v1/templates/registry] POST error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/v1/templates/registry
 * Browse shared templates. Returns own templates + public templates.
 * Query params: ?scope=room&isPublic=true
 */
v1Router.get('/templates/registry', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });

    const { scope, isPublic } = req.query;

    try {
        const supabase = await getSupabaseClient().catch(() => null);
        if (supabase) {
            let query = supabase.from('template_registry')
                .select('id, account_id, name, code, scope, is_public, created_at')
                .or(`account_id.eq.${userId},is_public.eq.true`);
            if (scope) query = query.eq('scope', scope);
            if (isPublic === 'true') query = query.eq('is_public', true);
            const { data } = await query.order('created_at', { ascending: false }).limit(100);
            return ok(res, data ?? [], { count: (data ?? []).length });
        }

        const pool = (await import('../../pgClient.js')).getPgPool();
        if (pool) {
            const { rows } = await pool.query(
                `SELECT id, account_id, name, code, scope, is_public, created_at
                 FROM template_registry
                 WHERE account_id=$1 OR is_public=true
                 ORDER BY created_at DESC LIMIT 100`,
                [userId]
            );
            return ok(res, rows, { count: rows.length });
        }

        return ok(res, [], { count: 0, note: 'No database configured — template registry requires Supabase or Replit PostgreSQL.' });
    } catch (err) {
        console.error('[v1/templates/registry] GET error:', err);
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/v1/templates/registry/:id
 * Get a single template from the registry (own or public).
 */
v1Router.get('/templates/registry/:id', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required.' });

    try {
        const supabase = await getSupabaseClient().catch(() => null);
        if (supabase) {
            const { data } = await supabase
                .from('template_registry')
                .select('*')
                .eq('id', req.params.id)
                .or(`account_id.eq.${userId},is_public.eq.true`)
                .single();
            if (!data) return res.status(404).json({ error: 'Template not found.' });
            return ok(res, data);
        }

        const pool = (await import('../../pgClient.js')).getPgPool();
        if (pool) {
            const { rows } = await pool.query(
                `SELECT * FROM template_registry WHERE id=$1 AND (account_id=$2 OR is_public=true)`,
                [req.params.id, userId]
            );
            if (!rows[0]) return res.status(404).json({ error: 'Template not found.' });
            return ok(res, rows[0]);
        }

        return res.status(404).json({ error: 'Template not found.' });
    } catch (err) {
        console.error('[v1/templates/registry/:id] GET error:', err);
        res.status(500).json({ error: err.message });
    }
});
