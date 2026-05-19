// @pryzm/plugin-sdk — public type re-exports (S62 D2-D9 expanded).
//
// Provides a single canonical type-import path.  Module-specific types
// are also exported from their authoring module — types.ts is the
// "import-everything" convenience.

export type {
  PluginPermission,
  PluginContribution,
  PluginManifest,
  PluginDescriptor,
  ValidateManifestResult,
} from './descriptor';

export type {
  PluginLifecycle,
  PluginActivationContext,
  PluginUserContext,
} from './lifecycle';

export type {
  HostProxies,
  CommandBusProxy,
  CommandHandle,
  CommandResult,
  StoresProxy,
  StoreSnapshot,
  StoreSubscription,
  ElementRef,
  ViewsProxy,
  ViewRef,
  ViewKind,
  SelectionProxy,
  SelectionSubscription,
  AiProxy,
  AiWorkflowResult,
  AiWorkflowRef,
  FormatProxy,
  FormatImporterRegistration,
  FormatExporterRegistration,
  ImporterHandler,
  ExporterHandler,
} from './hosts/index';

export type {
  SandboxMessage,
  SandboxMessageKind,
  EscapeVector,
  EscapeCategory,
  EscapeEnv,
} from './sandbox/index';

export type {
  KeyPair,
  PluginSignature,
  SignaturePayload,
  VerifyPluginSignatureResult,
} from './signing';
