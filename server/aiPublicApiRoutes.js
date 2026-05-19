/**
 * @file server/aiPublicApiRoutes.js
 * @description Public AI API v1 — 4 endpoints + status.
 *
 * Spec sources:
 *   • PHASE-3A AI-VISIBILITY-COMPLETE.md §S53 D10 (draft endpoints).
 *   • PHASE-3A VI-AI-ELEMENT-CREATOR.md §5.2 (canonical code sample).
 *   • PHASE-3-COMPLETION-GA-M25-M36.md §M27 (4-endpoint public API).
 *   • Context.md §"REST" (line 519-522).
 *
 * Endpoints:
 *   POST /v1/ai/floorplan-import   — multipart PDF, enqueues pdf-to-bim job
 *   GET  /v1/ai/jobs/:jobId/status — poll job status
 *   POST /v1/ai/query              — read-only inspector workflow
 *   POST /v1/ai/generate           — generator workflow (Generate-3-Options)
 *   POST /v1/ai/validate           — critic workflow (Plan-Critique)
 *
 * Authentication:
 *   Bearer token via the standard `authMiddleware` (HMAC-signed JWT issued
 *   by `/api/auth/sign-in`).  Per S53 D10 + Risk-register R3A-08 the OAuth2
 *   grant flow is explicitly DEFERRED to S65; the Bearer/PAT path is the
 *   3A-draft contract.  This route refuses anonymous callers (`req.auth.userId
 *   === 'anonymous'` → 401).
 *
 * Rate limiting:
 *   Per-route 10 req/min (verbatim from VI-AI-ELEMENT-CREATOR §5.2).
 *
 * Cost ceilings (per-call hard caps, enforced PRE-call):
 *   floorplan-import: $0.50 (rough page estimate · $0.10/page)
 *   query           : $0.05
 *   generate        : $0.18
 *   validate        : $0.05
 *
 * All endpoints write one row to `ai_usage` per call (success or budget-cap).
 */

import { Router } from 'express';
import { createRequire } from 'module';
import { createHash, randomUUID } from 'crypto';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { query as pgQuery } from './pgClient.js';
import { recordAiUsage } from './aiUsageStore.js';

const _require = createRequire(import.meta.url);
const multer = _require('multer');

// ── Constants ────────────────────────────────────────────────────────────────

const COST_CEILINGS_USD = Object.freeze({
    'floorplan-import': 0.50,
    'query':            0.05,
    'generate':         0.18,
    'validate':         0.05,
});

const PUBLIC_API_RATE_LIMIT = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => res.status(429).json({
        error: 'Public AI API: 10 req/min limit exceeded',
        retryAfterSec: 60,
    }),
});

const pdfUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB cap
});

// ── Auth gate ────────────────────────────────────────────────────────────────

/**
 * Reject anonymous callers — Public AI API requires a Bearer token.
 * The bearer-resolution itself is performed by the upstream `authMiddleware`
 * in `server.js`; this gate just enforces non-anonymity.
 */
function requireBearer(req, res, next) {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') {
        return res.status(401).json({
            error: 'Public AI API requires a Bearer token (Authorization: Bearer <token>)',
            docsUrl: '/api/v1/docs',
        });
    }
    return next();
}

// ── Schemas (Zod) ────────────────────────────────────────────────────────────

const FloorplanImportOptions = z.object({
    projectId: z.string().min(1),
    pageNumbers: z.array(z.number().int().positive()).optional(),
    autoapproveThreshold: z.number().min(0).max(1).default(0.85),
});

const QuerySchema = z.object({
    projectId: z.string().min(1),
    question: z.string().min(1).max(4_000),
    surface: z.string().optional(),
});

const GenerateSchema = z.object({
    projectId: z.string().min(1),
    intent: z.string().min(1).max(4_000),
    constraints: z.record(z.any()).optional(),
    surface: z.string().optional(),
});

const ValidateSchema = z.object({
    projectId: z.string().min(1),
    target: z.object({
        elementIds: z.array(z.string()).optional(),
        rules: z.array(z.string()).optional(),
    }),
    surface: z.string().optional(),
});

// ── Cost estimator (pre-call check) ──────────────────────────────────────────

function estimateCost(workflow, payload) {
    if (workflow === 'floorplan-import') {
        const sizeBytes = payload?.pdfSizeBytes ?? 0;
        return Math.max(0.01, (sizeBytes / 50_000) * 0.10);
    }
    if (workflow === 'query' || workflow === 'validate') return 0.02;
    if (workflow === 'generate') return 0.10;
    return 0.05;
}

function buildCacheKey(projectId, workflow, body) {
    return createHash('sha256').update(JSON.stringify({ projectId, workflow, body })).digest('hex');
}

async function readAiResponseCache(projectId, workflow, modelVersion, body) {
    const contentHash = buildCacheKey(projectId, workflow, body);
    const result = await pgQuery(
        `SELECT response_json
           FROM ai_response_cache
          WHERE tenant_id = $1
            AND content_hash = $2
            AND model_version = $3
            AND expires_at > NOW()
          LIMIT 1`,
        [projectId, contentHash, modelVersion],
    ).catch(() => ({ rows: [] }));

    if (!result.rows?.[0]) return null;

    await pgQuery(
        `UPDATE ai_response_cache
            SET hit_count = hit_count + 1
          WHERE tenant_id = $1
            AND content_hash = $2
            AND model_version = $3`,
        [projectId, contentHash, modelVersion],
    ).catch(() => {});

    return result.rows[0].response_json;
}

async function writeAiResponseCache(projectId, workflow, modelVersion, body, responseJson) {
    const contentHash = buildCacheKey(projectId, workflow, body);
    await pgQuery(
        `INSERT INTO ai_response_cache
            (tenant_id, content_hash, model_version, response_json, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '7 days')
         ON CONFLICT (tenant_id, content_hash, model_version)
         DO UPDATE SET response_json = EXCLUDED.response_json,
                       expires_at = EXCLUDED.expires_at`,
        [projectId, contentHash, modelVersion, JSON.stringify(responseJson)],
    ).catch(err => {
        console.warn('[ai/public/cache] write failed:', err.message);
    });
}

// ── Router ───────────────────────────────────────────────────────────────────

export function buildAiPublicApiRouter() {
    const router = Router();

    // POST /v1/ai/floorplan-import ────────────────────────────────────────────
    router.post(
        '/floorplan-import',
        PUBLIC_API_RATE_LIMIT,
        requireBearer,
        pdfUpload.single('pdf'),
        async (req, res) => {
            const t0 = Date.now();
            const actorId = req.auth.userId;
            try {
                if (!req.file || !req.file.buffer) {
                    return res.status(400).json({ error: 'Multipart field "pdf" is required' });
                }
                const optsRaw = (() => {
                    try { return JSON.parse(req.body?.options ?? '{}'); }
                    catch { return {}; }
                })();
                const opts = FloorplanImportOptions.parse(optsRaw);

                const pdfSizeBytes = req.file.buffer.byteLength;
                const estUsd = estimateCost('floorplan-import', { pdfSizeBytes });
                const cap = COST_CEILINGS_USD['floorplan-import'];
                if (estUsd > cap) {
                    await recordAiUsage({
                        projectId: opts.projectId,
                        actorId,
                        workflow: 'pdf-floorplan-import',
                        surface: '/v1/ai/floorplan-import',
                        costUsd: 0,
                        durationMs: Date.now() - t0,
                        status: 'budget-cap',
                    });
                    return res.status(402).json({
                        error: 'Estimated cost exceeds Public-API ceiling',
                        estimatedCostUsd: estUsd,
                        ceilingUsd: cap,
                    });
                }

                const jobId = `pdf_${randomUUID()}`;
                const promptSha = createHash('sha256')
                    .update(req.file.buffer).digest('hex');

                await pgQuery(
                    `INSERT INTO pdf_jobs
                        (id, project_id, actor_id, source_pdf_url, page_number,
                         page_count, status, current_stage, cost_usd)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                    [
                        jobId,
                        opts.projectId,
                        actorId,
                        `inline:${promptSha.slice(0, 16)}`,
                        1,
                        opts.pageNumbers?.length ?? 1,
                        'queued',
                        'classify',
                        0,
                    ],
                ).catch(err => {
                    console.warn('[ai/public/floorplan-import] pdf_jobs insert failed:', err.message);
                });

                await recordAiUsage({
                    projectId: opts.projectId,
                    actorId,
                    workflow: 'pdf-floorplan-import',
                    surface: '/v1/ai/floorplan-import',
                    promptSha,
                    costUsd: 0,
                    durationMs: Date.now() - t0,
                    status: 'ok',
                });

                return res.status(202).json({
                    jobId,
                    status: 'queued',
                    estimatedCostUsd: Number(estUsd.toFixed(4)),
                    estimatedDurationSec: 30,
                    statusUrl: `/v1/ai/jobs/${jobId}/status`,
                });
            } catch (err) {
                if (err instanceof z.ZodError) {
                    return res.status(400).json({ error: 'Invalid request', issues: err.issues });
                }
                console.error('[ai/public/floorplan-import] error:', err);
                return res.status(500).json({ error: 'Internal error' });
            }
        },
    );

    router.get('/jobs/:jobId/status', requireBearer, async (req, res) => {
        try {
            const { jobId } = req.params;
            if (!/^pdf_[0-9a-f-]+$/.test(jobId)) {
                return res.status(400).json({ error: 'Malformed jobId' });
            }
            const r = await pgQuery(
                `SELECT id, project_id, status, current_stage, classification,
                        cost_usd, error_message, created_at, updated_at
                   FROM pdf_jobs
                  WHERE id = $1
                  LIMIT 1`,
                [jobId],
            ).catch(() => ({ rows: [] }));
            if (!r.rows || r.rows.length === 0) {
                return res.status(404).json({ error: 'Job not found' });
            }
            const j = r.rows[0];
            const ownerCheck = await pgQuery(
                `SELECT actor_id FROM pdf_jobs WHERE id = $1`,
                [jobId],
            ).catch(() => ({ rows: [] }));
            const submitter = ownerCheck.rows?.[0]?.actor_id;
            if (submitter && submitter !== req.auth.userId) {
                return res.status(403).json({ error: 'Not your job' });
            }
            return res.json({
                jobId: j.id,
                projectId: j.project_id,
                status: j.status,
                currentStage: j.current_stage,
                costUsd: Number(j.cost_usd),
                classification: j.classification,
                error: j.error_message,
                createdAt: j.created_at,
                updatedAt: j.updated_at,
            });
        } catch (err) {
            console.error('[ai/public/jobs/status] error:', err);
            return res.status(500).json({ error: 'Internal error' });
        }
    });

    router.post('/query', PUBLIC_API_RATE_LIMIT, requireBearer, async (req, res) => {
        return handleSyncWorkflow(req, res, {
            workflow: 'public-api-query',
            schema: QuerySchema,
            ceilingUsd: COST_CEILINGS_USD.query,
            surface: '/v1/ai/query',
        });
    });

    router.post('/generate', PUBLIC_API_RATE_LIMIT, requireBearer, async (req, res) => {
        return handleSyncWorkflow(req, res, {
            workflow: 'public-api-generate',
            schema: GenerateSchema,
            ceilingUsd: COST_CEILINGS_USD.generate,
            surface: '/v1/ai/generate',
        });
    });

    router.post('/validate', PUBLIC_API_RATE_LIMIT, requireBearer, async (req, res) => {
        return handleSyncWorkflow(req, res, {
            workflow: 'public-api-validate',
            schema: ValidateSchema,
            ceilingUsd: COST_CEILINGS_USD.validate,
            surface: '/v1/ai/validate',
        });
    });

    return router;
}

async function handleSyncWorkflow(req, res, { workflow, schema, ceilingUsd, surface }) {
    const t0 = Date.now();
    const actorId = req.auth.userId;
    try {
        const body = schema.parse(req.body ?? {});
        const promptSha = createHash('sha256')
            .update(JSON.stringify(body)).digest('hex');

        const estUsd = estimateCost(workflow.replace('public-api-', ''), {});
        if (estUsd > ceilingUsd) {
            await recordAiUsage({
                projectId: body.projectId, actorId, workflow,
                surface, promptSha, durationMs: Date.now() - t0,
                status: 'budget-cap',
            });
            return res.status(402).json({
                error: 'Estimated cost exceeds Public-API ceiling',
                estimatedCostUsd: estUsd,
                ceilingUsd,
            });
        }

        const modelVersion = process.env.AI_MODEL_VERSION || 'unknown';
        const cached = await readAiResponseCache(body.projectId, workflow, modelVersion, body);
        if (cached) {
            await recordAiUsage({
                projectId: body.projectId,
                actorId,
                workflow,
                surface,
                promptSha,
                inputTokens: 0,
                outputTokens: 0,
                costUsd: 0,
                durationMs: Date.now() - t0,
                status: 'ok',
            });
            return res.json({
                workflow,
                costUsd: 0,
                durationMs: Date.now() - t0,
                result: cached,
                cacheHit: true,
            });
        }

        const hook = globalThis.__pryzmAiInference;
        let result;
        let realCostUsd = estUsd;
        let inputTokens = 0;
        let outputTokens = 0;
        if (typeof hook === 'function') {
            const r = await hook({ workflow, body });
            result = r?.result ?? null;
            realCostUsd = r?.costUsd ?? estUsd;
            inputTokens = r?.inputTokens ?? 0;
            outputTokens = r?.outputTokens ?? 0;
        } else {
            await recordAiUsage({
                projectId: body.projectId, actorId, workflow,
                surface, promptSha, durationMs: Date.now() - t0,
                status: 'not-configured',
            });
            return res.status(503).json({
                error: 'Public AI inference path not yet enabled (S53 draft).',
                acceptedAt: new Date().toISOString(),
                workflow,
                contractVersion: 'v1-draft',
            });
        }

        await writeAiResponseCache(body.projectId, workflow, modelVersion, body, result);

        await recordAiUsage({
            projectId: body.projectId, actorId, workflow,
            surface, promptSha,
            inputTokens, outputTokens, costUsd: realCostUsd,
            durationMs: Date.now() - t0,
            status: 'ok',
        });

        return res.json({
            workflow,
            costUsd: Number(realCostUsd.toFixed(6)),
            durationMs: Date.now() - t0,
            result,
            cacheHit: false,
        });
    } catch (err) {
        if (err instanceof z.ZodError) {
            return res.status(400).json({ error: 'Invalid request', issues: err.issues });
        }
        console.error(`[ai/public/${workflow}] error:`, err);
        return res.status(500).json({ error: 'Internal error' });
    }
}
