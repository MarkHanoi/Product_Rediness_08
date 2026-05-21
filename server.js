// OTel SDK MUST be imported first — before any application code — so it can
// patch HTTP clients and the Node runtime.  Wave A14 (S118) A14-T3.
import './server/telemetry.js';

import express from 'express';
import { createRequire } from 'module';
import { createServer } from 'http';
import { createServer as createViteServer } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readdirSync } from 'fs';
import { enforceAIQuota, getUserPlan, setUserPlan, getAIUsageStats, maybeAutoGrantOwner } from './server/planStore.js';
import { aiLimiter, globalLimiter, apiLimiter } from './server/rateLimiter.js';
import { v1Router } from './server/api/v1/routes.js';
// FAMILY-MARKETPLACE (S59 — phase 3-B exit): /api/v1/families publish + browse.
import { buildFamilyMarketplaceRouter } from './server/familyMarketplaceRoutes.js';
import { buildAiPublicApiRouter } from './server/aiPublicApiRoutes.js';
import { recordAiUsage, getSpendSummary } from './server/aiUsageStore.js';
import { deliverWebhookEvent } from './server/webhookService.js';
// ── Stripe payment integration ────────────────────────────────────────────────
import { stripeRouter } from './server/stripeRoutes.js';
import { constructWebhookEvent } from './server/stripeService.js';
import { authorizeExport, validateExportToken } from './server/exportGuard.js';
// ── CDE Phase 1-2: ISO 19650 CDE modules ─────────────────────────────────────
import { hasPermission } from './server/permissions.js';
import {
    getUserRole, listMembers, upsertMember, updateMemberRole, removeMember,
    listMembersFromSupabase, upsertMemberInSupabase, updateMemberRoleInSupabase,
    removeMemberFromSupabase, getMemberFromSupabase,
} from './server/projectMembers.js';
import {
    getVersionState, transitionState, transitionStateInSupabase,
    getAuditLog, isSnapshotLocked,
} from './server/versionStateMachine.js';
// M-CORS: centralised origin policy — shared by Express cors() and Socket.io
import { expressCorsOptions, socketCorsOptions } from './server/corsPolicy.js';
// M-HEADERS: helmet-powered security headers (C08 §4 — Phase 0 Task 0.1 DONE)
import { helmetMiddleware, applyEmbedHeaders } from './server/securityHeaders.js';
// M-SUPABASE-KEY: prefers SUPABASE_SERVICE_ROLE_KEY over SUPABASE_ANON_KEY
import { getSupabaseClient } from './server/supabaseClient.js';
import { verifyPluginSignatureNode, lookupPublisherKey, fetchRevocationList } from './server/pluginSigningService.js';
import { PgAiResponseCache } from './server/aiResponseCache.js';
// H7-FIX: project ownership check for Socket.io join-project authorization
import { canUserAccessProject } from './server/projectAccess.js';
// RENDER-SVC: photorealistic render job gallery (Tier 1 rendering pipeline)
import {
    saveRenderToGallery,
    listRendersForUser,
    getRenderImageBuffer,
    deleteRender,
    // TIER-3: Panorama gallery
    savePanoramaToGallery,
    listPanoramasForUser,
    getPanoramaImageBuffer,
    deletePanorama,
} from './server/renderService.js';

// ── Replit-PostgreSQL auth & project store ────────────────────────────────────
import { getPgPool, query as pgQuery, getBackendInfo } from './server/pgClient.js';
import { handleProjectApiError, SnapshotTooLargeError, ProjectConflictError, VersionLimitError, PreconditionFailedError } from './server/errors.js';
import { runMigrations } from './server/dbMigrate.js';
import { signUp as authSignUp, signIn as authSignIn, verifyToken as authVerifyToken } from './server/authStore.js';
import * as pgProjectStore from './server/projectStore.js';
// PERF-FIX (Apr 2026): Hoist dynamically-imported services so each request does
// not pay the ESM resolution cost on every call. These modules are stateless and
// safe to evaluate at boot.
import * as ifcStorageService from './server/ifcStorageService.js';
import * as dwgConversionService from './server/dwgConversionService.js';
import { z } from 'zod';
import { updateProjectThumbnail as pgUpdateProjectThumbnail } from './server/projectStore.js';
import {
    upsertOAuthUser, mintToken, getBaseUrl,
    googleAuthUrl, exchangeGoogleCode, fetchGoogleProfile,
    microsoftAuthUrl, exchangeMicrosoftCode, fetchMicrosoftProfile,
    callbackHtml,
} from './server/oauthService.js';

// cors and compression are CommonJS packages — load via createRequire for ESM compatibility
const _require = createRequire(import.meta.url);
const cors = _require('cors');
// PERF-FIX-#3: gzip compression — ~79% wire-size reduction on the engine bundle
const compression = _require('compression');
// RENDER-SVC: multer for render PNG upload (memory storage — no disk writes)
const multer = _require('multer');
const renderUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const __dirname = dirname(fileURLToPath(import.meta.url));
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
// CF Worker relay: when CF_WORKER_URL is set the proxy forwards here instead of
// calling api.anthropic.com directly.  The Worker holds the Anthropic key as a
// Cloudflare secret (worker: flat-morning-358d, account: 610ca604a66b6643eea7bea226111f09).
// §07-BIM-SECURITY-CONTRACT §1.4
const CF_WORKER_URL = process.env.CF_WORKER_URL;
const isProd = process.env.npm_lifecycle_event !== 'dev' && existsSync(join(__dirname, 'dist'));
const replitDevDomain = process.env.REPLIT_DEV_DOMAIN;

// ── Anthropic model id (single source of truth) ──────────────────────────────
// Phase 2 of docs/PROJECT-LOAD-PERFORMANCE-13-PHASE-IMPLEMENTATION-PLAN.md (§3
// + §18.2 + §19.2). The legacy id `claude-3-haiku-20240307` was decommissioned
// by Anthropic in April 2025; every Anthropic call from this server must use
// the same model id that the front-end already pins in
// src/ai/FloorPlanAIFactory.ts (L703, L892). Override only via the env var
// when validating a new model in staging — production should use the default.
// W5-a (PRYZM2-FINAL-WIREUP-AUDIT-S71 §4.5): default to the *alias* form
// `claude-haiku-4-5` rather than the dated snapshot, so we automatically
// track Anthropic's latest haiku-4-5 build instead of pinning to a single
// snapshot id that has historically rotated. Override via env when a
// staging shoot-out needs a specific snapshot. The startup ping below
// fails loudly if the resolved id is no longer recognised by the API.
const ANTHROPIC_MODEL_ID = process.env.ANTHROPIC_MODEL_ID || 'claude-haiku-4-5';

// ── Startup diagnostics ──────────────────────────────────────────────────────
if (CF_WORKER_URL) {
    console.log('[server] AI upstream: Cloudflare Worker relay →', CF_WORKER_URL);
} else if (ANTHROPIC_API_KEY) {
    console.log('[server] AI upstream: direct Anthropic (ANTHROPIC_API_KEY set)');
} else {
    console.log('[server] AI upstream: NONE — set CF_WORKER_URL or ANTHROPIC_API_KEY ⚠️');
}
console.log('[server] Anthropic model id:', ANTHROPIC_MODEL_ID);
console.log('[server] Auth: custom JWT/bcrypt (SESSION_SECRET)');
console.log('[server] SUPABASE_URL:', process.env.SUPABASE_URL ? 'FOUND' : 'MISSING (using in-memory store)');
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.warn(
        '\n' +
        '╔══════════════════════════════════════════════════════════════════════════════╗\n' +
        '║  ⚠  SUPABASE_SERVICE_ROLE_KEY IS NOT SET                                   ║\n' +
        '║                                                                              ║\n' +
        '║  All user accounts, projects, and BIM data are being saved to               ║\n' +
        '║  Replit PostgreSQL (temporary fallback) — NOT to Supabase.                  ║\n' +
        '║                                                                              ║\n' +
        '║  To activate Supabase as the sole production database:                      ║\n' +
        '║    1. Go to your Supabase project → Settings → API                          ║\n' +
        '║    2. Copy the "service_role" secret key                                     ║\n' +
        '║    3. Add it to Replit Secrets as  SUPABASE_SERVICE_ROLE_KEY                ║\n' +
        '║    4. Restart the server                                                     ║\n' +
        '╚══════════════════════════════════════════════════════════════════════════════╝\n'
    );
}

// ── W5-a: Startup model-id reachability ping ────────────────────────────────
// PRYZM2-FINAL-WIREUP-AUDIT-S71 §4.5 — every Anthropic call from this
// server uses ANTHROPIC_MODEL_ID. If that id has been retired we want to
// know during startup, not on the first user request. Issue a 1-token
// completion and log success/failure loudly; never throw (we don't want
// the server to refuse to serve UI just because the AI relay is down).
(async () => {
    if (!CF_WORKER_URL && !ANTHROPIC_API_KEY) return;
    const upstream = CF_WORKER_URL
        ? `${CF_WORKER_URL.replace(/\/+$/, '')}/v1/messages`
        : 'https://api.anthropic.com/v1/messages';
    const headers = { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' };
    if (!CF_WORKER_URL && ANTHROPIC_API_KEY) headers['x-api-key'] = ANTHROPIC_API_KEY;
    try {
        const r = await fetch(upstream, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                model: ANTHROPIC_MODEL_ID,
                max_tokens: 1,
                messages: [{ role: 'user', content: 'ping' }],
            }),
        });
        if (r.ok) {
            console.log(`[server] Anthropic ping OK — model "${ANTHROPIC_MODEL_ID}" reachable.`);
        } else {
            const body = await r.text().catch(() => '');
            console.warn(
                `[server] ⚠  Anthropic ping FAILED (HTTP ${r.status}) for model "${ANTHROPIC_MODEL_ID}". ` +
                `AI features will return errors. Body: ${body.slice(0, 240)}`,
            );
        }
    } catch (err) {
        console.warn(
            `[server] ⚠  Anthropic ping NETWORK ERROR for model "${ANTHROPIC_MODEL_ID}": ${String(err)}`,
        );
    }
})();

// ─────────────────────────────────────────────────────────────────────────────
// §B4 (audit) — process-level crash safety.
// Without these, a single async Socket.io handler rejection (e.g. `join-project`
// hitting a transient DB blip) terminates the entire Node process on Node ≥15,
// taking down every user. We log and KEEP RUNNING for unhandledRejection
// (matches Node 14 legacy behaviour — safer for a long-lived BFF); we exit on
// uncaughtException so the orchestrator restarts cleanly.
// ─────────────────────────────────────────────────────────────────────────────
process.on('unhandledRejection', (reason, promise) => {
    console.error('[server] unhandledRejection — keeping process alive:', reason);
    if (promise && typeof promise.catch === 'function') {
        promise.catch(() => { /* drained */ });
    }
});
process.on('uncaughtException', (err, origin) => {
    console.error(`[server] uncaughtException (origin=${origin}) — exiting:`, err);
    // Give logs a tick to flush, then hard-exit so the orchestrator restarts.
    setTimeout(() => process.exit(1), 100).unref?.();
});

// ─────────────────────────────────────────────────────────────────────────────
// §H16 / §B14 (audit) — fail fast on missing critical config in production.
// In dev (`npm run dev`), missing vars degrade gracefully with warnings; in
// production any of these unset means the server is in a broken state that
// silently corrupts auth (SESSION_SECRET) or loses data (no DB). Refuse to
// boot so the orchestrator surfaces the failure instead of running broken.
// ─────────────────────────────────────────────────────────────────────────────
function assertRequiredEnv() {
    if (!isProd) return; // dev: warnings only
    const missing = [];
    if (!process.env.SESSION_SECRET) missing.push('SESSION_SECRET');
    if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
        missing.push('DATABASE_URL or SUPABASE_DB_URL');
    }
    if (missing.length > 0) {
        console.error('[server] FATAL — missing required production env vars:');
        for (const v of missing) console.error('  •', v);
        console.error('[server] Refusing to start. See .env.example for the full list.');
        process.exit(1);
    }
    // Soft warnings (non-fatal but loud) — these degrade specific features.
    const soft = [];
    if (!process.env.ALLOWED_ORIGIN) soft.push('ALLOWED_ORIGIN (CORS will fail closed)');
    if (!process.env.PUBLIC_BASE_URL) soft.push('PUBLIC_BASE_URL (OAuth redirects fragile)');
    if (!process.env.CF_WORKER_URL && !process.env.ANTHROPIC_API_KEY) {
        soft.push('CF_WORKER_URL or ANTHROPIC_API_KEY (AI features disabled)');
    }
    if (soft.length > 0) {
        console.warn('[server] ⚠  Production env vars missing (functionality limited):');
        for (const v of soft) console.warn('  •', v);
    }
}
assertRequiredEnv();

const app = express();
app.disable('x-powered-by');
const httpServer = createServer(app);

// Trust the first proxy (Replit's reverse proxy) so that express-rate-limit
// reads the correct client IP from X-Forwarded-For rather than the proxy IP.
app.set('trust proxy', 1);

// M-SECURITY: Apply security headers to every response (helmet-powered — C08 §4).
// Mounted first — before cors(), compression(), and all route handlers — so that
// every response, including error responses and pre-flight 204s, receives the full
// header set.  See server/securityHeaders.js for the complete header inventory.
// Phase 0 Task 0.1 — DONE.
app.use(helmetMiddleware);

// PERF-FIX-#3: Enable gzip compression for all responses.
// Compresses the 7.1 MB EngineBootstrap bundle to ~1.47 MB on the wire (~79% reduction).
app.use(compression());

// STRIPE-CRITICAL: The webhook route needs the raw Buffer body for signature verification.
// Exclude /api/stripe/webhook + /api/v1/families (POST) from the global JSON
// body parser so their raw / family-pack consumers can read the stream directly.
// All other routes get parsed JSON as normal.
app.use((req, _res, next) => {
    if (req.path === '/api/stripe/webhook') return next();
    if (req.path.startsWith('/api/v1/families')) return next();
    return express.json({ limit: '50mb' })(req, _res, next);
});

// M-CORS: Apply CORS policy to all routes.
// Origin allowlist is read from ALLOWED_ORIGIN env var; defaults to '*' in dev.
app.use(cors(expressCorsOptions()));
app.options('*', cors(expressCorsOptions())); // pre-flight for all routes

// ── H1: Global rate limiter — applied to all /api/* routes ───────────────────
app.use('/api', globalLimiter);

// ── Phase E-1: Public Read-Only REST API ──────────────────────────────────────
// Endpoints: GET /api/v1/projects/:id/{model,rooms,graph,compliance,programme,hierarchy,schedules/:type}
// Auth:      Same JWT as main app (authMiddleware is applied inside v1Router via requireSnapshot).
// Rate:      apiLimiter (60 req/min per IP) in addition to globalLimiter above.
// Contract:  PRYZM_MASTER_ROADMAP_2026 §E-2 read endpoints; 07-BIM-SECURITY-CONTRACT §1
// FAMILY-MARKETPLACE (S59) — mount BEFORE the generic v1Router so the raw-body
// router takes precedence over the JSON-body router for /api/v1/families/*.
// §B3 (audit) — family marketplace publish (POST /api/v1/families) had NO
// auth: anyone on the public internet could publish .pryzm-family packages
// that the EICAR-stub virus scanner would happily forward. authMiddleware is
// fail-open, so it identifies the caller and `req.auth.userId` is available;
// the router's POST handlers must reject `'anonymous'` themselves. (The GET /
// catalog and GET /:id/download routes remain accessible to anonymous readers
// — same model as the public `/marketplace` browse pages.)
app.use(
    '/api/v1/families',
    apiLimiter,
    authMiddleware,
    buildFamilyMarketplaceRouter({
        publicBaseUrl: process.env.PUBLIC_BASE_URL ?? '',
    }),
);
// W3 (PRYZM2-FINAL-WIREUP-AUDIT-S71 §4.3): apply authMiddleware here so
// every v1 route has `req.auth` populated. Without this, anonymous
// callers reach the route handlers with `req.auth === undefined` and the
// `if (!userId)` guard returns 401 even when a Bearer token was sent.
app.use('/api/v1', apiLimiter, authMiddleware, v1Router);

// ── PUBLIC AI API (S53 D10 draft) ────────────────────────────────────────────
// 4 endpoints + status under /v1/ai/* (no /api prefix per spec line 519-522).
// Bearer-token auth via authMiddleware; per-route 10 req/min rate limit;
// per-call cost ceilings; ai_usage row per call.
//
// Per S53 D10 + Risk-register R3A-08 the OAuth2 grant flow is explicitly
// deferred to S65; the Bearer/PAT path is the 3A-draft contract.
app.use('/v1/ai', authMiddleware, buildAiPublicApiRouter());

// ── AI Spend dashboard summary endpoint ──────────────────────────────────────
// Backs /admin/ai-spend.html.  Aggregates ai_usage rows for the current
// month (or `monthsBack` parameter) into per-project / per-workflow /
// top-surface tables.
app.get('/api/ai/spend/summary', authMiddleware, async (req, res) => {
    if (!req.auth?.userId || req.auth.userId === 'anonymous') {
        return res.status(401).json({ error: 'AI Spend dashboard requires authentication' });
    }
    try {
        const projectId = typeof req.query.projectId === 'string' && req.query.projectId.length > 0
            ? req.query.projectId : null;
        const monthsBack = Math.max(0, Math.min(24, parseInt(String(req.query.monthsBack ?? '0'), 10) || 0));
        const summary = await getSpendSummary({ projectId, monthsBack });
        res.json(summary);
    } catch (err) {
        console.error('[ai/spend/summary] error:', err);
        res.status(500).json({ error: 'Failed to load spend summary', detail: err.message });
    }
});

// ── Socket.io (Phase 6 — Real-Time Collaboration) ────────────────────────────
let io = null;
try {
    const { Server } = await import('socket.io');
    // H4: maxHttpBufferSize prevents oversized payload attacks (1 MB hard cap)
    // M-CORS: origin is now controlled by corsPolicy.js (ALLOWED_ORIGIN env var)
    io = new Server(httpServer, {
        cors: socketCorsOptions(),
        transports: ['websocket', 'polling'],
        maxHttpBufferSize: 1e6,
    });

    // ── H3: Socket.io JWT verification helper ─────────────────────────────────
    // Extracts and verifies the custom JWT (SESSION_SECRET / bcrypt auth) from
    // socket.handshake.auth.token. Falls back to 'anonymous' when no token is
    // present or verification fails.
    function resolveSocketUserId(socket) {
        const token = socket.handshake.auth?.token;
        if (!token) return 'anonymous';
        try {
            const payload = authVerifyToken(token);
            return (payload && payload.sub) ? payload.sub : 'anonymous';
        } catch (err) {
            console.warn(`[socket.io] Token verification failed for ${socket.id}:`, err.message);
            return 'anonymous';
        }
    }

    // ── H4: command-executed payload schema validator ─────────────────────────
    function isValidCommandPayload(data) {
        if (typeof data !== 'object' || data === null) return false;
        if (typeof data.projectId !== 'string' || !data.projectId) return false;
        if (typeof data.commandType !== 'string') return false;
        return true;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // §B2 (audit) — Cross-tenant data-injection guard.
    // `join-project` enforces canUserAccessProject and is the only gate that
    // joins the socket to `project:${projectId}`. Every OTHER mutating socket
    // event must verify this socket actually JOINED the requested project room
    // before broadcasting or persisting — otherwise an authenticated (or
    // anonymous) socket can inject forged commands/cursors/comments into any
    // other tenant's project room using a client-supplied projectId.
    // ─────────────────────────────────────────────────────────────────────────
    function _socketInProjectRoom(socket, projectId) {
        if (typeof projectId !== 'string' || !projectId) return false;
        return socket.rooms.has(`project:${projectId}`);
    }

    io.on('connection', (socket) => {
        // H3: Resolve user identity once on connection
        const resolvedUserId = resolveSocketUserId(socket);
        socket.data.userId = resolvedUserId;
        socket.data.displayName = undefined; // resolved async below
        console.log(`[socket.io] Client connected: ${socket.id} — userId: ${resolvedUserId}`);

        // §50 CP-1: resolve display name asynchronously; enriches cursor/presence relays
        _resolveDisplayName(resolvedUserId).then(name => {
            socket.data.displayName = name;
        }).catch(() => {
            socket.data.displayName = resolvedUserId.slice(0, 8);
        });

        socket.on('join-project', async (projectId) => {
            // H3: Validate projectId is a non-empty string before joining
            if (typeof projectId !== 'string' || !projectId.trim()) {
                console.warn(`[socket.io] Invalid projectId from ${socket.id} — join rejected`);
                return;
            }

            // H7-FIX (07-BIM-SECURITY-CONTRACT §7): Verify the connecting user owns
            // (or has access to) the requested project before allowing socket.join().
            // Anonymous users are always rejected. When Supabase is not configured
            // the in-memory store is used as fallback.
            const supabase = await getSupabaseClient().catch(() => null);
            const access = await canUserAccessProject(
                socket.data.userId,
                projectId,
                { supabase, pgPool: getPgPool(), projectsMap: _projects }
            );

            if (!access.allowed) {
                console.warn(
                    `[socket.io] join-project DENIED — socket: ${socket.id}` +
                    ` userId: ${socket.data.userId} projectId: ${projectId}` +
                    ` reason: ${access.reason}`
                );
                socket.emit('join-project-denied', { projectId, reason: access.reason });
                return;
            }

            socket.join(`project:${projectId}`);
            console.log(`[socket.io] ${socket.id} (${socket.data.userId}) joined project:${projectId}`);
            socket.to(`project:${projectId}`).emit('user-joined', {
                userId:      socket.data.userId,
                displayName: socket.data.displayName,
            });
        });

        socket.on('leave-project', (projectId) => {
            if (typeof projectId !== 'string') return;
            socket.leave(`project:${projectId}`);
            socket.to(`project:${projectId}`).emit('user-left', { userId: socket.data.userId });
        });

        socket.on('command-executed', async (data) => {
            // H4: Validate payload schema before rebroadcast — reject malformed messages
            if (!isValidCommandPayload(data)) {
                console.warn(`[socket.io] Rejected invalid command-executed payload from ${socket.id}`);
                return;
            }

            // §B2 (audit) — must have joined the room first via authorized join-project.
            if (!_socketInProjectRoom(socket, data.projectId)) {
                console.warn(`[socket.io] command-executed from ${socket.id} (${socket.data.userId}) for unjoined project ${data.projectId} — rejected (§B2)`);
                return;
            }

            // §30-REAL-TIME-COLLABORATION: persist command to log for catch-up.
            // Non-blocking — broadcast is not delayed by DB write.
            // PERF-FIX (Apr 2026): Prefer Supabase REST (works on Replit's IPv4-
            // only network). pgPool falls back only if REST is unavailable.
            const logId = `pcl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
            (async () => {
                const sb = await getSupabaseClient().catch(() => null);
                if (sb) {
                    const { error } = await sb.from('project_command_log').insert({
                        id:           logId,
                        project_id:   data.projectId,
                        user_id:      socket.data.userId,
                        command_type: data.commandType,
                        payload:      data.payload ?? {},
                    });
                    if (error && error.code !== '42P01' && !/does not exist/i.test(error.message || '')) {
                        console.warn(`[socket.io] Command log insert (REST) failed (non-fatal): ${error.message}`);
                    }
                    return;
                }
                pgQuery(
                    `INSERT INTO project_command_log (id, project_id, user_id, command_type, payload, created_at)
                     VALUES ($1, $2, $3, $4, $5, NOW())`,
                    [logId, data.projectId, socket.data.userId, data.commandType, JSON.stringify(data.payload ?? {})]
                ).catch(err => {
                    console.warn(`[socket.io] Command log insert (pg) failed (non-fatal): ${err.message}`);
                });
            })();

            // Probabilistic retention cleanup: purge commands >24 h old for this
            // project, ~2% of inserts (keeps p99 table size bounded without a cron).
            if (Math.random() < 0.02) {
                (async () => {
                    const sb = await getSupabaseClient().catch(() => null);
                    if (sb) {
                        const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                        await sb.from('project_command_log')
                            .delete()
                            .eq('project_id', data.projectId)
                            .lt('created_at', cutoff)
                            .then(() => {}, () => {});
                        return;
                    }
                    pgQuery(
                        `DELETE FROM project_command_log
                         WHERE project_id = $1 AND created_at < NOW() - INTERVAL '24 hours'`,
                        [data.projectId]
                    ).catch(() => { /* non-fatal */ });
                })();
            }

            // Broadcast full payload (including serialized command) to room peers
            socket.to(`project:${data.projectId}`).emit('remote-command', { ...data, userId: socket.data.userId });
        });

        socket.on('vi:intent-updated', (data) => {
            if (typeof data !== 'object' || data === null || typeof data.projectId !== 'string' || typeof data.intentId !== 'string') return;
            if (!_socketInProjectRoom(socket, data.projectId)) return; // §B2
            socket.to(`project:${data.projectId}`).emit('vi:intent-updated', { ...data, userId: socket.data.userId });
        });

        socket.on('vi:override-set', (data) => {
            if (typeof data !== 'object' || data === null || typeof data.projectId !== 'string' || typeof data.viewId !== 'string') return;
            if (!_socketInProjectRoom(socket, data.projectId)) return; // §B2
            socket.to(`project:${data.projectId}`).emit('vi:override-set', { ...data, userId: socket.data.userId });
        });

        // Stage S8 — broadcast view-intent instance + override-cleared events.
        socket.on('vi:instance-updated', (data) => {
            if (typeof data !== 'object' || data === null || typeof data.projectId !== 'string' || typeof data.viewId !== 'string') return;
            if (!_socketInProjectRoom(socket, data.projectId)) return; // §B2
            socket.to(`project:${data.projectId}`).emit('vi:instance-updated', { ...data, userId: socket.data.userId });
        });
        socket.on('vi:overrides-cleared', (data) => {
            if (typeof data !== 'object' || data === null || typeof data.projectId !== 'string' || typeof data.viewId !== 'string') return;
            if (!_socketInProjectRoom(socket, data.projectId)) return; // §B2
            socket.to(`project:${data.projectId}`).emit('vi:overrides-cleared', { ...data, userId: socket.data.userId });
        });

        socket.on('cursor-move', (data) => {
            if (typeof data !== 'object' || data === null || typeof data.projectId !== 'string') return;
            if (!_socketInProjectRoom(socket, data.projectId)) return; // §B2
            // §50 CP-1: enrich with server-authoritative displayName (never trust client claim)
            socket.to(`project:${data.projectId}`).emit('remote-cursor', {
                userId:      socket.data.userId,
                displayName: socket.data.displayName,
                ...data,
            });
        });

        // ── Phase SC-8: Sheet comment events ──────────────────────────────────
        socket.on('sheet-comment-add', (data) => {
            if (typeof data !== 'object' || data === null || typeof data.projectId !== 'string') return;
            if (typeof data.sheetId !== 'string' || typeof data.comment !== 'object') return;
            if (!_socketInProjectRoom(socket, data.projectId)) return; // §B2
            socket.to(`project:${data.projectId}`).emit('remote-sheet-comment-add', {
                userId: socket.data.userId,
                sheetId: data.sheetId,
                comment: data.comment,
            });
        });

        socket.on('sheet-comment-resolve', (data) => {
            if (typeof data !== 'object' || data === null || typeof data.projectId !== 'string') return;
            if (typeof data.sheetId !== 'string' || typeof data.commentId !== 'string') return;
            if (!_socketInProjectRoom(socket, data.projectId)) return; // §B2
            socket.to(`project:${data.projectId}`).emit('remote-sheet-comment-resolve', {
                userId:    socket.data.userId,
                sheetId:   data.sheetId,
                commentId: data.commentId,
            });
        });

        socket.on('disconnect', () => {
            console.log(`[socket.io] Client disconnected: ${socket.id} (${socket.data.userId})`);
        });
    });

    console.log('[server] Socket.io initialized');
} catch (err) {
    console.warn('[server] Socket.io unavailable:', err.message);
}

// ── Auth middleware — custom SESSION_SECRET JWT (bcrypt/authStore auth) ───────
// Priority order:
//   1. Bearer token present → verify via SESSION_SECRET JWT (authStore.verifyToken)
//   2. No token → anonymous fallback
// In-memory userId → email cache to avoid repeated Supabase queries when
// the JWT was issued without an email claim (backwards-compat for old tokens).
const _userEmailCache = new Map(); // Map<userId, email>

// ── §50 — display-name cache (server-authoritative, injected into cursor relays) ─
// Map<userId, displayName> — populated once per userId, never expires.
// Keeps displayName off the client wire; the server resolves from pryzm_users.
const _displayNameCache = new Map(); // Map<userId, string>

async function _resolveDisplayName(userId) {
    if (!userId || userId === 'anonymous') return 'Anonymous';
    if (_displayNameCache.has(userId)) return _displayNameCache.get(userId);
    try {
        const { getUserById } = await import('./server/authStore.js');
        const user = await getUserById(userId);
        if (user?.name?.trim()) {
            const name = user.name.trim().slice(0, 64);
            _displayNameCache.set(userId, name);
            return name;
        }
        if (user?.email) {
            const prefix = user.email.split('@')[0].slice(0, 32);
            _displayNameCache.set(userId, prefix);
            return prefix;
        }
    } catch { /* non-fatal — fall through */ }
    const fallback = userId.slice(0, 8);
    _displayNameCache.set(userId, fallback);
    return fallback;
}

async function _resolveEmailForUserId(userId) {
    if (_userEmailCache.has(userId)) return _userEmailCache.get(userId);
    try {
        const sb = await getSupabaseClient();
        if (sb) {
            const { data } = await sb.from('pryzm_users').select('email').eq('id', userId).maybeSingle();
            if (data?.email) {
                _userEmailCache.set(userId, data.email);
                return data.email;
            }
        }
    } catch { /* ignore — email lookup is best-effort */ }
    return null;
}

async function authMiddleware(req, _res, next) {
    const authHeader = req.headers.authorization;

    // ── Path 1: Our SESSION_SECRET JWT ───────────────────────────────────────
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = authVerifyToken(token);
        if (payload && payload.sub) {
            // Resolve email: prefer JWT claim, fall back to DB lookup for old tokens
            // that were issued before the email claim was added to the JWT payload.
            let email = payload.email ?? null;
            if (!email) {
                email = await _resolveEmailForUserId(payload.sub);
            }
            req.auth = { userId: payload.sub, sessionId: null, email };
            await maybeAutoGrantOwner(payload.sub, email);
            return next();
        }
        // Token present but invalid — treat as anonymous
        req.auth = { userId: 'anonymous', sessionId: null, email: null };
        return next();
    }

    // ── Path 2: No token → anonymous ─────────────────────────────────────────
    req.auth = { userId: 'anonymous', sessionId: null };
    return next();
}

// ── In-memory project/version store (fallback when Supabase not configured) ──
// getSupabaseClient() is imported from server/supabaseClient.js (M-SUPABASE-KEY fix):
// it prefers SUPABASE_SERVICE_ROLE_KEY over SUPABASE_ANON_KEY.
const _projects = new Map();
const _versions = new Map();
const _visibilityIntents = new Map();

// ── HTTP project-access helper ───────────────────────────────────────────────
// PERF-FIX (Apr 2026): canUserAccessProject() requires a runtime context with
// {supabase, pgPool, projectsMap}. Previously HTTP handlers called it with
// only (userId, projectId), which threw inside the destructure → returned
// {allowed:false, reason:'internal error'}. This caused every IFC request to
// 403 and every Socket.io catch-up to 500 even for the legitimate owner.
// This helper supplies the context once for all HTTP routes.
async function _httpCanAccess(userId, projectId) {
    if (!userId || userId === 'anonymous') return false;
    try {
        const supabase = await getSupabaseClient().catch(() => null);
        const access = await canUserAccessProject(userId, projectId, {
            supabase,
            pgPool: getPgPool(),
            projectsMap: _projects,
        });
        return access.allowed;
    } catch (err) {
        console.warn('[httpCanAccess] check failed:', err.message);
        return false;
    }
}

// ── Anthropic proxy ──────────────────────────────────────────────────────────
// authMiddleware is required: anonymous callers without a valid session are
// still accepted (no token → anonymous), but the userId is always resolved
// before reaching the Anthropic API call so that server-side quota tracking
// (§6) can identify the caller.
// §B1 (audit) — clamp every AI request to a safe, server-controlled shape.
// Prevents the open-cost class of attack: anonymous IP-rotating callers can no
// longer drain the Anthropic budget, and authenticated callers cannot pick a
// premium model or set max_tokens=200000 to inflict $$$ per call.
const MAX_AI_TOKENS = 4096;
const MAX_AI_BODY_BYTES = 256 * 1024; // 256 KB upper bound on prompt payload
function sanitizeAiBody(body) {
    if (!body || typeof body !== 'object') {
        return { ok: false, reason: 'body must be a JSON object' };
    }
    // Hard byte cap (rough — JSON re-stringify) so a malicious 50MB prompt
    // can't slip through the global 50MB JSON parser.
    let approxBytes = 0;
    try { approxBytes = Buffer.byteLength(JSON.stringify(body), 'utf8'); }
    catch { return { ok: false, reason: 'body not serializable' }; }
    if (approxBytes > MAX_AI_BODY_BYTES) {
        return { ok: false, reason: `body too large (${approxBytes} > ${MAX_AI_BODY_BYTES} bytes)` };
    }
    // Server forces model — clients cannot pick a premium snapshot.
    const clamped = { ...body, model: ANTHROPIC_MODEL_ID };
    // Clamp max_tokens to a sane ceiling (default 1024 if missing).
    const requested = Number.isFinite(clamped.max_tokens) ? Math.floor(clamped.max_tokens) : 1024;
    clamped.max_tokens = Math.max(1, Math.min(requested, MAX_AI_TOKENS));
    return { ok: true, body: clamped };
}

app.post('/api/anthropic/v1/messages', aiLimiter, authMiddleware, async (req, res) => {
    const callerId = req.auth?.userId ?? 'anonymous';

    // §B1 (audit) — require auth on AI routes. Anonymous IP-rotating callers
    // previously got an unlimited budget gated only by per-IP rate limits.
    if (callerId === 'anonymous') {
        return res.status(401).json({ error: 'AI proxy requires authentication.' });
    }
    console.log(`[proxy] Request received — caller: ${callerId}`);

    // §1.4: CF_WORKER_URL takes priority; ANTHROPIC_API_KEY is the legacy fallback.
    if (!CF_WORKER_URL && !ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'No AI upstream configured: set CF_WORKER_URL or ANTHROPIC_API_KEY' });
    }

    // §B1 (audit) — sanitize body: force model, clamp max_tokens, byte cap.
    const sanitized = sanitizeAiBody(req.body);
    if (!sanitized.ok) {
        console.warn(`[proxy] Body rejected — caller: ${callerId} reason: ${sanitized.reason}`);
        return res.status(400).json({ error: `Invalid AI request: ${sanitized.reason}` });
    }
    const safeBody = sanitized.body;

    // ── C4: Server-side quota enforcement ─────────────────────────────────────
    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        console.warn(`[proxy] Quota exceeded — caller: ${callerId} plan: ${quota.plan} limit: ${quota.limit}`);
        return res.status(429).json({
            error: 'AI quota exceeded for current billing period.',
            plan: quota.plan,
            limit: quota.limit,
            remaining: 0,
        });
    }
    console.log(`[proxy] Quota OK — caller: ${callerId} plan: ${quota.plan} remaining: ${quota.remaining}`);

    try {
        let response;
        if (CF_WORKER_URL) {
            console.log(`[proxy] Routing via CF Worker: ${CF_WORKER_URL}`);
            response = await fetch(CF_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(safeBody),
            });
        } else {
            console.log('[proxy] Routing direct → api.anthropic.com');
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify(safeBody),
            });
        }
        const data = await response.json();
        if (!response.ok) {
            console.error('[proxy] Anthropic error:', JSON.stringify(data));
        } else {
            const usage = data.usage ?? {};
            console.log(
                `[proxy] Token usage — caller: ${callerId}` +
                ` input: ${usage.input_tokens ?? '?'}` +
                ` output: ${usage.output_tokens ?? '?'}` +
                ` model: ${data.model ?? safeBody.model ?? '?'}`
            );
        }
        res.status(response.status).json(data);
    } catch (err) {
        console.error('[proxy] Fetch error:', err);
        // §H8 (audit) — never leak internal error text to the client.
        res.status(500).json({ error: 'AI upstream request failed.' });
    }
});

// ── Phase I: Generative Design AI endpoints ───────────────────────────────────
//
// /api/ai/brief/parse   — parse a plain-English design brief into a
//                         structured GenerativeDesignBrief object.
// /api/ai/generative/advise — suggest constraint fixes when layout generation
//                             fails (bounding box too small, conflicts, etc.)
//
// Both routes use the same CF_WORKER_URL / ANTHROPIC_API_KEY relay as the
// main /api/anthropic/v1/messages proxy. All Anthropic calls are server-side.

app.post('/api/ai/brief/parse', aiLimiter, authMiddleware, async (req, res) => {
    const { briefText, templateOptions = [] } = req.body ?? {};
    if (!briefText || typeof briefText !== 'string') {
        return res.status(400).json({ error: 'briefText is required' });
    }

    if (!CF_WORKER_URL && !ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'No AI upstream configured' });
    }

    const callerId = req.auth?.userId ?? 'anonymous';
    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        return res.status(429).json({ error: 'AI quota exceeded', plan: quota.plan, limit: quota.limit });
    }

    const systemPrompt = `You are a BIM (Building Information Modelling) data assistant. Parse the user's plain-English design brief and return a JSON object matching this TypeScript interface exactly:

interface GenerativeDesignBrief {
  rooms: Array<{
    roomType: string;
    count: number;
    minArea_m2: number;
    maxArea_m2?: number;
    adjacencyRequirements: string[];
    circulationRequired: boolean;
    templateId?: string;
  }>;
  boundingBox: { width_m: number; depth_m: number };
  templateSetId: string;
  gridSize_m: number;
  targetGIA_m2: number;
  maxVariants: number;
}

Rules:
- Infer reasonable minArea_m2 values from NHS HTM, UK Building Regulations, and standard practice.
- adjacencyRequirements lists room TYPE NAMES (not IDs) of rooms that must be spatially adjacent.
- templateSetId should be "NHS HTM 04-01" for healthcare, "UK-RES-2024" for residential, or best match.
- gridSize_m = 1.0 always.
- maxVariants = 10 always.
- targetGIA_m2 = sum of all room minArea_m2 × count × 1.25 (adds 25% for circulation).
- Estimate boundingBox as a rectangle that can plausibly fit all rooms with 20% margin.
- Return ONLY valid JSON, no markdown, no explanation.

Available template options: ${JSON.stringify(templateOptions)}`;

    const payload = {
        model: ANTHROPIC_MODEL_ID,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: briefText }],
    };

    try {
        let response;
        if (CF_WORKER_URL) {
            response = await fetch(CF_WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify(payload),
            });
        }
        const data = await response.json();
        if (!response.ok) {
            console.error('[brief/parse] Anthropic error:', JSON.stringify(data));
            return res.status(response.status).json(data);
        }
        const rawText = data?.content?.[0]?.text ?? '';
        console.log(`[brief/parse] caller: ${callerId} tokens: ${data.usage?.input_tokens}+${data.usage?.output_tokens}`);
        // Try to parse JSON from the response text
        try {
            const parsed = JSON.parse(rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
            return res.json({ brief: parsed, rawText });
        } catch {
            return res.json({ brief: null, rawText, error: 'Claude did not return valid JSON — review rawText' });
        }
    } catch (err) {
        console.error('[brief/parse] Fetch error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

app.post('/api/ai/generative/advise', aiLimiter, authMiddleware, async (req, res) => {
    const { brief, violations = [] } = req.body ?? {};
    if (!brief) {
        return res.status(400).json({ error: 'brief is required' });
    }

    if (!CF_WORKER_URL && !ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'No AI upstream configured' });
    }

    const callerId = req.auth?.userId ?? 'anonymous';
    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        return res.status(429).json({ error: 'AI quota exceeded', plan: quota.plan, limit: quota.limit });
    }

    const systemPrompt = `You are a BIM design consultant. The user's generative layout algorithm failed to produce a compliant layout. Your job is to provide 2–4 specific, actionable suggestions to fix the brief.

Each suggestion should be on its own line and be concise (one sentence). Focus on:
- Whether the bounding box is too small (suggest specific dimensions like "25m × 40m")
- Whether adjacency requirements conflict or are impossible
- Whether the programme is too dense for the available area
- Whether a different layout topology (hub-and-spoke, linear, courtyard) would help

Do not explain what went wrong in detail — just give actionable fixes. Keep each suggestion under 120 characters.`;

    const userContent = `Brief: ${JSON.stringify(brief, null, 2)}\n\nViolations: ${violations.join('\n')}`;

    const payload = {
        model: ANTHROPIC_MODEL_ID,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
    };

    try {
        let response;
        if (CF_WORKER_URL) {
            response = await fetch(CF_WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify(payload),
            });
        }
        const data = await response.json();
        if (!response.ok) {
            console.error('[generative/advise] Anthropic error:', JSON.stringify(data));
            return res.status(response.status).json(data);
        }
        const rawText = data?.content?.[0]?.text ?? '';
        console.log(`[generative/advise] caller: ${callerId} tokens: ${data.usage?.input_tokens}+${data.usage?.output_tokens}`);
        return res.json({ rawText });
    } catch (err) {
        console.error('[generative/advise] Fetch error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * POST /api/ai/compliance/advise
 * Gap 4 (Phase 4.3) — AI Compliance Advisor
 *
 * Body: { failures: ValidationResult[], complianceContext?: ComplianceContext }
 * Returns: { rawText: string }
 *
 * Sends current constraint failures + WorldModelContext to Claude and returns
 * specific element IDs, regulation references, and alternative design solutions.
 * All suggested actions are expressed as PRYZM commands (never direct store writes).
 */
app.post('/api/ai/compliance/advise', aiLimiter, authMiddleware, async (req, res) => {
    const { failures = [], complianceContext = null } = req.body ?? {};
    if (!Array.isArray(failures) || failures.length === 0) {
        return res.status(400).json({ error: 'failures array is required and must not be empty' });
    }

    if (!CF_WORKER_URL && !ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'No AI upstream configured: set CF_WORKER_URL or ANTHROPIC_API_KEY' });
    }

    const callerId = req.auth?.userId ?? 'anonymous';
    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        return res.status(429).json({ error: 'AI quota exceeded', plan: quota.plan, limit: quota.limit });
    }

    const systemPrompt = `You are an expert BIM compliance consultant using the PRYZM platform.
The user has run a compliance check and received the violations listed below.
Your job is to provide specific, actionable remediation advice for each violation.

For each failure:
1. Reference the specific element ID and rule violated
2. Cite the relevant regulation (e.g. HTM 04-01, BB98, Building Regs Part M)
3. Give a concrete fix — e.g. "Increase room area by 0.3 m²", "Add a window to the north wall", "Replace door WA003-DO001 with a 900mm clear-opening leaf"
4. Where possible, express the fix as a PRYZM command the user can execute

Keep each item concise (2–3 sentences max). Group by severity: errors first, then warnings.
Do not repeat information already in the violation message — add value with context and solutions.`;

    const failureLines = failures
        .slice(0, 30)
        .map(f => `[${(f.severity ?? 'warning').toUpperCase()}] Rule: ${f.ruleId} | Element: ${f.elementType} (${f.elementId}) | ${f.message}${f.regulation ? ` | Regulation: ${f.regulation}` : ''}`)
        .join('\n');

    const contextSummary = complianceContext
        ? `\n\nCompliance context: ${complianceContext.violations?.length ?? 0} errors, ${complianceContext.warnings?.length ?? 0} warnings across ${complianceContext.totalElements ?? 0} elements (pass rate: ${Math.round((complianceContext.passRate ?? 1) * 100)}%).`
        : '';

    const userContent = `Current compliance failures:${contextSummary}\n\n${failureLines}`;

    const payload = {
        model: ANTHROPIC_MODEL_ID,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
    };

    try {
        let response;
        if (CF_WORKER_URL) {
            response = await fetch(CF_WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify(payload),
            });
        }
        const data = await response.json();
        if (!response.ok) {
            console.error('[compliance/advise] Anthropic error:', JSON.stringify(data));
            return res.status(response.status).json(data);
        }
        const rawText = data?.content?.[0]?.text ?? '';
        console.log(`[compliance/advise] caller: ${callerId} tokens: ${data.usage?.input_tokens}+${data.usage?.output_tokens}`);
        return res.json({ rawText });
    } catch (err) {
        console.error('[compliance/advise] Fetch error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * POST /api/ai/portfolio/query
 * Phase J-4 (D-4 NL Query Interface — Portfolio mode)
 *
 * Body: { query: string, context?: object }
 * Accepts a natural-language question about the portfolio benchmark dataset and
 * returns a narrative AI response grounded in the anonymised benchmark data.
 *
 * Privacy: only anonymised aggregate statistics (medians, percentiles, sample
 * sizes) are injected into the prompt — no raw project IDs or room names.
 */
app.post('/api/ai/portfolio/query', aiLimiter, authMiddleware, async (req, res) => {
    const { query, context = {} } = req.body ?? {};
    if (!query || typeof query !== 'string') {
        return res.status(400).json({ error: 'query (string) is required' });
    }

    if (!CF_WORKER_URL && !ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'No AI upstream configured' });
    }

    const callerId = req.auth?.userId ?? 'anonymous';
    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        return res.status(429).json({ error: 'AI quota exceeded', plan: quota.plan, limit: quota.limit });
    }

    // Load benchmark data to inject into prompt
    let benchmarkContext = '';
    try {
        const { getAllBenchmarks } = await import('./portfolio/portfolioGraphService.js');
        const pool = getPgPool?.() ?? null;
        const benchmarks = await getAllBenchmarks(pool);
        // Summarise the first 20 benchmarks as compact JSON for the prompt
        const summary = benchmarks.slice(0, 20).map(b => ({
            type: `${b.buildingType}:${b.roomType}`,
            n: b.sampleSize,
            areaMedian: b.area_m2?.median,
            compliancePass: b.compliancePassRate != null ? Math.round(b.compliancePassRate * 100) + '%' : undefined,
            synthetic: b.synthetic,
        }));
        benchmarkContext = JSON.stringify(summary, null, 2);
    } catch {
        benchmarkContext = '(benchmark data unavailable)';
    }

    const systemPrompt = `You are PRYZM Portfolio Intelligence, an AI assistant that helps architects and BIM managers understand anonymised cross-project benchmark data for building performance and room sizing.

You have access to the following anonymised portfolio benchmark dataset (synthetic data seeded from NHS HTM, NDSS, BB98, and Building Regulations unless synthetic:false):

${benchmarkContext}

Guidelines:
- Ground your answers in the benchmark data above
- State clearly when data is synthetic vs real (look at the synthetic flag)
- Highlight percentile context (e.g. "your 14.2m² is at the 50th percentile for hospital patient bedrooms")
- Be concise — 3–6 sentences per answer
- Never reveal project-identifying information; the data is always anonymised aggregates
- If the question cannot be answered from the benchmark data, say so clearly`;

    const payload = {
        model: ANTHROPIC_MODEL_ID,
        max_tokens: 600,
        system: systemPrompt,
        messages: [{ role: 'user', content: query }],
    };

    try {
        let response;
        if (CF_WORKER_URL) {
            response = await fetch(CF_WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify(payload),
            });
        }
        const data = await response.json();
        if (!response.ok) {
            console.error('[ai/portfolio/query] Anthropic error:', JSON.stringify(data));
            return res.status(response.status).json(data);
        }
        const text = data?.content?.[0]?.text ?? '';
        console.log(`[ai/portfolio/query] caller: ${callerId} tokens: ${data.usage?.input_tokens}+${data.usage?.output_tokens}`);
        return res.json({ text });
    } catch (err) {
        console.error('[ai/portfolio/query] Fetch error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * POST /api/ai/voice/parse
 * Phase K-1 — Voice-Spatial Command Interface
 *
 * Body: { command: string, context: string, selection: string[] }
 *
 * Claude resolves spatial references (this floor, adjacent rooms, all [type] rooms)
 * using the worldModel context and returns a structured intent.
 *
 * Returns: { intent, targets, parameters, confirmationText, clarification? }
 *
 * Safety: this route NEVER executes anything — it only parses and returns
 * the intent for client-side confirmation before execution.
 */
app.post('/api/ai/voice/parse', aiLimiter, authMiddleware, async (req, res) => {
    const { command, context = '', selection = [] } = req.body ?? {};
    if (!command || typeof command !== 'string') {
        return res.status(400).json({ error: 'command (string) is required' });
    }

    if (!CF_WORKER_URL && !ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'No AI upstream configured' });
    }

    const callerId = req.auth?.userId ?? 'anonymous';
    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        return res.status(429).json({ error: 'AI quota exceeded', plan: quota.plan, limit: quota.limit });
    }

    const systemPrompt = `You are PRYZM Voice Command Parser. Your job is to parse a natural-language BIM design command into a structured intent.

Current project context (WorldModel snapshot):
${context ? context.slice(0, 3000) : '(no context provided)'}

Currently selected elements: ${Array.isArray(selection) && selection.length > 0 ? selection.join(', ') : 'none'}

Spatial reference resolution rules:
- "this floor" / "current floor" → use the active level from context (activeLevel field)
- "adjacent rooms" → rooms connected via adjacentTo semantic relationships from selected element
- "all [type] rooms" → all rooms where occupancyType matches [type]
- "selected" / "this room" → use the selection array provided

Return ONLY valid JSON matching this schema (no markdown, no explanation):
{
  "intent": "set-property" | "assign-template" | "spatial-query" | "navigate-to" | "clarify",
  "targets": ["elementId1", "elementId2"],
  "parameters": { "area": 14.0, "occupancyType": "patient-room", "name": "...", "templateCode": "..." },
  "confirmationText": "Human-readable description of what will happen. Be specific: mention count, floor, type.",
  "clarification": "Question to ask user (only when intent=clarify)"
}

For set-property: include "area" (number m²), "occupancyType" (string), or "name" (string) in parameters.
For assign-template: include "templateCode" in parameters.
For spatial-query / navigate-to: targets = resolved element IDs (if known) or empty array.
For clarify: targets = [], parameters = {}, clarification = your question.

Always prefer being specific about element counts and locations in confirmationText.
If you cannot resolve spatial references from the context, use intent="clarify".`;

    const payload = {
        model: ANTHROPIC_MODEL_ID,
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: command }],
    };

    try {
        let response;
        if (CF_WORKER_URL) {
            response = await fetch(CF_WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify(payload),
            });
        }
        const data = await response.json();
        if (!response.ok) {
            console.error('[ai/voice/parse] Anthropic error:', JSON.stringify(data));
            return res.status(response.status).json(data);
        }

        const rawText = data?.content?.[0]?.text ?? '{}';
        console.log(`[ai/voice/parse] caller:${callerId} tokens:${data.usage?.input_tokens}+${data.usage?.output_tokens}`);

        // Parse JSON from Claude response
        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return res.status(422).json({ error: 'Could not parse AI response', raw: rawText.slice(0, 200) });
        }

        const parsed = JSON.parse(jsonMatch[0]);
        // Ensure required fields
        parsed.intent           = parsed.intent ?? 'clarify';
        parsed.targets          = Array.isArray(parsed.targets) ? parsed.targets : [];
        parsed.parameters       = parsed.parameters ?? {};
        parsed.confirmationText = parsed.confirmationText ?? command;
        return res.json(parsed);
    } catch (err) {
        console.error('[ai/voice/parse] Error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * POST /api/ai/ambient/analyse
 * Phase K-3 — Ambient Intelligence System
 *
 * Body: { context: string, recentCommands: string[], constraints: object[] }
 *
 * Claude analyses the current project state and returns a single brief observation.
 * Only called when deterministic checks don't fire AND throttle window is clear.
 *
 * Returns: { observation: string, severity: 'info'|'warning'|'error', elementId?: string }
 */
app.post('/api/ai/ambient/analyse', aiLimiter, authMiddleware, async (req, res) => {
    // D-gap-3: compliance and programme context added by AmbientIntelligence client
    const { context = '', recentCommands = [], constraints = [], compliance = null, programme = null } = req.body ?? {};

    if (!CF_WORKER_URL && !ANTHROPIC_API_KEY) {
        return res.status(500).json({ error: 'No AI upstream configured' });
    }

    const callerId = req.auth?.userId ?? 'anonymous';
    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        return res.status(429).json({ error: 'AI quota exceeded', plan: quota.plan, limit: quota.limit });
    }

    // D-gap-3: Build supplementary compliance and programme summaries for the system prompt.
    let complianceSummary = '';
    if (compliance && typeof compliance === 'object') {
        const violationCount = compliance.violations?.length ?? 0;
        const warningCount   = compliance.warnings?.length ?? 0;
        const passRate       = compliance.passRate != null ? Math.round(compliance.passRate * 100) : null;
        if (violationCount > 0 || warningCount > 0) {
            complianceSummary = `\n\nCompliance snapshot: ${violationCount} violations, ${warningCount} warnings` +
                (passRate != null ? ` (${passRate}% pass rate)` : '') + '.';
            const topViolations = (compliance.violations ?? []).slice(0, 3);
            if (topViolations.length > 0) {
                complianceSummary += '\nTop violations: ' + topViolations.map(v => v.message).join('; ');
            }
        }
    }

    let programmeSummary = '';
    if (programme && typeof programme === 'object' && programme.rooms?.length > 0) {
        const failingRooms = programme.rooms.filter(r => r.status === 'fail' || r.status === 'warning');
        if (failingRooms.length > 0) {
            const rate = programme.complianceRate != null ? Math.round(programme.complianceRate * 100) : null;
            programmeSummary = `\n\nProgramme snapshot: ${failingRooms.length} room(s) have area deviations` +
                (rate != null ? ` (${rate}% within target)` : '') + '.';
            const topFailing = failingRooms.slice(0, 3);
            programmeSummary += '\nWorst deviations: ' + topFailing
                .map(r => `${r.name} (${r.deviationPct > 0 ? '+' : ''}${r.deviationPct?.toFixed(0)}%)`)
                .join(', ');
        }
    }

    const systemPrompt = `You are PRYZM Ambient Intelligence — an unobtrusive BIM design advisor.

Your role: analyse the current design state and surface ONE concise, actionable observation that the architect may not have noticed. This is NOT a chatbot — you speak once per 30 seconds maximum. Be brief and specific.

Project context:
${context ? context.slice(0, 2000) : '(no context provided)'}${complianceSummary}${programmeSummary}

Recent commands: ${recentCommands.join(', ') || 'none'}

Active constraint violations (${constraints.length}):
${constraints.slice(0, 5).map(c => `- ${c.severity}: ${c.message}`).join('\n') || '- none'}

Rules:
- ONE observation maximum — the most important thing you notice
- 1–2 sentences, max 140 characters total
- Focus on: spatial efficiency, adjacency quality, compliance risk, programme deviation
- Do NOT repeat what the constraints already say explicitly
- Severity: info (general insight), warning (potential issue), error (definite problem)
- If you see nothing worth noting, return { observation: null }
- Return ONLY valid JSON:
  { "observation": "...", "severity": "info"|"warning"|"error", "elementId": "id or null" }`;

    const payload = {
        model: ANTHROPIC_MODEL_ID,
        max_tokens: 256,
        system: systemPrompt,
        messages: [{ role: 'user', content: 'Analyse the current design state.' }],
    };

    try {
        let response;
        if (CF_WORKER_URL) {
            response = await fetch(CF_WORKER_URL, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
        } else {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
                body: JSON.stringify(payload),
            });
        }
        const data = await response.json();
        if (!response.ok) {
            console.error('[ai/ambient/analyse] Anthropic error:', JSON.stringify(data));
            return res.status(response.status).json(data);
        }

        const rawText = data?.content?.[0]?.text ?? '{}';
        console.log(`[ai/ambient/analyse] caller:${callerId} tokens:${data.usage?.input_tokens}+${data.usage?.output_tokens}`);

        const jsonMatch = rawText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) return res.json({ observation: null });

        const parsed = JSON.parse(jsonMatch[0]);
        if (!parsed.observation) return res.json({ observation: null });

        return res.json({
            observation: parsed.observation,
            severity:    parsed.severity ?? 'info',
            elementId:   parsed.elementId ?? null,
        });
    } catch (err) {
        console.error('[ai/ambient/analyse] Error:', err);
        return res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── ADR-050 — AI Response Cache BFF routes ────────────────────────────────────
// The browser-side `AiResponseCacheFetchAdapter` (packages/ai-host/src/AiResponseCache.ts)
// calls these two routes so that `AiPlane.submit()` can check and populate the
// PostgreSQL-backed `ai_response_cache` table (see server/dbMigrate.js table 15).
//
// Auth is required so the cache key space is per-user-session protected.
// The tenant_id in each key equals the projectId supplied by the client —
// cross-project cache sharing is architecturally prohibited (ADR-050 §3).
//
// Nightly TTL cleanup runs at the bottom of this block.

const _aiResponseCache = new PgAiResponseCache(getPgPool());

/**
 * POST /api/ai/cache/lookup
 * Body: { tenantId, contentHash, modelVersion }
 * Returns: { hit: false } | { hit: true, result: WorkflowRunResult }
 */
app.post('/api/ai/cache/lookup', authMiddleware, async (req, res) => {
    if (!req.auth?.userId || req.auth.userId === 'anonymous') {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const { tenantId, contentHash, modelVersion } = req.body ?? {};
    if (
        typeof tenantId !== 'string' || tenantId.length === 0 ||
        typeof contentHash !== 'string' || contentHash.length === 0 ||
        typeof modelVersion !== 'string' || modelVersion.length === 0
    ) {
        return res.status(400).json({ error: 'tenantId, contentHash, and modelVersion are required strings' });
    }
    try {
        const result = await _aiResponseCache.get({ tenantId, contentHash, modelVersion });
        if (result === null) return res.json({ hit: false });
        return res.json({ hit: true, result });
    } catch (err) {
        console.error('[ai-cache/lookup] error:', err);
        return res.json({ hit: false }); // fail-open: miss on error
    }
});

/**
 * POST /api/ai/cache/store
 * Body: { tenantId, contentHash, modelVersion, result: WorkflowRunResult, ttlDays?: number }
 * Returns: { ok: true }
 */
app.post('/api/ai/cache/store', authMiddleware, async (req, res) => {
    if (!req.auth?.userId || req.auth.userId === 'anonymous') {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const { tenantId, contentHash, modelVersion, result, ttlDays } = req.body ?? {};
    if (
        typeof tenantId !== 'string' || tenantId.length === 0 ||
        typeof contentHash !== 'string' || contentHash.length === 0 ||
        typeof modelVersion !== 'string' || modelVersion.length === 0 ||
        result == null || typeof result !== 'object'
    ) {
        return res.status(400).json({ error: 'tenantId, contentHash, modelVersion, and result are required' });
    }
    try {
        const days = typeof ttlDays === 'number' && ttlDays > 0 ? ttlDays : 7;
        await _aiResponseCache.set({ tenantId, contentHash, modelVersion }, result, days);
        return res.json({ ok: true });
    } catch (err) {
        console.error('[ai-cache/store] error:', err);
        return res.status(500).json({ error: 'cache store failed' });
    }
});

// ADR-050 §4 — nightly TTL cleanup: delete all expired rows once per 24 h.
// Scheduled AFTER runMigrations() at the bottom so the table always exists.
const CACHE_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 h
async function runCacheCleanup() {
    try {
        const deleted = await _aiResponseCache.cleanup();
        if (deleted > 0) {
            console.log(`[ai-cache] TTL cleanup: removed ${deleted} expired entr${deleted === 1 ? 'y' : 'ies'}`);
        }
    } catch (err) {
        console.warn('[ai-cache] TTL cleanup failed (non-fatal):', err?.message ?? err);
    }
}

// ── Mosaic image assets — landing page drifting background ───────────────────
// Images live in public/mosaic/ as WebP (converted from source PNGs).
// We register a dedicated express.static route for /mosaic/* here so the images
// are served directly from the source tree in BOTH development and production —
// no dependency on Vite having copied public/ into dist/ at build time.
// This middleware must be registered before the API routes below and before the
// dist static handler at the bottom of this file.
const MOSAIC_DIR = join(__dirname, 'public', 'mosaic');
const MEDIA_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif', 'mp4', 'webm', 'mov', 'ogg']);

app.use('/mosaic', express.static(MOSAIC_DIR, {
    // Long-lived cache — mosaic images change infrequently.
    // COEP/COOP headers must NOT be set on image resources; they are document-level
    // headers and have no effect (and can interfere) when sent on sub-resources.
    setHeaders: (res, filePath) => {
        res.setHeader('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
        // Correct CORP header so images load under cross-origin-isolated pages
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    }
}));

// ── Kave GLB furniture assets — /items/<slug>/model.glb + thumbnail.webp ──────
// GLB files live in public/items/ and must be served BEFORE Vite / dist middleware
// so that missing files return a JSON 404 instead of the SPA index.html fallback
// (which causes GLTFLoader to fail with "Unexpected token '<'").
//
// To add a new furniture item, place files at:
//   public/items/<your-slug>/model.glb
//   public/items/<your-slug>/thumbnail.webp
// Then register the item in src/ui/furniture-carousel/FurnitureCategoryRegistry.ts.
// See docs/KaveFurniture.md for the complete guide.
const ITEMS_DIR = join(__dirname, 'public', 'items');
app.use('/items', express.static(ITEMS_DIR, {
    setHeaders: (res) => {
        // GLB files may be large — allow moderate browser caching
        res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=3600');
        res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
        // COOP + COEP are now set globally by helmetMiddleware — per-route override removed.
    }
}));
// Explicit 404 JSON for any /items/* path not found on disk.
// Prevents Vite SPA fallback from returning index.html to GLTFLoader.
app.use('/items', (req, res) => {
    res.status(404).json({
        error: `Furniture asset not found: /items${req.path}`,
        hint: 'Place the GLB file at public/items/<slug>/model.glb and restart the server. See docs/KaveFurniture.md for the full guide.',
    });
});

app.get('/api/media-list', (_req, res) => {
    try {
        let files = [];
        try {
            const allFiles = readdirSync(MOSAIC_DIR)
                .filter(f => {
                    const ext = (f.split('.').pop() || '').toLowerCase();
                    return MEDIA_EXTS.has(ext);
                });

            // Prefer WebP over the original PNG/JPG when both exist.
            // This means the browser always gets the smallest possible file.
            const webpBases = new Set(
                allFiles
                    .filter(f => f.toLowerCase().endsWith('.webp'))
                    .map(f => f.slice(0, f.lastIndexOf('.')))
            );

            files = allFiles
                .filter(f => {
                    const ext = f.slice(f.lastIndexOf('.') + 1).toLowerCase();
                    // Keep file if it is WebP, or if no WebP equivalent exists for it
                    if (ext === 'webp') return true;
                    const base = f.slice(0, f.lastIndexOf('.'));
                    return !webpBases.has(base);
                })
                // encodeURIComponent guarantees valid URLs — no spaces or special chars
                .map(f => `/mosaic/${encodeURIComponent(f)}`);
        } catch {
            /* public/mosaic not present — return empty list (placeholder shown) */
        }
        res.json({ files });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── Plan API (C4 — server-authoritative plan & quota) ────────────────────────
// GET /api/auth/plan — returns the server-side plan and AI quota usage for the
// calling user. The client must use this to display accurate quota remaining.
// It MUST NOT rely solely on localStorage for quota-related UI.
app.get('/api/auth/plan', authMiddleware, (req, res) => {
    const userId = req.auth?.userId ?? 'anonymous';
    const stats = getAIUsageStats(userId);
    res.json({ userId, ...stats });
});

// POST /api/auth/set-plan — INTERNAL ONLY. Set a user's plan server-side.
// In production this endpoint must only be called from the verified Stripe
// webhook handler (§4). It is intentionally not exposed in the Stripe
// webhook stub below so it cannot be abused before Stripe is integrated.
// When Stripe integration is added, call setUserPlan(userId, plan) from
// within stripe.webhooks.constructEvent()-verified webhook handler.
app.post('/api/auth/set-plan', (req, res) => {
    const internalSecret = process.env.INTERNAL_PLAN_SECRET;
    if (!internalSecret || req.headers['x-internal-secret'] !== internalSecret) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    const { userId, plan } = req.body ?? {};
    if (!userId || !plan) return res.status(400).json({ error: 'userId and plan required' });
    setUserPlan(userId, plan);
    res.json({ ok: true, userId, plan });
});

// ── CDE Phase 1: Owner-only admin plan management endpoint ───────────────────
// POST /api/admin/set-plan — set any user's plan; caller must be the platform owner.
// The caller's plan is checked server-side against the 'owner' tier. Never exposed
// to non-owner users. Used for: granting enterprise trials, resetting plans, etc.
app.post('/api/admin/set-plan', authMiddleware, (req, res) => {
    const callerId = req.auth?.userId ?? 'anonymous';
    const callerPlan = getUserPlan(callerId);
    if (callerPlan !== 'owner') {
        return res.status(403).json({ error: 'Forbidden — owner plan required.' });
    }
    const { userId, plan } = req.body ?? {};
    if (!userId || !plan) return res.status(400).json({ error: 'userId and plan required' });
    setUserPlan(userId, plan);
    console.log(`[admin] Owner ${callerId} set plan for ${userId} → ${plan}`);
    res.json({ ok: true, userId, plan });
});

// ── H5: Export authorization endpoint ────────────────────────────────────────
// The client MUST call GET /api/export/authorize?type=ifc|glb|pdf before
// executing any client-side export function. This is the server-side gate that
// enforces export entitlements based on the caller's server-side plan.
// Anonymous users (no valid JWT token) receive the free-tier plan entitlements.
app.get('/api/export/authorize', authMiddleware, (req, res) => {
    const exportType = (req.query.type ?? '').toLowerCase();
    const userId = req.auth?.userId ?? 'anonymous';
    const email  = req.auth?.email ?? null;

    // Owner email bypass: platform owner always has full export rights regardless
    // of what the plan DB/cache returns. Ensure the in-memory plan is 'owner'
    // before calling authorizeExport so the guard sees the correct tier.
    const ownerEmail = process.env.PRYZM_OWNER_EMAIL;
    if (ownerEmail && email && email.toLowerCase().trim() === ownerEmail.toLowerCase().trim()) {
        setUserPlan(userId, 'owner');
        console.log(`[export/authorize] Owner bypass applied for user ${userId} — type: ${exportType}`);
    }

    const result = authorizeExport(userId, exportType);
    if (!result.authorized) {
        return res.status(403).json({ authorized: false, reason: result.reason, plan: result.plan });
    }
    res.json({ authorized: true, token: result.token, plan: result.plan });
});

// Wave 19 (Phase 2C) — async PDF export queue endpoint (S114-WIRE).
// Full async pipeline deferred to Phase F.x: plugins/export-pdf handlers
// (currently F-prereq.0 empty scaffold) must ship before real processing.
// Current: returns jobId immediately; stub worker logs + resolves 'done' after 200ms.
app.post('/api/export/pdf', authMiddleware, (req, res) => {
    const { projectId } = req.body ?? {};
    if (!projectId) {
        return res.status(400).json({ error: 'projectId is required' });
    }
    const jobId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `job-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    console.log(`[export/pdf] queued job ${jobId} for project ${projectId}`);
    res.json({ jobId, status: 'queued' });
});

// Wave 19 (Phase 2C) — job status polling endpoint.
app.get('/api/export/jobs/:jobId', authMiddleware, (req, res) => {
    const { jobId } = req.params;
    // TODO(F.x): query apps/export-worker enqueueExportJob store for real status.
    res.json({ jobId, status: 'queued' });
});

// ── PRYZM Auth API (custom email/password auth) ───────────────────────────────
// Provides real, server-side hashed password authentication backed by
// Replit PostgreSQL. Sessions are signed JWTs (SESSION_SECRET env var).

app.post('/api/auth/signup', async (req, res) => {
    const { email, password, name } = req.body ?? {};
    if (!email || !password || !name) {
        return res.status(400).json({ error: 'email, password, and name are required.' });
    }
    if (password.length < 8) {
        return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    // Auth requires Supabase or Replit PG — authStore.js handles the routing automatically
    const supabase = await getSupabaseClient();
    if (!supabase && !getPgPool()) {
        return res.status(503).json({ error: 'Database not configured — cannot create account. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Replit Secrets.' });
    }
    try {
        const { user, token } = await authSignUp({ email, password, name });
        res.status(201).json({ user, token });
    } catch (err) {
        const msg = err.message ?? String(err);
        const status = msg.includes('already exists') ? 409 : 400;
        res.status(status).json({ error: msg });
    }
});

app.post('/api/auth/signin', async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
        return res.status(400).json({ error: 'email and password are required.' });
    }
    const supabase = await getSupabaseClient();
    if (!supabase && !getPgPool()) {
        return res.status(503).json({ error: 'Database not configured — cannot sign in. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Replit Secrets.' });
    }
    try {
        const { user, token } = await authSignIn({ email, password });
        res.json({ user, token });
    } catch (err) {
        res.status(401).json({ error: err.message ?? 'Invalid credentials.' });
    }
});

// GET /api/auth/me — returns the authenticated user profile (validates the stored token)
app.get('/api/auth/me', authMiddleware, (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') {
        return res.status(401).json({ error: 'Not authenticated.' });
    }
    res.json({ userId, email: req.auth.email ?? null });
});

// ── Google OAuth ──────────────────────────────────────────────────────────────

app.get('/api/auth/google', (req, res) => {
    const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
    if (!GOOGLE_CLIENT_ID) {
        return res.status(503).send('Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Replit Secrets.');
    }
    const base        = getBaseUrl(req);
    const redirectUri = `${base}/api/auth/google/callback`;
    const state       = Buffer.from(base).toString('base64');
    res.redirect(googleAuthUrl(redirectUri, state));
});

app.get('/api/auth/google/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const base        = getBaseUrl(req);
    const redirectUri = `${base}/api/auth/google/callback`;
    const origin      = state ? Buffer.from(state, 'base64').toString() : base;

    if (error || !code) {
        return res.send(callbackHtml({ error: error ?? 'Google sign-in was cancelled.' }, origin));
    }

    try {
        const tokens  = await exchangeGoogleCode(code, redirectUri);
        const profile = await fetchGoogleProfile(tokens.access_token);

        if (!profile.email) throw new Error('Google did not provide an email address.');

        const user  = await upsertOAuthUser({ email: profile.email, name: profile.name, provider: 'google' });
        const token = mintToken(user);

        res.send(callbackHtml({ user, token }, origin));
    } catch (err) {
        console.error('[oauth/google] callback error:', err.message);
        res.send(callbackHtml({ error: err.message ?? 'Google sign-in failed.' }, origin));
    }
});

// ── Microsoft / Outlook OAuth ─────────────────────────────────────────────────

app.get('/api/auth/microsoft', (req, res) => {
    const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
    if (!MICROSOFT_CLIENT_ID) {
        return res.status(503).send('Microsoft OAuth is not configured. Set MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET in Replit Secrets.');
    }
    const base        = getBaseUrl(req);
    const redirectUri = `${base}/api/auth/microsoft/callback`;
    const state       = Buffer.from(base).toString('base64');
    res.redirect(microsoftAuthUrl(redirectUri, state));
});

app.get('/api/auth/microsoft/callback', async (req, res) => {
    const { code, state, error } = req.query;
    const base        = getBaseUrl(req);
    const redirectUri = `${base}/api/auth/microsoft/callback`;
    const origin      = state ? Buffer.from(state, 'base64').toString() : base;

    if (error || !code) {
        return res.send(callbackHtml({ error: error ?? 'Microsoft sign-in was cancelled.' }, origin));
    }

    try {
        const tokens  = await exchangeMicrosoftCode(code, redirectUri);
        const profile = await fetchMicrosoftProfile(tokens.access_token);

        if (!profile.email) throw new Error('Microsoft did not provide an email address.');

        const user  = await upsertOAuthUser({ email: profile.email, name: profile.name, provider: 'microsoft' });
        const token = mintToken(user);

        res.send(callbackHtml({ user, token }, origin));
    } catch (err) {
        console.error('[oauth/microsoft] callback error:', err.message);
        res.send(callbackHtml({ error: err.message ?? 'Microsoft sign-in failed.' }, origin));
    }
});

// ── Stripe webhook (H9) ───────────────────────────────────────────────────────
// Verifies the Stripe signature then updates the user's plan in the DB.
// IMPORTANT: This route MUST use express.raw() — not express.json() — because
// stripe.webhooks.constructEvent() requires the raw Buffer body bytes.
// The global express.json() middleware is excluded from this path (see above).
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const STRIPE_SECRET_KEY    = process.env.STRIPE_SECRET_KEY;
    const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

    if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
        // Keys not yet configured — return 200 so Stripe stops retrying
        console.warn('[stripe] Webhook received but Stripe keys are not configured — ignoring.');
        return res.json({ received: true });
    }

    const sig = req.headers['stripe-signature'];
    if (!sig) {
        return res.status(400).json({ error: 'Missing stripe-signature header.' });
    }

    // Signature verification MUST be first — no business logic before this line
    let event;
    try {
        event = constructWebhookEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        console.error('[stripe] Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook signature error: ${err.message}` });
    }

    // ── Process verified events ───────────────────────────────────────────────
    console.log(`[stripe] Event received: ${event.type}`);
    try {
        switch (event.type) {
            // Subscription created or renewed — activate the paid plan
            case 'customer.subscription.created':
            case 'customer.subscription.updated': {
                const sub      = event.data.object;
                const metadata = sub.metadata ?? {};
                const userId   = metadata.userId;
                const plan     = metadata.plan;

                if (userId && plan) {
                    // 1. Update in-memory plan authority (fast, sync)
                    setUserPlan(userId, plan);
                    console.log(`[stripe] Plan activated via webhook: ${userId} → ${plan}`);

                    // 2. Persist plan + Stripe IDs to DB (async, non-blocking)
                    pgQuery(
                        `UPDATE pryzm_users
                            SET plan = $1, plan_status = $2,
                                stripe_customer_id     = COALESCE($3, stripe_customer_id),
                                stripe_subscription_id = COALESCE($4, stripe_subscription_id)
                          WHERE id = $5`,
                        [plan, sub.status ?? 'active', sub.customer ?? null, sub.id ?? null, userId]
                    ).catch(err => console.warn('[stripe] DB update failed (plan):', err.message));
                } else {
                    console.warn('[stripe] Subscription event missing userId or plan in metadata:', sub.id);
                }
                break;
            }

            // ── Marketplace plugin one-time purchase confirmed ────────────────
            // Fired when a Stripe Checkout Session (mode: 'payment') completes.
            // Updates plugin_purchases.status → 'completed' so the user can install.
            case 'checkout.session.completed': {
                const session  = event.data.object;
                const meta     = session.metadata ?? {};
                const userId   = meta.userId;
                const pluginId = meta.pluginId;
                const pluginVersion = meta.pluginVersion ?? '1.0.0';
                const priceCents    = parseInt(meta.priceCents ?? '0', 10);
                const paymentIntent = typeof session.payment_intent === 'string'
                    ? session.payment_intent
                    : session.payment_intent?.id ?? null;

                if (userId && pluginId) {
                    console.log(`[stripe] Marketplace purchase confirmed: userId=${userId} pluginId=${pluginId} pi=${paymentIntent}`);
                    pgQuery(
                        `INSERT INTO plugin_purchases
                             (user_id, plugin_id, plugin_version, price_cents, currency,
                              stripe_session_id, stripe_payment_intent_id, status, purchased_at)
                         VALUES ($1, $2, $3, $4, 'usd', $5, $6, 'completed', NOW())
                         ON CONFLICT (user_id, plugin_id) DO UPDATE
                             SET status                   = 'completed',
                                 stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
                                 purchased_at             = NOW()`,
                        [userId, pluginId, pluginVersion, priceCents, session.id, paymentIntent],
                    ).catch(err => console.warn('[stripe] plugin_purchases upsert failed:', err.message));
                } else {
                    console.warn('[stripe] checkout.session.completed missing userId/pluginId in metadata:', session.id);
                }
                break;
            }

            // ── Marketplace plugin refund ─────────────────────────────────────
            case 'charge.refunded': {
                const charge    = event.data.object;
                const paymentIntent = typeof charge.payment_intent === 'string'
                    ? charge.payment_intent
                    : null;
                if (paymentIntent) {
                    pgQuery(
                        `UPDATE plugin_purchases
                            SET status = 'refunded'
                          WHERE stripe_payment_intent_id = $1`,
                        [paymentIntent],
                    ).catch(err => console.warn('[stripe] plugin_purchases refund update failed:', err.message));
                    console.log(`[stripe] Marketplace refund processed for payment_intent=${paymentIntent}`);
                }
                break;
            }

            // Subscription cancelled — revert to free plan
            case 'customer.subscription.deleted': {
                const sub    = event.data.object;
                const userId = sub.metadata?.userId;
                if (userId) {
                    setUserPlan(userId, 'free');
                    console.log(`[stripe] Subscription cancelled — ${userId} reverted to free`);

                    pgQuery(
                        `UPDATE pryzm_users
                            SET plan = 'free', plan_status = 'cancelled',
                                stripe_subscription_id = NULL
                          WHERE id = $1`,
                        [userId]
                    ).catch(err => console.warn('[stripe] DB update failed (cancel):', err.message));
                }
                break;
            }

            default:
                // Silently acknowledge other event types
                console.log(`[stripe] Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (err) {
        console.error('[stripe] Event processing error:', err);
        res.status(500).json({ error: 'Event processing failed.' });
    }
});

// ── Stripe API routes ─────────────────────────────────────────────────────────
// /api/stripe/config        — publishable key + price IDs (no auth needed)
// /api/stripe/checkout      — create Checkout Session (auth required)
// /api/stripe/subscription  — get user subscription status (auth required)
// /api/stripe/portal        — create Billing Portal session (auth required)
app.use('/api/stripe', authMiddleware, stripeRouter);

// ── Health check ─────────────────────────────────────────────────────────────
// GET /api/health — no auth required; safe to call from monitoring tooling.
// Reports active DB backend, Supabase REST reachability, and schema integrity
// so deployment issues are immediately visible without reading server logs.
// Contract: C05-PERSISTENCE-AND-FILE-FORMAT §1.3 + §1.3.1
// §H18 (audit) — split health into cheap LIVENESS and deep READINESS endpoints.
// Load balancers and process supervisors should poll /api/health/live (no DB,
// returns 200 as long as the process is alive); orchestrators that need to
// route traffic away from a broken instance should poll /api/health/ready
// (single-shot SELECT 1, returns 503 when the DB is down). The full deep
// /api/health endpoint runs three information_schema queries and a FK check —
// previously polled every few seconds it would self-DoS the PG pool.
app.get('/api/health/live', (_req, res) => res.status(200).json({ ok: true }));
app.get('/api/health/ready', async (_req, res) => {
    try {
        const pool = getPgPool();
        if (!pool) return res.status(503).json({ ok: false, reason: 'no-db-pool' });
        await pool.query('SELECT 1');
        return res.status(200).json({ ok: true });
    } catch (err) {
        return res.status(503).json({ ok: false, reason: 'db-error' });
    }
});

app.get('/api/health', async (_req, res) => {
    const pg = getBackendInfo();

    // Schema integrity: verify the three tables that are required for core CRUD.
    let schemaOk = false;
    let schemaDetail = 'unchecked';
    try {
        const pool = getPgPool();
        if (pool) {
            const { rows } = await pool.query(`
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_name IN ('projects','project_versions','pryzm_users')
            `);
            const found = rows.map(r => r.table_name).sort();
            const expected = ['project_versions', 'projects', 'pryzm_users'];
            schemaOk = expected.every(t => found.includes(t));
            schemaDetail = schemaOk
                ? `${found.length}/3 required tables present`
                : `missing: ${expected.filter(t => !found.includes(t)).join(', ')}`;
        } else {
            schemaDetail = 'no pool';
        }
    } catch (e) {
        schemaDetail = `error: ${e.message}`;
    }

    // FK guard: confirm projects_owner_id_fkey does NOT exist (C05 §1.3.1).
    let fkRemoved = null;
    try {
        const pool = getPgPool();
        if (pool) {
            const { rows } = await pool.query(`
                SELECT 1 FROM information_schema.table_constraints
                WHERE constraint_type = 'FOREIGN KEY'
                  AND table_name = 'projects'
                  AND constraint_name = 'projects_owner_id_fkey'
            `);
            fkRemoved = rows.length === 0;
        }
    } catch { fkRemoved = null; }

    const otelEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? null;
    res.json({
        status: 'ok',
        timestamp: Date.now(),
        db: {
            backend: pg.backend,          // 'replit' | 'supabase' | 'none'
            poolReady: pg.poolReady,
            schemaOk,
            schemaDetail,
            fkRemovedOk: fkRemoved,       // true = C05§1.3.1 invariant holds
        },
        features: {
            anthropic: !!(CF_WORKER_URL || ANTHROPIC_API_KEY),
            aiUpstream: CF_WORKER_URL ? 'cloudflare-worker' : (ANTHROPIC_API_KEY ? 'direct-anthropic' : 'none'),
            auth: 'jwt',
            supabase: !!process.env.SUPABASE_URL,
            socketio: !!io,
            stripe: !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
        },
        otel: {
            active: !!otelEndpoint,
            endpoint: otelEndpoint,
            service: process.env.OTEL_SERVICE_NAME ?? 'pryzm-server',
        },
    });
});

// ── Render Gallery API (Tier 1 — Photorealistic Rendering) ────────────────────
//
// The GPU path-tracing runs CLIENT-SIDE (browser WebGL2). The server provides
// gallery storage, listing, and image serving. No server-side GPU required.
//
// Routes:
//   POST   /api/render/save       — Upload a completed render PNG
//   GET    /api/render/list       — List renders for the auth'd user
//   GET    /api/render/:id/image  — Serve a render PNG by ID
//   DELETE /api/render/:id        — Delete a render
// ──────────────────────────────────────────────────────────────────────────────

app.post('/api/render/save', authMiddleware, renderUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded.' });
        }
        const userId = req.auth?.userId ?? 'anonymous';
        let meta = {};
        try { meta = JSON.parse(req.body?.meta ?? '{}'); } catch {}

        const { id, url } = await saveRenderToGallery(userId, req.file.buffer, meta);
        res.json({ id, url, saved: true });
    } catch (err) {
        console.error('[render/save]', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/api/render/list', authMiddleware, async (req, res) => {
    try {
        const userId = req.auth?.userId ?? 'anonymous';
        const renders = await listRendersForUser(userId);
        res.json({ renders });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/api/render/:id/image', authMiddleware, async (req, res) => {
    try {
        const userId = req.auth?.userId ?? 'anonymous';
        const buffer = await getRenderImageBuffer(userId, req.params.id);
        if (!buffer) {
            return res.status(404).json({ error: 'Render not found.' });
        }
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'private, max-age=86400');
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.delete('/api/render/:id', authMiddleware, async (req, res) => {
    try {
        const userId = req.auth?.userId ?? 'anonymous';
        const deleted = await deleteRender(userId, req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Render not found.' });
        res.json({ deleted: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── Panorama Gallery API (Tier 3 — 360° Equirectangular Panoramas) ─────────────
//
// Routes:
//   POST   /api/panorama/save      — Upload a completed panorama JPEG
//   GET    /api/panorama/list      — List panoramas for the auth'd user
//   GET    /api/panorama/:id/image — Serve a panorama JPEG by ID
//   DELETE /api/panorama/:id       — Delete a panorama
// ──────────────────────────────────────────────────────────────────────────────

const panoramaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

app.post('/api/panorama/save', authMiddleware, panoramaUpload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No image file uploaded.' });
        }
        const userId = req.auth?.userId ?? 'anonymous';
        let meta = {};
        try { meta = JSON.parse(req.body?.meta ?? '{}'); } catch {}

        const { id, url } = await savePanoramaToGallery(userId, req.file.buffer, meta);
        res.json({ id, url, saved: true });
    } catch (err) {
        console.error('[panorama/save]', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/api/panorama/list', authMiddleware, async (req, res) => {
    try {
        const userId = req.auth?.userId ?? 'anonymous';
        const panoramas = await listPanoramasForUser(userId);
        res.json({ panoramas });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/api/panorama/:id/image', authMiddleware, async (req, res) => {
    try {
        const userId = req.auth?.userId ?? 'anonymous';
        const buffer = await getPanoramaImageBuffer(userId, req.params.id);
        if (!buffer) {
            return res.status(404).json({ error: 'Panorama not found.' });
        }
        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'private, max-age=86400');
        res.send(buffer);
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.delete('/api/panorama/:id', authMiddleware, async (req, res) => {
    try {
        const userId = req.auth?.userId ?? 'anonymous';
        const deleted = await deletePanorama(userId, req.params.id);
        if (!deleted) return res.status(404).json({ error: 'Panorama not found.' });
        res.json({ deleted: true });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── DWG → DXF Conversion Endpoint (§31 Phase 3) ──────────────────────────────
//
// POST /api/import/dwg
//
// Accepts a .dwg file (multipart/form-data, field name "file"), converts it to
// DXF via Autodesk APS Model Derivative API, and returns the DXF text.
//
// Requirements:
//   • APS_CLIENT_ID and APS_CLIENT_SECRET must be set in environment secrets.
//   • Without them the endpoint returns 503 with a clear error.
//   • File size cap: 50 MB (enforced by multer).
//   • Conversion timeout: 120 s (enforced by dwgConversionService).
//   • Requires JWT auth (authMiddleware).
//
// §31 §7 Phase 3 Security Rules:
//   • DWG bytes are NOT written to disk (multer memoryStorage).
//   • Bytes are uploaded to APS transient OSS bucket and deleted after conversion.
// ──────────────────────────────────────────────────────────────────────────────

const dwgUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.dwg')) {
            cb(null, true);
        } else {
            cb(new Error('Only .dwg files are accepted'));
        }
    },
});

app.post('/api/import/dwg', authMiddleware, dwgUpload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No .dwg file uploaded (field name must be "file").' });
    }

    // Check APS credentials are configured
    if (!process.env.APS_CLIENT_ID || !process.env.APS_CLIENT_SECRET) {
        console.warn('[DWG Import] APS_CLIENT_ID / APS_CLIENT_SECRET not configured — returning 503');
        return res.status(503).json({
            error: 'DWG conversion is not configured on this server. Contact your administrator.',
            hint:  'Set APS_CLIENT_ID and APS_CLIENT_SECRET environment secrets to enable DWG import (§31 Phase 3).',
        });
    }

    try {
        const { convertDwgToDxf } = dwgConversionService;
        const dxfText = await convertDwgToDxf(req.file.buffer, req.file.originalname);
        res.json({ dxfText, fileName: req.file.originalname.replace(/\.dwg$/i, '.dxf') });
    } catch (err) {
        console.error('[DWG Import] Conversion error:', err);
        if (err.message?.includes('timed out')) {
            return res.status(504).json({ error: err.message });
        }
        res.status(500).json({ error: String(err.message ?? err) });
    }
});

// ── IFC Upload Persistence (§IFC-STORE-1) ────────────────────────────────────
//
// These routes implement server-side IFC model persistence so that imported
// IFC files survive user sign-out / sign-in cycles.
//
// Storage: Supabase Storage bucket 'ifc-uploads' (preferred) or base64 in
//          ifc_uploads.file_data (DB fallback for Replit PG environments).
//
// Routes:
//   POST   /api/projects/:id/ifc-uploads            — upload IFC binary
//   GET    /api/projects/:id/ifc-uploads            — list uploads for project
//   GET    /api/projects/:id/ifc-uploads/:uid/data  — get download URL or base64
//   DELETE /api/projects/:id/ifc-uploads/:uid       — delete upload

const ifcUploadMw = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 500 * 1024 * 1024 }, // 500 MB max IFC binary
    fileFilter: (_req, file, cb) => {
        if (file.originalname.toLowerCase().endsWith('.ifc')) {
            cb(null, true);
        } else {
            cb(new Error('Only .ifc files are accepted by this endpoint'));
        }
    },
});

// POST /api/projects/:id/ifc-uploads
app.post('/api/projects/:projectId/ifc-uploads', authMiddleware, ifcUploadMw.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No .ifc file provided (multipart field name must be "file").' });
    }

    const { projectId } = req.params;
    const userId        = req.auth?.userId ?? 'anonymous';
    const elementCount  = parseInt(req.body?.elementCount ?? '0', 10);

    // Ownership check — user must have access to the project
    const canAccess = await _httpCanAccess(userId, projectId);
    if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this project.' });
    }

    try {
        const { uploadIfcFile } = ifcStorageService;
        const row = await uploadIfcFile(
            projectId, userId,
            req.file.originalname,
            req.file.buffer,
            elementCount,
        );

        console.log(`[IFC Storage] Uploaded: ${req.file.originalname} (${req.file.size} bytes) for project ${projectId} — status: ${row.upload_status}`);
        res.status(201).json({ ok: true, upload: _sanitiseUploadRow(row) });
    } catch (err) {
        console.error('[IFC Storage] Upload failed:', err);
        res.status(500).json({ error: String(err.message ?? err) });
    }
});

// GET /api/projects/:id/ifc-uploads
app.get('/api/projects/:projectId/ifc-uploads', authMiddleware, async (req, res) => {
    const { projectId } = req.params;
    const userId        = req.auth?.userId ?? 'anonymous';

    const canAccess = await _httpCanAccess(userId, projectId);
    if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this project.' });
    }

    try {
        const { listIfcUploads } = ifcStorageService;
        const uploads = await listIfcUploads(projectId);
        res.json({ ok: true, uploads: uploads.map(_sanitiseUploadRow) });
    } catch (err) {
        console.error('[IFC Storage] List failed:', err);
        res.status(500).json({ error: String(err.message ?? err) });
    }
});

// GET /api/projects/:id/ifc-uploads/:uploadId/data
app.get('/api/projects/:projectId/ifc-uploads/:uploadId/data', authMiddleware, async (req, res) => {
    const { projectId, uploadId } = req.params;
    const userId                  = req.auth?.userId ?? 'anonymous';

    const canAccess = await _httpCanAccess(userId, projectId);
    if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this project.' });
    }

    try {
        const { getIfcFileData } = ifcStorageService;
        const data = await getIfcFileData(uploadId, projectId);
        if (!data) {
            return res.status(404).json({ error: 'IFC upload not found or data unavailable.' });
        }
        res.json({ ok: true, ...data });
    } catch (err) {
        console.error('[IFC Storage] Data fetch failed:', err);
        res.status(500).json({ error: String(err.message ?? err) });
    }
});

// DELETE /api/projects/:id/ifc-uploads/:uploadId
app.delete('/api/projects/:projectId/ifc-uploads/:uploadId', authMiddleware, async (req, res) => {
    const { projectId, uploadId } = req.params;
    const userId                  = req.auth?.userId ?? 'anonymous';

    const canAccess = await _httpCanAccess(userId, projectId);
    if (!canAccess) {
        return res.status(403).json({ error: 'Access denied to this project.' });
    }

    try {
        const { deleteIfcUpload } = ifcStorageService;
        const deleted = await deleteIfcUpload(uploadId, projectId);
        if (!deleted) {
            return res.status(404).json({ error: 'IFC upload not found.' });
        }
        console.log(`[IFC Storage] Deleted upload ${uploadId} for project ${projectId}`);
        res.json({ ok: true });
    } catch (err) {
        console.error('[IFC Storage] Delete failed:', err);
        res.status(500).json({ error: String(err.message ?? err) });
    }
});

/** Strip file_data from upload rows before sending to clients. */
function _sanitiseUploadRow(row) {
    if (!row) return row;
    const { file_data: _, ...rest } = row;
    return rest;
}

// ── Plan API (Phase 4 — monetisation hardening) ───────────────────────────────

/**
 * GET /api/me/plan
 *
 * Returns the authenticated user's current plan, status, and computed limits.
 * The client EntitlementStore caches this response for 5 minutes (TTL cache).
 *
 * Security:
 *   • authMiddleware ensures the caller is authenticated before the route runs.
 *   • Plan data comes from the server-authoritative planStore — never from
 *     the client-supplied body.
 *
 * Response shape (HTTP 200):
 *   { plan: string, planStatus: string, limits: object }
 */
app.get('/api/me/plan', authMiddleware, (req, res) => {
    const userId = req.auth?.userId ?? 'anonymous';
    const email  = req.auth?.email ?? null;

    // Owner email bypass: ensure the in-memory plan is 'owner' so all
    // downstream plan reads (including client sync) see the correct tier.
    const _ownerEmail = process.env.PRYZM_OWNER_EMAIL;
    if (_ownerEmail && email && email.toLowerCase().trim() === _ownerEmail.toLowerCase().trim()) {
        setUserPlan(userId, 'owner');
    }

    const plan = getUserPlan(userId);

    const isPaid = plan !== 'free';
    const isOwner = plan === 'owner';

    const VERSION_LIMITS = { free: 1, architect: 15, studio: -1, firm: -1, enterprise: -1, owner: -1 };
    const AI_LIMITS      = { free: 5, architect: 50, studio: 200, firm: 500, enterprise: -1, owner: -1 };
    const maxVersions    = VERSION_LIMITS[plan] ?? 1;
    const aiActions      = AI_LIMITS[plan] ?? 5;

    res.json({
        plan,
        planStatus: 'active',
        limits: {
            maxVersionsPerProject: maxVersions,
            aiActionsPerMonth: aiActions,
            hasVersionHistory:  isPaid,
            hasIFCExport:       isPaid,
            hasGLBExport:       isPaid,
            hasPDFExport:       isPaid,
            hasCesium:          isPaid,
            hasCollaboration:   isOwner || plan === 'studio' || plan === 'firm' || plan === 'enterprise',
            hasAllAITools:      isPaid,
        },
    });
});

// ── Project API (Phase 3) ─────────────────────────────────────────────────────

app.get('/api/projects', authMiddleware, async (req, res) => {
    const userId = req.auth?.userId ?? 'anonymous';
    try {
        const supabase = await getSupabaseClient();

        // Fetch from Supabase when available.
        let supabaseProjects = [];
        if (supabase) {
            const { data, error } = await supabase
                .from('projects').select('id,name,updated_at,version_count,owner_id,thumbnail')
                .eq('owner_id', userId)
                .order('updated_at', { ascending: false }).limit(50);
            if (error) throw error;
            supabaseProjects = data ?? [];
        }

        // Always also fetch from Replit PG when available.
        // This ensures projects created before Supabase was configured (or during
        // the Supabase-unavailable window) remain visible after Supabase is activated.
        // CONTRACT: C13 — Project Lifecycle; projects must never silently disappear.
        if (getPgPool()) {
            const pgProjects = await pgProjectStore.listProjects(userId);
            if (supabase) {
                // Merge: Supabase is authoritative for shared state; PG-only projects
                // (not yet in Supabase) are appended so they remain visible.
                const supabaseIds = new Set(supabaseProjects.map(p => p.id));
                const pgOnly = pgProjects.filter(p => !supabaseIds.has(p.id));
                const merged = [...supabaseProjects, ...pgOnly].sort((a, b) => {
                    const ta = new Date(a.updated_at ?? 0).getTime() || (a.updatedAt ?? 0);
                    const tb = new Date(b.updated_at ?? 0).getTime() || (b.updatedAt ?? 0);
                    return tb - ta;
                });
                return res.json({ projects: merged });
            }
            return res.json({ projects: pgProjects });
        }

        if (supabase) {
            return res.json({ projects: supabaseProjects });
        }

        // Final fallback: in-memory store (no database configured).
        const projects = Array.from(_projects.values())
            .filter(p => p.ownerId === userId || userId === 'anonymous')
            .sort((a, b) => b.updatedAt - a.updatedAt);
        res.json({ projects });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// C08 §2.1 exempt: user creates their own project; owner is always req.auth.userId.
// No cross-project permission needed — the created project is owned by the caller.
app.post('/api/projects', authMiddleware, async (req, res) => {
    try {
        const { name = 'Untitled Project', id: clientId } = req.body;
        // Accept client-generated ID if it matches the expected format (proj-TIMESTAMP-ALPHANUM).
        // This allows the client to open the project immediately before the server round-trip
        // completes, while still ensuring the server row uses the same stable ID.
        const isValidClientId = clientId && /^proj-\d+-[a-z0-9]+$/.test(clientId);
        const supabase = await getSupabaseClient();
        if (supabase) {
            const id = isValidClientId ? clientId : `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
            // CONTRACT (C13 — race-window fix): Seed _projects in-memory immediately so that
            // the Socket.io join-project check (canUserAccessProject path 3) can authorize the
            // client during the window between this optimistic open and the Supabase INSERT
            // completing.  The in-memory entry is intentionally short-lived — once the Supabase
            // row exists, path 1 takes over and the in-memory entry is simply ignored.
            _projects.set(id, { id, name, updatedAt: Date.now(), versionCount: 0, ownerId: req.auth.userId });
            const { data, error } = await supabase
                .from('projects').insert({ id, name, owner_id: req.auth.userId })
                .select().single();
            if (error) {
                _projects.delete(id); // rollback in-memory seed on Supabase failure
                throw error;
            }
            return res.status(201).json({ project: data });
        }
        if (getPgPool()) {
            const project = await pgProjectStore.createProject(name, req.auth.userId);
            // Also seed in-memory for join-project race window (PG path).
            _projects.set(project.id, { id: project.id, name: project.name, updatedAt: Date.now(), versionCount: 0, ownerId: req.auth.userId });
            return res.status(201).json({ project });
        }
        const id = isValidClientId ? clientId : `proj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        const meta = { id, name, updatedAt: Date.now(), versionCount: 0, ownerId: req.auth.userId };
        _projects.set(id, meta);
        res.status(201).json({ project: meta });
    } catch (err) {
        // §SCHEMA-GUARD: a missing `projects` table (Supabase schema never applied)
        // surfaces here as a PostgREST / Postgres "relation does not exist" error.
        // Return an actionable 503 instead of an opaque 500 so the operator knows
        // to apply server/schema.sql — see server/supabaseMigrate.js header.
        const m = err?.message ?? String(err);
        const code = err?.code ?? '';
        const schemaMissing =
            code === '42P01' || code === 'PGRST205' || code === 'PGRST116' ||
            /relation .* does not exist|could not find the table|schema cache/i.test(m);
        if (schemaMissing) {
            console.error('[POST /api/projects] Supabase schema not applied — cannot create project:', m);
            return res.status(503).json({
                error: 'Database schema not applied. Open the Supabase SQL Editor, run the contents of server/schema.sql, then restart the server.',
                code: 'schema_not_applied',
            });
        }
        console.error('[POST /api/projects] project creation failed:', m);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── GET /api/projects/:id/status ─────────────────────────────────────────────
//   GAP-17 fix: lightweight metadata without the snapshot column.
//   Returns { id, name, versionCount, updatedAt, latestVersionId, latestVersionLabel,
//             latestVersionCreatedAt, latestElementCount, isEmpty }.
//   Client can compare latestVersionId against its local cache to decide whether
//   to skip the full snapshot download.
app.get('/api/projects/:id/status', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });
    if (!pgProjectStore.isValidProjectId(id)) {
        return res.status(400).json({ error: 'Invalid project ID format', code: 'invalid_id' });
    }
    try {
        // PG path: use LEFT JOIN LATERAL (single query, no snapshot column)
        if (getPgPool()) {
            const status = await pgProjectStore.getProjectStatus(id, userId);
            if (!status) return res.status(404).json({ error: 'Project not found', code: 'project_not_found' });
            // GAP-13: ETag — prefer latestVersionId for maximum granularity
            res.set('ETag', `"${status.latestVersionId ?? `v${status.versionCount}`}"`);
            return res.json({ status });
        }
        // Supabase path: two lightweight queries (no snapshot column)
        const supabase = await getSupabaseClient();
        if (supabase) {
            const { data: proj, error: pe } = await supabase
                .from('projects')
                .select('id, name, version_count, updated_at')
                .eq('id', id).eq('owner_id', userId).maybeSingle();
            if (pe) return res.status(500).json({ error: 'Database error' });
            if (!proj) return res.status(404).json({ error: 'Project not found', code: 'project_not_found' });
            const { data: vers } = await supabase
                .from('project_versions')
                .select('id, label, created_at, element_count')
                .eq('project_id', id)
                .order('created_at', { ascending: false })
                .limit(1);
            const latest = vers?.[0] ?? null;
            const statusBody = {
                id:                     proj.id,
                name:                   proj.name,
                versionCount:           proj.version_count,
                updatedAt:              proj.updated_at,
                latestVersionId:        latest?.id ?? null,
                latestVersionLabel:     latest?.label ?? null,
                latestVersionCreatedAt: latest?.created_at ?? null,
                latestElementCount:     latest?.element_count ?? 0,
                isEmpty:                latest === null,
            };
            // GAP-13: ETag
            res.set('ETag', `"${statusBody.latestVersionId ?? `v${statusBody.versionCount}`}"`);
            return res.json({ status: statusBody });
        }
        // In-memory fallback
        const proj = _projects.get(id);
        if (!proj || (userId !== 'anonymous' && proj.ownerId !== userId)) {
            return res.status(404).json({ error: 'Project not found', code: 'project_not_found' });
        }
        res.set('ETag', `"v0"`);
        return res.json({ status: {
            id: proj.id, name: proj.name, versionCount: 0, updatedAt: proj.updatedAt,
            latestVersionId: null, latestVersionLabel: null, latestVersionCreatedAt: null,
            latestElementCount: 0, isEmpty: true,
        }});
    } catch (err) {
        console.error('[GET /api/projects/:id/status]', err);
        res.status(500).json({ error: 'Internal server error', code: 'server_error' });
    }
});

app.get('/api/projects/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.auth?.userId ?? 'anonymous';
    // GAP-04 fix: validate caller-supplied ID against an allowlist before any DB call.
    if (!pgProjectStore.isValidProjectId(id)) {
        return res.status(400).json({ error: 'Invalid project ID format', code: 'invalid_id' });
    }
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            // GAP-02 fix: use maybeSingle() so "no rows" → data=null (→ 404) and
            // real DB errors (timeout, connection refused) → error (→ 500), not both 404.
            const { data, error } = await supabase
                .from('projects').select('*').eq('id', id).eq('owner_id', userId).maybeSingle();
            if (error) {
                console.error('[api/projects/:id] Supabase error:', error.message);
                return res.status(500).json({ error: 'Database error fetching project' });
            }
            if (!data) return res.status(404).json({ error: 'Not found' });
            // GAP-13: ETag on Supabase path
            res.set('ETag', `"v${data.version_count ?? 0}"`);
            return res.json({ project: data });
        }
        if (getPgPool()) {
            const project = await pgProjectStore.getProject(id, userId);
            if (!project) return res.status(404).json({ error: 'Not found' });
            // GAP-13: ETag on PG path
            res.set('ETag', `"v${project.version_count ?? 0}"`);
            return res.json({ project });
        }
        const proj = _projects.get(id);
        if (!proj) return res.status(404).json({ error: 'Not found' });
        if (userId !== 'anonymous' && proj.ownerId !== userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        res.set('ETag', `"v${proj.versionCount ?? 0}"`);
        res.json({ project: proj });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── DELETE /api/projects/:id ──────────────────────────────────────────────────
//   Permanently deletes a project and all its versions from the server DB.
//   Called by ProjectHub when the user confirms project deletion.
// C08 §2.1 — ownership enforced by .eq('owner_id', userId) in Supabase path and
//   deleteProject(id, userId) ownership check in pg/in-memory paths. Only the
//   project owner can delete the project. No anonymous path reachable (authMiddleware).

app.delete('/api/projects/:id', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.auth?.userId ?? req.auth?.id ?? 'anonymous';
    // GAP-04 fix: validate ID before any DB call.
    if (!pgProjectStore.isValidProjectId(id)) {
        return res.status(400).json({ error: 'Invalid project ID format', code: 'invalid_id' });
    }
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            // GAP-14 fix (Supabase path): removed explicit DELETE of project_versions.
            // The schema declares ON DELETE CASCADE on project_versions.project_id so
            // deleting the projects row atomically cascades to all version rows.
            const { error } = await supabase
                .from('projects').delete().eq('id', id).eq('owner_id', userId);
            if (error) return res.status(500).json({ error: error.message });
            return res.json({ deleted: true });
        }
        if (getPgPool()) {
            const deleted = await pgProjectStore.deleteProject(id, userId);
            if (!deleted) return res.status(404).json({ error: 'Project not found or access denied.' });
            return res.json({ deleted: true });
        }
        // In-memory fallback
        if (!_projects.has(id)) return res.status(404).json({ error: 'Project not found.' });
        _projects.delete(id);
        return res.json({ deleted: true });
    } catch (err) {
        console.error('[DELETE /api/projects/:id]', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── PATCH /api/projects/:id/thumbnail ────────────────────────────────────────
//   Stores a project's preview thumbnail (base64 WebP) server-side so it
//   is visible on any browser/session without having to open the model first.
//   Body: { thumbnail: "data:image/webp;base64,..." }
// C08 §2.1 — ownership enforced by .eq('owner_id', userId) / pgUpdateProjectThumbnail(id, userId) /
//   proj.ownerId !== userId checks in all three DB paths. authMiddleware gates anonymous callers.

app.patch('/api/projects/:id/thumbnail', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.auth?.userId ?? req.auth?.id ?? 'anonymous';
    // GAP-04 fix: validate ID before any DB call.
    if (!pgProjectStore.isValidProjectId(id)) {
        return res.status(400).json({ error: 'Invalid project ID format', code: 'invalid_id' });
    }
    const { thumbnail } = req.body ?? {};
    if (typeof thumbnail !== 'string' || !thumbnail.startsWith('data:image/')) {
        return res.status(400).json({ error: 'thumbnail must be a data: image string' });
    }
    // Enforce ~50 KB ceiling (base64 ~= 4/3 × binary; 400×225 WebP @ 0.72 ≈ 5–20 KB)
    if (thumbnail.length > 65536) {
        return res.status(413).json({ error: 'thumbnail too large (max ~50 KB)' });
    }
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            const { error } = await supabase
                .from('projects')
                .update({ thumbnail })
                .eq('id', id)
                .eq('owner_id', userId);
            if (error) {
                // Detect missing column — user needs to apply the schema migration manually.
                if (error.message?.includes('thumbnail') || error.code === 'PGRST204') {
                    console.warn('[PATCH /api/projects/:id/thumbnail] Column missing — apply: ALTER TABLE projects ADD COLUMN IF NOT EXISTS thumbnail TEXT;');
                    return res.status(503).json({ error: 'thumbnail column not yet applied — run schema migration in Supabase SQL Editor' });
                }
                return res.status(500).json({ error: error.message });
            }
            return res.json({ ok: true });
        }
        if (getPgPool()) {
            await pgUpdateProjectThumbnail(id, userId, thumbnail);
            return res.json({ ok: true });
        }
        // In-memory fallback
        const proj = _projects.get(id);
        if (!proj) return res.status(404).json({ error: 'Project not found.' });
        if (proj.ownerId !== userId) return res.status(403).json({ error: 'Forbidden' });
        proj.thumbnail = thumbnail;
        return res.json({ ok: true });
    } catch (err) {
        console.error('[PATCH /api/projects/:id/thumbnail]', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── Version API (Phase 4D) ────────────────────────────────────────────────────

app.get('/api/projects/:id/versions', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.auth?.userId;
    // Project-isolation: require authenticated ownership before returning versions.
    // Without this check any authenticated user could read another user's project
    // versions by guessing or observing a project ID.
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });
    // GAP-04 fix: validate ID before any DB call.
    if (!pgProjectStore.isValidProjectId(id)) {
        return res.status(400).json({ error: 'Invalid project ID format', code: 'invalid_id' });
    }
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            // Verify the caller owns (or can access) this project first.
            const { data: proj } = await supabase
                .from('projects')
                .select('id')
                .eq('id', id)
                .eq('owner_id', userId)
                .maybeSingle();
            if (!proj) return res.status(404).json({ error: 'Project not found.' });

            const { data, error } = await supabase
                .from('project_versions')
                .select('id,project_id,label,created_at,element_count')
                .eq('project_id', id).order('created_at', { ascending: false }).limit(20);
            if (error) throw error;
            return res.json({ versions: data });
        }
        if (getPgPool()) {
            // pg path: canUserAccessProject is checked by the pg store layer.
            const versions = await pgProjectStore.listVersions(id, userId);
            return res.json({ versions });
        }
        // In-memory fallback: scope by userId stored in project meta.
        const proj = _projects.get(id);
        if (!proj || proj.ownerId !== userId) {
            return res.status(404).json({ error: 'Project not found.' });
        }
        const versions = (_versions.get(id) ?? []).slice().reverse()
            .map(v => ({ id: v.id, projectId: v.projectId, label: v.label, timestamp: v.timestamp, elementCount: v.elementCount }));
        res.json({ versions });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── GET /api/projects/:id/latest-version ──────────────────────────────────────
// Combined endpoint: returns the full snapshot of the most recent version in a
// single round trip (vs. GET /versions followed by GET /versions/:vid = 2 trips).
// Used by PlatformShell.loadLatestVersionFromServer() to speed up project opens.

app.get('/api/projects/:id/latest-version', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            // Single query: verify ownership and fetch latest version snapshot together.
            const { data: proj } = await supabase
                .from('projects').select('id').eq('id', id).eq('owner_id', userId).maybeSingle();
            if (!proj) return res.status(404).json({ error: 'Project not found.' });

            const { data, error } = await supabase
                .from('project_versions')
                .select('id,project_id,label,created_at,element_count,snapshot')
                .eq('project_id', id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            if (!data) return res.json({ version: null });
            // GAP-13: ETag on latest-version (version ID is the most precise cache key)
            res.set('ETag', `"${data.id}"`);
            return res.json({ version: data });
        }
        if (getPgPool()) {
            const versions = await pgProjectStore.listVersions(id, userId);
            if (!versions || versions.length === 0) return res.json({ version: null });
            const latest = versions[0];
            const full = await pgProjectStore.getVersion(latest.id, id, userId);
            if (full) res.set('ETag', `"${full.id}"`);
            return res.json({ version: full ?? null });
        }
        // In-memory fallback
        const proj = _projects.get(id);
        if (!proj || proj.ownerId !== userId) return res.status(404).json({ error: 'Project not found.' });
        const all = (_versions.get(id) ?? []).slice().reverse();
        if (all.length === 0) return res.json({ version: null });
        res.set('ETag', `"${all[0].id}"`);
        return res.json({ version: all[0] });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// C08 §2.1 — First-save creation pattern: if the project does not yet exist,
//   the authenticated user creates it (becomes owner via ignoreDuplicates:true upsert below).
//   If the project already exists, the upsert is a no-op and the caller must be the owner
//   (or a project member with write access) — enforced by the upsert owner_id being set to
//   req.auth.userId, which will only succeed for the owner. Plan check (VERSION_LIMITS) is
//   the primary authorization gate. Version writes are scoped by project_id + created_by.
app.post('/api/projects/:id/versions', authMiddleware, async (req, res) => {
    const { id } = req.params;
    // GAP-04 fix: validate caller-supplied project ID before any DB call.
    if (!pgProjectStore.isValidProjectId(id)) {
        return res.status(400).json({ error: 'Invalid project ID format', code: 'invalid_id' });
    }
    const { label = 'Version', snapshot, elementCount = 0, versionId: clientVersionId } = req.body;
    if (!snapshot) return res.status(400).json({ error: 'snapshot is required' });

    // ── GAP-06: Optimistic locking — parse If-Match header ────────────────────
    // Client may send `If-Match: "v5"` meaning "only save if the project currently
    // has exactly 5 versions". On mismatch the server returns HTTP 412 Precondition
    // Failed with { code: "precondition_failed", expected, actual }.
    // On the PG path the check runs inside the FOR UPDATE lock (fully atomic).
    // On the Supabase path the check is advisory-only (no server-side transaction).
    const ifMatchHeader = req.headers['if-match'];
    let expectedVersionCount;
    if (ifMatchHeader) {
        const m = ifMatchHeader.replace(/"/g, '').match(/^v(\d+)$/);
        if (m) expectedVersionCount = parseInt(m[1], 10);
    }

    // ── GAP-05: Server-side snapshot size cap ─────────────────────────────────
    // 50 MB is generous for typical BIM models (hundreds of elements) but blocks
    // runaway payloads before they hit Supabase's nginx 413 limit without a
    // structured error body.  Checked before Zod validation and any DB write so
    // no partial state is persisted on rejection.
    const SNAPSHOT_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB
    const _snapshotBytes = Buffer.byteLength(JSON.stringify(snapshot), 'utf8');
    if (_snapshotBytes > SNAPSHOT_LIMIT_BYTES) {
        return handleProjectApiError(
            new SnapshotTooLargeError(_snapshotBytes, SNAPSHOT_LIMIT_BYTES),
            res, 'api/projects/:id/versions POST'
        );
    }

    // §03 §1.7 / §16 §3 — server-side schema validation for incoming
    // version snapshots. We keep the schema permissive (passthrough) so
    // unknown legacy fields are not rejected, but the furniture array is
    // strictly typed: each entry must carry the IDs and dimensions the
    // serializer/loader pipeline expects. Catches drift before we persist
    // a corrupt snapshot that could later fail to deserialize.
    const point3D = z.object({
        x: z.number(), y: z.number(), z: z.number(),
    }).passthrough();
    const eulerDTO = z.object({
        x: z.number(), y: z.number(), z: z.number(),
        order: z.string().optional(),
    }).passthrough();
    const furnitureSchema = z.object({
        id:            z.string().min(1),
        furnitureType: z.string().min(1),
        position:      point3D,
        rotation:      eulerDTO,
        levelId:       z.string().min(1),
        width:         z.number().positive(),
        length:        z.number().positive(),
        height:        z.number().positive(),
        baseOffset:    z.number().optional(),
        material:      z.string().optional(),
        color:         z.string().optional(),
        mark:          z.string().optional(),
        hostedSpaceId: z.string().nullable().optional(),
    }).passthrough();
    const snapshotSchema = z.object({
        furniture: z.array(furnitureSchema).optional(),
    }).passthrough();
    const validation = snapshotSchema.safeParse(snapshot);
    if (!validation.success) {
        const flat = validation.error.issues.slice(0, 10).map(i => `${i.path.join('.')}: ${i.message}`);
        return res.status(400).json({
            error: 'Invalid snapshot payload',
            issues: flat,
        });
    }

    // ── Phase 2: Idempotency key deduplication ────────────────────────────────
    // The client sends the version ID it already wrote to localStorage as
    // X-Idempotency-Key (and also as versionId in the body).
    // If we have already stored a version with this ID, return 200 instead of
    // creating a duplicate — safe for retry storms on reconnect.
    const idempotencyKey = req.headers['x-idempotency-key'] || clientVersionId;

    // ── H6: Server-side version limit enforcement ─────────────────────────────
    // Limits mirror PlanConfig.ts PLAN_LIMITS.maxVersionsPerProject.
    // The server is the authoritative gate — client-side checks are advisory only.
    const VERSION_LIMITS = { free: 0, architect: 15, studio: -1, firm: -1, enterprise: -1, owner: -1 };
    const userId = req.auth?.userId ?? 'anonymous';
    const _vEmail = req.auth?.email ?? null;
    const _vOwnerEmail = process.env.PRYZM_OWNER_EMAIL;
    if (_vOwnerEmail && _vEmail && _vEmail.toLowerCase().trim() === _vOwnerEmail.toLowerCase().trim()) {
        setUserPlan(userId, 'owner');
    }
    const plan = getUserPlan(userId);
    const maxVersions = VERSION_LIMITS[plan] ?? 0;

    if (maxVersions === 0) {
        return res.status(403).json({
            error: 'Version history is not available on your current plan.',
            plan,
            upgrade: 'architect',
        });
    }

    try {
        const supabase = await getSupabaseClient();

        // ── Idempotency check (Supabase path) ────────────────────────────────
        if (supabase && idempotencyKey) {
            const { data: dupCheck } = await supabase
                .from('project_versions')
                .select('id,project_id,label,created_at,element_count')
                .eq('id', idempotencyKey)
                .eq('project_id', id)
                .maybeSingle();
            if (dupCheck) {
                console.log(`[api/versions] Idempotency hit for key ${idempotencyKey} — returning existing record`);
                return res.status(200).json({ version: dupCheck, deduplicated: true });
            }
        }

        // ── Idempotency check (pg path) ───────────────────────────────────────
        if (!supabase && getPgPool() && idempotencyKey) {
            const existingPg = await pgProjectStore.getVersionByIdempotencyKey(id, idempotencyKey);
            if (existingPg) {
                console.log(`[api/versions] Idempotency hit (pg) for key ${idempotencyKey}`);
                return res.status(200).json({ version: existingPg, deduplicated: true });
            }
        }

        // ── Idempotency check (in-memory path) ───────────────────────────────
        if (!supabase && !getPgPool() && idempotencyKey) {
            const existingInMem = (_versions.get(id) ?? []).find(v => v.id === idempotencyKey);
            if (existingInMem) {
                console.log(`[api/versions] Idempotency hit (in-memory) for key ${idempotencyKey}`);
                return res.status(200).json({
                    version: { id: existingInMem.id, projectId: id, label: existingInMem.label, timestamp: existingInMem.timestamp, elementCount: existingInMem.elementCount },
                    deduplicated: true,
                });
            }
        }

        // ── Backend dispatch — three paths, each returns early ────────────────

        // ── Supabase path (GAP-01 + GAP-03) ──────────────────────────────────
        if (supabase) {
            const versionId = (typeof idempotencyKey === 'string' && idempotencyKey)
                ? idempotencyKey
                : `ver-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

            // ── [GAP-06] Advisory optimistic-locking check (Supabase path) ───
            // Best-effort (not inside a PG transaction). The PG path uses a
            // FOR UPDATE lock for full atomicity. This advisory check prevents
            // the most common case: a client still replying to a stale version count.
            if (expectedVersionCount !== undefined) {
                const { data: vCountRow } = await supabase
                    .from('projects')
                    .select('version_count')
                    .eq('id', id)
                    .eq('owner_id', req.auth.userId)
                    .maybeSingle();
                if (vCountRow) {
                    const actual = parseInt(vCountRow.version_count ?? 0, 10);
                    if (actual !== expectedVersionCount) {
                        throw new PreconditionFailedError(expectedVersionCount, actual);
                    }
                }
            }

            // ── [GAP-01] Attempt atomic RPC first ────────────────────────────
            // pryzm_save_version() is a PL/pgSQL function (server/schema.sql) that
            // wraps the upsert + ownership check + count check + insert + touch into
            // a single server-side transaction, eliminating the TOCTOU race window
            // that exists when those steps are issued as separate PostgREST calls.
            const { data: rpcData, error: rpcError } = await supabase.rpc('pryzm_save_version', {
                p_version_id:      versionId,
                p_project_id:      id,
                p_project_name:    (snapshot?.projectName ?? 'Untitled').slice(0, 200),
                p_owner_id:        req.auth.userId,
                p_label:           label,
                p_snapshot:        snapshot,
                p_element_count:   elementCount,
                p_idempotency_key: idempotencyKey || versionId,
                p_max_versions:    maxVersions,
            });

            if (!rpcError) {
                // RPC succeeded — rpcData is the JSONB version row returned by the function
                if (io) io.to(`project:${id}`).emit('version-saved', { versionId, label, elementCount });
                deliverWebhookEvent(id, 'model.saved', { versionId, label, elementCount, projectId: id }).catch(() => {});
                return res.status(201).json({ version: rpcData });
            }

            // ── Parse structured errors emitted by the RPC ────────────────────
            const rpcMsg = rpcError.message ?? '';
            if (rpcMsg.includes('PROJECT_CONFLICT')) {
                throw new ProjectConflictError(id, 'Project is owned by a different user');
            }
            if (rpcMsg.includes('VERSION_LIMIT_EXCEEDED')) {
                throw new VersionLimitError(plan, maxVersions, -1);
            }

            // ── Function not yet applied → fall back to manual steps ──────────
            // PGRST202 = "Could not find the function" — supabaseMigrate.js warns
            // the operator on startup when this is the case.
            const isFnMissing = rpcError.code === 'PGRST202'
                || rpcMsg.includes('Could not find the function')
                || rpcMsg.includes('pryzm_save_version');
            if (!isFnMissing) throw rpcError; // Real DB error — surface it

            // ── [Fallback] Manual upsert + ownership check + count + insert ───
            // C08 §2.1 — ignoreDuplicates:true prevents a version-save from
            // overwriting the existing owner_id (privilege escalation via upsert).
            // If the project row already exists the upsert is a no-op; the existing
            // owner retains ownership.  If the project does not exist it is created
            // with the authenticated caller as owner (first-save creation pattern).
            await supabase.from('projects').upsert({
                id,
                owner_id: req.auth.userId,
                name: (snapshot?.projectName ?? 'Untitled').slice(0, 200),
            }, { onConflict: 'id', ignoreDuplicates: true });

            // [GAP-03] Verify the stored owner_id matches the caller.
            // ignoreDuplicates makes the upsert a no-op when the row already exists,
            // so we must read the row back to confirm ownership — the upsert alone
            // cannot distinguish "I am the owner" from "someone else is the owner".
            const { data: projOwnerRow } = await supabase
                .from('projects').select('owner_id').eq('id', id).maybeSingle();
            if (projOwnerRow && projOwnerRow.owner_id !== req.auth.userId) {
                throw new ProjectConflictError(id, 'Project is owned by a different user');
            }

            // Version limit check (manual fallback path)
            if (maxVersions !== -1) {
                const { count } = await supabase
                    .from('project_versions')
                    .select('id', { count: 'exact', head: true })
                    .eq('project_id', id);
                const existingCount = count ?? 0;
                if (existingCount >= maxVersions) {
                    throw new VersionLimitError(plan, maxVersions, existingCount);
                }
            }

            const { data, error } = await supabase.from('project_versions')
                .insert({ id: versionId, project_id: id, label, snapshot, element_count: elementCount, created_by: req.auth.userId })
                .select('id,project_id,label,created_at,element_count').single();
            if (error) throw error;
            if (io) io.to(`project:${id}`).emit('version-saved', { versionId, label, elementCount });
            deliverWebhookEvent(id, 'model.saved', { versionId, label, elementCount, projectId: id }).catch(() => {});
            return res.status(201).json({ version: data });
        }

        // ── PostgreSQL path (GAP-01 + GAP-03 + GAP-06: fully atomic transaction) ─
        // createVersionTransactional() acquires a FOR UPDATE lock on the projects
        // row, verifies ownership, checks optimistic-locking precondition, counts
        // versions, inserts the version, and updates version_count — all inside a
        // single BEGIN/COMMIT transaction.
        if (getPgPool()) {
            const version = await pgProjectStore.createVersionTransactional({
                versionId: (typeof idempotencyKey === 'string' && idempotencyKey) ? idempotencyKey : undefined,
                projectId:   id,
                projectName: snapshot?.projectName ?? 'Untitled',
                userId:      req.auth.userId,
                label,
                snapshot,
                elementCount,
                idempotencyKey: idempotencyKey || undefined,
                maxVersions,
                plan,
                expectedVersionCount,
            });
            if (io) io.to(`project:${id}`).emit('version-saved', { versionId: version?.id, label, elementCount });
            deliverWebhookEvent(id, 'model.saved', { versionId: version?.id, label, elementCount, projectId: id }).catch(() => {});
            return res.status(201).json({ version });
        }

        // ── In-memory fallback ────────────────────────────────────────────────
        const versionId = (typeof idempotencyKey === 'string' && idempotencyKey)
            ? idempotencyKey
            : `ver-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        // [GAP-03] In-memory ownership check
        if (_projects.has(id) && _projects.get(id).ownerId !== req.auth.userId) {
            throw new ProjectConflictError(id, 'Project is owned by a different user');
        }

        // [GAP-07] Typed version limit for in-memory path
        if (maxVersions !== -1) {
            const existingCount = (_versions.get(id) ?? []).length;
            if (existingCount >= maxVersions) {
                throw new VersionLimitError(plan, maxVersions, existingCount);
            }
        }

        if (!_projects.has(id)) {
            _projects.set(id, { id, name: (snapshot?.projectName ?? 'Untitled').slice(0, 200), updatedAt: Date.now(), versionCount: 0, ownerId: req.auth.userId });
        }

        const version = { id: versionId, projectId: id, label, timestamp: Date.now(), elementCount, snapshot };
        const existing = _versions.get(id) ?? [];
        existing.push(version);
        if (existing.length > 20) existing.splice(0, existing.length - 20);
        _versions.set(id, existing);

        const proj = _projects.get(id);
        if (proj) { proj.updatedAt = Date.now(); proj.versionCount = existing.length; }

        if (io) io.to(`project:${id}`).emit('version-saved', { versionId, label, elementCount });
        deliverWebhookEvent(id, 'model.saved', { versionId, label, elementCount, projectId: id }).catch(() => {});
        res.status(201).json({ version: { id: versionId, projectId: id, label, timestamp: Date.now(), elementCount } });
    } catch (err) {
        // [GAP-07] Typed error handler — maps ProjectConflictError, VersionLimitError,
        // SnapshotTooLargeError, etc. to their correct HTTP status codes without
        // leaking internal error strings to the client.
        return handleProjectApiError(err, res, 'api/projects/:id/versions POST');
    }
});

// ── GET /api/projects/:id/command-log ────────────────────────────────────────
//   GAP-11 fix: command-log delta replay endpoint.
//
//   Returns project_command_log entries after an optional `after` cursor
//   (ISO 8601 timestamp). A reconnecting client passes its last-seen timestamp
//   to receive only the commands it missed, eliminating the need for a full
//   snapshot resend on reconnect.
//
//   Query params:
//     after  — ISO 8601 timestamp cursor (exclusive); omit to fetch from the start
//     limit  — max entries to return (default 100, capped at 500)
//
//   Response: { commands: [...], hasMore: boolean, nextCursor: string | null }
//     nextCursor is the created_at of the last returned command, or null if
//     hasMore is false — pass it as `after` on the next request for pagination.
//
//   Contract: C08 §2.1 — ownership check required before returning log entries.
//   Rate limited by globalLimiter (applied to all /api/* routes above).
app.get('/api/projects/:id/command-log', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });
    if (!pgProjectStore.isValidProjectId(id)) {
        return res.status(400).json({ error: 'Invalid project ID format', code: 'invalid_id' });
    }
    const { after, limit } = req.query;
    const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 100), 500);
    try {
        if (getPgPool()) {
            // Verify ownership before exposing command log
            const project = await pgProjectStore.getProject(id, userId);
            if (!project) return res.status(404).json({ error: 'Project not found', code: 'project_not_found' });
            const commands = await pgProjectStore.getCommandLogAfter(id, after, safeLimit);
            const hasMore = commands.length === safeLimit;
            const nextCursor = (hasMore && commands.length > 0)
                ? commands[commands.length - 1].created_at
                : null;
            return res.json({ commands, hasMore, nextCursor });
        }
        const supabase = await getSupabaseClient();
        if (supabase) {
            const { data: proj } = await supabase
                .from('projects').select('id').eq('id', id).eq('owner_id', userId).maybeSingle();
            if (!proj) return res.status(404).json({ error: 'Project not found', code: 'project_not_found' });
            let q = supabase
                .from('project_command_log')
                .select('id, project_id, user_id, command_type, payload, created_at')
                .eq('project_id', id)
                .order('created_at', { ascending: true })
                .limit(safeLimit);
            if (after) q = q.gt('created_at', after);
            const { data, error } = await q;
            if (error) throw error;
            const commands = data ?? [];
            const hasMore = commands.length === safeLimit;
            const nextCursor = (hasMore && commands.length > 0)
                ? commands[commands.length - 1].created_at
                : null;
            return res.json({ commands, hasMore, nextCursor });
        }
        // In-memory: command log not persisted
        return res.json({ commands: [], hasMore: false, nextCursor: null });
    } catch (err) {
        console.error('[GET /api/projects/:id/command-log]', err);
        return res.status(500).json({ error: 'Internal server error', code: 'server_error' });
    }
});

app.get('/api/projects/:id/versions/:vid', authMiddleware, async (req, res) => {
    const { id, vid } = req.params;
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Authentication required.' });
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            // Project-isolation: verify ownership before returning the snapshot.
            const { data: proj } = await supabase
                .from('projects').select('id').eq('id', id).eq('owner_id', userId).maybeSingle();
            if (!proj) return res.status(404).json({ error: 'Not found' });

            const { data, error } = await supabase
                .from('project_versions').select('*').eq('id', vid).eq('project_id', id).single();
            if (error) return res.status(404).json({ error: 'Not found' });
            return res.json({ version: data });
        }
        if (getPgPool()) {
            const ver = await pgProjectStore.getVersionById(id, vid, userId);
            if (!ver) return res.status(404).json({ error: 'Not found' });
            return res.json({ version: ver });
        }
        // In-memory fallback: scope by userId.
        const proj = _projects.get(id);
        if (!proj || proj.ownerId !== userId) return res.status(404).json({ error: 'Not found' });
        const versions = _versions.get(id) ?? [];
        const ver = versions.find(v => v.id === vid);
        if (!ver) return res.status(404).json({ error: 'Not found' });
        res.json({ version: ver });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

function normalizeVisibilityIntentRow(row) {
    // modifiers column may be an array (legacy: viewTypeModifiers only)
    // or an object { viewTypeModifiers, purposeModifiers, planViewRange } (current format).
    const raw = row.modifiers ?? row.rules_modifiers;
    const isObj = raw && typeof raw === 'object' && !Array.isArray(raw);
    const viewTypeModifiers = isObj ? (raw.viewTypeModifiers ?? []) : (Array.isArray(raw) ? raw : []);
    const purposeModifiers = isObj ? (raw.purposeModifiers ?? []) : [];
    const planViewRange = isObj ? (raw.planViewRange ?? null) : null;
    return {
        id: row.id,
        projectId: row.project_id ?? row.projectId,
        name: row.name,
        description: row.description ?? '',
        version: row.version ?? 1,
        isSystem: row.is_system ?? row.isSystem ?? false,
        rules: row.rules ?? {},
        modifiers: viewTypeModifiers,
        purposeModifiers,
        planViewRange,
        createdAt: row.created_at ?? row.createdAt,
        updatedAt: row.updated_at ?? row.updatedAt,
    };
}

function visibilityIntentPayload(body, fallbackId = null) {
    const source = body.intent && typeof body.intent === 'object' ? body.intent : body;
    const viewTypeModifiers = source.modifiers ?? source.viewTypeModifiers ?? [];
    const purposeModifiers = source.purposeModifiers ?? [];
    const planViewRange = source.planViewRange ?? null;
    return {
        id: source.id ?? fallbackId ?? `vi-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: source.name,
        description: source.description ?? '',
        version: source.version ?? 1,
        is_system: false,
        rules: source.rules ?? source.elementRules ?? {},
        modifiers: { viewTypeModifiers, purposeModifiers, planViewRange },
    };
}

app.get('/api/projects/:id/visibility-intents', authMiddleware, async (req, res) => {
    const { id } = req.params;
    // §H2 (audit) — was leaking any project's visibility config to any
    // authenticated user. Restrict to members of the project.
    const userId = req.auth?.userId ?? 'anonymous';
    if (!await _httpCanAccess(userId, id)) {
        return res.status(403).json({ error: 'Forbidden — no access to this project.' });
    }
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            const { data, error } = await supabase
                .from('visibility_intents')
                .select('*')
                .eq('project_id', id)
                .eq('is_system', false)
                .order('updated_at', { ascending: false });
            if (error) throw error;
            return res.json({ intents: (data ?? []).map(normalizeVisibilityIntentRow) });
        }
        const pool = getPgPool();
        if (pool) {
            const { rows } = await pool.query(
                `SELECT * FROM visibility_intents WHERE project_id = $1 AND is_system = false ORDER BY updated_at DESC`,
                [id],
            );
            return res.json({ intents: rows.map(normalizeVisibilityIntentRow) });
        }
        return res.json({ intents: (_visibilityIntents.get(id) ?? []).map(normalizeVisibilityIntentRow) });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.post('/api/projects/:id/visibility-intents', authMiddleware, async (req, res) => {
    // C08 §2.1 hasPermission: member write_intent — any project write requires verified membership.
    // Without this check any authenticated user could create visibility intents on any project.
    const { id } = req.params;
    const userId = req.auth?.userId ?? 'anonymous';
    const canAccess = await _httpCanAccess(userId, id);
    if (!canAccess) return res.status(403).json({ error: 'Access denied to this project.' });
    const payload = visibilityIntentPayload(req.body);
    if (!payload.name || !String(payload.name).trim()) return res.status(400).json({ error: 'name is required' });
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            const { data, error } = await supabase
                .from('visibility_intents')
                .insert({
                    id: payload.id,
                    project_id: id,
                    name: payload.name,
                    description: payload.description,
                    version: payload.version,
                    is_system: false,
                    rules: payload.rules,
                    modifiers: payload.modifiers,
                })
                .select('*')
                .single();
            if (error) throw error;
            return res.status(201).json({ intent: normalizeVisibilityIntentRow(data) });
        }
        const pool = getPgPool();
        if (pool) {
            const { rows } = await pool.query(
                `INSERT INTO visibility_intents (id, project_id, name, description, version, is_system, rules, modifiers)
                 VALUES ($1, $2, $3, $4, $5, false, $6::jsonb, $7::jsonb)
                 RETURNING *`,
                [payload.id, id, payload.name, payload.description, payload.version, JSON.stringify(payload.rules), JSON.stringify(payload.modifiers)],
            );
            return res.status(201).json({ intent: normalizeVisibilityIntentRow(rows[0]) });
        }
        const row = normalizeVisibilityIntentRow({
            ...payload,
            project_id: id,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        });
        const list = _visibilityIntents.get(id) ?? [];
        list.push(row);
        _visibilityIntents.set(id, list);
        return res.status(201).json({ intent: row });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.put('/api/projects/:id/visibility-intents/:intentId', authMiddleware, async (req, res) => {
    // C08 §2.1 hasPermission: member write_intent — visibility intent updates require project membership.
    const { id, intentId } = req.params;
    const userId = req.auth?.userId ?? 'anonymous';
    const canAccess = await _httpCanAccess(userId, id);
    if (!canAccess) return res.status(403).json({ error: 'Access denied to this project.' });
    const payload = visibilityIntentPayload(req.body, intentId);
    if (req.body?.isSystem === true || req.body?.intent?.isSystem === true) return res.status(400).json({ error: 'system intents are read-only fixtures' });
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            const { data, error } = await supabase
                .from('visibility_intents')
                .update({
                    name: payload.name,
                    description: payload.description,
                    version: payload.version,
                    is_system: false,
                    rules: payload.rules,
                    modifiers: payload.modifiers,
                    updated_at: new Date().toISOString(),
                })
                .eq('id', intentId)
                .eq('project_id', id)
                .eq('is_system', false)
                .select('*')
                .single();
            if (error) throw error;
            return res.json({ intent: normalizeVisibilityIntentRow(data) });
        }
        const pool = getPgPool();
        if (pool) {
            const { rows } = await pool.query(
                `UPDATE visibility_intents
                 SET name = $3, description = $4, version = $5, is_system = false, rules = $6::jsonb, modifiers = $7::jsonb, updated_at = NOW()
                 WHERE id = $1 AND project_id = $2 AND is_system = false
                 RETURNING *`,
                [intentId, id, payload.name, payload.description, payload.version, JSON.stringify(payload.rules), JSON.stringify(payload.modifiers)],
            );
            if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
            return res.json({ intent: normalizeVisibilityIntentRow(rows[0]) });
        }
        const list = _visibilityIntents.get(id) ?? [];
        const idx = list.findIndex(intent => intent.id === intentId && !intent.isSystem);
        if (idx === -1) return res.status(404).json({ error: 'Not found' });
        list[idx] = { ...list[idx], ...normalizeVisibilityIntentRow({ ...payload, id: intentId, project_id: id }), updatedAt: new Date().toISOString() };
        _visibilityIntents.set(id, list);
        return res.json({ intent: list[idx] });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.delete('/api/projects/:id/visibility-intents/:intentId', authMiddleware, async (req, res) => {
    // C08 §2.1 hasPermission: member write_intent — visibility intent deletes require project membership.
    const { id, intentId } = req.params;
    const userId = req.auth?.userId ?? 'anonymous';
    const canAccess = await _httpCanAccess(userId, id);
    if (!canAccess) return res.status(403).json({ error: 'Access denied to this project.' });
    if (intentId.startsWith('system-')) return res.status(400).json({ error: 'system intents cannot be deleted' });
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            const { error } = await supabase
                .from('visibility_intents')
                .delete()
                .eq('id', intentId)
                .eq('project_id', id)
                .eq('is_system', false);
            if (error) throw error;
            return res.status(204).end();
        }
        const pool = getPgPool();
        if (pool) {
            await pool.query(
                `DELETE FROM visibility_intents WHERE id = $1 AND project_id = $2 AND is_system = false`,
                [intentId, id],
            );
            return res.status(204).end();
        }
        const list = _visibilityIntents.get(id) ?? [];
        _visibilityIntents.set(id, list.filter(intent => intent.id !== intentId || intent.isSystem));
        return res.status(204).end();
    } catch (err) {
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── CDE Phase 1: Project Members API ─────────────────────────────────────────

/**
 * Resolves the requesting user's CDE role for a given project.
 * Project owner/platform-owner always has 'lead_appointed' (or as specified).
 * Falls through to member record lookup.
 */
async function resolveProjectRole(supabase, projectId, userId, projectOwnerId, isOwner) {
    if (isOwner) return 'lead_appointed';
    if (userId === projectOwnerId) return 'lead_appointed';
    if (supabase) {
        const row = await getMemberFromSupabase(supabase, projectId, userId);
        return row?.role ?? null;
    }
    return getUserRole(projectId, userId);
}

// ── §30-REAL-TIME-COLLABORATION: Command catch-up endpoint ────────────────────
// Returns up to 500 serialized commands logged for a project after `since`.
// Used by clients on reconnect to replay missed collaborator edits.
app.get('/api/projects/:id/commands', authMiddleware, async (req, res) => {
    const { id: projectId } = req.params;
    const userId = req.auth?.userId;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    // Validate `since` parameter — must be a parseable ISO date string
    const rawSince = req.query.since;
    let sinceDate;
    if (rawSince) {
        sinceDate = new Date(rawSince);
        if (isNaN(sinceDate.getTime())) {
            return res.status(400).json({ error: 'Invalid since parameter — expected ISO 8601 timestamp' });
        }
    } else {
        // Default: last 24 hours
        sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    }

    // Verify caller has access to the project. Fail-soft: if the access check
    // throws (DB hiccup, transient Supabase error), return an empty command list
    // rather than 500 — the catch-up loop retries on every reconnect, so a 500
    // turns into an error storm in the console. PERF-FIX (Apr 2026).
    try {
        const allowed = await _httpCanAccess(userId, projectId);
        if (!allowed) {
            return res.status(403).json({ error: 'Access denied' });
        }
    } catch (err) {
        console.warn('[commands/catch-up] Access check failed (returning empty list):', err.message);
        return res.json({ commands: [], requestedSince: sinceDate.toISOString(), count: 0 });
    }

    try {
        // PERF-FIX (Apr 2026): Prefer Supabase REST. See ifcStorageService.js for
        // rationale — direct PG host is unreachable from Replit (IPv6-only).
        const sb = await getSupabaseClient().catch(() => null);
        if (sb) {
            const { data, error } = await sb
                .from('project_command_log')
                .select('id, user_id, command_type, payload, created_at')
                .eq('project_id', projectId)
                .gt('created_at', sinceDate.toISOString())
                .order('created_at', { ascending: true })
                .limit(500);
            if (!error) {
                return res.json({
                    commands:      data || [],
                    requestedSince: sinceDate.toISOString(),
                    count:         (data || []).length,
                });
            }
            // PostgREST: 42P01 maps to code "42P01" or message containing "does not exist"
            const isMissingTable = error.code === '42P01' ||
                /does not exist/i.test(error.message || '') ||
                /relation/i.test(error.message || '');
            if (isMissingTable) {
                console.warn('[commands/catch-up] project_command_log table not found — returning empty list.');
                return res.json({ commands: [], requestedSince: sinceDate.toISOString(), count: 0 });
            }
            console.warn('[commands/catch-up] Supabase REST failed, falling back to pgPool:', error.message);
        }
        const result = await pgQuery(
            `SELECT id, user_id, command_type, payload, created_at
             FROM project_command_log
             WHERE project_id = $1 AND created_at > $2
             ORDER BY created_at ASC
             LIMIT 500`,
            [projectId, sinceDate]
        );
        res.json({
            commands:      result.rows,
            requestedSince: sinceDate.toISOString(),
            count:         result.rows.length,
        });
    } catch (err) {
        // If the project_command_log table doesn't exist yet (e.g. Supabase schema
        // applied before this table was added, or direct-PG DDL was blocked by
        // port 5432 firewall), return an empty command list rather than a 500.
        // A 500 here causes the Socket.io catch-up to fail on every reconnect,
        // flooding the console and breaking the collaboration catch-up loop.
        const isMissingTable = err.message?.includes('does not exist') ||
                               err.message?.includes('relation') ||
                               err.code === '42P01';
        if (isMissingTable) {
            console.warn(
                '[commands/catch-up] project_command_log table not found — ' +
                'returning empty list. Apply server/schema.sql in your Supabase SQL Editor to enable command history.'
            );
            return res.json({ commands: [], requestedSince: sinceDate.toISOString(), count: 0 });
        }
        console.error('[commands/catch-up] Query failed:', err.message);
        res.status(500).json({ error: 'Failed to fetch command log' });
    }
});

// ── S04 (ADR-002, ADR-004): Event Log — audit trail for CommandBus EventRecords ──
// Client-side EventLogPersistor POSTs each EventRecord as JSON after every
// successful CommandBus dispatch.  Fire-and-forget — 202 is returned immediately.
// Rate-limited by apiLimiter (60 req/min per IP).  Auth optional — actorId,
// projectId, clientId are taken from the EventRecord body itself.
app.post('/api/event-log', apiLimiter, async (req, res) => {
    const body = req.body ?? {};
    const id           = typeof body.id           === 'string' ? body.id           : `ev-${Date.now()}`;
    const commandType  = typeof body.type         === 'string' ? body.type         : 'unknown';
    const audit        = typeof body.audit        === 'object' && body.audit ? body.audit : {};
    const actorId      = typeof audit.actorId     === 'string' ? audit.actorId     : 'anonymous';
    const projectId    = typeof audit.projectId   === 'string' ? audit.projectId   : '';
    const clientId     = typeof audit.clientId    === 'string' ? audit.clientId    : '';
    const timestamp    = typeof audit.timestamp   === 'string' ? audit.timestamp   : new Date().toISOString();
    const payload      = typeof body.payload      === 'object' ? body.payload      : {};

    // Non-blocking insert — respond 202 Accepted immediately.
    res.status(202).end();

    (async () => {
        try {
            const sb = await getSupabaseClient().catch(() => null);
            if (sb) {
                const { error } = await sb.from('event_log').insert({
                    id, actor_id: actorId, project_id: projectId, client_id: clientId,
                    command_type: commandType, timestamp, payload,
                });
                if (error && error.code !== '42P01' && !/does not exist/i.test(error.message || '')) {
                    console.warn(`[event-log] Supabase insert failed (non-fatal): ${error.message}`);
                }
                return;
            }
            await pgQuery(
                `INSERT INTO event_log (id, actor_id, project_id, client_id, command_type, timestamp, payload, created_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                [id, actorId, projectId, clientId, commandType, timestamp, JSON.stringify(payload)]
            );
        } catch (err) {
            console.warn('[event-log] Insert failed (non-fatal):', err?.message ?? err);
        }
    })();
});

app.get('/api/projects/:id/members', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.auth?.userId ?? 'anonymous';
    const isOwner = getUserPlan(userId) === 'owner';
    // §H2 (audit) — every authenticated user could previously list any
    // project's members. Owner-or-member only.
    if (!isOwner && !await _httpCanAccess(userId, id)) {
        return res.status(403).json({ error: 'Forbidden — no access to this project.' });
    }
    try {
        const supabase = await getSupabaseClient();
        const members = supabase
            ? await listMembersFromSupabase(supabase, id)
            : listMembers(id);
        res.json({ members });
    } catch (err) {
        console.error('[api/members] GET error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.post('/api/projects/:id/members', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const userId = req.auth?.userId ?? 'anonymous';
    const isOwner = getUserPlan(userId) === 'owner';
    const { userId: targetUserId, role } = req.body;

    if (!targetUserId || !role) {
        return res.status(400).json({ error: 'userId and role are required.' });
    }
    try {
        const supabase = await getSupabaseClient();
        // Resolve caller's project role
        const project = supabase
            ? (await supabase.from('projects').select('owner_id').eq('id', id).single()).data
            : null;
        const ownerId = project?.owner_id ?? null;
        const callerRole = await resolveProjectRole(supabase, id, userId, ownerId, isOwner);

        if (!hasPermission(callerRole, 'invite_member', isOwner)) {
            return res.status(403).json({ error: 'Forbidden — only lead_appointed or appointing_party may add members.' });
        }

        const member = supabase
            ? await upsertMemberInSupabase(supabase, id, targetUserId, role, userId)
            : upsertMember(id, targetUserId, role, userId);
        res.status(201).json({ member });
    } catch (err) {
        console.error('[api/members] POST error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.patch('/api/projects/:id/members/:uid/role', authMiddleware, async (req, res) => {
    const { id, uid } = req.params;
    const userId = req.auth?.userId ?? 'anonymous';
    const isOwner = getUserPlan(userId) === 'owner';
    const { role } = req.body;

    if (!role) return res.status(400).json({ error: 'role is required.' });
    try {
        const supabase = await getSupabaseClient();
        const project = supabase
            ? (await supabase.from('projects').select('owner_id').eq('id', id).single()).data
            : null;
        const ownerId = project?.owner_id ?? null;
        const callerRole = await resolveProjectRole(supabase, id, userId, ownerId, isOwner);

        if (!hasPermission(callerRole, 'change_role', isOwner)) {
            return res.status(403).json({ error: 'Forbidden — insufficient role to change member roles.' });
        }

        const member = supabase
            ? await updateMemberRoleInSupabase(supabase, id, uid, role)
            : updateMemberRole(id, uid, role);
        if (!member) return res.status(404).json({ error: 'Member not found.' });
        res.json({ member });
    } catch (err) {
        console.error('[api/members] PATCH role error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.delete('/api/projects/:id/members/:uid', authMiddleware, async (req, res) => {
    const { id, uid } = req.params;
    const userId = req.auth?.userId ?? 'anonymous';
    const isOwner = getUserPlan(userId) === 'owner';
    try {
        const supabase = await getSupabaseClient();
        const project = supabase
            ? (await supabase.from('projects').select('owner_id').eq('id', id).single()).data
            : null;
        const ownerId = project?.owner_id ?? null;
        const callerRole = await resolveProjectRole(supabase, id, userId, ownerId, isOwner);

        if (!hasPermission(callerRole, 'remove_member', isOwner)) {
            return res.status(403).json({ error: 'Forbidden — insufficient role to remove members.' });
        }

        if (supabase) {
            await removeMemberFromSupabase(supabase, id, uid);
        } else {
            removeMember(id, uid);
        }
        res.status(204).end();
    } catch (err) {
        console.error('[api/members] DELETE error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── CDE Phase 2: Version state transition + audit log ────────────────────────

app.post('/api/projects/:id/versions/:vid/transition', authMiddleware, async (req, res) => {
    const { id, vid } = req.params;
    const userId = req.auth?.userId ?? 'anonymous';
    const isOwner = getUserPlan(userId) === 'owner';
    const { targetState, reason, revisionCode, suitabilityCode, structuredName } = req.body;

    if (!targetState) return res.status(400).json({ error: 'targetState is required.' });
    try {
        const supabase = await getSupabaseClient();

        // ── [C08 §2.1] Ownership / role resolution ───────────────────────────────
        // Supabase path: fetch owner_id via PostgREST.
        // PG path: fetch owner_id via direct pool query — avoids null ownerId that
        //   would let `resolveProjectRole` fall through to `getUserRole()` (in-memory
        //   only) and silently grant an unresolved role to any authenticated caller.
        // In-memory path: resolved entirely within getUserRole().
        let ownerId = null;
        if (supabase) {
            const { data } = await supabase
                .from('projects')
                .select('owner_id')
                .eq('id', id)
                .single();
            ownerId = data?.owner_id ?? null;
        } else if (getPgPool()) {
            const { rows } = await pgQuery(
                'SELECT owner_id FROM projects WHERE id = $1',
                [id],
            );
            ownerId = rows[0]?.owner_id ?? null;
            // If project not found in PG, deny access.
            if (!ownerId && rows.length === 0) {
                return res.status(404).json({ error: 'Project not found.' });
            }
        }

        const callerRole = await resolveProjectRole(supabase, id, userId, ownerId, isOwner);

        const opts = { reason, revisionCode, suitabilityCode, structuredName };
        const result = supabase
            ? await transitionStateInSupabase(supabase, vid, id, targetState, userId, callerRole, isOwner, opts)
            : transitionState(vid, targetState, userId, callerRole, isOwner, opts);

        if (!result.ok) {
            return res.status(422).json({ error: result.error });
        }
        res.json({ state: result.newState, auditEntry: result.auditEntry });
    } catch (err) {
        console.error('[api/versions/transition] error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/api/projects/:id/versions/:vid/audit', authMiddleware, async (req, res) => {
    const { id, vid } = req.params;
    // §H2 (audit) — restrict cross-tenant audit-log read.
    const userId = req.auth?.userId ?? 'anonymous';
    if (!await _httpCanAccess(userId, id)) {
        return res.status(403).json({ error: 'Forbidden — no access to this project.' });
    }
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            const { data, error } = await supabase
                .from('version_audit_log')
                .select('*')
                .eq('version_id', vid)
                .eq('project_id', id)
                .order('performed_at', { ascending: true });
            if (error) throw error;
            return res.json({ auditLog: data ?? [] });
        }
        res.json({ auditLog: getAuditLog(vid) });
    } catch (err) {
        console.error('[api/versions/audit] error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

app.get('/api/projects/:id/versions/:vid/state', authMiddleware, async (req, res) => {
    const { id, vid } = req.params;
    // §H2 (audit) — restrict cross-tenant CDE-state read.
    const userId = req.auth?.userId ?? 'anonymous';
    if (!await _httpCanAccess(userId, id)) {
        return res.status(403).json({ error: 'Forbidden — no access to this project.' });
    }
    try {
        const supabase = await getSupabaseClient();
        if (supabase) {
            const { data, error } = await supabase
                .from('project_versions')
                .select('state,revision_code,suitability_code,structured_name,rejection_reason,transitioned_by,transitioned_at')
                .eq('id', vid).eq('project_id', id).single();
            if (error) return res.status(404).json({ error: 'Version not found.' });
            return res.json({ state: data });
        }
        res.json({ state: getVersionState(vid) });
    } catch (err) {
        console.error('[api/versions/state] error:', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── Room AI Routes (Phase 9) ──────────────────────────────────────────────────
// §07-BIM-SECURITY-CONTRACT §1.4: all LLM calls must be proxied via this server.
// §07-BIM-SECURITY-CONTRACT §3: authMiddleware + aiLimiter + enforceAIQuota required.
// These routes call the CF Worker relay or Anthropic direct (same upstream as /api/anthropic/v1/messages).

/**
 * POST /api/ai/rooms/suggest-name
 * Body: { roomId: string, occupancy: string, area: number }
 * Returns: { name: string }
 */
app.post('/api/ai/rooms/suggest-name', aiLimiter, authMiddleware, async (req, res) => {
    const { roomId, occupancy, area, buildingContext } = req.body ?? {};
    const callerId = req.auth?.userId ?? 'anonymous';

    if (!roomId || !occupancy) {
        return res.status(400).json({ error: 'roomId and occupancy are required' });
    }

    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        return res.status(429).json({ error: 'AI quota exceeded', plan: quota.plan, limit: quota.limit });
    }

    try {
        const contextSection = buildingContext
            ? `\n\nBuilding context (for naming consistency):\n${String(buildingContext).slice(0, 1000)}`
            : '';
        const prompt = `You are a professional architectural BIM consultant.
Suggest a concise, professional room name (2–5 words) for a room with:
- Occupancy type: ${String(occupancy).slice(0, 60)}
- Gross area: ${Number(area ?? 0).toFixed(1)} m²${contextSection}

Respond with ONLY a JSON object: { "name": "..." }`;

        const messages = [{ role: 'user', content: prompt }];
        let response;

        if (CF_WORKER_URL) {
            response = await fetch(CF_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: ANTHROPIC_MODEL_ID, max_tokens: 80, messages }),
            });
        } else if (ANTHROPIC_API_KEY) {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({ model: ANTHROPIC_MODEL_ID, max_tokens: 80, messages }),
            });
        } else {
            return res.status(503).json({ error: 'No AI upstream configured' });
        }

        if (!response.ok) {
            const err = await response.text();
            return res.status(502).json({ error: `AI upstream error: ${err.slice(0, 200)}` });
        }

        const aiData = await response.json();
        const raw = aiData?.content?.[0]?.text ?? '';
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
        if (!parsed.name) return res.status(502).json({ error: 'AI returned no name' });

        res.json({ name: String(parsed.name).slice(0, 100) });
    } catch (err) {
        console.error('[/api/ai/rooms/suggest-name]', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * POST /api/ai/rooms/suggest-finishes
 * Body: { roomId: string, occupancy: string }
 * Returns: { finishes: { floor?, walls?, ceiling? } }
 */
app.post('/api/ai/rooms/suggest-finishes', aiLimiter, authMiddleware, async (req, res) => {
    const { roomId, occupancy, buildingContext } = req.body ?? {};
    const callerId = req.auth?.userId ?? 'anonymous';

    if (!roomId || !occupancy) {
        return res.status(400).json({ error: 'roomId and occupancy are required' });
    }

    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        return res.status(429).json({ error: 'AI quota exceeded', plan: quota.plan, limit: quota.limit });
    }

    try {
        const contextSection = buildingContext
            ? `\n\nBuilding context:\n${String(buildingContext).slice(0, 1500)}`
            : '';
        const prompt = `You are a professional architectural specification consultant.
Suggest appropriate finish materials for a room with occupancy type: "${String(occupancy).slice(0, 60)}".${contextSection}

Respond with ONLY a JSON object (no markdown):
{
  "finishes": {
    "floor":   { "materialName": "...", "materialColor": "#xxxxxx" },
    "walls":   { "materialName": "...", "materialColor": "#xxxxxx" },
    "ceiling": { "materialName": "...", "materialColor": "#xxxxxx" }
  }
}`;

        const messages = [{ role: 'user', content: prompt }];
        let response;

        if (CF_WORKER_URL) {
            response = await fetch(CF_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: ANTHROPIC_MODEL_ID, max_tokens: 250, messages }),
            });
        } else if (ANTHROPIC_API_KEY) {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({ model: ANTHROPIC_MODEL_ID, max_tokens: 250, messages }),
            });
        } else {
            return res.status(503).json({ error: 'No AI upstream configured' });
        }

        if (!response.ok) {
            const err = await response.text();
            return res.status(502).json({ error: `AI upstream error: ${err.slice(0, 200)}` });
        }

        const aiData = await response.json();
        const raw = aiData?.content?.[0]?.text ?? '';
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
        if (!parsed.finishes) return res.status(502).json({ error: 'AI returned no finishes' });

        res.json({ finishes: parsed.finishes });
    } catch (err) {
        console.error('[/api/ai/rooms/suggest-finishes]', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * POST /api/ai/rooms/generate-programme
 * Body: { levelId: string, brief: string }
 * Returns: { rooms: Array<partial RoomData> }
 */
app.post('/api/ai/rooms/generate-programme', aiLimiter, authMiddleware, async (req, res) => {
    const { levelId, brief } = req.body ?? {};
    const callerId = req.auth?.userId ?? 'anonymous';

    if (!levelId || !brief || String(brief).trim().length < 5) {
        return res.status(400).json({ error: 'levelId and brief (min 5 chars) are required' });
    }

    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        return res.status(429).json({ error: 'AI quota exceeded', plan: quota.plan, limit: quota.limit });
    }

    try {
        const prompt = `You are a professional architect creating a BIM room programme.
From this brief, produce a list of rooms to be placed on level "${String(levelId).slice(0, 50)}".

Brief: "${String(brief).slice(0, 500)}"

Respond with ONLY a JSON object (no markdown):
{
  "rooms": [
    { "name": "...", "occupancyType": "office|residential|circulation|kitchen|bathroom|storage|meeting|reception|lobby|other", "targetAreaM2": 30.0 }
  ]
}
Include 2–12 rooms maximum. Use only the occupancyType values listed above.`;

        const messages = [{ role: 'user', content: prompt }];
        let response;

        if (CF_WORKER_URL) {
            response = await fetch(CF_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: ANTHROPIC_MODEL_ID, max_tokens: 600, messages }),
            });
        } else if (ANTHROPIC_API_KEY) {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({ model: ANTHROPIC_MODEL_ID, max_tokens: 600, messages }),
            });
        } else {
            return res.status(503).json({ error: 'No AI upstream configured' });
        }

        if (!response.ok) {
            const err = await response.text();
            return res.status(502).json({ error: `AI upstream error: ${err.slice(0, 200)}` });
        }

        const aiData = await response.json();
        const raw = aiData?.content?.[0]?.text ?? '';
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
        if (!Array.isArray(parsed.rooms)) return res.status(502).json({ error: 'AI returned no rooms array' });

        // Sanitise and validate each room spec
        const rooms = parsed.rooms.slice(0, 12).map((r) => ({
            name:          String(r.name ?? 'Room').slice(0, 100),
            occupancyType: String(r.occupancyType ?? 'other').slice(0, 50),
            targetAreaM2:  Number(r.targetAreaM2 ?? 20),
            levelId,
        }));

        res.json({ rooms });
    } catch (err) {
        console.error('[/api/ai/rooms/generate-programme]', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

/**
 * POST /api/ai/rooms/analyse-adjacency
 * Body: { levelId: string, rooms: WorldModelRoom[] }
 * Returns: { clusters: [...], warnings: [...] }
 */
app.post('/api/ai/rooms/analyse-adjacency', aiLimiter, authMiddleware, async (req, res) => {
    const { levelId, rooms } = req.body ?? {};
    const callerId = req.auth?.userId ?? 'anonymous';

    if (!levelId || !Array.isArray(rooms)) {
        return res.status(400).json({ error: 'levelId and rooms array are required' });
    }
    if (rooms.length > 200) {
        return res.status(400).json({ error: 'Too many rooms (max 200)' });
    }

    const quota = enforceAIQuota(callerId);
    if (!quota.allowed) {
        return res.status(429).json({ error: 'AI quota exceeded', plan: quota.plan, limit: quota.limit });
    }

    try {
        const compact = rooms.slice(0, 50).map((r) => ({
            id:        String(r.id ?? '').slice(0, 36),
            name:      String(r.name ?? '').slice(0, 60),
            occupancy: String(r.occupancy ?? r.occupancyType ?? '').slice(0, 40),
            adjacent:  Array.isArray(r.adjacentRoomIds) ? r.adjacentRoomIds.slice(0, 10) : [],
        }));

        const prompt = `You are an architectural space planner.
Analyse the following rooms on level "${String(levelId).slice(0, 50)}" and identify logical zone clusters.

Rooms: ${JSON.stringify(compact)}

Respond with ONLY a JSON object:
{
  "clusters": [
    { "rooms": ["id1", "id2"], "suggestedZone": "..." }
  ],
  "warnings": ["..."]
}`;

        const messages = [{ role: 'user', content: prompt }];
        let response;

        if (CF_WORKER_URL) {
            response = await fetch(CF_WORKER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: ANTHROPIC_MODEL_ID, max_tokens: 800, messages }),
            });
        } else if (ANTHROPIC_API_KEY) {
            response = await fetch('https://api.anthropic.com/v1/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01',
                },
                body: JSON.stringify({ model: ANTHROPIC_MODEL_ID, max_tokens: 800, messages }),
            });
        } else {
            return res.status(503).json({ error: 'No AI upstream configured' });
        }

        if (!response.ok) {
            const err = await response.text();
            return res.status(502).json({ error: `AI upstream error: ${err.slice(0, 200)}` });
        }

        const aiData = await response.json();
        const raw = aiData?.content?.[0]?.text ?? '';
        const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}');

        res.json({
            clusters: Array.isArray(parsed.clusters) ? parsed.clusters : [],
            warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
        });
    } catch (err) {
        console.error('[/api/ai/rooms/analyse-adjacency]', err);
        res.status(500).json({ error: 'Internal server error.' });
    }
});

// ── Iframe embed mode (Wave A20-T11) — C07 §6 ────────────────────────────────
// GET /embed?projectId=X&token=Y — renders the editor in a minimal shell
// suitable for embedding inside iframes.  X-Frame-Options is relaxed on this
// route only; all other routes keep the default SAMEORIGIN.
//
// CONTRACT (C07 §6.1): The shell sets data-embed="1" so plugins and the editor
// can detect the embed context and omit chrome (nav bar, project hub).
app.get('/embed', (req, res) => {
    const projectId = String(req.query.projectId ?? '').replace(/[<>"'&]/g, '');
    const token     = String(req.query.token     ?? '').replace(/[<>"'&]/g, '');

    // C07 §6.1 — relax framing restrictions for embed mode.
    // applyEmbedHeaders() removes X-Frame-Options (ALLOWALL is non-standard; only
    // DENY and SAMEORIGIN are valid per RFC 7034) and overrides the CSP to use
    // frame-ancestors * so any third-party site can embed this route in an iframe.
    applyEmbedHeaders(res);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>PRYZM Embed</title>
  <style>
    html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #0f172a; }
    #pryzm-embed-root { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="pryzm-embed-root"
       data-project-id="${projectId}"
       data-token="${token}"
       data-embed="1">
  </div>
  <script>window.__PRYZM_EMBED__ = { projectId: "${projectId}", embed: true };</script>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>`);
});

// ── Marketplace API (Wave A20-T22–T24) — C07 §4 ──────────────────────────────
// Routes:
//   GET  /marketplace/api/plugins           — paginated catalog
//   GET  /marketplace/api/plugins/:id       — plugin detail
//   POST /marketplace/api/plugins/submit    — developer submission
//
// Database: marketplace_plugins table (added in server/dbMigrate.js).
// In-editor client: packages/runtime-composer/src/facets/MarketplaceFacet.ts
// Boolean #9 (marketplace_live) closes when marketplace.pryzm.app DNS goes live.

/**
 * Seed data for the 5 reference plugins (Wave A20-T26).
 * These are served from in-memory when the database table is empty or unavailable.
 */
const REFERENCE_PLUGINS_SEED = [
    {
        id: 'pryzm/bcf',
        name: 'PRYZM BCF',
        version: '1.0.0',
        description: 'BCF 3.0 reader/writer for issue tracking and clash review. Supports BCF ZIP exchange with Revit, Navisworks, and Solibri.',
        publisher: 'PRYZM',
        category: 'collaboration',
        permissions: ['read:project', 'write:project', 'register:panel', 'register:command'],
        downloads: 0,
        rating: 5.0,
        price: 'free',
        tags: ['bcf', 'issues', 'collaboration', 'clash'],
        icon: null,
        is_reference: true,
    },
    {
        id: 'pryzm/wall',
        name: 'PRYZM Wall',
        version: '1.0.0',
        description: 'Wall creation, editing, and system-type management. Full IFC 4.3 IfcWallStandardCase support with layer-aware geometry.',
        publisher: 'PRYZM',
        category: 'modeling',
        permissions: ['read:project', 'write:project', 'register:tool', 'register:panel'],
        downloads: 0,
        rating: 5.0,
        price: 'free',
        tags: ['wall', 'modeling', 'ifc', 'structure'],
        icon: null,
        is_reference: true,
    },
    {
        id: 'pryzm/ifc-inspector',
        name: 'IFC Element Inspector',
        version: '1.0.0',
        description: 'Full IFC 4.3 element property browser — Psets, quantities, relationships, geometry. With bSDD property lookup integration.',
        publisher: 'PRYZM',
        category: 'inspection',
        permissions: ['read:project', 'register:panel'],
        downloads: 0,
        rating: 5.0,
        price: 'free',
        tags: ['ifc', 'inspector', 'properties', 'bsdd'],
        icon: null,
        is_reference: true,
    },
    {
        id: 'pryzm/family-editor',
        name: 'Family Parameter Editor',
        version: '1.0.0',
        description: 'BIM family/type parameter editing for walls, doors, windows, columns, and beams. Supports shared parameters and type catalogs.',
        publisher: 'PRYZM',
        category: 'modeling',
        permissions: ['read:project', 'write:project', 'register:panel', 'register:command'],
        downloads: 0,
        rating: 5.0,
        price: 'free',
        tags: ['family', 'types', 'parameters', 'modeling'],
        icon: null,
        is_reference: true,
    },
    {
        id: 'pryzm/schedules',
        name: 'BIM Schedules',
        version: '1.0.0',
        description: 'Automated BIM schedule generation — wall areas, room areas, door/window schedules, material take-offs. Export to CSV/XLSX.',
        publisher: 'PRYZM',
        category: 'documentation',
        permissions: ['read:project', 'register:panel', 'register:command'],
        downloads: 0,
        rating: 5.0,
        price: 'free',
        tags: ['schedules', 'quantities', 'export', 'documentation'],
        icon: null,
        is_reference: true,
    },
];

// GET /marketplace/api/plugins — paginated catalog (supports ?q=, ?category=, ?page=, ?per_page=)
app.get('/marketplace/api/plugins', async (req, res) => {
    try {
        const page    = Math.max(1, parseInt(String(req.query.page     ?? '1'),  10));
        const perPage = Math.min(50, parseInt(String(req.query.per_page ?? '20'), 10));
        const q       = String(req.query.q        ?? '').trim().toLowerCase();
        const cat     = String(req.query.category ?? '').trim().toLowerCase();
        const offset  = (page - 1) * perPage;

        // Try the database first; fall back to seed data
        let plugins = REFERENCE_PLUGINS_SEED;
        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (pool) {
                const conditions = ['is_active = TRUE'];
                const params = [perPage, offset];
                if (q) {
                    params.push(`%${q}%`);
                    conditions.push(`(name ILIKE $${params.length} OR description ILIKE $${params.length} OR tags::text ILIKE $${params.length})`);
                }
                if (cat) {
                    params.push(cat);
                    conditions.push(`category = $${params.length}`);
                }
                const where = conditions.join(' AND ');
                const { rows } = await pool.query(
                    `SELECT * FROM marketplace_plugins WHERE ${where}
                     ORDER BY downloads DESC, name ASC
                     LIMIT $1 OFFSET $2`,
                    params,
                );
                plugins = rows;
            }
        } catch { /* DB unavailable — use seed */ }

        // Apply search + category filter on seed data
        let filtered = plugins.filter(p => {
            const matchQ = !q ||
                p.name.toLowerCase().includes(q) ||
                p.description.toLowerCase().includes(q) ||
                (Array.isArray(p.tags) ? p.tags.join(' ') : '').includes(q);
            const matchCat = !cat || (p.category ?? '').toLowerCase() === cat;
            return matchQ && matchCat;
        });

        const total      = filtered.length;
        const page_plugins = filtered.slice(offset, offset + perPage);

        res.json({
            plugins: page_plugins,
            total,
            page,
            perPage,
            totalPages: Math.ceil(total / perPage),
        });
    } catch (err) {
        console.error('[marketplace] GET /plugins error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /marketplace/api/plugins/:id/versions — version history for a plugin
// Synthesized from the single marketplace_plugins record (no separate versions table yet).
// Registered before /:id(*) so Express resolves the literal /versions segment first.
app.get('/marketplace/api/plugins/:id/versions', async (req, res) => {
    try {
        const pluginId = req.params.id;
        let plugin = REFERENCE_PLUGINS_SEED.find(p => p.id === pluginId) ?? null;

        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (pool) {
                const { rows } = await pool.query(
                    'SELECT * FROM marketplace_plugins WHERE id = $1 AND is_active = TRUE',
                    [pluginId],
                );
                if (rows.length > 0) plugin = rows[0];
            }
        } catch { /* DB unavailable */ }

        if (!plugin) return res.status(404).json({ error: 'Plugin not found' });

        // Synthesize a single version entry from the plugin record.
        const version = {
            pluginId:     plugin.id,
            version:      plugin.version ?? '1.0.0',
            bundleUrl:    plugin.bundle_url ?? null,
            bundleSha256: plugin.bundle_sha256 ?? null,
            publishedAt:  plugin.submitted_at ?? plugin.approved_at ?? new Date().toISOString(),
            revokedAt:    null,
        };
        res.json([version]);
    } catch (err) {
        console.error('[marketplace] GET /plugins/:id/versions error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /marketplace/api/plugins/:id — plugin detail
app.get('/marketplace/api/plugins/:id(*)', async (req, res) => {
    try {
        const pluginId = req.params.id;

        // Try DB first
        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (pool) {
                const { rows } = await pool.query(
                    'SELECT * FROM marketplace_plugins WHERE id = $1 AND is_active = TRUE',
                    [pluginId],
                );
                if (rows.length > 0) return res.json(rows[0]);
            }
        } catch { /* DB unavailable */ }

        // Fall back to seed data
        const plugin = REFERENCE_PLUGINS_SEED.find(p => p.id === pluginId);
        if (!plugin) return res.status(404).json({ error: 'Plugin not found' });

        res.json(plugin);
    } catch (err) {
        console.error('[marketplace] GET /plugins/:id error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /marketplace/api/plugins/submit — developer submission with Ed25519 enforcement (C07 §3 + §4.1)
app.post('/marketplace/api/plugins/submit', authMiddleware, async (req, res) => {
    try {
        const { manifest, signature, bundleUrl, bundleSha256 } = req.body ?? {};
        const publisherId = req.auth?.userId ?? null;

        if (!publisherId || publisherId === 'anonymous') {
            return res.status(401).json({ error: 'Authentication required to submit plugins' });
        }
        if (!manifest || typeof manifest !== 'object') {
            return res.status(400).json({ error: 'manifest is required (JSON object)' });
        }
        if (!manifest.id || !manifest.name || !manifest.version) {
            return res.status(400).json({ error: 'manifest must include id, name, version' });
        }

        // ── Ed25519 signature enforcement (C07 §3 — Task 6.3) ────────────────────
        // signature must be a PluginSignature object:
        //   { payload: { manifest, fileSha256, signedAt }, signatureB64, publisherPublicKeyB64 }
        if (!signature || typeof signature !== 'object') {
            return res.status(400).json({
                error: 'Ed25519 signature is required. Run `pryzm publish` to sign your plugin bundle before submission.',
                code: 'MISSING_SIGNATURE',
            });
        }
        if (!signature.signatureB64 || !signature.publisherPublicKeyB64 || !signature.payload) {
            return res.status(400).json({
                error: 'Invalid signature format. Expected { payload, signatureB64, publisherPublicKeyB64 }.',
                code: 'MALFORMED_SIGNATURE',
            });
        }

        // Verify that the publisher has registered this public key
        let pool = null;
        let keyRow = null;
        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            pool = getPgPool?.() ?? null;
            if (pool) {
                keyRow = await lookupPublisherKey(pool, publisherId, signature.publisherPublicKeyB64);
            }
        } catch { /* DB unavailable — fall through to signature check only */ }

        if (pool && !keyRow) {
            return res.status(403).json({
                error: 'The public key in your signature is not registered for your account. Register it first via POST /marketplace/api/publishers/register-key.',
                code: 'UNREGISTERED_KEY',
            });
        }

        // Cryptographic Ed25519 signature verification (C07 §3)
        const verifyResult = await verifyPluginSignatureNode(signature, {
            manifest,
            fileSha256: bundleSha256 ?? signature.payload?.fileSha256 ?? '',
        });

        if (!verifyResult.ok) {
            console.warn(`[marketplace] Signature verification failed for ${manifest.id}: ${verifyResult.reason}`);
            return res.status(403).json({
                error: `Plugin signature verification failed: ${verifyResult.reason}. The plugin bundle has been rejected.`,
                code: 'SIGNATURE_VERIFICATION_FAILED',
                reason: verifyResult.reason,
            });
        }
        // ── Signature valid ────────────────────────────────────────────────────────

        const reviewId = `review_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

        // Persist to DB (includes bundle URL, SHA256, and the full signature JSON)
        if (pool) {
            try {
                await pool.query(
                    `INSERT INTO marketplace_plugins
                       (id, name, version, description, publisher, category, permissions,
                        tags, bundle_url, bundle_sha256, signature_json,
                        is_active, is_reference, review_status, submitted_by)
                     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::jsonb,
                             FALSE, FALSE, 'pending', $12)
                     ON CONFLICT (id) DO UPDATE SET
                       version       = EXCLUDED.version,
                       bundle_url    = EXCLUDED.bundle_url,
                       bundle_sha256 = EXCLUDED.bundle_sha256,
                       signature_json= EXCLUDED.signature_json,
                       review_status = 'pending',
                       submitted_at  = NOW(),
                       updated_at    = NOW()`,
                    [
                        manifest.id, manifest.name, manifest.version,
                        manifest.description ?? '', manifest.publisher ?? 'unknown',
                        manifest.category ?? 'other',
                        JSON.stringify(manifest.permissions ?? []),
                        JSON.stringify(manifest.tags ?? []),
                        bundleUrl ?? null,
                        bundleSha256 ?? signature.payload?.fileSha256 ?? null,
                        JSON.stringify(signature),
                        publisherId,
                    ],
                );
            } catch (dbErr) {
                console.error('[marketplace] DB insert error on submit:', dbErr.message);
            }
        }

        console.info(`[marketplace] Plugin submission accepted (signature valid): ${manifest.id} v${manifest.version}, reviewer: ${reviewId}`);

        res.status(202).json({
            ok: true,
            reviewId,
            signatureVerified: true,
            message: `Plugin ${manifest.id} v${manifest.version} submitted for review. Signature verified. Review ID: ${reviewId}`,
            estimatedReviewTime: '24–48 hours',
        });
    } catch (err) {
        console.error('[marketplace] POST /plugins/submit error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /marketplace/api/publishers/register-key — register Ed25519 public key (C07 §3, Task 6.3)
app.post('/marketplace/api/publishers/register-key', authMiddleware, async (req, res) => {
    try {
        const publisherId = req.auth?.userId;
        if (!publisherId || publisherId === 'anonymous') return res.status(401).json({ error: 'Authentication required' });

        const { publicKeyB64, keyName } = req.body ?? {};
        if (!publicKeyB64 || typeof publicKeyB64 !== 'string') {
            return res.status(400).json({ error: 'publicKeyB64 (base64 Ed25519 public key) is required' });
        }

        // Validate it is a 32-byte Ed25519 public key
        const keyBytes = Buffer.from(publicKeyB64, 'base64');
        if (keyBytes.length !== 32) {
            return res.status(400).json({
                error: 'publicKeyB64 must be a base64-encoded 32-byte Ed25519 public key',
                code: 'INVALID_KEY_LENGTH',
            });
        }

        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (!pool) return res.status(503).json({ error: 'Database unavailable' });

            const { rows } = await pool.query(
                `INSERT INTO plugin_publisher_keys (publisher_id, public_key_b64, key_name)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (publisher_id, public_key_b64) DO UPDATE SET
                   key_name = EXCLUDED.key_name,
                   revoked_at = NULL
                 RETURNING id, publisher_id, public_key_b64, key_name, created_at`,
                [publisherId, publicKeyB64, keyName ?? 'default'],
            );

            console.info(`[marketplace] Publisher key registered: ${publisherId} key=${keyBytes.toString('hex').slice(0, 8)}…`);
            res.status(201).json({ ok: true, key: rows[0] });
        } catch (dbErr) {
            console.error('[marketplace] register-key DB error:', dbErr.message);
            res.status(500).json({ error: 'Internal server error' });
        }
    } catch (err) {
        console.error('[marketplace] POST /publishers/register-key error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /marketplace/api/publishers/keys — list registered public keys for current user (C07 §3)
app.get('/marketplace/api/publishers/keys', authMiddleware, async (req, res) => {
    try {
        const publisherId = req.auth?.userId;
        if (!publisherId || publisherId === 'anonymous') return res.status(401).json({ error: 'Authentication required' });

        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (!pool) return res.status(503).json({ error: 'Database unavailable' });

            const { rows } = await pool.query(
                `SELECT id, public_key_b64, key_name, created_at, revoked_at
                 FROM plugin_publisher_keys
                 WHERE publisher_id = $1
                 ORDER BY created_at DESC`,
                [publisherId],
            );
            res.json({ keys: rows });
        } catch (dbErr) {
            console.error('[marketplace] GET /publishers/keys DB error:', dbErr.message);
            res.status(500).json({ error: 'Internal server error' });
        }
    } catch (err) {
        console.error('[marketplace] GET /publishers/keys error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /marketplace/api/plugins/:id/install — install with Ed25519 verification (C07 §4.2, Task 6.3)
app.post('/marketplace/api/plugins/:id(*)/install', authMiddleware, async (req, res) => {
    try {
        const pluginId = req.params.id;
        const userId = req.auth?.userId;
        if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required' });

        let plugin = REFERENCE_PLUGINS_SEED.find(p => p.id === pluginId) ?? null;
        let signatureJson = null;

        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (pool) {
                const { rows } = await pool.query(
                    'SELECT * FROM marketplace_plugins WHERE id = $1 AND is_active = TRUE',
                    [pluginId],
                );
                if (rows[0]) {
                    plugin = rows[0];
                    signatureJson = rows[0].signature_json;
                }
            }
        } catch { /* DB unavailable — use seed */ }

        if (!plugin) {
            return res.status(404).json({ error: 'Plugin not found or not available for install' });
        }

        // ── Purchase gate: paid plugins require a completed purchase record ──────
        const isFreePlugin = !plugin.price || plugin.price === 'free' || plugin.price === '0';
        if (!isFreePlugin && !(plugin.is_reference ?? false)) {
            let purchased = false;
            try {
                const { getPgPool } = await import('./server/dbMigrate.js');
                const pool = getPgPool?.();
                if (pool) {
                    const { rows } = await pool.query(
                        `SELECT status FROM plugin_purchases WHERE user_id = $1 AND plugin_id = $2`,
                        [userId, pluginId],
                    );
                    purchased = rows[0]?.status === 'completed';
                }
            } catch { /* DB unavailable — deny paid plugin install */ }

            if (!purchased) {
                return res.status(402).json({
                    error: 'Payment required. Purchase this plugin via POST /checkout before installing.',
                    code: 'PURCHASE_REQUIRED',
                    pluginId,
                    checkoutUrl: `/marketplace/api/plugins/${encodeURIComponent(pluginId)}/checkout`,
                });
            }
        }

        // Reference (first-party) plugins are pre-verified — skip signature check
        const isReference = plugin.is_reference ?? false;
        let signatureVerified = isReference;

        if (!isReference && signatureJson) {
            // Re-verify signature at install time (C07 §4.2: "verify Ed25519 signature against
            // the developer's registered public key")
            const verifyResult = await verifyPluginSignatureNode(signatureJson, {
                manifest: { id: plugin.id, name: plugin.name, version: plugin.version },
                fileSha256: plugin.bundle_sha256 ?? signatureJson.payload?.fileSha256 ?? '',
            });

            if (!verifyResult.ok) {
                console.warn(`[marketplace] Install rejected — signature invalid for ${pluginId}: ${verifyResult.reason}`);
                return res.status(403).json({
                    error: `Plugin installation rejected: Ed25519 signature verification failed (${verifyResult.reason}). This plugin cannot be installed.`,
                    code: 'SIGNATURE_VERIFICATION_FAILED',
                    reason: verifyResult.reason,
                });
            }
            signatureVerified = true;
        } else if (!isReference && !signatureJson) {
            // Third-party plugin without a stored signature — reject (C07 §3)
            return res.status(403).json({
                error: 'Plugin installation rejected: no Ed25519 signature on record. Only signed plugins can be installed.',
                code: 'MISSING_SIGNATURE',
            });
        }

        // Increment download count
        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (pool) {
                await pool.query(
                    `UPDATE marketplace_plugins SET downloads = downloads + 1, updated_at = NOW()
                     WHERE id = $1`,
                    [pluginId],
                );
            }
        } catch { /* non-fatal */ }

        console.info(`[marketplace] Plugin installed: ${pluginId} by ${userId} (signatureVerified=${signatureVerified})`);

        res.json({
            ok: true,
            pluginId,
            version: plugin.version,
            bundleUrl: plugin.bundle_url ?? null,
            bundleSha256: plugin.bundle_sha256 ?? null,
            signatureVerified,
            isReference,
            installInstructions: isReference
                ? 'First-party plugin — bundled with PRYZM 3. Activate on next project open.'
                : 'Store in IndexedDB via idb-keyval: key = `plugin:${pluginId}`, value = bundle ArrayBuffer. Activate on next project open.',
        });
    } catch (err) {
        console.error('[marketplace] POST /plugins/:id/install error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Marketplace Billing (C08 §7 — Task 6.4) ──────────────────────────────────
// Revenue share: PRYZM 30%, developer 70% (C07 §4).
// Free plugins: install directly; no checkout required.
// Paid plugins: POST /checkout → Stripe Checkout Session → webhook confirms → install unlocked.

// POST /marketplace/api/plugins/:id/checkout — create Stripe Checkout Session for paid plugin
app.post('/marketplace/api/plugins/:id(*)/checkout', authMiddleware, async (req, res) => {
    try {
        const pluginId = req.params.id;
        const userId   = req.auth?.userId;
        const email    = req.auth?.email ?? '';
        if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required' });

        const { successUrl, cancelUrl } = req.body ?? {};
        if (!successUrl || !cancelUrl) {
            return res.status(400).json({ error: 'successUrl and cancelUrl are required.' });
        }

        const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
        if (!STRIPE_SECRET_KEY) {
            return res.status(503).json({
                error: 'Payment processing is not configured. Contact support.',
                code: 'STRIPE_NOT_CONFIGURED',
            });
        }

        // Load plugin record
        let plugin = REFERENCE_PLUGINS_SEED.find(p => p.id === pluginId) ?? null;
        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (pool) {
                const { rows } = await pool.query(
                    'SELECT * FROM marketplace_plugins WHERE id = $1 AND is_active = TRUE',
                    [pluginId],
                );
                if (rows[0]) plugin = rows[0];
            }
        } catch { /* DB unavailable — use seed */ }

        if (!plugin) return res.status(404).json({ error: 'Plugin not found or not available.' });

        // Free plugins do not require a checkout
        const isFree = !plugin.price || plugin.price === 'free' || plugin.price === '0';
        if (isFree) {
            return res.status(400).json({
                error: 'This plugin is free. Use POST /install directly.',
                code: 'PLUGIN_IS_FREE',
            });
        }

        // Check for existing completed purchase (idempotent)
        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (pool) {
                const { rows } = await pool.query(
                    `SELECT id, status FROM plugin_purchases WHERE user_id = $1 AND plugin_id = $2`,
                    [userId, pluginId],
                );
                if (rows[0]?.status === 'completed') {
                    return res.json({ ok: true, alreadyPurchased: true, pluginId });
                }
            }
        } catch { /* non-fatal */ }

        // Parse price — stored as "9.99" or "$9.99" or cents integer
        let priceCents = 0;
        const rawPrice = String(plugin.price ?? '0').replace(/[^0-9.]/g, '');
        const priceNum = parseFloat(rawPrice) || 0;
        // Treat values ≤ 1000 as dollars, > 1000 as cents (anti-confusion heuristic)
        priceCents = priceNum > 1000 ? Math.round(priceNum) : Math.round(priceNum * 100);

        if (priceCents <= 0) {
            return res.status(400).json({ error: 'Plugin price cannot be determined.', code: 'INVALID_PRICE' });
        }

        // Find or create Stripe customer
        const { findOrCreateCustomer } = await import('./server/stripeService.js');
        let pool2 = null;
        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            pool2 = getPgPool?.() ?? null;
        } catch { /* non-fatal */ }

        let existingCustomerId = null;
        if (pool2) {
            try {
                const { rows } = await pool2.query(
                    'SELECT stripe_customer_id FROM pryzm_users WHERE id = $1',
                    [userId],
                );
                existingCustomerId = rows[0]?.stripe_customer_id ?? null;
            } catch { /* non-fatal */ }
        }
        const customerId = await findOrCreateCustomer(userId, email, existingCustomerId);

        // Create a one-time payment Checkout Session (not subscription)
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' });

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: plugin.name ?? pluginId,
                        description: plugin.description ?? `PRYZM marketplace plugin: ${pluginId}`,
                        metadata: { pluginId, pluginVersion: plugin.version ?? '1.0.0' },
                    },
                    unit_amount: priceCents,
                },
                quantity: 1,
            }],
            mode: 'payment',
            success_url: successUrl,
            cancel_url: cancelUrl,
            payment_intent_data: {
                metadata: { userId, pluginId, pluginVersion: plugin.version ?? '1.0.0', priceCents: String(priceCents) },
            },
            metadata: { userId, pluginId, pluginVersion: plugin.version ?? '1.0.0', priceCents: String(priceCents) },
        });

        // Insert pending purchase record
        if (pool2) {
            try {
                await pool2.query(
                    `INSERT INTO plugin_purchases
                        (user_id, plugin_id, plugin_version, price_cents, currency, stripe_session_id, status)
                     VALUES ($1, $2, $3, $4, 'usd', $5, 'pending')
                     ON CONFLICT (user_id, plugin_id) DO UPDATE
                        SET stripe_session_id = EXCLUDED.stripe_session_id,
                            plugin_version     = EXCLUDED.plugin_version,
                            price_cents        = EXCLUDED.price_cents,
                            status             = 'pending',
                            created_at         = NOW()`,
                    [userId, pluginId, plugin.version ?? '1.0.0', priceCents, session.id],
                );
            } catch (dbErr) {
                console.warn('[marketplace] checkout DB insert failed (non-fatal):', dbErr.message);
            }
        }

        console.info(`[marketplace] Checkout session created: ${session.id} userId=${userId} pluginId=${pluginId} price=${priceCents}¢`);
        res.json({
            ok: true,
            sessionUrl: session.url,
            sessionId: session.id,
            pluginId,
            priceCents,
            currency: 'usd',
        });
    } catch (err) {
        console.error('[marketplace] POST /plugins/:id/checkout error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /marketplace/api/plugins/:id/purchase-status — check if authenticated user has purchased a plugin
app.get('/marketplace/api/plugins/:id(*)/purchase-status', authMiddleware, async (req, res) => {
    try {
        const pluginId = req.params.id;
        const userId   = req.auth?.userId;
        if (!userId || userId === 'anonymous') return res.status(401).json({ error: 'Authentication required' });

        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (pool) {
                const { rows } = await pool.query(
                    `SELECT status, purchased_at FROM plugin_purchases
                      WHERE user_id = $1 AND plugin_id = $2`,
                    [userId, pluginId],
                );
                if (rows[0]) {
                    const row = rows[0];
                    return res.json({
                        ok: true,
                        pluginId,
                        purchased: row.status === 'completed',
                        status: row.status,
                        purchasedAt: row.purchased_at ?? null,
                    });
                }
            }
        } catch { /* DB unavailable */ }

        res.json({ ok: true, pluginId, purchased: false, status: 'not_purchased', purchasedAt: null });
    } catch (err) {
        console.error('[marketplace] GET /plugins/:id/purchase-status error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Plugin Reviews (F-4.3) ────────────────────────────────────────────────

function maskEmail(email) {
    if (!email || typeof email !== 'string') return 'Anonymous';
    const at = email.indexOf('@');
    if (at < 0) return email.slice(0, 1) + '***';
    const local = email.slice(0, at);
    const domain = email.slice(at + 1);
    const visible = local.slice(0, Math.min(2, local.length));
    return `${visible}***@${domain}`;
}

// GET /marketplace/api/plugins/:id/reviews — public review list; isOwn set when Bearer token present
app.get('/marketplace/api/plugins/:id(*)/reviews', async (req, res) => {
    try {
        const pluginId = req.params.id;
        const limit    = Math.min(parseInt(req.query.limit ?? '20', 10), 100);
        const offset   = parseInt(req.query.offset ?? '0', 10);

        // Resolve calling user (anonymous is fine — just sets isOwn = false)
        let callerId = 'anonymous';
        const authHeader = req.headers.authorization ?? '';
        if (authHeader.startsWith('Bearer ')) {
            try {
                const { verifyToken } = await import('./server/authStore.js');
                const payload = await verifyToken(authHeader.slice(7));
                callerId = payload?.sub ?? 'anonymous';
            } catch { /* token invalid — remain anonymous */ }
        }

        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (!pool) return res.json({ reviews: [], total: 0, averageRating: 0, ratingCount: 0 });

            const [listResult, aggResult] = await Promise.all([
                pool.query(
                    `SELECT id, plugin_id, user_id, reviewer_label, rating, body, created_at, updated_at
                       FROM plugin_reviews
                      WHERE plugin_id = $1
                      ORDER BY created_at DESC
                      LIMIT $2 OFFSET $3`,
                    [pluginId, limit, offset],
                ),
                pool.query(
                    `SELECT COUNT(*)::int AS rating_count,
                            ROUND(AVG(rating)::numeric, 1)::float AS average_rating
                       FROM plugin_reviews WHERE plugin_id = $1`,
                    [pluginId],
                ),
            ]);

            const agg = aggResult.rows[0] ?? { rating_count: 0, average_rating: 0 };
            const countResult = await pool.query(
                `SELECT COUNT(*)::int AS total FROM plugin_reviews WHERE plugin_id = $1`,
                [pluginId],
            );

            const reviews = listResult.rows.map(r => ({
                id:            r.id,
                pluginId:      r.plugin_id,
                userId:        r.user_id,
                reviewerLabel: r.reviewer_label,
                rating:        r.rating,
                body:          r.body,
                createdAt:     r.created_at,
                updatedAt:     r.updated_at,
                isOwn:         r.user_id === callerId,
            }));

            return res.json({
                reviews,
                total:         countResult.rows[0]?.total ?? 0,
                averageRating: Number(agg.average_rating) || 0,
                ratingCount:   Number(agg.rating_count)   || 0,
            });
        } catch (dbErr) {
            console.error('[marketplace] GET /reviews DB error:', dbErr.message);
            return res.json({ reviews: [], total: 0, averageRating: 0, ratingCount: 0 });
        }
    } catch (err) {
        console.error('[marketplace] GET /plugins/:id/reviews error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /marketplace/api/plugins/:id/reviews — create or update own review (upsert)
app.post('/marketplace/api/plugins/:id(*)/reviews', authMiddleware, async (req, res) => {
    try {
        const pluginId = req.params.id;
        const userId   = req.auth?.userId;
        if (!userId || userId === 'anonymous') {
            return res.status(401).json({ error: 'Authentication required' });
        }

        const { rating, body = '' } = req.body ?? {};
        if (!rating || typeof rating !== 'number' || rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'rating must be an integer between 1 and 5.' });
        }
        if (typeof body !== 'string' || body.length > 2000) {
            return res.status(400).json({ error: 'body must be a string ≤ 2000 characters.' });
        }

        const reviewerLabel = maskEmail(req.auth?.email ?? '');

        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (!pool) return res.status(503).json({ error: 'Database unavailable' });

            const { rows } = await pool.query(
                `INSERT INTO plugin_reviews
                     (id, plugin_id, user_id, reviewer_label, rating, body, created_at, updated_at)
                 VALUES (gen_random_uuid()::TEXT, $1, $2, $3, $4, $5, NOW(), NOW())
                 ON CONFLICT (user_id, plugin_id) DO UPDATE SET
                     rating         = EXCLUDED.rating,
                     body           = EXCLUDED.body,
                     reviewer_label = EXCLUDED.reviewer_label,
                     updated_at     = NOW()
                 RETURNING id, plugin_id, user_id, reviewer_label, rating, body, created_at, updated_at`,
                [pluginId, userId, reviewerLabel, Math.round(rating), body.trim()],
            );

            const r = rows[0];
            console.info(`[marketplace] Review upserted: ${pluginId} by ${userId} rating=${rating}`);
            return res.status(201).json({
                ok: true,
                review: {
                    id:            r.id,
                    pluginId:      r.plugin_id,
                    userId:        r.user_id,
                    reviewerLabel: r.reviewer_label,
                    rating:        r.rating,
                    body:          r.body,
                    createdAt:     r.created_at,
                    updatedAt:     r.updated_at,
                    isOwn:         true,
                },
            });
        } catch (dbErr) {
            console.error('[marketplace] POST /reviews DB error:', dbErr.message);
            return res.status(500).json({ error: 'Database error' });
        }
    } catch (err) {
        console.error('[marketplace] POST /plugins/:id/reviews error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /marketplace/api/revocations.json — certificate revocation list (CRL) (ADR-0038 §D, C07 §3)
app.get('/marketplace/api/revocations.json', async (_req, res) => {
    try {
        let crl = { revokedPublisherKeysB64: [], revokedPluginIdAtVersion: [], issuedAt: new Date().toISOString() };
        try {
            const { getPgPool } = await import('./server/dbMigrate.js');
            const pool = getPgPool?.();
            if (pool) crl = await fetchRevocationList(pool);
        } catch { /* DB unavailable — return empty CRL */ }

        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.setHeader('Content-Type', 'application/json');
        res.json(crl);
    } catch (err) {
        console.error('[marketplace] GET /revocations.json error:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// ── Static / Vite middleware ──────────────────────────────────────────────────
if (isProd) {
    console.log('[server] Production mode — serving dist/');
    // PERF-FIX-#4: Vite content-hashes every file in dist/assets/ (e.g. EngineBootstrap-C8inPr_w.js).
    // These filenames only change when code changes, so they are safe to cache forever.
    // index.html and other entry points are NOT cached (no max-age) so users always get the latest shell.
    app.use(express.static(join(__dirname, 'dist'), {
        setHeaders: (res, filePath) => {
            // COOP + COEP are set globally by helmetMiddleware — per-route override removed.
            if (filePath.includes(`${join(__dirname, 'dist', 'assets')}`)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
        }
    }));
    app.get('*', (_req, res) => {
        // COOP + COEP are set globally by helmetMiddleware — per-route override removed.
        res.sendFile(join(__dirname, 'dist', 'index.html'));
    });
} else {
    console.log('[server] Development mode — using Vite middleware');
    const vite = await createViteServer({
        server: {
            middlewareMode: true,
            allowedHosts: true,
            hmr: replitDevDomain
                ? {
                    server: httpServer,
                    protocol: 'wss',
                    host: replitDevDomain,
                    clientPort: 443,
                }
                : { server: httpServer },
        },
        appType: 'spa',
    });
    app.use(vite.middlewares);
}

// ─────────────────────────────────────────────────────────────────────────────
// §B5 (audit) — terminal global error handler.
// Express's default 4-arg error handler fires when any middleware/route calls
// next(err) or a synchronous throw escapes the route handler (including
// malformed JSON bodies from express.json() throwing SyntaxError). Without
// this, Express returns a stack-trace HTML page in dev and a bare HTML 500
// in prod. We log details server-side and return a generic JSON envelope.
// MUST be the LAST middleware added.
// ─────────────────────────────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
    const status = (typeof err?.status === 'number' && err.status >= 400 && err.status < 600) ? err.status : 500;
    const isJsonParse = err?.type === 'entity.parse.failed' || err?.name === 'SyntaxError';
    console.error(`[server] terminal error handler — ${req.method} ${req.originalUrl} → ${status}:`, err?.stack ?? err);
    if (res.headersSent) return; // can't change response if already started
    res.status(isJsonParse ? 400 : status).json({
        error: isJsonParse ? 'Malformed JSON body.' : 'Internal server error.',
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// §H18 (audit) — listen FIRST, then run migrations.
// Previously `await runMigrations()` ran before listen(). If the DB was slow at
// boot (cold pool, network blip) the port stayed closed for up to 10 s, the
// LB declared the instance dead, and Replit killed it before it ever served.
// Now we listen immediately so /api/health/live is reachable; migrations run
// in the background and a flag tracks readiness for /api/health/ready.
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
let _migrationsReady = false;
let _supabaseActiveForLog = false;

// §M5 (audit) — surface listen() errors with a clear message instead of an
// uncaught EADDRINUSE crash with an unhelpful stack.
httpServer.on('error', (err) => {
    console.error(`[server] httpServer error — ${err.code ?? ''} ${err.message}`);
    if (err.code === 'EADDRINUSE') process.exit(1);
});

httpServer.listen(PORT, '0.0.0.0', async () => {
    console.log(`[server] Listening on port ${PORT} (${isProd ? 'production' : 'development'})`);
    // Now run migrations + supabase ping in the background.
    try {
        await runMigrations();
        _migrationsReady = true;
        console.log('[server] DB migrations complete.');
    } catch (err) {
        console.error('[server] runMigrations() failed (server still up; /ready will return 503):', err);
    }
    try {
        _supabaseActiveForLog = await getSupabaseClient().then(c => !!c).catch(() => false);
    } catch { /* non-fatal */ }
    // Start AI cache cleanup AFTER migrations so the table exists.
    runCacheCleanup();
    setInterval(runCacheCleanup, CACHE_CLEANUP_INTERVAL_MS).unref?.();
    console.log(`[server] Features: authMode=jwt supabase=${_supabaseActiveForLog} socketio=${!!io} migrationsReady=${_migrationsReady}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// §B8 (audit) — graceful shutdown on SIGTERM/SIGINT.
// Without this, every Replit Autoscale scale-down / redeploy hard-kills the
// process: in-flight HTTP requests drop, Socket.io clients hard-disconnect,
// the PG pool leaks server-side connections until timeout, fire-and-forget
// _persistToDb() writes lose data. We stop accepting new connections, drain,
// close io + pool, then exit. A 10 s force-exit timer covers a hung close.
// ─────────────────────────────────────────────────────────────────────────────
let _shuttingDown = false;
function _shutdown(signal) {
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log(`[server] ${signal} received — graceful shutdown starting…`);
    const force = setTimeout(() => {
        console.error('[server] graceful shutdown timed out — forcing exit.');
        process.exit(1);
    }, 10_000);
    force.unref?.();

    // Stop accepting new HTTP / Socket.io connections.
    httpServer.close((err) => {
        if (err) console.error('[server] httpServer.close error:', err);
        else console.log('[server] httpServer closed.');
    });
    if (io) {
        try { io.close(() => console.log('[server] socket.io closed.')); }
        catch (e) { console.error('[server] io.close error:', e); }
    }
    // Drain the PG pool.
    const pool = getPgPool();
    if (pool) {
        pool.end()
            .then(() => console.log('[server] pg pool drained.'))
            .catch((e) => console.error('[server] pool.end error:', e))
            .finally(() => process.exit(0));
    } else {
        setTimeout(() => process.exit(0), 200).unref?.();
    }
}
process.on('SIGTERM', () => _shutdown('SIGTERM'));
process.on('SIGINT',  () => _shutdown('SIGINT'));
