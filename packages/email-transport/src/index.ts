// @pryzm/email-transport — public barrel.
//
// IMPORTANT: this barrel re-exports ZERO symbol from `./EmailTransport.impl.js`.
// The only path to a transport is `getEmailTransport()` (lazy).

export { getEmailTransport, isEmailTransportLoaded } from './EmailTransport.js';
export { MemoryEmailTransport } from './MemoryEmailTransport.js';
export type {
  EmailAddress,
  EmailMessage,
  EmailSendResult,
  EmailTransport,
  EmailTransportEnv,
  EmailTransportOptions,
} from './types.js';
