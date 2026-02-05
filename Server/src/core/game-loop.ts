/**
 * Game Loop
 *
 * Main simulation loop running at fixed tick rate.
 * Processes game state updates and broadcasts to clients.
 */

import { PlayerManager } from '../managers/player-manager.js';
import { WorldService } from '../world/world-service.js';

export class GameLoop {
  private running = false;
  private tickInterval: NodeJS.Timeout | null = null;
  private tickCount = 0;
  private lastTickTime = 0;
  private saveInterval = 0;
  private readonly SAVE_INTERVAL = 300; // Save every 300 ticks (~15 seconds at 20Hz)

  constructor(
    private playerManager: PlayerManager,
    private worldService: WorldService
  ) {}

  start(tickRate: number): void {
    if (this.running) return;

    this.running = true;
    const tickMs = 1000 / tickRate;
    this.lastTickTime = Date.now();

    this.tickInterval = setInterval(() => {
      this.tick();
    }, tickMs);

    console.log(`[GameLoop] Started at ${tickRate} Hz (${tickMs}ms per tick)`);
  }

  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    console.log(`[GameLoop] Stopped after ${this.tickCount} ticks`);
  }

  private tick(): void {
    const now = Date.now();
    const deltaTime = now - this.lastTickTime;
    this.lastTickTime = now;
    this.tickCount++;

    try {
      // Update world state (NPCs, resources, events)
      this.worldService.update();

      // Process player states
      this.playerManager.update(deltaTime);

      // Broadcast state updates to nearby players
      this.broadcastUpdates();

      // Periodic saves
      this.saveInterval++;
      if (this.saveInterval >= this.SAVE_INTERVAL) {
        this.saveInterval = 0;
        this.periodicSave();
      }
    } catch (error) {
      console.error(`[GameLoop] Error in tick ${this.tickCount}:`, error);
    }
  }

  private broadcastUpdates(): void {
    // Get all players and broadcast their positions to nearby players
    const players = this.playerManager.getAllPlayers();

    for (const player of players) {
      if (!player.character) continue;

      const nearbyPlayers = this.playerManager.getPlayersInZone(player.zoneId);

      // Build list of nearby player positions
      const otherPlayers = nearbyPlayers
        .filter((p) => p.id !== player.id && p.character)
        .map((p) => ({
          id: p.character!.id,
          name: p.character!.name,
          position: p.character!.position,
          rotation: p.character!.rotation,
          health: p.character!.health,
          maxHealth: p.character!.maxHealth,
        }));

      // Only send if there are other players
      if (otherPlayers.length > 0) {
        const message = JSON.stringify({
          type: 'players_update',
          data: { players: otherPlayers },
        });

        if (player.socket.readyState === 1) {
          player.socket.send(message);
        }
      }
    }
  }

  private periodicSave(): void {
    // Save all online players periodically
    this.playerManager.saveAllPlayers().catch((error) => {
      console.error('[GameLoop] Periodic save failed:', error);
    });
  }

  get isRunning(): boolean {
    return this.running;
  }

  get currentTick(): number {
    return this.tickCount;
  }
}
