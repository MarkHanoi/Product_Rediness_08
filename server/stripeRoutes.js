/**
 * server/stripeRoutes.js
 * Express router for all Stripe-related endpoints.
 *
 * Mounted in server.js as:
 *   app.use('/api/stripe', authMiddleware, stripeRouter)
 *
 * Routes:
 *   GET  /api/stripe/config         — public key + configured price IDs (no auth needed)
 *   POST /api/stripe/checkout       — create a Stripe Checkout Session (auth required)
 *   GET  /api/stripe/subscription   — get user's current subscription status (auth required)
 *   POST /api/stripe/portal         — create Billing Portal session (auth required)
 *
 * Contract: §07-BIM-SECURITY-CONTRACT §4 — server-side plan authority.
 */

'use strict';

import express from 'express';
import {
    findOrCreateCustomer,
    createCheckoutSession,
    createPortalSession,
    resolvePriceId,
    getAllPriceIds,
} from './stripeService.js';
import { query } from './pgClient.js';

const stripeRouter = express.Router();

// ── GET /api/stripe/config ────────────────────────────────────────────────────
// Returns the Stripe publishable key and the configured price IDs.
// Called by the frontend to initialise Stripe.js and populate plan buttons.
// No auth required — publishable key is safe to expose client-side.
stripeRouter.get('/config', (_req, res) => {
    const publishableKey = process.env.STRIPE_PUBLISHABLE_KEY;
    if (!publishableKey) {
        // Stripe not yet configured — frontend can show a "coming soon" state
        return res.json({
            configured: false,
            message: 'Stripe keys not yet configured.',
            priceIds: getAllPriceIds(),
        });
    }
    res.json({
        configured: true,
        publishableKey,
        priceIds: getAllPriceIds(),
    });
});

// ── POST /api/stripe/checkout ─────────────────────────────────────────────────
// Creates a Stripe Checkout Session and returns the redirect URL.
// Body: { plan: 'architect'|'studio'|'firm', billing: 'monthly'|'annual' }
// Requires: Bearer JWT token (authMiddleware applied on the parent route)
stripeRouter.post('/checkout', async (req, res) => {
    const userId = req.auth?.userId;
    const email  = req.auth?.email;

    // Reject unauthenticated users — they must sign in first
    if (!userId || userId === 'anonymous') {
        return res.status(401).json({ error: 'Sign in to subscribe.' });
    }

    const { plan, billing = 'monthly' } = req.body ?? {};
    if (!plan || !['architect', 'studio', 'firm'].includes(plan)) {
        return res.status(400).json({ error: 'Invalid plan. Must be architect, studio, or firm.' });
    }

    try {
        // 1. Resolve the Stripe Price ID for this plan + billing interval
        const priceId = resolvePriceId(plan, billing);

        // 2. Look up the user's existing Stripe customer ID from the DB
        let existingCustomerId = null;
        try {
            const result = await query(
                'SELECT stripe_customer_id FROM pryzm_users WHERE id = $1',
                [userId]
            );
            existingCustomerId = result.rows[0]?.stripe_customer_id ?? null;
        } catch (dbErr) {
            console.warn('[stripe/checkout] Could not read stripe_customer_id from DB:', dbErr.message);
        }

        // 3. Find or create the Stripe Customer
        const customerId = await findOrCreateCustomer(userId, email, existingCustomerId);

        // 4. Persist the customer ID so we don't create duplicates on repeat visits
        if (customerId !== existingCustomerId) {
            try {
                await query(
                    'UPDATE pryzm_users SET stripe_customer_id = $1 WHERE id = $2',
                    [customerId, userId]
                );
            } catch (dbErr) {
                console.warn('[stripe/checkout] Could not save stripe_customer_id:', dbErr.message);
            }
        }

        // 5. Build the success and cancel redirect URLs
        const host = `${req.protocol}://${req.get('host')}`;
        const successUrl = `${host}/success.html?session_id={CHECKOUT_SESSION_ID}&plan=${plan}`;
        const cancelUrl  = `${host}/cancel.html`;

        // 6. Create the Stripe Checkout Session
        const session = await createCheckoutSession({
            customerId,
            priceId,
            userId,
            plan,
            successUrl,
            cancelUrl,
        });

        // 7. Return the checkout URL — the client redirects to it
        res.json({ url: session.url });

    } catch (err) {
        console.error('[stripe/checkout] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── GET /api/stripe/subscription ──────────────────────────────────────────────
// Returns the current user's subscription status from the DB.
// The plan field comes from planStore (set by the webhook), so it is always
// server-authoritative — never trust the client's localStorage.
stripeRouter.get('/subscription', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') {
        return res.json({ plan: 'free', status: 'active', subscriptionId: null });
    }

    try {
        const result = await query(
            'SELECT plan, plan_status, stripe_customer_id, stripe_subscription_id FROM pryzm_users WHERE id = $1',
            [userId]
        );
        const row = result.rows[0];
        if (!row) return res.json({ plan: 'free', status: 'active', subscriptionId: null });

        res.json({
            plan:            row.plan          ?? 'free',
            status:          row.plan_status   ?? 'active',
            customerId:      row.stripe_customer_id      ?? null,
            subscriptionId:  row.stripe_subscription_id  ?? null,
        });
    } catch (err) {
        console.error('[stripe/subscription] DB error:', err.message);
        res.status(500).json({ error: 'Could not retrieve subscription.' });
    }
});

// ── POST /api/stripe/portal ───────────────────────────────────────────────────
// Creates a Stripe Billing Portal session so the user can manage their subscription.
// Returns { url } — client redirects to this URL.
stripeRouter.post('/portal', async (req, res) => {
    const userId = req.auth?.userId;
    if (!userId || userId === 'anonymous') {
        return res.status(401).json({ error: 'Sign in to manage your subscription.' });
    }

    try {
        // Get the user's Stripe customer ID
        const result = await query(
            'SELECT stripe_customer_id FROM pryzm_users WHERE id = $1',
            [userId]
        );
        const customerId = result.rows[0]?.stripe_customer_id ?? null;

        if (!customerId) {
            return res.status(404).json({ error: 'No active subscription found. Subscribe first.' });
        }

        const host = `${req.protocol}://${req.get('host')}`;
        const session = await createPortalSession(customerId, `${host}/`);

        res.json({ url: session.url });
    } catch (err) {
        console.error('[stripe/portal] Error:', err.message);
        res.status(500).json({ error: err.message });
    }
});

export { stripeRouter };
