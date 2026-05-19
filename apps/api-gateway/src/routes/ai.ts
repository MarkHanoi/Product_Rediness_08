/**
 * @pryzm/api-gateway — /v1/ai/* routes (AI public API).
 *
 * Source authority:
 *   - phases/PHASE-3C-Q3-M31-M33-SDK-MARKETPLACE-PUBLIC-API.md §S65 work-item 3
 *   - ADR-0042 §A (S65 closure: read-only L7.5 surface)
 *
 * Read-only catalog (no scope required — discovery surface):
 *   GET /v1/ai/workflows         → list
 *   GET /v1/ai/workflows/:id     → describe
 *
 * Invocation (scope `ai:invoke`):
 *   POST /v1/ai/workflows/:id/invoke  → enqueue or reject pre-flight
 *
 * Returns the AiInvokePort response verbatim — the api-gateway does NOT
 * wait for the AI run to complete.  Clients poll `runId` via the WS
 * `/v1/projects/:projectId/stream` channel for `workflow.commit` events.
 * That clean async separation is the whole point of L7.5 per
 * SPEC-07 §3.
 */

import type { Router, Request, Response } from 'express';
import { Router as makeRouter, json } from 'express';
import { z } from 'zod';
import { requireScopes } from '@pryzm/api-rbac';
import { rateLimit, type RateLimitRegistry } from '@pryzm/rate-limit';
import type { AiInvokePort } from '../ports.js';

const WorkflowIdSchema = z.string().min(1).max(128).regex(/^[a-z0-9][a-z0-9._-]{0,127}$/);

const InvokeBodySchema = z.object({
  projectId: z.string().min(1).max(128),
  input: z.unknown().optional(),
});

export interface AiRouterOptions {
  readonly aiPort: AiInvokePort;
  readonly reads: RateLimitRegistry;
  readonly writes: RateLimitRegistry;
}

export function buildAiRouter(opts: AiRouterOptions): Router {
  const r = makeRouter();
  const readLimited = rateLimit({ kind: 'read', registry: opts.reads });
  const writeLimited = rateLimit({ kind: 'write', registry: opts.writes });

  r.get('/v1/ai/workflows', readLimited, (_req: Request, res: Response) => {
    const workflows = opts.aiPort.listWorkflows();
    res.json({
      total: workflows.length,
      workflows: workflows.map(toPublicDescriptor),
    });
  });

  r.get('/v1/ai/workflows/:id', readLimited, (req: Request, res: Response) => {
    const idParse = WorkflowIdSchema.safeParse(req.params.id);
    if (!idParse.success) {
      res.status(400).json({ error: 'invalid_workflow_id' });
      return;
    }
    const desc = opts.aiPort.getWorkflow(idParse.data);
    if (!desc) {
      res.status(404).json({ error: 'workflow_not_found', workflowId: idParse.data });
      return;
    }
    res.json(toPublicDescriptor(desc));
  });

  r.post(
    '/v1/ai/workflows/:id/invoke',
    writeLimited,
    requireScopes(['ai:invoke']),
    json({ limit: '256kb' }),
    async (req: Request, res: Response) => {
      const idParse = WorkflowIdSchema.safeParse(req.params.id);
      if (!idParse.success) {
        res.status(400).json({ error: 'invalid_workflow_id' });
        return;
      }
      const bodyParse = InvokeBodySchema.safeParse(req.body);
      if (!bodyParse.success) {
        res.status(400).json({
          error: 'invalid_request',
          error_description: 'body must be { projectId, input? }',
          issues: bodyParse.error.issues,
        });
        return;
      }
      const auth = (req as Request & { auth?: { subject?: string } }).auth;
      const actorId = auth?.subject ?? 'anonymous';
      try {
        const result = await opts.aiPort.invoke({
          workflowId: idParse.data,
          projectId: bodyParse.data.projectId,
          actorId,
          input: bodyParse.data.input,
        });
        if (result.status === 'rejected') {
          // Pre-flight rejection (budget, missing workflow, etc.) is a
          // 422 — request was syntactically valid but semantically failed.
          res.status(422).json({
            error: 'workflow_rejected',
            runId: result.runId,
            workflowId: result.workflowId,
            reason: result.reason ?? 'pre-flight rejection',
            estimatedCostUsd: result.estimatedCostUsd,
          });
          return;
        }
        res.status(202).json(result);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'internal_error';
        res.status(500).json({ error: 'invoke_failed', error_description: message });
      }
    },
  );

  return r;
}

/**
 * Map an internal `WorkflowDescriptor` to the public-API shape.  We
 * EXPLICITLY drop the `impl` (it's already not on the descriptor) and
 * any internal-only fields a future refactor might add — the wire
 * contract is enumerated here, not implicit from the type.
 */
function toPublicDescriptor(d: { id: string; title: string; kind: string; estimatedCostUsd: number }) {
  return Object.freeze({
    id: d.id,
    title: d.title,
    kind: d.kind,
    estimatedCostUsd: d.estimatedCostUsd,
  });
}
