/**
 * Anti-Cheat Flagger
 *
 * Centralized system for flagging suspicious player behavior.
 * Tracks violations, determines severity, and triggers automated responses.
 */

import {
  AnticheatFlag,
  FlagType,
  FlagSeverity,
  FlagResponse,
} from './types.js';
import { validationConfig } from './config.js';

/**
 * Flag storage - In production, this would be Redis/PostgreSQL
 */
const playerFlags: Map<string, AnticheatFlag[]> = new Map();
const flagCounts: Map<string, Map<FlagSeverity, number>> = new Map();

/**
 * Severity classification for different flag types
 */
const FLAG_SEVERITY_MAP: Record<FlagType, FlagSeverity> = {
  // Low severity - could be network issues or edge cases
  speed_violation: 'low',
  timestamp_violation: 'low',

  // Medium severity - suspicious but not conclusive
  teleport_violation: 'medium',
  wall_clip_violation: 'medium',
  action_spam: 'medium',
  sequence_violation: 'medium',
  botting_behavior: 'medium',

  // High severity - likely cheating
  packet_manipulation: 'high',
  signature_mismatch: 'high',
  impossible_action: 'high',
  economy_anomaly: 'high',

  // Critical - definitive cheating
  replay_attack: 'critical',
};

/**
 * Auto-response thresholds - flags within time window trigger response
 */
const AUTO_RESPONSE_WINDOW_MS = 60 * 60 * 1000; // 1 hour window

/**
 * Flag an account for suspicious activity
 */
export async function flagAccount(
  playerId: string,
  flagType: FlagType,
  details: Record<string, unknown>,
  accountId?: string,
  sessionId?: string
): Promise<FlagResponse> {
  const severity = FLAG_SEVERITY_MAP[flagType];
  const timestamp = Date.now();

  const flag: AnticheatFlag = {
    playerId,
    accountId: accountId ?? playerId, // Default to playerId if no accountId
    flagType,
    severity,
    details,
    timestamp,
    sessionId: sessionId ?? 'unknown',
  };

  // Store flag
  const existingFlags = playerFlags.get(playerId) ?? [];
  existingFlags.push(flag);
  playerFlags.set(playerId, existingFlags);

  // Update severity counts
  updateFlagCounts(playerId, severity);

  // Log the flag
  logFlag(flag);

  // Determine and execute response
  const response = await determineResponse(playerId, flag);

  return response;
}

/**
 * Update flag severity counts for a player
 */
function updateFlagCounts(playerId: string, severity: FlagSeverity): void {
  let counts = flagCounts.get(playerId);
  if (!counts) {
    counts = new Map([
      ['low', 0],
      ['medium', 0],
      ['high', 0],
      ['critical', 0],
    ]);
    flagCounts.set(playerId, counts);
  }

  const currentCount = counts.get(severity) ?? 0;
  counts.set(severity, currentCount + 1);
}

/**
 * Get recent flags within the auto-response window
 */
function getRecentFlags(playerId: string): AnticheatFlag[] {
  const allFlags = playerFlags.get(playerId) ?? [];
  const cutoff = Date.now() - AUTO_RESPONSE_WINDOW_MS;

  return allFlags.filter(flag => flag.timestamp > cutoff);
}

/**
 * Determine the appropriate response based on flags
 */
async function determineResponse(
  playerId: string,
  latestFlag: AnticheatFlag
): Promise<FlagResponse> {
  if (!validationConfig.anticheat.autoResponseEnabled) {
    return { action: 'log' };
  }

  const recentFlags = getRecentFlags(playerId);
  const thresholds = validationConfig.anticheat.severityThresholds;

  // Count flags by severity in recent window
  const severityCounts: Record<FlagSeverity, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const flag of recentFlags) {
    severityCounts[flag.severity]++;
  }

  // Check critical first (immediate action)
  if (severityCounts.critical >= thresholds.critical) {
    return {
      action: 'temp_ban',
      message: 'Account suspended pending review for security violations.',
      banDuration: 48 * 60 * 60 * 1000, // 48 hours
    };
  }

  // Check high severity
  if (severityCounts.high >= thresholds.high) {
    return {
      action: 'kick',
      message: 'Disconnected due to suspicious activity. Please contact support if this is in error.',
    };
  }

  // Check medium severity
  if (severityCounts.medium >= thresholds.medium) {
    return {
      action: 'warn',
      message: 'Warning: Unusual activity detected on your account.',
    };
  }

  // Check low severity (just log)
  if (severityCounts.low >= thresholds.low) {
    // Escalate to warning if many low severity flags
    return {
      action: 'warn',
      message: 'Please ensure you are using an official game client.',
    };
  }

  return { action: 'log' };
}

/**
 * Log flag for monitoring and analysis
 */
function logFlag(flag: AnticheatFlag): void {
  const logEntry = {
    timestamp: new Date(flag.timestamp).toISOString(),
    playerId: flag.playerId,
    accountId: flag.accountId,
    type: flag.flagType,
    severity: flag.severity,
    sessionId: flag.sessionId,
    details: flag.details,
  };

  // In production, this would go to a proper logging service
  console.log(`[ANTICHEAT] ${flag.severity.toUpperCase()}:`, JSON.stringify(logEntry));
}

/**
 * Get all flags for a player (admin function)
 */
export function getPlayerFlags(playerId: string): AnticheatFlag[] {
  return playerFlags.get(playerId) ?? [];
}

/**
 * Get flag summary for a player
 */
export function getPlayerFlagSummary(playerId: string): {
  total: number;
  bySeverity: Record<FlagSeverity, number>;
  recentCount: number;
} {
  const allFlags = playerFlags.get(playerId) ?? [];
  const counts = flagCounts.get(playerId);

  const bySeverity: Record<FlagSeverity, number> = {
    low: counts?.get('low') ?? 0,
    medium: counts?.get('medium') ?? 0,
    high: counts?.get('high') ?? 0,
    critical: counts?.get('critical') ?? 0,
  };

  return {
    total: allFlags.length,
    bySeverity,
    recentCount: getRecentFlags(playerId).length,
  };
}

/**
 * Clear flags for a player (admin function, e.g., after appeal)
 */
export function clearPlayerFlags(playerId: string): void {
  playerFlags.delete(playerId);
  flagCounts.delete(playerId);
}

/**
 * Cleanup old flags (should be run periodically)
 */
export function cleanupOldFlags(): number {
  const retentionMs = validationConfig.anticheat.flagRetentionDays * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - retentionMs;
  let removedCount = 0;

  for (const [playerId, flags] of playerFlags) {
    const filteredFlags = flags.filter(flag => flag.timestamp > cutoff);
    removedCount += flags.length - filteredFlags.length;

    if (filteredFlags.length === 0) {
      playerFlags.delete(playerId);
      flagCounts.delete(playerId);
    } else {
      playerFlags.set(playerId, filteredFlags);
      // Recalculate counts
      recalculateFlagCounts(playerId, filteredFlags);
    }
  }

  return removedCount;
}

/**
 * Recalculate flag counts after cleanup
 */
function recalculateFlagCounts(playerId: string, flags: AnticheatFlag[]): void {
  const counts = new Map<FlagSeverity, number>([
    ['low', 0],
    ['medium', 0],
    ['high', 0],
    ['critical', 0],
  ]);

  for (const flag of flags) {
    const current = counts.get(flag.severity) ?? 0;
    counts.set(flag.severity, current + 1);
  }

  flagCounts.set(playerId, counts);
}

/**
 * Check if player should be auto-banned based on accumulated flags
 */
export function shouldAutoBan(playerId: string): boolean {
  const summary = getPlayerFlagSummary(playerId);

  // Auto-ban if any critical flags
  if (summary.bySeverity.critical > 0) {
    return true;
  }

  // Auto-ban if too many high severity flags
  if (summary.bySeverity.high >= validationConfig.anticheat.severityThresholds.high * 2) {
    return true;
  }

  return false;
}

/**
 * Export flag data for a player (GDPR compliance)
 */
export function exportPlayerFlagData(playerId: string): {
  flags: AnticheatFlag[];
  summary: ReturnType<typeof getPlayerFlagSummary>;
} {
  return {
    flags: getPlayerFlags(playerId),
    summary: getPlayerFlagSummary(playerId),
  };
}
