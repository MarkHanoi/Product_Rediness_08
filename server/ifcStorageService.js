/**
 * IFC Storage Service — §IFC-STORE-1
 *
 * Handles persistence of imported IFC model binaries so they survive
 * user sign-out / sign-in cycles.
 *
 * Storage strategy (in priority order):
 *   1. Supabase Storage bucket 'ifc-uploads'  — preferred (large-file, CDN-backed)
 *   2. Base64 in `ifc_uploads.file_data` col  — fallback (Replit PG, files ≤ 50 MB)
 *
 * Every upload attempt records a row in the `ifc_uploads` table so
 * `GET /api/projects/:id/ifc-uploads` always returns a consistent list
 * regardless of the storage backend in use.
 */

import { getSupabaseClient } from './supabaseClient.js';
import { query as pgQuery } from './pgClient.js';
import { randomUUID } from 'crypto';

const IFC_BUCKET       = 'ifc-uploads';
const MAX_DB_BYTES     = 50 * 1024 * 1024;   // 50 MB — cap for base64 fallback
const SIGNED_URL_TTL   = 3600;                // 1 hour signed URLs

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function _uploadToStorage(storagePath, buffer) {
    const sb = await getSupabaseClient();
    if (!sb) return null;

    const { error } = await sb.storage
        .from(IFC_BUCKET)
        .upload(storagePath, buffer, {
            contentType: 'application/octet-stream',
            upsert:      true,
        });

    if (error) {
        console.warn(`[ifcStorageService] Supabase Storage upload failed (${storagePath}):`, error.message);
        return null;
    }

    return storagePath;
}

async function _getSignedUrl(storagePath) {
    const sb = await getSupabaseClient();
    if (!sb) return null;

    const { data, error } = await sb.storage
        .from(IFC_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL);

    if (error || !data?.signedUrl) {
        console.warn(`[ifcStorageService] Signed URL failed (${storagePath}):`, error?.message);
        return null;
    }

    return data.signedUrl;
}

async function _deleteFromStorage(storagePath) {
    if (!storagePath) return;
    const sb = await getSupabaseClient();
    if (!sb) return;

    const { error } = await sb.storage.from(IFC_BUCKET).remove([storagePath]);
    if (error) {
        console.warn(`[ifcStorageService] Storage delete failed (${storagePath}):`, error.message);
    }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Upload an IFC binary and record metadata in `ifc_uploads`.
 *
 * @param {string} projectId
 * @param {string} userId
 * @param {string} fileName       Original file name (e.g. "Office Building.ifc")
 * @param {Buffer} fileBuffer     Raw IFC bytes
 * @param {number} elementCount   Number of IFC elements parsed
 * @returns {Promise<object>}     The inserted `ifc_uploads` row
 */
export async function uploadIfcFile(projectId, userId, fileName, fileBuffer, elementCount = 0) {
    const id          = randomUUID();
    const fileSize    = fileBuffer.length;
    const storagePath = `${projectId}/${id}.ifc`;

    let finalStoragePath = null;
    let fileData         = null;
    let uploadStatus     = 'complete';

    // Strategy 1 — Supabase Storage
    const uploaded = await _uploadToStorage(storagePath, fileBuffer);
    if (uploaded) {
        finalStoragePath = uploaded;
        console.log(`[ifcStorageService] Uploaded to Supabase Storage: ${storagePath} (${fileSize} bytes)`);
    } else {
        // Strategy 2 — base64 in-DB fallback (≤ 50 MB only)
        if (fileSize <= MAX_DB_BYTES) {
            fileData     = fileBuffer.toString('base64');
            uploadStatus = 'complete_db_fallback';
            console.log(`[ifcStorageService] Stored inline (base64, ${fileSize} bytes) for project ${projectId}`);
        } else {
            uploadStatus  = 'failed_too_large';
            console.warn(`[ifcStorageService] IFC file too large for DB fallback (${fileSize} bytes > ${MAX_DB_BYTES}). Supabase Storage is required for files > 50 MB.`);
        }
    }

    // Always insert the metadata row (storage_path and file_data may be null)
    const row = await pgQuery(
        `INSERT INTO ifc_uploads
             (id, project_id, user_id, file_name, storage_path,
              file_size_bytes, element_count, upload_status, file_data,
              created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
         RETURNING *`,
        [id, projectId, userId, fileName, finalStoragePath,
         fileSize, elementCount, uploadStatus, fileData],
    );

    return row.rows[0];
}

/**
 * List all IFC uploads for a project (most recent first).
 * Does NOT include the file_data blob — use getIfcFileData() for downloads.
 *
 * @param {string} projectId
 * @returns {Promise<object[]>}
 */
export async function listIfcUploads(projectId) {
    // PERF-FIX (Apr 2026): Prefer Supabase REST. The direct PG hostname
    // `db.<ref>.supabase.co` is IPv6-only on the Supabase free/standard plan
    // and Replit's network has no IPv6, so `pgQuery` from this container
    // always fails with `getaddrinfo ENOTFOUND`. The REST endpoint is HTTPS
    // and works reliably. We keep pgQuery as a fallback for environments
    // where the direct PG host is reachable (e.g. local dev, Vercel).
    const sb = await getSupabaseClient().catch(() => null);
    if (sb) {
        const { data, error } = await sb
            .from('ifc_uploads')
            .select('id, project_id, user_id, file_name, storage_path, file_size_bytes, element_count, upload_status, created_at, updated_at')
            .eq('project_id', projectId)
            .in('upload_status', ['complete', 'complete_db_fallback'])
            .order('created_at', { ascending: true });
        if (!error) return data || [];
        console.warn('[ifcStorageService] Supabase REST list failed, falling back to pgPool:', error.message);
    }
    const result = await pgQuery(
        `SELECT id, project_id, user_id, file_name, storage_path,
                file_size_bytes, element_count, upload_status, created_at, updated_at
         FROM   ifc_uploads
         WHERE  project_id = $1
         AND    upload_status IN ('complete', 'complete_db_fallback')
         ORDER  BY created_at ASC`,
        [projectId],
    );
    return result.rows;
}

/**
 * Get the download data for an IFC upload.
 * Returns either a signed URL (Supabase Storage) or a base64 string (DB fallback).
 *
 * @param {string} uploadId
 * @param {string} projectId   Used for ownership check
 * @returns {Promise<{url?:string, base64?:string, fileName:string}|null>}
 */
export async function getIfcFileData(uploadId, projectId) {
    const result = await pgQuery(
        `SELECT id, file_name, storage_path, file_data, upload_status
         FROM   ifc_uploads
         WHERE  id = $1 AND project_id = $2
         LIMIT  1`,
        [uploadId, projectId],
    );

    if (!result.rows.length) return null;

    const row = result.rows[0];

    // Supabase Storage path — return a short-lived signed URL
    if (row.storage_path) {
        const url = await _getSignedUrl(row.storage_path);
        if (!url) return null;
        return { url, fileName: row.file_name };
    }

    // DB fallback — return base64 directly
    if (row.file_data) {
        return { base64: row.file_data, fileName: row.file_name };
    }

    return null;
}

/**
 * Delete an IFC upload — removes from Storage and DB.
 *
 * @param {string} uploadId
 * @param {string} projectId   Used for ownership check
 * @returns {Promise<boolean>}
 */
export async function deleteIfcUpload(uploadId, projectId) {
    const result = await pgQuery(
        `SELECT storage_path FROM ifc_uploads WHERE id = $1 AND project_id = $2`,
        [uploadId, projectId],
    );

    if (!result.rows.length) return false;

    const { storage_path } = result.rows[0];
    if (storage_path) {
        await _deleteFromStorage(storage_path);
    }

    await pgQuery(
        `DELETE FROM ifc_uploads WHERE id = $1 AND project_id = $2`,
        [uploadId, projectId],
    );

    return true;
}
