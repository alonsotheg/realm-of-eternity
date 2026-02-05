/**
 * Server Configuration
 */

import 'dotenv/config';

export const config = {
  // Server
  host: process.env.HOST || '0.0.0.0',
  port: parseInt(process.env.PORT || '7777', 10),
  tickRate: parseInt(process.env.TICK_RATE || '20', 10),

  // Database
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/realm_of_eternity',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

  // Auth
  jwtSecret: process.env.JWT_SECRET || 'change-this-in-production',
  jwtExpiry: process.env.JWT_EXPIRY || '7d',

  // Game Settings
  maxPlayersPerZone: parseInt(process.env.MAX_PLAYERS_PER_ZONE || '2000', 10),

  // Development
  isDev: process.env.NODE_ENV !== 'production',
} as const;
