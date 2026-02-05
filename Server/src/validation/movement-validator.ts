/**
 * Movement Validation System
 *
 * Server-authoritative movement validation to prevent:
 * - Speed hacks
 * - Teleportation hacks
 * - Wall clipping / noclip
 * - Fly hacks
 *
 * Implements rubber-banding for corrections and flags suspicious behavior.
 */

import { Vector3 } from '../types/index.js';
import {
  MovementPacket,
  MovementValidationResult,
  PlayerMovementState,
  MovementViolation,
  PositionSample,
  RecentAbility,
} from './types.js';
import { validationConfig, MOVEMENT_ABILITIES } from './config.js';
import { flagAccount } from './anticheat-flagger.js';

/**
 * Movement states stored in memory (would be Redis in production)
 */
const playerMovementStates: Map<string, PlayerMovementState> = new Map();

/**
 * Navmesh validation interface
 * In production, this would interface with UE5's navmesh or a server-side pathfinding system
 */
interface NavmeshValidator {
  isPositionValid(position: Vector3): boolean;
  isPathValid(from: Vector3, to: Vector3): boolean;
  getGroundHeight(x: number, y: number): number;
}

/**
 * Simple navmesh validator placeholder
 * Real implementation would use actual navmesh data
 */
const navmesh: NavmeshValidator = {
  isPositionValid: (position: Vector3) => {
    // Check basic world bounds
    const worldBounds = {
      minX: -100000, maxX: 100000,
      minY: -100000, maxY: 100000,
      minZ: -1000, maxZ: 10000,
    };

    return (
      position.x >= worldBounds.minX && position.x <= worldBounds.maxX &&
      position.y >= worldBounds.minY && position.y <= worldBounds.maxY &&
      position.z >= worldBounds.minZ && position.z <= worldBounds.maxZ
    );
  },

  isPathValid: (from: Vector3, to: Vector3) => {
    // Simplified: just check both positions are valid
    // Real implementation would raycast through navmesh
    return navmesh.isPositionValid(from) && navmesh.isPositionValid(to);
  },

  getGroundHeight: (x: number, y: number) => {
    // Placeholder - return 0 as ground level
    // Real implementation would query terrain/navmesh
    return 0;
  },
};

/**
 * Movement Validator Class
 */
export class MovementValidator {
  private config = validationConfig.movement;

  /**
   * Initialize movement state for a new player
   */
  initializePlayer(playerId: string, startPosition: Vector3): void {
    const state: PlayerMovementState = {
      position: { ...startPosition },
      lastMovementTimestamp: Date.now(),
      positionHistory: [{ position: { ...startPosition }, timestamp: Date.now() }],
      recentAbilities: [],
      rubberBandCount: 0,
      lastRubberBandTime: 0,
    };

    playerMovementStates.set(playerId, state);
  }

  /**
   * Remove player movement state
   */
  removePlayer(playerId: string): void {
    playerMovementStates.delete(playerId);
  }

  /**
   * Get current server-authoritative position for a player
   */
  getPlayerPosition(playerId: string): Vector3 | null {
    const state = playerMovementStates.get(playerId);
    return state ? { ...state.position } : null;
  }

  /**
   * Register a movement ability use (allows exceptional movement)
   */
  registerMovementAbility(playerId: string, abilityId: string): void {
    const state = playerMovementStates.get(playerId);
    if (!state) return;

    // Remove expired abilities (older than 2 seconds)
    const now = Date.now();
    state.recentAbilities = state.recentAbilities.filter(
      ability => now - ability.usedAt < 2000
    );

    // Add new ability
    state.recentAbilities.push({
      abilityId,
      usedAt: now,
    });
  }

  /**
   * Validate a movement packet from a player
   */
  async validateMovement(
    playerId: string,
    packet: MovementPacket
  ): Promise<MovementValidationResult> {
    const state = playerMovementStates.get(playerId);

    if (!state) {
      // Player not initialized, reject
      return {
        valid: false,
        action: 'disconnect',
        violation: 'TELEPORT_HACK',
      };
    }

    // Check for movement ability
    const hasMovementAbility = this.checkRecentMovementAbility(state);

    // Validate based on movement type
    if (packet.movementType === 'teleport') {
      return this.validateTeleport(playerId, state, packet);
    }

    // Calculate movement metrics
    const distance = this.calculateDistance(state.position, packet.position);
    const timeDelta = packet.timestamp - state.lastMovementTimestamp;
    const speed = timeDelta > 0 ? distance / (timeDelta / 1000) : 0;

    // Speed validation
    const maxSpeed = this.getMaxAllowedSpeed(packet.movementType, hasMovementAbility);

    if (speed > maxSpeed && !hasMovementAbility) {
      return this.handleSpeedViolation(playerId, state, packet, speed, maxSpeed);
    }

    // Teleport detection (large instant movement without ability)
    if (distance > this.config.teleportThresholdUnits && !hasMovementAbility) {
      return this.handleTeleportViolation(playerId, state, packet, distance);
    }

    // Navmesh/wall clip validation
    if (!navmesh.isPathValid(state.position, packet.position)) {
      return this.handleWallClipViolation(playerId, state, packet);
    }

    // Fly hack detection (check Z axis)
    const groundHeight = navmesh.getGroundHeight(packet.position.x, packet.position.y);
    const heightAboveGround = packet.position.z - groundHeight;

    if (heightAboveGround > 50 && !hasMovementAbility) {
      // More than 50 units above ground without ability
      return this.handleFlyHackViolation(playerId, state, packet, heightAboveGround);
    }

    // Movement is valid - update state
    this.updatePlayerState(state, packet);

    return { valid: true, action: 'accept' };
  }

  /**
   * Check if player has recently used a movement ability
   */
  private checkRecentMovementAbility(state: PlayerMovementState): boolean {
    const now = Date.now();
    const recentWindow = 1500; // 1.5 seconds

    return state.recentAbilities.some(
      ability =>
        MOVEMENT_ABILITIES.has(ability.abilityId) &&
        now - ability.usedAt < recentWindow
    );
  }

  /**
   * Get maximum allowed speed based on movement type
   */
  private getMaxAllowedSpeed(movementType: string, hasAbility: boolean): number {
    if (hasAbility) {
      // Movement abilities allow instant teleport within range
      return Infinity;
    }

    const baseSpeed = movementType === 'run'
      ? this.config.baseRunSpeed
      : this.config.baseWalkSpeed;

    return baseSpeed * this.config.maxSpeedMultiplier;
  }

  /**
   * Calculate 3D distance between two positions
   */
  private calculateDistance(from: Vector3, to: Vector3): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  /**
   * Handle speed violation
   */
  private async handleSpeedViolation(
    playerId: string,
    state: PlayerMovementState,
    packet: MovementPacket,
    actualSpeed: number,
    maxSpeed: number
  ): Promise<MovementValidationResult> {
    await flagAccount(playerId, 'speed_violation', {
      actualSpeed,
      maxSpeed,
      from: state.position,
      to: packet.position,
      movementType: packet.movementType,
    });

    return this.rubberBand(playerId, state, 'SPEED_HACK');
  }

  /**
   * Handle teleport violation
   */
  private async handleTeleportViolation(
    playerId: string,
    state: PlayerMovementState,
    packet: MovementPacket,
    distance: number
  ): Promise<MovementValidationResult> {
    await flagAccount(playerId, 'teleport_violation', {
      distance,
      threshold: this.config.teleportThresholdUnits,
      from: state.position,
      to: packet.position,
    });

    return this.rubberBand(playerId, state, 'TELEPORT_HACK');
  }

  /**
   * Handle wall clipping violation
   */
  private async handleWallClipViolation(
    playerId: string,
    state: PlayerMovementState,
    packet: MovementPacket
  ): Promise<MovementValidationResult> {
    await flagAccount(playerId, 'wall_clip_violation', {
      from: state.position,
      to: packet.position,
    });

    return this.rubberBand(playerId, state, 'WALL_CLIP');
  }

  /**
   * Handle fly hack violation
   */
  private async handleFlyHackViolation(
    playerId: string,
    state: PlayerMovementState,
    packet: MovementPacket,
    heightAboveGround: number
  ): Promise<MovementValidationResult> {
    await flagAccount(playerId, 'wall_clip_violation', {
      heightAboveGround,
      position: packet.position,
      reason: 'fly_hack',
    });

    return this.rubberBand(playerId, state, 'FLY_HACK');
  }

  /**
   * Apply rubber-banding correction
   */
  private rubberBand(
    playerId: string,
    state: PlayerMovementState,
    violation: MovementViolation
  ): MovementValidationResult {
    const now = Date.now();

    // Check if too many rubber-bands recently
    if (now - state.lastRubberBandTime < 60000) {
      state.rubberBandCount++;
    } else {
      state.rubberBandCount = 1;
    }

    state.lastRubberBandTime = now;

    // If too many corrections, escalate to disconnect
    if (state.rubberBandCount > this.config.maxCorrectionsPerMinute) {
      return {
        valid: false,
        action: 'disconnect',
        correctedPosition: state.position,
        violation,
      };
    }

    return {
      valid: false,
      action: 'rubber_band',
      correctedPosition: { ...state.position },
      violation,
    };
  }

  /**
   * Validate a teleport action (legitimate game teleports)
   */
  private async validateTeleport(
    playerId: string,
    state: PlayerMovementState,
    packet: MovementPacket
  ): Promise<MovementValidationResult> {
    // Server must validate that the teleport is legitimate
    // This would check against active teleport spells, lodestone unlocks, etc.
    // For now, accept teleports but log them

    // Check destination is valid
    if (!navmesh.isPositionValid(packet.position)) {
      await flagAccount(playerId, 'teleport_violation', {
        reason: 'invalid_destination',
        destination: packet.position,
      });

      return this.rubberBand(playerId, state, 'TELEPORT_HACK');
    }

    // Update state with teleport
    this.updatePlayerState(state, packet);

    return { valid: true, action: 'accept' };
  }

  /**
   * Update player movement state after valid movement
   */
  private updatePlayerState(state: PlayerMovementState, packet: MovementPacket): void {
    // Add to position history
    state.positionHistory.push({
      position: { ...packet.position },
      timestamp: packet.timestamp,
    });

    // Trim history to configured size
    while (state.positionHistory.length > this.config.positionHistorySamples) {
      state.positionHistory.shift();
    }

    // Update current position
    state.position = { ...packet.position };
    state.lastMovementTimestamp = packet.timestamp;

    // Clean up old abilities
    const now = Date.now();
    state.recentAbilities = state.recentAbilities.filter(
      ability => now - ability.usedAt < 5000
    );
  }

  /**
   * Force set player position (admin/respawn)
   */
  setPlayerPosition(playerId: string, position: Vector3): void {
    const state = playerMovementStates.get(playerId);
    if (state) {
      state.position = { ...position };
      state.lastMovementTimestamp = Date.now();
      state.positionHistory = [{ position: { ...position }, timestamp: Date.now() }];
    }
  }

  /**
   * Get movement statistics for a player (debugging/analysis)
   */
  getPlayerMovementStats(playerId: string): {
    currentPosition: Vector3;
    rubberBandCount: number;
    historyLength: number;
    recentAbilities: string[];
  } | null {
    const state = playerMovementStates.get(playerId);
    if (!state) return null;

    return {
      currentPosition: { ...state.position },
      rubberBandCount: state.rubberBandCount,
      historyLength: state.positionHistory.length,
      recentAbilities: state.recentAbilities.map(a => a.abilityId),
    };
  }

  /**
   * Analyze movement patterns for bot detection
   */
  analyzeMovementPattern(playerId: string): {
    isLinear: boolean;
    hasMicroMovements: boolean;
    averageTimeBetweenMoves: number;
  } | null {
    const state = playerMovementStates.get(playerId);
    if (!state || state.positionHistory.length < 10) {
      return null;
    }

    const history = state.positionHistory;

    // Check for perfectly linear movement (bot indicator)
    let isLinear = true;
    for (let i = 2; i < Math.min(history.length, 20); i++) {
      const prev = history[i - 2].position;
      const curr = history[i - 1].position;
      const next = history[i].position;

      // Calculate angle deviation
      const angle1 = Math.atan2(curr.y - prev.y, curr.x - prev.x);
      const angle2 = Math.atan2(next.y - curr.y, next.x - curr.x);
      const deviation = Math.abs(angle1 - angle2);

      if (deviation > 0.01) { // Small tolerance for natural variation
        isLinear = false;
        break;
      }
    }

    // Check for micro-movements (possible bot jitter)
    let microMoveCount = 0;
    for (let i = 1; i < history.length; i++) {
      const distance = this.calculateDistance(
        history[i - 1].position,
        history[i].position
      );
      if (distance < 1 && distance > 0) {
        microMoveCount++;
      }
    }
    const hasMicroMovements = microMoveCount > history.length * 0.3;

    // Calculate average time between moves
    let totalTime = 0;
    for (let i = 1; i < history.length; i++) {
      totalTime += history[i].timestamp - history[i - 1].timestamp;
    }
    const averageTimeBetweenMoves = totalTime / (history.length - 1);

    return {
      isLinear,
      hasMicroMovements,
      averageTimeBetweenMoves,
    };
  }
}

// Export singleton instance
export const movementValidator = new MovementValidator();
