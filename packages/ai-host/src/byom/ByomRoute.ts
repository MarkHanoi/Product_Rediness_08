// @pryzm/ai-host — the AI route decision (C09 §2.2.1, C23 §1.2 key-class,
// C22 §1.13 privacy tier).
//
// ⭐ THE INVARIANT THIS FILE EXISTS FOR. **The product must ALWAYS know which
// path served a request, and must be able to say so.** A response whose origin
// is ambiguous is unauditable, and C23 exists precisely to make AI output
// attributable. So the decision is not scattered across call sites as a pile of
// `if (key)` — it is ONE pure function returning ONE closed union, and every
// consumer (relay construction, chat attribution, provenance record, privacy
// tier) reads the SAME value.
//
// ⛔ THE DEFAULT MUST NOT MOVE. `resolveAiRoute(null)` — and
// `resolveAiRoute(vaultSet)` for a user who has configured nothing — returns
// `pryzm-managed`, which is bit-for-bit today's behaviour: same proxy, same
// quota, same spend accounting. BYOM is strictly additive.
// `noKeyPathUnchanged.test.ts` proves this at the relay-construction boundary
// rather than by inspection.

import type { ByomCredential, ByomVaultSet } from './ByomVault.js';
import { findProvider } from './ByomProviders.js';

/**
 * WHICH KEY SERVED THIS REQUEST. This is the value C23 §1.2 records alongside
 * the model id, and it is the value the chat shows the user.
 *
 *  • `pryzm-managed` — PRYZM's key, via PRYZM's proxy. PRYZM pays, PRYZM meters,
 *                      PRYZM enforces quota. Today's behaviour, unchanged.
 *  • `user-supplied` — the user's own key, browser-direct to their provider.
 *                      The user pays; PRYZM's quota does NOT apply and PRYZM's
 *                      spend ledger records nothing (C105 §5).
 */
export type AiKeyClass = 'pryzm-managed' | 'user-supplied';

/** Why the route came out the way it did. Every arm is a DIFFERENT observable
 *  reason — "no key configured" and "the stored key would not resolve" are not
 *  the same value, and collapsing them is how a broken key silently reads as an
 *  intentional default (§CONTEXT-DATA-HONESTY). */
export type AiRouteReason =
  /** No BYOM provider selected. The stated default. */
  | 'no-provider-selected'
  /** A provider is selected and its credential resolved. */
  | 'user-provider-active'
  /** A provider is selected but its stored credential did not resolve — an
   *  empty key, a corrupt entry, or an unknown provider id from an older build.
   *  ⚠ This falls back to PRYZM's key by DESIGN (it is a configuration gap, not
   *  a rejected credential — nothing was spent on the user's behalf and nothing
   *  of theirs was sent anywhere). It is a distinct reason so the UI can say so.
   *  A key the PROVIDER rejects is a different thing entirely and does NOT come
   *  through here — see `ByomProviderError`, which never falls back. */
  | 'user-provider-unresolvable'
  /** Storage is unreachable (private mode, site data blocked). */
  | 'vault-unavailable';

export interface AiRoute {
  readonly keyClass: AiKeyClass;
  readonly reason: AiRouteReason;
  /** Set only when `keyClass === 'user-supplied'`. */
  readonly providerId: string | null;
  /** Display label for the chat attribution line. */
  readonly providerLabel: string;
  /**
   * The C22 privacy tier statement for this path, in one sentence. A user's
   * prompt may carry project data, and sending it to a provider THEY chose is a
   * materially different privacy statement from sending it to PRYZM's relay —
   * so the two paths carry two different sentences, never one generic one.
   */
  readonly privacyStatement: string;
  /** True when PRYZM's plan quota (C09 §2.3) applies to this request. */
  readonly quotaApplies: boolean;
  /** True when this request should be recorded against PRYZM's spend ledger. */
  readonly billsToPryzm: boolean;
}

const PRYZM_ROUTE = (reason: AiRouteReason): AiRoute => ({
  keyClass: 'pryzm-managed',
  reason,
  providerId: null,
  providerLabel: 'PRYZM',
  privacyStatement:
    'This request goes to PRYZM, which relays it to Anthropic. It is covered by your ' +
    'PRYZM plan and its quota.',
  quotaApplies: true,
  billsToPryzm: true,
});

/**
 * The decision. Pure, total, and the single source of truth.
 *
 * Passing `null` is the explicit "no vault available" case (server-side, tests,
 * a browser with storage blocked) and returns the stated default — it never
 * throws, because an AI request must not fail merely because storage is
 * unreadable.
 */
export function resolveAiRoute(vaults: ByomVaultSet | null): AiRoute {
  if (!vaults) return PRYZM_ROUTE('vault-unavailable');

  let credential: ByomCredential | null;
  let selectedId: string | null;
  try {
    // ⚠ `selectedProviderId`, NOT `activeProviderId`. The latter already
    // requires the credential to resolve, so asking it here would fold "chose
    // nothing" and "chose a provider whose key is gone" into one answer and
    // lose the second — which is precisely the distinction the next two lines
    // exist to draw.
    selectedId = vaults.selectedProviderId();
    credential = vaults.resolveActive();
  } catch {
    return PRYZM_ROUTE('vault-unavailable');
  }

  if (!selectedId) return PRYZM_ROUTE('no-provider-selected');
  if (!credential) return PRYZM_ROUTE('user-provider-unresolvable');

  const provider = findProvider(credential.providerId);
  if (!provider) return PRYZM_ROUTE('user-provider-unresolvable');

  const destination =
    provider.auth === 'none'
      ? `${provider.label}, which runs on this machine — the prompt does not leave your computer`
      : `${provider.label}, using your own API key`;

  return {
    keyClass: 'user-supplied',
    reason: 'user-provider-active',
    providerId: provider.id,
    providerLabel: provider.label,
    privacyStatement:
      `This request goes straight from this browser to ${destination}. It does not pass ` +
      `through PRYZM, is not covered by your PRYZM quota, and is billed by ${provider.label}, not PRYZM.`,
    quotaApplies: false,
    billsToPryzm: false,
  };
}

/**
 * The sentence the chat appends so the user can SEE which path answered. This
 * is C23 provenance made visible, and it is also how a user notices that a key
 * they configured has quietly stopped being used.
 */
export function routeAttributionLine(route: AiRoute): string {
  if (route.keyClass === 'user-supplied') {
    return `(answered with your own ${route.providerLabel} key — this did not use PRYZM's AI quota)`;
  }
  if (route.reason === 'user-provider-unresolvable') {
    return (
      "(answered with PRYZM's built-in AI — the provider you selected has no usable key stored, " +
      'so nothing was sent to it)'
    );
  }
  return "(answered with PRYZM's built-in AI)";
}

/**
 * The C23 §1.2 audit fragment for this route. Deliberately returns only
 * non-secret values: the provider ID and the key CLASS, never the key, never a
 * prefix of it. `byomNeverInProvenance.test.ts` drives this with a real
 * credential and asserts the secret is absent from the serialised result.
 */
export function routeProvenanceFields(route: AiRoute): Readonly<Record<string, string | boolean>> {
  return Object.freeze({
    'ai.key.class': route.keyClass,
    'ai.key.provider': route.providerId ?? 'pryzm',
    'ai.route.reason': route.reason,
    'ai.quota.applies': route.quotaApplies,
    'ai.spend.bills_to_pryzm': route.billsToPryzm,
  });
}
