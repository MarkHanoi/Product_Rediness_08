/**
 * E2E test 12 — PWA install (Wave A20-T20)
 *
 * CONTRACT (C07 §7 — PWA requirements):
 *  - manifest.json is valid and served with correct content-type
 *  - Service worker is registered at /sw.js
 *  - App passes Chromium's installability criteria (for Chrome)
 *
 * NOTE: Playwright cannot trigger the browser's native install prompt
 * (it requires user gesture + meeting all criteria). Instead, we verify
 * the necessary prerequisites that make the app installable.
 */

import { test, expect } from '@playwright/test';

test.describe('PWA install prerequisites (C07 §7)', () => {
  test('manifest.json is served with correct content-type', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'] ?? '';
    // Accept application/json or application/manifest+json
    expect(contentType).toMatch(/json/);
  });

  test('manifest.json has required PWA fields', async ({ page }) => {
    const response = await page.request.get('/manifest.json');
    const manifest = await response.json() as Record<string, unknown>;

    // Required fields per C07 §7.1
    expect(manifest).toHaveProperty('name');
    expect(manifest).toHaveProperty('short_name');
    expect(manifest).toHaveProperty('start_url');
    expect(manifest).toHaveProperty('display');
    expect(manifest).toHaveProperty('theme_color');
    expect(manifest).toHaveProperty('icons');

    // Icons must have 192 + 512 sizes
    const icons = manifest.icons as Array<{ sizes: string; type: string }>;
    expect(Array.isArray(icons)).toBe(true);
    const sizes = icons.map((i) => i.sizes);
    expect(sizes.some((s) => s.includes('192'))).toBe(true);
    expect(sizes.some((s) => s.includes('512'))).toBe(true);

    // Display must be standalone (required for installability)
    expect(manifest.display).toBe('standalone');
  });

  test('service worker file is served at /sw.js', async ({ page }) => {
    const response = await page.request.get('/sw.js');
    expect(response.status()).toBe(200);

    const contentType = response.headers()['content-type'] ?? '';
    expect(contentType).toMatch(/javascript/);

    const body = await response.text();
    expect(body).toContain('serviceWorker');
  });

  test('HTML includes manifest link', async ({ page }) => {
    await page.goto('/');
    const manifestLink = page.locator('link[rel="manifest"]');
    await expect(manifestLink).toHaveAttribute('href', '/manifest.json');
  });

  test('HTML includes theme-color meta tag', async ({ page }) => {
    await page.goto('/');
    const themeColor = page.locator('meta[name="theme-color"]');
    await expect(themeColor).toHaveAttribute('content', '#1e3a5f');
  });

  test('service worker is registered in browser context', async ({ page, context }) => {
    // Use sw=1 query param to force SW registration in dev mode (C07 §7.3)
    await page.goto('/?sw=1');

    // Wait for the SW to register (up to 10s)
    const swRegistered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;

      // Check if already registered
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length > 0) return true;

      // Wait for registration
      return new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 8000);
        navigator.serviceWorker.ready.then(() => {
          clearTimeout(timeout);
          resolve(true);
        }).catch(() => {
          clearTimeout(timeout);
          resolve(false);
        });
      });
    });

    expect(swRegistered).toBe(true);
  });

  test('embed route returns 200 with valid HTML (C07 §6)', async ({ page }) => {
    const response = await page.request.get('/embed?projectId=test&token=test');
    expect(response.status()).toBe(200);

    const body = await response.text();
    expect(body).toContain('<!DOCTYPE html>');
    expect(body).toContain('data-embed="1"');
  });

  test('X-Frame-Options allows embedding on /embed route', async ({ page }) => {
    const response = await page.request.get('/embed');
    // Must NOT be DENY or SAMEORIGIN on the embed route
    const xfo = response.headers()['x-frame-options'] ?? '';
    expect(xfo.toUpperCase()).not.toBe('DENY');
    expect(xfo.toUpperCase()).not.toBe('SAMEORIGIN');
  });
});
