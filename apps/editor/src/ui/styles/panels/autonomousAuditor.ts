/**
 * @file src/engine/subsystems/styles/panels/autonomousAuditor.ts
 *
 * Re-export barrel — each namespace's CSS constant lives in its own file under
 * autonomous-auditor/. All 8 named exports are forwarded here.
 *
 * AUTONOMOUS_AUDITOR_STYLES is re-assembled here for backward compatibility
 * with the single importer (AppTheme.ts line 66, used at line 188). It is a
 * pure CSS string join — no behavioral logic.
 *
 * CONTRACT §05 §2 — CSS layer only. All colours via var(--app-*) tokens.
 * NO hardcoded colours. NO !important.
 */
import { INSPECT_MODE_STYLES }         from './autonomous-auditor/inspectModeShell';
import { AUDIT_STACK_STYLES }          from './autonomous-auditor/auditStack';
import { DATA_COMMAND_CENTER_STYLES }  from './autonomous-auditor/dataCommandCenter';
import { STRATEGIZE_STYLES }           from './autonomous-auditor/strategizeBucket';
import { AUDIT_BUCKET_STYLES }         from './autonomous-auditor/auditBucket';
import { VALIDATE_STYLES }             from './autonomous-auditor/validateBucket';
import { LIFECYCLE_STYLES }            from './autonomous-auditor/lifecycleBucket';
import { REQUIREMENT_STYLES }          from './autonomous-auditor/requirementDisplay';

export {
  INSPECT_MODE_STYLES,
  AUDIT_STACK_STYLES,
  DATA_COMMAND_CENTER_STYLES,
  STRATEGIZE_STYLES,
  AUDIT_BUCKET_STYLES,
  VALIDATE_STYLES,
  LIFECYCLE_STYLES,
  REQUIREMENT_STYLES,
};

/** Reassembled for AppTheme.ts backward-compat — all 8 namespace strings joined. */
export const AUTONOMOUS_AUDITOR_STYLES =
  INSPECT_MODE_STYLES +
  AUDIT_STACK_STYLES +
  DATA_COMMAND_CENTER_STYLES +
  STRATEGIZE_STYLES +
  AUDIT_BUCKET_STYLES +
  VALIDATE_STYLES +
  LIFECYCLE_STYLES +
  REQUIREMENT_STYLES;
