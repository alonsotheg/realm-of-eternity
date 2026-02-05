/**
 * Validated Packet Handler
 *
 * Server-authoritative packet handler that integrates all validation systems.
 * This is the main entry point for processing client packets with full
 * security validation.
 *
 * Flow:
 * 1. Decrypt and validate packet signature
 * 2. Validate action rate limits
 * 3. Process action based on type
 * 4. Validate results server-side
 * 5. Send authoritative response to client
 */

import { WebSocket } from 'ws';
import {
  packetValidator,
  movementValidator,
  actionRateLimiter,
  SignedPacket,
  GamePacket,
  MovementPacket,
  GameAction,
  ActionType,
} from '../validation/index.js';
import { grandExchangeService, CreateOfferRequest } from '../services/grand-exchange.js';
import { skillsService, SkillActionRequest } from '../services/skills.js';
import { flagAccount } from '../validation/anticheat-flagger.js';
import { Vector3 } from '../types/index.js';

// ============================================================================
// Types
// ============================================================================

interface PlayerConnection {
  playerId: string;
  characterId: string;
  accountId: string;
  socket: WebSocket;
  authenticated: boolean;
}

interface PacketHandlerResult {
  success: boolean;
  response?: GamePacket;
  broadcast?: GamePacket;
  error?: string;
}

// ============================================================================
// Player Connection Management
// ============================================================================

const connections: Map<string, PlayerConnection> = new Map();

/**
 * Register a new player connection
 */
export function registerConnection(
  playerId: string,
  socket: WebSocket
): PlayerConnection {
  const connection: PlayerConnection = {
    playerId,
    characterId: '',
    accountId: '',
    socket,
    authenticated: false,
  };

  connections.set(playerId, connection);

  // Initialize validation systems for this player
  actionRateLimiter.initializePlayer(playerId);

  return connection;
}

/**
 * Authenticate a player connection
 */
export function authenticateConnection(
  playerId: string,
  characterId: string,
  accountId: string,
  startPosition: Vector3
): void {
  const connection = connections.get(playerId);
  if (connection) {
    connection.characterId = characterId;
    connection.accountId = accountId;
    connection.authenticated = true;

    // Initialize position tracking
    movementValidator.initializePlayer(playerId, startPosition);

    // Initialize skills
    skillsService.initializePlayer(characterId);

    // Create packet signing session
    const session = packetValidator.createSession(playerId);

    // Send session info to client (encrypted with initial handshake key)
    sendToPlayer(playerId, {
      type: 'session_established',
      data: {
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
      },
    });
  }
}

/**
 * Remove a player connection
 */
export function removeConnection(playerId: string): void {
  const connection = connections.get(playerId);
  if (connection) {
    // Cleanup validation systems
    packetValidator.removeSession(playerId);
    movementValidator.removePlayer(playerId);
    actionRateLimiter.removePlayer(playerId);
    skillsService.removePlayer(connection.characterId);

    connections.delete(playerId);
  }
}

// ============================================================================
// Main Packet Handler
// ============================================================================

/**
 * Handle an incoming packet with full validation
 */
export async function handlePacket(
  playerId: string,
  rawPacket: SignedPacket
): Promise<PacketHandlerResult> {
  const connection = connections.get(playerId);
  if (!connection) {
    return { success: false, error: 'Connection not found' };
  }

  // Step 1: Validate and decrypt packet
  const validationResult = await packetValidator.validatePacket(playerId, rawPacket);

  if (!validationResult.valid) {
    console.log(`[Handler] Packet validation failed for ${playerId}: ${validationResult.error}`);
    return {
      success: false,
      error: `Packet validation failed: ${validationResult.error}`,
    };
  }

  const packet = validationResult.decryptedPayload!;

  // Step 2: Check for session rotation
  if (packetValidator.needsRotation(playerId)) {
    const newSession = packetValidator.rotateSession(playerId);
    if (newSession) {
      sendToPlayer(playerId, {
        type: 'session_rotated',
        data: {
          sessionId: newSession.sessionId,
          expiresAt: newSession.expiresAt,
        },
      });
    }
  }

  // Step 3: Route packet to appropriate handler
  try {
    const result = await routePacket(playerId, connection, packet);
    return result;
  } catch (error) {
    console.error(`[Handler] Error processing packet for ${playerId}:`, error);
    return {
      success: false,
      error: 'Internal server error',
    };
  }
}

/**
 * Route packet to specific handler based on type
 */
async function routePacket(
  playerId: string,
  connection: PlayerConnection,
  packet: GamePacket
): Promise<PacketHandlerResult> {
  switch (packet.type) {
    // Movement packets
    case 'move':
    case 'movement':
      return handleMovement(playerId, packet.data as MovementPacket);

    // Combat/ability packets
    case 'ability':
    case 'attack':
      return handleAbility(playerId, connection, packet.data as GameAction);

    // Skill action packets
    case 'skill_action':
      return handleSkillAction(playerId, connection, packet.data as SkillActionRequest);

    // Grand Exchange packets
    case 'ge_create_offer':
      return handleGECreateOffer(connection, packet.data as CreateOfferRequest);

    case 'ge_cancel_offer':
      return handleGECancelOffer(connection, packet.data as { offerId: string });

    case 'ge_collect':
      return handleGECollect(connection, packet.data as { offerId: string });

    // Equipment packets
    case 'equip_item':
      return handleEquipItem(playerId, connection, packet.data as { itemId: string; slot: string });

    // Prayer packets
    case 'switch_prayer':
      return handlePrayerSwitch(playerId, packet.data as { prayerId: string; enabled: boolean });

    // Ping/heartbeat
    case 'ping':
      return {
        success: true,
        response: {
          type: 'pong',
          data: { serverTime: Date.now() },
        },
      };

    default:
      console.log(`[Handler] Unknown packet type: ${packet.type}`);
      return { success: false, error: `Unknown packet type: ${packet.type}` };
  }
}

// ============================================================================
// Specific Packet Handlers
// ============================================================================

/**
 * Handle movement packets
 */
async function handleMovement(
  playerId: string,
  data: MovementPacket
): Promise<PacketHandlerResult> {
  const result = await movementValidator.validateMovement(playerId, data);

  if (!result.valid) {
    if (result.action === 'rubber_band' && result.correctedPosition) {
      return {
        success: false,
        response: {
          type: 'position_correction',
          data: {
            position: result.correctedPosition,
            reason: result.violation,
          },
        },
      };
    }

    if (result.action === 'disconnect') {
      // Handle disconnect
      return {
        success: false,
        error: 'Movement violation - disconnected',
      };
    }
  }

  // Movement valid - broadcast to nearby players
  return {
    success: true,
    broadcast: {
      type: 'player_moved',
      data: {
        playerId,
        position: data.position,
        rotation: data.rotation,
      },
    },
  };
}

/**
 * Handle ability/combat packets
 */
async function handleAbility(
  playerId: string,
  connection: PlayerConnection,
  data: GameAction
): Promise<PacketHandlerResult> {
  // Validate action rate
  const rateResult = await actionRateLimiter.validateAction(playerId, data);

  if (!rateResult.valid) {
    return {
      success: false,
      response: {
        type: 'action_rejected',
        data: {
          reason: rateResult.reason,
          cooldownRemaining: rateResult.cooldownRemaining,
        },
      },
    };
  }

  // Register movement ability if applicable
  if (data.abilityId && ['surge', 'escape', 'bladed_dive', 'barge'].includes(data.abilityId)) {
    movementValidator.registerMovementAbility(playerId, data.abilityId);
  }

  // Process ability (combat calculations would go here)
  // For now, acknowledge the ability

  return {
    success: true,
    response: {
      type: 'ability_executed',
      data: {
        abilityId: data.abilityId,
        timestamp: Date.now(),
      },
    },
    broadcast: {
      type: 'player_ability',
      data: {
        playerId,
        abilityId: data.abilityId,
        targetId: data.targetId,
      },
    },
  };
}

/**
 * Handle skill action packets
 */
async function handleSkillAction(
  playerId: string,
  connection: PlayerConnection,
  data: SkillActionRequest
): Promise<PacketHandlerResult> {
  const result = await skillsService.processSkillAction(connection.characterId, data);

  if (!result.success) {
    return {
      success: false,
      response: {
        type: 'skill_action_failed',
        data: { error: result.error },
      },
    };
  }

  const response: GamePacket = {
    type: 'skill_action_result',
    data: {
      action: data.action,
      skill: data.skill,
      xpGained: result.xpGained,
      itemsGained: result.itemsGained,
      resourceDepleted: result.resourceDepleted,
    },
  };

  // Send XP drop if XP was gained
  if (result.xpGained && result.xpGained > 0) {
    sendToPlayer(playerId, {
      type: 'xp_drop',
      data: {
        skill: data.skill,
        amount: result.xpGained,
      },
    });
  }

  // Send level up notification
  if (result.leveledUp && result.newLevel) {
    sendToPlayer(playerId, {
      type: 'level_up',
      data: {
        skill: data.skill,
        newLevel: result.newLevel,
      },
    });
  }

  return { success: true, response };
}

/**
 * Handle GE offer creation
 */
async function handleGECreateOffer(
  connection: PlayerConnection,
  data: CreateOfferRequest
): Promise<PacketHandlerResult> {
  const result = await grandExchangeService.createOffer(
    connection.characterId,
    connection.accountId,
    data
  );

  if (!result.success) {
    return {
      success: false,
      response: {
        type: 'ge_offer_failed',
        data: {
          error: result.error,
          errorCode: result.errorCode,
        },
      },
    };
  }

  return {
    success: true,
    response: {
      type: 'ge_offer_created',
      data: { offer: result.offer },
    },
  };
}

/**
 * Handle GE offer cancellation
 */
async function handleGECancelOffer(
  connection: PlayerConnection,
  data: { offerId: string }
): Promise<PacketHandlerResult> {
  const result = await grandExchangeService.cancelOffer(
    connection.characterId,
    data.offerId
  );

  return {
    success: result.success,
    response: {
      type: result.success ? 'ge_offer_cancelled' : 'ge_cancel_failed',
      data: result.success ? { offerId: data.offerId } : { error: result.error },
    },
  };
}

/**
 * Handle GE collection
 */
async function handleGECollect(
  connection: PlayerConnection,
  data: { offerId: string }
): Promise<PacketHandlerResult> {
  const result = await grandExchangeService.collectOffer(
    connection.characterId,
    data.offerId
  );

  return {
    success: result.success,
    response: {
      type: result.success ? 'ge_collected' : 'ge_collect_failed',
      data: result.success ? { collected: result.collected } : {},
    },
  };
}

/**
 * Handle equipment changes
 */
async function handleEquipItem(
  playerId: string,
  connection: PlayerConnection,
  data: { itemId: string; slot: string }
): Promise<PacketHandlerResult> {
  // Validate rate limit
  const rateResult = await actionRateLimiter.validateAction(playerId, {
    type: 'equip_item',
    actionId: `equip_${data.itemId}`,
    timestamp: Date.now(),
  });

  if (!rateResult.valid) {
    return {
      success: false,
      response: {
        type: 'equip_failed',
        data: { reason: rateResult.reason },
      },
    };
  }

  // Server would validate item ownership and requirements here
  // For now, acknowledge the equip

  return {
    success: true,
    response: {
      type: 'item_equipped',
      data: {
        itemId: data.itemId,
        slot: data.slot,
      },
    },
  };
}

/**
 * Handle prayer switches
 */
async function handlePrayerSwitch(
  playerId: string,
  data: { prayerId: string; enabled: boolean }
): Promise<PacketHandlerResult> {
  // Validate prayer switch rate
  const rateResult = await actionRateLimiter.validateAction(playerId, {
    type: 'switch_prayer',
    actionId: data.prayerId,
    timestamp: Date.now(),
  });

  if (!rateResult.valid) {
    return {
      success: false,
      response: {
        type: 'prayer_switch_failed',
        data: { reason: rateResult.reason },
      },
    };
  }

  // Server would validate prayer points and requirements here

  return {
    success: true,
    response: {
      type: 'prayer_switched',
      data: {
        prayerId: data.prayerId,
        enabled: data.enabled,
      },
    },
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Send a packet to a specific player
 */
function sendToPlayer(playerId: string, packet: GamePacket): void {
  const connection = connections.get(playerId);
  if (!connection || connection.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  // Sign packet before sending
  const signedPacket = packetValidator.signPacket(playerId, packet);
  if (signedPacket) {
    connection.socket.send(JSON.stringify(signedPacket));
  }
}

/**
 * Broadcast a packet to all players in range
 */
export function broadcastToNearby(
  sourcePlayerId: string,
  packet: GamePacket,
  range: number = 100
): void {
  const sourcePos = movementValidator.getPlayerPosition(sourcePlayerId);
  if (!sourcePos) return;

  for (const [playerId, connection] of connections) {
    if (playerId === sourcePlayerId) continue;

    const targetPos = movementValidator.getPlayerPosition(playerId);
    if (!targetPos) continue;

    const distance = Math.sqrt(
      Math.pow(targetPos.x - sourcePos.x, 2) +
      Math.pow(targetPos.y - sourcePos.y, 2) +
      Math.pow(targetPos.z - sourcePos.z, 2)
    );

    if (distance <= range) {
      sendToPlayer(playerId, packet);
    }
  }
}

/**
 * Get server statistics
 */
export function getServerStats(): {
  connectedPlayers: number;
  authenticatedPlayers: number;
} {
  let authenticated = 0;
  for (const connection of connections.values()) {
    if (connection.authenticated) authenticated++;
  }

  return {
    connectedPlayers: connections.size,
    authenticatedPlayers: authenticated,
  };
}
