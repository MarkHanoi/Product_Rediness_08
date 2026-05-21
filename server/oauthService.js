/**
 * server/oauthService.js
 *
 * Google and Microsoft OAuth2 integration for PRYZM.
 *
 * Flow (popup-based):
 *   1. Client opens /api/auth/google (or /microsoft) in a popup window.
 *   2. Server redirects to the provider's consent screen.
 *   3. Provider calls our callback URL with ?code=...
 *   4. Server exchanges code for an access token, fetches the user's profile,
 *      then upserts the user in the DB and mints a PRYZM JWT.
 *   5. Callback route returns a tiny HTML page that calls
 *      window.opener.postMessage({ token, user }, origin) then closes itself.
 *   6. AuthModal.ts receives the message and completes the login flow.
 *
 * Required env vars (set in Replit Secrets):
 *   GOOGLE_CLIENT_ID         — from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET     — from Google Cloud Console
 *   MICROSOFT_CLIENT_ID      — from Azure App Registration
 *   MICROSOFT_CLIENT_SECRET  — from Azure App Registration
 *
 * Redirect URIs to register with each provider:
 *   Google:    https://<your-domain>/api/auth/google/callback
 *   Microsoft: https://<your-domain>/api/auth/microsoft/callback
 */

import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { getSupabaseClient } from './supabaseClient.js';
import { query } from './pgClient.js';

const TOKEN_EXPIRY = '30d';
const EPHEMERAL_SECRET = randomBytes(48).toString('hex');

function getSessionSecret() {
    return process.env.SESSION_SECRET ?? EPHEMERAL_SECRET;
}

function resolveInitialPlan(email) {
    const ownerEmail = process.env.PRYZM_OWNER_EMAIL;
    if (!ownerEmail || !email) return 'free';
    return email.toLowerCase().trim() === ownerEmail.toLowerCase().trim() ? 'owner' : 'free';
}

function generateUserId() {
    return `user-${Date.now()}-${randomBytes(4).toString('hex')}`;
}

/** Mint a PRYZM JWT for the given user object. */
export function mintToken(user) {
    return jwt.sign({ sub: user.id, email: user.email }, getSessionSecret(), { expiresIn: TOKEN_EXPIRY });
}

/**
 * Upsert an OAuth user into the DB (Supabase or PG).
 * If a user with that email already exists, we return them unchanged.
 * If not, a new user is created (no password — oauth_provider set).
 */
export async function upsertOAuthUser({ email, name, provider }) {
    const normalEmail = email.toLowerCase().trim();
    const supabase = await getSupabaseClient();

    if (supabase) {
        // Try to find existing user
        const { data: existing } = await supabase
            .from('pryzm_users')
            .select('id, email, name, plan, plan_status')
            .eq('email', normalEmail)
            .maybeSingle();

        if (existing) {
            console.log(`[oauth/${provider}] Existing user signed in: ${existing.id}`);
            return { id: existing.id, email: existing.email, name: existing.name, plan: existing.plan, planStatus: existing.plan_status };
        }

        const userId = generateUserId();
        const plan = resolveInitialPlan(normalEmail);

        const { error } = await supabase.from('pryzm_users').insert({
            id: userId,
            email: normalEmail,
            name: name ?? normalEmail.split('@')[0],
            password_hash: null,
            plan,
            plan_status: 'active',
            oauth_provider: provider,
        });

        if (error) throw new Error(`OAuth user creation failed: ${error.message}`);

        await supabase.from('user_plans').upsert({
            user_id: userId,
            plan,
            plan_status: 'active',
            ai_calls_this_period: 0,
            period_start: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

        return { id: userId, email: normalEmail, name: name ?? normalEmail.split('@')[0], plan, planStatus: 'active' };
    }

    // Replit PG fallback
    const existing = await query('SELECT id, email, name, plan, plan_status FROM pryzm_users WHERE email = $1', [normalEmail]);
    if (existing.rows.length > 0) {
        const row = existing.rows[0];
        console.log(`[oauth/${provider}] Existing user signed in: ${row.id}`);
        return { id: row.id, email: row.email, name: row.name, plan: row.plan, planStatus: row.plan_status };
    }

    const userId = generateUserId();
    const plan = resolveInitialPlan(normalEmail);
    await query(
        `INSERT INTO pryzm_users (id, email, name, password_hash, plan, plan_status)
         VALUES ($1, $2, $3, NULL, $4, 'active')`,
        [userId, normalEmail, name ?? normalEmail.split('@')[0], plan]
    );
    await query(
        `INSERT INTO user_plans (user_id, plan, plan_status, ai_calls_this_period, period_start, updated_at)
         VALUES ($1, $2, 'active', 0, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET plan = $2, updated_at = NOW()`,
        [userId, plan]
    );
    return { id: userId, email: normalEmail, name: name ?? normalEmail.split('@')[0], plan, planStatus: 'active' };
}

/** Returns the public-facing base URL for building OAuth redirect URIs.
 *
 *  §H4 (audit) — Order of trust (most → least): PUBLIC_BASE_URL env var,
 *  REPLIT_DEV_DOMAIN (Replit sets this server-side, not client-controlled),
 *  then ONLY as a last resort the request headers. Without an env-var lock,
 *  an attacker setting `Host:` could influence the OAuth `redirect_uri`,
 *  which is exactly the open-redirect / token-theft surface OAuth state
 *  validation is supposed to close. In production we require one of the
 *  two server-side sources and ignore client headers entirely.
 */
export function getBaseUrl(req) {
    if (process.env.PUBLIC_BASE_URL) {
        return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
    }
    if (process.env.REPLIT_DEV_DOMAIN) {
        return `https://${process.env.REPLIT_DEV_DOMAIN}`;
    }
    if (process.env.NODE_ENV === 'production') {
        // Fail loud rather than fall back to attacker-controlled Host header.
        throw new Error('[oauthService] PUBLIC_BASE_URL must be set in production (§H4 audit).');
    }
    // Dev only: use the client-supplied host so local laptops just work.
    const proto = req.headers['x-forwarded-proto'] ?? 'https';
    return `${proto}://${req.headers.host}`;
}

// ── Google OAuth helpers ──────────────────────────────────────────────────────

export function googleAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'online',
        state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

export async function exchangeGoogleCode(code, redirectUri) {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: process.env.GOOGLE_CLIENT_ID ?? '',
            client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });
    if (!resp.ok) throw new Error(`Google token exchange failed: ${await resp.text()}`);
    return resp.json();
}

export async function fetchGoogleProfile(accessToken) {
    const resp = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new Error('Failed to fetch Google profile.');
    return resp.json(); // { id, email, name, picture }
}

// ── Microsoft OAuth helpers ───────────────────────────────────────────────────

export function microsoftAuthUrl(redirectUri, state) {
    const params = new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile User.Read',
        response_mode: 'query',
        state,
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
}

export async function exchangeMicrosoftCode(code, redirectUri) {
    const resp = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            code,
            client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
            client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '',
            redirect_uri: redirectUri,
            grant_type: 'authorization_code',
        }),
    });
    if (!resp.ok) throw new Error(`Microsoft token exchange failed: ${await resp.text()}`);
    return resp.json();
}

export async function fetchMicrosoftProfile(accessToken) {
    const resp = await fetch('https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new Error('Failed to fetch Microsoft profile.');
    const data = await resp.json();
    return {
        email: data.mail ?? data.userPrincipalName ?? '',
        name: data.displayName ?? '',
    };
}

/** Returns an HTML page that posts the result back to the opener and closes. */
export function callbackHtml(payload, origin) {
    const json = JSON.stringify(payload).replace(/</g, '\\u003c');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>PRYZM — Signing in…</title>
<style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:system-ui,sans-serif;background:#f5f5ff;color:#333;}
.card{background:#fff;border-radius:16px;padding:40px 48px;text-align:center;box-shadow:0 8px 32px rgba(102,0,255,.15);}
.logo{font-size:24px;font-weight:700;letter-spacing:4px;color:#150830;margin-bottom:8px;}
p{color:#6b7280;font-size:14px;}</style>
</head><body>
<div class="card">
  <div class="logo">PRYZM</div>
  <p>Signing you in…</p>
</div>
<script>
(function(){
  var payload = ${json};
  var target  = ${JSON.stringify(origin)};
  try {
    if (window.opener) {
      window.opener.postMessage({ type: 'pryzm-oauth', payload: payload }, target || '*');
    }
  } catch(e){}
  setTimeout(function(){ window.close(); }, 800);
})();
</script></body></html>`;
}
