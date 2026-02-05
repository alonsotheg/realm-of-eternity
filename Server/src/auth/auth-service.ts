/**
 * Authentication Service
 *
 * Handles account registration, login, and session management.
 */

import { v4 as uuidv4 } from 'uuid';
import prisma from '../database/index.js';
import { hashPassword, verifyPassword, validatePassword } from './password.js';
import {
  createAccessToken,
  createRefreshToken,
  verifyRefreshToken,
  TokenPayload,
} from './jwt.js';

export interface RegisterInput {
  email: string;
  username: string;
  password: string;
}

export interface LoginInput {
  usernameOrEmail: string;
  password: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuthResult {
  success: boolean;
  error?: string;
  accessToken?: string;
  refreshToken?: string;
  accountId?: string;
}

export class AuthService {
  /**
   * Register a new account
   */
  async register(input: RegisterInput): Promise<AuthResult> {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(input.email)) {
      return { success: false, error: 'Invalid email format' };
    }

    // Validate username
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(input.username)) {
      return {
        success: false,
        error: 'Username must be 3-20 characters, alphanumeric and underscores only',
      };
    }

    // Validate password
    const passwordValidation = validatePassword(input.password);
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.errors[0] };
    }

    // Check if email or username already exists
    const existing = await prisma.account.findFirst({
      where: {
        OR: [
          { email: input.email.toLowerCase() },
          { username: input.username.toLowerCase() },
        ],
      },
    });

    if (existing) {
      if (existing.email === input.email.toLowerCase()) {
        return { success: false, error: 'Email already registered' };
      }
      return { success: false, error: 'Username already taken' };
    }

    // Create account
    const passwordHash = await hashPassword(input.password);
    const account = await prisma.account.create({
      data: {
        email: input.email.toLowerCase(),
        username: input.username.toLowerCase(),
        passwordHash,
      },
    });

    console.log(`[Auth] New account registered: ${account.username}`);

    return {
      success: true,
      accountId: account.id,
    };
  }

  /**
   * Login to an existing account
   */
  async login(input: LoginInput): Promise<AuthResult> {
    // Find account by email or username
    const account = await prisma.account.findFirst({
      where: {
        OR: [
          { email: input.usernameOrEmail.toLowerCase() },
          { username: input.usernameOrEmail.toLowerCase() },
        ],
      },
    });

    if (!account) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Check account status
    if (account.status === 'BANNED') {
      return { success: false, error: 'Account is banned' };
    }
    if (account.status === 'SUSPENDED') {
      return { success: false, error: 'Account is suspended' };
    }

    // Verify password
    const validPassword = await verifyPassword(
      input.password,
      account.passwordHash
    );
    if (!validPassword) {
      return { success: false, error: 'Invalid credentials' };
    }

    // Create session
    const sessionId = uuidv4();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await prisma.session.create({
      data: {
        id: sessionId,
        accountId: account.id,
        token: sessionId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        expiresAt,
      },
    });

    // Update last login
    await prisma.account.update({
      where: { id: account.id },
      data: { lastLogin: new Date() },
    });

    // Generate tokens
    const tokenPayload: TokenPayload = {
      accountId: account.id,
      sessionId,
      role: account.role,
    };

    const accessToken = createAccessToken(tokenPayload);
    const refreshToken = createRefreshToken({
      accountId: account.id,
      sessionId,
      type: 'refresh',
    });

    console.log(`[Auth] Login successful: ${account.username}`);

    return {
      success: true,
      accessToken,
      refreshToken,
      accountId: account.id,
    };
  }

  /**
   * Refresh an access token
   */
  async refreshTokens(refreshToken: string): Promise<AuthResult> {
    const payload = verifyRefreshToken(refreshToken);
    if (!payload) {
      return { success: false, error: 'Invalid refresh token' };
    }

    // Verify session still exists and is valid
    const session = await prisma.session.findUnique({
      where: { id: payload.sessionId },
      include: { account: true },
    });

    if (!session || session.expiresAt < new Date()) {
      return { success: false, error: 'Session expired' };
    }

    // Generate new tokens
    const tokenPayload: TokenPayload = {
      accountId: session.accountId,
      sessionId: session.id,
      role: session.account.role,
    };

    const newAccessToken = createAccessToken(tokenPayload);
    const newRefreshToken = createRefreshToken({
      accountId: session.accountId,
      sessionId: session.id,
      type: 'refresh',
    });

    return {
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      accountId: session.accountId,
    };
  }

  /**
   * Logout and invalidate session
   */
  async logout(sessionId: string): Promise<void> {
    await prisma.session.delete({
      where: { id: sessionId },
    }).catch(() => {
      // Session might not exist, ignore
    });
  }

  /**
   * Logout from all sessions
   */
  async logoutAll(accountId: string): Promise<void> {
    await prisma.session.deleteMany({
      where: { accountId },
    });
  }

  /**
   * Validate a session is still active
   */
  async validateSession(sessionId: string): Promise<boolean> {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    return session !== null && session.expiresAt > new Date();
  }

  /**
   * Get account by ID
   */
  async getAccount(accountId: string) {
    return prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        email: true,
        username: true,
        createdAt: true,
        lastLogin: true,
        status: true,
        role: true,
      },
    });
  }

  /**
   * Change password
   */
  async changePassword(
    accountId: string,
    currentPassword: string,
    newPassword: string
  ): Promise<AuthResult> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return { success: false, error: 'Account not found' };
    }

    // Verify current password
    const validPassword = await verifyPassword(
      currentPassword,
      account.passwordHash
    );
    if (!validPassword) {
      return { success: false, error: 'Current password is incorrect' };
    }

    // Validate new password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return { success: false, error: passwordValidation.errors[0] };
    }

    // Update password
    const newHash = await hashPassword(newPassword);
    await prisma.account.update({
      where: { id: accountId },
      data: { passwordHash: newHash },
    });

    // Invalidate all sessions (force re-login)
    await this.logoutAll(accountId);

    return { success: true };
  }
}

export const authService = new AuthService();
