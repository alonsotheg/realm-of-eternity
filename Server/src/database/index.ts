/**
 * Database Connection
 *
 * Prisma client singleton for database operations.
 */

import { PrismaClient } from '@prisma/client';
import { config } from '../config.js';

// Extend PrismaClient with logging in development
const prismaClientSingleton = () => {
  return new PrismaClient({
    log: config.isDev ? ['query', 'error', 'warn'] : ['error'],
  });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (!config.isDev) globalForPrisma.prisma = prisma;

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default prisma;
