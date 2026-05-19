#!/usr/bin/env node
/**
 * scripts/seed-stripe-products.js
 * Creates BIM Browser (PRYZM) subscription products and prices in Stripe.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SETUP INSTRUCTIONS
 * ────────────────────────────────────────────────────────────────────────────
 * 1. Add your Stripe keys to Replit Secrets:
 *      STRIPE_SECRET_KEY       = sk_test_...
 *      STRIPE_PUBLISHABLE_KEY  = pk_test_...
 *      STRIPE_WEBHOOK_SECRET   = whsec_...  (from Stripe Dashboard → Webhooks)
 *
 * 2. Run this script once:
 *      node scripts/seed-stripe-products.js
 *
 * 3. Copy the printed Price IDs and add them to Replit Secrets:
 *      STRIPE_PRICE_ARCHITECT_MONTHLY = price_...
 *      STRIPE_PRICE_ARCHITECT_ANNUAL  = price_...
 *      STRIPE_PRICE_STUDIO_MONTHLY    = price_...
 *      STRIPE_PRICE_STUDIO_ANNUAL     = price_...
 *      STRIPE_PRICE_FIRM_MONTHLY      = price_...
 *      STRIPE_PRICE_FIRM_ANNUAL       = price_...
 *
 * 4. Restart the server.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * HOW TO RUN LOCALLY ON REPLIT
 * ────────────────────────────────────────────────────────────────────────────
 *   node scripts/seed-stripe-products.js
 *
 * The script is idempotent — it checks for existing products before creating
 * them, so it's safe to run multiple times.
 * ────────────────────────────────────────────────────────────────────────────
 */

import Stripe from 'stripe';

// ── Validate environment ──────────────────────────────────────────────────────
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_SECRET_KEY) {
    console.error('❌  STRIPE_SECRET_KEY is not set in environment / Replit Secrets.');
    console.error('    Add it, then re-run this script.');
    process.exit(1);
}

const stripe = new Stripe(STRIPE_SECRET_KEY, { apiVersion: '2025-01-27.acacia' });

// ── Product definitions ───────────────────────────────────────────────────────
// Prices are in USD cents (e.g. 5900 = $59.00)
const PRODUCTS = [
    {
        name:        'BIM Browser — Architect',
        description: 'Solo practitioners and freelancers. Unlimited projects, IFC/GLB export, 50 AI actions/month.',
        plan:        'architect',
        monthly:     5900,   // $59 / month
        annual:      59000,  // $590 / year  (~17% saving)
    },
    {
        name:        'BIM Browser — Studio',
        description: 'Small architecture firms, up to 8 seats. Real-time collaboration, 200 AI actions/month.',
        plan:        'studio',
        monthly:     14900,  // $149 / month
        annual:      149000, // $1,490 / year
    },
    {
        name:        'BIM Browser — Firm',
        description: 'Established firms, up to 25 seats. API access, SSO, 500 AI actions/month.',
        plan:        'firm',
        monthly:     34900,  // $349 / month
        annual:      349000, // $3,490 / year
    },
];

// ── Main ──────────────────────────────────────────────────────────────────────
async function seedProducts() {
    console.log('🔧  Seeding Stripe products for BIM Browser (PRYZM)...\n');
    const results = {};

    for (const def of PRODUCTS) {
        console.log(`── ${def.name}`);

        // Check for existing product so the script stays idempotent
        const existing = await stripe.products.search({
            query: `name:'${def.name}' AND active:'true'`,
        });

        let product;
        if (existing.data.length > 0) {
            product = existing.data[0];
            console.log(`   ✓ Product already exists: ${product.id}`);
        } else {
            product = await stripe.products.create({
                name:        def.name,
                description: def.description,
                // Plan name stored in metadata for reference
                metadata:    { plan: def.plan },
            });
            console.log(`   ✓ Created product: ${product.id}`);
        }

        // Monthly price
        const monthlyPrices = await stripe.prices.list({
            product: product.id,
            recurring: { interval: 'month' },
            active: true,
            limit: 1,
        });

        let monthlyPrice;
        if (monthlyPrices.data.length > 0) {
            monthlyPrice = monthlyPrices.data[0];
            console.log(`   ✓ Monthly price already exists: ${monthlyPrice.id}  ($${def.monthly / 100}/mo)`);
        } else {
            monthlyPrice = await stripe.prices.create({
                product:    product.id,
                unit_amount: def.monthly,
                currency:   'usd',
                recurring:  { interval: 'month' },
                metadata:   { plan: def.plan, billing: 'monthly' },
            });
            console.log(`   ✓ Created monthly price: ${monthlyPrice.id}  ($${def.monthly / 100}/mo)`);
        }

        // Annual price
        const annualPrices = await stripe.prices.list({
            product: product.id,
            recurring: { interval: 'year' },
            active: true,
            limit: 1,
        });

        let annualPrice;
        if (annualPrices.data.length > 0) {
            annualPrice = annualPrices.data[0];
            console.log(`   ✓ Annual price already exists:  ${annualPrice.id}  ($${def.annual / 100}/yr)`);
        } else {
            annualPrice = await stripe.prices.create({
                product:    product.id,
                unit_amount: def.annual,
                currency:   'usd',
                recurring:  { interval: 'year' },
                metadata:   { plan: def.plan, billing: 'annual' },
            });
            console.log(`   ✓ Created annual price:  ${annualPrice.id}  ($${def.annual / 100}/yr)`);
        }

        results[def.plan] = { monthly: monthlyPrice.id, annual: annualPrice.id };
        console.log('');
    }

    // ── Print the env vars to copy into Replit Secrets ────────────────────────
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('✅  All done! Add these to Replit Secrets, then restart the server:');
    console.log('════════════════════════════════════════════════════════════════════');
    console.log('');
    for (const [plan, ids] of Object.entries(results)) {
        const PLAN = plan.toUpperCase();
        console.log(`STRIPE_PRICE_${PLAN}_MONTHLY=${ids.monthly}`);
        console.log(`STRIPE_PRICE_${PLAN}_ANNUAL=${ids.annual}`);
    }
    console.log('');
    console.log('Also set (if not already done):');
    console.log('  STRIPE_PUBLISHABLE_KEY=pk_test_...');
    console.log('  STRIPE_WEBHOOK_SECRET=whsec_... (from Stripe Dashboard → Webhooks → your endpoint)');
    console.log('');
    console.log('Webhook endpoint to register in Stripe Dashboard:');
    const domain = process.env.REPLIT_DEV_DOMAIN ?? 'your-replit-domain.replit.dev';
    console.log(`  https://${domain}/api/stripe/webhook`);
    console.log('');
    console.log('Events to listen for:');
    console.log('  customer.subscription.created');
    console.log('  customer.subscription.updated');
    console.log('  customer.subscription.deleted');
}

seedProducts().catch(err => {
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
});
