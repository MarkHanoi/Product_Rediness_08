/**
 * server/authStore.js
 * Server-side user authentication for PRYZM.
 *
 * Provides real email/password authentication backed by Supabase (primary)
 * or Replit PostgreSQL (fallback). Passwords are hashed with bcrypt (cost 12).
 * Sessions are signed JWTs using SESSION_SECRET env var.
 *
 * Priority:
 *   1. Supabase — when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set
 *   2. Replit PG — when DATABASE_URL is set (legacy fallback)
 *
 * Contract: §07-BIM-SECURITY-CONTRACT §2 — server-side auth gate.
 *
 * CDE Phase 1 — Owner promotion:
 *   When the registering/signing-in email matches PRYZM_OWNER_EMAIL, the plan
 *   stored in pryzm_users and user_plans is immediately set to 'owner', not 'free'.
 *   This is belt-and-suspenders on top of maybeAutoGrantOwner() in planStore.js.
 *   §07 §C4: planStore is still the runtime authority; this ensures DB consistency.
 */

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';
import { getSupabaseClient } from './supabaseClient.js';
import { query } from './pgClient.js';

const BCRYPT_ROUNDS = 12;
const TOKEN_EXPIRY = '30d';
const EPHEMERAL_SESSION_SECRET = randomBytes(48).toString('hex');

function getSessionSecret() {
    const secret = process.env.SESSION_SECRET;
    if (!secret) {
        console.warn('[authStore] SESSION_SECRET not set — using an ephemeral per-process secret. Set it in Replit Secrets for persistent sessions.');
        return EPHEMERAL_SESSION_SECRET;
    }
    return secret;
}

function generateUserId() {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Returns 'owner' if the given email matches PRYZM_OWNER_EMAIL, else 'free'.
 * Used during signup/signin to set the initial plan in the database.
 * Runtime enforcement is still done by maybeAutoGrantOwner() in planStore.js.
 */
function resolveInitialPlan(email) {
    const ownerEmail = process.env.PRYZM_OWNER_EMAIL;
    if (!ownerEmail || !email) return 'free';
    return email.toLowerCase().trim() === ownerEmail.toLowerCase().trim() ? 'owner' : 'free';
}

// ── Supabase auth helpers ─────────────────────────────────────────────────────

async function signUpViaSupabase({ email, password, name }) {
    const supabase = await getSupabaseClient();
    const normalEmail = email.toLowerCase().trim();

    const { data: existing } = await supabase
        .from('pryzm_users')
        .select('id')
        .eq('email', normalEmail)
        .maybeSingle();

    if (existing) throw new Error('An account with this email already exists.');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = generateUserId();
    const plan = resolveInitialPlan(normalEmail);

    const { error } = await supabase.from('pryzm_users').insert({
        id: userId,
        email: normalEmail,
        name: name.trim(),
        password_hash: passwordHash,
        plan,
        plan_status: 'active',
    });

    if (error) throw new Error(`Sign-up failed: ${error.message}`);

    await supabase.from('user_plans').upsert({
        user_id: userId,
        plan,
        plan_status: 'active',
        ai_calls_this_period: 0,
        period_start: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (plan === 'owner') {
        console.log(`[authStore/supabase] Owner detected at signup — granted 'owner' plan for ${userId}`);
    }

    const user = { id: userId, email: normalEmail, name: name.trim(), plan, planStatus: 'active' };
    const token = jwt.sign({ sub: userId, email: normalEmail }, getSessionSecret(), { expiresIn: TOKEN_EXPIRY });

    return { user, token };
}

async function signInViaSupabase({ email, password }) {
    const supabase = await getSupabaseClient();
    const normalEmail = email.toLowerCase().trim();

    const { data: row, error } = await supabase
        .from('pryzm_users')
        .select('id, email, name, password_hash, plan, plan_status')
        .eq('email', normalEmail)
        .maybeSingle();

    if (error || !row) throw new Error('Invalid email or password.');

    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new Error('Invalid email or password.');

    // Ensure owner email always has 'owner' plan persisted in DB
    const effectivePlan = resolveInitialPlan(normalEmail) === 'owner' ? 'owner' : row.plan;
    if (effectivePlan === 'owner' && row.plan !== 'owner') {
        await supabase.from('pryzm_users')
            .update({ plan: 'owner' })
            .eq('id', row.id);
        await supabase.from('user_plans').upsert({
            user_id: row.id,
            plan: 'owner',
            plan_status: 'active',
            updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        console.log(`[authStore/supabase] Owner detected at sign-in — promoted ${row.id} to 'owner' plan in DB`);
    }

    const user = { id: row.id, email: row.email, name: row.name, plan: effectivePlan, planStatus: row.plan_status };
    const token = jwt.sign({ sub: row.id, email: row.email }, getSessionSecret(), { expiresIn: TOKEN_EXPIRY });

    console.log(`[authStore/supabase] User signed in: ${row.id} plan=${effectivePlan}`);
    return { user, token };
}

async function getUserByIdViaSupabase(userId) {
    const supabase = await getSupabaseClient();
    const { data } = await supabase
        .from('pryzm_users')
        .select('id, email, name, plan, plan_status')
        .eq('id', userId)
        .maybeSingle();
    if (!data) return null;
    return { id: data.id, email: data.email, name: data.name, plan: data.plan, planStatus: data.plan_status };
}

// ── Replit PG auth helpers (legacy fallback) ──────────────────────────────────

async function signUpViaPg({ email, password, name }) {
    const normalEmail = email.toLowerCase().trim();

    const existing = await query('SELECT id FROM pryzm_users WHERE email = $1', [normalEmail]);
    if (existing.rows.length > 0) throw new Error('An account with this email already exists.');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = generateUserId();
    const plan = resolveInitialPlan(normalEmail);

    await query(
        `INSERT INTO pryzm_users (id, email, name, password_hash, plan, plan_status)
         VALUES ($1, $2, $3, $4, $5, 'active')`,
        [userId, normalEmail, name.trim(), passwordHash, plan]
    );

    // Initialise plan/quota row
    await query(
        `INSERT INTO user_plans (user_id, plan, plan_status, ai_calls_this_period, period_start, updated_at)
         VALUES ($1, $2, 'active', 0, NOW(), NOW())
         ON CONFLICT (user_id) DO UPDATE SET plan = $2, updated_at = NOW()`,
        [userId, plan]
    );

    if (plan === 'owner') {
        console.log(`[authStore/pg] Owner detected at signup — granted 'owner' plan for ${userId}`);
    }

    const user = { id: userId, email: normalEmail, name: name.trim(), plan, planStatus: 'active' };
    const token = jwt.sign({ sub: userId, email: normalEmail }, getSessionSecret(), { expiresIn: TOKEN_EXPIRY });

    return { user, token };
}

async function signInViaPg({ email, password }) {
    const normalEmail = email.toLowerCase().trim();

    const result = await query(
        'SELECT id, email, name, password_hash, plan, plan_status FROM pryzm_users WHERE email = $1',
        [normalEmail]
    );

    if (result.rows.length === 0) throw new Error('Invalid email or password.');

    const row = result.rows[0];
    const valid = await bcrypt.compare(password, row.password_hash);
    if (!valid) throw new Error('Invalid email or password.');

    // Ensure owner email always has 'owner' plan persisted in DB
    const effectivePlan = resolveInitialPlan(normalEmail) === 'owner' ? 'owner' : row.plan;
    if (effectivePlan === 'owner' && row.plan !== 'owner') {
        await query(
            `UPDATE pryzm_users SET plan = 'owner' WHERE id = $1`,
            [row.id]
        );
        await query(
            `INSERT INTO user_plans (user_id, plan, plan_status, ai_calls_this_period, period_start, updated_at)
             VALUES ($1, 'owner', 'active', 0, NOW(), NOW())
             ON CONFLICT (user_id) DO UPDATE SET plan = 'owner', updated_at = NOW()`,
            [row.id]
        );
        console.log(`[authStore/pg] Owner detected at sign-in — promoted ${row.id} to 'owner' plan in DB`);
    }

    const user = { id: row.id, email: row.email, name: row.name, plan: effectivePlan, planStatus: row.plan_status };
    const token = jwt.sign({ sub: row.id, email: row.email }, getSessionSecret(), { expiresIn: TOKEN_EXPIRY });

    console.log(`[authStore/pg] User signed in: ${row.id} plan=${effectivePlan}`);
    return { user, token };
}

async function getUserByIdViaPg(userId) {
    const result = await query(
        'SELECT id, email, name, plan, plan_status FROM pryzm_users WHERE id = $1',
        [userId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return { id: row.id, email: row.email, name: row.name, plan: row.plan, planStatus: row.plan_status };
}

// ── Public API — automatically routes to Supabase or Replit PG ───────────────

/**
 * Sign up a new user.
 * Uses Supabase when configured, Replit PG as fallback.
 * If email matches PRYZM_OWNER_EMAIL, plan is set to 'owner' immediately.
 * @returns {{ user, token }} on success
 * @throws on duplicate email, missing DB, or validation error
 */
export async function signUp({ email, password, name }) {
    const supabase = await getSupabaseClient();
    if (supabase) return signUpViaSupabase({ email, password, name });

    return signUpViaPg({ email, password, name });
}

/**
 * Sign in an existing user.
 * Uses Supabase when configured, Replit PG as fallback.
 * If email matches PRYZM_OWNER_EMAIL, plan is promoted to 'owner' in DB.
 * @returns {{ user, token }} on success
 * @throws on invalid credentials
 */
export async function signIn({ email, password }) {
    const supabase = await getSupabaseClient();
    if (supabase) return signInViaSupabase({ email, password });

    return signInViaPg({ email, password });
}

/**
 * Verify a session JWT. Returns the decoded payload or null.
 */
export function verifyToken(token) {
    try {
        return jwt.verify(token, getSessionSecret());
    } catch {
        return null;
    }
}

/**
 * Fetch a user by ID (for middleware enrichment).
 * Uses Supabase when configured, Replit PG as fallback.
 */
export async function getUserById(userId) {
    const supabase = await getSupabaseClient();
    if (supabase) return getUserByIdViaSupabase(userId);

    return getUserByIdViaPg(userId);
}

/**
 * Returns true if at least one database backend is available.
 * Used by auth route guards in server.js.
 */
export async function isDatabaseAvailable() {
    const supabase = await getSupabaseClient();
    if (supabase) return true;

    const { getPgPool } = await import('./pgClient.js');
    return getPgPool() !== null;
}
