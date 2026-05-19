// apps/sync-server/locks/handlers.ts — Express HTTP handlers for the
// soft-lock surface (S45 D1-D3).
//
// Routes (all expect `?projectId=...` query parameter; the v0 auth model
// reads `userId` + `displayName` from headers — the editor passes them per
// the existing WS handshake convention):
//
//   POST   /api/locks/:elementId          → acquire
//                       body = { ttlMs?: number }
//                       200  → { elementId, leaseId, expiresAtMs }
//                       409  → { elementId, holder: { userId, displayName, expiresAtMs } }
//
//   POST   /api/locks/:elementId/extend   → extend
//                       body = { leaseId, ttlMs? }
//                       200  → { elementId, leaseId, expiresAtMs }
//                       404  → { error: 'no-such-lock' }
//                       409  → { error: 'lease-mismatch' }
//
//   DELETE /api/locks/:elementId          → release
//                       header X-Lease-Id required
//                       204  on success
//                       404  on no-such-lock (idempotent — client treats as success)
//                       409  on lease-mismatch
//
//   GET    /api/locks                     → list (project-scoped snapshot)
//                       200  → LockRow[]
//
// Auth: v0 trusts the `userId` + `displayName` headers (matches WS handshake
// per apps/sync-server/index.ts §"v0 auth: clientId + userId from query").
// Phase 3C upgrades to JWT.

import type { Express, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import type { Authz } from '../authz/index.js';
import {
  LeaseMismatchError,
  NoSuchLockError,
  type SoftLockStore,
} from './types.js';

export interface MountLocksHandlersOptions {
  readonly store: SoftLockStore;
  /** Authz boundary (W-03 / ADR-0040).  Required — gates `lockAcquire`
   *  on POST/extend/DELETE, and `projectRead` on GET /api/locks. */
  readonly authz: Authz;
  /** Optional UUID factory for tests (default `crypto.randomUUID`). */
  readonly newLeaseId?: () => string;
}

const DEFAULT_TTL_MS = 30_000;
const MAX_TTL_MS = 5 * 60_000;  // 5 minutes — sanity cap, prevents stale forever-leases.

export function mountLocksHandlers(app: Express, opts: MountLocksHandlersOptions): void {
  const { store, authz } = opts;
  const newLeaseId = opts.newLeaseId ?? randomUUID;

  // ── POST /api/locks/:elementId — acquire ───────────────────────────────
  app.post('/api/locks/:elementId', async (req: Request, res: Response) => {
    const ctx = parseAuthContext(req);
    if ('error' in ctx) return res.status(400).json(ctx);
    const elementId = String(req.params.elementId ?? '');
    if (!elementId) return res.status(400).json({ error: 'missing-elementId' });
    if (!(await authz.can('lockAcquire', { actor: { id: ctx.userId }, projectId: ctx.projectId, elementId }))) {
      return res.status(403).json({ error: 'forbidden', message: `actor ${ctx.userId} not authorised to acquire locks on ${ctx.projectId}` });
    }
    const ttlMs = clampTtl((req.body as { ttlMs?: number } | undefined)?.ttlMs);
    const leaseId = newLeaseId();
    try {
      const result = await store.acquire({
        projectId: ctx.projectId,
        elementId,
        holderId: ctx.userId,
        holderDisplayName: ctx.displayName,
        leaseId,
        ttlMs,
      });
      if (!result.ok) {
        return res.status(409).json({
          elementId,
          holder: result.holder,
        });
      }
      return res.status(200).json({
        elementId: result.row.elementId,
        leaseId: result.row.leaseId,
        expiresAtMs: result.row.expiresAtMs,
      });
    } catch (err) {
      return res.status(500).json({ error: 'internal', message: errMsg(err) });
    }
  });

  // ── POST /api/locks/:elementId/extend ──────────────────────────────────
  app.post('/api/locks/:elementId/extend', async (req: Request, res: Response) => {
    const ctx = parseAuthContext(req);
    if ('error' in ctx) return res.status(400).json(ctx);
    const elementId = String(req.params.elementId ?? '');
    const body = (req.body as { leaseId?: string; ttlMs?: number } | undefined) ?? {};
    const leaseId = String(body.leaseId ?? '');
    if (!elementId || !leaseId) return res.status(400).json({ error: 'missing-fields' });
    if (!(await authz.can('lockAcquire', { actor: { id: ctx.userId }, projectId: ctx.projectId, elementId }))) {
      return res.status(403).json({ error: 'forbidden', message: `actor ${ctx.userId} not authorised to extend lease on ${ctx.projectId}` });
    }
    const ttlMs = clampTtl(body.ttlMs);
    try {
      const row = await store.extend({
        projectId: ctx.projectId, elementId, holderId: ctx.userId, leaseId, ttlMs,
      });
      return res.status(200).json({
        elementId: row.elementId, leaseId: row.leaseId, expiresAtMs: row.expiresAtMs,
      });
    } catch (err) {
      if (err instanceof NoSuchLockError) return res.status(404).json({ error: 'no-such-lock' });
      if (err instanceof LeaseMismatchError) return res.status(409).json({ error: 'lease-mismatch' });
      return res.status(500).json({ error: 'internal', message: errMsg(err) });
    }
  });

  // ── DELETE /api/locks/:elementId — release ─────────────────────────────
  app.delete('/api/locks/:elementId', async (req: Request, res: Response) => {
    const ctx = parseAuthContext(req);
    if ('error' in ctx) return res.status(400).json(ctx);
    const elementId = String(req.params.elementId ?? '');
    const leaseId = String(req.header('x-lease-id') ?? '');
    if (!elementId || !leaseId) return res.status(400).json({ error: 'missing-fields' });
    if (!(await authz.can('lockAcquire', { actor: { id: ctx.userId }, projectId: ctx.projectId, elementId }))) {
      return res.status(403).json({ error: 'forbidden', message: `actor ${ctx.userId} not authorised to release lease on ${ctx.projectId}` });
    }
    try {
      const ok = await store.release({ projectId: ctx.projectId, elementId, leaseId });
      if (!ok) return res.status(404).end();
      return res.status(204).end();
    } catch (err) {
      if (err instanceof LeaseMismatchError) return res.status(409).json({ error: 'lease-mismatch' });
      return res.status(500).json({ error: 'internal', message: errMsg(err) });
    }
  });

  // ── GET /api/locks — list (project-scoped) ─────────────────────────────
  app.get('/api/locks', async (req: Request, res: Response) => {
    const projectId = String(req.query.projectId ?? '');
    if (!projectId) return res.status(400).json({ error: 'missing-projectId' });
    const userId = String(req.header('x-user-id') ?? '');
    if (!userId) return res.status(400).json({ error: 'missing-userId' });
    if (!(await authz.can('projectRead', { actor: { id: userId }, projectId }))) {
      return res.status(403).json({ error: 'forbidden', message: `actor ${userId} not authorised to read project ${projectId}` });
    }
    try {
      const rows = await store.list(projectId);
      return res.status(200).json(rows);
    } catch (err) {
      return res.status(500).json({ error: 'internal', message: errMsg(err) });
    }
  });
}

interface AuthContext {
  readonly projectId: string;
  readonly userId: string;
  readonly displayName: string;
}

function parseAuthContext(req: Request): AuthContext | { error: string } {
  const projectId = String(req.query.projectId ?? '');
  const userId = String(req.header('x-user-id') ?? '');
  const displayName = String(req.header('x-display-name') ?? userId);
  if (!projectId) return { error: 'missing-projectId' };
  if (!userId) return { error: 'missing-userId' };
  return { projectId, userId, displayName };
}

function clampTtl(t: unknown): number {
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return DEFAULT_TTL_MS;
  return Math.min(Math.max(1_000, Math.floor(t)), MAX_TTL_MS);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
