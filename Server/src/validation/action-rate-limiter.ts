/**
 * Action Rate Limiter
 *
 * Server-authoritative tick-based action validation system.
 * Prevents:
 * - Packet spamming
 * - Impossible action speeds
 * - Ability cooldown bypassing
 * - Bot-like action patterns
 *
 * Based on a 600ms tick system matching classic MMO mechanics.
 */

import {
  ActionBucket,
  GameAction,
  ActionType,
  ActionValidationResult,
  ActionRejectionReason,
} from './types.js';
import { validationConfig, ACTION_TICK_COSTS, ABILITY_COOLDOWNS } from './config.js';
import { flagAccount } from './anticheat-flagger.js';

/**
 * Player action buckets - tracks action state per player
 */
const playerBuckets: Map<string, ActionBucket> = new Map();

/**
 * Action Rate Limiter Class
 */
export class ActionRateLimiter {
  private config = validationConfig.actions;
  private tickDuration = validationConfig.actions.tickDurationMs;

  /**
   * Get current game tick number
   */
  getCurrentTick(): number {
    return Math.floor(Date.now() / this.tickDuration);
  }

  /**
   * Initialize action tracking for a player
   */
  initializePlayer(playerId: string): void {
    const bucket: ActionBucket = {
      currentTick: this.getCurrentTick(),
      actionsThisTick: 0,
      prayerSwitchesThisTick: 0,
      suspiciousCount: 0,
      lastActionTimestamps: new Map(),
      abilityCooldowns: new Map(),
    };

    playerBuckets.set(playerId, bucket);
  }

  /**
   * Remove player action tracking
   */
  removePlayer(playerId: string): void {
    playerBuckets.delete(playerId);
  }

  /**
   * Validate and process an action request
   */
  async validateAction(
    playerId: string,
    action: GameAction
  ): Promise<ActionValidationResult> {
    let bucket = playerBuckets.get(playerId);

    if (!bucket) {
      // Initialize if missing
      this.initializePlayer(playerId);
      bucket = playerBuckets.get(playerId)!;
    }

    const currentTick = this.getCurrentTick();

    // Reset bucket on new tick
    if (currentTick > bucket.currentTick) {
      this.resetTickBucket(bucket, currentTick);
    }

    // Get action cost
    const cost = ACTION_TICK_COSTS[action.type] ?? 1;

    // Special handling for prayer switches (separate budget)
    if (action.type === 'switch_prayer') {
      return this.validatePrayerSwitch(playerId, bucket, action);
    }

    // Check tick budget
    if (bucket.actionsThisTick + cost > this.config.maxActionsPerTick) {
      return this.handleTickBudgetExceeded(playerId, bucket, action);
    }

    // Check global cooldown
    const globalCooldownResult = this.checkGlobalCooldown(bucket, action);
    if (!globalCooldownResult.valid) {
      return globalCooldownResult;
    }

    // Check ability-specific cooldown
    if (action.abilityId) {
      const cooldownResult = await this.checkAbilityCooldown(
        playerId,
        bucket,
        action.abilityId
      );
      if (!cooldownResult.valid) {
        return cooldownResult;
      }
    }

    // Action is valid - consume budget
    bucket.actionsThisTick += cost;
    bucket.lastActionTimestamps.set(action.type, action.timestamp);

    // Start ability cooldown if applicable
    if (action.abilityId) {
      this.startAbilityCooldown(bucket, action.abilityId);
    }

    // Reset suspicious count on valid action
    if (bucket.suspiciousCount > 0) {
      bucket.suspiciousCount = Math.max(0, bucket.suspiciousCount - 1);
    }

    return { valid: true };
  }

  /**
   * Reset the tick bucket for a new tick
   */
  private resetTickBucket(bucket: ActionBucket, newTick: number): void {
    bucket.currentTick = newTick;
    bucket.actionsThisTick = 0;
    bucket.prayerSwitchesThisTick = 0;
  }

  /**
   * Validate prayer switch (separate budget)
   */
  private async validatePrayerSwitch(
    playerId: string,
    bucket: ActionBucket,
    action: GameAction
  ): Promise<ActionValidationResult> {
    if (bucket.prayerSwitchesThisTick >= this.config.maxPrayerSwitchesPerTick) {
      // Too many prayer switches this tick
      bucket.suspiciousCount++;

      if (bucket.suspiciousCount > this.config.suspiciousThreshold) {
        await flagAccount(playerId, 'action_spam', {
          actionType: 'switch_prayer',
          switchesThisTick: bucket.prayerSwitchesThisTick,
          maxAllowed: this.config.maxPrayerSwitchesPerTick,
        });
      }

      return {
        valid: false,
        reason: 'RATE_LIMIT_EXCEEDED',
      };
    }

    bucket.prayerSwitchesThisTick++;
    bucket.lastActionTimestamps.set('switch_prayer', action.timestamp);

    return { valid: true };
  }

  /**
   * Handle tick budget exceeded
   */
  private async handleTickBudgetExceeded(
    playerId: string,
    bucket: ActionBucket,
    action: GameAction
  ): Promise<ActionValidationResult> {
    bucket.suspiciousCount++;

    if (bucket.suspiciousCount > this.config.suspiciousThreshold) {
      await flagAccount(playerId, 'action_spam', {
        actionType: action.type,
        actionsThisTick: bucket.actionsThisTick,
        maxAllowed: this.config.maxActionsPerTick,
        suspiciousCount: bucket.suspiciousCount,
      });
    }

    return {
      valid: false,
      reason: 'TICK_BUDGET_EXCEEDED',
    };
  }

  /**
   * Check global cooldown between actions
   */
  private checkGlobalCooldown(
    bucket: ActionBucket,
    action: GameAction
  ): ActionValidationResult {
    const lastActionTime = bucket.lastActionTimestamps.get(action.type);

    if (lastActionTime) {
      const timeSinceLastAction = action.timestamp - lastActionTime;

      if (timeSinceLastAction < this.config.globalCooldownMs) {
        return {
          valid: false,
          reason: 'GLOBAL_COOLDOWN',
          cooldownRemaining: this.config.globalCooldownMs - timeSinceLastAction,
        };
      }
    }

    return { valid: true };
  }

  /**
   * Check ability-specific cooldown
   */
  private async checkAbilityCooldown(
    playerId: string,
    bucket: ActionBucket,
    abilityId: string
  ): Promise<ActionValidationResult> {
    const cooldownEnd = bucket.abilityCooldowns.get(abilityId);

    if (cooldownEnd && Date.now() < cooldownEnd) {
      const remaining = cooldownEnd - Date.now();

      // If they're trying to use an ability with significant cooldown remaining
      // this is more suspicious
      if (remaining > 1000) {
        bucket.suspiciousCount++;

        if (bucket.suspiciousCount > this.config.suspiciousThreshold / 2) {
          await flagAccount(playerId, 'impossible_action', {
            abilityId,
            cooldownRemaining: remaining,
            reason: 'cooldown_bypass_attempt',
          });
        }
      }

      return {
        valid: false,
        reason: 'ABILITY_ON_COOLDOWN',
        cooldownRemaining: remaining,
      };
    }

    return { valid: true };
  }

  /**
   * Start an ability's cooldown timer
   */
  private startAbilityCooldown(bucket: ActionBucket, abilityId: string): void {
    const cooldownDuration = ABILITY_COOLDOWNS[abilityId] ?? 0;

    if (cooldownDuration > 0) {
      bucket.abilityCooldowns.set(abilityId, Date.now() + cooldownDuration);
    }
  }

  /**
   * Get remaining cooldown for an ability
   */
  getAbilityCooldown(playerId: string, abilityId: string): number {
    const bucket = playerBuckets.get(playerId);
    if (!bucket) return 0;

    const cooldownEnd = bucket.abilityCooldowns.get(abilityId);
    if (!cooldownEnd) return 0;

    const remaining = cooldownEnd - Date.now();
    return Math.max(0, remaining);
  }

  /**
   * Get all ability cooldowns for a player
   */
  getAllCooldowns(playerId: string): Map<string, number> {
    const bucket = playerBuckets.get(playerId);
    if (!bucket) return new Map();

    const cooldowns = new Map<string, number>();
    const now = Date.now();

    for (const [abilityId, endTime] of bucket.abilityCooldowns) {
      const remaining = endTime - now;
      if (remaining > 0) {
        cooldowns.set(abilityId, remaining);
      }
    }

    return cooldowns;
  }

  /**
   * Reset a specific ability cooldown (e.g., from cooldown reduction effect)
   */
  resetAbilityCooldown(playerId: string, abilityId: string): void {
    const bucket = playerBuckets.get(playerId);
    if (bucket) {
      bucket.abilityCooldowns.delete(abilityId);
    }
  }

  /**
   * Reduce an ability's cooldown by a percentage
   */
  reduceCooldown(playerId: string, abilityId: string, reductionPercent: number): void {
    const bucket = playerBuckets.get(playerId);
    if (!bucket) return;

    const cooldownEnd = bucket.abilityCooldowns.get(abilityId);
    if (!cooldownEnd) return;

    const remaining = cooldownEnd - Date.now();
    if (remaining <= 0) return;

    const reduction = remaining * (reductionPercent / 100);
    bucket.abilityCooldowns.set(abilityId, cooldownEnd - reduction);
  }

  /**
   * Get action statistics for a player
   */
  getPlayerActionStats(playerId: string): {
    currentTick: number;
    actionsThisTick: number;
    prayerSwitchesThisTick: number;
    suspiciousCount: number;
    activeCooldowns: number;
  } | null {
    const bucket = playerBuckets.get(playerId);
    if (!bucket) return null;

    return {
      currentTick: bucket.currentTick,
      actionsThisTick: bucket.actionsThisTick,
      prayerSwitchesThisTick: bucket.prayerSwitchesThisTick,
      suspiciousCount: bucket.suspiciousCount,
      activeCooldowns: bucket.abilityCooldowns.size,
    };
  }

  /**
   * Analyze action patterns for bot detection
   */
  analyzeActionPattern(playerId: string): {
    actionsPerMinute: number;
    averageTimeBetweenActions: number;
    timingVariance: number;
    suspiciouslyConsistent: boolean;
  } | null {
    const bucket = playerBuckets.get(playerId);
    if (!bucket) return null;

    const timestamps = Array.from(bucket.lastActionTimestamps.values()).sort();
    if (timestamps.length < 5) return null;

    // Calculate intervals between actions
    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }

    // Calculate statistics
    const sum = intervals.reduce((a, b) => a + b, 0);
    const average = sum / intervals.length;

    // Calculate variance
    const squaredDiffs = intervals.map(interval => Math.pow(interval - average, 2));
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / squaredDiffs.length;

    // Calculate actions per minute
    const timeSpan = timestamps[timestamps.length - 1] - timestamps[0];
    const actionsPerMinute = timeSpan > 0
      ? (timestamps.length / timeSpan) * 60000
      : 0;

    // Suspiciously consistent if variance is very low (bot-like)
    const suspiciouslyConsistent = variance < 100 && intervals.length > 10;

    return {
      actionsPerMinute,
      averageTimeBetweenActions: average,
      timingVariance: variance,
      suspiciouslyConsistent,
    };
  }

  /**
   * Batch validate multiple actions (for catching up after disconnect)
   */
  async validateActionBatch(
    playerId: string,
    actions: GameAction[]
  ): Promise<{ valid: boolean; invalidIndices: number[] }> {
    const invalidIndices: number[] = [];

    // Sort actions by timestamp
    const sortedActions = [...actions].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < sortedActions.length; i++) {
      const result = await this.validateAction(playerId, sortedActions[i]);
      if (!result.valid) {
        invalidIndices.push(i);
      }
    }

    return {
      valid: invalidIndices.length === 0,
      invalidIndices,
    };
  }

  /**
   * Get server tick information
   */
  getTickInfo(): {
    currentTick: number;
    tickDuration: number;
    msUntilNextTick: number;
  } {
    const now = Date.now();
    const currentTick = Math.floor(now / this.tickDuration);
    const tickStart = currentTick * this.tickDuration;
    const msUntilNextTick = this.tickDuration - (now - tickStart);

    return {
      currentTick,
      tickDuration: this.tickDuration,
      msUntilNextTick,
    };
  }
}

// Export singleton instance
export const actionRateLimiter = new ActionRateLimiter();
