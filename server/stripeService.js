/**
 * server/stripeService.js
 * Stripe API service for BIM Browser (PRYZM) subscription management.
 *
 * Reads credentials from environment variables:
 *   STRIPE_SECRET_KEY       — your Stripe secret key (sk_test_... or sk_live_...)
 *   STRIPE_PUBLISHABLE_KEY  — your Stripe publishable key (pk_test_... or pk_live_...)
 *
 * Price IDs (set after running scripts/seed-stripe-products.js):
 *   STRIPE_PRICE_ARCHITECT_MONTHLY
 *   STRIPE_PRICE_ARCHITECT_ANNUAL
 *   STRIPE_PRICE_STUDIO_MONTHLY
 *   STRIPE_PRICE_STUDIO_ANNUAL
 *   STRIPE_PRICE_FIRM_MONTHLY
 *   STRIPE_PRICE_FIRM_ANNUAL
 *
 * Contract: §07-BIM-SECURITY-CONTRACT §4 — Stripe is the ONLY payment authority.
 * Never trust client-reported plan values. Plans are updated ONLY via verified webhooks.
 */

'use strict';

import Stripe from 'stripe';

// ── Plan → Stripe price ID mapping (from environment variables) ───────────────
// Populate these after running: node scripts/seed-stripe-products.js
const PRICE_IDS = {
    architect: {
        monthly: process.env.STRIPE_PRICE_ARCHITECT_MONTHLY ?? null,
        annual:  process.env.STRIPE_PRICE_ARCHITECT_ANNUAL  ?? null,
    },
    studio: {
        monthly: process.env.STRIPE_PRICE_STUDIO_MONTHLY ?? null,
        annual:  process.env.STRIPE_PRICE_STUDIO_ANNUAL  ?? null,
    },
    firm: {
        monthly: process.env.STRIPE_PRICE_FIRM_MONTHLY ?? null,
        annual:  process.env.STRIPE_PRICE_FIRM_ANNUAL  ?? null,
    },
};

// ── Stripe client factory (not cached — key can rotate) ──────────────────────
function getStripeClient() {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) {
        throw new Error(
            'STRIPE_SECRET_KEY is not set. ' +
            'Add it to Replit Secrets (sk_test_... or sk_live_...).'
        );
    }
    return new Stripe(key, { apiVersion: '2025-01-27.acacia' });
}

// ── Price ID resolution ───────────────────────────────────────────────────────
/**
 * Returns the Stripe Price ID for a given plan + billing interval.
 * Throws if the price ID is not configured.
 * @param {string} plan — 'architect' | 'studio' | 'firm'
 * @param {'monthly'|'annual'} billing
 * @returns {string} Stripe Price ID
 */
export function resolvePriceId(plan, billing = 'monthly') {
    const interval = billing === 'annual' ? 'annual' : 'monthly';
    const priceId = PRICE_IDS[plan]?.[interval];
    if (!priceId) {
        throw new Error(
            `Stripe price ID not configured for plan=${plan} billing=${interval}. ` +
            `Run scripts/seed-stripe-products.js then add the Price IDs to Replit Secrets.`
        );
    }
    return priceId;
}

/**
 * Returns all configured price IDs for the frontend to display.
 * Null values indicate the price ID has not been set yet.
 */
export function getAllPriceIds() {
    return {
        architect: { ...PRICE_IDS.architect },
        studio:    { ...PRICE_IDS.studio    },
        firm:      { ...PRICE_IDS.firm      },
    };
}

// ── Customer management ───────────────────────────────────────────────────────
/**
 * Finds or creates a Stripe Customer for a user.
 * @param {string} userId  — internal PRYZM user ID
 * @param {string} email   — user's email
 * @param {string|null} existingCustomerId — stored stripe_customer_id (if any)
 * @returns {Promise<string>} Stripe customer ID
 */
export async function findOrCreateCustomer(userId, email, existingCustomerId = null) {
    const stripe = getStripeClient();

    // Reuse existing customer if we already created one
    if (existingCustomerId) {
        try {
            const customer = await stripe.customers.retrieve(existingCustomerId);
            if (!customer.deleted) return existingCustomerId;
        } catch {
            // Customer not found in Stripe — create a fresh one below
        }
    }

    // Search for existing customer by email first (prevents duplicates)
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length > 0) {
        return existing.data[0].id;
    }

    // Create a new customer with PRYZM userId in metadata for webhook lookup
    const customer = await stripe.customers.create({
        email,
        metadata: { userId },
    });

    console.log(`[stripe] Created customer: ${customer.id} for userId=${userId}`);
    return customer.id;
}

// ── Checkout session ──────────────────────────────────────────────────────────
/**
 * Creates a Stripe Checkout Session for a subscription.
 * The session includes userId and plan in metadata so the webhook can update the DB.
 *
 * @param {object} options
 * @param {string} options.customerId    — Stripe customer ID
 * @param {string} options.priceId       — Stripe Price ID
 * @param {string} options.userId        — internal PRYZM user ID (stored in metadata)
 * @param {string} options.plan          — plan name (stored in metadata for webhook)
 * @param {string} options.successUrl    — redirect URL on payment success
 * @param {string} options.cancelUrl     — redirect URL if user cancels
 * @returns {Promise<Stripe.Checkout.Session>}
 */
export async function createCheckoutSession({ customerId, priceId, userId, plan, successUrl, cancelUrl }) {
    const stripe = getStripeClient();

    const session = await stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{ price: priceId, quantity: 1 }],
        mode: 'subscription',
        success_url: successUrl,
        cancel_url: cancelUrl,
        // Store userId + plan in subscription metadata so the webhook can update the DB
        subscription_data: {
            metadata: { userId, plan },
        },
        // Allow promo codes
        allow_promotion_codes: true,
    });

    console.log(`[stripe] Checkout session created: ${session.id} for userId=${userId} plan=${plan}`);
    return session;
}

// ── Customer Portal session ───────────────────────────────────────────────────
/**
 * Creates a Stripe Billing Portal session so the user can manage their subscription
 * (cancel, update payment method, view invoices).
 *
 * @param {string} customerId — Stripe customer ID
 * @param {string} returnUrl  — URL to return to after portal interaction
 * @returns {Promise<Stripe.BillingPortal.Session>}
 */
export async function createPortalSession(customerId, returnUrl) {
    const stripe = getStripeClient();
    const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
    });
    return session;
}

// ── Webhook signature verification ────────────────────────────────────────────
/**
 * Verifies and constructs a Stripe webhook event from the raw body buffer.
 * MUST be called with the raw Buffer body — not parsed JSON.
 *
 * @param {Buffer} rawBody       — raw request body Buffer
 * @param {string} signature     — value of stripe-signature header
 * @param {string} webhookSecret — STRIPE_WEBHOOK_SECRET env var
 * @returns {Stripe.Event}
 */
export function constructWebhookEvent(rawBody, signature, webhookSecret) {
    const stripe = getStripeClient();
    return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
