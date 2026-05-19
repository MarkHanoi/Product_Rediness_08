/**
 * dwgConversionService.js — Phase 3, §31
 *
 * Server-side DWG → DXF conversion using Autodesk APS (formerly Forge)
 * Model Derivative API.
 *
 * CONTRACT (§31 §7 Phase 3 Security Rules):
 *   - DWG files are NOT stored on disk — processed in memory and discarded.
 *   - APS credentials are server-only (APS_CLIENT_ID, APS_CLIENT_SECRET secrets).
 *   - Conversion timeout: 120 seconds.
 *   - File size hard cap: 50 MB (enforced by caller via multer limits).
 *
 * Used by: POST /api/import/dwg endpoint in server.js
 */

const APS_AUTH_URL    = 'https://developer.api.autodesk.com/authentication/v2/token';
const APS_OSS_URL     = 'https://developer.api.autodesk.com/oss/v2';
const APS_DERIV_URL   = 'https://developer.api.autodesk.com/modelderivative/v2';
const BUCKET_KEY      = 'pryzm-dwg-tmp';
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MS       = 120_000;

/**
 * Convert a DWG Buffer to a DXF string using APS Model Derivative API.
 *
 * @param {Buffer} dwgBuffer  Raw DWG file bytes
 * @param {string} fileName   Original file name (used as object key)
 * @returns {Promise<string>} DXF text content
 * @throws on auth failure, upload failure, conversion failure, or timeout
 */
export async function convertDwgToDxf(dwgBuffer, fileName) {
    if (!process.env.APS_CLIENT_ID || !process.env.APS_CLIENT_SECRET) {
        throw new Error('[DwgConversion] APS_CLIENT_ID or APS_CLIENT_SECRET not configured. See §31 Phase 3.');
    }

    const token = await getApsToken();
    const objectKey = `dwg-${Date.now()}-${Math.random().toString(36).slice(2)}.dwg`;

    try {
        // 1. Ensure transient bucket exists
        await ensureBucket(token);

        // 2. Upload DWG bytes to OSS (object storage)
        await uploadToOss(token, objectKey, dwgBuffer);

        // 3. Trigger DXF derivative
        const urn = encodeBase64(`urn:adsk.objects:os.object:${BUCKET_KEY}/${objectKey}`);
        await triggerDerivative(token, urn);

        // 4. Poll until complete
        await pollUntilComplete(token, urn);

        // 5. Download DXF derivative
        const dxfText = await downloadDerivative(token, urn);

        return dxfText;
    } finally {
        // Always try to clean up the uploaded DWG (fire-and-forget)
        deleteFromOss(token, objectKey).catch(() => {});
    }
}

// ── APS API helpers ────────────────────────────────────────────────────────────

async function getApsToken() {
    const res = await fetch(APS_AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type:    'client_credentials',
            client_id:     process.env.APS_CLIENT_ID,
            client_secret: process.env.APS_CLIENT_SECRET,
            scope:         'data:read data:write data:create bucket:create bucket:read',
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`[DwgConversion] APS auth failed (${res.status}): ${text}`);
    }
    const data = await res.json();
    return data.access_token;
}

async function ensureBucket(token) {
    const res = await fetch(`${APS_OSS_URL}/buckets`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ bucketKey: BUCKET_KEY, policyKey: 'transient' }),
    });
    // 409 = already exists — that's fine
    if (!res.ok && res.status !== 409) {
        const text = await res.text().catch(() => '');
        throw new Error(`[DwgConversion] Bucket creation failed (${res.status}): ${text}`);
    }
}

async function uploadToOss(token, objectKey, buffer) {
    const res = await fetch(
        `${APS_OSS_URL}/buckets/${BUCKET_KEY}/objects/${encodeURIComponent(objectKey)}`,
        {
            method: 'PUT',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/octet-stream',
                'Content-Length': buffer.length,
            },
            body: buffer,
        },
    );
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`[DwgConversion] OSS upload failed (${res.status}): ${text}`);
    }
}

async function triggerDerivative(token, urn) {
    const res = await fetch(`${APS_DERIV_URL}/designdata/job`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'x-ads-force': 'true',
        },
        body: JSON.stringify({
            input: { urn },
            output: {
                formats: [{ type: 'dwg', views: ['2d'] }],
            },
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`[DwgConversion] Derivative trigger failed (${res.status}): ${text}`);
    }
}

async function pollUntilComplete(token, urn) {
    const start = Date.now();
    while (true) {
        if (Date.now() - start > TIMEOUT_MS) {
            throw new Error('[DwgConversion] Conversion timed out after 120 seconds');
        }
        await sleep(POLL_INTERVAL_MS);

        const res = await fetch(`${APS_DERIV_URL}/designdata/${urn}/manifest`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) continue;

        const data = await res.json();
        const status = data.status;

        if (status === 'success') return;
        if (status === 'failed' || status === 'timeout') {
            throw new Error(`[DwgConversion] APS derivative failed: ${JSON.stringify(data)}`);
        }
        // 'pending' | 'inprogress' → keep polling
    }
}

async function downloadDerivative(token, urn) {
    // Get manifest to find DXF derivative URN
    const manifestRes = await fetch(`${APS_DERIV_URL}/designdata/${urn}/manifest`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!manifestRes.ok) throw new Error('[DwgConversion] Failed to fetch manifest');
    const manifest = await manifestRes.json();

    // Find first DXF derivative
    let dxfUrn = null;
    function walk(node) {
        if (!node) return;
        if (node.mime === 'application/acad' || (node.urn && node.urn.endsWith('.dxf'))) {
            dxfUrn = node.urn;
        }
        if (node.children) node.children.forEach(walk);
    }
    (manifest.derivatives || []).forEach(walk);

    if (!dxfUrn) throw new Error('[DwgConversion] No DXF derivative found in manifest');

    const dxfRes = await fetch(
        `${APS_DERIV_URL}/designdata/${urn}/manifest/${encodeURIComponent(dxfUrn)}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!dxfRes.ok) throw new Error(`[DwgConversion] DXF download failed (${dxfRes.status})`);

    return dxfRes.text();
}

async function deleteFromOss(token, objectKey) {
    await fetch(
        `${APS_OSS_URL}/buckets/${BUCKET_KEY}/objects/${encodeURIComponent(objectKey)}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
    );
}

function encodeBase64(str) {
    return Buffer.from(str).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
