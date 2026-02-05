/**
 * Validation Module Exports
 *
 * Central export point for all server-authoritative validation systems.
 */

// Types
export * from './types.js';

// Configuration
export * from './config.js';

// Validators
export { PacketValidator, packetValidator } from './packet-validator.js';
export { MovementValidator, movementValidator } from './movement-validator.js';
export { ActionRateLimiter, actionRateLimiter } from './action-rate-limiter.js';

// Anti-cheat
export {
  flagAccount,
  getPlayerFlags,
  getPlayerFlagSummary,
  clearPlayerFlags,
  cleanupOldFlags,
  shouldAutoBan,
  exportPlayerFlagData,
} from './anticheat-flagger.js';
