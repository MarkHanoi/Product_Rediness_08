/**
 * @pryzm/api-gateway — /v1/formulas/* routes.
 *
 * Read-only catalog exposing the @pryzm/formula-library descriptors so
 * external clients (plugin authors, formula-bar UIs) can browse +
 * inspect built-in formulas without invoking the SDK locally.
 *
 *   GET /v1/formulas       → list descriptors (no scope; discovery surface)
 *   GET /v1/formulas/:id   → single descriptor
 *
 * Per ADR-0044 §C invocation is INTENTIONALLY NOT exposed here — formula
 * invocation belongs in-process inside the editor / plugin sandbox to
 * avoid round-tripping a tight numerical loop through HTTP.  The public
 * API exposes the catalog ONLY.
 */

import type { Router, Request, Response } from 'express';
import { Router as makeRouter } from 'express';
import { z } from 'zod';
import { rateLimit, type RateLimitRegistry } from '@pryzm/rate-limit';
import type { FormulaCatalog } from '@pryzm/formula-library';

const FormulaIdSchema = z.string().min(1).max(64).regex(/^[a-z][a-z0-9-]*$/);

export interface FormulasRouterOptions {
  readonly catalog: FormulaCatalog;
  readonly reads: RateLimitRegistry;
}

export function buildFormulasRouter(opts: FormulasRouterOptions): Router {
  const r = makeRouter();
  const readLimited = rateLimit({ kind: 'read', registry: opts.reads });

  r.get('/v1/formulas', readLimited, (_req: Request, res: Response) => {
    const list = opts.catalog.list();
    res.json({ total: list.length, formulas: list });
  });

  r.get('/v1/formulas/:id', readLimited, (req: Request, res: Response) => {
    const id = FormulaIdSchema.safeParse(req.params.id);
    if (!id.success) {
      res.status(400).json({ error: 'invalid_formula_id' });
      return;
    }
    const desc = opts.catalog.get(id.data);
    if (!desc) {
      res.status(404).json({ error: 'formula_not_found', id: id.data });
      return;
    }
    res.json(desc);
  });

  return r;
}
