/**
 * Validation System Type Definitions
 *
 * Types for server-authoritative validation including packet signing,
 * movement validation, action rate limiting, and anti-cheat detection.
 */

import { Vector3 } from '../types/index.js';

// ============================================================================
// Packet Validation Types
// ============================================================================

export interface SignedPacket {
  /** Base64 encoded encrypted payload */
  payload: string;
  /** HMAC-SHA256 signature of payload */
  signature: string;
  /** Incrementing sequence number */
  sequence: number;
  /** Unix timestamp in milliseconds */
  timestamp: number;
  /** One-time use nonce for replay prevention */
  nonce: string;
}

export interface SessionSecret {
  /** Player's unique session ID */
  sessionId: string;
  /** HMAC signing secret */
  secret: Buffer;
  /** AES-256-GCM encryption key */
  encryptionKey: Buffer;
  /** When the keys were generated */
  createdAt: number;
  /** When the keys expire (rotation) */
  expiresAt: number;
}

export interface PacketValidationResult {
  valid: boolean;
  error?: PacketValidationError;
  decryptedPayload?: GamePacket;
}

export type PacketValidationError =
  | 'INVALID_TIMESTAMP'
  | 'REPLAY_ATTACK'
  | 'SIGNATURE_MISMATCH'
  | 'SEQUENCE_VIOLATION'
  | 'DECRYPTION_FAILED'
  | 'SESSION_EXPIRED'
  | 'SESSION_NOT_FOUND';

// ============================================================================
// Movement Validation Types
// ============================================================================

export interface MovementPacket {
  position: Vector3;
  rotation: number;
  timestamp: number;
  movementType: MovementType;
}

export type MovementType =
  | 'walk'
  | 'run'
  | 'surge'
  | 'bladed_dive'
  | 'escape'
  | 'teleport';

export interface PlayerMovementState {
  position: Vector3;
  lastMovementTimestamp: number;
  positionHistory: PositionSample[];
  recentAbilities: RecentAbility[];
  rubberBandCount: number;
  lastRubberBandTime: number;
}

export interface PositionSample {
  position: Vector3;
  timestamp: number;
}

export interface RecentAbility {
  abilityId: string;
  usedAt: number;
}

export interface MovementValidationResult {
  valid: boolean;
  action?: 'accept' | 'rubber_band' | 'disconnect';
  correctedPosition?: Vector3;
  violation?: MovementViolation;
}

export type MovementViolation =
  | 'SPEED_HACK'
  | 'TELEPORT_HACK'
  | 'WALL_CLIP'
  | 'FLY_HACK'
  | 'NOCLIP';

// ============================================================================
// Action Rate Limiting Types
// ============================================================================

export interface ActionBucket {
  /** Current game tick */
  currentTick: number;
  /** Actions consumed this tick */
  actionsThisTick: number;
  /** Prayer switches this tick (separate budget) */
  prayerSwitchesThisTick: number;
  /** Suspicious activity counter */
  suspiciousCount: number;
  /** Last action timestamps by type */
  lastActionTimestamps: Map<string, number>;
  /** Ability cooldowns: abilityId -> readyAt timestamp */
  abilityCooldowns: Map<string, number>;
}

export interface GameAction {
  type: ActionType;
  actionId: string;
  targetId?: string;
  abilityId?: string;
  itemId?: string;
  timestamp: number;
}

export type ActionType =
  | 'basic_ability'
  | 'threshold_ability'
  | 'ultimate_ability'
  | 'special_attack'
  | 'eat_food'
  | 'drink_potion'
  | 'switch_prayer'
  | 'equip_item'
  | 'drop_item'
  | 'pickup_item'
  | 'interact_object'
  | 'interact_npc'
  | 'skill_action';

export interface ActionValidationResult {
  valid: boolean;
  reason?: ActionRejectionReason;
  cooldownRemaining?: number;
}

export type ActionRejectionReason =
  | 'TICK_BUDGET_EXCEEDED'
  | 'ABILITY_ON_COOLDOWN'
  | 'GLOBAL_COOLDOWN'
  | 'RATE_LIMIT_EXCEEDED'
  | 'INVALID_ACTION'
  | 'INSUFFICIENT_RESOURCES';

// ============================================================================
// Anti-Cheat Flag Types
// ============================================================================

export interface AnticheatFlag {
  playerId: string;
  accountId: string;
  flagType: FlagType;
  severity: FlagSeverity;
  details: Record<string, unknown>;
  timestamp: number;
  sessionId: string;
}

export type FlagType =
  | 'speed_violation'
  | 'teleport_violation'
  | 'wall_clip_violation'
  | 'action_spam'
  | 'packet_manipulation'
  | 'timestamp_violation'
  | 'replay_attack'
  | 'signature_mismatch'
  | 'sequence_violation'
  | 'impossible_action'
  | 'economy_anomaly'
  | 'botting_behavior';

export type FlagSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface FlagResponse {
  action: 'log' | 'warn' | 'kick' | 'temp_ban' | 'perm_ban';
  message?: string;
  banDuration?: number;
}

// ============================================================================
// Game State Types (Server Authority)
// ============================================================================

export interface GamePacket {
  type: string;
  data: Record<string, unknown>;
}

export interface ServerStateUpdate {
  type: 'inventory' | 'skills' | 'equipment' | 'bank' | 'position' | 'combat';
  playerId: string;
  data: Record<string, unknown>;
  timestamp: number;
  sequence: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface ValidationConfig {
  movement: MovementValidationConfig;
  actions: ActionValidationConfig;
  packets: PacketValidationConfig;
  anticheat: AnticheatConfig;
}

export interface MovementValidationConfig {
  maxSpeedMultiplier: number;
  teleportThresholdUnits: number;
  positionHistorySamples: number;
  rubberBandingEnabled: boolean;
  maxCorrectionsPerMinute: number;
  correctionThresholdUnits: number;
  baseWalkSpeed: number;
  baseRunSpeed: number;
}

export interface ActionValidationConfig {
  tickDurationMs: number;
  maxActionsPerTick: number;
  maxPrayerSwitchesPerTick: number;
  suspiciousThreshold: number;
  globalCooldownMs: number;
}

export interface PacketValidationConfig {
  maxPacketAgeMs: number;
  clockSkewToleranceMs: number;
  keyRotationMinutes: number;
  sequenceWindow: number;
  nonceExpiryMs: number;
}

export interface AnticheatConfig {
  enabled: boolean;
  severityThresholds: Record<FlagSeverity, number>;
  autoResponseEnabled: boolean;
  flagRetentionDays: number;
}
