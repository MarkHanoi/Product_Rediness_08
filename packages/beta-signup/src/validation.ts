// @pryzm/beta-signup — pure validators.
//
// Pure: no I/O, no clock. The orchestrator in submitBetaSignup.ts
// composes these.

import type {
  BetaSignupPayload,
  BetaSignupValidationError,
  BetaSignupValidationResult,
} from './types.js';

const VALID_COHORTS = new Set(['c1', 'c2', 'c3', 'academic']);

// Pragmatic email shape — full RFC 5322 is overkill for the beta sign-up.
// SMTP transport will reject invalid addresses at delivery time.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const USE_CASE_MAX_LEN = 500;

export function validateBetaSignup(p: BetaSignupPayload): BetaSignupValidationResult {
  const errors: BetaSignupValidationError[] = [];

  // Trim before validating so the canonical (post-normalise) form is
  // what the regex sees. The email surface accepts whitespace because
  // form fields commonly receive padded values.
  const emailNormalised = (p.email ?? '').trim();
  if (!emailNormalised || !EMAIL_RE.test(emailNormalised)) {
    errors.push({
      code: 'invalid-email',
      field: 'email',
      message: 'Provide a valid email address.',
    });
  }

  if (!p.name || !p.name.trim()) {
    errors.push({
      code: 'missing-name',
      field: 'name',
      message: 'Name is required.',
    });
  }

  if (!VALID_COHORTS.has(p.cohort)) {
    errors.push({
      code: 'invalid-cohort',
      field: 'cohort',
      message: 'Cohort must be one of c1, c2, c3, academic.',
    });
  }

  if (p.useCase && p.useCase.length > USE_CASE_MAX_LEN) {
    errors.push({
      code: 'use-case-too-long',
      field: 'useCase',
      message: `Use-case description must be ≤ ${USE_CASE_MAX_LEN} chars.`,
    });
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true };
}

/** Normalise the payload — trim strings, lowercase email. Pure. */
export function normaliseBetaSignup(p: BetaSignupPayload): BetaSignupPayload {
  const out: BetaSignupPayload = {
    email: p.email.trim().toLowerCase(),
    name: p.name.trim(),
    cohort: p.cohort,
    ...(p.useCase ? { useCase: p.useCase.trim() } : {}),
    ...(p.renderedAt ? { renderedAt: p.renderedAt } : {}),
  };
  return out;
}
