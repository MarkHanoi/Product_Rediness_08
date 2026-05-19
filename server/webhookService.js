/**
 * server/webhookService.js
 * Phase E-2 — PRYZM Webhook System
 *
 * Stores webhook subscriptions in the database and delivers HTTP POST
 * notifications to registered URLs when BIM model events occur.
 *
 * Supported events:
 *   model.saved             — a new version was saved
 *   room.created            — a room was detected/created
 *   room.updated            — a room was modified
 *   room.deleted            — a room was removed
 *   compliance.failed       — a compliance violation appeared
 *   compliance.resolved     — a compliance violation was resolved
 *   programme.deviation.changed — a room's area deviation changed
 *
 * Contract: §07-BIM-SECURITY-CONTRACT §1 (auth enforced per endpoint)
 *           §09-DATABASE-PERSISTENCE-ARCHITECTURE (dual DB path)
 */

import { getPgPool } from './pgClient.js';
import { getSupabaseClient } from './supabaseClient.js';

const VALID_EVENTS = new Set([
    'model.saved',
    'room.created',
    'room.updated',
    'room.deleted',
    'compliance.failed',
    'compliance.resolved',
    'programme.deviation.changed',
]);

const MAX_WEBHOOKS_PER_PROJECT = 10;
const DELIVERY_TIMEOUT_MS = 10_000;
const MAX_RETRY_ATTEMPTS = 3;

function generateId() {
    return `wh-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── In-memory fallback ────────────────────────────────────────────────────────
const _webhooks = new Map(); // projectId → Webhook[]

// ── Database helpers ──────────────────────────────────────────────────────────

async function dbInsert(webhook) {
    const supabase = await getSupabaseClient().catch(() => null);
    if (supabase) {
        await supabase.from('project_webhooks').insert(webhook);
        return;
    }
    const pool = getPgPool();
    if (pool) {
        await pool.query(
            `INSERT INTO project_webhooks (id, project_id, owner_id, url, events, secret, active, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
            [webhook.id, webhook.project_id, webhook.owner_id, webhook.url,
             JSON.stringify(webhook.events), webhook.secret, true]
        );
        return;
    }
    const list = _webhooks.get(webhook.project_id) ?? [];
    list.push(webhook);
    _webhooks.set(webhook.project_id, list);
}

async function dbList(projectId, ownerId) {
    const supabase = await getSupabaseClient().catch(() => null);
    if (supabase) {
        const { data } = await supabase
            .from('project_webhooks')
            .select('id,project_id,owner_id,url,events,active,created_at')
            .eq('project_id', projectId)
            .eq('owner_id', ownerId)
            .eq('active', true);
        return data ?? [];
    }
    const pool = getPgPool();
    if (pool) {
        const { rows } = await pool.query(
            `SELECT id,project_id,owner_id,url,events,active,created_at
             FROM project_webhooks
             WHERE project_id=$1 AND owner_id=$2 AND active=true`,
            [projectId, ownerId]
        );
        return rows.map(r => ({ ...r, events: typeof r.events === 'string' ? JSON.parse(r.events) : r.events }));
    }
    return (_webhooks.get(projectId) ?? []).filter(w => w.owner_id === ownerId && w.active);
}

async function dbDelete(webhookId, projectId, ownerId) {
    const supabase = await getSupabaseClient().catch(() => null);
    if (supabase) {
        await supabase.from('project_webhooks')
            .update({ active: false })
            .eq('id', webhookId)
            .eq('project_id', projectId)
            .eq('owner_id', ownerId);
        return;
    }
    const pool = getPgPool();
    if (pool) {
        await pool.query(
            `UPDATE project_webhooks SET active=false WHERE id=$1 AND project_id=$2 AND owner_id=$3`,
            [webhookId, projectId, ownerId]
        );
        return;
    }
    const list = (_webhooks.get(projectId) ?? []).filter(w => !(w.id === webhookId && w.owner_id === ownerId));
    _webhooks.set(projectId, list);
}

async function dbListByProject(projectId, event) {
    const supabase = await getSupabaseClient().catch(() => null);
    if (supabase) {
        const { data } = await supabase
            .from('project_webhooks')
            .select('id,url,events,secret')
            .eq('project_id', projectId)
            .eq('active', true);
        const all = data ?? [];
        return event ? all.filter(w => {
            const evs = Array.isArray(w.events) ? w.events : [];
            return evs.includes(event) || evs.includes('*');
        }) : all;
    }
    const pool = getPgPool();
    if (pool) {
        const { rows } = await pool.query(
            `SELECT id,url,events,secret FROM project_webhooks WHERE project_id=$1 AND active=true`,
            [projectId]
        );
        const all = rows.map(r => ({ ...r, events: typeof r.events === 'string' ? JSON.parse(r.events) : r.events }));
        return event ? all.filter(w => {
            const evs = Array.isArray(w.events) ? w.events : [];
            return evs.includes(event) || evs.includes('*');
        }) : all;
    }
    const memAll = (_webhooks.get(projectId) ?? []).filter(w => w.active);
    return event ? memAll.filter(w => {
        const evs = Array.isArray(w.events) ? w.events : [];
        return evs.includes(event) || evs.includes('*');
    }) : memAll;
}

async function dbCountActive(projectId, ownerId) {
    const supabase = await getSupabaseClient().catch(() => null);
    if (supabase) {
        const { count } = await supabase
            .from('project_webhooks')
            .select('id', { count: 'exact', head: true })
            .eq('project_id', projectId)
            .eq('owner_id', ownerId)
            .eq('active', true);
        return count ?? 0;
    }
    const pool = getPgPool();
    if (pool) {
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS n FROM project_webhooks WHERE project_id=$1 AND owner_id=$2 AND active=true`,
            [projectId, ownerId]
        );
        return rows[0]?.n ?? 0;
    }
    return (_webhooks.get(projectId) ?? []).filter(w => w.owner_id === ownerId && w.active).length;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a new webhook subscription.
 * @param {string} projectId
 * @param {string} ownerId
 * @param {string} url  — HTTPS URL to deliver events to
 * @param {string[]} events — array of event names (or ['*'] for all)
 * @param {string} [secret] — optional HMAC secret for signature verification
 * @returns {object} the created webhook record
 */
export async function registerWebhook(projectId, ownerId, url, events = ['model.saved'], secret = '') {
    if (!url || !url.startsWith('https://')) {
        throw new Error('Webhook URL must start with https://');
    }
    const invalidEvents = events.filter(e => e !== '*' && !VALID_EVENTS.has(e));
    if (invalidEvents.length > 0) {
        throw new Error(`Invalid event types: ${invalidEvents.join(', ')}. Valid: ${[...VALID_EVENTS].join(', ')}`);
    }

    const count = await dbCountActive(projectId, ownerId);
    if (count >= MAX_WEBHOOKS_PER_PROJECT) {
        throw new Error(`Maximum of ${MAX_WEBHOOKS_PER_PROJECT} webhooks per project.`);
    }

    const webhook = {
        id: generateId(),
        project_id: projectId,
        owner_id: ownerId,
        url,
        events,
        secret: secret || null,
        active: true,
        created_at: new Date().toISOString(),
    };

    await dbInsert(webhook);
    console.log(`[webhook] Registered ${webhook.id} for project ${projectId} → ${url} [${events.join(',')}]`);
    return { id: webhook.id, url, events, createdAt: webhook.created_at };
}

/**
 * List all active webhooks for a project owned by the requesting user.
 */
export async function listWebhooks(projectId, ownerId) {
    return dbList(projectId, ownerId);
}

/**
 * Delete (deactivate) a webhook by ID.
 */
export async function deleteWebhook(webhookId, projectId, ownerId) {
    await dbDelete(webhookId, projectId, ownerId);
    console.log(`[webhook] Deleted ${webhookId} from project ${projectId}`);
}

/**
 * Deliver an event to all subscribed webhooks for a project.
 * Fire-and-forget — errors are logged but not thrown.
 * Retries up to MAX_RETRY_ATTEMPTS times with exponential backoff.
 *
 * @param {string} projectId
 * @param {string} event — event name (e.g. 'model.saved')
 * @param {object} payload — event-specific data
 */
export async function deliverWebhookEvent(projectId, event, payload) {
    let subscribers;
    try {
        subscribers = await dbListByProject(projectId, event);
    } catch (err) {
        console.error(`[webhook] Failed to load subscribers for ${projectId}/${event}:`, err.message);
        return;
    }

    if (!subscribers || subscribers.length === 0) return;

    const body = JSON.stringify({
        event,
        projectId,
        timestamp: new Date().toISOString(),
        data: payload,
    });

    for (const webhook of subscribers) {
        deliverToUrl(webhook, body).catch(err => {
            console.error(`[webhook] Delivery failed for ${webhook.id} → ${webhook.url}:`, err.message);
        });
    }
}

async function deliverToUrl(webhook, body, attempt = 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const headers = {
        'Content-Type': 'application/json',
        'X-PRYZM-Event': JSON.parse(body).event,
        'X-PRYZM-Delivery': generateId(),
        'User-Agent': 'PRYZM-Webhook/1.0',
    };

    if (webhook.secret) {
        const crypto = await import('crypto');
        const sig = crypto.createHmac('sha256', webhook.secret).update(body).digest('hex');
        headers['X-PRYZM-Signature-256'] = `sha256=${sig}`;
    }

    try {
        const resp = await fetch(webhook.url, {
            method: 'POST',
            headers,
            body,
            signal: controller.signal,
        });
        clearTimeout(timer);

        if (resp.ok) {
            console.log(`[webhook] Delivered ${webhook.id} → ${webhook.url} (${resp.status})`);
            return;
        }

        console.warn(`[webhook] Non-2xx from ${webhook.url}: ${resp.status} (attempt ${attempt})`);
        if (attempt < MAX_RETRY_ATTEMPTS) {
            await sleep(1000 * 2 ** (attempt - 1));
            return deliverToUrl(webhook, body, attempt + 1);
        }
    } catch (err) {
        clearTimeout(timer);
        if (attempt < MAX_RETRY_ATTEMPTS) {
            console.warn(`[webhook] Network error for ${webhook.url} (attempt ${attempt}): ${err.message}`);
            await sleep(1000 * 2 ** (attempt - 1));
            return deliverToUrl(webhook, body, attempt + 1);
        }
        throw err;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Returns the list of valid event names for documentation. */
export function getValidEvents() {
    return [...VALID_EVENTS];
}
