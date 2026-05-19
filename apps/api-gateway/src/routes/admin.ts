/**
 * @pryzm/api-gateway — /v1/admin/* routes.
 *
 * Sources:
 *   - SPEC-28 §9 — Workspace Admin AI Spend view (`/v1/admin/ai-spend`)
 *   - ADR-028 Part E — Enterprise admin plan/role overrides (`/v1/admin/overrides`)
 *   - phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S65 work-items 7+8
 *   - ADR-0043 + ADR-0045 (S65 closure)
 *
 * All admin routes:
 *   • require an admin role (`admin` or `owner`) via `requireAdmin`
 *   • require scope `project:read` for reads and `project:write` for writes
 *   • are rate-limited per ADR-018
 */

import type { Router, Request, Response } from 'express';
import { Router as makeRouter, json } from 'express';
import { z } from 'zod';
import { requireScopes } from '@pryzm/api-rbac';
import { rateLimit, type RateLimitRegistry } from '@pryzm/rate-limit';
import {
  aggregateByActor,
  aggregateByDay,
  aggregateByProject,
  aggregateBySurface,
  aggregateByWorkspace,
  aggregateByWorkflow,
  aggregateByModel,
  computeTotals,
  type AiSpendStore,
} from '@pryzm/ai-spend';
import {
  InvalidOverrideError,
  OverrideRecordSchema,
  SUBJECT_KINDS,
  type OverrideStore,
  type SubjectKind,
} from '@pryzm/admin-overrides';
import { requireAdmin } from '../auth-shim.js';

export interface AdminRouterOptions {
  readonly spendStore: AiSpendStore;
  readonly overrideStore: OverrideStore;
  readonly reads: RateLimitRegistry;
  readonly writes: RateLimitRegistry;
}

const AiSpendQuerySchema = z.object({
  workspaceId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  fromTs: z.coerce.number().int().nonnegative().optional(),
  toTs: z.coerce.number().int().nonnegative().optional(),
  groupBy: z
    .enum(['workspace', 'project', 'actor', 'surface', 'day', 'model', 'workflow'])
    .optional(),
});

const SubjectKindSchema = z.enum(SUBJECT_KINDS);
const SubjectIdSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9._-]+$/);

const PutOverrideBodySchema = OverrideRecordSchema.omit({
  subjectKind: true,
  subjectId: true,
});

export function buildAdminRouter(opts: AdminRouterOptions): Router {
  const r = makeRouter();
  const readLimited = rateLimit({ kind: 'read', registry: opts.reads });
  const writeLimited = rateLimit({ kind: 'write', registry: opts.writes });

  // ── AI Spend ────────────────────────────────────────────────────────

  r.get(
    '/v1/admin/ai-spend',
    readLimited,
    requireScopes(['project:read']),
    requireAdmin,
    (req: Request, res: Response) => {
      const q = AiSpendQuerySchema.safeParse(req.query);
      if (!q.success) {
        res.status(400).json({ error: 'invalid_query', issues: q.error.issues });
        return;
      }
      const range = {
        ...(q.data.workspaceId !== undefined ? { workspaceId: q.data.workspaceId } : {}),
        ...(q.data.projectId !== undefined ? { projectId: q.data.projectId } : {}),
        ...(q.data.fromTs !== undefined ? { fromTs: q.data.fromTs } : {}),
        ...(q.data.toTs !== undefined ? { toTs: q.data.toTs } : {}),
      };
      const entries = opts.spendStore.query(range);
      const totals = computeTotals(entries);
      const groupBy = q.data.groupBy;
      const rows = groupBy
        ? selectAggregation(groupBy, entries)
        : aggregateByDay(entries); // default: time series by day
      res.json({
        groupBy: groupBy ?? 'day',
        totals,
        rows,
      });
    },
  );

  // ── Overrides ───────────────────────────────────────────────────────

  r.get(
    '/v1/admin/overrides',
    readLimited,
    requireScopes(['project:read']),
    requireAdmin,
    (_req: Request, res: Response) => {
      const list = opts.overrideStore.list();
      res.json({ total: list.length, overrides: list });
    },
  );

  r.get(
    '/v1/admin/overrides/:subjectKind/:subjectId',
    readLimited,
    requireScopes(['project:read']),
    requireAdmin,
    (req: Request, res: Response) => {
      const k = SubjectKindSchema.safeParse(req.params.subjectKind);
      const i = SubjectIdSchema.safeParse(req.params.subjectId);
      if (!k.success || !i.success) {
        res.status(400).json({ error: 'invalid_path' });
        return;
      }
      const got = opts.overrideStore.get(k.data, i.data);
      if (!got) {
        res.status(404).json({ error: 'override_not_found' });
        return;
      }
      res.json(got);
    },
  );

  r.put(
    '/v1/admin/overrides/:subjectKind/:subjectId',
    writeLimited,
    requireScopes(['project:write']),
    requireAdmin,
    json({ limit: '64kb' }),
    (req: Request, res: Response) => {
      const k = SubjectKindSchema.safeParse(req.params.subjectKind);
      const i = SubjectIdSchema.safeParse(req.params.subjectId);
      if (!k.success || !i.success) {
        res.status(400).json({ error: 'invalid_path' });
        return;
      }
      const body = PutOverrideBodySchema.safeParse(req.body);
      if (!body.success) {
        res.status(400).json({ error: 'invalid_body', issues: body.error.issues });
        return;
      }
      try {
        const record = { ...body.data, subjectKind: k.data, subjectId: i.data };
        opts.overrideStore.set(record);
        res.status(200).json(opts.overrideStore.get(k.data, i.data));
      } catch (err) {
        if (err instanceof InvalidOverrideError) {
          res.status(400).json({ error: 'invalid_override', issues: err.issues });
          return;
        }
        const message = err instanceof Error ? err.message : 'internal_error';
        res.status(500).json({ error: 'set_override_failed', error_description: message });
      }
    },
  );

  r.delete(
    '/v1/admin/overrides/:subjectKind/:subjectId',
    writeLimited,
    requireScopes(['project:write']),
    requireAdmin,
    (req: Request, res: Response) => {
      const k = SubjectKindSchema.safeParse(req.params.subjectKind);
      const i = SubjectIdSchema.safeParse(req.params.subjectId);
      if (!k.success || !i.success) {
        res.status(400).json({ error: 'invalid_path' });
        return;
      }
      const removed = opts.overrideStore.delete(k.data, i.data);
      if (!removed) {
        res.status(404).json({ error: 'override_not_found' });
        return;
      }
      res.status(204).end();
    },
  );

  return r;
}

function selectAggregation(
  groupBy: 'workspace' | 'project' | 'actor' | 'surface' | 'day' | 'model' | 'workflow',
  entries: ReturnType<AiSpendStore['query']>,
) {
  switch (groupBy) {
    case 'workspace': return aggregateByWorkspace(entries);
    case 'project':   return aggregateByProject(entries);
    case 'actor':     return aggregateByActor(entries);
    case 'surface':   return aggregateBySurface(entries);
    case 'day':       return aggregateByDay(entries);
    case 'model':     return aggregateByModel(entries);
    case 'workflow':  return aggregateByWorkflow(entries);
  }
}

// Used by the type system above — keep the import alive.
void SUBJECT_KINDS satisfies readonly SubjectKind[];
