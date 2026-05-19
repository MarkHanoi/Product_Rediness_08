/**
 * @file server/renderService.js
 * @description Server-side render job queue and gallery storage for Pryzm Render Mode.
 *
 * Architecture (Tier 1 — client-side path tracing):
 *   - The actual GPU path-tracing happens in the browser (client-side).
 *   - The server handles: render job IDs, completed render storage, gallery listing.
 *   - Rendered PNG blobs are POST-ed by the client after path-tracing completes.
 *
 * Storage strategy:
 *   - When Supabase is configured:
 *       • Image blobs  → Supabase Storage (bucket: 'renders' / 'panoramas')
 *       • Metadata     → Supabase DB tables 'render_gallery' / 'panorama_gallery'
 *       • Images are served via short-lived signed URLs (1-hour expiry)
 *   - Without Supabase: in-memory fallback (imageBuffer held in Map, reset on restart)
 *
 * All functions are async (Supabase operations are async).
 * Server.js route handlers must use await.
 *
 * Endpoints (in server.js):
 *   POST   /api/render/save       — Save a completed render PNG (multipart)
 *   GET    /api/render/list       — List renders for the authenticated user
 *   GET    /api/render/:id/image  — Serve or redirect to a render PNG
 *   DELETE /api/render/:id        — Delete a render
 *   POST   /api/panorama/save     — Save a panorama JPEG
 *   GET    /api/panorama/list     — List panoramas for the authenticated user
 *   GET    /api/panorama/:id/image — Serve or redirect to a panorama JPEG
 *   DELETE /api/panorama/:id      — Delete a panorama
 */

'use strict';

import { getSupabaseClient } from './supabaseClient.js';

// ── In-memory render store (fallback when Supabase is not configured) ─────────
// Map<userId, GalleryEntry[]>
const _renderGallery = new Map();
const _panoramaGallery = new Map();

function _getUserGallery(userId) {
    if (!_renderGallery.has(userId)) _renderGallery.set(userId, []);
    return _renderGallery.get(userId);
}

function _getUserPanoramaGallery(userId) {
    if (!_panoramaGallery.has(userId)) _panoramaGallery.set(userId, []);
    return _panoramaGallery.get(userId);
}

// ── Supabase Storage helpers ──────────────────────────────────────────────────

/**
 * Uploads an image buffer to a Supabase Storage bucket.
 * Returns the storage path on success, or null if Supabase is not configured.
 *
 * @param {string} bucket  - 'renders' or 'panoramas'
 * @param {string} path    - e.g. '{userId}/{id}.png'
 * @param {Buffer} buffer  - raw image bytes
 * @param {string} contentType
 * @returns {Promise<string|null>} storagePath or null
 */
async function _uploadToStorage(bucket, path, buffer, contentType) {
    const sb = await getSupabaseClient();
    if (!sb) return null;

    const { error } = await sb.storage.from(bucket).upload(path, buffer, {
        contentType,
        upsert: true,
    });

    if (error) {
        console.warn(`[renderService] Storage upload failed (${bucket}/${path}):`, error.message);
        return null;
    }

    return path;
}

/**
 * Generates a signed URL for a Supabase Storage object (valid for 1 hour).
 *
 * @param {string} bucket
 * @param {string} storagePath
 * @returns {Promise<string|null>} signed URL or null
 */
async function _getSignedUrl(bucket, storagePath) {
    const sb = await getSupabaseClient();
    if (!sb) return null;

    const { data, error } = await sb.storage.from(bucket).createSignedUrl(storagePath, 3600);
    if (error || !data?.signedUrl) {
        console.warn(`[renderService] Signed URL failed (${bucket}/${storagePath}):`, error?.message);
        return null;
    }

    return data.signedUrl;
}

/**
 * Downloads an image from Supabase Storage into a Buffer.
 *
 * @param {string} bucket
 * @param {string} storagePath
 * @returns {Promise<Buffer|null>}
 */
async function _downloadFromStorage(bucket, storagePath) {
    const sb = await getSupabaseClient();
    if (!sb) return null;

    const { data, error } = await sb.storage.from(bucket).download(storagePath);
    if (error || !data) {
        console.warn(`[renderService] Storage download failed (${bucket}/${storagePath}):`, error?.message);
        return null;
    }

    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

/**
 * Removes an object from Supabase Storage.
 *
 * @param {string} bucket
 * @param {string} storagePath
 */
async function _deleteFromStorage(bucket, storagePath) {
    const sb = await getSupabaseClient();
    if (!sb) return;

    const { error } = await sb.storage.from(bucket).remove([storagePath]);
    if (error) {
        console.warn(`[renderService] Storage delete failed (${bucket}/${storagePath}):`, error.message);
    }
}

// ── Render Gallery ────────────────────────────────────────────────────────────

/**
 * Saves a render to the gallery.
 * When Supabase is configured: uploads image to Storage + inserts metadata to DB.
 * Always keeps an in-memory entry (imageBuffer) for the current server process.
 *
 * @param {string} userId
 * @param {Buffer} imageBuffer - PNG image data
 * @param {object} meta - { width, height, samples, method, durationMs, name }
 * @returns {Promise<{ id: string, url: string }>}
 */
export async function saveRenderToGallery(userId, imageBuffer, meta) {
    const id = `render-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const gallery = _getUserGallery(userId);

    const entry = {
        id,
        userId,
        name:        meta.name ?? `Render ${gallery.length + 1}`,
        width:       meta.width ?? 0,
        height:      meta.height ?? 0,
        samples:     meta.samples ?? 0,
        method:      meta.method ?? 'unknown',
        durationMs:  meta.durationMs ?? 0,
        createdAt:   new Date().toISOString(),
        imageBuffer,
        storagePath: null,
        url:         `/api/render/${id}/image`,
    };

    // Try Supabase Storage + DB
    const sb = await getSupabaseClient();
    if (sb) {
        const storagePath = `${userId}/${id}.png`;
        const uploaded = await _uploadToStorage('renders', storagePath, imageBuffer, 'image/png');

        if (uploaded) {
            entry.storagePath = storagePath;

            const { error } = await sb.from('render_gallery').insert({
                id,
                user_id:      userId,
                name:         entry.name,
                width:        entry.width,
                height:       entry.height,
                samples:      entry.samples,
                method:       entry.method,
                duration_ms:  entry.durationMs,
                storage_path: storagePath,
                created_at:   entry.createdAt,
            });

            if (error) {
                console.warn('[renderService] DB insert failed for render:', error.message);
            } else {
                console.log(`[renderService] Saved render ${id} to Supabase (${entry.width}×${entry.height})`);
            }
        }
    }

    // Always keep in-memory (for current process; imageBuffer not persisted to DB)
    gallery.unshift(entry);
    if (gallery.length > 20) gallery.pop();

    if (!sb) {
        console.log(`[renderService] Saved render ${id} in-memory for user ${userId} (${entry.width}×${entry.height})`);
    }

    return { id, url: entry.url };
}

/**
 * Lists renders for a user.
 * When Supabase is configured, queries the DB for the full persistent list.
 * Falls back to in-memory.
 *
 * @param {string} userId
 * @returns {Promise<Array<{ id, name, width, height, samples, method, createdAt, url }>>}
 */
export async function listRendersForUser(userId) {
    const sb = await getSupabaseClient();

    if (sb) {
        const { data, error } = await sb
            .from('render_gallery')
            .select('id, name, width, height, samples, method, duration_ms, storage_path, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            return data.map(row => ({
                id:          row.id,
                name:        row.name,
                width:       row.width,
                height:      row.height,
                samples:     row.samples,
                method:      row.method,
                durationMs:  row.duration_ms,
                storagePath: row.storage_path,
                createdAt:   row.created_at,
                url:         `/api/render/${row.id}/image`,
            }));
        }
        console.warn('[renderService] DB list query failed:', error?.message);
    }

    // In-memory fallback
    const gallery = _getUserGallery(userId);
    return gallery.map(({ imageBuffer: _, ...meta }) => meta);
}

/**
 * Gets a specific render entry.
 * Checks in-memory first (has imageBuffer), then falls back to DB.
 *
 * @param {string} userId
 * @param {string} renderId
 * @returns {Promise<object | null>}
 */
export async function getRender(userId, renderId) {
    // Check in-memory first (has imageBuffer for direct serving)
    const gallery = _getUserGallery(userId);
    const inMem = gallery.find(e => e.id === renderId);
    if (inMem) return inMem;

    // Try DB (entry may exist from a previous server run)
    const sb = await getSupabaseClient();
    if (!sb) return null;

    const { data, error } = await sb
        .from('render_gallery')
        .select('id, name, width, height, samples, method, duration_ms, storage_path, created_at')
        .eq('id', renderId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) return null;

    return {
        id:          data.id,
        userId,
        name:        data.name,
        width:       data.width,
        height:      data.height,
        samples:     data.samples,
        method:      data.method,
        durationMs:  data.duration_ms,
        storagePath: data.storage_path,
        createdAt:   data.created_at,
        imageBuffer: null, // Not in memory — use storagePath to serve
        url:         `/api/render/${data.id}/image`,
    };
}

/**
 * Fetches the raw image buffer for a render.
 * Returns in-memory buffer if available; otherwise downloads from Supabase Storage.
 *
 * @param {string} userId
 * @param {string} renderId
 * @returns {Promise<Buffer|null>}
 */
export async function getRenderImageBuffer(userId, renderId) {
    const render = await getRender(userId, renderId);
    if (!render) return null;
    if (render.imageBuffer) return render.imageBuffer;
    if (render.storagePath) {
        return _downloadFromStorage('renders', render.storagePath);
    }
    return null;
}

/**
 * Deletes a render (in-memory + Supabase Storage + DB row).
 *
 * @param {string} userId
 * @param {string} renderId
 * @returns {Promise<boolean>}
 */
export async function deleteRender(userId, renderId) {
    const gallery = _getUserGallery(userId);
    const idx = gallery.findIndex(e => e.id === renderId);
    const storagePath = idx !== -1 ? gallery[idx].storagePath : null;

    if (idx !== -1) gallery.splice(idx, 1);

    const sb = await getSupabaseClient();
    if (sb) {
        // Find storage path from DB if not in memory
        let path = storagePath;
        if (!path) {
            const { data } = await sb
                .from('render_gallery')
                .select('storage_path')
                .eq('id', renderId)
                .eq('user_id', userId)
                .maybeSingle();
            path = data?.storage_path ?? null;
        }

        if (path) await _deleteFromStorage('renders', path);

        const { error } = await sb
            .from('render_gallery')
            .delete()
            .eq('id', renderId)
            .eq('user_id', userId);

        if (error) {
            console.warn('[renderService] DB delete failed for render:', error.message);
        } else {
            console.log(`[renderService] Deleted render ${renderId} for user ${userId}`);
            return true;
        }
    }

    if (idx !== -1) {
        console.log(`[renderService] Deleted render ${renderId} (in-memory) for user ${userId}`);
        return true;
    }

    return false;
}

/**
 * Stats for monitoring.
 */
export function getRenderStats() {
    let totalRenders = 0;
    _renderGallery.forEach(gallery => { totalRenders += gallery.length; });
    return { totalUsers: _renderGallery.size, totalRenders };
}

// ── Panorama Gallery (Tier 3 — 360° equirectangular panoramas) ────────────────

/**
 * Saves a panorama to the gallery.
 * When Supabase is configured: uploads JPEG to Storage + inserts metadata to DB.
 * Always keeps an in-memory entry (imageBuffer) for the current server process.
 *
 * @param {string} userId
 * @param {Buffer} imageBuffer - JPEG panorama data (equirectangular)
 * @param {object} meta - { width, height, name, durationMs }
 * @returns {Promise<{ id: string, url: string }>}
 */
export async function savePanoramaToGallery(userId, imageBuffer, meta) {
    const id = `pano-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const gallery = _getUserPanoramaGallery(userId);

    const entry = {
        id,
        userId,
        name:        meta.name ?? `Panorama ${gallery.length + 1}`,
        width:       meta.width ?? 0,
        height:      meta.height ?? 0,
        durationMs:  meta.durationMs ?? 0,
        createdAt:   new Date().toISOString(),
        imageBuffer,
        storagePath: null,
        url:         `/api/panorama/${id}/image`,
    };

    const sb = await getSupabaseClient();
    if (sb) {
        const storagePath = `${userId}/${id}.jpg`;
        const uploaded = await _uploadToStorage('panoramas', storagePath, imageBuffer, 'image/jpeg');

        if (uploaded) {
            entry.storagePath = storagePath;

            const { error } = await sb.from('panorama_gallery').insert({
                id,
                user_id:      userId,
                name:         entry.name,
                width:        entry.width,
                height:       entry.height,
                duration_ms:  entry.durationMs,
                storage_path: storagePath,
                created_at:   entry.createdAt,
            });

            if (error) {
                console.warn('[renderService] DB insert failed for panorama:', error.message);
            } else {
                console.log(`[renderService] Saved panorama ${id} to Supabase (${entry.width}×${entry.height})`);
            }
        }
    }

    gallery.unshift(entry);
    if (gallery.length > 10) gallery.pop();

    if (!sb) {
        console.log(`[renderService] Saved panorama ${id} in-memory for user ${userId} (${entry.width}×${entry.height})`);
    }

    return { id, url: entry.url };
}

/**
 * Lists panoramas for a user.
 * Queries DB when Supabase is configured; falls back to in-memory.
 *
 * @param {string} userId
 * @returns {Promise<Array>}
 */
export async function listPanoramasForUser(userId) {
    const sb = await getSupabaseClient();

    if (sb) {
        const { data, error } = await sb
            .from('panorama_gallery')
            .select('id, name, width, height, duration_ms, storage_path, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error && data) {
            return data.map(row => ({
                id:          row.id,
                name:        row.name,
                width:       row.width,
                height:      row.height,
                durationMs:  row.duration_ms,
                storagePath: row.storage_path,
                createdAt:   row.created_at,
                url:         `/api/panorama/${row.id}/image`,
            }));
        }
        console.warn('[renderService] DB list query failed for panoramas:', error?.message);
    }

    const gallery = _getUserPanoramaGallery(userId);
    return gallery.map(({ imageBuffer: _, ...meta }) => meta);
}

/**
 * Gets a specific panorama (including image buffer if in memory).
 *
 * @param {string} userId
 * @param {string} panoramaId
 * @returns {Promise<object | null>}
 */
export async function getPanorama(userId, panoramaId) {
    const gallery = _getUserPanoramaGallery(userId);
    const inMem = gallery.find(e => e.id === panoramaId);
    if (inMem) return inMem;

    const sb = await getSupabaseClient();
    if (!sb) return null;

    const { data, error } = await sb
        .from('panorama_gallery')
        .select('id, name, width, height, duration_ms, storage_path, created_at')
        .eq('id', panoramaId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error || !data) return null;

    return {
        id:          data.id,
        userId,
        name:        data.name,
        width:       data.width,
        height:      data.height,
        durationMs:  data.duration_ms,
        storagePath: data.storage_path,
        createdAt:   data.created_at,
        imageBuffer: null,
        url:         `/api/panorama/${data.id}/image`,
    };
}

/**
 * Fetches the raw JPEG buffer for a panorama.
 * Returns in-memory buffer if available; otherwise downloads from Supabase Storage.
 *
 * @param {string} userId
 * @param {string} panoramaId
 * @returns {Promise<Buffer|null>}
 */
export async function getPanoramaImageBuffer(userId, panoramaId) {
    const pano = await getPanorama(userId, panoramaId);
    if (!pano) return null;
    if (pano.imageBuffer) return pano.imageBuffer;
    if (pano.storagePath) {
        return _downloadFromStorage('panoramas', pano.storagePath);
    }
    return null;
}

/**
 * Deletes a panorama (in-memory + Supabase Storage + DB row).
 *
 * @param {string} userId
 * @param {string} panoramaId
 * @returns {Promise<boolean>}
 */
export async function deletePanorama(userId, panoramaId) {
    const gallery = _getUserPanoramaGallery(userId);
    const idx = gallery.findIndex(e => e.id === panoramaId);
    const storagePath = idx !== -1 ? gallery[idx].storagePath : null;

    if (idx !== -1) gallery.splice(idx, 1);

    const sb = await getSupabaseClient();
    if (sb) {
        let path = storagePath;
        if (!path) {
            const { data } = await sb
                .from('panorama_gallery')
                .select('storage_path')
                .eq('id', panoramaId)
                .eq('user_id', userId)
                .maybeSingle();
            path = data?.storage_path ?? null;
        }

        if (path) await _deleteFromStorage('panoramas', path);

        const { error } = await sb
            .from('panorama_gallery')
            .delete()
            .eq('id', panoramaId)
            .eq('user_id', userId);

        if (error) {
            console.warn('[renderService] DB delete failed for panorama:', error.message);
        } else {
            console.log(`[renderService] Deleted panorama ${panoramaId} for user ${userId}`);
            return true;
        }
    }

    if (idx !== -1) {
        console.log(`[renderService] Deleted panorama ${panoramaId} (in-memory) for user ${userId}`);
        return true;
    }

    return false;
}
