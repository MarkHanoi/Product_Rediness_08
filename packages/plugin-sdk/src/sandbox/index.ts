// @pryzm/plugin-sdk — sandbox barrel (S62 D4).

export {
  buildPluginCSP,
  buildIframeHeadHTML,
  SANDBOX_TOKENS,
} from './policy';

export {
  buildIframeSrcdoc,
  isAllowedFromPlugin,
  isAllowedFromHost,
  PLUGIN_ALLOWED_OUTBOUND_KINDS,
  HOST_ALLOWED_OUTBOUND_KINDS,
} from './iframe-sandbox';

export type {
  SandboxMessage,
  SandboxMessageKind,
} from './iframe-sandbox';

export {
  ESCAPE_VECTORS,
} from './escape-tests';

export type {
  EscapeVector,
  EscapeCategory,
  EscapeEnv,
} from './escape-tests';
