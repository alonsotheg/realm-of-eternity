/**
 * Realm of Eternity - Game Server
 *
 * Main entry point for the multiplayer game server.
 * Handles WebSocket connections, game state, and player management.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer, IncomingMessage } from 'http';
import { config } from './config.js';
import { PacketHandler } from './network/packet-handler.js';
import { PlayerManager } from './managers/player-manager.js';
import { GameLoop } from './core/game-loop.js';
import { worldService } from './world/world-service.js';
import { chatService } from './chat/chat-service.js';
import { authService } from './auth/auth-service.js';
import { loadGameData } from './utils/data-loader.js';
import prisma from './database/index.js';

// Create HTTP server for WebSocket upgrade
const httpServer = createServer((req, res) => {
  // Basic health check endpoint
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptime: process.uptime(),
      players: playerManager.playerCount,
    }));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

const wss = new WebSocketServer({ server: httpServer });

// Initialize managers
const playerManager = new PlayerManager();
const packetHandler = new PacketHandler(playerManager, worldService, chatService);
const gameLoop = new GameLoop(playerManager, worldService);

/**
 * Initialize the server
 */
async function initialize(): Promise<void> {
  console.log('[Server] Initializing...');

  // Test database connection
  try {
    await prisma.$connect();
    console.log('[Server] Database connected');
  } catch (error) {
    console.error('[Server] Failed to connect to database:', error);
    process.exit(1);
  }

  // Load game data
  const gameData = await loadGameData();

  // Initialize world with loaded data
  await worldService.initialize(gameData.npcs, gameData.resources);

  console.log('[Server] Initialization complete');
}

/**
 * Handle WebSocket connections
 */
wss.on('connection', (socket: WebSocket, request: IncomingMessage) => {
  const ip = request.socket.remoteAddress || 'unknown';
  console.log(`[Server] New connection from ${ip}`);

  const playerId = playerManager.createPlayer(socket);

  // Send welcome message
  socket.send(JSON.stringify({
    type: 'welcome',
    data: {
      playerId,
      serverTime: Date.now(),
      version: '0.1.0',
    },
  }));

  socket.on('message', async (data: Buffer) => {
    try {
      await packetHandler.handle(playerId, data);
    } catch (error) {
      console.error(`[Server] Error handling packet from ${playerId}:`, error);
    }
  });

  socket.on('close', () => {
    console.log(`[Server] Player ${playerId} disconnected`);
    chatService.removeConnection(playerId);
    playerManager.removePlayer(playerId);
  });

  socket.on('error', (error) => {
    console.error(`[Server] Socket error for player ${playerId}:`, error);
  });
});

/**
 * Start the server
 */
async function start(): Promise<void> {
  await initialize();

  // Start the game loop
  gameLoop.start(config.tickRate);

  // Start listening
  httpServer.listen(config.port, config.host, () => {
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║           REALM OF ETERNITY - GAME SERVER                 ║
╠═══════════════════════════════════════════════════════════╣
║  Status:    ONLINE                                        ║
║  Host:      ${config.host.padEnd(45)}║
║  Port:      ${String(config.port).padEnd(45)}║
║  Tick Rate: ${(config.tickRate + ' Hz').padEnd(45)}║
║  Env:       ${(config.isDev ? 'Development' : 'Production').padEnd(45)}║
╚═══════════════════════════════════════════════════════════╝
    `);
  });
}

/**
 * Graceful shutdown
 */
async function shutdown(): Promise<void> {
  console.log('\n[Server] Shutting down...');

  // Stop game loop
  gameLoop.stop();

  // Save all player data
  console.log('[Server] Saving player data...');
  await playerManager.saveAllPlayers();

  // Close connections
  wss.close();
  httpServer.close();

  // Disconnect database
  await prisma.$disconnect();

  console.log('[Server] Shutdown complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('[Server] Uncaught exception:', error);
  shutdown();
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled rejection at:', promise, 'reason:', reason);
});

// Start the server
start().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});
