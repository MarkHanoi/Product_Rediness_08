/**
 * @file server/supabaseClient.js
 * @description Server-side Supabase client factory for PRYZM.
 *
 * CONTRACT (07-BIM-SECURITY-CONTRACT §5 — Database Security):
 *  - When SUPABASE_SERVICE_ROLE_KEY is configured this module creates a Supabase client
 *    with the service role key, which bypasses RLS and is suitable for trusted server
 *    operations (admin reads, cross-user queries).
 *  - When only SUPABASE_ANON_KEY is available the client falls back to the anon key,
 *    which is subject to RLS and only works when RLS policies are properly configured.
 *  - SUPABASE_SERVICE_ROLE_KEY MUST NEVER appear in any file inside src/ or any
 *    Vite-bundled module. It is confinable to server/ and server.js only.
 *  - The module exports a single async factory function: getSupabaseClient().
 *    All server-side Supabase usage MUST go through this factory — never create
 *    Supabase clients inline in route handlers.
 *
 * Environment variables (set via Replit Secrets):
 *   SUPABASE_URL              — required (also accepts NEXT_PUBLIC_SUPABASE_URL for
 *                               compatibility with the Pascal workspace)
 *   SUPABASE_SERVICE_ROLE_KEY — preferred: bypasses RLS for trusted server operations
 *   SUPABASE_ANON_KEY         — fallback (also accepts NEXT_PUBLIC_SUPABASE_ANON_KEY)
 */

let _cachedClient = null;
let _cachedKey = null;

// Caches whether we have already warned about a missing key so the message
// only appears once on boot rather than on every authenticated request.
let _warnedMissingKey = false;
// Caches whether the URL is absent so we skip resolution on every call.
let _warnedMissingUrl = false;
// When true, all calls return null immediately (no key available — cached result).
let _nullResult = false;

/**
 * Resolves the Supabase project URL from available environment variables.
 * Accepts both SUPABASE_URL (PRYZM) and NEXT_PUBLIC_SUPABASE_URL (Pascal)
 * so both apps can share a single Replit Secrets configuration.
 */
function resolveUrl() {
    return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;
}

/**
 * Resolves the best available Supabase API key.
 * Prefers service role key (bypasses RLS) over anon key.
 * Accepts both PRYZM-style and Pascal-style env var names.
 */
function resolveKey() {
    return (
        process.env.SUPABASE_SERVICE_ROLE_KEY ||
        process.env.SUPABASE_ANON_KEY ||
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
        null
    );
}

/**
 * Returns a Supabase client instance.
 * Prefers SUPABASE_SERVICE_ROLE_KEY over SUPABASE_ANON_KEY.
 * Returns null when Supabase is not configured.
 *
 * The null result is cached after the first resolution attempt so that
 * repeated calls (one per authenticated request) do not spam the logs.
 *
 * @returns {Promise<import('@supabase/supabase-js').SupabaseClient | null>}
 */
export async function getSupabaseClient() {
    // Fast path: if we already know there is no key, return null immediately.
    if (_nullResult) return null;

    const url = resolveUrl();
    if (!url) {
        if (!_warnedMissingUrl) {
            _warnedMissingUrl = true;
            console.warn('[supabase] SUPABASE_URL is not set. Using Replit PostgreSQL as primary database.');
        }
        _nullResult = true;
        return null;
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const key = resolveKey();

    if (!key) {
        if (!_warnedMissingKey) {
            _warnedMissingKey = true;
            console.warn('[supabase] URL is set but no key found. ' +
                'Set SUPABASE_SERVICE_ROLE_KEY (preferred) or SUPABASE_ANON_KEY in Replit Secrets. ' +
                'Falling back to Replit PostgreSQL.');
        }
        _nullResult = true;
        return null;
    }

    // Return cached client when key hasn't changed (avoids creating a new connection per request).
    if (_cachedClient && _cachedKey === key) return _cachedClient;

    try {
        const { createClient } = await import('@supabase/supabase-js');
        const options = serviceKey
            ? { auth: { autoRefreshToken: false, persistSession: false } }
            : {};
        _cachedClient = createClient(url, key, options);
        _cachedKey = key;

        if (serviceKey) {
            console.log('[supabase] Connected with service role key (RLS bypassed)');
        } else {
            console.warn('[supabase] Connected with anon key — ensure RLS policies are configured. ' +
                'Set SUPABASE_SERVICE_ROLE_KEY for unrestricted server access.');
        }

        return _cachedClient;
    } catch (err) {
        console.error('[supabase] Failed to create client:', err.message);
        return null;
    }
}
