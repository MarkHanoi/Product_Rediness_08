/**
 * @pryzm/api-gateway — /v1/projects/* routes.
 *
 * Implements the SPEC-26 §11 public REST surface for project import +
 * export.  Both endpoints are content-type-strict — `application/zip`
 * inbound for import, `application/zip` outbound for export.
 *
 * Read-side concerns (export):
 *   - Scope `project:read`
 *   - Rate-limited READ bucket
 *   - ETag + Last-Modified headers for client-side caching
 *   - 404 on missing projectId (loud-fail-soft)
 *
 * Write-side concerns (import):
 *   - Scope `project:write`
 *   - Rate-limited WRITE bucket
 *   - 5 MiB body limit (matches marketplace-api)
 *   - 422 on malformed ZIP, 400 on empty body
 *   - 201 + Location header on success
 */

import type { Router, Request, Response } from 'express';
import { Router as makeRouter, raw } from 'express';
import { z } from 'zod';
import { requireScopes } from '@pryzm/api-rbac';
import { rateLimit, type RateLimitRegistry } from '@pryzm/rate-limit';
import {
  ProjectImportError,
  type ProjectExportPort,
  type ProjectImportPort,
} from '../ports.js';

const ProjectIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9._-]+$/);

export interface ProjectsRouterOptions {
  readonly exportPort: ProjectExportPort;
  readonly importPort: ProjectImportPort;
  readonly reads: RateLimitRegistry;
  readonly writes: RateLimitRegistry;
  /** Maximum import body size, in bytes.  Default 5 MiB. */
  readonly maxImportBytes?: number;
}

export function buildProjectsRouter(opts: ProjectsRouterOptions): Router {
  const r = makeRouter();
  const readLimited = rateLimit({ kind: 'read', registry: opts.reads });
  const writeLimited = rateLimit({ kind: 'write', registry: opts.writes });
  const maxBytes = opts.maxImportBytes ?? 5 * 1024 * 1024;

  // GET /v1/projects/:projectId/export.pryzm
  r.get(
    '/v1/projects/:projectId/export.pryzm',
    readLimited,
    requireScopes(['project:read']),
    async (req: Request, res: Response) => {
      const idParse = ProjectIdSchema.safeParse(req.params.projectId);
      if (!idParse.success) {
        res.status(400).json({ error: 'invalid_project_id', error_description: 'projectId must match [a-zA-Z0-9._-]{1,128}' });
        return;
      }
      try {
        const result = await opts.exportPort.exportProject(idParse.data);
        if (!result) {
          res.status(404).json({ error: 'project_not_found', projectId: idParse.data });
          return;
        }

        // Conditional GET — If-None-Match support per RFC 9110 §13.1.2.
        const ifNoneMatch = req.header('if-none-match');
        if (ifNoneMatch && ifNoneMatch === result.etag) {
          res.status(304).end();
          return;
        }

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Length', String(result.bytes.length));
        res.setHeader('ETag', result.etag);
        res.setHeader('Last-Modified', result.lastModified);
        res.setHeader('Content-Disposition', `attachment; filename="${idParse.data}.pryzm"`);
        res.status(200).end(Buffer.from(result.bytes));
      } catch (err) {
        const message = err instanceof Error ? err.message : 'internal_error';
        res.status(500).json({ error: 'export_failed', error_description: message });
      }
    },
  );

  // POST /v1/projects/import — body MUST be application/zip
  r.post(
    '/v1/projects/import',
    writeLimited,
    requireScopes(['project:write']),
    raw({ type: 'application/zip', limit: maxBytes }),
    async (req: Request, res: Response) => {
      const ctype = (req.header('content-type') ?? '').toLowerCase();
      if (!ctype.startsWith('application/zip')) {
        res.status(415).json({
          error: 'unsupported_media_type',
          error_description: 'expected Content-Type: application/zip',
          received: ctype || '<empty>',
        });
        return;
      }
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) {
        res.status(400).json({ error: 'empty_body', error_description: 'expected non-empty ZIP body' });
        return;
      }
      try {
        const result = await opts.importPort.importProject(new Uint8Array(body));
        res.setHeader('Location', `/v1/projects/${result.projectId}/export.pryzm`);
        res.status(201).json(result);
      } catch (err) {
        if (err instanceof ProjectImportError) {
          res.status(err.httpStatus).json({
            error: err.httpStatus === 400 ? 'invalid_request' : 'unprocessable_entity',
            error_description: err.reason,
          });
          return;
        }
        const message = err instanceof Error ? err.message : 'internal_error';
        res.status(500).json({ error: 'import_failed', error_description: message });
      }
    },
  );

  return r;
}
