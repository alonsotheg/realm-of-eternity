/**
 * JWT Token Management
 *
 * Create and verify JSON Web Tokens for authentication.
 */

import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export interface TokenPayload {
  accountId: string;
  sessionId: string;
  role: string;
}

export interface RefreshTokenPayload {
  accountId: string;
  sessionId: string;
  type: 'refresh';
}

/**
 * Create an access token (short-lived)
 */
export function createAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: '15m',
    algorithm: 'HS256',
  });
}

/**
 * Create a refresh token (long-lived)
 */
export function createRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiry,
    algorithm: 'HS256',
  });
}

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): TokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as TokenPayload;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as RefreshTokenPayload;
    if (decoded.type !== 'refresh') return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Decode a token without verification (for debugging)
 */
export function decodeToken(token: string): TokenPayload | null {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
}
