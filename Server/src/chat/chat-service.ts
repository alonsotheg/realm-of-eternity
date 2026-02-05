/**
 * Chat Service
 *
 * Handles all chat channels and message delivery.
 */

import { WebSocket } from 'ws';
import prisma from '../database/index.js';

export enum ChatChannel {
  LOCAL = 'local', // Nearby players only
  ZONE = 'zone', // Current zone
  GLOBAL = 'global', // All players
  TRADE = 'trade', // Trading channel
  GUILD = 'guild', // Guild members only
  PARTY = 'party', // Party members only
  WHISPER = 'whisper', // Private message
  SYSTEM = 'system', // System announcements
}

export interface ChatMessage {
  id: string;
  channel: ChatChannel;
  senderId?: string;
  senderName: string;
  content: string;
  timestamp: Date;
  recipientId?: string; // For whispers
  metadata?: Record<string, any>;
}

export interface PlayerConnection {
  id: string;
  characterId: string;
  characterName: string;
  socket: WebSocket;
  zoneId: number;
  guildId?: string;
  partyId?: string;
}

export class ChatService {
  private connections: Map<string, PlayerConnection> = new Map();
  private characterToConnection: Map<string, string> = new Map();

  // Chat filter for bad words (expand this)
  private bannedWords: Set<string> = new Set([
    // Add banned words here
  ]);

  /**
   * Register a player connection
   */
  registerConnection(connection: PlayerConnection): void {
    this.connections.set(connection.id, connection);
    this.characterToConnection.set(connection.characterId, connection.id);
  }

  /**
   * Remove a player connection
   */
  removeConnection(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (connection) {
      this.characterToConnection.delete(connection.characterId);
      this.connections.delete(connectionId);
    }
  }

  /**
   * Update player zone
   */
  updatePlayerZone(characterId: string, zoneId: number): void {
    const connId = this.characterToConnection.get(characterId);
    if (connId) {
      const connection = this.connections.get(connId);
      if (connection) {
        connection.zoneId = zoneId;
      }
    }
  }

  /**
   * Send a chat message
   */
  async sendMessage(
    senderId: string,
    senderName: string,
    channel: ChatChannel,
    content: string,
    recipientName?: string
  ): Promise<{ success: boolean; error?: string }> {
    // Filter content
    const filteredContent = this.filterMessage(content);

    // Rate limit check (simplified)
    // TODO: Implement proper rate limiting with Redis

    // Validate message
    if (filteredContent.length === 0) {
      return { success: false, error: 'Message is empty' };
    }
    if (filteredContent.length > 500) {
      return { success: false, error: 'Message too long (max 500 characters)' };
    }

    const message: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      channel,
      senderId,
      senderName,
      content: filteredContent,
      timestamp: new Date(),
    };

    // Handle different channels
    switch (channel) {
      case ChatChannel.LOCAL:
        await this.sendLocalMessage(senderId, message);
        break;

      case ChatChannel.ZONE:
        await this.sendZoneMessage(senderId, message);
        break;

      case ChatChannel.GLOBAL:
        await this.sendGlobalMessage(message);
        break;

      case ChatChannel.TRADE:
        await this.sendTradeMessage(message);
        break;

      case ChatChannel.GUILD:
        await this.sendGuildMessage(senderId, message);
        break;

      case ChatChannel.PARTY:
        await this.sendPartyMessage(senderId, message);
        break;

      case ChatChannel.WHISPER:
        if (!recipientName) {
          return { success: false, error: 'Recipient required for whisper' };
        }
        const result = await this.sendWhisper(senderId, recipientName, message);
        if (!result.success) {
          return result;
        }
        break;

      default:
        return { success: false, error: 'Invalid channel' };
    }

    // Log message for moderation
    await this.logMessage(message);

    return { success: true };
  }

  /**
   * Send system announcement
   */
  async sendSystemMessage(content: string, zoneId?: number): Promise<void> {
    const message: ChatMessage = {
      id: `sys-${Date.now()}`,
      channel: ChatChannel.SYSTEM,
      senderName: 'SYSTEM',
      content,
      timestamp: new Date(),
    };

    if (zoneId !== undefined) {
      // Zone-specific announcement
      for (const connection of this.connections.values()) {
        if (connection.zoneId === zoneId) {
          this.sendToSocket(connection.socket, message);
        }
      }
    } else {
      // Global announcement
      for (const connection of this.connections.values()) {
        this.sendToSocket(connection.socket, message);
      }
    }
  }

  /**
   * Send local message (nearby players)
   */
  private async sendLocalMessage(
    senderId: string,
    message: ChatMessage
  ): Promise<void> {
    const senderConnId = this.characterToConnection.get(senderId);
    const senderConn = senderConnId
      ? this.connections.get(senderConnId)
      : undefined;

    if (!senderConn) return;

    // In a real implementation, we'd check distance
    // For now, send to all players in the same zone
    for (const connection of this.connections.values()) {
      if (connection.zoneId === senderConn.zoneId) {
        this.sendToSocket(connection.socket, message);
      }
    }
  }

  /**
   * Send zone-wide message
   */
  private async sendZoneMessage(
    senderId: string,
    message: ChatMessage
  ): Promise<void> {
    const senderConnId = this.characterToConnection.get(senderId);
    const senderConn = senderConnId
      ? this.connections.get(senderConnId)
      : undefined;

    if (!senderConn) return;

    for (const connection of this.connections.values()) {
      if (connection.zoneId === senderConn.zoneId) {
        this.sendToSocket(connection.socket, message);
      }
    }
  }

  /**
   * Send global message
   */
  private async sendGlobalMessage(message: ChatMessage): Promise<void> {
    for (const connection of this.connections.values()) {
      this.sendToSocket(connection.socket, message);
    }
  }

  /**
   * Send trade channel message
   */
  private async sendTradeMessage(message: ChatMessage): Promise<void> {
    // Trade messages go to everyone (could be filtered by preference)
    for (const connection of this.connections.values()) {
      this.sendToSocket(connection.socket, message);
    }
  }

  /**
   * Send guild message
   */
  private async sendGuildMessage(
    senderId: string,
    message: ChatMessage
  ): Promise<void> {
    const senderConnId = this.characterToConnection.get(senderId);
    const senderConn = senderConnId
      ? this.connections.get(senderConnId)
      : undefined;

    if (!senderConn?.guildId) return;

    for (const connection of this.connections.values()) {
      if (connection.guildId === senderConn.guildId) {
        this.sendToSocket(connection.socket, message);
      }
    }
  }

  /**
   * Send party message
   */
  private async sendPartyMessage(
    senderId: string,
    message: ChatMessage
  ): Promise<void> {
    const senderConnId = this.characterToConnection.get(senderId);
    const senderConn = senderConnId
      ? this.connections.get(senderConnId)
      : undefined;

    if (!senderConn?.partyId) return;

    for (const connection of this.connections.values()) {
      if (connection.partyId === senderConn.partyId) {
        this.sendToSocket(connection.socket, message);
      }
    }
  }

  /**
   * Send whisper (private message)
   */
  private async sendWhisper(
    senderId: string,
    recipientName: string,
    message: ChatMessage
  ): Promise<{ success: boolean; error?: string }> {
    // Find recipient by name
    let recipientConn: PlayerConnection | undefined;

    for (const connection of this.connections.values()) {
      if (
        connection.characterName.toLowerCase() === recipientName.toLowerCase()
      ) {
        recipientConn = connection;
        break;
      }
    }

    if (!recipientConn) {
      return { success: false, error: 'Player not online' };
    }

    message.recipientId = recipientConn.characterId;

    // Send to recipient
    this.sendToSocket(recipientConn.socket, message);

    // Send confirmation to sender
    const senderConnId = this.characterToConnection.get(senderId);
    const senderConn = senderConnId
      ? this.connections.get(senderConnId)
      : undefined;
    if (senderConn) {
      this.sendToSocket(senderConn.socket, {
        ...message,
        metadata: { sentTo: recipientName },
      });
    }

    return { success: true };
  }

  /**
   * Filter message content
   */
  private filterMessage(content: string): string {
    let filtered = content.trim();

    // Replace banned words with asterisks
    for (const word of this.bannedWords) {
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      filtered = filtered.replace(regex, '*'.repeat(word.length));
    }

    return filtered;
  }

  /**
   * Send message to socket
   */
  private sendToSocket(socket: WebSocket, message: ChatMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(
        JSON.stringify({
          type: 'chat',
          data: message,
        })
      );
    }
  }

  /**
   * Log message for moderation
   */
  private async logMessage(message: ChatMessage): Promise<void> {
    // Only log non-system messages
    if (message.channel !== ChatChannel.SYSTEM && message.senderId) {
      await prisma.playerAction.create({
        data: {
          characterId: message.senderId,
          action: 'CHAT_MESSAGE',
          details: {
            channel: message.channel,
            content: message.content,
            timestamp: message.timestamp,
          },
        },
      });
    }
  }

  /**
   * Get online player count
   */
  getOnlineCount(): number {
    return this.connections.size;
  }

  /**
   * Get online players in zone
   */
  getPlayersInZone(zoneId: number): string[] {
    const players: string[] = [];
    for (const connection of this.connections.values()) {
      if (connection.zoneId === zoneId) {
        players.push(connection.characterName);
      }
    }
    return players;
  }
}

export const chatService = new ChatService();
