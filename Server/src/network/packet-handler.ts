/**
 * Packet Handler
 *
 * Processes incoming network packets and routes to appropriate handlers.
 */

import { PacketType, Packet, Vector3 } from '../types/index.js';
import { PlayerManager } from '../managers/player-manager.js';
import { WorldService } from '../world/world-service.js';
import { ChatService, ChatChannel } from '../chat/chat-service.js';
import { authService } from '../auth/auth-service.js';
import { characterService } from '../character/character-service.js';
import { skillService } from '../skills/skill-service.js';
import { inventoryService } from '../inventory/inventory-service.js';
import { combatService } from '../combat/combat-service.js';

export class PacketHandler {
  constructor(
    private playerManager: PlayerManager,
    private worldService: WorldService,
    private chatService: ChatService
  ) {}

  async handle(playerId: string, data: Buffer): Promise<void> {
    // Handle JSON messages (for now, simpler protocol)
    try {
      const message = JSON.parse(data.toString());
      await this.handleJsonMessage(playerId, message);
    } catch {
      // If not JSON, try binary protocol
      if (data.length >= 8) {
        const packet = this.parsePacket(data);
        if (packet) {
          await this.handleBinaryPacket(playerId, packet);
        }
      }
    }
  }

  /**
   * Handle JSON-formatted messages
   */
  private async handleJsonMessage(playerId: string, message: any): Promise<void> {
    const { type, data } = message;

    switch (type) {
      case 'auth':
        await this.handleAuth(playerId, data);
        break;

      case 'register':
        await this.handleRegister(playerId, data);
        break;

      case 'get_characters':
        await this.handleGetCharacters(playerId, data);
        break;

      case 'create_character':
        await this.handleCreateCharacter(playerId, data);
        break;

      case 'select_character':
        await this.handleSelectCharacter(playerId, data);
        break;

      case 'move':
        await this.handleMove(playerId, data);
        break;

      case 'chat':
        await this.handleChat(playerId, data);
        break;

      case 'attack':
        await this.handleAttack(playerId, data);
        break;

      case 'gather':
        await this.handleGather(playerId, data);
        break;

      case 'use_item':
        await this.handleUseItem(playerId, data);
        break;

      case 'ping':
        this.handlePing(playerId);
        break;

      default:
        console.warn(`[PacketHandler] Unknown message type: ${type}`);
    }
  }

  /**
   * Handle binary packet (for performance-critical operations)
   */
  private async handleBinaryPacket(playerId: string, packet: Packet): Promise<void> {
    switch (packet.type) {
      case PacketType.PING:
        this.handlePing(playerId);
        break;

      case PacketType.MOVE:
        if (packet.payload.length >= 16) {
          const x = packet.payload.readFloatBE(0);
          const y = packet.payload.readFloatBE(4);
          const z = packet.payload.readFloatBE(8);
          const rotation = packet.payload.readFloatBE(12);
          await this.handleMove(playerId, { x, y, z, rotation });
        }
        break;

      default:
        console.warn(`[PacketHandler] Unknown packet type: 0x${packet.type.toString(16)}`);
    }
  }

  /**
   * Parse binary packet
   */
  private parsePacket(data: Buffer): Packet | null {
    try {
      const length = data.readUInt16BE(0);
      const type = data.readUInt16BE(2) as PacketType;
      const sequence = data.readUInt32BE(4);
      const payload = data.subarray(8);

      return { type, sequence, payload };
    } catch (error) {
      console.error('[PacketHandler] Failed to parse packet:', error);
      return null;
    }
  }

  // ============================================
  // Message Handlers
  // ============================================

  private async handleAuth(playerId: string, data: any): Promise<void> {
    const { usernameOrEmail, password } = data;

    const result = await authService.login({
      usernameOrEmail,
      password,
    });

    const player = this.playerManager.getPlayer(playerId);
    if (!player) return;

    if (result.success) {
      player.accountId = result.accountId;
      this.sendToPlayer(playerId, 'auth_response', {
        success: true,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } else {
      this.sendToPlayer(playerId, 'auth_response', {
        success: false,
        error: result.error,
      });
    }
  }

  private async handleRegister(playerId: string, data: any): Promise<void> {
    const { email, username, password } = data;

    const result = await authService.register({
      email,
      username,
      password,
    });

    this.sendToPlayer(playerId, 'register_response', {
      success: result.success,
      error: result.error,
    });
  }

  private async handleGetCharacters(playerId: string, _data: any): Promise<void> {
    const player = this.playerManager.getPlayer(playerId);
    if (!player?.accountId) {
      this.sendToPlayer(playerId, 'error', { message: 'Not authenticated' });
      return;
    }

    const characters = await characterService.getCharacters(player.accountId);

    this.sendToPlayer(playerId, 'characters', { characters });
  }

  private async handleCreateCharacter(playerId: string, data: any): Promise<void> {
    const player = this.playerManager.getPlayer(playerId);
    if (!player?.accountId) {
      this.sendToPlayer(playerId, 'error', { message: 'Not authenticated' });
      return;
    }

    const { name, race, appearance } = data;

    const result = await characterService.createCharacter({
      accountId: player.accountId,
      name,
      race,
      appearance,
    });

    this.sendToPlayer(playerId, 'create_character_response', {
      success: result.success,
      characterId: result.characterId,
      error: result.error,
    });
  }

  private async handleSelectCharacter(playerId: string, data: any): Promise<void> {
    const player = this.playerManager.getPlayer(playerId);
    if (!player?.accountId) {
      this.sendToPlayer(playerId, 'error', { message: 'Not authenticated' });
      return;
    }

    const { characterId } = data;

    const character = await characterService.getCharacter(characterId);
    if (!character) {
      this.sendToPlayer(playerId, 'error', { message: 'Character not found' });
      return;
    }

    // Load character into player session
    this.playerManager.setCharacter(playerId, character);

    // Register with chat service
    this.chatService.registerConnection({
      id: playerId,
      characterId: character.id,
      characterName: character.name,
      socket: player.socket,
      zoneId: character.zoneId,
    });

    // Get zone info
    const zone = this.worldService.getZone(character.zoneId);

    // Get nearby players and NPCs
    const nearbyNPCs = this.worldService.getNPCsInZone(character.zoneId);

    // Send world state
    this.sendToPlayer(playerId, 'enter_world', {
      character,
      zone,
      npcs: nearbyNPCs.map(npc => ({
        id: npc.id,
        name: npc.name,
        position: npc.position,
        health: npc.health,
        maxHealth: npc.maxHealth,
        level: npc.level,
      })),
    });
  }

  private async handleMove(playerId: string, data: any): Promise<void> {
    const player = this.playerManager.getPlayer(playerId);
    if (!player?.character) return;

    const { x, y, z, rotation } = data;
    const position: Vector3 = { x, y, z };

    // Update player position
    this.playerManager.updatePosition(playerId, position, rotation);

    // Check for zone change
    const newZone = this.worldService.getZoneForPosition(x, y, z);
    if (newZone && newZone.id !== player.zoneId) {
      this.playerManager.changeZone(playerId, newZone.id);
      this.chatService.updatePlayerZone(player.character.id, newZone.id);

      this.sendToPlayer(playerId, 'zone_change', {
        zone: newZone,
        npcs: this.worldService.getNPCsInZone(newZone.id),
      });
    }
  }

  private async handleChat(playerId: string, data: any): Promise<void> {
    const player = this.playerManager.getPlayer(playerId);
    if (!player?.character) return;

    const { channel, message, recipient } = data;

    await this.chatService.sendMessage(
      player.character.id,
      player.character.name,
      channel as ChatChannel,
      message,
      recipient
    );
  }

  private async handleAttack(playerId: string, data: any): Promise<void> {
    const player = this.playerManager.getPlayer(playerId);
    if (!player?.character) return;

    const { targetId, style } = data;

    const result = await combatService.playerAttackNpc(
      player.character.id,
      targetId,
      style
    );

    this.sendToPlayer(playerId, 'attack_result', result);

    // If XP was gained, send skill updates
    if (result.xpGained.length > 0) {
      const skills = await skillService.getSkills(player.character.id);
      this.sendToPlayer(playerId, 'skills_update', { skills });
    }
  }

  private async handleGather(playerId: string, data: any): Promise<void> {
    const player = this.playerManager.getPlayer(playerId);
    if (!player?.character) return;

    const { nodeId } = data;

    // For now, just acknowledge
    this.sendToPlayer(playerId, 'gather_start', { nodeId });
  }

  private async handleUseItem(playerId: string, data: any): Promise<void> {
    const player = this.playerManager.getPlayer(playerId);
    if (!player?.character) return;

    const { slot } = data;

    this.sendToPlayer(playerId, 'use_item_result', {
      success: true,
      slot,
    });
  }

  private handlePing(playerId: string): void {
    this.sendToPlayer(playerId, 'pong', { serverTime: Date.now() });
  }

  /**
   * Send a message to a player
   */
  private sendToPlayer(playerId: string, type: string, data: any): void {
    const player = this.playerManager.getPlayer(playerId);
    if (!player?.socket) return;

    if (player.socket.readyState === 1) { // WebSocket.OPEN
      player.socket.send(JSON.stringify({ type, data }));
    }
  }
}
