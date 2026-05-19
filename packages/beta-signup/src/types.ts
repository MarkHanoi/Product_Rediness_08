// @pryzm/beta-signup — public type surface (S48 D1).
//
// Spec source: `phases/PHASE-2D-Q4-M22-M24-SYNC-AWARENESS-BETA.md`
// §S48 D1 (line 714) + Beta Cohort Composition (lines 699-708).

/** Cohort tag — the M24 beta is curated to span 8×C1 + 10×C2 + 5×C3
 *  + 2×academic per spec lines 703-706. The signup form lets the
 *  applicant self-categorise; cohort balancing happens server-side
 *  during invitation selection (S48 D2, manual). */
export type BetaCohortTag = 'c1' | 'c2' | 'c3' | 'academic';

export interface BetaSignupPayload {
  readonly email: string;
  readonly name: string;
  readonly cohort: BetaCohortTag;
  /** Free-form one-liner — the spec's invitation pipeline uses this to
   *  prioritise C2 studios with established workflows. Optional. */
  readonly useCase?: string;
  /** ISO timestamp the signup form was rendered. Lets us reject stale
   *  submissions (replay protection — bound but not enforced in S48). */
  readonly renderedAt?: string;
}

export interface BetaSignupRecord extends BetaSignupPayload {
  readonly id: string;
  readonly receivedAt: number;
  /** Confirmation-email message id from the transport. Null if email
   *  dispatch failed (signup is still recorded). */
  readonly confirmationMessageId: string | null;
  readonly status: 'pending' | 'invited' | 'rejected';
}

export interface BetaSignupValidationError {
  readonly code:
    | 'invalid-email'
    | 'missing-name'
    | 'invalid-cohort'
    | 'use-case-too-long';
  readonly message: string;
  readonly field: keyof BetaSignupPayload;
}

export type BetaSignupValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly errors: ReadonlyArray<BetaSignupValidationError> };
