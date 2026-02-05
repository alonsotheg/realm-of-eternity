/**
 * Combat Service
 *
 * Handles damage calculations, combat state, and death.
 */

import prisma from '../database/index.js';
import { skillService } from '../skills/skill-service.js';

export interface CombatStats {
  attackBonus: number;
  defenseBonus: number;
  magicBonus: number;
  rangedBonus: number;
  strengthBonus: number;
  healthBonus: number;
}

export interface DamageResult {
  damage: number;
  isCritical: boolean;
  damageType: DamageType;
  blocked: number;
}

export type DamageType =
  | 'physical_slash'
  | 'physical_pierce'
  | 'physical_blunt'
  | 'magic_fire'
  | 'magic_ice'
  | 'magic_lightning'
  | 'magic_nature'
  | 'magic_shadow'
  | 'magic_holy';

export type CombatStyle = 'melee' | 'ranged' | 'magic';

export interface AttackResult {
  hit: boolean;
  damage: number;
  isCritical: boolean;
  targetDied: boolean;
  xpGained: { skillId: string; amount: number }[];
}

export class CombatService {
  /**
   * Calculate damage for an attack
   */
  calculateDamage(
    attackerLevel: number,
    attackerBonus: number,
    defenderLevel: number,
    defenderBonus: number,
    style: CombatStyle
  ): DamageResult {
    // Base damage calculation
    const attackRoll = Math.floor(
      Math.random() * (attackerLevel + attackerBonus)
    );
    const defenseRoll = Math.floor(
      Math.random() * (defenderLevel + defenderBonus)
    );

    // Hit check
    const hitChance = attackRoll / (attackRoll + defenseRoll + 1);
    const didHit = Math.random() < hitChance + 0.4; // Base 40% hit chance

    if (!didHit) {
      return {
        damage: 0,
        isCritical: false,
        damageType: this.getDamageType(style),
        blocked: defenseRoll,
      };
    }

    // Calculate damage
    let baseDamage = Math.floor(
      (attackerLevel * 0.5 + attackerBonus * 0.3) * (0.8 + Math.random() * 0.4)
    );

    // Critical hit (5% chance, 50% more damage)
    const isCritical = Math.random() < 0.05;
    if (isCritical) {
      baseDamage = Math.floor(baseDamage * 1.5);
    }

    // Apply defense reduction
    const damageReduction = defenderBonus * 0.1;
    const finalDamage = Math.max(1, Math.floor(baseDamage - damageReduction));

    return {
      damage: finalDamage,
      isCritical,
      damageType: this.getDamageType(style),
      blocked: Math.floor(damageReduction),
    };
  }

  /**
   * Process a player attacking an NPC
   */
  async playerAttackNpc(
    characterId: string,
    npcId: string,
    style: CombatStyle
  ): Promise<AttackResult> {
    // Get player skills
    const skillId = style;
    const playerSkill = await skillService.getSkill(characterId, skillId);
    const defenseSkill = await skillService.getSkill(characterId, 'defense');

    if (!playerSkill) {
      return {
        hit: false,
        damage: 0,
        isCritical: false,
        targetDied: false,
        xpGained: [],
      };
    }

    // TODO: Get NPC stats from world service
    const npcLevel = 10; // Placeholder
    const npcDefense = 5; // Placeholder
    const npcHealth = 100; // Placeholder

    const damageResult = this.calculateDamage(
      playerSkill.level,
      0, // Equipment bonus
      npcLevel,
      npcDefense,
      style
    );

    if (damageResult.damage === 0) {
      return {
        hit: false,
        damage: 0,
        isCritical: false,
        targetDied: false,
        xpGained: [],
      };
    }

    // Calculate XP gained (4 XP per damage point as base)
    const combatXp = damageResult.damage * 4;
    const hpXp = Math.floor(damageResult.damage * 1.33);

    const xpGained = [
      { skillId, amount: combatXp },
      { skillId: 'defense', amount: hpXp },
    ];

    // Apply XP
    await skillService.addXpBatch(characterId, xpGained);

    // TODO: Apply damage to NPC via world service
    const targetDied = false; // Placeholder

    return {
      hit: true,
      damage: damageResult.damage,
      isCritical: damageResult.isCritical,
      targetDied,
      xpGained,
    };
  }

  /**
   * Process damage to a player
   */
  async damagePlayer(
    characterId: string,
    damage: number,
    damageType: DamageType
  ): Promise<{ newHealth: number; died: boolean }> {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { health: true, maxHealth: true },
    });

    if (!character) {
      return { newHealth: 0, died: true };
    }

    const newHealth = Math.max(0, character.health - damage);
    const died = newHealth <= 0;

    await prisma.character.update({
      where: { id: characterId },
      data: { health: newHealth },
    });

    if (died) {
      await this.handlePlayerDeath(characterId);
    }

    return { newHealth, died };
  }

  /**
   * Handle player death
   */
  async handlePlayerDeath(characterId: string): Promise<void> {
    // Log death
    await prisma.playerAction.create({
      data: {
        characterId,
        action: 'DEATH',
        details: { timestamp: new Date().toISOString() },
      },
    });

    // Respawn at safe location with full health
    await prisma.character.update({
      where: { id: characterId },
      data: {
        health: 100, // Reset to base health
        positionX: 500, // Respawn point
        positionY: 500,
        positionZ: 0,
        zoneId: 1, // Sunhaven Valley
      },
    });

    // TODO: Handle item loss on death (configurable)
    console.log(`[Combat] Player ${characterId} died and respawned`);
  }

  /**
   * Heal player
   */
  async healPlayer(
    characterId: string,
    amount: number
  ): Promise<{ newHealth: number; healed: number }> {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { health: true, maxHealth: true },
    });

    if (!character) {
      return { newHealth: 0, healed: 0 };
    }

    const actualHeal = Math.min(amount, character.maxHealth - character.health);
    const newHealth = character.health + actualHeal;

    await prisma.character.update({
      where: { id: characterId },
      data: { health: newHealth },
    });

    return { newHealth, healed: actualHeal };
  }

  /**
   * Restore mana
   */
  async restoreMana(
    characterId: string,
    amount: number
  ): Promise<{ newMana: number; restored: number }> {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { mana: true, maxMana: true },
    });

    if (!character) {
      return { newMana: 0, restored: 0 };
    }

    const actualRestore = Math.min(amount, character.maxMana - character.mana);
    const newMana = character.mana + actualRestore;

    await prisma.character.update({
      where: { id: characterId },
      data: { mana: newMana },
    });

    return { newMana, restored: actualRestore };
  }

  /**
   * Use mana for ability
   */
  async useMana(
    characterId: string,
    amount: number
  ): Promise<{ success: boolean; newMana: number }> {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      select: { mana: true },
    });

    if (!character || character.mana < amount) {
      return { success: false, newMana: character?.mana ?? 0 };
    }

    const newMana = character.mana - amount;

    await prisma.character.update({
      where: { id: characterId },
      data: { mana: newMana },
    });

    return { success: true, newMana };
  }

  /**
   * Get damage type from combat style
   */
  private getDamageType(style: CombatStyle): DamageType {
    switch (style) {
      case 'melee':
        return 'physical_slash';
      case 'ranged':
        return 'physical_pierce';
      case 'magic':
        return 'magic_fire';
      default:
        return 'physical_slash';
    }
  }
}

export const combatService = new CombatService();
