/**
 * Packet Validation System
 *
 * Implements secure packet signing and validation to prevent:
 * - Packet tampering (Man-in-the-middle attacks)
 * - Replay attacks
 * - Packet injection
 *
 * Uses AES-256-GCM for encryption and HMAC-SHA256 for signing.
 */

import crypto from 'crypto';
import {
  SignedPacket,
  SessionSecret,
  PacketValidationResult,
  GamePacket,
  PacketValidationError,
} from './types.js';
import { validationConfig } from './config.js';
import { flagAccount } from './anticheat-flagger.js';

/**
 * Packet Validator
 *
 * Manages session secrets, validates packet signatures, and decrypts payloads.
 * Ensures packet integrity and prevents replay attacks.
 */
export class PacketValidator {
  /** Session secrets keyed by player ID */
  private sessionSecrets: Map<string, SessionSecret> = new Map();

  /** Last known sequence number per player */
  private sequenceTrackers: Map<string, number> = new Map();

  /** Used nonces to prevent replay attacks */
  private usedNonces: Map<string, Set<string>> = new Map();

  /** Nonce cleanup interval */
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Start periodic cleanup of expired nonces
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredNonces();
    }, 60000); // Every minute
  }

  /**
   * Create a new session for a player
   * Called after successful authentication
   */
  createSession(playerId: string): SessionSecret {
    const secret = crypto.randomBytes(32);
    const encryptionKey = crypto.randomBytes(32);
    const now = Date.now();

    const session: SessionSecret = {
      sessionId: crypto.randomUUID(),
      secret,
      encryptionKey,
      createdAt: now,
      expiresAt: now + (validationConfig.packets.keyRotationMinutes * 60 * 1000),
    };

    this.sessionSecrets.set(playerId, session);
    this.sequenceTrackers.set(playerId, 0);
    this.usedNonces.set(playerId, new Set());

    return session;
  }

  /**
   * Rotate session keys for a player
   * Should be called periodically for security
   */
  rotateSession(playerId: string): SessionSecret | null {
    const existingSession = this.sessionSecrets.get(playerId);
    if (!existingSession) {
      return null;
    }

    // Create new session while preserving sequence
    const newSession = this.createSession(playerId);
    const currentSequence = this.sequenceTrackers.get(playerId) ?? 0;
    this.sequenceTrackers.set(playerId, currentSequence);

    return newSession;
  }

  /**
   * Remove a player's session
   */
  removeSession(playerId: string): void {
    this.sessionSecrets.delete(playerId);
    this.sequenceTrackers.delete(playerId);
    this.usedNonces.delete(playerId);
  }

  /**
   * Validate and decrypt an incoming packet
   */
  async validatePacket(
    playerId: string,
    packet: SignedPacket
  ): Promise<PacketValidationResult> {
    const session = this.sessionSecrets.get(playerId);

    // Check session exists
    if (!session) {
      return {
        valid: false,
        error: 'SESSION_NOT_FOUND',
      };
    }

    // Check session not expired
    if (Date.now() > session.expiresAt) {
      await flagAccount(playerId, 'timestamp_violation', {
        reason: 'session_expired',
        sessionExpiry: session.expiresAt,
      });
      return {
        valid: false,
        error: 'SESSION_EXPIRED',
      };
    }

    // Validate timestamp
    const timestampResult = this.validateTimestamp(playerId, packet.timestamp);
    if (!timestampResult.valid) {
      return timestampResult;
    }

    // Check for replay attack (nonce reuse)
    const nonceResult = await this.validateNonce(playerId, packet.nonce);
    if (!nonceResult.valid) {
      return nonceResult;
    }

    // Verify signature
    const signatureResult = await this.verifySignature(
      playerId,
      packet,
      session.secret
    );
    if (!signatureResult.valid) {
      return signatureResult;
    }

    // Validate sequence number
    const sequenceResult = await this.validateSequence(playerId, packet.sequence);
    if (!sequenceResult.valid) {
      return sequenceResult;
    }

    // Decrypt payload
    try {
      const decrypted = this.decrypt(packet.payload, session.encryptionKey);
      const gamePacket = JSON.parse(decrypted) as GamePacket;

      // Update sequence tracker
      this.sequenceTrackers.set(playerId, packet.sequence);

      return {
        valid: true,
        decryptedPayload: gamePacket,
      };
    } catch (error) {
      await flagAccount(playerId, 'packet_manipulation', {
        reason: 'decryption_failed',
        error: (error as Error).message,
      });
      return {
        valid: false,
        error: 'DECRYPTION_FAILED',
      };
    }
  }

  /**
   * Sign and encrypt an outgoing packet
   */
  signPacket(playerId: string, payload: GamePacket): SignedPacket | null {
    const session = this.sessionSecrets.get(playerId);
    if (!session) {
      return null;
    }

    const payloadString = JSON.stringify(payload);
    const encrypted = this.encrypt(payloadString, session.encryptionKey);
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(16).toString('hex');
    const sequence = (this.sequenceTrackers.get(playerId) ?? 0) + 1;

    // Create signature
    const signatureData = encrypted + sequence + timestamp + nonce;
    const signature = crypto
      .createHmac('sha256', session.secret)
      .update(signatureData)
      .digest('hex');

    this.sequenceTrackers.set(playerId, sequence);

    return {
      payload: encrypted,
      signature,
      sequence,
      timestamp,
      nonce,
    };
  }

  /**
   * Validate packet timestamp
   */
  private validateTimestamp(
    playerId: string,
    timestamp: number
  ): PacketValidationResult {
    const now = Date.now();
    const packetAge = now - timestamp;
    const config = validationConfig.packets;

    // Check if packet is too old
    if (packetAge > config.maxPacketAgeMs) {
      flagAccount(playerId, 'timestamp_violation', {
        reason: 'packet_too_old',
        age: packetAge,
        maxAge: config.maxPacketAgeMs,
      });
      return { valid: false, error: 'INVALID_TIMESTAMP' };
    }

    // Check for future timestamp (with clock skew tolerance)
    if (packetAge < -config.clockSkewToleranceMs) {
      flagAccount(playerId, 'timestamp_violation', {
        reason: 'future_timestamp',
        drift: -packetAge,
      });
      return { valid: false, error: 'INVALID_TIMESTAMP' };
    }

    return { valid: true };
  }

  /**
   * Validate nonce for replay attack prevention
   */
  private async validateNonce(
    playerId: string,
    nonce: string
  ): Promise<PacketValidationResult> {
    const playerNonces = this.usedNonces.get(playerId);
    if (!playerNonces) {
      return { valid: false, error: 'SESSION_NOT_FOUND' };
    }

    // Check if nonce was already used
    if (playerNonces.has(nonce)) {
      await flagAccount(playerId, 'replay_attack', {
        nonce,
        timestamp: Date.now(),
      });
      return { valid: false, error: 'REPLAY_ATTACK' };
    }

    // Add nonce to used set
    playerNonces.add(nonce);
    return { valid: true };
  }

  /**
   * Verify packet signature
   */
  private async verifySignature(
    playerId: string,
    packet: SignedPacket,
    secret: Buffer
  ): Promise<PacketValidationResult> {
    const signatureData =
      packet.payload + packet.sequence + packet.timestamp + packet.nonce;

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(signatureData)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    const sigBuffer = Buffer.from(packet.signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      await flagAccount(playerId, 'signature_mismatch', {
        reason: 'length_mismatch',
      });
      return { valid: false, error: 'SIGNATURE_MISMATCH' };
    }

    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      await flagAccount(playerId, 'signature_mismatch', {
        timestamp: Date.now(),
      });
      return { valid: false, error: 'SIGNATURE_MISMATCH' };
    }

    return { valid: true };
  }

  /**
   * Validate sequence number
   */
  private async validateSequence(
    playerId: string,
    sequence: number
  ): Promise<PacketValidationResult> {
    const lastSequence = this.sequenceTrackers.get(playerId) ?? 0;
    const config = validationConfig.packets;

    // Sequence must be greater than last known
    if (sequence <= lastSequence) {
      await flagAccount(playerId, 'sequence_violation', {
        receivedSequence: sequence,
        expectedSequence: lastSequence + 1,
      });
      return { valid: false, error: 'SEQUENCE_VIOLATION' };
    }

    // Check for unreasonably large sequence gap (potential manipulation)
    if (sequence > lastSequence + config.sequenceWindow) {
      await flagAccount(playerId, 'sequence_violation', {
        reason: 'sequence_gap_too_large',
        gap: sequence - lastSequence,
      });
      return { valid: false, error: 'SEQUENCE_VIOLATION' };
    }

    return { valid: true };
  }

  /**
   * Encrypt payload using AES-256-GCM
   */
  private encrypt(plaintext: string, key: Buffer): string {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Format: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
    const result = Buffer.concat([iv, authTag, encrypted]);
    return result.toString('base64');
  }

  /**
   * Decrypt payload using AES-256-GCM
   */
  private decrypt(ciphertext: string, key: Buffer): string {
    const data = Buffer.from(ciphertext, 'base64');

    // Extract components
    const iv = data.subarray(0, 12);
    const authTag = data.subarray(12, 28);
    const encrypted = data.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  /**
   * Cleanup expired nonces to prevent memory bloat
   */
  private cleanupExpiredNonces(): void {
    // For each player, keep only recent nonces
    // In production, this would use Redis with TTL
    for (const [playerId, nonces] of this.usedNonces) {
      if (nonces.size > 10000) {
        // If too many nonces, clear old ones
        // This is a simplified approach - production would use proper TTL
        nonces.clear();
      }
    }
  }

  /**
   * Get session info for a player (for debugging/admin)
   */
  getSessionInfo(playerId: string): { sessionId: string; expiresAt: number } | null {
    const session = this.sessionSecrets.get(playerId);
    if (!session) return null;

    return {
      sessionId: session.sessionId,
      expiresAt: session.expiresAt,
    };
  }

  /**
   * Check if a session needs rotation
   */
  needsRotation(playerId: string): boolean {
    const session = this.sessionSecrets.get(playerId);
    if (!session) return false;

    const rotationBuffer = 5 * 60 * 1000; // 5 minutes before expiry
    return Date.now() > (session.expiresAt - rotationBuffer);
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.sessionSecrets.clear();
    this.sequenceTrackers.clear();
    this.usedNonces.clear();
  }
}

// Export singleton instance
export const packetValidator = new PacketValidator();
